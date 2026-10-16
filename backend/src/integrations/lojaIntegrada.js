// ============================================================
// integrations/lojaIntegrada.js — API oficial da Loja Integrada (v1)
// ============================================================
// Busca um pedido da lojinha pelo número e devolve só o que a tela
// Lojinha Boxer precisa: data, documento do cliente, itens (SKU, qtd,
// preço), valor do frete e forma de envio.
// Variáveis de ambiente (Vercel, projeto do backend):
//   LOJA_INTEGRADA_CHAVE_API        → Painel > Configurações > Chave para API
//   LOJA_INTEGRADA_CHAVE_APLICACAO  → chave de aplicação fornecida pela Loja Integrada
// ============================================================
const BASE = 'https://api.awsli.com.br/v1';

export function lojaIntegradaConfigurada() {
  return Boolean(process.env.LOJA_INTEGRADA_CHAVE_API && process.env.LOJA_INTEGRADA_CHAVE_APLICACAO);
}

// Formas de autenticação aceitas pela API (a que funcionar fica memorizada)
const AUTENTICACOES = [
  { nome: 'header chave_api/aplicacao', h: (k, a) => ({ Authorization: `chave_api ${k} aplicacao ${a}` }) },
  { nome: 'header (chaves invertidas)', h: (k, a) => ({ Authorization: `chave_api ${a} aplicacao ${k}` }) },
  { nome: 'query chave_api/chave_aplicacao', q: (k, a) => ({ chave_api: k, chave_aplicacao: a }) },
  { nome: 'bearer personal token', h: (k, a) => ({ Authorization: `Bearer ${a}` }) },
  { nome: 'bearer + chave_api', h: (k, a) => ({ Authorization: `Bearer ${a}`, 'chave-api': k }) },
  { nome: 'token personal', h: (k, a) => ({ Authorization: `Token ${a}` }) },
];
let authOk = null;
export const tentativasLI = [];

async function getLI(caminho) {
  const chave = (process.env.LOJA_INTEGRADA_CHAVE_API || '').trim();
  const app = (process.env.LOJA_INTEGRADA_CHAVE_APLICACAO || '').trim();
  if (!chave || !app) {
    const e = new Error('Integração com a Loja Integrada não configurada (faltam as chaves da API no servidor).');
    e.status = 503; throw e;
  }
  let url = caminho.startsWith('http') ? caminho
    : caminho.startsWith('/api/v1') ? `https://api.awsli.com.br${caminho.replace('/api', '')}` : `${BASE}${caminho}`;
  if (!/[/?]$/.test(url) && !url.includes('?')) url += '/';
  const ordem = authOk ? [authOk, ...AUTENTICACOES.filter(x => x !== authOk)] : AUTENTICACOES;
  tentativasLI.length = 0;
  let ultimo = null;
  for (const a of ordem) {
    const u = new URL(url);
    if (a.q) for (const [k, v] of Object.entries(a.q(chave, app))) u.searchParams.set(k, v);
    const r = await fetch(u, {
      headers: { Accept: 'application/json', ...(a.h ? a.h(chave, app) : {}) },
      signal: AbortSignal.timeout(20000),
    });
    const texto = await r.text();
    let dados; try { dados = JSON.parse(texto); } catch { dados = null; }
    tentativasLI.push({ forma: a.nome, status: r.status, resposta: texto.slice(0, 200) });
    if (r.ok) { authOk = a; return dados; }
    ultimo = { r, dados, texto };
    if (r.status !== 401 && r.status !== 403) break;
  }
  const { r, dados, texto } = ultimo;
  const e = new Error(r.status === 404 ? 'Pedido não encontrado na Loja Integrada.'
    : r.status === 401 || r.status === 403 ? 'A Loja Integrada recusou as chaves da API (confira a chave_api e a chave_aplicacao).'
    : `Loja Integrada respondeu ${r.status}: ${(dados && (dados.error_message || dados.message)) || texto.slice(0, 200)}`);
  e.status = r.status === 404 ? 404 : 502; throw e;
}

export const pedidoLIBruto = (numero) => getLI(`/pedido/${encodeURIComponent(numero)}`);

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const soDigitos = (v) => String(v || '').replace(/\D/g, '');

// Sedex / PAC / Próprio / Transportadora a partir da forma de envio da loja
export function tipoEnvioLI(nome) {
  const s = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/sedex/.test(s)) return 'Sedex';
  if (/\bpac\b/.test(s)) return 'PAC';
  if (/retir|propri|motoboy|entrega local|balcao/.test(s)) return 'Próprio';
  if (s) return 'Transportadora';
  return '';
}

// Pedido da Loja Integrada → campos da tela Lojinha Boxer
export async function buscarPedidoLI(numero) {
  const p = await pedidoLIBruto(numero);
  if (!p || typeof p !== 'object') throw Object.assign(new Error('Resposta inválida da Loja Integrada.'), { status: 502 });

  // Cliente: pode vir como objeto ou como link para /cliente/{id}
  let cliente = p.cliente;
  if (typeof cliente === 'string') { try { cliente = await getLI(cliente); } catch { cliente = null; } }
  const end = p.endereco_entrega || {};
  const documento = [end.cnpj, end.cpf, cliente?.cnpj, cliente?.cpf]
    .map(soDigitos).find(d => d.length === 14 || d.length === 11) || '';

  const envio = (Array.isArray(p.envios) && p.envios[0]) || {};
  const forma = envio.forma_envio || {};
  const nomeEnvio = [forma.nome, forma.tipo, forma.code].filter(Boolean).join(' ') || '';

  const itens = (Array.isArray(p.itens) ? p.itens : []).map(i => ({
    sku: String(i.sku || '').trim(),
    nome: i.nome || '',
    quantidade: num(i.quantidade),
    preco: num(i.preco_venda ?? i.preco_promocional ?? i.preco_cheio),
  })).filter(i => i.sku && i.quantidade > 0);

  return {
    numero: String(p.numero ?? numero),
    data: String(p.data_criacao || '').slice(0, 10) || null,
    situacao: p.situacao?.nome || p.situacao?.codigo || '',
    documento,
    cliente_nome: end.nome || cliente?.nome || end.razao_social || '',
    uf: end.estado || '',
    itens,
    valor_frete: num(p.valor_envio ?? envio.valor),
    envio_nome: forma.nome || nomeEnvio,
    tipo_envio: tipoEnvioLI(nomeEnvio),
  };
}
