// Tipos centrais do domínio Boxer-Frotas.
// Este arquivo espelha o desenho das tabelas Supabase (ver /supabase/schema.sql),
// então trocar a camada de dados mock por consultas reais não deve exigir
// mudanças nesses formatos.

export type VeiculoStatus =
  | 'disponivel'
  | 'em_viagem'
  | 'reservado'
  | 'manutencao'
  | 'bloqueado'
  | 'retornando'

export interface Veiculo {
  id: string
  placa: string
  modelo: string
  ano: number
  cubagem: string
  km: number
  status: VeiculoStatus
  fotoUrl?: string
  tipo: 'frota_propria' | 'transportadora'
}

export interface Motorista {
  id: string
  nome: string
  cnh: string
  categoriaCnh: string
  validadeCnh: string
  telefone: string
  status: 'disponivel' | 'em_viagem' | 'folga' | 'ferias'
  avatarUrl?: string
  viagensRealizadas: number
  /** Id do login (auth.users) vinculado a este motorista, quando houver — permite abrir o modo motorista. */
  userId?: string
}

export type ViagemStatus = 'programada' | 'em_viagem' | 'concluida' | 'cancelada'

export interface Viagem {
  id: string
  numero: string
  data: string
  veiculoId: string
  motoristaId: string
  origem: string
  destino: string
  saidaPrevista: string
  chegadaPrevista: string
  saidaReal?: string
  chegadaReal?: string
  kmSaida?: number
  kmChegada?: number
  km?: number
  status: ViagemStatus
  receita?: number
}

export type ReservaTipo = 'viagem' | 'reserva' | 'retorno' | 'manutencao' | 'bloqueio'

export interface AgendaItem {
  id: string
  veiculoId: string
  tipo: ReservaTipo
  titulo: string
  motoristaId?: string
  motoristaNome?: string
  inicio: string // ISO datetime
  fim: string // ISO datetime
  observacao?: string
  /** Id da viagem criada/sincronizada automaticamente a partir deste item (quando tipo é 'viagem' ou 'reserva' e há veículo + motorista). */
  viagemId?: string
}

export type ChecklistResultado = 'ok' | 'nao_ok' | 'na'

export interface ChecklistItem {
  id: string
  categoria: string
  descricao: string
  critico?: boolean
  resultado?: ChecklistResultado
  observacao?: string
  fotoUrl?: string
}

export interface ChecklistExecucao {
  id: string
  veiculoId: string
  motoristaId: string
  // O checklist é feito uma única vez (vistoria mensal do veículo) — não há
  // distinção entre "antes da viagem" e "depois da viagem".
  momento: 'mensal'
  data: string
  itens: ChecklistItem[]
  finalizado: boolean
}

export interface AbastecimentoRegistro {
  id: string
  veiculoId: string
  data: string
  litros: number
  valorTotal: number
  km: number
  posto?: string
  /** 'diesel' (combustível) ou 'arla' (Arla/AdBlue) — registrados na mesma tabela. */
  tipo: 'diesel' | 'arla'
}

export interface CustoViagem {
  id: string
  viagemId: string
  /** Números das notas fiscais da carga — preenchido pelo motorista ao iniciar a viagem. */
  notas?: string
  /** Deveria vir do ZenERP a partir do número da nota; por enquanto é manual. */
  valorNota?: number
  /** Peso da nota fiscal (kg); por enquanto é manual (deveria vir do ZenERP). */
  peso?: number
  /** Cliente/destino da nota fiscal; por enquanto é manual (deveria vir do ZenERP). */
  destinoNota?: string
  /** Custo do combustível gasto na viagem. */
  combustivel: number
  /** Preenchido pelo motorista ao finalizar a viagem. */
  pedagio: number
  /** Calculado automaticamente: 0,045% do valor da nota. */
  seguroCarga: number
}

/** Valor padrão de pedágio por cliente (ex.: Embragem, Libra) — usado para
 *  substituir na tela Custo de Viagem o valor que o motorista informou,
 *  quando o destino da nota bate com o nome de um cliente cadastrado aqui. */
export interface ClientePedagioPadrao {
  id: string
  cliente: string
  valorPadrao: number
  atualizadoEm: string
}

export type ManutencaoTipo = 'preventiva' | 'corretiva'
export type ManutencaoStatus = 'agendada' | 'em_andamento' | 'concluida'

export interface ManutencaoRegistro {
  id: string
  veiculoId: string
  tipo: ManutencaoTipo
  descricao: string
  status: ManutencaoStatus
  dataInicio: string
  dataFim?: string
  custo?: number
  oficina?: string
}

export type DocumentoTipo = 'CRLV' | 'Licenciamento' | 'Seguro' | 'CNH' | 'Outros'

export interface Documento {
  id: string
  entidade: 'veiculo' | 'motorista'
  entidadeId: string
  tipo: DocumentoTipo
  numero?: string
  validade?: string
  status: 'ok' | 'vencendo' | 'vencido'
  arquivoUrl?: string
}

export interface Notificacao {
  id: string
  titulo: string
  descricao: string
  tipo: 'alerta' | 'info' | 'sucesso' | 'erro'
  lida: boolean
  data: string
}

export interface Usuario {
  id: string
  nome: string
  email: string
  cargo: string
  perfil: 'gestor' | 'operador' | 'operador_comex' | 'motorista'
  avatarUrl?: string
  ativo: boolean
  /** true até o usuário trocar a senha padrão no primeiro acesso. */
  precisaTrocarSenha: boolean
}
