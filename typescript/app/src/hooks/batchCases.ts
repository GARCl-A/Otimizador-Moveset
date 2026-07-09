import type { Config } from './useOtimizador'

// Os 6 casos de uso do experimento em lote. Cada um sobrescreve typeFilter,
// banirLendarios e budget sobre a Config base da aba Otimizador; todo o resto
// (fontes, tamanho do time, exclusões, evalParams) vem da base.
export interface BatchCaseDef {
  id: string
  label: string
  typeFilter: string
  banirLendarios: boolean
  budget: number
}

export const BATCH_CASES: BatchCaseDef[] = [
  { id: 'allTypes-b10', label: 'AllTypes · b10', typeFilter: '', banirLendarios: false, budget: 10 },
  { id: 'allTypes-b60', label: 'AllTypes · b60', typeFilter: '', banirLendarios: false, budget: 60 },
  { id: 'naoLend-b10', label: 'AllTypes+NãoLend · b10', typeFilter: '', banirLendarios: true, budget: 10 },
  { id: 'naoLend-b60', label: 'AllTypes+NãoLend · b60', typeFilter: '', banirLendarios: true, budget: 60 },
  { id: 'bug-b10', label: 'Bug · b10', typeFilter: 'Bug', banirLendarios: false, budget: 10 },
  { id: 'bug-b60', label: 'Bug · b60', typeFilter: 'Bug', banirLendarios: false, budget: 60 },
]

export function configDoCaso(base: Config, caso: BatchCaseDef): Config {
  return { ...base, typeFilter: caso.typeFilter, banirLendarios: caso.banirLendarios, budget: caso.budget }
}
