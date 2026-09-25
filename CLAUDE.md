# Meridiano (antes Carta Cega) — contexto do projeto

Jogo de geografia em **pt-BR**, PWA feito em React 19 + Vite + TypeScript + MapLibre GL (mapa vetorial em PMTiles). Projeto pessoal do Enzo, poucos usuários, usado no **celular** (PWA instalado) e no PC. Nome "Meridiano" é provisório; por dentro ainda vale `carta-cega` (banco `carta-cega`, chaves `carta-*`).

Este arquivo descreve o **rebuild** (estado em 24/09/2026). O jogo antigo, um único HTML (`carta-cega-0.13.5.html`), está **congelado**; o `CLAUDE.md` dele foi arquivado em `docs/legado-html-classico.md` (não é contexto de trabalho, mas guarda as regras de conteúdo e os bugs já mapeados). Histórico mais antigo: `historico-carta-cega.txt`.

**Onde fica:** `Desktop\Geo Study - Meridian\carta-cega-rebuild` (git, branch `main`, só local, sem remoto). Ao lado ficam `carta-cega-servidor\` (túnel para testar no celular fora de casa) e `mockups-carta-cega\` (imagens de design).

---

## 1. Rodar, construir e testar

**Para jogar:** dois cliques em `Jogar Meridiano.bat` (pasta acima) ou `Jogar.bat` (raiz do projeto). Ele gera o build, sobe o servidor em `http://localhost:5000` e abre o navegador; se o build falhar, abre a última versão que funcionou. O progresso fica no navegador **por endereço exato**: `localhost:5000` e `127.0.0.1:5000` ou o IP da rede são "sites" diferentes, com dados separados. Não existe mais "um arquivo só": é um app com vários arquivos e um mapa de ~28 MB.

| comando | o que faz |
|---|---|
| `npm run dev` | Vite em dev, porta 5000 (expõe ganchos de debug, ver abaixo) |
| `npm run build` | valida bandeiras, `tsc -b`, `vite build`, confere o manifesto/mapa offline |
| `npm run preview` | serve o `dist/` na porta 5000 |
| `npm run test:<nome>` | testes de domínio (lista na seção 7) |

- **Versionamento é git**, não nome de arquivo. Commits **só quando o Enzo pedir**, um por rodada de mudança (mensagem `tipo(área): resumo`, com a linha de co-autoria pedida pelo ambiente). Não mexer em config global do git.
- **Windows:** vários testes chamam `node_modules/.bin/tsc`, que ali é script de shell. Use `NODE_OPTIONS="-r ./scripts/windows-tsc-shim.cjs" npm run test:xxx` (o shim redireciona para `node node_modules/typescript/bin/tsc`). Scripts npm com `rm -rf` precisam do Git Bash no PATH. Testes de browser (`test:learning:browser`, `test:config-family-isolation`, `smoke`) esperam Chromium em `/repl/tools/bin/chromium`; aqui use `CHROMIUM_PATH` apontando para o Chrome instalado.
- **Verificação padrão de mudança visível:** build de produção + navegador de verdade (painel do Claude, `preview_start` pelo nome `meridiano-dev` ou `meridiano-preview`, configurados em `.claude/launch.json` da raiz e desta pasta) e, para acessibilidade, `axe-core` (`node_modules/axe-core/axe.min.js`; critério: 0 violações). Não basta typecheck.
- **Ferramentas de debug:** abrir com `?debug=1` (fica ligado no navegador até `?debug=0`). Em Opções aparece o painel: jogador novo, zerar histórico/moedas, definir nível, nível das cartas, desbloquear conquistas, adicionar moedas, **"Liberar modos e recortes"** (libera todos os modos e os cortes de rodadas — é o jeito de testar Idiomas, Históricas e "Todas"), paleta do logo, "Restaurar dados reais".
- **Só no `npm run dev`:** `window.__cartaMap` (instância do MapLibre) e `window.__cartaLastAnswer`. Dá para simular clique com `map.fire('click', { point, lngLat })`.
- **Armadilhas ao testar o mapa no painel do Claude:** aba em segundo plano ou painel oculto faz o MapLibre demorar dezenas de segundos para carregar o terreno (só os marcadores aparecem); espere `map.loaded()` e `getLayer('land')` antes de clicar. Clicar antes disso dispara "Mapa indisponível" (ver seção 8). Não reinicie partida dezenas de vezes na mesma aba (contextos WebGL se esgotam): recarregue.
- **Link para o celular fora de casa:** `carta-cega-servidor\iniciar-servidor.bat` (túnel Cloudflare rápido, sem conta; o link muda a cada execução e não tem senha). Usa o `dist/`, então rode `npm run build` antes. O caminho do projeto agora é relativo (`..\carta-cega-rebuild`).

