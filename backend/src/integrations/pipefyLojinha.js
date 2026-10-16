// ============================================================
// integrations/pipefyLojinha.js — card da Lojinha Boxer no Pipefy
// ============================================================
// Pipe "Peças p/ Envio" -> o card nasce na fase inicial (Entrada) com:
//   • Cliente               -> registro da tabela "Cadastro" (achado pelo CPF/CNPJ;
//                              se não existir, é criado)
//   • Data de entrada       -> data do pedido da lojinha
//   • Estado                -> UF do cliente (cadastro do Zen)
//   • Responsável pelo caso -> registro da tabela "Funcionários" de quem
//                              está logado (por e-mail, depois por nome)
// "Envio de:" fica para a fase Liberação (preenchido lá no Pipefy).
// ============================================================
import { pipefyQuery } from './pipefyService.js';

const CFG = {
  pipe:            process.env.PIPEFY_LOJINHA_PIPE_ID || '301502578',   // Peças p/ Envio
  tabelaClientes:  process.env.PIPEFY_LOJINHA_TABELA_CLIENTES || 'RyuwsC0P',     // Cadastro
  tabelaFuncs:     process.env.PIPEFY_LOJINHA_TABELA_FUNCIONARIOS || 'A-DBx2PY', // Funcionários
  campoCliente:    'conex_o_de_database_t_tulo',
  campoData:       'data_de_entrada',
  campoEstado:     'select_t_tulo',
  campoResponsavel:'respons_vel_pelo_caso',
};

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

// Cliente na tabela "Cadastro" pelo CPF/CNPJ (findRecords; se falhar, varre a tabela)
async function acharCliente(documento) {
  const d = soDigitos(documento);
  for (const valor of [d, mascarar(d)]) {
    try {
      const r = await pipefyQuery(
        `query($t: ID!, $v: String!) { findRecords(tableId: $t, first: 5, search: { fieldId: "cpf_cnpj", fieldValue: $v }) {
           edges { node { id title } } } }`, { t: CFG.tabelaClientes, v: valor });
      const id = r?.findRecords?.edges?.[0]?.node?.id;
      if (id) return String(id);
    } catch { /* tenta o próximo formato / varredura */ }
  }
  const todos = await registrosDaTabela(CFG.tabelaClientes);
  return todos.find(x => soDigitos(x.campos.cpf_cnpj) === d)?.id || null;
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

// Funcionário do Pipefy correspondente a quem está logado
async function acharFuncionario({ email, nome }) {
  const lista = await registrosDaTabela(CFG.tabelaFuncs, 500);
  const e = norm(email);
  if (e) {
    const porEmail = lista.find(f => norm(f.campos.e_mail) === e);
    if (porEmail) return porEmail.id;
  }
  const n = norm(nome);
  if (!n) return null;
  const exato = lista.find(f => [f.titulo, f.campos.nome, f.campos.nome_resumido].some(v => norm(v) === n));
  if (exato) return exato.id;
  // primeiro + último nome
  const partes = n.split(' ');
  const pu = `${partes[0]} ${partes[partes.length - 1]}`;
  const aprox = lista.filter(f => [f.titulo, f.campos.nome, f.campos.nome_resumido].some(v => {
    const x = norm(v).split(' ');
    return x.length && `${x[0]} ${x[x.length - 1]}` === pu;
  }));
  return aprox.length === 1 ? aprox[0].id : null;
}

// Cria o card. Devolve { id, url, avisos[] }
export async function criarCardLojinha(pedido, usuario) {
  const avisos = [];
  let clienteId = await acharCliente(pedido.documento);
  if (!clienteId) {
    clienteId = await criarCliente({ documento: pedido.documento, nome: pedido.cliente_nome, uf: pedido.cliente_uf });
    avisos.push('Cliente cadastrado na tabela Cadastro do Pipefy.');
  }
  let responsavelId = null;
  try { responsavelId = await acharFuncionario({ email: usuario?.email, nome: usuario?.nome }); } catch { /* segue sem */ }
  if (!responsavelId) avisos.push(`Não achei ${usuario?.nome || 'o usuário'} na tabela Funcionários do Pipefy — card criado sem responsável.`);

  const data = String(pedido.data instanceof Date ? pedido.data.toISOString() : pedido.data).slice(0, 10);
  const campos = [
    { field_id: CFG.campoCliente, field_value: [clienteId] },
    { field_id: CFG.campoData, field_value: data },
  ];
  const est = estadoPipefy(pedido.cliente_uf);
  if (est) campos.push({ field_id: CFG.campoEstado, field_value: est });
  if (responsavelId) campos.push({ field_id: CFG.campoResponsavel, field_value: [responsavelId] });

  const r = await pipefyQuery(
    `mutation($i: CreateCardInput!) { createCard(input: $i) { card { id url } } }`,
    { i: { pipe_id: CFG.pipe, fields_attributes: campos } });
  const card = r?.createCard?.card;
  if (!card?.id) throw new Error('O Pipefy não devolveu o card criado.');
  return { id: String(card.id), url: card.url || null, avisos };
}

// Diagnóstico só de leitura (não cria nada): acha cliente e funcionário
export async function diagnosticoLojinha({ documento, email, nome }) {
  const out = {};
  try { out.cliente = documento ? await acharCliente(documento) : null; } catch (e) { out.cliente_erro = e.message; }
  try { out.funcionario = await acharFuncionario({ email, nome }); } catch (e) { out.funcionario_erro = e.message; }
  return out;
}
