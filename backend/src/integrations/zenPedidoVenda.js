// ============================================================
// integrations/zenPedidoVenda.js — Cria pedido de venda no ZenERP
// a partir de um Pedido de Orçamento (card do Pipefy)
// ============================================================
// Disparado ao mover o pedido de "Solicitação" para "Separando".
//   1. Cliente do pedido = cliente do card do Pipefy, buscado no Zen pelo
//      CNPJ/CPF (GET /catalog/person/person?q=documentNumber==...)
//   2. Cria o pedido (POST /sale/sale) — perfil de venda "Venda padrão",
//      perfil fiscal de operação "Venda"
//   3. Para cada peça: busca a embalagem pelo código e inclui o item
//      (POST /sale/saleItem) com o CFOP conforme o cliente:
//      SP 5.102 · fora de SP com IE 6.102 · fora de SP sem IE 6.108
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
  saleProfile:            Number(process.env.ZEN_PV_SALE_PROFILE_ID    || 1001),  // DEFAULT — Venda padrão
  fiscalProfileOperation: Number(process.env.ZEN_PV_FISCAL_OP_ID       || 1061),  // Venda
  salesperson:            Number(process.env.ZEN_PV_SALESPERSON_ID     || 62770), // Daiani
  ufEmpresa:              process.env.ZEN_PV_UF_EMPRESA || 'SP',                  // TEKSP
  cfopDentroEstado:       Number(process.env.ZEN_PV_CFOP_INTERNO_ID    || 1260),  // 5.102
  cfopForaEstado:         Number(process.env.ZEN_PV_CFOP_INTERESTADUAL_ID || 1401), // 6.102
  cfopNaoContribuinte:    Number(process.env.ZEN_PV_CFOP_NAO_CONTRIB_ID || 1407), // 6.108
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

// ---------- Cliente (pelo CNPJ/CPF do card) ----------
function mascararDocumento(doc) {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return null;
}

async function buscarClienteZen(documento) {
  const mascarado = mascararDocumento(documento);
  if (!mascarado) throw new Error(`CNPJ/CPF do cliente inválido ou vazio no card ("${documento || ''}").`);
  const digitos = mascarado.replace(/\D/g, '');
  for (const valor of [mascarado, digitos]) {
    const lista = await zen('GET', `/catalog/person/person?q=${q(`documentNumber=="${valor}"`)}&max=2`);
    if (Array.isArray(lista) && lista.length > 0) {
      return zen('GET', `/catalog/person/person/${lista[0].id}`);
    }
  }
  throw new Error(`Cliente ${mascarado} não está cadastrado no Zen. Cadastre o cliente no Zen e tente de novo.`);
}

