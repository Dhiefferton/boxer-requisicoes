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

async function pipefyQuery(query) {
  const response = await fetch(PIPEFY_API, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();

  if (data.errors) {
    console.error('Pipefy API errors:', JSON.stringify(data.errors));
    throw new Error(data.errors[0].message);
  }

  return data.data;
}

// Cria um card no Pipefy quando uma requisição é criada
export async function criarCardPipefy({ requisicaoId, solicitante, departamento, itens, dataNecessidade }) {
  try {
    const itensTexto = itens.map(i =>
      `- ${i.codigo_snapshot} - ${i.descricao_snapshot} (${i.quantidade} ${i.unidade_snapshot})`
    ).join('\\n');

    const titulo = `Req #${requisicaoId} - ${solicitante}`;
    const deptSafe = (departamento || 'N/A').replace(/"/g, '');
    const solicitanteSafe = solicitante.replace(/"/g, '');

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

    const result = await pipefyQuery(mutation);
    const cardId = result?.createCard?.card?.id;

    if (cardId) {
      console.log(`✅ Card Pipefy criado: ${cardId} para Req #${requisicaoId}`);
    } else {
      console.error(`❌ Card não criado - resultado inesperado:`, JSON.stringify(result));
    }

    return cardId || null;
  } catch (err) {
    console.error(`❌ Erro ao criar card Pipefy para Req #${requisicaoId}:`, err.message);
    return null;
  }
}

// Move o card para a fase correspondente ao novo status
export async function moverCardPipefy(cardId, novoStatus) {
  const phaseId = PHASES[novoStatus];
  if (!phaseId || !cardId) return;

  try {
    const mutation = `mutation {
      moveCardToPhase(input: {
        card_id: ${cardId}
        destination_phase_id: ${phaseId}
      }) {
        card { id current_phase { name } }
      }
    }`;

    await pipefyQuery(mutation);
    console.log(`✅ Card ${cardId} movido para "${novoStatus}" no Pipefy`);
  } catch (err) {
    console.error(`❌ Erro ao mover card ${cardId} no Pipefy:`, err.message);
  }
}

// Exclui o card do Pipefy quando a requisição é cancelada
export async function excluirCardPipefy(cardId) {
  if (!cardId) return;

  try {
    const mutation = `mutation {
      deleteCard(input: { id: ${cardId} }) {
        success
      }
    }`;

    await pipefyQuery(mutation);
    console.log(`✅ Card ${cardId} excluído do Pipefy`);
  } catch (err) {
    console.error(`❌ Erro ao excluir card ${cardId} do Pipefy:`, err.message);
  }
}
