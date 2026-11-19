// ============================================================
// integrations/relatoriosLocais.js — Quadros do Boxer Operações nos Relatórios
// ============================================================
// Os relatórios leem a tabela rel_cards (cards importados do Pipefy). Aqui os cards
// criados no próprio sistema (Orçamentos, Lojinha, Garantia e telas criadas no
// Início › Telas) são copiados para a mesma tabela com pipe_id = 'bo:<fonte>', no
// mesmo formato (campos pelo NOME do campo, histórico de fases pelo NOME da coluna).
// Assim um relatório do Pipefy pode somar os cards do sistema: campos com o mesmo
// nome caem na mesma coluna do relatório.
// • Cópia refeita na hora de rodar o relatório (no máx. 1x/min por fonte).
// • Card que já tem card no Pipefy do relatório (pipefy_refs) não entra de novo.
// • Só leitura dos quadros: nada é alterado nas telas.
// ============================================================
import { query } from '../config/db.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const INTERVALO_MS = 60000;
const ultimaSync = new Map();

// ── Valores no mesmo formato do Pipefy ───────────────────────
function partesData(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return { d: m[3], mo: m[2], a: m[1], h: m[4], mi: m[5] };
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2}))?/);
  if (m) return { d: m[1], mo: m[2], a: m[3], h: m[4], mi: m[5] };
  return null;
}
function textoValor(v, tipo) {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? (x.title ?? x.nome ?? x.name ?? '') : String(x ?? ''))).filter(Boolean).join(', ');
  if (typeof v === 'object') return String(v.title ?? v.nome ?? v.name ?? '');
  let s = String(v).trim();
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) s = textoValor(a); } catch { /* texto */ } }
  if (['datahora', 'data', 'vencimento'].includes(tipo)) {
    const p = partesData(s);
    if (p) {
      if (tipo === 'data' || !p.h) return `${p.d}/${p.mo}/${p.a}`;
      return `${p.d} de ${MESES[Number(p.mo) - 1]} de ${p.a}, ${p.h}:${p.mi}`;
    }
  }
  return s;
}

// ── Configuração (campos e colunas) de cada quadro ──────────
async function lerConfig(TC, TF, prefixo) {
  const [cols, campos] = await Promise.all([
    query(`SELECT chave, nome FROM ${TC}`).catch(() => ({ rows: [] })),
    query(`SELECT id, rotulo, tipo, pipefy_campo FROM ${TF} WHERE ativo`).catch(() =>
      query(`SELECT id, rotulo, tipo FROM ${TF} WHERE ativo`).catch(() => ({ rows: [] }))),
  ]);
  const fases = new Map(cols.rows.map(c => [c.chave, c.nome]));
  const porId = new Map();
  for (const c of campos.rows) porId.set(c.pipefy_campo || `${prefixo}${c.id}`, { nome: c.rotulo, tipo: c.tipo });
  return { fases, porId };
}

// Valores { idCampo: valor } → { "Nome do campo": "texto" }
function camposPorNome(valores, porId, extra = {}) {
  const out = { ...extra };
  for (const [id, v] of Object.entries(valores || {})) {
    const cfg = porId.get(id);
    if (!cfg?.nome) continue;
    const t = textoValor(v, cfg.tipo);
    if (t) out[cfg.nome] = t;
  }
  for (const k of Object.keys(out)) if (out[k] === '' || out[k] == null) delete out[k];
  return out;
}

