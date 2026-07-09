# Validação do modelo `allTypes-b10` em cenários monotype não-vistos

**Data:** 2026-07-08
**Pasta:** `experiments/exp2-rollouts-8000/validacao-allTypes-b10/`
**Modelo (função de valor):** `model_weights_allTypes-b10.json` (extraído do Exp2, treinado só com
rollouts aleatórios do pool completo — **nunca viu um time monotype**).
**Cenários testados:** monotype **Fire**, **Water** e **Bug**, todos com budget 10 e **sem lendários**.

**Pergunta:** a função de valor treinada num cenário genérico **transfere** para restrições de tipo
que ela nunca viu? (Teste de generalização / amortização — ver Exp1 §6 e Exp2 §6.)

---

## 1. Resultado consolidado

Score (SA: 30 runs; gulosos: melhor sobre K=1,3,5,10). Todos os cenários b10, sem lendários.

| cenário | SA (med / **melhor**) | greedy-exato | **greedy-nn** (melhor) | gap nn→exato | gap exato→SA |
|---|---|---|---|---|---|
| **Fire** | 160 / **160** | 150 | **148** (K=3,5) | −2 | −10 |
| **Water** | 172 / **175** | 174 | **160** (todo K) | **−14** | −1 |
| **Bug** | 167 / **167** | 167 | **167** (K=10) | **0** | 0 |

*(No Fire também rodou GA: mediana ~155, melhor 160, ~16 s — dominado pelo SA, como sempre.)*
*(Tempos greedy-nn: ~18–237 ms; greedy-exato: ~1–22 ms. O NN continua mais lento que o exato.)*

---

## 2. Leitura — a generalização existe, mas é irregular

O mesmo modelo transfere **muito bem em dois casos e falha feio num terceiro**:

- **Bug — transferência perfeita.** greedy-nn (167) **empata** o greedy-exato e o SA. Sem folga.
- **Fire — transferência boa.** greedy-nn (148) fica a **2 pontos** do greedy-exato (150). Não colapsa.
- **Water — transferência ruim.** greedy-nn (160) fica **14 pontos** abaixo do greedy-exato (174).

