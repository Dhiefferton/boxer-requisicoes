// ============================================================
// controllers/logisticaCifController.js — Logística CIF (Enviar)
// ============================================================
// Continuação da Lojinha Boxer: quando o pedido chega em Finalizado ele entra
// aqui na coluna "Aguardando envio" (e continua em Finalizado na Lojinha).
// É o mesmo pedido (lojinha_boxer_pedidos), então os dados, fotos e o
// histórico da Lojinha vêm junto. Fase daqui: cif_status; campos: cif_valores
// (ids cif_bx_<id>); colunas e campos configuráveis (cif_colunas / cif_campos).
// ============================================================
import { query } from '../config/db.js';
import { criarConfigQuadro, exigidoAgora } from './configQuadro.js';
import { garantirEstrutura, registrarMovLoj } from './lojinhaController.js';
import { temBotao } from '../middlewares/telas.js';

const COLUNAS_CIF = [
  { chave: 'aguardando_envio', nome: 'Aguardando envio', cor: '#3b82f6', so_admin: false },
];
const PRIMEIRA = COLUNAS_CIF[0].chave;
const cfgCif = criarConfigQuadro({ TC: 'cif_colunas', TF: 'cif_campos', tabPedidos: 'lojinha_boxer_pedidos',
  padrao: COLUNAS_CIF, colStatus: 'cif_status', prefixoId: 'cif_bx_' });
export const verConfigCif = (req, res, next) => cfgCif.verConfig(req, res, next);
export const salvarConfigCif = (req, res, next) => cfgCif.salvarConfig(req, res, next);
export const adicionarOpcaoCif = (req, res, next) => cfgCif.adicionarOpcao(req, res, next);

// Só os pedidos finalizados a partir do lançamento da tela entram sozinhos
const INICIO_CIF = '2026-11-03T00:00:00-03:00';

/** Pedidos que chegaram em Finalizado e ainda não estão no CIF entram em "Aguardando envio". */
export async function entrarNoCif(usuario = null) {
  await garantirEstrutura();
  const r = await query(
    `UPDATE lojinha_boxer_pedidos SET cif_status = $1, cif_entrou_em = NOW()
      WHERE status = 'finalizado' AND cif_status IS NULL AND finalizado_em >= $2::timestamptz
      RETURNING *`, [PRIMEIRA, INICIO_CIF]);
  for (const p of r.rows) {
    await registrarMovLoj(p, 'cif_entrada', {
      de: 'finalizado', para: PRIMEIRA, usuario, origem: usuario ? 'usuario' : 'sistema',
      descricao: 'Entrou na Logística CIF (Enviar) — Aguardando envio',
    });
  }
  return r.rows.length;
}

// Acesso (padrão, igual à Lojinha): admin, operador ou setor SAC / Suporte; ou tela liberada no cadastro
export async function acessoCif(req, res, next) {
  try {
    const u = req.usuario;
    if (!u) return res.status(401).json({ erro: 'Não autenticado.' });
    if (req.liberadoTela || ['admin', 'operador'].includes(u.perfil)) return next();
    if (u.departamento_id) {
      const r = await query(`SELECT nome FROM departamentos WHERE id = $1`, [u.departamento_id]);
      if ((r.rows[0]?.nome || '').trim().toLowerCase() === 'sac / suporte') return next();
    }
    res.status(403).json({ erro: 'Acesso restrito à Logística CIF.' });
  } catch (err) { next(err); }
}

// GET /logistica-cif/pedidos
export async function listarPedidosCif(req, res, next) {
  try {
    await entrarNoCif().catch(e => console.error('[CIF] entrada:', e.message));
    const cfg = await cfgCif.ler();
    const arquivadas = cfg.colunas.filter(c => c.arquivada).map(c => c.chave);
    const r = await query(
      `SELECT t.*, (SELECT COALESCE(json_agg(json_build_object('id', f.id, 'campo', f.campo_id, 'mime', f.mime, 'nome', f.nome, 'blob_url', f.blob_url, 'tamanho', f.tamanho) ORDER BY f.id), '[]'::json)
                      FROM loj_fotos f WHERE f.pedido_id = t.id) AS fotos_locais
         FROM ((SELECT * FROM lojinha_boxer_pedidos WHERE cif_status IS NOT NULL AND NOT (cif_status = ANY($1::text[])))
               UNION ALL
               (SELECT * FROM lojinha_boxer_pedidos WHERE cif_status = ANY($1::text[]) ORDER BY cif_entrou_em DESC NULLS LAST LIMIT 80)) t
        ORDER BY t.cif_entrou_em DESC NULLS LAST, t.id DESC`, [arquivadas]);
    res.json({ pedidos: r.rows });
  } catch (err) { next(err); }
}

