// ============================================================
// utils/etiquetaEntrada.js — Etiqueta de entrada 10x15 cm (impressora Argox)
// ============================================================
// Mesmo modelo da ficha em papel: Data de entrada, Cliente, Nº de entrada (NS),
// Modelo, Condição (Troca autorizada / Garantia / Orçamento / Nova p/ estoque),
// Acessórios, Entregue por e NF entrada. Os dados vêm da fase Entrada do card
// (Orçamentos ou Garantia). Abre uma janela com a página no tamanho 100x150 mm
// e chama a impressão do navegador — escolha a Argox e o papel 10x15.
// ============================================================
import QRCode from 'qrcode';
import logoBoxer from '../assets/logo-boxer.svg';
import { valorLista, lerRegistro } from '../components/operador/CamposCardOrcamento';

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Texto legível de um valor de campo (lista, registro de base ou texto) */
export function textoCampo(v) {
  const r = lerRegistro(v);
  if (r) return r.descricao;
  return valorLista(v).map(x => lerRegistro(x)?.descricao || x).join(', ');
}

/** Procura o primeiro campo preenchido cujo rótulo bate com a expressão. campos: [{ rotulo, valor }] */
export function campoPorRotulo(campos, re) {
  const c = (campos || []).find(x => re.test(norm(x.rotulo)) && textoCampo(x.valor));
  return c ? c.valor : null;
}

function dataBr(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m2 ? `${m2[1]}/${m2[2]}/${m2[3]}` : s;
}

const CONDICOES = [
  ['troca', 'TROCA AUTORIZADA'], ['orcamento', 'ORÇAMENTO'],
  ['garantia', 'GARANTIA'], ['nova', 'NOVA P/ ESTOQUE'],
];
const ACESSORIOS = [
  ['completa', 'COMPLETA'], ['sem', 'SEM ACESSÓRIOS'],
  ['completa_tocha', 'COMPLETA + TOCHA'], ['somente_tocha', 'SOMENTE TOCHA'],
  ['cabos', 'CABOS (+ e -)'], ['cinta', 'CINTA TIRACOLO'],
  ['escova', 'ESCOVA'], ['manual', 'MANUAL'],
  ['suporte', 'SUPORTE DA MÁSCARA'], ['mangueira', 'MANGUEIRA'],
  ['mascara', 'MÁSCARA SIMPLES'], ['arame', 'ARAME'],
];

// Situação do card → condição marcada na etiqueta
function condicaoDe(situacao) {
  const s = norm(situacao);
  if (!s) return null;
  if (/^or[c]?amento/.test(s) || /orcamento/.test(s)) return 'orcamento';
  if (/troca/.test(s)) return 'troca';
  if (/nova|estoque/.test(s)) return 'nova';
  if (/garantia/.test(s)) return 'garantia';
  return null;
}

// Acessórios do card → opções marcadas (o que não reconhecer vai em "Outros")
function acessoriosDe(lista) {
  const marcados = new Set();
  const outros = [];
  for (const bruto of lista) {
    const v = norm(bruto);
    if (!v) continue;
    let achou = true;
    if (/sem acess/.test(v)) marcados.add('sem');
    else if (/completa/.test(v) && /tocha/.test(v)) marcados.add('completa_tocha');
    else if (/completa/.test(v)) marcados.add('completa');
    else if (/somente tocha|^tocha/.test(v)) marcados.add('somente_tocha');
    else if (/cabo/.test(v)) marcados.add('cabos');
    else if (/cinta|tiracolo/.test(v)) marcados.add('cinta');
    else if (/escova/.test(v)) marcados.add('escova');
    else if (/manual/.test(v)) marcados.add('manual');
    else if (/suporte/.test(v)) marcados.add('suporte');
    else if (/mangueira/.test(v)) marcados.add('mangueira');
    else if (/mascara/.test(v)) marcados.add('mascara');
    else if (/arame/.test(v)) marcados.add('arame');
    else achou = false;
    if (!achou) outros.push(String(bruto).trim());
  }
  return { marcados, outros };
}

/** Link que o QR code abre: o card na tela (Orçamentos ou Garantia) */
export const linkDoCard = (tela, id) => `${window.location.origin}/${tela === 'garantia' ? 'logistica-cif' : 'pedidos-orcamento'}?card=${id}`;

/**
 * Abre a etiqueta para imprimir.
 * @param d { data, cliente, ns, modelo, situacao, acessorios (valor do campo), entreguePor, nf, link (QR) }
 */
/** Abre a janela da etiqueta já no clique (depois de uma espera o navegador bloqueia o pop-up) */
export function abrirJanelaEtiqueta() {
  const w = window.open('', '_blank', 'width=480,height=720');
  if (!w) alert('O navegador bloqueou a janela da etiqueta. Libere pop-ups para este site e tente de novo.');
  else w.document.write('<p style="font-family:Arial;padding:16px">Montando a etiqueta…</p>');
  return w;
}

