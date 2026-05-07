import { loadData, buildPokemon } from '../engine/loader'
import { loadTypeChart } from '../engine/moveDict'
import { rodarOtimizador } from '../engine/runner'
import type { WorkerInput, WorkerOutput, SerializedRunnerResult } from './workerTypes'

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  if (event.data.type !== 'START') return

  const { candidatosNomes, todosNomes, timeFixoNomes, custos, priorities, fontes, upgrades, config } = event.data

  await Promise.all([loadData(upgrades), loadTypeChart()])

  const candidatos = candidatosNomes.map(nome => buildPokemon(nome, fontes))
  const metaInimigos = todosNomes.map(nome => buildPokemon(nome, ['Level', 'TM']))
  for (const p of metaInimigos) p.optimizeMoveset(config.banirRecoil, config.banirLock)
  const timeFixo = timeFixoNomes.map(nome => buildPokemon(nome, fontes))

  let etapaAtual = 0
  const totalEtapas = 1 + candidatos.length + candidatos.length * config.tamanhoTime

  try {
    const result = await rodarOtimizador(
      candidatos,
      metaInimigos,
      custos,
      priorities,
      { ...config, timeFixo },
      {
        onLog: (msg) => {
          etapaAtual++
          const progresso = Math.min(99, Math.round((etapaAtual / totalEtapas) * 100))
          const out: WorkerOutput = { type: 'PROGRESS', progresso, status: msg.trim() }
          self.postMessage(out)
        },
      }
    )

    const serialized: SerializedRunnerResult = {
      time: result.time.map(m => ({
        pokemonName: m.pokemon.name,
        movesetNames: m.moveset.map(mv => mv.name),
        custo: m.custo,
        scoreIndividual: m.scoreIndividual,
      })),
      score: result.score,
      scoreMaximo: result.scoreMaximo,
      custoTotal: result.custoTotal,
    }

    const out: WorkerOutput = { type: 'SUCCESS', result: serialized }
    self.postMessage(out)
  } catch (e) {
    const out: WorkerOutput = { type: 'ERROR', message: String(e) }
    self.postMessage(out)
  }
}
