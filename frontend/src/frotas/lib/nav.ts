import {
  LayoutDashboard,
  CalendarDays,
  Route,
  Radar,
  Truck,
  UserRound,
  Fuel,
  Calculator,
  Wrench,
  FileText,
  ClipboardCheck,
  BarChart3,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { Usuario } from '../types'

/** Perfis que navegam pelo painel de gestão (menu lateral). O motorista tem
 *  a própria tela (/motorista) e nunca usa este menu. */
export type PerfilPainel = Exclude<Usuario['perfil'], 'motorista'>

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Perfis que podem ver/acessar este item. Omitido = todos os perfis do
   *  painel (gestor, operador, operador_comex) podem acessar. */
  perfis?: PerfilPainel[]
  /** Restringe ainda mais o item a e-mails específicos, mesmo dentro de um
   *  perfil já autorizado em `perfis` (inclusive gestor) — ex.: uma tela que
   *  só um gestor específico deve ver, não todos os gestores. Omitido = todo
   *  mundo autorizado em `perfis` pode ver. */
  emails?: string[]
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, perfis: ['gestor', 'operador'] },
  { label: 'Agenda', path: '/agenda', icon: CalendarDays, perfis: ['gestor', 'operador', 'operador_comex'] },
  { label: 'Viagens', path: '/viagens', icon: Route, perfis: ['gestor', 'operador', 'operador_comex'] },
  { label: 'Centro de Operações', path: '/operacoes', icon: Radar, perfis: ['gestor'] },
  { label: 'Veículos', path: '/veiculos', icon: Truck, perfis: ['gestor', 'operador', 'operador_comex'] },
  { label: 'Motoristas', path: '/motoristas', icon: UserRound, perfis: ['gestor'] },
  { label: 'Combustível', path: '/combustivel', icon: Fuel, perfis: ['gestor'] },
  { label: 'Custo de Viagem', path: '/custo-viagem', icon: Calculator, perfis: ['gestor'] },
  { label: 'Manutenção', path: '/manutencao', icon: Wrench, perfis: ['gestor'] },
  { label: 'Documentos', path: '/documentos', icon: FileText, perfis: ['gestor'] },
  { label: 'Checklist', path: '/checklist', icon: ClipboardCheck, perfis: ['gestor'] },
  { label: 'Relatórios', path: '/relatorios', icon: BarChart3, perfis: ['gestor', 'operador'] },
  { label: 'Usuários', path: '/usuarios', icon: Users, perfis: ['gestor'] },
  { label: 'Configurações', path: '/configuracoes', icon: Settings, perfis: ['gestor', 'operador'] },
]

function itemLiberado(item: NavItem, perfil: PerfilPainel, email?: string) {
  if (item.perfis && !item.perfis.includes(perfil)) return false
  if (item.emails && (!email || !item.emails.includes(email))) return false
  return true
}

/** Itens do menu lateral visíveis para um perfil (e, quando o item restringe
 *  por e-mail, só para o e-mail liberado — mesmo um gestor não vê um item
 *  restrito a outro e-mail). */
export function navItemsParaPerfil(perfil: PerfilPainel, email?: string) {
  return navItems.filter((item) => itemLiberado(item, perfil, email))
}

/** Se um perfil (e e-mail) pode acessar uma rota do painel (mesmo digitando a
 *  URL direto). Gestor sempre pode, exceto num item restrito por `emails` a
 *  outra pessoa. */
export function rotaPermitida(perfil: PerfilPainel, path: string, email?: string) {
  const item = navItems.find((i) => i.path === path)
  // Rota sem entrada no menu (ex.: uma tela sem link direto) não é bloqueada aqui.
  if (!item) return true
  if (item.emails && (!email || !item.emails.includes(email))) return false
  if (perfil === 'gestor') return true
  return !item.perfis || item.perfis.includes(perfil)
}

/** Primeira rota do menu que o perfil (e e-mail) pode acessar — usada para
 *  redirecionar quando ele tenta abrir uma tela que não é dele. */
export function primeiraRotaPermitida(perfil: PerfilPainel, email?: string) {
  return navItemsParaPerfil(perfil, email)[0]?.path ?? '/'
}
