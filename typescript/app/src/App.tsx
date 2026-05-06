import { useState, useEffect } from 'react'
import { loadData, getAllNames, getPokemonData, getUpgrades, saveUpgrades } from './engine/loader'
import type { Upgrades } from './engine/loader'
import { loadTypeChart } from './engine/moveDict'
import { useOtimizador } from './hooks/useOtimizador'
import { useCandidatos } from './hooks/useCandidatos'
import ConfigPanel from './components/ConfigPanel'
import CandidatosList from './components/CandidatosList'
import ResultPanel from './components/ResultPanel'
import UpgradeEditor from './UpgradeEditor'
import TeamAnalyzer from './components/TeamAnalyzer'

export default function App() {
  const [dadosCarregados, setDadosCarregados] = useState(false)
  const [todosNomes, setTodosNomes] = useState<string[]>([])
  const [upgrades, setUpgrades] = useState<Upgrades>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [aba, setAba] = useState<'otimizador' | 'analisador'>('otimizador')

  useEffect(() => {
    Promise.all([loadData(), loadTypeChart()]).then(() => {
      setTodosNomes(getAllNames())
      setUpgrades(getUpgrades())
      setDadosCarregados(true)
    })
  }, [])

  const { config, setConfigField, rodando, progresso, status, resultado, rodar } =
    useOtimizador(todosNomes)

  const candidatos = useCandidatos({
    dadosCarregados,
    todosNomes,
    whitelist: config.whitelist,
    banlist: config.banlist,
    typeFilter: config.typeFilter,
    budget: config.budget,
    upgrades,
  })

  if (!dadosCarregados) return <div style={{ fontFamily: 'monospace', padding: 16 }}>Carregando dados...</div>

  return (
    <div style={{ fontFamily: 'monospace', padding: 16, minHeight: '100vh', boxSizing: 'border-box' }}>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setAba('otimizador')} style={{ fontWeight: aba === 'otimizador' ? 'bold' : 'normal', textDecoration: aba === 'otimizador' ? 'underline' : 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>Otimizador</button>
        <button onClick={() => setAba('analisador')} style={{ fontWeight: aba === 'analisador' ? 'bold' : 'normal', textDecoration: aba === 'analisador' ? 'underline' : 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>Analisar Substituição</button>
      </div>

      {aba === 'analisador' && <TeamAnalyzer />}

      {aba === 'otimizador' && (
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ width: 420, flexShrink: 0 }}>
            <h2 style={{ marginTop: 0 }}>Otimizador Moveset</h2>
            <ConfigPanel config={config} onChange={setConfigField} />
            <CandidatosList candidatos={candidatos} upgrades={upgrades} onEditarUpgrade={setEditando} />
            <button onClick={() => rodar(candidatos.map(c => c.nome))} disabled={rodando || candidatos.length === 0}
              style={{ marginTop: 16, padding: '8px 24px', fontSize: 14 }}>
              {rodando ? 'Rodando...' : 'Rodar Otimizador'}
            </button>
            {(rodando || progresso > 0) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ background: '#333', borderRadius: 4, height: 8, width: '100%' }}>
                  <div style={{ background: '#4caf50', height: 8, borderRadius: 4, width: `${progresso}%`, transition: 'width 0.2s' }} />
                </div>
                <div style={{ fontSize: 12, marginTop: 4, color: '#aaa' }}>{status}</div>
              </div>
            )}
          </div>
          <ResultPanel resultado={resultado} budget={config.budget} />
        </div>
      )}

      {editando && (
        <UpgradeEditor
          nome={editando}
          data={getPokemonData(editando)}
          upgrades={upgrades}
          onSave={u => { setUpgrades(u); saveUpgrades(u) }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  )
}
