// Funções de agregação usadas pelo Dashboard e outras telas.
// Todas recebem os dados já carregados (do Supabase) como parâmetro —
// nada aqui importa de "../data/mock".

import type { Veiculo, Viagem, VeiculoStatus, CustoViagem } from '../types'
import { calcularCotacaoTransportadora, calcularCustoReal } from './custoViagem'

export function contarPorStatus(veiculos: Veiculo[], status: VeiculoStatus) {
  return veiculos.filter((v) => v.status === status).length
}

/** Converte uma data do banco (coluna "date" tipo "2026-09-16", sem hora, ou
 *  um timestamp completo) pra um Date em horário LOCAL, sem o problema de
 *  fuso: `new Date("2026-09-16")` direto é interpretado como meia-noite UTC,
 *  e ao converter pro fuso local (Brasil, UTC-3) o dia "rola" pra trás. Usada
 *  em qualquer comparação de dia/mês feita aqui (agrupar por período, filtrar
 *  por mês etc.) — sem isso, viagens perto da virada do mês podiam cair no
 *  mês/dia errado no gráfico. */
function parseDataLocal(iso: string) {
  const somenteData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (somenteData) {
    const [, ano, mes, dia] = somenteData
    return new Date(Number(ano), Number(mes) - 1, Number(dia))
  }
  return new Date(iso)
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** Todos os dias do mês de referência, um por dia (rótulo dd/mm) — visão
 *  "Diário". Sempre o mês escolhido no seletor do Dashboard, nunca "hoje". */
function viagensPorDia(viagens: Viagem[], referencia: Date) {
  const ano = referencia.getFullYear()
  const mes = referencia.getMonth()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const dias = Array.from({ length: diasNoMes }, (_, i) => new Date(ano, mes, i + 1))

  return dias.map((d) => ({
    periodo: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    viagens: viagens.filter((v) => parseDataLocal(v.data).toDateString() === d.toDateString()).length,
  }))
}

/** Semanas (blocos de 7 dias) dentro do mês de referência — visão "Semanal". */
function viagensPorSemanaDoMes(viagens: Viagem[], referencia: Date) {
  const ano = referencia.getFullYear()
  const mes = referencia.getMonth()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const numSemanas = Math.ceil(diasNoMes / 7)

  return Array.from({ length: numSemanas }, (_, i) => {
    const inicio = i * 7 + 1
    const fim = Math.min(inicio + 6, diasNoMes)
    const quantidade = viagens.filter((v) => {
      const d = parseDataLocal(v.data)
      return d.getFullYear() === ano && d.getMonth() === mes && d.getDate() >= inicio && d.getDate() <= fim
    }).length
    return { periodo: `Sem ${i + 1}`, viagens: quantidade }
  })
}

/** Últimos 6 meses corridos terminando no mês de referência — visão "Mensal". */
function viagensPorMes(viagens: Viagem[], referencia: Date) {
  const porMes = new Map<string, number>()
  for (const v of viagens) {
    const d = parseDataLocal(v.data)
    const chave = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    porMes.set(chave, (porMes.get(chave) ?? 0) + 1)
  }

  const meses = Array.from({ length: 6 }, (_, i) => new Date(referencia.getFullYear(), referencia.getMonth() - (5 - i), 1))

  return meses.map((d) => {
    const chave = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    return { periodo: MESES[d.getMonth()], viagens: porMes.get(chave) ?? 0 }
  })
}

export type PeriodoViagens = 'diario' | 'semanal' | 'mensal'

/** Dados do gráfico "Viagens por período" do Dashboard, de acordo com o
 *  período escolhido no SegmentedControl (Diário/Semanal/Mensal) — sempre
 *  ancorado no mês escolhido no seletor do Dashboard (referencia), nunca em
 *  "hoje", pra não misturar viagens de outro mês na tela. */
export function viagensPorPeriodo(viagens: Viagem[], periodo: PeriodoViagens, referencia: Date) {
  if (periodo === 'diario') return viagensPorDia(viagens, referencia)
  if (periodo === 'mensal') return viagensPorMes(viagens, referencia)
  return viagensPorSemanaDoMes(viagens, referencia)
}

/** Custo de combustível por mês, a partir do combustível calculado
 *  automaticamente em cada viagem (km ÷ consumo × preço do diesel, ver
 *  custoViagem.ts) — usada no Dashboard e na tela Combustível. */
export function custoCombustivelViagensMensal(viagens: Viagem[], custos: CustoViagem[]) {
  const custosPorViagem = new Map(custos.map((c) => [c.viagemId, c]))
  const porMes = new Map<string, number>()
  for (const v of viagens) {
    if (v.status !== 'em_viagem' && v.status !== 'concluida') continue
    const combustivel = custosPorViagem.get(v.id)?.combustivel ?? 0
    if (!combustivel) continue
    const d = parseDataLocal(v.data)
    const chave = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    porMes.set(chave, (porMes.get(chave) ?? 0) + combustivel)
  }
  const ultimasCinco = Array.from(porMes.keys()).sort().slice(-5)
  return ultimasCinco.map((chave) => {
    const mesIndex = Number(chave.split('-')[1])
    return { mes: MESES[mesIndex], custo: porMes.get(chave) ?? 0 }
  })
}

/** Compara, para as viagens já realizadas, quanto a Boxer gastou rodando com
 *  a própria frota (custo real: km x custo fixo + combustível + seguro da
 *  carga + pedágio) contra quanto custaria ter contratado uma transportadora
 *  pra essas mesmas viagens (cotação: km x R$23,60) — os mesmos números da
 *  tela Custo de Viagem, só que somados. */
export function frotaPropriaVsTransportadora(viagens: Viagem[], custos: CustoViagem[]) {
  const custosPorViagem = new Map(custos.map((c) => [c.viagemId, c]))
  let frotaPropria = 0
  let transportadora = 0
  for (const v of viagens) {
    if (v.status !== 'em_viagem' && v.status !== 'concluida') continue
    const custo = custosPorViagem.get(v.id)
    transportadora += calcularCotacaoTransportadora(v.km)
    frotaPropria += calcularCustoReal({
      kmRodado: v.km,
      combustivel: custo?.combustivel ?? 0,
      seguroCarga: custo?.seguroCarga ?? 0,
      pedagio: custo?.pedagio ?? 0,
    })
  }
  const saving = transportadora - frotaPropria
  const economiaPercentual = transportadora > 0 ? Math.round((saving / transportadora) * 1000) / 10 : 0
  return { frotaPropria, transportadora, saving, economiaPercentual }
}

/** KPIs secundários do Dashboard — combustível/litros vêm do combustível
 *  calculado automaticamente em cada viagem (custos_viagem), não mais de
 *  abastecimentos manuais. `precoDieselLitro` (config atual) é usado só pra
 *  converter o custo total de volta em litros estimados. `saving` é o mesmo
 *  valor (transportadora - frota própria) do card "Frota própria x
 *  Transportadoras" — não tem campo de receita por viagem no sistema. */
export function kpisSecundarios(viagens: Viagem[], custos: CustoViagem[], precoDieselLitro: number, saving: number) {
  const concluidas = viagens.filter((v) => v.status === 'concluida')
  const custosPorViagem = new Map(custos.map((c) => [c.viagemId, c]))
  const kmRodados = concluidas.reduce((s, v) => s + (v.km ?? 0), 0)
  const custoCombustivel = concluidas.reduce((s, v) => s + (custosPorViagem.get(v.id)?.combustivel ?? 0), 0)
  const litros = precoDieselLitro > 0 ? custoCombustivel / precoDieselLitro : 0

  return [
    { label: 'Viagens realizadas', valor: String(concluidas.length) },
    { label: 'Km rodados', valor: `${kmRodados.toLocaleString('pt-BR')} km` },
    { label: 'Litros abastecidos', valor: `${litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L` },
    { label: 'Custo de combustível', valor: formatarMoeda(custoCombustivel) },
    { label: 'Saving', valor: formatarMoeda(saving) },
  ]
}

export function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Diz se uma data (ISO "yyyy-mm-dd" ou datetime completo) cai no mês/ano de
 *  referência — usado para filtrar o Dashboard pelo mês escolhido. Trata a
 *  data "só dia" sem conversão de fuso, mesmo cuidado de formatarData. */
export function pertenceAoMes(iso: string, referencia: Date) {
  const somenteData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = somenteData
    ? new Date(Number(somenteData[1]), Number(somenteData[2]) - 1, Number(somenteData[3]))
    : new Date(iso)
  return d.getFullYear() === referencia.getFullYear() && d.getMonth() === referencia.getMonth()
}

export function formatarData(iso: string) {
  // Uma data "pura" (coluna date do banco, ex.: "2026-09-16", sem hora) não
  // pode passar por `new Date(iso)` direto: o JS interpreta essa string como
  // meia-noite em UTC, e ao converter para o fuso local (Brasil, UTC-3) o dia
  // "rola" para trás — 16/09 vira 15/09 na tela. Nesse caso monta a data a
  // partir dos números, já em horário local, sem nenhuma conversão de fuso.
  const somenteData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (somenteData) {
    const [, ano, mes, dia] = somenteData
    return new Date(Number(ano), Number(mes) - 1, Number(dia)).toLocaleDateString('pt-BR')
  }
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Converte um instante (ISO/UTC, como vem do banco) para o formato que um
// <input type="datetime-local"> espera — ano-mes-diaThora:minuto no horário
// LOCAL de quem está vendo a tela, sem nenhum "Z"/offset. Usar isso ao
// preencher um formulário de edição evita mostrar a hora em UTC (ex.: o
// campo "abrir para editar" mostrando 07:00 quando o horário registrado, em
// horário local, é 04:00).
export function paraDatetimeLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
