import { Pokemon } from './pokemon'
import { Move } from './move'
import type { Priorities } from './loader'

export interface CombatResult {
  score: number
  vencedor: 'eu' | 'inimigo' | 'empate'
  moveDecisivo: Move
  melhorMoveInimigo: Move | null
  euAtaqueiPrimeiro: boolean
  vidaRestanteVencedor: number
  ttkMeu: number
  ttkInimigo: number
  danoMeu: number
  danoInimigo: number
}

export function calcularScoreCombate(
  meuPoke: Pokemon,
  inimigo: Pokemon,
  meuAtaque: Move,
  priorities: Priorities
): CombatResult {
  const danoMeu = meuPoke.calcularDanoEsperado(meuAtaque, inimigo)

  const melhorMoveInimigo = inimigo.moveset.reduce<Move>(
    (best, m) => inimigo.calcularDanoEsperado(m, meuPoke) >= inimigo.calcularDanoEsperado(best, meuPoke) ? m : best,
    inimigo.moveset[0]
  )
  const danoInimigo = melhorMoveInimigo ? inimigo.calcularDanoEsperado(melhorMoveInimigo, meuPoke) : 0

  const ttkMeu = danoMeu > 0 ? Math.ceil(100 / danoMeu) : Infinity
  const ttkInimigo = danoInimigo > 0 ? Math.ceil(100 / danoInimigo) : Infinity

  const prioMeu = priorities[meuAtaque.name] ?? 0
  const prioInimigo = melhorMoveInimigo ? (priorities[melhorMoveInimigo.name] ?? 0) : 0
  const euAtaqueiPrimeiro =
    prioMeu > prioInimigo ? true :
    prioInimigo > prioMeu ? false :
    meuPoke.speed > inimigo.speed

  const euVenco =
    ttkMeu < ttkInimigo ||
    (ttkMeu === ttkInimigo && euAtaqueiPrimeiro)

  const vencedor = ttkMeu === Infinity && ttkInimigo === Infinity
    ? 'empate'
    : euVenco ? 'eu' : 'inimigo'

  const hitsRecebidos = euVenco ? ttkMeu - 1 + (euAtaqueiPrimeiro ? 0 : 1) : ttkInimigo
  const vidaRestanteVencedor = euVenco
    ? Math.max(0, 100 - hitsRecebidos * danoInimigo)
    : Math.max(0, 100 - hitsRecebidos * danoMeu)

  return {
    score: euVenco ? vidaRestanteVencedor : 0,
    vencedor,
    moveDecisivo: euVenco ? meuAtaque : melhorMoveInimigo,
    melhorMoveInimigo: melhorMoveInimigo ?? null,
    euAtaqueiPrimeiro,
    vidaRestanteVencedor,
    ttkMeu,
    ttkInimigo,
    danoMeu,
    danoInimigo,
  }
}
