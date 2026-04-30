import { Pokemon } from './pokemon'
import type { PokemonData } from './pokemon'

type Pokedex = Record<string, PokemonData>
export type Priorities = Record<string, number>

let pokedex: Pokedex | null = null
let priorities: Priorities | null = null

export async function loadData(): Promise<void> {
  const [pdRes, prioRes] = await Promise.all([
    fetch('/pokedex.json'),
    fetch('/priority.json'),
  ])
  pokedex = await pdRes.json()
  priorities = await prioRes.json()
}

export function getPriorities(): Priorities {
  if (!priorities) throw new Error('Data not loaded')
  return priorities
}

export function buildPokemon(name: string, fontes: string[]): Pokemon {
  if (!pokedex) throw new Error('Data not loaded')
  const data = pokedex[name]
  if (!data) throw new Error(`Pokemon not found: ${name}`)
  const p = new Pokemon(name, data)
  p.loadMoves(data.moves, fontes)
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
