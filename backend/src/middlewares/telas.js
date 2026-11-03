// ============================================================
// middlewares/telas.js — Telas liberadas por colaborador
// ============================================================
// No cadastro do colaborador (Admin > Usuários) o admin escolhe, por tela:
//   (sem escolha) = padrão do perfil (regras antigas: perfil, setor, e-mails liberados)
//   'nenhum'      = sem acesso
//   'ver'         = só ver (leitura liberada; salvar/mover/criar/excluir bloqueados)
//   'editar'      = ver e mexer (como quem tem acesso completo à tela)
// Admin sempre vê e mexe em tudo. Criar/alterar/excluir usuários é sempre só do admin.
// Manter o catálogo igual a frontend/src/utils/telas.js
// ============================================================
import { query } from '../config/db.js';

export const TELAS = [
  { chave: 'catalogo',               nome: 'Catálogo / Requisição' },
  { chave: 'historico',              nome: 'Histórico' },
  { chave: 'operador',               nome: 'Operador' },
  { chave: 'inventario',             nome: 'Inventário' },
  { chave: 'entradas',               nome: 'Entradas' },
  { chave: 'estoque',                nome: 'Estoque' },
  { chave: 'admin',                  nome: 'Admin' },
  { chave: 'mrp',                    nome: 'MRP' },
  { chave: 'compras',                nome: 'Compras' },
  { chave: 'necessidade_pecas',      nome: 'Necessidade de Peças' },
  { chave: 'recebimento_importacao', nome: 'Recebimento/Importação' },
  { chave: 'lojinha',                nome: 'Lojinha Boxer' },
  { chave: 'orcamentos',             nome: 'Orçamentos' },
  { chave: 'logistica_cif',          nome: 'Logística CIF (Enviar)' },
  { chave: 'databases',              nome: 'Databases' },
];
const CHAVES = new Set(TELAS.map(t => t.chave));
export const NIVEIS = ['nenhum', 'ver', 'editar'];

// Rotas da API de cada tela: [método (null = todos), caminho, telas]
// Rotas que não estão aqui (gerais, login, senha…) seguem só as regras antigas.
const ROTAS = [
  [null,    /^\/pedidos-orcamento(\/|$)/,           ['orcamentos']],
  [null,    /^\/lojinha(\/|$)/,                     ['lojinha']],
  [null,    /^\/logistica-cif(\/|$)/,               ['logistica_cif']],
  // Databases: só o que muda a database (ler e criar registro no card continuam abertos)
  ['POST',   /^\/bases(\/importar-pipefy|\/\d+\/importar)?$/, ['databases']],
  ['PATCH',  /^\/bases\/(\d+|registros\/\d+)$/,     ['databases']],
  ['DELETE', /^\/bases\/(\d+|registros\/\d+)$/,     ['databases']],
  [null,    /^\/(inventarios|marketplace)(\/|$)/,   ['inventario']],
  [null,    /^\/recebimento-importacao(\/|$)/,      ['recebimento_importacao']],
  [null,    /^\/necessidades-pecas(\/|$)/,          ['necessidade_pecas']],
  [null,    /^\/entradas(\/|$)/,                    ['entradas']],
  [null,    /^\/mrp(\/|$)/,                         ['mrp']],
  ['POST',  /^\/compras\/processos$/,               ['compras', 'mrp']],
  [null,    /^\/compras(\/|$)/,                     ['compras']],
  [null,    /^\/fornecedores(\/|$)/,                ['admin', 'compras']],
  [null,    /^\/materiais\/\d+\/fornecedores(\/|$)/, ['admin', 'compras']],
  ['PATCH', /^\/materiais\/\d+\/estoque$/,          ['estoque', 'admin', 'operador']],
  ['POST',  /^\/materiais$/,                        ['estoque', 'admin']],
  ['PATCH', /^\/materiais\/\d+$/,                   ['estoque', 'admin']],
  ['PATCH', /^\/requisicoes\/\d+\/status$/,         ['operador']],
  ['GET',   /^\/requisicoes\/relatorio$/,           ['operador']],
  ['POST',  /^\/requisicoes$/,                      ['catalogo']],
  ['GET',   /^\/requisicoes(\/\d+)?$/,              ['historico', 'operador']],
  ['GET',   /^\/admin\/usuarios$/,                  ['admin']],   // usuários: só a lista; mexer é sempre do admin
  [null,    /^\/admin\/(departamentos|pipefy-uso)(\/|$)/, ['admin']],
];
// POST que só lê (a tela chama sozinha) — vale como leitura para quem tem "Só ver"
const POST_LEITURA = [/^\/pedidos-orcamento\/sincronizar-pipefy$/, /^\/inventarios\/previa$/];

