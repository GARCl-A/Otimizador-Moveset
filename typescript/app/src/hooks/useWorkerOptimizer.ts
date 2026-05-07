import { useState, useRef, useCallback, useEffect } from 'react'
import { buildPokemon, getPriorities, getCustoEfetivo, getUpgrades } from '../engine/loader'
import { gerarRelatorio } from '../engine/reporter'
import { parseList, resolveNome } from './useCandidatos'
import type { Config, ResultadoOtimizacao, ScoreInfo } from './useOtimizador'
import type { WorkerInput, WorkerOutput, SerializedRunnerResult } from '../workers/workerTypes'
import type { MemberResult } from '../engine/runner'

const LENDARIOS = [
  'Mewtwo', 'Rayquaza', 'Deoxys', 'Latios', 'Palkia', 'Cresselia',
  'Victini', 'Hoopa', 'Tapu Fini', 'Buzzwole', 'Eternatus',
]

function reconstruirResultado(
  serialized: SerializedRunnerResult,
  todosNomes: string[],
  fontes: string[],
  budget: number,
  priorities: ReturnType<typeof getPriorities>
): ResultadoOtimizacao {
  const metaInimigos = todosNomes.map(nome => buildPokemon(nome, ['Level', 'TM']))
  for (const p of metaInimigos) p.optimizeMoveset()

  const time: MemberResult[] = serialized.time.map(m => {
    const pokemon = buildPokemon(m.pokemonName, fontes)
    const moveset = pokemon.moveset.filter(mv => m.movesetNames.includes(mv.name))
    return { pokemon, moveset, custo: m.custo, scoreIndividual: m.scoreIndividual }
  })

  const scoreInfo: ScoreInfo = {
    score: serialized.score,
    scoreMaximo: serialized.scoreMaximo,
    custoTotal: serialized.custoTotal,
    fontes,
  }

  const relatorio = gerarRelatorio(
    time,
    metaInimigos,
    priorities,
    serialized.score,
    serialized.scoreMaximo,
    budget,
    serialized.custoTotal,
    fontes
  )

  return { scoreInfo, relatorio, time }
}

export function useWorkerOptimizer(todosNomes: string[]) {
  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [status, setStatus] = useState('')
  const [resultado, setResultado] = useState<ResultadoOtimizacao | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => () => { workerRef.current?.terminate() }, [])

  const cancelar = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setRodando(false)
    setStatus('Cancelado.')
  }, [])

  const rodar = useCallback((candidatosNomes: string[], config: Config) => {
    workerRef.current?.terminate()

    const worker = new Worker(
      new URL('../workers/optimizer.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    setRodando(true)
    setResultado(null)
    setProgresso(0)
    setStatus('Preparando...')

    const priorities = getPriorities()
    const banlistArr = parseList(config.banlist)
    if (config.banirLendarios) {
      for (const nome of LENDARIOS) {
        if (!banlistArr.includes(nome)) banlistArr.push(nome)
      }
    }

    const custos: Record<string, number> = {}
    for (const nome of candidatosNomes) custos[nome] = getCustoEfetivo(nome)

    const timeFixoNomes = parseList(config.timeFixoInput)
      .map(n => resolveNome(n, todosNomes))
      .filter(Boolean) as string[]
    for (const nome of timeFixoNomes) custos[nome] = getCustoEfetivo(nome)

    const message: WorkerInput = {
      type: 'START',
      candidatosNomes,
      todosNomes,
      timeFixoNomes,
      custos,
      priorities,
      fontes: config.fontes,
      upgrades: getUpgrades(),
      config: {
        algoritmo: config.algoritmo,
        tamanhoTime: config.tamanhoTime,
        budget: config.budget,
        saTemperatura: config.saTemperatura,
        saCooling: config.saCooling,
        saIteracoes: config.saIteracoes,
        gaPopulacao: config.gaPopulacao,
        gaGeracoes: config.gaGeracoes,
        gaMutacao: config.gaMutacao,
        banlist: banlistArr,
        typeFilter: parseList(config.typeFilter),
        gruposExclusao: config.gruposExclusao.map(g => parseList(g)),
      },
    }

    worker.postMessage(message)

    worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
      const msg = event.data

      if (msg.type === 'PROGRESS') {
        setProgresso(msg.progresso)
        setStatus(msg.status)
        return
      }

      if (msg.type === 'ERROR') {
        setStatus(`ERRO: ${msg.message}`)
        setRodando(false)
        workerRef.current = null
        return
      }

      if (msg.type === 'SUCCESS') {
        const res = reconstruirResultado(msg.result, todosNomes, config.fontes, config.budget, priorities)
        setProgresso(100)
        setStatus('Concluído!')
        setResultado(res)
        setRodando(false)
        workerRef.current = null
      }
    }

    worker.onerror = (e) => {
      setStatus(`ERRO: ${e.message}`)
      setRodando(false)
      workerRef.current = null
    }
  }, [todosNomes])

  return { rodando, progresso, status, resultado, rodar, cancelar }
}
