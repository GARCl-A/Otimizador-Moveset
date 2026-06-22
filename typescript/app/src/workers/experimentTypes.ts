import type { Priorities, Upgrades } from '../engine/loader'
import type { EvalParams } from '../engine/optimizer'
import type { ModelWeights } from '../engine/mlp'
import type { ExpMethod, SingleRun, MethodAggregate, ScatterPoint } from '../engine/experiments'

// Configuração do pool/cenário compartilhada por experimentos e geração de dataset.
export interface PoolConfig {
  candidatosNomes: string[]
  todosNomes: string[]
  timeFixoNomes: string[]
  custos: Record<string, number>
  priorities: Priorities
  fontes: string[]
  upgrades: Upgrades
  evalParams: EvalParams
  tamanhoTime: number
  budget: number
  gruposExclusao: string[][]
  banirRecoil: boolean
  banirLock: boolean
}

export interface RunExperimentsInput {
  type: 'RUN_EXPERIMENTS'
  pool: PoolConfig
  methods: ExpMethod[]
  nRuns: number
  seed: number
  saIteracoes?: number
  gaPopulacao?: number
  gaGeracoes?: number
  gaMutacao?: number
  scatterM?: number
  modelWeights?: ModelWeights | null
}

export interface GenerateDatasetInput {
  type: 'GENERATE_DATASET'
  pool: PoolConfig
  nTeams: number
  seed: number
}

export type ExperimentWorkerInput = RunExperimentsInput | GenerateDatasetInput

export interface FlatRun extends SingleRun {
  method: ExpMethod
  run: number
}

export interface ExpProgressMsg {
  type: 'PROGRESS'
  done: number
  total: number
  label: string
}

export interface ExpRunMsg {
  type: 'RUN'
  run: FlatRun
}

export interface ExpDoneMsg {
  type: 'DONE'
  aggregates: MethodAggregate[]
  runs: FlatRun[]
  scatter: ScatterPoint[]
}

export interface DatasetDoneMsg {
  type: 'DATASET'
  csv: string
  nSamples: number
}

export interface ExpErrorMsg {
  type: 'ERROR'
  message: string
}

export type ExperimentWorkerOutput = ExpProgressMsg | ExpRunMsg | ExpDoneMsg | DatasetDoneMsg | ExpErrorMsg
