import { loadData, buildPokemon } from '../engine/loader'
import { loadTypeChart } from '../engine/moveDict'
import { Pokemon } from '../engine/pokemon'
import { buildContext } from '../engine/greedyConstruct'
import {
  runMethodOnce,
  aggregate,
  isDeterministic,
  scatterPredictedVsExact,
} from '../engine/experiments'
import type { ExperimentOptions, ExpMethod, SingleRun, MethodAggregate } from '../engine/experiments'
import { gerarDataset, serializarCSV } from '../engine/nnDataset'
import { MLP } from '../engine/mlp'
import { mulberry32 } from '../engine/rng'
import type {
  PoolConfig,
  ExperimentWorkerInput,
  ExperimentWorkerOutput,
  FlatRun,
} from './experimentTypes'

function post(msg: ExperimentWorkerOutput) {
  self.postMessage(msg)
}

// Constrói candidatos, time fixo e meta a partir dos nomes — espelha o setup do
// optimizer.worker.ts (mesma forma de carregar dados e otimizar movesets).
function prepararPool(pool: PoolConfig): {
  candidatos: Pokemon[]
  timeFixo: Pokemon[]
  meta: Pokemon[]
} {
  const { fontes, todosNomes, candidatosNomes, timeFixoNomes, priorities, banirRecoil, banirLock } = pool

  const candidatos = candidatosNomes.map(nome => buildPokemon(nome, fontes))
  for (const p of candidatos) p.optimizeMoveset(banirRecoil, banirLock, priorities)

  const timeFixo = timeFixoNomes.map(nome => buildPokemon(nome, fontes))
  for (const p of timeFixo) p.optimizeMoveset(banirRecoil, banirLock, priorities)

  const meta = todosNomes.map(nome => buildPokemon(nome, ['Level', 'TM']))
  for (const p of meta) p.optimizeMoveset(banirRecoil, banirLock, priorities)

  return { candidatos, timeFixo, meta }
}

function montarContexto(pool: PoolConfig) {
  const { candidatos, timeFixo, meta } = prepararPool(pool)
  const pokemons = [...candidatos, ...timeFixo.filter(p => !candidatos.some(c => c.name === p.name))]
  const ctx = buildContext(pokemons, meta, pool.priorities, pool.custos, pool.evalParams)
  const opts: ExperimentOptions = {
    pool: candidatos,
    tamanhoTime: pool.tamanhoTime,
    budget: pool.budget,
    gruposExclusao: pool.gruposExclusao,
    timeFixo,
    evalParams: pool.evalParams,
  }
  return { ctx, opts }
}

self.onmessage = async (event: MessageEvent<ExperimentWorkerInput>) => {
  const msg = event.data
  try {
    await Promise.all([loadData(msg.pool.upgrades), loadTypeChart()])

    if (msg.type === 'GENERATE_DATASET') {
      const { ctx, opts } = montarContexto(msg.pool)
      const rng = mulberry32(msg.seed)
      post({ type: 'PROGRESS', done: 0, total: 1, label: 'Gerando dataset...' })
      const samples = gerarDataset(
        ctx,
        {
          pool: opts.pool,
          tamanhoTime: opts.tamanhoTime,
          budget: opts.budget,
          gruposExclusao: opts.gruposExclusao,
          rng,
        },
        msg.nTeams
      )
      const csv = serializarCSV(samples)
      post({ type: 'DATASET', csv, nSamples: samples.length })
      return
    }

    // RUN_EXPERIMENTS
    const { ctx, opts } = montarContexto(msg.pool)
    opts.saIteracoes = msg.saIteracoes
    opts.gaPopulacao = msg.gaPopulacao
    opts.gaGeracoes = msg.gaGeracoes
    opts.gaMutacao = msg.gaMutacao

    const mlp = msg.modelWeights ? new MLP(msg.modelWeights) : undefined

    const totalPorMetodo = (m: ExpMethod) => (isDeterministic(m) ? 1 : msg.nRuns)
    const total = msg.methods.reduce((a, m) => a + totalPorMetodo(m), 0)
    let done = 0

    const flatRuns: FlatRun[] = []
    const aggregates: MethodAggregate[] = []

    for (let mi = 0; mi < msg.methods.length; mi++) {
      const method = msg.methods[mi]
      if (method === 'greedy-nn' && !mlp) continue // sem pesos, pula

      const runsMetodo: SingleRun[] = []
      const nExec = totalPorMetodo(method)
      for (let run = 0; run < nExec; run++) {
        const rng = mulberry32(msg.seed + run * 7919 + mi * 104729)
        const result = runMethodOnce(method, ctx, opts, rng, mlp)
        runsMetodo.push(result)
        const flat: FlatRun = { ...result, method, run }
        flatRuns.push(flat)
        post({ type: 'RUN', run: flat })
        done++
        post({ type: 'PROGRESS', done, total, label: `${method} ${run + 1}/${nExec}` })
      }
      aggregates.push(aggregate(method, runsMetodo))
    }

    const scatter = mlp
      ? scatterPredictedVsExact(ctx, opts, mlp, msg.scatterM ?? 200, mulberry32(msg.seed + 1))
      : []

    post({ type: 'DONE', aggregates, runs: flatRuns, scatter })
  } catch (e) {
    post({ type: 'ERROR', message: String(e) })
  }
}
