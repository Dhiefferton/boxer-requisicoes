// ============================================================
// pages/operador/Estoque.jsx — Estoque (cadastro e saldo dos produtos)
// ============================================================
// Antes era a aba "Estoque" do Painel Administrativo; agora tem tela própria.
import { AbaEstoque } from './PainelAdmin';

export default function Estoque() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[var(--c-texto)]">Estoque</h1>
        <p className="text-sm text-[var(--c-suave)] mt-0.5">Cadastro de produtos, saldo e importação por planilha</p>
      </div>
      <AbaEstoque />
    </div>
  );
}
