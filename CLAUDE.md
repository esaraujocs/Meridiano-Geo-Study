# Meridiano (antes Carta Cega) — contexto do projeto

Jogo de geografia em **pt-BR** (interface também em inglês e espanhol), PWA em React 19 + Vite + TypeScript + MapLibre GL (mapas vetoriais em PMTiles). Projeto pessoal do Enzo, poucos usuários, jogado no **celular** (PWA instalado) e no PC. "Meridiano" é o nome; por dentro ainda vale `carta-cega` (banco `carta-cega`, chaves `carta-*`).

**Como este arquivo funciona:** aqui fica o que é preciso para trabalhar (rodar, publicar, onde está cada coisa, regras, armadilhas, como estender). **O histórico de cada rodada** (o que foi pedido e quando, por que se decidiu assim, os números das simulações e o que foi verificado) está em **`docs/historico-desenvolvimento.md`**, com as mesmas seções numeradas: consulte lá antes de mexer num sistema cujo porquê não está claro aqui. Rodada nova: o essencial entra aqui (curto), o detalhe vai para o fim do histórico. O jogo antigo (um HTML, `carta-cega-0.13.5.html`, congelado e necessário na raiz para a extração de dados) está em `docs/legado-html-classico.md`.

**Onde fica:** `Desktop\Geo Study - Meridian\carta-cega-rebuild` (git, branch `main`, remoto privado `origin` → `github.com/esaraujocs/Meridiano-Geo-Study`). Ao lado: `carta-cega-servidor\` (o servidor que publica), `mockups-carta-cega\` (mocks; cada rodada de design tem uma pasta) e `fontes\` (fontes de dados baixadas, com LEIA-ME).

---

## 1. Rodar, publicar e testar

### Publicação (o que está no ar)
- **O site ao vivo é a porta 5000**: `carta-cega-servidor\iniciar-servidor.bat` (→ `servidor.mjs`) sobe o `vite preview` com a pasta do projeto como `cwd`, ou seja, **serve o `dist/` do próprio repositório**. O Tailscale Funnel publica a 5000 em `https://meridiangeostudy.tail9f8a35.ts.net` (precisa do PC ligado e do Tailscale logado; "não abre" quase sempre é o servidor da 5000 caído). Plano B: `node servidor.mjs --cloudflare` (link novo = origem nova = progresso vazio).
- **Nunca reinicie nem ocupe a porta 5000** (nem com servidor de desenvolvimento): quem reinicia é o Enzo. Mudança só no front não precisa reiniciar (o `vite preview` serve o `dist/` novo); mudança em `server/` ou `vite.config.ts` só vale depois de ele reiniciar — avise.
- **Publicar por padrão ao fechar uma rodada** (auto-commit autorizado): commit por tema (`tipo(área): resumo` + a linha de co-autoria pedida pelo ambiente), identidade só por variáveis de ambiente (`GIT_AUTHOR_NAME="Enzo" GIT_AUTHOR_EMAIL="pratesbaliza@gmail.com"`, idem `GIT_COMMITTER_*`; **nunca** mexer na config global do git), e então:
  `git push -q origin main && rm -rf dist.bak && cp -r dist dist.bak && NODE_OPTIONS="-r ./scripts/windows-tsc-shim.cjs" npm run -s build && git rev-parse --short HEAD > dist/dist-commit.txt && curl -s http://127.0.0.1:5000/dist-commit.txt`
