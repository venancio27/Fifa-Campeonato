# Motor de regras — Campeonato de FIFA (noite de jogos da igreja)

## 1. Contexto

Noite de jogos com os jovens da igreja: tabuleiro, baralho e um campeonato de FIFA.
Só **1 console/TV** disponível, e o tempo reservado pro FIFA é **flexível (3h+)** — quem
não está jogando pode circular por outras atividades e voltar na sua vez. Não se sabe
de antemão quantas pessoas vão querer jogar (mais provável ~12, mas pode variar).

A página HTML deve:
1. Cadastrar jogadores (nome + time do FIFA escolhido).
2. Deixar o organizador configurar o modo do campeonato antes de começar.
3. Gerar os confrontos de cada rodada automaticamente.
4. Registrar placares ao vivo (inclusive pênaltis) e atualizar a classificação sozinha.
5. Mostrar um painel de fila para o console único: quem está jogando agora e quem vem a seguir.
6. Gerar o chaveamento do mata-mata automaticamente após o corte.

Decisões de **layout/visual** ainda não foram tomadas — isso é a próxima etapa, fora do
escopo deste documento.

---

## 1.1 Decisões de implementação (definidas em conversa)

- **Stack**: página única (HTML + CSS + JS puro, sem build/instalação), publicável no
  Netlify arrastando a pasta do projeto.
- **Persistência**: `localStorage` do navegador. Não há backend nem banco de dados —
  tudo fica salvo no aparelho que está rodando a página.
- **Uso na noite**: um único aparelho (celular/notebook do organizador) roda a página e
  é espelhado/conectado na TV (HDMI, Chromecast, AirPlay ou segundo monitor). Por ser o
  mesmo navegador, não há problema de sincronização. A página tem dois modos de
  visualização, alternáveis por um botão:
  - **Modo Operador**: com os controles de cadastro, configuração e lançamento de placar.
  - **Modo Telão**: somente leitura, fontes grandes, pensado para ser visto de longe
    (classificação, painel de fila, chaveamento).
- **Identidade visual**: inspirada na logo da NextGen (fundo escuro, gradiente de fogo
  laranja/vermelho da fênix, detalhes coloridos do "X" — azul, amarelo, vermelho, roxo —
  usados como acentos pontuais).
- **Animação de sorteio**: roleta/roda giratória com os nomes, que desacelera e para no
  confronto sorteado (estilo sorteio de TV). Usada na revelação da Rodada 1 (sorteio real)
  e, com o mesmo efeito visual por consistência, na revelação da Rodada 2 e do
  chaveamento do mata-mata (que são determinísticos pelas regras, mas ganham o mesmo
  clima de suspense na tela).
- **Painel de fila**: não é uma fila rígida automática. As partidas de cada rodada são
  geradas em uma ordem, mas o organizador marca manualmente qual partida está
  "Jogando agora" (porque na prática a galera pode jogar fora de ordem). "A seguir"
  mostra as próximas partidas pendentes da rodada, na ordem em que foram geradas.
- **Chaveamento do mata-mata (chave cruzada)**: para evitar que os melhores colocados se
  cruzem antes da final, o chaveamento segue o padrão clássico de proteção de cabeças de
  chave, não uma simples ordem de posição:
  - **Top 4**: Quartas não se aplicam — Semis: 1º x 4º, 2º x 3º.
  - **Top 8**: Quartas: 1º x 8º, 4º x 5º, 2º x 7º, 3º x 6º. Semis cruzam os vencedores
    dos jogos (1x8)/(4x5) contra (2x7)/(3x6).
  - **Top 16**: Oitavas: 1x16, 8x9, 4x13, 5x12, 2x15, 7x10, 3x14, 6x11, seguindo o mesmo
    princípio (cabeças de chave só se encontram o mais tarde possível).
- **Caso raro — folguista da R1 = último colocado da R2 (mesma pessoa)**: como a regra do
  "duelo dos folguistas" (seção 5) exige duas pessoas diferentes, se por coincidência a
  mesma pessoa tirar folga na R1 e terminar em último após a R2, o duelo avulso é
  **cancelado automaticamente para esse caso** (não há como alguém jogar contra si
  mesmo) — a pessoa mantém os pontos que já tem (da R1, se houver, mais R2), sem partida
  extra. É um caso raro e sem prejuízo às demais regras.
- **Cadastro e configuração em telas separadas**: primeiro só o cadastro (com botão
  "Continuar"), depois a configuração do campeonato numa tela própria (com botão
  "Voltar pro cadastro" caso o organizador precise corrigir algo antes de iniciar).
