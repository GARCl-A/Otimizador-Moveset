# Experimento 3 — Dataset misto (times bons + vizinhos): consertando a distribuição

**Data:** 2026-07-08
**Pasta:** `experiments/exp3/` (variante treinada: `b60-lend/`)
**Relação com Exp1/Exp2:** relatório **delta**. Cenários, codificação de features (784 dims),
arquitetura (MLP 784→128→64→1) e hiperparâmetros de treino são os mesmos —
ver [`../exp1-rollouts-aleatorios/RELATORIO.md`](../exp1-rollouts-aleatorios/RELATORIO.md) §2 e §3.
Aqui muda **a fonte dos dados de treino** e mede-se o efeito.

---

## 1. Motivação — o gargalo era a distribuição, não o volume

Os experimentos anteriores mostraram que o problema **não** era quantidade (Exp2: dobrar os
rollouts quase não moveu o greedy-nn, e o `bug-b10` até piorou) nem arquitetura, e sim a
**distribuição** dos dados:

- **Só rollouts aleatórios** (Exp1/2) → a rede fica precisa no **fundo** (times medíocres) e **cega
  no topo**, justamente onde o greedy decide. Resultado: subajuste no topo, colapso fora da
  distribuição (o `Water` da validação, gap 14).
- **Só times bons** → o oposto: cega no **fundo**, não sabe **rejeitar** candidato ruim.

O Exp3 ataca isso com um dataset **misto**, cobrindo os dois extremos + o **contraste** no ponto de
decisão (vizinhos de times bons = "prefixo bom + candidato alternativo").

---

## 2. O que mudou — o gerador de dataset misto

Implementado em `nnDataset.ts` (`gerarDatasetMisto`). Três fontes, **um único budget = 60**:

| fonte | quota | papel |
|---|---|---|
| rollouts **aleatórios** | 5.000 | fundo da distribuição / contraste geral |
| times bons **monotype** | 100 por tipo × 18 = 1.800 | topo, com cobertura por tipo |
| times bons **completos** | 500 | topo no pool geral |

**Como os "times bons" são coletados** (por fonte/tipo): SA rodado em **lotes de 10 até saturar**
(parar de achar time distinto) formando um **conjunto elite**; depois a cota é preenchida com
**vizinhos** (troca de 1 membro), **cada um re-avaliado com o próprio score exato** e
**deduplicado por identidade exata** (vizinhos que diferem por 1 membro NÃO são duplicatas — são o
dado que interessa). Todo time (aleatório, elite ou vizinho) é decomposto em amostras
`(prefixo, candidato) → score final`.

**Configuração da variante treinada (`b60-lend/`):** pool = allTypes (sem filtro de tipo),
**budget 60**, **lendários incluídos**, budget único. Total: **27.467 amostras**.
(O monotype é feito internamente filtrando o pool por cada um dos 18 tipos canônicos.)

---

## 3. Calibração — a melhor até agora

`pred_vs_exato.png`: **R² = 0,539** no teste (held-out). O scatter agora cobre a faixa **inteira**
(score ~50 → 194), porque o dataset tem tanto time ruim (nuvem baixa, dos aleatórios) quanto time
bom (topo, dos SA + vizinhos) — a cobertura que faltava nos Exp1/2.

> ⚠️ **Não compare esse R² diretamente com os Exp1/2.** Lá o alvo era comprimido (ex.: naoLend-b60
> ficava em 185–194), o que **deprime** o R²; aqui a faixa é enorme (50–194), o que **infla** o R².
> O que vale olhar é a densidade **no topo** (150–194) do scatter e, principalmente, o desempenho do
> greedy (Seção 4).

---

## 4. Resultados — 5 cenários de teste

Score do greedy-nn é o **melhor sobre K=1,3,5,10**. Métrica robusta = **gap para o greedy-exato**
(imune ao deslocamento global de score entre runs; ver caveat).

| teste | o que é | greedy-nn | greedy-exato | SA | **gap** |
|---|---|---|---|---|---|
| **allTypes-b60 +lendários** | **in-distribution** (casa) | 192 *(K3)* | 194 | 194 | **2** |
| naoLend-b60 | generaliz. fraca (remove lendários) | 189 *(K3)* | 194 | 194 | 5 |
| **bug-b10 nlend** | **generaliz. real** (monotype + b10) | 176 *(K1)* | 176 | 176 | **0** |
| **water-b10 nlend** | **generaliz. real** (monotype + b10) | 172 *(K10)* | 176 | 178 | 4 |
| **fire-b10 nlend** | **generaliz. real** (monotype + b10) | 155 *(K3)* | 160 | 164 | 5 |

