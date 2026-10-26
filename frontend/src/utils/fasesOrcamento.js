// ============================================================
// utils/fasesOrcamento.js — Colunas da tela de Orçamentos
// ============================================================
// Mesmas fases do pipe "Orçamento BOXER SOLDAS" no Pipefy, na mesma ordem,
// com "Em Separação" e "Separado" (etapas do Zen) logo depois de
// "Requisitar Peças". admin: true = coluna nova, só o admin move cards.
// Manter igual a NOME_STATUS / STATUS_ADMIN em
// backend/src/controllers/pedidosOrcamentoController.js
// ============================================================

export const COLUNAS_ORCAMENTO = [
  { status: 'entrada',              titulo: 'Entrada',                  admin: true, cor: 'border-slate-500/40',   badge: 'bg-slate-500/15 text-slate-300' },
  { status: 'divergencia_entrada',  titulo: 'Divergência de entrada',   admin: true, cor: 'border-rose-500/40',    badge: 'bg-rose-500/15 text-rose-300' },
  { status: 'liberado_orcar',       titulo: 'Liberado p/ Orçar',        admin: true, cor: 'border-sky-500/40',     badge: 'bg-sky-500/15 text-sky-300' },
  { status: 'orcando',              titulo: 'Orçando',                  admin: true, cor: 'border-indigo-500/40',  badge: 'bg-indigo-500/15 text-indigo-300' },
  { status: 'solicitacao',          titulo: 'Requisitar Peças',                      cor: 'border-blue-500/40',    badge: 'bg-blue-500/15 text-blue-400' },
  { status: 'separando',            titulo: 'Em Separação',                          cor: 'border-amber-500/40',   badge: 'bg-amber-500/15 text-amber-400' },
  { status: 'separado',             titulo: 'Separado',                              cor: 'border-purple-500/40',  badge: 'bg-purple-500/15 text-purple-400' },
  { status: 'envio_orcamento',      titulo: 'Envio de orçamento',       admin: true, cor: 'border-teal-500/40',    badge: 'bg-teal-500/15 text-teal-300' },
  { status: 'aguardando_aprovacao', titulo: 'Aguardando aprovação',     admin: true, cor: 'border-yellow-500/40',  badge: 'bg-yellow-500/15 text-yellow-300' },
  { status: 'aprovado_recusado',    titulo: 'Aprovado/Recusado',                     cor: 'border-cyan-500/40',    badge: 'bg-cyan-500/15 text-cyan-400' },
  { status: 'em_manutencao',        titulo: 'Em manutenção',            admin: true, cor: 'border-orange-500/40',  badge: 'bg-orange-500/15 text-orange-300' },
  { status: 'nao_liberado',         titulo: 'Concluído - Não Liberado', admin: true, cor: 'border-red-500/40',     badge: 'bg-red-500/15 text-red-300' },
  { status: 'liberado_saida',       titulo: 'Liberado para Saída',      admin: true, cor: 'border-lime-500/40',    badge: 'bg-lime-500/15 text-lime-300' },
  { status: 'finalizado',           titulo: 'Expedição',                             cor: 'border-green-500/40',   badge: 'bg-green-500/15 text-green-400', arquivada: true },
  { status: 'sucata',               titulo: 'Sucata',                   admin: true, cor: 'border-zinc-500/40',    badge: 'bg-zinc-500/15 text-zinc-300', arquivada: true },
];

export const NOME_STATUS_ORCAMENTO = {
  ...Object.fromEntries(COLUNAS_ORCAMENTO.map(c => [c.status, c.titulo])),
  cancelado: 'Cancelado',
};

export const COR_STATUS_ORCAMENTO = {
  ...Object.fromEntries(COLUNAS_ORCAMENTO.map(c => [c.status, c.badge])),
  cancelado: 'bg-red-500/15 text-red-400',
};

export const STATUS_SO_ADMIN = COLUNAS_ORCAMENTO.filter(c => c.admin).map(c => c.status);
