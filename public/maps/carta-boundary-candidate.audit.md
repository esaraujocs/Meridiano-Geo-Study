# Auditoria do mapa Carta Cega

- Data da auditoria: 2026-09-19
- Status: **accepted-with-documented-fallbacks**
- Cobertura: 225 geoBoundaries + 25 fallbacks legados = 250 jogáveis.
- PMTiles: 27741358 bytes, SHA-256 `bacb912022100213501a4f57bd7a564df7b65e6b0a643bdb3f42f3bd33456ca7`, zoom 0–9.
- Checks: IDs `carta_id`, layer `countries`, ranges do header e cobertura Caribe/Pacífico.

## Proveniência e licença

Cada fonte geoBoundaries mantém URL, boundary ID, ano e licença no manifesto JSON. Os 25 fallbacks preservam a geometria do Carta Cega 0.13.5 (sourceHash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1) e permanecem explicitamente separados; a licença/proveniência histórica deve ser confirmada antes de redistribuição fora deste rebuild.

## Limitações

- A aceitação é estrutural e não substitui uma matriz física low/mid de zoom, toque e desempenho.
- Fallbacks não são geoBoundaries e podem ter detalhe/precisão diferentes.
- O PMTiles é download offline opcional; a instalação não o pré-carrega.
