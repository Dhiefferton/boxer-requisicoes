// ============================================================
// integrations/zenPedidoVenda.js — Cria pedido de venda no ZenERP
// a partir de um Pedido de Orçamento (card do Pipefy)
// ============================================================
// Disparado ao mover o pedido de "Solicitação" para "Separando".
//   1. Cliente do pedido no Zen é sempre a Tekweld (a própria empresa);
//      o cliente real (nome/CNPJ do Pipefy) aparece só no card
//   2. Cria o pedido (POST /sale/sale) — perfil ORCAMENTO, Baixa estoque
//   3. Para cada peça: busca a embalagem pelo código e inclui o item
//      (POST /sale/saleItem) com CFOP 5.927
//   4. Finaliza a preparação     (POST /sale/saleOpPrepare/{id})
//   5. Aprova incondicionalmente (POST /sale/saleOpApproveUnconditionally/{id})
//   6. Inclui a ordem de separação, perfil ORCAMENTO
//      (POST /sale/saleOpPickingOrderCreate/{id}) -> ID vai pro card
// Idempotente: segue do status atual do pedido no Zen — dá pra reenviar
// depois de um erro sem duplicar pedido, item ou ordem de separação.
// ============================================================

import { getToken } from './erpZen.js';

const ZEN_BASE_URL = 'https://api.zenerp.app.br';
const ZEN_TENANT   = 'boxer';

// IDs fixos (configuráveis por variável de ambiente)
const CFG = {
  company:                Number(process.env.ZEN_PV_COMPANY_ID         || 1009),  // TEKSP
  saleProfile:            Number(process.env.ZEN_PV_SALE_PROFILE_ID    || 1002),  // ORCAMENTO
  fiscalProfileOperation: Number(process.env.ZEN_PV_FISCAL_OP_ID       || 1003),  // Baixa estoque
  person:                 Number(process.env.ZEN_PV_PERSON_ID          || 1001),  // Tekweld (cliente fixo)
  salesperson:            Number(process.env.ZEN_PV_SALESPERSON_ID     || 62770), // Daiani
  taxationOperation:      Number(process.env.ZEN_PV_TAXATION_OP_ID     || 1392),  // CFOP 5.927
  currency:               Number(process.env.ZEN_PV_CURRENCY_ID        || 1001),  // BRL
  pickingProfile:         Number(process.env.ZEN_PV_PICKING_PROFILE_ID || 1003),  // ORCAMENTO
  paymentMethods:         process.env.ZEN_PV_PAYMENT_METHODS || '0',              // prazo: 0 = à vista
  invoiceSeries:          Number(process.env.ZEN_PV_INVOICE_SERIES_ID  || 1001),  // NF-e
};

