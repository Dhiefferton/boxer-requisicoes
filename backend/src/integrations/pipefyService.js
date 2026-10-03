// ============================================================
// integrations/pipefyService.js — Integração com Pipefy
// ============================================================

const PIPEFY_API = 'https://api.pipefy.com/graphql';
const TOKEN      = process.env.PIPEFY_TOKEN;
const PIPE_ID    = process.env.PIPEFY_PIPE_ID;

const PHASES = {
  solicitado:   process.env.PIPEFY_PHASE_SOLICITADO,
  em_separacao: process.env.PIPEFY_PHASE_EM_SEPARACAO,
  separado:     process.env.PIPEFY_PHASE_SEPARADO,
  entregue:     process.env.PIPEFY_PHASE_ENTREGUE,
};

function escapePipefy(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u001F]/g, '');
}

async function pipefyMutation(mutation, variables) {
  console.log('🔄 Pipefy request iniciado...');
  console.log('TOKEN presente:', !!TOKEN);

  const response = await fetch(PIPEFY_API, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  console.log('🔄 Pipefy HTTP status:', response.status);
  const text = await response.text();
  console.log('🔄 Pipefy response raw:', text.substring(0, 300));

  const data = JSON.parse(text);

  if (data.errors) {
    console.error('❌ Pipefy errors:', JSON.stringify(data.errors));
    throw new Error(data.errors[0].message);
  }

  return data.data;
}

// Consulta genérica (query, não mutation) — reaproveita o mesmo client HTTP.
// Usada pra diagnóstico (listar pipes/fases) e, futuramente, pra ler cards.
export async function pipefyQuery(query, variables) {
  return pipefyMutation(query, variables);
}

// Pipe "Orçamento BOXER SOLDAS" -> fase "Requisitar Peças"
export const ORCAMENTO_PIPE_ID          = process.env.PIPEFY_ORCAMENTO_PIPE_ID  || '301367367';
export const ORCAMENTO_PHASE_REQUISITAR = process.env.PIPEFY_ORCAMENTO_PHASE_ID || '344449850';

// Busca todos os cards de uma fase (paginado, 50 por página).
async function buscarCardsFase(phaseId) {
  const gql = `
    query CardsDaFase($phaseId: ID!, $after: String) {
      phase(id: $phaseId) {
        cards(first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node { id title url createdAt fields { name value field { id } } } }
        }
      }
    }
  `;
  const cards = [];
  let after = null;
  for (let pagina = 0; pagina < 40; pagina++) {
    const data = await pipefyQuery(gql, { phaseId: String(phaseId), after });
    const conn = data?.phase?.cards;
    if (!conn) break;
    for (const { node } of conn.edges) {
      cards.push({
        id:       String(node.id),
        titulo:   node.title,
        url:      node.url,
        criadoEm: node.createdAt,
        campos:   (node.fields || []).map(f => ({ id: f.field?.id || null, nome: f.name, valor: f.value })),
      });
    }
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return cards;
}

// Registros conectados a um campo de conexão (ex.: "Cliente" -> cadastro do
// cliente, de onde sai o CNPJ). Pega os IDs via array_value e lê cada um
// como registro de tabela (ou, se não for, como card). Nunca lança erro.
async function buscarConectados(cardId, fieldId) {
  try {
    const r = await pipefyQuery(
      `query($id: ID!) { card(id: $id) { fields { field { id } array_value } } }`,
      { id: String(cardId) }
    );
    const ids = (r?.card?.fields || []).find(f => f.field?.id === fieldId)?.array_value || [];
    const itens = [];
    for (const id of ids.slice(0, 5)) {
      try {
        const t = await pipefyQuery(
          `query($id: ID!) { table_record(id: $id) { id title record_fields { name value field { id } } } }`,
          { id: String(id) }
        );
        const rec = t?.table_record;
        if (rec) {
          itens.push({ id: rec.id, titulo: rec.title,
            campos: (rec.record_fields || []).map(rf => ({ id: rf.field?.id || null, nome: rf.name, valor: rf.value })) });
          continue;
        }
      } catch { /* não é registro de tabela */ }
      try {
        const c = await pipefyQuery(
          `query($id: ID!) { card(id: $id) { id title fields { name value field { id } } } }`,
          { id: String(id) }
        );
        const card = c?.card;
        if (card) itens.push({ id: card.id, titulo: card.title,
          campos: (card.fields || []).map(f => ({ id: f.field?.id || null, nome: f.name, valor: f.value })) });
      } catch { /* ignora */ }
    }
    return itens;
  } catch (err) {
    console.error(`⚠️ Não consegui ler os registros conectados (${fieldId}) do card ${cardId}:`, err.message);
    return [];
  }
}

export async function listarCardsDaFase(phaseId = ORCAMENTO_PHASE_REQUISITAR) {
  const cards = await buscarCardsFase(phaseId);
  for (const card of cards) {
    const campoCliente = card.campos.find(c => c.id === 'cadastro_cliente');
    if (campoCliente) campoCliente.conectados = await buscarConectados(card.id, 'cadastro_cliente');
  }
  return cards;
}

// ---------- Extração dos dados do card "Orçamento BOXER SOLDAS" ----------

// Campos de seleção/conexão vêm como string JSON: '["Fulano"]'
function valorTexto(valor) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).join(', ') || null;
    } catch { /* não é JSON */ }
  }
  return s || null;
}

