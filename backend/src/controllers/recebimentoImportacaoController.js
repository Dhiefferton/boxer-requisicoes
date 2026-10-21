// ============================================================
// controllers/recebimentoImportacaoController.js — Recebimento/Importação
// ============================================================
// Notas fiscais de entrada de IMPORTAÇÃO (perfil fiscal da pessoa
// "Exterior", id 1164 no Zen — mesmo critério do WMS) a partir de
// 12/10/2026, só com os itens que são peça (perfil PEC / PEC/S).
// Na chegada, cada peça é fotografada e comparada com a foto do catálogo:
//   • Conferido  → a peça bate com o catálogo
//   • Divergente → peça diferente do catálogo (com observação)
// Foto do catálogo: tabela catalogo_fotos (trazida do PMD pelo SKU ou
// gravada a partir de uma foto do recebimento).
// PDM (pdm-boxer): o catálogo de peças (bom_itens.part_number) e de
//   produtos (produtos.codigo) tem leitura pública no Supabase do PDM;
//   a foto (imagem_url) é um link público. Só leitura, pelo SKU.
//   Variáveis: PDM_SUPABASE_URL e PDM_SUPABASE_KEY (chave pública).
// Alternativa genérica: PMD_FOTO_URL com {sku} no lugar do código.
// ============================================================
import { query } from '../config/db.js';
import { getToken } from '../integrations/erpZen.js';

const ZEN_BASE_URL = 'https://api.zenerp.app.br';
const ZEN_TENANT = 'boxer';
const PERFIL_PESSOA_EXTERIOR = 1164;
const DATA_CORTE = '2026-10-12';
const PERFIS_PECA = ['PEC', 'PEC/S'];
const SITUACOES = ['conferido', 'divergente'];
const STATUS_FISCAL = {
  PREPARING: 'Em digitação', PREPARED: 'Preparada', APPROVED: 'Aprovada',
  FINISHED: 'Finalizada', CANCELED: 'Cancelada',
};

