// ============================================================
// controllers/blobController.js — Vídeos e arquivos grandes (Vercel Blob)
// ============================================================
// O celular/computador envia o arquivo direto para o Vercel Blob (até 500 MB),
// sem passar pelo servidor. O servidor só gera a autorização do envio
// (POST /blob/upload) e guarda o link no card (orc_fotos / loj_fotos.blob_url).
// Acompanhamento do uso (tela Armazenamento): espaço ocupado, operações e
// transferência do mês, contra a cota grátis; alerta a partir de 90%.
// A conta da Vercel precisa ter um Blob store ligado ao projeto
// (variável BLOB_READ_WRITE_TOKEN, criada sozinha ao conectar o store).
// ============================================================
import { handleUpload } from '@vercel/blob/client';
import { del, list } from '@vercel/blob';
import { query } from '../config/db.js';

export const MAX_BLOB = 500 * 1024 * 1024; // 500 MB por arquivo
const PARTE = 8 * 1024 * 1024;            // tamanho de parte do envio em partes
const MULTIPART_ACIMA = 20 * 1024 * 1024; // acima disso o envio é em partes
// Cota grátis (plano Hobby da Vercel) — pode ser ajustada na tela
const LIMITES_PADRAO = { armazenamento_gb: 1, operacoes_avancadas: 2000, operacoes_simples: 10000, transferencia_gb: 10 };
const GB = 1024 * 1024 * 1024;
export const blobConfigurado = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const urlBlobValida = (u) => { try { return /\.blob\.vercel-storage\.com$/i.test(new URL(u).hostname); } catch { return false; } };

let estrutura = null;
export function garantirBlob() {
  if (!estrutura) {
    estrutura = query(`
      CREATE TABLE IF NOT EXISTS bx_blob_arquivos (
        id           SERIAL PRIMARY KEY,
        url          TEXT NOT NULL UNIQUE,
        pathname     TEXT,
        tamanho      BIGINT NOT NULL DEFAULT 0,
        mime         VARCHAR(120),
        nome         VARCHAR(200),
        quadro       VARCHAR(10),
        pedido_id    INTEGER,
        campo_id     VARCHAR(120),
        foto_id      INTEGER,
        usuario_id   INTEGER,
        usuario_nome VARCHAR(120),
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em  TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS bx_blob_eventos (
        id         SERIAL PRIMARY KEY,
        tipo       VARCHAR(20) NOT NULL,
        bytes      BIGINT NOT NULL DEFAULT 0,
        operacoes  INTEGER NOT NULL DEFAULT 0,
        simples    INTEGER NOT NULL DEFAULT 0,
        arquivo_id INTEGER,
        criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bx_blob_eventos_data ON bx_blob_eventos (criado_em);
      CREATE TABLE IF NOT EXISTS bx_config (
        chave VARCHAR(60) PRIMARY KEY,
        valor JSONB NOT NULL,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE orc_fotos ADD COLUMN IF NOT EXISTS blob_url TEXT;
      ALTER TABLE orc_fotos ADD COLUMN IF NOT EXISTS tamanho BIGINT;
      ALTER TABLE loj_fotos ADD COLUMN IF NOT EXISTS blob_url TEXT;
      ALTER TABLE loj_fotos ADD COLUMN IF NOT EXISTS tamanho BIGINT;`).catch(e => { estrutura = null; throw e; });
  }
  return estrutura;
}

async function limites() {
  const r = await query(`SELECT valor FROM bx_config WHERE chave = 'blob_limites'`);
  return { ...LIMITES_PADRAO, ...(r.rows[0]?.valor || {}) };
}

/** Uso atual: espaço (arquivos ativos) e operações/transferência do mês. */
export async function usoBlob() {
  await garantirBlob();
  const [a, e, lim] = await Promise.all([
    query(`SELECT COALESCE(SUM(tamanho), 0)::bigint AS bytes, COUNT(*)::int AS arquivos FROM bx_blob_arquivos WHERE excluido_em IS NULL`),
    query(`SELECT COALESCE(SUM(operacoes), 0)::int AS operacoes, COALESCE(SUM(simples), 0)::int AS simples,
                  COALESCE(SUM(bytes) FILTER (WHERE tipo = 'visto'), 0)::bigint AS transferencia
             FROM bx_blob_eventos WHERE criado_em >= date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`),
    limites(),
  ]);
  const bytes = Number(a.rows[0].bytes), transf = Number(e.rows[0].transferencia);
  const itens = [
    { chave: 'armazenamento', nome: 'Espaço ocupado', usado: bytes, limite: lim.armazenamento_gb * GB, unidade: 'bytes' },
    { chave: 'operacoes', nome: 'Operações avançadas no mês (envios)', usado: e.rows[0].operacoes, limite: lim.operacoes_avancadas, unidade: 'ops' },
    { chave: 'simples', nome: 'Operações simples no mês (aberturas)', usado: e.rows[0].simples, limite: lim.operacoes_simples, unidade: 'ops' },
    { chave: 'transferencia', nome: 'Transferência no mês (vídeos assistidos, estimada)', usado: transf, limite: lim.transferencia_gb * GB, unidade: 'bytes' },
  ].map(i => ({ ...i, pct: i.limite > 0 ? Math.round((i.usado / i.limite) * 1000) / 10 : 0 }));
  const maior = itens.reduce((m, i) => (i.pct > m.pct ? i : m), itens[0]);
  return { configurado: blobConfigurado(), arquivos: a.rows[0].arquivos, itens, limites: lim, maior, alerta: maior.pct >= 90, max_arquivo: MAX_BLOB };
}

