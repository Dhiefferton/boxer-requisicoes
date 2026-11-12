// Frotas dentro do Boxer Operações (rota /frotas/*): login único, barra do topo do Operações e visual do Operações.
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RequireAuth } from './components/RequireAuth'
import { FrotasLayout } from './layout/FrotasLayout'
import { Dashboard } from './pages/Dashboard'
import { Agenda } from './pages/Agenda'
import { Viagens } from './pages/Viagens'
import { CentroOperacoes } from './pages/CentroOperacoes'
import { Veiculos } from './pages/Veiculos'
import { Motoristas } from './pages/Motoristas'
import { Combustivel } from './pages/Combustivel'
import { CustoViagem } from './pages/CustoViagem'
import { Manutencao } from './pages/Manutencao'
import { Documentos } from './pages/Documentos'
import { Checklist } from './pages/Checklist'
import { Relatorios } from './pages/Relatorios'
import { MinhaViagem } from './pages/MinhaViagem'

export default function FrotasApp() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route element={<FrotasLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="agenda" element={<Agenda />} />
                <Route path="viagens" element={<Viagens />} />
                <Route path="operacoes" element={<CentroOperacoes />} />
                <Route path="veiculos" element={<Veiculos />} />
                <Route path="motoristas" element={<Motoristas />} />
                <Route path="combustivel" element={<Combustivel />} />
                <Route path="custo-viagem" element={<CustoViagem />} />
                <Route path="manutencao" element={<Manutencao />} />
                <Route path="documentos" element={<Documentos />} />
                <Route path="checklist" element={<Checklist />} />
                <Route path="relatorios" element={<Relatorios />} />
                {/* Tela do motorista (Minha viagem), trazida do Boxer Frotas */}
                <Route path="motorista" element={<MinhaViagem />} />
                {/* Usuários do Frotas saíram: o perfil no Frotas é escolhido em Admin › Usuários do Boxer Operações */}
                <Route path="usuarios" element={<Navigate to="/admin" replace />} />
                {/* Configurações do Frotas saíram: perfil, senha e tema são os do Boxer Operações (menu do avatar) */}
                <Route path="configuracoes" element={<Navigate to="/minha-senha" replace />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/frotas" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
