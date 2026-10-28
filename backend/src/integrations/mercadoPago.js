// ============================================================
// integrations/mercadoPago.js — ID do pagamento no Mercado Pago
// ============================================================
// No Checkout PRO a Loja Integrada guarda só o ID da preferência
// ("343482863-uuid"). O "ID no Meio de Pagamento" (número que vai na tag
// do pedido no Zen) vem da API do Mercado Pago: a merchant order dessa
// preferência lista os pagamentos.
// Variável de ambiente (Vercel, projeto do backend):
//   MERCADOPAGO_ACCESS_TOKEN → Access Token de PRODUÇÃO da conta que recebe
//                              os pagamentos da lojinha (APP_USR-…)
// ============================================================
const BASE = 'https://api.mercadopago.com';

export const mercadoPagoConfigurado = () => Boolean((process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim());

async function getMP(caminho) {
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { Authorization: `Bearer ${(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim()}` },
  });
  const texto = await r.text();
  let dados = null; try { dados = JSON.parse(texto); } catch { /* não-JSON */ }
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${dados?.message || texto.slice(0, 200)}`);
  return dados;
}

/**
 * IDs dos pagamentos aprovados de uma preferência do Checkout PRO.
 * @param {string} preferenceId ex.: "343482863-7aa543b4-bb4e-4a3d-a32a-aecd17951d3c"
 * @returns {Promise<string[]>} ex.: ['185277210603'] (vazio se não achar)
 */
export async function pagamentosDaPreferencia(preferenceId) {
  if (!mercadoPagoConfigurado() || !preferenceId) return [];
  const d = await getMP(`/merchant_orders/search?preference_id=${encodeURIComponent(preferenceId)}`);
  const ordens = Array.isArray(d?.elements) ? d.elements : [];
  const pagamentos = ordens.flatMap(o => Array.isArray(o?.payments) ? o.payments : []);
  const aprovados = pagamentos.filter(p => p?.status === 'approved');
  return [...new Set((aprovados.length ? aprovados : []).map(p => String(p.id)).filter(id => /^\d{6,}$/.test(id)))];
}

// Diagnóstico: resposta crua de um caminho da API
export const getMPBruto = (caminho) => getMP(caminho);
