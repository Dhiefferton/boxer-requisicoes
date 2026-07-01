// ============================================================
// integrations/erpZen.js — Integração com ZenERP
// Boxer Sistema de Requisição de Materiais
// ============================================================
// Fluxo:
//   1. POST /auth/login → obtém accessToken (válido 24h)
//   2. GET /material/stock?max=500 (paginado) → lista estoque
//   3. Filtra apenas productProfile.code === 'PEC'
//   4. Agrupa por código (soma quantity, pois a API retorna 1 por serial)
//   5. Retorna array normalizado para uso no sistema
// ============================================================

const ZEN_BASE_URL = 'https://api.zenerp.app.br';
const ZEN_TENANT   = 'boxer';
const ZEN_USERNAME = process.env.ZEN_USERNAME || 'compras@boxersoldas.com.br';
const ZEN_PASSWORD = process.env.ZEN_PASSWORD || '2311';
const ZEN_PROFILE  = 'PEC'; // productProfile.code para Partes e Peças

// Cache do token em memória (evita login a cada chamada)
let _tokenCache = null; // { accessToken, expiresAt }

// ------------------------------------------------------------
// 1. AUTENTICAÇÃO
// ------------------------------------------------------------

/**
 * Faz login na API do ZenERP e retorna o accessToken.
 * Reutiliza o token em cache enquanto ainda for válido.
 */
