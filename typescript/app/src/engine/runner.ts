import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import { construirCaches, otimizar, otimizarTimeSA, calcularScoreTime } from './optimizer'
import type { WarmStart, ProgressCallback, EvalParams } from './optimizer'
import { otimizarTimeGA } from './geneticOptimizer'

export interface RunnerConfig {
  algoritmo: 'simulated-annealing' | 'genetic'
  tamanhoTime: number
  budget: number
  saTemperatura: number
  saCooling: number
  saIteracoes: number
  gaPopulacao: number
  gaGeracoes: number
  gaMutacao: number
  banlist: string[]
  typeFilter: string[]
  gruposExclusao: string[][]
  timeFixo: Pokemon[]
  banirRecoil: boolean
  banirLock: boolean
  evalParams: EvalParams
}

export interface MemberResult {
  pokemon: Pokemon
  moveset: Move[]
  custo: number
  scoreIndividual: number
}

export interface RunnerResult {
  time: MemberResult[]
  score: number
  scoreMaximo: number
  custoTotal: number
}

export interface RunnerCallbacks {
  onLog?: (msg: string) => void
  onProgress?: ProgressCallback
}

function refinarMovesInuteis(
  time: Pokemon[],
  movesets: Move[][],
  meta: Pokemon[],
  priorities: Priorities,
  evalParams: EvalParams
): { movesets: Move[][]; score: number } {
  const arrays = construirCaches(time, meta, priorities)
  const pokeIndices = time.map(p => arrays.pokeIdx.get(p.name)!)

  const toIndices = (ms: Move[][], pis: number[]) =>
    ms.map((moveset, i) =>
      moveset.map(m => arrays.moveIdx[pis[i]].get(m.name) ?? -1).filter(j => j >= 0)
    )

  let estadoAtual = movesets.map(ms => [...ms])
  let scoreAtual = calcularScoreTime(pokeIndices, toIndices(estadoAtual, pokeIndices), arrays, evalParams)

  let melhorou = true
  while (melhorou) {
    melhorou = false

    for (let pi = 0; pi < time.length; pi++) {
      const iPoke = pokeIndices[pi]
      const moveset = estadoAtual[pi]
      const indicesAtivos = toIndices(estadoAtual, pokeIndices)

      for (let mi = 0; mi < moveset.length; mi++) {
        const jAtivo = arrays.moveIdx[iPoke].get(moveset[mi].name) ?? -1
        if (jAtivo < 0) continue

        const contribuicao = (() => {
          const semEste = indicesAtivos.map((ids, k) =>
            k === pi ? ids.filter(j => j !== jAtivo) : ids
          )
          return scoreAtual - calcularScoreTime(pokeIndices, semEste, arrays, evalParams)
        })()

        if (contribuicao > 0) continue

        const movesNaPool = arrays.moveLists[iPoke]
        const usados = new Set(moveset.map(m => arrays.moveIdx[iPoke].get(m.name) ?? -1))

        for (let jNovo = 0; jNovo < movesNaPool.length; jNovo++) {
          if (usados.has(jNovo)) continue

          const novoMoveset = [...moveset]
          novoMoveset[mi] = movesNaPool[jNovo]
          const novoEstado = estadoAtual.map((ms, k) => k === pi ? novoMoveset : ms)
          const novoScore = calcularScoreTime(pokeIndices, toIndices(novoEstado, pokeIndices), arrays, evalParams)

          if (novoScore > scoreAtual) {
            scoreAtual = novoScore
            estadoAtual = novoEstado
            melhorou = true
            break
          }
        }
      }
    }
  }

  return { movesets: estadoAtual, score: scoreAtual }
}

