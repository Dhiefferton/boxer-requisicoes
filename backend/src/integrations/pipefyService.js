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

    const result = await pipefyQuery(mutation);
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