// Movimentos (de → para) → histórico no formato do Pipefy: [{ fase, entrou, saiu, duracao }]
function montarHistorico(criadoEm, statusAtual, movs, fases) {
  const nome = (k) => fases.get(k) || k;
  const hist = [];
  const lista = movs.filter(m => m.para_status && m.para_status !== m.de_status);
  let fase = lista[0]?.de_status || statusAtual;
  let desde = criadoEm ? new Date(criadoEm) : null;
  for (const m of lista) {
    const t = new Date(m.criado_em);
    if (fase && desde) hist.push({ fase: nome(fase), entrou: desde.toISOString(), saiu: t.toISOString(), duracao: Math.max(0, Math.round((t - desde) / 1000)) });
    fase = m.para_status; desde = t;
  }
  if (fase && desde) hist.push({ fase: nome(fase), entrou: desde.toISOString(), saiu: null, duracao: Math.max(0, Math.round((Date.now() - desde) / 1000)) });
  return hist;
}
const movsPor = (rows) => {
  const m = new Map();
  for (const r of rows) { const k = Number(r.pedido_id); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
};
const finalizadoDe = (hist) => [...hist].reverse().find(h => /finaliz|conclu|expedi/i.test(h.fase))?.entrou || null;

// ── Fontes ────────────────────────────────────────────────────
async function cardsOrcamentos() {
  const { fases, porId } = await lerConfig('orc_colunas', 'orc_campos', 'bx_');
  const r = await query(`SELECT p.id, p.referencia, p.status, p.created_at, p.atualizado_em, p.pipefy_card_id, p.pipefy_url,
                                p.pipefy_campos, p.campos_editados, u.nome AS criado_por_nome
                           FROM pedidos_orcamento p LEFT JOIN usuarios u ON u.id = p.criado_por`);
  const movs = movsPor((await query(`SELECT pedido_id, de_status, para_status, criado_em FROM pedidos_orcamento_movimentos
                                       WHERE pedido_id IS NOT NULL ORDER BY criado_em, id`).catch(() => ({ rows: [] }))).rows);
  return r.rows.map(p => {
    // Campos que vieram do Pipefy (nome do Pipefy) + os preenchidos no sistema
    const doPipefy = {};
    const nomesPipefy = new Map();
    for (const c of Array.isArray(p.pipefy_campos) ? p.pipefy_campos : []) {
      if (c?.id && c?.nome) nomesPipefy.set(c.id, c.nome);
      const t = textoValor(c?.valor);
      if (c?.nome && t) doPipefy[c.nome] = t;
    }
    const porIdCard = new Map(porId);
    for (const [id, nome] of nomesPipefy) if (!porIdCard.has(id)) porIdCard.set(id, { nome, tipo: null });
    const hist = montarHistorico(p.created_at, p.status, movs.get(Number(p.id)) || [], fases);
    return {
      id: p.id, titulo: p.referencia, fase: fases.get(p.status) || p.status, criado_em: p.created_at, atualizado_em: p.atualizado_em,
      finalizado_em: finalizadoDe(hist), criado_por: p.criado_por_nome, url: p.pipefy_url || null,
      campos: camposPorNome(p.campos_editados, porIdCard, doPipefy), historico: hist,
      refs: p.pipefy_card_id ? [String(p.pipefy_card_id)] : [],
    };
  });
}

async function cardsLojinha() {
  const { fases, porId } = await lerConfig('loj_colunas', 'loj_campos', 'bx_');
  const r = await query(`SELECT * FROM lojinha_boxer_pedidos`);
  const movs = movsPor((await query(`SELECT pedido_id, de_status, para_status, criado_em FROM loj_movimentos
                                       WHERE pedido_id IS NOT NULL AND tipo NOT LIKE 'cif%' ORDER BY criado_em, id`).catch(() => ({ rows: [] }))).rows);
  return r.rows.map(p => {
    const fixos = {
      'Número do pedido': p.numero_pedido, 'Cliente': p.cliente_nome, 'CPF/CNPJ': p.documento, 'Vendedora': p.vendedora,
      'Tipo de envio': p.tipo_envio, 'Transportadora': p.transportadora,
      'Número da Ordem de Separação': p.zen_ordem_separacao_id ? String(p.zen_ordem_separacao_id) : '',
      'Pedido de venda (Zen)': p.zen_venda_numero || (p.zen_pedido_id ? String(p.zen_pedido_id) : ''),
      'Nota fiscal': p.zen_nf_numero,
    };
    const hist = montarHistorico(p.criado_em, p.status, movs.get(Number(p.id)) || [], fases);
    return {
      id: p.id, titulo: [p.numero_pedido, p.cliente_nome].filter(Boolean).join(' — '), fase: fases.get(p.status) || p.status,
      criado_em: p.criado_em, atualizado_em: null, finalizado_em: p.finalizado_em || finalizadoDe(hist), criado_por: p.criado_por_nome, url: null,
      campos: camposPorNome(p.campos, porId, Object.fromEntries(Object.entries(fixos).map(([k, v]) => [k, v == null ? '' : String(v)]))),
      historico: hist,
      refs: (Array.isArray(p.pipefy_cards) ? p.pipefy_cards : []).map(c => c?.id).filter(Boolean).map(String),
    };
  });
}

async function cardsGarantia() {
  const { fases, porId } = await lerConfig('cif_colunas', 'cif_campos', 'cif_bx_');
  const r = await query(`SELECT * FROM lojinha_boxer_pedidos WHERE cif_status IS NOT NULL AND cif_status <> '_excluido'`);
  const movs = movsPor((await query(`SELECT pedido_id, de_status, para_status, criado_em FROM loj_movimentos
                                       WHERE pedido_id IS NOT NULL AND tipo LIKE 'cif%' ORDER BY criado_em, id`).catch(() => ({ rows: [] }))).rows);
  return r.rows.map(p => {
    const inicio = p.cif_entrou_em || p.criado_em;
    const hist = montarHistorico(inicio, p.cif_status, movs.get(Number(p.id)) || [], fases);
    return {
      id: p.id, titulo: p.cliente_nome, fase: fases.get(p.cif_status) || p.cif_status, criado_em: inicio, atualizado_em: null,
      finalizado_em: finalizadoDe(hist), criado_por: p.criado_por_nome, url: p.pipefy_garantia_url || null,
      campos: camposPorNome(p.cif_valores, porId, { 'Número do pedido': p.numero_pedido ? String(p.numero_pedido) : '', 'Cliente': p.cliente_nome || '' }),
      historico: hist,
      refs: p.pipefy_garantia_id ? [String(p.pipefy_garantia_id)] : [],
    };
  });
}

async function cardsQuadro(n) {
  const { fases, porId } = await lerConfig(`qd${n}_colunas`, `qd${n}_campos`, 'bx_');
  const r = await query(`SELECT * FROM bx_quadro_cards WHERE quadro_id = $1`, [n]);
  const movs = movsPor((await query(`SELECT pedido_id, de_status, para_status, criado_em FROM bx_quadro_movimentos
                                       WHERE quadro_id = $1 AND pedido_id IS NOT NULL ORDER BY criado_em, id`, [n]).catch(() => ({ rows: [] }))).rows);
  return r.rows.map(p => {
    const hist = montarHistorico(p.criado_em, p.status, movs.get(Number(p.id)) || [], fases);
    return {
      id: p.id, titulo: p.titulo, fase: fases.get(p.status) || p.status, criado_em: p.criado_em, atualizado_em: p.atualizado_em,
      finalizado_em: finalizadoDe(hist), criado_por: p.criado_por_nome, url: null,
      campos: camposPorNome(p.valores, porId), historico: hist, refs: [],
    };
  });
}

// ── Telas do sistema que não são quadros (Requisições, Compras…) ──
// Cada linha da tabela vira um card: colunas → campos (nome legível), status → fase.
const rotuloAuto = (k) => String(k).replace(/_/g, ' ').replace(/\b(id|zen|nf|ns|sku)\b/gi, m => m.toUpperCase()).replace(/^./, c => c.toUpperCase());
const OCULTAR = /^(id|senha|hash|token|imagem|miniatura|filtros|itens|.*_id)$/i;
// Data/hora no horário de Brasília (data pura, sem hora, fica dd/mm/aaaa)
function dataBr(d) {
  if (isNaN(d)) return '';
  if (!d.getUTCHours() && !d.getUTCMinutes() && !d.getUTCSeconds() && !d.getUTCMilliseconds()) {
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.day} de ${MESES[Number(p.month) - 1]} de ${p.year}, ${p.hour}:${p.minute}`;
}
function valorCampo(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return dataBr(v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'object') return '';
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? dataBr(new Date(s)) : s;
}
function telaSistema({ chave, nome, sql, sqlSimples = null, fases = {}, rotulos = {}, card, hist = null }) {
  const lerLinhas = async (soNomes = false) => {
    const q = (x) => query(soNomes ? `SELECT * FROM (${x}) z LIMIT 0` : x);
    try { return await q(sql); } catch (e) { if (!sqlSimples) throw e; return q(sqlSimples); }
  };
  const nomeFase = (st) => fases[st] || rotuloAuto(st || '—');
  return {
    chave, nome, sistema: true,
    // Campos e fases para montar colunas/filtros (lê só os nomes das colunas)
    async estrutura() {
      const r = await lerLinhas(true).catch(() => ({ rows: [], fields: [] }));
      const cols = (r.fields || []).map(f => f.name).filter(k => !OCULTAR.test(k) && !['status'].includes(k));
      return { campos: cols.map(k => rotulos[k] || rotuloAuto(k)), fases: Object.values(fases) };
    },
    async ler() {
      const r = await lerLinhas();
      const historicos = hist ? await hist().catch(() => new Map()) : new Map();
      return r.rows.map(row => {
        const c = card(row);
        const campos = {};
        for (const [k, v] of Object.entries(row)) {
          if (OCULTAR.test(k) || k === 'status') continue;
          const t = valorCampo(v);
          if (t) campos[rotulos[k] || rotuloAuto(k)] = t;
        }
        const movs = historicos.get(Number(row.id)) || [];
        const h = movs.length
          ? montarHistorico(c.criado_em, row.status, movs, { get: (k) => nomeFase(k) })
          : [{ fase: nomeFase(row.status ?? c.status), entrou: c.criado_em ? new Date(c.criado_em).toISOString() : null, saiu: null, duracao: 0 }];
        return { id: row.id, titulo: c.titulo, fase: nomeFase(row.status ?? c.status), criado_em: c.criado_em, atualizado_em: c.atualizado_em || null,
          finalizado_em: c.finalizado_em || null, criado_por: c.criado_por || null, url: null, campos, historico: h, refs: [] };
      });
    },
  };
}

const TELAS_SISTEMA = [
  telaSistema({
    chave: 'requisicoes', nome: 'Requisições',
    sql: `SELECT r.*, u.nome AS solicitante, d.nome AS departamento,
            (SELECT string_agg(i.codigo_snapshot || ' - ' || i.descricao_snapshot || ' (' || i.quantidade || ' ' || i.unidade_snapshot || ')', '; ' ORDER BY i.id)
               FROM itens_requisicao i WHERE i.requisicao_id = r.id) AS materiais,
            (SELECT COUNT(*) FROM itens_requisicao i WHERE i.requisicao_id = r.id) AS qtd_itens
          FROM requisicoes r LEFT JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN departamentos d ON d.id = r.departamento_id`,
    sqlSimples: `SELECT * FROM requisicoes`,
    fases: { solicitado: 'Solicitado', em_separacao: 'Em separação', separado: 'Separado', entregue: 'Entregue', cancelado: 'Cancelado' },
    rotulos: { data_necessidade: 'Data de necessidade', observacoes: 'Observações', created_at: 'Criado em', updated_at: 'Atualizado em', qtd_itens: 'Qtd. de itens' },
    card: (r) => ({ titulo: `Requisição #${r.id}${r.solicitante ? ` — ${r.solicitante}` : ''}`, criado_em: r.created_at, atualizado_em: r.updated_at,
      criado_por: r.solicitante, finalizado_em: r.status === 'entregue' ? r.updated_at : null }),
    hist: async () => movsPor((await query(`SELECT requisicao_id AS pedido_id, status_anterior AS de_status, status_novo AS para_status, created_at AS criado_em
      FROM historico_status WHERE status_anterior IS NOT NULL ORDER BY created_at, id`)).rows),
  }),
  telaSistema({
    chave: 'compras', nome: 'Compras',
    sql: `SELECT p.*, m.codigo, m.descricao AS material, u.nome AS criado_por_nome, a.nome AS aprovado_por_nome,
            (SELECT COUNT(*) FROM cotacoes c WHERE c.processo_id = p.id) AS cotacoes
          FROM processos_compra p LEFT JOIN materiais m ON m.id = p.material_id
          LEFT JOIN usuarios u ON u.id = p.criado_por LEFT JOIN usuarios a ON a.id = p.aprovado_por`,
    sqlSimples: `SELECT * FROM processos_compra`,
    fases: { aguardando_cotacao: 'Aguardando cotação', pronta_aprovar: 'Pronta p/ aprovar', aprovada: 'Aprovada', cancelada: 'Cancelada' },
    rotulos: { quantidade_necessaria: 'Quantidade necessária', created_at: 'Criado em', aprovado_em: 'Aprovado em', criado_por_nome: 'Criado por', aprovado_por_nome: 'Aprovado por', codigo: 'Código' },
    card: (r) => ({ titulo: `Compra #${r.id}${r.codigo ? ` — ${r.codigo} ${r.material || ''}` : ''}`.trim(), criado_em: r.created_at,
      criado_por: r.criado_por_nome, finalizado_em: r.aprovado_em || null }),
  }),
  telaSistema({
    chave: 'necessidade_pecas', nome: 'Necessidade de Peças',
    sql: `SELECT n.*, s.nome AS solicitado_por_nome, rv.nome AS revisado_por_nome, ap.nome AS aprovado_por_nome
          FROM necessidades_pecas n LEFT JOIN usuarios s ON s.id = n.solicitado_por
          LEFT JOIN usuarios rv ON rv.id = n.revisado_por LEFT JOIN usuarios ap ON ap.id = n.aprovado_por`,
    sqlSimples: `SELECT * FROM necessidades_pecas`,
    fases: { solicitado: 'Solicitado', em_andamento: 'Em andamento', aprovado: 'Aprovado', cancelado: 'Cancelado' },
    rotulos: { codigo_snapshot: 'Código', descricao_snapshot: 'Descrição', frete_maritimo: 'Frete marítimo', frete_aereo: 'Frete aéreo',
      solicitado_em: 'Solicitado em', revisado_em: 'Revisado em', aprovado_em: 'Aprovado em', observacoes: 'Observações',
      solicitado_por_nome: 'Solicitado por', revisado_por_nome: 'Revisado por', aprovado_por_nome: 'Aprovado por' },
    card: (r) => ({ titulo: `${r.codigo_snapshot || ''} ${r.descricao_snapshot || ''}`.trim() || `Necessidade #${r.id}`, criado_em: r.solicitado_em || r.created_at,
      criado_por: r.solicitado_por_nome, finalizado_em: r.aprovado_em || null }),
  }),
  telaSistema({
    chave: 'recebimento_importacao', nome: 'Recebimento de Importação',
    sql: `SELECT n.nf_erp_id AS id, n.numero, n.fornecedor, n.data_nota, n.valor_total, n.status_fiscal, n.total_itens, n.verificado_em,
            CASE WHEN n.verificado_em IS NOT NULL THEN 'verificada' ELSE 'pendente' END AS status,
            (SELECT COUNT(*) FROM rec_imp_itens i WHERE i.nf_erp_id = n.nf_erp_id AND i.situacao IS NOT NULL) AS itens_conferidos
          FROM rec_imp_notas n`,
    fases: { pendente: 'Pendente', verificada: 'Verificada' },
    rotulos: { numero: 'Nº da nota', data_nota: 'Data da nota', valor_total: 'Valor total', status_fiscal: 'Status fiscal', total_itens: 'Total de itens', verificado_em: 'Verificado em', itens_conferidos: 'Itens conferidos' },
    card: (r) => ({ titulo: `NF ${r.numero || r.id}${r.fornecedor ? ` — ${r.fornecedor}` : ''}`, criado_em: r.data_nota, finalizado_em: r.verificado_em || null }),
  }),
  telaSistema({
    chave: 'inventario', nome: 'Inventário',
    sql: `SELECT v.*, (SELECT COUNT(*) FROM inventario_itens i WHERE i.inventario_id = v.id) AS total_itens,
            (SELECT COUNT(*) FROM inventario_itens i WHERE i.inventario_id = v.id AND i.contado IS NOT NULL) AS itens_contados
          FROM inventarios v`,
    sqlSimples: `SELECT * FROM inventarios`,
    fases: { andamento: 'Em andamento', finalizado: 'Finalizado', cancelado: 'Cancelado' },
    rotulos: { criado_em: 'Criado em', finalizado_em: 'Finalizado em', criado_por_nome: 'Criado por', finalizado_por_nome: 'Finalizado por', total_itens: 'Total de itens', itens_contados: 'Itens contados' },
    card: (r) => ({ titulo: `Inventário #${r.id}`, criado_em: r.criado_em, criado_por: r.criado_por_nome, finalizado_em: r.finalizado_em || null }),
  }),
  telaSistema({
    chave: 'entradas', nome: 'Entradas de Estoque',
    sql: `SELECT e.*, 'registrada' AS status, m.codigo, m.descricao AS material, u.nome AS registrado_por
          FROM entradas_estoque e LEFT JOIN materiais m ON m.id = e.material_id LEFT JOIN usuarios u ON u.id = e.usuario_id`,
    sqlSimples: `SELECT e.*, 'registrada' AS status FROM entradas_estoque e`,
    fases: { registrada: 'Registrada' },
    rotulos: { codigo: 'Código', observacao: 'Observação', valor_unitario: 'Valor unitário', created_at: 'Criado em', registrado_por: 'Registrado por' },
    card: (r) => ({ titulo: `Entrada #${r.id}${r.codigo ? ` — ${r.codigo} ${r.material || ''}` : ''}`.trim(), criado_em: r.created_at || r.criado_em || r.data, criado_por: r.registrado_por }),
  }),
];

