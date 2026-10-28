// ============================================================
// integrations/zenLojinha.js — Pedido de venda da Lojinha Boxer no ZenERP
// ============================================================
// Mesmo padrão dos pedidos da Lojinha feitos à mão no Zen:
//   • Empresa TEKSP · perfil de venda "VendaConsumidor" (Venda consumidor final);
//     cliente "Regime Normal" ou de SP (mesmo estado) → perfil "Venda padrão" (DEFAULT), operação Venda
//   • Operação fiscal: "Venda" (contribuinte) ou "Venda não contribuinte" (6.108)
//   • Frete por conta do emitente (ISSUER) · forma de pagamento 0
//   • Vendedora = vendedora escolhida na tela (pessoa do Zen)
//   • Código do pedido = nº do pedido da lojinha; observação "LB: <nº>"
//   • Tag do pedido = ID da transação do pagamento na Loja Integrada (Mercado Pago);
//     sem ID válido o pedido não é criado (mensagem explicando o motivo)
//   • Transportadora: Sedex/PAC = Correios, Próprio = Proprio, ou a escolhida
//   • Itens: preço da tela; Assistente Autorizado = 23% de desconto em
//     cada peça; o frete é rateado entre os itens (proporcional ao valor)
//   • CFOP pelo cadastro do cliente (cliente sem UF no Zen → pedido bloqueado):
//       mesmo estado da empresa (SP) .................. 5.102
//       outro estado, "Regime Normal" (contribuinte) .. 6.102
//       outro estado, "Consumidor" / pessoa física .... 6.108
//   • Prepara → aprova → ordem de separação (perfil LOJINHA)
// Idempotente: segue do status atual do pedido no Zen.
// ============================================================
import { getToken } from './erpZen.js';
import { pedidoLIBruto, lojaIntegradaConfigurada } from './lojaIntegrada.js';

const ZEN_BASE_URL = 'https://api.zenerp.app.br';
const ZEN_TENANT   = 'boxer';

const CFG = {
  company:                Number(process.env.ZEN_LB_COMPANY_ID         || 1009),  // TEKSP
  ufEmpresa:              process.env.ZEN_LB_UF_EMPRESA || 'SP',
  saleProfile:            Number(process.env.ZEN_LB_SALE_PROFILE_ID    || 1007),  // VendaConsumidor — Venda consumidor final
  saleProfileRegimeNormal: Number(process.env.ZEN_LB_SALE_PROFILE_RN_ID || 1001), // DEFAULT — Venda padrão
  fiscalOpVenda:          Number(process.env.ZEN_LB_FISCAL_OP_ID       || 1061),  // Venda
  fiscalOpNaoContrib:     Number(process.env.ZEN_LB_FISCAL_OP_NC_ID    || 1070),  // VendaNaoContribuinte
  currency:               Number(process.env.ZEN_LB_CURRENCY_ID        || 1001),  // BRL
  pickingProfile:         Number(process.env.ZEN_LB_PICKING_PROFILE_ID || 1004),  // LOJINHA
  cfop5102:               1260,
  cfop6102:               1401,
  cfop6108:               1407,
  descontoAutorizado:     23,  // %
};