async function zenGet(caminho) {
  const token = await getToken();
  const r = await fetch(`${ZEN_BASE_URL}${caminho}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, tenant: ZEN_TENANT },
    signal: AbortSignal.timeout(25000),
  });
  const texto = await r.text();
  let dados = null; try { dados = texto ? JSON.parse(texto) : null; } catch { /* não-JSON */ }
  if (!r.ok) throw new Error(`ZenERP GET ${caminho.split('?')[0]} → ${r.status}: ${dados?.message || texto.slice(0, 200)}`);
  return dados;
}
const q = (expr) => encodeURIComponent(expr);

// ── Estrutura ─────────────────────────────────────────────────
let estrutura = null;
function garantirEstrutura() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS rec_imp_notas (
        nf_erp_id     BIGINT PRIMARY KEY,
        numero        VARCHAR(40),
        fornecedor    VARCHAR(255),
        data_nota     DATE,
        valor_total   NUMERIC(14,2),
        status_fiscal VARCHAR(30),
        total_itens   INTEGER,
        itens         JSONB NOT NULL DEFAULT '[]'::jsonb,
        verificado_em TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS rec_imp_itens (
        item_erp_id   BIGINT PRIMARY KEY,
        nf_erp_id     BIGINT NOT NULL,
        sku           VARCHAR(60),
        situacao      VARCHAR(20),
        observacao    TEXT,
        usuario_id    INTEGER,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rec_imp_itens_nf ON rec_imp_itens (nf_erp_id);
      CREATE TABLE IF NOT EXISTS rec_imp_fotos (
        id          SERIAL PRIMARY KEY,
        nf_erp_id   BIGINT NOT NULL,
        item_erp_id BIGINT NOT NULL,
        sku         VARCHAR(60),
        imagem      BYTEA NOT NULL,
        miniatura   BYTEA,
        mime        VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
        usuario_id  INTEGER,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rec_imp_fotos_item ON rec_imp_fotos (item_erp_id);
      CREATE INDEX IF NOT EXISTS idx_rec_imp_fotos_nf ON rec_imp_fotos (nf_erp_id);
      CREATE TABLE IF NOT EXISTS catalogo_fotos (
        codigo        VARCHAR(60) PRIMARY KEY,
        imagem        BYTEA,
        miniatura     BYTEA,
        mime          VARCHAR(40),
        origem        VARCHAR(20),
        tentado_em    TIMESTAMPTZ,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

// ── Itens de peça de uma nota (Zen) ───────────────────────────
function itemDaNota(i) {
  const p = i.productPacking?.product || {};
  return {
    item_erp_id: i.id,
    sku: String(p.code || '').trim(),
    descricao: p.description || '',
    perfil: p.productProfile?.code || '',
    quantidade: Number(i.quantity) || 0,
    unidade: i.unit?.code || p.unit?.code || 'un',
  };
}

async function itensPecaDaNota(nfId) {
  const lista = await zenGet(`/fiscal/incomingInvoiceItem?q=${q(`invoice.id==${nfId}`)}&max=500`);
  const todos = (Array.isArray(lista) ? lista : []).map(itemDaNota);
  return { total: todos.length, pecas: todos.filter(i => PERFIS_PECA.includes(i.perfil.toUpperCase())) };
}

async function gravarNota(nota, itens, total) {
  await query(
    `INSERT INTO rec_imp_notas (nf_erp_id, numero, fornecedor, data_nota, valor_total, status_fiscal, total_itens, itens, verificado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())
     ON CONFLICT (nf_erp_id) DO UPDATE SET numero = EXCLUDED.numero, fornecedor = EXCLUDED.fornecedor,
       data_nota = EXCLUDED.data_nota, valor_total = EXCLUDED.valor_total, status_fiscal = EXCLUDED.status_fiscal,
       total_itens = EXCLUDED.total_itens, itens = EXCLUDED.itens, verificado_em = NOW()`,
    [nota.id, String(nota.number ?? ''), nota.person?.name || nota.person?.description || null,
     nota.date ? String(nota.date).slice(0, 10) : null, nota.totalValue ?? null,
     nota.status || null, total, JSON.stringify(itens)]);
}

// Resumo de fotos/situações por nota
async function resumoPorNota(ids) {
  if (!ids.length) return new Map();
  const r = await query(
    `SELECT n.nf_erp_id,
            (SELECT COUNT(DISTINCT f.item_erp_id) FROM rec_imp_fotos f WHERE f.nf_erp_id = n.nf_erp_id) AS fotografados,
            (SELECT COUNT(*) FROM rec_imp_itens i WHERE i.nf_erp_id = n.nf_erp_id AND i.situacao = 'conferido') AS conferidos,
            (SELECT COUNT(*) FROM rec_imp_itens i WHERE i.nf_erp_id = n.nf_erp_id AND i.situacao = 'divergente') AS divergentes
       FROM rec_imp_notas n WHERE n.nf_erp_id = ANY($1::bigint[])`, [ids]);
  return new Map(r.rows.map(x => [String(x.nf_erp_id), x]));
}

// GET /recebimento-importacao/notas
// Lista as NFs de importação; as que ainda não foram verificadas têm os
// itens consultados no Zen (aos poucos, dentro do tempo limite) para saber
// se têm peça. A tela chama de novo enquanto houver "verificando".
export async function listarNotas(req, res, next) {
  try {
    await garantirEstrutura();
    const lista = await zenGet(`/fiscal/incomingInvoice?q=${q(`fiscalProfilePerson.id==${PERFIL_PESSOA_EXTERIOR}`)}&order=-date&max=60`);
    const notas = (Array.isArray(lista) ? lista : [])
      .filter(n => !n.date || String(n.date).slice(0, 10) >= DATA_CORTE)
      .filter(n => n.status !== 'CANCELED');
    const ids = notas.map(n => n.id);
    const cache = new Map((ids.length
      ? (await query(`SELECT nf_erp_id, total_itens, itens, status_fiscal, verificado_em FROM rec_imp_notas WHERE nf_erp_id = ANY($1::bigint[])`, [ids])).rows
      : []).map(r => [String(r.nf_erp_id), r]));

    // Verifica (no Zen) as notas novas ou que mudaram de status, 4 por vez, até ~20s
    const inicio = Date.now();
    const pendentes = notas.filter(n => {
      const c = cache.get(String(n.id));
      return !c || c.status_fiscal !== n.status;
    });
    for (let i = 0; i < pendentes.length && Date.now() - inicio < 20000; i += 4) {
      await Promise.all(pendentes.slice(i, i + 4).map(async (n) => {
        try {
          const { total, pecas } = await itensPecaDaNota(n.id);
          await gravarNota(n, pecas, total);
          cache.set(String(n.id), { total_itens: total, itens: pecas, status_fiscal: n.status, verificado_em: new Date() });
        } catch (e) { console.error('[RecImp] itens da NF', n.id, e.message); }
      }));
    }

    const resumo = await resumoPorNota(ids);
    let verificando = 0;
    const saida = [];
    for (const n of notas) {
      const c = cache.get(String(n.id));
      if (!c) { verificando++; continue; }
      const itens = Array.isArray(c.itens) ? c.itens : [];
      if (!itens.length) continue; // nota sem peça
      const r = resumo.get(String(n.id)) || {};
      const fotografados = Number(r.fotografados) || 0;
      const conferidos = Number(r.conferidos) || 0;
      const divergentes = Number(r.divergentes) || 0;
      const concluida = conferidos + divergentes >= itens.length;
      saida.push({
        id: n.id,
        numero: n.number,
        data: n.date ? String(n.date).slice(0, 10) : null,
        fornecedor: n.person?.name || n.person?.description || null,
        status_fiscal: STATUS_FISCAL[n.status] || n.status || null,
        itens_peca: itens.length,
        quantidade_pecas: itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0),
        fotografados, conferidos, divergentes,
        situacao: concluida ? 'concluida' : (fotografados || conferidos || divergentes) ? 'em_andamento' : 'pendente',
      });
    }
    // Ativas primeiro, concluídas no fim (mantém a ordem por data)
    saida.sort((a, b) => (a.situacao === 'concluida') - (b.situacao === 'concluida'));
    res.json({ notas: saida, verificando });
  } catch (err) { next(err); }
}

// GET /recebimento-importacao/notas/:id — itens de peça da nota (sempre atualizados do Zen)
export async function detalharNota(req, res, next) {
  try {
    await garantirEstrutura();
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ erro: 'Nota inválida.' });
    const nota = await zenGet(`/fiscal/incomingInvoice/${id}`);
    if (nota?.fiscalProfilePerson?.id && Number(nota.fiscalProfilePerson.id) !== PERFIL_PESSOA_EXTERIOR) {
      return res.status(400).json({ erro: 'Esta nota não é de importação.' });
    }
    const { total, pecas } = await itensPecaDaNota(id);
    await gravarNota(nota, pecas, total);

    const itemIds = pecas.map(i => i.item_erp_id);
    const skus = [...new Set(pecas.map(i => i.sku).filter(Boolean))];
    const [sit, fotos, cat, fotoCat] = await Promise.all([
      itemIds.length ? query(`SELECT item_erp_id, situacao, observacao, atualizado_em, u.nome AS usuario
                                FROM rec_imp_itens i LEFT JOIN usuarios u ON u.id = i.usuario_id
                               WHERE item_erp_id = ANY($1::bigint[])`, [itemIds]) : { rows: [] },
      itemIds.length ? query(`SELECT id, item_erp_id, created_at FROM rec_imp_fotos WHERE item_erp_id = ANY($1::bigint[]) ORDER BY id`, [itemIds]) : { rows: [] },
      skus.length ? query(`SELECT UPPER(TRIM(codigo)) AS codigo FROM materiais WHERE UPPER(TRIM(codigo)) = ANY($1::text[]) AND ativo = TRUE`, [skus.map(s => s.toUpperCase())]) : { rows: [] },
      skus.length ? query(`SELECT UPPER(codigo) AS codigo, (imagem IS NOT NULL) AS tem, tentado_em FROM catalogo_fotos WHERE UPPER(codigo) = ANY($1::text[])`, [skus.map(s => s.toUpperCase())]) : { rows: [] },
    ]);
    const sitPor = new Map(sit.rows.map(r => [String(r.item_erp_id), r]));
    const fotosPor = new Map();
    for (const f of fotos.rows) {
      const k = String(f.item_erp_id);
      if (!fotosPor.has(k)) fotosPor.set(k, []);
      fotosPor.get(k).push(f.id);
    }
    const noCatalogo = new Set(cat.rows.map(r => r.codigo));
    const fotoCatPor = new Map(fotoCat.rows.map(r => [r.codigo, r]));
    const pmd = fotosConfiguradas();

    const itens = pecas.map(i => {
      const s = sitPor.get(String(i.item_erp_id)) || {};
      const fc = fotoCatPor.get(i.sku.toUpperCase());
      return {
        ...i,
        no_catalogo: noCatalogo.has(i.sku.toUpperCase()),
        // true = tem foto · false = não tem (já procurou) · null = ainda não procurou no PMD
        foto_catalogo: fc?.tem ? true : (fc?.tentado_em || !pmd) ? false : null,
        fotos: fotosPor.get(String(i.item_erp_id)) || [],
        situacao: s.situacao || null,
        observacao: s.observacao || '',
        conferido_por: s.usuario || null,
        conferido_em: s.atualizado_em || null,
      };
    });
    res.json({
      nota: {
        id: nota.id, numero: nota.number, data: nota.date ? String(nota.date).slice(0, 10) : null,
        fornecedor: nota.person?.name || nota.person?.description || null,
        status_fiscal: STATUS_FISCAL[nota.status] || nota.status || null,
        valor_total: nota.totalValue ?? null, total_itens: total,
      },
      itens,
      pmd_configurado: pmd,
    });
  } catch (err) { next(err); }
}

// ── Imagens ───────────────────────────────────────────────────
function decodificarDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  return buf.length ? { mime: m[1], buf } : null;
}

function enviarImagem(res, mime, buf) {
  res.set('Content-Type', mime || 'image/jpeg');
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(buf);
}

// GET /recebimento-importacao/fotos/:id?tam=mini
export async function verFoto(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT imagem, miniatura, mime FROM rec_imp_fotos WHERE id = $1`, [Number(req.params.id) || 0]);
    const f = r.rows[0];
    if (!f) return res.status(404).json({ erro: 'Foto não encontrada.' });
    enviarImagem(res, f.mime, req.query.tam === 'mini' && f.miniatura ? f.miniatura : f.imagem);
  } catch (err) { next(err); }
}

