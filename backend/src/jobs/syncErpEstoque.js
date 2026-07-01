import { consultarEstoque } from '../integrations/erpZen.js';

const INTERVALO_MS = 5 * 60 * 1000;

let _jobAtivo = false;
let _intervalId = null;
let _ultimaSync = null;
let _ultimoResultado = null;

async function executarSync(db) {
  if (_jobAtivo) return;
  _jobAtivo = true;
  const inicio = Date.now();
  console.log('[SyncERP] Iniciando sincronizacao com ZenERP...');
  try {
    const pecas = await consultarEstoque();
    let atualizados = 0;
    let naoEncontrados = 0;
    for (const peca of pecas) {
      const result = await db.query(
        `UPDATE materiais SET quantidade_erp = $1, ultima_sync_erp = NOW() WHERE codigo = $2`,
        [peca.quantidade, peca.codigo]
      );
      if (result.rowCount > 0) atualizados++;
      else naoEncontrados++;
    }
    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    _ultimaSync = new Date();
    _ultimoResultado = { atualizados, naoEncontrados, total: pecas.length, duracao };
    console.log(`[SyncERP] Concluido em ${duracao}s - ${atualizados} atualizados, ${naoEncontrados} nao encontrados.`);
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
