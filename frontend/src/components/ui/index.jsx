// components/ui/index.jsx — Componentes base reutilizáveis

export function Button({ children, variant = 'primary', size = 'md', loading, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary:  'bg-[#4f6ef7] hover:bg-[#3d5ce5] text-white',
    secondary:'bg-[#2e3347] hover:bg-[#383d54] text-[#e8eaf0]',
    ghost:    'bg-transparent hover:bg-[#2e3347] text-[#8b91a8] hover:text-[#e8eaf0]',
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
      {label && <label className="text-sm text-[#8b91a8] font-medium">{label}</label>}
      <input className={`bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-4 py-2.5 placeholder:text-[#8b91a8] text-sm focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30 transition-colors ${error ? 'border-red-500' : ''} ${className}`} {...props} />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm text-[#8b91a8] font-medium">{label}</label>}
      <textarea rows={3} className={`bg-[#2e3347] border border-[#2e3347] text-[#e8eaf0] rounded-xl px-4 py-2.5 placeholder:text-[#8b91a8] text-sm resize-none focus:outline-none focus:border-[#4f6ef7] focus:ring-1 focus:ring-[#4f6ef7]/30 transition-colors ${error ? 'border-red-500' : ''} ${className}`} {...props} />
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
  return <div className={`bg-[#1a1d27] border border-[#2e3347] rounded-2xl ${className}`} {...props}>{children}</div>;
}

export function Empty({ icon: Icon, titulo, descricao }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
      {Icon && <Icon size={40} className="text-[#2e3347]" strokeWidth={1.5} />}
      <p className="text-[#e8eaf0] font-medium">{titulo}</p>
      {descricao && <p className="text-sm text-[#8b91a8] max-w-xs">{descricao}</p>}
    </div>
  );
}