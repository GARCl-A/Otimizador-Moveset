import { useState } from 'react'
import type { ConfrontoDetalhe, ResultadoSubstituicao, ResultadoTM } from '../engine/teamAnalyzer'

function ConfrontoList({ itens, positivo }: { itens: ConfrontoDetalhe[]; positivo: boolean }) {
  if (!itens.length) return null
  const cor = positivo ? '#4caf50' : '#f44336'
  const label = positivo ? `✓ Melhora (${itens.length})` : `✗ Piora (${itens.length})`

  return (
    <div style={{ marginBottom: positivo ? 6 : 0 }}>
      <div style={{ color: cor, fontWeight: 'bold', marginBottom: 4 }}>{label}</div>
      {itens.map(c => {
        const sinal = positivo ? '+' : ''
        const antes = c.cobertoAntesPor ? `${c.cobertoAntesPor.pokemon} / ${c.cobertoAntesPor.move}` : 'sem cobertura'
        const depois = c.cobertoDepoisPor ? `${c.cobertoDepoisPor.pokemon} / ${c.cobertoDepoisPor.move}` : 'sem cobertura'
        return (
          <div key={c.inimigo} style={{ paddingLeft: 8, marginBottom: 4, color: cor }}>
            <div><strong>{c.inimigo}</strong>: {c.scoreOriginal.toFixed(0)} → {c.scoreNovo.toFixed(0)} ({sinal}{c.delta.toFixed(0)})</div>
            <div style={{ paddingLeft: 8, fontSize: 10, opacity: 0.85 }}>antes: {antes}</div>
            <div style={{ paddingLeft: 8, fontSize: 10, opacity: 0.85 }}>depois: {depois}</div>
          </div>
        )
      })}
    </div>
  )
}

export function ResultadoCard({ r }: { r: ResultadoSubstituicao }) {
  const [aberto, setAberto] = useState(false)
  const cor = r.delta > 0 ? '#4caf50' : r.delta < 0 ? '#f44336' : '#888'

  return (
    <div style={{ border: `1px solid ${cor}`, borderRadius: 4, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setAberto(v => !v)}
        style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
        <span>Substituir <strong>{r.substitui}</strong></span>
        <span style={{ color: cor }}>{r.delta > 0 ? '+' : ''}{r.delta.toFixed(0)} pts {aberto ? '▲' : '▼'}</span>
      </div>
      {aberto && (
        <div style={{ padding: '8px 10px', fontSize: 11, borderTop: `1px solid ${cor}33` }}>
          <div style={{ marginBottom: 6, opacity: 0.7 }}>Score: {r.scoreBefore.toFixed(0)} → {r.scoreAfter.toFixed(0)}</div>
          {r.movesetCandidato.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Moveset do candidato:</div>
              {r.movesetCandidato.map(m => (
                <div key={m.name} style={{ paddingLeft: 8, opacity: 0.85 }}>{m.name} ({m.type} / {m.category})</div>
              ))}
            </div>
          )}
          <ConfrontoList itens={r.melhora} positivo={true} />
          <ConfrontoList itens={r.piora} positivo={false} />
          {r.melhora.length === 0 && r.piora.length === 0 && (
            <div style={{ opacity: 0.6 }}>Nenhuma diferença nos confrontos.</div>
          )}
        </div>
      )}
    </div>
  )
}

export function ResultadoTMCard({ r }: { r: ResultadoTM }) {
  const [aberto, setAberto] = useState(false)
  const cor = r.delta > 0 ? '#4caf50' : r.delta < 0 ? '#f44336' : '#888'

  return (
    <div style={{ border: `1px solid ${cor}`, borderRadius: 4, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setAberto(v => !v)}
        style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
        <span><strong>{r.pokemon}</strong> troca <strong>{r.moveSubstituido}</strong></span>
        <span style={{ color: cor }}>{r.delta > 0 ? '+' : ''}{r.delta.toFixed(0)} pts {aberto ? '▲' : '▼'}</span>
      </div>
      {aberto && (
        <div style={{ padding: '8px 10px', fontSize: 11, borderTop: `1px solid ${cor}33` }}>
          <div style={{ marginBottom: 6, opacity: 0.7 }}>Score: {r.scoreBefore.toFixed(0)} → {r.scoreAfter.toFixed(0)}</div>
          <ConfrontoList itens={r.melhora} positivo={true} />
          <ConfrontoList itens={r.piora} positivo={false} />
        </div>
      )}
    </div>
  )
}
