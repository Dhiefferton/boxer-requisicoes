import type { AgendaItem, ReservaTipo } from '../types'

export const DIA_INICIO = 6 // 06:00
export const DIA_FIM = 20 // 20:00

/** Opções fixas de título pra uma reserva/viagem — em vez de texto livre, pra
 *  o sistema reconhecer o cliente de forma consistente (sem grafias
 *  diferentes pro mesmo cliente). Usado no formulário "Nova reserva" tanto na
 *  Agenda do gestor quanto na tela do motorista. */
export const TITULOS_RESERVA = [
  'Coleta no Libra',
  'Coleta no Embragen',
  'Entrega de pedidos da Dutra',
  'Entrega de pedidos da Gurgel',
  'Entrega de pedidos da S.M.F',
] as const

export const TIPO_STYLE: Record<ReservaTipo, { bg: string; text: string; label: string }> = {
  // "Viagem" e "Reserva" são a mesma coisa pro usuário (os dois criam a viagem
  // na aba Viagens) — aparecem como um tipo só, "Reserva / Viagem". O banco
  // ainda aceita os dois valores (itens antigos continuam válidos); novos
  // itens são sempre salvos como 'reserva'.
  viagem: { bg: 'bg-blue-500', text: 'text-white', label: 'Reserva / Viagem' },
  reserva: { bg: 'bg-blue-500', text: 'text-white', label: 'Reserva / Viagem' },
  retorno: { bg: 'bg-emerald-500', text: 'text-white', label: 'Disponível / Retorno' },
  manutencao: { bg: 'bg-orange-500', text: 'text-white', label: 'Manutenção' },
  bloqueio: { bg: 'bg-red-500', text: 'text-white', label: 'Bloqueado' },
}

export function mesmodia(iso: string, dia: Date) {
  const d = new Date(iso)
  return d.toDateString() === dia.toDateString()
}

export function itensDoDia(itens: AgendaItem[], veiculoId: string, dia: Date) {
  return itens.filter((i) => {
    if (i.veiculoId !== veiculoId) return false
    const inicio = new Date(i.inicio)
    const fim = new Date(i.fim)
    const diaInicio = new Date(dia)
    diaInicio.setHours(0, 0, 0, 0)
    const diaFim = new Date(dia)
    diaFim.setHours(23, 59, 59, 999)
    return inicio <= diaFim && fim >= diaInicio
  })
}

export function posicaoBloco(item: AgendaItem, dia: Date) {
  const diaInicio = new Date(dia)
  diaInicio.setHours(DIA_INICIO, 0, 0, 0)
  const diaFim = new Date(dia)
  diaFim.setHours(DIA_FIM, 0, 0, 0)
  const totalMin = (DIA_FIM - DIA_INICIO) * 60

  const inicio = new Date(Math.max(new Date(item.inicio).getTime(), diaInicio.getTime()))
  const fim = new Date(Math.min(new Date(item.fim).getTime(), diaFim.getTime()))

  const startMin = Math.max(0, (inicio.getTime() - diaInicio.getTime()) / 60000)
  const endMin = Math.min(totalMin, (fim.getTime() - diaInicio.getTime()) / 60000)
  const widthMin = Math.max(endMin - startMin, 30)

  return {
    leftPct: (startMin / totalMin) * 100,
    widthPct: (widthMin / totalMin) * 100,
  }
}

export function horasDoDia() {
  const horas: number[] = []
  for (let h = DIA_INICIO; h <= DIA_FIM; h += 2) horas.push(h)
  return horas
}

export function addDias(data: Date, dias: number) {
  const d = new Date(data)
  d.setDate(d.getDate() + dias)
  return d
}

