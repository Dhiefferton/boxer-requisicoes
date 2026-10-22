// ============================================================
// integrations/faturamentoZen.js — notas de Entrada/Saída do Zen
// ============================================================
// Copia do Zen (TEKSP) as notas fiscais para a planilha Faturamento.xlsx
// (aba "Entrada Saída": Data, Número da nota, Perfil fiscal, Entrada/Saída).
// Regras (conferidas com a planilha feita à mão):
//   SAÍDA   → notas de saída emitidas (sem as canceladas / em digitação),
//             fora as do Mercado Livre e da Shopee (tag da nota)
//   ENTRADA → notas de entrada da série NFE (emitidas pela Boxer),
//             fora as de Compra (importação), com número
// Cópia incremental por dia (refaz os 3 últimos dias a cada passada).
// ============================================================
import { query } from '../config/db.js';
import { getToken } from './erpZen.js';

const ZEN = 'https://api.zenerp.app.br';
const EMPRESA = 1009;                         // TEKSP
const INICIO = '2026-10-01';                  // até 30/09 já está na planilha
const TAGS_FORA = /mercadolivre|shopee|magalu|amazon|americanas/i;

async function zenGet(caminho) {
  const token = await getToken();
  const r = await fetch(`${ZEN}${caminho}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, tenant: 'boxer' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`ZenERP ${caminho.split('?')[0]} → ${r.status}`);
  return r.json();
}

let estrutura = null;
function garantirEstrutura() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS faturamento_zen (
        tipo        VARCHAR(8)  NOT NULL,      -- Entrada | Saída
        zen_id      BIGINT      NOT NULL,
        numero      VARCHAR(20),
        data        DATE,
        perfil      VARCHAR(60),
        status      VARCHAR(20),
        serie       VARCHAR(20),
        tags        TEXT,
        empresa     INTEGER,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tipo, zen_id)
      );
      CREATE INDEX IF NOT EXISTS idx_faturamento_zen_data ON faturamento_zen (data);
      CREATE TABLE IF NOT EXISTS faturamento_zen_sync (
        id INTEGER PRIMARY KEY DEFAULT 1,
        dia_concluido DATE,
        atualizado_em TIMESTAMPTZ
      );
      INSERT INTO faturamento_zen_sync (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

const diaISO = (d) => d.toISOString().slice(0, 10);
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return diaISO(d); };

async function gravar(tipo, notas) {
  notas = [...new Map(notas.filter(n => n?.id).map(n => [n.id, n])).values()]; // sem repetidas
  if (!notas.length) return;
  const col = (f) => notas.map(f);
  await query(
    `INSERT INTO faturamento_zen (tipo, zen_id, numero, data, perfil, status, serie, tags, empresa, atualizado_em)
     SELECT $1, * , NOW() FROM UNNEST($2::bigint[], $3::text[], $4::date[], $5::text[], $6::text[], $7::text[], $8::text[], $9::int[])
     ON CONFLICT (tipo, zen_id) DO UPDATE SET numero = EXCLUDED.numero, data = EXCLUDED.data, perfil = EXCLUDED.perfil,
       status = EXCLUDED.status, serie = EXCLUDED.serie, tags = EXCLUDED.tags, empresa = EXCLUDED.empresa, atualizado_em = NOW()`,
    [tipo,
     col(n => n.id),
     col(n => (n.number != null ? String(n.number) : null)),
     col(n => (n.date ? String(n.date).slice(0, 10) : null)),
     col(n => n.fiscalProfileOperation?.code || null),
     col(n => n.status || null),
     col(n => n.invoiceSeries?.code || null),
     col(n => n.tags || null),
     col(n => n.company?.id || null)]);
}

// Todas as notas de um dia (paginado)
async function notasDoDia(recurso, dia) {
  const todas = [];
  for (let first = 0; first < 5000; first += 100) {
    const q = encodeURIComponent(`date=ge=${dia};date=le=${dia}`);
    const pagina = await zenGet(`/fiscal/${recurso}?q=${q}&first=${first}&max=100`);
    const lista = Array.isArray(pagina) ? pagina : [];
    todas.push(...lista);
    if (lista.length < 100) break;
  }
  return todas;
}

let rodando = null;
let ultimaVez = 0;

/** Copia do Zen os dias que faltam (até o tempo limite). */
export async function sincronizarFaturamento({ limiteMs = 40000, intervaloMs = 10 * 60 * 1000 } = {}) {
  await garantirEstrutura();
  if (rodando) return rodando;
  if (Date.now() - ultimaVez < intervaloMs) return { pulado: true };
  rodando = (async () => {
    const inicio = Date.now();
    const st = (await query(`SELECT dia_concluido FROM faturamento_zen_sync WHERE id = 1`)).rows[0] || {};
    const hoje = hojeSP();
    // Continua do dia seguinte ao último copiado; os 3 últimos dias são sempre refeitos
    let dia = INICIO;
    if (st.dia_concluido) {
      const proximo = somarDias(diaISO(new Date(st.dia_concluido)), 1);
      const refazer = somarDias(hoje, -3);
      dia = proximo < refazer ? proximo : refazer;
    }
    if (dia < INICIO) dia = INICIO;
    const feitos = [];
    while (dia <= hoje && Date.now() - inicio < limiteMs) {
      const [saidas, entradas] = await Promise.all([notasDoDia('outgoingInvoice', dia), notasDoDia('incomingInvoice', dia)]);
      await gravar('Saída', saidas);
      await gravar('Entrada', entradas);
      await query(`UPDATE faturamento_zen_sync SET dia_concluido = GREATEST(COALESCE(dia_concluido, $1::date), $1::date), atualizado_em = NOW() WHERE id = 1`, [dia]);
      feitos.push({ dia, saidas: saidas.length, entradas: entradas.length });
      dia = somarDias(dia, 1);
    }
    ultimaVez = Date.now();
    return { dias: feitos, completo: dia > hoje };
  })().finally(() => { rodando = null; });
  return rodando;
}

/** Linhas da planilha (aplica as regras de Entrada/Saída). */
export async function linhasFaturamento(desde, ate) {
  await garantirEstrutura();
  const r = await query(
    `SELECT to_char(data, 'YYYY-MM-DD') AS data, numero, perfil, tipo, tags
       FROM faturamento_zen
      WHERE empresa = $3 AND data BETWEEN $1::date AND $2::date
        AND numero IS NOT NULL AND COALESCE(status, '') NOT IN ('CANCELED', 'PREPARING')
        AND (
          (tipo = 'Saída')
          OR (tipo = 'Entrada' AND serie = 'NFE' AND COALESCE(perfil, '') NOT ILIKE 'Compra%')
        )
      ORDER BY data, tipo, LPAD(numero, 12, '0')`, [desde, ate, EMPRESA]);
  return r.rows.filter(x => !(x.tipo === 'Saída' && TAGS_FORA.test(x.tags || '')));
}