export async function rodarOtimizador(
  candidatos: Pokemon[],
  metaInimigos: Pokemon[],
  custos: Record<string, number>,
  priorities: Priorities,
  config: RunnerConfig,
  callbacks: RunnerCallbacks = {}
): Promise<RunnerResult> {
  const { algoritmo, tamanhoTime, budget, saTemperatura, saCooling, saIteracoes, gaPopulacao, gaGeracoes, gaMutacao, gruposExclusao, timeFixo, banirRecoil, banirLock, evalParams } = config
  const { onLog = () => {}, onProgress } = callbacks
  const pontosPorVitoria = (evalParams.priorizarHP ? 4 : 1) + (evalParams.priorizarHP ? 1 : 0) + (evalParams.coberturasDupla ? 2 : 0)
  const scoreMaximo = metaInimigos.length * pontosPorVitoria

  for (const p of candidatos) p.optimizeMoveset(banirRecoil, banirLock, priorities)
  for (const p of timeFixo) p.optimizeMoveset(banirRecoil, banirLock, priorities)

  const todosParaCache = [...candidatos, ...timeFixo.filter(p => !candidatos.some(c => c.name === p.name))]

  const arraysGlobal = construirCaches(todosParaCache, metaInimigos, priorities)

  const scoresIndividuais: WarmStart = {}
  for (const pokemon of todosParaCache) {
    const { moveset, score } = otimizar(pokemon, arraysGlobal, evalParams)
    scoresIndividuais[pokemon.name] = { moveset, score }
  }

  if (algoritmo === 'genetic') {
    onLog('Iniciando otimização com Algoritmo Genético...')

    const result = otimizarTimeGA(
      todosParaCache,
      metaInimigos,
      custos,
      priorities,
      tamanhoTime,
      budget,
      gruposExclusao,
      timeFixo,
      {
        populationSize: gaPopulacao,
        generations: gaGeracoes,
        mutationRate: gaMutacao,
        warmStart: scoresIndividuais,
        onProgress,
        evalParams,
      }
    )

    const custoTotal = result.time.reduce((acc, p) => acc + (custos[p.name] ?? 0), 0)

    onLog('Refinando moves inúteis...')
    const refinado = refinarMovesInuteis(result.time, result.movesets, metaInimigos, priorities, evalParams)

    return {
      time: result.time.map((p, i) => ({
        pokemon: p,
        moveset: refinado.movesets[i],
        custo: custos[p.name] ?? 0,
        scoreIndividual: scoresIndividuais[p.name]?.score ?? 0,
      })),
      score: refinado.score,
      scoreMaximo,
      custoTotal,
    }
  }

  const timeAtual: Pokemon[] = [...timeFixo]
  const movesetsAtual: Move[][] = timeFixo.map(p => scoresIndividuais[p.name]?.moveset ?? p.moveset.slice(0, 4))
  let budgetRestante = timeFixo.reduce((acc, p) => acc - (custos[p.name] ?? 0), budget)
  let scoreAtual = timeFixo.length > 0
    ? calcularScoreTime(timeFixo.map(p => arraysGlobal.pokeIdx.get(p.name)!), movesetsAtual.map((ms, i) => ms.map(m => arraysGlobal.moveIdx[arraysGlobal.pokeIdx.get(timeFixo[i].name)!].get(m.name) ?? 0)), arraysGlobal)
    : 0.0

  const slotsRestantes = tamanhoTime - timeFixo.length

  for (let rodada = 0; rodada < slotsRestantes; rodada++) {
    onLog(`\n=== Rodada ${rodada + 1} ===`)

    const candidatosValidos = candidatos.filter(p => {
      if (timeAtual.includes(p)) return false
      if ((custos[p.name] ?? 999) > budgetRestante) return false
      for (const grupo of gruposExclusao) {
        if (grupo.includes(p.name) && timeAtual.some(t => grupo.includes(t.name))) return false
      }
      return true
    })

    if (!candidatosValidos.length) {
      onLog(`Sem candidatos válidos no budget restante (${budgetRestante}pt). Encerrando.`)
      break
    }

    let melhorPokemon: Pokemon | null = null
    let melhorMovesets: Move[][] | null = null
    let melhorScore = scoreAtual

    for (const poke of candidatosValidos) {
      let scoreTeste: number
      let movesetsTeste: Move[][]

      const timeTeste = [...timeAtual, poke]

      if (timeAtual.length === 0) {
        // sem fixos e primeira rodada: usa score individual
        const ind = scoresIndividuais[poke.name]
        scoreTeste = ind.score
        movesetsTeste = [ind.moveset]
      } else {
        // sempre usa SA quando há fixos ou já tem membros no time
        onLog(`  Testando ${poke.name}...`)
        const result = otimizarTimeSA(timeTeste, metaInimigos, priorities, {
          maxIteracoes: saIteracoes,
          temperaturaInicial: saTemperatura,
          coolingRate: saCooling,
          warmStart: scoresIndividuais,
          onProgress,
          evalParams,
        })
        scoreTeste = result.score
        movesetsTeste = result.movesets
      }

      if (scoreTeste > melhorScore) {
        melhorScore = scoreTeste
        melhorPokemon = poke
        melhorMovesets = movesetsTeste
      }
    }

    if (!melhorPokemon || !melhorMovesets) {
      onLog(`Nenhum candidato melhora o time com ${timeAtual.length} membros. Encerrando.`)
      break
    }

    const custoEscolhido = custos[melhorPokemon.name] ?? 0
    budgetRestante -= custoEscolhido
    timeAtual.push(melhorPokemon)
    movesetsAtual.splice(0, movesetsAtual.length, ...melhorMovesets)
    scoreAtual = melhorScore

    if (scoreAtual >= scoreMaximo) {
      onLog('Score máximo atingido, encerrando.')
      break
    }
  }

  const custoTotal = timeAtual.reduce((acc, p) => acc + (custos[p.name] ?? 0), 0)

  onLog('Refinando moves inúteis...')
  const refinado = refinarMovesInuteis(timeAtual, movesetsAtual, metaInimigos, priorities, evalParams)

  return {
    time: timeAtual.map((p, i) => ({
      pokemon: p,
      moveset: refinado.movesets[i],
      custo: custos[p.name] ?? 0,
      scoreIndividual: scoresIndividuais[p.name]?.score ?? 0,
    })),
    score: refinado.score,
    scoreMaximo,
    custoTotal,
  }
}