// CFOP conforme o cliente: SP 5.102 · fora de SP com IE 6.102 · fora de SP sem IE 6.108
function cfopDoCliente(pessoa) {
  const uf = String(pessoa?.city?.state?.code || '').toUpperCase();
  if (!uf || uf === CFG.ufEmpresa) return CFG.cfopDentroEstado;
  const temIE = /\d/.test(String(pessoa?.document2Number || ''));
  return temIE ? CFG.cfopForaEstado : CFG.cfopNaoContribuinte;
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

  // 1. Cliente do card (no reenvio, usa o cliente que já está no pedido)
  let cliente = null;

  // 1–2. Cabeçalho
  if (!zenPedidoId) {
    cliente = await buscarClienteZen(pedido.cliente_cnpj);
    const venda = await zen('POST', '/sale/sale', {
      company:                { id: CFG.company },
      saleProfile:            { id: CFG.saleProfile },
      fiscalProfileOperation: { id: CFG.fiscalProfileOperation },
      person:                 { id: cliente.id },
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
      if (!cliente) cliente = await zen('GET', `/catalog/person/person/${venda.person.id}`);
      const cfop = cfopDoCliente(cliente);
      const existentes = await zen('GET', `/sale/saleItem?q=${q(`sale.id==${zenPedidoId}`)}&max=200`);
      const jaIncluidos = new Set((existentes || []).map(i => String(i.productPacking?.code || '')));

      for (const item of itens) {
        if (jaIncluidos.has(String(item.codigo))) continue;
        const embalagem = await buscarEmbalagem(item.codigo);
        const corpo = {
          sale:              { id: zenPedidoId },
          productPacking:    { id: embalagem.id },
          taxationOperation: { id: cfop },
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

// ============================================================
// Aprovado Parcial — retirar as peças recusadas do pedido no Zen
// ============================================================
//   1. Cancela a ordem de separação atual (desfaz reserva/ordem passo a
//      passo até o Zen aceitar POST /sale/saleOpPickingOrderCreateRevert)
//      -> a reserva é desfeita e as peças voltam pro estoque
//   2. Volta o pedido pra preparação (saleOpApproveRevert / saleOpPrepareRevert)
//   3. Exclui os itens recusados (DELETE /sale/saleItem/{id})
//   4. Prepara, aprova e gera uma nova ordem de separação (criarPedidoVendaZen)
// Idempotente: se parar no meio, dá pra apertar o botão de novo.

const normCodigo = (c) => String(c || '').trim().toUpperCase();

/** "123, 456\n789" -> ['123','456','789'] */
export function separarCodigos(texto) {
  return [...new Set(String(texto || '')
    .split(/[\s,;|]+/)
    .map(normCodigo)
    .filter(Boolean))];
}

async function tentar(metodo, caminho) {
  try { await zen(metodo, caminho); return null; }
  catch (err) { return err; }
}

// Desfaz a ordem de separação até o Zen aceitar a reversão no pedido
async function cancelarOrdemSeparacao(saleId, ordemId) {
  const erros = [];
  for (let passo = 0; passo < 15; passo++) {
    const erroRevert = await tentar('POST', `/sale/saleOpPickingOrderCreateRevert/${saleId}?pickingOrderId=${ordemId}`);
    if (!erroRevert) return;
    erros.push(erroRevert.message);

    // Ainda não deu: recua um passo na ordem / reserva / romaneio
    const ordem    = await zen('GET', `/material/pickingOrder/${ordemId}`);
    const reserva  = ordem?.reservation?.id   ? await zen('GET', `/material/reservation/${ordem.reservation.id}`)    : null;
    const romaneio = ordem?.outgoingList?.id  ? await zen('GET', `/material/outgoingList/${ordem.outgoingList.id}`) : null;

    if (romaneio?.status === 'FINISHED') {
      throw new Error(`O romaneio ${romaneio.id} já foi finalizado (nota fiscal criada). Cancele a nota no Zen antes de retirar peças.`);
    }

    const candidatos = [];
    if (romaneio?.status === 'PACKED') candidatos.push(`/material/outgoingListOpPackedRevert/${romaneio.id}`);
    if (ordem?.status && !['PREPARING', 'PREPARED', 'APPROVED', 'DISTRIBUTED'].includes(ordem.status)) {
      candidatos.push(`/material/pickingOrderOpReservationFinishRevert/${ordemId}`);
    }
    if (reserva) {
      const r = reserva.status;
      if (r === 'FINISHED')  candidatos.push(`/material/reservationOpFinishRevert/${reserva.id}`);
      if (r === 'STARTED')   candidatos.push(`/material/reservationOpStartRevert/${reserva.id}`);
      if (r === 'ALLOCATED') candidatos.push(`/material/reservationOpAllocateRevert/${reserva.id}`);
      if (r === 'APPROVED')  candidatos.push(`/material/reservationOpApproveRevert/${reserva.id}`);
      if (r === 'PREPARED')  candidatos.push(`/material/reservationOpPrepareRevert/${reserva.id}`);
    }
    if (ordem?.status === 'DISTRIBUTED') candidatos.push(`/material/pickingOrderOpDistributeRevert/${ordemId}`);
    if (ordem?.status === 'APPROVED')    candidatos.push(`/material/pickingOrderOpApproveRevert/${ordemId}`);
    if (ordem?.status === 'PREPARED')    candidatos.push(`/material/pickingOrderOpPrepareRevert/${ordemId}`);
    // O Zen não desfaz a reserva enquanto existe romaneio PICKED/PACKED:
    // último recurso é excluir o romaneio da ordem que está sendo cancelada
    if (romaneio && ['PICKING', 'PICKED'].includes(romaneio.status)) {
      candidatos.push(['DELETE', `/material/outgoingList/${romaneio.id}`]);
    }

    let avancou = false;
    for (const item of candidatos) {
      const [metodo, caminho] = Array.isArray(item) ? item : ['POST', item];
      const erro = await tentar(metodo, caminho);
      if (!erro) { avancou = true; break; }
      erros.push(erro.message);
    }
    if (!avancou) {
      throw new Error(
        `Não consegui cancelar a ordem de separação ${ordemId} no Zen ` +
        `(ordem ${ordem?.status || '?'}, reserva ${reserva?.status || '-'}, romaneio ${romaneio?.status || '-'}). ` +
        `Erros: ${erros.slice(-3).join(' | ') || erroRevert.message}`
      );
    }
  }
  throw new Error(`Ordem de separação ${ordemId}: muitas tentativas sem conseguir cancelar.`);
}

/**
 * @param pedido linha de pedidos_orcamento
 * @param codigosRecusados códigos (já normalizados) a retirar
 * @returns {{ zenPedidoId, ordemSeparacaoId, ordemCancelada, itensRetirados: string[] }}
 */
export async function retirarPecasRecusadasZen(pedido, codigosRecusados) {
  const saleId = pedido.zen_pedido_id;
  if (!saleId) throw new Error('Pedido sem pedido de venda no Zen.');
  const recusados = new Set((codigosRecusados || []).map(normCodigo));
  if (recusados.size === 0) throw new Error('Nenhuma peça recusada informada.');

  const aprovados = (pedido.itens || []).filter(i => !recusados.has(normCodigo(i.codigo)));
  if (aprovados.length === 0) {
    throw new Error('Todas as peças do pedido estão como recusadas — nesse caso cancele o pedido no Zen.');
  }

  let venda = await zen('GET', `/sale/sale/${saleId}`);
  if (venda.status === 'CANCELED') throw new Error(`Pedido ${saleId} está cancelado no Zen.`);

  // 1. Cancela a ordem de separação atual
  let ordemCancelada = null;
  if (venda.pickingOrder?.id) {
    ordemCancelada = venda.pickingOrder.id;
    await cancelarOrdemSeparacao(saleId, ordemCancelada);
    venda = await zen('GET', `/sale/sale/${saleId}`);
  }

  // 2. Volta pra preparação
  if (venda.status === 'APPROVED') {
    await zen('POST', `/sale/saleOpApproveRevert/${saleId}`);
    venda = await zen('GET', `/sale/sale/${saleId}`);
  }
  if (venda.status === 'PREPARED') {
    await zen('POST', `/sale/saleOpPrepareRevert/${saleId}`);
    venda = await zen('GET', `/sale/sale/${saleId}`);
  }
  if (venda.status !== 'PREPARING') {
    throw new Error(`Pedido ${saleId} no Zen ficou com status ${venda.status} — não consegui voltar pra preparação.`);
  }

  // 3. Exclui os itens recusados
  const itensZen = await zen('GET', `/sale/saleItem?q=${q(`sale.id==${saleId}`)}&max=200`);
  const itensRetirados = [];
  for (const item of itensZen || []) {
    const codigo = normCodigo(item.productPacking?.code);
    if (recusados.has(codigo)) {
      await zen('DELETE', `/sale/saleItem/${item.id}`);
      itensRetirados.push(codigo);
    }
  }

  // 4. Prepara, aprova e gera a nova ordem — só com as peças aprovadas
  const novo = await criarPedidoVendaZen({ ...pedido, zen_pedido_id: saleId, itens: aprovados });
  return {
    zenPedidoId:      saleId,
    ordemSeparacaoId: novo.ordemSeparacaoId,
    ordemCancelada,
    itensRetirados,
    itensAprovados:   aprovados,
  };
}
