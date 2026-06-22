// Constantes e utilitários dos gráficos (separados de charts.tsx para satisfazer
// a regra react-refresh/only-export-components — charts.tsx só exporta componentes).

export const PALETTE: Record<string, string> = {
  sa: '#f59e0b',
  ga: '#10b981',
  'greedy-exato': '#3b82f6',
  'greedy-nn': '#ef4444',
}

export function baixarSvg(id: string, filename: string): void {
  const el = document.getElementById(id)
  if (!el) return
  const xml = new XMLSerializer().serializeToString(el)
  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], { type: 'image/svg+xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
