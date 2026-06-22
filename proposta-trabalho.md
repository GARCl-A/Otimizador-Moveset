Enunciado do trabalho:

O trabalho final é um estudo de uma base de dados/problema com redes neurais. Ele é composto pelo desenvolvimento e apresentação do artigo. Por enquanto, esta atividade trata da proposição de trabalho. 

Submeta aqui sua proposta. É preciso apontar:

- descrição do problema;
- fonte dos dados;
- quem já estudou esses dados (artigos, repositórios etc.);
- quem já estudou os dados da forma que você quer;
- o que você pretende fazer: métodos, análises, avaliações;
- o que de novidade você quer trazer; que análises quer realizar
- qual a fonte dos códigos que você usará ou se irá fazer desenvolvimento próprio.

Verificarei a novidade fazendo pesquisas em artigos e repositórios. 

Não será aceita mera repetição de estudo já publicado.

A proposta não precisa ser enviada por ambos os membros de um grupo (até 3 integrantes), mas quem a enviar deve citar com quem a fará. Quanto mais integrantes, maior a entrega a ser feita...

---------

A proposta que fiz:

Proposta de Trabalho Final — Redes Neurais

Lucas Garcia e Matheus Cardoso

Descrição do problema
PokeRogue (2024) é um jogo da franquia Pokémon no formato roguelite PvE. O
termo roguelite indica que cada partida (run) é gerada de forma procedural e que
a derrota a encerra, havendo alguma progressão acumulada entre uma partida e
outra. O termo PvE (player versus environment) indica que o jogador enfrenta
adversários controlados pela máquina, e não outros jogadores. Ao longo de uma
run, o jogador avança por ondas sucessivas de batalhas contra treinadores e
Pokémon do jogo e monta seu time conforme progride.
O trabalho aborda a otimização de times nesse jogo. A partir de uma pool de
Pokémon disponíveis, o objetivo é selecionar um time de 6 indivíduos e, para cada
um, 4 ataques dentre os que aquele Pokémon pode aprender, de modo a
maximizar a cobertura de dano contra um conjunto de adversários comuns no
jogo, que chamamos aqui de meta PvE.
O espaço de busca é combinatório, dado por C(pool, 6) × ∏ C(Ni

, 4), onde Ni
é o
número de ataques disponíveis para o i-ésimo Pokémon. Para pools de 50 a 100
Pokémon com movesets de 20 a 40 ataques cada, o número de combinações torna
a enumeração exaustiva impraticável. A função objetivo, que chamamos de
cobertura de dano, é a fração dos adversários do meta contra os quais o time
possui pelo menos um ataque supereficaz, ponderada pelo dano esperado.
Fonte dos dados
Os dados são gerados pelos próprios autores por raspagem (web scraping) da wiki
oficial do PokeRogue com Selenium. São coletados o movepool de cada Pokémon
(nome do ataque, tipo, categoria, poder base, precisão e fonte de aprendizado), a
tabela de efetividade de tipos (18 por 18) e a lista de adversários do meta PvE,
cerca de 100 Pokémon com seus stats. Não há um dataset estruturado equivalente
disponível publicamente; os dados são produzidos pelo pipeline de scraping do
projeto, cujo repositório é https://github.com/GARCl-A/Otimizador-Moveset.
Trabalhos relacionados
PokeRogue foi lançado em 2024. Uma busca no Google Scholar, no arXiv e na web
não retornou trabalhos acadêmicos tratando especificamente desse jogo; os
resultados foram guias de gameplay, wikis e ferramentas de planejamento de
time, sem caráter acadêmico. Não afirmamos que tais trabalhos não existam,
apenas que não os localizamos nessas buscas.
Para o problema mais geral de team building e seleção de movesets em Pokémon
competitivo ou nos jogos principais, há duas linhas relevantes. A primeira usa
estatísticas de uso da plataforma Smogon. A segunda aplica aprendizado por
reforço a batalhas, voltado à escolha de ações durante o combate. Nessa segunda

