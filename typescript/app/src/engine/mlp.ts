// Inferência de um MLP treinado em PyTorch (ver neural/train.py).
// O treino acontece em Python; aqui só rodamos o forward pass para o greedy-NN
// e para a dispersão previsto-vs-exato. O schema abaixo é exatamente o que
// neural/train.py serializa em model_weights.json.

export interface MLPLayer {
  // W tem shape [out][in] (igual ao nn.Linear.weight do PyTorch); b tem shape [out].
  W: number[][]
  b: number[]
}

export interface ModelWeights {
  arch: number[] // ex.: [308, 128, 64, 1]
  layers: MLPLayer[] // arch.length - 1 camadas
  inputMean: number[] // média do StandardScaler (sklearn), len = arch[0]
  inputStd: number[] // desvio-padrão do StandardScaler, len = arch[0]
  activation: 'relu'
}

export class MLP {
  readonly weights: ModelWeights

  constructor(weights: ModelWeights) {
    this.weights = weights
  }

  // Replica o forward do PyTorch: padroniza a entrada (mean/std) e aplica
  // (Linear -> ReLU) nas camadas ocultas + Linear na saída (regressão escalar).
  predict(x: Float32Array | number[]): number {
    const { layers, inputMean, inputStd } = this.weights

    let v = new Float64Array(x.length)
    for (let i = 0; i < x.length; i++) {
      const std = inputStd[i] || 1
      v[i] = (x[i] - inputMean[i]) / std
    }

    for (let l = 0; l < layers.length; l++) {
      const { W, b } = layers[l]
      const out = new Float64Array(W.length)
      for (let o = 0; o < W.length; o++) {
        const row = W[o]
        let sum = b[o]
        for (let i = 0; i < row.length; i++) sum += row[i] * v[i]
        out[o] = sum
      }
      const isLast = l === layers.length - 1
      if (!isLast) {
        for (let o = 0; o < out.length; o++) if (out[o] < 0) out[o] = 0
      }
      v = out
    }

    return v[0]
  }
}

export function parseModelWeights(json: unknown): ModelWeights {
  const w = json as Partial<ModelWeights>
  if (!w || !Array.isArray(w.layers) || !Array.isArray(w.arch)) {
    throw new Error('model_weights.json inválido: faltam "layers"/"arch".')
  }
  if (!Array.isArray(w.inputMean) || !Array.isArray(w.inputStd)) {
    throw new Error('model_weights.json inválido: faltam "inputMean"/"inputStd".')
  }
  if (w.layers.length !== w.arch.length - 1) {
    throw new Error(
      `model_weights.json inconsistente: ${w.layers.length} camadas para arch de ${w.arch.length} dims.`
    )
  }
  for (let l = 0; l < w.layers.length; l++) {
    const layer = w.layers[l]
    const inDim = w.arch[l]
    const outDim = w.arch[l + 1]
    if (layer.W.length !== outDim || layer.b.length !== outDim) {
      throw new Error(`Camada ${l}: dimensão de saída esperada ${outDim}.`)
    }
    if (layer.W[0]?.length !== inDim) {
      throw new Error(`Camada ${l}: dimensão de entrada esperada ${inDim}.`)
    }
  }
  if (w.inputMean.length !== w.arch[0] || w.inputStd.length !== w.arch[0]) {
    throw new Error(`inputMean/inputStd devem ter ${w.arch[0]} dims.`)
  }
  return {
    arch: w.arch,
    layers: w.layers,
    inputMean: w.inputMean,
    inputStd: w.inputStd,
    activation: 'relu',
  }
}
