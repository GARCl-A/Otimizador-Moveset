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
import { gerarDataset, gerarDatasetMisto, serializarCSV, serializarCSVBatch } from '../engine/nnDataset'
import type { DatasetSample } from '../engine/nnDataset'
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

function montarContexto(pool: PoolConfig, kMax: number = 1) {
  const { candidatos, timeFixo, meta } = prepararPool(pool)
  const pokemons = [...candidatos, ...timeFixo.filter(p => !candidatos.some(c => c.name === p.name))]
  const ctx = buildContext(pokemons, meta, pool.priorities, pool.custos, pool.evalParams, kMax)
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
    const upgrades =
      msg.type === 'BATCH_GENERATE' || msg.type === 'BATCH_RUN'
        ? msg.cases[0].pool.upgrades
        : msg.pool.upgrades
    await Promise.all([loadData(upgrades), loadTypeChart()])

    if (msg.type === 'GENERATE_DATASET') {
      // Exp3: dataset misto (aleatórios + times bons + vizinhos)
      if (msg.mixed) {
        const { ctx, opts } = montarContexto(msg.pool, 1)
        const rng = mulberry32(msg.seed)
        post({ type: 'PROGRESS', done: 0, total: 1, label: 'Gerando dataset misto (Exp3)...' })
        const samples = gerarDatasetMisto(
          ctx,
          {
            pool: opts.pool,
            tamanhoTime: opts.tamanhoTime,
            budget: opts.budget,
            gruposExclusao: opts.gruposExclusao,
            timeFixo: opts.timeFixo,
          },
          msg.mixed,
          rng,
          (label, done, total) => post({ type: 'PROGRESS', done, total, label: `Exp3: ${label}` })
        )
        const csv = serializarCSV(samples)
        post({ type: 'DATASET', csv, nSamples: samples.length })
        return
      }
      const datasetKMax = Math.max(1, msg.datasetKMax ?? 1)
      const { ctx, opts } = montarContexto(msg.pool, datasetKMax)
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
          movesetVariety: datasetKMax,
        },
        msg.nTeams
      )
      const csv = serializarCSV(samples)
      post({ type: 'DATASET', csv, nSamples: samples.length })
      return
    }

    if (msg.type === 'BATCH_GENERATE') {
      const datasetKMax = Math.max(1, msg.datasetKMax ?? 1)
      const perCase: { id: string; samples: DatasetSample[] }[] = []
      const perCaseInfo: { id: string; nSamples: number }[] = []
      for (let i = 0; i < msg.cases.length; i++) {
        const c = msg.cases[i]
        post({ type: 'PROGRESS', done: i, total: msg.cases.length, label: `Dataset ${c.id} (${i + 1}/${msg.cases.length})` })
        const { ctx, opts } = montarContexto(c.pool, datasetKMax)
        const rng = mulberry32(msg.seed + i * 2654435761)
        const samples = gerarDataset(
          ctx,
          {
            pool: opts.pool,
            tamanhoTime: opts.tamanhoTime,
            budget: opts.budget,
            gruposExclusao: opts.gruposExclusao,
            rng,
            movesetVariety: datasetKMax,
          },
          msg.nTeams
        )
        perCase.push({ id: c.id, samples })
        perCaseInfo.push({ id: c.id, nSamples: samples.length })
      }
      post({ type: 'BATCH_DATASET', csv: serializarCSVBatch(perCase), perCase: perCaseInfo })
      return
    }

    if (msg.type === 'BATCH_RUN') {
      const kList = msg.kList && msg.kList.length ? msg.kList : [1]
      const kMax = Math.max(...kList)
      const flatRuns: FlatRun[] = []
      const aggregates: MethodAggregate[] = []

      const kSweep = (m: ExpMethod): (number | undefined)[] => (isDeterministic(m) ? kList : [undefined])
      const execPorK = (m: ExpMethod) => (isDeterministic(m) ? 1 : msg.nRuns)

      let total = 0
      for (const c of msg.cases) {
        const has = !!msg.models[c.id]
        for (const m of msg.methods) {
          if (m === 'greedy-nn' && !has) continue
          total += kSweep(m).length * execPorK(m)
        }
      }
      let done = 0

      for (let ci = 0; ci < msg.cases.length; ci++) {
        const c = msg.cases[ci]
        const { ctx, opts } = montarContexto(c.pool, kMax)
        opts.saIteracoes = msg.saIteracoes
        opts.gaPopulacao = msg.gaPopulacao
        opts.gaGeracoes = msg.gaGeracoes
        opts.gaMutacao = msg.gaMutacao
        const weights = msg.models[c.id]
        const mlp = weights ? new MLP(weights) : undefined

        for (let mi = 0; mi < msg.methods.length; mi++) {
          const method = msg.methods[mi]
          if (method === 'greedy-nn' && !mlp) continue
          for (const k of kSweep(method)) {
            const runsSerie: SingleRun[] = []
            const nExec = execPorK(method)
            for (let run = 0; run < nExec; run++) {
              const rng = mulberry32(msg.seed + run * 7919 + mi * 104729 + (k ?? 0) * 1299709 + ci * 32452843)
              const result = runMethodOnce(method, ctx, opts, rng, mlp, k)
              runsSerie.push(result)
              const flat: FlatRun = { ...result, method, run, caseId: c.id }
              flatRuns.push(flat)
              post({ type: 'RUN', run: flat })
              done++
              const rotuloK = k !== undefined ? ` K=${k}` : ''
              post({ type: 'PROGRESS', done, total, label: `${c.id} ${method}${rotuloK} ${run + 1}/${nExec}` })
            }
            aggregates.push({ ...aggregate(method, runsSerie, k), caseId: c.id })
          }
        }
      }
      post({ type: 'BATCH_DONE', runs: flatRuns, aggregates })
      return
    }

    // RUN_EXPERIMENTS
    const kList = msg.kList && msg.kList.length ? msg.kList : [1]
    const kMax = Math.max(...kList)
    const { ctx, opts } = montarContexto(msg.pool, kMax)
    opts.saIteracoes = msg.saIteracoes
    opts.gaPopulacao = msg.gaPopulacao
    opts.gaGeracoes = msg.gaGeracoes
    opts.gaMutacao = msg.gaMutacao

    const mlp = msg.modelWeights ? new MLP(msg.modelWeights) : undefined

    // Gulosos (determinísticos) rodam 1x por valor de K; SA/GA rodam nRuns (K não se aplica).
    const kSweepDe = (m: ExpMethod): (number | undefined)[] =>
      isDeterministic(m) ? kList : [undefined]
    const execPorK = (m: ExpMethod) => (isDeterministic(m) ? 1 : msg.nRuns)
    const total = msg.methods.reduce((a, m) => a + kSweepDe(m).length * execPorK(m), 0)
    let done = 0

    const flatRuns: FlatRun[] = []
    const aggregates: MethodAggregate[] = []

    for (let mi = 0; mi < msg.methods.length; mi++) {
      const method = msg.methods[mi]
      if (method === 'greedy-nn' && !mlp) continue // sem pesos, pula

      for (const k of kSweepDe(method)) {
        const runsSerie: SingleRun[] = []
        const nExec = execPorK(method)
        for (let run = 0; run < nExec; run++) {
          const rng = mulberry32(msg.seed + run * 7919 + mi * 104729 + (k ?? 0) * 1299709)
          const result = runMethodOnce(method, ctx, opts, rng, mlp, k)
          runsSerie.push(result)
          const flat: FlatRun = { ...result, method, run }
          flatRuns.push(flat)
          post({ type: 'RUN', run: flat })
          done++
          const rotuloK = k !== undefined ? ` K=${k}` : ''
          post({ type: 'PROGRESS', done, total, label: `${method}${rotuloK} ${run + 1}/${nExec}` })
        }
        aggregates.push(aggregate(method, runsSerie, k))
      }
    }

    const scatter = mlp
      ? scatterPredictedVsExact(ctx, opts, mlp, msg.scatterM ?? 200, mulberry32(msg.seed + 1))
      : []

    post({ type: 'DONE', aggregates, runs: flatRuns, scatter })
  } catch (e) {
    post({ type: 'ERROR', message: String(e) })
  }
}