const PDM_URL = (process.env.PDM_SUPABASE_URL || 'https://tufbuyfwysowgkxsvjmh.supabase.co').replace(/\/$/, '');
const fotosConfiguradas = () => Boolean(process.env.PDM_SUPABASE_KEY || process.env.PMD_FOTO_URL);

async function baixarImagem(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const tipo = String(r.headers.get('content-type') || '');
  if (!tipo.startsWith('image/')) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length ? { mime: tipo.split(';')[0], buf } : null;
}

// Link da foto no PDM: primeiro nas peças (BOM), depois nos produtos
async function linkFotoPDM(sku) {
  const chave = process.env.PDM_SUPABASE_KEY;
  if (!chave) return null;
  const headers = { apikey: chave, Authorization: `Bearer ${chave}`, Accept: 'application/json' };
  const consultas = [
    `/rest/v1/bom_itens?select=imagem_url&part_number=eq.${encodeURIComponent(sku)}&imagem_url=not.is.null&limit=1`,
    `/rest/v1/produtos?select=imagem_url&codigo=eq.${encodeURIComponent(sku)}&imagem_url=not.is.null&limit=1`,
  ];
  for (const c of consultas) {
    const r = await fetch(`${PDM_URL}${c}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!r.ok) continue;
    const l = await r.json().catch(() => []);
    const url = Array.isArray(l) && l[0]?.imagem_url;
    if (url && /^https?:\/\//.test(url)) return url;
  }
  return null;
}

// Busca a foto no PDM (se configurado) e guarda em catalogo_fotos
async function buscarFotoPMD(sku) {
  const linkPdm = await linkFotoPDM(sku);
  if (linkPdm) return baixarImagem(linkPdm);
  const modelo = process.env.PMD_FOTO_URL;
  if (!modelo) return null;
  const headers = {};
  if (process.env.PMD_API_CHAVE) headers[process.env.PMD_API_HEADER || 'Authorization'] = process.env.PMD_API_CHAVE;
  let url = modelo.replace(/\{sku\}/g, encodeURIComponent(sku));
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const tipo = String(r.headers.get('content-type') || '');
    if (tipo.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length ? { mime: tipo.split(';')[0], buf } : null;
    }
    // Resposta JSON com o link da imagem
    let dados = null; try { dados = await r.json(); } catch { return null; }
    const achar = (o) => {
      if (!o) return null;
      if (typeof o === 'string') return /^https?:\/\//.test(o) ? o : null;
      if (Array.isArray(o)) { for (const x of o) { const v = achar(x); if (v) return v; } return null; }
      if (typeof o === 'object') {
        for (const k of ['url', 'imagem', 'foto', 'image', 'link', 'src']) if (typeof o[k] === 'string' && /^https?:\/\//.test(o[k])) return o[k];
        for (const v of Object.values(o)) { const a = achar(v); if (a) return a; }
      }
      return null;
    };
    url = achar(dados);
    if (!url) return null;
  }
  return null;
}

// GET /recebimento-importacao/catalogo/:sku/foto?tam=mini
export async function fotoCatalogo(req, res, next) {
  try {
    await garantirEstrutura();
    const sku = String(req.params.sku || '').trim();
    if (!sku) return res.status(400).json({ erro: 'SKU inválido.' });
    const r = await query(`SELECT imagem, miniatura, mime, tentado_em FROM catalogo_fotos WHERE UPPER(codigo) = UPPER($1)`, [sku]);
    const f = r.rows[0];
    if (f?.imagem) return enviarImagem(res, f.mime, req.query.tam === 'mini' && f.miniatura ? f.miniatura : f.imagem);
    // Sem foto: tenta o PMD (no máximo 1x por dia por SKU)
    const tentouHoje = f?.tentado_em && Date.now() - new Date(f.tentado_em).getTime() < 24 * 3600 * 1000;
    if (fotosConfiguradas() && !tentouHoje) {
      let img = null;
      try { img = await buscarFotoPMD(sku); } catch (e) { console.error('[RecImp] PMD', sku, e.message); }
      await query(
        `INSERT INTO catalogo_fotos (codigo, imagem, mime, origem, tentado_em, atualizado_em)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (codigo) DO UPDATE SET imagem = COALESCE(EXCLUDED.imagem, catalogo_fotos.imagem),
           mime = COALESCE(EXCLUDED.mime, catalogo_fotos.mime), origem = COALESCE(EXCLUDED.origem, catalogo_fotos.origem),
           tentado_em = NOW(), atualizado_em = NOW()`,
        [sku, img?.buf || null, img?.mime || null, img ? 'pmd' : null]);
      if (img) return enviarImagem(res, img.mime, img.buf);
    }
    res.status(404).json({ erro: 'Sem foto no catálogo.' });
  } catch (err) { next(err); }
}

// POST /recebimento-importacao/itens/:itemId/fotos
// { nf_erp_id, sku, imagem: dataURL, miniatura: dataURL, usar_no_catalogo }
export async function enviarFoto(req, res, next) {
  try {
    await garantirEstrutura();
    const itemId = Number(req.params.itemId);
    const nfId = Number(req.body?.nf_erp_id);
    const sku = String(req.body?.sku || '').trim();
    const img = decodificarDataUrl(req.body?.imagem);
    const mini = decodificarDataUrl(req.body?.miniatura);
    if (!itemId || !nfId) return res.status(400).json({ erro: 'Item ou nota inválidos.' });
    if (!img) return res.status(400).json({ erro: 'Foto inválida.' });
    if (img.buf.length > 900 * 1024) return res.status(413).json({ erro: 'Foto muito grande.' });
    const r = await query(
      `INSERT INTO rec_imp_fotos (nf_erp_id, item_erp_id, sku, imagem, miniatura, mime, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [nfId, itemId, sku || null, img.buf, mini?.buf || null, img.mime, req.usuario.id]);
    if (req.body?.usar_no_catalogo && sku) {
      await query(
        `INSERT INTO catalogo_fotos (codigo, imagem, miniatura, mime, origem, atualizado_em)
         VALUES ($1,$2,$3,$4,'recebimento',NOW())
         ON CONFLICT (codigo) DO UPDATE SET imagem = EXCLUDED.imagem, miniatura = EXCLUDED.miniatura,
           mime = EXCLUDED.mime, origem = 'recebimento', atualizado_em = NOW()`,
        [sku, img.buf, mini?.buf || null, img.mime]);
    }
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) { next(err); }
}

// DELETE /recebimento-importacao/fotos/:id
export async function excluirFoto(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`DELETE FROM rec_imp_fotos WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0]);
    if (!r.rowCount) return res.status(404).json({ erro: 'Foto não encontrada.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// PATCH /recebimento-importacao/itens/:itemId  { nf_erp_id, sku, situacao, observacao }
export async function marcarItem(req, res, next) {
  try {
    await garantirEstrutura();
    const itemId = Number(req.params.itemId);
    const nfId = Number(req.body?.nf_erp_id);
    const situacao = req.body?.situacao ?? null;
    if (!itemId || !nfId) return res.status(400).json({ erro: 'Item ou nota inválidos.' });
    if (situacao !== null && !SITUACOES.includes(situacao)) return res.status(400).json({ erro: 'Situação inválida.' });
    if (situacao === 'divergente' && !String(req.body?.observacao || '').trim()) {
      return res.status(400).json({ erro: 'Descreva a divergência na observação.' });
    }
    await query(
      `INSERT INTO rec_imp_itens (item_erp_id, nf_erp_id, sku, situacao, observacao, usuario_id, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (item_erp_id) DO UPDATE SET situacao = EXCLUDED.situacao, observacao = EXCLUDED.observacao,
         usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
      [itemId, nfId, String(req.body?.sku || '').trim() || null, situacao,
       String(req.body?.observacao || '').trim() || null, req.usuario.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
}