const FIXAS_FONTE = [
  { chave: 'orcamentos', nome: 'Orçamentos', ler: cardsOrcamentos, cfg: ['orc_colunas', 'orc_campos'] },
  { chave: 'lojinha',    nome: 'Lojinha Boxer', ler: cardsLojinha, cfg: ['loj_colunas', 'loj_campos'],
    extras: ['Número do pedido', 'Cliente', 'CPF/CNPJ', 'Vendedora', 'Tipo de envio', 'Transportadora', 'Número da Ordem de Separação', 'Pedido de venda (Zen)', 'Nota fiscal'] },
  { chave: 'garantia',   nome: 'Garantia', ler: cardsGarantia, cfg: ['cif_colunas', 'cif_campos'], extras: ['Número do pedido', 'Cliente'] },
  ...TELAS_SISTEMA,
];
export const fonteValida = (k) => FIXAS_FONTE.some(f => f.chave === k) || /^quadro_\d{1,9}$/.test(String(k));
export const nomeOrigemSql = `'Boxer Operações'`;

/** Lista as fontes do sistema com os campos e as fases (para montar colunas/filtros). */
export async function listarFontes() {
  const quadros = (await query(`SELECT id, nome FROM bx_quadros WHERE ativo ORDER BY ordem, id`).catch(() => ({ rows: [] }))).rows;
  const fontes = [
    ...FIXAS_FONTE.filter(f => !f.sistema).map(f => ({ chave: f.chave, nome: f.nome, TC: f.cfg[0], TF: f.cfg[1], extras: f.extras || [] })),
    ...quadros.map(q => ({ chave: `quadro_${q.id}`, nome: q.nome, TC: `qd${q.id}_colunas`, TF: `qd${q.id}_campos`, extras: [] })),
  ];
  const out = [];
  for (const f of fontes) {
    const [cols, campos] = await Promise.all([
      query(`SELECT nome FROM ${f.TC} WHERE ativo ORDER BY ordem, chave`).catch(() => ({ rows: [] })),
      query(`SELECT DISTINCT rotulo FROM ${f.TF} WHERE ativo ORDER BY rotulo`).catch(() => ({ rows: [] })),
    ]);
    let nomesCampos = [...f.extras, ...campos.rows.map(c => c.rotulo)];
    if (f.chave === 'orcamentos') {
      // Campos que vieram do Pipefy nos cards
      const p = await query(`SELECT DISTINCT e->>'nome' AS n FROM pedidos_orcamento,
                               jsonb_array_elements(CASE WHEN jsonb_typeof(pipefy_campos) = 'array' THEN pipefy_campos ELSE '[]'::jsonb END) e`).catch(() => ({ rows: [] }));
      nomesCampos = [...nomesCampos, ...p.rows.map(r => r.n)];
    }
    out.push({ chave: f.chave, nome: f.nome, campos: [...new Set(nomesCampos.filter(Boolean))], fases: cols.rows.map(c => ({ nome: c.nome })) });
  }
  // Telas do sistema (Requisições, Compras…): só as que existem no banco
  for (const t of TELAS_SISTEMA) {
    const e = await t.estrutura();
    if (!e.campos.length) continue;
    out.push({ chave: t.chave, nome: t.nome, campos: e.campos, fases: e.fases.map(nome => ({ nome })) });
  }
  return out;
}

