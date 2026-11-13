// ============================================================
// controllers/relatoriosController.js — Relatórios (histórico do Pipefy dentro do sistema)
// ============================================================
// • Importação ÚNICA e completa do Pipefy: todos os pipes da organização, com todos os
//   cards (inclusive concluídos), campos e histórico de fases. Os dados ficam só nas tabelas
//   rel_* — nunca aparecem nos quadros (Kanban) do sistema, só nos relatórios.
// • Relatórios no estilo do Pipefy: pipe, filtros com e/ou, colunas, ordenação, fórmulas
//   (soma, média, mínimo, máximo, contagem), paginação e exportação.
// A leitura do Pipefy usa pipefyQueryPlanilhas (só consulta, funciona com o Pipefy "desligado").
// ============================================================
import { query } from '../config/db.js';
import { pipefyQueryPlanilhas } from '../integrations/pipefyService.js';
import { fonteValida, listarFontes, sincronizarFontes } from '../integrations/relatoriosLocais.js';

const ORG_ID = process.env.PIPEFY_ORG_ID || '327351';
const LIMITE_LOTE_MS = 40000;   // tempo máximo de cada chamada de importação (serverless)
const TAM_PAGINA = 50;

// ── Estrutura ─────────────────────────────────────────────────
let estrutura = null;
function garantirEstrutura() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS rel_pipes (
        pipe_id      TEXT PRIMARY KEY,
        nome         VARCHAR(255) NOT NULL,
        fases        JSONB NOT NULL DEFAULT '[]'::jsonb,
        campos       JSONB NOT NULL DEFAULT '[]'::jsonb,
        total_pipefy INTEGER,
        importados   INTEGER NOT NULL DEFAULT 0,
        cursor       TEXT,
        status       VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | importando | concluido | erro
        erro         TEXT,
        importado_em TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS rel_cards (
        pipe_id       TEXT NOT NULL,
        card_id       TEXT NOT NULL,
        titulo        TEXT,
        fase_atual    VARCHAR(255),
        criado_em     TIMESTAMPTZ,
        finalizado_em TIMESTAMPTZ,
        atualizado_em TIMESTAMPTZ,
        criado_por    VARCHAR(255),
        url           TEXT,
        campos        JSONB NOT NULL DEFAULT '{}'::jsonb,
        historico     JSONB NOT NULL DEFAULT '[]'::jsonb,
        PRIMARY KEY (pipe_id, card_id)
      );
      CREATE INDEX IF NOT EXISTS idx_rel_cards_criado ON rel_cards (pipe_id, criado_em);
      -- Cards dos quadros do Boxer Operações (pipe_id 'bo:<fonte>', integrations/relatoriosLocais.js)
      ALTER TABLE rel_cards ADD COLUMN IF NOT EXISTS origem TEXT;
      ALTER TABLE rel_cards ADD COLUMN IF NOT EXISTS pipefy_refs JSONB NOT NULL DEFAULT '[]'::jsonb;
      CREATE TABLE IF NOT EXISTS rel_relatorios (
        id            SERIAL PRIMARY KEY,
        nome          VARCHAR(160) NOT NULL,
        pipe_id       TEXT NOT NULL,
        config        JSONB NOT NULL DEFAULT '{}'::jsonb,
        cor           VARCHAR(20),
        criado_por    INTEGER,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE OR REPLACE FUNCTION rel_num(t text) RETURNS numeric AS $f$
      BEGIN
        IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
        IF t ~ '^\\s*-?[0-9]{1,3}(\\.[0-9]{3})*(,[0-9]+)?\\s*$' THEN
          RETURN replace(replace(btrim(t), '.', ''), ',', '.')::numeric;
        END IF;
        RETURN replace(btrim(t), ',', '.')::numeric;
      EXCEPTION WHEN others THEN RETURN NULL;
      END $f$ LANGUAGE plpgsql IMMUTABLE;
    `).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

// ── Importação do Pipefy ──────────────────────────────────────
// Campos de data e hora: o report_value do Pipefy vem em UTC (3 h a mais que o
// horário de Brasília). O datetime_value traz o horário local marcado como "+00:00"
// (mesmo tratamento das planilhas em pipefyTempos.js): usa a data/hora como está.
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TIPOS_DATA_HORA = new Set(['datetime', 'due_date']);
function dataHoraLocal(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '';
  return `${m[3]} de ${MESES_PT[Number(m[2]) - 1]} de ${m[1]}, ${m[4]}:${m[5]}`;
}
const texto = (f) => {
  if (TIPOS_DATA_HORA.has(f.field?.type) && f.datetime_value) {
    const local = dataHoraLocal(f.datetime_value);
    if (local) return local;
  }
  let v = f.report_value ?? f.value;
  if (v == null || v === '') return '';
  v = String(v).trim();
  if (v.startsWith('[')) { try { const a = JSON.parse(v); if (Array.isArray(a)) return a.map(x => String(x?.title ?? x)).join(', '); } catch { /* texto */ } }
  return v;
};

const CARD_RICO = `id title url createdAt updated_at finished_at createdBy { name } current_phase { id name }
  fields { name value report_value datetime_value field { id type } }
  phases_history { phase { id name } firstTimeIn lastTimeIn duration }`;
const CARD_BASICO = `id title url createdAt createdBy { name } current_phase { id name }
  fields { name value field { id type } }`;

async function paginaDeCards(pipeId, after, campos) {
  const gql = (c) => `query($pipe: ID!, $after: String) { allCards(pipeId: $pipe, first: ${TAM_PAGINA}, after: $after) {
    pageInfo { hasNextPage endCursor } edges { node { ${c} } } } }`;
  try {
    return (await pipefyQueryPlanilhas(gql(campos), { pipe: String(pipeId), after })).allCards;
  } catch (e) {
    if (campos === CARD_RICO && /field|Cannot query|doesn't exist/i.test(e.message)) {
      return (await pipefyQueryPlanilhas(gql(CARD_BASICO), { pipe: String(pipeId), after })).allCards;
    }
    throw e;
  }
}

function cardParaLinha(pipeId, n) {
  const campos = {};
  for (const f of n.fields || []) {
    const t = texto(f);
    if (!t || !f.name) continue;
    campos[f.name] = campos[f.name] && campos[f.name] !== t ? `${campos[f.name]} | ${t}` : t;
  }
  const historico = (n.phases_history || []).map(h => ({
    fase: h.phase?.name || '?', entrou: h.firstTimeIn || null, saiu: h.lastTimeIn || null, duracao: Number(h.duration) || 0,
  }));
  return [String(pipeId), String(n.id), n.title || null, n.current_phase?.name || null, n.createdAt || null,
    n.finished_at || null, n.updated_at || null, n.createdBy?.name || null, n.url || null,
    JSON.stringify(campos), JSON.stringify(historico)];
}

// GET /relatorios/importacao — estado de cada pipe
export async function estadoImportacao(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT pipe_id, nome, fases, total_pipefy, importados, status, erro, importado_em FROM rel_pipes ORDER BY nome`);
    res.json({ pipes: r.rows });
  } catch (err) { next(err); }
}

