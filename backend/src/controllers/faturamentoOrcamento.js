// ============================================================
// controllers/faturamentoOrcamento.js — E-mails ao faturamento (Orçamento)
// ============================================================
// Quando um card do Orçamento chega na coluna "Liberação de Faturamento"
// (reconhecida pelo nome da coluna), manda dois e-mails para o faturamento,
// no mesmo texto dos e-mails do Pipefy:
//   1. Retorno de conserto — Nº da remessa de conserto (fase Entrada),
//      transportadora, CNPJ da transportadora e frete por conta.
//   2. Prestação de serviço — cliente, CPF/CNPJ, valor da NF, Nº do pedido
//      de venda (peças) no Zen e o corpo da nota.
// Cada e-mail é enviado uma vez (email_fat_remessa_em / email_fat_servico_em);
// com erro, tenta de novo até 3 vezes. Orçamento recusado não manda o 2º e-mail.
// ============================================================
import { query } from '../config/db.js';
import { enviarEmail, emailConfigurado } from '../integrations/email.js';
import { documentosZen } from '../integrations/zenPedidoVenda.js';
import { cnpjTransportadora } from './faturamentoLojinha.js';

const PARA = process.env.EMAIL_FATURAMENTO || 'faturamento@boxersoldas.com.br';

let colunas = null;
const garantir = () => (colunas ||= query(`
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS fat_liberado_em TIMESTAMPTZ;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS email_fat_remessa_em TIMESTAMPTZ;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS email_fat_servico_em TIMESTAMPTZ;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS email_fat_tentativas INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS email_fat_erro TEXT;
  ALTER TABLE pedidos_orcamento ADD COLUMN IF NOT EXISTS email_fat_enviados JSONB NOT NULL DEFAULT '[]'::jsonb;`)
  .catch(e => { colunas = null; throw e; }));

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Valor de um campo do card pelo nome (ex.: /remessa de conserto/); listas viram texto
function texto(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.startsWith('[')) { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(x => String(x).trim()).filter(Boolean).join(', '); } catch { /* texto */ } }
  if (s.startsWith('{')) { try { const o = JSON.parse(s); if (o?.descricao) return String(o.descricao); } catch { /* texto */ } }
  return s;
}
function campo(p, re) {
  const lista = Array.isArray(p.pipefy_campos) ? p.pipefy_campos : [];
  // campos do B-Requisições (bx_) primeiro: são os editados aqui
  const ord = [...lista.filter(c => String(c?.id).startsWith('bx_')), ...lista.filter(c => !String(c?.id).startsWith('bx_'))];
  for (const c of ord) if (re.test(norm(c?.nome)) && texto(c?.valor)) return texto(c.valor);
  return '';
}
const numero = (v) => {
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
};
const moeda = (n) => (n == null ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function documento(d) {
  const x = String(d || '').replace(/\D/g, '');
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(d || '');
}
const html = (linhas) => {
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2330">${linhas.map(l => (l ? esc(l) : '&nbsp;')).join('<br>')}</div>`;
};
// Total das peças do pedido (quantidade × valor)
function totalPecas(p) {
  let t = 0;
  for (const it of p.itens || []) {
    let v = Number(it?.valor_unitario);
    if (!Number.isFinite(v)) { const m = String([it?.codigo, it?.descricao].join(' ')).match(/"valor"\s*:\s*(-?[\d.]+)/); v = m ? Number(m[1]) : NaN; }
    if (Number.isFinite(v)) t += v * (Number(it?.quantidade) || 0);
  }
  return t > 0 ? Math.round(t * 100) / 100 : null;
}

/** E-mail 1: Retorno de conserto (Nº da remessa de conserto da fase Entrada) */
async function emailRemessa(p) {
  const remessa = campo(p, /remessa de conserto/);
  if (!remessa) return null;
  const frete = norm(p.frete_por_conta || campo(p, /frete por conta/));
  const transportadora = campo(p, /^forma de envio/) || (/proprio/.test(frete) ? 'Próprio Nominal' : '') || texto(p.entregue_por);
  const cnpj = await cnpjTransportadora(transportadora);
  const linhas = [
    'Olá!',
    'Nova solicitação de faturamento para retorno de conserto:',
    `Remessa de conserto Nº: ${remessa}`,
    `Transportadora: ${transportadora || ''}`,
    `CNPJ Transportadora: ${cnpj || ''}`,
    '',
    `Frete por conta: ${/boxer|emitente/.test(frete) ? 'Emitente' : 'Destinatário'}`,
    '',
    'Favor responder este e-mail com numero da NF emitida.',
  ];
  return { assunto: `Retorno de conserto - NF de remessa Nº: ${remessa}`, texto: linhas.join('\n'), html: html(linhas) };
}

/** E-mail 2: Prestação de serviço (cliente, valores, pedido de venda no Zen, corpo da nota) */
async function emailServico(p) {
  let pedidoZen = campo(p, /pedido pecas/);
  if (p.zen_pedido_id) {
    const d = await documentosZen({ zen_pedido_id: p.zen_pedido_id }).catch(() => null);
    if (d?.vendaNumero) pedidoZen = Number.isFinite(Number(d.vendaNumero)) ? Number(d.vendaNumero).toLocaleString('en-US') : d.vendaNumero;
  }
  const valorNF = totalPecas(p) ?? numero(campo(p, /total a receber/));
  const modelo = campo(p, /^modelo (da )?maquina/);
  const pecasServico = campo(p, /pecas utilizadas para emissao de prestacao de servico/);
  const linhas = [
    'Nova solicitação de emissão de nota de prestação de serviço para:',
    p.cliente_nome || '',
    `CPF/CNPJ: ${documento(p.cliente_cnpj)}`,
    `Valor total NF: ${valorNF != null ? moeda(valorNF) : ''}`,
    `Pedido peças no PS: ${pedidoZen || ''}`,
    '',
    'Corpo da nota:',
    '',
    `Assistência Técnica referente ao conserto da máquina de modelo ${modelo || ''} com 3 meses de garantia em cima do serviço prestado.`,
    '',
    ...(pecasServico ? pecasServico.split(/\r?\n/) : []),
  ];
  return { assunto: `Prestação de serviço - ${p.cliente_nome || `card #${p.id}`}`, texto: linhas.join('\n'), html: html(linhas) };
}

const recusado = (p) => /recus|reprov/i.test(String(p.aprovacao || '')) && !/parcial/i.test(String(p.aprovacao || ''));

/** A coluna é a "Liberação de Faturamento"? (pelo nome) */
export const ehLiberacaoFaturamentoOrc = (nome) => /libera\w*\s+(de\s+|para\s+)?fatura/.test(norm(nome));

/** Prévia dos dois e-mails de um card (diagnóstico; não envia). */
export async function previaEmailsOrcamento(pedidoId) {
  const p = (await query(`SELECT * FROM pedidos_orcamento WHERE id = $1`, [pedidoId])).rows[0];
  if (!p) return null;
  return { configurado: emailConfigurado(), para: PARA, remessa: await emailRemessa(p), servico: recusado(p) ? 'não envia (orçamento recusado)' : await emailServico(p) };
}

/** E-mails ao faturamento do card: os enviados (como foram) e a prévia dos que ainda não saíram. */
export async function emailsFaturamentoCard(pedidoId) {
  await garantir();
  const p = (await query(`SELECT * FROM pedidos_orcamento WHERE id = $1`, [pedidoId])).rows[0];
  if (!p) return null;
  const enviados = Array.isArray(p.email_fat_enviados) ? p.email_fat_enviados : [];
  const tipos = new Set(enviados.map(x => x.tipo));
  const pendentes = [];
  const remetente = String(process.env.EMAIL_FROM || '').replace(/\s*<.*$/, '').replace(/"/g, '').trim() || 'Boxer Requisições';
  if (!tipos.has('remessa')) { const m = await emailRemessa(p).catch(() => null); if (m) pendentes.push({ tipo: 'remessa', assunto: m.assunto, de: remetente, para: PARA, texto: m.texto }); }
  if (!tipos.has('servico') && !recusado(p)) { const m = await emailServico(p).catch(() => null); if (m) pendentes.push({ tipo: 'servico', assunto: m.assunto, de: remetente, para: PARA, texto: m.texto }); }
  return { enviados, pendentes, liberado_em: p.fat_liberado_em, erro: p.email_fat_erro || null, configurado: emailConfigurado() };
}

/** Card chegou na Liberação de Faturamento: marca e manda os e-mails. Nunca lança erro. */
export async function liberarFaturamentoOrcamento(pedidoId, usuario = null) {
  try {
    await garantir();
    await query(`UPDATE pedidos_orcamento SET fat_liberado_em = COALESCE(fat_liberado_em, NOW()) WHERE id = $1`, [pedidoId]);
  } catch (e) { console.error('[Orçamento] liberação de faturamento:', e.message); }
  await avisarFaturamentoOrcamento(usuario);
}

async function registrar(p, descricao, usuario) {
  await query(`INSERT INTO pedidos_orcamento_movimentos (pedido_id, tipo, de_status, para_status, descricao, usuario_id, usuario_nome, origem)
               VALUES ($1, 'email_faturamento', $2, $2, $3, $4, $5, $6)`,
    [p.id, p.status, descricao, usuario?.id || null, usuario?.nome || 'Sistema', usuario ? 'usuario' : 'sistema']).catch(() => {});
}

/** Manda os e-mails pendentes dos cards liberados para faturamento. Nunca lança erro. */
export async function avisarFaturamentoOrcamento(usuario = null) {
  try {
    if (!emailConfigurado()) return;
    await garantir();
    const r = await query(`SELECT * FROM pedidos_orcamento
       WHERE fat_liberado_em IS NOT NULL AND status != 'cancelado' AND email_fat_tentativas < 3
         AND (email_fat_remessa_em IS NULL OR email_fat_servico_em IS NULL)
       ORDER BY fat_liberado_em LIMIT 10`);
    for (const p of r.rows) {
      // trava antes de enviar (outra requisição ao mesmo tempo não manda de novo)
      const trava = await query(`UPDATE pedidos_orcamento SET email_fat_tentativas = email_fat_tentativas + 1,
          email_fat_remessa_em = COALESCE(email_fat_remessa_em, NOW()), email_fat_servico_em = COALESCE(email_fat_servico_em, NOW())
        WHERE id = $1 AND (email_fat_remessa_em IS NULL OR email_fat_servico_em IS NULL) RETURNING id`, [p.id]);
      if (!trava.rows[0]) continue;
      const falhas = [];
      const envios = [
        { col: 'email_fat_remessa_em', ja: p.email_fat_remessa_em, montar: emailRemessa, nome: 'retorno de conserto' },
        { col: 'email_fat_servico_em', ja: p.email_fat_servico_em, montar: (x) => (recusado(x) ? null : emailServico(x)), nome: 'prestação de serviço' },
      ];
      for (const e of envios) {
        if (e.ja) continue;
        try {
          const m = await e.montar(p);
          if (!m) continue; // sem remessa / recusado: nada a mandar
          await enviarEmail({ para: PARA, assunto: m.assunto, html: m.html, texto: m.texto, responderPara: process.env.EMAIL_RESPOSTA_FATURAMENTO || undefined });
          await registrar(p, `E-mail de ${e.nome} enviado ao faturamento (${PARA}): ${m.assunto}`, usuario);
          // guarda o e-mail como foi enviado (aba "E-mails" do card)
          const remetente = String(process.env.EMAIL_FROM || '').replace(/\s*<.*$/, '').replace(/"/g, '').trim() || 'Boxer Requisições';
          await query(`UPDATE pedidos_orcamento SET email_fat_enviados = COALESCE(email_fat_enviados, '[]'::jsonb) || $2::jsonb WHERE id = $1`,
            [p.id, JSON.stringify([{ tipo: e.col === 'email_fat_remessa_em' ? 'remessa' : 'servico', assunto: m.assunto, de: remetente, para: PARA,
              texto: m.texto, enviado_em: new Date().toISOString(), por: usuario?.nome || null }])]).catch(() => {});
        } catch (err) {
          falhas.push(`${e.nome}: ${err.message}`);
          await query(`UPDATE pedidos_orcamento SET ${e.col} = NULL WHERE id = $1`, [p.id]);
          console.error(`[Orçamento] e-mail faturamento (${e.nome}) card ${p.id}:`, err.message);
        }
      }
      await query(`UPDATE pedidos_orcamento SET email_fat_erro = $2 WHERE id = $1`, [p.id, falhas.length ? falhas.join(' | ').slice(0, 500) : null]);
    }
  } catch (e) { console.error('[Orçamento] e-mail faturamento:', e.message); }
}

// GET /pedidos-orcamento/:id/emails-faturamento — e-mails ao faturamento do card (enviados e prévia)
export async function verEmailsFaturamento(req, res, next) {
  try {
    const r = await emailsFaturamentoCard(parseInt(req.params.id));
    if (!r) return res.status(404).json({ erro: 'Card não encontrado.' });
    res.json(r);
  } catch (err) { next(err); }
}