export function telasDaRota(metodo, caminho) {
  const r = ROTAS.find(([m, re]) => (!m || m === metodo) && re.test(caminho));
  return r ? r[2] : [];
}

// ── Botões que o admin libera por colaborador (Admin > Usuários > Editar)
// Sem escolha = padrão (legado). Admin sempre tem todos.
// Manter igual a BOTOES em frontend/src/utils/telas.js
const RECONTAGEM_EMAILS = ['alexsander.lucas@boxer.com.br'];
const emailDe = (u) => String(u?.email || '').trim().toLowerCase();
const soAdminLeg = () => false; // não-admin: sem o botão por padrão
export const BOTOES = [
  // Orçamentos
  { chave: 'orc_novo_card',     tela: 'orcamentos', rotas: [['POST', /^\/pedidos-orcamento\/novo-card$/], ['GET', /^\/pedidos-orcamento\/cliente-zen$/]] },
  { chave: 'orc_trazer_pipefy', tela: 'orcamentos', rotas: [['POST', /^\/pedidos-orcamento\/importar-entrada$/]] },
  { chave: 'orc_movimentacao',  tela: 'orcamentos', rotas: [['GET', /^\/pedidos-orcamento\/movimentos$/]] },
  { chave: 'orc_historico',     tela: 'orcamentos', rotas: [['GET', /^\/pedidos-orcamento\/movimentos$/]] },
  { chave: 'orc_campos',        tela: 'orcamentos', rotas: [['PATCH', /^\/pedidos-orcamento\/\d+\/campos$/]] },
  { chave: 'orc_editar_fase',   tela: 'orcamentos', rotas: [['PATCH', /^\/pedidos-orcamento\/\d+\/campos$/]] },
  { chave: 'orc_mover',         tela: 'orcamentos', rotas: [] }, // checado no moverPedido
  { chave: 'orc_pecas_zen',     tela: 'orcamentos', rotas: [['POST', /^\/pedidos-orcamento\/\d+\/(atualizar-itens-zen|voltar-separacao)$/]] },
  { chave: 'orc_configurar',    tela: 'orcamentos', rotas: [['POST', /^\/pedidos-orcamento\/config$/], ['GET', /^\/pedidos-orcamento\/pipefy-pipes$/],
    ['POST', /^\/bases(\/importar-pipefy)?$/], ['DELETE', /^\/bases\/\d+$/], ['PATCH', /^\/bases\/registros\/\d+$/]] },
  // Lojinha
  { chave: 'loj_movimentacao',  tela: 'lojinha', rotas: [] },
  { chave: 'loj_editar_fase',   tela: 'lojinha', rotas: [] },
  { chave: 'loj_mover_admin',   tela: 'lojinha', rotas: [] }, // checado no moverPedidoLojinha
  { chave: 'loj_configurar',    tela: 'lojinha', rotas: [['POST', /^\/lojinha\/quadro-config$/],
    ['POST', /^\/bases(\/importar-pipefy)?$/], ['DELETE', /^\/bases\/\d+$/], ['PATCH', /^\/bases\/registros\/\d+$/]] },
  // Logística CIF (Enviar)
  { chave: 'cif_movimentacao',  tela: 'logistica_cif', rotas: [] },
  { chave: 'cif_editar_fase',   tela: 'logistica_cif', rotas: [] },
  { chave: 'cif_mover_admin',   tela: 'logistica_cif', rotas: [] }, // checado no moverPedidoCif
  { chave: 'cif_configurar',    tela: 'logistica_cif', rotas: [['POST', /^\/logistica-cif\/quadro-config$/],
    ['POST', /^\/bases(\/importar-pipefy)?$/], ['DELETE', /^\/bases\/\d+$/], ['PATCH', /^\/bases\/registros\/\d+$/]] },
  // Inventário
  { chave: 'inv_recontagem',    tela: 'inventario', rotas: [], legado: u => RECONTAGEM_EMAILS.includes(emailDe(u)) },
  { chave: 'inv_finalizar',     tela: 'inventario', rotas: [], legado: u => RECONTAGEM_EMAILS.includes(emailDe(u)) },
  { chave: 'inv_cancelar',      tela: 'inventario', rotas: [['POST', /^\/inventarios\/\d+\/cancelar$/]] },
  { chave: 'inv_marketplace',   tela: 'inventario', rotas: [['POST', /^\/marketplace\/(relatorios\/gerar|sincronizar)$/]] },
  // Necessidade de Peças
  { chave: 'nec_revisar',       tela: 'necessidade_pecas', rotas: [[null, /^\/necessidades-pecas\/relatorios(\/\d+)?$/],
    ['POST', /^\/necessidades-pecas\/\d+\/(iniciar-revisao|aprovar|recusar|enviar)$/], ['PATCH', /^\/necessidades-pecas\/\d+$/]] },
];
const CHAVES_BOTOES = new Set(BOTOES.map(b => b.chave));

