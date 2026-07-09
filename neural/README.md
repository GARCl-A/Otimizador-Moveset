# neural/ — Rede neural (greedy-NN) em PyTorch

A rede neural do trabalho é implementada e **treinada aqui, em Python/PyTorch**
(requisito do professor). O app TypeScript (`typescript/app`) gera os dados de
treino e roda a **inferência** do greedy-NN + a comparação dos métodos. A
codificação de features mora só no app, então não há divergência entre os lados:
o app exporta vetores já prontos e só os pesos voltam para cá.

## Arquitetura

`ValueMLP` (em `model.py`): MLP que recebe o vetor de features
(time parcial + candidato, 784 dims — ver
`typescript/app/src/engine/nnFeatures.ts`) e prevê, por regressão, o **score de
cobertura do time completo** resultante. Camadas ocultas ReLU (padrão `128,64`),
saída escalar. É a função de valor construtiva do greedy-NN. O `in_dim` é lido
automaticamente do CSV, então a rede se adapta se a codificação mudar.

## Top-K de moveset: 1 dataset, 1 modelo, K só ao rodar

A função de valor é **independente de K** (ela pontua qualquer `(parcial, candidato)`).
K é apenas quantos movesets por espécie o guloso enumera **na hora de montar o time**.
Por isso **não** há dataset/modelo por K: você gera **um** dataset (com variedade de
moveset — o app amostra entre os top-`K máx`) e treina **um** modelo; o sweep de
K = [1,3,5,10] acontece só ao *rodar os experimentos*. Um clique gera o dataset,
um treino, um clique roda todos os K.

## Pipeline

1. **Gerar dataset** — no app, aba **Experimentos**, botão *Gerar dataset (CSV)*.
   Baixa `dataset.csv` (colunas `f0..fN,target`). As amostras são
   `(time parcial, candidato) -> score exato do time completo`, vindas de rollouts
   aleatórios avaliados pela função de score exata.
2. **Treinar** (com **uv** — recomendado; resolve um Python compatível com torch,
   já que o 3.14 ainda não tem wheels):
   ```bash
   uv run --project neural python neural/train.py dataset.csv   # --hidden 256,128,64 --epochs 300
   ```
   Alternativa com pip/venv:
   ```bash
   pip install -r neural/requirements.txt
   python neural/train.py dataset.csv
   ```
   Gera, na pasta `neural/`:
   - `model_weights.json` — pesos no schema lido por `mlp.ts`
     (`arch`, `layers[].W/b`, `inputMean`, `inputStd`, `activation`);
   - `training_history.json` — loss de treino/val por época;
   - `loss_curve.png`, `pred_vs_exato.png` — figuras para o artigo.
3. **Usar no app** — aba **Experimentos** → *Carregar model_weights.json*. Depois:
   - rode os experimentos com o método **Greedy-NN** ativo; ou
   - no **Otimizador**, escolha o algoritmo **Greedy-NN (rede)**.
   Opcional: *Carregar training_history.json* para ver a curva de loss no app.

## Por que o forward bate Python ↔ TS

O `train.py` padroniza a entrada com `StandardScaler` (sklearn) e exporta
`inputMean = scaler.mean_`, `inputStd = scaler.scale_`. O `mlp.ts` aplica
`(x - inputMean) / inputStd` e a mesma sequência `Linear → ReLU … → Linear`,
com `W` no layout `[out][in]` idêntico ao `nn.Linear.weight` do PyTorch.

## Bibliotecas

PyTorch (rede e treino), NumPy, pandas (dados), scikit-learn (split + scaler),
matplotlib (figuras) — exatamente a stack da proposta.
