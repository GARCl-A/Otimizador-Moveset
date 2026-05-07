import { Move } from './move'

const ATAQUES_DOIS_TURNOS = new Set([
  'Solar Beam', 'Hyper Beam', 'Giga Impact', 'Bounce', 'Dive', 'Dig',
  'Frenzy Plant', 'Solar Blade', 'Future Sight', 'Rock Wrecker',
  'Meteor Beam', 'Meteor Assault', 'Fly', 'Double Shock', 'Phantom Force', 'Sky Attack'
])
const MENOS_UM_STATS = new Set(['Superpower'])
const MENOS_DOIS_STATS = new Set(['Overheat', 'Leaf Storm'])
const DANO_EM_SI_MESMO = new Set([
  'Flare Blitz', 'Double-Edge', 'Axe Kick', 'Brave Bird',
  'Wild Charge', 'Wood Hammer', 'Supercell Slam',
])
const BANIDOS = new Set([
  'Focus Punch', 'First Impression', 'Fake Out', 'Explosion',
  'Self-Destruct', 'Steel Roller', 'Dream Eater', 'Misty Explosion','Foul Play', 'Psystrike', "Last Resort", "Belch"
])
const TRAVAMENTO_E_CONFUSAO = new Set(['Outrage', 'Thrash', 'Petal Dance', 'Raging Fury'])

// Tipagem estruturada para separar a mecânica estatística
type MultiHitMechanic = 'classic' | 'continuous' | 'escaling' | 'fixed';

interface MultiHitConfig {
  type: MultiHitMechanic;
  min: number;
  max: number;
}

const MULTI_HIT: Record<string, MultiHitConfig> = {
  // Accuracy rolada a cada hit
  'Population Bomb': { type: 'continuous', min: 1, max: 10 },
  'Triple Dive':     { type: 'continuous', min: 1, max: 3 },
  
  // Accuracy rolada a cada hit + O Poder multiplica a cada hit
  'Triple Axel':     { type: 'escaling', min: 1, max: 3 },

  // Accuracy rolada 1 vez no início. RNG interno define a quantidade de hits (3.1 média)
  'Bullet Seed':     { type: 'classic', min: 2, max: 5 },
  'Rock Blast':      { type: 'classic', min: 2, max: 5 },
  'Icicle Spear':    { type: 'classic', min: 2, max: 5 },
  'Pin Missile':     { type: 'classic', min: 2, max: 5 },
  'Bone Rush':       { type: 'classic', min: 2, max: 5 },
  'Fury Attack':     { type: 'classic', min: 2, max: 5 },
  'Fury Swipes':     { type: 'classic', min: 2, max: 5 },
  'Comet Punch':     { type: 'classic', min: 2, max: 5 },
  'Tail Slap':       { type: 'classic', min: 2, max: 5 },
  'Water Shuriken':  { type: 'classic', min: 2, max: 5 },

  // Hits cravados (2 hits sempre)
  'Bonemerang':      { type: 'fixed', min: 2, max: 2 },
  'Gear Grind':      { type: 'fixed', min: 2, max: 2 },
  'Twineedle':       { type: 'fixed', min: 2, max: 2 },
  'Dual Chop':       { type: 'fixed', min: 2, max: 2 },
  'Twin Beam':        { type: 'fixed', min: 2, max: 2 },
}

// Progressão geométrica: Retorna a média de hits antes de errar
function hitsEsperadosContinuos(minHits: number, maxHits: number, acc: number): number {
  const p = acc / 100.0
  let ev = 0.0
  let probChegou = 1.0
  for (let k = 1; k <= maxHits; k++) {
    const probExato = k < maxHits ? probChegou * p * (1 - p) : probChegou * p
    if (k >= minHits) ev += k * probExato
    probChegou *= p
  }
  return ev
}

export function normalizarDanoPorTurno(movepool: Move[], banirRecoil: boolean = false, banirLock: boolean = false): Move[] {
  const resultado: Move[] = []

  for (const move of movepool) {
    if (BANIDOS.has(move.name) || move.power <= 0) continue
    if (banirRecoil && DANO_EM_SI_MESMO.has(move.name)) continue
    if (banirLock && TRAVAMENTO_E_CONFUSAO.has(move.name)) continue

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
    } else if (move.name in MULTI_HIT) {
      const config = MULTI_HIT[move.name]
      let finalEffectivePower = move.power

      if (config.type === 'classic') {
        // RNG da Gen 5+: A média cravada é 3.1 hits.
        const evHits = config.max === 5 ? 3.1 : config.max
        finalEffectivePower = move.power * evHits
      } else if (config.type === 'fixed') {
        finalEffectivePower = move.power * config.max
      } else if (config.type === 'continuous') {
        // Ex: Population Bomb (Média ~6.5 hits se acc 90)
        const evHits = hitsEsperadosContinuos(config.min, config.max, move.acc)
        finalEffectivePower = move.power * evHits
      } else if (config.type === 'escaling') {
        // Ex: Triple Axel. (Power 20 -> 40 -> 60) multiplicados pela probabilidade de cada hit conectar
        const p = move.acc / 100.0
        let evPower = 0
        let probChegou = 1.0
        for (let k = 1; k <= config.max; k++) {
          probChegou *= p // chance do hit K conectar
          evPower += (move.power * k) * probChegou 
        }
        finalEffectivePower = evPower
      }

      move.effectivePower = finalEffectivePower
      const tag = config.min !== config.max ? `x${config.min}-${config.max}` : `x${config.min}`
      if (!move.tags.includes(tag)) move.tags.push(tag)
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