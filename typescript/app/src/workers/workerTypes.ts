import type { RunnerConfig } from '../engine/runner'
import type { Priorities, Upgrades } from '../engine/loader'

export interface WorkerInput {
  type: 'START'
  candidatosNomes: string[]
  todosNomes: string[]
  timeFixoNomes: string[]
  custos: Record<string, number>
  priorities: Priorities
  fontes: string[]
  upgrades: Upgrades
  config: Omit<RunnerConfig, 'timeFixo'>
}

export interface WorkerProgressMessage {
  type: 'PROGRESS'
  progresso: number
  status: string
}

export interface WorkerSuccessMessage {
  type: 'SUCCESS'
  result: SerializedRunnerResult
}

export interface WorkerErrorMessage {
  type: 'ERROR'
  message: string
}

export type WorkerOutput = WorkerProgressMessage | WorkerSuccessMessage | WorkerErrorMessage

export interface SerializedMemberResult {
  pokemonName: string
  movesetNames: string[]
  custo: number
  scoreIndividual: number
}

export interface SerializedRunnerResult {
  time: SerializedMemberResult[]
  score: number
  scoreMaximo: number
  custoTotal: number
}
