// ============================================================
// controllers/construtorController.js — Construtor de telas (beta)
// ============================================================
// Monta uma tela inteira como RASCUNHO (colunas, campos, regras), mostra a prévia e
// só cria a tela de verdade quando alguém aprova. Enquanto não for "ligado", só o dono
// (Dhiefferton) vê e usa. O botão "Ligar para todos" libera para admins e para quem tem
// a tela "Telas" com "Ver e mexer".
// Tabelas: bx_rascunhos_tela (rascunhos) e bx_config chave 'construtor_ligado'.
// ============================================================
import { query } from '../config/db.js';
import { garantirQuadros, aplicarConfigNoQuadro, lerConfigDoQuadro } from './quadrosController.js';
import { telasDoUsuario } from '../middlewares/telas.js';

const DONO = (process.env.CONSTRUTOR_DONO || 'compras@boxersoldas.com.br').toLowerCase();
const limpar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

let estrutura = null;
function garantir() {
  if (!estrutura) {
    estrutura = (async () => {
      await garantirQuadros();
      await query(`CREATE TABLE IF NOT EXISTS bx_rascunhos_tela (
        id            SERIAL PRIMARY KEY,
        nome          VARCHAR(80) NOT NULL,
        modelo        VARCHAR(60),
        dados         JSONB NOT NULL DEFAULT '{}'::jsonb,
        status        VARCHAR(20) NOT NULL DEFAULT 'rascunho',
        quadro_id     INTEGER,
        criado_por    INTEGER,
        criado_por_nome VARCHAR(120),
        criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        aprovado_em   TIMESTAMPTZ,
        aprovado_por_nome VARCHAR(120)
      )`);
    })().catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

async function ligado() {
  const r = await query(`SELECT valor FROM bx_config WHERE chave = 'construtor_ligado'`).catch(() => ({ rows: [] }));
  return r.rows[0]?.valor === true;
}
const ehDono = (u) => String(u?.email || '').toLowerCase() === DONO;
async function podeUsar(u) {
  if (!u) return false;
  if (ehDono(u)) return true;
  if (!(await ligado())) return false;
  if (u.perfil === 'admin') return true;
  const t = await telasDoUsuario(u.id).catch(() => null);
  return t?.telas === 'editar';
}

// Middleware: só quem pode usar o Construtor (antes de ligar: só o dono). Para os outros a rota "não existe".
export async function acessoConstrutor(req, res, next) {
  try {
    await garantir();
    if (await podeUsar(req.usuario)) return next();
    res.status(404).json({ erro: 'Não encontrado.' });
  } catch (err) { next(err); }
}

// GET /construtor/status — o app pergunta se mostra o Construtor (nunca dá erro)
export async function statusConstrutor(req, res) {
  try {
    await garantir();
    res.json({ pode: await podeUsar(req.usuario), ligado: await ligado(), dono: ehDono(req.usuario) });
  } catch { res.json({ pode: false, ligado: false, dono: false }); }
}

// POST /construtor/ligar { ligado: true|false } — só o dono
export async function ligarConstrutor(req, res, next) {
  try {
    if (!ehDono(req.usuario)) return res.status(403).json({ erro: 'Só o dono do Construtor pode ligar ou desligar.' });
    const v = req.body?.ligado === true;
    await query(`INSERT INTO bx_config (chave, valor, atualizado_em) VALUES ('construtor_ligado', $1::jsonb, NOW())
                 ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`, [JSON.stringify(v)]);
    res.json({ ligado: v });
  } catch (err) { next(err); }
}

// Rascunho: só guarda o que o construtor usa (colunas, campos, descrição)
function limparDados(d) {
  const colunas = (Array.isArray(d?.colunas) ? d.colunas : []).slice(0, 40).map((c, i) => ({
    chave_temp: limpar(c?.chave_temp, 40) || `c${i}`, nome: limpar(c?.nome, 80), cor: /^#[0-9a-f]{6}$/i.test(c?.cor || '') ? c.cor : '#64748b',
    so_admin: !!c?.so_admin,
  }));
  const chaves = new Set(['inicio', ...colunas.map(c => c.chave_temp)]);
  const campos = (Array.isArray(d?.campos) ? d.campos : []).slice(0, 400).filter(c => chaves.has(String(c?.coluna))).map(c => ({
    uid: limpar(c?.uid, 60), coluna: String(c.coluna), tipo: limpar(c?.tipo, 30), rotulo: limpar(c?.rotulo, 120),
    descricao: limpar(c?.descricao, 300), obrigatorio: !!c?.obrigatorio,
    opcoes: Array.isArray(c?.opcoes) ? c.opcoes.map(o => limpar(o, 120)).filter(Boolean).slice(0, 300) : [],
    lista: c?.lista == null ? null : limpar(c.lista, 60), cores: c?.cores && typeof c.cores === 'object' ? c.cores : null,
    visivel: c?.visivel?.campo ? { campo: limpar(c.visivel.campo, 60), valor: c.visivel.valor } : null,
    condicao: c?.condicao?.campo ? { campo: limpar(c.condicao.campo, 60), valor: c.condicao.valor } : null,
  }));
  return { descricao: limpar(d?.descricao, 300), colunas, campos, origem: limpar(d?.origem, 60) || null };
}

// GET /construtor/rascunhos
export async function listarRascunhos(req, res, next) {
  try {
    const r = await query(`SELECT r.id, r.nome, r.modelo, r.status, r.quadro_id, r.criado_por_nome, r.criado_em, r.atualizado_em, r.aprovado_em, r.aprovado_por_nome,
        jsonb_array_length(COALESCE(r.dados->'colunas', '[]'::jsonb)) AS n_colunas, jsonb_array_length(COALESCE(r.dados->'campos', '[]'::jsonb)) AS n_campos,
        q.nome AS quadro_nome, q.ativo AS quadro_ativo
      FROM bx_rascunhos_tela r LEFT JOIN bx_quadros q ON q.id = r.quadro_id
      WHERE r.status <> 'excluido' ORDER BY r.atualizado_em DESC LIMIT 200`);
    res.json({ rascunhos: r.rows });
  } catch (err) { next(err); }
}

// GET /construtor/rascunhos/:id
export async function verRascunho(req, res, next) {
  try {
    const r = await query(`SELECT * FROM bx_rascunhos_tela WHERE id = $1 AND status <> 'excluido'`, [parseInt(req.params.id) || 0]);
    if (!r.rows[0]) return res.status(404).json({ erro: 'Rascunho não encontrado.' });
    res.json({ rascunho: r.rows[0] });
  } catch (err) { next(err); }
}

// POST /construtor/rascunhos { nome, modelo, dados }
export async function criarRascunho(req, res, next) {
  try {
    const nome = limpar(req.body?.nome, 80) || 'Nova tela';
    const r = await query(`INSERT INTO bx_rascunhos_tela (nome, modelo, dados, criado_por, criado_por_nome) VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING *`,
      [nome, limpar(req.body?.modelo, 60) || null, JSON.stringify(limparDados(req.body?.dados)), req.usuario?.id || null, req.usuario?.nome || null]);
    res.status(201).json({ rascunho: r.rows[0] });
  } catch (err) { next(err); }
}

// PUT /construtor/rascunhos/:id { nome, dados } — salva o rascunho (só os que ainda não viraram tela)
export async function salvarRascunho(req, res, next) {
  try {
    const nome = limpar(req.body?.nome, 80);
    if (!nome) return res.status(400).json({ erro: 'Dê um nome para a tela.' });
    const r = await query(`UPDATE bx_rascunhos_tela SET nome = $2, dados = $3::jsonb, atualizado_em = NOW()
                            WHERE id = $1 AND status = 'rascunho' RETURNING *`,
      [parseInt(req.params.id) || 0, nome, JSON.stringify(limparDados(req.body?.dados))]);
    if (!r.rows[0]) return res.status(404).json({ erro: 'Rascunho não encontrado (ou já virou tela).' });
    res.json({ rascunho: r.rows[0] });
  } catch (err) { next(err); }
}

// DELETE /construtor/rascunhos/:id — some da lista (a tela criada, se houver, continua)
export async function excluirRascunho(req, res, next) {
  try {
    await query(`UPDATE bx_rascunhos_tela SET status = 'excluido', atualizado_em = NOW() WHERE id = $1`, [parseInt(req.params.id) || 0]);
    res.json({ sucesso: true });
  } catch (err) { next(err); }
}

// GET /construtor/telas — telas criadas (para "Copiar tela existente")
export async function telasParaCopiar(req, res, next) {
  try {
    const r = await query(`SELECT id, nome FROM bx_quadros WHERE ativo ORDER BY ordem, id`);
    res.json({ telas: r.rows });
  } catch (err) { next(err); }
}
// GET /construtor/telas/:qid — colunas e campos de uma tela criada, no formato do rascunho
export async function copiarTela(req, res, next) {
  try {
    const qid = parseInt(req.params.qid) || 0;
    const q = (await query(`SELECT id, nome FROM bx_quadros WHERE id = $1`, [qid])).rows[0];
    if (!q) return res.status(404).json({ erro: 'Tela não encontrada.' });
    const cfg = await lerConfigDoQuadro(qid);
    const colunas = cfg.colunas.filter(c => !c.arquivada).map(c => ({ chave_temp: `k_${c.chave}`, nome: c.nome, cor: c.cor, so_admin: !!c.so_admin }));
    const uidDe = (id) => `u_${id}`;
    const campos = cfg.campos.map(c => ({
      uid: uidDe(c.id), coluna: c.coluna === 'inicio' ? 'inicio' : `k_${c.coluna}`, tipo: c.tipo, rotulo: c.rotulo, descricao: c.descricao || '',
      obrigatorio: !!c.obrigatorio, opcoes: c.opcoes || [], lista: c.lista || null, cores: c.cores || null,
      visivel: c.visivel?.campo ? { campo: /^\d+$/.test(String(c.visivel.campo)) ? uidDe(c.visivel.campo) : c.visivel.campo, valor: c.visivel.valor } : null,
      condicao: c.condicao?.campo ? { campo: /^\d+$/.test(String(c.condicao.campo)) ? uidDe(c.condicao.campo) : c.condicao.campo, valor: c.condicao.valor } : null,
    })).filter(c => c.coluna === 'inicio' || colunas.some(k => k.chave_temp === c.coluna));
    res.json({ nome: q.nome, dados: { colunas, campos, origem: `copia:${qid}` } });
  } catch (err) { next(err); }
}

// Revisão automática (a mesma que o app mostra; o servidor confere de novo ao aprovar)
function revisar(nome, d) {
  const erros = [], avisos = [];
  if (!nome) erros.push('Dê um nome para a tela.');
  if (!d.colunas.length) erros.push('A tela precisa de pelo menos uma coluna.');
  const nomes = d.colunas.map(c => c.nome.toLowerCase());
  d.colunas.forEach((c, i) => { if (!c.nome) erros.push(`A coluna ${i + 1} está sem nome.`); });
  const rep = nomes.find((n, i) => n && nomes.indexOf(n) !== i);
  if (rep) erros.push(`Há duas colunas com o nome "${rep}".`);
  for (const c of d.campos) {
    if (!c.rotulo) erros.push('Há um campo sem nome.');
    if (['lista', 'unica', 'etiquetas'].includes(c.tipo) && !c.opcoes.length) avisos.push(`"${c.rotulo || 'Campo'}" não tem opções.`);
  }
  return { erros, avisos };
}

// POST /construtor/rascunhos/:id/aprovar — cria a tela de verdade (quadro + colunas + campos)
export async function aprovarRascunho(req, res, next) {
  try {
    const r = (await query(`SELECT * FROM bx_rascunhos_tela WHERE id = $1 AND status = 'rascunho'`, [parseInt(req.params.id) || 0])).rows[0];
    if (!r) return res.status(404).json({ erro: 'Rascunho não encontrado (ou já virou tela).' });
    const d = limparDados(r.dados);
    const { erros } = revisar(r.nome, d);
    if (erros.length) return res.status(400).json({ erro: erros.join(' ') });
    const ja = await query(`SELECT id FROM bx_quadros WHERE LOWER(nome) = LOWER($1) AND ativo`, [r.nome]);
    if (ja.rows[0]) return res.status(409).json({ erro: `Já existe uma tela chamada "${r.nome}". Mude o nome do rascunho.` });

    const q = (await query(`INSERT INTO bx_quadros (nome, ordem, criado_por_nome) VALUES ($1, (SELECT COALESCE(MAX(ordem), 0) + 10 FROM bx_quadros), $2) RETURNING id, nome`,
      [r.nome, req.usuario?.nome || null])).rows[0];
    try {
      await lerConfigDoQuadro(q.id); // cria as tabelas do quadro com a coluna "Entrada" do sistema
      // A primeira coluna do rascunho ocupa a coluna "Entrada" do sistema (que não pode ser excluída)
      const primeira = d.colunas[0].chave_temp;
      const colunas = d.colunas.map((c, i) => (i === 0 ? { chave: 'entrada', nome: c.nome, cor: c.cor, so_admin: c.so_admin }
        : { chave_temp: c.chave_temp, nome: c.nome, cor: c.cor, so_admin: c.so_admin }));
      const campos = d.campos.map(c => ({ ...c, coluna: c.coluna === primeira ? 'entrada' : c.coluna }));
      await aplicarConfigNoQuadro(q.id, { colunas, campos }, req.usuario);
    } catch (e) {
      // Não deixa tela pela metade: desativa a que acabou de nascer
      await query(`UPDATE bx_quadros SET ativo = FALSE, nome = $2 WHERE id = $1`, [q.id, `${q.nome} (falhou ${q.id})`.slice(0, 80)]).catch(() => {});
      throw e;
    }
    await query(`UPDATE bx_rascunhos_tela SET status = 'criado', quadro_id = $2, aprovado_em = NOW(), aprovado_por_nome = $3, atualizado_em = NOW() WHERE id = $1`,
      [r.id, q.id, req.usuario?.nome || null]);
    res.json({ quadro: q });
  } catch (err) { next(err); }
}
