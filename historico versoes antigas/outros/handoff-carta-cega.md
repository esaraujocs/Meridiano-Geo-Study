# Carta Cega — briefing de handoff

Documento de contexto para continuar o desenvolvimento em outra sessão. Estado em 16/08/2026.

---

## 1. O que é

Jogo local de treino de geografia, entregue como **um único arquivo HTML autocontido** (~2,22 MB), aberto direto do disco (`file://`). Usado principalmente no **celular**, mas também no desktop. Interface toda em português do Brasil.

Objetivo do usuário: aprender a reconhecer países pelo formato no mapa, por bandeira e por capital. Ele já treinou as ~250 bandeiras por fora e usa o app para consolidar mapa, capitais e contexto histórico.

**Única dependência externa:** `d3@7` e `topojson-client@3` carregados de `cdn.jsdelivr.net`. Sem internet, o app não roda. Todo o resto (mapa, bandeiras, metadados, textos) está embutido no arquivo.

---

## 2. Estrutura do arquivo

O HTML tem três partes, nesta ordem:

1. **`shell.html`** — `<head>` com todo o CSS e o markup da interface.
2. **`<script id="payload" type="application/json">`** — o dado do jogo (~2,15 MB).
3. **`<script>`** com a lógica (`app2.js`), tudo dentro de uma IIFE única, sem módulos.

### Payload

```
{ topo, meta, names3, points, flags }
```

- **`topo`** — TopoJSON, Natural Earth **10m**, 239 geometrias com `id` = código ISO numérico como string sem zeros à esquerda (`"76"` = Brasil).
- **`meta`** — 239 entradas, chaveadas pelo mesmo id. Campos: `pt`, `en`, `cca2`, `cca3`, `cap`, `pop`, `reg`, `sub`, `area`, `ll`, `lang`, `cur`, `ind`, `un`, `obs`, `landlocked`, `borders`, `fato`.
- **`names3`** — `cca3` → nome em português, usado para listar vizinhos.
- **`points`** — membros da ONU sem geometria no mapa, injetados como ponto. Hoje está vazio (o 10m já tem Tuvalu), mas o código que consome isso continua ativo.
- **`flags`** — 239 bandeiras embutidas: **165 como `svg:<markup cru>`** e **74 como data URI PNG 256px**. A escolha foi feita por bandeira, comparando o custo real de cada representação.

### Como o payload foi construído

O pipeline **não está dentro do HTML** — ele viveu no sandbox da sessão anterior e se perdeu. Se for preciso regerar o dado, terá que ser refeito. Os passos foram:

1. `simplify10.mjs` — presimplify + **simplificação variável**: arcos com extensão < 1,5° são preservados **inteiros** (ilhas), o resto é podado com peso 0,002. Depois, quantização própria em grade 1e5 com deltas inteiros.
2. `fix_rings.mjs` — detecta anéis com área esférica > 2π e inverte o sentido. **18 anéis estavam do avesso na fonte**; as Maldivas tinham área de 37,7 esferorradianos (três vezes o globo) e pintavam o mundo inteiro de terra.
3. `build_payload.py` — junta topo + metadados; marca `un`/`obs`.
4. `ptbr.py` — idiomas e moedas do **CLDR pt**, 75 capitais traduzidas à mão, e as notas históricas.
5. `flags_hi.py` — rasteriza/otimiza bandeiras e escolhe vetor vs bitmap.

**Para mexer só em lógica ou CSS, edite o HTML diretamente** — o payload não precisa ser tocado.

---

## 3. Funcionalidades atuais

### Modos (`MODES`, chave `mode.k`)
- `mapa` — clique no mapa
- `bn` — bandeira no enunciado → 4 nomes
- `nb` — nome no enunciado → 4 bandeiras
- `escr` — bandeira no enunciado → digitar

### Recortes (`VIEWS`, chave `view.k`)
`mundo`, `europa`, `africa`, `asia`, `americas`, `oceania` (rotulado **Pacífico**), `caribe` (filtra por `sub === 'Caribbean'`).

Cada um tem `rotate`, `box` (caixa lon/lat) e `cover` opcional.

### Ajustes (botões `.ghost`, faixa rolável)
| id | variável | efeito |
|---|---|---|
| `#t-cap` | `byCapital` | pergunta pela capital em vez do país, em todos os modos |
| `#t-card` | `cardOn` | mostra a ficha depois de responder |
| `#t-flag` | `flagFill` | preenche o país revelado com a bandeira |
| `#t-lab` | `showLabels` | rótulos de nome no mapa |
| `#t-un` | `onlyUN` | restringe o sorteio aos 195 |

### Outros
- Baralho sem repetição por recorte, com barra de progresso.
- Painel com duas abas: **Esta partida** e **Desempenho**.
- Ficha do país: bandeira, capital, população, região, área, idioma, moeda, vizinhos, status ONU e **nota histórica** (`fato`).
- Histórico persistente em `localStorage`, com exportar/importar JSON.