- **Cadastro tardio (jogador chegou atrasado)**: permitido **somente enquanto a Rodada 1
  ainda não avançou pra Rodada 2** (a R1 pode já estar revelada e com placares em
  andamento). Ao cadastrar um atrasado nessa janela:
  - Se já havia um folguista na R1, o atrasado **encara esse folguista** num confronto
    real (a folga vira uma partida normal).
  - Se não havia folguista (número já estava par), o atrasado **vira o folguista** da
    rodada (ganha os pontos de folga configurados, ou nenhum ponto se o modo for
    "duelo dos folguistas" — nesse caso ele ainda pode ser puxado pro duelo avulso ao
    final da R2, como qualquer folguista normal da R1).
  - Não é permitido cadastro tardio a partir da Rodada 2 em diante — nesse ponto o
    organizador deve aguardar o próximo campeonato/noite para incluir a pessoa.
- **Backup em arquivo**: botões "Baixar backup" e "Carregar backup" no cabeçalho (só
  no Modo Operador), a qualquer momento. Baixa/restaura um `.json` com todo o estado
  do campeonato — é o "salvar e retomar depois", sem depender de internet nem de
  conta nenhuma.
- **Sem planilha/backend nenhum**: chegamos a desenhar (e testar) uma integração com
  Google Sheets pra catálogo de times/escudos e pré-cadastro compartilhado, mas
  voltamos atrás — escrever numa planilha sempre exige algum tipo de autorização
  (Apps Script Web App), o que trouxe fricção de configuração (erro 403 de permissão,
  passos fáceis de errar) sem ganho que compensasse pra esse uso. Decisão final: o
  app é 100% autocontido, cadastro só pelo formulário do site, salvo só no
  navegador do aparelho que está rodando (localStorage) + backup manual em arquivo.

---

## 2. Modos de disputa por quantidade de jogadores (N)

- **N = 8** (ou outro caso já potência de 2 que o organizador queira jogar direto):
  mata-mata direto, sem fase de grupos. Chaveamento por sorteio simples.
- **N > 8** (tal que N é par ou ímpar): fase de grupos em formato suíço (2 rodadas) + corte para o
  mata-mata. Corte padrão: **Top 8**. Deve ser parametrizável (ex.: Top 4) para o
  organizador reduzir o total de jogos se a noite estiver apertando.

### Fase de grupos (formato suíço, 2 rodadas)

- **Rodada 1**: confrontos por **sorteio aleatório**. Todo mundo joga 1 vez (exceto
  quem tira folga, ver seção 4).
- **Rodada 2**: confrontos **por colocação** na classificação parcial após a R1:
  1º x último colocado, 2º x penúltimo, e assim por diante (ex.: com N = 12, 1º x 12º,
  2º x 11º...).
- Após a R2, calcula-se a classificação final do grupo (ver seção 3) e corta-se para
  o Top 8 (ou Top 4, TOP 16, se configurado).

### Mata-mata

- Chaveamento pelo Top 8 (ou Top 4 ou 16) por posição: 1º x 8º, 2º x 5º... (padrão de
  chave cruzada, sem repescagem).
- Quartas → Semis → Final. A disputa de 3º lugar é opcional mas recomendada
  (mais 1 jogo, aproveitando os dois perdedores da semi).

---

## 3. Pontuação e desempate

### Pontuação por partida (fixa, vale para R1, R2 e mata-mata)

| Resultado | Pontos |
|---|---|
| Vitória no tempo normal | 3 |
| Vitória nos pênaltis | 2 |
| Derrota nos pênaltis | 1 |
| Derrota no tempo normal | 0 |

No mata-mata a pontuação não importa para classificação (é eliminatório), só
para decidir quem avança — mas o critério de vitória (normal vs. pênaltis) continua
o mesmo.

### Critérios de desempate (nessa ordem)

1. Pontos totais
2. Saldo de gols **no tempo normal** (pênaltis não entram aqui — o resultado do
   pênalti já virou pontos, não deve ser contado duas vezes)
3. Gols marcados no tempo normal
4. Confronto direto (se os dois jogaram entre si)
5. Saldo de gols nos pênaltis
6. Gols marcados nos pênaltis
7. Sorteio

---

## 4. Classificação usada para o corte do mata-mata (toggle)

Só se aplica de forma livre quando **N é par** (sem a regra de ímpar da seção 5
sendo acionada). Duas opções, escolha do organizador:

