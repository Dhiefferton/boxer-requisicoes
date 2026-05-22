// ============================================================
// integrations/erpZen.js — Stub para integração futura
// Boxer Sistema de Requisição de Materiais
// ============================================================
// Esta arquivo está preparado para a integração com o ERP Zen.
// Por enquanto, todas as funções lançam um erro informativo.
//
// QUANDO FOR IMPLEMENTAR:
//   1. Configure as variáveis no .env:
//        ERP_ZEN_URL=https://api.erpzen.com.br
//        ERP_ZEN_TOKEN=seu_token_aqui
//   2. Substitua os corpos das funções abaixo pela lógica real
//   3. O restante do sistema não precisa mudar
// ============================================================

const ERP_ATIVO = process.env.ERP_ZEN_ATIVO === 'true';

// Sincroniza a quantidade em estoque com o ERP Zen
export async function sincronizarEstoque(materialId) {
  if (!ERP_ATIVO) {
    console.info(`[ERP Zen] Integração inativa. Material ${materialId} não sincronizado.`);
    return null;
  }
  // TODO: Implementar chamada real à API do ERP Zen
  // const response = await fetch(`${process.env.ERP_ZEN_URL}/estoque/${materialId}`, {
  //   headers: { Authorization: `Bearer ${process.env.ERP_ZEN_TOKEN}` }
  // });
  throw new Error('Integração ERP Zen não implementada');
}

// Notifica o ERP quando uma requisição é confirmada
export async function notificarRequisicao(requisicaoId) {
  if (!ERP_ATIVO) {
    console.info(`[ERP Zen] Integração inativa. Requisição ${requisicaoId} não notificada.`);
    return null;
  }
  // TODO: Implementar notificação ao ERP
  throw new Error('Integração ERP Zen não implementada');
}
