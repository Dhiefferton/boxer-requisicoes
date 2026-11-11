// Fórmulas do "Custo de Viagem" — mesma conta da planilha "Levantamento
// Custo Lotação" (aba DADOS), usada para comparar o custo de rodar com
// frota própria contra o de contratar uma transportadora terceirizada.

import type { ClientePedagioPadrao } from '../types'

/** R$/km cobrado por uma transportadora terceirizada, usado só para efeito
 *  de comparação (não é um custo real da Boxer). */
export const COTACAO_TRANSPORTADORA_POR_KM = 23.6

/** Custo fixo próprio por km rodado (veículo + motorista + seguros etc.,
 *  ver aba BASE DE CÁLCULOS da planilha). */
export const CUSTO_FIXO_POR_KM = 8.55

/** 0,045% do valor da nota fiscal. */
export const SEGURO_CARGA_PCT = 0.00045

export function calcularSeguroCarga(valorNota: number | undefined) {
  return Math.round((valorNota ?? 0) * SEGURO_CARGA_PCT * 100) / 100
}

/** Quanto custaria essa viagem se fosse contratada de uma transportadora. */
export function calcularCotacaoTransportadora(kmRodado: number | undefined) {
  return (kmRodado ?? 0) * COTACAO_TRANSPORTADORA_POR_KM
}

/** Custo real de rodar essa viagem com a frota própria. */
export function calcularCustoReal(params: {
  kmRodado: number | undefined
  combustivel: number
  seguroCarga: number
  pedagio: number
}) {
  const { kmRodado, combustivel, seguroCarga, pedagio } = params
  return (kmRodado ?? 0) * CUSTO_FIXO_POR_KM + combustivel + seguroCarga + pedagio
}

/** Economia de rodar com frota própria em vez de contratar transportadora
 *  (positivo = economizou; negativo = saiu mais caro que terceirizar). */
export function calcularSaving(cotacaoTransportadora: number, custoReal: number) {
  return cotacaoTransportadora - custoReal
}

/** Combustível estimado automaticamente pra uma viagem: km rodado ÷ consumo
 *  médio (km/L) × preço do diesel (R$/L). Consumo e preço são configuráveis
 *  em Custo de Viagem (valores fixos, revisados manualmente uma vez por mês
 *  quando o preço do diesel muda). */
export function calcularCombustivelEstimado(kmRodado: number | undefined, consumoMedioKmL: number, precoDieselLitro: number) {
  if (!kmRodado || consumoMedioKmL <= 0) return 0
  const litros = kmRodado / consumoMedioKmL
  return Math.round(litros * precoDieselLitro * 100) / 100
}

/** Acha o valor padrão de pedágio pra uma viagem, procurando o nome de algum
 *  cliente cadastrado dentro do texto de destino (comparação sem acento/caixa
 *  não é feita — o cadastro deve usar a grafia que aparece no destino). Usa
 *  primeiro o destino da nota (mais confiável, vem do ZenERP) e, se não
 *  achar nada ali, tenta o destino da viagem. `undefined` quando nenhum
 *  cliente cadastrado aparece em nenhum dos dois textos — nesse caso o
 *  pedágio continua sendo o que o motorista informou. */
export function encontrarPedagioPadrao(
  clientes: ClientePedagioPadrao[],
  destinos: (string | undefined)[],
): ClientePedagioPadrao | undefined {
  for (const destino of destinos) {
    if (!destino) continue
    const destinoNorm = destino.toLowerCase()
    const achado = clientes.find((c) => c.cliente && destinoNorm.includes(c.cliente.toLowerCase()))
    if (achado) return achado
  }
  return undefined
}
