# Carta Cega

Rebuild TypeScript/PWA (React + Vite + MapLibre GL + PMTiles) em validação na raiz do Preview,
substituindo a versão clássica de arquivo único. A versão clássica permanece disponível em
`carta-cega-0.13.5.html` como referência/fallback.

## Executar no Replit

O workflow **Start application** usa:

```sh
npm run dev
```

## Bandeiras e overrides

As bandeiras embutidas ficam em `public/data/legacy/flags.json` e
`historical-flags.json`. Para substituir uma bandeira durante desenvolvimento,
adicione `public/data/flag-overrides/<id>.svg` ou `<id>.png`; o arquivo é
mesclado sobre o JSON pelo manifesto gerado no início de `npm run dev` e
`npm run build` (SVG tem prioridade sobre PNG). Com o servidor já aberto, rode
`npm run validate:flag-overrides` depois de soltar um arquivo. A validação verifica
estrutura, dimensões/`ratio` quando possível, aplica apenas a compactação segura
de espaços entre tags SVG e avisa sobre arquivos pesados.

## Pendências conhecidas

`flagFill` (país revelado preenchido com a bandeira, como no clássico) está
congelado por custo. Foram consideradas duas abordagens: overlay em canvas
recortado pelo contorno (fiel ao clássico, caro) e cor representativa da
bandeira via `feature-state` (barata).