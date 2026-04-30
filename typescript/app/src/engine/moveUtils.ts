import { Move } from './move'

const ATAQUES_DOIS_TURNOS = new Set([
  'Solar Beam', 'Hyper Beam', 'Giga Impact', 'Bounce', 'Dive', 'Dig',
  'Frenzy Plant', 'Solar Blade', 'Future Sight', 'Rock Wrecker',
  'Meteor Beam', 'Meteor Assault', 'Fly', 'Double Shock', 'Phantom Force',
])
const MENOS_UM_STATS = new Set(['Superpower'])
const MENOS_DOIS_STATS = new Set(['Overheat', 'Leaf Storm'])
const DANO_EM_SI_MESMO = new Set([
  'Flare Blitz', 'Double-Edge', 'Axe Kick', 'Brave Bird',
  'Wild Charge', 'Wood Hammer', 'Supercell Slam',
])
const BANIDOS = new Set([
  'Focus Punch', 'First Impression', 'Fake Out', 'Explosion',
  'Self-Destruct', 'Steel Roller', 'Dream Eater', 'Misty Explosion',
])
const TRAVAMENTO_E_CONFUSAO = new Set(['Outrage', 'Thrash', 'Petal Dance', 'Raging Fury'])

export function normalizarDanoPorTurno(movepool: Move[]): Move[] {
  const resultado: Move[] = []
  for (const move of movepool) {
    if (BANIDOS.has(move.name) || move.power <= 0) continue
    if (ATAQUES_DOIS_TURNOS.has(move.name)) {
      move.effectivePower = move.power / 2.0
      move.turns = 2
      if (!move.tags.includes('2T')) move.tags.push('2T')
    } else if (MENOS_UM_STATS.has(move.name)) {
      move.effectivePower = move.power * 0.835
      if (!move.tags.includes('-1ST')) move.tags.push('-1ST')
    } else if (MENOS_DOIS_STATS.has(move.name)) {
      move.effectivePower = move.power * 0.75
      if (!move.tags.includes('-2ST')) move.tags.push('-2ST')
    } else if (TRAVAMENTO_E_CONFUSAO.has(move.name)) {
      move.effectivePower = move.power * 0.75
      if (!move.tags.includes('LOCK')) move.tags.push('LOCK')
    } else if (DANO_EM_SI_MESMO.has(move.name)) {
      move.effectivePower = move.power * 0.66
      if (!move.tags.includes('SD')) move.tags.push('SD')
    }
    resultado.push(move)
  }
  return resultado
}

export function podarEstritamenteDominados(movepool: Move[]): Move[] {
  const ev = (m: Move) => m.effectivePower * (m.acc / 100) ** 2

  const melhorPorGrupo = new Map<string, { ev: number; name: string }>()
  for (const m of movepool) {
    const chave = `${m.type}|${m.category}`
    const evM = ev(m)
    const atual = melhorPorGrupo.get(chave)
    if (!atual || evM > atual.ev || (evM === atual.ev && m.name < atual.name)) {
      melhorPorGrupo.set(chave, { ev: evM, name: m.name })
    }
  }

  return movepool.filter(m => melhorPorGrupo.get(`${m.type}|${m.category}`)?.name === m.name)
}
