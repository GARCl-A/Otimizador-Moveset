import { useState, useRef, useCallback, useEffect } from 'react'
import { getPriorities, getCustoEfetivo, getUpgrades } from '../engine/loader'
import { parseList, resolveNome } from './useCandidatos'
import type { Config } from './useOtimizador'
import type { ModelWeights } from '../engine/mlp'
import type { ExpMethod, MethodAggregate, ScatterPoint } from '../engine/experiments'
import type {
  PoolConfig,
  RunExperimentsInput,
  GenerateDatasetInput,
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
      modelWeights: ModelWeights | null
    ) => {
      const worker = novoWorker()
      setState({ rodando: true, progresso: 0, status: 'Preparando...', runs: [], aggregates: [], scatter: [], datasetInfo: null })

      const msg: RunExperimentsInput = {
        type: 'RUN_EXPERIMENTS',
        pool: construirPoolConfig(candidatosNomes, config, todosNomes),
        methods,
        nRuns,
        seed,
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
    (candidatosNomes: string[], config: Config, nTeams: number, seed: number) => {
      const worker = novoWorker()
      setState(s => ({ ...s, rodando: true, progresso: 0, status: 'Gerando dataset...', datasetInfo: null }))

      const msg: GenerateDatasetInput = {
        type: 'GENERATE_DATASET',
        pool: construirPoolConfig(candidatosNomes, config, todosNomes),
        nTeams,
        seed,
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

  return { ...state, rodarExperimentos, gerarDataset, cancelar }
}
