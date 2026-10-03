// ============================================================
// integrations/zenPedidoVenda.js — Cria pedido de venda no ZenERP
// a partir de um Pedido de Orçamento (card do Pipefy)
// ============================================================
// Disparado ao mover o pedido de "Solicitação" para "Separando".
//   1. Busca o cliente no Zen pelo CNPJ
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
  salesperson:            Number(process.env.ZEN_PV_SALESPERSON_ID     || 62770), // Daiani
  taxationOperation:      Number(process.env.ZEN_PV_TAXATION_OP_ID     || 1392),  // CFOP 5.927
  currency:               Number(process.env.ZEN_PV_CURRENCY_ID        || 1001),  // BRL
  pickingProfile:         Number(process.env.ZEN_PV_PICKING_PROFILE_ID || 1003),  // ORCAMENTO
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

function formatarCnpj(doc) {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc;
}

async function buscarCliente(cnpj) {
  const formatado = formatarCnpj(cnpj);
  const lista = await zen('GET', `/catalog/person/person?q=${q(`documentNumber=="${formatado}"`)}&max=2`);
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error(`Cliente com CNPJ ${formatado} não encontrado no ZenERP.`);
  }
  return lista[0];
}

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

function montarObservacoes(pedido) {
  const linhas = [];
  if (pedido.ns_entrada)     linhas.push(`NS: ${pedido.ns_entrada}`);
  if (pedido.tecnico)        linhas.push(`Técnico: ${pedido.tecnico}`);
  if (pedido.entregue_por)   linhas.push(`Entregue por: ${pedido.entregue_por}`);
  if (pedido.pipefy_card_id) linhas.push(`Pipefy: #${pedido.pipefy_card_id}`);
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
  if (!pedido.cliente_cnpj) throw new Error('Pedido sem CNPJ do cliente.');

  let zenPedidoId = pedido.zen_pedido_id;
  const resultado = { zenPedidoId: null, ordemSeparacaoId: null, itensIncluidos: 0, criadoAgora: false };

  // 1–2. Cabeçalho
  if (!zenPedidoId) {
    const cliente = await buscarCliente(pedido.cliente_cnpj);
    const venda = await zen('POST', '/sale/sale', {
      company:                { id: CFG.company },
      saleProfile:            { id: CFG.saleProfile },
      fiscalProfileOperation: { id: CFG.fiscalProfileOperation },
      person:                 { id: cliente.id },
      personSalesperson:      { id: CFG.salesperson },
      freightType:            'NONE',
      currency:               { id: CFG.currency },
      availabilityDate:       hojeSP(),
      properties:             { comments: montarObservacoes(pedido) },
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

      // 4. Finalizar preparação
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
