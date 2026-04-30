type TypeChart = Record<string, Record<string, number>>

let typeChart: TypeChart | null = null

export async function loadTypeChart(): Promise<void> {
  const res = await fetch('/TypeChartFull.json')
  typeChart = await res.json()
}

export function getTypeMultiplier(atkType: string, defType1: string, defType2: string | null): number {
  if (!typeChart) throw new Error('TypeChart not loaded')
  const atk = typeChart[atkType]
  if (!atk) return 1.0
  if (defType2 && defType1 !== defType2) {
    return atk[`${defType1}/${defType2}`] ?? 1.0
  }
  return atk[defType1] ?? 1.0
}
