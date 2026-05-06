import { useState, useEffect, useRef } from 'react'
import { getPriorities, getAllNames, buildPokemon } from '../engine/loader'
import { analisarSubstituicao, analisarTM, resolverTimeMembros } from '../engine/teamAnalyzer'
import type { MembroTime, ResultadoSubstituicao, ResultadoTM } from '../engine/teamAnalyzer'
import { gerarRelatorio } from '../engine/reporter'
import {
  MembroEditor, TMEditor, buildMembro, buildTM, exportJson, loadSnapshot, saveSnapshot,
  MEMBRO_VAZIO, TM_VAZIO,
} from './teamAnalyzerUtils'
import type { MembroInput, TMInput, TeamSnapshot } from './teamAnalyzerUtils'
import { ResultadoCard, ResultadoTMCard } from './ResultadoCards'

const btnStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 10px', cursor: 'pointer',
  fontFamily: 'monospace', border: '1px solid #555', borderRadius: 3, background: 'transparent',
}

export default function TeamAnalyzer() {
  const saved = loadSnapshot()
  const [modo, setModo] = useState<'pokemon' | 'tm'>(saved?.modo ?? 'pokemon')
  const [membros, setMembros] = useState<MembroInput[]>(saved?.membros ?? [{ ...MEMBRO_VAZIO }])
  const [candidato, setCandidato] = useState<MembroInput>(saved?.candidato ?? { ...MEMBRO_VAZIO })
  const [tmInput, setTmInput] = useState<TMInput>(saved?.tmInput ?? { ...TM_VAZIO })
  const [resultados, setResultados] = useState<ResultadoSubstituicao[] | null>(null)
  const [resultadosTM, setResultadosTM] = useState<ResultadoTM[] | null>(null)
  const [relatorio, setRelatorio] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    saveSnapshot({ membros, candidato, modo, tmInput })
  }, [membros, candidato, modo, tmInput])

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const snap: TeamSnapshot = JSON.parse(ev.target?.result as string)
        if (snap.membros && snap.candidato) {
          setMembros(snap.membros)
          setCandidato(snap.candidato)
          if (snap.modo) setModo(snap.modo)
          if (snap.tmInput) setTmInput(snap.tmInput)
        }
      } catch {
        setErro('JSON inválido.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const addMembro = () => setMembros(m => [...m, { ...MEMBRO_VAZIO }])
  const removeMembro = (i: number) => setMembros(m => m.filter((_, j) => j !== i))
  const updateMembro = (i: number, m: MembroInput) => setMembros(prev => prev.map((x, j) => j === i ? m : x))

  function analisar() {
    setErro('')
    setResultados(null)
    setResultadosTM(null)
    setRelatorio(null)
    try {
      const priorities = getPriorities()
      const timeBuilt: MembroTime[] = membros.map(buildMembro).filter((x): x is MembroTime => x !== null)
      if (!timeBuilt.length) { setErro('Adicione ao menos um membro válido ao time.'); return }

      const meta = getAllNames().map(nome => {
        const p = buildPokemon(nome, ['Level', 'TM'])
        p.optimizeMoveset()
        return p
      })

      const timeResolvido = resolverTimeMembros(timeBuilt, meta, priorities)
      const rel = gerarRelatorio(
        timeResolvido.map(m => ({ pokemon: m.pokemon, moveset: m.moveset, custo: 0, scoreIndividual: 0 })),
        meta, priorities, 0, meta.length, 0, 0, []
      )
      setRelatorio(rel)

      if (modo === 'tm') {
        const tm = buildTM(tmInput)
        if (!tm) { setErro('Preencha todos os campos do TM.'); return }
        setResultadosTM(analisarTM(timeBuilt, tm, meta, priorities))
        return
      }

      const candidatoBuilt = buildMembro(candidato)
      if (!candidatoBuilt) { setErro('Preencha o candidato com nome e ao menos um move válido.'); return }
      setResultados(analisarSubstituicao(timeBuilt, candidatoBuilt, meta, priorities))
    } catch (e) {
      setErro(String(e))
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: '0 0 320px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Analisar Substituição</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => exportJson({ membros, candidato, modo, tmInput })} style={btnStyle}>Exportar JSON</button>
          <button onClick={() => importRef.current?.click()} style={btnStyle}>Importar JSON</button>
          <input ref={importRef} type="file" accept=".json" onChange={importJson} style={{ display: 'none' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setModo('pokemon')} style={{ ...btnStyle, fontWeight: modo === 'pokemon' ? 'bold' : 'normal', borderColor: modo === 'pokemon' ? '#aaa' : '#555' }}>Pokémon</button>
        <button onClick={() => setModo('tm')} style={{ ...btnStyle, fontWeight: modo === 'tm' ? 'bold' : 'normal', borderColor: modo === 'tm' ? '#aaa' : '#555' }}>TM / Move</button>
      </div>

      <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Meu Time Atual</div>
      {membros.map((m, i) => (
        <MembroEditor key={i} membro={m} label={`Membro ${i + 1}`}
          onChange={m => updateMembro(i, m)}
          onRemove={membros.length > 1 ? () => removeMembro(i) : undefined}
        />
      ))}
      <button onClick={addMembro} style={{ fontSize: 12, marginBottom: 16 }}>+ Membro</button>

      {modo === 'pokemon' && (
        <>
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Pokémon Candidato</div>
          <MembroEditor membro={candidato} label="Candidato" onChange={setCandidato} />
        </>
      )}

      {modo === 'tm' && (
        <>
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>TM / Move</div>
          <TMEditor tmInput={tmInput} onChange={setTmInput} />
        </>
      )}

      <button onClick={analisar} style={{ padding: '8px 20px', fontSize: 13 }}>Analisar</button>
      {erro && <div style={{ color: '#f44336', marginTop: 8 }}>{erro}</div>}
      </div>

      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {relatorio && (
          <pre style={{ background: '#1a1a1a', color: '#eee', padding: 12, margin: '0 0 16px 0', overflow: 'auto', fontSize: 11, width: '100%', boxSizing: 'border-box', whiteSpace: 'pre', minWidth: 0 }}>{relatorio}</pre>
        )}

        {resultados && modo === 'pokemon' && (
          <div>
            <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>{candidato.nome} entra no lugar de:</div>
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
            {[...resultados].sort((a, b) => b.delta - a.delta).map(r => <ResultadoCard key={r.substitui} r={r} />)}
          </div>
        )}

        {resultadosTM && modo === 'tm' && (
          <div>
            <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 8 }}>Impacto de {tmInput.nome} no time:</div>
            {resultadosTM.length === 0
              ? <div style={{ opacity: 0.6 }}>Nenhuma troca de move altera o score.</div>
              : resultadosTM.map((r, i) => <ResultadoTMCard key={i} r={r} />)
            }
          </div>
        )}
      </div>
    </div>
  )
}
