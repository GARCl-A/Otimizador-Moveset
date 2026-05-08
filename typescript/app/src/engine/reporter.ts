import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'
import type { MemberResult } from './runner'
import { calcularScoreCombate } from './combat'
import type { CombatResult } from './combat'
import type { EvalParams } from './optimizer'

const SEP = '='.repeat(50)

interface CounterEntry {
  pokemon: Pokemon
  move: Move
  combat: CombatResult
}

interface CoberturaEntry {
  primario: CounterEntry
  secundario: CounterEntry | null
  inimigoNome: string
}

function melhorCounterPorPoke(
  pokemons: Pokemon[],
  movesets: Move[][],
  inimigo: Pokemon,
  priorities: Priorities
): CounterEntry[] {
  const vencedores: CounterEntry[] = []

  for (let j = 0; j < pokemons.length; j++) {
    let melhorEntry: CounterEntry | null = null
    let melhorHP = -1
    let melhorTTK = Infinity

    for (const move of movesets[j]) {
      const combat = calcularScoreCombate(pokemons[j], inimigo, move, priorities)
      if (combat.vencedor !== 'eu') continue
      if (
        combat.vidaRestanteVencedor > melhorHP ||
        (combat.vidaRestanteVencedor === melhorHP && combat.ttkMeu < melhorTTK)
      ) {
        melhorHP = combat.vidaRestanteVencedor
        melhorTTK = combat.ttkMeu
        melhorEntry = { pokemon: pokemons[j], move, combat }
      }
    }

    if (melhorEntry) vencedores.push(melhorEntry)
  }

  return vencedores.sort((a, b) =>
    b.combat.vidaRestanteVencedor - a.combat.vidaRestanteVencedor ||
    a.combat.ttkMeu - b.combat.ttkMeu
  )
}

function pontuacaoEntrada(entry: CounterEntry, isPrimario: boolean, evalParams: EvalParams): number {
  const { priorizarHP, coberturasDupla } = evalParams
  if (isPrimario) {
    const base = priorizarHP ? 4 : 1
    const bonus = priorizarHP && entry.combat.vidaRestanteVencedor === 100 ? 1 : 0
    return base + bonus
  }
  if (!coberturasDupla) return 0
  const bonus = priorizarHP && entry.combat.vidaRestanteVencedor === 100 ? 1 : 0
  return 1 + bonus
}

interface ScoreDecomposicao {
  vitoriasPrimarias: number
  vitoriasPerfeitas: number
  vitoriasSecundarias: number
  vitoriasSecundariasPerfeitas: number
}

function decomporScore(cobertura: Map<string, CoberturaEntry>, evalParams: EvalParams): ScoreDecomposicao {
  let vitoriasPrimarias = 0
  let vitoriasPerfeitas = 0
  let vitoriasSecundarias = 0
  let vitoriasSecundariasPerfeitas = 0

  for (const cob of cobertura.values()) {
    if (cob.primario.combat.vencedor !== 'eu') continue
    vitoriasPrimarias++
    if (cob.primario.combat.vidaRestanteVencedor === 100) vitoriasPerfeitas++
    if (evalParams.coberturasDupla && cob.secundario) {
      vitoriasSecundarias++
      if (cob.secundario.combat.vidaRestanteVencedor === 100) vitoriasSecundariasPerfeitas++
    }
  }

  return { vitoriasPrimarias, vitoriasPerfeitas, vitoriasSecundarias, vitoriasSecundariasPerfeitas }
}

