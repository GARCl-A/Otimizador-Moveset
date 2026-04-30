import { useState, useEffect, useMemo } from 'react'
import { loadData, buildPokemon, getAllNames, getPokemonData, getPriorities } from './engine/loader'
import { loadTypeChart } from './engine/moveDict'
import { rodarOtimizador } from './engine/runner'
import { gerarRelatorio } from './engine/reporter'

const TODOS_FONTES = ['Level', 'TM', 'Egg']

export default function App() {
  const [dadosCarregados, setDadosCarregados] = useState(false)
  const [todosNomes, setTodosNomes] = useState<string[]>([])

  const [fontes, setFontes] = useState<string[]>(['Level'])
  const [tamanhoTime, setTamanhoTime] = useState(6)
  const [budget, setBudget] = useState(10)
  const [whitelist, setWhitelist] = useState('')
  const [banlist, setBanlist] = useState('Rayquaza, Eternatus, Tapu Fini')
  const [typeFilter, setTypeFilter] = useState('')
  const [saTemperatura, setSaTemperatura] = useState(200.0)
  const [saCooling, setSaCooling] = useState(0.9995)
  const [saIteracoes, setSaIteracoes] = useState(10000)

  const [progresso, setProgresso] = useState(0)
  const [status, setStatus] = useState('')
  const [relatorio, setRelatorio] = useState('')
  const [rodando, setRodando] = useState(false)
  const [scoreInfo, setScoreInfo] = useState<{ score: number; scoreMaximo: number; custoTotal: number; fontes: string[] } | null>(null)

  useEffect(() => {
    Promise.all([loadData(), loadTypeChart()]).then(() => {
      setTodosNomes(getAllNames())
      setDadosCarregados(true)
    })
  }, [])

  function parseList(s: string): string[] {
    return s.split(',').map(x => x.trim()).filter(Boolean)
  }

  function toggleFonte(fonte: string) {
    setFontes(prev => prev.includes(fonte) ? prev.filter(f => f !== fonte) : [...prev, fonte])
  }

  // Lista de candidatos derivada reativamente dos filtros
  const candidatosPreview = useMemo(() => {
    if (!dadosCarregados) return []
    const whitelistArr = parseList(whitelist)
    const banlistArr = parseList(banlist)
    const typeFilterArr = parseList(typeFilter)

    const nomes = whitelistArr.length
      ? whitelistArr.filter(n => todosNomes.includes(n))
      : todosNomes.filter(nome => {
          if (banlistArr.includes(nome)) return false
          if (!typeFilterArr.length) return true
          const data = getPokemonData(nome)
          return typeFilterArr.includes(data.type1) || (data.type2 != null && typeFilterArr.includes(data.type2))
        })

    return nomes
      .filter(nome => (getPokemonData(nome)?.cost ?? 999) <= budget)
      .map(nome => {
        const data = getPokemonData(nome)
        return { nome, type1: data.type1, type2: data.type2 }
      })
  }, [dadosCarregados, whitelist, banlist, typeFilter, budget, todosNomes])

  async function rodar() {
    setRodando(true)
    setRelatorio('')
    setScoreInfo(null)
    setProgresso(0)
    setStatus('Preparando...')

    try {
      const priorities = getPriorities()
      const whitelistArr = parseList(whitelist)
      const banlistArr = parseList(banlist)
      const typeFilterArr = parseList(typeFilter)

      const custos: Record<string, number> = {}
      const candidatos = candidatosPreview.map(({ nome }) => {
        custos[nome] = getPokemonData(nome).cost
        return buildPokemon(nome, fontes)
      })

      const metaInimigos = todosNomes.map(nome => buildPokemon(nome, ['Level', 'TM']))
      for (const p of metaInimigos) p.optimizeMoveset()

      let etapaAtual = 0
      // Estimativa de etapas: 1 (caches) + N candidatos (individual) + N*rodadas (SA)
      const totalEtapas = 1 + candidatos.length + candidatos.length * tamanhoTime

      const result = await rodarOtimizador(
        candidatos,
        metaInimigos,
        custos,
        priorities,
        { fontes, tamanhoTime, budget, saTemperatura, saCooling, saIteracoes, banlist: banlistArr, typeFilter: typeFilterArr },
        {
          onLog: (msg) => {
            etapaAtual++
            setStatus(msg.trim())
            setProgresso(Math.min(99, Math.round(etapaAtual / totalEtapas * 100)))
          }
        }
      )

      setProgresso(100)
      setStatus('Concluído!')

      setScoreInfo({ score: result.score, scoreMaximo: result.scoreMaximo, custoTotal: result.custoTotal, fontes })

      const txt = gerarRelatorio(
        result.time,
        metaInimigos,
        priorities,
        result.score,
        result.scoreMaximo,
        budget,
        result.custoTotal,
        fontes
      )
      setRelatorio(txt)
    } catch (e) {
      setStatus(`ERRO: ${e}`)
    }

    setRodando(false)
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: 16, display: 'flex', gap: 24, minHeight: '100vh', boxSizing: 'border-box' }}>

      {/* LADO ESQUERDO — configs */}
      <div style={{ width: 420, flexShrink: 0 }}>
        <h2 style={{ marginTop: 0 }}>Otimizador Moveset</h2>

        {!dadosCarregados && <div>Carregando dados...</div>}

        {dadosCarregados && (
          <>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
              <tr>
                <td style={tdLabel}>Fontes</td>
                <td style={tdValue}>
                  {TODOS_FONTES.map(f => (
                    <label key={f} style={{ marginRight: 12 }}>
                      <input type="checkbox" checked={fontes.includes(f)} onChange={() => toggleFonte(f)} /> {f}
                    </label>
                  ))}
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>Tamanho do Time</td>
                <td style={tdValue}>
                  <input type="number" value={tamanhoTime} min={1} max={6} onChange={e => setTamanhoTime(+e.target.value)} style={inputStyle} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>Budget</td>
                <td style={tdValue}>
                  <input type="number" value={budget} min={1} onChange={e => setBudget(+e.target.value)} style={inputStyle} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>Whitelist</td>
                <td style={tdValue}>
                  <input type="text" value={whitelist} onChange={e => setWhitelist(e.target.value)} placeholder="Ariados, Kricketune, ..." style={{ ...inputStyle, width: '100%' }} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>Banlist</td>
                <td style={tdValue}>
                  <input type="text" value={banlist} onChange={e => setBanlist(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>Type Filter</td>
                <td style={tdValue}>
                  <input type="text" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} placeholder="Bug, Grass, ... (vazio = sem filtro)" style={{ ...inputStyle, width: '100%' }} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>SA Temperatura</td>
                <td style={tdValue}>
                  <input type="number" value={saTemperatura} step={10} onChange={e => setSaTemperatura(+e.target.value)} style={inputStyle} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>SA Cooling</td>
                <td style={tdValue}>
                  <input type="number" value={saCooling} step={0.0001} min={0} max={1} onChange={e => setSaCooling(+e.target.value)} style={inputStyle} />
                </td>
              </tr>
              <tr>
                <td style={tdLabel}>SA Iterações</td>
                <td style={tdValue}>
                  <input type="number" value={saIteracoes} step={1000} min={1000} onChange={e => setSaIteracoes(+e.target.value)} style={inputStyle} />
                </td>
              </tr>
            </tbody>
          </table>

          {/* Preview de candidatos */}
          <div style={{ marginTop: 16, fontSize: 12 }}>
            <strong>Candidatos: {candidatosPreview.length}</strong>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {candidatosPreview.map(({ nome, type1, type2 }) => (
                <span key={nome} style={tagStyle}>
                  {nome} <span style={{ opacity: 0.7 }}>{type1}{type2 ? `/${type2}` : ''}</span>
                </span>
              ))}
            </div>
          </div>

          <button onClick={rodar} disabled={rodando || candidatosPreview.length === 0} style={{ marginTop: 16, padding: '8px 24px', fontSize: 14 }}>
            {rodando ? 'Rodando...' : 'Rodar Otimizador'}
          </button>

          {/* Barra de progresso */}
          {(rodando || progresso > 0) && (
            <div style={{ marginTop: 12 }}>
              <div style={{ background: '#333', borderRadius: 4, height: 8, width: '100%' }}>
                <div style={{ background: '#4caf50', height: 8, borderRadius: 4, width: `${progresso}%`, transition: 'width 0.2s' }} />
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: '#aaa' }}>{status}</div>
            </div>
          )}
        </>
      )}
      </div>

      {/* LADO DIREITO — resultados */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {scoreInfo && (
          <>
            <h2 style={{ marginTop: 0 }}>Resultado</h2>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <div><strong>Score:</strong> {scoreInfo.score.toFixed(2)} / {scoreInfo.scoreMaximo.toFixed(0)} <span style={{ color: '#888' }}>({(scoreInfo.score / scoreInfo.scoreMaximo * 100).toFixed(1)}% de cobertura)</span></div>
              <div><strong>Budget:</strong> {scoreInfo.custoTotal} / {budget}</div>
              <div><strong>Fontes:</strong> {scoreInfo.fontes.join(', ')}</div>
            </div>
          </>
        )}

        {relatorio && (
          <pre style={{ background: '#1a1a1a', color: '#eee', padding: 12, margin: 0, overflow: 'auto', fontSize: 12 }}>
            {relatorio}
          </pre>
        )}
      </div>

    </div>
  )
}

const tdLabel: React.CSSProperties = { padding: '4px 12px 4px 0', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const tdValue: React.CSSProperties = { padding: '4px 0', verticalAlign: 'middle' }
const inputStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 13, padding: '2px 6px' }
const tagStyle: React.CSSProperties = { background: 'transparent', border: '1px solid #000', borderRadius: 3, padding: '2px 6px', fontSize: 11 }
