// ============================================================
// config/db.js — Conexão com PostgreSQL (local + produção)
// ============================================================
import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
        // Vercel (serverless): várias instâncias abertas ao mesmo tempo, cada uma com o seu pool.
        // Poucas conexões por instância e devolvidas rápido, para não estourar o limite do banco (200).
        max: 3,
        idleTimeoutMillis: 3000,
        connectionTimeoutMillis: 8000,
        allowExitOnIdle: true,
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'boxer_requisicoes',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
);

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') console.log('✅ Conectado ao PostgreSQL');
});
pool.on('error', (err) => console.error('❌ Erro no pool:', err.message));

// ------------------------------------------------------------
// DDL idempotente (26/11/2026): as telas garantem o próprio esquema a cada instância nova
// (CREATE TABLE IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS). Na Vercel nascem
// várias instâncias ao mesmo tempo e o ALTER TABLE pede trava exclusiva na tabela MESMO quando
// a coluna já existe - isso gerava "deadlock detected" em massa (lojinha, orçamento, fotos) e a
// tela vinha vazia. Agora cada bloco de DDL roda UMA vez no banco: fica registrado em
// _ddl_aplicado (hash do texto) e as próximas instâncias só consultam esse registro, sem trava.
// Mudou o texto do DDL (coluna nova) = hash novo = roda de novo, uma vez, serializado por
// pg_advisory_xact_lock. Desligar: DDL_DIRETO=1 (volta a rodar sempre, como antes).
// ------------------------------------------------------------
const ddlFeito = new Set();
let tabelaDdlOk = null;
// Separa o bloco em comandos. Devolve null se não for bloco de esquema (sem CREATE/ALTER).
// Bloco com $$ (função/DO) ou com parâmetros segue o caminho normal, como antes.
const separarDdl = (text, params) => {
  if (params && params.length) return null;
  const t = String(text);
  if (t.includes('$$') || /\$[a-z_]*\$/i.test(t)) return null;
  const comandos = t.replace(/--[^\n]*/g, ' ').split(';').map((c) => c.trim()).filter(Boolean);
  if (!comandos.length || !/^(CREATE|ALTER|COMMENT)\b/i.test(comandos[0])) return null;
  const ddl = comandos.filter((c) => /^(CREATE|ALTER|COMMENT)\b/i.test(c));
  const outros = comandos.filter((c) => !/^(CREATE|ALTER|COMMENT)\b/i.test(c));
  return ddl.length ? { outros } : null;
};
async function garantirTabelaDdl() {
  if (!tabelaDdlOk) {
    tabelaDdlOk = (async () => {
      const r = await pool.query(`SELECT to_regclass('public._ddl_aplicado') IS NOT NULL AS ok`);
      if (!r.rows[0].ok) {
        await pool.query(`CREATE TABLE IF NOT EXISTS _ddl_aplicado (hash TEXT PRIMARY KEY, trecho TEXT, aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      }
    })().catch((e) => { tabelaDdlOk = null; throw e; });
  }
  return tabelaDdlOk;
}
// Já aplicado: roda só os comandos de dado do bloco (ex.: UPDATE de ajuste), sem tocar no esquema.
async function rodarSoOsOutros(outros) {
  if (!outros.length) return { rows: [], rowCount: 0 };
  return pool.query(outros.join(';\n'));
}
async function rodarDdlUmaVez(text, { outros }) {
  const hash = crypto.createHash('sha1').update(String(text)).digest('hex');
  if (ddlFeito.has(hash)) return rodarSoOsOutros(outros);
  await garantirTabelaDdl();
  const ja = await pool.query(`SELECT 1 FROM _ddl_aplicado WHERE hash = $1`, [hash]);
  if (ja.rowCount) { ddlFeito.add(hash); return rodarSoOsOutros(outros); }
  for (let tentativa = 1; ; tentativa++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [hash]);
      const de_novo = await client.query(`SELECT 1 FROM _ddl_aplicado WHERE hash = $1`, [hash]);
      let resultado = { rows: [], rowCount: 0 };
      if (!de_novo.rowCount) {
        // primeira vez: o bloco inteiro, na ordem original (esquema + dados), como sempre rodou
        await client.query(`SET LOCAL lock_timeout = '5s'`);
        resultado = await client.query(text);
        await client.query(`INSERT INTO _ddl_aplicado (hash, trecho) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [hash, String(text).trim().slice(0, 200)]);
      }
      await client.query('COMMIT');
      ddlFeito.add(hash);
      if (de_novo.rowCount) return rodarSoOsOutros(outros);
      return resultado;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const passageiro = ['40P01', '55P03', '40001'].includes(err.code); // deadlock, lock_timeout, serialização
      if (!passageiro || tentativa >= 3) throw err;
      await new Promise((r) => setTimeout(r, 300 * tentativa + Math.random() * 300));
    } finally {
      client.release();
    }
  }
}

export async function query(text, params) {
  const bloco = process.env.DDL_DIRETO === '1' ? null : separarDdl(text, params);
  if (bloco) {
    try {
      return await rodarDdlUmaVez(text, bloco);
    } catch (err) {
      console.error('Erro no DDL:', { text: String(text).trim().slice(0, 100), error: err.message });
      throw err;
    }
  }
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (process.env.NODE_ENV === 'development' && Date.now() - start > 200)
      console.warn(`⚠️  Query lenta (${Date.now() - start}ms): ${text.slice(0, 60)}...`);
    return result;
  } catch (err) {
    console.error('Erro na query:', { text: text.slice(0, 100), error: err.message });
    throw err;
  }
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
