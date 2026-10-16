// ============================================================
// integrations/pipefyLojinha.js — cards da Lojinha Boxer no Pipefy
// ============================================================
// Pipe "Peças p/ Envio". Para cada card do pedido (máx. 7 itens por card):
//   1. Cria o card (formulário inicial): Cliente (tabela Cadastro, achado
//      pelo CPF/CNPJ ou criado), Data de entrada, Estado, Envio de
//      "Venda de Peça" e Responsável (tabela Funcionários, pelo nome de quem registrou)
//   2. Entrada: Solicitação recebida, Nº Pedido Lojinha, Tipo de Envio e
//      Observação (itens do card e envio)        -> move para Liberação
//   3. Liberação: Nº Ordem de Separação (Zen) e Quantidade total de card
//                                                 -> move para Separação
// Pode ser repetido: cada card segue da fase em que está.
// ============================================================
import { pipefyQuery } from './pipefyService.js';

const CFG = {
  pipe:            process.env.PIPEFY_LOJINHA_PIPE_ID || '301502578',   // Peças p/ Envio
  tabelaClientes:  process.env.PIPEFY_LOJINHA_TABELA_CLIENTES || 'RyuwsC0P',     // Cadastro
  tabelaFuncs:     process.env.PIPEFY_LOJINHA_TABELA_FUNCIONARIOS || 'A-DBx2PY', // Funcionários
  faseEntrada:     '309953163',
  faseLiberacao:   '310139435',
  faseSeparacao:   '310137100',
  // formulário inicial
  campoCliente:    'conex_o_de_database_t_tulo',
  campoData:       'data_de_entrada',
  campoEstado:     'select_t_tulo',
  campoEnvioDe:    'tipo_de_entrada',
  campoResponsavel:'respons_vel_pelo_caso',
  envioDe:         'Venda de Peça',
  // Entrada
  campoRecebida:   'solicita_o_recebida',
  campoPedidoLoja: 'n_pedido_lojinha',
  campoTipoEnvio:  'tipo_de_envio',
  campoObs:        'observa_o',
  // Liberação
  campoOsZen:      'n_ordem_de_separa_o_zen',
  campoQtdCards:   'quantidade_total_de_card',
};
export const ITENS_POR_CARD = 7;

const ESTADOS = ['AC - Acre', 'AL - Alagoas', 'AP - Amapá', 'AM - Amazonas', 'BA - Bahia', 'CE - Ceará',
  'DF - Distrito Federal', 'ES - Espírito Santo', 'GO - Goiás', 'MA - Maranhão', 'MT - Mato Grosso',
  'MS - Mato Grosso do Sul', 'MG - Minas Gerais', 'PA - Pará', 'PB - Paraíba', 'PR - Paraná', 'PE - Pernambuco',
  'PI - Piauí', 'RJ - Rio de Janeiro', 'RN - Rio Grande do Norte', 'RS - Rio Grande do Sul', 'RO - Rondônia',
  'RR - Roraima', 'SC - Santa Catarina', 'SP - São Paulo', 'SE - Sergipe', 'TO - Tocantins'];
const estadoPipefy = (uf) => ESTADOS.find(e => e.startsWith(`${String(uf || '').toUpperCase()} -`)) || null;

const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function mascarar(doc) {
  const d = soDigitos(doc);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}

// Lê todos os registros de uma tabela (com os campos), paginando
async function registrosDaTabela(tableId, limite = 3000) {
  const gql = `query($id: ID!, $after: String) { table_records(table_id: $id, first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges { node { id title record_fields { value field { id } } } } } }`;
  const lista = [];
  let after = null;
  while (lista.length < limite) {
    const r = await pipefyQuery(gql, { id: tableId, after });
    const conn = r?.table_records;
    if (!conn) break;
    for (const { node } of conn.edges) {
      const campos = {};
      for (const f of node.record_fields || []) campos[f.field?.id] = f.value;
      lista.push({ id: String(node.id), titulo: node.title, campos });
    }
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return lista;
}

// Cliente na tabela "Cadastro" pelo CPF/CNPJ (findRecords; se falhar, varre a tabela).
// O campo é numérico: zeros à esquerda podem ter sido perdidos.
async function acharCliente(documento) {
  const d = soDigitos(documento);
  const semZeros = d.replace(/^0+/, '');
  for (const valor of [...new Set([d, semZeros, mascarar(d)])]) {
    try {
      const r = await pipefyQuery(
        `{ findRecords(tableId: ${JSON.stringify(CFG.tabelaClientes)}, first: 5, search: { fieldId: "cpf_cnpj", fieldValue: ${JSON.stringify(valor)} }) {
           edges { node { id } } } }`, {});
      const id = r?.findRecords?.edges?.[0]?.node?.id;
      if (id) return String(id);
    } catch (e) { console.error('[Lojinha] findRecords:', e.message); }
  }
  const todos = await registrosDaTabela(CFG.tabelaClientes, 20000);
  return todos.find(x => soDigitos(x.campos.cpf_cnpj).replace(/^0+/, '') === semZeros)?.id || null;
}

async function criarCliente({ documento, nome, uf }) {
  const d = soDigitos(documento);
  const campos = [
    { field_id: 'nome_raz_o_social', field_value: nome },
    { field_id: 'cpf_cnpj', field_value: d },
    { field_id: 'pessoa', field_value: [d.length === 14 ? 'Juridica' : 'Fisica'] },
    { field_id: 'data_de_cadastro', field_value: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) },
  ];
  const est = estadoPipefy(uf);
  if (est) campos.push({ field_id: 'estado', field_value: est });
  const r = await pipefyQuery(
    `mutation($i: CreateTableRecordInput!) { createTableRecord(input: $i) { table_record { id } } }`,
    { i: { table_id: CFG.tabelaClientes, title: nome, fields_attributes: campos } });
  const id = r?.createTableRecord?.table_record?.id;
  if (!id) throw new Error('Não consegui cadastrar o cliente na tabela Cadastro do Pipefy.');
  return String(id);
}

