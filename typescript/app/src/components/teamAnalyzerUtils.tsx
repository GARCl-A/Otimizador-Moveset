import { buildPokemon, findMoveByName, getAllMoveNames } from '../engine/loader'
import type { MembroTime } from '../engine/teamAnalyzer'
import { Move } from '../engine/move'

export interface MembroInput {
  nome: string
  otimizar: boolean
  moves: [string, string, string, string]
  fontes: string[]
}

export interface TMInput {
  nome: string
}

export interface TeamSnapshot {
  membros: MembroInput[]
  candidato: MembroInput
  modo: 'pokemon' | 'tm'
  tmInput: TMInput
}

export const MEMBRO_VAZIO: MembroInput = { nome: '', otimizar: false, moves: ['', '', '', ''], fontes: ['Level', 'TM'] }
export const TM_VAZIO: TMInput = { nome: '' }
export const FONTES_DISPONIVEIS = ['Level', 'TM', 'Egg']
const LS_KEY = 'teamAnalyzer_snapshot'

export function loadSnapshot(): TeamSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveSnapshot(snap: TeamSnapshot): void {
  localStorage.setItem(LS_KEY, JSON.stringify(snap))
}

export function exportJson(snap: TeamSnapshot): void {
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'team_analyzer.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

export function buildMembro(m: MembroInput): MembroTime | null {
  if (!m.nome.trim()) return null
  try {
    const pokemon = buildPokemon(m.nome.trim(), m.fontes)

    if (m.otimizar) {
      return { pokemon, moveset: pokemon.moveset, otimizar: true }
    }

    const moveset = m.moves
      .map(nome => nome.trim())
      .filter(Boolean)
      .map(nome => pokemon.moveset.find(mv => mv.name.toLowerCase() === nome.toLowerCase()))
      .filter((mv): mv is NonNullable<typeof mv> => mv !== undefined)

    if (!moveset.length) return null
    return { pokemon, moveset, otimizar: false }
  } catch {
    return null
  }
}

export function buildTM(t: TMInput): Move | null {
  const data = findMoveByName(t.nome.trim())
  if (!data) return null
  return new Move(data)
}

export function TMEditor({ tmInput, onChange }: { tmInput: TMInput; onChange: (t: TMInput) => void }) {
  const allMoves = getAllMoveNames()
  const resolved = findMoveByName(tmInput.nome.trim())

  return (
    <div style={{ border: '1px solid #444', borderRadius: 4, padding: 8, marginBottom: 8 }}>
      <input
        list="move-list"
        placeholder="Nome do move (ex: Ice Beam)"
        value={tmInput.nome}
        onChange={e => onChange({ nome: e.target.value })}
        style={{ width: '100%', fontSize: 12, boxSizing: 'border-box' }}
      />
      <datalist id="move-list">
        {allMoves.map(m => <option key={m} value={m} />)}
      </datalist>
      {resolved && (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>
          {resolved.type} / {resolved.category} / {resolved.power > 0 ? `${resolved.power} BP` : 'Status'} / {resolved.accuracy > 0 ? `${resolved.accuracy}% acc` : '—'}
        </div>
      )}
      {tmInput.nome.trim() && !resolved && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#f44336' }}>Move não encontrado na pokedex.</div>
      )}
    </div>
  )
}

export function MembroEditor({
  membro, label, onChange, onRemove,
}: {
  membro: MembroInput
  label: string
  onChange: (m: MembroInput) => void
  onRemove?: () => void
}) {
  const setMove = (i: number, v: string) => {
    const moves = [...membro.moves] as MembroInput['moves']
    moves[i] = v
    onChange({ ...membro, moves })
  }

  const toggleFonte = (f: string) => {
    const next = membro.fontes.includes(f)
      ? membro.fontes.filter(x => x !== f)
      : [...membro.fontes, f]
    onChange({ ...membro, fontes: next })
  }

  return (
    <div style={{ border: '1px solid #444', borderRadius: 4, padding: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 'bold', fontSize: 12 }}>{label}</span>
        {onRemove && <button onClick={onRemove} style={{ fontSize: 10, padding: '2px 6px' }}>Remover</button>}
      </div>
      <input
        placeholder="Nome do Pokémon"
        value={membro.nome}
        onChange={e => onChange({ ...membro, nome: e.target.value })}
        style={{ width: '100%', marginBottom: 6, fontSize: 12, boxSizing: 'border-box' }}
      />
      <div style={{ marginBottom: 6 }}>
        {FONTES_DISPONIVEIS.map(f => (
          <label key={f} style={{ fontSize: 11, marginRight: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={membro.fontes.includes(f)} onChange={() => toggleFonte(f)} style={{ marginRight: 3 }} />
            {f}
          </label>
        ))}
      </div>
      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={membro.otimizar}
          onChange={e => onChange({ ...membro, otimizar: e.target.checked })}
        />
        Otimizar moves automaticamente
      </label>
      {!membro.otimizar && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {membro.moves.map((mv, i) => (
            <input
              key={i}
              placeholder={`Move ${i + 1}`}
              value={mv}
              onChange={e => setMove(i, e.target.value)}
              style={{ fontSize: 11 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
