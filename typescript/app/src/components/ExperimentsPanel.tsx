import { useState } from 'react'
import type { Config } from '../hooks/useOtimizador'
import { useExperiments } from '../hooks/useExperiments'
import { parseModelWeights } from '../engine/mlp'
import type { ModelWeights } from '../engine/mlp'
import { METHOD_LABEL } from '../engine/experiments'
import type { ExpMethod } from '../engine/experiments'
import { Boxplot, BarChart, Scatter, LineChart } from './charts'
import { PALETTE, baixarSvg } from './chartUtils'

const ALL_METHODS: ExpMethod[] = ['sa', 'ga', 'greedy-exato', 'greedy-nn']
const SHORT: Record<ExpMethod, string> = { sa: 'SA', ga: 'GA', 'greedy-exato': 'Greedy-X', 'greedy-nn': 'Greedy-NN' }

interface Props {
  candidatos: string[]
  config: Config
  todosNomes: string[]
  modelWeights: ModelWeights | null
  setModelWeights: (w: ModelWeights | null) => void
}

interface LossHistory {
  train: number[]
  val: number[]
}

export default function ExperimentsPanel({ candidatos, config, todosNomes, modelWeights, setModelWeights }: Props) {
  const exp = useExperiments(todosNomes)
  const [methods, setMethods] = useState<Record<ExpMethod, boolean>>({ sa: true, ga: true, 'greedy-exato': true, 'greedy-nn': true })
  const [nRuns, setNRuns] = useState(30)
  const [seed, setSeed] = useState(42)
  const [nTeams, setNTeams] = useState(500)
  const [history, setHistory] = useState<LossHistory | null>(null)

  function toggleMethod(m: ExpMethod) {
    setMethods(prev => ({ ...prev, [m]: !prev[m] }))
  }

  async function onWeightsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setModelWeights(parseModelWeights(JSON.parse(await file.text())))
    } catch (err) {
      alert(`model_weights.json inválido: ${err}`)
    }
    e.target.value = ''
  }

  async function onHistoryFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const j = JSON.parse(await file.text())
      if (!Array.isArray(j.train) || !Array.isArray(j.val)) throw new Error('faltam "train"/"val"')
      setHistory({ train: j.train, val: j.val })
    } catch (err) {
      alert(`training_history.json inválido: ${err}`)
    }
    e.target.value = ''
  }

  function rodar() {
    const selecionados = ALL_METHODS.filter(m => methods[m] && (m !== 'greedy-nn' || modelWeights))
    if (selecionados.length === 0) {
      alert('Selecione ao menos um método (greedy-NN exige pesos carregados).')
      return
    }
    exp.rodarExperimentos(candidatos, config, selecionados, nRuns, seed, modelWeights)
  }

  function exportarCSV() {
    const header = 'method,run,score,scoreMaximo,timeMs,typeRedundancy,team'
    const linhas = exp.runs.map(r =>
      [r.method, r.run, r.score.toFixed(3), r.scoreMaximo, r.timeMs.toFixed(2), r.typeRedundancy, `"${r.teamNames.join('|')}"`].join(',')
    )
    download([header, ...linhas].join('\n'), 'experimentos.csv', 'text/csv')
  }

  function exportarJSON() {
    download(JSON.stringify({ aggregates: exp.aggregates, runs: exp.runs }, null, 2), 'experimentos.json', 'application/json')
  }

  const scoreSeries = exp.aggregates.map(a => ({
    label: SHORT[a.method],
    color: PALETTE[a.method],
    min: a.min, q1: a.q1, median: a.median, q3: a.q3, max: a.max,
    points: exp.runs.filter(r => r.method === a.method).map(r => r.score),
  }))
  const timeBars = exp.aggregates.map(a => ({ label: SHORT[a.method], value: a.meanTimeMs, color: PALETTE[a.method] }))
  const redBars = exp.aggregates.map(a => ({ label: SHORT[a.method], value: a.meanRedundancy, color: PALETTE[a.method] }))
  const scatterPts = exp.scatter.map(p => ({ x: p.exact, y: p.predicted }))

  return (
    <div style={{ padding: 20, background: '#1e1e24', color: '#fff', borderRadius: 8, fontFamily: 'monospace' }}>
      <h2 style={{ marginTop: 0 }}>🧪 Experimentos / Comparação</h2>
      <p style={{ color: '#adb5bd', fontSize: 13, maxWidth: 760 }}>
        Roda N execuções independentes de cada método (SA, GA, greedy-exato, greedy-NN) sobre o mesmo pool e função
        de score, coletando distribuição de scores, tempo de montagem e redundância de tipo. Usa a configuração da
        aba <strong>Otimizador</strong> (budget, fontes, banlist, tamanho do time): <strong>{candidatos.length}</strong> candidatos, budget {config.budget}.
      </p>

      {/* Controles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={lbl}>Métodos</div>
          {ALL_METHODS.map(m => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 3, opacity: m === 'greedy-nn' && !modelWeights ? 0.5 : 1 }}>
              <input type="checkbox" checked={methods[m]} onChange={() => toggleMethod(m)} disabled={m === 'greedy-nn' && !modelWeights} />
              <span style={{ color: PALETTE[m] }}>■</span> {METHOD_LABEL[m]}
              {m === 'greedy-nn' && !modelWeights && <em style={{ color: '#ff6b6b', fontSize: 11 }}> (carregar pesos)</em>}
            </label>
          ))}
        </div>

        <div>
          <div style={lbl}>Parâmetros</div>
          <label style={row}>N execuções <input type="number" min={1} value={nRuns} onChange={e => setNRuns(+e.target.value)} style={num} /></label>
          <label style={row}>Seed <input type="number" value={seed} onChange={e => setSeed(+e.target.value)} style={num} /></label>
          <div style={{ fontSize: 11, color: '#888', maxWidth: 220 }}>greedy-* são determinísticos: 1 execução.</div>
        </div>

        <div>
          <div style={lbl}>Rede neural</div>
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            {modelWeights
              ? <span style={{ color: '#51cf66' }}>✓ pesos: arch [{modelWeights.arch.join(', ')}]</span>
              : <span style={{ color: '#ff6b6b' }}>nenhum modelo carregado</span>}
          </div>
          <label style={btnFile}>
            Carregar model_weights.json
            <input type="file" accept="application/json,.json" onChange={onWeightsFile} style={{ display: 'none' }} />
          </label>
          {modelWeights && <button onClick={() => setModelWeights(null)} style={{ ...btn, marginLeft: 6 }}>limpar</button>}
          <label style={{ ...btnFile, marginTop: 6 }}>
            Carregar training_history.json (loss)
            <input type="file" accept="application/json,.json" onChange={onHistoryFile} style={{ display: 'none' }} />
          </label>
        </div>

        <div>
          <div style={lbl}>Dataset de treino</div>
          <label style={row}>nº times <input type="number" min={1} value={nTeams} onChange={e => setNTeams(+e.target.value)} style={num} /></label>
          <button onClick={() => exp.gerarDataset(candidatos, config, nTeams, seed)} disabled={exp.rodando} style={btn}>Gerar dataset (CSV)</button>
          {exp.datasetInfo && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{exp.datasetInfo.nSamples} amostras</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={rodar} disabled={exp.rodando || candidatos.length === 0} style={{ ...btn, padding: '8px 20px' }}>
          {exp.rodando ? 'Rodando...' : 'Rodar experimentos'}
        </button>
        {exp.rodando && <button onClick={exp.cancelar} style={btn}>Cancelar</button>}
        <button onClick={exportarCSV} disabled={exp.runs.length === 0} style={btn}>Exportar resultados (CSV)</button>
        <button onClick={exportarJSON} disabled={exp.runs.length === 0} style={btn}>Exportar (JSON)</button>
      </div>

      {(exp.rodando || exp.progresso > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: '#333', borderRadius: 4, height: 8, width: '100%', maxWidth: 600 }}>
            <div style={{ background: '#4caf50', height: 8, borderRadius: 4, width: `${exp.progresso}%`, transition: 'width 0.2s' }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 4, color: '#aaa' }}>{exp.status}</div>
        </div>
      )}

      {/* Gráficos */}
      {exp.aggregates.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          <ChartCard title="Distribuição de scores (boxplot)" onDownload={() => baixarSvg('chart-box', 'scores_boxplot.svg')}>
            <Boxplot id="chart-box" series={scoreSeries} yLabel="score exato" />
          </ChartCard>
          <ChartCard title="Tempo médio de montagem" onDownload={() => baixarSvg('chart-time', 'tempos.svg')}>
            <BarChart id="chart-time" bars={timeBars} yLabel="ms" valueFormat={v => v.toFixed(0)} />
          </ChartCard>
          <ChartCard title="Redundância de tipo média" onDownload={() => baixarSvg('chart-red', 'redundancia.svg')}>
            <BarChart id="chart-red" bars={redBars} yLabel="tipos repetidos" valueFormat={v => v.toFixed(2)} />
          </ChartCard>
          {scatterPts.length > 0 && (
            <ChartCard title="Rede: previsto vs exato" onDownload={() => baixarSvg('chart-scatter', 'previsto_vs_exato.svg')}>
              <Scatter id="chart-scatter" points={scatterPts} />
            </ChartCard>
          )}
          {history && (
            <ChartCard title="Curva de loss (treino Python)" onDownload={() => baixarSvg('chart-loss', 'loss.svg')}>
              <LineChart id="chart-loss" series={[
                { label: 'treino', color: '#3b82f6', data: history.train },
                { label: 'val', color: '#ef4444', data: history.val },
              ]} />
            </ChartCard>
          )}
        </div>
      )}

      {/* Tabela de agregados */}
      {exp.aggregates.length > 0 && (
        <table style={{ borderCollapse: 'collapse', marginTop: 20, fontSize: 12 }}>
          <thead>
            <tr>{['Método', 'n', 'média', 'mediana', 'min', 'max', 'std', 'tempo(ms)', 'redund.'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {exp.aggregates.map(a => (
              <tr key={a.method}>
                <td style={{ ...td, color: PALETTE[a.method] }}>{METHOD_LABEL[a.method]}</td>
                <td style={td}>{a.n}</td>
                <td style={td}>{a.mean.toFixed(2)}</td>
                <td style={td}>{a.median.toFixed(2)}</td>
                <td style={td}>{a.min.toFixed(2)}</td>
                <td style={td}>{a.max.toFixed(2)}</td>
                <td style={td}>{a.std.toFixed(2)}</td>
                <td style={td}>{a.meanTimeMs.toFixed(1)}</td>
                <td style={td}>{a.meanRedundancy.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ChartCard({ title, onDownload, children }: { title: string; onDownload: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#ccc' }}>{title}</span>
        <button onClick={onDownload} style={{ ...btn, fontSize: 11, padding: '2px 8px' }}>baixar SVG</button>
      </div>
      {children}
    </div>
  )
}

function download(conteudo: string, filename: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 'bold', marginBottom: 6, color: '#ccc' }
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4, width: 200 }
const num: React.CSSProperties = { fontFamily: 'monospace', fontSize: 13, padding: '2px 6px', width: 80, background: '#333', color: '#fff', border: '1px solid #444', borderRadius: 3 }
const btn: React.CSSProperties = { border: '1px solid #444', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontFamily: 'monospace', background: '#2b2b36', color: '#fff', fontSize: 12 }
const btnFile: React.CSSProperties = { ...btn, display: 'inline-block' }
const th: React.CSSProperties = { border: '1px solid #444', padding: '4px 10px', textAlign: 'right', background: '#2b2b36' }
const td: React.CSSProperties = { border: '1px solid #333', padding: '4px 10px', textAlign: 'right' }
