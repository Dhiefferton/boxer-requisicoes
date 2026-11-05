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
import { buscarClienteZen, excluirPedidoVendaZen, consultarOrdemSeparacao, documentosZen } from '../integrations/zenPedidoVenda.js';
import { PIPEFY_ATIVO } from '../integrations/pipefyService.js';
import { criarConfigQuadro, exigidoAgora, bloqueioRegra } from './configQuadro.js';

// ── Colunas e campos da Lojinha (Configurar, só admin) ─────
// Colunas do sistema (status gravados no pedido). Entrada também mostra 'liberacao'.
const COLUNAS_LOJINHA = [
  { chave: 'entrada',      nome: 'Entrada',              cor: '#3b82f6', so_admin: false, zen: 'Cria o pedido de venda e a ordem de separação no Zen e vai sozinho para Em Separação.' },
  { chave: 'separacao',    nome: 'Em Separação',         cor: '#a855f7', so_admin: false, zen: 'Vai sozinho para Em Conferência quando a separação termina no Zen.' },
  { chave: 'conferencia',  nome: 'Em Conferência',       cor: '#06b6d4', so_admin: false },
  { chave: 'teste_placas', nome: 'Em Teste de Placas',   cor: '#f59e0b', so_admin: false },
  { chave: 'preparacao',   nome: 'Em Preparação (Exp.)', cor: '#f97316', so_admin: false },
  { chave: 'finalizado',   nome: 'Finalizado',           cor: '#22c55e', so_admin: false },
];
const cfgLojinha = criarConfigQuadro({ TC: 'loj_colunas', TF: 'loj_campos', tabPedidos: 'lojinha_boxer_pedidos', padrao: COLUNAS_LOJINHA });
export const verConfigLojinha = (req, res, next) => cfgLojinha.verConfig(req, res, next);
export const salvarConfigLojinha = (req, res, next) => cfgLojinha.salvarConfig(req, res, next);
export const adicionarOpcaoLojinha = (req, res, next) => cfgLojinha.adicionarOpcao(req, res, next);
export const lerConfigLojinha = () => cfgLojinha.ler();

// ── Histórico de movimentação ───────────────────────────────
export async function registrarMovLoj(pedido, tipo, { de = null, para = null, descricao = null, detalhes = null, usuario = null, origem = 'usuario' } = {}) {
  try {
    await query(
      `INSERT INTO loj_movimentos (pedido_id, referencia, cliente_nome, tipo, de_status, para_status, descricao, detalhes, usuario_id, usuario_nome, origem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
      [pedido?.id || null, pedido?.numero_pedido ? `Pedido ${pedido.numero_pedido}` : null, pedido?.cliente_nome || null,
       tipo, de, para, descricao, detalhes ? JSON.stringify(detalhes) : null,
       usuario?.id || null, usuario?.nome || (origem === 'usuario' ? null : 'Sistema'), origem]);
  } catch (e) { console.error('[Lojinha] movimento:', e.message); }
}
import { criarPedidoLojinhaZen, listarVendedorasZen, buscarVendaZen, vincularVendaZen } from '../integrations/zenLojinha.js';
import { criarCardsLojinha, excluirCardLojinha, fasesDosCards, cardsDoPedidoLojinha } from '../integrations/pipefyLojinha.js';
import { buscarPedidoLI } from '../integrations/lojaIntegrada.js';
import { temBotao } from '../middlewares/telas.js';
import { registrarArquivoBlob, excluirArquivoBlob, lerEnvioBlob } from './blobController.js';
import { avisarFaturamentoLojinha, liberarFaturamento, ehLiberacaoFaturamento } from './faturamentoLojinha.js';

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
export function garantirEstrutura() {
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
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMPTZ;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS transacao_manual VARCHAR(80);
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS campos JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS origem VARCHAR(20);
      CREATE TABLE IF NOT EXISTS loj_fotos (
        id           SERIAL PRIMARY KEY,
        pedido_id    INTEGER NOT NULL,
        campo_id     VARCHAR(120) NOT NULL,
        imagem       BYTEA NOT NULL,
        miniatura    BYTEA,
        mime         VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
        usuario_id   INTEGER,
        usuario_nome VARCHAR(120),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_loj_fotos_pedido ON loj_fotos (pedido_id);
      ALTER TABLE loj_fotos ADD COLUMN IF NOT EXISTS nome VARCHAR(200);
      ALTER TABLE loj_fotos ALTER COLUMN mime TYPE VARCHAR(120);
      ALTER TABLE loj_fotos ADD COLUMN IF NOT EXISTS blob_url TEXT;
      ALTER TABLE loj_fotos ADD COLUMN IF NOT EXISTS tamanho BIGINT;
      CREATE TABLE IF NOT EXISTS loj_movimentos (
        id           SERIAL PRIMARY KEY,
        pedido_id    INTEGER,
        referencia   TEXT,
        cliente_nome TEXT,
        tipo         TEXT NOT NULL,
        de_status    TEXT,
        para_status  TEXT,
        descricao    TEXT,
        detalhes     JSONB,
        usuario_id   INTEGER,
        usuario_nome TEXT,
        origem       TEXT NOT NULL DEFAULT 'usuario',
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_loj_mov_criado ON loj_movimentos (criado_em DESC);
      CREATE INDEX IF NOT EXISTS idx_loj_mov_pedido ON loj_movimentos (pedido_id, criado_em);
      -- Logística CIF (Enviar): continuação do pedido depois de Finalizado
      -- Nº do pedido de venda e da nota fiscal no Zen (mostrados no card)
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_venda_numero VARCHAR(40);
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_nf_numero VARCHAR(40);
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_nf_id INTEGER;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_nf_status VARCHAR(40);
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS zen_docs_em TIMESTAMPTZ;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS cif_status VARCHAR(60);
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS cif_entrou_em TIMESTAMPTZ;
      ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS cif_valores JSONB NOT NULL DEFAULT '{}'::jsonb;
      CREATE INDEX IF NOT EXISTS idx_loj_cif_status ON lojinha_boxer_pedidos (cif_status);
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
    if (req.liberadoTela || ['admin', 'operador'].includes(u.perfil)) return next();
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
    // Liberação automática: leva até Em Separação
    const final = await enviarPipefy(r.rows[0]);
    await registrarMovLoj(final, 'zen_pedido_criado', {
      de: pedido.status, para: final.status, origem: 'sistema',
      descricao: `Pedido de venda #${z.zenPedidoId} criado no Zen — ordem de separação #${z.ordemSeparacaoId}`,
      detalhes: { zen_pedido_id: z.zenPedidoId, ordem_separacao: z.ordemSeparacaoId },
    });
    return final;
  } catch (e) {
    console.error('[Lojinha] Zen:', e.message);
    await registrarMovLoj(pedido, 'erro_zen', { origem: 'sistema', descricao: `Erro no Zen: ${String(e.message).slice(0, 500)}` });
    const r = await query(
      `UPDATE lojinha_boxer_pedidos SET zen_pedido_id = COALESCE($2, zen_pedido_id), zen_erro = $3 WHERE id = $1 RETURNING *`,
      [pedido.id, e.zenPedidoId || null, e.message]);
    return r.rows[0];
  }
}