---

## 2. Como trabalhar com o Enzo

- **Proposta antes de implementar** em mudança estrutural. Mensagem sem pedido de execução é brainstorming: avalie e pergunte por onde começar. Quando ele diz "pera aí, não altera nada", é só análise, sem tocar em código.
- Quando ele dá a direção e delega o número ("pensa numa margem boa"), **eu escolho, explico o porquê e ele ajusta** (foi assim com cronômetros, fator do Treino, raridades).
- **Honestidade direta** sobre limites e sobre o que não foi verificado. Conte o que foi de fato testado (build, testes, ao vivo) e o que não foi.
- Responder em pt-BR, conciso. Ele escreve informal e com pressa; erros de digitação são comuns.
- Cuidado com **conquistas e conteúdo desnecessários**: ele prefere curadoria a volume. Quando o conteúdo do jogo cresce, as conquistas precisam acompanhar (foi a crítica de 23/09).
- Ao mudar um número que aparece em texto de tela (percentuais, tempos, totais), procure as strings soltas: vários textos e testes têm o valor escrito à mão.

---

## 3. Arquitetura

### 3.1 Pastas
- `src/app.tsx` — estado global e roteamento por `screen` (`hub`, `recorte`, `game`, `result`, `progress`, `collection`, `achievements`, `history`, `options`, `store`). Escolhe o motor de partida por `family`/`variant`.
- `src/components/` — telas e motores. `src/domain/` — regras puras (sem React), quase todas testadas.
- `public/data/legacy/` — dados do jogo (extraídos do HTML clássico, ver seção 6); `public/maps/` — mapa PMTiles e relatórios; `src/data/small-entity-markers.json` — marcadores dos territórios pequenos (gerado dos tiles).
- `scripts/` — testes (`test-*.mjs`), pipeline de dados e o shim de Windows. `qa/` — matriz visual/funcional responsiva antiga. `historico versoes antigas/` — todos os HTMLs antigos (pesado, ver seção 8). `.tmp-*/` — saídas de teste (ignoradas).

### 3.2 Fluxo de telas
Hub (4 famílias: Mapa, Bandeiras, Capitais, Idiomas; carrossel no celular) → "Configure a partida" (`match-config.tsx`: **Modo, Ritmo, Rodadas, Recorte, Filtro "Só membros da ONU"**) → partida → resultado (`result-screen.tsx`, moedas/XP). Fora da partida: Progresso (Perfil, Maestria, Conquistas, Desempenho), Coleção (Países / Históricas), Conquistas, Loja (temas), Opções (tema, movimento reduzido, barra de tempo, mapa offline, debug). `useLeaveGuard`: sair no meio **não paga moedas nem XP**; com ao menos uma resposta pede confirmação.

### 3.3 Motores de partida (cada família usa um)
| componente | famílias/variantes |
|---|---|
| `map-game.tsx` (`Game`, MapLibre) | `mapa/mapa`, `capitais/capital-pais` (clicar no país) |
| `quiz-game.tsx` (`QuizGame`) | `bandeiras` (`nome-bandeira` e `bandeira-nome`) e `capitais/pais-capital` (4 opções; a resposta certa muda de posição) |
| `special-quiz.tsx` (`SpecialQuiz`) | `historicas`, `idiomas`, `escrita` (digitada) |
| `geometry-games.tsx` (`GeometryGame`) | `silhueta` (4 opções e digitada), `travel` |

