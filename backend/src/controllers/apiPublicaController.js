// ============================================================
// controllers/apiPublicaController.js — API pública (somente leitura) do Boxer Operações
// ============================================================
// Outros sistemas consultam o Boxer com uma CHAVE de API criada pelo admin (Integrações).
//   • Authorization: Bearer bx_live_…   (a chave só aparece uma vez; no banco fica o hash)
//   • Cada chave enxerga só as telas que o admin liberou (qualquer tela, inclusive quadros).
//   • Só GET. Nunca devolve senhas, tokens, hashes nem imagens (colunas bytea) nas listas.
//   • Anexos (fotos, PDFs, vídeos dos cards): GET /:tela/anexos lista e
//     GET /:tela/anexos/:id/arquivo baixa o arquivo (25/11/2026).
//   • Limite de consultas por minuto por chave e registro de todos os acessos.
// ============================================================
import crypto from 'crypto';
import { query } from '../config/db.js';
import { TELAS } from '../middlewares/telas.js';

// ── Estrutura ─────────────────────────────────────────────────
let estrutura = null;
export function garantirEstruturaApi() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS api_chaves (
        id          SERIAL PRIMARY KEY,
        nome        VARCHAR(120) NOT NULL,
        prefixo     VARCHAR(20) NOT NULL,
        hash        CHAR(64) NOT NULL UNIQUE,
        telas       TEXT[] NOT NULL DEFAULT '{}',
        ativo       BOOLEAN NOT NULL DEFAULT TRUE,
        limite_min  INTEGER NOT NULL DEFAULT 60,
        expira_em   TIMESTAMPTZ,
        criado_por  INTEGER,
        criado_por_nome VARCHAR(120),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ultimo_uso  TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS api_acessos (
        id        BIGSERIAL PRIMARY KEY,
        chave_id  INTEGER,
        caminho   TEXT,
        status    INTEGER,
        ip        VARCHAR(60),
        ms        INTEGER,
        em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_api_acessos_chave ON api_acessos (chave_id, em DESC);
    `).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── Fontes de dados de cada tela ──────────────────────────────
const GARANTIA = `((origem = 'pipefy_garantia' OR cif_status IS NOT NULL) AND COALESCE(cif_status, '') <> '_excluido')`;
// Valor de um campo configurado pelo nome (sem acento/maiúscula), lido dos valores do card.
// Orçamentos: campos_editados (id → valor) e pipefy_campos ([{ id, nome, valor }]); Garantia: cif_valores.
const RE = (re) => `'${re}'`;
const chavesCampo = (tab, prefixo, re) => `(SELECT COALESCE(NULLIF(pipefy_campo, ''), '${prefixo}' || id) FROM ${tab} WHERE ativo AND rotulo ~* ${RE(re)})`;
// Registro (descrição e valor) guardado como JSON: devolve só a descrição
const legivelSql = (v) => `(SELECT COALESCE(substring(vv from '"descricao"\\s*:\\s*"([^"]*)"'), vv) FROM (SELECT ${v} AS vv) z)`;
const campoOrc = (re) => legivelSql(`COALESCE(
    (SELECT NULLIF(p.campos_editados->>k, '') FROM ${chavesCampo('orc_campos', 'bx_', re)} AS kk(k) WHERE p.campos_editados ? k LIMIT 1),
    (SELECT NULLIF(x->>'valor', '') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.pipefy_campos) = 'array' THEN p.pipefy_campos ELSE '[]'::jsonb END) x
      WHERE (x->>'nome' ~* ${RE(re)} OR x->>'id' IN ${chavesCampo('orc_campos', 'bx_', re)}) AND COALESCE(x->>'valor', '') NOT IN ('', '[]') LIMIT 1))`);
const campoCif = (re) => legivelSql(`(SELECT NULLIF(p.cif_valores->>k, '') FROM ${chavesCampo('cif_campos', 'cif_bx_', re)} AS kk(k) WHERE p.cif_valores ? k LIMIT 1)`);
const RE_CAUSA = '^\\s*causa\\s+identificada';
const RE_MANUT = '^\\s*manuten[cç][aã]o';

// recurso -> { tabela, onde? (filtro fixo da tela), ordem?, extras? (colunas calculadas: nome → SQL sobre o alias p) }
const FONTES = {
  catalogo:               { materiais: { tabela: 'materiais' }, categorias: { tabela: 'categorias' } },
  historico:              { requisicoes: { tabela: 'requisicoes' }, itens: { tabela: 'itens_requisicao' } },
  operador:               { requisicoes: { tabela: 'requisicoes' }, itens: { tabela: 'itens_requisicao' }, historico_status: { tabela: 'historico_status' } },
  inventario:             { inventarios: { tabela: 'inventarios' }, itens: { tabela: 'inventario_itens' }, contagens: { tabela: 'inventario_contagens' }, marketplace_saidas: { tabela: 'mkt_saidas' } },
  entradas:               { entradas: { tabela: 'entradas_estoque' } },
  estoque:                { materiais: { tabela: 'materiais' }, estoques: { tabela: 'estoques' }, categorias: { tabela: 'categorias' } },
  mrp:                    { movimentacoes: { tabela: 'mrp_movimentacoes' } },
  compras:                { processos: { tabela: 'processos_compra' }, itens: { tabela: 'itens_processo_compra' }, cotacoes: { tabela: 'cotacoes' }, fornecedores: { tabela: 'fornecedores' } },
  necessidade_pecas:      { necessidades: { tabela: 'necessidades_pecas' } },
  recebimento_importacao: { notas: { tabela: 'rec_imp_notas' }, itens: { tabela: 'rec_imp_itens' }, pecas_fora_da_nota: { tabela: 'rec_imp_extras' } },
  relatorios:             { cards: { tabela: 'rel_cards' }, pipes: { tabela: 'rel_pipes' }, relatorios: { tabela: 'rel_relatorios' } },
  // campos = nome de cada campo (id → rotulo) para ler os valores do card; colunas = fases do quadro
  lojinha:                { pedidos: { tabela: 'lojinha_boxer_pedidos', onde: `COALESCE(origem, '') NOT IN ('pipefy_garantia', 'tratativa_sac')` }, movimentos: { tabela: 'loj_movimentos' },
                            campos: { tabela: 'loj_campos' }, colunas: { tabela: 'loj_colunas' } },
  orcamentos:             { pedidos: { tabela: 'pedidos_orcamento', extras: { causa_identificada: campoOrc(RE_CAUSA), manutencao: campoOrc(RE_MANUT) } }, movimentos: { tabela: 'pedidos_orcamento_movimentos' },
                            campos: { tabela: 'orc_campos' }, colunas: { tabela: 'orc_colunas' } },
  // Garantia: pedidos (fase em cif_status, valores dos campos em cif_valores, tratativa do SAC em tratativa),
  // movimentos (histórico de fases e campos preenchidos), campos (cif_bx_<id> → nome) e colunas (fases)
  logistica_cif:          { pedidos: { tabela: 'lojinha_boxer_pedidos', onde: GARANTIA, extras: { causa_identificada: campoCif(RE_CAUSA), manutencao: campoCif(RE_MANUT) } },
                            movimentos: { tabela: 'loj_movimentos', onde: `pedido_id IN (SELECT id FROM lojinha_boxer_pedidos WHERE ${GARANTIA})` },
                            campos: { tabela: 'cif_campos' }, colunas: { tabela: 'cif_colunas' } },
  databases:              { bases: { tabela: 'bx_bases' }, registros: { tabela: 'bx_base_registros' } },
};
// Telas que nunca saem pela API (usuários, senhas, configurações internas)
const BLOQUEADAS = new Set(['admin', 'telas', 'armazenamento']);

const quadroDe = (tela) => {
  const m = /^quadro_(\d{1,9})$/.exec(tela);
  return m ? Number(m[1]) : null;
};
function fontesDaTela(tela) {
  if (FONTES[tela]) return FONTES[tela];
  const q = quadroDe(tela);
  if (q) return {
    cards: { tabela: 'bx_quadro_cards', onde: `quadro_id = ${q}` },
    movimentos: { tabela: 'bx_quadro_movimentos', onde: `quadro_id = ${q}` },
    campos: { tabela: `qd${q}_campos` }, colunas: { tabela: `qd${q}_colunas` },
  };
  return null;
}

/** Telas que podem receber liberação (inclui os quadros criados pelo admin) */
export async function telasLiberaveis() {
  // Usa o nome que o admin deu à tela (ex.: logistica_cif aparece como "Garantia - Boxer Soldas")
  let nomes = {};
  try { nomes = (await query(`SELECT valor FROM bx_config WHERE chave = 'telas_nomes'`)).rows[0]?.valor || {}; } catch { /* sem nomes */ }
  const base = TELAS.filter(t => !BLOQUEADAS.has(t.chave) && FONTES[t.chave]).map(t => ({ chave: t.chave, nome: nomes[t.chave] || t.nome }));
  let quadros = [];
  try { quadros = (await query(`SELECT id, nome FROM bx_quadros WHERE ativo ORDER BY ordem, id`)).rows; } catch { /* sem quadros */ }
  return [...base, ...quadros.map(q => ({ chave: `quadro_${q.id}`, nome: `Quadro: ${q.nome}` }))];
}

// ── Colunas seguras de cada tabela ────────────────────────────
const SENSIVEL = /(senha|hash|token|secret|password|api_?key|chave_acesso|imagem|miniatura|arquivo_bin)/i;
const cacheColunas = new Map();
async function colunasDe(tabela) {
  if (cacheColunas.has(tabela)) return cacheColunas.get(tabela);
  const r = await query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [tabela]);
  const cols = r.rows.filter(c => c.data_type !== 'bytea' && !SENSIVEL.test(c.column_name))
    .map(c => ({ nome: c.column_name, tipo: c.data_type }));
  cacheColunas.set(tabela, cols);
  return cols;
}
const COLUNAS_DATA = ['criado_em', 'created_at', 'data', 'data_nota', 'em'];
// Colunas do recurso (as da tabela + as calculadas) e o FROM (com as calculadas, quando houver)
async function colunasRecurso(f) {
  const cols = await colunasDe(f.tabela);
  return f.extras ? [...cols, ...Object.keys(f.extras).filter(n => !cols.some(c => c.nome === n)).map(n => ({ nome: n, tipo: 'text' }))] : cols;
}
const fromDe = (f) => (f.extras
  ? `(SELECT p.*, ${Object.entries(f.extras).map(([n, sql]) => `${sql} AS "${n}"`).join(', ')} FROM ${f.tabela} p) AS t`
  : f.tabela);

// ── Anexos dos cards (fotos, comprovantes, PDFs, vídeos) ──────
// tabela de arquivos + filtro da tela + tabela de campos (pra dar nome ao campo do anexo)
const ANEXOS = {
  orcamentos:    { tabela: 'orc_fotos', campos: 'orc_campos' },
  lojinha:       { tabela: 'loj_fotos', campos: 'loj_campos',
                   onde: `pedido_id IN (SELECT id FROM lojinha_boxer_pedidos WHERE COALESCE(origem, '') NOT IN ('pipefy_garantia', 'tratativa_sac'))` },
  logistica_cif: { tabela: 'loj_fotos', campos: 'cif_campos', onde: `pedido_id IN (SELECT id FROM lojinha_boxer_pedidos WHERE ${GARANTIA})` },
};
function anexosDaTela(tela) {
  if (ANEXOS[tela]) return ANEXOS[tela];
  const q = quadroDe(tela);
  return q ? { tabela: 'bx_quadro_fotos', campos: `qd${q}_campos`, onde: `quadro_id = ${q}` } : null;
}

// Nome legível de cada campo: aceita as várias formas de id usadas nos cards
// (id puro, bx_<id>, cif_bx_<id>, id do Pipefy).
async function nomesDosCampos(tabela) {
  try {
    const r = await query(`SELECT to_jsonb(c) AS c FROM ${tabela} c`);
    const mapa = new Map();
    for (const { c } of r.rows) {
      const nome = c.rotulo || c.nome || c.titulo;
      if (!nome) continue;
      for (const k of [c.id, `bx_${c.id}`, `cif_bx_${c.id}`, c.pipefy_campo, c.chave]) if (k != null && k !== '') mapa.set(String(k), nome);
    }
    return mapa;
  } catch { return new Map(); }
}

const urlArquivo = (req, tela, id) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}/api/v1/${tela}/anexos/${id}/arquivo`;
};

