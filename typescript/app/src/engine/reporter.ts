import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import type { MemberResult } from './runner'
import { calcularScoreCombate } from './optimizer'

interface CoberturaEntry {
  pokemon: Pokemon
  move: Move
  ev: number
  moveInimigoAntes: Move | null
  danoInimigoAntes: number
}

export function gerarRelatorio(
  time: MemberResult[],
  meta: Pokemon[],
  priorities: Priorities,
  score: number,
  scoreMaximo: number,
  budget: number,
  custoTotal: number,
  fontes: string[]
): string {
  const pokemons = time.map(m => m.pokemon)
  const movesets = time.map(m => m.moveset)

  // Cobertura: para cada inimigo, qual pokemon+move vence
  const cobertura = new Map<string, CoberturaEntry>()
  for (const inimigo of meta) {
    let melhorEv = 0.0
    let melhorPokemon: Pokemon | null = null
    let melhorMove: Move | null = null

    for (let j = 0; j < pokemons.length; j++) {
      for (const move of movesets[j]) {
        const ev = calcularScoreCombate(pokemons[j], inimigo, move, priorities)
        if (ev > melhorEv) {
          melhorEv = ev
          melhorPokemon = pokemons[j]
          melhorMove = move
        }
      }
    }

    let moveInimigoAntes: Move | null = null
    let danoInimigoAntes = 0.0
    if (melhorPokemon && melhorMove) {
      const prioMeuMove = priorities[melhorMove.name] ?? 0
      const movesAntes = inimigo.moveset.filter(m => {
        const prioIni = priorities[m.name] ?? 0
        return prioIni > prioMeuMove || (prioIni === prioMeuMove && inimigo.speed >= melhorPokemon!.speed)
      })
      if (movesAntes.length) {
        moveInimigoAntes = movesAntes.reduce((best, m) =>
          inimigo.calcularDanoEsperado(m, melhorPokemon!) > inimigo.calcularDanoEsperado(best, melhorPokemon!) ? m : best
        )
        danoInimigoAntes = inimigo.calcularDanoEsperado(moveInimigoAntes, melhorPokemon)
      }
    }

    cobertura.set(inimigo.name, { pokemon: melhorPokemon!, move: melhorMove!, ev: melhorEv, moveInimigoAntes, danoInimigoAntes })
  }

  // Contribuição por move
  const contribuicao = new Map<string, number>()
  for (const [, entry] of cobertura) {
    if (!entry.pokemon) continue
    const chave = `${entry.pokemon.name}|${entry.move.name}`
    contribuicao.set(chave, (contribuicao.get(chave) ?? 0) + entry.ev)
  }

  const linhas: string[] = []

  // Time resumo
  linhas.push('='.repeat(50))
  linhas.push('TIME SELECIONADO')
  linhas.push('='.repeat(50))
  for (const m of time) {
    linhas.push(`  ${m.pokemon.name.padEnd(15)} custo: ${String(m.custo).padStart(2)}  score individual: ${m.scoreIndividual.toFixed(2)}`)
  }

  // Movesets
  linhas.push('')
  linhas.push('='.repeat(50))
  linhas.push('MOVESETS DO TIME')
  linhas.push('='.repeat(50))
  for (let i = 0; i < time.length; i++) {
    linhas.push(`\n${pokemons[i].name} (custo ${time[i].custo}):`)
    for (const move of movesets[i]) {
      const contrib = contribuicao.get(`${pokemons[i].name}|${move.name}`) ?? 0
      const prio = priorities[move.name] ?? 0
      const tags = [...(prio !== 0 ? [`P${prio}`] : []), ...move.tags]
      const tagStr = tags.length ? `(${tags.join(',')})` : ''
      const nomeComTag = `${move.name}${tagStr}`.padEnd(25)
      linhas.push(`  ${nomeComTag} (${move.type.padEnd(10)} ${move.category.padEnd(10)}) contrib: ${contrib.toFixed(2)}`)
    }
  }

  // Cobertura por alvo
  linhas.push('')
  linhas.push('='.repeat(50))
  linhas.push('COBERTURA POR ALVO')
  linhas.push('='.repeat(50))
  for (const inimigo of meta) {
    const entry = cobertura.get(inimigo.name)!
    const tiposInimigo = inimigo.type2 ? `${inimigo.type1}/${inimigo.type2}` : inimigo.type1
    if (!entry?.pokemon) {
      linhas.push(`  ${inimigo.name.padEnd(15)} (${tiposInimigo.padEnd(15)}) -> [sem cobertura]  0.00%`)
      continue
    }
    const prio = priorities[entry.move.name] ?? 0
    const prioTag = prio !== 0 ? `[P${prio}]` : ''
    let ordem: string
    if (entry.moveInimigoAntes && entry.danoInimigoAntes > 0) {
      const prioIni = priorities[entry.moveInimigoAntes.name] ?? 0
      const prioIniTag = prioIni !== 0 ? `(P${prioIni})` : ''
      ordem = `2º, tomou ${entry.moveInimigoAntes.name}${prioIniTag} ${entry.danoInimigoAntes.toFixed(1)}%`
    } else {
      ordem = '1º'
    }
    linhas.push(
      `  ${inimigo.name.padEnd(15)} (${tiposInimigo.padEnd(15)}) ` +
      `-> ${entry.pokemon.name.padEnd(12)} usa ${entry.move.name.padEnd(20)}${prioTag} ${entry.ev.toFixed(2).padStart(6)}%  [${ordem}]`
    )
  }

  return linhas.join('\n')
}
