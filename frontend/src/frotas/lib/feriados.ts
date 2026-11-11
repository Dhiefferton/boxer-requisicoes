// Feriados mostrados no calendário da Agenda: nacionais (fixos e móveis) e
// municipais de Nova Odessa/SP. Calculados por ano — não precisa manter lista.
//
// Pontos facultativos (Carnaval e Corpus Christi) aparecem identificados como
// tal, porque na prática afetam entregas/coletas mesmo não sendo feriado por lei.

export type TipoFeriado = 'nacional' | 'municipal' | 'facultativo'

export interface Feriado {
  nome: string
  tipo: TipoFeriado
}

/** Feriados municipais de Nova Odessa (mês 1-12, dia). */
const MUNICIPAIS_NOVA_ODESSA: { mes: number; dia: number; nome: string }[] = [
  { mes: 5, dia: 24, nome: 'Aniversário de Nova Odessa' },
  { mes: 9, dia: 15, nome: 'Nossa Senhora das Dores' },
]

/** Feriados nacionais de data fixa (mês 1-12, dia). */
const NACIONAIS_FIXOS: { mes: number; dia: number; nome: string }[] = [
  { mes: 1, dia: 1, nome: 'Confraternização Universal' },
  { mes: 4, dia: 21, nome: 'Tiradentes' },
  { mes: 5, dia: 1, nome: 'Dia do Trabalhador' },
  { mes: 9, dia: 7, nome: 'Independência do Brasil' },
  { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida' },
  { mes: 11, dia: 2, nome: 'Finados' },
  { mes: 11, dia: 15, nome: 'Proclamação da República' },
  { mes: 11, dia: 20, nome: 'Consciência Negra' },
  { mes: 12, dia: 25, nome: 'Natal' },
]

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number) {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

function chave(mes: number, dia: number) {
  return `${mes}-${dia}`
}

function somaDias(data: Date, dias: number) {
  const d = new Date(data)
  d.setDate(d.getDate() + dias)
  return d
}

const cachePorAno = new Map<number, Map<string, Feriado>>()

function feriadosDoAno(ano: number) {
  const cache = cachePorAno.get(ano)
  if (cache) return cache

  const mapa = new Map<string, Feriado>()
  for (const f of NACIONAIS_FIXOS) mapa.set(chave(f.mes, f.dia), { nome: f.nome, tipo: 'nacional' })
  for (const f of MUNICIPAIS_NOVA_ODESSA) mapa.set(chave(f.mes, f.dia), { nome: f.nome, tipo: 'municipal' })

  const p = pascoa(ano)
  const moveis: { data: Date; nome: string; tipo: TipoFeriado }[] = [
    { data: somaDias(p, -48), nome: 'Carnaval', tipo: 'facultativo' },
    { data: somaDias(p, -47), nome: 'Carnaval', tipo: 'facultativo' },
    { data: somaDias(p, -2), nome: 'Sexta-feira Santa', tipo: 'nacional' },
    { data: somaDias(p, 60), nome: 'Corpus Christi', tipo: 'facultativo' },
  ]
  for (const m of moveis) mapa.set(chave(m.data.getMonth() + 1, m.data.getDate()), { nome: m.nome, tipo: m.tipo })

  cachePorAno.set(ano, mapa)
  return mapa
}

/** Feriado (ou ponto facultativo) de um dia, ou `undefined` se for um dia comum. */
export function feriadoDoDia(dia: Date): Feriado | undefined {
  return feriadosDoAno(dia.getFullYear()).get(chave(dia.getMonth() + 1, dia.getDate()))
}

export const FERIADO_STYLE: Record<TipoFeriado, { dot: string; texto: string; fundo: string; label: string }> = {
  nacional: {
    dot: 'bg-rose-500',
    texto: 'text-rose-600 dark:text-rose-400',
    fundo: 'bg-rose-50/70 dark:bg-rose-500/5',
    label: 'Feriado nacional',
  },
  municipal: {
    dot: 'bg-violet-500',
    texto: 'text-violet-600 dark:text-violet-400',
    fundo: 'bg-violet-50/70 dark:bg-violet-500/5',
    label: 'Feriado de Nova Odessa',
  },
  facultativo: {
    dot: 'bg-amber-400',
    texto: 'text-amber-600 dark:text-amber-400',
    fundo: 'bg-amber-50/60 dark:bg-amber-500/5',
    label: 'Ponto facultativo',
  },
}