- **`npm run build` publica na hora** o que estiver na árvore. Para só conferir que o build fecha: `tsc -b` e `npx vite build --outDir .tmp-build --emptyOutDir` (apague depois; `test:manifest` lê o `dist/` e só roda no build de verdade).
- `servidor.mjs` (fora do git) se atualiza sozinho ao iniciar (`git pull --ff-only` se a árvore estiver limpa, reinstala dependências se o `package.json` mudou — o lockfile aponta para o registro do Replit, cai em `npm install --no-save`; regenerar o lockfile só com o ok do Enzo —, builda com volta ao `dist/` anterior se falhar, reinicia só se `server/` ou `vite.config.ts` mudou) e copia `.pvp-data` para `carta-cega-servidor\backups\` ao iniciar e a cada 6 h (14 cópias).
- O progresso no navegador é **por origem exata** (`localhost:5000` ≠ `127.0.0.1:5000` ≠ IP da rede).

### Desenvolvimento
- **Servidor de desenvolvimento: `preview_start` com `meridiano-hub-5101`** (do `.claude/launch.json` da pasta de cima; porta 5101, `PVP_DATA_DIR` de teste). Os outros nomes de lá: `meridiano-dev-5174`, `meridiano-dist-5103` (preview do `dist/`). **Não use `meridiano-dev`/`meridiano-preview`: apontam para a 5000.**
- Comandos: `npm run dev`, `npm run build` (valida bandeiras, `tsc -b`, `vite build`, confere manifesto/mapa offline), `npm run test:<nome>`.
- **Windows:** testes que chamam `node_modules/.bin/tsc` pedem `NODE_OPTIONS="-r ./scripts/windows-tsc-shim.cjs"`; scripts com `rm -rf` pedem o Git Bash; testes de navegador do repo esperam Chromium em `/repl/tools/bin/chromium` (use `CHROMIUM_PATH` com o Chrome instalado). Scripts Python com aspas: escreva o arquivo (no scratchpad) e rode `python -X utf8`, heredoc do Git Bash quebra com apóstrofo. Depois de gravar arquivos por Python o Vite às vezes serve a versão vazia: `touch` neles.
- **Testes no Chrome automatizado:** os roteiros de conferência ficam em `.tmp-hub/` (fora do git), com `puppeteer-core` e o Chrome instalado, contra a 5101, usando o **perfil real do Enzo** `.tmp-hub/real2.json` (importado com `parseBackup`/`importProgress` de `/src/domain/progress-backup.ts`; `unlockAllModes` de `/src/domain/debug-tools.ts` libera tudo). Para abrir um modo: clicar no `.hx-hit` do cartão visível (`.hx-slide:not([inert])`, avançando com `.hx-arrow.is-next`), escolher na Mesa pelo texto do botão e "Começar". Clique **sem coordenadas** (`element.click()`) no carrossel conta como clique no vizinho: use clique de verdade. Mudar `isMobile` no `setViewport` recarrega a página. Acessibilidade: `axe-core` (`node_modules/axe-core/axe.min.js`, `axe.run(document.body)`), critério **0 violações**. Mudança visível se confere no navegador, não só no typecheck.
- **Debug:** `?debug=1` (fica até `?debug=0`) mostra o painel nas Opções (jogador novo, moedas, níveis, "Liberar modos e recortes"…) e `__cartaDuelResult("t4")` no console (cenários em `duel-preview.ts`). Só no `npm run dev`: `window.__cartaMap` (a instância do MapLibre; `map.fire('click', {point, lngLat})`), `window.__cartaLastAnswer`, e `data-target-id`/`data-option-id` nas telas de partida.
- **Mapa no navegador automatizado:** aba em segundo plano demora dezenas de segundos para o terreno; espere `map.loaded()` e `getLayer('land')` antes de clicar (clicar antes dá "Mapa indisponível"). Não reinicie partida dezenas de vezes na mesma aba (contextos WebGL se esgotam). Chrome headless: `--use-angle=swiftshader --enable-unsafe-swiftshader`.

---

## 2. Como trabalhar com o Enzo

- **Proposta antes de implementar** mudança estrutural; mensagem sem pedido de execução é brainstorming (avalie e pergunte por onde começar); "pera aí, não altera nada" = só análise. Mudança visual grande: mock primeiro (em `../mockups-carta-cega/<rodada>/`, com fotos geradas por script), aprovado o mock implemente direto.
- Quando ele delega um número ("pensa numa margem boa"), **eu escolho, explico o porquê e ele ajusta**.
- **Honestidade direta** sobre limites e sobre o que não foi verificado (diga o que foi testado: build, testes, navegador, celular de verdade).
- Responder em pt-BR, conciso; ele escreve informal e com pressa. Avisar escolhas discutíveis antes de um passo caro; questionar pedido grande demais; evitar retrabalho; não refinar o que não muda a partida.
- Curadoria acima de volume (conteúdo e conquistas); conteúdo novo pede conquista correspondente quando fizer sentido.
- **Texto de tela existe em três idiomas:** mudou em `pt.ts`, mude em `en.ts` e `es.ts` (o `tsc` só acusa chave faltando); texto novo nunca direto no componente. Ao mudar um número que aparece em texto (tempos, preços, totais), procure as strings e os testes que o têm escrito à mão.
- Downloads de pacotes de países pelas fontes que o pipeline já usa estão pré-autorizados (até 500 MB por país, avisar depois); fonte nova ou maior, perguntar antes.

---

## 3. Arquitetura

### 3.1 Pastas
- `src/app.tsx` — estado global e roteamento por `screen` (`hub`, `recorte`/Mesa, `game`, `result`, `progress`, `collection`, `achievements`, `options`, `store`, `league`, `mecenato`, `explore`, `challenges`, `friends`, `player`, telas do PvP…); escolhe o motor por `family`/`variant`.
- `src/components/` — telas e motores. `src/domain/` — regras puras (sem React), quase todas com teste em `scripts/test-*.mjs` (compilados isolados por `tsc --outDir`, por isso os imports `.js`). `src/domain/i18n/` — textos e a sobreposição do conteúdo traduzido.
- CSS: `index.css`, `hub.css`, `store.css`, `mesa.css`, `explore.css`, `challenges.css`, `profile.css`, depois `themes.css`, `themes-league.css`, `themes-dark.css`, `themes-elaborate.css` e por último `landscape.css` (ordem no `main.tsx`; `mecenato.css` é importado no `app.tsx`).
- `server/` — o servidor embutido no Vite (PvP, contas, sincronização). `public/data/` — dados do jogo; `public/maps/` — mapas PMTiles e ladrilhos; `scripts/` — testes e pipelines (`map-hd/`, `divisions/`, `i18n/`, `data/`, `map-base/`, `flags/`, `theme-art/`). `build/` (fora do git, ~13 GB) — intermediários dos pipelines de mapa. `.tmp-*/` — saídas de teste (ignoradas).

### 3.2 Telas, Hub, Loja e Mesa
- **Fluxo:** Hub → Mesa ("Configure a partida": Modo, Ritmo, Rodadas, Recorte, filtro "Só países") → partida → resultado (moedas/XP). Fora: Progresso, Coleção (Países/Históricas), Conquistas, Loja, Mecenato, Liga, Opções, Amigos. `useLeaveGuard`: sair no meio não paga moedas nem XP; com uma resposta pede confirmação.
- **Hub** (`screens.tsx`, `hub-parts.tsx`, `hub.css`). Desktop: cabeçalho em peças (jogador com anel de nível, título que encolhe para caber — `HubTitle` —, fichas do progresso; carteira com moedas, partidas · rodadas, Amigos e engrenagem), a **faixa dos modos** (carrossel `HubCarousel`: 6 cartões — Mapa, Bandeiras, Capitais, Idiomas povos e moedas, Estados e províncias, Mapas históricos —, cada cartão existe uma vez e é posto por uma posição contínua com aritmética modular; arrasta com mouse/dedo, roda do trackpad, setas, teclas; só os cartões inteiros na janela são interativos, os outros `inert`; memória do carrossel em `carouselMemory`; o fim do toque é ouvido na janela para nunca parar entre cartões) e embaixo **Duelo | Desafios | Mecenato · Vitrine** (`HubDuel`, `HubChallenges`, `HubTurns`: Mecenato e Vitrine revezam a cada 14 s; a Vitrine mostra só suprimentos, `SUPPLY_GRID_SETS`). O conteúdo do cartão de modo é medido em `cqw` e o título tem 2 linhas fixas para o ícone ficar na mesma altura. Largura máxima ~1200 px, cabe sem rolar de 1440×900 a 1920×1080. **Variações guardadas** (trocar sem publicar): `?hub=coluna|faixa|cabecalho|faixa4` e `?colunas=iguais|largas|antigas` (gravados em `carta-hub-layout`/`carta-hub-colunas`; padrões `HUB_LAYOUT_DEFAULT`, `HUB_COLUMNS_DEFAULT`). **Celular (≤760 px):** uma coluna, um modo por vez no carrossel, Duelo e Desafios lado a lado compactos (troca de escada com um toque), barra de baixo com 5 destinos e anéis de progresso; conferência automática em `scripts/check-hub-mobile.mjs` (5 tamanhos de telefone, toques de verdade).
- **Loja** (`store-view.tsx`, `store.css`, `domain/store-catalog.ts`): destaque (`pickShowcaseTheme`), abas Tudo/Temas/Modos/Rodadas/Suprimentos/Ligas, sugestões, seções; toda compra passa pela confirmação `PurchaseDialog`; temas podem ser **experimentados** até sair do resultado da próxima partida (`tryTheme`/`trial`). Prévias dos temas: `node scripts/build-theme-previews.mjs` (app em dev na 5101; rode de novo quando o Hub ou um tema mudar; `ONLY=<id>`).
- **Mesa** (`match-config.tsx`, `mesa.css`): só os modos da família aberta, abre com a última partida do modo montada (`replayableConfig` + `applyPreset`), estatísticas do modo num menu (`mode-panels.tsx`, `domain/mode-stats.ts`), Favoritas no rodapé, `ScreenBar` no topo. Família sem modo grátis abre com qualquer modo comprado. Armadilha: em temas com camadas sobre o cartão, `.family-visual`/`.family-copy` precisam de `pointer-events:none`.
- **Toast do Mecenato** (`mecenato-toast.tsx`) avisa a volta de expedição fora da partida; **pop-up de conta** (`account-nudge.tsx`) para quem não tem conta (não aparece em dev, `?debug=1`, convite de duelo nem navegador automatizado; `?nudge=1` força).

### 3.2b Favoritas
`preset-bar.tsx`, regras em `domain/presets.ts` (`test:presets`), gravadas em `preferences` (`preset:<id>`, entram no backup): até 5 por família, uma ★ (só ordena), nome automático reconhecido em qualquer idioma (`isAutoName`/`presetLabel`). Última configuração por modo: `carta-last-config:<modo>` (`parseLastConfig`).

### 3.2c Idiomas da interface
- Opções → Idioma grava `carta-locale` e **recarrega**; primeira abertura segue o aparelho. `LOCALE_RELEASED` em `locale.ts` desliga.
- Textos: `src/domain/i18n/pt.ts` (fonte, tipo `Messages`), `en.ts`, `es.ts`; uso `t.secao.chave`; `formatNumber`/`compareText`/`intlLocale`. **Nunca compare texto traduzido para decidir lógica.** Ficam em português de propósito: o painel de debug, o nome do PWA e o `<title>` estático.
- Conteúdo: `public/data/i18n/{en,es}/{catalog,historical,languages}.json` sobrepostos ao acervo na carga (`i18n/content.ts`); `npm run build:i18n` (`scripts/i18n/build-i18n.mjs`, sem rede) junta Wikidata (`fetch-wikidata.mjs`), `names-overrides.json`, `terms.json`, `facts/`, históricas e idiomas, e tira apelidos ambíguos. Cuidado: o `build-i18n` regrava o `languages.json` com "Holanda" sem tradução (aviso antigo): não commitar essa mudança. Novo idioma: `xx.ts` + `LOCALES`/`LOCALE_NAMES`/`INTL_LOCALE`/`MESSAGES` + uma coluna no `build-i18n`.

### 3.2d Duelo, ligas e bots
- **Formato:** 2 tempos de 10 rodadas, Mundo, sem filtro, com tempo; cada tempo é uma sessão normal de um motor num grupo de modos de **eixo diferente** do outro (`drawLegs`/`drawPvpGroups` em `duel-modes.ts`, com pesos: Silhueta 0,25, Capitais 0,5). Escadas: **Mapas** (Clicar no mapa, Capitais clicar/escrita, Silhueta opções/escrita) e **Bandeiras** (Atuais, Escrita país, Históricas). Travel e Idiomas fora. Exige o corte de 20 rodadas. O id do duelo é a semente de tudo (grupos, sentido, baralho via `deckSeedFor`, bot). Modo de prévia (não comprado) é jogado mas paga como o modo base (`coinVariant`).
- **Andamento** (`duel-run.ts`, `app.tsx`): revelação → tempo → intervalo de 5 s → tempo → resultado. O tempo **nunca pausa** no duelo; depois de "Começar duelo", sair é derrota (`quitLeg` grava o que foi respondido, `forfeit`), sem recomeçar. `useEnterKey` ignora o Enter dos primeiros 0,7 s.
- **Placar e troféus** (`mmr.ts`): mais acertos vence, empate no menor tempo. Vitória 33 (+desempenho até 8, +3 por vitória seguida até 12, teto 50), derrota 27, até o Diamante; acima a curva se fecha (sem teto no Mestre/Grão-Mestre). **MMR escondido por escada com incerteza** (sigma, como Glicko) e **surpresa** dos últimos 10 duelos; matchmaking `matchRating` (nunca abaixo da liga, até 2 ligas acima); bônus por adversário acima (`leadOf`, curva até +20) e corte por adversário abaixo (`trailOf`, até ×0,2 em 400). **Tudo derivado do histórico** (`duel:<id>` em `preferences` com `ladder`, `legs`, `mmrDelta`, `mmrVersion`): **mudou a fórmula do MMR, suba `MMR_MODEL`**. Simulador: `node scripts/sim-trophies.mjs`.
- **Ligas** (`league.ts`): Bronze a Diamante com divisões I–III de 167, Mestre 2.500–2.999, **Grão-Mestre ≥ 3.000** (sem divisões nem teto). Marcos (`duel-rewards.ts`): +2.500 por divisão nova em cada escada e 10 mil a 300 mil por liga nova (uma vez; valor que sobe paga a diferença, `milestoneTopUps`).
- **Bots** (`bots.ts`): **16 por liga (112)**, ids estáveis (`bot-<liga>-<n>`), nomes de vários tipos; cada um tem **força própria** (`skill`, na escala de `baseAtRating`, contínua até `RATING_TOP` 4.000) e um **jeito** (constante, preciso, rápido, irregular, especialista, regional, aquecimento, fôlego, chutador, metódico; `roundShape`). Nos modos digitados o tempo do bot sai do **tamanho da resposta** (`typingMs`), no mapa do **fator do lugar** (`mapSpot`, gerado por `scripts/build-map-spots.mjs`), nunca abaixo do **piso humano** (`HUMAN_FLOOR`) nem acima do cronômetro; **forma do dia** (`FORM_SD`). Promovidos à mão: `PROMOTED`.
- **Ranking dos bots** (`bot-ranking.ts`, `bot-ranking-store.ts`, em `preferences`): cada dia UTC perdido simula um duelo de verdade por bot e escada contra outro bot do ranking (`botDuel`, `rankedOpponent`), e a escala é ancorada pela força (`RANK_PULL`); **o adversário da pessoa é um bot do ranking** com a própria força (`rankedOpponent`, 3 mais perto do alvo). Mudou bots ou forças: suba `BOT_RANKING_CALIBRATION` (recalibra uma vez ao abrir). O ranking do jogador mistura bots e pessoas do servidor (`leaderboard.ts`).
- **Ajustes da conta:** linhas `ladder-adjust:<id>` (`ACCOUNT_ADJUSTMENTS` em `duel.ts`, conta por hash) e `CEILING_FIX` (correção única do teto em 19/10/2026, aplicada na soma do histórico).
- **Telas:** revelação (`duel-reveal.tsx`), intervalo, resultado (`duel-result.tsx`, festa por `resultPlan` em `duel-view.ts`), Liga (`league-screen.tsx`, uma aba por escada, "Ver mais", "Só jogadores"); o histórico mostra o duelo como **uma linha** (`buildDuelRows`). **Temas de liga:** só o da Prata existe (dado ao entrar na liga, `claimLeagueThemes`, nunca à venda; os de cima devem ser mais prestigiosos).

### 3.2e Duelo entre pessoas, amigos e conta
- **Servidor embutido no Vite** (`server/pvp-plugin.mjs`; funciona em dev, build e preview): salas, fila, amigos, contas e sincronização em memória + `.pvp-data/` (fora do git; `PVP_DATA_DIR` troca a pasta). Rotas em `/api/pvp/*` (cabeçalho de `pvp-http.ts`). Canal do jogador por SSE (`/me/events`): online, avisos da fila, amigos, conta.
- **Identidade:** id + segredo por aparelho; **conta** com usuário e senha (`scrypt`, `pvp-accounts.ts`), um segredo novo por aparelho que entra, trocar a senha derruba os outros; travas por senha errada; sem recuperação por e-mail.
- **Sala** (`domain/pvp.ts`, `server/pvp-rooms.ts`): o servidor sorteia os 2 grupos (eixos diferentes; no amistoso o anfitrião pode escolher), cada um joga no próprio ritmo e relata as rodadas (o servidor não confere a resposta). Queda tolerada 30 s. **Fila** (`server/pvp-queue.ts`): par exato primeiro, senão proposta de troca de escada/modo; dá para duelar contra bot enquanto espera (se aparecer gente, aceitar anula o duelo contra o bot). **Valendo** mexe nos mesmos troféus da escada (`settlePvpTrophies`, calculado no aparelho); amistoso paga moedas e não mexe em troféu. Amigos por código de 6 letras (`pvp-friends.ts`), perfil (`player-profile.tsx`). Esconder contas de teste do ranking: `node scripts/pvp-ranking.mjs hide|show`.
- **Conta ao vivo** (`domain/account-sync.ts`, `account-sync-engine.ts`, `account-sync-client.ts`, `account-live.ts`, `server/pvp-account-data.ts`): o servidor é a fonte da verdade e o aparelho é o cache. Toda escrita local agenda uma sincronização; linhas se juntam por id (com carimbo nas que mudam, `rowStamp`), contadores (`progress`, estoque) por **delta** com número de envio; `state` não sincroniza. Duelo valendo e compras pedem conexão (reserva da conta, `/me/lease`). A linha Conta nas Opções mostra o estado (sem botão de sincronizar).

### 3.3 Motores de partida
| componente | famílias/variantes |
|---|---|
| `map-game.tsx` (`Game`) | `mapa/mapa`, `capitais/capital-pais` e os tabuleiros (`board`) |
| `quiz-game.tsx` (`QuizGame`) | `bandeiras` (dois sentidos), `capitais/pais-capital` (fora do menu), Gentílicos e Moedas |
| `special-quiz.tsx` (`SpecialQuiz`) | `historicas`, `idiomas`, `escrita` |
| `geometry-games.tsx` (`GeometryGame`) | `silhueta` (opções e escrita), `travel` |
- Todos usam **baralho finito sem repetição** (`finite-deck.ts`, `roundLimit`; `null` = "Todas"), gravam por `startLearningSession` (`learning-store.ts`) e calculam moedas em `spoils.ts`; `game-shell.tsx` tem a barra do topo, a hotbar dos suprimentos (`SupplyTray`), o Continuar e as teclas (`useGameKeys`: 1–4 e ← ↑ ↓ →).
- Escrita: comparação por `answerKey` (`typed-answer.ts`: sem acento, pontuação, espaço, Saint=St); **Enter vazio = não sei** (ignorado nos primeiros 0,7 s). Idiomas não avança sozinho (`useAdvance.schedule(..., manual)`).
- Estados e províncias e Mapas históricos usam os mesmos motores com as variantes `dv-*` (regra do modo equivalente via `baseVariant`).

### 3.4 Persistência
- **IndexedDB `carta-cega` v4** (`storage-schema.ts`): `sessions`, `progress` (uma carta por entidade), `ledger` (livro-caixa; saldo derivado; ids fixos como `spoils:<sessão>` e `grant:*` evitam pagar duas vezes), `unlocks`, `achievements`, `historicalCollection`, `preferences` (duelos, favoritas, estoque `supply:*`, desafios, ranking dos bots, ajustes…), `state` (local ao aparelho: migrações, Tônico, andamento do Mecenato).
- **localStorage:** tema, ritmo, idioma, fundo/projeção do mapa, layout do Hub, debug etc. (`carta-*`).
- **Princípio:** progresso, troféus, XP e nível são **derivados do histórico**, nunca gravados à parte; mudar uma regra muda para trás sem migração (por isso XP e nível usam regras que nunca diminuem).
- **Backup** (Opções → Progresso, `progress-backup.ts`, `test:backup`): união por id, cartas somam, compra vale o maior preço pago, marcador por importação; a linha `sync:v1` nunca entra. Migração do perfil clássico em `legacy-migration.ts` (ids únicos, não reaplicar).

### 3.5 PWA e offline
- `public/sw.js`: a lista de precache e a `VERSION` (soma do conteúdo) são **injetadas no build** pelo `vite.config.ts` (~27 MB: o app, os JSONs de dados, o museu). Navegação vem da rede primeiro; `/api/` sempre da rede.
- **Mapa-múndi** não é pré-cacheado: Opções → "Baixar mapa" guarda no OPFS e o service worker responde `Range` dali. **`MAP_BYTES` e `MAP_VERSION` existem em `offline-map.ts` e em `sw.js` e têm de bater com o `.pmtiles`** (`test:manifest`). Mapas dos países/épocas vão inteiros para o cache na primeira partida (`DIVISION_MAPS`, injetado a partir de `divisions-index.ts`; no Explorar com todos os países pedidos com `?lite`, sem guardar). Ladrilhos de satélite/natural: cache genérico na primeira vez.

### 3.6 O mapa da partida (`map-game.tsx`)
- Estilo em `components/map-style.ts` (`atlasStyle`, também usado pelo Explorar; protocolo `pmtiles`). Fontes: `atlas` (`meridiano-hd.pmtiles`, camada `countries` com só `carta_id`, `promoteId`) e `small-entities` (marcadores); nos tabuleiros, `board` (+ `board.extra` e o mapa-múndi de fundo). `MAP_MAX_ZOOM` 14. O estilo **não tem `glyphs`**: todo texto no mapa é `maplibregl.Marker` em HTML.
- **Clique** (`resolveAt`): marcador (14 px) ou terreno, toque na água vale o território mais perto em 22 px; **`tapAt`: a geografia real do alvo vence o polígono desenhado por cima**. Terra com `carta_id` vazio (Saba, Bir Tawil, Paracel, Spratly, Liancourt) nunca é alvo. Capitais com o mesmo nome valem qualquer um dos países (`sameCapitalName`).
- O mapa não gira nem inclina. Câmera por recorte em `regions.ts` (`REGION_CAMERA`); no globo o Mundo enquadra a Terra inteira (`globeFitZoom`). Treino marca no mapa cada alvo perguntado. Paleta do mapa vem do tema (`map-palette.ts`) e do estilo de mapa do Mecenato (`map-styles.ts`); figuras do mar do Cartógrafo em `map-fauna.ts` (presas ao oceano, escalam com o mapa).
- **Silhueta e Travel não usam os tiles do jogo como mapa de clique**: Silhueta lê `public/data/silhouettes.json` (ver 4.1), o mapa do Progresso usa `legacy-map.json`.

### 3.7 Mapa-múndi em alta definição (`public/maps/meridiano-hd.pmtiles`, ~91 MB)
- Gerado aqui em Python (`scripts/map-hd/`, shapely/pyarrow/pmtiles, sem tippecanoe): **costa** dos land polygons do OSM, **dono de cada pedaço** pelo Overture Maps (`divisions/division_area`, release 2026-09-23.1, terra + mar territorial), **lagos** (386: todo lago do Natural Earth ≥ 500 km² e as lagunas costeiras, polígono do Overture `base/water`; `lakes.json` com inclusões/exclusões; `LAKE_MIN_KM2`). Atribuição "© OpenStreetMap contributors · Overture Maps Foundation · geoBoundaries" (ODbL).
- **Quem é quem** em `entities.json` (regras para Saara Ocidental, nações do Reino Unido, absorvidos dentro do soberano, áreas disputadas como no mapa anterior, terra neutra, `overlapWinners`; sobreposição nova sem regra faz o script parar).
- **Comandos:** `npm run fetch:map-hd` (cache em `build/map-hd/`), `npm run build:map-hd` (~1 h; `LOW_ONLY=1` refaz só os zooms 0–6, `ONLY_CELLS` gera um recorte), `python scripts/map-hd/mvt_check.py` (valida todos os tiles). Depois: atualizar `MAP_BYTES`/`MAP_VERSION` em `offline-map.ts` e `sw.js`, rodar `test:map` e `test:small-entities` e refazer os marcadores (`generate-small-entity-report.mjs`).
- **Limite: o GitHub aceita até 100 MiB por arquivo** (folga ~9 MB). Por isso o zoom 9 usa tiles de 8192 unidades (precisão de um zoom 10) e não há zoom 10. Para emagrecer: `LAKE_MIN_KM2=1000`.
- **Armadilhas (todas apareciam como uma linha no mapa):** bordas de tile/célula sempre pelo índice inteiro (`edge_x`/`edge_y`) com `snap_to_cell`; zooms baixos simplificados por entidade inteira, não por tile; os land polygons param 2,8 mm antes do antimeridiano (`SNAP_WORLD`); arredondar para a grade do tile só com `shapely.set_precision` (senão polígonos inválidos que o MapLibre pinta duas vezes) — o `mvt_check.py` para o build se sobrar inválido.

### 3.8 Estados e províncias (19 países: br, us, cn, es, fr, de, ru, ar, pe, au, id, eg, ng, et, cd, ca, in, ie, gb)
- **Um país é um pacote de dados, sem código próprio.** Config curada em `scripts/divisions/countries/<país>.json`: id, `carta` (a entidade do mapa-múndi que ele divide; `alsoCarta` para entidades extras, como a Guiana e Mayotte na França ou as nações no Reino Unido), nomes nos 3 idiomas, **a palavra da unidade com o gênero** (os textos de `t.divisions` são funções dela), regiões (os recortes), `frame` da câmera, `exclude`, `leftoverKm`, atribuição, fontes, as unidades (código, nomes, capital — pode ser `{pt,en,es}` —, grafias aceitas, região, `flagFile`, `pop`/`popYear`, `langs` co-oficiais) e `probes` (pontos que o teste confere). Opções de fonte: `ibge` (Brasil) ou `overture` (`overtureSubtype`, `sourceName`/`sourceNames`/`byName` para casar linhas da fonte, `noSource` + `fill`/`override` para unidades que a fonte não tem, `zmax` para limitar o zoom).
- **País novo:** a config + `npm run fetch:divisions <país>` + incluir em `COUNTRIES` (`scripts/divisions/build.py`; a ordem é a da Mesa) + `npm run build:divisions <país>` + `npm run test:divisions` + **as capitais com coordenada em `public/data/explore-capitals.json`** (Wikidata P300 → P36 → P625). O pipeline divide **a terra que o mapa HD deu ao país** (`build/map-hd/pieces`, então a costa e as fronteiras batem com o mapa-múndi), grava `public/data/divisions/<país>/{units,shapes,flags}.json`, `public/maps/divisions-<país>.pmtiles` e refaz o índice gerado `src/domain/divisions-index.ts`. Atalhos: `REUSE_PIECES=1`, `TILES_ONLY=1`, `INDEX_ONLY=1`, `FLAGS_ONLY=1`.
- **Armadilhas:** `set_precision` de 1 m antes de unir pedaços das células (senão emendas e pedaços perdidos); vizinhança por divisa comum > 0,01°; interseção do GEOS que quebra → `make_valid` e refaz (`split_land`).
- **No app** (`domain/divisions.ts`, `divisions-data.ts`): catálogo no formato do acervo (ids `<país>-<código>`), variantes `dv-*` (tabela em 4.1), recortes `dv:<país>` e `dv:<país>:<região>`, só os modos que o país tem (`variantPlayable`; modos de capital só com unidades que têm capital, `isCapitalVariant`), seletor de países na Mesa (`country-picker.tsx`), mapa-múndi apagado de fundo com divisas tracejadas e fronteiras contínuas, ponto clicável para unidades pequenas (`boardMarkerSource`, `BOARD_MARKER_PX`). Família `divisoes`: fora da coleção, do domínio, dos pilares, do Mecenato e do duelo; moedas = 3/4 do modo equivalente; **um modo comprado vale para todos os países e épocas** (`priceFamily`). Conquistas só do Brasil (Do Oiapoque ao Chuí, Brasil de cor). Bandeiras só no Brasil. Sessões antigas `brasil/br-*` são lidas como `divisoes/dv-*` (`asDivisionSession`).

### 3.9 Idiomas, povos e moedas
Um cartão no Hub (cor de Idiomas) para três famílias que continuam separadas por dentro (`idiomas`, `gentilicos`, `moedas`; `PEOPLES_GROUP`): a Mesa tem a fileira **Tema** e abre no último tema jogado (`carta-last-topic:povos`, `peoplesEntry`).

### 3.10 Mapas históricos (1914)
- Cada época é um pacote do índice com `kind: "era"`, jogado com a família **`epocas`** e as variantes `dv-*`; config gerada por `scripts/divisions/eras/make-1914.py` (edite lá). Fronteiras do **OpenHistoricalMap** (CC0) válidas em 1914-07-01, costa do mapa HD arredondada a 250 m (`landGrid`, tiles até o zoom 7), correções pela terra de hoje (`override`, `carve`, `carveBox`, `fill`, `neutralRest`). 146 territórios, 142 com capital da época (a de hoje aceita na escrita), **89 bandeiras** (`FLAGS` do `make-1914.py`, só as que existiam em 1º/07/1914 com arquivo confiável; CC BY-SA com crédito nas Opções → Créditos).
- **Regra do Enzo: toda época nova é cruzada com as Históricas e as bandeiras inteiramente novas entram lá** (`scripts/data/historical-*.json` + `merge-historical.mjs`).
- **Armadilhas do mundo inteiro (meça numa amostra antes):** terra arredondada a uma grade, não simplificada; `CELL_SNAP` cola as bordas das células (o `clip_by_rect` do GEOS erra sem dar inválido; `scan-squares.mjs` procura os quadrados); áreas sem dono decididas por célula dão degraus (por isso `neutralRest`); ilhotas aos milhares (`LOW_DROP_SPECKS`); furos de uma casa da grade são aceitos.

### 3.11 Fundo do mapa e projeção (Opções, em teste)
`map-base.ts` (`test:map-base`): **Padrão**, **Natural** (cobertura do solo desenhada, ladrilhos `public/maps/sat/natural/` de `scripts/map-base/build-natural.py`, terra do mapa HD), **Satélite**, **Satélite + Noturno** e **Relevo** (Blue Marble da NASA, domínio público, ladrilhos z0–5 em `public/maps/sat/bm{,-terra}/`). No satélite/natural a terra fica transparente e só os países marcados acendem. Vale no mapa-múndi e no Explorar com todos os países. **Projeção** Plana | Globo (`readMapProjection`; `projection: globe` + `sky`; marcadores com `opacityWhenCovered`; rótulos do Explorar usam `isLocationOccluded`, acesso não público). Equal Earth exigiria outro mapa reprojetado (não feito). Falta decidir se entra na economia.

### 3.12 Explorar
3ª opção do **Ritmo** nas Mesas de mapa (controle à parte, não um `Pace`): mapa livre sem tempo nem moedas, chips Nomes/Capitais, busca, ficha ao tocar (`components/explore-map.tsx`, `explore.css`, rótulos posicionados por `placeLabels` em `domain/explore.ts`; capitais em `public/data/explore-capitals.json`). **Todos os países** nos tabuleiros (chip `.mz-allc`): o mundo com as divisões dos 19 países. Ficha mostra população e línguas co-oficiais das unidades.

### 3.13 Progresso
Duas abas: **Estatísticas** (cabeçalho do perfil, Seu mapa, Pilares, Duelo, Evolução, Números, **Seus reflexos** com "Treinar os 5 mais lentos" via `focusIds`, e "Mais estatísticas": Modos, **Seu ritmo** — `domain/rhythm.ts`, relógio do dia, curva da noite —, **Duelos** — `domain/duel-stats.ts`, força estimada, rivais, contra pessoas) e **Histórico** (uma linha por partida, duelo ou desafio; aberta, pergunta a pergunta; PC × celular por `device`, `device-history.ts`). CSS em `profile.css`, só com variáveis do tema. Conferências: `.tmp-hub/check-progresso.mjs`, `check-stats.mjs`, `check-duelos-tab.mjs`.

### 3.14 Travel (estilo do Travle)
`domain/travel.ts` (`test:travel`), `components/travel-map.tsx`. Países do filtro + Saara Ocidental; vizinhança = `borders` + `TRAVEL_LINKS` (túneis, pontes, exclaves; o ultramar não liga ao país-mãe). Rotas em faixas curta/média/longa alternadas (`travelBand`), mínimo 2 países no meio, sem teto. Níveis **Livre / Trilha / Em ordem** (`carta-travel-level`); começar pelo lado do destino não gasta chute (`wrongSide`). Pistas são suprimentos (vizinho, lanterna, primeira letra). Moedas e XP pelo peso da rota (`travelWeight`). Sem "Todas": 1, 2, 5, 10 rotas. Fim da rota com o caminho mais curto e carrossel "Suas rotas" no resultado. Caixas da câmera pelas silhuetas (`travel-extents.ts`, `scripts/build-travel-extents.mjs`).

### 3.15 Desafios (tabelas no estilo do JetPunk)
- `domain/challenges.ts` (`test:challenges`), `challenges-store.ts`, `components/challenges-view.tsx`, `challenges.css`. **21 desafios**: Países / Países e capitais / Ficha completa (nome, capital, moeda, idioma, gentílico) × Mundo e 6 continentes, sobre os **195 soberanos** (`isSovereign`). Moeda **1:1** (o nome completo de qualquer moeda oficial). Tempo = folga fixa + segundos por país (`challengeSeconds`; mundo 15 / 25,5 / 60 min).
- **Um campo só, qualquer resposta em qualquer ordem** (`matchAnswer`: linha atual, depois as abertas, depois o resto; resposta ambígua sem linha que decida não entra). Só espera o Enter quem é começo de outra resposta da **mesma coluna** (Níger/Nigéria); quem continua escrevendo depois de uma resposta entrar retoma o texto (`continuesAnswer` + `carry`).
- Tentativas imutáveis `challenge-run:<desafio>:<instante>` em `preferences`; recorde por `bestRun`; medalhas bronze/prata/ouro (50/80/100%); 40 moedas e 2 XP por acerto, dobro no desafio do dia (`dailyChallenge`), bônus de medalha uma vez (`grant:challenge:<id>:<medalha>`). Contam como partidas e rodadas (`queryEconomy`) e aparecem no Histórico. Cidades: ideia congelada. Conferência: `.tmp-hub/check-challenges.mjs` (`BASE`, `THEME`).

### 3.16 Partida com o celular deitado
Só CSS (`src/landscape.css`, `@media (orientation:landscape) and (max-height:500px)`; importado por último): alternativas com a pergunta num cartão à esquerda e as respostas em 2×2 à direita (o `.gs` vira grade; `.gs-head`/`.gs-body`/`.gs-tray` em `display:contents`), suprimentos numa coluna na borda (`--ls-rail`), escrita com o campo no alto à direita (acima do teclado), mapa na tela inteira com o alvo numa pílula. Travel fora. Conferência: `.tmp-hub/check-landscape.mjs` (`W`/`H`, `THEME`, `ONLY`).

---

## 4. Regras do jogo vigentes

### 4.1 Modos
| Família | Modo | `family/variant` | Pilar | Cronômetro | Moedas base | Desbloqueio |
|---|---|---|---|---|---|---|
| Mapa | Clicar no mapa | `mapa/mapa` | mapa | 20 s | 48 | grátis |
| Mapa | Silhueta · alternativas | `silhueta/silhueta-opcoes` | mapa | 20 s | 56 | 11.000 |
| Mapa | Silhueta · escrita | `silhueta/silhueta` | mapa | 30 s | 88 | 27.000 |
| Mapa | Travel | `travel/travel` | mapa | sem | 64 por país da rota | 64.000 |
| Bandeiras | Atuais (2 sentidos) | `bandeiras/nome-bandeira`, `bandeira-nome` | bandeiras | 15 s | 32 | grátis |
| Bandeiras | Escrita | `escrita/escrita-pais` | escrita | 30 s | 80 | 5.000 |
| Bandeiras | Históricas (2 sentidos) | `historicas/nome-historica`, `historica-nome` | — | 20 s | 44 | 36.000 |
| Capitais | Clicar no mapa | `capitais/capital-pais` | capitais | 15 s | 56 | grátis |
| Capitais | Escrita | `escrita/escrita-capital` | escrita | 30 s | 96 | 15.000 |
| Idiomas | Nome do idioma | `idiomas/idioma-nome` | — | 15 s | 40 | 40.000 |
| Idiomas | Países do idioma | `idiomas/idioma-pais` | — | 20 s | 44 | 48.000 |
| Gentílicos | Gentílico → país | `gentilicos/gentilico-pais` | — | 15 s | 32 | 8.000 |
| Gentílicos | País → gentílico | `gentilicos/pais-gentilico` | — | 15 s | 36 | 18.000 |
| Moedas | País → moeda | `moedas/pais-moeda` | — | 20 s | 40 | 22.000 |
| Moedas | Moeda → país | `moedas/moeda-pais` | — | 20 s | 44 | 30.000 |
| Estados/épocas | Unidades no mapa | `dv-mapa` | — | 20 s | 36 | grátis |
| Estados/épocas | Capitais no mapa | `dv-capital-mapa` | — | 15 s | 42 | 3.000 |
| Estados/épocas | Silhueta · alternativas | `dv-silhueta-opcoes` | — | 20 s | 42 | 6.000 |
| Estados/épocas | Silhueta · escrita | `dv-silhueta` | — | 30 s | 66 | 20.000 |
| Estados/épocas | Bandeiras (2 sentidos) | `dv-nome-bandeira`, `dv-bandeira-nome` | — | 15 s | 24 | 2.000 |
| Estados/épocas | Bandeiras · escrita | `dv-escrita-nome` | — | 30 s | 60 | 9.000 |
| Estados/épocas | Capitais · alternativas | `dv-capital` | — | 15 s | 30 | 4.000 |
| Estados/épocas | Capitais · escrita | `dv-escrita-capital` | — | 30 s | 72 | 13.000 |

- Preços na escada da Loja (`test:policies`: cada modo custa 1,1× a 2,2× o anterior). Pilares (`pillars.ts`): mapa = mapa+silhueta+travel; escrita valida à parte; históricas, idiomas, povos e moedas fora.
- **Silhuetas:** `public/data/silhouettes.json` (`silhouetteIndex`), gerado por `python scripts/map-hd/build-silhouettes.py` dos pedaços do mapa HD (~8 min uma vez; `ONLY_SIMPLIFY=1` para ajustar), ilhas distantes fora (`island_group`), todos os territórios do mapa no baralho. `pathForFeatures` corrige o antimeridiano e o achatamento por latitude.
- **Gentílicos e Moedas:** `public/data/peoples.json` de `npm run build:peoples` (Anexo A5 do Código de Redação da UE + `scripts/data/peoples/overrides.json` com as formas brasileiras); alternativas nunca com duas certas (`peoplesOptions`), Moeda → país com uma rodada por moeda; fora da coleção e do domínio. Falta o sentido digitado.

### 4.2 Ritmo e economia (`pace.ts`, `spoils.ts`, `economy-rules.ts`)
- **Partida** (com cronômetro; acabou o tempo = erro) e **Treino** (sem cronômetro, paga 50%, marca os alvos no mapa). Explorar é à parte (3.12).
- **Rodadas:** 10 grátis; 20 / 50 / 100 custam 3.000 / 8.000 / 20.000 e "Todas" 85.000 (comprar inclui os menores; "Todas · N" cobra o menor corte que cobre). Travel usa 1/2/5/10 rotas.
- **Moedas por acerto** = base × dificuldade do país (1 / 1,12 / 1,25 por população e área); sequência +3% por acerto seguido até +75%; partida completa 14/9/5 por rodada com 90/75/60%; carta nova 60, carta que subiu 30. Partida abandonada não paga.
- **XP:** só de partida completa; 2 por rodada (Travel: pelo peso da rota) + 50 por país que já teve 3 certas seguidas em 2 modos (regra antiga, `everDominated…`, mantida só para o XP: **XP e nível nunca caem**). Nível N começa em 50·(N−1)·N XP, sem teto.
- **Temas** (`themes.ts`, preço por faixa `TIER_PRICES`): Papel (padrão) e Pigmentos grátis; paletas 10–16 mil; pintados 24 mil; Ateliê 40 mil; elaborados Cartógrafo 80 mil e Noturno 100 mil; Prata só pela liga. Tema escuro = `scheme: "dark"` (`themes-dark.css` traduz as cores fixas; o tema define `--accent-ink`, `--ok-ink`, `--bad-ink`, `--warn-ink`). **Todo tema novo passa por `node scripts/audit-theme.mjs <id> [cenas]`** (`MOBILE=1`; o Prata e o Noturno no celular dão timeout do protocolo, conhecido). Cor fixa de texto nova no CSS do app quebra os temas escuros.
- **Suprimentos** (`domain/supplies.ts`, `supplies-store.ts`, `use-supplies.ts`; estoque `supply:<id>`): Lupa 400, Bússola 250, Ampulheta 150, Primeira letra 200, Pular 120, Segunda chance 300, Escudo 500, Lanterna 300, Pista de vizinhos 350, Tônico de XP 600. Em Partida e Treino, **nunca em duelo/PvP**; quem decide onde cada um vale é `supplyApplies`. Rodada com suprimento é **assistida**: paga metade, sai do domínio e a partida não conta como Perfeita. Escudo e Segunda chance são **armados** (gastam só se o erro acontecer). Tônico: 50 rodadas a 8 XP (estado local em `state`, rodadas `boosted` nas sessões).
- **Cartas** (Coleção): maestria 0–5 por país pelos modos acertados (5 exige os 4 com escrita e capitais ≥ 2). Coleção histórica à parte. A carta do Reino Unido recebe os acertos das 4 nações (`cardParentsOf`).
- **Domínio e títulos** (`dominated.ts`, `pillars.ts`): conquistar um país num pilar = 5 certas seguidas (para sempre); **dominado** = conquistado em 2 pilares + capital escrita uma vez. Títulos pelo % conquistado: Vexilólogo 90% (Bandeiras), Cartógrafo 85% (Mapa), Diplomata 80% (Capitais), Cosmógrafo os três. Precisão histórica bayesiana aparece mas não dá título.
- **Conquistas** (~55, `achievements.ts`, `test:achievements`): 6 categorias, raridade 1–5; "Perfeito" = baralho inteiro (`roundLimit === null`) com 100% em cada recorte coberto. Conquista nunca é retirada.

---

## 5. Decisões que não devem ser quebradas

1. **Históricas e Idiomas ficam fora de `meta`** (dados próprios), para as contagens (255 encontráveis, 250 no mapa, 195 no filtro) não inflarem.
2. **A ficha durante a partida é completa**; a progressão vive na Coleção.
3. **Não criar valor novo de `Pace`** para estudo ou consulta (`Pace` está costurado na economia): entra como controle separado (como o Explorar).
4. **Geografia real do alvo vence o polígono desenhado por cima** (`tapAt`); toque na água cai no território mais perto.
5. Baralho nunca repete dentro da partida; sair do meio não paga; "Todas" é `roundLimit: null`.
6. **Não reintroduzir LOD** (duas resoluções de geometria trocando em tempo real).
7. Só conteúdo de **fonte verificável e sem direito autoral vigente**; conteúdo novo é conferido por busca, não de memória.
8. Cada conquista mede algo distinto; conteúdo novo pede conquista correspondente, sem duplicar padrão.
9. Progressão derivada do histórico (3.4); XP e nível nunca caem; conquista nunca é retirada.
10. **Vetados pelo Enzo:** apostas de moedas no duelo, seguro de troféus (pay to win), "lendas" acima do Grão-Mestre; tempo de palpite tem de ser confortável para pausas de pensar e ainda desafiador.

---

## 6. Dados e regras de conteúdo

- `public/data/legacy/` (extraídos do HTML 0.13.5 por `npm run extract:legacy-game`/`extract:legacy`): `catalog.json` (262 entidades em `meta`; `ll` é `[lat, lon]`; sinalizadores `absorvido`+`mapaPara`, `soBandeira`, `mapa:false`, `substitui`, `un`, `ratio`), `flags.json`, `historical.json` (226) + `historical-flags.json`, `languages.json` (116), `manifest.json` (hashes). **Um novo `extract:legacy-game` apaga** as correções feitas à mão no `catalog.json` (as grafias `al`/`capAl` do português: Chade, EUA, Cocos, São Martinho, siglas como RCA, RD Congo, EAU, USA, UK) e regrava históricas e idiomas só com os do clássico — reaplique (idiomas: `node scripts/merge-languages.mjs`; históricas: `node scripts/merge-historical.mjs`).
- **Bandeiras:** correções em `public/data/flag-overrides/<cca2>.svg|webp` (validadas e listadas no build); `scripts/flags/fix-ratios.mjs` comparou com o Commons e corrigiu 133 proporções (fontes em `ratio-sources.json`). O Afeganistão usa a bandeira do Talibã por decisão do Enzo; Honduras segue o desenho que o Commons dá como atual.
- **Idiomas:** `scripts/data/languages-*.json` (alguns gerados por `_gen-*.mjs`) → `merge-languages.mjs`. Cada entrada é uma frase nativa de **fonte verificável** (provérbio, lema, princípio oficial), nunca de memória; `falantes`/`ranking` só se confirmados. Todo país independente aparece em `paises` ou `tambem`. 7 idiomas suspensos em `scripts/data/suspensos/` (sem fonte de grafia nativa).
- **Históricas:** id próprio, `ini/fim`, fonte com arquivo e licença do Commons; critérios: entidade política extinta e distinta, bandeira documentada, diferente de qualquer outra do jogo. ~145 das 200 do clássico estão sem `cap`/`fato`/`sucessor`.
- Fontes de mapa e licenças: seções 3.7, 3.8, 3.10, 3.11 e a linha Créditos das Opções.

---

## 7. Testes

- `tsc -b` limpo é obrigatório. Há ~59 scripts `test:*` (lista no `package.json`): regras de domínio (economia, espólio, conquistas, baralhos, mapa, temas, backup, i18n, duelo, ranking, PvP, conta, divisões, desafios, travel, ritmo…). **Não há teste de componente React**: o comportamento de tela se confere no navegador (roteiros em `.tmp-hub/`, `scripts/check-hub-mobile.mjs`, `scripts/audit-theme.mjs`).
- Falham só por limite do Windows: `test:regions` (symlink, EPERM), `test:map-round-engine` e `test:answer-options` (usam `file:///tmp`). Os de navegador do repo pedem `CHROMIUM_PATH`.
- Testes com números escritos à mão quebram quando o balanceamento muda (`test-spoils`, `test-economy`, `test-debug-rules`, `test-match-config`, `test-achievements`, `test-challenges`).

---

## 8. Pendências e problemas conhecidos

- **"Mapa indisponível" é fatal por qualquer erro do mapa** (`map.on("error")` grava `mapError`); um clique antes de o estilo carregar derruba a tela até recarregar. Falta proteger `resolveAt` com `isStyleLoaded()`/`mapReady`.
- `evaluateAchievementsOnLifecycle` não recebe o catálogo: conquistas que dependem dele só avaliam certo na tela de Conquistas.
- **Nunca verificado em aparelho de verdade:** duelo entre dois aparelhos, iPhone/Safari (PWA instalado), o download offline de ~91 MB, as fontes de escrita nativa dos Idiomas, o modo deitado (teclado do iPhone).
- PvP: recarregar no meio de uma partida perde o andamento local (`pvpRun` só em memória); o servidor não confere as respostas relatadas.
- Repositório pesado: `historico versoes antigas/` (118 MB no git, ~950 MB no disco; 8 HTMLs e um `.zip` soltos nunca versionados), `qa/`, `zipFile.zip`, `attached_assets/`, `screenshots/`, `.replit`, `replit.md`, `.agents/`, `carta-cega-rebuild-mudancas/`. `build/` tem ~13 GB de intermediários (o que é preciso para gerar país novo: `build/map-hd/pieces`). **Nada apagado sem o ok do Enzo.**
- Dados: ~145 históricas sem `cap/fato/sucessor`; `bandeiras-historicas-candidatos.md` desatualizado; a ficha do país ainda mostra as moedas antigas do catálogo (`cur`).
- O lockfile aponta para o registro interno do Replit (regenerar contra o npm público só com o ok do Enzo, em commit à parte).

---

## 9. Backlog e ideias

- **Duelo:** Temporada 1 (zerar troféus, bot vira treino sem troféu, servidor vira a fonte dos troféus) quando a fila achar gente com frequência; temas de liga do Bronze, Ouro, Platina, Diamante, Mestre e Grão-Mestre (um a um, prestígio crescente); Idiomas no duelo.
- **Mecenato** (`domain/mecenato.ts`, `mecenato-store.ts`, `mecenato-view.tsx`; expedições de horas reais aceleradas por acertos no modo e continente da rota, Patronato, Acervo, Equipamento): fase 1 (Velho Mundo) feita; fases 2 (as outras 5 rotas e seus itens) e 3 (Grandes expedições: Globo, Planetário, Grande frota) pendentes.
- **Loja:** temas elaborados Vitral e Papel Recortado; prestígio Aurora e Cosmos (250–400 mil). Fundo do mapa e globo: decidir se entram na economia.
- **Conteúdo:** novos países e épocas em Estados/Mapas históricos; sentido digitado em Gentílicos/Moedas; Mesa com "Mais difíceis para você"; ★ das Favoritas aplicando sozinha; modo "só os errados"; estados não reconhecidos; reativar idiomas suspensos; Equal Earth (outro mapa reprojetado); cidades (congelado).
- **Plataforma:** dividir o JavaScript por tela (hoje um bloco de 2,2 MB, 670 KB comprimido); Google como login.
- Sumidouros de moedas para quem esvaziou a Loja (os "piratas" anotados sem compromisso).
