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
import { INVENTARIO_COLABORADORES } from './acessoInventario';

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