Todos usam **baralho finito sem repetição** (`finite-deck.ts`, `roundLimit` do corte; `null` = "Todas"), gravam a sessão por `startLearningSession` (`learning-store.ts`) e calculam moedas em `spoils.ts`. `game-shell.tsx` tem a barra do topo, o log de rodadas e as teclas.

### 3.4 Persistência (tudo local, nada de servidor)
- **IndexedDB `carta-cega` v4** (`storage-schema.ts`): `sessions`, `progress` (uma carta por entidade), `ledger` (livro-caixa; saldo é derivado; crédito de fim de partida tem id `spoils:<sessionId>`), `unlocks` (`familia:variante`, `rounds:20|50|100|all`, `theme:*`), `achievements`, `historicalCollection`, `preferences`, `state`.
- **localStorage:** `carta-theme`, `carta-pace`, `carta-round-tier`, `carta-last-variant:<família>`, `carta-flag-direction`, `carta-reduced-motion`, `carta-timer-late`, `carta-cega:debug`, `carta-cega:logo-palette`.
- **Migração do perfil clássico** (`legacy-migration.ts`): importa `carta-cega.hist.v1`, `.histcol.v1`, `.pref.v1`, `.conq.v1` (versão 2). Ids únicos de migração (`grant:retroactive-v1`, `economy-v2-conversion` com fator 10) não podem ser reaplicados.

### 3.5 PWA e offline
`public/sw.js` (cache `carta-cega-shell-v2`); a lista de precache é **injetada no build** por um plugin em `vite.config.ts` (páginas, JSONs de dados, assets com hash e os dois arquivos do worker do MapLibre, que o Vite não emite e o plugin copia para `dist/assets`). O **mapa não é pré-cacheado**: o jogador baixa em Opções ("Baixar mapa", 27,8 MB) para o OPFS, e o service worker responde a requisições `Range` a partir dele. `MAP_BYTES` e `MAP_VERSION` (hash) existem em `offline-map.ts` **e** em `sw.js` e precisam bater com o `.pmtiles` real (`test:manifest` confere). Trocou o mapa? Atualize os três.

### 3.6 O mapa (`map-game.tsx`)
- Fontes: `atlas` (vetorial, `pmtiles://`, camada `countries`, `promoteId: carta_id`), `small-entities` (marcadores) e `absorbed` (GeoJSON dos territórios absorvidos). Camadas: `bg`, `land`, `absorbed-land`, `pts`/`pts-hit` (entidades ponto), faixas `small-entities-z*` (o marcador some quando o contorno já é visível) e `small-entities-hit`.
- **Resolução do clique:** `resolveAt` → marcador (toque de 14 px, só perto do próprio ponto) ou terreno (primeiro resultado de `queryRenderedFeatures` no ponto) → toque na água vale o território mais perto dentro de 22 px (`nearestWithin`). Erro em km vem de `distanceToGeometriesKm` (0 se caiu dentro do polígono). **`tapAt`: geografia real tem prioridade** — se o clique caiu dentro do polígono do alvo, conta como acerto mesmo que outro polígono tenha renderizado por cima (criado para o Saara Ocidental).
- Cores: alvo revelado `#4fe0a8`, erro `#ee7968`. **Treino** deixa todo alvo perguntado marcado no mapa (acertando ou errando) com o nome, país no modo Mapa e capital no modo Capitais, via `maplibregl.Marker` em HTML: o estilo do mapa **não tem `glyphs`**, então texto nativo do MapLibre não existe. Serve para poucos rótulos; para ~250 seria preciso decluttering à mão ou montar fontes PBF.
- Câmera inicial por recorte em `regions.ts` (`REGION_CAMERA`). Recortes: mundo, caribe, pacífico, europa, áfrica, ásia, américa do sul, américa do norte e central; a seleção pode combinar vários (`normalizeRegionSelection` volta para "mundo" se todos estiverem marcados).
- **Silhueta e Travel não usam os tiles**: a geometria vem de `public/data/legacy-map.json` (TopoJSON do clássico, via `legacy-geometry.ts`).

---

## 4. Regras do jogo vigentes