function valorLista(valor) {
  if (valor === null || valor === undefined || valor === '') return [];
  const s = String(valor).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
    } catch { /* não é JSON */ }
  }
  return [s];
}

// "1.234,56" -> 1234.56
function numeroBR(valor) {
  const s = valorTexto(valor);
  if (!s) return null;
  const n = Number(s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function extrairDadosOrcamento(card) {
  const campos = card.campos || [];
  const porId = (id) => campos.find(c => c.id === id);
  const porNome = (re) => campos.find(c => re.test(norm(c.nome)));

  // Cliente (campo conectado "Cliente")
  const campoCliente = porId('cadastro_cliente') || porNome(/^cliente$/);
  const clienteNome = valorTexto(campoCliente?.valor) || card.titulo || null;

  // CNPJ: procura no registro conectado do cliente, depois no próprio card
  let clienteCnpj = null;
  for (const item of campoCliente?.conectados || []) {
    const c = item.campos.find(rf => /cnpj|cpf/.test(norm(rf.nome)));
    if (c && valorTexto(c.valor)) { clienteCnpj = valorTexto(c.valor); break; }
  }
  if (!clienteCnpj) {
    const c = porNome(/cnpj/);
    if (c) clienteCnpj = valorTexto(c.valor);
  }
  if (!clienteCnpj) {
    // às vezes o CNPJ está no título do registro conectado
    const t = (campoCliente?.conectados || []).map(i => i.titulo).join(' ');
    const m = t.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (m) clienteCnpj = m[0];
  }

  // Itens: "Peça N" + "Quantidade N" + "Valor de venda - Peça N"
  const pecas = {}, qtds = {}, valores = {};
  for (const c of campos) {
    const n = norm(c.nome);
    let m;
    if ((m = n.match(/^peca\s*(\d+)$/)))                       pecas[m[1]]   = c.valor;
    else if ((m = n.match(/^quantidade\s*(\d+)$/)))            qtds[m[1]]    = c.valor;
    else if ((m = n.match(/^valor de venda\s*-\s*peca\s*(\d+)$/))) valores[m[1]] = c.valor;
  }
  const itens = [];
  for (const num of Object.keys(pecas).sort((a, b) => a - b)) {
    for (const texto of valorLista(pecas[num])) {
      const idx = texto.indexOf(' - ');
      itens.push({
        n:              Number(num),
        codigo:         idx > 0 ? texto.slice(0, idx).trim() : null,
        descricao:      idx > 0 ? texto.slice(idx + 3).trim() : texto.trim(),
        quantidade:     numeroBR(qtds[num]),
        valor_unitario: numeroBR(valores[num]),
      });
    }
  }

  return {
    cliente_nome:    clienteNome,
    cliente_cnpj:    clienteCnpj || null,
    tecnico:         valorTexto((porId('t_cnico_1') || porNome(/^tecnico/))?.valor),
    frete_por_conta: valorTexto((porId('frete_por_conta') || porNome(/^frete por conta/))?.valor),
    entregue_por:    valorTexto((porId('entregue_por') || porNome(/^entregue por/))?.valor),
    ns_entrada:      valorTexto((porId('ns_entrada_1') || porNome(/^ns entrada$/))?.valor),
    itens,
  };
}

// Fase "Aprovado/Recusado" do pipe Orçamento BOXER SOLDAS
export const ORCAMENTO_PHASE_APROVADO_RECUSADO = process.env.PIPEFY_ORCAMENTO_PHASE_APROVADO_ID || '309113142';

/**
 * Situação atual de vários cards: fase atual + campo "Aprovação"
 * (Aprovado / Recusado, preenchido na fase "Aguardando aprovação").
 * Uma consulta só, com um alias por card (lotes de 30).
 * @returns {Map<string, { faseId, faseNome, aprovacao }>}
 */
export async function buscarSituacaoCards(cardIds) {
  const resultado = new Map();
  const ids = [...new Set((cardIds || []).map(String))];
  for (let i = 0; i < ids.length; i += 30) {
    const lote = ids.slice(i, i + 30);
    const corpo = lote.map((id, n) =>
      `c${n}: card(id: "${id}") { id current_phase { id name } fields { name value field { id } } }`
    ).join('\n');
    const data = await pipefyQuery(`query {\n${corpo}\n}`);
    lote.forEach((id, n) => {
      const card = data?.[`c${n}`];
      if (!card) return;
      const fields = card.fields || [];
      const valorNorm = (f) => norm(valorTexto(f.value));
      const campo =
        fields.find(f => norm(f.name).replace(/[^a-z]/g, '') === 'aprovacao')
        || fields.find(f => /aprova/.test(norm(f.name)) && /^(aprovad|recusad)/.test(valorNorm(f)))
        || fields.find(f => /^(aprovado|recusado)$/.test(valorNorm(f)));
      if (!campo && card.current_phase?.id === String(ORCAMENTO_PHASE_APROVADO_RECUSADO)) {
        console.log(`⚠️ Card ${card.id} sem campo Aprovação. Campos:`, fields.map(f => `${f.name}=${valorTexto(f.value)}`).join(' | '));
      }
      resultado.set(String(card.id), {
        faseId:    card.current_phase?.id ? String(card.current_phase.id) : null,
        faseNome:  card.current_phase?.name || null,
        aprovacao: valorTexto(campo?.value),
      });
    });
  }
  return resultado;
}

export async function criarCardPipefy({ requisicaoId, solicitante, departamento, itens, dataNecessidade }) {
  try {
    const itensTexto = itens.map(i =>
      `- ${i.codigo_snapshot} - ${i.descricao_snapshot} (${i.quantidade} ${i.unidade_snapshot})`
    ).join('\\n');

    const titulo = `Req #${requisicaoId} - ${solicitante}`;
    const deptSafe = (departamento || 'N/A').replace(/"/g, '').replace(/\n/g, ' ');
    const solicitanteSafe = solicitante.replace(/"/g, '').replace(/\n/g, ' ');

    const mutation = `mutation {
      createCard(input: {
        pipe_id: ${PIPE_ID}
        title: "${titulo}"
        phase_id: ${PHASES.solicitado}
        fields_attributes: [
          { field_id: "solicitante", field_value: "${solicitanteSafe}" }
          { field_id: "departamento", field_value: "${deptSafe}" }
          { field_id: "itens", field_value: "${itensTexto}" }
          { field_id: "data_necessidade", field_value: "${dataNecessidade || ''}" }
        ]
      }) {
        card { id title }
      }
    }`;

    const result = await pipefyMutation(mutation);
    const cardId = result?.createCard?.card?.id;

    if (cardId) {
      console.log(`✅ Card Pipefy criado: ${cardId} para Req #${requisicaoId}`);
    } else {
      console.error(`❌ Card não criado - resultado:`, JSON.stringify(result));
    }

    return cardId || null;
  } catch (err) {
    console.error(`❌ Erro ao criar card Pipefy para Req #${requisicaoId}:`, err.message);
    return null;
  }
}

export async function moverCardPipefy(cardId, novoStatus) {
  const phaseId = PHASES[novoStatus];
  if (!phaseId || !cardId) return;

  try {
    const mutation = `
      mutation MoveCard($cardId: ID!, $phaseId: ID!) {
        moveCardToPhase(input: {
          card_id: $cardId
          destination_phase_id: $phaseId
        }) {
          card { id current_phase { name } }
        }
      }
    `;

    await pipefyMutation(mutation, { cardId: String(cardId), phaseId: String(phaseId) });
    console.log(`✅ Card ${cardId} movido para "${novoStatus}" no Pipefy`);
  } catch (err) {
    console.error(`❌ Erro ao mover card ${cardId} no Pipefy:`, err.message);
  }
}

export async function excluirCardPipefy(cardId) {
  if (!cardId) return;

  try {
    const mutation = `
      mutation DeleteCard($cardId: ID!) {
        deleteCard(input: { id: $cardId }) {
          success
        }
      }
    `;

    await pipefyMutation(mutation, { cardId: String(cardId) });
    console.log(`✅ Card ${cardId} excluído do Pipefy`);
  } catch (err) {
    console.error(`❌ Erro ao excluir card ${cardId} do Pipefy:`, err.message);
  }
}
