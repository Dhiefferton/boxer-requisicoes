import type { ReactNode } from 'react'

export interface Column<T> {
  header: string
  accessor: (row: T) => ReactNode
  className?: string
}

export function Table<T extends { id: string }>({
  columns,
  rows,
  renderMobileCard,
  onRowClick,
}: {
  columns: Column<T>[]
  rows: T[]
  renderMobileCard: (row: T) => ReactNode
  onRowClick?: (row: T) => void
}) {
  return (
    <>
      {/* Desktop / tablet: tabela com scroll horizontal apenas se necessário */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-800 shadow-card md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-navy-900/60">
              {columns.map((col, i) => (
                <th key={i} className={`px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 ${col.className ?? ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-slate-50 dark:border-slate-800/60 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-navy-950' : ''}`}
              >
                {columns.map((col, i) => (
                  <td key={i} className={`px-4 py-3 align-middle text-slate-700 dark:text-slate-200 ${col.className ?? ''}`}>
                    {col.accessor(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: lista de cards, sem tabela */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row.id} onClick={() => onRowClick?.(row)}>
            {renderMobileCard(row)}
          </div>
        ))}
      </div>
    </>
  )
}