export function gerarRelatorio(
  time: MemberResult[],
  meta: Pokemon[],
  priorities: Priorities,
  score: number,
  scoreMaximo: number,
  budget: number,
  custoTotal: number,
  _fontes: string[],
  evalParams: EvalParams = { priorizarHP: false, coberturasDupla: false }
): string {
  const pokemons = time.map(m => m.pokemon)
  const movesets = time.map(m => m.moveset)

  const cobertura = new Map<string, CoberturaEntry>()
  for (const inimigo of meta) {
    const counters = melhorCounterPorPoke(pokemons, movesets, inimigo, priorities)
    if (counters.length === 0) {
      let melhorRank = -Infinity
      let melhorEntry: CounterEntry | null = null
      for (let j = 0; j < pokemons.length; j++) {
        for (const move of movesets[j]) {
          const combat = calcularScoreCombate(pokemons[j], inimigo, move, priorities)
          const rank = combat.ttkInimigo === Infinity ? 500
            : combat.ttkMeu === Infinity ? -combat.ttkInimigo
            : combat.ttkInimigo - combat.ttkMeu
          if (rank > melhorRank) {
            melhorRank = rank
            melhorEntry = { pokemon: pokemons[j], move, combat }
          }
        }
      }
      cobertura.set(inimigo.name, { primario: melhorEntry!, secundario: null, inimigoNome: inimigo.name })
    } else {
      cobertura.set(inimigo.name, {
        primario: counters[0],
        secundario: counters[1] ?? null,
        inimigoNome: inimigo.name,
      })
    }
  }

  const kosPrimariosPorMove = new Map<string, number>()
  const kosSecundariosPorMove = new Map<string, number>()
  const kosPorPoke = new Map<string, number>()
  const vitoriasDeInimigo = new Map<string, { entry: CounterEntry; inimigoNome: string; isPrimario: boolean }[]>()

  for (const cob of cobertura.values()) {
    if (cob.primario.combat.vencedor !== 'eu') continue

    const chavePrim = `${cob.primario.pokemon.name}|${cob.primario.move.name}`
    kosPrimariosPorMove.set(chavePrim, (kosPrimariosPorMove.get(chavePrim) ?? 0) + 1)
    kosPorPoke.set(cob.primario.pokemon.name, (kosPorPoke.get(cob.primario.pokemon.name) ?? 0) + 1)

    const listaPrim = vitoriasDeInimigo.get(cob.primario.pokemon.name) ?? []
    listaPrim.push({ entry: cob.primario, inimigoNome: cob.inimigoNome, isPrimario: true })
    vitoriasDeInimigo.set(cob.primario.pokemon.name, listaPrim)

    if (evalParams.coberturasDupla && cob.secundario) {
      const chaveSec = `${cob.secundario.pokemon.name}|${cob.secundario.move.name}`
      kosSecundariosPorMove.set(chaveSec, (kosSecundariosPorMove.get(chaveSec) ?? 0) + 1)

      const listaSec = vitoriasDeInimigo.get(cob.secundario.pokemon.name) ?? []
      listaSec.push({ entry: cob.secundario, inimigoNome: cob.inimigoNome, isPrimario: false })
      vitoriasDeInimigo.set(cob.secundario.pokemon.name, listaSec)
    }
  }

  const decomp = decomporScore(cobertura, evalParams)
  const vitorias = decomp.vitoriasPrimarias
  const ameacas = [...cobertura.values()].filter(c => c.primario.combat.vencedor !== 'eu')
  const mvpNome = [...kosPorPoke.entries()].sort((a, b) => b[1] - a[1])[0]
  const coberturaPct = meta.length > 0 ? (vitorias / meta.length) * 100 : 0

  const linhas: string[] = []

  linhas.push(SEP)
  linhas.push(`RESUMO DO TIME`)
  linhas.push(SEP)
  linhas.push(`Score: ${score} / ${scoreMaximo} | Cobertura: ${coberturaPct.toFixed(1)}%`)
  linhas.push(`Custos: ${custoTotal}/${budget} Budget`)
  linhas.push(`Vitórias: ${vitorias} | Ameaças: ${ameacas.length}`)
  if (mvpNome) linhas.push(`MVP: ${mvpNome[0]} (${mvpNome[1]} abates primários)`)

  if (evalParams.priorizarHP || evalParams.coberturasDupla) {
    linhas.push('')
    linhas.push('Score detalhado:')
    linhas.push(`  Vitórias primárias:          ${decomp.vitoriasPrimarias} × ${evalParams.priorizarHP ? 4 : 1} = ${decomp.vitoriasPrimarias * (evalParams.priorizarHP ? 4 : 1)}`)
    if (evalParams.priorizarHP) {
      linhas.push(`  Bônus 100% HP (primário):    ${decomp.vitoriasPerfeitas} × 1 = ${decomp.vitoriasPerfeitas}`)
    }
    if (evalParams.coberturasDupla) {
      linhas.push(`  Vitórias secundárias:        ${decomp.vitoriasSecundarias} × 1 = ${decomp.vitoriasSecundarias}`)
      if (evalParams.priorizarHP) {
        linhas.push(`  Bônus 100% HP (secundário):  ${decomp.vitoriasSecundariasPerfeitas} × 1 = ${decomp.vitoriasSecundariasPerfeitas}`)
      }
    }
  }

  linhas.push('')
  linhas.push(SEP)
  linhas.push(`[!] AMEAÇAS SEM COBERTURA (${ameacas.length})`)
  linhas.push(SEP)

  if (ameacas.length === 0) {
    linhas.push('  Nenhuma ameaça! Cobertura total.')
  } else {
    for (const cob of ameacas) {
      const c = cob.primario.combat
      const moveIni = c.melhorMoveInimigo?.name ?? '?'
      const ttkIni = c.ttkInimigo === Infinity ? '∞' : `${c.ttkInimigo}`
      linhas.push(`- ${cob.inimigoNome.padEnd(15)} | Derrota nossa melhor opção em ${ttkIni}T com ${moveIni}`)
    }
  }

  linhas.push('')
  linhas.push(SEP)
  linhas.push('PERFIL TÁTICO E COBERTURA')
  linhas.push(SEP)

  for (let i = 0; i < time.length; i++) {
    const membro = time[i]
    const poke = pokemons[i]
    const kosPrim = kosPorPoke.get(poke.name) ?? 0
    const alvos = vitoriasDeInimigo.get(poke.name) ?? []

    const hpsVitorias = alvos.filter(a => a.isPrimario).map(a => a.entry.combat.vidaRestanteVencedor)
    const mediaHP = hpsVitorias.length > 0
      ? hpsVitorias.reduce((a, b) => a + b, 0) / hpsVitorias.length
      : null
    const desvioHP = hpsVitorias.length > 1
      ? Math.sqrt(hpsVitorias.reduce((acc, hp) => acc + (hp - mediaHP!) ** 2, 0) / hpsVitorias.length)
      : null

    linhas.push('')
    linhas.push(`🟢 ${poke.name.toUpperCase()} [Custo: ${membro.custo} | KOs primários: ${kosPrim}${mediaHP !== null ? ` | HP médio: ${mediaHP.toFixed(1)}%${desvioHP !== null ? ` ±${desvioHP.toFixed(1)}` : ''}` : ''}]`)
    linhas.push('  Moves:')

    for (const move of movesets[i]) {
      const chave = `${poke.name}|${move.name}`
      const kPrim = kosPrimariosPorMove.get(chave) ?? 0
      const kSec = kosSecundariosPorMove.get(chave) ?? 0
      const prio = priorities[move.name] ?? 0
      const tags = [...(prio !== 0 ? [`P${prio}`] : []), ...move.tags]
      const tagStr = tags.length ? ` (${tags.join(',')})` : ''
      const secStr = kSec > 0 ? ` +${kSec}sec` : ''
      linhas.push(`  - ${move.name}${tagStr} (${kPrim} KOs${secStr})`)
    }

    linhas.push('')
    linhas.push('  Alvos Derrotados:')

    if (alvos.length === 0) {
      linhas.push('  (nenhum)')
    } else {
      alvos.sort((a, b) => {
        if (a.isPrimario !== b.isPrimario) return a.isPrimario ? -1 : 1
        return b.entry.combat.vidaRestanteVencedor - a.entry.combat.vidaRestanteVencedor
      })
      for (const { entry, inimigoNome, isPrimario } of alvos) {
        const c = entry.combat
        const ttk = c.ttkMeu === Infinity ? '∞' : `${c.ttkMeu}`
        const hp = c.vidaRestanteVencedor.toFixed(0).padStart(3)
        const pts = pontuacaoEntrada(entry, isPrimario, evalParams)
        const hpFlag = c.vidaRestanteVencedor === 100 ? ' ✦' : ''
        const rank = isPrimario ? '1º' : '2º'
        linhas.push(`  ${rank} ${inimigoNome.padEnd(16)} (${entry.move.name.padEnd(16)}) KO ${ttk}T | HP: ${hp}%${hpFlag} [${pts}pts]`)
      }
    }
  }

  if (evalParams.coberturasDupla) {
    linhas.push('')
    linhas.push(SEP)
    linhas.push('COBERTURA DUPLA')
    linhas.push(SEP)

    const comDupla = [...cobertura.values()].filter(c => c.primario.combat.vencedor === 'eu' && c.secundario !== null)
    const semDupla = [...cobertura.values()].filter(c => c.primario.combat.vencedor === 'eu' && c.secundario === null)

    linhas.push(`  Com cobertura dupla: ${comDupla.length} | Sem: ${semDupla.length}`)
    linhas.push('')

    for (const cob of comDupla) {
      const p = cob.primario
      const s = cob.secundario!
      const ptsP = pontuacaoEntrada(p, true, evalParams)
      const ptsS = pontuacaoEntrada(s, false, evalParams)
      const hpP = p.combat.vidaRestanteVencedor === 100 ? '✦' : ' '
      const hpS = s.combat.vidaRestanteVencedor === 100 ? '✦' : ' '
      const ttkP = p.combat.ttkMeu === Infinity ? '∞' : `${p.combat.ttkMeu}`
      const ttkS = s.combat.ttkMeu === Infinity ? '∞' : `${s.combat.ttkMeu}`
      linhas.push(`  ${cob.inimigoNome.padEnd(16)}`)
      linhas.push(`    1º ${p.pokemon.name.padEnd(12)} / ${p.move.name.padEnd(16)} KO ${ttkP}T HP:${p.combat.vidaRestanteVencedor.toFixed(0).padStart(3)}% ${hpP} [${ptsP}pts]`)
      linhas.push(`    2º ${s.pokemon.name.padEnd(12)} / ${s.move.name.padEnd(16)} KO ${ttkS}T HP:${s.combat.vidaRestanteVencedor.toFixed(0).padStart(3)}% ${hpS} [${ptsS}pts]`)
    }
  }

  return linhas.join('\n')
}
