// ============================================================
// controllers/faturamentoLojinha.js — E-mail ao faturamento (Lojinha → Finalizado)
// ============================================================
// Quando um pedido da Lojinha chega em Finalizado, manda um e-mail para
// faturamento@boxersoldas.com.br pedindo a nota (mesmo texto do Pipefy
// "Logística CIF"): romaneio, transportadora, CNPJ da transportadora, peso,
// volumes e frete por conta. Um e-mail por pedido (marcado em email_faturamento_em).
// Só pedidos finalizados depois desta função existir (EMAIL_FAT_DESDE).
// ============================================================
import { query } from '../config/db.js';
import { enviarEmail, emailConfigurado } from '../integrations/email.js';
import { romaneioDaOrdem } from '../integrations/zenPedidoVenda.js';
import { registrarMovLoj } from './lojinhaController.js';

const PARA = process.env.EMAIL_FATURAMENTO || 'faturamento@boxersoldas.com.br';
const EMAIL_FAT_DESDE = '2026-11-04T02:00:00Z';
const CNPJ_CORREIOS = '68.945.153/0001-45';

let colunas = null;
const garantir = () => (colunas ||= query(`
  ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS email_faturamento_em TIMESTAMPTZ;
  ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS email_faturamento_erro TEXT;
  ALTER TABLE lojinha_boxer_pedidos ADD COLUMN IF NOT EXISTS email_faturamento_tentativas INTEGER NOT NULL DEFAULT 0;`)
  .catch(e => { colunas = null; throw e; }));

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// CNPJ da transportadora: procura nas Databases do B-Requisições (coluna "CNPJ")
async function cnpjTransportadora(nome) {
  if (!nome) return null;
  try {
    const r = await query(
      `SELECT g.descricao, g.dados, b.colunas FROM bx_base_registros g JOIN bx_bases b ON b.id = g.base_id
        WHERE g.ativo AND b.ativo AND LOWER(g.descricao) = LOWER($1) LIMIT 20`, [nome]);
    for (const row of r.rows) {
      const col = (row.colunas || []).find(c => /cnpj/.test(norm(c.nome)));
      const v = col && row.dados?.[col.id];
      if (v) return String(v);
    }
  } catch { /* sem bases */ }
  return ['sedex', 'pac', 'correios'].includes(norm(nome)) ? CNPJ_CORREIOS : null;
}

function montarEmail({ romaneio, transportadora, cnpj, peso, volumes, frete }) {
  const rom = romaneio != null ? (Number.isFinite(Number(romaneio)) ? Number(romaneio).toLocaleString('en-US') : String(romaneio)) : '';
  const assunto = `Envio de peças - Romaneio: ${rom}`;
  const linhas = [
    'Olá!',
    'Nova solicitação de faturamento de peças:',
    `Romaneio: ${rom}`,
    `Transportadora: ${transportadora || ''}`,
    `CNPJ Transportadora: ${cnpj || ''}`,
    `Peso total: ${peso != null ? String(peso).replace('.', ',') : ''}`,
    `Volumes: ${volumes != null ? volumes : ''}`,
    '',
    `Frete por conta: ${frete}`,
    '',
    'Favor responder este e-mail com numero da NF emitida.',
  ];
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2330">${linhas.map(l => (l ? esc(l) : '&nbsp;')).join('<br>')}</div>`;
  return { assunto, texto: linhas.join('\n'), html };
}

async function dadosEmail(p) {
  const rom = p.zen_ordem_separacao_id ? await romaneioDaOrdem(p.zen_ordem_separacao_id).catch(() => null) : null;
  const transportadora = p.tipo_envio === 'Transportadora' ? (p.transportadora || 'Transportadora') : p.tipo_envio;
  const cnpj = await cnpjTransportadora(transportadora);
  return { rom, email: montarEmail({ romaneio: rom?.numero ?? null, transportadora, cnpj, peso: rom?.peso ?? null, volumes: rom?.volumes ?? null, frete: 'Emitente' }) };
}

/** Prévia do e-mail de um pedido (diagnóstico; não envia). */
export async function previaEmailFaturamento(pedidoId) {
  const p = (await query(`SELECT * FROM lojinha_boxer_pedidos WHERE id = $1`, [pedidoId])).rows[0];
  if (!p) return null;
  const { rom, email } = await dadosEmail(p);
  return { configurado: emailConfigurado(), para: PARA, responder_para: process.env.EMAIL_RESPOSTA_FATURAMENTO || null, romaneio: rom, ...email };
}

async function enviarUm(p) {
  const { rom, email } = await dadosEmail(p);
  await enviarEmail({ para: PARA, assunto: email.assunto, html: email.html, texto: email.texto, responderPara: process.env.EMAIL_RESPOSTA_FATURAMENTO || undefined });
  return { assunto: email.assunto, romaneio: rom?.numero ?? null };
}

/** Manda o e-mail dos pedidos que chegaram em Finalizado e ainda não avisaram o faturamento. Nunca lança erro. */
export async function avisarFaturamentoLojinha(usuario = null) {
  try {
    if (!emailConfigurado()) return;
    await garantir();
    const r = await query(`SELECT * FROM lojinha_boxer_pedidos
       WHERE status = 'finalizado' AND finalizado_em >= $1 AND email_faturamento_em IS NULL AND email_faturamento_tentativas < 3
       ORDER BY finalizado_em LIMIT 10`, [EMAIL_FAT_DESDE]);
    for (const p of r.rows) {
      // marca antes de enviar (outra requisição ao mesmo tempo não manda de novo)
      const trava = await query(`UPDATE lojinha_boxer_pedidos SET email_faturamento_em = NOW(), email_faturamento_tentativas = email_faturamento_tentativas + 1
         WHERE id = $1 AND email_faturamento_em IS NULL RETURNING id`, [p.id]);
      if (!trava.rows[0]) continue;
      try {
        const e = await enviarUm(p);
        await query(`UPDATE lojinha_boxer_pedidos SET email_faturamento_erro = NULL WHERE id = $1`, [p.id]);
        await registrarMovLoj(p, 'email_faturamento', { usuario, origem: usuario ? 'usuario' : 'sistema',
          descricao: `E-mail enviado ao faturamento (${PARA}): ${e.assunto}`, detalhes: { romaneio: e.romaneio } });
      } catch (err) {
        await query(`UPDATE lojinha_boxer_pedidos SET email_faturamento_em = NULL, email_faturamento_erro = $2 WHERE id = $1`, [p.id, String(err.message).slice(0, 500)]);
        console.error(`[Lojinha] e-mail faturamento pedido ${p.id}:`, err.message);
      }
    }
  } catch (e) { console.error('[Lojinha] e-mail faturamento:', e.message); }
}
