// ============================================================
// utils/modelosTela.js — Modelos prontos e "blocos" do Construtor de telas (beta)
// ============================================================
// Um modelo é um rascunho pronto: colunas (com chave_temp) e campos (com uid).
// O Assistente monta o mesmo formato a partir das respostas (sem IA).
// ============================================================
let seq = 0;
export const novoUid = () => `n_${Date.now().toString(36)}_${++seq}`;
export const novaChave = () => `t_${Date.now().toString(36)}_${++seq}`;

export const CORES_COLUNA = ['#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#f97316', '#ef4444', '#a855f7', '#6366f1', '#64748b'];

// Blocos de informação (o Assistente oferece estes; cada um vira um ou mais campos)
export const BLOCOS = [
  { chave: 'cliente_doc', nome: 'CPF / CNPJ do cliente', campos: [{ tipo: 'documento', rotulo: 'CPF / CNPJ' }] },
  { chave: 'cliente_nome', nome: 'Nome do cliente', campos: [{ tipo: 'texto', rotulo: 'Cliente' }] },
  { chave: 'telefone', nome: 'Telefone de contato', campos: [{ tipo: 'telefone', rotulo: 'Telefone' }] },
  { chave: 'ns', nome: 'NS de entrada', campos: [{ tipo: 'numero', rotulo: 'NS de entrada' }] },
  { chave: 'modelo', nome: 'Modelo da máquina', campos: [{ tipo: 'conexao', rotulo: 'Modelo da máquina', lista: 'Modelos de máquina' }] },
  { chave: 'serie', nome: 'Nº de série', campos: [{ tipo: 'texto', rotulo: 'Nº de série' }] },
  { chave: 'fotos', nome: 'Fotos', campos: [{ tipo: 'anexo', rotulo: 'Fotos' }] },
  { chave: 'tecnico', nome: 'Técnico / responsável', campos: [{ tipo: 'responsavel', rotulo: 'Responsável' }] },
  { chave: 'defeito', nome: 'Defeito relatado', campos: [{ tipo: 'longo', rotulo: 'Defeito relatado' }] },
  { chave: 'diagnostico', nome: 'Diagnóstico', campos: [{ tipo: 'longo', rotulo: 'Diagnóstico' }] },
  { chave: 'pecas', nome: 'Peças usadas', campos: [{ tipo: 'longo', rotulo: 'Peças usadas' }] },
  { chave: 'valor', nome: 'Valor', campos: [{ tipo: 'moeda', rotulo: 'Valor' }] },
  { chave: 'aprovacao', nome: 'Aprovação', campos: [{ tipo: 'unica', rotulo: 'Aprovação', opcoes: ['Aprovado', 'Recusado'] }] },
  { chave: 'prazo', nome: 'Prazo', campos: [{ tipo: 'vencimento', rotulo: 'Prazo' }] },
  { chave: 'nf', nome: 'Nº da NF', campos: [{ tipo: 'numero', rotulo: 'Nº da NF' }] },
  { chave: 'envio', nome: 'Forma de envio', campos: [{ tipo: 'lista', rotulo: 'Forma de envio', opcoes: ['Retirada', 'Sedex', 'PAC', 'Transportadora'] }] },
  { chave: 'rastreio', nome: 'Código de rastreio', campos: [{ tipo: 'texto', rotulo: 'Código de rastreio' }] },
  { chave: 'obs', nome: 'Observações', campos: [{ tipo: 'longo', rotulo: 'Observações' }] },
];
export const BLOCO = Object.fromEntries(BLOCOS.map(b => [b.chave, b]));

// Monta um rascunho a partir de etapas: [{ nome, cor, so_admin, blocos: [chave], obrigatorios: [chave] }]
// inicio = formulário do botão "Novo card" ({ blocos, obrigatorios }): é a primeira parte de tudo
const campoDoBloco = (coluna, c, obrig) => ({ uid: novoUid(), coluna, tipo: c.tipo, rotulo: c.rotulo, descricao: '', obrigatorio: obrig,
  opcoes: c.opcoes || (c.tipo === 'checkbox' ? ['Sim'] : []), lista: c.lista || null, cores: null, visivel: null, condicao: null });
export function rascunhoDeEtapas(etapas, inicio = null) {
  const colunas = [];
  const campos = [];
  for (const b of inicio?.blocos || []) for (const c of BLOCO[b]?.campos || []) campos.push(campoDoBloco('inicio', c, (inicio.obrigatorios || []).includes(b)));
  etapas.forEach((e, i) => {
    const chave = novaChave();
    colunas.push({ chave_temp: chave, nome: e.nome, cor: e.cor || CORES_COLUNA[i % CORES_COLUNA.length], so_admin: !!e.so_admin });
    for (const b of e.blocos || []) {
      for (const c of BLOCO[b]?.campos || []) campos.push(campoDoBloco(chave, c, (e.obrigatorios || []).includes(b)));
    }
  });
  return { colunas, campos };
}

