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
export function rascunhoDeEtapas(etapas) {
  const colunas = [];
  const campos = [];
  etapas.forEach((e, i) => {
    const chave = novaChave();
    colunas.push({ chave_temp: chave, nome: e.nome, cor: e.cor || CORES_COLUNA[i % CORES_COLUNA.length], so_admin: !!e.so_admin });
    for (const b of e.blocos || []) {
      for (const c of BLOCO[b]?.campos || []) {
        campos.push({ uid: novoUid(), coluna: chave, tipo: c.tipo, rotulo: c.rotulo, descricao: '', obrigatorio: (e.obrigatorios || []).includes(b),
          opcoes: c.opcoes || (c.tipo === 'checkbox' ? ['Sim'] : []), lista: c.lista || null, cores: null, visivel: null, condicao: null });
      }
    }
  });
  return { colunas, campos };
}

// Tipos de processo (o Assistente e os modelos prontos usam os mesmos)
export const MODELOS = [
  {
    chave: 'assistencia', nome: 'Assistência técnica', icone: 'Wrench', resumo: 'Entrada → Diagnóstico → Orçamento → Reparo → Concluído',
    etapas: [
      { nome: 'Entrada', blocos: ['cliente_doc', 'cliente_nome', 'telefone', 'ns', 'modelo', 'serie', 'fotos', 'defeito'], obrigatorios: ['cliente_nome', 'ns', 'modelo'] },
      { nome: 'Diagnóstico', blocos: ['tecnico', 'diagnostico'], obrigatorios: ['tecnico', 'diagnostico'] },
      { nome: 'Orçamento', blocos: ['pecas', 'valor', 'aprovacao'], obrigatorios: ['valor', 'aprovacao'] },
      { nome: 'Em reparo', blocos: ['fotos', 'obs'] },
      { nome: 'Concluído', blocos: ['nf', 'envio', 'rastreio'], so_admin: true },
    ],
  },
  {
    chave: 'garantia', nome: 'Garantia / troca', icone: 'ShieldCheck', resumo: 'Entrada → Análise → Decisão → Devolvido',
    etapas: [
      { nome: 'Entrada', blocos: ['cliente_doc', 'cliente_nome', 'ns', 'modelo', 'fotos', 'defeito'], obrigatorios: ['cliente_nome', 'ns'] },
      { nome: 'Análise', blocos: ['tecnico', 'diagnostico'], obrigatorios: ['diagnostico'] },
      { nome: 'Decisão', blocos: ['aprovacao', 'obs'], obrigatorios: ['aprovacao'] },
      { nome: 'Devolvido ao cliente', blocos: ['nf', 'envio', 'rastreio'], so_admin: true },
    ],
  },
  {
    chave: 'pedido', nome: 'Pedido de venda', icone: 'ShoppingCart', resumo: 'Entrada → Separação → Faturado → Enviado',
    etapas: [
      { nome: 'Entrada', blocos: ['cliente_doc', 'cliente_nome', 'telefone', 'valor', 'obs'], obrigatorios: ['cliente_nome'] },
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
    chave: 'notas', nome: 'Notas e faturamento', icone: 'ReceiptText', resumo: 'Solicitado → Emitida → Enviada',
    etapas: [
      { nome: 'Solicitado', blocos: ['cliente_doc', 'cliente_nome', 'valor', 'obs'], obrigatorios: ['cliente_nome', 'valor'] },
      { nome: 'Emitida', blocos: ['nf'], obrigatorios: ['nf'] },
      { nome: 'Enviada ao cliente', blocos: ['obs'], so_admin: true },
    ],
  },
  {
    chave: 'compras', nome: 'Compras', icone: 'Package', resumo: 'Solicitação → Cotação → Aprovação → Recebido',
    etapas: [
      { nome: 'Solicitação', blocos: ['pecas', 'obs'], obrigatorios: ['pecas'] },
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