// Funcionário do Pipefy (tabela Funcionários) pelo NOME de quem registrou:
// nome completo igual -> primeiro + último nome -> primeiro nome (se único)
async function acharFuncionario({ nome }) {
  const n = norm(nome);
  if (!n) return null;
  const lista = await registrosDaTabela(CFG.tabelaFuncs, 500);
  const nomesDe = (f) => [f.titulo, f.campos.nome, f.campos.nome_resumido].map(norm).filter(Boolean);
  const exato = lista.find(f => nomesDe(f).includes(n));
  if (exato) return exato.id;
  const partes = n.split(' ');
  const pu = `${partes[0]} ${partes[partes.length - 1]}`;
  const primUlt = lista.filter(f => nomesDe(f).some(v => { const x = v.split(' '); return `${x[0]} ${x[x.length - 1]}` === pu; }));
  if (primUlt.length === 1) return primUlt[0].id;
  const primeiro = lista.filter(f => nomesDe(f).some(v => v.split(' ')[0] === partes[0]));
  return primeiro.length === 1 ? primeiro[0].id : null;
}

async function faseDoCard(cardId) {
  const r = await pipefyQuery(`query($id: ID!) { card(id: $id) { id url current_phase { id name } } }`, { id: String(cardId) });
  return r?.card || null;
}
// Fase atual de vários cards de uma vez (para acompanhar o pipe)
export async function fasesDosCards(ids) {
  const mapa = {};
  const lista = [...new Set(ids.map(String).filter(x => /^\d+$/.test(x)))];
  for (let i = 0; i < lista.length; i += 30) {
    const parte = lista.slice(i, i + 30);
    const gql = `{ ${parte.map((id, k) => `c${k}: card(id: ${id}) { id current_phase { id name } }`).join(' ')} }`;
    let r = null;
    try { r = await pipefyQuery(gql, {}); } catch { continue; }
    parte.forEach((id, k) => { const c = r?.[`c${k}`]; if (c?.current_phase) mapa[id] = { faseId: String(c.current_phase.id), fase: c.current_phase.name }; });
  }
  return mapa;
}

async function preencher(cardId, campo, valor) {
  await pipefyQuery(`mutation($i: UpdateCardFieldInput!) { updateCardField(input: $i) { success } }`,
    { i: { card_id: String(cardId), field_id: campo, new_value: valor } });
}
async function mover(cardId, faseId) {
  const r = await pipefyQuery(
    `mutation($i: MoveCardToPhaseInput!) { moveCardToPhase(input: $i) { card { id current_phase { id name } } } }`,
    { i: { card_id: String(cardId), destination_phase_id: faseId } });
  return r?.moveCardToPhase?.card?.current_phase || null;
}

const dataISO = (d) => String(d instanceof Date ? d.toISOString() : d).slice(0, 10);

/**
 * Cria/completa os cards do pedido e leva todos até Separação.
 * @param pedido   linha de lojinha_boxer_pedidos (com zen_ordem_separacao_id)
 * @param usuario  { nome, email } de quem registrou o pedido (responsável)
 * @param progresso cards já criados [{ id, url, fase }]
 * @param salvar   callback(cards) chamado a cada card criado/movido
 * @returns { cards, avisos }
 */