// Tipos de processo (o Assistente e os modelos prontos usam os mesmos)
export const MODELOS = [
  {
    chave: 'assistencia', nome: 'Assistência técnica', icone: 'Wrench', resumo: 'Novo card → Entrada → Diagnóstico → Orçamento → Reparo → Concluído',
    inicio: { blocos: ['cliente_doc', 'cliente_nome', 'telefone', 'defeito'], obrigatorios: ['cliente_nome', 'telefone'] },
    etapas: [
      { nome: 'Entrada', blocos: ['ns', 'modelo', 'serie', 'fotos'], obrigatorios: ['ns', 'modelo'] },
      { nome: 'Diagnóstico', blocos: ['tecnico', 'diagnostico'], obrigatorios: ['tecnico', 'diagnostico'] },
      { nome: 'Orçamento', blocos: ['pecas', 'valor', 'aprovacao'], obrigatorios: ['valor', 'aprovacao'] },
      { nome: 'Em reparo', blocos: ['fotos', 'obs'] },
      { nome: 'Concluído', blocos: ['nf', 'envio', 'rastreio'], so_admin: true },
    ],
  },
  {
    chave: 'garantia', nome: 'Garantia / troca', icone: 'ShieldCheck', resumo: 'Novo card → Entrada → Análise → Decisão → Devolvido',
    inicio: { blocos: ['cliente_doc', 'cliente_nome', 'telefone', 'defeito'], obrigatorios: ['cliente_nome'] },
    etapas: [
      { nome: 'Entrada', blocos: ['ns', 'modelo', 'fotos'], obrigatorios: ['ns'] },
      { nome: 'Análise', blocos: ['tecnico', 'diagnostico'], obrigatorios: ['diagnostico'] },
      { nome: 'Decisão', blocos: ['aprovacao', 'obs'], obrigatorios: ['aprovacao'] },
      { nome: 'Devolvido ao cliente', blocos: ['nf', 'envio', 'rastreio'], so_admin: true },
    ],
  },
  {
    chave: 'pedido', nome: 'Pedido de venda', icone: 'ShoppingCart', resumo: 'Novo card → Entrada → Separação → Faturado → Enviado',
    inicio: { blocos: ['cliente_doc', 'cliente_nome', 'telefone'], obrigatorios: ['cliente_nome'] },
    etapas: [
      { nome: 'Entrada', blocos: ['valor', 'obs'] },
      { nome: 'Separação', blocos: ['tecnico', 'fotos'] },
      { nome: 'Faturado', blocos: ['nf'], obrigatorios: ['nf'] },
      { nome: 'Enviado', blocos: ['envio', 'rastreio'], so_admin: true },
    ],
  },
  {
    chave: 'logistica', nome: 'Logística / envio', icone: 'Truck', resumo: 'Aguardando → Postado → Entregue',
    etapas: [
      { nome: 'Aguardando envio', blocos: ['cliente_nome', 'nf', 'envio'], obrigatorios: ['cliente_nome', 'envio'] },
      { nome: 'Postado', blocos: ['rastreio', 'prazo'], obrigatorios: ['rastreio'] },
      { nome: 'Entregue', blocos: ['obs'], so_admin: true },
    ],
  },
  {
    chave: 'notas', nome: 'Notas e faturamento', icone: 'ReceiptText', resumo: 'Novo card → Solicitado → Emitida → Enviada',
    inicio: { blocos: ['cliente_doc', 'cliente_nome', 'valor'], obrigatorios: ['cliente_nome', 'valor'] },
    etapas: [
      { nome: 'Solicitado', blocos: ['obs'] },
      { nome: 'Emitida', blocos: ['nf'], obrigatorios: ['nf'] },
      { nome: 'Enviada ao cliente', blocos: ['obs'], so_admin: true },
    ],
  },
  {
    chave: 'compras', nome: 'Compras', icone: 'Package', resumo: 'Novo card → Solicitação → Cotação → Aprovação → Recebido',
    inicio: { blocos: ['pecas', 'obs'], obrigatorios: ['pecas'] },
    etapas: [
      { nome: 'Solicitação', blocos: [] },
      { nome: 'Cotação', blocos: ['valor', 'prazo'], obrigatorios: ['valor'] },
      { nome: 'Aprovação', blocos: ['aprovacao'], obrigatorios: ['aprovacao'], so_admin: true },
      { nome: 'Recebido', blocos: ['nf', 'fotos'] },
    ],
  },
  {
    chave: 'inspecao', nome: 'Inspeção de recebimento', icone: 'ClipboardCheck', resumo: 'Chegou → Conferência → Liberado',
    etapas: [
      { nome: 'Chegou', blocos: ['nf', 'fotos'], obrigatorios: ['nf'] },
      { nome: 'Conferência', blocos: ['tecnico', 'obs', 'aprovacao'], obrigatorios: ['aprovacao'] },
      { nome: 'Liberado', blocos: [], so_admin: true },
    ],
  },
];
export const MODELO = Object.fromEntries(MODELOS.map(m => [m.chave, m]));
