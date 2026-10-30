// ============================================================
// utils/fasesOrcamento.js — Colunas da tela de Orçamentos
// ============================================================
// Mesmas fases do pipe "Orçamento BOXER SOLDAS" no Pipefy, na mesma ordem,
// com "Em Separação" e "Separado" (etapas do Zen) logo depois de
// "Requisitar Peças". admin: true = coluna nova, só o admin move cards.
// faseId = id da fase no Pipefy (os campos de cada coluna são os da fase).
// Manter igual a NOME_STATUS / STATUS_ADMIN em
// backend/src/controllers/pedidosOrcamentoController.js
// ============================================================

export const COLUNAS_ORCAMENTO = [
  { faseId: '309113139', status: 'entrada',              titulo: 'Entrada',                  admin: true, cor: 'border-slate-500/40',   badge: 'bg-slate-500/15 text-slate-300' },
  { faseId: '321786152', status: 'divergencia_entrada',  titulo: 'Divergência de entrada',   admin: true, cor: 'border-rose-500/40',    badge: 'bg-rose-500/15 text-rose-300' },
  { faseId: '309251963', status: 'liberado_orcar',       titulo: 'Liberado p/ Orçar',        admin: true, cor: 'border-sky-500/40',     badge: 'bg-sky-500/15 text-sky-300' },
  { faseId: '309113140', status: 'orcando',              titulo: 'Orçando',                  admin: true, cor: 'border-indigo-500/40',  badge: 'bg-indigo-500/15 text-indigo-300' },
  { faseId: '344449850', status: 'solicitacao',          titulo: 'Requisitar Peças',                      cor: 'border-blue-500/40',    badge: 'bg-blue-500/15 text-blue-400' },
  { status: 'separando',            titulo: 'Em Separação',                          cor: 'border-amber-500/40',   badge: 'bg-amber-500/15 text-amber-400' },
  { status: 'separado',             titulo: 'Separado',                              cor: 'border-purple-500/40',  badge: 'bg-purple-500/15 text-purple-400' },
  { faseId: '309113141', status: 'envio_orcamento',      titulo: 'Envio de orçamento',       admin: true, cor: 'border-teal-500/40',    badge: 'bg-teal-500/15 text-teal-300' },
  { faseId: '312761688', status: 'aguardando_aprovacao', titulo: 'Aguardando aprovação',     admin: true, cor: 'border-yellow-500/40',  badge: 'bg-yellow-500/15 text-yellow-300' },
  { faseId: '309113142', status: 'aprovado_recusado',    titulo: 'Aprovado/Recusado',                     cor: 'border-cyan-500/40',    badge: 'bg-cyan-500/15 text-cyan-400' },
  { faseId: '309252064', status: 'em_manutencao',        titulo: 'Em manutenção',            admin: true, cor: 'border-orange-500/40',  badge: 'bg-orange-500/15 text-orange-300' },
  { faseId: '309113144', status: 'nao_liberado',         titulo: 'Concluído - Não Liberado', admin: true, cor: 'border-red-500/40',     badge: 'bg-red-500/15 text-red-300' },
  { faseId: '309713436', status: 'liberado_saida',       titulo: 'Liberado para Saída',      admin: true, cor: 'border-lime-500/40',    badge: 'bg-lime-500/15 text-lime-300' },
  { faseId: '309113145', status: 'finalizado',           titulo: 'Expedição',                             cor: 'border-green-500/40',   badge: 'bg-green-500/15 text-green-400', arquivada: true },
  { faseId: '310056658', status: 'sucata',               titulo: 'Sucata',                   admin: true, cor: 'border-zinc-500/40',    badge: 'bg-zinc-500/15 text-zinc-300', arquivada: true },
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

// ── Configuração do admin (Configurações da tela de Orçamentos) ──
// Troca o conteúdo das listas acima pelas colunas configuradas (nome, cor,
// ordem, colunas novas). As listas são alteradas no lugar, para todas as
// telas que as importam verem a mesma configuração.
export function aplicarConfigColunas(colunasCfg) {
  if (!Array.isArray(colunasCfg) || !colunasCfg.length) return;
  const padrao = new Map(COLUNAS_ORCAMENTO.map(c => [c.status, c]));
  const novas = colunasCfg.map(c => ({
    ...(padrao.get(c.chave) || {}),
    status: c.chave, titulo: c.nome, admin: !!c.so_admin, arquivada: !!c.arquivada,
    faseId: c.fase_pipefy || padrao.get(c.chave)?.faseId, hex: c.cor, sistema: !!c.sistema, zen: c.zen || null,
  }));
  COLUNAS_ORCAMENTO.splice(0, COLUNAS_ORCAMENTO.length, ...novas);
  for (const c of novas) NOME_STATUS_ORCAMENTO[c.status] = c.titulo;
  STATUS_SO_ADMIN.splice(0, STATUS_SO_ADMIN.length, ...novas.filter(c => c.admin).map(c => c.status));
}

// Campos configurados pelo admin (orc_campos), lidos junto com as colunas
export const CONFIG_ORCAMENTO = { campos: [], carregada: false };
export function aplicarConfigOrcamento(cfg) {
  if (!cfg) return;
  aplicarConfigColunas(cfg.colunas);
  CONFIG_ORCAMENTO.campos = Array.isArray(cfg.campos) ? cfg.campos : [];
  CONFIG_ORCAMENTO.carregada = true;
}
