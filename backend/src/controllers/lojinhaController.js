// ============================================================
// controllers/lojinhaController.js — Lojinha Boxer
// ============================================================
// Etapa 1: cadastro dos pedidos da Lojinha (cliente pelo CPF/CNPJ no Zen,
// data, número do pedido da lojinha e tipo de envio). As integrações
// (pedido no Zen e card no Pipefy) entram nas próximas etapas.
// Acesso: admin, operador e o setor SAC / Suporte.
// ============================================================
import { query } from '../config/db.js';
import { buscarClienteZen } from '../integrations/zenPedidoVenda.js';

const TIPOS_ENVIO = ['Sedex', 'PAC', 'Próprio', 'Transportadora'];
const SETORES = ['sac / suporte'];

// Transportadoras com que a Boxer trabalha (a lista definitiva vem depois)
const TRANSPORTADORAS = (process.env.LOJINHA_TRANSPORTADORAS || '')
  .split(';').map(s => s.trim()).filter(Boolean);

let estruturaOk = null;
function garantirEstrutura() {
  if (!estruturaOk) {
    estruturaOk = query(`
      CREATE TABLE IF NOT EXISTS lojinha_pedidos (
        id              SERIAL PRIMARY KEY,
        documento       VARCHAR(20)  NOT NULL,
        cliente_id_zen  INTEGER,
        cliente_nome    VARCHAR(255) NOT NULL,
        cliente_cidade  VARCHAR(150),
        data            DATE         NOT NULL,
        numero_pedido   VARCHAR(60)  NOT NULL,
        tipo_envio      VARCHAR(30)  NOT NULL,
        transportadora  VARCHAR(150),
        status          VARCHAR(20)  NOT NULL DEFAULT 'registrado',
        criado_por      INTEGER,
        criado_por_nome VARCHAR(150),
        criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lojinha_pedidos_data ON lojinha_pedidos (data DESC, id DESC);
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

function resumoPessoa(p) {
  return {
    id: p?.id ?? null,
    nome: p?.name || p?.corporateName || p?.companyName || p?.tradeName || p?.fantasyName || '',
    fantasia: p?.tradeName || p?.fantasyName || null,
    cidade: p?.city?.name || null,
    uf: p?.city?.state?.code || null,
  };
}

// GET /lojinha/config
export async function configLojinha(req, res) {
  res.json({ tipos_envio: TIPOS_ENVIO, transportadoras: TRANSPORTADORAS });
}

// GET /lojinha/cliente?documento=...
export async function buscarClienteLojinha(req, res) {
  const doc = soDigitos(req.query.documento);
  if (doc.length !== 11 && doc.length !== 14) return res.status(400).json({ erro: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).' });
  try {
    const pessoa = await buscarClienteZen(doc);
    res.json({ cliente: resumoPessoa(pessoa) });
  } catch (e) {
    const naoCadastrado = /não está cadastrado/i.test(e.message);
    res.status(naoCadastrado ? 404 : 502).json({
      erro: naoCadastrado ? 'Cliente não encontrado no Zen. Confira o documento ou cadastre o cliente no Zen.' : `Não consegui consultar o Zen agora: ${e.message}`,
    });
  }
}

// GET /lojinha/pedidos
export async function listarPedidosLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT * FROM lojinha_pedidos ORDER BY data DESC, id DESC LIMIT 300`);
    res.json({ pedidos: r.rows });
  } catch (err) { next(err); }
}

// POST /lojinha/pedidos
export async function criarPedidoLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const b = req.body || {};
    const documento = soDigitos(b.documento);
    const numero = String(b.numero_pedido || '').trim();
    const tipo = String(b.tipo_envio || '').trim();
    const transportadora = String(b.transportadora || '').trim();
    const data = String(b.data || '').trim();
    const nome = String(b.cliente_nome || '').trim();

    if (documento.length !== 11 && documento.length !== 14) return res.status(400).json({ erro: 'CPF/CNPJ inválido.' });
    if (!nome) return res.status(400).json({ erro: 'Busque o cliente pelo documento antes de salvar.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ erro: 'Informe a data.' });
    if (!numero) return res.status(400).json({ erro: 'Informe o número do pedido da lojinha.' });
    if (!TIPOS_ENVIO.includes(tipo)) return res.status(400).json({ erro: 'Escolha o tipo de envio.' });
    if (tipo === 'Transportadora' && !transportadora) return res.status(400).json({ erro: 'Escolha a transportadora.' });

    const dup = await query(`SELECT id FROM lojinha_pedidos WHERE LOWER(numero_pedido) = LOWER($1) LIMIT 1`, [numero]);
    if (dup.rows[0]) return res.status(409).json({ erro: `O pedido ${numero} já foi registrado.` });

    const r = await query(
      `INSERT INTO lojinha_pedidos (documento, cliente_id_zen, cliente_nome, cliente_cidade, data, numero_pedido,
                                    tipo_envio, transportadora, criado_por, criado_por_nome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [documento, Number(b.cliente_id_zen) || null, nome, String(b.cliente_cidade || '').trim() || null, data, numero,
       tipo, tipo === 'Transportadora' ? transportadora : null, req.usuario.id, req.usuario.nome]);
    res.status(201).json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}
