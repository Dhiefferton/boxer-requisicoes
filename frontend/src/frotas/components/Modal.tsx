import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  hideClose = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Esconde o "X" de fechar — usado para modais obrigatórios (ex.: troca de senha no primeiro acesso). */
  hideClose?: boolean
}) {
  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        className={cn(
          'flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white dark:bg-navy-800 shadow-popover sm:rounded-2xl',
          sizes[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          {!hideClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  tone = 'default',}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  tone?: 'default' | 'danger'
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition',
              tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
    </Modal>
  )
}
