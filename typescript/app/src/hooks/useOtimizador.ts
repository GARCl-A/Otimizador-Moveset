import { useState } from 'react'
import { buildPokemon, getAllNames, getPriorities, getCustoEfetivo } from '../engine/loader'
import { rodarOtimizador } from '../engine/runner'
import { gerarRelatorio } from '../engine/reporter'
import { parseList, resolveNome } from './useCandidatos'
import type { MemberResult } from '../engine/runner'

const LENDARIOS = [
  'Mewtwo', 'Rayquaza', 'Deoxys', 'Latios', 'Palkia', 'Cresselia',
  'Victini', 'Hoopa', 'Tapu Fini', 'Buzzwole', 'Eternatus', 'Victini'
]

export interface Config {
  algoritmo: 'simulated-annealing' | 'genetic'
  fontes: string[]
  tamanhoTime: number
  budget: number
  whitelist: string
  banlist: string
  banirLendarios: boolean
  typeFilter: string
  timeFixoInput: string
  gruposExclusao: string[]
  saTemperatura: number
  saCooling: number
  saIteracoes: number
  gaPopulacao: number
  gaGeracoes: number
  gaMutacao: number
}

export interface ScoreInfo {
  score: number
  scoreMaximo: number
  custoTotal: number
  fontes: string[]
}

export interface ResultadoOtimizacao {
  scoreInfo: ScoreInfo
  relatorio: string
  time: MemberResult[]
}

const CONFIG_INICIAL: Config = {
  algoritmo: 'simulated-annealing',
  fontes: ['Level','Egg'],
  tamanhoTime: 6,
  budget: 10,
  whitelist: '',
  banlist: '',
  banirLendarios: false,
  typeFilter: '',
  timeFixoInput: '',
  gruposExclusao: [],
  saTemperatura: 200.0,
  saCooling: 0.9995,
  saIteracoes: 10000,
  gaPopulacao: 100,
  gaGeracoes: 80,
  gaMutacao: 0.05,
}

export function useOtimizador(todosNomes: string[]) {
  const [config, setConfig] = useState<Config>(CONFIG_INICIAL)
  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [status, setStatus] = useState('')
  const [resultado, setResultado] = useState<ResultadoOtimizacao | null>(null)

  function setConfigField<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  async function rodar(candidatosNomes: string[]) {
    setRodando(true)
    setResultado(null)
    setProgresso(0)
    setStatus('Preparando...')

    try {
      const priorities = getPriorities()
      const banlistArr = parseList(config.banlist)
      if (config.banirLendarios) {
        for (const nome of LENDARIOS) {
          if (!banlistArr.includes(nome)) banlistArr.push(nome)
        }
      }
      const typeFilterArr = parseList(config.typeFilter)

      const custos: Record<string, number> = {}
      const candidatos = candidatosNomes.map(nome => {
        custos[nome] = getCustoEfetivo(nome)
        return buildPokemon(nome, config.fontes)
      })

      const timeFixoNomes = parseList(config.timeFixoInput)
        .map(n => resolveNome(n, todosNomes))
        .filter(Boolean) as string[]
      const timeFixo = timeFixoNomes.map(nome => {
        custos[nome] = getCustoEfetivo(nome)
        return buildPokemon(nome, config.fontes)
      })

      const metaInimigos = todosNomes.map(nome => buildPokemon(nome, ['Level', 'TM']))
      for (const p of metaInimigos) p.optimizeMoveset()

      let etapaAtual = 0
      const totalEtapas = 1 + candidatos.length + candidatos.length * config.tamanhoTime

      const result = await rodarOtimizador(
        candidatos,
        metaInimigos,
        custos,
        priorities,
        {
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
          typeFilter: typeFilterArr,
          gruposExclusao: config.gruposExclusao.map(g => parseList(g)),
          timeFixo,
        },
        {
          onLog: (msg) => {
            etapaAtual++
            setStatus(msg.trim())
            setProgresso(Math.min(99, Math.round(etapaAtual / totalEtapas * 100)))
          }
        }
      )

      setProgresso(100)
      setStatus('Concluído!')

      const scoreInfo: ScoreInfo = {
        score: result.score,
        scoreMaximo: result.scoreMaximo,
        custoTotal: result.custoTotal,
        fontes: config.fontes,
      }

      const relatorio = gerarRelatorio(
        result.time,
        metaInimigos,
        priorities,
        result.score,
        result.scoreMaximo,
        config.budget,
        result.custoTotal,
        config.fontes
      )

      setResultado({ scoreInfo, relatorio, time: result.time })
    } catch (e) {
      setStatus(`ERRO: ${e}`)
    }

    setRodando(false)
  }

  return { config, setConfigField, rodando, progresso, status, resultado, rodar }
}