async function zen(metodo, caminho, corpo) {
  const token = await getToken();
  const resp = await fetch(`${ZEN_BASE_URL}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      'tenant':        ZEN_TENANT,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON */ }
  if (!resp.ok) {
    const msg = dados?.message || dados?.error || dados?.errors?.[0]?.message || texto.slice(0, 300) || resp.status;
    throw new Error(`ZenERP ${metodo} ${caminho.split('?')[0]} → ${resp.status}: ${msg}`);
  }
  return dados;
}

const q = (expr) => encodeURIComponent(expr);

async function buscarEmbalagem(codigo) {
  const lista = await zen('GET', `/catalog/product/productPacking?q=${q(`code=="${codigo}"`)}&max=2`);
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`Peça ${codigo} não encontrada no ZenERP.`);
  }
  // detalhe completo pra pegar o perfil fiscal do produto
  return zen('GET', `/catalog/product/productPacking/${lista[0].id}`);
}

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); // YYYY-MM-DD
}

// Campo do card do Pipefy (guardado em pipefy_campos na sincronização)
function campoPipefy(pedido, id, nomeRe) {
  const campos = Array.isArray(pedido.pipefy_campos) ? pedido.pipefy_campos : [];
  const c = campos.find(x => x.id === id) || campos.find(x => nomeRe.test(String(x.nome || '')));
  const v = c?.valor;
  if (v === null || v === undefined) return '';
  return String(Array.isArray(v) ? v.join(', ') : v).trim();
}

function montarObservacoes(pedido) {
  const ns      = pedido.ns_entrada || campoPipefy(pedido, 'ns_entrada_1', /^ns entrada$/i);
  const remessa = campoPipefy(pedido, 'remessa_de_conserto_n', /^remessa de conserto/i);
  const linhas = [];
  if (ns)      linhas.push(`NS DE ENTRADA: ${ns}`);
  if (remessa) linhas.push(`REMESSA DE CONSERTO Nº: ${remessa}`);
  return linhas.join('\n');
}

/**
 * Cria (ou completa) o pedido de venda no ZenERP.
 * @param pedido linha de pedidos_orcamento
 * @returns {{ zenPedidoId: number, ordemSeparacaoId: number, itensIncluidos: number }}
 */
export async function criarPedidoVendaZen(pedido) {
  const itens = (pedido.itens || []).filter(i => i.codigo && Number(i.quantidade) > 0);
  if (itens.length === 0) throw new Error('Pedido sem peças com código e quantidade.');

  let zenPedidoId = pedido.zen_pedido_id;

  // Pedido excluído no Zen? Começa do zero.
  if (zenPedidoId) {
    try {
      await zen('GET', `/sale/sale/${zenPedidoId}`);
    } catch (err) {
      if (/→ 404/.test(err.message)) zenPedidoId = null;
      else throw err;
    }
  }

  const resultado = { zenPedidoId: null, ordemSeparacaoId: null, itensIncluidos: 0, criadoAgora: false };

  // 1–2. Cabeçalho
  if (!zenPedidoId) {
    const venda = await zen('POST', '/sale/sale', {
      company:                { id: CFG.company },
      saleProfile:            { id: CFG.saleProfile },
      fiscalProfileOperation: { id: CFG.fiscalProfileOperation },
      person:                 { id: CFG.person },
      personSalesperson:      { id: CFG.salesperson },
      freightType:            'NONE',
      currency:               { id: CFG.currency },
      availabilityDate:       hojeSP(),
      properties:             { comments: montarObservacoes(pedido), paymentMethods: CFG.paymentMethods },
    });
    zenPedidoId = venda?.id;
    if (!zenPedidoId) throw new Error('ZenERP não retornou o ID do pedido criado.');
    resultado.criadoAgora = true;
  }
  resultado.zenPedidoId = zenPedidoId;

  try {
    let venda = await zen('GET', `/sale/sale/${zenPedidoId}`);

    // 3. Itens — só enquanto o pedido está em preparação
    if (venda.status === 'PREPARING') {
      const existentes = await zen('GET', `/sale/saleItem?q=${q(`sale.id==${zenPedidoId}`)}&max=200`);
      const jaIncluidos = new Set((existentes || []).map(i => String(i.productPacking?.code || '')));

      for (const item of itens) {
        if (jaIncluidos.has(String(item.codigo))) continue;
        const embalagem = await buscarEmbalagem(item.codigo);
        const corpo = {
          sale:              { id: zenPedidoId },
          productPacking:    { id: embalagem.id },
          taxationOperation: { id: CFG.taxationOperation },
          quantity:          Number(item.quantidade),
          unitValue:         Number(item.valor_unitario) || 0,
          currency:          { id: CFG.currency },
          discountType:      'NONE',
        };
        if (embalagem.product?.fiscalProfileProduct?.id) {
          corpo.fiscalProfileProduct = { id: embalagem.product.fiscalProfileProduct.id };
        }
        await zen('POST', '/sale/saleItem', corpo);
        resultado.itensIncluidos++;
      }

      // 4. Finalizar preparação — exige forma de pagamento (prazo) no pedido
      if (venda.properties?.paymentMethods == null) {
        venda.properties = { ...(venda.properties || {}), paymentMethods: CFG.paymentMethods };
        await zen('PUT', '/sale/sale', venda);
      }
      await zen('POST', `/sale/saleOpPrepare/${zenPedidoId}`);
      venda = await zen('GET', `/sale/sale/${zenPedidoId}`);
    }

    // 5. Aprovar incondicionalmente
    if (venda.status === 'PREPARED') {
      await zen('POST', `/sale/saleOpApproveUnconditionally/${zenPedidoId}`);
      venda = await zen('GET', `/sale/sale/${zenPedidoId}`);
    }

    // 6. Ordem de separação (ponto final)
    if (venda.pickingOrder?.id) {
      resultado.ordemSeparacaoId = venda.pickingOrder.id;
    } else if (venda.status === 'APPROVED') {
      const tag = new Date().toISOString().replace(/\D/g, '').substring(2, 14);
      const ordem = await zen('POST', `/sale/saleOpPickingOrderCreate/${zenPedidoId}`, {
        pickingProfileId: CFG.pickingProfile,
        properties: { saleOpPickingOrderCreate_tag: tag },
      });
      resultado.ordemSeparacaoId = ordem?.id
        || (await zen('GET', `/sale/sale/${zenPedidoId}`))?.pickingOrder?.id
        || null;
    } else {
      throw new Error(`Pedido ${zenPedidoId} no Zen está com status ${venda.status} — não dá pra gerar a ordem de separação.`);
    }

    if (!resultado.ordemSeparacaoId) {
      throw new Error(`Ordem de separação do pedido ${zenPedidoId} não retornou ID.`);
    }
  } catch (err) {
    err.zenPedidoId = zenPedidoId; // cabeçalho já existe — guardar pra reenvio
    throw err;
  }

  return resultado;
}

/**
 * Situação da ordem de separação no Zen.
 * A separação está concluída quando a reserva é finalizada (FINISHED).
 */
export async function consultarOrdemSeparacao(ordemId) {
  const ordem = await zen('GET', `/material/pickingOrder/${ordemId}`);
  return {
    status:        ordem?.status || null,
    reservaStatus: ordem?.reservation?.status || null,
    separado:      ordem?.reservation?.status === 'FINISHED',
  };
}

/**
 * Botão "Mover p/ Finalizado": finaliza o romaneio de saída e cria a nota
 * fiscal (fica em preparação no Zen pra alguém revisar e emitir).
 *   romaneio PICKED  -> POST /material/outgoingListOpPacked/{id}            -> PACKED
 *   romaneio PACKED  -> POST /material/outgoingListOpOutgoingInvoiceCreate/{id} -> FINISHED + nota
 * Idempotente: se o romaneio já está FINISHED, só localiza a nota.
 * @returns {{ romaneioId: number, notaId: number }}
 */
export async function finalizarRomaneioZen(pedido) {
  if (!pedido.zen_ordem_separacao_id) throw new Error('Pedido sem ordem de separação no Zen.');

  const ordem = await zen('GET', `/material/pickingOrder/${pedido.zen_ordem_separacao_id}`);
  const romaneioId = ordem?.outgoingList?.id;
  if (!romaneioId) throw new Error(`Ordem de separação ${pedido.zen_ordem_separacao_id} sem romaneio de saída.`);

  let romaneio = await zen('GET', `/material/outgoingList/${romaneioId}`);

  if (romaneio.status === 'PICKED') {
    await zen('POST', `/material/outgoingListOpPacked/${romaneioId}`);
    romaneio = await zen('GET', `/material/outgoingList/${romaneioId}`);
  }

  let notaId = null;
  if (romaneio.status === 'PACKED') {
    const nota = await zen('POST', `/material/outgoingListOpOutgoingInvoiceCreate/${romaneioId}`, {
      fiscalProfileOperationId: CFG.fiscalProfileOperation,
      invoiceSeriesId:          CFG.invoiceSeries,
    });
    notaId = nota?.id || null;
  } else if (romaneio.status !== 'FINISHED') {
    throw new Error(`Romaneio ${romaneioId} está com status ${romaneio.status} — a separação ainda não terminou.`);
  }

  if (!notaId) {
    const notas = await zen('GET', `/fiscal/outgoingInvoice?q=${q(`outgoingList.id==${romaneioId}`)}&max=5`);
    notaId = (notas || []).filter(n => n.status !== 'CANCELED').map(n => n.id).sort((a, b) => b - a)[0] || null;
  }
  if (!notaId) throw new Error(`Romaneio ${romaneioId} finalizado, mas a nota fiscal não foi encontrada.`);

  return { romaneioId, notaId };
}