---

## 4. Funções e nomes que importam

Tudo no mesmo escopo da IIFE.

**Baralho e rodada:** `buildPool()`, `syncQueue()`, `newSet()`, `nextRound()`, `advanceSoon()`, `renderRound()`, `scoreRound()`
Estado: `pool`, `queue`, `played`, `missed`, `batch`, `batchLeft`, `batchDone`, `pending`, `setSize`, `locked`, `target`, `lastResult`

**Mapa:** `redrawGeometry()`, `fitBox()`, `boxGeom()`, `fitTarget()`, `resize()`, `checkMap()`, `paint()`, `stateOf()`, `drawDots()`, `dotIds()`, `isTiny()`, `drawChips()`, `sizeChips()`, `syncPatterns()`, `labelPoint()`, `boundsOf()`, `areaOf()`, `drawLabels()`, `fitLabels()`, `zoomTo()`, `refreshDots()`, `showPeek()`

**Palpite no mapa:** `guess()`, `nearestCountry()`, `boundsFull()`, `rectDist()`, `distanceToCountry()`, `bearing()`, `rose()`, `redrawLine()`

**Quiz:** `answerChoice()`, `answerTyped()`, `markOptions()`, `flashOk()`, `distractors()`, `norm()`, `nameOf()`, `sizeFlagFrame()`, `flagSrc()`

**Painel e histórico:** `showCard()`, `showPanel()`, `hidePanel()`, `abrirAba()`, `renderDesempenho()`, `histLoad()`, `histSave()`, `podar()`, `sessNew()`, `sessClose()`, `agrega()`, `porRegiao()`, `validas()`
Constantes: `HIST_KEY = 'carta-cega.hist.v1'`, `HIST_MAX`, `HIST_MIN_ROD`, `REGPT`, `MODOPT`

Helpers: `inUN(m)` = `m.un || m.obs`, `subPt(m)`, `isChoice()`, `isMap()`

---

## 5. Decisões de UX que NÃO podem ser quebradas

Cada uma nasceu de um problema real relatado pelo usuário.

1. **Acerto no quiz com a ficha desligada não tranca nada.** Pontua, dispara a animação `.opt.flash` e chama `nextRound()` no mesmo instante. O retorno visual é animação, não pausa. Só o erro mantém pausa (1,4 s), para dar tempo de ver a certa.
2. **Clique durante o retorno de erro corta a espera** e só vira resposta se bater com o novo alvo (`pending`). Antecipação nunca penaliza.
3. **Clique em opção já marcada (`batchDone`) é ignorado** — protege contra toque repetido.
4. **Lote de 4:** as mesmas opções ficam na tela e todas as 4 vêm do baralho e são cobradas. Consequência aceita: a 4ª é grátis por eliminação.
5. **Sorteio sem repetição.** `syncQueue()` exclui `batchLeft` e o alvo em curso; `newSet()` zera `target = null`. Sem isso, resize no meio da rodada devolve o país ao baralho.
6. **No mapa, erro sempre mostra a ficha**, mesmo com o toggle desligado — é onde se aprende. Acerto com ficha off avança em 900 ms.
7. **Alternar a ficha no meio da rodada:** desligar fecha e avança; ligar cancela o avanço e mostra a ficha do `lastResult`.
8. **Clique no oceano cai no país mais próximo**, restrito ao `pool` (nunca Antártida ou não sorteável). O km é medido do ponto tocado. Acerto pelo mar não desenha a linha de erro.
9. **Rótulo de nome só aparece se couber na largura do país** (`fitLabels()`, piso 6,5 px). O alvo da rodada nunca mostra rótulo antes da resposta.
10. **Micro-estado vira ponto** com área de toque de 15 px; revelado, vira plaquinha de bandeira. O critério é **relativo ao zoom** (`isTiny()` usa `área × k²`), então aproximar transforma ponto em silhueta.
11. **Bandeira preenche a silhueta** por `<pattern>`, com `fill` aplicado por **style inline** — a regra CSS `.country` vence o atributo `fill`.
12. **Distratores são uniformes dentro do recorte.** Agrupar por continente entregava a região de graça.
13. **A dica de sub-região some nos modos com bandeira no enunciado**, pelo mesmo motivo.
14. **Enquadramento por caixa geográfica fixa**, com anel em sentido **horário** (invertido, o d3 lê como "todo o globo menos isso") e fator `cover` por recorte (África 1,05; Ásia 1,2; demais 1,35). Enquadrar pelos países fazia a Rússia espremer a Europa num canto.
15. **O mapa é posicionado de forma absoluta**, com plano B de altura e aviso visível (`#diag`) se não conseguir desenhar.
16. **O filtro "Só ONU" são 195** = 193 membros + Vaticano e Palestina como observadores.

