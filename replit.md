# Meridiano (nome provisório; antes Carta Cega)

PWA React + Vite + MapLibre GL + PMTiles, servida na raiz do Preview.
O Hub mobile tem HUD compacta, carrossel cíclico e navegação inferior acessível.
A configuração de Bandeiras separa Variante, Recorte e Direção.
Marcadores pequenos usam âncoras pré-computadas em `src/data/small-entity-markers.json`.

## Executar
`npm run dev` inicia o workflow; `npm run build` valida e gera a produção.
Checks focados: `npm run test:map-marker-click`, `npm run test:flag-configuration` e `npm run test:small-entities`.

## Limitações conhecidas
O smoke visual do Chromium é instável neste ambiente; prefira checks focados e capturas.
O bundle principal permanece acima de 500 kB.
`npm audit` tem 3 alertas altos pendentes no toolchain de Puppeteer, sem correção aplicada.