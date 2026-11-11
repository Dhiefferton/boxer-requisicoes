import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader } from '../components/Card'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-navy-800 shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function Configuracoes() {
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifPush, setNotifPush] = useState(true)
  const [alertaDocumentos, setAlertaDocumentos] = useState(true)
  const { show } = useToast()
  const { perfil, user: authUser } = useAuth()
  const nome = perfil?.nome ?? authUser?.email ?? 'Usuário'
  const email = perfil?.email || authUser?.email || ''
  const cargo = perfil?.cargo ?? ''

  return (
    <div className="max-w-2xl">
      <PageHeader title="Configurações" subtitle="Preferências da conta e do sistema" />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Perfil" subtitle="Suas informações de acesso" />
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-900 text-lg font-bold text-white">
              {nome.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{nome}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{email}</p>
              {cargo && <p className="text-xs text-slate-400 dark:text-slate-500">{cargo}</p>}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Notificações" subtitle="Como você quer ser avisado" />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Notificações por e-mail</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Receba alertas críticos por e-mail</p>
              </div>
              <Toggle checked={notifEmail} onChange={setNotifEmail} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Notificações push</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Alertas em tempo real no navegador/app</p>
              </div>
              <Toggle checked={notifPush} onChange={setNotifPush} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Vencimento de documentos</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Avisar 30 dias antes do vencimento</p>
              </div>
              <Toggle checked={alertaDocumentos} onChange={setAlertaDocumentos} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Aparência" subtitle="Personalize a interface" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O tema (claro/escuro) pode ser alternado pelo ícone no cabeçalho, em qualquer tela.
          </p>
        </Card>

        <div className="flex justify-end">
          <button
            onClick={() => show('Preferências salvas com sucesso.')}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  )
}
