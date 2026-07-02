import { getToken } from '../integrations/erpZen.js';

const ZEN_BASE_URL = 'https://api.zenerp.app.br';
const ZEN_TENANT   = 'boxer';
const INTERVALO_MS = 5 * 60 * 1000;

let _jobAtivo = false;
let _intervalId = null;
let _ultimaSync = null;
let _ultimoResultado = null;

async function buscarEstoquePorCodigo(token, codigo) {
  const url = `${ZEN_BASE_URL}/material/stock?q=productPacking.code%3D%3D%22${encodeURIComponent(codigo)}%22&max=500`;
  const response = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'tenant': ZEN_TENANT,
    },
  });
  if (!response.ok) return 0;
  const items = await response.json();
  if (!Array.isArray(items)) return 0;
  return items
    .filter(i => i.status === 'FREE' && i.type === 'REGULAR')
    .reduce((sum, i) => sum + (i.quantity || 0), 0);
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
    const codigos = result.rows.map(r => r.codigo);
    console.log(`[SyncERP] Buscando estoque de ${codigos.length} pecas...`);
    let atualizados = 0;
    for (const codigo of codigos) {
      const quantidade = await buscarEstoquePorCodigo(token, codigo);
      await db.query(
        `UPDATE materiais SET quantidade_erp = $1, ultima_sync_erp = NOW() WHERE codigo = $2`,
        [quantidade, codigo]
      );
      atualizados++;
    }
    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    _ultimaSync = new Date();
    _ultimoResultado = { atualizados, total: codigos.length, duracao };
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
