# Experimento 1 — Função de valor greedy-NN treinada com rollouts aleatórios

**Projeto:** Otimizador de times PokeRogue (PvE) — trabalho final de Redes Neurais
**Data do experimento:** 2026-07-07
**Pasta:** `experiments/exp1-rollouts-aleatorios/`

---

## 1. Objetivo e hipótese

O sistema monta um time de PokéRogue (PvE) maximizando uma **função de score** (0–194) que
mede quão bem o time cobre uma "meta" de inimigos, considerando dano causado, dano sofrido e
HP restante. Quatro métodos são comparados **sob a mesma função de score**:

| Método | O que é |
|---|---|
| **SA** | Simulated Annealing sobre o time completo (busca estocástica) |
| **GA** | Algoritmo Genético (busca estocástica populacional) |
| **greedy-exato** | Construção gulosa: a cada slot adiciona o candidato que **maximiza o score exato** do time parcial |
| **greedy-nn** | Construção gulosa guiada por uma **rede neural** que prevê o score do time **final** a partir de um prefixo |

**Hipótese testada:** uma função de valor aprendida (greedy-nn) consegue guiar a construção
gulosa **melhor que o greedy-exato** — porque o greedy-exato é *míope* (otimiza o score do
time parcial atual, não o do time final), enquanto a rede é treinada para prever o score final.
Em teoria, a rede daria "visão de futuro" a custo O(1) por candidato, sem a busca cara do SA/GA.

**Spoiler do resultado:** a hipótese **não se confirmou neste problema**, e o *porquê* é o
resultado mais valioso do experimento (Seção 6).

---

## 2. Cenários (6 casos de uso)

Cada caso sobrescreve `typeFilter`, `banirLendarios` e `budget` sobre a configuração base
(time de 6, fontes de move `Level`+`Egg`, meta = todos os Pokémon da pokédex). O **budget** é
um limite de "pontos" gastos com o time (Pokémon fortes/lendários custam mais); `b10` é
apertado (força times pequenos), `b60` é folgado (permite 6 membros fortes).

| id | Filtro de tipo | Lendários | Budget | Caráter |
|---|---|---|---|---|
| `allTypes-b10` | — (todos) | permitidos | 10 | pool enorme, orçamento apertado |
| `allTypes-b60` | — (todos) | permitidos | 60 | pool enorme, orçamento folgado |
| `naoLend-b10` | — (todos) | **banidos** | 10 | sem lendários, apertado |
| `naoLend-b60` | — (todos) | **banidos** | 60 | sem lendários, folgado |
| `bug-b10` | **Bug** | permitidos | 10 | espaço pequeno, apertado |
| `bug-b60` | **Bug** | permitidos | 60 | espaço pequeno, folgado |

Score máximo teórico em todos os casos: **194**.

---

## 3. Metodologia da rede (greedy-NN)

### 3.1 Função de valor construtiva
A rede aprende `V(time_parcial, candidato) → score do time COMPLETO` de onde veio aquele prefixo.
O greedy-nn, a cada slot, escolhe o candidato de maior `V`. Como `V` prevê o score **final**
(não o parcial), a rede é o único jeito de dar visão de futuro ao guloso sem busca exponencial.

### 3.2 Codificação das features (fonte única em `nnFeatures.ts`)
Vetor de entrada de **784 dimensões** = 7 slots (6 do time + 1 candidato) × **112 por Pokémon**:

- **Tipo:** multi-hot sobre os 18 tipos canônicos (dual-type acende 2 bits) — 18 dims.
- **6 stats** normalizados: HP, Attack, Defense, SpAtk, SpDef, Speed — 6 dims.
  (Os defensivos entram porque o score depende do dano que o inimigo causa **em mim**.)
- **4 moves × 22:** tipo do move **one-hot[18]** + `[categoria, power/200, acc/100, prio/6]`.
  (Tipo do move é categórico → one-hot, não índice ordinal. Moves de status são podados antes,
  pois causam 0 de dano no modelo.)
- Slots vazios = zeros (padding).

A mesma função gera o dataset (no app, TypeScript) **e** roda a inferência (`mlp.ts`), então não
há divergência Python↔TS: o treino em Python recebe os vetores já prontos e devolve só os pesos.

### 3.3 Dataset (a variável-chave deste experimento)
**Fonte: 100% rollouts aleatórios.** Para cada caso, ~**4.000 times aleatórios válidos** (respeitando
budget e exclusões) são montados e avaliados pela função de score exata. Cada time completo é
**decomposto em prefixos**: para um time de score `S`, emite-se `(primeiros k membros, membro k+1) → S`,
em ordem embaralhada (para a função ser ~invariante à ordem). Isso dá as amostras de treino.