Ou seja: *"V transfere"* **não é uniforme** — depende do tipo. A conclusão do teste do Fire ("a rede
generaliza") era cedo demais: com 3 pontos, vê-se que a transferência é **caso-dependente**.

### Por que o Water falhou (e é instrutivo)
No Water, o greedy-nn montou **Dondozo | Swampert | Primarina** (3 membros caros, 160), enquanto o
greedy-exato montou **Golisopod | Dondozo | Starmie | Dewgong** (4 membros mais baratos, 174). A rede
fez uma **alocação de budget pior** que o guloso — torrou o orçamento em 3 peças e não coube uma 4ª.
É o **oposto** da "visão de futuro" que a gente esperava: aqui a nota ruidosa da rede *atrapalhou* a
decisão de orçamento em vez de ajudar. É exatamente o sintoma de um `V` mal calibrado no topo da
distribuição (efeito do treino com dados aleatórios).

### Sobre o K
Comportamento imprevisível, como nos experimentos anteriores: no **Bug**, K=10 **ajudou** (160→167);
no **Fire**, K=10 **piorou** (148→135); no **Water**, K foi indiferente (160 sempre). Mais movesets
por candidato ora salvam, ora afundam a rede ruidosa — não há um K "seguro".

---

## 3. Geral vs. especializado no Bug (head-to-head)

Comparação **limpa**: mesmo cenário `bug-b10-nlend`, só troca o modelo. SA e greedy-exato são
idênticos nos dois runs (167), confirmando que apenas a função de valor mudou.

| greedy-nn no Bug-b10-nlend | K=1 | K=3 | K=5 | K=10 | **melhor** |
|---|---|---|---|---|---|
| modelo **geral** (`allTypes-b10`) | 160 | 160 | 160 | **167** | **167** |
| modelo **especialista** (`bug-b10`) | 156 | 155 | 155 | 153 | 156 |
| *referência: greedy-exato / SA* | | | | | *167* |

**Resultado (contraintuitivo e forte):** o modelo **geral empata o ótimo (167)**, enquanto o
**especialista em Bug fica 11 pontos atrás (156)** — no próprio tipo para o qual foi treinado.
**Especializar o pool de treino PIOROU a função de valor até no Bug.**

Por quê (hipótese): o pool de Bug não-lendário tem pouquíssimas espécies, então 8.000 rollouts
aleatórios cobrem um espaço minúsculo e repetitivo — o especialista decora a "média do time de Bug
aleatório" e perde resolução no topo (onde o greedy decide). O generalista viu Bug em milhares de
contextos diversos (pool completo), aprendeu estrutura transferível (cobertura, stats, tipos de
move), e **essa representação mais rica desce melhor para o Bug** que o especialista estreito. É o
fenômeno de *dados diversos > dados especializados-mas-pobres*.

**Bônus — colapso cross-type:** o mesmo especialista de Bug, rodado em **Água** (tipo que nunca viu),
despenca para **122** (vs. 160 do generalista), montando `Slowbro|Cloyster|Starmie|Dewgong`. Confirma
que um especialista estreito **não transfere** para fora do seu pool.
(`water-b10-nlend/experimentos_modelo-bug_crosstype.csv`.)

> Ressalva: é 1 cenário, greedy-nn determinístico (N=1 por K). Mas o gap (11 pts) é grande e o teto
> (167) é confirmado por SA e exato. Vale replicar em +1 tipo para robustez.

---

## 4. Veredito

- **O greedy-nn nunca supera o greedy-exato** nos 3 cenários não-vistos (empata no Bug; −2 no Fire;
  −14 no Water). O motivo de existir dele — vencer a miopia do guloso — **não se realizou** em nenhum.
- **O SA continua sendo o teto de qualidade** (ou empatado pelo exato no Bug).
- **A generalização é real porém frágil:** os features por-Pokémon fazem `V` transferir
  estruturalmente, mas a **baixa qualidade de treino** (dados aleatórios) torna a transferência
  **não-confiável** — ótima no Bug/Fire, péssima no Water.

Tema recorrente, agora com evidência de generalização: **a rede transfere, mas foi treinada para ser
medíocre, então transfere mediocridade** — de forma desigual. O gargalo segue sendo a **distribuição
de treino**, não a arquitetura nem a capacidade de generalizar.

---

## 5. Próximos passos

1. ✅ **Head-to-head geral × especialista no Bug** — **feito** (Seção 3): o modelo geral (167) bateu
   o especialista (156).
2. **Mais tipos** para robustez (ex.: Grass, Steel) — ver se o padrão "bom no Fire/Bug, ruim em
   alguns" se mantém e o que caracteriza as falhas (tipos com um carregador ofensivo forte, tipo o
   Starmie no Water, parecem ser os que a rede subvaloriza).
3. ✅ **Exp3 (a alavanca real):** re-treinar `allTypes` com **times bons** — **feito**
   ([`../../exp3/RELATORIO.md`](../../exp3/RELATORIO.md)). A transferência ruim do Water **melhorou
   muito** (gap 14 → 4), confirmando a hipótese; Fire/Bug seguem sem bater o exato (o veredito do
   oráculo barato se mantém).

---

## 6. Inventário

| Subpasta / arquivo | Conteúdo |
|---|---|
| `fire-b10-nlend/experimentos_modelo-allTypes.*` | SA, GA, greedy-exato, greedy-nn (modelo geral) — Fire |
| `water-b10-nlend/experimentos_modelo-allTypes.*` | SA, greedy-exato, greedy-nn (modelo geral) — Water |
| `water-b10-nlend/experimentos_modelo-bug_crosstype.csv` | greedy-nn com o modelo **Bug** em Água (colapso cross-type, 122) |
| `bug-b10-nlend/experimentos_modelo-allTypes.*` | greedy-nn com o modelo **geral** no Bug (167) |
| `bug-b10-nlend/experimentos_modelo-bug.*` | greedy-nn com o modelo **especialista** no Bug (156) |

O sufixo `_modelo-<X>` indica qual função de valor alimentou o greedy-nn. SA e greedy-exato são
independentes do modelo — servem de referência e de "impressão digital" do cenário.
