import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import { construirCaches, otimizar, otimizarTimeSA, calcularScoreTime } from './optimizer'
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
  gruposExclusao: string[][]
  timeFixo: Pokemon[]  // já entram no time, otimizador preenche os slots restantes
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
  const { tamanhoTime, budget, saTemperatura, saCooling, saIteracoes, gruposExclusao, timeFixo } = config
  const { onLog = () => {}, onProgress } = callbacks
  const scoreMaximo = metaInimigos.length * 100.0

  for (const p of candidatos) p.optimizeMoveset()
  // time fixo também precisa de optimize
  for (const p of timeFixo) p.optimizeMoveset()

  const todosParaCache = [...candidatos, ...timeFixo.filter(p => !candidatos.some(c => c.name === p.name))]

  const arraysGlobal = construirCaches(todosParaCache, metaInimigos, priorities)

  const scoresIndividuais: WarmStart = {}
  for (const pokemon of todosParaCache) {
    const { moveset, score } = otimizar(pokemon, arraysGlobal)
    scoresIndividuais[pokemon.name] = { moveset, score }
  }

  // Inicializa time com os fixos, descontando budget
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
    melhorMovesets.forEach((ms, i) => { movesetsAtual[i] = ms })
    while (movesetsAtual.length < melhorMovesets.length) movesetsAtual.push([])
    movesetsAtual.length = melhorMovesets.length
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