// GET /api/v1/:tela/anexos — pedido_id · campo_id · desde/ate · limite · pagina
async function listarAnexos(req, res, tela) {
  const a = anexosDaTela(tela);
  if (!a) return res.status(404).json({ erro: 'Esta tela não tem anexos.' });
  const params = [];
  const push = (v) => { params.push(v); return `$${params.length}`; };
  const where = a.onde ? [a.onde] : [];
  if (req.query.pedido_id) {
    if (!/^\d{1,10}$/.test(String(req.query.pedido_id))) return res.status(400).json({ erro: 'pedido_id inválido.' });
    where.push(`pedido_id = ${push(Number(req.query.pedido_id))}`);
  }
  if (req.query.campo_id) where.push(`campo_id = ${push(String(req.query.campo_id))}`);
  for (const [qn, op] of [['desde', '>='], ['ate', '<=']]) {
    if (!req.query[qn]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.query[qn]))) return res.status(400).json({ erro: `${qn} deve ser AAAA-MM-DD.` });
    where.push(`created_at::date ${op} ${push(req.query[qn])}::date`);
  }
  const limite = Math.min(500, Math.max(1, parseInt(req.query.limite) || 100));
  const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await query(`SELECT COUNT(*)::int AS n FROM ${a.tabela} ${w}`, params)).rows[0].n;
  const r = await query(
    `SELECT id, pedido_id, campo_id, to_jsonb(f) ->> 'nome' AS nome, mime,
            COALESCE((to_jsonb(f) ->> 'tamanho')::bigint, octet_length(imagem)) AS tamanho,
            usuario_nome, created_at
       FROM ${a.tabela} f ${w} ORDER BY id DESC LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, params);
  const nomes = await nomesDosCampos(a.campos);
  const dados = r.rows.map(x => ({
    id: x.id, pedido_id: x.pedido_id, campo_id: x.campo_id, campo_nome: nomes.get(String(x.campo_id)) || null,
    nome: x.nome || `anexo-${x.id}`, mime: x.mime, tamanho: x.tamanho == null ? null : Number(x.tamanho),
    enviado_por: x.usuario_nome || null, criado_em: x.created_at, url: urlArquivo(req, tela, x.id),
  }));
  res.json({ tela, recurso: 'anexos', total, pagina, limite, paginas: Math.max(1, Math.ceil(total / limite)), dados });
}

// GET /api/v1/:tela/anexos/:id — dados de um anexo
async function umAnexo(req, res, tela, id) {
  const a = anexosDaTela(tela);
  if (!a) return res.status(404).json({ erro: 'Esta tela não tem anexos.' });
  const r = await query(
    `SELECT id, pedido_id, campo_id, to_jsonb(f) ->> 'nome' AS nome, mime,
            COALESCE((to_jsonb(f) ->> 'tamanho')::bigint, octet_length(imagem)) AS tamanho, usuario_nome, created_at
       FROM ${a.tabela} f WHERE id = $1 ${a.onde ? `AND ${a.onde}` : ''}`, [parseInt(id) || 0]);
  const x = r.rows[0];
  if (!x) return res.status(404).json({ erro: 'Anexo não encontrado.' });
  const nomes = await nomesDosCampos(a.campos);
  res.json({ id: x.id, pedido_id: x.pedido_id, campo_id: x.campo_id, campo_nome: nomes.get(String(x.campo_id)) || null,
    nome: x.nome || `anexo-${x.id}`, mime: x.mime, tamanho: x.tamanho == null ? null : Number(x.tamanho),
    enviado_por: x.usuario_nome || null, criado_em: x.created_at, url: urlArquivo(req, tela, x.id) });
}

// GET /api/v1/:tela/anexos/:id/arquivo — o arquivo em si
// (grande no armazenamento externo: redireciona 302 pro link do arquivo)
export async function baixarAnexo(req, res, next) {
  try {
    const tela = telaOuErro(req, res); if (!tela) return;
    const a = anexosDaTela(tela);
    if (!a) return res.status(404).json({ erro: 'Esta tela não tem anexos.' });
    const r = await query(
      `SELECT imagem, mime, to_jsonb(f) ->> 'nome' AS nome, to_jsonb(f) ->> 'blob_url' AS blob_url
         FROM ${a.tabela} f WHERE id = $1 ${a.onde ? `AND ${a.onde}` : ''}`, [parseInt(req.params.id) || 0]);
    const f = r.rows[0];
    if (!f) return res.status(404).json({ erro: 'Anexo não encontrado.' });
    if (f.blob_url) return res.redirect(302, f.blob_url);
    res.set('Content-Type', f.mime || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.nome || `anexo-${req.params.id}`)}`);
    res.send(f.imagem);
  } catch (err) { next(err); }
}

