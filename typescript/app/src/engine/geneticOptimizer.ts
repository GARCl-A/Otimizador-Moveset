import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import { construirCaches, calcularScoreTime, otimizar } from './optimizer'
import type { WarmStart, ProgressCallback } from './optimizer'

interface Individual {
  pokemons: Pokemon[]
  movesets: Move[][]
  fitness: number
  custoTotal: number
}

interface GeneticConfig {
  populationSize?: number
  generations?: number
  mutationRate?: number
  eliteSize?: number
  warmStart?: WarmStart
  onProgress?: ProgressCallback
}

export function otimizarTimeGA(
  candidatos: Pokemon[],
  meta: Pokemon[],
  custos: Record<string, number>,
  priorities: Priorities,
  tamanhoTime: number,
  budget: number,
  gruposExclusao: string[][],
  timeFixo: Pokemon[],
  {
    populationSize = 100,
    generations = 50,
    mutationRate = 0.2,
    eliteSize = 10,
    warmStart,
    onProgress,
  }: GeneticConfig = {}
): { movesets: Move[][]; score: number; time: Pokemon[] } {
  for (const p of candidatos) p.optimizeMoveset()
  for (const p of timeFixo) p.optimizeMoveset()

  const population = gerarPopulacaoInicial(
    candidatos,
    meta,
    custos,
    priorities,
    tamanhoTime,
    budget,
    gruposExclusao,
    timeFixo,
    populationSize,
    warmStart
  )

  let bestIndividual = population.reduce((a, b) => a.fitness > b.fitness ? a : b)

  for (let gen = 0; gen < generations; gen++) {
    if (onProgress) onProgress(gen, generations, bestIndividual.fitness)

    population.sort((a, b) => b.fitness - a.fitness)
    const elite = population.slice(0, eliteSize)

    const nextGen: Individual[] = [...elite]

    while (nextGen.length < populationSize) {
      const parent1 = selecaoTorneio(population, 3)
      const parent2 = selecaoTorneio(population, 3)

      let child = crossover(parent1, parent2, custos, budget, gruposExclusao, timeFixo, tamanhoTime)

      if (Math.random() < mutationRate) {
        child = mutacao(child, candidatos, custos, budget, gruposExclusao, timeFixo)
      }

      child = avaliarIndividuo(child, meta, priorities)

      if (child.fitness > bestIndividual.fitness) {
        bestIndividual = child
      }

      nextGen.push(child)
    }

    population.splice(0, population.length, ...nextGen)
  }

  return {
    movesets: bestIndividual.movesets,
    score: bestIndividual.fitness,
    time: bestIndividual.pokemons,
  }
}

function gerarPopulacaoInicial(
  candidatos: Pokemon[],
  meta: Pokemon[],
  custos: Record<string, number>,
  priorities: Priorities,
  tamanhoTime: number,
  budget: number,
  gruposExclusao: string[][],
  timeFixo: Pokemon[],
  populationSize: number,
  warmStart?: WarmStart
): Individual[] {
  const population: Individual[] = []

  for (let i = 0; i < populationSize; i++) {
    const individual = gerarIndividuoAleatorio(
      candidatos,
      custos,
      tamanhoTime,
      budget,
      gruposExclusao,
      timeFixo,
      warmStart
    )
    population.push(avaliarIndividuo(individual, meta, priorities))
  }

  return population
}

function gerarIndividuoAleatorio(
  candidatos: Pokemon[],
  custos: Record<string, number>,
  tamanhoTime: number,
  budget: number,
  gruposExclusao: string[][],
  timeFixo: Pokemon[],
  warmStart?: WarmStart
): Individual {
  const pokemons: Pokemon[] = [...timeFixo]
  const movesets: Move[][] = []
  let custoTotal = timeFixo.reduce((acc, p) => acc + (custos[p.name] ?? 0), 0)

  for (const p of timeFixo) {
    if (warmStart?.[p.name]) {
      movesets.push(warmStart[p.name].moveset)
    } else {
      const moveset = p.moveset
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(4, p.moveset.length))
      movesets.push(moveset)
    }
  }

  const candidatosShuffled = candidatos
    .filter(c => !timeFixo.some(f => f.name === c.name))
    .sort(() => Math.random() - 0.5)

  for (const poke of candidatosShuffled) {
    if (pokemons.length >= tamanhoTime) break

    const custo = custos[poke.name] ?? 0
    if (custoTotal + custo > budget) continue

    let conflito = false
    for (const grupo of gruposExclusao) {
      if (grupo.includes(poke.name) && pokemons.some(p => grupo.includes(p.name))) {
        conflito = true
        break
      }
    }
    if (conflito) continue

    pokemons.push(poke)
    custoTotal += custo

    if (warmStart?.[poke.name]) {
      movesets.push(warmStart[poke.name].moveset)
    } else {
      const moveset = poke.moveset
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(4, poke.moveset.length))
      movesets.push(moveset)
    }
  }

  return { pokemons, movesets, fitness: 0, custoTotal }
}

function avaliarIndividuo(
  individual: Individual,
  meta: Pokemon[],
  priorities: Priorities
): Individual {
  if (individual.pokemons.length === 0) {
    return { ...individual, fitness: 0 }
  }

  const arrays = construirCaches(individual.pokemons, meta, priorities)
  const pokeIndices = individual.pokemons.map(p => arrays.pokeIdx.get(p.name)!)
  const estadoIndices = individual.movesets.map((moveset, i) => {
    const iPoke = pokeIndices[i]
    const moveIdxMap = arrays.moveIdx[iPoke]
    return moveset.map(m => moveIdxMap.get(m.name) ?? 0).filter(idx => idx >= 0)
  })

  const fitness = calcularScoreTime(pokeIndices, estadoIndices, arrays)

  return { ...individual, fitness }
}

