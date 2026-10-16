// ============================================================
// controllers/lojinhaController.js — Lojinha Boxer
// ============================================================
// Duas colunas: Entrada e Liberação.
// Entrada: cliente (CPF/CNPJ buscado no Zen) e se é Assistente Autorizado,
// data, produtos (SKU do catálogo, só com saldo em estoque, com preço),
// nº do pedido da lojinha, vendedora, envio e valor do frete.
// Acesso: admin, operador e o setor SAC / Suporte.
// ============================================================
import { query } from '../config/db.js';
import { buscarClienteZen } from '../integrations/zenPedidoVenda.js';

const TIPOS_ENVIO = ['Sedex', 'PAC', 'Próprio', 'Transportadora'];
const SETORES = ['sac / suporte'];
const lista = (v) => String(v || '').split(';').map(s => s.trim()).filter(Boolean);
// Listas definitivas vêm depois (por enquanto, variáveis de ambiente; vazias = texto livre)
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
const VENDEDORAS = lista(process.env.LOJINHA_VENDEDORAS);

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

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

// GET /lojinha/config
export async function configLojinha(req, res) {
  res.json({ tipos_envio: TIPOS_ENVIO, transportadoras: TRANSPORTADORAS, avisos_uf: AVISOS_UF, vendedoras: VENDEDORAS });
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
    const vendedora = String(b.vendedora || '').trim();
    const tipo = String(b.tipo_envio || '').trim();
    const transportadora = String(b.transportadora || '').trim();
    const autorizado = b.assistente_autorizado === true;
    const frete = b.valor_frete === '' || b.valor_frete == null ? 0 : Number(b.valor_frete);

    if (documento.length !== 11 && documento.length !== 14) return res.status(400).json({ erro: 'CPF/CNPJ inválido.' });
    if (!nome) return res.status(400).json({ erro: 'Busque o cliente pelo documento antes de salvar.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ erro: 'Informe a data.' });
    if (!numero) return res.status(400).json({ erro: 'Informe o número do pedido da lojinha.' });
    if (!vendedora) return res.status(400).json({ erro: 'Informe a vendedora.' });
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
          assistente_autorizado, valor_frete)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [documento, Number(b.cliente_id_zen) || null, nome, String(b.cliente_cidade || '').trim() || null,
       String(b.cliente_uf || '').trim().toUpperCase().slice(0, 2) || null, data, numero, vendedora, tipo,
       tipo === 'Transportadora' ? transportadora : null, JSON.stringify(itens), req.usuario.id, req.usuario.nome,
       autorizado, Math.round(frete * 100) / 100]);
    res.status(201).json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}