async function zen(metodo, caminho, corpo) {
  const token = await getToken();
  const resp = await fetch(`${ZEN_BASE_URL}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, tenant: ZEN_TENANT },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* não-JSON */ }
  if (!resp.ok) {
    const msg = dados?.message || dados?.error || dados?.errors?.[0]?.message || texto.slice(0, 300) || resp.status;
    throw new Error(`ZenERP ${metodo} ${caminho.split('?')[0]} → ${resp.status}: ${msg}`);
  }
  return dados;
}
// Transportadora do pedido no Zen (pessoa "shipping"): Sedex/PAC = Correios
const TRANSPORTADORA_ZEN = {
  Sedex: 26861, PAC: 26861,                 // Empresa Brasileira De Correios E Telegrafos
  'Próprio': 26828,                         // Proprio
  'São Miguel': 26363,                      // Expresso Sao Miguel S/A
  'Rodo Cargo': 26006,                      // Rodo Cargo Encomendas Urgentes Ltda
  Rodonaves: 32233,                         // Rodonaves Transp E Encomendas Ltda
  Favorita: 26084,                          // Favorita Transportes Ltda
  Transuni: 67173,                          // Transuni - Encomendas E Cargas Ltda
  Troca: 41072,                             // Troca Transportes - Eireli
};
export const transportadoraZen = (pedido) =>
  TRANSPORTADORA_ZEN[pedido.tipo_envio === 'Transportadora' ? pedido.transportadora : pedido.tipo_envio] || null;

const q = (expr) => encodeURIComponent(expr);
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// ---------- Vendedoras (pessoas do Zen marcadas como vendedor) ----------
let cacheVendedoras = null; // { em, lista }
export async function listarVendedorasZen() {
  if (cacheVendedoras && Date.now() - cacheVendedoras.em < 60 * 60 * 1000) return cacheVendedoras.lista;
  const pessoas = await zen('GET', `/catalog/person/person?q=${q('tags=="*salesperson*";type=="INDIVIDUAL"')}&max=500`);
  const lista = (pessoas || [])
    .filter(p => !/\b(inactive|blocked)\b/.test(p.tags || ''))
    .map(p => ({ id: p.id, nome: p.name }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  cacheVendedoras = { em: Date.now(), lista };
  return lista;
}

// ---------- CFOP pelo cadastro do cliente ----------
// UF do cliente no Zen. Sem UF não dá para saber se é 5.102 ou 6.xxx:
// o pedido é bloqueado em vez de adivinhar.
export function ufCliente(pessoa) {
  const uf = String(pessoa?.city?.state?.code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) {
    const quem = [pessoa?.name, pessoa?.documentNumber].filter(Boolean).join(' · ') || `pessoa ${pessoa?.id || '?'}`;
    throw new Error(`Cliente sem UF no Zen (${quem}). Preencha a cidade/estado no cadastro do cliente no Zen e envie de novo.`);
  }
  return uf;
}
export function cfopLojinha(pessoa) {
  const uf = ufCliente(pessoa);
  if (uf === CFG.ufEmpresa) return { id: CFG.cfop5102, codigo: '5.102' };
  const regime = String(pessoa?.fiscalProfilePerson?.description || '');
  if (/regime\s+normal/i.test(regime)) return { id: CFG.cfop6102, codigo: '6.102' };
  if (/consumidor/i.test(regime) || pessoa?.type === 'INDIVIDUAL') return { id: CFG.cfop6108, codigo: '6.108' };
  // Sem regime claro: contribuinte se tiver Inscrição Estadual
  return /\d/.test(String(pessoa?.document2Number || '')) ? { id: CFG.cfop6102, codigo: '6.102' } : { id: CFG.cfop6108, codigo: '6.108' };
}

// ---------- Perfil de venda pelo regime do cliente ----------
export const clienteRegimeNormal = (pessoa) =>
  /regime\s+normal/i.test(String(pessoa?.fiscalProfilePerson?.description || ''));
// Cliente do mesmo estado da empresa (SP), pessoa física ou não, também
// sai como "Venda padrão" (operação Venda, CFOP 5.102) — não como consumidor final
export const clienteMesmoEstado = (pessoa) => ufCliente(pessoa) === CFG.ufEmpresa;
export const perfilVendaLojinha = (pessoa) => (clienteRegimeNormal(pessoa) || clienteMesmoEstado(pessoa)
  ? { id: CFG.saleProfileRegimeNormal, nome: 'Venda padrão' }
  : { id: CFG.saleProfile, nome: 'Venda consumidor final' });

// ---------- Valores por item: desconto e rateio do frete ----------
export function calcularItens(pedido) {
  const desc = pedido.assistente_autorizado ? CFG.descontoAutorizado : 0;
  const itens = (pedido.itens || []).map(i => {
    const bruto = r2(Number(i.quantidade) * Number(i.preco));
    const liquido = r2(bruto - r2(bruto * desc / 100));
    return { ...i, desconto_pct: desc, valor_bruto: bruto, valor_liquido: liquido, frete: 0 };
  });
  // Frete rateado proporcional ao valor de cada item; a sobra dos centavos vai no maior item
  const frete = r2(pedido.valor_frete || 0);
  if (frete > 0 && itens.length) {
    const base = itens.reduce((s, i) => s + i.valor_liquido, 0);
    let distribuido = 0;
    itens.forEach(i => {
      i.frete = base > 0 ? r2(frete * i.valor_liquido / base) : r2(frete / itens.length);
      distribuido = r2(distribuido + i.frete);
    });
    const sobra = r2(frete - distribuido);
    if (sobra !== 0) {
      const maior = itens.reduce((a, b) => (b.valor_liquido > a.valor_liquido ? b : a));
      maior.frete = r2(maior.frete + sobra);
    }
  }
  return itens;
}

async function buscarEmbalagem(codigo) {
  const lista = await zen('GET', `/catalog/product/productPacking?q=${q(`code=="${codigo}"`)}&max=2`);
  if (!Array.isArray(lista) || !lista.length) throw new Error(`Peça ${codigo} não encontrada no ZenERP.`);
  return zen('GET', `/catalog/product/productPacking/${lista[0].id}`);
}

async function buscarPessoa(pedido) {
  if (pedido.cliente_id_zen) {
    try { return await zen('GET', `/catalog/person/person/${pedido.cliente_id_zen}`); } catch { /* tenta pelo documento */ }
  }
  const d = String(pedido.documento || '').replace(/\D/g, '');
  const mascarado = d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  for (const v of [mascarado, d]) {
    const l = await zen('GET', `/catalog/person/person?q=${q(`documentNumber=="${v}"`)}&max=2`);
    if (Array.isArray(l) && l.length) return zen('GET', `/catalog/person/person/${l[0].id}`);
  }
  throw new Error('Cliente não encontrado no Zen.');
}

/**
 * Cria (ou completa) o pedido da Lojinha no Zen até a ordem de separação.
 * @returns {{ zenPedidoId, ordemSeparacaoId, cfop }}
 */
/**
 * ID(s) da transação do pagamento na Loja Integrada (vai na tag do pedido no Zen).
 * Pedido da Loja Integrada sem um ID de transação válido (numérico, o mesmo do
 * painel) bloqueia a criação do pedido no Zen com a explicação do problema.
 * Pagamento sem ID nenhum, ou pedido que não é da Loja Integrada, segue sem tag.
 */
async function transacaoLojinha(numero, manual) {
  // Digitado à mão no card (vale mais que o da Loja Integrada)
  const m = String(manual || '').replace(/\s+/g, '');
  if (/^\d{6,}(,\d{6,})*$/.test(m)) return m;
  if (!lojaIntegradaConfigurada() || !/^\d+$/.test(String(numero || ''))) return '';
  let li;
  try { li = await pedidoLIBruto(String(numero)); }
  catch (e) {
    throw new Error(`Não consegui ler o pedido ${numero} na Loja Integrada para pegar o ID da transação (${e.message}). `
      + 'O pedido não foi criado no Zen. Tente de novo em alguns minutos.');
  }
  const pagamentos = Array.isArray(li?.pagamentos) ? li.pagamentos : [];
  const ids = pagamentos.map(p => String(p?.transacao_id || '').trim());
  const validos = [...new Set(ids.filter(t => /^\d{6,}$/.test(t)))];
  if (validos.length) return validos.join(',');
  const invalidos = ids.filter(Boolean);
  const forma = pagamentos.map(p => p?.forma_pagamento?.nome).filter(Boolean).join(', ');
  if (invalidos.length) {
    throw new Error(`ID da transação inválido no pedido ${numero} da Loja Integrada: "${invalidos.join(', ')}"`
      + `${forma ? ` (pagamento: ${forma})` : ''}. O ID da transação é só números, como aparece no painel da Loja Integrada`
      + `${invalidos.some(t => /^\d+-[0-9a-f-]{20,}$/i.test(t)) ? ' — esse é o código do checkout do Mercado Pago, não o da transação' : ''}; `
      + 'por isso o pedido não foi criado no Zen. Digite o ID da transação certo (painel da Loja Integrada) no campo abaixo e envie de novo.');
  }
  return ''; // pagamento sem ID de transação (ex.: depósito/boleto manual): segue sem tag
}

export async function criarPedidoLojinhaZen(pedido) {
  if (!pedido.vendedora_id_zen) throw new Error('Vendedora sem cadastro no Zen.');
  const itens = calcularItens(pedido);
  if (!itens.length) throw new Error('Pedido sem produtos.');

  let zenPedidoId = pedido.zen_pedido_id || null;
  if (zenPedidoId) {
    try { await zen('GET', `/sale/sale/${zenPedidoId}`); }
    catch (e) { if (/→ 404/.test(e.message)) zenPedidoId = null; else throw e; }
  }

  const pessoa = await buscarPessoa(pedido);
  const cfop = cfopLojinha(pessoa);
  const perfil = perfilVendaLojinha(pessoa);
  const resultado = { zenPedidoId: null, ordemSeparacaoId: null, cfop: cfop.codigo, perfilVenda: perfil.nome };
  // Pedido novo: sem ID da transação válido, não cria (erro explicativo na tela).
  // Pedido já criado no Zen: só completa a tag se der.
  const transacao = zenPedidoId
    ? await transacaoLojinha(pedido.numero_pedido, pedido.transacao_manual).catch(() => '')
    : await transacaoLojinha(pedido.numero_pedido, pedido.transacao_manual);

  // 1. Cabeçalho
  if (!zenPedidoId) {
    const obs = [`LB: ${pedido.numero_pedido}`,
      `Envio: ${pedido.tipo_envio}${pedido.transportadora ? ` - ${pedido.transportadora}` : ''}`].join('\n');
    const venda = await zen('POST', '/sale/sale', {
      company:                { id: CFG.company },
      saleProfile:            { id: perfil.id },
      fiscalProfileOperation: { id: perfil.id === CFG.saleProfileRegimeNormal || cfop.codigo !== '6.108' ? CFG.fiscalOpVenda : CFG.fiscalOpNaoContrib },
      person:                 { id: pessoa.id },
      personSalesperson:      { id: Number(pedido.vendedora_id_zen) },
      ...(transportadoraZen(pedido) ? { personShipping: { id: transportadoraZen(pedido) } } : {}),
      code:                   String(pedido.numero_pedido),
      ...(transacao ? { tags: transacao } : {}),
      freightType:            'ISSUER',
      currency:               { id: CFG.currency },
      availabilityDate:       hojeSP(),
      properties:             { comments: obs, paymentMethods: '0', salesCommission: 0 },
    });
    zenPedidoId = venda?.id;
    if (!zenPedidoId) throw new Error('O Zen não devolveu o ID do pedido.');
  }
  resultado.zenPedidoId = zenPedidoId;

  try {
    let venda = await zen('GET', `/sale/sale/${zenPedidoId}`);

    // 2. Itens (só em preparação)
    if (venda.status === 'PREPARING') {
      const existentes = await zen('GET', `/sale/saleItem?q=${q(`sale.id==${zenPedidoId}`)}&max=200`);
      const ja = new Set((existentes || []).map(i => String(i.productPacking?.code || '')));
      for (const it of itens) {
        if (ja.has(String(it.codigo))) continue;
        const emb = await buscarEmbalagem(it.codigo);
        const corpo = {
          sale:              { id: zenPedidoId },
          productPacking:    { id: emb.id },
          taxationOperation: { id: cfop.id },
          quantity:          Number(it.quantidade),
          unitValue:         Number(it.preco),
          currency:          { id: CFG.currency },
          discountType:      it.desconto_pct > 0 ? 'PERCENTAGE' : 'NONE',
          discountAmount:    it.desconto_pct > 0 ? it.desconto_pct : 0,
        };
        if (it.frete > 0) corpo.otherValues = { freightValue: it.frete };
        if (emb.product?.fiscalProfileProduct?.id) corpo.fiscalProfileProduct = { id: emb.product.fiscalProfileProduct.id };
        await zen('POST', '/sale/saleItem', corpo);
      }
      const semTag = transacao && !String(venda.tags || '').split(',').includes(transacao.split(',')[0]);
      if (venda.properties?.paymentMethods == null || semTag) {
        venda.properties = { ...(venda.properties || {}), paymentMethods: venda.properties?.paymentMethods ?? '0' };
        if (semTag) venda.tags = [venda.tags, transacao].filter(Boolean).join(',');
        await zen('PUT', '/sale/sale', venda);
      }
      await zen('POST', `/sale/saleOpPrepare/${zenPedidoId}`);
      venda = await zen('GET', `/sale/sale/${zenPedidoId}`);
    }

    // 3. Aprovar
    if (venda.status === 'PREPARED') {
      await zen('POST', `/sale/saleOpApproveUnconditionally/${zenPedidoId}`);
      venda = await zen('GET', `/sale/sale/${zenPedidoId}`);
    }

    // 4. Ordem de separação (perfil LOJINHA)
    if (venda.pickingOrder?.id) {
      resultado.ordemSeparacaoId = venda.pickingOrder.id;
    } else if (venda.status === 'APPROVED') {
      const tag = new Date().toISOString().replace(/\D/g, '').substring(2, 14);
      const ordem = await zen('POST', `/sale/saleOpPickingOrderCreate/${zenPedidoId}`, {
        pickingProfileId: CFG.pickingProfile,
        properties: { saleOpPickingOrderCreate_tag: tag },
      });
      resultado.ordemSeparacaoId = ordem?.id || (await zen('GET', `/sale/sale/${zenPedidoId}`))?.pickingOrder?.id || null;
    } else {
      throw new Error(`Pedido ${zenPedidoId} no Zen está com status ${venda.status} — não dá pra gerar a ordem de separação.`);
    }
    if (!resultado.ordemSeparacaoId) throw new Error(`Ordem de separação do pedido ${zenPedidoId} não retornou ID.`);
  } catch (err) {
    err.zenPedidoId = zenPedidoId;
    throw err;
  }
  return resultado;
}