// Cria os cards no Pipefy e move até Separação (nunca lança erro)
async function enviarPipefy(pedido) {
  // Pipefy desligado: com a ordem de separação no Zen o pedido vai direto para Em Separação
  if (!PIPEFY_ATIVO) {
    const r = await query(
      `UPDATE lojinha_boxer_pedidos SET status = 'separacao', separacao_em = COALESCE(separacao_em, NOW()), pipefy_erro = NULL
        WHERE id = $1 RETURNING *`, [pedido.id]);
    return r.rows[0];
  }
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
    if (!['entrada', 'liberacao'].includes(p.status)) return res.status(409).json({ erro: 'Os cards deste pedido já estão no Pipefy (Separação ou depois).' });
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
    // ID da transação digitado à mão (quando o da Loja Integrada não é válido)
    if (req.body?.transacao !== undefined) {
      const t = String(req.body.transacao || '').replace(/\s+/g, '');
      if (t && !/^\d{6,}(,\d{6,})*$/.test(t)) {
        return res.status(400).json({ erro: 'ID da transação inválido: use só números (ex.: 186216402648), como aparece no painel da Loja Integrada.' });
      }
      await query(`UPDATE lojinha_boxer_pedidos SET transacao_manual = $2 WHERE id = $1`, [p.id, t || null]);
      p.transacao_manual = t || null;
    }
    // Lojinha Faturada: o pedido já existe no Zen — só liga a ordem de separação
    if (p.origem === 'zen' && p.zen_pedido_id) return res.json({ pedido: await ligarVendaZen(p, req.usuario) });
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

// ── Acompanhamento das fases do Pipefy (só leitura) ───────
// Fase do pipe "Peças p/ Envio" → coluna da tela. Com vários cards,
// o pedido fica na coluna do card mais atrasado.
const ORDEM_STATUS = ['separacao', 'conferencia', 'teste_placas', 'preparacao', 'finalizado'];
const STATUS_POR_FASE = {
  '309953163': 'separacao',    // Entrada
  '310139435': 'separacao',    // Liberação
  '310137100': 'separacao',    // Separação
  '333583933': 'conferencia',  // Conferência
  '318632647': 'teste_placas', // TESTE DE PLACAS
  '326808638': 'teste_placas', // FALTA DE PLACAS / PEÇAS
  '340114338': 'preparacao',   // Pacote / Embalamento
  '314012838': 'preparacao',   // Preparação (Exp.)
  '309953164': 'preparacao',   // Definir transporte
  '314012839': 'preparacao',   // Aguardando Saida
  '309953165': 'finalizado',   // Expedição
  '310336624': 'finalizado',   // Somente Prestação de Serviço
};
let ultimaSync = 0;
async function sincronizarFasesPipefy() {
  if (Date.now() - ultimaSync < 30000) return;
  ultimaSync = Date.now();
  if (!PIPEFY_ATIVO) return sincronizarSemPipefy();
  const r = await query(`SELECT id, status, pipefy_cards, numero_pedido FROM lojinha_boxer_pedidos
                          WHERE status IN ('separacao', 'conferencia', 'teste_placas', 'preparacao')`);
  if (!r.rows.length) return;
  const ids = r.rows.flatMap(p => (p.pipefy_cards || []).map(c => c?.id).filter(Boolean));
  const fases = await fasesDosCards(ids);
  for (const p of r.rows) {
    // Card que o Pipefy não devolve mais (excluído / sem acesso): procura no pipe
    // o card com o mesmo "Nº Pedido Lojinha" e religa (ex.: alguém excluiu o card
    // criado pelo sistema e seguiu com outro feito à mão).
    let origem = p.pipefy_cards || [];
    const sumidos = origem.filter(c => c?.id && !fases[c.id]);
    if (sumidos.length && p.numero_pedido) {
      try {
        const ja = new Set(origem.map(c => String(c?.id)));
        const achados = (await cardsDoPedidoLojinha(p.numero_pedido)).filter(c => !ja.has(c.id));
        if (achados.length) {
          origem = origem.map(c => {
            if (!c?.id || fases[c.id] || !achados.length) return c;
            const n = achados.shift();
            fases[n.id] = { faseId: n.faseId, fase: n.fase };
            return { ...c, id: n.id, url: n.url || c.url, card_anterior: c.id };
          });
        }
      } catch (e) { console.error('[Lojinha] religar card:', e.message); }
    }
    const cards = origem.map(c => (c?.id && fases[c.id] ? { ...c, fase: fases[c.id].fase, fase_id: fases[c.id].faseId } : c));
    const st = cards.filter(c => c?.id && fases[c.id]).map(c => STATUS_POR_FASE[fases[c.id].faseId]).filter(Boolean);
    if (!st.length) continue;
    const novo = st.reduce((a, b) => (ORDEM_STATUS.indexOf(b) < ORDEM_STATUS.indexOf(a) ? b : a));
    const mudouFase = JSON.stringify(cards) !== JSON.stringify(p.pipefy_cards);
    if (novo === p.status && !mudouFase) continue;
    await query(
      `UPDATE lojinha_boxer_pedidos SET status = $2, pipefy_cards = $3,
              finalizado_em = CASE WHEN $4 THEN COALESCE(finalizado_em, NOW()) ELSE NULL END
        WHERE id = $1`, [p.id, novo, JSON.stringify(cards), novo === 'finalizado']);
    // Chegou pelo Pipefy na coluna Finalizado e ela é a "Liberação de Faturamento": e-mail ao faturamento
    if (novo !== p.status) {
      const nomeCol = (await cfgLojinha.ler()).colunas.find(c => c.chave === novo)?.nome;
      if (ehLiberacaoFaturamento(nomeCol)) await liberarFaturamento(p.id);
    }
  }
}

// Sem o Pipefy: pedido parado na liberação vai para Em Separação, e Em Separação
// passa para Em Conferência quando a separação termina no Zen (reserva finalizada).
// As outras colunas são movidas na tela (POST /lojinha/pedidos/:id/mover).
async function sincronizarSemPipefy() {
  await query(`UPDATE lojinha_boxer_pedidos SET status = 'separacao', separacao_em = COALESCE(separacao_em, NOW()), pipefy_erro = NULL
                WHERE status = 'liberacao' AND zen_ordem_separacao_id IS NOT NULL`);
  const r = await query(`SELECT id, zen_ordem_separacao_id FROM lojinha_boxer_pedidos
                          WHERE status = 'separacao' AND zen_ordem_separacao_id IS NOT NULL`);
  for (const p of r.rows) {
    try {
      const s = await consultarOrdemSeparacao(p.zen_ordem_separacao_id);
      if (s.separado) {
        const up = await query(`UPDATE lojinha_boxer_pedidos SET status = 'conferencia' WHERE id = $1 AND status = 'separacao' RETURNING *`, [p.id]);
        if (up.rows[0]) await registrarMovLoj(up.rows[0], 'separado_automatico', {
          de: 'separacao', para: 'conferencia', origem: 'sistema',
          descricao: `Separação concluída no Zen (ordem #${p.zen_ordem_separacao_id}) — foi para Em Conferência`,
        });
      }
    } catch (e) { console.error(`[Lojinha] ordem ${p.zen_ordem_separacao_id}:`, e.message); }
  }
}

// ── Nº do pedido de venda e da NF no Zen (só leitura) ─────
// Lidos aos poucos (até 4 pedidos por vez, em paralelo, cada um no máx. a cada 10 min) enquanto
// faltar a NF emitida; depois que a NF tem número, o pedido não é mais consultado.
let docsRodando = null, docsUltima = 0;
export function atualizarDocumentosZen() {
  if (docsRodando || Date.now() - docsUltima < 20000) return docsRodando || Promise.resolve();
  docsUltima = Date.now();
  docsRodando = (async () => {
    await garantirEstrutura();
    const r = await query(`SELECT id, zen_pedido_id, zen_ordem_separacao_id, zen_venda_numero FROM lojinha_boxer_pedidos
       WHERE zen_pedido_id IS NOT NULL AND (zen_venda_numero IS NULL OR zen_nf_numero IS NULL)
         AND (zen_docs_em IS NULL OR zen_docs_em < NOW() - INTERVAL '10 minutes')
         AND criado_em > NOW() - INTERVAL '60 days'
       ORDER BY (status = 'finalizado' OR cif_status IS NOT NULL) DESC, zen_docs_em NULLS FIRST, id DESC LIMIT 4`);
    await Promise.all(r.rows.map(async (p) => {
      try {
        const d = await documentosZen(p);
        await query(`UPDATE lojinha_boxer_pedidos SET zen_venda_numero = COALESCE($2, zen_venda_numero), zen_nf_numero = $3,
            zen_nf_id = $4, zen_nf_status = $5, zen_docs_em = NOW() WHERE id = $1`, [p.id, d.vendaNumero, d.nfNumero, d.nfId, d.nfStatus]);
      } catch (e) {
        await query(`UPDATE lojinha_boxer_pedidos SET zen_docs_em = NOW() WHERE id = $1`, [p.id]).catch(() => {});
        console.error(`[Lojinha] documentos Zen pedido ${p.id}:`, e.message);
      }
    }));
  })().catch(e => console.error('[Lojinha] documentos Zen:', e.message)).finally(() => { docsRodando = null; });
  return docsRodando;
}

// POST /lojinha/pedidos/:id/mover { status } — muda a coluna do pedido (sem o Pipefy)
export async function moverPedidoLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const status = String(req.body?.status || '');
    const cfg = await cfgLojinha.ler();
    const col = new Map(cfg.colunas.map(c => [c.chave, c]));
    if (!col.has(status) || status === 'entrada') return res.status(400).json({ erro: 'Coluna inválida.' });
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1`, [parseInt(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (!p.zen_ordem_separacao_id) return res.status(409).json({ erro: 'O pedido ainda não tem ordem de separação no Zen.' });
    const atual = ['entrada', 'liberacao'].includes(p.status) ? 'entrada' : p.status;
    if (status === atual) return res.json({ pedido: p });
    if (!temBotao(req.usuario, 'loj_mover_admin') && (col.get(status)?.so_admin || col.get(atual)?.so_admin)) {
      return res.status(403).json({ erro: 'Mover pedidos nessa coluna não está liberado para você (Admin > Usuários).' });
    }
    // Para onde a coluna atual pode mover (Configurar → "Pode mover cards desta coluna para")
    const destinosCol = col.get(atual)?.destinos;
    if (Array.isArray(destinosCol) && !destinosCol.includes(status)) {
      return res.status(400).json({ erro: `De "${col.get(atual)?.nome || atual}" não dá para mover para "${col.get(status)?.nome || status}". Ajuste em Configurar.` });
    }
    // Campos obrigatórios da coluna atual antes de sair dela
    const valores = p.campos || {};
    // Regras da coluna (Configurar → "Regras para mover")
    const motivoRegra = bloqueioRegra(col.get(atual), status, cfg.campos, valores, cfgLojinha.idCampoConfig);
    if (motivoRegra) return res.status(400).json({ erro: `Não dá para mover para "${col.get(status)?.nome || status}": ${motivoRegra} (regra da coluna "${col.get(atual)?.nome || atual}").` });
    const faltando = cfg.campos.filter(c => c.coluna === atual && exigidoAgora(c, cfg.campos, valores, cfgLojinha.idCampoConfig) && c.tipo !== 'anexo'
      && !String(valores[cfgLojinha.idCampoConfig(c)] ?? '').replace(/[\[\]"]/g, '').trim());
    if (faltando.length) return res.status(400).json({ erro: `Preencha antes de sair de "${col.get(atual)?.nome || atual}": ${faltando.map(c => c.rotulo).join(', ')}.` });
    const r = await query(
      `UPDATE lojinha_boxer_pedidos SET status = $2, separacao_em = COALESCE(separacao_em, NOW()),
              finalizado_em = CASE WHEN $3 THEN COALESCE(finalizado_em, NOW()) ELSE NULL END
        WHERE id = $1 RETURNING *`, [p.id, status, status === 'finalizado']);
    await registrarMovLoj(r.rows[0], status === 'finalizado' ? 'finalizado' : 'movido', {
      de: atual, para: status, usuario: req.usuario,
      descricao: `Movido de ${col.get(atual)?.nome || atual} para ${col.get(status)?.nome || status}`,
    });
    // Chegou na "Liberação de Faturamento": e-mail ao faturamento (nunca lança erro)
    if (ehLiberacaoFaturamento(col.get(status)?.nome)) await liberarFaturamento(p.id, req.usuario);
    res.json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}

// GET /lojinha/pedidos
export async function listarPedidosLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    await sincronizarFasesPipefy().catch(e => console.error('[Lojinha] sync:', e.message));
    // Entrada automática na Logística CIF desligada (pedido do Dhiefferton, 04/11/2026)
    await avisarFaturamentoLojinha(); // tentativa de e-mail que falhou
    await atualizarDocumentosZen(); // Nº do pedido de venda e da NF
    const r = await query(
      `SELECT t.*, (SELECT COALESCE(json_agg(json_build_object('id', f.id, 'campo', f.campo_id, 'mime', f.mime, 'nome', f.nome, 'blob_url', f.blob_url, 'tamanho', f.tamanho) ORDER BY f.id), '[]'::json)
                      FROM loj_fotos f WHERE f.pedido_id = t.id) AS fotos_locais
         FROM ((SELECT * FROM lojinha_boxer_pedidos WHERE status <> 'finalizado')
               UNION ALL
               (SELECT * FROM lojinha_boxer_pedidos WHERE status = 'finalizado' ORDER BY finalizado_em DESC NULLS LAST, id DESC LIMIT 60)) t
        ORDER BY t.data DESC, t.id DESC`);
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
    await registrarMovLoj(r.rows[0], 'criado_manual', { para: 'entrada', usuario: req.usuario,
      descricao: `Pedido ${numero} registrado na Entrada (${itens.length} produto(s))` });
    // Cria o pedido no Zen até a ordem de separação
    const pedido = await enviarZen(r.rows[0]);
    res.status(201).json({ pedido });
  } catch (err) { next(err); }
}

// ── Lojinha Faturada: pedido de venda que já existe no Zen ──
// Lê o pedido no Zen e monta o mesmo formato do formulário
async function lerVendaFaturada(numero) {
  const { venda, pessoa, itens } = await buscarVendaZen(numero);
  const doc = soDigitos(pessoa?.documentNumber);
  const cidade = pessoa?.city?.name || null;
  const uf = pessoa?.city?.state?.code || pessoa?.city?.state?.initials || pessoa?.city?.state?.abbreviation || null;
  const lista = (itens || []).map(i => ({
    codigo: String(i.productPacking?.code || '').trim(),
    descricao: String(i.productPacking?.fullDescription || i.productPacking?.product?.description || '').replace(/^\S+\s+/, '').trim(),
    unidade: String(i.productPacking?.unit?.code || 'UN').toUpperCase(),
    quantidade: Number(i.quantity) || 0,
    preco: Number(i.unitValue) || 0,
    frete: Number(i.otherValues?.freightValue) || 0,
  })).filter(i => i.codigo && i.quantidade > 0);
  const frete = Math.round(lista.reduce((t, i) => t + i.frete, 0) * 100) / 100;
  // Envio: o que estiver no comentário do pedido (pedidos feitos pelo B-Requisições) ou a transportadora do pedido
  const coment = String(venda.properties?.comments || '');
  const ship = `${venda.personShipping?.fantasyName || ''} ${venda.personShipping?.name || ''}`;
  let tipo = '', transportadora = '';
  const m = coment.match(/Envio:\s*(Sedex|PAC|Pr[oó]prio|Transportadora)(?:\s*-\s*(.+))?/i);
  if (m) {
    tipo = TIPOS_ENVIO.find(t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === m[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()) || '';
    if (tipo === 'Transportadora') transportadora = TRANSPORTADORAS.find(t => t.nome.toLowerCase() === String(m[2] || '').trim().toLowerCase())?.nome || '';
  } else {
    const t = TRANSPORTADORAS.find(x => ship.toLowerCase().includes(x.nome.toLowerCase()));
    if (t) { tipo = 'Transportadora'; transportadora = t.nome; }
  }
  return {
    zen_pedido_id: Number(venda.id), numero: String(venda.code || '').trim() || String(venda.id), status_zen: venda.status,
    ordem_separacao: venda.pickingOrder?.id || null, data: String(venda.date || venda.availabilityDate || '').slice(0, 10),
    documento: doc, cliente: { id: Number(pessoa?.id) || null, nome: pessoa?.name || '', cidade, uf },
    vendedora: venda.personSalesperson ? { id: Number(venda.personSalesperson.id), nome: venda.personSalesperson.fantasyName || venda.personSalesperson.name } : null,
    itens: lista.map(({ frete: _f, ...i }) => i), valor_frete: frete, tipo_envio: tipo, transportadora,
    transportadora_zen: venda.personShipping?.fantasyName || venda.personShipping?.name || null,
  };
}

// Liga o card da Lojinha Faturada ao pedido de venda do Zen (ordem de separação) e
// segue para Em Separação. Com erro, grava zen_erro (botão "Tentar de novo"). Nunca lança erro.
async function ligarVendaZen(pedido, usuario = null) {
  try {
    const v = await vincularVendaZen(pedido.zen_pedido_id);
    const u = await query(
      `UPDATE lojinha_boxer_pedidos SET zen_ordem_separacao_id = $2, zen_erro = NULL, status = 'liberacao', qtd_cards = $3
        WHERE id = $1 RETURNING *`, [pedido.id, v.ordemSeparacaoId, qtdCards(pedido.itens)]);
    const final = await enviarPipefy(u.rows[0]);
    await registrarMovLoj(final, 'zen_vinculado', { de: pedido.status, para: final.status, usuario, origem: usuario ? 'usuario' : 'sistema',
      descricao: `Ligado ao pedido de venda #${pedido.zen_pedido_id} do Zen — ordem de separação #${v.ordemSeparacaoId}${v.criouOrdem ? ' (gerada agora)' : ' (já existia)'}`,
      detalhes: { zen_pedido_id: pedido.zen_pedido_id, ordem_separacao: v.ordemSeparacaoId } });
    return final;
  } catch (e) {
    const u = await query(`UPDATE lojinha_boxer_pedidos SET zen_erro = $2 WHERE id = $1 RETURNING *`, [pedido.id, e.message]);
    await registrarMovLoj(u.rows[0], 'erro_zen', { origem: 'sistema', descricao: `Erro no Zen: ${String(e.message).slice(0, 500)}` });
    return u.rows[0];
  }
}