// POST /relatorios/importacao/pipes (admin) — lê a lista de pipes da organização
export async function listarPipesPipefy(req, res, next) {
  try {
    await garantirEstrutura();
    const d = await pipefyQueryPlanilhas(`query($id: ID!) { organization(id: $id) { pipes { id name phases { id name cards_count } } } }`, { id: ORG_ID });
    const pipes = d?.organization?.pipes || [];
    for (const p of pipes) {
      const fases = (p.phases || []).map(f => ({ id: String(f.id), nome: f.name, cards: f.cards_count ?? 0 }));
      const total = fases.reduce((s, f) => s + (Number(f.cards) || 0), 0);
      await query(
        `INSERT INTO rel_pipes (pipe_id, nome, fases, total_pipefy) VALUES ($1,$2,$3::jsonb,$4)
         ON CONFLICT (pipe_id) DO UPDATE SET nome = EXCLUDED.nome, fases = EXCLUDED.fases, total_pipefy = EXCLUDED.total_pipefy`,
        [String(p.id), p.name, JSON.stringify(fases), total]);
    }
    res.json({ total: pipes.length });
  } catch (err) { next(err); }
}

// POST /relatorios/importacao/lote (admin) { pipe_id, recomecar? }
// Importa páginas de cards até o limite de tempo e devolve o andamento (o front repete até concluir).
export async function importarLote(req, res, next) {
  try {
    await garantirEstrutura();
    const pipeId = String(req.body?.pipe_id || '').trim();
    if (!/^\d+$/.test(pipeId)) return res.status(400).json({ erro: 'Pipe inválido.' });
    let pipe = (await query(`SELECT * FROM rel_pipes WHERE pipe_id = $1`, [pipeId])).rows[0];
    if (!pipe) return res.status(404).json({ erro: 'Pipe não encontrado. Leia a lista de pipes primeiro.' });
    if (req.body?.recomecar) {
      await query(`DELETE FROM rel_cards WHERE pipe_id = $1`, [pipeId]);
      await query(`UPDATE rel_pipes SET cursor = NULL, importados = 0, status = 'pendente', erro = NULL WHERE pipe_id = $1`, [pipeId]);
      pipe = { ...pipe, cursor: null };
    }
    await query(`UPDATE rel_pipes SET status = 'importando', erro = NULL WHERE pipe_id = $1`, [pipeId]);
    const inicio = Date.now();
    let cursor = pipe.cursor || null, concluido = false;
    try {
      while (Date.now() - inicio < LIMITE_LOTE_MS) {
        const conn = await paginaDeCards(pipeId, cursor, CARD_RICO);
        const nos = (conn?.edges || []).map(e => e.node).filter(Boolean);
        if (nos.length) {
          const linhas = nos.map(n => cardParaLinha(pipeId, n));
          const vals = [], ph = [];
          linhas.forEach((l, i) => {
            ph.push(`($${i * 11 + 1},$${i * 11 + 2},$${i * 11 + 3},$${i * 11 + 4},$${i * 11 + 5},$${i * 11 + 6},$${i * 11 + 7},$${i * 11 + 8},$${i * 11 + 9},$${i * 11 + 10}::jsonb,$${i * 11 + 11}::jsonb)`);
            vals.push(...l);
          });
          await query(
            `INSERT INTO rel_cards (pipe_id, card_id, titulo, fase_atual, criado_em, finalizado_em, atualizado_em, criado_por, url, campos, historico)
             VALUES ${ph.join(',')}
             ON CONFLICT (pipe_id, card_id) DO UPDATE SET titulo = EXCLUDED.titulo, fase_atual = EXCLUDED.fase_atual,
               criado_em = EXCLUDED.criado_em, finalizado_em = EXCLUDED.finalizado_em, atualizado_em = EXCLUDED.atualizado_em,
               criado_por = EXCLUDED.criado_por, url = EXCLUDED.url, campos = EXCLUDED.campos, historico = EXCLUDED.historico`, vals);
        }
        cursor = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
        const n = (await query(`SELECT COUNT(*)::int AS n FROM rel_cards WHERE pipe_id = $1`, [pipeId])).rows[0].n;
        await query(`UPDATE rel_pipes SET cursor = $2, importados = $3 WHERE pipe_id = $1`, [pipeId, cursor, n]);
        if (!conn?.pageInfo?.hasNextPage) { concluido = true; break; }
      }
    } catch (e) {
      await query(`UPDATE rel_pipes SET status = 'erro', erro = $2 WHERE pipe_id = $1`, [pipeId, String(e.message).slice(0, 500)]);
      return res.status(502).json({ erro: `Pipefy: ${e.message}` });
    }
    if (concluido) {
      const campos = (await query(`SELECT DISTINCT jsonb_object_keys(campos) AS k FROM rel_cards WHERE pipe_id = $1 ORDER BY 1`, [pipeId])).rows.map(r => r.k);
      await query(`UPDATE rel_pipes SET status = 'concluido', importado_em = NOW(), campos = $2::jsonb, cursor = NULL WHERE pipe_id = $1`, [pipeId, JSON.stringify(campos)]);
    } else {
      await query(`UPDATE rel_pipes SET status = 'pendente' WHERE pipe_id = $1`, [pipeId]);
    }
    const atual = (await query(`SELECT pipe_id, nome, total_pipefy, importados, status FROM rel_pipes WHERE pipe_id = $1`, [pipeId])).rows[0];
    res.json({ ...atual, concluido });
  } catch (err) { next(err); }
}