// ── Autenticação por chave ────────────────────────────────────
export async function autenticarChave(req, res, next) {
  const t0 = Date.now();
  try {
    await garantirEstruturaApi();
    const auth = String(req.headers.authorization || '');
    const chave = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!chave.startsWith('bx_')) return res.status(401).json({ erro: 'Envie a chave no cabeçalho Authorization: Bearer <chave>.' });
    const r = await query(`SELECT id, nome, telas, ativo, limite_min, expira_em FROM api_chaves WHERE hash = $1`, [sha256(chave)]);
    const k = r.rows[0];
    const registrar = (status) => query(
      `INSERT INTO api_acessos (chave_id, caminho, status, ip, ms) VALUES ($1,$2,$3,$4,$5)`,
      [k?.id || null, String(req.originalUrl).split('?')[0].slice(0, 300), status, String(req.ip || '').slice(0, 60), Date.now() - t0]).catch(() => {});
    if (!k) return res.status(401).json({ erro: 'Chave inválida.' });
    if (!k.ativo) { await registrar(403); return res.status(403).json({ erro: 'Esta chave está pausada.' }); }
    if (k.expira_em && new Date(k.expira_em) < new Date()) { await registrar(403); return res.status(403).json({ erro: 'Esta chave expirou.' }); }
    const usados = (await query(`SELECT COUNT(*)::int AS n FROM api_acessos WHERE chave_id = $1 AND em > NOW() - interval '1 minute'`, [k.id])).rows[0].n;
    if (usados >= k.limite_min) {
      await registrar(429);
      res.set('Retry-After', '60');
      return res.status(429).json({ erro: `Limite de ${k.limite_min} consultas por minuto atingido. Tente de novo em instantes.` });
    }
    req.chaveApi = k;
    res.on('finish', () => {
      registrar(res.statusCode);
      query(`UPDATE api_chaves SET ultimo_uso = NOW() WHERE id = $1`, [k.id]).catch(() => {});
    });
    next();
  } catch (err) { next(err); }
}

