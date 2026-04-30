import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import { construirCaches, otimizar, otimizarTimeSA } from './optimizer'
import type { WarmStart, ProgressCallback } from './optimizer'

export interface RunnerConfig {
  fontes: string[]
  tamanhoTime: number
  budget: number
  saTemperatura: number
  saCooling: number
  saIteracoes: number
  banlist: string[]
  typeFilter: string[]
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

export async function rodarOtimizador(
  candidatos: Pokemon[],
  metaInimigos: Pokemon[],
  custos: Record<string, number>,
  priorities: Priorities,
  config: RunnerConfig,
  callbacks: RunnerCallbacks = {}
): Promise<RunnerResult> {
  const { tamanhoTime, budget, saTemperatura, saCooling, saIteracoes } = config
  const { onLog = () => {}, onProgress } = callbacks
  const scoreMaximo = metaInimigos.length * 100.0

  // Otimiza movesets individuais (warm start)
  const scoresIndividuais: WarmStart = {}

  for (const p of candidatos) p.optimizeMoveset()
  const arraysGlobal = construirCaches(candidatos, metaInimigos, priorities)

  for (const pokemon of candidatos) {
    const { moveset, score } = otimizar(pokemon, arraysGlobal)
    scoresIndividuais[pokemon.name] = { moveset, score }
  }

  const timeAtual: Pokemon[] = []
  const movesetsAtual: Move[][] = []
  let scoreAtual = 0.0
  let budgetRestante = budget

  for (let rodada = 0; rodada < tamanhoTime; rodada++) {
    onLog(`\n=== Rodada ${rodada + 1} ===`)

    const candidatosValidos = candidatos.filter(
      p => !timeAtual.includes(p) && (custos[p.name] ?? 999) <= budgetRestante
    )

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

      if (rodada === 0) {
        const ind = scoresIndividuais[poke.name]
        scoreTeste = ind.score
        movesetsTeste = [ind.moveset]
      } else {
        onLog(`  Testando ${poke.name}...`)
        const timeTeste = [...timeAtual, poke]
        const result = otimizarTimeSA(timeTeste, metaInimigos, priorities, {
          maxIteracoes: saIteracoes,
          temperaturaInicial: saTemperatura,
          coolingRate: saCooling,
          warmStart: scoresIndividuais,
          onProgress,
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

  return {
    time: timeAtual.map((p, i) => ({
      pokemon: p,
      moveset: movesetsAtual[i],
      custo: custos[p.name] ?? 0,
      scoreIndividual: scoresIndividuais[p.name]?.score ?? 0,
    })),
    score: scoreAtual,
    scoreMaximo,
    custoTotal,
  }
}
