// ============================================================
// controllers/quadrosController.js — Telas novas (quadros de cards) e nomes das telas
// ============================================================
// O admin cria telas novas pelo próprio sistema (tela "Telas"): cada uma é um
// quadro de cards igual Lojinha/CIF — colunas e campos configuráveis na
// engrenagem (formulário inicial + campos por coluna), cards com anexos,
// histórico e mover entre colunas. Tabelas por quadro: qd<id>_colunas /
// qd<id>_campos (configQuadro.js); cards em bx_quadro_cards.
// Acesso: admin sempre; os outros pela tela "quadro_<id>" em Admin > Usuários.
// Também guarda os nomes das telas renomeadas (bx_config 'telas_nomes').
// ============================================================
import { query } from '../config/db.js';
import { criarConfigQuadro, exigidoAgora, bloqueioRegra, destinosPara } from './configQuadro.js';
import { telasDoUsuario } from '../middlewares/telas.js';
import { registrarArquivoBlob, excluirArquivoBlob as excluirBlobDireto, lerEnvioBlob } from './blobController.js';
import { pedidoOrcamentoCompleto } from './pedidosOrcamentoController.js';
import { emailsFaturamentoCard } from './faturamentoOrcamento.js';
import { arquivoNotaZen } from '../integrations/zenPedidoVenda.js';

// Cópias de cards compartilham o arquivo (blob) com o card original: só apaga se ninguém mais usa
async function excluirArquivoBlob(url) {
  if (!url) return;
  const uso = await query(`SELECT (SELECT COUNT(*) FROM bx_quadro_fotos WHERE blob_url = $1)
      + (SELECT COUNT(*) FROM orc_fotos WHERE blob_url = $1) AS n`, [url]).catch(() => ({ rows: [{ n: 1 }] }));
  if (Number(uso.rows[0]?.n) > 0) return;
  return excluirBlobDireto(url);
}

