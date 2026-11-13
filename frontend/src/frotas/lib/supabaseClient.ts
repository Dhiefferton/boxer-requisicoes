// Cliente Supabase + camada de acesso a dados do BOXER-FROTAS.
//
// Todas as telas devem importar as funções deste arquivo (listVeiculos,
// listViagens, etc.) em vez de ler diretamente de "../data/mock". As
// funções aqui mapeiam as colunas snake_case do banco para os tipos
// camelCase definidos em src/types/index.ts.

import { createClient } from '@supabase/supabase-js'
import { calcularCombustivelEstimado, encontrarPedagioPadrao } from './custoViagem'
import type {
  Veiculo,
  Motorista,
  Viagem,
  AgendaItem,
  ChecklistItem,
  ChecklistExecucao,
  AbastecimentoRegistro,
  CustoViagem,
  ClientePedagioPadrao,
  ManutencaoRegistro,
  Documento,
  Notificacao,
  Usuario,
} from '../types'

const supabaseUrl = import.meta.env.VITE_FROTAS_SUPABASE_URL || 'https://imltnflnujmtwkhqbcdr.supabase.co' as string | undefined
const supabaseAnonKey = import.meta.env.VITE_FROTAS_SUPABASE_ANON_KEY as string | undefined

/** true quando as variáveis de ambiente do Supabase estão definidas. */
export const SUPABASE_CONFIGURADO = Boolean(supabaseUrl && supabaseAnonKey)

// Schema do Frotas no banco (depois da unificação fica em "frotas" dentro do banco do Boxer Operações)
const supabaseSchema = ((import.meta.env.VITE_FROTAS_SUPABASE_SCHEMA as string | undefined) || 'public').trim() || 'public'

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'public-anon-key-placeholder',
  { db: { schema: supabaseSchema } },
)

// ---------------------------------------------------------------------------
// Veículos
// ---------------------------------------------------------------------------

interface VeiculoRow {
  id: string
  placa: string
  modelo: string
  ano: number
  cubagem: string | null
  km: number
  status: Veiculo['status']
  foto_url: string | null
  tipo: Veiculo['tipo']
}

function mapVeiculo(r: VeiculoRow): Veiculo {
  return {
    id: r.id,
    placa: r.placa,
    modelo: r.modelo,
    ano: r.ano,
    cubagem: r.cubagem ?? '',
    km: Number(r.km),
    status: r.status,
    fotoUrl: r.foto_url ?? undefined,
    tipo: r.tipo,
  }
}

export async function listVeiculos(): Promise<Veiculo[]> {
  const { data, error } = await supabase.from('veiculos').select('*').order('placa')
  if (error) throw error
  return (data as VeiculoRow[]).map(mapVeiculo)
}

export async function bloquearVeiculo(veiculoId: string) {
  const { error } = await supabase.from('veiculos').update({ status: 'bloqueado' }).eq('id', veiculoId)
  if (error) throw error
}

export async function criarVeiculo(input: {
  placa: string
  modelo: string
  ano: number
  cubagem?: string
  tipo: Veiculo['tipo']
}) {
  const { error } = await supabase.from('veiculos').insert({
    placa: input.placa,
    modelo: input.modelo,
    ano: input.ano,
    cubagem: input.cubagem || null,
    tipo: input.tipo,
  })
  if (error) throw error
}

