import type { Priorities, Upgrades } from '../engine/loader'
import type { EvalParams } from '../engine/optimizer'
import type { ModelWeights } from '../engine/mlp'
import type { MixedDatasetConfig } from '../engine/nnDataset'
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
  kList?: number[] // Top-K a varrer nos gulosos (ex.: [1,3,5,10]); default [1]
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
  datasetKMax?: number // variedade de moveset no dataset (top-K amostrado); default 1
  mixed?: MixedDatasetConfig // se presente, gera dataset MISTO (Exp3) em vez de só aleatório
}

// ---- Modo BATCH: os 6 casos de uma vez ----
export interface BatchCasePool {
  id: string
  pool: PoolConfig
}

export interface BatchGenerateInput {
  type: 'BATCH_GENERATE'
  cases: BatchCasePool[]
  nTeams: number
  seed: number
  datasetKMax?: number
}

export interface BatchRunInput {
  type: 'BATCH_RUN'
  cases: BatchCasePool[]
  models: Record<string, ModelWeights> // caseId -> pesos (casos sem modelo pulam greedy-nn)
  methods: ExpMethod[]
  nRuns: number
  seed: number
  kList?: number[]
  saIteracoes?: number
  gaPopulacao?: number
  gaGeracoes?: number
  gaMutacao?: number
}

export type ExperimentWorkerInput =
  | RunExperimentsInput
  | GenerateDatasetInput
  | BatchGenerateInput
  | BatchRunInput

export interface FlatRun extends SingleRun {
  method: ExpMethod
  run: number
  caseId?: string // preenchido no modo batch
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

export interface BatchDatasetDoneMsg {
  type: 'BATCH_DATASET'
  csv: string // dataset_all.csv (coluna 'case' + f0..fN + target)
  perCase: { id: string; nSamples: number }[]
}

export interface BatchDoneMsg {
  type: 'BATCH_DONE'
  runs: FlatRun[]
  aggregates: MethodAggregate[]
}

export interface ExpErrorMsg {
  type: 'ERROR'
  message: string
}

export type ExperimentWorkerOutput =
  | ExpProgressMsg
  | ExpRunMsg
  | ExpDoneMsg
  | DatasetDoneMsg
  | BatchDatasetDoneMsg
  | BatchDoneMsg
  | ExpErrorMsg
