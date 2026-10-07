// Botão sol/lua que alterna entre modo claro e escuro
import { Sun, Moon } from 'lucide-react';
import { useTema } from '../../context/TemaContext';

export default function BotaoTema({ className = '' }) {
  const { tema, alternarTema } = useTema();
  const claro = tema === 'claro';
  return (
    <button
      type="button"
      onClick={alternarTema}
      title={claro ? 'Mudar para modo escuro' : 'Mudar para modo claro'}
      aria-label={claro ? 'Mudar para modo escuro' : 'Mudar para modo claro'}
      className={`p-2 rounded-xl text-[var(--c-suave)] hover:text-[var(--c-texto)] hover:bg-[var(--c-borda)] transition-colors ${className}`}
    >
      {claro ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
