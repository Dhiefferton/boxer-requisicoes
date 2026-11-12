// ============================================================
// controllers/ssoController.js — Login único (Operações → WMS e Frotas)
// ============================================================
// Quem entrou no Boxer Operações abre o WMS / coletor / Frotas já logado, sem pedir senha de novo.
// Liga as pessoas pelo MESMO E-MAIL em cada sistema (cada um mantém seus cargos e permissões).
//  • WMS e coletor: POST /sso/codigo gera um código de uso único (90 s). O WMS troca o código por e-mail+nome
//    em POST /sso/trocar (servidor com servidor) e abre a própria sessão.
//  • Frotas (Supabase Auth): gera um link mágico de uso único pela API admin do Supabase do Frotas.
//    Precisa das variáveis FROTAS_SUPABASE_URL e FROTAS_SUPABASE_SERVICE_KEY (só aqui no servidor).
// ============================================================
import crypto from 'crypto';
import { query } from '../config/db.js';

const DESTINOS = new Set(['wms', 'coletor', 'frotas']);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

let estrutura = null;
const garantir = () => (estrutura ||= query(`
  CREATE TABLE IF NOT EXISTS bx_sso_codigos (
    hash      VARCHAR(64) PRIMARY KEY,
    email     VARCHAR(255) NOT NULL,
    nome      VARCHAR(150),
    destino   VARCHAR(20) NOT NULL,
    expira_em TIMESTAMPTZ NOT NULL,
    usado_em  TIMESTAMPTZ
  )`).catch(e => { estrutura = null; throw e; }));

// Quando a pessoa usa e-mails diferentes nos sistemas, o vínculo diz qual e-mail dela vale em cada destino.
let estVinculos = null;
const garantirVinculos = () => (estVinculos ||= query(`
  CREATE TABLE IF NOT EXISTS bx_sso_vinculos (
    email_operacoes VARCHAR(255) NOT NULL,
    destino         VARCHAR(20)  NOT NULL,
    email_destino   VARCHAR(255) NOT NULL,
    PRIMARY KEY (email_operacoes, destino)
  );
  INSERT INTO bx_sso_vinculos (email_operacoes, destino, email_destino)
  VALUES ('admin@boxer.com.br', 'frotas', 'compras@boxersoldas.com.br')
  ON CONFLICT DO NOTHING;`).catch(e => { estVinculos = null; throw e; }));
export async function emailNoDestino(email, destino) {
  await garantirVinculos();
  const r = await query(`SELECT email_destino FROM bx_sso_vinculos WHERE email_operacoes = $1 AND destino = $2`, [email, destino === 'coletor' ? 'wms' : destino]);
  return String(r.rows[0]?.email_destino || email).trim().toLowerCase();
}

