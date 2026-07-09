# Experimento 2 — Dobrar os rollouts (ablação de quantidade)

**Data:** 2026-07-08
**Pasta:** `experiments/exp2-rollouts-8000/`
**Relação com o Exp1:** este é um relatório **delta**. Cenários, codificação de features,
arquitetura da rede e hiperparâmetros são **idênticos** ao Experimento 1 — ver
[`../exp1-rollouts-aleatorios/RELATORIO.md`](../exp1-rollouts-aleatorios/RELATORIO.md), Seções 2 e 3.
Aqui documento só o que mudou e o que isso produziu.

---

## 1. O que mudou (e o que NÃO mudou)

**Única mudança:** o número de rollouts aleatórios por caso passou de **4.000 → 8.000** (`n`
de treino ~dobrou: 24k→48k nos `b60`). **Continua 100% rollout aleatório** — nenhum time bom
foi injetado. Ou seja, isto é uma **ablação de quantidade**: mesma *distribuição* de dados
(times medíocres), só que o dobro.

Tudo o mais é igual ao Exp1: 6 casos, encoding de 784 dims, MLP `784→128→64→1`, Adam/MSE/early
stopping, split 70/15/15, seed 42.

**Nota de execução:** o GA **não** foi re-rodado neste experimento (foi dominado no Exp1 em tempo
e qualidade). Restaram SA, greedy-exato e greedy-nn. Como checagem de validade, **SA e greedy-exato
reproduzem o Exp1 exatamente** (não dependem do modelo) — ex.: SA `allTypes-b10` = 180/184/187 nos
dois, `naoLend-b60` = 192/193/193 nos dois. Só o **modelo** (e portanto o greedy-nn) mudou.

---

## 2. Calibração — dobrar os dados ajudou um pouco

| caso | R² Exp1 → Exp2 | Δ R² | RMSE Exp1 → Exp2 |
|---|---|---|---|
| allTypes-b10 | 0,329 → **0,366** | +0,037 | 18,4 → 17,2 |
| allTypes-b60 | 0,264 → **0,294** | +0,030 | 13,7 → 13,4 |
| naoLend-b10 | 0,304 → **0,358** | +0,054 | 17,6 → 17,0 |
| naoLend-b60 | 0,288 → **0,305** | +0,018 | 13,2 → 12,7 |
| bug-b10 | 0,497 → **0,535** | +0,038 | 14,2 → 13,8 |
| bug-b60 | 0,441 → **0,433** | −0,008 | 12,0 → 11,9 |

**Leitura:** o dobro de dados deu um ganho **modesto e quase consistente** de R² (+0,02 a +0,05 em
5 dos 6 casos; `bug-b60` oscilou pra baixo dentro do ruído). Faz sentido — mais amostras reduzem o
overfit e melhoram o ajuste **médio**. Mas repare que a rede continua **fraca** (R² 0,29–0,54): o
teto da distribuição aleatória não foi rompido, só um pouco melhor aproveitado.

---

## 3. Desempenho — e o greedy-nn NÃO acompanhou

Melhor score do greedy-nn (sobre K=1,3,5,10), Exp1 vs Exp2:

| caso | greedy-nn Exp1 → Exp2 | Δ | greedy-exato | SA (max) |
|---|---|---|---|---|
| allTypes-b10 | 178 → 176 | **−2** | 179 | 187 |
| allTypes-b60 | 193 → 193 | 0 | 194 | 194 |
| naoLend-b10 | 178 → 179 | +1 | 182 | 187 |
| naoLend-b60 | 178 → **189** | **+11** | 192 | 193 |
| bug-b10 | 167 → **156** | **−11** | 167 | 167 |
| bug-b60 | 175 → 175 | 0 | 179 | 179 |

(Tempos do greedy-nn: ~30 ms a ~1,1 s, subindo com K; continuam maiores que os do greedy-exato.
K=1 tende a ser o melhor — mais movesets K>1 costumam **piorar** a rede ruidosa, como no Exp1.)

**Leitura:** o resultado é **errático**. Em um caso o greedy-nn saltou +11 (`naoLend-b60`: 178→189,
quase colando no exato 192); em outro **regrediu −11** (`bug-b10`: 167→156); o resto ficou ±0–2.
Não há direção consistente.

---

## 4. Achado central deste experimento

> **Quantidade de dados aleatórios não é a alavanca.** O R² subiu em quase todos os casos, mas a
> qualidade do greedy-nn **não acompanhou** — e chegou a **piorar onde o R² melhorou**.

O contra-exemplo mais claro é `bug-b10`: R² subiu (0,497 → **0,535**), e mesmo assim o greedy-nn
**caiu** de 167 para 156. Isso **desacopla** duas coisas que é tentador confundir:

- **R² num teste aleatório** = quão bem a rede prevê o score de estados *médios/aleatórios*.
- **Qualidade como guia guloso** = quão bem a rede **ranqueia candidatos nos pontos de decisão
  perto do ótimo** — que é onde o greedy realmente opera.

Mais rollouts aleatórios afinam o ajuste à distribuição de **times medíocres** (que é o que os
rollouts são), mas o greedy caminha no **topo** dessa distribuição, onde a rede continua cega — ou
até fica mais confiantemente errada. É exatamente a previsão que fizemos no Exp1: **o gargalo é a
distribuição dos dados, não o volume.** Este experimento fecha essa hipótese com evidência
controlada (só a quantidade mudou).

---

## 5. Veredito (inalterado)

Greedy-exato e SA **continuam dominando**. O melhor caso do greedy-nn (`naoLend-b60`, 189) ainda
perde para o exato (192) e o SA (193), gastando ~7× o tempo do exato. A conclusão do Exp1
permanece: com um oráculo de score barato e um único run de SA já bom, a função de valor aprendida
é dominada nos dois eixos.

---

## 6. Próximo passo — Experimento 3 (a alavanca de verdade)

Agora que quantidade está descartada como causa, o Exp3 ataca a **distribuição**:

1. **Enriquecer o treino com times BONS** — prefixos de soluções de SA/GA/greedy + perturbações
   *near-optimal* em torno delas, em vez de (ou além de) rollouts aleatórios. Objetivo: dar à rede
   precisão **no topo**, onde o greedy decide.
2. **Testar generalização** — treinar em alguns budgets/pools e avaliar em budgets/pools **não
   vistos**, para medir se `V` transfere (evidência de amortização) ou apenas decora.

Se o greedy-nn finalmente capturar os pontos que o exato deixa na mesa (ex.: os 187 do `b10` que o
guloso míope não alcança), teremos a única condição em que ele agrega valor. Se não, o resultado
negativo dos Exp1+Exp2 fica ainda mais sólido.

---

## 7. Inventário desta pasta

Mesmo formato do Exp1 (ver seu inventário para descrição dos arquivos), **acrescido do dataset**:

| Arquivo | O que é |
|---|---|
| `dataset_all.csv` | **dados de treino deste experimento** (8.000 rollouts/caso; ~407 MB) |
| `metrics_all.json` | R²/MSE/n por caso (Seção 2) |
| `models_all.json` | pesos das 6 redes deste experimento |
| `training_history_all.json` | curvas de loss por época |
| `experimentos_all.csv` / `.json` | execuções (SA, greedy-exato, greedy-nn × K) |
| `figuras/*` | loss e previsto-vs-exato por caso |
