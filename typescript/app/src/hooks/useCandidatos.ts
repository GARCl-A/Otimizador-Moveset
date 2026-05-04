import { useMemo } from 'react'
import { getAllNames, getPokemonData, getCustoEfetivo } from '../engine/loader'

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

interface Props {
  dadosCarregados: boolean
  todosNomes: string[]
  whitelist: string
  banlist: string
  typeFilter: string
  budget: number
  upgrades: object  // só pra forçar recompute quando upgrades mudam
}

export function useCandidatos({ dadosCarregados, todosNomes, whitelist, banlist, typeFilter, budget, upgrades }: Props): Candidato[] {
  return useMemo(() => {
    if (!dadosCarregados) return []
    const whitelistArr = parseList(whitelist)
    const banlistArr = parseList(banlist)
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

    return nomes
      .filter(nome => getCustoEfetivo(nome) <= budget)
      .map(nome => {
        const data = getPokemonData(nome)
        return { nome, type1: data.type1, type2: data.type2, custo: getCustoEfetivo(nome) }
      })
  }, [dadosCarregados, whitelist, banlist, typeFilter, budget, todosNomes, upgrades])
}
