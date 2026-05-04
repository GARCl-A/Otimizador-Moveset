import { useState } from 'react'
import type { Upgrade, Upgrades } from './engine/loader'
import type { PokemonData } from './engine/pokemon'

const CUSTO_SEQUENCIA = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0.5, 0.25]
const TIPOS = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy']
const CATEGORIAS = ['Physical', 'Special', 'Status']

function custoEfetivo(custoBase: number, reducoes: number): number {
  const idx = CUSTO_SEQUENCIA.indexOf(custoBase)
  if (idx === -1) return custoBase
  return CUSTO_SEQUENCIA[Math.min(idx + reducoes, CUSTO_SEQUENCIA.length - 1)]
}

type EggMove = Upgrade['eggMoves'][number]

interface Props {
  nome: string
  data: PokemonData
  upgrades: Upgrades
  onSave: (upgrades: Upgrades) => void
  onClose: () => void
}

const emptyMove = (): EggMove => ({ name: '', type: 'Normal', category: 'Physical', power: 0, accuracy: 100 })

export default function UpgradeEditor({ nome, data, upgrades, onSave, onClose }: Props) {
  const upgrade: Upgrade = upgrades[nome] ?? { custoReducoes: 0, eggMoves: [] }
  const [reducoes, setReducoes] = useState(upgrade.custoReducoes)
  const [eggMoves, setEggMoves] = useState<EggMove[]>(upgrade.eggMoves)
  const [novo, setNovo] = useState<EggMove>(emptyMove())

  const custoBase = data.cost
  const custoAtual = custoEfetivo(custoBase, reducoes)

  function addMove() {
    if (!novo.name.trim()) return
    setEggMoves(prev => [...prev, { ...novo, name: novo.name.trim() }])
    setNovo(emptyMove())
  }

  function removeMove(idx: number) {
    setEggMoves(prev => prev.filter((_, i) => i !== idx))
  }

  function salvar() {
    const novo2: Upgrades = { ...upgrades }
    if (reducoes === 0 && eggMoves.length === 0) {
      delete novo2[nome]
    } else {
      novo2[nome] = { custoReducoes: reducoes, eggMoves }
    }
    onSave(novo2)
    onClose()
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong style={{ fontSize: 15 }}>
            {nome} <span style={{ color: '#888', fontWeight: 'normal' }}>({data.type1}{data.type2 ? `/${data.type2}` : ''})</span>
          </strong>
          <button onClick={onClose} style={btnIcon}>✕</button>
        </div>

        {/* Custo */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabel}>Custo</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Base: <strong>{custoBase}</strong> → Efetivo: <strong style={{ color: reducoes > 0 ? '#2a7' : undefined }}>{custoAtual}</strong>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(r => (
              <button key={r} onClick={() => setReducoes(r)} style={{ ...btnToggle, ...(reducoes === r ? btnToggleActive : {}) }}>
                {r === 0 ? 'Sem redução' : r === 1 ? '-1' : '-2'}
              </button>
            ))}
          </div>
        </div>

        {/* Egg Moves existentes */}
        <div style={{ marginBottom: 12 }}>
          <div style={sectionLabel}>Egg Moves desbloqueados ({eggMoves.length})</div>
          {eggMoves.length === 0 && <div style={{ fontSize: 12, color: '#888' }}>Nenhum adicionado.</div>}
          {eggMoves.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
              <span style={{ flex: 1 }}>
                <strong>{m.name}</strong> <span style={{ color: '#666' }}>{m.type} · {m.category} · PWR {m.power || '—'} · ACC {m.accuracy || '—'}</span>
              </span>
              <button onClick={() => removeMove(i)} style={btnIcon}>✕</button>
            </div>
          ))}
        </div>

        {/* Formulário de adição */}
        <div style={{ borderTop: '1px solid #ddd', paddingTop: 12 }}>
          <div style={sectionLabel}>Adicionar egg move</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <div>
              <div style={fieldLabel}>Nome</div>
              <input value={novo.name} onChange={e => setNovo(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addMove()}
                style={{ ...inputStyle, width: '100%' }} placeholder="Ex: Wish" />
            </div>
            <div>
              <div style={fieldLabel}>Tipo</div>
              <select value={novo.type} onChange={e => setNovo(p => ({ ...p, type: e.target.value }))} style={selectStyle}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={fieldLabel}>Categoria</div>
              <select value={novo.category} onChange={e => setNovo(p => ({ ...p, category: e.target.value }))} style={selectStyle}>
                {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={fieldLabel}>Power</div>
              <input type="number" value={novo.power} min={0}
                onChange={e => setNovo(p => ({ ...p, power: +e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <div style={fieldLabel}>Accuracy</div>
              <input type="number" value={novo.accuracy} min={0} max={100}
                onChange={e => setNovo(p => ({ ...p, accuracy: +e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
          <button onClick={addMove} style={{ ...btnToggle, ...btnToggleActive }}>+ Adicionar</button>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnToggle}>Cancelar</button>
          <button onClick={salvar} style={{ ...btnToggle, ...btnToggleActive }}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modal: React.CSSProperties = { background: '#fff', border: '1px solid #ccc', borderRadius: 6, padding: 20, width: 460, maxHeight: '90vh', overflowY: 'auto', fontFamily: 'monospace', fontSize: 13 }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: '#555', marginBottom: 6 }
const fieldLabel: React.CSSProperties = { fontSize: 11, color: '#666', marginBottom: 2 }
const inputStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3 }
const selectStyle: React.CSSProperties = { ...inputStyle, width: '100%' }
const btnToggle: React.CSSProperties = { border: '1px solid #333', borderRadius: 3, padding: '4px 12px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12, background: 'transparent' }
const btnToggleActive: React.CSSProperties = { background: '#333', color: '#fff' }
const btnIcon: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 4px' }