### 4.1 Modos (o que a tela "Configure a partida" oferece)
| Família | Modo | `family/variant` | Pilar | Cronômetro | Moedas base | Desbloqueio |
|---|---|---|---|---|---|---|
| Mapa | Clicar no mapa | `mapa/mapa` | mapa | 20 s | 48 | grátis |
| Mapa | Silhueta · alternativas | `silhueta/silhueta-opcoes` | mapa | 20 s | 56 | 11.000 |
| Mapa | Silhueta · escrita | `silhueta/silhueta` | mapa | 30 s | 88 | 27.000 |
| Mapa | Travel | `travel/travel` | mapa | 120 s | 64 | 64.000 |
| Bandeiras | Atuais (nome→bandeira ou bandeira→nome) | `bandeiras/nome-bandeira`, `bandeira-nome` | bandeiras | 15 s | 32 | grátis |
| Bandeiras | Escrita | `escrita/escrita-pais` | escrita | 30 s | 80 | 5.000 |
| Bandeiras | Históricas (2 sentidos) | `historicas/nome-historica`, `historica-nome` | — | 20 s | 44 | 36.000 |
| Capitais | Clicar no mapa | `capitais/capital-pais` | capitais | 15 s | 56 | grátis |
| Capitais | Escrita | `escrita/escrita-capital` | escrita | 30 s | 96 | 15.000 |
| Idiomas | Nome do idioma | `idiomas/idioma-nome` | — | 15 s | 40 | 40.000 |
| Idiomas | Países do idioma | `idiomas/idioma-pais` | — | 20 s | 44 | 48.000 |

`capitais/pais-capital` (4 opções) existe no código e nos testes, mas **não está no menu**. Pilares (`pillars.ts`): mapa = mapa+silhueta+travel; escrita é validador à parte; históricas e idiomas não entram em pilar.

### 4.2 Ritmo e economia (`pace.ts`, `spoils.ts`, `economy-rules.ts`)
- **Partida** (com cronômetro; tempos da tabela, recalibrados em 22/09 pela dificuldade de leitura/reconhecimento — 15 s alternativas curtas e capital-pais, 20 s mapa/históricas/silhueta-opções/países do idioma, 30 s digitar, 120 s Travel; acabou o tempo, conta como erro) e **Treino** (sem cronômetro, paga **50%** de tudo e marca os alvos no mapa nos modos de clique).
- **Rodadas:** 10 grátis; 20, 50, 100 custam 3.000 / 8.000 / 20.000 e "Todas" 85.000 (comprar um corte inclui os menores; o rótulo "Todas · N" cobra o **menor corte que cobre** o recorte). Vale para todos os modos, para sempre. Travel usa metade dos cortes.
- **Moedas por acerto** = base × dificuldade do país (1 / 1,12 / 1,25 por população e área; menos de 1.000 km² é sempre o terço difícil). **Sequência:** +3% do valor por acerto seguido, teto +75%. **Partida completa:** 14 / 9 / 5 moedas por rodada com 90 / 75 / 60% de acerto. **Carta nova** 60, **carta que subiu de nível** 30. Tudo multiplicado por 0,5 no Treino. Partida abandonada não paga nada.
- **XP:** só de partida completa; 1 por rodada + 25 por país dominado (as 3 últimas respostas certas em pelo menos 2 colunas/modos diferentes). Nível N+1 começa em 50·N·(N+1) XP.
- Modos só custam moedas (desde a economia v2). Temas na Loja: 10 no total, o padrão "Pigmentos" grátis, os outros de 6.000 a 18.000.
- **Cartas** (Coleção): maestria 0–5 por país = quantos modos (colunas bandeiras/mapa/capitais/escrita) já foram acertados; 5 exige os 4 modos com escrita ≥ 2 e capitais ≥ 2. Coleção histórica é separada e mais simples (`historicalCollection`).
- **Conquistas: 49** em 6 categorias — Habilidade 8, Exploração 5, Conhecimento 12, Evolução 5, Domínio 16, Descoberta 3 (ocultas). Raridade 1–5. Padrão de escada: `seq10/seq25`, `dom50/dom150`, `silhueta50/150`, `historicas50/150`. Para cada um de Mapa, Capitais e Bandeiras há uma escada "recorte sem falhas": **1 recorte regional** (Rara) → **3 das 5 zonas** (Épica) → **os 7 recortes** (Lendária); Idiomas tem só duas; "Três pilares, zero falhas" exige os três de uma vez. "Perfeito" significa **baralho inteiro (`roundLimit === null`) com 100%**, um recorte só (Mundo e seleção combinada não contam); partidas migradas sem `roundLimit` nunca contam. Zonas: Américas = Caribe + América do Sul + América do Norte e Central; África; Ásia; Europa; Oceania = Pacífico.

