import { useState, useRef, useCallback, useEffect } from 'react'
import { getPriorities, getCustoEfetivo, getUpgrades } from '../engine/loader'
import { parseList, resolveNome, candidatosNomesDe } from './useCandidatos'
import { BATCH_CASES, configDoCaso } from './batchCases'
import type { Config } from './useOtimizador'
import type { ModelWeights } from '../engine/mlp'
import type { MixedDatasetConfig } from '../engine/nnDataset'
import type { ExpMethod, MethodAggregate, ScatterPoint } from '../engine/experiments'
import type {
  PoolConfig,
  RunExperimentsInput,
  GenerateDatasetInput,
  BatchCasePool,
  BatchGenerateInput,
  BatchRunInput,
  ExperimentWorkerOutput,
  FlatRun,
} from '../workers/experimentTypes'

function construirPoolConfig(candidatosNomes: string[], config: Config, todosNomes: string[]): PoolConfig {
  const priorities = getPriorities()
  const custos: Record<string, number> = {}
  for (const nome of candidatosNomes) custos[nome] = getCustoEfetivo(nome)
  const timeFixoNomes = (parseList(config.timeFixoInput)
    .map(n => resolveNome(n, todosNomes))
    .filter(Boolean) as string[])
  for (const nome of timeFixoNomes) custos[nome] = getCustoEfetivo(nome)

  return {
    candidatosNomes,
    todosNomes,
    timeFixoNomes,
    custos,
    priorities,
    fontes: config.fontes,
    upgrades: getUpgrades(),
    evalParams: { priorizarHP: config.priorizarHP, coberturasDupla: config.coberturasDupla },
    tamanhoTime: config.tamanhoTime,
    budget: config.budget,
    gruposExclusao: config.gruposExclusao.map(g => parseList(g)),
    banirRecoil: config.banirRecoil,
    banirLock: config.banirLock,
  }
}

// Constrói os PoolConfig dos 6 casos aplicando os deltas de cada um sobre a Config base.
function construirCasosPool(baseConfig: Config, todosNomes: string[]): BatchCasePool[] {
  return BATCH_CASES.map(caso => {
    const cfg = configDoCaso(baseConfig, caso)
    const candidatosNomes = candidatosNomesDe({
      todosNomes,
      whitelist: cfg.whitelist,
      banlist: cfg.banlist,
      banirLendarios: cfg.banirLendarios,
      typeFilter: cfg.typeFilter,
      budget: cfg.budget,
    })
    return { id: caso.id, pool: construirPoolConfig(candidatosNomes, cfg, todosNomes) }
  })
}

