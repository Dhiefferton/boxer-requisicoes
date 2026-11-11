// Cliente para a rota serverless /api/zenerp-nota (ver api/zenerp-nota.js),
// que busca uma nota fiscal (saída ou entrada) no ZenERP pelo número.

import api from '../../services/api'

export interface NotaZenErp {
  tipo: 'saida' | 'entrada'
  numero: string
  valorNota: number | null
  peso: number | null
  destino: string | null
}

/** Busca uma nota fiscal no ZenERP pelo número (tenta nota de saída e, se não
 *  achar, nota de entrada). Lança erro com mensagem amigável em caso de falha. */
export async function buscarNotaZenErp(numero: string): Promise<NotaZenErp> {
  try {
    const { data } = await api.get('/frotas/nota', { params: { numero }, timeout: 30000 })
    return data as NotaZenErp
  } catch (e) {
    const err = e as { response?: { data?: { erro?: string }; status?: number } }
    throw new Error(err.response?.data?.erro || `Erro ao buscar nota (status ${err.response?.status ?? 'rede'})`)
  }
}

export interface NotasZenErpResumo {
  valorNota: number | null
  peso: number | null
  destino: string | null
  encontradas: number
  total: number
  naoEncontradas: string[]
}

/** Busca uma ou várias notas (números separados por "/", "," ou espaço) no
 *  ZenERP e soma valor/peso das encontradas, juntando destinos diferentes com
 *  "/". Usado tanto pela tela de gestão (Custo de Viagem) quanto pela tela do
 *  motorista, para trazer os dados da nota assim que o número é informado.
 *  Nunca lança erro — devolve null se não há número nenhum pra buscar, e o
 *  resumo com `encontradas: 0` se nenhuma nota foi localizada. */
export async function buscarESomarNotas(numerosTexto: string): Promise<NotasZenErpResumo | null> {
  const numeros = Array.from(new Set(numerosTexto.match(/\d+/g) ?? []))
  if (numeros.length === 0) return null

  const resultados = await Promise.allSettled(numeros.map((n) => buscarNotaZenErp(n)))
  const encontradas = resultados.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  const naoEncontradas = numeros.filter((_, i) => resultados[i].status === 'rejected')
  if (encontradas.length === 0) {
    return { valorNota: null, peso: null, destino: null, encontradas: 0, total: numeros.length, naoEncontradas }
  }

  const somaValor = encontradas.reduce((soma, n) => soma + (n.valorNota ?? 0), 0)
  const somaPeso = encontradas.reduce((soma, n) => soma + (n.peso ?? 0), 0)
  const destinos = Array.from(new Set(encontradas.map((n) => n.destino).filter((d): d is string => !!d)))

  return {
    valorNota: somaValor || null,
    peso: somaPeso || null,
    destino: destinos.length > 0 ? destinos.join(' / ') : null,
    encontradas: encontradas.length,
    total: numeros.length,
    naoEncontradas,
  }
}
