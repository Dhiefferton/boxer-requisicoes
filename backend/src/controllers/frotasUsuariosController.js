// ============================================================
// controllers/frotasUsuariosController.js — Acesso ao Frotas pelo Admin do Boxer Operações
// ============================================================
// A tela "Usuários" do Frotas saiu: o perfil de cada pessoa no Frotas (Gestor, Operador
// Logística, Operador Comex, Motorista) é escolhido em Admin › Usuários › Editar.
// Grava na ficha do Frotas (tabela usuarios_perfil do Supabase do Frotas), achada pelo
// e-mail da pessoa (ou pelo vínculo de e-mails do login único). Sem ficha, cria o login
// no Supabase do Frotas (entrada pelo login único; senha aleatória que ninguém usa).
// Variáveis: FROTAS_SUPABASE_URL e FROTAS_SUPABASE_SERVICE_KEY (só no servidor).
// ============================================================
import crypto from 'crypto';
import { query } from '../config/db.js';
import { emailNoDestino } from './ssoController.js';

const PERFIS = ['gestor', 'operador', 'operador_comex', 'motorista'];

const _FS = (process.env.FROTAS_SUPABASE_SCHEMA || '').trim(); // schema do Frotas no Supabase (vazio = public)
const _FSH = _FS && _FS !== 'public' ? { 'Accept-Profile': _FS, 'Content-Profile': _FS } : {};
function supa() {
  const url = String(process.env.FROTAS_SUPABASE_URL || '').replace(/\/+$/, '');
  const chave = process.env.FROTAS_SUPABASE_SERVICE_KEY;
  if (!url || !chave) return null;
  return { url, h: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ..._FSH } };
}
async function usuarioOperacoes(id) {
  return (await query(`SELECT id, nome, email FROM usuarios WHERE id = $1`, [parseInt(id) || 0])).rows[0] || null;
}
async function fichaPorEmail(sb, email) {
  const r = await fetch(`${sb.url}/rest/v1/usuarios_perfil?select=id,nome,email,cargo,perfil,ativo&email=ilike.${encodeURIComponent(email)}&limit=1`, { headers: sb.h });
  if (!r.ok) throw new Error(`Frotas respondeu ${r.status} ao ler a ficha.`);
  return (await r.json())?.[0] || null;
}

// GET /admin/usuarios/:id/frotas
export async function verAcessoFrotas(req, res, next) {
  try {
    const sb = supa();
    if (!sb) return res.json({ configurado: false });
    const u = await usuarioOperacoes(req.params.id);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!u.email) return res.json({ configurado: true, email: null, ficha: null });
    const email = await emailNoDestino(String(u.email).trim().toLowerCase(), 'frotas');
    res.json({ configurado: true, email, ficha: await fichaPorEmail(sb, email) });
  } catch (err) { next(err); }
}

// PUT /admin/usuarios/:id/frotas { perfil: 'nenhum'|'gestor'|'operador'|'operador_comex'|'motorista', cargo }
export async function salvarAcessoFrotas(req, res, next) {
  try {
    const sb = supa();
    if (!sb) return res.status(400).json({ erro: 'O Frotas ainda não está ligado neste servidor.' });
    const u = await usuarioOperacoes(req.params.id);
    if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (!u.email) return res.status(400).json({ erro: 'Cadastre o e-mail do usuário antes de liberar o Frotas.' });
    const perfil = String(req.body?.perfil || '');
    const cargo = String(req.body?.cargo || '').trim().slice(0, 120) || null;
    if (perfil !== 'nenhum' && !PERFIS.includes(perfil)) return res.status(400).json({ erro: 'Perfil do Frotas inválido.' });
    const email = await emailNoDestino(String(u.email).trim().toLowerCase(), 'frotas');
    let ficha = await fichaPorEmail(sb, email);
    const patch = async (id, dados) => {
      const r = await fetch(`${sb.url}/rest/v1/usuarios_perfil?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { ...sb.h, Prefer: 'return=representation' }, body: JSON.stringify(dados) });
      if (!r.ok) throw new Error(`Frotas respondeu ${r.status} ao gravar a ficha.`);
      return (await r.json())?.[0] || null;
    };

    if (perfil === 'nenhum') {
      if (ficha && ficha.ativo !== false) ficha = await patch(ficha.id, { ativo: false });
      return res.json({ ficha });
    }
    if (!ficha) {
      // cria o login no Supabase do Frotas; o gatilho do Frotas cria a ficha (usuarios_perfil)
      const r = await fetch(`${sb.url}/auth/v1/admin/users`, { method: 'POST', headers: sb.h,
        body: JSON.stringify({ email, password: crypto.randomBytes(24).toString('base64url'), email_confirm: true, user_metadata: { nome: u.nome } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.id) return res.status(400).json({ erro: `Não consegui criar o acesso no Frotas: ${j?.msg || j?.message || j?.error_description || r.status}` });
      for (let i = 0; i < 5 && !ficha; i++) { ficha = await fichaPorEmail(sb, email); if (!ficha) await new Promise(ok => setTimeout(ok, 400)); }
      if (!ficha) {
        const ins = await fetch(`${sb.url}/rest/v1/usuarios_perfil`, { method: 'POST', headers: { ...sb.h, Prefer: 'return=representation' },
          body: JSON.stringify({ id: j.id, nome: u.nome, email, cargo, perfil, ativo: true }) });
        if (!ins.ok) return res.status(400).json({ erro: `O login foi criado, mas a ficha do Frotas não (${ins.status}).` });
        ficha = (await ins.json())?.[0];
      }
    }
    ficha = await patch(ficha.id, { nome: u.nome, perfil, cargo, ativo: true, precisa_trocar_senha: false });
    res.json({ ficha });
  } catch (err) { next(err); }
}
