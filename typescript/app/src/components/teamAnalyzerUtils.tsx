import { useState, useRef, useEffect } from 'react'
import { buildPokemon, findMoveByName, getAllMoveNames, getAllNames } from '../engine/loader'
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

export function Autocomplete({
  value, onChange, options, placeholder, inputStyle,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  inputStyle?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = value.trim().length === 0
    ? []
    : options.filter(o => o.toLowerCase().includes(value.toLowerCase())).slice(0, 12)

  useEffect(() => { setHighlighted(0) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); onChange(filtered[highlighted]); setOpen(false) }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{ width: '100%', boxSizing: 'border-box', ...inputStyle }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0,
          background: '#fff', border: '1px solid #555', borderRadius: 3,
          maxHeight: 180, overflowY: 'auto',
        }}>
          {filtered.map((opt, i) => (
            <div
              key={opt}
              onMouseDown={() => { onChange(opt); setOpen(false) }}
              style={{
                padding: '4px 8px', cursor: 'pointer', fontSize: 12,
                color: '#111', background: i === highlighted ? '#ddd' : '#fff',
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TMEditor({ tmInput, onChange }: { tmInput: TMInput; onChange: (t: TMInput) => void }) {
  const allMoves = getAllMoveNames()
  const resolved = findMoveByName(tmInput.nome.trim())

  return (
    <div style={{ border: '1px solid #444', borderRadius: 4, padding: 8, marginBottom: 8 }}>
      <Autocomplete
        value={tmInput.nome}
        onChange={nome => onChange({ nome })}
        options={allMoves}
        placeholder="Nome do move (ex: Ice Beam)"
        inputStyle={{ fontSize: 12 }}
      />
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
  const allNames = getAllNames()

  const moveOptions: string[] = (() => {
    if (!membro.nome.trim()) return getAllMoveNames()
    try {
      const p = buildPokemon(membro.nome.trim(), membro.fontes)
      return p.moveset.map(m => m.name)
    } catch {
      return getAllMoveNames()
    }
  })()

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
      <Autocomplete
        value={membro.nome}
        onChange={nome => onChange({ ...membro, nome })}
        options={allNames}
        placeholder="Nome do Pokémon"
        inputStyle={{ fontSize: 12, marginBottom: 6 }}
      />
      <div style={{ marginBottom: 6, marginTop: 6 }}>
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
            <Autocomplete
              key={i}
              value={mv}
              onChange={v => setMove(i, v)}
              options={moveOptions}
              placeholder={`Move ${i + 1}`}
              inputStyle={{ fontSize: 11 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