const podeVer = (k, tela) => Array.isArray(k.telas) && k.telas.includes(tela);

// GET /api/v1 — telas liberadas para a chave
export async function minhasTelas(req, res, next) {
  try {
    const todas = await telasLiberaveis();
    const nomes = new Map(todas.map(t => [t.chave, t.nome]));
    res.json({
      chave: req.chaveApi.nome,
      telas: req.chaveApi.telas.filter(t => nomes.has(t)).map(t => ({
        tela: t, nome: nomes.get(t), recursos: [...Object.keys(fontesDaTela(t) || {}), ...(anexosDaTela(t) ? ['anexos'] : [])],
        exemplo: `/api/v1/${t}/${Object.keys(fontesDaTela(t) || {})[0]}`,
      })),
    });
  } catch (err) { next(err); }
}

function telaOuErro(req, res) {
  const tela = String(req.params.tela || '');
  if (BLOQUEADAS.has(tela) || !fontesDaTela(tela)) { res.status(404).json({ erro: 'Tela não encontrada.' }); return null; }
  if (!podeVer(req.chaveApi, tela)) { res.status(403).json({ erro: `Esta chave não pode ver "${tela}".` }); return null; }
  return tela;
}

// GET /api/v1/:tela — recursos da tela
export async function recursosDaTela(req, res, next) {
  try {
    const tela = telaOuErro(req, res); if (!tela) return;
    const fontes = fontesDaTela(tela);
    const recursos = [];
    for (const [nome, f] of Object.entries(fontes)) {
      recursos.push({ recurso: nome, colunas: (await colunasRecurso(f)).map(c => c.nome), url: `/api/v1/${tela}/${nome}` });
    }
    if (anexosDaTela(tela)) recursos.push({
      recurso: 'anexos', colunas: ['id', 'pedido_id', 'campo_id', 'campo_nome', 'nome', 'mime', 'tamanho', 'enviado_por', 'criado_em', 'url'],
      url: `/api/v1/${tela}/anexos`, arquivo: `/api/v1/${tela}/anexos/{id}/arquivo`,
    });
    res.json({ tela, recursos });
  } catch (err) { next(err); }
}

