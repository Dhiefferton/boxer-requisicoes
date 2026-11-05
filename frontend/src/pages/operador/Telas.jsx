// ============================================================
// pages/operador/Telas.jsx — Criar telas novas e renomear telas (só admin)
// ============================================================
// Telas do sistema: muda o nome que aparece no menu, no título e em
// Admin > Usuários (o funcionamento não muda). Telas criadas: quadros de cards
// (colunas e campos na engrenagem da própria tela). Quem pode ver/mexer em cada
// tela criada é escolhido em Admin > Usuários (o padrão é só o admin).
// ============================================================
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LayoutGrid, Plus, Save, ExternalLink, RotateCcw, Check } from 'lucide-react';
import { telasService } from '../../services/api';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { TELAS } from '../../utils/telas';
import { recarregarTelas } from '../../utils/nomesTelas';

const inp = 'w-full bg-[var(--c-fundo)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[var(--c-destaque)]';

export default function Telas() {
  const { usuario } = useAuth();
  const [dados, setDados] = useState(null);
  const [nomes, setNomes] = useState({});
  const [nomesQ, setNomesQ] = useState({});
  const [novo, setNovo] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState(null);

  async function carregar() {
    const d = await recarregarTelas();
    setDados(d); setNomes(d.nomes || {});
    setNomesQ(Object.fromEntries((d.quadros || []).map(q => [q.id, q.nome])));
  }
  useEffect(() => { carregar(); }, []);
  if (usuario?.perfil !== 'admin') return <Navigate to="/catalogo" replace />;
  if (!dados) return <div className="flex justify-center py-16"><Spinner className="text-[var(--c-destaque)]" /></div>;

  const aviso = (ok, txt) => { setMsg({ ok, txt }); setTimeout(() => setMsg(null), 4000); };
  async function salvarNomes() {
    setOcupado('nomes');
    try { await telasService.salvarNomes(nomes); await carregar(); aviso(true, 'Nomes salvos. O menu já mostra os nomes novos.'); }
    catch (e) { aviso(false, e.response?.data?.erro || 'Erro ao salvar.'); }
    finally { setOcupado(''); }
  }
  async function criar() {
    if (!novo.trim()) return;
    setOcupado('criar');
    try { await telasService.criarQuadro(novo.trim()); setNovo(''); await carregar(); aviso(true, 'Tela criada. Abra e configure as colunas e campos na engrenagem.'); }
    catch (e) { aviso(false, e.response?.data?.erro || 'Erro ao criar.'); }
    finally { setOcupado(''); }
  }
  async function editarQuadro(q, mudanca) {
    setOcupado(`q${q.id}`);
    try { await telasService.editarQuadro(q.id, mudanca); await carregar(); aviso(true, 'Tela atualizada.'); }
    catch (e) { aviso(false, e.response?.data?.erro || 'Erro ao salvar.'); }
    finally { setOcupado(''); }
  }

  const quadros = dados.quadros || [];
  // Telas que podem mandar cópias: Orçamentos, Lojinha, Garantia e as outras telas criadas
  const origensCopia = (q) => [
    ...['orcamentos', 'lojinha', 'logistica_cif'].map(k => ({ chave: k, nome: dados.nomes?.[k] || TELAS.find(t => t.chave === k)?.nome || k })),
    ...quadros.filter(o => o.id !== q.id && o.ativo).map(o => ({ chave: `quadro_${o.id}`, nome: o.nome })),
  ];
  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-lg font-bold text-[var(--c-texto)] flex items-center gap-2"><LayoutGrid size={18} /> Telas</h1>
        <p className="text-sm text-[var(--c-suave)] mt-0.5">Crie telas novas (quadros de cards) e mude o nome das telas do sistema.</p>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.txt}</p>}

      {/* Telas criadas */}
      <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-3">
        <p className="text-sm font-bold text-[var(--c-texto)]">Telas criadas</p>
        <p className="text-[11px] text-[var(--c-suave)]">
          Cada tela é um quadro de cards, como a Lojinha: crie as colunas e os campos (inclusive o formulário do "Novo card") na engrenagem da tela.
          Quem pode ver ou mexer é escolhido em Admin › Usuários — no começo, só o admin vê.
        </p>
        <div className="flex gap-2">
          <input value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => e.key === 'Enter' && criar()} placeholder="Nome da tela nova (ex.: Garantias)" className={inp} />
          <button onClick={criar} disabled={!novo.trim() || ocupado === 'criar'}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
            {ocupado === 'criar' ? <Spinner size={12} /> : <Plus size={12} />} Criar tela
          </button>
        </div>
        {!quadros.length && <p className="text-xs text-[var(--c-suave)]">Nenhuma tela criada ainda.</p>}
        <div className="divide-y divide-[var(--c-borda)]">
          {quadros.map(q => (
            <div key={q.id} className={`py-2 space-y-1.5 ${q.ativo ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-2">
              <input value={nomesQ[q.id] ?? ''} onChange={e => setNomesQ(s => ({ ...s, [q.id]: e.target.value }))} className={inp} />
              {nomesQ[q.id]?.trim() && nomesQ[q.id].trim() !== q.nome && (
                <button onClick={() => editarQuadro(q, { nome: nomesQ[q.id] })} disabled={ocupado === `q${q.id}`} title="Salvar nome"
                  className="shrink-0 p-1.5 rounded-lg bg-[var(--c-destaque)] text-white disabled:opacity-40"><Check size={12} /></button>
              )}
              {q.ativo && (
                <Link to={`/quadro/${q.id}`} title="Abrir tela" className="shrink-0 p-1.5 rounded-lg text-[var(--c-suave)] hover:text-[var(--c-destaque)]"><ExternalLink size={13} /></Link>
              )}
              <button onClick={() => (q.ativo ? confirm(`Desativar a tela "${q.nome}"? Ela some do menu (os cards ficam guardados e dá para reativar).`) : true) && editarQuadro(q, { ativo: !q.ativo })}
                disabled={ocupado === `q${q.id}`}
                className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-semibold border ${q.ativo ? 'border-[var(--c-borda)] text-[var(--c-suave)] hover:text-red-400' : 'border-green-500/40 text-green-400'}`}>
                {q.ativo ? 'Desativar' : 'Reativar'}
              </button>
              </div>
              {/* De quais telas esta tela recebe uma cópia dos cards que chegam em "Liberação de faturamento" */}
              <div className="flex items-center gap-1.5 flex-wrap pl-1">
                <span className="text-[11px] text-[var(--c-suave)] mr-1">Copiar cards que chegam em <b className="text-[var(--c-texto)]">Liberação de faturamento</b> de:</span>
                {origensCopia(q).map(o => {
                  const marcado = (q.copiar_de || []).includes(o.chave);
                  return (
                    <button key={o.chave} disabled={ocupado === `q${q.id}`}
                      onClick={() => editarQuadro(q, { copiar_de: marcado ? q.copiar_de.filter(k => k !== o.chave) : [...(q.copiar_de || []), o.chave] })}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border disabled:opacity-40 ${marcado ? 'border-[var(--c-destaque)] bg-[var(--c-destaque)]/15 text-[var(--c-destaque-claro)]' : 'border-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]'}`}>
                      {marcado && <Check size={10} />}{o.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Telas do sistema */}
      <div className="rounded-xl border border-[var(--c-borda)] bg-[var(--c-superficie)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-[var(--c-texto)] flex-1">Nomes das telas do sistema</p>
          <button onClick={salvarNomes} disabled={ocupado === 'nomes'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-destaque)] text-white disabled:opacity-40">
            {ocupado === 'nomes' ? <Spinner size={12} /> : <Save size={12} />} Salvar nomes
          </button>
        </div>
        <p className="text-[11px] text-[var(--c-suave)]">Muda o nome no menu, no título da tela e em Admin › Usuários. Em branco = nome original.</p>
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
          {TELAS.map(t => (
            <label key={t.chave} className="text-[11px] text-[var(--c-suave)]">
              <span className="flex items-center gap-1">{t.nome}
                {nomes[t.chave] && <button type="button" title="Voltar ao nome original" onClick={() => setNomes(n => { const x = { ...n }; delete x[t.chave]; return x; })}
                  className="text-[var(--c-suave)] hover:text-[var(--c-texto)]"><RotateCcw size={10} /></button>}
              </span>
              <input value={nomes[t.chave] || ''} onChange={e => setNomes(n => ({ ...n, [t.chave]: e.target.value }))} placeholder={t.nome} className={`${inp} mt-1`} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