export async function criarCardsLojinha(pedido, usuario, progresso = [], salvar = async () => {}) {
  if (!pedido.zen_ordem_separacao_id) throw new Error('Pedido sem ordem de separação no Zen.');
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const qtd = Math.max(1, Math.ceil(itens.length / ITENS_POR_CARD));
  const cards = Array.from({ length: qtd }, (_, i) => ({ ...(progresso[i] || {}) }));
  const avisos = [];

  // Dados comuns (só se precisar criar algum card)
  let comum = null;
  async function dadosComuns() {
    if (comum) return comum;
    let clienteId = await acharCliente(pedido.documento);
    if (!clienteId) {
      try {
        clienteId = await criarCliente({ documento: pedido.documento, nome: pedido.cliente_nome, uf: pedido.cliente_uf });
        avisos.push('Cliente cadastrado na tabela Cadastro do Pipefy.');
      } catch (e) {
        // Já existe (CPF/CNPJ único) mas a busca não achou: tenta de novo
        clienteId = /único|unique/i.test(e.message) ? await acharCliente(pedido.documento) : null;
        if (!clienteId) throw e;
      }
    }
    let responsavelId = null;
    try { responsavelId = await acharFuncionario({ nome: usuario?.nome }); } catch { /* segue sem */ }
    if (!responsavelId) avisos.push(`Não achei ${usuario?.nome || 'o usuário'} na tabela Funcionários do Pipefy — card sem responsável.`);
    comum = { clienteId, responsavelId };
    return comum;
  }

  const tipoEnvio = ['Sedex', 'PAC'].includes(pedido.tipo_envio) ? pedido.tipo_envio : null;
  const envioTxt = `${pedido.tipo_envio}${pedido.transportadora ? ` - ${pedido.transportadora}` : ''}`;

  for (let i = 0; i < qtd; i++) {
    const grupo = itens.slice(i * ITENS_POR_CARD, (i + 1) * ITENS_POR_CARD);
    const c = cards[i];

    // 1. Cria o card
    if (!c.id) {
      const { clienteId, responsavelId } = await dadosComuns();
      const campos = [
        { field_id: CFG.campoCliente, field_value: [clienteId] },
        { field_id: CFG.campoData, field_value: dataISO(pedido.data) },
        { field_id: CFG.campoEnvioDe, field_value: CFG.envioDe },
      ];
      const est = estadoPipefy(pedido.cliente_uf);
      if (est) campos.push({ field_id: CFG.campoEstado, field_value: est });
      if (responsavelId) campos.push({ field_id: CFG.campoResponsavel, field_value: [responsavelId] });
      const r = await pipefyQuery(
        `mutation($i: CreateCardInput!) { createCard(input: $i) { card { id url } } }`,
        { i: { pipe_id: CFG.pipe, fields_attributes: campos } });
      const novo = r?.createCard?.card;
      if (!novo?.id) throw new Error('O Pipefy não devolveu o card criado.');
      Object.assign(c, { id: String(novo.id), url: novo.url || null, fase: 'Entrada' });
      await salvar(cards);
    }

    let atual = await faseDoCard(c.id);
    if (!atual) throw new Error(`Card ${c.id} não encontrado no Pipefy.`);
    c.url = atual.url || c.url;

    // 2. Entrada -> Liberação
    if (atual.current_phase?.id === CFG.faseEntrada) {
      await preencher(c.id, CFG.campoRecebida, dataISO(pedido.data));
      await preencher(c.id, CFG.campoPedidoLoja, String(pedido.numero_pedido));
      if (tipoEnvio) await preencher(c.id, CFG.campoTipoEnvio, tipoEnvio);
      const obs = [
        qtd > 1 ? `Card ${i + 1} de ${qtd}` : null,
        'Itens: ' + grupo.map(x => `${x.codigo} (${Number(x.quantidade)} ${x.unidade || ''})`.trim()).join(', '),
        `Envio: ${envioTxt}`,
        `Pedido Zen: ${pedido.zen_pedido_id} · Ordem de separação: ${pedido.zen_ordem_separacao_id}`,
      ].filter(Boolean).join('\n');
      await preencher(c.id, CFG.campoObs, obs);
      atual.current_phase = await mover(c.id, CFG.faseLiberacao);
      c.fase = atual.current_phase?.name || 'Liberação';
      await salvar(cards);
    }

    // 3. Liberação -> Separação
    if (atual.current_phase?.id === CFG.faseLiberacao) {
      await preencher(c.id, CFG.campoOsZen, String(pedido.zen_ordem_separacao_id));
      await preencher(c.id, CFG.campoQtdCards, String(qtd));
      atual.current_phase = await mover(c.id, CFG.faseSeparacao);
      c.fase = atual.current_phase?.name || 'Separação';
      await salvar(cards);
    } else if (atual.current_phase?.name) {
      c.fase = atual.current_phase.name;
    }
  }
  return { cards, avisos };
}

// Exclui um card (card que já não existe conta como excluído)
export async function excluirCardLojinha(cardId) {
  if (!cardId) return;
  try {
    await pipefyQuery(`mutation($id: ID!) { deleteCard(input: { id: $id }) { success } }`, { id: String(cardId) });
  } catch (e) {
    if (/not found|não encontrad|record not found|permission/i.test(e.message) && !(await faseDoCard(cardId).catch(() => null))) return;
    throw e;
  }
}