let estrutura = null;
export function garantirQuadros() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS bx_quadros (
        id        SERIAL PRIMARY KEY,
        nome      VARCHAR(80) NOT NULL,
        ativo     BOOLEAN NOT NULL DEFAULT TRUE,
        ordem     INTEGER NOT NULL DEFAULT 0,
        criado_por_nome VARCHAR(120),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bx_quadro_cards (
        id         SERIAL PRIMARY KEY,
        quadro_id  INTEGER NOT NULL REFERENCES bx_quadros(id),
        titulo     VARCHAR(200) NOT NULL,
        status     VARCHAR(60) NOT NULL,
        valores    JSONB NOT NULL DEFAULT '{}'::jsonb,
        criado_por INTEGER,
        criado_por_nome VARCHAR(120),
        criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        entrou_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bx_quadro_cards_q ON bx_quadro_cards (quadro_id, status);
      CREATE TABLE IF NOT EXISTS bx_quadro_fotos (
        id           SERIAL PRIMARY KEY,
        quadro_id    INTEGER NOT NULL,
        pedido_id    INTEGER NOT NULL,
        campo_id     VARCHAR(120) NOT NULL,
        imagem       BYTEA NOT NULL,
        miniatura    BYTEA,
        mime         VARCHAR(120) NOT NULL DEFAULT 'image/jpeg',
        nome         VARCHAR(200),
        blob_url     TEXT,
        tamanho      BIGINT,
        usuario_id   INTEGER,
        usuario_nome VARCHAR(120),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bx_quadro_fotos_card ON bx_quadro_fotos (pedido_id);
      CREATE TABLE IF NOT EXISTS bx_quadro_movimentos (
        id           SERIAL PRIMARY KEY,
        quadro_id    INTEGER NOT NULL,
        pedido_id    INTEGER,
        referencia   TEXT,
        tipo         TEXT NOT NULL,
        de_status    TEXT,
        para_status  TEXT,
        descricao    TEXT,
        detalhes     JSONB,
        usuario_id   INTEGER,
        usuario_nome TEXT,
        origem       TEXT NOT NULL DEFAULT 'usuario',
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bx_quadro_mov ON bx_quadro_movimentos (quadro_id, criado_em DESC);
      CREATE TABLE IF NOT EXISTS bx_config (
        chave VARCHAR(60) PRIMARY KEY,
        valor JSONB NOT NULL,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

// ── Configuração (colunas e campos) de cada quadro ──────────
const COLUNAS_PADRAO = [{ chave: 'entrada', nome: 'Entrada', cor: '#3b82f6', so_admin: false }];
const cfgs = new Map();
function cfgDe(id) {
  const n = Number(id);
  if (!cfgs.has(n)) {
    cfgs.set(n, criarConfigQuadro({ TC: `qd${n}_colunas`, TF: `qd${n}_campos`,
      tabPedidos: `(SELECT * FROM bx_quadro_cards WHERE quadro_id = ${n}) qc`, padrao: COLUNAS_PADRAO }));
  }
  return cfgs.get(n);
}


// ── Formulário inicial do SAC ───────────────────────────────
// A tela "Tratativa de manutenção - SAC" nasceu sem campos no Novo card. Na primeira vez que ela é
// aberta (uma vez só) o Formulário inicial recebe os campos do formulário do Pipefy:
// Nº do ticket (Blip), Telefone, Cliente, Origem do Card, Responsável pelo caso, Modelo máquina e problemas.
// Depois disso o admin edita tudo em Configurar → Formulário inicial (nada é refeito).
async function baseDeRegistro(rotuloRe, nomeBaseRe) {
  try { // reaproveita a base usada pelo mesmo campo no quadro de Orçamentos
    const r = await query(`SELECT lista FROM orc_campos WHERE ativo AND tipo = 'registro' AND lista IS NOT NULL AND rotulo ~* $1 ORDER BY id LIMIT 1`, [rotuloRe]);
    if (r.rows[0]?.lista) return String(r.rows[0].lista);
  } catch { /* quadro de orçamentos ainda sem campos */ }
  try {
    const r = await query(`SELECT id FROM bx_bases WHERE ativo AND nome ~* $1 ORDER BY id LIMIT 1`, [nomeBaseRe]);
    if (r.rows[0]) return String(r.rows[0].id);
  } catch { /* sem bases */ }
  return null;
}
async function semearFormularioSac(qid) {
  try {
    const q = (await query(`SELECT id, nome FROM bx_quadros WHERE id = $1`, [qid])).rows[0];
    if (!q || !/tratativa.*manuten/i.test(q.nome)) return;
    const chave = `seed_inicio_${qid}`;
    // "Reserva" a semeadura de forma atômica: só uma requisição por vez faz (evita campos duplicados)
    const reserva = await query(`INSERT INTO bx_config (chave, valor) VALUES ($1, 'true'::jsonb) ON CONFLICT (chave) DO NOTHING RETURNING chave`, [chave]);
    if (!reserva.rows[0]) return;
    const c = cfgDe(qid);
    await c.ler(); // cria as tabelas do quadro, se ainda não existirem
    const TF = `qd${Number(qid)}_campos`;
    const ja = (await query(`SELECT COUNT(*)::int AS n FROM ${TF} WHERE ativo AND coluna = 'inicio'`)).rows[0].n;
    if (!ja) {
      const cliente = await baseDeRegistro('^cliente', 'cliente');
      const resp = await baseDeRegistro('respons', 'respons');
      const campos = [
        { tipo: 'texto', rotulo: 'Nº do ticket (Blip)' },
        { tipo: 'telefone', rotulo: 'Telefone', obrigatorio: true },
        cliente ? { tipo: 'registro', rotulo: 'Cliente', obrigatorio: true, lista: cliente } : { tipo: 'texto', rotulo: 'Cliente', obrigatorio: true },
        { tipo: 'unica', rotulo: 'Origem do Card', obrigatorio: true, opcoes: ['COMERCIAL', 'SUPORTE', 'ORÇAMENTO'], cria_opcoes: true },
        resp ? { tipo: 'registro', rotulo: 'Responsável pelo caso', lista: resp } : { tipo: 'texto', rotulo: 'Responsável pelo caso' },
        { tipo: 'conexao', rotulo: 'Modelo máquina', obrigatorio: true, lista: 'Modelos de máquina' },
        { tipo: 'longo', rotulo: 'Qual(is) o(s) problema(s) identificado(s)?' },
      ];
      for (const [i, f] of campos.entries()) {
        await query(
          `INSERT INTO ${TF} (coluna, tipo, rotulo, obrigatorio, opcoes, lista, ordem, cria_opcoes) VALUES ('inicio',$1,$2,$3,$4::jsonb,$5,$6,$7)`,
          [f.tipo, f.rotulo, !!f.obrigatorio, JSON.stringify(f.opcoes || []), f.lista || null, (i + 1) * 10, !!f.cria_opcoes]);
      }
      c.invalidar();
    }
  } catch (e) {
    console.error('⚠️ Formulário inicial do SAC:', e.message);
    await query(`DELETE FROM bx_config WHERE chave = $1`, [`seed_inicio_${qid}`]).catch(() => {}); // tenta de novo na próxima abertura
  }
}

const limpar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Grava colunas e campos num quadro (mesmo caminho do "Configurar"). Usado pelo Construtor de telas ao aprovar. */
export function aplicarConfigNoQuadro(qid, dados, usuario = null) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { if (this.statusCode >= 400) reject(Object.assign(new Error(d?.erro || 'Erro ao gravar a configuração.'), { status: this.statusCode })); else resolve(d); },
    };
    cfgDe(qid).salvarConfig({ body: dados, usuario, params: { qid: String(qid) } }, res, reject);
  });
}
/** Lê colunas e campos de um quadro (para copiar uma tela no Construtor). */
export const lerConfigDoQuadro = (qid) => cfgDe(qid).ler();

async function movimento(qid, card, tipo, { de = null, para = null, descricao = null, detalhes = null, usuario = null } = {}) {
  try {
    await query(`INSERT INTO bx_quadro_movimentos (quadro_id, pedido_id, referencia, tipo, de_status, para_status, descricao, detalhes, usuario_id, usuario_nome, origem)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
      [qid, card?.id || null, card?.titulo || null, tipo, de, para, descricao, detalhes ? JSON.stringify(detalhes) : null,
       usuario?.id || null, usuario?.nome || null, usuario ? 'usuario' : 'sistema']);
  } catch (e) { console.error('[Quadros] movimento:', e.message); }
}

// ── Acesso ──────────────────────────────────────────────────
async function nivelNoQuadro(usuario, qid) {
  if (!usuario) return 'nenhum';
  if (usuario.perfil === 'admin') return 'editar';
  const t = await telasDoUsuario(usuario.id).catch(() => null);
  const v = t?.[`quadro_${qid}`];
  return ['ver', 'editar'].includes(v) ? v : 'nenhum';
}
/** Middleware: quadro existe e o usuário tem acesso (GET com "Só ver"; o resto com "Ver e mexer"). */
export async function acessoQuadro(req, res, next) {
  try {
    await garantirQuadros();
    const qid = parseInt(req.params.qid) || 0;
    const q = (await query(`SELECT id, nome, ativo FROM bx_quadros WHERE id = $1`, [qid])).rows[0];
    if (!q || (!q.ativo && req.usuario?.perfil !== 'admin')) return res.status(404).json({ erro: 'Tela não encontrada.' });
    const nivel = await nivelNoQuadro(req.usuario, qid);
    const leitura = ['GET', 'HEAD'].includes(req.method);
    if (nivel === 'editar' || (nivel === 'ver' && leitura)) { req.quadro = q; return next(); }
    res.status(403).json({ erro: nivel === 'ver' ? 'Você só pode visualizar esta tela.' : 'Você não tem acesso a esta tela.' });
  } catch (err) { next(err); }
}

// ── Telas: lista, criar, renomear (admin) ───────────────────
// GET /telas — quadros criados + nomes das telas renomeadas (para o menu)
export async function verTelas(req, res, next) {
  try {
    await garantirCopia();
    const admin = req.usuario?.perfil === 'admin';
    const [q, n] = await Promise.all([
      query(`SELECT id, nome, ativo, ordem, COALESCE(copiar_de, '[]'::jsonb) AS copiar_de FROM bx_quadros ${admin ? '' : 'WHERE ativo'} ORDER BY ordem, id`),
      query(`SELECT valor FROM bx_config WHERE chave = 'telas_nomes'`),
    ]);
    res.json({ quadros: q.rows, nomes: n.rows[0]?.valor || {} });
  } catch (err) { next(err); }
}

// POST /telas/quadros { nome } (admin) — cria uma tela nova
export async function criarQuadro(req, res, next) {
  try {
    await garantirQuadros();
    const nome = limpar(req.body?.nome, 80);
    if (!nome) return res.status(400).json({ erro: 'Dê um nome para a tela.' });
    const ja = await query(`SELECT id FROM bx_quadros WHERE LOWER(nome) = LOWER($1) AND ativo`, [nome]);
    if (ja.rows[0]) return res.status(409).json({ erro: 'Já existe uma tela com esse nome.' });
    const r = await query(`INSERT INTO bx_quadros (nome, ordem, criado_por_nome) VALUES ($1, (SELECT COALESCE(MAX(ordem), 0) + 10 FROM bx_quadros), $2) RETURNING id, nome, ativo, ordem`,
      [nome, req.usuario?.nome || null]);
    await cfgDe(r.rows[0].id).ler(); // cria as tabelas de colunas/campos com a coluna "Entrada"
    res.status(201).json({ quadro: r.rows[0] });
  } catch (err) { next(err); }
}

// PATCH /telas/quadros/:id { nome?, ativo? } (admin)
export async function editarQuadro(req, res, next) {
  try {
    await garantirQuadros();
    const id = parseInt(req.params.id) || 0;
    const q = (await query(`SELECT * FROM bx_quadros WHERE id = $1`, [id])).rows[0];
    if (!q) return res.status(404).json({ erro: 'Tela não encontrada.' });
    const nome = req.body?.nome !== undefined ? limpar(req.body.nome, 80) : q.nome;
    if (!nome) return res.status(400).json({ erro: 'Dê um nome para a tela.' });
    const ativo = req.body?.ativo !== undefined ? !!req.body.ativo : q.ativo;
    await garantirCopia();
    // De quais telas copiar os cards que chegam em "Liberação de faturamento"
    const copiar = Array.isArray(req.body?.copiar_de)
      ? [...new Set(req.body.copiar_de.map(String).filter(k => (ORIGENS_COPIA[k] || /^quadro_\d+$/.test(k)) && k !== `quadro_${id}`))].slice(0, 20)
      : (q.copiar_de || []);
    const r = await query(`UPDATE bx_quadros SET nome = $2, ativo = $3, copiar_de = $4::jsonb WHERE id = $1 RETURNING id, nome, ativo, ordem, COALESCE(copiar_de, '[]'::jsonb) AS copiar_de`,
      [id, nome, ativo, JSON.stringify(copiar)]);
    res.json({ quadro: r.rows[0] });
  } catch (err) { next(err); }
}

// PUT /telas/nomes { nomes: { chave: nome } } (admin) — renomeia as telas do sistema (vazio = nome original)
export async function salvarNomesTelas(req, res, next) {
  try {
    await garantirQuadros();
    const ent = req.body?.nomes;
    if (!ent || typeof ent !== 'object' || Array.isArray(ent)) return res.status(400).json({ erro: 'Envie { nomes: { tela: nome } }.' });
    const nomes = {};
    for (const [k, v] of Object.entries(ent)) {
      if (!/^[a-z_]{2,40}$/.test(k)) continue;
      const n = limpar(v, 60);
      if (n) nomes[k] = n;
    }
    await query(`INSERT INTO bx_config (chave, valor) VALUES ('telas_nomes', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`, [JSON.stringify(nomes)]);
    res.json({ nomes });
  } catch (err) { next(err); }
}

// ── Configuração do quadro (engrenagem) ─────────────────────
export const verConfigQuadro = async (req, res, next) => { await semearFormularioSac(Number(req.params.qid)); return cfgDe(req.params.qid).verConfig(req, res, next); };
export const salvarConfigQuadroDin = (req, res, next) => cfgDe(req.params.qid).salvarConfig(req, res, next);
export const adicionarOpcaoQuadro = (req, res, next) => cfgDe(req.params.qid).adicionarOpcao(req, res, next);

// ── Cópia de cards de outras telas ──────────────────────────
// Em Telas, cada tela criada escolhe de quais telas recebe uma cópia dos cards
// que chegam na coluna "Liberação de faturamento" (ex.: "Notas de Serviços").
// A cópia guarda de onde veio (etiqueta no card) e um resumo do card original.
export const ORIGENS_COPIA = { orcamentos: 'Orçamentos', lojinha: 'Lojinha Boxer', logistica_cif: 'Garantia - Boxer Soldas' };
let colCopia = null;
function garantirCopia() {
  return (colCopia ||= garantirQuadros().then(() => query(`
    ALTER TABLE bx_quadros ADD COLUMN IF NOT EXISTS copiar_de JSONB;
    ALTER TABLE bx_quadro_cards ADD COLUMN IF NOT EXISTS origem_tela VARCHAR(40);
    ALTER TABLE bx_quadro_cards ADD COLUMN IF NOT EXISTS origem_id INTEGER;
    ALTER TABLE bx_quadro_cards ADD COLUMN IF NOT EXISTS origem_nome VARCHAR(80);
    ALTER TABLE bx_quadro_cards ADD COLUMN IF NOT EXISTS origem_dados JSONB;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_bx_quadro_cards_origem ON bx_quadro_cards (quadro_id, origem_tela, origem_id) WHERE origem_tela IS NOT NULL;`))
    .catch(e => { colCopia = null; throw e; }));
}
const normTxt = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const ehLiberacao = (nome) => /libera\w*\s+(de\s+|para\s+)?fatura/.test(normTxt(nome));

async function nomeTela(tela) {
  const m = /^quadro_(\d+)$/.exec(tela);
  if (m) return (await query(`SELECT nome FROM bx_quadros WHERE id = $1`, [Number(m[1])])).rows[0]?.nome || 'Tela';
  const nomes = (await query(`SELECT valor FROM bx_config WHERE chave = 'telas_nomes'`)).rows[0]?.valor || {};
  return nomes[tela] || ORIGENS_COPIA[tela] || tela;
}

// Resumo do card original (vai na cópia)
async function resumoOrigem(tela, id) {
  const v = (rotulo, valor) => (valor == null || String(valor).trim() === '' ? null : { rotulo, valor: String(valor).trim() });
  if (tela === 'orcamentos') {
    const p = (await query(`SELECT * FROM pedidos_orcamento WHERE id = $1`, [id])).rows[0];
    if (!p) return null;
    return { titulo: p.cliente_nome || p.referencia || `Orçamento #${p.id}`, link: '/pedidos-orcamento', dados: [
      v('Card', `#${p.id}${p.pipefy_card_id ? ` · Pipefy #${p.pipefy_card_id}` : ''}`), v('Cliente', p.cliente_nome), v('CPF/CNPJ', p.cliente_cnpj),
      v('NS', p.ns_entrada), v('Pedido de venda', p.zen_venda_numero), v('Nota fiscal', p.zen_nf_numero), v('Aprovação', p.aprovacao)].filter(Boolean) };
  }
  if (tela === 'lojinha' || tela === 'logistica_cif') {
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1`, [id])).rows[0];
    if (!p) return null;
    return { titulo: `Pedido ${p.numero_pedido}${p.cliente_nome ? ` — ${p.cliente_nome}` : ''}`, link: tela === 'lojinha' ? '/lojinha' : '/logistica-cif', dados: [
      v('Pedido', p.numero_pedido), v('Cliente', p.cliente_nome), v('CPF/CNPJ', p.documento), v('Vendedora', p.vendedora),
      v('Envio', [p.tipo_envio, p.transportadora].filter(Boolean).join(' · ')), v('Pedido de venda', p.zen_venda_numero), v('Nota fiscal', p.zen_nf_numero)].filter(Boolean) };
  }
  const m = /^quadro_(\d+)$/.exec(tela);
  if (m) {
    const c = (await query(`SELECT * FROM bx_quadro_cards WHERE id = $1 AND quadro_id = $2`, [id, Number(m[1])])).rows[0];
    if (!c) return null;
    return { titulo: c.titulo, link: `/quadro/${m[1]}`, dados: [v('Card', `#${c.id}`)].filter(Boolean) };
  }
  return null;
}

/** Card chegou em "Liberação de faturamento" na tela `tela`: copia para as telas que pediram. Nunca lança erro. */
export async function copiarParaTelas(tela, id, usuario = null) {
  try {
    await garantirCopia();
    const qs = (await query(`SELECT id, nome FROM bx_quadros WHERE ativo AND copiar_de @> jsonb_build_array($1::text)`, [tela])).rows
      .filter(q => tela !== `quadro_${q.id}`);
    if (!qs.length) return;
    for (const q of qs) await copiarCardParaQuadro(q.id, tela, id, usuario);
  } catch (e) { console.error('[Quadros] copiar card:', e.message); }
}

/** Copia um card de `tela` para o quadro `qid` (sem duplicar). Devolve o card novo, ou null se já existia. */
export async function copiarCardParaQuadro(qid, tela, id, usuario = null) {
  await garantirCopia();
  const r = await resumoOrigem(tela, id);
  if (!r) return null;
  const nome = await nomeTela(tela);
  const cfg = await cfgDe(qid).ler();
  const col = cfg.colunas.find(x => !x.arquivada) || cfg.colunas[0];
  const ins = await query(
    `INSERT INTO bx_quadro_cards (quadro_id, titulo, status, valores, criado_por, criado_por_nome, origem_tela, origem_id, origem_nome, origem_dados)
     VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, $6, $7, $8, $9::jsonb) ON CONFLICT DO NOTHING RETURNING *`,
    [Number(qid), String(r.titulo || `Card #${id}`).slice(0, 200), col?.chave || 'entrada', usuario?.id || null, usuario?.nome || 'Sistema',
     tela, id, nome.slice(0, 80), JSON.stringify({ dados: r.dados, link: r.link })]);
  if (ins.rows[0]) {
    await movimento(Number(qid), ins.rows[0], 'criado', { para: ins.rows[0].status, usuario,
      descricao: `Cópia do card de ${nome} (chegou em Liberação de faturamento)`, detalhes: { origem: tela, origem_id: id } });
    await fotografarCard(Number(qid), ins.rows[0].id).catch(e => console.error('[Quadros] cópia completa:', e.message));
  }
  return ins.rows[0] || null;
}

/**
 * Cópia fixa: grava no card desta tela tudo do card original naquele momento — campos de todas as fases,
 * peças, Zen (pedido/ordem/NF), e-mails de Notas de serviço/Retorno de conserto, fotos (copiadas para esta
 * tela) e o histórico (copiado para o histórico desta tela). Depois disso o card não depende mais do original.
 */
export async function fotografarCard(qid, cardId, { refazer = false } = {}) {
  const c = (await query(`SELECT * FROM bx_quadro_cards WHERE id = $1 AND quadro_id = $2`, [cardId, qid])).rows[0];
  if (!c || c.origem_tela !== 'orcamentos') return null;
  if (c.origem_dados?.snapshot && !refazer) return c;
  const pedido = await pedidoOrcamentoCompleto(c.origem_id);
  if (!pedido) return null;
  const emails = await emailsFaturamentoCard(c.origem_id).catch(() => null);
  const movs = (await query(`SELECT tipo, de_status, para_status, descricao, detalhes, usuario_id, usuario_nome, origem, criado_em
      FROM pedidos_orcamento_movimentos WHERE pedido_id = $1 ORDER BY criado_em, id`, [c.origem_id])).rows;
  // Fotos: copia para esta tela (o arquivo é o mesmo; só não apaga enquanto alguém usa)
  const jaTem = Number((await query(`SELECT COUNT(*) AS n FROM bx_quadro_fotos WHERE pedido_id = $1 AND quadro_id = $2`, [cardId, qid])).rows[0].n);
  if (!jaTem) {
    await query(`INSERT INTO bx_quadro_fotos (quadro_id, pedido_id, campo_id, imagem, miniatura, mime, nome, blob_url, tamanho, usuario_id, usuario_nome, created_at)
      SELECT $1, $2, campo_id, imagem, miniatura, mime, nome, blob_url, tamanho, usuario_id, usuario_nome, created_at FROM orc_fotos WHERE pedido_id = $3 ORDER BY id`,
      [qid, cardId, c.origem_id]);
  }
  // Histórico: as linhas do Orçamento entram no histórico desta tela (sem mexer nas fases daqui)
  const jaHist = Number((await query(`SELECT COUNT(*) AS n FROM bx_quadro_movimentos WHERE quadro_id = $1 AND pedido_id = $2 AND tipo LIKE 'orcamento:%'`, [qid, cardId])).rows[0].n);
  if (!jaHist) {
    for (const m of movs) {
      await query(`INSERT INTO bx_quadro_movimentos (quadro_id, pedido_id, referencia, tipo, descricao, detalhes, usuario_id, usuario_nome, origem, criado_em)
                   VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
        [qid, cardId, c.titulo, `orcamento:${m.tipo}`, `[Orçamento] ${m.descricao || m.tipo}`,
         JSON.stringify({ ...(m.detalhes || {}), de_orcamento: m.de_status, para_orcamento: m.para_status }),
         m.usuario_id, m.usuario_nome, m.origem || 'usuario', m.criado_em]);
    }
  }
  const snapshot = {
    pedido: { ...pedido, fotos_locais: undefined },
    movimentos: movs.map(m => ({ de_status: m.de_status, para_status: m.para_status, criado_em: m.criado_em })),
    emails, copiado_em: new Date().toISOString(),
  };
  const r = await query(`UPDATE bx_quadro_cards SET origem_dados = COALESCE(origem_dados, '{}'::jsonb) || jsonb_build_object('snapshot', $2::jsonb), atualizado_em = NOW()
                          WHERE id = $1 RETURNING *`, [cardId, JSON.stringify(snapshot)]);
  return r.rows[0];
}

// GET /quadros/:qid/cards/:id/nf/:tipo — XML/PDF da nota do card copiado (nota guardada na cópia)
export async function arquivoNotaCardQuadro(req, res) {
  try {
    const tipo = req.params.tipo === 'xml' ? 'xml' : req.params.tipo === 'pdf' ? 'pdf' : null;
    if (!tipo) return res.status(400).json({ erro: 'Tipo inválido (xml ou pdf).' });
    const c = await cardDoQuadro(req.quadro.id, req.params.id);
    if (!c) return res.status(404).json({ erro: 'Card não encontrado.' });
    const nf = c.origem_dados?.snapshot?.pedido?.zen_nota_id;
    if (!nf) return res.status(409).json({ erro: 'Este card não tem nota fiscal no Zen.' });
    const a = await arquivoNotaZen(nf, tipo);
    res.setHeader('Content-Type', a.contentType);
    res.setHeader('Content-Disposition', `${tipo === 'pdf' ? 'inline' : 'attachment'}; filename="${a.nome}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(a.buffer);
  } catch (e) { res.status(e.status || 502).json({ erro: e.message }); }
}

// ── Cards ───────────────────────────────────────────────────
const SELECT_CARD = `SELECT c.*, (SELECT COALESCE(json_agg(json_build_object('id', f.id, 'campo', f.campo_id, 'mime', f.mime, 'nome', f.nome,
    'blob_url', f.blob_url, 'tamanho', f.tamanho) ORDER BY f.id), '[]'::json) FROM bx_quadro_fotos f WHERE f.pedido_id = c.id) AS fotos_locais
  FROM bx_quadro_cards c`;

// GET /quadros/:qid/cards
export async function listarCards(req, res, next) {
  try {
    const qid = req.quadro.id;
    await semearFormularioSac(qid);
    const cfg = await cfgDe(qid).ler();
    const arquivadas = cfg.colunas.filter(c => c.arquivada).map(c => c.chave);
    const r = await query(
      `SELECT * FROM ((${SELECT_CARD} WHERE c.quadro_id = $1 AND NOT (c.status = ANY($2::text[])))
        UNION ALL (${SELECT_CARD} WHERE c.quadro_id = $1 AND c.status = ANY($2::text[]) ORDER BY c.entrou_em DESC LIMIT 100)) t
        ORDER BY t.entrou_em DESC, t.id DESC`, [qid, arquivadas]);
    res.json({ quadro: req.quadro, cards: r.rows });
  } catch (err) { next(err); }
}

function limparValores(campos, prefixo = /^bx_\d{1,10}$/) {
  const out = {};
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return out;
  for (const [k, v] of Object.entries(campos)) {
    if (!prefixo.test(k)) continue;
    const valor = v == null ? '' : String(v).slice(0, 5000);
    out[k] = valor;
  }
  return out;
}

// POST /quadros/:qid/cards { titulo, campos: { bx_<id>: valor } } — card novo (formulário inicial)
export async function criarCard(req, res, next) {
  try {
    const qid = req.quadro.id;
    const c = cfgDe(qid);
    const cfg = await c.ler();
    const valores = Object.fromEntries(Object.entries(limparValores(req.body?.campos)).filter(([, v]) => v !== ''));
    const faltando = cfg.campos.filter(f => f.coluna === 'inicio' && f.tipo !== 'anexo' && exigidoAgora(f, cfg.campos, valores, c.idCampoConfig)
      && !String(valores[c.idCampoConfig(f)] ?? '').replace(/[\[\]"]/g, '').trim());
    if (faltando.length) return res.status(400).json({ erro: `Preencha: ${faltando.map(f => f.rotulo).join(', ')}.` });
    // Título: o informado ou o primeiro campo de texto preenchido do formulário
    let titulo = limpar(req.body?.titulo, 200);
    if (!titulo) {
      const primeiro = cfg.campos.filter(f => f.coluna === 'inicio' && ['texto', 'documento', 'email', 'telefone', 'numero'].includes(f.tipo))
        .map(f => limpar(valores[c.idCampoConfig(f)], 200)).find(Boolean);
      titulo = primeiro || '';
    }
    const coluna = cfg.colunas.find(x => !x.arquivada) || cfg.colunas[0];
    const copiados = preencherCopias(cfg, c, ['inicio', coluna?.chave || 'entrada'], valores);
    if (copiados) Object.assign(valores, copiados);
    const r = await query(
      `INSERT INTO bx_quadro_cards (quadro_id, titulo, status, valores, criado_por, criado_por_nome)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING *`,
      [qid, titulo || 'Card novo', coluna?.chave || 'entrada', JSON.stringify(valores), req.usuario?.id || null, req.usuario?.nome || null]);
    let card = r.rows[0];
    if (!titulo) card = (await query(`UPDATE bx_quadro_cards SET titulo = $2 WHERE id = $1 RETURNING *`, [card.id, `Card #${card.id}`])).rows[0];
    await movimento(qid, card, 'criado', { para: card.status, usuario: req.usuario, descricao: `Card criado em ${coluna?.nome || card.status}` });
    res.status(201).json({ card: { ...card, fotos_locais: [] } });
  } catch (err) { next(err); }
}

// "Já vem preenchido com": campos destas colunas ainda vazios recebem o valor do campo de origem (a pessoa pode trocar depois)
const temValorCfg = (v) => !!String(v ?? '').replace(/[\[\]"]/g, '').trim();
function preencherCopias(cfg, c, colunas, valores) {
  const novo = { ...valores };
  let mudou = false;
  for (const f of cfg.campos) {
    if (!colunas.includes(f.coluna) || !f.copiar_de?.campo) continue;
    const k = c.idCampoConfig(f);
    if (temValorCfg(novo[k])) continue;
    const o = cfg.campos.find(x => String(x.id) === String(f.copiar_de.campo));
    const v = o ? novo[c.idCampoConfig(o)] : undefined;
    if (temValorCfg(v)) { novo[k] = v; mudou = true; }
  }
  return mudou ? novo : null;
}

async function cardDoQuadro(qid, id) {
  return (await query(`SELECT * FROM bx_quadro_cards WHERE id = $1 AND quadro_id = $2`, [parseInt(id) || 0, qid])).rows[0];
}

// POST /quadros/:qid/cards/:id/mover { status }
export async function moverCard(req, res, next) {
  try {
    const qid = req.quadro.id;
    const c = cfgDe(qid);
    const cfg = await c.ler();
    const col = new Map(cfg.colunas.map(x => [x.chave, x]));
    const status = String(req.body?.status || '');
    if (!col.has(status)) return res.status(400).json({ erro: 'Coluna inválida.' });
    const p = await cardDoQuadro(qid, req.params.id);
    if (!p) return res.status(404).json({ erro: 'Card não encontrado.' });
    const atual = p.status;
    if (status === atual) return res.json({ card: p });
    if (req.usuario?.perfil !== 'admin' && (col.get(status)?.so_admin || col.get(atual)?.so_admin)) {
      return res.status(403).json({ erro: 'Mover cards nessa coluna é só do administrador.' });
    }
    const destinos = destinosPara(col.get(atual), req.usuario);
    if (Array.isArray(destinos) && !destinos.includes(status)) {
      return res.status(400).json({ erro: `De "${col.get(atual)?.nome || atual}" não dá para mover para "${col.get(status)?.nome || status}". Ajuste em Configurar.` });
    }
    const valores = p.valores || {};
    // Regras da coluna (Configurar → "Regras para mover")
    const motivo = bloqueioRegra(col.get(atual), status, cfg.campos, valores, c.idCampoConfig);
    if (motivo) return res.status(400).json({ erro: `Não dá para mover para "${col.get(status)?.nome || status}": ${motivo} (regra da coluna "${col.get(atual)?.nome || atual}").` });
  // Admin voltando o card para uma coluna anterior: não exige os campos obrigatórios da coluna atual
    const ordemCol = (k) => cfg.colunas.findIndex(x => x.chave === k);
    const voltandoAdmin = req.usuario?.perfil === 'admin' && ordemCol(status) >= 0 && ordemCol(status) < ordemCol(atual);
    const faltando = voltandoAdmin ? [] : cfg.campos.filter(f => f.coluna === atual && f.tipo !== 'anexo' && exigidoAgora(f, cfg.campos, valores, c.idCampoConfig)
      && !String(valores[c.idCampoConfig(f)] ?? '').replace(/[\[\]"]/g, '').trim());
    if (faltando.length) return res.status(400).json({ erro: `Preencha antes de sair de "${col.get(atual)?.nome || atual}": ${faltando.map(f => f.rotulo).join(', ')}.` });
    const copiados = preencherCopias(cfg, c, [status], valores);
    const r = await query(`UPDATE bx_quadro_cards SET status = $2, valores = COALESCE($3::jsonb, valores), entrou_em = NOW(), atualizado_em = NOW() WHERE id = $1 RETURNING *`,
      [p.id, status, copiados ? JSON.stringify(copiados) : null]);
    await movimento(qid, r.rows[0], 'movido', { de: atual, para: status, usuario: req.usuario,
      descricao: `Movido de ${col.get(atual)?.nome || atual} para ${col.get(status)?.nome || status}` });
    if (ehLiberacao(col.get(status)?.nome)) await copiarParaTelas(`quadro_${qid}`, p.id, req.usuario);
    res.json({ card: r.rows[0] });
  } catch (err) { next(err); }
}

// POST /quadros/:qid/cards/:id/campos { campos: { bx_<id>: valor }, titulo? }
export async function editarCamposCard(req, res, next) {
  try {
    const qid = req.quadro.id;
    const p = await cardDoQuadro(qid, req.params.id);
    if (!p) return res.status(404).json({ erro: 'Card não encontrado.' });
    const cfg = await cfgDe(qid).ler();
    const rot = new Map(cfg.campos.map(f => [cfgDe(qid).idCampoConfig(f), f.rotulo]));
    const novo = { ...(p.valores || {}) };
    const alterados = [];
    for (const [k, v] of Object.entries(limparValores(req.body?.campos))) {
      if (v === '') delete novo[k]; else novo[k] = v;
      alterados.push(rot.get(k) || k);
    }
    const titulo = req.body?.titulo !== undefined ? (limpar(req.body.titulo, 200) || p.titulo) : p.titulo;
    if (titulo !== p.titulo) alterados.push('Título');
    const r = await query(`UPDATE bx_quadro_cards SET valores = $2::jsonb, titulo = $3, atualizado_em = NOW() WHERE id = $1 RETURNING *`,
      [p.id, JSON.stringify(novo), titulo]);
    if (alterados.length) await movimento(qid, r.rows[0], 'campos_editados', { usuario: req.usuario, descricao: `Campos preenchidos: ${alterados.join(', ')}`, detalhes: req.body?.campos || null });
    res.json({ card: r.rows[0] });
  } catch (err) { next(err); }
}

// DELETE /quadros/:qid/cards/:id (admin)
export async function excluirCard(req, res, next) {
  try {
    if (req.usuario?.perfil !== 'admin') return res.status(403).json({ erro: 'Só o administrador exclui cards.' });
    const qid = req.quadro.id;
    const p = await cardDoQuadro(qid, req.params.id);
    if (!p) return res.status(404).json({ erro: 'Card não encontrado.' });
    const blobs = (await query(`SELECT blob_url FROM bx_quadro_fotos WHERE pedido_id = $1 AND blob_url IS NOT NULL`, [p.id])).rows;
    await query(`DELETE FROM bx_quadro_fotos WHERE pedido_id = $1`, [p.id]);
    for (const b of blobs) await excluirArquivoBlob(b.blob_url).catch(() => {});
    await query(`DELETE FROM bx_quadro_cards WHERE id = $1`, [p.id]);
    await movimento(qid, p, 'excluido', { de: p.status, usuario: req.usuario, descricao: 'Card excluído' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// GET /quadros/:qid/movimentos?de&ate&pedido
export async function listarMovimentosQuadro(req, res, next) {
  try {
    const qid = req.quadro.id;
    const filtros = ['m.quadro_id = $1'], valores = [qid];
    if (req.query.de)     { valores.push(req.query.de);  filtros.push(`m.criado_em >= ($${valores.length}::date AT TIME ZONE 'America/Sao_Paulo')`); }
    if (req.query.ate)    { valores.push(req.query.ate); filtros.push(`m.criado_em <  (($${valores.length}::date + 1) AT TIME ZONE 'America/Sao_Paulo')`); }
    if (req.query.pedido) { valores.push(parseInt(req.query.pedido) || 0); filtros.push(`m.pedido_id = $${valores.length}`); }
    const r = await query(
      `SELECT m.id, m.pedido_id, m.tipo, m.de_status, m.para_status, m.descricao, m.detalhes, m.usuario_id, m.usuario_nome, m.origem, m.criado_em,
              COALESCE(c.titulo, m.referencia) AS cliente_nome, COALESCE(c.titulo, m.referencia) AS referencia, c.status AS status_atual
         FROM bx_quadro_movimentos m LEFT JOIN bx_quadro_cards c ON c.id = m.pedido_id
        WHERE ${filtros.join(' AND ')} ORDER BY m.criado_em DESC, m.id DESC LIMIT 5000`, valores);
    res.json({ movimentos: r.rows });
  } catch (err) { next(err); }
}

// ── Anexos (fotos, arquivos e vídeos) ──────────────────────
const MIMES_ANEXO = /^(image\/(?:jpeg|png|webp|gif)|application\/pdf|application\/msword|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.[\w.]+|text\/(?:plain|csv))$/;
const MAX_ARQUIVO = 2.5 * 1024 * 1024;
function dataUrlParaBuffer(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s);
  if (!m || !MIMES_ANEXO.test(m[1])) return null;
  const buf = Buffer.from(m[2], 'base64');
  return buf.length ? { mime: m[1], buf } : null;
}
const nomeAnexo = (n) => String(n || '').replace(/[\r\n"\\/]/g, ' ').trim().slice(0, 200) || null;

// POST /quadros/:qid/cards/:id/fotos { campo_id, imagem, miniatura, nome } ou { campo_id, blob }
export async function enviarFotoQuadro(req, res, next) {
  try {
    const qid = req.quadro.id;
    const p = await cardDoQuadro(qid, req.params.id);
    if (!p) return res.status(404).json({ erro: 'Card não encontrado.' });
    const campo = String(req.body?.campo_id || '').trim().slice(0, 120);
    if (!campo) return res.status(400).json({ erro: 'Campo da foto não informado.' });
    if (req.body?.blob) {
      const b = lerEnvioBlob(req.body.blob);
      if (!b) return res.status(400).json({ erro: 'Envio do arquivo inválido.' });
      const r = await query(
        `INSERT INTO bx_quadro_fotos (quadro_id, pedido_id, campo_id, imagem, mime, usuario_id, usuario_nome, nome, blob_url, tamanho)
         VALUES ($1,$2,$3,'\\x'::bytea,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [qid, p.id, campo, b.mime, req.usuario?.id || null, req.usuario?.nome || null, b.nome, b.url, b.tamanho]);
      await registrarArquivoBlob({ ...b, quadro: 'qd', pedido_id: p.id, campo_id: campo, foto_id: r.rows[0].id, usuario: req.usuario });
      await movimento(qid, p, 'foto_adicionada', { usuario: req.usuario, descricao: b.mime.startsWith('video/') ? 'Vídeo adicionado' : 'Arquivo adicionado', detalhes: { foto_id: r.rows[0].id, campo } });
      return res.status(201).json({ id: r.rows[0].id });
    }
    const img = dataUrlParaBuffer(req.body?.imagem);
    const mini = dataUrlParaBuffer(req.body?.miniatura);
    if (!img) return res.status(400).json({ erro: 'Arquivo inválido. Envie foto, PDF, Word, Excel ou texto.' });
    const limite = img.mime.startsWith('image/') ? 1200 * 1024 : MAX_ARQUIVO;
    if (img.buf.length > limite) return res.status(413).json({ erro: img.mime.startsWith('image/') ? 'Foto muito grande.' : 'Arquivo muito grande (máximo 2,5 MB).' });
    const r = await query(
      `INSERT INTO bx_quadro_fotos (quadro_id, pedido_id, campo_id, imagem, miniatura, mime, usuario_id, usuario_nome, nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [qid, p.id, campo, img.buf, mini?.buf || null, img.mime, req.usuario?.id || null, req.usuario?.nome || null, nomeAnexo(req.body?.nome)]);
    await movimento(qid, p, 'foto_adicionada', { usuario: req.usuario, descricao: 'Foto adicionada', detalhes: { foto_id: r.rows[0].id, campo } });
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) { next(err); }
}

// GET /quadros/:qid/fotos/:fotoId
export async function verFotoQuadro(req, res, next) {
  try {
    const f = (await query(`SELECT imagem, miniatura, mime, nome FROM bx_quadro_fotos WHERE id = $1 AND quadro_id = $2`,
      [parseInt(req.params.fotoId) || 0, req.quadro.id])).rows[0];
    if (!f) return res.status(404).json({ erro: 'Foto não encontrada.' });
    res.set('Content-Type', f.mime || 'image/jpeg');
    if (f.nome) res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.nome)}`);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(req.query.tam === 'mini' && f.miniatura ? f.miniatura : f.imagem);
  } catch (err) { next(err); }
}

// DELETE /quadros/:qid/fotos/:fotoId
export async function excluirFotoQuadro(req, res, next) {
  try {
    const qid = req.quadro.id;
    const f = (await query(`SELECT id, pedido_id, campo_id, usuario_id, blob_url FROM bx_quadro_fotos WHERE id = $1 AND quadro_id = $2`,
      [parseInt(req.params.fotoId) || 0, qid])).rows[0];
    if (!f) return res.status(404).json({ erro: 'Foto não encontrada.' });
    if (req.usuario?.perfil !== 'admin' && f.usuario_id !== req.usuario?.id) return res.status(403).json({ erro: 'Só o administrador ou quem enviou pode excluir.' });
    await query(`DELETE FROM bx_quadro_fotos WHERE id = $1`, [f.id]);
    if (f.blob_url) await excluirArquivoBlob(f.blob_url);
    const p = await cardDoQuadro(qid, f.pedido_id);
    await movimento(qid, p || { id: f.pedido_id }, 'foto_excluida', { usuario: req.usuario, descricao: 'Foto excluída', detalhes: { foto_id: f.id, campo: f.campo_id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

