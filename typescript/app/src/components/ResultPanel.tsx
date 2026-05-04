import type { ResultadoOtimizacao } from '../hooks/useOtimizador'

interface Props {
  resultado: ResultadoOtimizacao | null
  budget: number
}

export default function ResultPanel({ resultado, budget }: Props) {
  if (!resultado) return null
  const { scoreInfo, relatorio } = resultado
  const cobertura = (scoreInfo.score / scoreInfo.scoreMaximo * 100).toFixed(1)

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <h2 style={{ marginTop: 0 }}>Resultado</h2>
      <div style={{ fontSize: 13, marginBottom: 12 }}>
        <div>
          <strong>Score:</strong> {scoreInfo.score.toFixed(2)} / {scoreInfo.scoreMaximo.toFixed(0)}{' '}
          <span style={{ color: '#888' }}>({cobertura}% de cobertura)</span>
        </div>
        <div><strong>Budget:</strong> {scoreInfo.custoTotal} / {budget}</div>
        <div><strong>Fontes:</strong> {scoreInfo.fontes.join(', ')}</div>
      </div>
      <pre style={{ background: '#1a1a1a', color: '#eee', padding: 12, margin: 0, overflow: 'auto', fontSize: 12 }}>
        {relatorio}
      </pre>
    </div>
  )
}