async function evento(tipo, { bytes = 0, operacoes = 0, simples = 0, arquivo_id = null } = {}) {
  try { await query(`INSERT INTO bx_blob_eventos (tipo, bytes, operacoes, simples, arquivo_id) VALUES ($1,$2,$3,$4,$5)`, [tipo, bytes, operacoes, simples, arquivo_id]); }
  catch (e) { console.error('[Blob] evento:', e.message); }
}
const opsDoEnvio = (tamanho) => (tamanho > MULTIPART_ACIMA ? Math.ceil(tamanho / PARTE) + 2 : 1);

// POST /blob/upload — autoriza o envio direto do navegador para o Vercel Blob
export async function autorizarUpload(req, res) {
  try {
    if (!blobConfigurado()) return res.status(503).json({ error: 'O armazenamento de vídeos ainda não está ligado (Vercel Blob). Veja a tela Armazenamento.' });
    await garantirBlob();
    const json = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let info = {};
        try { info = JSON.parse(clientPayload || '{}'); } catch { info = {}; }
        const tamanho = Number(info.tamanho) || 0;
        if (tamanho > MAX_BLOB) throw new Error('Arquivo maior que 500 MB.');
        const uso = await usoBlob();
        const esp = uso.itens.find(i => i.chave === 'armazenamento');
        if (esp.usado + tamanho > esp.limite) throw new Error(`Sem espaço no armazenamento grátis (${Math.round(esp.pct)}% usado). Exclua vídeos antigos na tela Armazenamento.`);
        const ops = uso.itens.find(i => i.chave === 'operacoes');
        if (ops.usado + opsDoEnvio(tamanho) > ops.limite) throw new Error('Limite de envios do mês atingido no armazenamento grátis.');
        return {
          allowedContentTypes: ['video/*', 'image/*', 'application/pdf', 'application/msword', 'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.*', 'text/plain', 'text/csv', 'application/octet-stream'],
          maximumSizeInBytes: MAX_BLOB,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ usuario: req.usuario?.id || null }),
        };
      },
    });
    res.json(json);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Não foi possível autorizar o envio.' });
  }
}

/** Registra o arquivo enviado (chamado ao gravar a foto/vídeo no card). */
export async function registrarArquivoBlob({ url, pathname, tamanho, mime, nome, quadro, pedido_id, campo_id, foto_id, usuario }) {
  await garantirBlob();
  const r = await query(
    `INSERT INTO bx_blob_arquivos (url, pathname, tamanho, mime, nome, quadro, pedido_id, campo_id, foto_id, usuario_id, usuario_nome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (url) DO UPDATE SET foto_id = EXCLUDED.foto_id, excluido_em = NULL RETURNING id`,
    [url, pathname || null, Number(tamanho) || 0, mime || null, nome || null, quadro || null, pedido_id || null, campo_id || null, foto_id || null, usuario?.id || null, usuario?.nome || null]);
  await evento('envio', { bytes: Number(tamanho) || 0, operacoes: opsDoEnvio(Number(tamanho) || 0), arquivo_id: r.rows[0].id });
  return r.rows[0].id;
}

/** Apaga o arquivo no Vercel Blob (excluir é grátis) e marca como excluído. */
export async function excluirArquivoBlob(url) {
  if (!url) return;
  await garantirBlob();
  try { if (blobConfigurado()) await del(url); } catch (e) { console.error('[Blob] excluir:', e.message); }
  await query(`UPDATE bx_blob_arquivos SET excluido_em = NOW() WHERE url = $1 AND excluido_em IS NULL`, [url]);
}

