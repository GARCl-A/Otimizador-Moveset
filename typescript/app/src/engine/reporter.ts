import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import type { MemberResult } from './runner'
import { calcularScoreCombate } from './combat'
import type { CombatResult } from './combat'

const SEP = '='.repeat(50)

interface CoberturaEntry {
  pokemon: Pokemon
  move: Move
  combat: CombatResult
  inimigoNome: string
}

interface AmeacaEntry {
  inimigo: Pokemon
  combat: CombatResult
  melhorPokemon: Pokemon
}

export function gerarRelatorio(
  time: MemberResult[],
  meta: Pokemon[],
  priorities: Priorities,
  score: number,
  scoreMaximo: number,
  budget: number,
  custoTotal: number,
  _fontes: string[]
): string {
  const pokemons = time.map(m => m.pokemon)
  const movesets = time.map(m => m.moveset)

  const cobertura = new Map<string, CoberturaEntry>()
  for (const inimigo of meta) {
    let melhorRank = -Infinity
    let melhorPokemon: Pokemon | null = null
    let melhorMove: Move | null = null
    let melhorCombat: CombatResult | null = null

    for (let j = 0; j < pokemons.length; j++) {
      for (const move of movesets[j]) {
        const combat = calcularScoreCombate(pokemons[j], inimigo, move, priorities)
        const rank = combat.vencedor === 'eu'
          ? combat.score + 1000
          : combat.ttkInimigo === Infinity ? 500
          : combat.ttkMeu === Infinity ? -combat.ttkInimigo
          : combat.ttkInimigo - combat.ttkMeu
        if (rank > melhorRank) {
          melhorRank = rank
          melhorPokemon = pokemons[j]
          melhorMove = move
          melhorCombat = combat
        }
      }
    }

    cobertura.set(inimigo.name, { pokemon: melhorPokemon!, move: melhorMove!, combat: melhorCombat!, inimigoNome: inimigo.name })
  }

  // KOs por move e por pokemon
  const kosPorMove = new Map<string, number>()
  const kosPorPoke = new Map<string, number>()
  const vitoriasDeInimigo = new Map<string, CoberturaEntry[]>()

  for (const [, entry] of cobertura) {
    if (entry.combat.vencedor !== 'eu') continue
    const chaveMove = `${entry.pokemon.name}|${entry.move.name}`
    kosPorMove.set(chaveMove, (kosPorMove.get(chaveMove) ?? 0) + 1)
    kosPorPoke.set(entry.pokemon.name, (kosPorPoke.get(entry.pokemon.name) ?? 0) + 1)
    const lista = vitoriasDeInimigo.get(entry.pokemon.name) ?? []
    lista.push(entry)
    vitoriasDeInimigo.set(entry.pokemon.name, lista)
  }

  const vitorias = [...cobertura.values()].filter(e => e.combat.vencedor === 'eu').length
  const ameacas: AmeacaEntry[] = []
  for (const [nomeInimigo, entry] of cobertura) {
    if (entry.combat.vencedor === 'eu') continue
    const inimigo = meta.find(m => m.name === nomeInimigo)!
    ameacas.push({ inimigo, combat: entry.combat, melhorPokemon: entry.pokemon })
  }

  const mvpNome = [...kosPorPoke.entries()].sort((a, b) => b[1] - a[1])[0]
  const coberturaPct = scoreMaximo > 0 ? (vitorias / meta.length) * 100 : 0

  const linhas: string[] = []

  // ── RESUMO ──────────────────────────────────────────────────────────────────
  linhas.push(SEP)
  linhas.push(`RESUMO DO TIME (Score: ${score.toFixed(2)} | Cobertura: ${coberturaPct.toFixed(1)}%)`)
  linhas.push(SEP)
  linhas.push(`Custos: ${custoTotal}/${budget} Budget`)
  linhas.push(`Vitórias: ${vitorias} | Ameaças: ${ameacas.length}`)
  if (mvpNome) linhas.push(`MVP: ${mvpNome[0]} (${mvpNome[1]} abates)`)

  // ── AMEAÇAS ─────────────────────────────────────────────────────────────────
  linhas.push('')
  linhas.push(SEP)
  linhas.push(`[!] AMEAÇAS SEM COBERTURA (${ameacas.length})`)
  linhas.push(SEP)

  if (ameacas.length === 0) {
    linhas.push('  Nenhuma ameaça! Cobertura total.')
  } else {
    for (const { inimigo, combat } of ameacas) {
      const moveIni = combat.melhorMoveInimigo?.name ?? '?'
      const ttkIni = combat.ttkInimigo === Infinity ? '∞' : `${combat.ttkInimigo}`
      linhas.push(`- ${inimigo.name.padEnd(15)} | Derrota nossa melhor opção em ${ttkIni}T com ${moveIni}`)
    }
  }

  // ── PERFIL TÁTICO ────────────────────────────────────────────────────────────
  linhas.push('')
  linhas.push(SEP)
  linhas.push('PERFIL TÁTICO E COBERTURA')
  linhas.push(SEP)

  for (let i = 0; i < time.length; i++) {
    const membro = time[i]
    const poke = pokemons[i]
    const kos = kosPorPoke.get(poke.name) ?? 0
    const alvos = vitoriasDeInimigo.get(poke.name) ?? []

    linhas.push('')
    linhas.push(`🟢 ${poke.name.toUpperCase()} [Custo: ${membro.custo} | KOs: ${kos}]`)
    linhas.push('  Moves:')

    for (const move of movesets[i]) {
      const chave = `${poke.name}|${move.name}`
      const k = kosPorMove.get(chave) ?? 0
      const prio = priorities[move.name] ?? 0
      const tags = [...(prio !== 0 ? [`P${prio}`] : []), ...move.tags]
      const tagStr = tags.length ? ` (${tags.join(',')})` : ''
      linhas.push(`  - ${move.name}${tagStr} (${k} KOs)`)
    }

    linhas.push('')
    linhas.push('  Alvos Derrotados:')

    if (alvos.length === 0) {
      linhas.push('  (nenhum)')
    } else {
      alvos.sort((a, b) => b.combat.vidaRestanteVencedor - a.combat.vidaRestanteVencedor)
      for (const entry of alvos) {
        const inimigoNome = entry.inimigoNome
        const c = entry.combat
        const ttk = c.ttkMeu === Infinity ? '∞' : `${c.ttkMeu}`
        const hp = c.vidaRestanteVencedor.toFixed(0).padStart(3)
        linhas.push(`  - ${inimigoNome.padEnd(16)} (${entry.move.name.padEnd(16)}) -> KO em ${ttk}T | HP Restante: ${hp}%`)
      }
    }
  }

  return linhas.join('\n')
}
