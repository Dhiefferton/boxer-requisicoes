// ============================================================
// utils/telas.js — Telas que cada colaborador vê e mexe
// ============================================================
// No cadastro (Admin > Usuários > Editar) o admin escolhe, por tela:
//   (sem escolha) = padrão do perfil   'nenhum' = sem acesso
//   'ver' = só ver                      'editar' = ver e mexer
// Admin vê e mexe em tudo. O servidor também bloqueia (não é só o menu).
// Manter o catálogo igual a backend/src/middlewares/telas.js
// ============================================================
import { ORCAMENTOS_SOMENTE_LEITURA } from './acessoOrcamentos';
import { INVENTARIO_COLABORADORES, RECONTAGEM_EMAILS } from './acessoInventario';

const perfilEm = (u, ...p) => p.includes(u?.perfil);
const doSetor = (u, setor) => (u?.departamento_nome || '').trim().toLowerCase() === setor.toLowerCase();
const email = (u) => String(u?.email || '').trim().toLowerCase();

// legado: acesso que o perfil já tinha antes desta configuração
export const TELAS = [
  { chave: 'catalogo',   nome: 'Catálogo / Requisição', rotas: ['/catalogo', '/revisao'], legado: () => 'editar' },
  { chave: 'historico',  nome: 'Histórico',             rotas: ['/historico'],            legado: () => 'editar' },
  { chave: 'operador',   nome: 'Operador',              rotas: ['/operador'],             legado: u => perfilEm(u, 'operador', 'admin') ? 'editar' : 'nenhum' },
  { chave: 'inventario', nome: 'Inventário',            rotas: ['/inventario'],
    legado: u => (perfilEm(u, 'operador', 'admin') || INVENTARIO_COLABORADORES.includes(email(u))) ? 'editar' : 'nenhum' },
  { chave: 'entradas',   nome: 'Entradas',              rotas: ['/entradas'],             legado: u => perfilEm(u, 'admin') ? 'editar' : 'nenhum' },
  { chave: 'estoque',    nome: 'Estoque',               rotas: ['/estoque'],              legado: u => perfilEm(u, 'admin') ? 'editar' : 'nenhum' },
  { chave: 'admin',      nome: 'Admin',                 rotas: ['/admin'],                legado: u => perfilEm(u, 'admin') ? 'editar' : 'nenhum' },
  { chave: 'mrp',        nome: 'MRP',                   rotas: ['/mrp'],                  legado: u => perfilEm(u, 'admin') ? 'editar' : 'nenhum' },
  { chave: 'compras',    nome: 'Compras',               rotas: ['/compras'],              legado: u => perfilEm(u, 'admin') ? 'editar' : 'nenhum' },
  { chave: 'necessidade_pecas', nome: 'Necessidade de Peças', rotas: ['/necessidade-pecas'],
    legado: u => (perfilEm(u, 'admin') || doSetor(u, 'Sac / Suporte')) ? 'editar' : 'nenhum' },
  { chave: 'recebimento_importacao', nome: 'Recebimento/Importação', rotas: ['/recebimento-importacao'],
    legado: u => perfilEm(u, 'operador', 'admin') ? 'editar' : 'nenhum' },
  { chave: 'lojinha',    nome: 'Lojinha Boxer',         rotas: ['/lojinha'],
    legado: u => (perfilEm(u, 'operador', 'admin') || doSetor(u, 'Sac / Suporte')) ? 'editar' : 'nenhum' },
  { chave: 'logistica_cif', nome: 'Logística CIF (Enviar)', rotas: ['/logistica-cif'],
    legado: u => (perfilEm(u, 'operador', 'admin') || doSetor(u, 'Sac / Suporte')) ? 'editar' : 'nenhum' },
  { chave: 'orcamentos', nome: 'Orçamentos',            rotas: ['/pedidos-orcamento'],
    legado: u => perfilEm(u, 'operador', 'admin') ? 'editar' : ORCAMENTOS_SOMENTE_LEITURA.includes(email(u)) ? 'ver' : 'nenhum' },
];
export const NIVEIS = [
  { valor: 'nenhum', nome: 'Sem acesso' },
  { valor: 'ver',    nome: 'Só ver' },
  { valor: 'editar', nome: 'Ver e mexer' },
];
export const nomeNivel = (v) => NIVEIS.find(n => n.valor === v)?.nome || v;

/** 'editar' | 'ver' | 'nenhum' para o usuário logado (ou para um usuário da lista do Admin). */
export function nivelTela(usuario, chave) {
  const t = TELAS.find(x => x.chave === chave);
  if (!t || !usuario) return 'nenhum';
  if (usuario.perfil === 'admin') return 'editar';
  const escolhido = usuario.telas?.[chave];
  if (['nenhum', 'ver', 'editar'].includes(escolhido)) return escolhido;
  return t.legado(usuario);
}
export const veTela = (usuario, chave) => nivelTela(usuario, chave) !== 'nenhum';
export const mexeTela = (usuario, chave) => nivelTela(usuario, chave) === 'editar';