function selecaoTorneio(population: Individual[], tournamentSize: number): Individual {
  let best = population[Math.floor(Math.random() * population.length)]
  for (let i = 1; i < tournamentSize; i++) {
    const competitor = population[Math.floor(Math.random() * population.length)]
    if (competitor.fitness > best.fitness) {
      best = competitor
    }
  }
  return best
}

function crossover(
  parent1: Individual,
  parent2: Individual,
  custos: Record<string, number>,
  budget: number,
  gruposExclusao: string[][],
  timeFixo: Pokemon[],
  tamanhoTime: number
): Individual {
  const childPokemons: Pokemon[] = [...timeFixo]
  const childMovesets: Move[][] = []
  let custoTotal = timeFixo.reduce((acc, p) => acc + (custos[p.name] ?? 0), 0)

  for (const p of timeFixo) {
    const idx1 = parent1.pokemons.findIndex(pk => pk.name === p.name)
    const idx2 = parent2.pokemons.findIndex(pk => pk.name === p.name)
    if (idx1 >= 0) {
      childMovesets.push([...parent1.movesets[idx1]])
    } else if (idx2 >= 0) {
      childMovesets.push([...parent2.movesets[idx2]])
    } else {
      childMovesets.push(p.moveset.slice(0, Math.min(4, p.moveset.length)))
    }
  }

  const allParentPokemons = [...parent1.pokemons, ...parent2.pokemons]
  const seen = new Set<string>(timeFixo.map(p => p.name))

  for (const poke of allParentPokemons) {
    if (childPokemons.length >= tamanhoTime) break
    if (seen.has(poke.name)) continue
    seen.add(poke.name)

    const custo = custos[poke.name] ?? 0
    if (custoTotal + custo > budget) continue

    let conflito = false
    for (const grupo of gruposExclusao) {
      if (grupo.includes(poke.name) && childPokemons.some(p => grupo.includes(p.name))) {
        conflito = true
        break
      }
    }
    if (conflito) continue

    childPokemons.push(poke)
    custoTotal += custo

    const idx1 = parent1.pokemons.findIndex(p => p.name === poke.name)
    const idx2 = parent2.pokemons.findIndex(p => p.name === poke.name)

    if (idx1 >= 0 && idx2 >= 0) {
      const moveset1 = parent1.movesets[idx1]
      const moveset2 = parent2.movesets[idx2]
      const combined = [...moveset1, ...moveset2]
      const unique = Array.from(new Map(combined.map(m => [m.name, m])).values())
      const selected = unique
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(4, unique.length))
      childMovesets.push(selected)
    } else if (idx1 >= 0) {
      childMovesets.push([...parent1.movesets[idx1]])
    } else {
      childMovesets.push([...parent2.movesets[idx2]])
    }
  }

  return { pokemons: childPokemons, movesets: childMovesets, fitness: 0, custoTotal }
}

function mutacao(
  individual: Individual,
  candidatos: Pokemon[],
  custos: Record<string, number>,
  budget: number,
  gruposExclusao: string[][],
  timeFixo: Pokemon[]
): Individual {
  const mutated = {
    pokemons: [...individual.pokemons],
    movesets: individual.movesets.map(ms => [...ms]),
    fitness: 0,
    custoTotal: individual.custoTotal,
  }

  const timeFixoNames = new Set(timeFixo.map(p => p.name))

  if (Math.random() < 0.5 && mutated.pokemons.length > 0) {
    const idx = Math.floor(Math.random() * mutated.pokemons.length)
    const poke = mutated.pokemons[idx]
    const moveset = mutated.movesets[idx]

    if (poke.moveset.length > moveset.length) {
      const movesDisponiveis = poke.moveset.filter(m => !moveset.some(ms => ms.name === m.name))
      if (movesDisponiveis.length > 0 && moveset.length > 0) {
        const removeIdx = Math.floor(Math.random() * moveset.length)
        const addMove = movesDisponiveis[Math.floor(Math.random() * movesDisponiveis.length)]
        moveset[removeIdx] = addMove
      }
    }
  } else {
    const naoFixos = mutated.pokemons
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !timeFixoNames.has(p.name))

    if (naoFixos.length === 0) return mutated

    const { p: pokeRemovido, i: idx } = naoFixos[Math.floor(Math.random() * naoFixos.length)]
    const custoRemovido = custos[pokeRemovido.name] ?? 0

    mutated.pokemons.splice(idx, 1)
    mutated.movesets.splice(idx, 1)
    mutated.custoTotal -= custoRemovido

    const candidatosValidos = candidatos.filter(p => {
      if (mutated.pokemons.some(mp => mp.name === p.name)) return false
      const custo = custos[p.name] ?? 0
      if (mutated.custoTotal + custo > budget) return false
      for (const grupo of gruposExclusao) {
        if (grupo.includes(p.name) && mutated.pokemons.some(mp => grupo.includes(mp.name))) {
          return false
        }
      }
      return true
    })

    if (candidatosValidos.length > 0) {
      const novoPoke = candidatosValidos[Math.floor(Math.random() * candidatosValidos.length)]
      mutated.pokemons.push(novoPoke)
      mutated.custoTotal += custos[novoPoke.name] ?? 0

      const novoMoveset = novoPoke.moveset
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(4, novoPoke.moveset.length))
      mutated.movesets.push(novoMoveset)
    }
  }

  return mutated
}
