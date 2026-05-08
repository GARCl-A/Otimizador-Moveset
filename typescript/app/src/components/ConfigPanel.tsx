import type { Config } from '../hooks/useOtimizador'

const TODOS_FONTES = ['Level', 'TM', 'Egg']

interface Props {
  config: Config
  onChange: <K extends keyof Config>(key: K, value: Config[K]) => void
}

export default function ConfigPanel({ config, onChange }: Props) {
  function toggleFonte(fonte: string) {
    const next = config.fontes.includes(fonte)
      ? config.fontes.filter(f => f !== fonte)
      : [...config.fontes, fonte]
    onChange('fontes', next)
  }

  const isGA = config.algoritmo === 'genetic'

  function setGrupo(i: number, value: string) {
    onChange('gruposExclusao', config.gruposExclusao.map((g, idx) => idx === i ? value : g))
  }

  function addGrupo() {
    onChange('gruposExclusao', [...config.gruposExclusao, ''])
  }

  function removeGrupo(i: number) {
    onChange('gruposExclusao', config.gruposExclusao.filter((_, idx) => idx !== i))
  }

  return (
    <>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
          <tr>
            <td style={tdLabel}>Algoritmo</td>
            <td style={tdValue}>
              <select value={config.algoritmo} onChange={e => onChange('algoritmo', e.target.value as 'simulated-annealing' | 'genetic')} style={inputStyle}>
                <option value="simulated-annealing">Simulated Annealing</option>
                <option value="genetic">Genetic Algorithm</option>
              </select>
            </td>
          </tr>
          <tr>
            <td style={tdLabel}>Fontes</td>
            <td style={tdValue}>
              {TODOS_FONTES.map(f => (
                <label key={f} style={{ marginRight: 12 }}>
                  <input type="checkbox" checked={config.fontes.includes(f)} onChange={() => toggleFonte(f)} /> {f}
                </label>
              ))}
            </td>
          </tr>
          <tr>
            <td style={tdLabel}>Tamanho do Time</td>
            <td style={tdValue}>
              <input type="number" value={config.tamanhoTime} min={1} max={6} onChange={e => onChange('tamanhoTime', +e.target.value)} style={inputStyle} />
            </td>
          </tr>
          <tr>
            <td style={tdLabel}>Budget</td>
            <td style={tdValue}>
              <input type="number" value={config.budget} min={1} onChange={e => onChange('budget', +e.target.value)} style={inputStyle} />
            </td>
          </tr>
          <tr>
            <td style={tdLabel}>Whitelist</td>
            <td style={tdValue}>
              <input type="text" value={config.whitelist} onChange={e => onChange('whitelist', e.target.value)} placeholder="Ariados, Kricketune, ..." style={{ ...inputStyle, width: '100%' }} />
            </td>
          </tr>
          <tr>
            <td style={tdLabel}>Banlist</td>
            <td style={tdValue}>
              <input type="text" value={config.banlist} onChange={e => onChange('banlist', e.target.value)} style={{ ...inputStyle, width: '100%' }} />
              <div style={{ fontSize: 11, marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={config.banirLendarios} onChange={e => onChange('banirLendarios', e.target.checked)} />
                  Banir lendários
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={config.banirRecoil} onChange={e => onChange('banirRecoil', e.target.checked)} />
                  Banir moves com recoil
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={config.banirLock} onChange={e => onChange('banirLock', e.target.checked)} />
                  Banir moves com lock
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={config.priorizarHP} onChange={e => onChange('priorizarHP', e.target.checked)} />
                  Priorizar 100% de HP
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={config.coberturasDupla} onChange={e => onChange('coberturasDupla', e.target.checked)} />
                  Cobertura dupla
                </label>
              </div>
            </td>
          </tr>
          <tr>
            <td style={tdLabel}>Type Filter</td>
            <td style={tdValue}>
              <input type="text" value={config.typeFilter} onChange={e => onChange('typeFilter', e.target.value)} placeholder="Bug, Grass, ..." style={{ ...inputStyle, width: '100%' }} />
            </td>
          </tr>
          <tr>
            <td style={tdLabel}>Time Fixo</td>
            <td style={tdValue}>
              <input type="text" value={config.timeFixoInput} onChange={e => onChange('timeFixoInput', e.target.value)} placeholder="Gardevoir, Metagross, ..." style={{ ...inputStyle, width: '100%' }} />
            </td>
          </tr>
          {!isGA && (
            <>
              <tr>
                <td style={tdLabel}>SA Temperatura</td>
                <td style={tdValue}>
                  <input type="number" value={config.saTemperatura} step={10} onChange={e => onChange('saTemperatura', +e.target.value)} style={inputStyle} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>SA Cooling</td>
                <td style={tdValue}>
                  <input type="number" value={config.saCooling} step={0.0001} min={0} max={1} onChange={e => onChange('saCooling', +e.target.value)} style={inputStyle} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>SA Iterações</td>
                <td style={tdValue}>
                  <input type="number" value={config.saIteracoes} step={1000} min={1000} onChange={e => onChange('saIteracoes', +e.target.value)} style={inputStyle} />
                </td>
              </tr>
            </>
          )}
          {isGA && (
            <>
              <tr>
                <td style={tdLabel}>GA População</td>
                <td style={tdValue}>
                  <input type="number" value={config.gaPopulacao} step={10} min={10} onChange={e => onChange('gaPopulacao', +e.target.value)} style={inputStyle} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>GA Gerações</td>
                <td style={tdValue}>
                  <input type="number" value={config.gaGeracoes} step={10} min={10} onChange={e => onChange('gaGeracoes', +e.target.value)} style={inputStyle} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>GA Taxa Mutação</td>
                <td style={tdValue}>
                  <input type="number" value={config.gaMutacao} step={0.05} min={0} max={1} onChange={e => onChange('gaMutacao', +e.target.value)} style={inputStyle} />
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 'bold' }}>Grupos de exclusão</span>
          <button onClick={addGrupo} style={btnSmall}>+ Grupo</button>
        </div>
        {config.gruposExclusao.map((grupo, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <input value={grupo} onChange={e => setGrupo(i, e.target.value)} placeholder="Gallade, Gardevoir, Kirlia" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => removeGrupo(i)} style={btnSmall}>✕</button>
          </div>
        ))}
      </div>
    </>
  )
}

const tdLabel: React.CSSProperties = { padding: '4px 12px 4px 0', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const tdValue: React.CSSProperties = { padding: '4px 0', verticalAlign: 'middle' }
const inputStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 13, padding: '2px 6px' }
const btnSmall: React.CSSProperties = { border: '1px solid #333', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontFamily: 'monospace', background: 'transparent' }