export async function imprimirEtiquetaEntrada(d, janela = null) {
  const w = janela || abrirJanelaEtiqueta();
  if (!w) return;
  let qr = '';
  if (d.link) {
    try { qr = await QRCode.toDataURL(d.link, { margin: 0, width: 360, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }); }
    catch { qr = ''; }
  }
  const cond = condicaoDe(textoCampo(d.situacao));
  const listaAcess = valorLista(d.acessorios).flatMap(x => String(lerRegistro(x)?.descricao || x).split(/\s*[,;]\s*/));
  const { marcados, outros } = acessoriosDe(listaAcess);
  const caixa = (ok) => `<span class="cx">${ok ? '&#10005;' : ''}</span>`;
  const grade = (itens, ativo) => {
    let h = '';
    for (let i = 0; i < itens.length; i += 2) {
      const [a, b] = [itens[i], itens[i + 1]];
      h += `<div class="lin"><span class="op">${esc(a[1])}</span>${caixa(ativo(a[0]))}<span class="esp"></span>${b ? `${caixa(ativo(b[0]))}<span class="op">${esc(b[1])}</span>` : ''}</div>`;
    }
    return h;
  };
  const linha = (rotulo, valor, grande = false) =>
    `<div class="campo"><div class="rot">${esc(rotulo)}</div><div class="val${grande ? ' g' : ''}">${esc(valor || '')}&nbsp;</div></div>`;
  const logo = new URL(logoBoxer, window.location.href).href;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta de entrada ${esc(d.ns || '')}</title>
<style>
  @page { size: 100mm 150mm; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { width: 100mm; height: 150mm; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .et { width: 100mm; height: 150mm; padding: 5mm 5mm 4mm; display: flex; flex-direction: column; overflow: hidden; }
  .topo { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 1.2mm solid #000; padding-bottom: 2mm; }
  .marca { display: flex; align-items: center; gap: 2mm; }
  .marca img { width: 11mm; height: 11mm; filter: grayscale(1) contrast(5); }
  .marca b { font-size: 7mm; font-weight: 900; letter-spacing: -0.2mm; line-height: 1; }
  .marca small { display: block; font-size: 2.2mm; letter-spacing: 0.3mm; font-weight: 700; }
  .data { text-align: center; font-size: 4.2mm; font-weight: 700; }
  .data .rot { font-size: 2.3mm; font-weight: 400; border-top: 0.3mm solid #000; padding-top: 0.6mm; margin-top: 0.6mm; }
  .campo { margin-top: 3mm; }
  .rot { font-size: 2.6mm; text-transform: uppercase; }
  .val { font-size: 4mm; font-weight: 700; border-bottom: 0.3mm solid #000; min-height: 5.2mm; padding-bottom: 0.4mm; word-break: break-word; }
  .val.g { font-size: 5.2mm; font-family: 'Courier New', monospace; }
  .sec { display: flex; align-items: center; gap: 2mm; margin: 4mm 0 1.5mm; font-size: 2.8mm; font-weight: 700; }
  .sec::before, .sec::after { content: ''; flex: 1; border-top: 0.3mm solid #000; }
  .lin { display: flex; align-items: center; font-size: 3mm; height: 5.4mm; }
  .op { flex: 1; white-space: nowrap; }
  .lin .op:last-child { padding-left: 1.5mm; }
  .lin .op:first-child { text-align: left; }
  .esp { width: 3mm; }
  .cx { width: 3.6mm; height: 3.6mm; border: 0.35mm solid #000; display: inline-flex; align-items: center; justify-content: center; font-size: 3mm; font-weight: 900; flex: none; }
  .outros { font-size: 2.6mm; margin-top: 0.8mm; }
  .rod { margin-top: auto; display: flex; align-items: flex-end; gap: 3mm; }
  .rod .dados { flex: 1; min-width: 0; }
  .rod .campo { display: flex; align-items: flex-end; gap: 2mm; margin-top: 2mm; }
  .qr { width: 22mm; height: 22mm; flex: none; }
  .qr img { width: 22mm; height: 22mm; display: block; image-rendering: pixelated; }
  .rod .rot { white-space: nowrap; font-weight: 700; font-size: 2.8mm; }
  .rod .val { flex: 1; font-size: 3.6mm; }
</style></head><body>
<div class="et">
  <div class="topo">
    <div class="marca"><img src="${logo}" alt=""><div><b>boxer</b><small>TECNOLOGIA EM SOLDAS</small></div></div>
    <div class="data">${esc(dataBr(d.data)) || '&nbsp;&nbsp;/&nbsp;&nbsp;/&nbsp;&nbsp;'}<div class="rot">DATA DE ENTRADA</div></div>
  </div>
  ${linha('Cliente', d.cliente)}
  ${linha('Nº de entrada', d.ns, true)}
  ${linha('Modelo', d.modelo)}
  <div class="sec">CONDIÇÃO</div>
  ${grade(CONDICOES, k => k === cond)}
  <div class="sec">ACESSÓRIOS</div>
  ${grade(ACESSORIOS, k => marcados.has(k))}
  ${outros.length ? `<div class="outros"><b>Outros:</b> ${esc(outros.join(', '))}</div>` : ''}
  <div class="rod">
    <div class="dados">
      ${linha('Entregue por:', d.entreguePor)}
      ${linha('NF entrada:', d.nf)}
    </div>
    ${qr ? `<div class="qr"><img src="${qr}" alt="QR do card"></div>` : ''}
  </div>
</div>
<script>window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 300); };</script>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}

/**
 * Junta os dados da etiqueta a partir dos campos do card.
 * entrada: campos da fase Entrada [{ rotulo, valor }]; todos: todos os campos do card (para Modelo etc.)
 */
export function dadosEtiqueta({ entrada, todos = [], cliente, ns, modelo }) {
  const pega = (re) => campoPorRotulo(entrada, re) ?? campoPorRotulo(todos, re);
  return {
    data: textoCampo(pega(/^data (da |de )?entrada/)),
    cliente: cliente || textoCampo(pega(/^cliente/)),
    ns: ns || textoCampo(pega(/^ns\b|^n[ºo°]? ?de entrada/)),
    modelo: modelo || textoCampo(pega(/^modelo/)),
    situacao: pega(/^situa/),
    acessorios: pega(/^acess/),
    entreguePor: textoCampo(pega(/^entr\w*gue por/)),
    nf: textoCampo(pega(/^nf (de )?entrada|^nota fiscal de entrada|^remessa de conserto/)),
  };
}