// ── Pipes disponíveis nos relatórios ──────────────────────────
// GET /relatorios/pipes — só os já importados, com fases e campos (para montar colunas/filtros)
export async function listarPipes(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT pipe_id, nome, fases, campos, importados, status FROM rel_pipes WHERE importados > 0 ORDER BY nome`);
    for (const p of r.rows) {
      if (!p.campos?.length) {
        p.campos = (await query(`SELECT DISTINCT jsonb_object_keys(campos) AS k FROM rel_cards WHERE pipe_id = $1 ORDER BY 1`, [p.pipe_id])).rows.map(x => x.k);
      }
    }
    res.json({ pipes: r.rows });
  } catch (err) { next(err); }
}

// ── Motor dos relatórios ──────────────────────────────────────
const FIXAS = {
  '@id':             { sql: 'card_id', tipo: 'texto' },
  '@titulo':         { sql: 'titulo', tipo: 'texto' },
  '@fase':           { sql: 'fase_atual', tipo: 'texto' },
  '@criado_por':     { sql: 'criado_por', tipo: 'texto' },
  '@criado_em':      { sql: 'criado_em', tipo: 'data' },
  '@finalizado_em':  { sql: 'finalizado_em', tipo: 'data' },
  '@atualizado_em':  { sql: 'atualizado_em', tipo: 'data' },
  '@origem':         { sql: `COALESCE(origem, 'Pipefy')`, tipo: 'texto' },
};
const OPS_TEXTO = ['contem', 'nao_contem', 'igual', 'diferente', 'comeca', 'vazio', 'preenchido'];
const OPS_NUM = ['igual', 'diferente', 'maior', 'menor', 'maior_igual', 'menor_igual', 'vazio', 'preenchido'];
const OPS_DATA = ['periodo', 'antes', 'depois', 'mes_atual', 'mes_anterior', 'ultimos_dias', 'vazio', 'preenchido', 'dia', 'semana', 'mes', 'ano'];
const FNS = { soma: 'SUM', media: 'AVG', minimo: 'MIN', maximo: 'MAX', contagem: 'COUNT' };

// Interpreta uma coluna: devolve { sql, tipo } e empilha parâmetros
function coluna(chave, params) {
  if (FIXAS[chave]) return FIXAS[chave];
  const [pref, ...resto] = String(chave || '').split(':');
  const nome = resto.join(':');
  if (!nome) throw Object.assign(new Error(`Coluna inválida: ${chave}`), { status: 400 });
  params.push(nome);
  const p = `$${params.length}`;
  if (pref === 'c') return { sql: `(campos ->> ${p})`, tipo: 'texto', num: `rel_num(campos ->> ${p})` };
  if (pref === 'f') return { sql: `(SELECT SUM((h->>'duracao')::numeric) FROM jsonb_array_elements(historico) h WHERE h->>'fase' = ${p})`, tipo: 'numero' };
  if (pref === 'fe') return { sql: `(SELECT MIN((h->>'entrou')::timestamptz) FROM jsonb_array_elements(historico) h WHERE h->>'fase' = ${p})`, tipo: 'data' };
  throw Object.assign(new Error(`Coluna inválida: ${chave}`), { status: 400 });
}

function condicao(f, params) {
  const col = coluna(f.chave, params);
  const op = String(f.op || '');
  const v = f.valor == null ? '' : String(f.valor);
  const v2 = f.valor2 == null ? '' : String(f.valor2);
  const push = (x) => { params.push(x); return `$${params.length}`; };
  const numerico = col.tipo === 'numero' || (col.num && (f.numerico || ['maior', 'menor', 'maior_igual', 'menor_igual'].includes(op)));
  const exprNum = col.num || col.sql;

  if (op === 'vazio') return col.tipo === 'texto' ? `(COALESCE(${col.sql}, '') = '')` : `(${col.sql} IS NULL)`;
  if (op === 'preenchido') return col.tipo === 'texto' ? `(COALESCE(${col.sql}, '') <> '')` : `(${col.sql} IS NOT NULL)`;

  if (col.tipo === 'data') {
    if (!OPS_DATA.includes(op)) throw Object.assign(new Error('Operador inválido para data.'), { status: 400 });
    // dias no fuso de São Paulo
    const dia = `((${col.sql}) AT TIME ZONE 'America/Sao_Paulo')::date`;
    const hoje = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;
    if (op === 'mes_atual') return `(date_trunc('month', ${dia}) = date_trunc('month', ${hoje}))`;
    if (op === 'mes_anterior') return `(date_trunc('month', ${dia}) = date_trunc('month', ${hoje}) - interval '1 month')`;
    if (op === 'ultimos_dias') return `(${dia} >= ${hoje} - ${push(Math.max(0, parseInt(v) || 0))}::int)`;
    // Período rápido (dia, semana, mês, ano)
    if (op === 'mes') {
      if (!/^\d{4}-\d{2}$/.test(v)) throw Object.assign(new Error('Informe o mês (AAAA-MM).'), { status: 400 });
      return `(date_trunc('month', ${dia}) = to_date(${push(v)}, 'YYYY-MM'))`;
    }
    if (op === 'ano') {
      if (!/^\d{4}$/.test(v)) throw Object.assign(new Error('Informe o ano.'), { status: 400 });
      return `(EXTRACT(YEAR FROM ${dia}) = ${push(Number(v))}::int)`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw Object.assign(new Error('Informe a data (AAAA-MM-DD).'), { status: 400 });
    if (op === 'antes') return `(${dia} < ${push(v)}::date)`;
    if (op === 'depois') return `(${dia} > ${push(v)}::date)`;
    if (op === 'dia') return `(${dia} = ${push(v)}::date)`;
    if (op === 'semana') { const p1 = push(v); return `(${dia} BETWEEN ${p1}::date AND ${p1}::date + 6)`; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v2)) throw Object.assign(new Error('Informe a data final.'), { status: 400 });
    return `(${dia} BETWEEN ${push(v)}::date AND ${push(v2)}::date)`;
  }
  if (numerico) {
    if (!OPS_NUM.includes(op)) throw Object.assign(new Error('Operador inválido para número.'), { status: 400 });
    const mapa = { igual: '=', diferente: '<>', maior: '>', menor: '<', maior_igual: '>=', menor_igual: '<=' };
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n)) throw Object.assign(new Error('Informe um número.'), { status: 400 });
    return `(${exprNum} ${mapa[op]} ${push(n)}::numeric)`;
  }
  if (!OPS_TEXTO.includes(op)) throw Object.assign(new Error('Operador inválido para texto.'), { status: 400 });
  const lit = (x) => push(x);
  if (op === 'contem') return `(${col.sql} ILIKE ${lit('%' + v.replace(/[\\%_]/g, '\\$&') + '%')})`;
  if (op === 'nao_contem') return `(COALESCE(${col.sql}, '') NOT ILIKE ${lit('%' + v.replace(/[\\%_]/g, '\\$&') + '%')})`;
  if (op === 'comeca') return `(${col.sql} ILIKE ${lit(v.replace(/[\\%_]/g, '\\$&') + '%')})`;
  if (op === 'igual') return `(lower(${col.sql}) = lower(${lit(v)}))`;
  return `(COALESCE(lower(${col.sql}), '') <> lower(${lit(v)}))`; // diferente
}

// Fontes do Boxer Operações escolhidas no relatório (orcamentos, lojinha, garantia, quadro_<id>)
const fontesDe = (cfg) => [...new Set((Array.isArray(cfg?.fontes) ? cfg.fontes : []).map(String).filter(fonteValida))].slice(0, 30);

function montarWhere(pipeId, filtros, params, periodo, fontes = []) {
  params.push(String(pipeId));
  const pp = `$${params.length}`;
  let where = `pipe_id = ${pp}`;
  if (fontes.length) {
    // Cards do sistema entram junto; o que já tem card no Pipefy do relatório não entra de novo
    params.push(fontes.map(f => `bo:${f}`));
    where = `(pipe_id = ${pp} OR (pipe_id = ANY($${params.length}::text[]) AND NOT EXISTS (
      SELECT 1 FROM rel_cards x WHERE x.pipe_id = ${pp} AND x.card_id IN (SELECT jsonb_array_elements_text(rel_cards.pipefy_refs)))))`;
  }
  let expr = null;
  for (const f of (Array.isArray(filtros) ? filtros : []).slice(0, 40)) {
    if (!f?.chave || !f?.op) continue;
    const c = condicao(f, params);
    expr = expr === null ? c : `(${expr}) ${String(f.junta) === 'ou' ? 'OR' : 'AND'} ${c}`;
  }
  if (expr) where += ` AND (${expr})`;
  // Período (dia, semana, mês, ano ou entre datas) sobre um campo de data
  if (periodo?.chave && ['dia', 'semana', 'mes', 'ano', 'periodo'].includes(periodo.tipo)) {
    where += ` AND ${condicao({ chave: periodo.chave, op: periodo.tipo, valor: periodo.valor, valor2: periodo.valor2 }, params)}`;
  }
  return where;
}

// Executa a configuração de um relatório
async function executar(cfg, { pagina = 1, todos = false } = {}) {
  await garantirEstrutura();
  const pipeId = String(cfg?.pipe_id || '');
  if (!/^\d+$/.test(pipeId)) throw Object.assign(new Error('Escolha o pipe do relatório.'), { status: 400 });
  const colunas = (Array.isArray(cfg.colunas) && cfg.colunas.length ? cfg.colunas : ['@id', '@titulo', '@fase', '@criado_em']).slice(0, 60);
  const fontes = fontesDe(cfg);
  if (fontes.length) await sincronizarFontes(fontes);
  const params = [];
  const where = montarWhere(pipeId, cfg.filtros, params, cfg.periodo, fontes);
  const nParams = params.length;
  const sel = colunas.map(c => coluna(c, params));
  const selSql = sel.map((c, i) => `${c.sql} AS c${i}`).join(', ');
  let ordem = '';
  if (cfg.ordem?.chave) {
    const o = coluna(cfg.ordem.chave, params);
    ordem = ` ORDER BY ${o.sql} ${cfg.ordem.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, card_id`;
  } else ordem = ' ORDER BY criado_em DESC NULLS LAST, card_id';
  const tam = todos ? 100000 : TAM_PAGINA;
  const off = todos ? 0 : (Math.max(1, parseInt(pagina) || 1) - 1) * TAM_PAGINA;
  const linhas = await query(`SELECT card_id, url, ${selSql} FROM rel_cards WHERE ${where}${ordem} LIMIT ${tam} OFFSET ${off}`, params);

  const total = (await query(`SELECT COUNT(*)::int AS n FROM rel_cards WHERE ${where}`, params.slice(0, nParams))).rows[0].n;

  // Fórmulas (soma/média/mín./máx./contagem) sobre as colunas escolhidas
  const formulas = [];
  for (const fm of (Array.isArray(cfg.formulas) ? cfg.formulas : []).slice(0, 20)) {
    const fn = FNS[fm?.fn];
    if (!fn || !fm?.chave) continue;
    const p = params.slice(0, nParams);
    const c = coluna(fm.chave, p);
    const expr = fn === 'COUNT' ? `COUNT(*) FILTER (WHERE ${c.tipo === 'texto' ? `COALESCE(${c.sql}, '') <> ''` : `${c.sql} IS NOT NULL`})`
      : `${fn}(${c.num || (c.tipo === 'numero' ? c.sql : 'NULL')})`;
    const r = (await query(`SELECT ${expr} AS v FROM rel_cards WHERE ${where}`, p)).rows[0].v;
    formulas.push({ chave: fm.chave, fn: fm.fn, valor: r == null ? null : Number(r) });
  }
  return {
    colunas, tipos: sel.map(c => c.tipo), total, pagina: todos ? 1 : Math.max(1, parseInt(pagina) || 1), tamanho: TAM_PAGINA,
    linhas: linhas.rows.map(r => ({ id: r.card_id, url: r.url, v: colunas.map((_, i) => r[`c${i}`]) })),
    formulas,
  };
}

// GET /relatorios/fontes — quadros do Boxer Operações que podem entrar junto (com campos e fases)
export async function listarFontesRelatorio(req, res, next) {
  try { res.json({ fontes: await listarFontes() }); }
  catch (err) { next(err); }
}

// POST /relatorios/executar { config, pagina, todos }
export async function executarRelatorio(req, res, next) {
  try {
    res.json(await executar(req.body?.config, { pagina: req.body?.pagina, todos: !!req.body?.todos }));
  } catch (err) { next(err); }
}

// ── CRUD dos relatórios ───────────────────────────────────────
const CORES = ['#f59e0b', '#64748b', '#f97316', '#06b6d4', '#10b981', '#3b82f6', '#a855f7', '#ef4444', '#ec4899', '#84cc16'];
const limparConfig = (c) => ({
  colunas: (Array.isArray(c?.colunas) ? c.colunas : []).map(String).slice(0, 60),
  filtros: (Array.isArray(c?.filtros) ? c.filtros : []).slice(0, 40).map(f => ({
    chave: String(f?.chave || ''), op: String(f?.op || ''), valor: f?.valor ?? '', valor2: f?.valor2 ?? '',
    junta: f?.junta === 'ou' ? 'ou' : 'e', numerico: !!f?.numerico })),
  periodo: c?.periodo?.chave && ['dia', 'semana', 'mes', 'ano', 'periodo'].includes(c.periodo.tipo)
    ? { chave: String(c.periodo.chave), tipo: c.periodo.tipo, valor: String(c.periodo.valor ?? ''), valor2: String(c.periodo.valor2 ?? '') } : null,
  ordem: c?.ordem?.chave ? { chave: String(c.ordem.chave), dir: c.ordem.dir === 'asc' ? 'asc' : 'desc' } : null,
  formulas: (Array.isArray(c?.formulas) ? c.formulas : []).filter(f => FNS[f?.fn] && f?.chave).slice(0, 20).map(f => ({ chave: String(f.chave), fn: f.fn })),
  fontes: fontesDe(c),
});

// GET /relatorios — lista (com a contagem atual de cada um)
export async function listarRelatorios(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(
      `SELECT r.id, r.nome, r.pipe_id, r.cor, r.config, r.atualizado_em, p.nome AS pipe_nome
         FROM rel_relatorios r LEFT JOIN rel_pipes p ON p.pipe_id = r.pipe_id ORDER BY r.nome`);
    const lista = [];
    for (const rel of r.rows) {
      let total = null;
      try {
        const params = [];
        const where = montarWhere(rel.pipe_id, rel.config?.filtros, params, rel.config?.periodo, fontesDe(rel.config));
        total = (await query(`SELECT COUNT(*)::int AS n FROM rel_cards WHERE ${where}`, params)).rows[0].n;
      } catch { /* filtro antigo inválido */ }
      lista.push({ ...rel, total });
    }
    res.json({ relatorios: lista });
  } catch (err) { next(err); }
}

export async function verRelatorio(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`SELECT id, nome, pipe_id, cor, config FROM rel_relatorios WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!r.rows[0]) return res.status(404).json({ erro: 'Relatório não encontrado.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
}

export async function criarRelatorio(req, res, next) {
  try {
    await garantirEstrutura();
    const nome = String(req.body?.nome || '').trim().slice(0, 160);
    const pipeId = String(req.body?.pipe_id || '').trim();
    if (!nome) return res.status(400).json({ erro: 'Dê um nome ao relatório.' });
    if (!/^\d+$/.test(pipeId)) return res.status(400).json({ erro: 'Escolha o pipe.' });
    const n = (await query(`SELECT COUNT(*)::int AS n FROM rel_relatorios`)).rows[0].n;
    const r = await query(
      `INSERT INTO rel_relatorios (nome, pipe_id, config, cor, criado_por) VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING id`,
      [nome, pipeId, JSON.stringify(limparConfig(req.body?.config)), req.body?.cor || CORES[n % CORES.length], req.usuario.id]);
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) { next(err); }
}

export async function salvarRelatorio(req, res, next) {
  try {
    await garantirEstrutura();
    const nome = req.body?.nome == null ? null : String(req.body.nome).trim().slice(0, 160);
    if (nome === '') return res.status(400).json({ erro: 'Dê um nome ao relatório.' });
    const r = await query(
      `UPDATE rel_relatorios SET nome = COALESCE($2, nome), pipe_id = COALESCE($3, pipe_id),
              config = COALESCE($4::jsonb, config), cor = COALESCE($5, cor), atualizado_em = NOW()
        WHERE id = $1 RETURNING id`,
      [Number(req.params.id) || 0, nome, req.body?.pipe_id ? String(req.body.pipe_id) : null,
       req.body?.config ? JSON.stringify(limparConfig(req.body.config)) : null, req.body?.cor || null]);
    if (!r.rowCount) return res.status(404).json({ erro: 'Relatório não encontrado.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function excluirRelatorio(req, res, next) {
  try {
    await garantirEstrutura();
    const r = await query(`DELETE FROM rel_relatorios WHERE id = $1 RETURNING id`, [Number(req.params.id) || 0]);
    if (!r.rowCount) return res.status(404).json({ erro: 'Relatório não encontrado.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// Usado pela API pública: roda um relatório salvo (filtros, colunas e fórmulas) e devolve o resultado
export async function rodarRelatorioSalvo(id, { pagina = 1, todos = false } = {}) {
  await garantirEstrutura();
  const r = await query(`SELECT id, nome, pipe_id, config FROM rel_relatorios WHERE id = $1`, [Number(id) || 0]);
  const rel = r.rows[0];
  if (!rel) return null;
  const res = await executar({ ...rel.config, pipe_id: rel.pipe_id }, { pagina, todos });
  return { id: rel.id, nome: rel.nome, ...res };
}
