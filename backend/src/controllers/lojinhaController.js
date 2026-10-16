// ============================================================
// controllers/lojinhaController.js — Lojinha Boxer
// ============================================================
// Duas colunas: Entrada e Liberação.
// Entrada: cliente (CPF/CNPJ buscado no Zen) e se é Assistente Autorizado,
// data, produtos (SKU do catálogo, só com saldo em estoque, com preço),
// nº do pedido da lojinha, vendedora, envio e valor do frete.
// Ao salvar, cria o pedido de venda no Zen até a ordem de separação
// (integrations/zenLojinha.js) e o pedido passa sozinho para a Liberação,
// com o Nº da ordem de separação e a quantidade de cards (7 itens por card).
// Em seguida cria os cards no Pipefy (Peças p/ Envio) e os leva até
// Separação; aqui o pedido vai para a coluna "Em Separação".
// Acesso: admin, operador e o setor SAC / Suporte.
// ============================================================
import { query } from '../config/db.js';
import { buscarClienteZen, excluirPedidoVendaZen } from '../integrations/zenPedidoVenda.js';
import { criarPedidoLojinhaZen, listarVendedorasZen } from '../integrations/zenLojinha.js';
import { criarCardsLojinha, excluirCardLojinha } from '../integrations/pipefyLojinha.js';
import { buscarPedidoLI } from '../integrations/lojaIntegrada.js';

const TIPOS_ENVIO = ['Sedex', 'PAC', 'Próprio', 'Transportadora'];
const SETORES = ['sac / suporte'];
// Transportadoras e os estados que cada uma atende (lista da Boxer)
const TRANSPORTADORAS = [
  { nome: 'São Miguel', ufs: ['PR', 'SC', 'RS'] },
  { nome: 'Rodo Cargo', ufs: ['SP', 'RJ'], obs: 'Também todo REDESPACHO' },
  { nome: 'Rodonaves',  ufs: ['MG', 'ES'], obs: 'ES só se for agendado' },
  { nome: 'Favorita',   ufs: ['AC', 'AP', 'AM', 'RO', 'RR', 'TO', 'DF', 'GO', 'MT', 'MS', 'MA'] },
  { nome: 'Transuni',   ufs: ['CE', 'BA', 'AL', 'PB', 'PE', 'PI', 'SE', 'RN'] },
  { nome: 'Troca',      ufs: ['ES'] },
];
// Estados sem transportadora definida
const AVISOS_UF = { PA: 'PA — confirmar a transportadora com a Gessica.' };

let estruturaOk = null;
function garantirEstrutura() {
  if (!estruturaOk) {
    estruturaOk = query(`
      CREATE TABLE IF NOT EXISTS lojinha_boxer_pedidos (
        id              SERIAL PRIMARY KEY,
        documento       VARCHAR(20)  NOT NULL,
        cliente_id_zen  INTEGER,
        cliente_nome    VARCHAR(255) NOT NULL,
        cliente_cidade  VARCHAR(150),
        cliente_uf      VARCHAR(2),
        data            DATE         NOT NULL,
        numero_pedido   VARCHAR(60)  NOT NULL,
        vendedora       VARCHAR(150) NOT NULL,
        tipo_envio      VARCHAR(30)  NOT NULL,
        transportadora  VARCHAR(150),
        itens           JSONB        NOT NULL DEFAULT '[]',
        status          VARCHAR(20)  NOT NULL DEFAULT 'entrada',
        criado_por      INTEGER,
        criado_por_nome VARCHAR(150),
        criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lojinha_boxer_pedidos_status ON lojinha_boxer_pedidos (status, data DESC, id DESC);
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS assistente_autorizado BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS valor_frete NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS vendedora_id_zen INTEGER;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_pedido_id INTEGER;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_ordem_separacao_id INTEGER;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_cfop VARCHAR(10);
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_erro TEXT;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS qtd_cards INTEGER;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS pipefy_cards JSONB NOT NULL DEFAULT '[]';
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS pipefy_erro TEXT;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS pipefy_avisos TEXT;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS separacao_em TIMESTAMPTZ;
      UPDATE lojinha_boxer_pedidos
         SET status = 'liberacao', qtd_cards = GREATEST(1, CEIL(jsonb_array_length(itens) / 7.0))::int
       WHERE status = 'entrada' AND zen_ordem_separacao_id IS NOT NULL;
    `).catch(e => { estruturaOk = null; throw e; });
  }
  return estruturaOk;
}

