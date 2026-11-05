// ============================================================
// App.jsx — Roteamento com proteção por perfil
// ============================================================
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import AppLayout from './components/layout/AppLayout';
import Login            from './pages/Login';
import TrocarSenha      from './pages/TrocarSenha';
import RedefinirSenha from './pages/RedefinirSenha';
import MinhaSenha       from './pages/MinhaSenha';
import Catalogo         from './pages/Catalogo';
import Revisao          from './pages/Revisao';
import Historico        from './pages/Historico';
import PainelOperador   from './pages/operador/PainelOperador';
import PainelAdmin      from './pages/operador/PainelAdmin';
import Estoque          from './pages/operador/Estoque';
import RegistroEntradas from './pages/operador/RegistroEntradas';
import MRP             from './pages/operador/MRP';
import Compras         from './pages/operador/Compras';
import NecessidadePecas from './pages/operador/NecessidadePecas';
import LojinhaBoxer from './pages/operador/LojinhaBoxer';
import LogisticaCif from './pages/operador/LogisticaCif';
import QuadroPersonalizado from './pages/operador/QuadroPersonalizado';
import Telas from './pages/operador/Telas';
import Inicio from './pages/Inicio';
import Databases from './pages/operador/Databases';
import Armazenamento from './pages/operador/Armazenamento';
import RecebimentoImportacao from './pages/operador/RecebimentoImportacao';
import PedidosOrcamento from './pages/operador/PedidosOrcamento';
import Inventario       from './pages/operador/Inventario';
import InventarioDetalhe from './pages/operador/InventarioDetalhe';
import InventarioContagem from './pages/operador/InventarioContagem';
import InventarioIndicadores from './pages/operador/InventarioIndicadores';
import { podeRecontar } from './utils/acessoInventario';
import { veTela } from './utils/telas';
import { Spinner } from './components/ui';

function RotaProtegida({ children }) {
  const { usuario, carregando } = useAuth();
  if (carregando) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={32} className="text-[var(--c-destaque)]" />
    </div>
  );
  if (!usuario) return <Navigate to="/login" replace />;
  // Redireciona para troca de senha obrigatória
  if (usuario.trocar_senha) return <Navigate to="/trocar-senha" replace />;
  return <AppLayout>{children}</AppLayout>;
}

// Tela liberada para o usuário (perfil + telas escolhidas no cadastro do colaborador)
function RotaTela({ tela, recontagem, children }) {
  const { usuario, carregando } = useAuth();
  if (carregando) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={32} className="text-[var(--c-destaque)]" />
    </div>
  );
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.trocar_senha) return <Navigate to="/trocar-senha" replace />;
  if (!veTela(usuario, tela)) return <Navigate to="/inicio" replace />;
  if (recontagem && !podeRecontar(usuario)) return <Navigate to="/inventario" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/trocar-senha" element={<TrocarSenha />} />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            <Route path="/catalogo" element={
              <RotaTela tela="catalogo"><Catalogo /></RotaTela>
            } />
            <Route path="/minha-senha" element={
              <RotaProtegida><MinhaSenha /></RotaProtegida>
            } />
            <Route path="/revisao" element={
              <RotaTela tela="catalogo"><Revisao /></RotaTela>
            } />
            <Route path="/historico" element={
              <RotaTela tela="historico"><Historico /></RotaTela>
            } />
            <Route path="/operador" element={
              <RotaTela tela="operador"><PainelOperador /></RotaTela>
            } />
            <Route path="/entradas" element={
              <RotaTela tela="entradas"><RegistroEntradas /></RotaTela>
            } />
            <Route path="/estoque" element={
              <RotaTela tela="estoque"><Estoque /></RotaTela>
            } />
            <Route path="/admin" element={
              <RotaTela tela="admin"><PainelAdmin /></RotaTela>
            } />
            <Route path="/mrp" element={
              <RotaTela tela="mrp"><MRP /></RotaTela>
            } />
            <Route path="/compras" element={
              <RotaTela tela="compras"><Compras /></RotaTela>
            } />
            <Route path="/recebimento-importacao" element={
              <RotaTela tela="recebimento_importacao"><RecebimentoImportacao /></RotaTela>
            } />
            <Route path="/armazenamento" element={
              <RotaTela tela="armazenamento"><Armazenamento /></RotaTela>
            } />
            <Route path="/databases" element={
              <RotaTela tela="databases"><Databases /></RotaTela>
            } />
            <Route path="/logistica-cif" element={
              <RotaTela tela="logistica_cif"><LogisticaCif /></RotaTela>
            } />
            <Route path="/quadro/:id" element={
              <RotaProtegida><QuadroPersonalizado /></RotaProtegida>
            } />
            <Route path="/telas" element={
              <RotaTela tela="admin"><Telas /></RotaTela>
            } />
            <Route path="/lojinha" element={
              <RotaTela tela="lojinha"><LojinhaBoxer /></RotaTela>
            } />
            <Route path="/necessidade-pecas" element={
              <RotaTela tela="necessidade_pecas"><NecessidadePecas /></RotaTela>
            } />
            <Route path="/pedidos-orcamento" element={
              <RotaTela tela="orcamentos"><PedidosOrcamento /></RotaTela>
            } />
            <Route path="/inventario" element={
              <RotaTela tela="inventario"><Inventario /></RotaTela>
            } />
            <Route path="/inventario/indicadores" element={
              <RotaTela tela="inventario"><InventarioIndicadores /></RotaTela>
            } />
            <Route path="/inventario/:id" element={
              <RotaTela tela="inventario"><InventarioDetalhe /></RotaTela>
            } />
            <Route path="/inventario/:id/contar" element={
              <RotaTela tela="inventario"><InventarioContagem /></RotaTela>
            } />
            <Route path="/inventario/:id/recontar" element={
              <RotaTela tela="inventario" recontagem><InventarioContagem key="recontagem" modo="recontagem" /></RotaTela>
            } />
            <Route path="/inicio" element={<RotaProtegida><Inicio /></RotaProtegida>} />
            <Route path="/"  element={<Navigate to="/inicio" replace />} />
            <Route path="*"  element={<Navigate to="/inicio" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
