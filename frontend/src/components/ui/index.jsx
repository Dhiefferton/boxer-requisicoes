// components/ui/index.jsx — Componentes base reutilizáveis

export function Button({ children, variant = 'primary', size = 'md', loading, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary:  'bg-[var(--c-destaque)] hover:bg-[var(--c-destaque-h)] text-white',
    secondary:'bg-[var(--c-borda)] hover:bg-[var(--c-borda-forte)] text-[var(--c-texto)]',
    ghost:    'bg-transparent hover:bg-[var(--c-borda)] text-[var(--c-suave)] hover:text-[var(--c-texto)]',
    danger:   'bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444]',
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function StockBadge({ status }) {
  const map = {
    disponivel:   { label: 'Disponível',    color: 'bg-green-500/15 text-green-400' },
    baixo_estoque:{ label: 'Baixo estoque', color: 'bg-amber-500/15 text-amber-400' },
    sem_estoque:  { label: 'Sem estoque',   color: 'bg-red-500/15 text-red-400'     },
  };
  const { label, color } = map[status] || map.disponivel;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'disponivel' ? 'bg-green-400' : status === 'baixo_estoque' ? 'bg-amber-400' : 'bg-red-400'}`} />
      {label}
    </span>
  );
}

export function StatusBadge({ status }) {
  const map = {
    solicitado:   { label: 'Solicitado',    color: 'bg-blue-500/15 text-blue-400'   },
    em_separacao: { label: 'Em separação',  color: 'bg-amber-500/15 text-amber-400' },
    separado:     { label: 'Separado',      color: 'bg-purple-500/15 text-purple-400'},
    entregue:     { label: 'Entregue',      color: 'bg-green-500/15 text-green-400' },
    cancelado:    { label: 'Cancelado',     color: 'bg-red-500/15 text-red-400'     },
  };
  const { label, color } = map[status] || { label: status, color: 'bg-gray-500/15 text-gray-400' };
  return <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${color}`}>{label}</span>;
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm text-[var(--c-suave)] font-medium">{label}</label>}
      <input className={`bg-[var(--c-borda)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-4 py-2.5 placeholder:text-[var(--c-suave)] text-sm focus:outline-none focus:border-[var(--c-destaque)] focus:ring-1 focus:ring-[var(--c-destaque)]/30 transition-colors ${error ? 'border-red-500' : ''} ${className}`} {...props} />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm text-[var(--c-suave)] font-medium">{label}</label>}
      <textarea rows={3} className={`bg-[var(--c-borda)] border border-[var(--c-borda)] text-[var(--c-texto)] rounded-xl px-4 py-2.5 placeholder:text-[var(--c-suave)] text-sm resize-none focus:outline-none focus:border-[var(--c-destaque)] focus:ring-1 focus:ring-[var(--c-destaque)]/30 transition-colors ${error ? 'border-red-500' : ''} ${className}`} {...props} />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function Spinner({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function Card({ children, className = '', ...props }) {
  return <div className={`bg-[var(--c-superficie)] border border-[var(--c-borda)] rounded-2xl ${className}`} {...props}>{children}</div>;
}

export function Empty({ icon: Icon, titulo, descricao }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
      {Icon && <Icon size={40} className="text-[var(--c-borda)]" strokeWidth={1.5} />}
      <p className="text-[var(--c-texto)] font-medium">{titulo}</p>
      {descricao && <p className="text-sm text-[var(--c-suave)] max-w-xs">{descricao}</p>}
    </div>
  );
}