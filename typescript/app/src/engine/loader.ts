import { Pokemon } from './pokemon'
import type { PokemonData } from './pokemon'

type Pokedex = Record<string, PokemonData>
export type Priorities = Record<string, number>
export interface EggMoveUpgrade {
  name: string
  type: string
  category: string
  power: number
  accuracy: number
}

export interface Upgrade {
  custoReducoes: number
  eggMoves: EggMoveUpgrade[]
}
export type Upgrades = Record<string, Upgrade>

let pokedex: Pokedex | null = null
let priorities: Priorities | null = null
let upgrades: Upgrades = {}

export async function loadData(): Promise<void> {
  const [pdRes, prioRes, upgRes] = await Promise.all([
    fetch('/pokedex.json'),
    fetch('/priority.json'),
    fetch('/upgrades.json'),
  ])
  pokedex = await pdRes.json()
  priorities = await prioRes.json()
  // localStorage sobrescreve o arquivo se existir
  const stored = localStorage.getItem('upgrades')
  upgrades = stored ? JSON.parse(stored) : await upgRes.json()
}

export function getPriorities(): Priorities {
  if (!priorities) throw new Error('Data not loaded')
  return priorities
}

export function getUpgrades(): Upgrades { return upgrades }

export function saveUpgrades(u: Upgrades): void {
  upgrades = u
  localStorage.setItem('upgrades', JSON.stringify(u))
}

export function exportUpgradesJson(): void {
  const blob = new Blob([JSON.stringify(upgrades, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'upgrades.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

const CUSTO_SEQUENCIA = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0.5, 0.25]

export function getCustoEfetivo(name: string): number {
  const data = getPokemonData(name)
  const upgrade = upgrades[name]
  const reducoes = upgrade?.custoReducoes ?? 0
  const idxOriginal = CUSTO_SEQUENCIA.indexOf(data.cost)
  if (idxOriginal === -1) return data.cost
  const idxNovo = Math.min(idxOriginal + reducoes, CUSTO_SEQUENCIA.length - 1)
  return CUSTO_SEQUENCIA[idxNovo]
}

export function buildPokemon(name: string, fontes: string[]): Pokemon {
  if (!pokedex) throw new Error('Data not loaded')
  const data = pokedex[name]
  if (!data) throw new Error(`Pokemon not found: ${name}`)
  const p = new Pokemon(name, data)
  // fontes base + egg moves desbloqueados do upgrade
  const upgrade = upgrades[name]
  const eggMovesDesbloqueados = upgrade?.eggMoves ?? []
  p.loadMoves(data.moves, fontes, eggMovesDesbloqueados)
  return p
}

export function getAllNames(): string[] {
  if (!pokedex) throw new Error('Data not loaded')
  return Object.keys(pokedex)
}

export function getPokemonData(name: string): PokemonData {
  if (!pokedex) throw new Error('Data not loaded')
  return pokedex[name]
}