/** Tela da rota atual (ex.: /inventario/12/contar → inventario). */
export function telaDaRota(caminho) {
  const p = String(caminho || '');
  return TELAS.find(t => t.rotas.some(r => p === r || p.startsWith(r + '/')))?.chave || null;
}

// ── Botões liberados por colaborador (Admin > Usuários > Editar, embaixo de cada tela)
// Sem escolha = padrão (só o admin; recontagem/finalizar: o Alexsander). Admin sempre tem todos.
// Manter igual a BOTOES em backend/src/middlewares/telas.js
const recontador = (u) => RECONTAGEM_EMAILS.includes(email(u));
export const BOTOES = [
  { chave: 'orc_novo_card',     tela: 'orcamentos', nome: 'Novo card' },
  { chave: 'orc_trazer_pipefy', tela: 'orcamentos', nome: 'Trazer do Pipefy' },
  { chave: 'orc_movimentacao',  tela: 'orcamentos', nome: 'Movimentação (relatório)' },
  { chave: 'orc_historico',     tela: 'orcamentos', nome: 'Histórico do card' },
  { chave: 'orc_campos',        tela: 'orcamentos', nome: 'Preencher os campos da fase atual' },
  { chave: 'orc_editar_fase',   tela: 'orcamentos', nome: 'Editar fases anteriores' },
  { chave: 'orc_mover',         tela: 'orcamentos', nome: 'Mover para qualquer coluna (arrastar e colunas só do admin)' },
  { chave: 'orc_pecas_zen',     tela: 'orcamentos', nome: 'Atualizar peças no Zen' },
  { chave: 'orc_configurar',    tela: 'orcamentos', nome: 'Configurar colunas e campos (engrenagem)' },
  { chave: 'loj_movimentacao',  tela: 'lojinha',    nome: 'Movimentação (relatório)' },
  { chave: 'loj_editar_fase',   tela: 'lojinha',    nome: 'Editar fases anteriores' },
  { chave: 'loj_mover_admin',   tela: 'lojinha',    nome: 'Mover para colunas só do admin' },
  { chave: 'loj_configurar',    tela: 'lojinha',    nome: 'Configurar colunas e campos (engrenagem)' },
  { chave: 'cif_movimentacao',  tela: 'logistica_cif', nome: 'Movimentação (relatório)' },
  { chave: 'cif_editar_fase',   tela: 'logistica_cif', nome: 'Editar fases anteriores' },
  { chave: 'cif_mover_admin',   tela: 'logistica_cif', nome: 'Mover para colunas só do admin' },
  { chave: 'cif_configurar',    tela: 'logistica_cif', nome: 'Configurar colunas e campos (engrenagem)' },
  { chave: 'inv_recontagem',    tela: 'inventario', nome: 'Fazer a recontagem', legado: recontador },
  { chave: 'inv_finalizar',     tela: 'inventario', nome: 'Finalizar inventário e marcar ajuste no Zen', legado: recontador },
  { chave: 'inv_cancelar',      tela: 'inventario', nome: 'Cancelar inventário' },
  { chave: 'inv_marketplace',   tela: 'inventario', nome: 'Gerar relatório de reposição (Marketplace)' },
  { chave: 'nec_revisar',       tela: 'necessidade_pecas', nome: 'Revisar, aprovar, recusar e relatórios' },
];
/** Padrão do botão (sem escolha no cadastro). */
export function botaoPadrao(usuario, chave) {
  if (usuario?.perfil === 'admin') return true;
  const b = BOTOES.find(x => x.chave === chave);
  return !!(b?.legado && b.legado(usuario));
}
/** O usuário tem o botão? Admin sempre; senão o escolhido no cadastro; sem escolha = padrão. */
export function temBotao(usuario, chave) {
  if (!usuario) return false;
  if (usuario.perfil === 'admin') return true;
  const escolhido = usuario.telas?._botoes?.[chave];
  if (typeof escolhido === 'boolean') return escolhido;
  return botaoPadrao(usuario, chave);
}
/** Botões de uma tela como objeto: podeNaTela(u, 'orcamentos') → { novo_card: true, mover: false, … } */
export function podeNaTela(usuario, tela) {
  return Object.fromEntries(BOTOES.filter(b => b.tela === tela).map(b => [b.chave.replace(/^[a-z]+_/, ''), temBotao(usuario, b.chave)]));
}
