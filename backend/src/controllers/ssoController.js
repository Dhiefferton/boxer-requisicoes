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

// POST /sso/codigo { destino }  (logado)
export async function gerarCodigoSso(req, res, next) {
  try {
    const destino = String(req.body?.destino || '').toLowerCase();
    if (!DESTINOS.has(destino)) return res.status(400).json({ erro: 'Destino inválido.' });
    const email = String(req.usuario?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ erro: 'Seu usuário não tem e-mail cadastrado.' });

    if (destino === 'frotas') {
      const url = String(process.env.FROTAS_SUPABASE_URL || '').replace(/\/+$/, '');
      const chave = process.env.FROTAS_SUPABASE_SERVICE_KEY;
      if (!url || !chave) return res.json({ indisponivel: true, motivo: 'Login único do Frotas ainda não configurado no servidor.' });
      const h = { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
      // Só gera link para quem já existe no Frotas (o link mágico criaria um usuário novo)
      const ex = await fetch(`${url}/rest/v1/usuarios_perfil?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`, { headers: h });
      if (!ex.ok) return res.json({ indisponivel: true, motivo: 'Não consegui conferir seu cadastro no Frotas.' });
      if (!(await ex.json())?.length) return res.json({ indisponivel: true, motivo: `Não há usuário ${email} no Frotas.` });
      const r = await fetch(`${url}/auth/v1/admin/generate_link`, { method: 'POST', headers: h, body: JSON.stringify({ type: 'magiclink', email }) });
      const j = await r.json().catch(() => ({}));
      const token = j?.hashed_token || j?.properties?.hashed_token;
      if (!r.ok || !token) return res.json({ indisponivel: true, motivo: 'O Frotas não liberou o acesso agora.' });
      return res.json({ token_hash: token });
    }

    await garantir();
    const codigo = crypto.randomBytes(32).toString('hex');
    await query(`DELETE FROM bx_sso_codigos WHERE expira_em < NOW() - INTERVAL '1 hour'`).catch(() => {});
    await query(`INSERT INTO bx_sso_codigos (hash, email, nome, destino, expira_em) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '90 seconds')`,
      [sha(codigo), email, req.usuario?.nome || null, destino === 'coletor' ? 'wms' : destino]);
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
