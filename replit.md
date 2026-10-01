# Meridiano (nome provisório; antes Carta Cega)

PWA React + Vite + MapLibre GL + PMTiles, servida na raiz do Preview.
O Hub mobile tem HUD compacta, carrossel cíclico e navegação inferior acessível.
A configuração de Bandeiras separa Variante, Recorte e Direção.
Marcadores pequenos usam âncoras pré-computadas em `src/data/small-entity-markers.json`.

## Executar
`npm run dev` inicia o workflow; `npm run build` valida e gera a produção.
Checks focados: `npm run test:map-marker-click`, `npm run test:flag-configuration` e `npm run test:small-entities`.
Museu: `node scripts/test-museum-browser.mjs` testa economia e backup; `node scripts/test-museum-ui.mjs` testa o fluxo no Preview.
Após `npm run build`, `node scripts/test-museum-offline.mjs` verifica o museu offline no build de produção com um servidor temporário.

## Museu
Abra Coleção → Museu Meridiano. Três expedições sequenciais (25 mil, 75 mil e 200 mil moedas) revelam peças permanentes, sem vantagens no jogo.
As imagens são locais, com registros e direitos da Library of Congress e da NASA nas fichas. Débito e posse são atômicos e fazem parte do backup existente.
O MVP soma 300 mil moedas; não é um sumidouro infinito. Novas peças podem ampliar o acervo.

## Limitações conhecidas
O smoke visual do Chromium é instável neste ambiente; prefira checks focados e capturas.
O bundle principal permanece acima de 500 kB.
`npm audit` tem 3 alertas altos pendentes no toolchain de Puppeteer, sem correção aplicada.