- **Soma R1 + R2**: classificação final = soma dos pontos das
  duas rodadas. A R1 além de gerar o pareamento da R2, também vale pontos pro corte.
- **Só R2 conta** (recomendado/padrão): a R1 só serve para definir o pareamento da R2 (quem pega quem);
  o corte pro mata-mata usa exclusivamente os pontos feitos na R2.
OBS: colocar um disclaimer breve sobre a vantagem e desvantagem de cada escolha. Ex: "	Soma R1+R2 (Suíço clássico)	Reconta só a R2
Como funciona	Pontos da R1 e R2 se acumulam; classificação final = soma. R1 ainda define o pareamento da R2.	R1 só serve pra definir quem pega quem na R2 (pareamento por colocação). Na hora de cortar o Top 8, só valem os pontos feitos na R2.
Vantagem	Usa mais informação (12 jogos por pessoa observados, não só 6) — estatisticamente mais estável, menos chance de um resultado isolado (sorte de um jogo só) decidir tudo.	Sensação de "reset" mais literal — quem jogou mal na R1 sabe que R2 é uma folha em branco de verdade. Mais fácil de explicar pra galera ("só a segunda rodada conta pro corte").
Desvantagem	Quem toma um "pau" feio na R1 (perde no tempo normal contra um adversário mais forte, por puro sorteio) carrega esse buraco até o fim.	Cria incentivo estranho: como a R1 não vale nada pro corte, ninguém tem motivo forte pra se esforçar nela — ela vira só um "sorteio de nível" disfarçado de jogo. Isso pode deixar a primeira rodada mais morna."


**Trava importante**: se o método de ímpar escolhido for "duelo dos folguistas"
(seção 5), o modo **"só R2 conta" fica desabilitado** — o campeonato é
**obrigatoriamente soma R1+R2** nesse caso, e explicar o porque está travado (Num popup de dúvida, ou de cadeado). Motivo: sob "só R2", o resultado do
duelo avulso se tornaria o único fator decidindo o destino de quem tirou folga na
R2, um tipo de resultado estruturalmente diferente do jogo pareado por colocação
que todo mundo mais teve. A interface deve deixar essa trava visível/explicada
quando o organizador selecionar "duelo dos folguistas".

---

## 5. Tratamento de número ímpar de jogadores

Só entra em cena quando N é ímpar. Duas opções, escolha do organizador (toggle):

### Opção 1 — Ponto fixo (parametrizável)
Quem tira folga na rodada recebe **X pontos** (organizador escolhe 1 ou 2,
default sugerido: 1), sem gols de saldo naquela rodada. Compatível tanto com
"soma R1+R2" quanto com "só R2 conta" — não quebra em nenhum dos dois modos.

### Opção 2 — Duelo dos folguistas
Ninguém recebe ponto de graça. O jogador que tirou folga na R1 e o jogador que
tirou folga na R2 jogam **uma partida avulsa entre si**, com pontuação normal
(3/2/1/0), ao final da R2.
- Essa partida é **1 jogo extra** no total (não substitui nem se encaixa dentro
  do pareamento normal de nenhuma rodada — tirar os 2 folguistas do pareamento
  por posição deixaria o resto do grupo ímpar de novo).
- **Trava**: com esse método, o campeonato fica obrigatoriamente em
  **soma R1+R2** (ver seção 4).


### Quem tira a folga em cada rodada (regra fixa, não é escolha do organizador)

- **Rodada 1**: por **sorteio** — ainda não existe classificação, então a folga
  cai em quem sobrar do sorteio dos confrontos.
- **Rodada 2**: sempre o **último colocado da classificação parcial** (nunca
  sorteio). Motivo: evita que a folga caia em alguém próximo da linha de corte
  do Top 8, o que mexeria artificialmente em quem se classifica.

Consequência: ninguém tira folga duas vezes (quem folgou na R1 já tinha
classificação zerada, então não é o último colocado "por padrão"; quem folga na
R2 é justamente quem está mal na tabela, então dificilmente é o mesmo que folgou
na R1 por sorteio aleatório — mas se coincidir, não há regra de re-sorteio
especial para isso, é aceitável).

---

## 6. Exemplo completo simulado (N = 13, para validar a lógica)

### Rodada 1 (sorteio) — 6 jogos + 1 folga por sorteio

