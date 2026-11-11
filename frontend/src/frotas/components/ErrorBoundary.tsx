import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  erro: Error | null
}

/**
 * Rede de segurança para qualquer erro de renderização não tratado.
 *
 * Sem isso, um erro em qualquer componente derruba a árvore inteira do
 * React e a pessoa fica olhando só para o fundo escuro da página (o
 * `dark:bg-navy-950` do body) — o que aparece como "tela toda preta",
 * sem nenhuma mensagem, sem botão, sem nada para fazer além de fechar o
 * app. Com o ErrorBoundary, em vez disso aparece esta tela de
 * recuperação, com um botão para recarregar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: { componentStack: string }) {
    console.error('Erro não tratado capturado pelo ErrorBoundary:', erro, info.componentStack)
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy-950 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <AlertTriangle size={24} strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-base font-semibold text-white">Algo deu errado</p>
            <p className="mt-1 max-w-xs text-sm text-slate-400">
              Tivemos um problema ao carregar esta tela. Recarregue para tentar novamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <RefreshCw size={16} />
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
