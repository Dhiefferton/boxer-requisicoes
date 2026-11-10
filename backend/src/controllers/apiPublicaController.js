// ============================================================
// controllers/apiPublicaController.js — API pública (somente leitura) do Boxer Operações
// ============================================================
// Outros sistemas consultam o Boxer com uma CHAVE de API criada pelo admin (Integrações).
//   • Authorization: Bearer bx_live_…   (a chave só aparece uma vez; no banco fica o hash)
//   • Cada chave enxerga só as telas que o admin liberou (qualquer tela, inclusive quadros).
//   • Só GET. Nunca devolve senhas, tokens, hashes nem imagens (colunas bytea).
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
// recurso -> { tabela, onde? (filtro fixo da tela), ordem? }
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
  lojinha:                { pedidos: { tabela: 'lojinha_boxer_pedidos', onde: `COALESCE(origem, '') <> 'pipefy_garantia'` }, movimentos: { tabela: 'loj_movimentos' } },
  orcamentos:             { pedidos: { tabela: 'pedidos_orcamento' }, movimentos: { tabela: 'pedidos_orcamento_movimentos' } },
  logistica_cif:          { pedidos: { tabela: 'lojinha_boxer_pedidos', onde: `(origem = 'pipefy_garantia' OR cif_status IS NOT NULL)` } },
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
  if (q) return { cards: { tabela: 'bx_quadro_cards', onde: `quadro_id = ${q}` } };
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
        tela: t, nome: nomes.get(t), recursos: Object.keys(fontesDaTela(t) || {}),
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
      recursos.push({ recurso: nome, colunas: (await colunasDe(f.tabela)).map(c => c.nome), url: `/api/v1/${tela}/${nome}` });
    }
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
    const f = fontesDaTela(tela)[req.params.recurso];
    if (!f) return res.status(404).json({ erro: 'Recurso não encontrado nesta tela.' });
    const cols = await colunasDe(f.tabela);
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
    const total = (await query(`SELECT COUNT(*)::int AS n FROM ${f.tabela} ${w}`, params)).rows[0].n;
    const linhas = await query(
      `SELECT ${selecionadas.map(c => `"${c.nome}"`).join(', ')} FROM ${f.tabela} ${w} ORDER BY ${ordem} LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, params);
    res.json({ tela, recurso: req.params.recurso, total, pagina, limite, paginas: Math.max(1, Math.ceil(total / limite)), dados: linhas.rows });
  } catch (err) { next(err); }
}

// GET /api/v1/:tela/:recurso/:id
export async function umRegistro(req, res, next) {
  try {
    const tela = telaOuErro(req, res); if (!tela) return;
    const f = fontesDaTela(tela)[req.params.recurso];
    if (!f) return res.status(404).json({ erro: 'Recurso não encontrado nesta tela.' });
    const cols = await colunasDe(f.tabela);
    const chavePk = cols.some(c => c.nome === 'id') ? 'id' : cols[0].nome;
    const r = await query(
      `SELECT ${cols.map(c => `"${c.nome}"`).join(', ')} FROM ${f.tabela} WHERE "${chavePk}"::text = $1 ${f.onde ? `AND ${f.onde}` : ''} LIMIT 1`, [String(req.params.id)]);
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