/** Lê os dados de um envio feito pelo navegador ({ blob: { url, pathname, tamanho, mime, nome } }). */
export function lerEnvioBlob(b) {
  if (!b || typeof b !== 'object' || !urlBlobValida(b.url)) return null;
  const tamanho = Number(b.tamanho) || 0;
  if (tamanho > MAX_BLOB) return null;
  return { url: String(b.url).slice(0, 1000), pathname: String(b.pathname || '').slice(0, 500), tamanho,
    mime: String(b.mime || 'application/octet-stream').slice(0, 120), nome: String(b.nome || '').replace(/[\r\n"\\/]/g, ' ').trim().slice(0, 200) || null };
}

// POST /blob/visto/:id { tabela } — conta a abertura do vídeo (estimativa de transferência)
export async function registrarVisto(req, res) {
  try {
    await garantirBlob();
    const tab = req.body?.quadro === 'orc' ? 'orc_fotos' : req.body?.quadro === 'qd' ? 'bx_quadro_fotos' : 'loj_fotos';
    const f = (await query(`SELECT blob_url, tamanho FROM ${tab} WHERE id = $1`, [parseInt(req.params.id) || 0])).rows[0];
    if (f?.blob_url) await evento('visto', { bytes: Number(f.tamanho) || 0, simples: 1 });
    res.json({ ok: true });
  } catch { res.json({ ok: false }); }
}

// GET /blob/alerta — para o aviso no topo (90% do grátis)
export async function alertaBlob(req, res) {
  try {
    const u = await usoBlob();
    res.json({ alerta: u.alerta, pct: u.maior.pct, item: u.maior.nome, configurado: u.configurado });
  } catch { res.json({ alerta: false }); }
}

// GET /blob/uso — tela Armazenamento
export async function verUsoBlob(req, res, next) {
  try {
    const uso = await usoBlob();
    const arquivos = (await query(
      `SELECT a.id, a.url, a.tamanho, a.mime, a.nome, a.quadro, a.pedido_id, a.campo_id, a.usuario_nome, a.criado_em,
              CASE WHEN a.quadro = 'orc' THEN (SELECT COALESCE(cliente_nome, referencia) FROM pedidos_orcamento WHERE id = a.pedido_id)
                   WHEN a.quadro = 'qd' THEN (SELECT q.nome || ' — ' || c.titulo FROM bx_quadro_cards c JOIN bx_quadros q ON q.id = c.quadro_id WHERE c.id = a.pedido_id)
                   ELSE (SELECT 'Pedido ' || numero_pedido || ' — ' || cliente_nome FROM lojinha_boxer_pedidos WHERE id = a.pedido_id) END AS card
         FROM bx_blob_arquivos a WHERE a.excluido_em IS NULL ORDER BY a.tamanho DESC, a.id DESC LIMIT 500`)).rows;
    res.json({ ...uso, lista: arquivos });
  } catch (err) { next(err); }
}

// PUT /blob/limites { armazenamento_gb, operacoes_avancadas, operacoes_simples, transferencia_gb }
export async function salvarLimites(req, res, next) {
  try {
    await garantirBlob();
    const atual = await limites();
    const n = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : padrao);
    const novo = {
      armazenamento_gb: n(req.body?.armazenamento_gb, atual.armazenamento_gb),
      operacoes_avancadas: Math.round(n(req.body?.operacoes_avancadas, atual.operacoes_avancadas)),
      operacoes_simples: Math.round(n(req.body?.operacoes_simples, atual.operacoes_simples)),
      transferencia_gb: n(req.body?.transferencia_gb, atual.transferencia_gb),
    };
    await query(`INSERT INTO bx_config (chave, valor) VALUES ('blob_limites', $1::jsonb)
                 ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`, [JSON.stringify(novo)]);
    res.json(await usoBlob());
  } catch (err) { next(err); }
}

// DELETE /blob/arquivos/:id — exclui o vídeo (do card e do armazenamento)
export async function excluirArquivo(req, res, next) {
  try {
    await garantirBlob();
    const a = (await query(`SELECT * FROM bx_blob_arquivos WHERE id = $1 AND excluido_em IS NULL`, [parseInt(req.params.id) || 0])).rows[0];
    if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    await excluirArquivoBlob(a.url);
    await query(`DELETE FROM orc_fotos WHERE blob_url = $1`, [a.url]).catch(() => {});
    await query(`DELETE FROM loj_fotos WHERE blob_url = $1`, [a.url]).catch(() => {});
    await query(`DELETE FROM bx_quadro_fotos WHERE blob_url = $1`, [a.url]).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// POST /blob/conferir — soma o tamanho real na Vercel (cada página de 1.000 arquivos = 1 operação)
export async function conferirNaVercel(req, res) {
  try {
    if (!blobConfigurado()) return res.status(503).json({ erro: 'Armazenamento não ligado.' });
    await garantirBlob();
    let cursor, total = 0, qtd = 0, paginas = 0;
    do {
      const r = await list({ cursor, limit: 1000 });
      paginas++;
      for (const b of r.blobs) { total += b.size; qtd++; }
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor && paginas < 20);
    await evento('conferir', { operacoes: paginas });
    res.json({ bytes: total, arquivos: qtd, operacoes: paginas });
  } catch (e) { res.status(502).json({ erro: `Não consegui ler o armazenamento: ${e.message}` }); }
}
