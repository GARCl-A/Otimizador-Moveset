import { useState } from 'react'
import { buildPokemon, getPriorities, getAllNames } from '../engine/loader'
import { analisarSubstituicao } from '../engine/teamAnalyzer'
import type { MembroTime, ResultadoSubstituicao, ConfrontoDetalhe } from '../engine/teamAnalyzer'

interface MembroInput {
  nome: string
  otimizar: boolean
  moves: [string, string, string, string]
}

const MEMBRO_VAZIO: MembroInput = { nome: '', otimizar: false, moves: ['', '', '', ''] }
const FONTES_DISPONIVEIS = ['Level', 'TM', 'Egg']

function buildMembro(m: MembroInput, fontes: string[]): MembroTime | null {
  if (!m.nome.trim()) return null
  try {
    const pokemon = buildPokemon(m.nome.trim(), fontes)
    pokemon.optimizeMoveset()

    if (m.otimizar) {
      // moveset completo disponível — SA vai escolher os melhores no contexto do time
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

function MembroEditor({
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

  return (
    <div style={{ border: '1px solid #444', borderRadius: 4, padding: 8, marginBottom: 8, position: 'relative' }}>
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

function ResultadoCard({ r }: { r: ResultadoSubstituicao }) {
  const [aberto, setAberto] = useState(false)
  const cor = r.delta > 0 ? '#4caf50' : r.delta < 0 ? '#f44336' : '#888'

  const renderConfronto = (c: ConfrontoDetalhe, positivo: boolean) => {
    const cor = positivo ? '#4caf50' : '#f44336'
    const sinal = positivo ? '+' : ''
    const antes = c.cobertoAntesPor ? `${c.cobertoAntesPor.pokemon} / ${c.cobertoAntesPor.move}` : 'sem cobertura'
    const depois = c.cobertoDepoisPor ? `${c.cobertoDepoisPor.pokemon} / ${c.cobertoDepoisPor.move}` : 'sem cobertura'
    return (
      <div key={c.inimigo} style={{ paddingLeft: 8, marginBottom: 4, color: cor }}>
        <div><strong>{c.inimigo}</strong>: {c.scoreOriginal.toFixed(1)} → {c.scoreNovo.toFixed(1)} ({sinal}{c.delta.toFixed(1)})</div>
        <div style={{ paddingLeft: 8, fontSize: 10, opacity: 0.85 }}>antes: {antes}</div>
        <div style={{ paddingLeft: 8, fontSize: 10, opacity: 0.85 }}>depois: {depois}</div>
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${cor}`, borderRadius: 4, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setAberto(v => !v)}
        style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
        <span>Substituir <strong>{r.substitui}</strong></span>
        <span style={{ color: cor }}>{r.delta > 0 ? '+' : ''}{r.delta.toFixed(2)} pts {aberto ? '▲' : '▼'}</span>
      </div>
      {aberto && (
        <div style={{ padding: '8px 10px', fontSize: 11, borderTop: `1px solid ${cor}33` }}>
          <div style={{ marginBottom: 6, opacity: 0.7 }}>
            Score total: {r.scoreBefore.toFixed(2)} → {r.scoreAfter.toFixed(2)}
          </div>
          {r.movesetCandidato.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Moveset do candidato:</div>
              {r.movesetCandidato.map(m => (
                <div key={m.name} style={{ paddingLeft: 8, opacity: 0.85 }}>{m.name} ({m.type} / {m.category})</div>
              ))}
            </div>
          )}
          {r.melhora.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ color: '#4caf50', fontWeight: 'bold', marginBottom: 4 }}>✓ Melhora ({r.melhora.length})</div>
              {r.melhora.map(c => renderConfronto(c, true))}
            </div>
          )}
          {r.piora.length > 0 && (
            <div>
              <div style={{ color: '#f44336', fontWeight: 'bold', marginBottom: 4 }}>✗ Piora ({r.piora.length})</div>
              {r.piora.map(c => renderConfronto(c, false))}
            </div>
          )}
          {r.melhora.length === 0 && r.piora.length === 0 && (
            <div style={{ opacity: 0.6 }}>Nenhuma diferença nos confrontos.</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TeamAnalyzer() {
  const [fontes, setFontes] = useState<string[]>(['Level', 'TM'])
  const [membros, setMembros] = useState<MembroInput[]>([{ ...MEMBRO_VAZIO }])
  const [candidato, setCandidato] = useState<MembroInput>({ ...MEMBRO_VAZIO })
  const [resultados, setResultados] = useState<ResultadoSubstituicao[] | null>(null)
  const [erro, setErro] = useState('')

  const toggleFonte = (f: string) =>
    setFontes(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])

  const addMembro = () => setMembros(m => [...m, { ...MEMBRO_VAZIO }])
  const removeMembro = (i: number) => setMembros(m => m.filter((_, j) => j !== i))
  const updateMembro = (i: number, m: MembroInput) => setMembros(prev => prev.map((x, j) => j === i ? m : x))

  function analisar() {
    setErro('')
    setResultados(null)
    try {
      const todosNomes = getAllNames()
      const priorities = getPriorities()

      const timeBuilt: MembroTime[] = membros
        .map(m => buildMembro(m, fontes))
        .filter((x): x is MembroTime => x !== null)

      if (!timeBuilt.length) { setErro('Adicione ao menos um membro válido ao time.'); return }

      const candidatoBuilt = buildMembro(candidato, fontes)
      if (!candidatoBuilt) { setErro('Preencha o candidato com nome e ao menos um move válido.'); return }

      const meta = todosNomes.map(nome => {
        const p = buildPokemon(nome, ['Level', 'TM'])
        p.optimizeMoveset()
        return p
      })

      const res = analisarSubstituicao(timeBuilt, candidatoBuilt, meta, priorities)
      setResultados(res)
    } catch (e) {
      setErro(String(e))
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      <h3 style={{ marginTop: 0 }}>Analisar Substituição</h3>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, marginRight: 8 }}>Fontes:</span>
        {FONTES_DISPONIVEIS.map(f => (
          <label key={f} style={{ marginRight: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={fontes.includes(f)} onChange={() => toggleFonte(f)} style={{ marginRight: 4 }} />
            {f}
          </label>
        ))}
      </div>

      <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Meu Time Atual</div>
      {membros.map((m, i) => (
        <MembroEditor
          key={i}
          membro={m}
          label={`Membro ${i + 1}`}
          onChange={m => updateMembro(i, m)}
          onRemove={membros.length > 1 ? () => removeMembro(i) : undefined}
        />
      ))}
      <button onClick={addMembro} style={{ fontSize: 12, marginBottom: 16 }}>+ Membro</button>

      <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Pokémon Candidato</div>
      <MembroEditor
        membro={candidato}
        label="Candidato"
        onChange={setCandidato}
      />

      <button onClick={analisar} style={{ padding: '8px 20px', fontSize: 13 }}>Analisar</button>

      {erro && <div style={{ color: '#f44336', marginTop: 8 }}>{erro}</div>}

      {resultados && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>
            {candidato.nome} entra no lugar de:
          </div>

          {resultados[0]?.movesetTimeBase.some(m => m.moveset.length > 0) && (
            <div style={{ marginBottom: 12, padding: '6px 10px', border: '1px solid #555', borderRadius: 4, fontSize: 11 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Movesets do time atual (resolvidos):</div>
              {resultados[0].movesetTimeBase.map(({ nome, moveset }) => (
                <div key={nome} style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 'bold' }}>{nome}:</span>{' '}
                  {moveset.map(m => m.name).join(', ')}
                </div>
              ))}
            </div>
          )}

          {[...resultados]
            .sort((a, b) => b.delta - a.delta)
            .map(r => <ResultadoCard key={r.substitui} r={r} />)}
        </div>
      )}
    </div>
  )
}
