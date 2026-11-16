// ============================================================
// pages/operador/PainelLogistico.jsx — Painel Logístico na mesma tela do Boxer Operações
// ============================================================
// O painel é um arquivo próprio (public/painel/index.html) aberto aqui dentro, com o mesmo login:
// ele lê o token do Boxer Operações (mesmo endereço) e busca os dados em /api/painel/*.
// ============================================================
import { baseURL } from '../../services/api';

// O painel (mesmo endereço) lê daqui o endereço da API
if (typeof window !== 'undefined') window.__BOXER_API__ = baseURL;

export default function PainelLogistico() {
  return (
    <div className="-mx-3 sm:-mx-4 md:-mx-6 -my-4 sm:-my-6">
      <iframe
        title="Painel Logístico"
        src="/painel/index.html"
        allow="fullscreen"
        allowFullScreen
        className="block w-full border-0 bg-[var(--c-fundo)]"
        style={{ height: 'calc(100dvh - 4rem)' }}
      />
    </div>
  );
}