---

## 5. Decisões que não devem ser quebradas

1. **Históricas e Idiomas ficam fora de `meta`** e têm dados próprios; assim as contagens do jogo (255 encontráveis, 250 no mapa, 195 com ONU) não inflam.
2. **A ficha durante a partida é completa**; a progressão vive na Coleção.
3. **Treino não é um terceiro "ritmo" para consulta.** Não criar novo valor de `Pace` para modos de estudo: `Pace` está costurado na economia (moedas, XP, sessão, resultado). Recurso de estudo entra como controle separado.
4. Mapa e Capitais: **geografia real do alvo vence o polígono que renderizou por cima** (regra do `tapAt`). Toque na água cai no território mais perto.
5. O baralho nunca repete dentro da partida; sair do meio não paga; "Todas" é `roundLimit: null`.
6. **Não reintroduzir LOD** (duas resoluções de geometria trocando em runtime): foi tentado e removido duas vezes no clássico por peso.
7. Só conteúdo de fonte verificável e sem direito autoral vigente (ver seção 6). Conteúdo novo é verificado por busca, não de memória.
8. Conquistas: cada uma precisa medir algo distinto; conteúdo novo do jogo pede conquista correspondente, sem duplicar padrão.

---

## 6. Dados e regras de conteúdo

- `public/data/legacy/`: `catalog.json` (**262 entidades** em `meta`, 255 não absorvidas, 250 em `mapEntityIds`, 193 ONU + Vaticano e Palestina no filtro; campo `ll` é `[lat, lon]`), `flags.json`, `historical.json` (**200** entidades) + `historical-flags.json`, `languages.json` (**123** idiomas, cobrindo os 194 países independentes), `manifest.json` (hashes). Origem: extraídos do HTML 0.13.5 (`npm run extract:legacy-game`, `extract:legacy`), por isso `carta-cega-0.13.5.html` **precisa ficar na raiz**.
- **Sinalizadores em `meta`:** `absorvido`+`mapaPara` (7: Guadalupe, Martinica, Reunião, Svalbard, Bouvet, Ilhas Menores dos EUA, Heard e McDonald — nunca são alvo, o clique vale pelo soberano), `soBandeira` (União Europeia), `mapa:false` (Reino Unido, Abcásia, Ossétia do Sul, Território Antártico Britânico), `substitui` (as 4 nações do Reino Unido), `un`, `ratio` (proporção real da bandeira).
- **Idiomas:** `scripts/data/languages-*.json` → `node scripts/merge-languages.mjs` funde em `languages.json` sem duplicar (rode **depois** de `extract:legacy-game`, que regrava só os 36 do clássico). Os arquivos `languages-europa-asia.json` e `languages-resto.json` são **gerados** por `scripts/data/_gen-europa-asia.mjs` e `_gen-resto.mjs` (rodar nessa ordem, depois o merge); reg/sub vêm do catálogo. Cada entrada é uma frase em escrita nativa de **fonte verificável** (provérbio tradicional, lema nacional ou princípio oficial), com a fonte na ficha. **Nunca de memória:** conferir em fonte aberta e desconfiar de "sabedoria" popular (o "ama sua, ama llulla, ama quella" não é código inca autêntico; entrou como princípio da Constituição da Bolívia, art. 8º, com aviso). `falantes` e `ranking` são **opcionais**: só entram se confirmados (o Ethnologue 200 está bloqueado a scripts; a Wikipédia só traz ≥ 50 milhões).
  - **Regra de cobertura:** todo país independente aparece em `paises` (mostrado nas alternativas do quiz "Países do idioma") ou em `tambem` (só no cartão, "Também oficial em"). `tambem` é usado para línguas compartilhadas (árabe, inglês, francês, espanhol, português) cujos países não têm idioma local verificado; **substituir por um idioma local** quando houver fonte. Conferir a cobertura comparando `catalog.json` (`ind: true`, 194) com `paises`+`tambem`.
  - Idiomas de quase todas as Américas/Oceania usavam a frase padrão do art. 1º da DUDH; 14 foram trocados por provérbios/lemas verificados, **25 ainda usam a DUDH** (Cherokee, Inuktitut, Cree, Groenlandês, Maia, Purépecha, K'iche', Q'eqchi', Miskito, Garífuna, Wayuu, Ticuna, Shipibo, Santa Lúcia, Papiamento, Taitiano, Maori de Cook, Niueano, Tok Pisin, Pijin, Chamorro, Palauano, Pohnpeiano, Chuukês, Yapês): não houve fonte com grafia nativa conferível.