// Middleware de acesso: admin, operador ou setor SAC / Suporte
export async function acessoLojinha(req, res, next) {
  try {
    const u = req.usuario;
    if (!u) return res.status(401).json({ erro: 'Não autenticado.' });
    if (['admin', 'operador'].includes(u.perfil)) return next();
    if (u.departamento_id) {
      const r = await query(`SELECT nome FROM departamentos WHERE id = $1`, [u.departamento_id]);
      if (SETORES.includes((r.rows[0]?.nome || '').trim().toLowerCase())) return next();
    }
    res.status(403).json({ erro: 'Acesso restrito à Lojinha Boxer.' });
  } catch (err) { next(err); }
}

// Pipefy aceita no máximo 7 itens por card
const ITENS_POR_CARD = 7;
const qtdCards = (itens) => Math.max(1, Math.ceil((Array.isArray(itens) ? itens.length : 0) / ITENS_POR_CARD));

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

// GET /lojinha/config
export async function configLojinha(req, res) {
  let vendedoras = [], erroVendedoras = null;
  try { vendedoras = await listarVendedorasZen(); } catch (e) { erroVendedoras = `Não consegui carregar as vendedoras do Zen: ${e.message}`; }
  res.json({ tipos_envio: TIPOS_ENVIO, transportadoras: TRANSPORTADORAS, avisos_uf: AVISOS_UF, vendedoras, erro_vendedoras: erroVendedoras });
}

// Cria o pedido no Zen e grava o resultado (nunca lança erro)
async function enviarZen(pedido) {
  try {
    // Pedidos antigos sem o ID da vendedora: acha pelo nome
    if (!pedido.vendedora_id_zen && pedido.vendedora) {
      const n = String(pedido.vendedora).trim().toLowerCase();
      const achadas = (await listarVendedorasZen()).filter(v => v.nome.toLowerCase() === n || v.nome.toLowerCase().split(' ')[0] === n.split(' ')[0]);
      if (achadas.length === 1) {
        pedido.vendedora_id_zen = achadas[0].id;
        await query(`UPDATE lojinha_boxer_pedidos SET vendedora_id_zen = $2 WHERE id = $1`, [pedido.id, achadas[0].id]);
      }
    }
    const z = await criarPedidoLojinhaZen(pedido);
    const r = await query(
      `UPDATE lojinha_boxer_pedidos SET zen_pedido_id = $2, zen_ordem_separacao_id = $3, zen_cfop = $4, zen_erro = NULL,
              status = 'liberacao', qtd_cards = $5
        WHERE id = $1 RETURNING *`, [pedido.id, z.zenPedidoId, z.ordemSeparacaoId, z.cfop, qtdCards(pedido.itens)]);
    // Liberação automática: cria os cards no Pipefy e leva até Separação
    return await enviarPipefy(r.rows[0]);
  } catch (e) {
    console.error('[Lojinha] Zen:', e.message);
    const r = await query(
      `UPDATE lojinha_boxer_pedidos SET zen_pedido_id = COALESCE($2, zen_pedido_id), zen_erro = $3 WHERE id = $1 RETURNING *`,
      [pedido.id, e.zenPedidoId || null, e.message]);
    return r.rows[0];
  }
}

// Cria os cards no Pipefy e move até Separação (nunca lança erro)
async function enviarPipefy(pedido) {
  const salvar = (cards) => query(`UPDATE lojinha_boxer_pedidos SET pipefy_cards = $2 WHERE id = $1`, [pedido.id, JSON.stringify(cards)]);
  try {
    const u = pedido.criado_por
      ? (await query(`SELECT nome, email FROM usuarios WHERE id = $1`, [pedido.criado_por])).rows[0]
      : null;
    const { cards, avisos } = await criarCardsLojinha(pedido, u || { nome: pedido.criado_por_nome }, pedido.pipefy_cards || [], salvar);
    const r = await query(
      `UPDATE lojinha_boxer_pedidos SET pipefy_cards = $2, pipefy_erro = NULL, pipefy_avisos = $3,
              status = 'separacao', separacao_em = COALESCE(separacao_em, NOW())
        WHERE id = $1 RETURNING *`, [pedido.id, JSON.stringify(cards), avisos.join(' ') || null]);
    return r.rows[0];
  } catch (e) {
    console.error('[Lojinha] Pipefy:', e.message);
    const r = await query(`UPDATE lojinha_boxer_pedidos SET pipefy_erro = $2 WHERE id = $1 RETURNING *`, [pedido.id, e.message]);
    return r.rows[0];
  }
}