// GET /api/v1/:tela/:recurso — lista com filtros
//   limite (1-500, padrão 100) · pagina · ordem=coluna:asc|desc · campos=a,b,c
//   desde / ate (AAAA-MM-DD, na coluna de data do recurso) · coluna=valor · coluna__contem=texto
//   coluna__ge / coluna__le (maior/menor ou igual)
export async function listarRecurso(req, res, next) {
  try {
    const tela = telaOuErro(req, res); if (!tela) return;
    if (req.params.recurso === 'anexos') return await listarAnexos(req, res, tela);
    const f = fontesDaTela(tela)[req.params.recurso];
    if (!f) return res.status(404).json({ erro: 'Recurso não encontrado nesta tela.' });
    const cols = await colunasRecurso(f);
    const porNome = new Map(cols.map(c => [c.nome, c]));
    const params = [];
    const where = f.onde ? [f.onde] : [];
    const push = (v) => { params.push(v); return `$${params.length}`; };

    for (const [chaveQ, v] of Object.entries(req.query)) {
      if (['limite', 'pagina', 'ordem', 'campos', 'desde', 'ate'].includes(chaveQ)) continue;
      const [nome, op = 'eq'] = chaveQ.split('__');
      const c = porNome.get(nome);
      if (!c) return res.status(400).json({ erro: `Coluna desconhecida: ${nome}.`, colunas: cols.map(x => x.nome) });
      const val = String(v);
      if (op === 'eq') where.push(`"${nome}"::text = ${push(val)}`);
      else if (op === 'contem') where.push(`"${nome}"::text ILIKE ${push('%' + val.replace(/[\\%_]/g, '\\$&') + '%')}`);
      else if (op === 'ge' || op === 'le') {
        if (!/^[\w\-.: +T]+$/.test(val)) return res.status(400).json({ erro: `Valor inválido em ${chaveQ}.` });
        where.push(`"${nome}"::text ${op === 'ge' ? '>=' : '<='} ${push(val)}`);
      } else return res.status(400).json({ erro: `Operador desconhecido: ${op}.` });
    }
    const colData = COLUNAS_DATA.find(c => porNome.has(c));
    for (const [qn, op] of [['desde', '>='], ['ate', '<=']]) {
      if (!req.query[qn]) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.query[qn]))) return res.status(400).json({ erro: `${qn} deve ser AAAA-MM-DD.` });
      if (!colData) return res.status(400).json({ erro: 'Este recurso não tem coluna de data.' });
      where.push(`"${colData}"::date ${op} ${push(req.query[qn])}::date`);
    }
    let selecionadas = cols;
    if (req.query.campos) {
      selecionadas = String(req.query.campos).split(',').map(s => s.trim()).filter(Boolean).map(n => porNome.get(n));
      if (selecionadas.some(c => !c) || !selecionadas.length) return res.status(400).json({ erro: 'Campo desconhecido em "campos".', colunas: cols.map(x => x.nome) });
    }
    let ordem = cols.some(c => c.nome === 'id') ? `"id" DESC` : '1';
    if (req.query.ordem) {
      const [on, dir = 'desc'] = String(req.query.ordem).split(':');
      if (!porNome.has(on) || !['asc', 'desc'].includes(dir)) return res.status(400).json({ erro: 'ordem inválida. Use coluna:asc ou coluna:desc.' });
      ordem = `"${on}" ${dir.toUpperCase()}`;
    }
    const limite = Math.min(500, Math.max(1, parseInt(req.query.limite) || 100));
    const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*)::int AS n FROM ${fromDe(f)} ${w}`, params)).rows[0].n;
    const linhas = await query(
      `SELECT ${selecionadas.map(c => `"${c.nome}"`).join(', ')} FROM ${fromDe(f)} ${w} ORDER BY ${ordem} LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, params);
    res.json({ tela, recurso: req.params.recurso, total, pagina, limite, paginas: Math.max(1, Math.ceil(total / limite)), dados: linhas.rows });
  } catch (err) { next(err); }
}

