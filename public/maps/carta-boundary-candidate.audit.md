# Auditoria do mapa Carta Cega

- Data da auditoria: 2026-09-19
- Status: **accepted-with-documented-fallbacks**
- Cobertura: 229 geoBoundaries + 21 fallbacks legados atuais = 250 jogáveis.
- PMTiles: 27823584 bytes, SHA-256 `5781307c2aad1358a93311a32f0740723ba98a0104a29aaa10fdde2537a49316`, zoom 0–9.
- Checks: IDs `carta_id`, layer `countries`, ranges do header e cobertura Caribe/Pacífico.

## Proveniência e licença

Cada fonte geoBoundaries mantém URL, boundary ID, ano, versão, hash e licença no manifesto JSON. O histórico explícito lista os 25 IDs originalmente fallback; os 21 fallbacks atuais preservam a geometria do Carta Cega 0.13.5 (sourceHash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1) e permanecem explicitamente separados; a licença/proveniência histórica deve ser confirmada antes de redistribuição fora deste rebuild.

## Histórico explícito dos 25 fallbacks

- `86`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `162`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `166`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `239`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `248`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `260`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `344`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `356`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `446`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `534`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `574`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `630`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `663`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `666`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `732`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `832`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `926`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `gb-eng`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: geoboundaries — substituído por GBR ADM1.
- `gb-sct`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: geoboundaries — substituído por GBR ADM1.
- `gb-wls`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: geoboundaries — substituído por GBR ADM1.
- `gb-nir`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: geoboundaries — substituído por GBR ADM1.
- `sh-ac`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `sh-ta`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `bq-se`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.
- `cl-ip`: Carta Cega 0.13.5 legacy-map.json (hash cdda493421881299a6cc938721252db2fa396866113e0257be5c68a62e705fa1); estado atual: legacy-fallback.

## Auditoria de outliers

Coastline-only audit determinístico: segmentos exteriores normalizados a 1000000 de precisão; segmentos compartilhados por duas entidades são fronteira terrestre e excluídos. Comprimento geodésico Haversine dos segmentos costeiros restantes, em km, e vértices por km comparados à MEDIANA regional. Consulte manifest.json > outliers.worstHighDensity e worstLowDensity. Ilhas são mantidas; fronteiras disputadas ou quase coincidentes podem ser classificadas conforme a precisão, portanto é uma aproximação auditável.

## Limitações

- A aceitação é estrutural e não substitui uma matriz física low/mid de zoom, toque e desempenho.
- Fallbacks não são geoBoundaries e podem ter detalhe/precisão diferentes.
- O PMTiles é download offline opcional; a instalação não o pré-carrega.
