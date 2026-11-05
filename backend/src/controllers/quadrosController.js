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
import { criarConfigQuadro, exigidoAgora, bloqueioRegra } from './configQuadro.js';
import { telasDoUsuario } from '../middlewares/telas.js';
import { registrarArquivoBlob, excluirArquivoBlob, lerEnvioBlob } from './blobController.js';

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

const limpar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

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
    await garantirQuadros();
    const admin = req.usuario?.perfil === 'admin';
    const [q, n] = await Promise.all([
      query(`SELECT id, nome, ativo, ordem FROM bx_quadros ${admin ? '' : 'WHERE ativo'} ORDER BY ordem, id`),
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
    const r = await query(`UPDATE bx_quadros SET nome = $2, ativo = $3 WHERE id = $1 RETURNING id, nome, ativo, ordem`, [id, nome, ativo]);
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
export const verConfigQuadro = (req, res, next) => cfgDe(req.params.qid).verConfig(req, res, next);
export const salvarConfigQuadroDin = (req, res, next) => cfgDe(req.params.qid).salvarConfig(req, res, next);
export const adicionarOpcaoQuadro = (req, res, next) => cfgDe(req.params.qid).adicionarOpcao(req, res, next);

// ── Cards ───────────────────────────────────────────────────
const SELECT_CARD = `SELECT c.*, (SELECT COALESCE(json_agg(json_build_object('id', f.id, 'campo', f.campo_id, 'mime', f.mime, 'nome', f.nome,
    'blob_url', f.blob_url, 'tamanho', f.tamanho) ORDER BY f.id), '[]'::json) FROM bx_quadro_fotos f WHERE f.pedido_id = c.id) AS fotos_locais
  FROM bx_quadro_cards c`;

// GET /quadros/:qid/cards
export async function listarCards(req, res, next) {
  try {
    const qid = req.quadro.id;
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
    const destinos = col.get(atual)?.destinos;
    if (Array.isArray(destinos) && !destinos.includes(status)) {
      return res.status(400).json({ erro: `De "${col.get(atual)?.nome || atual}" não dá para mover para "${col.get(status)?.nome || status}". Ajuste em Configurar.` });
    }
    const valores = p.valores || {};
    // Regras da coluna (Configurar → "Regras para mover")
    const motivo = bloqueioRegra(col.get(atual), status, cfg.campos, valores, c.idCampoConfig);
    if (motivo) return res.status(400).json({ erro: `Não dá para mover para "${col.get(status)?.nome || status}": ${motivo} (regra da coluna "${col.get(atual)?.nome || atual}").` });
    const faltando = cfg.campos.filter(f => f.coluna === atual && f.tipo !== 'anexo' && exigidoAgora(f, cfg.campos, valores, c.idCampoConfig)
      && !String(valores[c.idCampoConfig(f)] ?? '').replace(/[\[\]"]/g, '').trim());
    if (faltando.length) return res.status(400).json({ erro: `Preencha antes de sair de "${col.get(atual)?.nome || atual}": ${faltando.map(f => f.rotulo).join(', ')}.` });
    const r = await query(`UPDATE bx_quadro_cards SET status = $2, entrou_em = NOW(), atualizado_em = NOW() WHERE id = $1 RETURNING *`, [p.id, status]);
    await movimento(qid, r.rows[0], 'movido', { de: atual, para: status, usuario: req.usuario,
      descricao: `Movido de ${col.get(atual)?.nome || atual} para ${col.get(status)?.nome || status}` });
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
    for (const b of blobs) await excluirArquivoBlob(b.blob_url).catch(() => {});
    await query(`DELETE FROM bx_quadro_fotos WHERE pedido_id = $1`, [p.id]);
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

