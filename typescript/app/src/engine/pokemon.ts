import { Move } from './move'
import type { MoveData } from './move'
import { getTypeMultiplier } from './moveDict'
import { normalizarDanoPorTurno, podarEstritamenteDominados } from './moveUtils'
import type { EggMoveUpgrade } from './loader'

export interface PokemonStats {
  HP: number
  Attack: number
  Defense: number
  SpAtk: number
  SpDef: number
  Speed: number
}

export interface PokemonData {
  number: number
  type1: string
  type2: string | null
  cost: number
  stats: PokemonStats
  moves: MoveData[]
}

export class Pokemon {
  name: string
  type1: string
  type2: string | null
  hp: number
  attack: number
  specialAttack: number
  defense: number
  specialDefense: number
  speed: number
  moveset: Move[]

  constructor(name: string, data: PokemonData) {
    this.name = name
    this.type1 = data.type1
    this.type2 = data.type2
    this.hp             = (data.stats.HP      * 2) + 31 + 110
    this.attack         = (data.stats.Attack  * 2) + 31 + 5
    this.specialAttack  = (data.stats.SpAtk   * 2) + 31 + 5
    this.defense        = (data.stats.Defense * 2) + 31 + 5
    this.specialDefense = (data.stats.SpDef   * 2) + 31 + 5
    this.speed          = (data.stats.Speed   * 2) + 31 + 5
    this.moveset = []
  }

  loadMoves(moves: MoveData[], fontes: string[], eggMovesDesbloqueados: EggMoveUpgrade[] = []): void {
    const seen = new Set<string>()
    const incluirEgg = fontes.includes('Egg')
    for (const m of moves) {
      if (seen.has(m.name)) continue
      const fonteOk = fontes.some(f => m.source.includes(f))
      if (!fonteOk) continue
      // se a única fonte é Egg e Egg não está marcado, pula
      if (m.source.trim() === 'Egg' && !incluirEgg) continue
      seen.add(m.name)
      this.moveset.push(new Move(m))
    }
    if (incluirEgg) {
      for (const em of eggMovesDesbloqueados) {
        if (seen.has(em.name)) continue
        seen.add(em.name)
        this.moveset.push(new Move({ name: em.name, type: em.type, category: em.category, power: em.power, accuracy: em.accuracy, source: 'Egg' }))
      }
    }
  }

  optimizeMoveset(banirRecoil: boolean = false, banirLock: boolean = false, priorities: Record<string, number> = {}): void {
    this.moveset = normalizarDanoPorTurno(this.moveset, banirRecoil, banirLock)
    // Moves de status dão 0 de dano no modelo (calcularDanoEsperado retorna 0 para
    // não-Physical/Special), então nunca entram num moveset útil. Removê-los aqui
    // evita processar ~1/3 dos golpes à toa, sem alterar nenhum score.
    this.moveset = this.moveset.filter(m => m.category === 'Physical' || m.category === 'Special')
    this.moveset = podarEstritamenteDominados(this.moveset, priorities)
  }

  calcularDanoEsperado(move: Move, target: Pokemon): number {
    if (move.effectivePower <= 0 || move.acc <= 0) return 0.0
    let atkStat: number, defStat: number
    if (move.category === 'Physical') {
      atkStat = this.attack
      defStat = target.defense
    } else if (move.category === 'Special') {
      atkStat = this.specialAttack
      defStat = target.specialDefense
    } else {
      return 0.0
    }
    const stab = move.type === this.type1 || move.type === this.type2 ? 1.5 : 1.0
    const typeMultiplier = getTypeMultiplier(move.type, target.type1, target.type2)
    const danoBruto = (((42 * move.effectivePower * (atkStat / defStat)) / 50) + 2) * stab * typeMultiplier
    const danoPercentual = (danoBruto / target.hp) * 100.0
    return Math.min(danoPercentual, 100.0) * (move.acc / 100.0) ** 2
  }
}
