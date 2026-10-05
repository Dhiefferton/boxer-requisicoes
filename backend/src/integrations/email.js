// ============================================================
// integrations/email.js — Envio de e-mails via Resend
// ============================================================
// Variáveis de ambiente:
//   RESEND_API_KEY  chave da API (https://resend.com/api-keys)
//   EMAIL_FROM      remetente, ex.: "Boxer Requisições <nao-responda@boxersoldas.com.br>"
//                   (o domínio precisa estar verificado no Resend)

const RESEND_URL = 'https://api.resend.com/emails';

export function emailConfigurado() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function enviarEmail({ para, assunto, html, texto }) {
  if (!emailConfigurado()) {
    throw new Error('Envio de e-mail não configurado (RESEND_API_KEY / EMAIL_FROM).');
  }
  const resp = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    process.env.EMAIL_FROM,
      to:      [para],
      subject: assunto,
      html,
      text:    texto,
    }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '');
    throw new Error(`Resend ${resp.status}: ${corpo.slice(0, 300)}`);
  }
  return resp.json();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function emailRecuperacaoSenha({ nome, link, minutos }) {
  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || 'colaborador';
  const assunto = 'Redefinir sua senha — Boxer Requisições';
  const texto =
`Olá, ${primeiroNome}!

Recebemos um pedido para redefinir a senha da sua conta no Boxer Requisições.
Para criar uma nova senha, acesse o link abaixo (válido por ${minutos} minutos):

${link}

Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.`;

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f5f8;font-family:Arial,Helvetica,sans-serif;color:#1f2330">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#0f1117;padding:20px 24px">
          <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#4f6ef7;vertical-align:middle"></span>
          <span style="color:#e8eaf0;font-size:16px;font-weight:bold;vertical-align:middle;margin-left:8px">Boxer Requisições</span>
        </td></tr>
        <tr><td style="padding:28px 24px">
          <p style="margin:0 0 12px;font-size:16px">Olá, <b>${esc(primeiroNome)}</b>!</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#4a5068">
            Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.
          </p>
          <p style="margin:0 0 24px;text-align:center">
            <a href="${esc(link)}" style="display:inline-block;background:#4f6ef7;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 24px;border-radius:10px">Criar nova senha</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#8b91a8">O link vale por ${minutos} minutos e só pode ser usado uma vez.</p>
          <p style="margin:0;font-size:12px;color:#8b91a8">Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { assunto, html, texto };
}
