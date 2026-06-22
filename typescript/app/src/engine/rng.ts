// RNG semeável (mulberry32) para reprodutibilidade dos experimentos e da geração
// de dados. Diferente de Math.random, aceita uma seed para que uma execução possa
// ser replicada exatamente — importante para os experimentos do trabalho.

export interface RNG {
  random(): number
  int(n: number): number
  pick<T>(arr: T[]): T
  shuffle<T>(arr: T[]): T[]
}

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0

  function random(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function int(n: number): number {
    return Math.floor(random() * n)
  }

  function pick<T>(arr: T[]): T {
    return arr[int(arr.length)]
  }

  function shuffle<T>(arr: T[]): T[] {
    const out = [...arr]
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1)
      const tmp = out[i]
      out[i] = out[j]
      out[j] = tmp
    }
    return out
  }

  return { random, int, pick, shuffle }
}
