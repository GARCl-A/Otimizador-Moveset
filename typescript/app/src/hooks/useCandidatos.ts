import { useMemo } from 'react'
import { getPokemonData, getCustoEfetivo } from '../engine/loader'
import { LENDARIOS } from '../engine/lendarios'

export function parseList(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}

export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '')
}

export function resolveNome(input: string, todosNomes: string[]): string | undefined {
  return todosNomes.find(tn => normalize(tn) === normalize(input))
}

interface Candidato {
  nome: string
  type1: string
  type2: string | null
  custo: number
}

export interface FiltroCandidatos {
  todosNomes: string[]
  whitelist: string
  banlist: string
  banirLendarios: boolean
  typeFilter: string
  budget: number
}

// Função pura de filtragem (usada pelo hook e pelo modo batch dos experimentos):
// aplica whitelist/banlist/lendários/typeFilter e o teto de custo do budget.
export function candidatosNomesDe({ todosNomes, whitelist, banlist, banirLendarios, typeFilter, budget }: FiltroCandidatos): string[] {
  const whitelistArr = parseList(whitelist)
  const banlistArr = parseList(banlist)
  if (banirLendarios) {
    for (const lendario of LENDARIOS) {
      if (!banlistArr.includes(lendario)) banlistArr.push(lendario)
    }
  }
  const typeFilterArr = parseList(typeFilter)

  const nomes = whitelistArr.length
    ? whitelistArr.map(n => resolveNome(n, todosNomes)).filter(Boolean) as string[]
    : todosNomes.filter(nome => {
        if (banlistArr.some(b => normalize(b) === normalize(nome))) return false
        if (!typeFilterArr.length) return true
        const data = getPokemonData(nome)
        return typeFilterArr.some(t => normalize(t) === normalize(data.type1)) ||
          (data.type2 != null && typeFilterArr.some(t => normalize(t) === normalize(data.type2!)))
      })

  return nomes.filter(nome => getCustoEfetivo(nome) <= budget)
}

interface Props {
  dadosCarregados: boolean
  todosNomes: string[]
  whitelist: string
  banlist: string
  banirLendarios: boolean
  typeFilter: string
  budget: number
  upgrades: object
}

export function useCandidatos({ dadosCarregados, todosNomes, whitelist, banlist, banirLendarios, typeFilter, budget, upgrades }: Props): Candidato[] {
  return useMemo(() => {
    if (!dadosCarregados) return []
    const nomes = candidatosNomesDe({ todosNomes, whitelist, banlist, banirLendarios, typeFilter, budget })
    return nomes.map(nome => {
      const data = getPokemonData(nome)
      return { nome, type1: data.type1, type2: data.type2, custo: getCustoEfetivo(nome) }
    })
  }, [dadosCarregados, whitelist, banlist, banirLendarios, typeFilter, budget, todosNomes, upgrades])
}
