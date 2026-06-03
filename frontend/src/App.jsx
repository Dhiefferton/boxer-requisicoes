// ============================================================
// App.jsx — Roteamento com proteção por perfil
// ============================================================
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import AppLayout from './components/layout/AppLayout';
import Login            from './pages/Login';
import Catalogo         from './pages/Catalogo';
import Revisao          from './pages/Revisao';
import Historico        from './pages/Historico';
import PainelOperador   from './pages/operador/PainelOperador';
import PainelAdmin      from './pages/operador/PainelAdmin';
import RegistroEntradas from './pages/operador/RegistroEntradas';
import { Spinner } from './components/ui';

function RotaProtegida({ children }) {
  const { usuario, carregando } = useAuth();
  if (carregando) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={32} className="text-[#4f6ef7]" />
    </div>
  );
  if (!usuario) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function RotaPerfil({ perfis, children }) {
  const { usuario, carregando } = useAuth();
  if (carregando) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={32} className="text-[#4f6ef7]" />
    </div>
  );
  if (!usuario) return <Navigate to="/login" replace />;
  if (!perfis.includes(usuario.perfil)) return <Navigate to="/catalogo" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/catalogo" element={
              <RotaProtegida><Catalogo /></RotaProtegida>
            } />
            <Route path="/revisao" element={
              <RotaProtegida><Revisao /></RotaProtegida>
            } />
            <Route path="/historico" element={
              <RotaProtegida><Historico /></RotaProtegida>
            } />
            <Route path="/operador" element={
              <RotaPerfil perfis={['operador', 'admin']}><PainelOperador /></RotaPerfil>
            } />
            <Route path="/entradas" element={
              <RotaPerfil perfis={['operador', 'admin']}><RegistroEntradas /></RotaPerfil>
            } />
            <Route path="/admin" element={
              <RotaPerfil perfis={['admin']}><PainelAdmin /></RotaPerfil>
            } />
            <Route path="/"  element={<Navigate to="/catalogo" replace />} />
            <Route path="*"  element={<Navigate to="/catalogo" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
