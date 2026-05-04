import type { Upgrades } from '../engine/loader'
import { exportUpgradesJson } from '../engine/loader'

interface Candidato {
  nome: string
  type1: string
  type2: string | null
  custo: number
}

interface Props {
  candidatos: Candidato[]
  upgrades: Upgrades
  onEditarUpgrade: (nome: string) => void
}

export default function CandidatosList({ candidatos, upgrades, onEditarUpgrade }: Props) {
  return (
    <div style={{ marginTop: 16, fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong>Candidatos: {candidatos.length}</strong>
        <button onClick={exportUpgradesJson} style={btnSmall}>⬇ Exportar upgrades.json</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {candidatos.map(({ nome, type1, type2, custo }) => (
          <span key={nome} onClick={() => onEditarUpgrade(nome)}
            style={{ ...tagStyle, cursor: 'pointer', borderColor: upgrades[nome] ? '#4caf50' : '#000' }}
            title="Clique para editar upgrades">
            {nome} <span style={{ opacity: 0.6 }}>{type1}{type2 ? `/${type2}` : ''}</span>
            {upgrades[nome] && <span style={{ color: '#4caf50', marginLeft: 4 }}>★</span>}
            <span style={{ opacity: 0.5, marginLeft: 4 }}>[{custo}]</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const tagStyle: React.CSSProperties = { background: 'transparent', border: '1px solid #000', borderRadius: 3, padding: '2px 6px', fontSize: 11 }
const btnSmall: React.CSSProperties = { border: '1px solid #333', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontFamily: 'monospace', background: 'transparent' }