export function formatarDiaSemana(data: Date) {
  return data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

// --- Períodos "semana" e "mês" (para os botões Dia/Semana/Mês da Agenda) ---

export function inicioSemana(dia: Date) {
  const d = new Date(dia)
  const diaSemana = (d.getDay() + 6) % 7 // 0 = segunda
  d.setDate(d.getDate() - diaSemana)
  d.setHours(0, 0, 0, 0)
  return d
}

export function fimSemana(dia: Date) {
  const fim = addDias(inicioSemana(dia), 6)
  fim.setHours(23, 59, 59, 999)
  return fim
}

export function inicioMes(dia: Date) {
  return new Date(dia.getFullYear(), dia.getMonth(), 1)
}

export function fimMes(dia: Date) {
  const fim = new Date(dia.getFullYear(), dia.getMonth() + 1, 0)
  fim.setHours(23, 59, 59, 999)
  return fim
}

/** Lista todos os dias (00:00) entre `inicio` e `fim`, inclusive. */
export function diasDoPeriodo(inicio: Date, fim: Date) {
  const dias: Date[] = []
  const cursor = new Date(inicio)
  cursor.setHours(0, 0, 0, 0)
  const limite = new Date(fim)
  limite.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= limite.getTime()) {
    dias.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

/** Itens do veículo que tocam o período [inicio, fim] (usado nas visões Semana/Mês). */
export function itensNoPeriodo(itens: AgendaItem[], veiculoId: string, inicio: Date, fim: Date) {
  return itens.filter((i) => {
    if (i.veiculoId !== veiculoId) return false
    const itemInicio = new Date(i.inicio)
    const itemFim = new Date(i.fim)
    return itemInicio <= fim && itemFim >= inicio
  })
}

/** Posição/largura (em %) de um item dentro de uma grade de dias (visões Semana/Mês). */
export function posicaoBlocoDias(item: AgendaItem, dias: Date[]) {
  const totalDias = dias.length
  const periodoInicio = new Date(dias[0])
  periodoInicio.setHours(0, 0, 0, 0)
  const periodoFim = new Date(dias[totalDias - 1])
  periodoFim.setHours(23, 59, 59, 999)

  const inicio = new Date(Math.max(new Date(item.inicio).getTime(), periodoInicio.getTime()))
  const fim = new Date(Math.min(new Date(item.fim).getTime(), periodoFim.getTime()))

  const diaInicioIdx = Math.floor((inicio.getTime() - periodoInicio.getTime()) / 86400000)
  const diaFimIdx = Math.floor((fim.getTime() - periodoInicio.getTime()) / 86400000)

  const leftPct = (diaInicioIdx / totalDias) * 100
  const widthPct = Math.max(((diaFimIdx - diaInicioIdx + 1) / totalDias) * 100, 100 / totalDias)

  return { leftPct, widthPct }
}

// --- Calendário mensal (visão única da Agenda) ---

export const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

/**
 * Grade completa do mês para o calendário: começa no domingo da semana que
 * contém o dia 1 e termina no sábado da semana que contém o último dia do
 * mês — sempre semanas completas de domingo a sábado, como num calendário
 * de mês tradicional.
 */
export function diasGradeMes(dia: Date) {
  const primeiroDia = inicioMes(dia)
  const ultimoDia = fimMes(dia)
  const inicioGrade = addDias(primeiroDia, -primeiroDia.getDay())
  const fimGrade = addDias(ultimoDia, 6 - ultimoDia.getDay())
  return diasDoPeriodo(inicioGrade, fimGrade)
}

/** Itens (de qualquer veículo) que tocam um dia específico — cada célula do
 * calendário mensal lista os itens daquele dia, ordenados por horário. */
export function itensNoDia(itens: AgendaItem[], dia: Date) {
  const diaInicio = new Date(dia)
  diaInicio.setHours(0, 0, 0, 0)
  const diaFim = new Date(dia)
  diaFim.setHours(23, 59, 59, 999)
  return itens
    .filter((i) => new Date(i.inicio) <= diaFim && new Date(i.fim) >= diaInicio)
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
}