| Confronto | Resultado | Pontos |
|---|---|---|
| J1 x J7 | 3x1 (normal) | J1: 3 · J7: 0 |
| J2 x J11 | 2x2, pên. J11 venceu | J11: 2 · J2: 1 |
| J3 x J9 | 1x0 (normal) | J3: 3 · J9: 0 |
| J4 x J13 | 2x1 (normal) | J4: 3 · J13: 0 |
| J5 x J8 | 0x0, pên. J5 venceu | J5: 2 · J8: 1 |
| J6 x J10 | 4x2 (normal) | J6: 3 · J10: 0 |
| J12 | folga | 1 (ponto fixo, exemplo) |

Classificação parcial: 1º J6 · 2º J1 · 3º J4 · 4º J3 · 5º J11 · 6º J5 · 7º J2 ·
8º J8 · 9º J12 · 10º J13 · 11º J9 · 12º J10 · 13º J7

### Rodada 2 (por colocação) — folga vai pro 13º (J7)

| Confronto (posição na parcial) | Resultado | Pontos da rodada |
|---|---|---|
| J6 (1º) x J10 (12º) | 3x0 | J6: 3 · J10: 0 |
| J1 (2º) x J9 (11º) | 1x1, pên. J9 venceu | J9: 2 · J1: 1 |
| J4 (3º) x J13 (10º) | 2x2, pên. J4 venceu | J4: 2 · J13: 1 |
| J3 (4º) x J12 (9º) | 0x1 | J12: 3 · J3: 0 |
| J11 (5º) x J8 (8º) | 2x0 | J11: 3 · J8: 0 |
| J5 (6º) x J2 (7º) | 1x0 | J5: 3 · J2: 0 |
| J7 (13º) | folga | 1 (ponto fixo, exemplo) |

### Classificação final (soma R1+R2) e corte Top 8

| Pos | Jogador | Pontos totais | Situação |
|---|---|---|---|
| 1º | J6 | 6 | Top 8 |
| 2º | J4 | 5 | Top 8 |
| 3º | J11 | 5 | Top 8 |
| 4º | J5 | 5 | Top 8 |
| 5º | J1 | 4 | Top 8 |
| 6º | J12 | 4 | Top 8 |
| 7º | J3 | 3 | Top 8 |
| 8º | J9 | 2 | Top 8 |
| 9º | J8 | 1 | eliminado |
| 10º | J2 | 1 | eliminado |
| 11º | J13 | 1 | eliminado |
| 12º | J7 | 1 | eliminado |
| 13º | J10 | 0 | eliminado |

(Empates de pontos, ex. J4/J11/J5 com 5 cada, resolvidos por saldo de gols →
gols marcados → confronto direto, conforme seção 3.)

Com o corte sempre sobram 8 (número redondo), então o mata-mata vira um
chaveamento comum, sem folga nenhuma: 1º x 8º, 2º x 5º... seguindo normal até
a final.


---

## 7. Requisitos funcionais para a página (resumo para implementação)

1. **Cadastro**: nome do jogador + time do FIFA escolhido.
2. **Configuração pré-torneio**: número de jogadores (auto-detectado pela lista
   cadastrada), escolha de modo:
   - Corte do mata-mata: Top 8 (padrão) ou Top 4 ou 16 (16 é só para opção, simulando umas oitavas. O que dificilmente acontecerá. É só para opção mesmo) (parametrizável)
   - Classificação pro corte (só relevante se N par sem ímpar acionando trava):
     soma R1+R2 (padrão) ou só R2
   - Tratamento de ímpar (só aparece se N for ímpar): ponto fixo (com campo
     numérico 1 ou 2, padrão 1) ou duelo dos folguistas (que trava a
     classificação em "soma R1+R2" automaticamente, com aviso visível)
3. **Geração automática dos confrontos**: sorteio da R1; pareamento por
   colocação na R2 (com a regra de folga da seção 5); geração do jogo avulso
   de duelo se aplicável; geração do chaveamento do mata-mata após o corte.
4. **Registro de placar**: placar final por partida,
   incluindo indicação de que se tiver empatado, deve se cadasrtar o placar da disputa de pênaltis.
5. **Classificação ao vivo**: recalculada automaticamente a cada resultado
   registrado, aplicando pontuação (seção 3) e desempates (seção 3).
6. **Painel de fila** (essencial, console único): "jogando agora" + lista dos
   próximos 2-3 confrontos, para quem está em outra atividade saber quando
   voltar.
7. **Persistência durante a noite**: os dados não podem se perder se a página
   for recarregada (decisão de como resolver isso — localStorage, backend
   simples etc. — ainda em aberto para a etapa de implementação).