// ============================================================
// utils/modulos.js — Armazém (WMS) e Frotas na tela inicial
// ============================================================
// Etapa 1 da união: os dois sistemas continuam rodando onde estão; o Início
// do Boxer Operações só abre cada um (em outra aba). Bloco sem endereço não aparece.
// Endereços: os de baixo, ou as variáveis do projeto na Vercel (VITE_WMS_URL, VITE_COLETOR_URL, VITE_FROTAS_URL).
// ============================================================
const limpo = (u) => String(u || '').trim().replace(/\/+$/, '');
export const ENDERECOS = {
  wms: limpo(import.meta.env.VITE_WMS_URL),
  coletor: limpo(import.meta.env.VITE_COLETOR_URL || 'https://boxer-wms-coletor.vercel.app'),
  frotas: limpo(import.meta.env.VITE_FROTAS_URL || 'https://boxer-frotas.vercel.app'),
};
// O painel e o coletor do WMS usam endereço com "#" (ex.: /#/pedidos); o Frotas, endereço normal
const COM_CERQUILHA = new Set(['wms', 'coletor']);
export const enderecoDe = (item) => {
  const base = ENDERECOS[item.base];
  if (!base) return null;
  if (item.caminho === '/') return `${base}/`;
  return COM_CERQUILHA.has(item.base) ? `${base}/#${item.caminho}` : `${base}${item.caminho}`;
};

// tela = chave em utils/telas.js (quem pode abrir); base = qual endereço; caminho = página dentro dele
export const MODULOS = [
  {
    chave: 'wms', nome: 'Armazém (WMS)', resumo: 'recebimento, endereços, separação, embarque',
    itens: [
      { chave: 'wms_painel', base: 'wms', caminho: '/', nome: 'Painel do armazém', desc: 'Visão geral', icone: 'painel' },
      { chave: 'wms_pedidos', base: 'wms', caminho: '/pedidos', nome: 'Pedidos', desc: 'Fila de separação', icone: 'pedidos' },
      { chave: 'wms_reposicao', base: 'wms', caminho: '/reposicao-kanban', nome: 'Reposição', desc: 'Picking e pulmão', icone: 'reposicao' },
      { chave: 'wms_historico', base: 'wms', caminho: '/historico', nome: 'Histórico (jornada)', desc: 'Serial e pedido', icone: 'historico' },
      { chave: 'wms_separacao', base: 'coletor', caminho: '/separacao-erp', nome: 'Separação', desc: 'No coletor', icone: 'separacao' },
      { chave: 'wms_conferencia', base: 'coletor', caminho: '/conferencia-erp', nome: 'Conferência e embarque', desc: 'No coletor', icone: 'conferencia' },
      { chave: 'wms_coletor', base: 'coletor', caminho: '/', nome: 'Coletor', desc: 'Abrir no celular', icone: 'coletor' },
    ],
  },
  {
    chave: 'frotas', nome: 'Frotas', resumo: 'veículos, viagens, checklist, custos',
    itens: [
      { chave: 'frotas_painel', base: 'frotas', caminho: '/', nome: 'Painel da frota', desc: 'Visão geral', icone: 'painel' },
      { chave: 'frotas_agenda', base: 'frotas', caminho: '/agenda', nome: 'Agenda da frota', desc: 'Reservas e saídas', icone: 'agenda' },
      { chave: 'frotas_viagens', base: 'frotas', caminho: '/viagens', nome: 'Viagens', desc: 'Em andamento e feitas', icone: 'viagens' },
      { chave: 'frotas_operacoes', base: 'frotas', caminho: '/operacoes', nome: 'Centro de operações', desc: 'Frota em tempo real', icone: 'operacoes' },
      { chave: 'frotas_veiculos', base: 'frotas', caminho: '/veiculos', nome: 'Veículos', desc: 'Cadastro e situação', icone: 'frotas' },
      { chave: 'frotas_motoristas', base: 'frotas', caminho: '/motoristas', nome: 'Motoristas', desc: 'Cadastro de motoristas', icone: 'motoristas' },
      { chave: 'frotas_combustivel', base: 'frotas', caminho: '/combustivel', nome: 'Combustível', desc: 'Abastecimentos', icone: 'combustivel' },
      { chave: 'frotas_custo', base: 'frotas', caminho: '/custo-viagem', nome: 'Custo de viagem', desc: 'Frota × transportadora', icone: 'custo' },
      { chave: 'frotas_manutencao', base: 'frotas', caminho: '/manutencao', nome: 'Manutenção', desc: 'Revisões e consertos', icone: 'manutencao' },
      { chave: 'frotas_documentos', base: 'frotas', caminho: '/documentos', nome: 'Documentos', desc: 'Licenciamento e seguros', icone: 'documentos' },
      { chave: 'frotas_checklist', base: 'frotas', caminho: '/checklist', nome: 'Checklist', desc: 'Conferência do veículo', icone: 'checklist' },
      { chave: 'frotas_relatorios', base: 'frotas', caminho: '/relatorios', nome: 'Relatórios', desc: 'Relatórios da frota', icone: 'relatorios' },
      { chave: 'frotas_usuarios', base: 'frotas', caminho: '/usuarios', nome: 'Usuários da frota', desc: 'Acessos do Frotas', icone: 'usuarios' },
      { chave: 'frotas_configuracoes', base: 'frotas', caminho: '/configuracoes', nome: 'Configurações', desc: 'Ajustes do Frotas', icone: 'configuracoes' },
    ],
  },
];

// Abre o WMS / coletor / Frotas em outra aba JÁ LOGADO (login único): pede um código de uso único ao servidor
// e manda junto no endereço (?sso= para o WMS, ?sso_th= para o Frotas). Se não der, abre normal (tela de login deles).
export async function abrirComLogin(item, url) {
  const janela = window.open('', '_blank');
  if (!janela) { window.location.href = url; return; }
  let destino = url;
  try {
    const { default: api } = await import('../services/api');
    const { data } = await api.post('/sso/codigo', { destino: item.base }, { timeout: 15000 });
    const u = new URL(url);
    if (data?.codigo) u.searchParams.set('sso', data.codigo);
    if (data?.token_hash) u.searchParams.set('sso_th', data.token_hash);
    destino = u.toString();
  } catch { /* abre sem login único */ }
  janela.location.href = destino;
}