async function lerFonte(chave) {
  const fixa = FIXAS_FONTE.find(f => f.chave === chave);
  if (fixa) return { nome: fixa.nome, cards: await fixa.ler() };
  const n = Number(String(chave).replace('quadro_', ''));
  const q = (await query(`SELECT nome FROM bx_quadros WHERE id = $1`, [n])).rows[0];
  if (!q) return { nome: chave, cards: [] };
  return { nome: q.nome, cards: await cardsQuadro(n) };
}

/** Copia os cards das fontes para rel_cards (pipe_id = 'bo:<fonte>'). No máx. 1x/min por fonte. */
export async function sincronizarFontes(fontes, { forcar = false } = {}) {
  for (const chave of (Array.isArray(fontes) ? fontes : []).filter(fonteValida).slice(0, 30)) {
    if (!forcar && Date.now() - (ultimaSync.get(chave) || 0) < INTERVALO_MS) continue;
    try {
      const { nome, cards } = await lerFonte(chave);
      const pipe = `bo:${chave}`;
      const linhas = cards.map(c => ({
        card_id: `${pipe}:${c.id}`, titulo: c.titulo || null, fase_atual: c.fase || null,
        criado_em: c.criado_em || null, finalizado_em: c.finalizado_em || null, atualizado_em: c.atualizado_em || null,
        criado_por: c.criado_por || null, url: c.url || null, campos: c.campos || {}, historico: c.historico || [],
        origem: nome, pipefy_refs: c.refs || [],
      }));
      await query(`DELETE FROM rel_cards WHERE pipe_id = $1`, [pipe]);
      for (let i = 0; i < linhas.length; i += 500) {
        await query(
          `INSERT INTO rel_cards (pipe_id, card_id, titulo, fase_atual, criado_em, finalizado_em, atualizado_em, criado_por, url, campos, historico, origem, pipefy_refs)
           SELECT $1, x.card_id, x.titulo, x.fase_atual, x.criado_em, x.finalizado_em, x.atualizado_em, x.criado_por, x.url,
                  COALESCE(x.campos, '{}'::jsonb), COALESCE(x.historico, '[]'::jsonb), x.origem, COALESCE(x.pipefy_refs, '[]'::jsonb)
             FROM jsonb_to_recordset($2::jsonb) AS x(card_id text, titulo text, fase_atual text, criado_em timestamptz, finalizado_em timestamptz,
                  atualizado_em timestamptz, criado_por text, url text, campos jsonb, historico jsonb, origem text, pipefy_refs jsonb)
           ON CONFLICT (pipe_id, card_id) DO NOTHING`,
          [pipe, JSON.stringify(linhas.slice(i, i + 500))]);
      }
      ultimaSync.set(chave, Date.now());
    } catch (e) {
      console.error(`[Relatórios] Fonte ${chave}:`, e.message);
    }
  }
}

// Para testes
export const _internos = { textoValor, montarHistorico, camposPorNome, TELAS_SISTEMA };