// POST /logistica-cif/pedidos/:id/mover { status }
export async function moverPedidoCif(req, res, next) {
  try {
    await garantirEstrutura();
    const status = String(req.body?.status || '');
    const cfg = await cfgCif.ler();
    const col = new Map(cfg.colunas.map(c => [c.chave, c]));
    if (!col.has(status)) return res.status(400).json({ erro: 'Coluna inválida.' });
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL`, [parseInt(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado na Logística CIF.' });
    const atual = p.cif_status;
    if (status === atual) return res.json({ pedido: p });
    if (!temBotao(req.usuario, 'cif_mover_admin') && (col.get(status)?.so_admin || col.get(atual)?.so_admin)) {
      return res.status(403).json({ erro: 'Mover pedidos nessa coluna não está liberado para você (Admin > Usuários).' });
    }
    const destinosCol = col.get(atual)?.destinos;
    if (Array.isArray(destinosCol) && !destinosCol.includes(status)) {
      return res.status(400).json({ erro: `De "${col.get(atual)?.nome || atual}" não dá para mover para "${col.get(status)?.nome || status}". Ajuste em Configurar.` });
    }
    const valores = p.cif_valores || {};
    const faltando = cfg.campos.filter(c => c.coluna === atual && exigidoAgora(c, cfg.campos, valores, cfgCif.idCampoConfig) && c.tipo !== 'anexo'
      && !String(valores[cfgCif.idCampoConfig(c)] ?? '').replace(/[\[\]"]/g, '').trim());
    if (faltando.length) return res.status(400).json({ erro: `Preencha antes de sair de "${col.get(atual)?.nome || atual}": ${faltando.map(c => c.rotulo).join(', ')}.` });
    const r = await query(`UPDATE lojinha_boxer_pedidos SET cif_status = $2 WHERE id = $1 RETURNING *`, [p.id, status]);
    await registrarMovLoj(r.rows[0], 'cif_movido', {
      de: atual, para: status, usuario: req.usuario,
      descricao: `Logística CIF: movido de ${col.get(atual)?.nome || atual} para ${col.get(status)?.nome || status}`,
    });
    res.json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}

// POST /logistica-cif/pedidos/:id/campos { campos: { cif_bx_<id>: valor } }
export async function editarCamposCif(req, res, next) {
  try {
    await garantirEstrutura();
    const campos = req.body?.campos;
    if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return res.status(400).json({ erro: 'Envie { campos: { id: valor } }.' });
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1 AND cif_status IS NOT NULL`, [parseInt(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado na Logística CIF.' });
    const cfg = await cfgCif.ler();
    const rot = new Map(cfg.campos.map(c => [cfgCif.idCampoConfig(c), c.rotulo]));
    const novo = { ...(p.cif_valores || {}) };
    const alterados = [];
    for (const [k, v] of Object.entries(campos)) {
      if (!/^cif_[a-z0-9_]{1,80}$/i.test(k)) continue;
      const valor = v == null ? '' : String(v).slice(0, 5000);
      if (valor === '') delete novo[k]; else novo[k] = valor;
      alterados.push(rot.get(k) || k);
    }
    const r = await query(`UPDATE lojinha_boxer_pedidos SET cif_valores = $2::jsonb WHERE id = $1 RETURNING *`, [p.id, JSON.stringify(novo)]);
    if (alterados.length) await registrarMovLoj(p, 'campos_editados', { usuario: req.usuario, descricao: `Logística CIF — campos preenchidos: ${alterados.join(', ')}`, detalhes: campos });
    res.json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}
