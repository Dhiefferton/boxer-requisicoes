// ============================================================
// services/planilhaMicrosoft.js — alimenta a planilha de Inventário
// que fica no OneDrive/SharePoint, pela API do Microsoft Graph.
//
// O login é feito no navegador (popup da Microsoft) com a conta de quem
// clicou — nenhum segredo fica no sistema. As linhas entram direto nas
// tabelas da planilha (Tabela5 e Tabela11), então fórmulas, KPIs e
// gráficos continuam funcionando.
// ============================================================

const GRAPH = 'https://graph.microsoft.com/v1.0';
const ESCOPO = 'Files.ReadWrite.All';
const CHAVE_TOKEN = 'boxer_ms_token';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function aleatorio(n = 32) {
  const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a);
}

function tokenGuardado() {
  try {
    const t = JSON.parse(sessionStorage.getItem(CHAVE_TOKEN) || 'null');
    if (t && t.expira > Date.now() + 60_000) return t.token;
  } catch { /* ignora */ }
  return null;
}

// Login Microsoft (OAuth2 código + PKCE, em popup)
export async function loginMicrosoft({ clientId, tenantId }) {
  const guardado = tokenGuardado();
  if (guardado) return guardado;

  const redirect = `${location.origin}/ms-auth.html`;
  const verificador = aleatorio(48);
  const desafio = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
  const estado = aleatorio(16);
  const base = `https://login.microsoftonline.com/${tenantId || 'organizations'}/oauth2/v2.0`;
  const url = `${base}/authorize?` + new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: redirect, response_mode: 'query',
    scope: ESCOPO, state: estado, code_challenge: desafio, code_challenge_method: 'S256', prompt: 'select_account',
  });

  const popup = window.open(url, 'boxer_ms_login', 'width=520,height=680');
  if (!popup) throw new Error('O navegador bloqueou a janela de login da Microsoft. Libere pop-ups para este site.');

  const retorno = await new Promise((ok, erro) => {
    const canal = 'BroadcastChannel' in window ? new BroadcastChannel('boxer-ms-auth') : null;
    let fim = false;
    const terminar = (fn, v) => {
      if (fim) return; fim = true;
      clearInterval(vigia); window.removeEventListener('message', onMsg); canal?.close();
      try { localStorage.removeItem('boxer_ms_auth'); } catch { /* ignora */ }
      fn(v);
    };
    const tratar = (href) => {
      if (!href) return;
      const p = new URL(href).searchParams;
      if (p.get('state') !== estado) return;
      if (p.get('error')) return terminar(erro, new Error(p.get('error_description') || p.get('error')));
      terminar(ok, p.get('code'));
    };
    const onMsg = (e) => { if (e.origin === location.origin && e.data?.tipo === 'ms-auth') tratar(e.data.url); };
    window.addEventListener('message', onMsg);
    if (canal) canal.onmessage = (e) => tratar(e.data?.url);
    const vigia = setInterval(() => {
      try { tratar(JSON.parse(localStorage.getItem('boxer_ms_auth') || 'null')?.url); } catch { /* ignora */ }
      try { if (popup.location.origin === location.origin) tratar(popup.location.href); } catch { /* ainda na Microsoft */ }
      if (popup.closed) setTimeout(() => terminar(erro, new Error('Login cancelado.')), 800);
    }, 400);
  });
  try { popup.close(); } catch { /* ignora */ }

  const r = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, grant_type: 'authorization_code', code: retorno,
      redirect_uri: redirect, code_verifier: verificador, scope: ESCOPO,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || 'Não consegui obter o acesso da Microsoft.');
  try { sessionStorage.setItem(CHAVE_TOKEN, JSON.stringify({ token: j.access_token, expira: Date.now() + (j.expires_in || 3600) * 1000 })); } catch { /* ignora */ }
  return j.access_token;
}

async function graph(token, metodo, caminho, corpo, sessao) {
  const headers = { Authorization: `Bearer ${token}` };
  if (corpo) headers['Content-Type'] = 'application/json';
  if (sessao) headers['workbook-session-id'] = sessao;
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(GRAPH + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
    if ((r.status === 429 || r.status === 503 || r.status === 504) && tentativa < 4) {
      await new Promise(ok => setTimeout(ok, (Number(r.headers.get('Retry-After')) || 2 + tentativa * 2) * 1000));
      continue;
    }
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401) { try { sessionStorage.removeItem(CHAVE_TOKEN); } catch { /* ignora */ } }
      const msg = j?.error?.message || `Erro ${r.status} no Microsoft Graph.`;
      if (r.status === 404) throw new Error('Planilha ou tabela não encontrada. Confira o link da planilha e se as tabelas Tabela5 e Tabela11 existem. (' + msg + ')');
      if (r.status === 403) throw new Error('Sua conta Microsoft não tem permissão de edição nessa planilha. (' + msg + ')');
      if (r.status === 423 || r.status === 409) throw new Error('A planilha está bloqueada (aberta no Excel do computador?). Feche e tente de novo. (' + msg + ')');
      throw new Error(msg);
    }
    return j;
  }
}

// Envia as linhas para as tabelas da planilha
export async function alimentarPlanilha({ token, arquivoUrl, linhasDados, linhaTempos, aoProgredir }) {
  const idCompart = 'u!' + b64url(new TextEncoder().encode(arquivoUrl));
  aoProgredir?.('Abrindo a planilha…');
  const item = await graph(token, 'GET', `/shares/${idCompart}/driveItem?$select=id,name,parentReference`);
  const raiz = `/drives/${item.parentReference.driveId}/items/${item.id}/workbook`;

  let sessao = null;
  try { sessao = (await graph(token, 'POST', `${raiz}/createSession`, { persistChanges: true }))?.id; }
  catch { sessao = null; /* segue sem sessão */ }

  try {
    const LOTE = 250;
    for (let i = 0; i < linhasDados.length; i += LOTE) {
      aoProgredir?.(`Lançando itens ${Math.min(i + LOTE, linhasDados.length)} de ${linhasDados.length}…`);
      await graph(token, 'POST', `${raiz}/tables/Tabela5/rows`, { values: linhasDados.slice(i, i + LOTE) }, sessao);
    }
    if (linhaTempos) {
      aoProgredir?.('Lançando os tempos por curva…');
      await graph(token, 'POST', `${raiz}/tables/Tabela11/rows`, { values: [linhaTempos] }, sessao);
    }
  } finally {
    if (sessao) await graph(token, 'POST', `${raiz}/closeSession`, null, sessao).catch(() => {});
  }
  return { arquivo: item.name };
}

// Data no formato do Excel (número de série), no fuso de São Paulo
export function dataExcel(iso) {
  const [a, m, d] = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return Date.UTC(a, m - 1, d) / 86400000 + 25569;
}
