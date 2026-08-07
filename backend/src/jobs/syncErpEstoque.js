import { getToken } from '../integrations/erpZen.js';

const ZEN_BASE_URL = 'https://api.zenerp.app.br';
const ZEN_TENANT   = 'boxer';
const INTERVALO_MS = 5 * 60 * 1000;
const TAMANHO_PAGINA = 500;

// Guarda contra chamadas concorrentes na MESMA instância de processo
// (útil no Railway/local, onde o processo fica vivo; numa instância
// serverless "fria" da Vercel esse valor sempre nasce false, o que é
// esperado — cada invocação é isolada).
let _jobAtivo = false;
let _intervalId = null;

async function buscarPagina(token, offset) {
  const filtro = 'productPacking.product.productProfile.code==\"PEC\" or productPacking.product.productProfile.code==\"PEC/S\"';
  const url = `${ZEN_BASE_URL}/material/stock?q=${encodeURIComponent(filtro)}&first=${offset}&max=${TAMANHO_PAGINA}`;
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
  if (_jobAtivo) return statusSyncErp(db);
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
    const CODIGO_DEBUG = '701879'; // diagnóstico temporário
    while (continua) {
      const pagina = await buscarPagina(token, offset);
      if (pagina.length === 0) { continua = false; break; }
      for (const item of pagina) {
        const produto = item.productPacking?.product;
        if (!produto) continue;
        if (produto.code === CODIGO_DEBUG) {
          console.log(`[SyncERP][DEBUG ${CODIGO_DEBUG}] offset=${offset} quantity=${item.quantity} status=${item.status} type=${item.type}`);
        }
        if (item.status !== 'FREE') continue;
        if (item.type !== 'REGULAR') continue;
        const codigo = produto.code;
        if (!codigosSet.has(codigo)) continue;
        saldos[codigo] = (saldos[codigo] || 0) + (item.quantity || 0);
      }
      totalRegistros += pagina.length;
      offset += pagina.length;
      console.log(`[SyncERP] Processados ${totalRegistros} registros PEC do ERP...`);
      if (pagina.length < TAMANHO_PAGINA) continua = false;
    }
    console.log(`[SyncERP][DEBUG ${CODIGO_DEBUG}] Total somado ao final: ${saldos[CODIGO_DEBUG]}`);
    const codigos = Array.from(codigosSet);
    const quantidades = codigos.map(c => saldos[c] || 0);
    await db.query(
      `UPDATE materiais SET quantidade_erp = data.qtd, ultima_sync_erp = NOW()
       FROM (SELECT UNNEST($1::text[]) AS cod, UNNEST($2::int[]) AS qtd) AS data
       WHERE materiais.codigo = data.cod`,
      [codigos, quantidades]
    );
    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    const resultado = { atualizados: codigos.length, total: codigosSet.size, totalRegistrosERP: totalRegistros, duracao };

    await db.query(
      `UPDATE sync_erp_status
       SET ultima_sync = NOW(), atualizados = $1, total_monitorado = $2,
           total_registros_erp = $3, duracao_segundos = $4, erro = NULL
       WHERE id = 1`,
      [resultado.atualizados, resultado.total, resultado.totalRegistrosERP, duracao]
    );

    console.log(`[SyncERP] Concluido em ${duracao}s - ${codigos.length} pecas atualizadas.`);
    return resultado;
  } catch (err) {
    console.error('[SyncERP] Erro:', err.message);
    await db.query(
      `UPDATE sync_erp_status SET ultima_sync = NOW(), erro = $1 WHERE id = 1`,
      [err.message]
    ).catch(() => {}); // se até isso falhar, não derruba a resposta
    throw err;
  } finally {
    _jobAtivo = false;
  }
}

// Mantido só pro modo processo-contínuo (Railway/local via `node server.js`).
// Não é chamado em ambiente serverless (ver server.js).
export function iniciarSyncErp(db) {
  console.log('[SyncERP] Job iniciado. Intervalo: 5 minutos.');
  executarSync(db).catch(() => {});
  _intervalId = setInterval(() => executarSync(db).catch(() => {}), INTERVALO_MS);
}

export function pararSyncErp() {
  if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
}

// Lê o status persistido no banco — funciona igual em processo
// contínuo (Railway) ou serverless (Vercel), já que não depende de
// memória do processo.
export async function statusSyncErp(db) {
  const result = await db.query(`SELECT * FROM sync_erp_status WHERE id = 1`);
  const row = result.rows[0];
  if (!row) return { ativo: _jobAtivo, ultimaSync: null, ultimoResultado: null, intervaloMinutos: 5 };
  return {
    ativo: _jobAtivo,
    ultimaSync: row.ultima_sync,
    ultimoResultado: row.ultima_sync ? {
      atualizados: row.atualizados,
      total: row.total_monitorado,
      totalRegistrosERP: row.total_registros_erp,
      duracao: row.duracao_segundos,
    } : null,
    erro: row.erro,
    intervaloMinutos: 5,
  };
}

export async function forcerSync(db) {
  return await executarSync(db);
}

// DIAGNÓSTICO — retorna os itens brutos do ZenERP para um código
// específico, SEM aplicar os filtros de status/type/profile. Usado
// só pra investigar divergências entre o app e o ERP. Não afeta a
// sincronização normal.
export async function debugEstoquePorCodigo(codigo) {
  const token = await getToken();
  const filtro = `(productPacking.product.productProfile.code=="PEC" or productPacking.product.productProfile.code=="PEC/S") and productPacking.product.code=="${codigo}"`;
  const url = `${ZEN_BASE_URL}/material/stock?q=${encodeURIComponent(filtro)}&first=0&max=500`;
  const response = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'tenant': ZEN_TENANT,
    },
  });
  if (!response.ok) {
    const erro = await response.text().catch(() => '');
    throw new Error(`ZenERP respondeu ${response.status}: ${erro}`);
  }
  const pagina = await response.json();
  const itens = Array.isArray(pagina) ? pagina : [];
  return itens; // retorna o objeto CRU completo, sem filtrar campos
}