*(Tempos greedy-nn ~19 ms–1,3 s, subindo com K; greedy-exato ~2–307 ms. A rede continua mais lenta
que o exato.)*

---

## 5. Leitura

### O que melhorou (o ganho do Exp3)
1. **Calibração no topo (in-distribution): gap 2** (192 vs 194). Era 14+ nos Exp1/2. A mistura
   deixou a função de valor genuinamente boa no cenário de casa.
2. **A falha do `Water` sumiu:** com o modelo do Exp2 (`allTypes-b10`, só aleatório) o gap era
   **14**; agora é **4**. Os times bons monotype de Água no dataset ensinaram a rede a valorizar
   Starmie/Golisopod/Dondozo em vez de fazer aquela alocação ruim de budget.
3. **Generalização monotype uniforme** (bug 0, water 4, fire 5): **sem colapso em nenhum** tipo —
   ao contrário do Exp2.

### Caveats honestos (importantes)
- **A rede continua NÃO batendo o greedy-exato** (gaps 0–5, nunca negativos). O veredito do oráculo
  barato (Exp1 §6) segue de pé: o ganho do Exp3 é de **qualidade/generalização da função de valor**,
  não de "vencer o exato".
- **Scores absolutos NÃO são comparáveis entre experimentos.** Entre Exp2 e Exp3 os scores subiram
  globalmente (ex.: `bug-b10` exato 167→176, `fire` exato 150→160), quase certamente por fontes de
  move mais ricas na Config desta rodada. Por isso a comparação é sempre via **gap**, nunca valor
  absoluto. A melhora do Water (14→4) também vem de um **pacote** de mudanças (b10→b60, aleatório→
  misto, e lendários), não de uma variável isolada.
- **`naoLend-b60` é generalização FRACA:** como o modelo foi treinado **com** lendários, tirar os
  lendários só restringe o pool a Pokémon que ele **já viu**. Os testes que medem generalização de
  verdade (tipo não-visto + budget b10) são os **monotype**.

### Ponto que NÃO se sustenta
- Não há aqui prova de "generalização para Pokémon nunca vistos": como o treino **incluiu**
  lendários, o cenário `allTypes-b60 +lendários` é **in-distribution**, não um feito de transferência.

---

## 6. Conclusão e próximo passo (opcional)

O Exp3 **valida a hipótese central** dos experimentos anteriores: o gargalo era a **distribuição de
treino**. Enriquecendo com times bons + vizinhos + cobertura monotype, a função de valor ficou bem
calibrada no topo (gap 2 in-distribution), a falha do Water desapareceu, e a generalização monotype
ficou uniforme — tudo **sem tocar na arquitetura**.

**Fecha o arco do trabalho:** diagnóstico (Exp1) → ablação de quantidade (Exp2) → validação/falha
(validação) → correção pela distribuição (Exp3).

**Run opcional para a generalização FORTE:** treinar **sem** lendários (`b60-nlend/`) e testar
**com** eles — aí sim seriam Pokémon nunca vistos, e a afirmação de transferência ficaria limpa.
Infra pronta (basta desligar "banir lendários" na geração). Nice-to-have, não obrigatório.

---

## 7. Inventário — `b60-lend/`

| Arquivo | Conteúdo |
|---|---|
| `dataset.csv` | dados de treino (misto; 27.467 amostras, budget 60, com lendários) |
| `model_weights.json` | pesos da rede (carregável no app) |
| `training_history.json` | curvas de loss treino/val |
| `loss_curve.png` / `pred_vs_exato.png` | convergência e calibração (R²=0,539) |
| `testes/allTypes-b60-lend.*` | teste in-distribution (gap 2) |
| `testes/naoLend-b60.*` | generalização fraca — remove lendários (gap 5) |
| `testes/{fire,water,bug}-naoLend-b10.*` | generalização real — monotype + b10 (gap 5/4/0) |

Cada teste tem SA + greedy-exato (referência, independem do modelo) + greedy-nn (o modelo do Exp3).