// POST /lojinha/pedidos/:id/pipefy — tenta de novo criar/mover os cards no Pipefy
export async function reenviarPipefyLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1`, [parseInt(req.params.id)]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (!p.zen_ordem_separacao_id) return res.status(409).json({ erro: 'O pedido ainda não tem ordem de separação no Zen.' });
    if (p.status === 'separacao') return res.status(409).json({ erro: 'Os cards deste pedido já estão em Separação.' });
    res.json({ pedido: await enviarPipefy(p) });
  } catch (err) { next(err); }
}

// POST /lojinha/pedidos/:id/zen — tenta de novo criar/completar o pedido no Zen
export async function reenviarZenLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1`, [parseInt(req.params.id)]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (p.zen_ordem_separacao_id) return res.status(409).json({ erro: 'Este pedido já tem ordem de separação no Zen.' });
    res.json({ pedido: await enviarZen(p) });
  } catch (err) { next(err); }
}

// GET /lojinha/cliente?documento=...
export async function buscarClienteLojinha(req, res) {
  const doc = soDigitos(req.query.documento);
  if (doc.length !== 11 && doc.length !== 14) return res.status(400).json({ erro: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).' });
  try {
    const p = await buscarClienteZen(doc);
    res.json({
      cliente: {
        id: p?.id ?? null,
        nome: p?.name || p?.corporateName || p?.companyName || p?.tradeName || p?.fantasyName || '',
        cidade: p?.city?.name || null,
        uf: p?.city?.state?.code || null,
      },
    });
  } catch (e) {
    const naoCadastrado = /não está cadastrado/i.test(e.message);
    res.status(naoCadastrado ? 404 : 502).json({
      erro: naoCadastrado ? 'Cliente não encontrado no Zen. Confira o documento ou cadastre o cliente no Zen.' : `Não consegui consultar o Zen agora: ${e.message}`,
    });
  }
}

// Produto do catálogo pelo SKU (código), com o saldo do catálogo
async function produtoPorSku(sku) {
  const r = await query(
    `SELECT id, codigo, descricao, unidade, COALESCE(quantidade_erp, 0)::numeric AS saldo
       FROM materiais WHERE UPPER(TRIM(codigo)) = UPPER(TRIM($1)) LIMIT 1`, [sku]);
  const m = r.rows[0];
  return m ? { ...m, saldo: Number(m.saldo) } : null;
}

// GET /lojinha/produto?sku=...
export async function buscarProdutoLojinha(req, res, next) {
  try {
    const sku = String(req.query.sku || '').trim();
    if (!sku) return res.status(400).json({ erro: 'Informe o SKU.' });
    const p = await produtoPorSku(sku);
    if (!p) return res.status(404).json({ erro: `SKU ${sku} não encontrado no catálogo.` });
    if (p.saldo <= 0) return res.status(409).json({ erro: `SKU ${p.codigo} sem saldo em estoque.`, produto: p });
    res.json({ produto: p });
  } catch (err) { next(err); }
}

// GET /lojinha/loja-integrada/:numero — busca o pedido na Loja Integrada e
// já devolve o cliente do Zen e os itens conferidos no catálogo (saldo).
export async function buscarPedidoLojaIntegrada(req, res) {
  const numero = soDigitos(req.params.numero);
  if (!numero) return res.status(400).json({ erro: 'Informe o número do pedido da lojinha.' });
  let li;
  try { li = await buscarPedidoLI(numero); }
  catch (e) { return res.status(e.status || 502).json({ erro: e.message }); }

  // Já foi lançado aqui?
  let duplicado = null;
  try {
    await garantirEstrutura();
    const d = await query(`SELECT id, status FROM lojinha_boxer_pedidos WHERE numero_pedido = $1 LIMIT 1`, [numero]);
    duplicado = d.rows[0] || null;
  } catch { /* segue */ }

  let cliente = null, erroCliente = null;
  if (li.documento) {
    try {
      const p = await buscarClienteZen(li.documento);
      cliente = {
        id: p?.id ?? null,
        nome: p?.name || p?.corporateName || p?.companyName || p?.tradeName || p?.fantasyName || '',
        cidade: p?.city?.name || null,
        uf: p?.city?.state?.code || null,
      };
    } catch (e) {
      erroCliente = /não está cadastrado/i.test(e.message)
        ? 'Cliente não encontrado no Zen. Cadastre o cliente no Zen e busque de novo.'
        : `Não consegui consultar o Zen agora: ${e.message}`;
    }
  } else erroCliente = 'O pedido da lojinha não tem CPF/CNPJ.';

  const itens = [];
  for (const i of li.itens) {
    const p = await produtoPorSku(i.sku).catch(() => null);
    if (!p) { itens.push({ codigo: i.sku, descricao: i.nome, quantidade: i.quantidade, preco: i.preco, erro: 'SKU não encontrado no catálogo.' }); continue; }
    const erro = p.saldo <= 0 ? 'Sem saldo em estoque.' : (i.quantidade > p.saldo ? `Só há ${p.saldo} ${p.unidade} em estoque.` : null);
    itens.push({ codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, saldo: p.saldo, quantidade: i.quantidade, preco: i.preco, erro });
  }

  res.json({ pedido: { ...li, itens, cliente, erro_cliente: erroCliente, duplicado } });
}

// GET /lojinha/pedidos
export async function listarPedidosLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT * FROM lojinha_boxer_pedidos ORDER BY data DESC, id DESC LIMIT 300`);
    res.json({ pedidos: r.rows });
  } catch (err) { next(err); }
}

// POST /lojinha/pedidos — coluna Entrada
export async function criarPedidoLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const b = req.body || {};
    const documento = soDigitos(b.documento);
    const nome = String(b.cliente_nome || '').trim();
    const data = String(b.data || '').trim();
    const numero = String(b.numero_pedido || '').trim();
    const vendedoraId = Number(b.vendedora_id_zen) || null;
    let vendedora = String(b.vendedora || '').trim();
    const tipo = String(b.tipo_envio || '').trim();
    const transportadora = String(b.transportadora || '').trim();
    const autorizado = b.assistente_autorizado === true;
    const frete = b.valor_frete === '' || b.valor_frete == null ? 0 : Number(b.valor_frete);

    if (documento.length !== 11 && documento.length !== 14) return res.status(400).json({ erro: 'CPF/CNPJ inválido.' });
    if (!nome) return res.status(400).json({ erro: 'Busque o cliente pelo documento antes de salvar.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ erro: 'Informe a data.' });
    if (!numero) return res.status(400).json({ erro: 'Informe o número do pedido da lojinha.' });
    if (!vendedoraId) return res.status(400).json({ erro: 'Escolha a vendedora.' });
    try {
      const v = (await listarVendedorasZen()).find(x => x.id === vendedoraId);
      if (!v) return res.status(400).json({ erro: 'Vendedora não encontrada no Zen.' });
      vendedora = v.nome;
    } catch { if (!vendedora) return res.status(400).json({ erro: 'Escolha a vendedora.' }); }
    if (!TIPOS_ENVIO.includes(tipo)) return res.status(400).json({ erro: 'Escolha o tipo de envio.' });
    if (tipo === 'Transportadora' && !TRANSPORTADORAS.some(t => t.nome === transportadora)) return res.status(400).json({ erro: 'Escolha a transportadora.' });
    if (!Number.isFinite(frete) || frete < 0) return res.status(400).json({ erro: 'Valor do frete inválido.' });

    // Produtos: confere de novo no catálogo (saldo pode ter mudado)
    const entrada = Array.isArray(b.itens) ? b.itens : [];
    if (!entrada.length) return res.status(400).json({ erro: 'Inclua pelo menos um produto.' });
    const itens = [];
    for (const it of entrada) {
      const qtd = Number(it.quantidade);
      const preco = Number(it.preco);
      const p = await produtoPorSku(it.codigo);
      if (!p) return res.status(400).json({ erro: `SKU ${it.codigo} não encontrado no catálogo.` });
      if (!(qtd > 0)) return res.status(400).json({ erro: `Quantidade inválida para o SKU ${p.codigo}.` });
      if (it.preco === '' || it.preco == null || !Number.isFinite(preco) || preco < 0) return res.status(400).json({ erro: `Informe o preço do SKU ${p.codigo}.` });
      if (p.saldo <= 0) return res.status(409).json({ erro: `SKU ${p.codigo} sem saldo em estoque.` });
      if (qtd > p.saldo) return res.status(409).json({ erro: `SKU ${p.codigo}: só há ${p.saldo} em estoque.` });
      const ja = itens.find(x => x.codigo === p.codigo);
      if (ja) {
        ja.quantidade += qtd;
        ja.preco = preco;
        if (ja.quantidade > p.saldo) return res.status(409).json({ erro: `SKU ${p.codigo}: só há ${p.saldo} em estoque.` });
      } else {
        itens.push({ material_id: p.id, codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, quantidade: qtd, preco });
      }
    }

    const dup = await query(`SELECT id FROM lojinha_boxer_pedidos WHERE LOWER(numero_pedido) = LOWER($1) LIMIT 1`, [numero]);
    if (dup.rows[0]) return res.status(409).json({ erro: `O pedido ${numero} já foi registrado.` });

    const r = await query(
      `INSERT INTO lojinha_boxer_pedidos (documento, cliente_id_zen, cliente_nome, cliente_cidade, cliente_uf, data,
          numero_pedido, vendedora, tipo_envio, transportadora, itens, criado_por, criado_por_nome,
          assistente_autorizado, valor_frete, vendedora_id_zen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [documento, Number(b.cliente_id_zen) || null, nome, String(b.cliente_cidade || '').trim() || null,
       String(b.cliente_uf || '').trim().toUpperCase().slice(0, 2) || null, data, numero, vendedora, tipo,
       tipo === 'Transportadora' ? transportadora : null, JSON.stringify(itens), req.usuario.id, req.usuario.nome,
       autorizado, Math.round(frete * 100) / 100, vendedoraId]);
    // Cria o pedido no Zen até a ordem de separação
    const pedido = await enviarZen(r.rows[0]);
    res.status(201).json({ pedido });
  } catch (err) { next(err); }
}

