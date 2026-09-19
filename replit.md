# Carta Cega

Jogo web estático em um único arquivo HTML. A versão atual é
`carta-cega-0.13.5.html`; `index.html` encaminha a raiz do Preview para ela.

## Executar no Replit

O workflow **Start application** usa:

```sh
python3 -m http.server 5000 --bind 0.0.0.0
```

O jogo precisa de acesso à internet no navegador para carregar D3, TopoJSON,
mapas e bandeiras usados pela página.