/** O usuário tem o botão? (admin sempre; senão o escolhido no cadastro; sem escolha = padrão) */
export function temBotao(usuario, chave) {
  if (!usuario) return false;
  if (usuario.perfil === 'admin') return true;
  const b = BOTOES.find(x => x.chave === chave);
  if (!b) return false;
  const escolhido = usuario.telas?._botoes?.[chave];
  if (typeof escolhido === 'boolean') return escolhido;
  return (b.legado || soAdminLeg)(usuario);
}
export function botoesDaRota(metodo, caminho) {
  return BOTOES.filter(b => b.rotas.some(([m, re]) => (!m || m === metodo) && re.test(caminho)));
}

/** Limpa o que veio da tela: só chaves conhecidas e níveis válidos. Vazio = null (padrão do perfil). */
export function normalizarTelas(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (CHAVES.has(k) && NIVEIS.includes(v)) out[k] = v;
  const bt = obj._botoes;
  if (bt && typeof bt === 'object' && !Array.isArray(bt)) {
    const b = {};
    for (const [k, v] of Object.entries(bt)) if (CHAVES_BOTOES.has(k) && typeof v === 'boolean') b[k] = v;
    if (Object.keys(b).length) out._botoes = b;
  }
  return Object.keys(out).length ? out : null;
}

let coluna = null;
export function garantirColunaTelas() {
  if (!coluna) {
    coluna = query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telas JSONB`).catch(err => { coluna = null; throw err; });
  }
  return coluna;
}

// Cache curto (a mudança no cadastro vale em até 30 s, sem precisar sair e entrar)
const cache = new Map();
/** Só para testes: grava as telas de um usuário no cache. */
export function _cacheTelas(id, telas) { cache.set(Number(id), { em: Date.now(), telas: normalizarTelas(telas) }); }
export function limparCacheTelas(id) { if (id == null) cache.clear(); else cache.delete(Number(id)); }
export async function telasDoUsuario(id) {
  const c = cache.get(Number(id));
  if (c && Date.now() - c.em < 30000) return c.telas;
  await garantirColunaTelas();
  const r = await query(`SELECT telas FROM usuarios WHERE id = $1`, [id]);
  const telas = normalizarTelas(r.rows[0]?.telas);
  cache.set(Number(id), { em: Date.now(), telas });
  return telas;
}

/** Roda logo depois do login validado (dentro do autenticar). */
export async function aplicarTelas(req, res, next) {
  try {
    const u = req.usuario;
    if (!u || u.perfil === 'admin') return next();
    const caminho = String(req.originalUrl || '').split('?')[0].replace(/^\/api(?=\/)/, '');
    const mapeadas = telasDaRota(req.method, caminho);
    const botoesRota = botoesDaRota(req.method, caminho);
    if (!mapeadas.length && !botoesRota.length) return next();
    const telas = await telasDoUsuario(u.id);
    u.telas = telas;
    // Ação de um botão liberável: quem tem o botão passa; quem não tem segue o padrão do perfil
    if (botoesRota.length) {
      const comBotao = botoesRota.filter(b => temBotao(u, b.chave) && telas?.[b.tela] !== 'nenhum');
      if (comBotao.length) { req.liberadoTela = true; req.telasLiberadas = new Set(comBotao.map(b => b.tela)); }
      // ou a tela da rota (ex.: Databases) com "Ver e mexer"
      else if (mapeadas.some(t => telas?.[t] === 'editar')) { req.liberadoTela = true; req.telasLiberadas = new Set(mapeadas.filter(t => telas[t] === 'editar')); }
      return next();
    }
    if (!telas) return next(); // nada configurado: regras antigas
    const leitura = ['GET', 'HEAD'].includes(req.method) || (req.method === 'POST' && POST_LEITURA.some(re => re.test(caminho)));
    const liberadas = mapeadas.filter(t => telas[t] === 'editar' || (telas[t] === 'ver' && leitura));
    if (liberadas.length) { req.liberadoTela = true; req.telasLiberadas = new Set(liberadas); return next(); }
    if (mapeadas.some(t => !telas[t])) return next(); // alguma tela da rota está no padrão do perfil
    const soVer = mapeadas.some(t => telas[t] === 'ver');
    return res.status(403).json({ erro: soVer ? 'Você só pode visualizar esta tela.' : 'Você não tem acesso a esta tela.' });
  } catch (err) {
    console.error('⚠️ Telas do colaborador:', err.message);
    next(); // falha ao ler: segue as regras antigas
  }
}