> ⚠️ **Limitação central:** o dataset **não contém times bons** — só aleatórios. A rede nunca viu
> como é um prefixo perto do ótimo, justamente a região onde o guloso precisa de precisão. Isso é
> o alvo do Experimento 2.

Amostras por caso (b60 enche até 6 membros → 4000×6=24000; b10 é limitado pelo budget a ~3,7 membros/time):

| caso | nº amostras |
|---|---|
| allTypes-b10 | 14.771 |
| allTypes-b60 | 24.000 |
| naoLend-b10 | 15.453 |
| naoLend-b60 | 24.000 |
| bug-b10 | 14.956 |
| bug-b60 | 24.000 |

### 3.4 Arquitetura e treino (PyTorch — `neural/train_all.py`)
- **Rede:** MLP `784 → 128 → 64 → 1`, ativação ReLU, saída linear (regressão). ~**108,8 mil** parâmetros.
- **Pré-processo:** `StandardScaler` ajustado no treino (mean/std vão no JSON dos pesos).
- **Split:** 70% treino / 15% validação / 15% teste (seed 42).
- **Otimização:** Adam, `lr=1e-3`, perda **MSE**, batch 256, até 200 épocas, *early stopping*
  (paciência 20 sobre a loss de validação).
- **Um modelo por caso**, todos gerados de um único `dataset_all.csv` → `models_all.json`.

### 3.5 Configuração dos baselines e da execução
- **SA:** T₀=200, cooling=0,9995, 10.000 iterações. **GA:** população 100, 80 gerações, mutação 0,05.
  (padrões da aba Otimizador)
- **Repetições:** métodos estocásticos (SA, GA) rodaram **30 vezes** por caso; os gulosos
  (determinísticos) rodaram **1 vez por valor de K**, com **K ∈ {1, 3, 5, 10}** (nº de movesets
  alternativos que o guloso enumera por candidato).

---

## 4. Resultados — calibração da rede

Métricas no conjunto de teste (15% nunca visto). `RMSE = √MSE` = erro típico **em pontos de score**;
`R²` = fração da variância do score explicada (0 = inútil, 1 = perfeito).

| caso | n | R² | RMSE (≈ erro em pts) |
|---|---|---|---|
| **bug-b10** | 14.956 | **0,497** | 14,2 |
| **bug-b60** | 24.000 | **0,441** | 12,0 |
| allTypes-b10 | 14.771 | 0,329 | 18,4 |
| naoLend-b10 | 15.453 | 0,304 | 17,6 |
| naoLend-b60 | 24.000 | 0,288 | 13,2 |
| allTypes-b60 | 24.000 | 0,264 | 13,7 |

**Leitura:** calibração **fraca a moderada** (explica só ¼–½ da variância; erra ~12–18 pts).
Bug fica bem melhor (espaço pequeno é mais fácil de aprender). Cuidado com o R² dos `b60`:
parece baixo, mas o **RMSE é menor** — é artefato de os scores `b60` ficarem espremidos perto
de 194 (pouca variância pra explicar); nesses casos olhe o RMSE, não o R².

---

## 5. Resultados — desempenho dos 4 métodos

Score: `min / mediana / max` (para SA e GA sobre 30 runs; para gulosos, faixa sobre K=1,3,5,10).
Tempo: médio por execução (ms).

| caso | SA (min/med/max) | GA | greedy-exato | greedy-nn (melhor) | t exato | t nn |
|---|---|---|---|---|---|---|
| allTypes-b10 | 180 / 184 / **187** | 171/179/185 | 179 | 178 | ~6 ms | ~307 ms |
| allTypes-b60 | 194 / **194** / 194 | 191/193/194 | **194** | 193 | ~106 ms | ~1,7 s |
| naoLend-b10 | 180 / 184 / **187** | 170/178/187 | 182 | 178 | ~24 ms | ~234 ms |
| naoLend-b60 | 192 / **193** / 193 | 185/188/191 | 192 | 178 | ~80 ms | ~537 ms |
| bug-b10 | 156 / 167 / **167** | 148/166/167 | **167** | **167** | ~4 ms | ~35 ms |
| bug-b60 | 179 / **179** / 179 | 177/179/179 | **179** | 175 | ~10 ms | ~66 ms |

**Observações principais:**

1. **O greedy-NN acompanha o R².** Onde a rede aprendeu (Bug), ele **empata com o exato**
   (167 no b10; 175 vs 179 no b60). Onde não aprendeu (naoLend-b60), **desaba** (178 vs 192).
   → A qualidade do greedy-NN é limitada pela qualidade da função de valor.