- **Históricas:** `id` próprio, `ini/fim` fechados, `fonte` com arquivo e licença da Commons. Critérios de entrada: identidade política distinta e extinta, bandeira documentada (não reconstrução moderna), leve, e diferente de qualquer bandeira já no jogo (comparar paleta contra as 200 históricas e os 262 atuais). Dos 200, ~145 estão sem `cap`/`fato`/`sucessor`.
- **Bandeiras:** ~29 vieram esticadas para 4:3 sem letterbox (Áustria, Brasil, Espanha, Suíça etc.): pendência de dado, exige proporção real de fonte confiável. O Afeganistão usa a bandeira do Talibã por decisão do Enzo (24/08).
- **Mapa:** `carta-boundary-candidate.pmtiles` = **229 geoBoundaries + 21 fallbacks legados** = 250 jogáveis (auditoria em `public/maps/carta-boundary-candidate.audit.md`). Regenerar (`build:map-candidate`) exige `tippecanoe` e rede — **não há tippecanoe nem WSL nesta máquina**; foi feito no Replit. Territórios pequenos (43 de 45) foram re-sourceados do OpenStreetMap no clássico e viraram os fallbacks.

---

## 7. Testes e estado (24/09/2026)

- `tsc -b` limpo; `npm run build` ok (`dist/` gerado hoje).
- **28 dos 31 testes de domínio passam.** Falham só por limite do Windows: `test:regions` (criar symlink dá EPERM), `test:map-round-engine` e `test:answer-options` (usam `file:///tmp/...`; corrigível trocando por `os.tmpdir()`). Não rodam aqui: os 3 de browser (precisam de `CHROMIUM_PATH`).
- Cobertura: regras de domínio (economia, spoils, pace, conquistas, decks, migração, geometria, mapa, temas). **Não há teste de componente React**; o comportamento de tela é conferido no navegador.
- Testes com números escritos à mão que quebram quando o balanceamento muda: `test-spoils.mjs`, `test-match-config.mjs`, `test-achievements.mjs` (lista de ids e total).

---

## 8. Pendências e problemas conhecidos