export async function atualizarVeiculo(
  id: string,
  input: { placa: string; modelo: string; ano: number; cubagem?: string; tipo: Veiculo['tipo']; status?: Veiculo['status'] },
) {
  const { error } = await supabase
    .from('veiculos')
    .update({
      placa: input.placa,
      modelo: input.modelo,
      ano: input.ano,
      cubagem: input.cubagem || null,
      tipo: input.tipo,
      ...(input.status ? { status: input.status } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function excluirVeiculo(id: string) {
  const { error } = await supabase.from('veiculos').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Motoristas
// ---------------------------------------------------------------------------

interface MotoristaRow {
  id: string
  nome: string
  cnh: string
  categoria_cnh: string | null
  validade_cnh: string | null
  telefone: string | null
  status: Motorista['status']
  avatar_url: string | null
  user_id: string | null
}

function mapMotorista(r: MotoristaRow): Motorista {
  return {
    id: r.id,
    nome: r.nome,
    cnh: r.cnh,
    categoriaCnh: r.categoria_cnh ?? '',
    validadeCnh: r.validade_cnh ?? '',
    telefone: r.telefone ?? '',
    status: r.status,
    avatarUrl: r.avatar_url ?? undefined,
    viagensRealizadas: 0,
    userId: r.user_id ?? undefined,
  }
}

export async function listMotoristas(): Promise<Motorista[]> {
  const { data, error } = await supabase.from('motoristas').select('*').order('nome')
  if (error) throw error
  return (data as MotoristaRow[]).map(mapMotorista)
}

export async function getMotoristaPorUserId(userId: string): Promise<Motorista | null> {
  const { data, error } = await supabase.from('motoristas').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ? mapMotorista(data as MotoristaRow) : null
}

export async function criarMotorista(input: {
  nome: string
  cnh: string
  categoriaCnh?: string
  validadeCnh?: string
  telefone?: string
  userId?: string | null
}) {
  const { error } = await supabase.from('motoristas').insert({
    nome: input.nome,
    cnh: input.cnh,
    categoria_cnh: input.categoriaCnh || null,
    validade_cnh: input.validadeCnh || null,
    telefone: input.telefone || null,
    user_id: input.userId || null,
  })
  if (error) throw error
}

export async function atualizarMotorista(
  id: string,
  input: {
    nome: string
    cnh: string
    categoriaCnh?: string
    validadeCnh?: string
    telefone?: string
    status?: Motorista['status']
    userId?: string | null
  },
) {
  const { error } = await supabase
    .from('motoristas')
    .update({
      nome: input.nome,
      cnh: input.cnh,
      categoria_cnh: input.categoriaCnh || null,
      validade_cnh: input.validadeCnh || null,
      telefone: input.telefone || null,
      ...(input.status ? { status: input.status } : {}),
      user_id: input.userId || null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function excluirMotorista(id: string) {
  const { error } = await supabase.from('motoristas').delete().eq('id', id)
  if (error) throw error
}

/** Retorna o user_id (login) atualmente vinculado a cada motorista, quando houver. */
export async function listVinculosMotoristaUsuario(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('motoristas').select('id, user_id')
  if (error) throw error
  const mapa: Record<string, string> = {}
  for (const row of data as { id: string; user_id: string | null }[]) {
    if (row.user_id) mapa[row.id] = row.user_id
  }
  return mapa
}

/** Preenche viagensRealizadas (viagens concluídas) a partir de uma lista de viagens já carregada. */
export function contarViagensConcluidasPorMotorista(motoristas: Motorista[], viagens: Viagem[]): Motorista[] {
  const contagem = new Map<string, number>()
  for (const v of viagens) {
    if (v.status === 'concluida') contagem.set(v.motoristaId, (contagem.get(v.motoristaId) ?? 0) + 1)
  }
  return motoristas.map((m) => ({ ...m, viagensRealizadas: contagem.get(m.id) ?? 0 }))
}

// ---------------------------------------------------------------------------
// Viagens
// ---------------------------------------------------------------------------

interface ViagemRow {
  id: string
  numero: string
  data: string
  veiculo_id: string
  motorista_id: string
  origem: string
  destino: string
  saida_prevista: string | null
  chegada_prevista: string | null
  saida_real: string | null
  chegada_real: string | null
  km_saida: number | null
  km_chegada: number | null
  km: number | null
  status: Viagem['status']
  receita: number | null
}

function mapViagem(r: ViagemRow): Viagem {
  return {
    id: r.id,
    numero: r.numero,
    data: r.data,
    veiculoId: r.veiculo_id,
    motoristaId: r.motorista_id,
    origem: r.origem,
    destino: r.destino,
    saidaPrevista: r.saida_prevista ?? '',
    chegadaPrevista: r.chegada_prevista ?? '',
    saidaReal: r.saida_real ?? undefined,
    chegadaReal: r.chegada_real ?? undefined,
    kmSaida: r.km_saida ?? undefined,
    kmChegada: r.km_chegada ?? undefined,
    km: r.km ?? undefined,
    status: r.status,
    receita: r.receita ?? undefined,
  }
}

export async function listViagens(): Promise<Viagem[]> {
  const { data, error } = await supabase.from('viagens').select('*').order('data', { ascending: false })
  if (error) throw error
  return (data as ViagemRow[]).map(mapViagem)
}

/** Próxima viagem programada/em andamento de um motorista específico. */
export async function getViagemAtualDoMotorista(motoristaId: string): Promise<Viagem | null> {
  const { data, error } = await supabase
    .from('viagens')
    .select('*')
    .eq('motorista_id', motoristaId)
    .in('status', ['programada', 'em_viagem'])
    .order('saida_prevista', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? mapViagem(data as ViagemRow) : null
}

export async function iniciarViagem(viagemId: string, kmSaida: number) {
  // Além de marcar a viagem como "em_viagem", precisa refletir isso no
  // próprio veículo (veiculos.status) — é esse campo que o Centro de
  // Operações usa para decidir em qual coluna mostrar o veículo. Sem essa
  // atualização, o veículo continuava aparecendo em "Disponível" mesmo com
  // uma viagem em andamento.
  const { data: viagemAtual, error: selErr } = await supabase
    .from('viagens')
    .select('veiculo_id')
    .eq('id', viagemId)
    .single()
  if (selErr) throw selErr
  const veiculoId = (viagemAtual as { veiculo_id: string } | null)?.veiculo_id

  // Trava de segurança (a tela do motorista já bloqueia antes): o KM de
  // saída não pode ser menor que o último KM registrado do veículo (KM de
  // chegada da viagem anterior).
  if (veiculoId) {
    const { data: veic, error: veicSelErr } = await supabase.from('veiculos').select('km').eq('id', veiculoId).single()
    if (veicSelErr) throw veicSelErr
    const kmAnterior = Number((veic as { km: number | null } | null)?.km ?? 0)
    if (kmAnterior > 0 && kmSaida < kmAnterior) {
      throw new Error(`KM de saída (${kmSaida}) menor que o KM da viagem anterior (${kmAnterior}). Corrija o valor.`)
    }
  }

  const { error } = await supabase
    .from('viagens')
    .update({ km_saida: kmSaida, saida_real: new Date().toISOString(), status: 'em_viagem' })
    .eq('id', viagemId)
  if (error) throw error

  if (veiculoId) {
    const { error: veicErr } = await supabase.from('veiculos').update({ status: 'em_viagem' }).eq('id', veiculoId)
    if (veicErr) throw veicErr
  }
}

export async function finalizarViagem(viagemId: string, kmChegada: number) {
  const { data, error } = await supabase.from('viagens').select('km_saida, veiculo_id, destino').eq('id', viagemId).single()
  if (error) throw error
  const { km_saida: kmSaida, veiculo_id: veiculoId, destino } = data as {
    km_saida: number | null
    veiculo_id: string | null
    destino: string | null
  }
  // Trava de segurança (a tela do motorista já bloqueia antes): KM de
  // chegada menor ou igual ao de saída é erro de digitação — não finaliza.
  if (kmSaida != null && kmChegada <= Number(kmSaida)) {
    throw new Error(`KM de chegada (${kmChegada}) precisa ser maior que o KM de saída (${Number(kmSaida)}). Corrija o valor.`)
  }
  const km = kmSaida != null ? Math.max(0, kmChegada - Number(kmSaida)) : null
  const { error: updErr } = await supabase
    .from('viagens')
    .update({ km_chegada: kmChegada, chegada_real: new Date().toISOString(), status: 'concluida', km })
    .eq('id', viagemId)
  if (updErr) throw updErr

  // Ao concluir, o veículo volta a ficar disponível para a próxima viagem
  // (mesma lógica: sem isso ele ficava "preso" em "Em viagem" no Centro de
  // Operações mesmo depois de a viagem já ter terminado) — e o odômetro do
  // veículo é atualizado com o km de chegada dessa viagem. Sem isso, a tela
  // de Veículos continuava mostrando o km antigo (ou 0), mesmo depois de
  // várias viagens concluídas.
  if (veiculoId) {
    const { error: veicErr } = await supabase.from('veiculos').update({ status: 'disponivel', km: kmChegada }).eq('id', veiculoId)
    if (veicErr) throw veicErr
  }

  // Combustível (e, quando o destino bate com um cliente cadastrado,
  // pedágio) já calculados automaticamente aqui, assim que a viagem
  // termina — antes disso ficavam zerados em custos_viagem até o gestor
  // abrir e salvar manualmente o Custo de Viagem dessa viagem específica.
  if (km != null) {
    try {
      const [config, clientes, custoAtual] = await Promise.all([
        getConfiguracaoCombustivel(),
        listClientesPedagioPadrao(),
        supabase.from('custos_viagem').select('destino_nota').eq('viagem_id', viagemId).maybeSingle(),
      ])
      const combustivel = calcularCombustivelEstimado(km, config.consumoMedioKmL, config.precoDieselLitro)
      // Procura o cliente primeiro no destino da nota (vem do ZenERP, mais
      // confiável) e só depois no destino da viagem — mesma ordem da tela
      // Custo de Viagem.
      const destinoNota = (custoAtual.data as { destino_nota: string | null } | null)?.destino_nota ?? undefined
      const padrao = encontrarPedagioPadrao(clientes, [destinoNota, destino ?? undefined])
      await salvarCustoViagem(viagemId, {
        combustivel,
        ...(padrao ? { pedagio: padrao.valorPadrao } : {}),
      })
    } catch {
      // Não bloqueia a finalização da viagem por isso — o gestor ainda
      // consegue recalcular manualmente na tela Custo de Viagem.
    }
  }
}

export async function criarViagem(input: {
  numero: string
  data: string
  veiculoId: string
  motoristaId: string
  origem: string
  destino: string
  saidaPrevista?: string
  chegadaPrevista?: string
}) {
  const { error } = await supabase.from('viagens').insert({
    numero: input.numero,
    data: input.data,
    veiculo_id: input.veiculoId,
    motorista_id: input.motoristaId,
    origem: input.origem,
    destino: input.destino,
    saida_prevista: input.saidaPrevista || null,
    chegada_prevista: input.chegadaPrevista || null,
    status: 'programada',
  })
  if (error) throw error
}

export async function atualizarViagem(
  id: string,
  input: {
    numero: string
    data: string
    veiculoId: string
    motoristaId: string
    origem: string
    destino: string
    saidaPrevista?: string
    chegadaPrevista?: string
    status?: Viagem['status']
  },
) {
  // Se o gestor mudar o status aqui manualmente (sem passar pelo fluxo
  // iniciar/finalizar do motorista, que já sincroniza o veículo — ver
  // iniciarViagem/finalizarViagem acima), o veículo (veiculos.status)
  // precisa acompanhar: entrando em "em_viagem" ou saindo dele (pra
  // "cancelada"/"concluida"/"programada"). Sem isso o veículo ficava "preso"
  // em "Em viagem" no Centro de Operações mesmo depois de a viagem ser
  // cancelada ou reaberta.
  let sincroniaVeiculo: { veiculoId: string; novoStatus: 'em_viagem' | 'disponivel' } | null = null
  if (input.status) {
    const { data: atual, error: selErr } = await supabase.from('viagens').select('status, veiculo_id').eq('id', id).single()
    if (selErr) throw selErr
    const { status: statusAtual, veiculo_id: veiculoId } = atual as { status: string; veiculo_id: string }
    if (veiculoId && statusAtual !== input.status) {
      if (input.status === 'em_viagem') sincroniaVeiculo = { veiculoId, novoStatus: 'em_viagem' }
      else if (statusAtual === 'em_viagem') sincroniaVeiculo = { veiculoId, novoStatus: 'disponivel' }
    }
  }

  const { error } = await supabase
    .from('viagens')
    .update({
      numero: input.numero,
      data: input.data,
      veiculo_id: input.veiculoId,
      motorista_id: input.motoristaId,
      origem: input.origem,
      destino: input.destino,
      saida_prevista: input.saidaPrevista || null,
      chegada_prevista: input.chegadaPrevista || null,
      ...(input.status ? { status: input.status } : {}),
    })
    .eq('id', id)
  if (error) throw error

  if (sincroniaVeiculo) {
    const { error: veicErr } = await supabase
      .from('veiculos')
      .update({ status: sincroniaVeiculo.novoStatus })
      .eq('id', sincroniaVeiculo.veiculoId)
    if (veicErr) throw veicErr
  }
}

export async function excluirViagem(id: string) {
  // Mesmo cuidado do atualizarViagem: se a viagem excluída era a que estava
  // "em_viagem", o veículo precisa voltar a "disponivel" — senão fica preso
  // em "Em viagem" no Centro de Operações pra sempre, já que não sobra
  // nenhuma viagem pra "desmarcar" o status depois que essa é apagada.
  const { data: atual, error: selErr } = await supabase.from('viagens').select('status, veiculo_id').eq('id', id).single()
  if (selErr) throw selErr
  const { status: statusAtual, veiculo_id: veiculoId } = atual as { status: string; veiculo_id: string }

  const { error } = await supabase.from('viagens').delete().eq('id', id)
  if (error) throw error

  if (veiculoId && statusAtual === 'em_viagem') {
    const { error: veicErr } = await supabase.from('veiculos').update({ status: 'disponivel' }).eq('id', veiculoId)
    if (veicErr) throw veicErr
  }
}

// ---------------------------------------------------------------------------
// Custo de Viagem
// ---------------------------------------------------------------------------

interface CustoViagemRow {
  id: string
  viagem_id: string
  notas: string | null
  valor_nota: number | null
  peso: number | null
  destino_nota: string | null
  combustivel: number
  pedagio: number
  seguro_carga: number
}

function mapCustoViagem(r: CustoViagemRow): CustoViagem {
  return {
    id: r.id,
    viagemId: r.viagem_id,
    notas: r.notas ?? undefined,
    valorNota: r.valor_nota ?? undefined,
    peso: r.peso ?? undefined,
    destinoNota: r.destino_nota ?? undefined,
    combustivel: r.combustivel,
    pedagio: r.pedagio,
    seguroCarga: r.seguro_carga,
  }
}

export async function listCustosViagem(): Promise<CustoViagem[]> {
  const { data, error } = await supabase.from('custos_viagem').select('*')
  if (error) throw error
  return (data as CustoViagemRow[]).map(mapCustoViagem)
}

/** Cria/atualiza os campos de custo de uma viagem (upsert por viagem_id) —
 *  usado tanto pelo motorista (notas, pedágio) quanto pelo gestor na tela
 *  Custo de Viagem (valor da nota, peso, destino, combustível). */
export async function salvarCustoViagem(
  viagemId: string,
  input: Partial<{
    notas: string
    valorNota: number
    peso: number
    destinoNota: string
    combustivel: number
    pedagio: number
  }>,
) {
  const payload: Record<string, unknown> = { viagem_id: viagemId, atualizado_em: new Date().toISOString() }
  if (input.notas !== undefined) payload.notas = input.notas || null
  if (input.valorNota !== undefined) payload.valor_nota = input.valorNota
  if (input.peso !== undefined) payload.peso = input.peso
  if (input.destinoNota !== undefined) payload.destino_nota = input.destinoNota || null
  if (input.combustivel !== undefined) payload.combustivel = input.combustivel
  if (input.pedagio !== undefined) payload.pedagio = input.pedagio

  const { error } = await supabase.from('custos_viagem').upsert(payload, { onConflict: 'viagem_id' })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Configuração de Combustível (consumo médio + preço do diesel, usados para
// estimar o combustível de cada viagem automaticamente — ver custoViagem.ts)
// ---------------------------------------------------------------------------

export interface ConfiguracaoCombustivel {
  id: string
  consumoMedioKmL: number
  precoDieselLitro: number
  atualizadoEm: string
}

interface ConfiguracaoCombustivelRow {
  id: string
  consumo_medio_km_l: number
  preco_diesel_litro: number
  atualizado_em: string
}

export async function getConfiguracaoCombustivel(): Promise<ConfiguracaoCombustivel> {
  const { data, error } = await supabase.from('configuracoes_combustivel').select('*').limit(1).single()
  if (error) throw error
  const row = data as ConfiguracaoCombustivelRow
  return {
    id: row.id,
    consumoMedioKmL: row.consumo_medio_km_l,
    precoDieselLitro: row.preco_diesel_litro,
    atualizadoEm: row.atualizado_em,
  }
}

/** Atualiza consumo médio / preço do diesel e recalcula o combustível (km da
 *  viagem ÷ consumo × preço) de todas as viagens do mês corrente — é a
 *  "correção" que o gestor dispara quando confere o preço do diesel uma vez
 *  por mês. Meses anteriores não são tocados. Retorna quantas viagens foram
 *  recalculadas. */
export async function salvarConfiguracaoCombustivelERecalcular(input: {
  id: string
  consumoMedioKmL: number
  precoDieselLitro: number
}): Promise<number> {
  const { error: cfgErro } = await supabase
    .from('configuracoes_combustivel')
    .update({
      consumo_medio_km_l: input.consumoMedioKmL,
      preco_diesel_litro: input.precoDieselLitro,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', input.id)
  if (cfgErro) throw cfgErro

  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const inicioMes = `${ano}-${pad(mes + 1)}-01`
  const inicioProxMes = mes === 11 ? `${ano + 1}-01-01` : `${ano}-${pad(mes + 2)}-01`

  const { data: viagensDoMes, error: viagensErro } = await supabase
    .from('viagens')
    .select('id, km')
    .gte('data', inicioMes)
    .lt('data', inicioProxMes)
    .in('status', ['em_viagem', 'concluida'])
  if (viagensErro) throw viagensErro

  const linhas = (viagensDoMes as { id: string; km: number | null }[] | null) ?? []
  if (linhas.length === 0) return 0

  const payload = linhas.map((v) => ({
    viagem_id: v.id,
    combustivel: calcularCombustivelEstimado(v.km ?? undefined, input.consumoMedioKmL, input.precoDieselLitro),
    atualizado_em: new Date().toISOString(),
  }))

  const { error: upsertErro } = await supabase.from('custos_viagem').upsert(payload, { onConflict: 'viagem_id' })
  if (upsertErro) throw upsertErro

  return linhas.length
}

// ---------------------------------------------------------------------------
// Pedágio padrão por cliente (substitui, na tela Custo de Viagem, o valor
// que o motorista informou, quando o destino bate com um cliente cadastrado
// — ver encontrarPedagioPadrao em custoViagem.ts)
// ---------------------------------------------------------------------------

interface ClientePedagioPadraoRow {
  id: string
  cliente: string
  valor_padrao: number
  atualizado_em: string
}

function mapClientePedagioPadrao(r: ClientePedagioPadraoRow): ClientePedagioPadrao {
  return { id: r.id, cliente: r.cliente, valorPadrao: r.valor_padrao, atualizadoEm: r.atualizado_em }
}

export async function listClientesPedagioPadrao(): Promise<ClientePedagioPadrao[]> {
  const { data, error } = await supabase.from('clientes_pedagio_padrao').select('*').order('cliente')
  if (error) throw error
  return (data as ClientePedagioPadraoRow[]).map(mapClientePedagioPadrao)
}

/** Cria (sem `id`) ou atualiza (com `id`) o padrão de pedágio de um cliente. */
export async function salvarClientePedagioPadrao(input: { id?: string; cliente: string; valorPadrao: number }) {
  const payload = { cliente: input.cliente.trim(), valor_padrao: input.valorPadrao, atualizado_em: new Date().toISOString() }
  if (input.id) {
    const { error } = await supabase.from('clientes_pedagio_padrao').update(payload).eq('id', input.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('clientes_pedagio_padrao').insert(payload)
    if (error) throw error
  }
}

export async function excluirClientePedagioPadrao(id: string) {
  const { error } = await supabase.from('clientes_pedagio_padrao').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

interface AgendaItemRow {
  id: string
  veiculo_id: string
  tipo: AgendaItem['tipo']
  titulo: string
  motorista_id: string | null
  motorista_nome: string | null
  inicio: string
  fim: string
  observacao: string | null
  viagem_id: string | null
}

function mapAgendaItem(r: AgendaItemRow): AgendaItem {
  return {
    id: r.id,
    veiculoId: r.veiculo_id,
    tipo: r.tipo,
    titulo: r.titulo,
    motoristaId: r.motorista_id ?? undefined,
    motoristaNome: r.motorista_nome ?? undefined,
    inicio: r.inicio,
    fim: r.fim,
    observacao: r.observacao ?? undefined,
    viagemId: r.viagem_id ?? undefined,
  }
}

export async function listAgendaItems(): Promise<AgendaItem[]> {
  const { data, error } = await supabase.from('agenda_itens').select('*').order('inicio')
  if (error) throw error
  return (data as AgendaItemRow[]).map(mapAgendaItem)
}

export async function criarAgendaItem(input: {
  veiculoId: string
  tipo: AgendaItem['tipo']
  titulo: string
  motoristaId?: string
  motoristaNome?: string
  inicio: string
  fim: string
  observacao?: string
}) {
  const { error } = await supabase.from('agenda_itens').insert({
    veiculo_id: input.veiculoId,
    tipo: input.tipo,
    titulo: input.titulo,
    motorista_id: input.motoristaId || null,
    motorista_nome: input.motoristaNome || null,
    inicio: input.inicio,
    fim: input.fim,
    observacao: input.observacao || null,
  })
  if (error) throw error
}

export async function atualizarAgendaItem(
  id: string,
  input: {
    veiculoId: string
    tipo: AgendaItem['tipo']
    titulo: string
    motoristaId?: string
    motoristaNome?: string
    inicio: string
    fim: string
    observacao?: string
  },
) {
  const { error } = await supabase
    .from('agenda_itens')
    .update({
      veiculo_id: input.veiculoId,
      tipo: input.tipo,
      titulo: input.titulo,
      motorista_id: input.motoristaId || null,
      motorista_nome: input.motoristaNome || null,
      inicio: input.inicio,
      fim: input.fim,
      observacao: input.observacao || null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function excluirAgendaItem(id: string) {
  const { error } = await supabase.from('agenda_itens').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

// O checklist é um roteiro fixo de vistoria (não varia por veículo), por
// isso continua definido no código em vez de vir de uma tabela "template".
// Cada execução real (com os resultados marcados) é salva em
// checklist_execucoes / checklist_itens.
export const CHECKLIST_TEMPLATE: ChecklistItem[] = [
  { id: 'c1', categoria: 'Documentação', descricao: 'CRLV em dia' },
  { id: 'c2', categoria: 'Documentação', descricao: 'Licenciamento' },
  { id: 'c3', categoria: 'Documentação', descricao: 'Seguro obrigatório' },
  { id: 'c4', categoria: 'Documentação', descricao: 'Documentação obrigatória' },
  { id: 'c5', categoria: 'Documentação', descricao: 'Outros documentos' },
  { id: 'c6', categoria: 'Parte Mecânica', descricao: 'Nível de óleo', critico: true },
  { id: 'c7', categoria: 'Parte Mecânica', descricao: 'Água do radiador' },
  { id: 'c8', categoria: 'Parte Mecânica', descricao: 'Freios', critico: true },
  { id: 'c9', categoria: 'Parte Mecânica', descricao: 'Pneus', critico: true },
  { id: 'c10', categoria: 'Parte Mecânica', descricao: 'Vazamentos no motor', critico: true },
  { id: 'c11', categoria: 'Parte Mecânica', descricao: 'Suspensão' },
  { id: 'c12', categoria: 'Parte Mecânica', descricao: 'Embreagem' },
  { id: 'c13', categoria: 'Parte Mecânica', descricao: 'Escapamento' },
  { id: 'c14', categoria: 'Parte Mecânica', descricao: 'Correias' },
  { id: 'c15', categoria: 'Elétrica', descricao: 'Faróis e lanternas' },
  { id: 'c16', categoria: 'Elétrica', descricao: 'Setas e pisca-alerta' },
  { id: 'c17', categoria: 'Elétrica', descricao: 'Bateria' },
  { id: 'c18', categoria: 'Segurança', descricao: 'Extintor de incêndio', critico: true },
  { id: 'c19', categoria: 'Segurança', descricao: 'Triângulo de sinalização' },
  { id: 'c20', categoria: 'Segurança', descricao: 'Cinto de segurança', critico: true },
  { id: 'c21', categoria: 'Carroceria', descricao: 'Lataria e pintura' },
  { id: 'c22', categoria: 'Carroceria', descricao: 'Portas e travas' },
]

export async function salvarChecklistExecucao(input: {
  veiculoId: string
  motoristaId: string
  momento: 'mensal'
  itens: ChecklistItem[]
  finalizado: boolean
}): Promise<string> {
  const { data: execucao, error: execErr } = await supabase
    .from('checklist_execucoes')
    .insert({
      veiculo_id: input.veiculoId,
      motorista_id: input.motoristaId,
      momento: input.momento,
      finalizado: input.finalizado,
    })
    .select('id')
    .single()
  if (execErr) throw execErr

  const execucaoId = (execucao as { id: string }).id
  const itensPayload = input.itens.map((i) => ({
    execucao_id: execucaoId,
    categoria: i.categoria,
    descricao: i.descricao,
    critico: i.critico ?? false,
    resultado: i.resultado ?? null,
    observacao: i.observacao ?? null,
    foto_url: i.fotoUrl ?? null,
  }))
  const { error: itensErr } = await supabase.from('checklist_itens').insert(itensPayload)
  if (itensErr) throw itensErr

  return execucaoId
}

/** Histórico de checklists já realizados (tela Checklist, aba "Feitos"),
 *  do mais recente pro mais antigo, já com os itens de cada execução
 *  carregados — pra mostrar o que foi reprovado sem precisar de outra
 *  consulta por execução. */
export async function listChecklistExecucoes(limite = 50): Promise<ChecklistExecucao[]> {
  const { data, error } = await supabase
    .from('checklist_execucoes')
    .select('id, veiculo_id, motorista_id, momento, data, finalizado')
    .order('data', { ascending: false })
    .limit(limite)
  if (error) throw error

  const execucoes = data as {
    id: string
    veiculo_id: string
    motorista_id: string
    momento: string
    data: string
    finalizado: boolean
  }[]
  if (execucoes.length === 0) return []

  const { data: itensData, error: itensErr } = await supabase
    .from('checklist_itens')
    .select('id, execucao_id, categoria, descricao, critico, resultado, observacao, foto_url')
    .in(
      'execucao_id',
      execucoes.map((e) => e.id),
    )
  if (itensErr) throw itensErr

  const itensPorExecucao = new Map<string, ChecklistItem[]>()
  for (const i of itensData as {
    id: string
    execucao_id: string
    categoria: string
    descricao: string
    critico: boolean
    resultado: ChecklistItem['resultado'] | null
    observacao: string | null
    foto_url: string | null
  }[]) {
    const lista = itensPorExecucao.get(i.execucao_id) ?? []
    lista.push({
      id: i.id,
      categoria: i.categoria,
      descricao: i.descricao,
      critico: i.critico,
      resultado: i.resultado ?? undefined,
      observacao: i.observacao ?? undefined,
      fotoUrl: i.foto_url ?? undefined,
    })
    itensPorExecucao.set(i.execucao_id, lista)
  }

  return execucoes.map((e) => ({
    id: e.id,
    veiculoId: e.veiculo_id,
    motoristaId: e.motorista_id,
    momento: e.momento as 'mensal',
    data: e.data,
    finalizado: e.finalizado,
    itens: itensPorExecucao.get(e.id) ?? [],
  }))
}

export interface ChecklistMensalStatus {
  veiculoId: string
  feito: boolean
  data?: string
}

/**
 * Para cada veículo, indica se o checklist mensal (1x por veículo/mês) já foi
 * feito no mês corrente. Um veículo sem execução "mensal" finalizada neste
 * mês aparece como pendente.
 */
export async function getChecklistMensalStatus(veiculoIds: string[]): Promise<ChecklistMensalStatus[]> {
  if (veiculoIds.length === 0) return []
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('checklist_execucoes')
    .select('veiculo_id, data')
    .eq('momento', 'mensal')
    .eq('finalizado', true)
    .gte('data', inicioMes.toISOString())
    .in('veiculo_id', veiculoIds)
    .order('data', { ascending: false })
  if (error) throw error

  const feitos = new Map<string, string>()
  for (const row of data as { veiculo_id: string; data: string }[]) {
    if (!feitos.has(row.veiculo_id)) feitos.set(row.veiculo_id, row.data)
  }

  return veiculoIds.map((id) => ({ veiculoId: id, feito: feitos.has(id), data: feitos.get(id) }))
}

// ---------------------------------------------------------------------------
// Abastecimentos
// ---------------------------------------------------------------------------

interface AbastecimentoRow {
  id: string
  veiculo_id: string
  data: string
  litros: number
  valor_total: number
  km: number
  posto: string | null
  tipo: 'diesel' | 'arla'
}

function mapAbastecimento(r: AbastecimentoRow): AbastecimentoRegistro {
  return {
    id: r.id,
    veiculoId: r.veiculo_id,
    data: r.data,
    litros: Number(r.litros),
    valorTotal: Number(r.valor_total),
    km: Number(r.km),
    posto: r.posto ?? undefined,
    tipo: r.tipo ?? 'diesel',
  }
}

export async function listAbastecimentos(): Promise<AbastecimentoRegistro[]> {
  const { data, error } = await supabase.from('abastecimentos').select('*').order('data', { ascending: false })
  if (error) throw error
  return (data as AbastecimentoRow[]).map(mapAbastecimento)
}

export async function criarAbastecimento(input: {
  veiculoId: string
  data: string
  litros: number
  valorTotal: number
  km: number
  posto?: string
  /** 'diesel' (padrão, combustível) ou 'arla' (Arla/AdBlue). */
  tipo?: 'diesel' | 'arla'
}) {
  const { error } = await supabase.from('abastecimentos').insert({
    veiculo_id: input.veiculoId,
    data: input.data,
    litros: input.litros,
    valor_total: input.valorTotal,
    km: input.km,
    posto: input.posto || null,
    tipo: input.tipo ?? 'diesel',
  })
  if (error) throw error
}

export async function atualizarAbastecimento(
  id: string,
  input: { veiculoId: string; data: string; litros: number; valorTotal: number; km: number; posto?: string; tipo?: 'diesel' | 'arla' },
) {
  const { error } = await supabase
    .from('abastecimentos')
    .update({
      veiculo_id: input.veiculoId,
      data: input.data,
      litros: input.litros,
      valor_total: input.valorTotal,
      km: input.km,
      posto: input.posto || null,
      tipo: input.tipo ?? 'diesel',
    })
    .eq('id', id)
  if (error) throw error
}

export async function excluirAbastecimento(id: string) {
  const { error } = await supabase.from('abastecimentos').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Manutenções
// ---------------------------------------------------------------------------

interface ManutencaoRow {
  id: string
  veiculo_id: string
  tipo: ManutencaoRegistro['tipo']
  descricao: string
  status: ManutencaoRegistro['status']
  data_inicio: string
  data_fim: string | null
  custo: number | null
  oficina: string | null
}

function mapManutencao(r: ManutencaoRow): ManutencaoRegistro {
  return {
    id: r.id,
    veiculoId: r.veiculo_id,
    tipo: r.tipo,
    descricao: r.descricao,
    status: r.status,
    dataInicio: r.data_inicio,
    dataFim: r.data_fim ?? undefined,
    custo: r.custo ?? undefined,
    oficina: r.oficina ?? undefined,
  }
}

export async function listManutencoes(): Promise<ManutencaoRegistro[]> {
  const { data, error } = await supabase.from('manutencoes').select('*').order('data_inicio', { ascending: false })
  if (error) throw error
  return (data as ManutencaoRow[]).map(mapManutencao)
}

export async function criarManutencao(input: {
  veiculoId: string
  tipo: ManutencaoRegistro['tipo']
  descricao: string
  dataInicio: string
  oficina?: string
  custo?: number
}) {
  const { error } = await supabase.from('manutencoes').insert({
    veiculo_id: input.veiculoId,
    tipo: input.tipo,
    descricao: input.descricao,
    data_inicio: input.dataInicio,
    oficina: input.oficina || null,
    custo: input.custo ?? null,
  })
  if (error) throw error
}

export async function atualizarManutencao(
  id: string,
  input: {
    veiculoId: string
    tipo: ManutencaoRegistro['tipo']
    descricao: string
    status: ManutencaoRegistro['status']
    dataInicio: string
    dataFim?: string
    oficina?: string
    custo?: number
  },
) {
  const { error } = await supabase
    .from('manutencoes')
    .update({
      veiculo_id: input.veiculoId,
      tipo: input.tipo,
      descricao: input.descricao,
      status: input.status,
      data_inicio: input.dataInicio,
      data_fim: input.dataFim || null,
      oficina: input.oficina || null,
      custo: input.custo ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function excluirManutencao(id: string) {
  const { error } = await supabase.from('manutencoes').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

interface DocumentoRow {
  id: string
  entidade: Documento['entidade']
  entidade_id: string
  tipo: string
  numero: string | null
  validade: string | null
  status: Documento['status']
  arquivo_url: string | null
}

function mapDocumento(r: DocumentoRow): Documento {
  return {
    id: r.id,
    entidade: r.entidade,
    entidadeId: r.entidade_id,
    tipo: r.tipo as Documento['tipo'],
    numero: r.numero ?? undefined,
    validade: r.validade ?? undefined,
    status: r.status,
    arquivoUrl: r.arquivo_url ?? undefined,
  }
}

export async function listDocumentos(): Promise<Documento[]> {
  const { data, error } = await supabase.from('documentos').select('*').order('validade')
  if (error) throw error
  return (data as DocumentoRow[]).map(mapDocumento)
}

// O "status" não é enviado ao criar/editar: um gatilho no banco calcula
// sempre 'ok' / 'vencendo' / 'vencido' a partir da validade.
export async function criarDocumento(input: {
  entidade: Documento['entidade']
  entidadeId: string
  tipo: Documento['tipo']
  numero?: string
  validade?: string
}) {
  const { error } = await supabase.from('documentos').insert({
    entidade: input.entidade,
    entidade_id: input.entidadeId,
    tipo: input.tipo,
    numero: input.numero || null,
    validade: input.validade || null,
  })
  if (error) throw error
}

export async function atualizarDocumento(
  id: string,
  input: { entidade: Documento['entidade']; entidadeId: string; tipo: Documento['tipo']; numero?: string; validade?: string },
) {
  const { error } = await supabase
    .from('documentos')
    .update({
      entidade: input.entidade,
      entidade_id: input.entidadeId,
      tipo: input.tipo,
      numero: input.numero || null,
      validade: input.validade || null,
    })
    .eq('id', id)
  if (error) throw error
}

export async function excluirDocumento(id: string) {
  const { error } = await supabase.from('documentos').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------

interface NotificacaoRow {
  id: string
  titulo: string
  descricao: string
  tipo: Notificacao['tipo']
  lida: boolean
  data: string
}

function mapNotificacao(r: NotificacaoRow): Notificacao {
  return {
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao,
    tipo: r.tipo,
    lida: r.lida,
    data: r.data,
  }
}

export async function listNotificacoes(): Promise<Notificacao[]> {
  const { data, error } = await supabase.from('notificacoes').select('*').order('data', { ascending: false })
  if (error) throw error
  return (data as NotificacaoRow[]).map(mapNotificacao)
}

export async function marcarNotificacaoLida(id: string) {
  const { error } = await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
  if (error) throw error
}

export async function marcarTodasNotificacoesLidas() {
  const { error } = await supabase.from('notificacoes').update({ lida: true }).eq('lida', false)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Usuários (perfil)
// ---------------------------------------------------------------------------

interface UsuarioPerfilRow {
  id: string
  nome: string
  email: string | null
  cargo: string | null
  perfil: Usuario['perfil']
  avatar_url: string | null
  ativo: boolean
  precisa_trocar_senha: boolean
}

function mapUsuario(r: UsuarioPerfilRow): Usuario {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email ?? '',
    cargo: r.cargo ?? '',
    perfil: r.perfil,
    avatarUrl: r.avatar_url ?? undefined,
    ativo: r.ativo,
    precisaTrocarSenha: r.precisa_trocar_senha,
  }
}

export async function listUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase.from('usuarios_perfil').select('*').order('nome')
  if (error) throw error
  return (data as UsuarioPerfilRow[]).map(mapUsuario)
}

export async function getMeuPerfil(userId: string): Promise<Usuario | null> {
  const { data, error } = await supabase.from('usuarios_perfil').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? mapUsuario(data as UsuarioPerfilRow) : null
}

export interface UsuarioLoginSugestao {
  id: string
  nome: string
  email: string
  cargo: string | null
}

/**
 * Busca usuários por nome para a tela de login (antes de autenticar), via a
 * função `buscar_usuarios_login` (security definer), que só expõe nome/email/
 * cargo de usuários ativos — não a tabela usuarios_perfil inteira.
 */
export async function buscarUsuariosLogin(termo: string): Promise<UsuarioLoginSugestao[]> {
  if (!termo || termo.trim().length < 2) return []
  const { data, error } = await supabase.rpc('buscar_usuarios_login', { termo })
  if (error) throw error
  return (data ?? []) as UsuarioLoginSugestao[]
}

export async function atualizarUsuario(id: string, input: { nome: string; cargo?: string; perfil: Usuario['perfil'] }) {
  const { error } = await supabase
    .from('usuarios_perfil')
    .update({ nome: input.nome, cargo: input.cargo || null, perfil: input.perfil })
    .eq('id', id)
  if (error) throw error
}

/**
 * Troca a senha do próprio usuário logado. O Supabase Auth já exige a
 * sessão ativa (não precisa reenviar a senha atual) — quem garante que é
 * o dono da conta é o próprio login já feito.
 */
export async function atualizarSenhaPropria(novaSenha: string) {
  const { data, error } = await supabase.auth.updateUser({ password: novaSenha })
  if (error) throw error
  // Depois da primeira troca de senha, libera o acesso normal ao sistema.
  const userId = data.user?.id
  if (userId) {
    await supabase.from('usuarios_perfil').update({ precisa_trocar_senha: false }).eq('id', userId)
  }
}

/**
 * Não é possível excluir uma conta do Supabase Auth a partir do navegador
 * (exigiria a service role key, que nunca deve ficar no cliente). Por isso
 * "excluir" um usuário aqui desativa o acesso dele ao sistema.
 */
export async function desativarUsuario(id: string) {
  const { error } = await supabase.from('usuarios_perfil').update({ ativo: false }).eq('id', id)
  if (error) throw error
}

export async function reativarUsuario(id: string) {
  const { error } = await supabase.from('usuarios_perfil').update({ ativo: true }).eq('id', id)
  if (error) throw error
}

// Cliente auxiliar isolado (sessão própria, não persistida) usado apenas para
// criar novos usuários via signUp sem substituir a sessão de quem está logado
// no app (o supabase-js guarda a sessão ativa por instância de cliente).
const supabaseNovoUsuario = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'public-anon-key-placeholder', {
  db: { schema: supabaseSchema },
  auth: {
    storageKey: 'sb-frotas-criar-usuario',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

export async function criarUsuario(input: {
  nome: string
  email: string
  senha: string
  cargo?: string
  perfil: Usuario['perfil']
}) {
  const { data, error } = await supabaseNovoUsuario.auth.signUp({
    email: input.email,
    password: input.senha,
    options: { data: { nome: input.nome } },
  })
  if (error) throw error

  const novoId = data.user?.id
  if (!novoId) throw new Error('Não foi possível criar o usuário.')

  // O trigger on_auth_user_created já criou a linha em usuarios_perfil
  // (perfil padrão "operador"); aqui ajustamos cargo e perfil informados.
  const { error: updError } = await supabase
    .from('usuarios_perfil')
    .update({ cargo: input.cargo || null, perfil: input.perfil })
    .eq('id', novoId)
  if (updError) throw updError
}