linha, Huang e Lee (2019) treinam um agente PPO por self-play para batalhas
individuais, e Wang (2024) combina PPO com MCTS para jogar batalhas aleatórias
em nível humano. Há também trabalho recente sobre montagem de time e
generalização entre estratégias, como o VGC-Bench (2025).
Não localizamos trabalhos que tratem a seleção de moveset e a montagem de time
como um problema de otimização combinatória resolvido com redes neurais, nem
para o cenário competitivo nem para o PvE. A referência mais próxima em espírito
é o uso de redes de política em RL para jogos com escolha sequencial de ações,
como AlphaGo e MuZero, mas aplicado à seleção do time antes da partida, e não
durante o combate.
O que pretendemos fazer
Método
O projeto já conta com implementações de dois algoritmos de busca heurística,
Simulated Annealing (SA) e Algoritmo Genético (GA), além de um construtor
greedy que avalia candidatos com a função de score exata. Esses três métodos
servem como baselines.
A contribuição central é um construtor greedy guiado por rede neural, que
chamamos de greedy-NN. Ele parte de um time vazio e, a cada passo, avalia com a
rede todos os candidatos disponíveis (cada candidato é um Pokémon com um
moveset), adiciona o candidato de maior valor previsto e repete até completar o
time de 6 Pokémon com 4 ataques cada. A rede aprende uma função de valor
construtiva que, dado o time parcialmente montado e um candidato, prevê o score
de cobertura do time final resultante.
Geração de dados
Para gerar os dados de treino, o SA é instrumentado para registrar, a cada
iteração, o estado do time e o score correspondente, o que produz amostras no
formato (time parcial, candidato, score final) sem custo adicional de execução.
Esse conjunto é complementado com rollouts aleatórios avaliados pela função
exata.
Arquitetura e features
A entrada da rede é um vetor que concatena o time parcial, com 6 posições e
padding de zeros para os slots vazios, e o candidato a ser adicionado. Cada
Pokémon é representado por seu tipo em codificação one-hot (18 dimensões), três
stats principais e seus 4 ataques descritos por tipo, categoria, poder e prioridade
(cerca de 16 dimensões), totalizando aproximadamente 260 features. O modelo é
um MLP com duas a três camadas ocultas, implementado em PyTorch, e o alvo de
regressão é o score de cobertura do time completo.
Avaliações
A avaliação compara os quatro métodos (SA, GA, greedy exato e greedy-NN).
Pretendemos reportar a distribuição dos scores finais em 100 execuções

independentes por meio de um boxplot comparativo, além do tempo de montagem
de um time em cada método. Para a rede em si, mostramos a curva de loss de
treino e validação e um gráfico de dispersão entre o score previsto pela rede e o
score exato no conjunto de teste. Por fim, fazemos uma análise qualitativa de se a
rede tende a evitar redundância de tipo no time.
Contribuições
As contribuições do trabalho são quatro. Primeiro, aplicamos a formulação de
team building ao PokeRogue, jogo para o qual não encontramos trabalhos
acadêmicos prévios nas buscas descritas acima. Segundo, usamos uma rede
neural como função de valor em uma construção incremental do time, em
contraste com os métodos perturbativos SA e GA; não localizamos essa
combinação na literatura sobre Pokémon que consultamos. Terceiro, o conjunto de
dados é gerado pelo pipeline de scraping e processamento do projeto, sem
depender de um dataset público. Por fim, a presença dos três baselines já
implementados permite comparar diferentes paradigmas de busca (perturbativo,
evolutivo e construtivo) sob a mesma função de score.
Fonte dos códigos
A base do projeto, incluindo SA, GA, função de score e scraping, é de
desenvolvimento próprio dos autores e está em
https://github.com/GARCl-A/Otimizador-Moveset. A rede neural é implementada
pelos autores em Python com PyTorch. As bibliotecas de apoio são NumPy,
pandas, matplotlib (análise e visualização) e scikit-learn (pré-processamento e
métricas). Não é utilizado nenhum modelo pré-treinado; todo o treinamento parte
do zero sobre os dados gerados pelo projeto.
Referências
Huang, D.; Lee, S. (2019). A self-play policy optimization approach to battling Pokémon.
2019 IEEE Conference on Games (CoG), p. 1–4. DOI 10.1109/CIG.2019.8848014.
Wang, J. (2024). Winning at Pokémon Random Battles Using Reinforcement Learning.
Dissertação de mestrado, MIT.
VGC-Bench (2025). Towards Mastering Diverse Team Strategies in Competitive
Pokémon. arXiv:2506.10326.