// ============================================================
// components/operador/ArquivosNota.jsx — XML e PDF (DANFE) da nota fiscal do Zen
// ============================================================
// Botões para abrir o PDF (DANFE) e baixar o XML da nota de saída do card.
// O arquivo vem do Zen pelo backend (base + '/nf/pdf' | '/nf/xml'); só existe
// depois que a nota foi faturada (autorizada) — antes disso mostra o aviso.
// ============================================================
import { useState } from 'react';
import { FileText, FileCode } from 'lucide-react';
import api from '../../services/api';
import { Spinner } from '../ui';

async function erroDoBlob(e) {
  const d = e.response?.data;
  if (d instanceof Blob) { try { return JSON.parse(await d.text())?.erro; } catch { /* sem texto */ } }
  return d?.erro || null;
}

export default function ArquivosNota({ base, className = '' }) {
  const [baixando, setBaixando] = useState('');
  const [erro, setErro] = useState('');
  async function abrir(tipo, e) {
    e?.stopPropagation();
    setBaixando(tipo); setErro('');
    // PDF abre numa aba nova: abre a aba já no clique (o navegador não bloqueia)
    const aba = tipo === 'pdf' ? window.open('', '_blank') : null;
    try {
      const r = await api.get(`${base}/nf/${tipo}`, { responseType: 'blob', timeout: 60000 });
      const nome = (/filename="([^"]+)"/.exec(r.headers['content-disposition'] || '') || [])[1] || `nota.${tipo}`;
      const url = URL.createObjectURL(r.data);
      if (aba) aba.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      aba?.close();
      setErro((await erroDoBlob(err)) || 'Não consegui trazer o arquivo da nota.');
    } finally { setBaixando(''); }
  }
  const botao = 'inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--c-borda)] text-[11px] font-semibold text-[var(--c-texto)] hover:border-[var(--c-destaque)] disabled:opacity-50';
  return (
    <div className={className} onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={e => abrir('pdf', e)} disabled={!!baixando} className={botao} title="Abrir o PDF (DANFE) da nota">
          {baixando === 'pdf' ? <Spinner size={11} /> : <FileText size={12} />} PDF (DANFE)
        </button>
        <button type="button" onClick={e => abrir('xml', e)} disabled={!!baixando} className={botao} title="Baixar o XML da nota">
          {baixando === 'xml' ? <Spinner size={11} /> : <FileCode size={12} />} XML
        </button>
      </div>
      {erro && <p className="text-[11px] text-amber-400 mt-1">{erro}</p>}
    </div>
  );
}
