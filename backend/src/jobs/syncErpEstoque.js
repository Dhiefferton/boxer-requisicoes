import { getToken } from '../integrations/erpZen.js';
import { MAQUINAS_LISTA } from './maquinasLista.js';

const ZEN_BASE_URL = 'https://api.zenerp.app.br';
const ZEN_TENANT   = 'boxer';
const INTERVALO_MS = 5 * 60 * 1000;

// Guarda contra chamadas concorrentes na MESMA instância de processo
// (útil no Railway/local, onde o processo fica vivo; numa instância
// serverless "fria" da Vercel esse valor sempre nasce false, o que é
// esperado — cada invocação é isolada).
let _jobAtivo = false;
let _intervalId = null;

async function executarSync(db) {
  if (_jobAtivo) return statusSyncErp(db);
  _jobAtivo = true;
  const inicio = Date.now();
  console.log('[SyncERP] Iniciando sincronizacao com ZenERP...');
  try {
    const result = await db.query(
      `SELECT m.codigo FROM materiais m
       JOIN categorias c ON c.id = m.categoria_id
       WHERE c.id = 6 AND m.ativo = TRUE`
    );
    const codigosSet = new Set(result.rows.map(r => r.codigo));
    console.log(`[SyncERP] Monitorando ${codigosSet.size} pecas...`);
    const dados = await buscaEstoque();
    const linhas = Array.isArray(dados) ? dados : [];
    const saldos = {};
    for (const item of linhas) {
      const codigo = item.product_code;
      if (!codigo || !codigosSet.has(codigo)) continue;
      saldos[codigo] = (saldos[codigo] || 0) + (item.sum_quantity || 0);
    }
    const totalRegistros = linhas.length;
    console.log(`[SyncERP] Processados ${totalRegistros} registros PEC do ERP...`);
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

    // Máquinas (perfil MAQ no Zen) — mesmo esquema das peças. Erro aqui
    // não derruba a sincronização das peças.
    try {
      resultado.maquinas = await sincronizarMaquinas(db);
    } catch (errMaq) {
      console.error('[SyncERP] Erro nas maquinas:', errMaq.message);
      resultado.maquinas = { erro: errMaq.message };
    }
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

async function buscaEstoque(perfis = [1002, 1003]) {
  const token = await getToken();
  const url = `${ZEN_BASE_URL}/system/data/dataSourceOpRead`;
  const body = {
    'code': "/material/report/stockCube",
    'parameters': {
      'SHOW_PRODUCT': true,
      'SHOW_PRODUCT_PACKING': true,
      'PRODUCT_PROFILE_IDS': perfis,
      'TYPE_LIST': ["REGULAR"]
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'tenant': ZEN_TENANT
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const erro = await response.text().catch(() => '');
    throw new Error(`ZenERP respondeu ${response.status}: ${erro}`);
  }
  return await response.json();
}

// ============================================================
// MÁQUINAS — mesmo esquema de Partes e Peças, mas puxando do Zen os
// produtos do perfil MAQ. A cada sincronização:
//   1. garante a categoria "Máquinas" no catálogo;
//   2. lê o saldo do Zen (stockCube) dos perfis MAQ;
//   3. cadastra automaticamente as máquinas com saldo que ainda não
//      existem no catálogo;
//   4. atualiza quantidade_erp de todas as máquinas do catálogo
//      (as que não aparecem no Zen ficam com 0).
// ============================================================
export const CATEGORIA_MAQUINAS = 'Máquinas';
const PERFIS_MAQ = (process.env.ZEN_MAQ_PERFIS || 'MAQ,MAQ/S')
  .split(',').map(s => s.trim()).filter(Boolean);
const MAX_NOVAS_POR_SYNC = 300;

let _idsPerfisMaq = null;

async function zenGet(token, caminho) {
  const response = await fetch(`${ZEN_BASE_URL}${caminho}`, {
    headers: { 'accept': 'application/json', 'Authorization': `Bearer ${token}`, 'tenant': ZEN_TENANT },
  });
  if (!response.ok) {
    const erro = await response.text().catch(() => '');
    throw new Error(`ZenERP respondeu ${response.status}: ${erro.slice(0, 200)}`);
  }
  return response.json();
}

// Registros de estoque crus de um filtro (1 registro por série)
async function stockPorFiltro(token, filtro, max = 1) {
  const j = await zenGet(token, `/material/stock?q=${encodeURIComponent(filtro)}&first=0&max=${max}`);
  return Array.isArray(j) ? j : [];
}

// IDs dos perfis MAQ no Zen (o stockCube filtra por ID, não por código).
// Descobre pelo próprio estoque; pode ser fixado com ZEN_MAQ_PROFILE_IDS.
async function idsPerfisMaquinas(token) {
  if (process.env.ZEN_MAQ_PROFILE_IDS) {
    return process.env.ZEN_MAQ_PROFILE_IDS.split(',').map(Number).filter(Boolean);
  }
  if (_idsPerfisMaq?.length) return _idsPerfisMaq;
  const ids = new Set();
  for (const codigo of PERFIS_MAQ) {
    const itens = await stockPorFiltro(token, `productPacking.product.productProfile.code=="${codigo}"`);
    const id = itens[0]?.productPacking?.product?.productProfile?.id;
    if (id) ids.add(Number(id));
  }
  _idsPerfisMaq = [...ids];
  return _idsPerfisMaq;
}

// Garante a categoria "Máquinas" e devolve o id dela
export async function garantirCategoriaMaquinas(db) {
  await db.query(
    `INSERT INTO categorias (nome, icone, ordem) VALUES ($1, 'cog', 7)
     ON CONFLICT (nome) DO NOTHING`,
    [CATEGORIA_MAQUINAS]
  );
  const r = await db.query(`SELECT id FROM categorias WHERE nome = $1`, [CATEGORIA_MAQUINAS]);
  return r.rows[0].id;
}

function textoLinha(item, ...campos) {
  for (const c of campos) if (item[c]) return String(item[c]).trim();
  return '';
}

// Janela em que a versão anterior cadastrava/movia máquinas sozinha pelo
// perfil MAQ do Zen. O que entrou assim e não está na lista oficial é
// desfeito: o que veio de "Partes e Peças" volta pra lá, o que foi criado
// automaticamente é desativado.
const JANELA_AUTO_INICIO = '2026-10-09T12:00:00Z';
const JANELA_AUTO_FIM    = '2026-10-09T16:30:00Z';

async function desfazerAutomaticas(db, categoriaId, codigosLista) {
  const pecas = await db.query(`SELECT id FROM categorias WHERE nome = 'Partes e Peças'`);
  const pecasId = pecas.rows[0]?.id;
  let voltaramPecas = 0, desativadas = 0;
  if (pecasId) {
    const r = await db.query(
      `UPDATE materiais SET categoria_id = $1, updated_at = NOW()
        WHERE categoria_id = $2 AND NOT (codigo = ANY($3::text[]))
          AND created_at < $4 AND updated_at BETWEEN $4 AND $5`,
      [pecasId, categoriaId, codigosLista, JANELA_AUTO_INICIO, JANELA_AUTO_FIM]
    );
    voltaramPecas = r.rowCount;
  }
  const d = await db.query(
    `UPDATE materiais SET ativo = FALSE, updated_at = NOW()
      WHERE categoria_id = $1 AND ativo = TRUE AND NOT (codigo = ANY($2::text[]))
        AND created_at BETWEEN $3 AND $4`,
    [categoriaId, codigosLista, JANELA_AUTO_INICIO, JANELA_AUTO_FIM]
  );
  desativadas = d.rowCount;
  return { voltaramPecas, desativadas };
}

// Saldo de um código direto pelo estoque (para máquinas da lista que não
// estão no perfil MAQ do Zen): soma os registros livres.
async function saldoPorCodigo(token, codigo) {
  const itens = await stockPorFiltro(token, `productPacking.product.code=="${codigo}"`, 500);
  return itens.filter(i => i.status === 'FREE').reduce((s, i) => s + (Number(i.quantity) || 0), 0);
}

export async function sincronizarMaquinas(db) {
  const inicio = Date.now();
  const categoriaId = await garantirCategoriaMaquinas(db);
  const lista = MAQUINAS_LISTA;
  const codigosLista = lista.map(l => l[0]);

  // 1. A categoria Máquinas contém todos os itens da lista oficial:
  //    cadastra os que faltam e traz os que estão em outra categoria.
  const existentes = await db.query(
    `SELECT m.id, m.codigo, m.categoria_id, m.ativo, c.nome AS categoria FROM materiais m
       JOIN categorias c ON c.id = m.categoria_id
      WHERE m.codigo = ANY($1::text[])`, [codigosLista]);
  const porCodigo = new Map(existentes.rows.map(r => [r.codigo, r]));
  const movidas = [];
  let cadastradas = 0;
  for (const [codigo, descricao, minimo] of lista) {
    const atual = porCodigo.get(codigo);
    try {
      if (!atual) {
        const ins = await db.query(
          `INSERT INTO materiais (codigo, descricao, categoria_id, unidade)
           VALUES ($1, $2, $3, 'UN') ON CONFLICT (codigo) DO NOTHING RETURNING id`,
          [codigo, descricao.slice(0, 255), categoriaId]
        );
        if (ins.rows[0]) {
          await db.query(
            `INSERT INTO estoques (material_id, quantidade, nivel_minimo) VALUES ($1, 0, $2)
             ON CONFLICT (material_id) DO NOTHING`,
            [ins.rows[0].id, Math.max(0, minimo || 0)]
          );
          cadastradas++;
        }
      } else if (atual.categoria_id !== categoriaId || !atual.ativo) {
        await db.query(
          `UPDATE materiais SET categoria_id = $1, ativo = TRUE, updated_at = NOW() WHERE id = $2`,
          [categoriaId, atual.id]
        );
        if (atual.categoria_id !== categoriaId) movidas.push(`${codigo} (${atual.categoria})`);
      }
    } catch (e) {
      console.error(`[SyncERP] Maquina ${codigo}:`, e.message);
    }
  }

  // 2. Desfaz o que a versão automática anterior colocou fora da lista
  const desfeitas = await desfazerAutomaticas(db, categoriaId, codigosLista);

  // 3. Saldo do Zen: perfil MAQ pelo stockCube (igual às peças); o que
  //    não estiver no perfil MAQ é consultado código a código.
  const token = await getToken();
  const saldos = {};
  let registrosErp = 0;
  const perfis = await idsPerfisMaquinas(token).catch(() => []);
  if (perfis.length) {
    const linhas = await buscaEstoque(perfis);
    for (const item of (Array.isArray(linhas) ? linhas : [])) {
      if (!item.product_code) continue;
      saldos[item.product_code] = (saldos[item.product_code] || 0) + (item.sum_quantity || 0);
    }
    registrosErp = Array.isArray(linhas) ? linhas.length : 0;
  }
  const doCatalogo = await db.query(
    `SELECT codigo FROM materiais WHERE categoria_id = $1 AND ativo = TRUE`, [categoriaId]
  );
  const codigos = doCatalogo.rows.map(r => r.codigo);
  const foraDoPerfil = codigos.filter(c => saldos[c] === undefined);
  for (let i = 0; i < foraDoPerfil.length; i += 10) {   // 10 por vez
    await Promise.all(foraDoPerfil.slice(i, i + 10).map(async codigo => {
      try { saldos[codigo] = await saldoPorCodigo(token, codigo); }
      catch (e) { console.error(`[SyncERP] Saldo ${codigo}:`, e.message); }
    }));
  }
  const quantidades = codigos.map(c => Math.max(0, Math.round(saldos[c] || 0)));
  if (codigos.length) {
    await db.query(
      `UPDATE materiais SET quantidade_erp = data.qtd, ultima_sync_erp = NOW()
       FROM (SELECT UNNEST($1::text[]) AS cod, UNNEST($2::int[]) AS qtd) AS data
       WHERE materiais.codigo = data.cod`,
      [codigos, quantidades]
    );
  }

  const resultado = {
    lista: codigosLista.length, cadastradas, movidas_para_maquinas: movidas,
    voltaram_para_pecas: desfeitas.voltaramPecas, desativadas_fora_da_lista: desfeitas.desativadas,
    perfis, registros_erp: registrosErp, fora_do_perfil_maq: foraDoPerfil.length,
    atualizadas: codigos.length,
    duracao: ((Date.now() - inicio) / 1000).toFixed(1),
  };
  console.log('[SyncERP] Maquinas:', JSON.stringify(resultado));
  return resultado;
}