// POST /sso/codigo { destino }  (logado)
export async function gerarCodigoSso(req, res, next) {
  try {
    const destino = String(req.body?.destino || '').toLowerCase();
    if (!DESTINOS.has(destino)) return res.status(400).json({ erro: 'Destino inválido.' });
    const email = String(req.usuario?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ erro: 'Seu usuário não tem e-mail cadastrado.' });

    if (destino === 'frotas') {
      const emailFrotas = await emailNoDestino(email, 'frotas');
      const url = String(process.env.FROTAS_SUPABASE_URL || '').replace(/\/+$/, '');
      const chave = process.env.FROTAS_SUPABASE_SERVICE_KEY;
      if (!url || !chave) return res.json({ indisponivel: true, motivo: 'Login único do Frotas ainda não configurado no servidor.' });
      const h = { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
      // Só gera link para quem já existe no Frotas (o link mágico criaria um usuário novo)
      const ex = await fetch(`${url}/rest/v1/usuarios_perfil?select=id,email&email=ilike.${encodeURIComponent(emailFrotas)}&limit=1`, { headers: h });
      if (!ex.ok) return res.json({ indisponivel: true, motivo: 'Não consegui conferir seu cadastro no Frotas.' });
      const ficha = (await ex.json())?.[0];
      if (!ficha) return res.json({ indisponivel: true, motivo: `Não há usuário ${emailFrotas} no Frotas.` });
      // O login (Supabase Auth) é achado pelo id da ficha: o e-mail do login pode ser diferente do e-mail da ficha.
      const au = await fetch(`${url}/auth/v1/admin/users/${ficha.id}`, { headers: h });
      const authUser = au.ok ? await au.json().catch(() => null) : null;
      const emailLogin = String(authUser?.email || '').trim().toLowerCase();
      if (!emailLogin) return res.json({ indisponivel: true, motivo: 'O usuário do Frotas não tem login ativo (sem e-mail no Supabase Auth).' });
      const r = await fetch(`${url}/auth/v1/admin/generate_link`, { method: 'POST', headers: h, body: JSON.stringify({ type: 'magiclink', email: emailLogin }) });
      const j = await r.json().catch(() => ({}));
      const token = j?.hashed_token || j?.properties?.hashed_token;
      if (!r.ok || !token) return res.json({ indisponivel: true, motivo: 'O Frotas não liberou o acesso agora.' });
      // garante que o link abriu o MESMO usuário da ficha
      if (j?.id && j.id !== ficha.id) return res.json({ indisponivel: true, motivo: 'O login do Frotas não corresponde à ficha do usuário.' });
      return res.json({ token_hash: token, email: emailLogin });
    }

    await garantir();
    const codigo = crypto.randomBytes(32).toString('hex');
    await query(`DELETE FROM bx_sso_codigos WHERE expira_em < NOW() - INTERVAL '1 hour'`).catch(() => {});
    await query(`INSERT INTO bx_sso_codigos (hash, email, nome, destino, expira_em) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '90 seconds')`,
      [sha(codigo), await emailNoDestino(email, destino), req.usuario?.nome || null, destino === 'coletor' ? 'wms' : destino]);
    res.json({ codigo });
  } catch (err) { next(err); }
}

// POST /sso/trocar { codigo, destino } — chamado pelo servidor do WMS (público, com limite de tentativas)
export async function trocarCodigoSso(req, res, next) {
  try {
    await garantir();
    const codigo = String(req.body?.codigo || '');
    const destino = String(req.body?.destino || 'wms').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(codigo)) return res.status(400).json({ erro: 'Código inválido.' });
    const r = await query(
      `UPDATE bx_sso_codigos SET usado_em = NOW()
        WHERE hash = $1 AND destino = $2 AND usado_em IS NULL AND expira_em > NOW()
        RETURNING email, nome`, [sha(codigo), destino === 'coletor' ? 'wms' : destino]);
    if (!r.rows[0]) return res.status(401).json({ erro: 'Código inválido, já usado ou expirado.' });
    res.json({ email: r.rows[0].email, nome: r.rows[0].nome });
  } catch (err) { next(err); }
}

// GET /frotas/nota?numero= — busca a nota no ZenERP para o Custo de Viagem do Frotas.
// Repassa ao boxer-wms-api (que tem a integração com o Zen) com o segredo combinado.
// Variáveis: BOXER_WMS_API_URL e FROTAS_API_SECRET (as mesmas que o Frotas usava).
export async function notaFrotas(req, res) {
  const numero = String(req.query?.numero || '').trim();
  if (!numero) return res.status(400).json({ erro: 'Informe o parâmetro "numero"' });
  const base = process.env.BOXER_WMS_API_URL, segredo = process.env.FROTAS_API_SECRET;
  if (!base || !segredo) return res.status(500).json({ erro: 'BOXER_WMS_API_URL / FROTAS_API_SECRET não configurados neste servidor' });
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/frotas/nota?numero=${encodeURIComponent(numero)}`, { headers: { Authorization: `Bearer ${segredo}` } });
    const corpo = await r.json().catch(() => null);
    res.status(r.ok ? 200 : r.status).json(corpo || { erro: `boxer-wms-api respondeu ${r.status}` });
  } catch (e) { console.error('Nota Frotas:', e.message); res.status(502).json({ erro: 'Erro ao consultar o boxer-wms-api. Tente novamente em instantes.' }); }
}