// GET /lojinha/zen-pedido/:numero — busca o pedido de venda no Zen (Lojinha Faturada)
export async function buscarPedidoZenLojinha(req, res) {
  try {
    await garantirEstrutura();
    const p = await lerVendaFaturada(req.params.numero);
    const d = await query(`SELECT id, status, numero_pedido FROM lojinha_boxer_pedidos WHERE zen_pedido_id = $1 OR LOWER(numero_pedido) = LOWER($2) LIMIT 1`, [p.zen_pedido_id, p.numero]);
    res.json({ pedido: { ...p, duplicado: d.rows[0] || null } });
  } catch (e) { res.status(e.status || 502).json({ erro: e.message }); }
}

// POST /lojinha/pedidos/zen { numero, tipo_envio, transportadora, assistente_autorizado }
// Registra na Entrada um pedido que já existe no Zen (relido aqui) e liga o card a ele:
// usa a ordem de separação existente ou gera uma; não cria pedido novo.
export async function criarPedidoLojinhaFaturada(req, res, next) {
  try {
    await garantirEstrutura();
    const b = req.body || {};
    const tipo = String(b.tipo_envio || '').trim();
    const transportadora = String(b.transportadora || '').trim();
    if (!TIPOS_ENVIO.includes(tipo)) return res.status(400).json({ erro: 'Escolha o tipo de envio.' });
    if (tipo === 'Transportadora' && !TRANSPORTADORAS.some(t => t.nome === transportadora)) return res.status(400).json({ erro: 'Escolha a transportadora.' });
    let p;
    try { p = await lerVendaFaturada(b.numero); }
    catch (e) { return res.status(e.status || 502).json({ erro: e.message }); }
    if (p.documento.length !== 11 && p.documento.length !== 14) return res.status(400).json({ erro: 'O cliente do pedido no Zen está sem CPF/CNPJ válido.' });
    if (!p.itens.length) return res.status(400).json({ erro: 'O pedido no Zen não tem produtos.' });
    if (!p.vendedora?.id) return res.status(400).json({ erro: 'O pedido no Zen está sem vendedor(a).' });
    const dup = await query(`SELECT id FROM lojinha_boxer_pedidos WHERE zen_pedido_id = $1 OR LOWER(numero_pedido) = LOWER($2) LIMIT 1`, [p.zen_pedido_id, p.numero]);
    if (dup.rows[0]) return res.status(409).json({ erro: `O pedido ${p.numero} já foi registrado aqui.` });
    const itens = [];
    for (const it of p.itens) {
      const m = await produtoPorSku(it.codigo).catch(() => null);
      itens.push({ material_id: m?.id || null, codigo: it.codigo, descricao: m?.descricao || it.descricao, unidade: m?.unidade || it.unidade, quantidade: it.quantidade, preco: it.preco });
    }
    const r = await query(
      `INSERT INTO lojinha_boxer_pedidos (documento, cliente_id_zen, cliente_nome, cliente_cidade, cliente_uf, data,
          numero_pedido, vendedora, tipo_envio, transportadora, itens, criado_por, criado_por_nome,
          assistente_autorizado, valor_frete, vendedora_id_zen, zen_pedido_id, origem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'zen') RETURNING *`,
      [p.documento, p.cliente.id, p.cliente.nome, [p.cliente.cidade, p.cliente.uf].filter(Boolean).join(' / ') || null,
       String(p.cliente.uf || '').toUpperCase().slice(0, 2) || null, /^\d{4}-\d{2}-\d{2}$/.test(p.data) ? p.data : new Date().toISOString().slice(0, 10),
       p.numero, p.vendedora.nome, tipo, tipo === 'Transportadora' ? transportadora : null, JSON.stringify(itens),
       req.usuario.id, req.usuario.nome, b.assistente_autorizado === true, p.valor_frete, p.vendedora.id, p.zen_pedido_id]);
    let pedido = r.rows[0];
    await registrarMovLoj(pedido, 'criado_manual', { para: 'entrada', usuario: req.usuario,
      descricao: `Lojinha Faturada: pedido de venda ${p.numero} do Zen registrado na Entrada (${itens.length} produto(s))` });
    pedido = await ligarVendaZen(pedido, req.usuario);
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

    // 1. Zen (Lojinha Faturada: o pedido é do Zen — não exclui lá, só tira o card daqui)
    const faturadaZen = p.origem === 'zen';
    if (p.zen_pedido_id && !faturadaZen) {
      try {
        await excluirPedidoVendaZen({ zen_pedido_id: p.zen_pedido_id });
        await query(`UPDATE lojinha_boxer_pedidos SET zen_pedido_id = NULL, zen_ordem_separacao_id = NULL WHERE id = $1`, [p.id]);
      } catch (e) {
        await query(`UPDATE lojinha_boxer_pedidos SET zen_erro = $2 WHERE id = $1`, [p.id, `Exclusão: ${e.message}`]);
        return res.status(502).json({ erro: `Não consegui excluir o pedido ${p.zen_pedido_id} no Zen: ${e.message}` });
      }
    }

    // 2. Pipefy (desligado: os cards antigos ficam lá, nada é chamado)
    const cards = PIPEFY_ATIVO ? (Array.isArray(p.pipefy_cards) ? p.pipefy_cards : []).filter(c => c?.id) : [];
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
    await query(`DELETE FROM loj_fotos WHERE pedido_id = $1`, [p.id]);
    await registrarMovLoj(p, 'cancelado', { de: p.status, usuario: req.usuario,
      descricao: `Pedido ${p.numero_pedido} excluído${p.zen_pedido_id ? (faturadaZen ? ` (Lojinha Faturada: pedido #${p.zen_pedido_id} continua no Zen)` : ` (pedido #${p.zen_pedido_id} excluído no Zen)`) : ''}` });
    res.json({ ok: true, numero_pedido: p.numero_pedido, zen_pedido_id: p.zen_pedido_id, cards: cards.length });
  } catch (err) { next(err); }
}

// ── Campos do pedido (configurados em Configurar) ───────────
// POST /lojinha/pedidos/:id/campos { campos: { bx_<id>: valor } }
export async function editarCamposLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const campos = req.body?.campos;
    if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return res.status(400).json({ erro: 'Envie { campos: { id: valor } }.' });
    const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1`, [parseInt(req.params.id)])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const cfg = await cfgLojinha.ler();
    const rot = new Map(cfg.campos.map(c => [cfgLojinha.idCampoConfig(c), c.rotulo]));
    const novo = { ...(p.campos || {}) };
    const alterados = [];
    for (const [k, v] of Object.entries(campos)) {
      if (!/^[a-z0-9_]{1,80}$/i.test(k)) continue;
      const valor = v == null ? '' : String(v).slice(0, 5000);
      if (valor === '') delete novo[k]; else novo[k] = valor;
      alterados.push(rot.get(k) || k);
    }
    const r = await query(`UPDATE lojinha_boxer_pedidos SET campos = $2::jsonb WHERE id = $1 RETURNING *`, [p.id, JSON.stringify(novo)]);
    if (alterados.length) await registrarMovLoj(p, 'campos_editados', { usuario: req.usuario, descricao: `Campos preenchidos: ${alterados.join(', ')}`, detalhes: campos });
    res.json({ pedido: r.rows[0] });
  } catch (err) { next(err); }
}

// ── Fotos do pedido ─────────────────────────────────────────
// Fotos e arquivos (PDF, Word, Excel, texto) anexados no card
const MIMES_ANEXO = /^(image\/(?:jpeg|png|webp|gif)|application\/pdf|application\/msword|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.[\w.]+|text\/(?:plain|csv))$/;
const MAX_ARQUIVO = 2.5 * 1024 * 1024;
function dataUrlParaBuffer(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s);
  if (!m || !MIMES_ANEXO.test(m[1])) return null;
  const buf = Buffer.from(m[2], 'base64');
  return buf.length ? { mime: m[1], buf } : null;
}
const nomeAnexo = (n) => String(n || '').replace(/[\r\n"\\/]/g, ' ').trim().slice(0, 200) || null;
const limiteAnexo = (img) => (img.mime.startsWith('image/') ? 1200 * 1024 : MAX_ARQUIVO);
// POST /lojinha/pedidos/:id/fotos { campo_id, imagem, miniatura }
export async function enviarFotoLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const id = parseInt(req.params.id);
    const campo = String(req.body?.campo_id || '').trim().slice(0, 120);
    if (!campo) return res.status(400).json({ erro: 'Campo da foto não informado.' });
    // Vídeo / arquivo grande: já foi enviado direto ao Vercel Blob; aqui só guarda o link
    if (req.body?.blob) {
      const b = lerEnvioBlob(req.body.blob);
      if (!b) return res.status(400).json({ erro: 'Envio do arquivo inválido.' });
      const p = (await query(`SELECT id, numero_pedido, cliente_nome FROM lojinha_boxer_pedidos WHERE id = $1`, [id])).rows[0];
      if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
      const r = await query(
        `INSERT INTO loj_fotos (pedido_id, campo_id, imagem, mime, usuario_id, usuario_nome, nome, blob_url, tamanho)
         VALUES ($1,$2,'\\x'::bytea,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [id, campo, b.mime, req.usuario?.id || null, req.usuario?.nome || null, b.nome, b.url, b.tamanho]);
      await registrarArquivoBlob({ ...b, quadro: 'loj', pedido_id: id, campo_id: campo, foto_id: r.rows[0].id, usuario: req.usuario });
      await registrarMovLoj(p, 'foto_adicionada', { usuario: req.usuario, descricao: b.mime.startsWith('video/') ? 'Vídeo adicionado' : 'Arquivo adicionado', detalhes: { foto_id: r.rows[0].id, campo } });
      return res.status(201).json({ id: r.rows[0].id });
    }
    const img = dataUrlParaBuffer(req.body?.imagem);
    const mini = dataUrlParaBuffer(req.body?.miniatura);
    if (!img) return res.status(400).json({ erro: 'Arquivo inválido. Envie foto, PDF, Word, Excel ou texto.' });
    if (img.buf.length > limiteAnexo(img)) return res.status(413).json({ erro: img.mime.startsWith('image/') ? 'Foto muito grande.' : 'Arquivo muito grande (máximo 2,5 MB).' });
    const p = (await query(`SELECT id, numero_pedido, cliente_nome FROM lojinha_boxer_pedidos WHERE id = $1`, [id])).rows[0];
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const r = await query(
      `INSERT INTO loj_fotos (pedido_id, campo_id, imagem, miniatura, mime, usuario_id, usuario_nome, nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [id, campo, img.buf, mini?.buf || null, img.mime, req.usuario?.id || null, req.usuario?.nome || null, nomeAnexo(req.body?.nome)]);
    await registrarMovLoj(p, 'foto_adicionada', { usuario: req.usuario, descricao: 'Foto adicionada', detalhes: { foto_id: r.rows[0].id, campo } });
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) { next(err); }
}
// GET /lojinha/fotos/:fotoId?tam=mini
export async function verFotoLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const f = (await query(`SELECT imagem, miniatura, mime, nome FROM loj_fotos WHERE id = $1`, [parseInt(req.params.fotoId) || 0])).rows[0];
    if (!f) return res.status(404).json({ erro: 'Foto não encontrada.' });
    res.set('Content-Type', f.mime || 'image/jpeg');
    if (f.nome) res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.nome)}`);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(req.query.tam === 'mini' && f.miniatura ? f.miniatura : f.imagem);
  } catch (err) { next(err); }
}
// DELETE /lojinha/fotos/:fotoId — admin ou quem enviou
export async function excluirFotoLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const f = (await query(`SELECT id, pedido_id, campo_id, usuario_id, blob_url FROM loj_fotos WHERE id = $1`, [parseInt(req.params.fotoId) || 0])).rows[0];
    if (!f) return res.status(404).json({ erro: 'Foto não encontrada.' });
    if (req.usuario?.perfil !== 'admin' && f.usuario_id !== req.usuario?.id) return res.status(403).json({ erro: 'Só o administrador ou quem enviou a foto pode excluir.' });
    await query(`DELETE FROM loj_fotos WHERE id = $1`, [f.id]);
    if (f.blob_url) await excluirArquivoBlob(f.blob_url);
    const p = (await query(`SELECT id, numero_pedido, cliente_nome FROM lojinha_boxer_pedidos WHERE id = $1`, [f.pedido_id])).rows[0];
    await registrarMovLoj(p || { id: f.pedido_id }, 'foto_excluida', { usuario: req.usuario, descricao: 'Foto excluída', detalhes: { foto_id: f.id, campo: f.campo_id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// GET /lojinha/movimentos?de=&ate=&pedido=
export async function listarMovimentosLojinha(req, res, next) {
  try {
    await garantirEstrutura();
    const filtros = [], valores = [];
    if (req.query.de)     { valores.push(req.query.de);  filtros.push(`m.criado_em >= ($${valores.length}::date AT TIME ZONE 'America/Sao_Paulo')`); }
    if (req.query.ate)    { valores.push(req.query.ate); filtros.push(`m.criado_em <  (($${valores.length}::date + 1) AT TIME ZONE 'America/Sao_Paulo')`); }
    if (req.query.pedido) { valores.push(parseInt(req.query.pedido)); filtros.push(`m.pedido_id = $${valores.length}`); }
    const r = await query(
      `SELECT m.id, m.pedido_id, m.tipo, m.de_status, m.para_status, m.descricao, m.detalhes,
              m.usuario_id, m.usuario_nome, m.origem, m.criado_em,
              COALESCE(p.cliente_nome, m.cliente_nome) AS cliente_nome,
              COALESCE('Pedido ' || p.numero_pedido, m.referencia) AS referencia,
              p.zen_pedido_id, CASE WHEN p.status = 'liberacao' THEN 'entrada' ELSE p.status END AS status_atual
         FROM loj_movimentos m
         LEFT JOIN lojinha_boxer_pedidos p ON p.id = m.pedido_id
        ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
        ORDER BY m.criado_em DESC, m.id DESC
        LIMIT 5000`, valores);
    res.json({ movimentos: r.rows });
  } catch (err) { next(err); }
}