// GET /api/v1/:tela/:recurso/:id
export async function umRegistro(req, res, next) {
  try {
    const tela = telaOuErro(req, res); if (!tela) return;
    if (req.params.recurso === 'anexos') return await umAnexo(req, res, tela, req.params.id);
    const f = fontesDaTela(tela)[req.params.recurso];
    if (!f) return res.status(404).json({ erro: 'Recurso não encontrado nesta tela.' });
    const cols = await colunasRecurso(f);
    const chavePk = cols.some(c => c.nome === 'id') ? 'id' : cols[0].nome;
    const r = await query(
      `SELECT ${cols.map(c => `"${c.nome}"`).join(', ')} FROM ${fromDe(f)} WHERE "${chavePk}"::text = $1 ${f.onde ? `AND ${f.onde}` : ''} LIMIT 1`, [String(req.params.id)]);
    if (!r.rows[0]) return res.status(404).json({ erro: 'Registro não encontrado.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

// ── Administração das chaves (só admin) ───────────────────────
const telasValidas = async (lista) => {
  const ok = new Set((await telasLiberaveis()).map(t => t.chave));
  return [...new Set((Array.isArray(lista) ? lista : []).map(String))].filter(t => ok.has(t));
};

export async function opcoesIntegracao(req, res, next) {
  try { await garantirEstruturaApi(); res.json({ telas: await telasLiberaveis() }); } catch (err) { next(err); }
}

export async function listarChaves(req, res, next) {
  try {
    await garantirEstruturaApi();
    const r = await query(
      `SELECT c.id, c.nome, c.prefixo, c.telas, c.ativo, c.limite_min, c.expira_em, c.criado_por_nome, c.created_at, c.ultimo_uso,
              (SELECT COUNT(*)::int FROM api_acessos a WHERE a.chave_id = c.id AND a.em > NOW() - interval '24 hours') AS acessos_24h
         FROM api_chaves c ORDER BY c.created_at DESC`);
    res.json({ chaves: r.rows });
  } catch (err) { next(err); }
}

export async function criarChave(req, res, next) {
  try {
    await garantirEstruturaApi();
    const nome = String(req.body?.nome || '').trim().slice(0, 120);
    if (!nome) return res.status(400).json({ erro: 'Dê um nome à chave (ex.: Power BI - Diretoria).' });
    const telas = await telasValidas(req.body?.telas);
    if (!telas.length) return res.status(400).json({ erro: 'Escolha pelo menos uma tela.' });
    const limite = Math.min(6000, Math.max(1, parseInt(req.body?.limite_min) || 60));
    const expira = req.body?.expira_em ? new Date(req.body.expira_em) : null;
    if (expira && Number.isNaN(expira.getTime())) return res.status(400).json({ erro: 'Data de validade inválida.' });
    const chave = `bx_live_${crypto.randomBytes(24).toString('base64url')}`;
    const r = await query(
      `INSERT INTO api_chaves (nome, prefixo, hash, telas, limite_min, expira_em, criado_por, criado_por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [nome, `${chave.slice(0, 16)}…`, sha256(chave), telas, limite, expira, req.usuario.id, req.usuario.nome || null]);
    res.status(201).json({ id: r.rows[0].id, chave }); // a chave inteira só aparece agora
  } catch (err) { next(err); }
}

export async function editarChave(req, res, next) {
  try {
    await garantirEstruturaApi();
    const b = req.body || {};
    const telas = b.telas === undefined ? null : await telasValidas(b.telas);
    if (telas && !telas.length) return res.status(400).json({ erro: 'Escolha pelo menos uma tela.' });
    const r = await query(
      `UPDATE api_chaves SET nome = COALESCE($2, nome), telas = COALESCE($3, telas), ativo = COALESCE($4, ativo),
              limite_min = COALESCE($5, limite_min)
        WHERE id = $1 RETURNING id`,
      [Number(req.params.id) || 0, b.nome ? String(b.nome).trim().slice(0, 120) : null, telas,
       typeof b.ativo === 'boolean' ? b.ativo : null, b.limite_min ? Math.min(6000, Math.max(1, parseInt(b.limite_min) || 60)) : null]);
    if (!r.rowCount) return res.status(404).json({ erro: 'Chave não encontrada.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function excluirChave(req, res, next) {
  try {
    await garantirEstruturaApi();
    const id = Number(req.params.id) || 0;
    const r = await query(`DELETE FROM api_chaves WHERE id = $1 RETURNING id`, [id]);
    if (!r.rowCount) return res.status(404).json({ erro: 'Chave não encontrada.' });
    await query(`DELETE FROM api_acessos WHERE chave_id = $1`, [id]).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function acessosDaChave(req, res, next) {
  try {
    await garantirEstruturaApi();
    const r = await query(`SELECT caminho, status, ip, ms, em FROM api_acessos WHERE chave_id = $1 ORDER BY id DESC LIMIT 100`, [Number(req.params.id) || 0]);
    res.json({ acessos: r.rows });
  } catch (err) { next(err); }
}