function baixarTexto(conteudo: string, filename: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export interface ExperimentState {
  rodando: boolean
  progresso: number
  status: string
  runs: FlatRun[]
  aggregates: MethodAggregate[]
  scatter: ScatterPoint[]
  datasetInfo: { nSamples: number } | null
  batchRuns: FlatRun[]
  batchAggregates: MethodAggregate[]
}

export function useExperiments(todosNomes: string[]) {
  const [state, setState] = useState<ExperimentState>({
    rodando: false,
    progresso: 0,
    status: '',
    runs: [],
    aggregates: [],
    scatter: [],
    datasetInfo: null,
    batchRuns: [],
    batchAggregates: [],
  })
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => () => { workerRef.current?.terminate() }, [])

  const novoWorker = useCallback(() => {
    workerRef.current?.terminate()
    const worker = new Worker(new URL('../workers/experiments.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    return worker
  }, [])

  const cancelar = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setState(s => ({ ...s, rodando: false, status: 'Cancelado.' }))
  }, [])

  const rodarExperimentos = useCallback(
    (
      candidatosNomes: string[],
      config: Config,
      methods: ExpMethod[],
      nRuns: number,
      seed: number,
      modelWeights: ModelWeights | null,
      kList: number[]
    ) => {
      const worker = novoWorker()
      setState({ rodando: true, progresso: 0, status: 'Preparando...', runs: [], aggregates: [], scatter: [], datasetInfo: null, batchRuns: [], batchAggregates: [] })

      const msg: RunExperimentsInput = {
        type: 'RUN_EXPERIMENTS',
        pool: construirPoolConfig(candidatosNomes, config, todosNomes),
        methods,
        nRuns,
        seed,
        kList,
        saIteracoes: config.saIteracoes,
        gaPopulacao: config.gaPopulacao,
        gaGeracoes: config.gaGeracoes,
        gaMutacao: config.gaMutacao,
        scatterM: 200,
        modelWeights,
      }
      worker.postMessage(msg)

      worker.onmessage = (event: MessageEvent<ExperimentWorkerOutput>) => {
        const out = event.data
        if (out.type === 'PROGRESS') {
          setState(s => ({ ...s, progresso: out.total ? Math.round((out.done / out.total) * 100) : 0, status: out.label }))
        } else if (out.type === 'RUN') {
          setState(s => ({ ...s, runs: [...s.runs, out.run] }))
        } else if (out.type === 'DONE') {
          setState(s => ({ ...s, rodando: false, progresso: 100, status: 'Concluído!', aggregates: out.aggregates, runs: out.runs, scatter: out.scatter }))
          workerRef.current = null
        } else if (out.type === 'ERROR') {
          setState(s => ({ ...s, rodando: false, status: `ERRO: ${out.message}` }))
          workerRef.current = null
        }
      }
      worker.onerror = e => {
        setState(s => ({ ...s, rodando: false, status: `ERRO: ${e.message}` }))
        workerRef.current = null
      }
    },
    [novoWorker, todosNomes]
  )

  const gerarDataset = useCallback(
    (candidatosNomes: string[], config: Config, nTeams: number, seed: number, datasetKMax: number) => {
      const worker = novoWorker()
      setState(s => ({ ...s, rodando: true, progresso: 0, status: 'Gerando dataset...', datasetInfo: null }))

      const msg: GenerateDatasetInput = {
        type: 'GENERATE_DATASET',
        pool: construirPoolConfig(candidatosNomes, config, todosNomes),
        nTeams,
        seed,
        datasetKMax,
      }
      worker.postMessage(msg)

      worker.onmessage = (event: MessageEvent<ExperimentWorkerOutput>) => {
        const out = event.data
        if (out.type === 'PROGRESS') {
          setState(s => ({ ...s, status: out.label }))
        } else if (out.type === 'DATASET') {
          baixarTexto(out.csv, 'dataset.csv', 'text/csv')
          setState(s => ({ ...s, rodando: false, progresso: 100, status: `Dataset: ${out.nSamples} amostras (dataset.csv baixado).`, datasetInfo: { nSamples: out.nSamples } }))
          workerRef.current = null
        } else if (out.type === 'ERROR') {
          setState(s => ({ ...s, rodando: false, status: `ERRO: ${out.message}` }))
          workerRef.current = null
        }
      }
      worker.onerror = e => {
        setState(s => ({ ...s, rodando: false, status: `ERRO: ${e.message}` }))
        workerRef.current = null
      }
    },
    [novoWorker, todosNomes]
  )

  // ---- Exp3: dataset MISTO (aleatórios + times bons + vizinhos) ----
  const gerarDatasetMisto = useCallback(
    (candidatosNomes: string[], config: Config, mix: MixedDatasetConfig, seed: number) => {
      const worker = novoWorker()
      setState(s => ({ ...s, rodando: true, progresso: 0, status: 'Gerando dataset misto (Exp3)...', datasetInfo: null }))

      const msg: GenerateDatasetInput = {
        type: 'GENERATE_DATASET',
        pool: construirPoolConfig(candidatosNomes, config, todosNomes),
        nTeams: 0,
        seed,
        mixed: mix,
      }
      worker.postMessage(msg)

      worker.onmessage = (event: MessageEvent<ExperimentWorkerOutput>) => {
        const out = event.data
        if (out.type === 'PROGRESS') {
          setState(s => ({ ...s, progresso: out.total ? Math.round((out.done / out.total) * 100) : 0, status: out.label }))
        } else if (out.type === 'DATASET') {
          baixarTexto(out.csv, 'dataset_exp3.csv', 'text/csv')
          setState(s => ({ ...s, rodando: false, progresso: 100, status: `Dataset Exp3: ${out.nSamples} amostras (dataset_exp3.csv baixado).`, datasetInfo: { nSamples: out.nSamples } }))
          workerRef.current = null
        } else if (out.type === 'ERROR') {
          setState(s => ({ ...s, rodando: false, status: `ERRO: ${out.message}` }))
          workerRef.current = null
        }
      }
      worker.onerror = e => {
        setState(s => ({ ...s, rodando: false, status: `ERRO: ${e.message}` }))
        workerRef.current = null
      }
    },
    [novoWorker, todosNomes]
  )

  // ---- Modo BATCH (6 casos de uma vez) ----
  const gerarDatasetBatch = useCallback(
    (config: Config, nTeams: number, seed: number, datasetKMax: number) => {
      const worker = novoWorker()
      setState(s => ({ ...s, rodando: true, progresso: 0, status: 'Gerando datasets (6 casos)...', datasetInfo: null }))

      const msg: BatchGenerateInput = {
        type: 'BATCH_GENERATE',
        cases: construirCasosPool(config, todosNomes),
        nTeams,
        seed,
        datasetKMax,
      }
      worker.postMessage(msg)

      worker.onmessage = (event: MessageEvent<ExperimentWorkerOutput>) => {
        const out = event.data
        if (out.type === 'PROGRESS') {
          setState(s => ({ ...s, progresso: out.total ? Math.round((out.done / out.total) * 100) : 0, status: out.label }))
        } else if (out.type === 'BATCH_DATASET') {
          baixarTexto(out.csv, 'dataset_all.csv', 'text/csv')
          const resumo = out.perCase.map(p => `${p.id}=${p.nSamples}`).join('  ·  ')
          setState(s => ({ ...s, rodando: false, progresso: 100, status: `dataset_all.csv baixado — ${resumo}` }))
          workerRef.current = null
        } else if (out.type === 'ERROR') {
          setState(s => ({ ...s, rodando: false, status: `ERRO: ${out.message}` }))
          workerRef.current = null
        }
      }
      worker.onerror = e => {
        setState(s => ({ ...s, rodando: false, status: `ERRO: ${e.message}` }))
        workerRef.current = null
      }
    },
    [novoWorker, todosNomes]
  )

  const rodarExperimentosBatch = useCallback(
    (
      config: Config,
      methods: ExpMethod[],
      nRuns: number,
      seed: number,
      kList: number[],
      models: Record<string, ModelWeights>
    ) => {
      const worker = novoWorker()
      setState(s => ({ ...s, rodando: true, progresso: 0, status: 'Rodando 6 casos...', batchRuns: [], batchAggregates: [] }))

      const msg: BatchRunInput = {
        type: 'BATCH_RUN',
        cases: construirCasosPool(config, todosNomes),
        models,
        methods,
        nRuns,
        seed,
        kList,
        saIteracoes: config.saIteracoes,
        gaPopulacao: config.gaPopulacao,
        gaGeracoes: config.gaGeracoes,
        gaMutacao: config.gaMutacao,
      }
      worker.postMessage(msg)

      worker.onmessage = (event: MessageEvent<ExperimentWorkerOutput>) => {
        const out = event.data
        if (out.type === 'PROGRESS') {
          setState(s => ({ ...s, progresso: out.total ? Math.round((out.done / out.total) * 100) : 0, status: out.label }))
        } else if (out.type === 'BATCH_DONE') {
          setState(s => ({ ...s, rodando: false, progresso: 100, status: 'Batch concluído!', batchRuns: out.runs, batchAggregates: out.aggregates }))
          workerRef.current = null
        } else if (out.type === 'ERROR') {
          setState(s => ({ ...s, rodando: false, status: `ERRO: ${out.message}` }))
          workerRef.current = null
        }
        // mensagens 'RUN' são ignoradas no batch (evita milhares de re-renders)
      }
      worker.onerror = e => {
        setState(s => ({ ...s, rodando: false, status: `ERRO: ${e.message}` }))
        workerRef.current = null
      }
    },
    [novoWorker, todosNomes]
  )

  return { ...state, rodarExperimentos, gerarDataset, gerarDatasetMisto, gerarDatasetBatch, rodarExperimentosBatch, cancelar }
}