export async function getToken() {
  const agora = Date.now();

  // Reutiliza token em cache se ainda válido (com 5 min de margem)
  if (_tokenCache && _tokenCache.expiresAt > agora + 5 * 60 * 1000) {
    return _tokenCache.accessToken;
  }

  console.log('[ZenERP] Obtendo novo token de acesso...');

  const response = await fetch(`${ZEN_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'tenant': ZEN_TENANT,
    },
    body: JSON.stringify({
      username: ZEN_USERNAME,
      password: ZEN_PASSWORD,
      properties: {},
    }),
  });

  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(`[ZenERP] Falha no login: ${erro.message || response.status}`);
  }

  const data = await response.json();

  if (!data.accessToken) {
    throw new Error('[ZenERP] Login retornou sem accessToken');
  }

  // Token do ZenERP expira em 24h (86400s) — decodifica do JWT para pegar expiração real
  let expiresAt = agora + 23 * 60 * 60 * 1000; // fallback: 23h
  try {
    const payload = JSON.parse(Buffer.from(data.accessToken.split('.')[1], 'base64').toString());
    if (payload.exp) expiresAt = payload.exp * 1000;
  } catch (_) {}

  _tokenCache = { accessToken: data.accessToken, expiresAt };
  console.log('[ZenERP] Token obtido com sucesso. Expira em:', new Date(expiresAt).toLocaleString('pt-BR'));

  return data.accessToken;
}

// ------------------------------------------------------------
// 2. CONSULTA DE ESTOQUE (paginada)
// ------------------------------------------------------------

/**
 * Busca todos os registros de estoque do ZenERP (paginado).
 * A API retorna 1 registro por número de série, então fazemos
 * paginação e agrupamos por código no final.
 *
 * @param {string} token - Bearer token
 * @returns {Array} - Todos os registros brutos de estoque
 */
async function buscarTodoEstoque(token) {
  const TAMANHO_PAGINA = 500;
  let offset = 0;
  let todos = [];
  let continua = true;

  while (continua) {
    const url = `${ZEN_BASE_URL}/material/stock?first=${offset}&max=${TAMANHO_PAGINA}`;

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'tenant': ZEN_TENANT,
      },
    });

    if (!response.ok) {
      const erro = await response.json().catch(() => ({}));
      throw new Error(`[ZenERP] Erro ao buscar estoque: ${erro.message || response.status}`);
    }

    const pagina = await response.json();

    if (!Array.isArray(pagina) || pagina.length === 0) {
      continua = false;
    } else {
      todos = todos.concat(pagina);
      offset += pagina.length;

      // Se retornou menos que o tamanho da página, chegou ao fim
      if (pagina.length < TAMANHO_PAGINA) continua = false;
    }

    console.log(`[ZenERP] Carregados ${todos.length} registros de estoque...`);
  }

  return todos;
}

// ------------------------------------------------------------
// 3. FILTRAR E AGRUPAR
// ------------------------------------------------------------

/**
 * Filtra apenas itens do perfil PEC (Partes e Peças) e
 * agrupa por código de produto, somando as quantidades.
 *
 * @param {Array} registros - Registros brutos da API
 * @returns {Array} - Array de peças com quantidade total
 */
function filtrarEAgrupar(registros) {
  const mapa = {};

  for (const item of registros) {
    const produto = item.productPacking?.product;
    if (!produto) continue;

    // Filtra apenas Partes e Peças
    const perfil = produto.productProfile?.code;
    if (perfil !== ZEN_PROFILE) continue;

    // Ignora itens reservados ou não disponíveis
    if (item.status !== 'FREE') continue;

    const codigo = produto.code;
    if (!mapa[codigo]) {
      mapa[codigo] = {
        codigo:    codigo,
        descricao: produto.description || '',
        unidade:   produto.unit?.code || 'un',
        categoria: produto.category1?.description || '',
        quantidade: 0,
      };
    }

    mapa[codigo].quantidade += (item.quantity || 0);
  }

  return Object.values(mapa).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// ------------------------------------------------------------
// 4. FUNÇÃO PRINCIPAL — consultarEstoque()
// ------------------------------------------------------------

/**
 * Consulta o estoque de Partes e Peças no ZenERP.
 * Retorna array de objetos normalizados.
 *
 * Exemplo de retorno:
 * [
 *   { codigo: '1001001', descricao: 'Tocha MIG 350A', unidade: 'un', categoria: 'Tochas', quantidade: 5 },
 *   ...
 * ]
 */
export async function consultarEstoque() {
  try {
    const token    = await getToken();
    const brutos   = await buscarTodoEstoque(token);
    const pecas    = filtrarEAgrupar(brutos);

    console.log(`[ZenERP] Estoque consultado: ${pecas.length} tipos de peças encontrados.`);
    return pecas;
  } catch (err) {
    console.error('[ZenERP] Erro ao consultar estoque:', err.message);
    throw err;
  }
}

/**
 * Consulta a quantidade em estoque de uma peça específica pelo código.
 *
 * @param {string} codigo - Código do produto
 * @returns {number} - Quantidade disponível (0 se não encontrado)
 */
export async function consultarEstoquePorCodigo(codigo) {
  const pecas = await consultarEstoque();
  const peca  = pecas.find(p => p.codigo === codigo);
  return peca ? peca.quantidade : 0;
}

/**
 * Sincroniza o estoque do ZenERP com a tabela de materiais local.
 * Atualiza o campo `quantidade_erp` em cada material.
 *
 * @param {Object} db - Instância do pool do PostgreSQL
 */
export async function sincronizarComBancoDeDados(db) {
  console.log('[ZenERP] Iniciando sincronização com banco de dados...');

  const pecas = await consultarEstoque();
  let atualizados = 0;
  let naoEncontrados = 0;

  for (const peca of pecas) {
    const result = await db.query(
      `UPDATE materiais
          SET quantidade_erp = $1, ultima_sync_erp = NOW()
        WHERE codigo = $2`,
      [peca.quantidade, peca.codigo]
    );

    if (result.rowCount > 0) {
      atualizados++;
    } else {
      naoEncontrados++;
    }
  }

  console.log(`[ZenERP] Sincronização concluída: ${atualizados} atualizados, ${naoEncontrados} não encontrados no sistema.`);

  return {
    total:          pecas.length,
    atualizados,
    naoEncontrados,
  };
}