- **Working tree sem commit** (último commit `9f3b2be`, 21/09): clique Marrocos/Saara, Treino marcando nomes e pagando 50%, cronômetros novos, conquistas 30→49 (`roundLimit` exposto em `progress-surfaces.ts`), testes, shim do Windows, `Jogar.bat`, `.gitattributes` (`*.bat` em CRLF), este documento e `docs/`. Commitar só quando o Enzo pedir; sugestão: separar por tema.
- **Saara Ocidental sob o Marrocos é problema do dado:** o polígono `504` (geoBoundaries) inclui a área reivindicada e o `732` é fallback legado. O `tapAt` só corrige o **clique**; o Saara continua visualmente encoberto, e com alvo Marrocos tocar no Saara provavelmente conta como acerto. Conserto de verdade: recortar o 504 pelo 732 na geração do mapa (precisa de tippecanoe) ou desenhar o 732 por cima com uma camada GeoJSON. O `ll` do 732 cai fora do próprio polígono (não é a causa).
- **"Mapa indisponível" é fatal por qualquer erro:** `map.on("error")` grava `mapError`, e um clique antes de o estilo carregar ("layer 'land' does not exist") derruba a tela até recarregar. Real para dedo rápido em rede lenta; falta guardar `resolveAt` com `isStyleLoaded()`/`mapReady`.
- **Travel diverge do clássico:** no rebuild a rota é digitada **na ordem**, com 10 tentativas e 3 pistas (a pista revela o próximo país) e 120 s por rota; o clássico aceitava qualquer ordem, dava feedback em 4 níveis e revelava a rota no mapa. Não foi decisão registrada — confirmar com o Enzo antes de mexer.
- `evaluateAchievementsOnLifecycle` não recebe o catálogo: conquistas que dependem dele (`micro`, `continenteInteiro`, `confins`) só avaliam certo na tela de Conquistas.
- **Repo pesado:** `.git` ~263 MB e `historico versoes antigas/` (~950 MB no disco, 38 de 44 arquivos versionados). Candidatos a limpeza, **nada apagado**: essa pasta, `zipFile.zip` (54 MB, export do Replit), `attached_assets/`, `screenshots/`, `.replit`, `replit.md`, `.agents/`, `carta-cega-rebuild-mudancas/` (pacote do Replit, obsoleto). `.claude/scheduled_tasks.lock` está versionado por engano.
- Dados herdados: 29 bandeiras esticadas; ~145 históricas sem `cap/fato/sucessor`; `bandeiras-historicas-candidatos.md` desatualizado; **fontes de escrita nativa (Idiomas) nunca validadas em celular real** (pode aparecer caixinha vazia sem a fonte do sistema).
- Não validado em celular real: hub, coleção, cartas e o fluxo configurar→jogar do rebuild inteiro.

---

## 9. Backlog e ideias (nada disso foi iniciado)

- **Login (Google) e sincronização entre aparelhos** — só para o rebuild. Hoje tudo é local. Registros têm id único e só se acrescentam, então sincronizar tende a ser **união por id**; preferências, vale a última. Propostas: jogo continua funcionando sem conta e offline; primeiro login une tudo sem dobrar ids de migração; moedas/XP calculados no aparelho (dá para trapacear, aceito para uso pessoal); Node + SQLite + Google Identity Services em Docker; hospedagem no próprio PC/VPS por **túnel Cloudflare nomeado** (login Google exige endereço fixo → domínio próprio, ~R$ 40–60/ano). Ordem combinada: estabilizar → montar servidor → só depois segurança (nada de senha caseira, sempre HTTPS, servidor nunca exposto direto).
- **Mapa de consulta (estudo, sem quiz):** ver o mundo com país e capital escritos, sem pontuação, tocar abre a ficha; entrada na tela de configuração dos modos Mapa e Capitais **como botão separado, não como valor de Ritmo** (decisão 3). Precisa de zoom progressivo (no mundo só os grandes mostram texto). Depende de escolher entre rótulos em HTML com decluttering escrito à mão (sem peça nova) ou montar fontes PBF para o MapLibre (nativo, com arquivos novos e offline).
- **Modo "só os errados"**, **estados não reconhecidos** (Chipre do Norte, Somalilândia, Catalunha etc., quase sem arte), **Saba**, **"nível como cobertura"** (XP só por descoberta inédita; discutido, não aprovado).
- **Engavetado por decisão do Enzo:** ranking/desafios entre pessoas (o jogo mede conhecimento, não velocidade; vale também para recorde local) e **interface em inglês** (não existe camada de i18n; seria iniciativa própria grande). Isto **substitui** o "economia descartada" do clássico: a economia existe e está em uso.
- Idiomas: trocar os 25 que ainda usam a DUDH e os países só em `tambem` por idioma local com fonte (Somali, Kirundi, Kinyarwanda tonal, Tétum, crioulos de Cabo Verde e Guiné-Bissau, línguas do Sahel e árabe dialetal são os candidatos), escrita mongol tradicional só com suporte a texto vertical, e um sentido invertido ("frase → nome") pede outro layout.