2. **O greedy-exato é míope.** No orçamento apertado (`b10`), o **SA supera o greedy-exato**
   (187 vs 179 no allTypes; 187 vs 182 no naoLend). O guloso torra o budget no melhor pick
   imediato (ex.: Eternatus sozinho → 179) e trava. Esse buraco de 5–8 pontos era exatamente
   o que a rede deveria capturar — e não capturou.

3. **K ajuda o exato, mas pode atrapalhar a rede.** Mais movesets nunca pioram o exato; na rede,
   às vezes **pioram** (naoLend-b10: K=1→178, K=10→169), porque mais candidatos = mais chances
   de a nota ruidosa se enganar.

4. **Tempo: o greedy-NN é mais lento que o exato — estruturalmente.** No K útil (≥3) chega a ser
   mais lento que um run de SA (allTypes-b60: **3,0 s** no K=10 vs **0,5 s** do SA). Não é bug:
   o score exato é uma fórmula barata, e um forward de 108,8k parâmetros por candidato é mais
   pesado que a própria conta que ele tentava evitar.

---

## 6. Discussão — por que a rede não compensa (o resultado do trabalho)

O experimento mostra que, **para este problema**, a função de valor aprendida é **dominada** nos
dois eixos:

- **Custo:** o oráculo exato é barato (fórmula de dano sobre uma meta pequena). Aproximá-lo com
  uma rede nunca será mais rápido que chamá-lo. → greedy-exato ganha em tempo.
- **Qualidade:** o único caminho da rede para agregar valor era **vencer a miopia do guloso**.
  Isso exige um `V` preciso perto do ótimo — que os rollouts aleatórios não ensinam (R² baixo).
  → SA ganha em qualidade; greedy-NN fica **abaixo dos dois**.

Há ainda uma **circularidade**: para treinar a rede a bater o SA, eu precisaria alimentá-la com
times bons vindos do próprio SA — e, treinando/rodando na **mesma instância**, eu teria pago o SA
para produzir uma cópia pior dele.

**Quando uma função de valor aprendida realmente ganha** (e por que este problema não é o caso):
1. Quando **avaliar o objetivo é caro** (ex.: simular batalhas turno a turno). Aqui é uma fórmula.
2. Quando se **amortiza** uma busca cara por instância entre **muitas instâncias novas** (treina
   uma vez, resolve barato pra sempre). Aqui um único run de SA já é barato *e* bom — não há busca
   cara pra amortizar.

### Conclusão honesta
> Uma função de valor aprendida só supera SA/guloso quando (a) avaliar o objetivo é caro, ou (b)
> se amortiza uma busca cara entre muitas instâncias. Este problema **viola as duas condições**: o
> score é uma fórmula barata e um único run de SA já é bom. Logo, **greedy-exato domina em tempo e
> SA domina em qualidade**, com o greedy-NN preso abaixo de ambos. É um **resultado negativo bem
> caracterizado** — mais informativo que uma vitória forçada.

---

## 7. Limitações e próximos passos (Experimento 2)

- **Dataset só com rollouts aleatórios** → R² baixo perto do ótimo. **Correção:** enriquecer o
  treino com prefixos de times **bons** (SA/GA/greedy) + perturbações em torno deles.
- **Treino e teste na mesma instância** → circularidade. **Correção:** treinar em alguns
  budgets/pools e **testar em budgets/pools não vistos** — medir se `V` **generaliza** (transferência).
  Se generalizar, é a evidência de amortização; se não, fecha o argumento negativo.
- O Experimento 2 servirá de **contraste direto** com este: mesma métrica, mesmos casos, só muda a
  fonte dos dados de treino (e o protocolo de generalização).

---

## 8. Reprodutibilidade — inventário desta pasta

| Arquivo | O que é |
|---|---|
| `metrics_all.json` | R², MSE e n por caso (Seção 4) |
| `models_all.json` | pesos das 6 redes (`{caso: pesos}`) carregados no app |
| `training_history_all.json` | curvas de loss treino/validação por época |
| `experimentos_all.csv` / `.json` | uma linha por execução (Seção 5): caso, método, K, run, score, tempo, time |
| `figuras/<caso>_loss.png` | curva de loss (convergência do treino) |
| `figuras/<caso>_pred_vs_exato.png` | dispersão previsto × exato no teste (o R² visual) |

**Pipeline que gerou tudo:**
1. App (aba Experimentos) → **Gerar datasets (todos)** → `dataset_all.csv`.
2. `uv run --project neural python neural/train_all.py dataset_all.csv` → `models_all.json` + métricas + figuras.
3. App → **Carregar models_all.json** → **Rodar tudo (6 casos)** → `experimentos_all.csv/json`.

Código (reutilizável, em `neural/`): `model.py`, `train.py`, `train_all.py`.
