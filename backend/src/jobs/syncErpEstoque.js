import { getToken } from '../integrations/erpZen.js';

const ZEN_BASE_URL = 'https://api.zenerp.app.br';
const ZEN_TENANT   = 'boxer';
const INTERVALO_MS = 5 * 60 * 1000;
const TAMANHO_PAGINA = 500;

let _jobAtivo = false;
let _intervalId = null;
let _ultimaSync = null;
let _ultimoResultado = null;

async function buscarPagina(token, offset) {
  const url = `${ZEN_BASE_URL}/material/stock?first=${offset}&max=${TAMANHO_PAGINA}`;
  const response = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'tenant': ZEN_TENANT,
    },
  });
  if (!response.ok) return [];
  const items = await response.json();
  return Array.isArray(items) ? items : [];
}

async function executarSync(db) {
  if (_jobAtivo) return;
  _jobAtivo = true;
  const inicio = Date.now();
  console.log('[SyncERP] Iniciando sincronizacao com ZenERP...');
  try {
    const token = await getToken();
    const result = await db.query(
      `SELECT m.codigo FROM materiais m
       JOIN categorias c ON c.id = m.categoria_id
       WHERE c.id = 6 AND m.ativo = TRUE`
    );
    const codigosSet = new Set(result.rows.map(r => r.codigo));
    console.log(`[SyncERP] Monitorando ${codigosSet.size} pecas...`);
    const saldos = {};
    let offset = 0;
    let continua = true;
    let totalRegistros = 0;
    while (continua) {
      const pagina = await buscarPagina(token, offset);
      if (pagina.length === 0) { continua = false; break; }
      for (const item of pagina) {
        const produto = item.productPacking?.product;
        if (!produto) continue;
        if (produto.productProfile?.code !== 'PEC') continue;
        if (item.status !== 'FREE') continue;
        if (item.type !== 'REGULAR') continue;
        const codigo = produto.code;
        if (!codigosSet.has(codigo)) continue;
        saldos[codigo] = (saldos[codigo] || 0) + (item.quantity || 0);
      }
      totalRegistros += pagina.length;
      offset += pagina.length;
      console.log(`[SyncERP] Processados ${totalRegistros} registros do ERP...`);
      if (pagina.length < TAMANHO_PAGINA) continua = false;
    }
    let atualizados = 0;
    for (const codigo of codigosSet) {
      const quantidade = saldos[codigo] || 0;
      await db.query(
        `UPDATE materiais SET quantidade_erp = $1, ultima_sync_erp = NOW() WHERE codigo = $2`,
        [quantidade, codigo]
      );
      atualizados++;
    }
    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    _ultimaSync = new Date();
    _ultimoResultado = { atualizados, total: codigosSet.size, totalRegistrosERP: totalRegistros, duracao };
    console.log(`[SyncERP] Concluido em ${duracao}s - ${atualizados} pecas atualizadas.`);
  } catch (err) {
    console.error('[SyncERP] Erro:', err.message);
  } finally {
    _jobAtivo = false;
  }
}

export function iniciarSyncErp(db) {
  console.log('[SyncERP] Job iniciado. Intervalo: 5 minutos.');
  executarSync(db);
  _intervalId = setInterval(() => executarSync(db), INTERVALO_MS);
}

export function pararSyncErp() {
  if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
}

export function statusSyncErp() {
  return { ativo: _jobAtivo, ultimaSync: _ultimaSync, ultimoResultado: _ultimoResultado, intervaloMinutos: 5 };
}

export async function forcerSync(db) {
  await executarSync(db);
  return _ultimoResultado;
}