---

## 6. Histórico de desempenho (implementado, v1)

Chave `carta-cega.hist.v1`:

```
{ v: 1, sessoes: [{
    id, ini, fim,
    modo, recorte, assunto: 'pais'|'capital', conjunto: 'onu'|'tudo', ficha,
    baralho, completa, melhorSeq, seqFinal,
    r: [[idPais, ok, ms, km?], ...]
}]}
```

**Princípio:** a rodada crua é a fonte de verdade. Precisão, erro médio e recortes por região são **agregações**, nunca campos gravados.

- `sessNew()` na abertura de baralho; `sessClose(completa)` em `newSet()` (abandono) e no fim do baralho (completa).
- Abandono grava com `completa: false` **a partir de 5 rodadas** (`HIST_MIN_ROD`). Partida completa sempre grava.
- **Regra fechada com o usuário:** sessão abandonada aparece na lista marcada como parcial, mas **não entra em métrica, maestria nem recorde**. Só `completa: true` conta — é o que `validas()` faz.
- Rotação em dois estágios acima de ~1,5 MB: primeiro as sessões antigas perdem o `r` e ficam com o agregado `ag` (incluindo tally por região, para não perder a leitura por continente); depois as mais antigas saem.
- **Erro médio conta só os erros**, igual ao placar da partida.
- A quebra por região usa a **região do país sorteado**, não o recorte jogado.
- Exportar/importar JSON com deduplicação por `id`.
- Se o `localStorage` estiver bloqueado, o jogo roda normalmente e a aba avisa (`#d-warn`).

---

## 7. Roadmap combinado

Ordem acordada: **Histórico → Maestria → Perfil → Conquistas → Desafios → Leaderboard**.

- **Histórico** — feito.
- **Maestria por continente/região × modo** — próximo da fila. Não implementar sem pedido explícito.
- **Perfil, conquistas, desafios, leaderboard, partidas cronometradas** — não implementados. O esquema já carrega o que eles precisam: `ms` por rodada, país por rodada e `v` para migração de formato.

Diretriz do usuário: **nada de gamificação genérica**. Toda mecânica precisa ter relação com conhecimento geográfico, desempenho, evolução ou replayability. Não transformar a área de desempenho em dashboard complexo — a pergunta que ela responde é "como estou jogando?".

---

## 8. Problemas conhecidos

- **`localStorage` em `file://` é frágil.** Safari costuma bloquear, e cada versão nova é um arquivo baixado que pode não herdar a origem. Foi por isso que exportar/importar entrou já na v1.
- **As notas históricas saíram do meu conhecimento**, sem base consultável no ambiente. São 216 textos (195 longos, ~334 caracteres). Pode haver imprecisão de data ou ênfase discutível — o usuário está ciente e vai apontar o que soar errado.
- **População dos ~65 países acrescentados** vem de um dump antigo (RestCountries v2, ~2019). Tratar como ordem de grandeza.
- **No recorte Mundo em tela vertical sobram faixas vazias** em cima e embaixo. O planeta em Natural Earth é 2:1 e a tela é retrato; cortar significaria tirar Fiji, Kiribati e Nova Zelândia do alcance. Decisão consciente.
- **Rússia não é sorteada no recorte Europa** — o centroide da maior parte cai na Sibéria, fora da caixa. Continua no Mundo.
- **A 4ª opção de cada lote é grátis** por eliminação. Inerente à mecânica aprovada.
- **Arquivo em 2,22 MB.**

---

## 9. Como testar sem navegador

Não havia navegador no ambiente. O que funcionou, e que pegou vários bugs reais:

- **jsdom** carregando o HTML com `runScripts: 'outside-only'`, injetando d3 e topojson manualmente, com stubs de `ResizeObserver`, `getBoundingClientRect`, `getComputedTextLength` e `getBBox`. Permite jogar partidas inteiras por script, checar classes, contar rodadas e inspecionar o `localStorage`.
- **cairosvg** rasterizando o SVG que o app realmente produz, para conferir o mapa com os olhos.
- Checagens diretas sobre o payload com `d3.geoArea` — foi assim que as Maldivas invertidas apareceram.

**Lição cara:** substituições de string em arquivo falharam em silêncio mais de uma vez e geraram bugs que pareciam de lógica. Toda edição passou a ser feita com asserção obrigatória de que o trecho antigo existe exatamente uma vez.

---

## 10. Estado exato da próxima tarefa

**Não há tarefa em andamento.**

A última entrega foi o histórico + aba Desempenho, aprovada na proposta e já implementada e testada por script. **O usuário ainda não validou essa versão no navegador dele.** O passo imediato é aguardar esse retorno e corrigir o que aparecer.

Depois disso, o próximo item da fila é **maestria por continente/região × modo** — mas só mediante pedido. O usuário pede proposta antes de implementação em mudanças estruturais.