// DELETE /lojinha/pedidos/:id — exclui o pedido no Zen (desfaz a ordem de
// separação), os cards do Pipefy e o pedido da Lojinha
export async function excluirPedidoLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1`, [parseInt(req.params.id)]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    // 1. Zen
    if (p.zen_pedido_id) {
      try {
        await excluirPedidoVendaZen({ zen_pedido_id: p.zen_pedido_id });
        await query(`UPDATE lojinha_boxer_pedidos SET zen_pedido_id = NULL, zen_ordem_separacao_id = NULL WHERE id = $1`, [p.id]);
      } catch (e) {
        await query(`UPDATE lojinha_boxer_pedidos SET zen_erro = $2 WHERE id = $1`, [p.id, `Exclusão: ${e.message}`]);
        return res.status(502).json({ erro: `Não consegui excluir o pedido ${p.zen_pedido_id} no Zen: ${e.message}` });
      }
    }

    // 2. Pipefy
    const cards = (Array.isArray(p.pipefy_cards) ? p.pipefy_cards : []).filter(c => c?.id);
    const restantes = [];
    const erros = [];
    for (const c of cards) {
      try { await excluirCardLojinha(c.id); }
      catch (e) { restantes.push(c); erros.push(`card ${c.id}: ${e.message}`); }
    }
    if (erros.length) {
      await query(`UPDATE lojinha_boxer_pedidos SET pipefy_cards = $2, pipefy_erro = $3 WHERE id = $1`,
        [p.id, JSON.stringify(restantes), `Exclusão: ${erros.join(' | ')}`]);
      return res.status(502).json({ erro: `O pedido do Zen foi excluído, mas não consegui excluir no Pipefy: ${erros.join(' | ')}` });
    }

    // 3. Lojinha
    await query(`DELETE FROM lojinha_boxer_pedidos WHERE id = $1`, [p.id]);
    res.json({ ok: true, numero_pedido: p.numero_pedido, zen_pedido_id: p.zen_pedido_id, cards: cards.length });
  } catch (err) { next(err); }
}
