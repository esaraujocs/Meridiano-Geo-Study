# Bandeiras Históricas — candidatos ao nível essencial

**Status em 22/08/2026 (versão 0.8.0): 30 das 45 entradas abaixo já estão no jogo de verdade**
(`DB.hist` no payload, modo Bandeira → Históricas). As 15 restantes ficaram de fora por dois
motivos concretos, não por falta de tempo — ver a lista completa e o motivo de cada uma na
seção 9 do `CLAUDE.md` ("Modo Bandeiras Históricas"):
- **7 por peso de arquivo** (SVG real da Wikimedia com brasão/emblema detalhado demais, mesmo
  otimizado): Rodésia, Espanha Franquista, Dinastia Qing, Grã-Colômbia, Primeiro Império
  Mexicano, Segundo Império Mexicano, Confederação Peru-Boliviana.
- **6 por duplicar visualmente uma bandeira já em algum lugar do jogo** (país atual ou outra
  entrada de `DB.hist`): Alemanha Ocidental (RFA), República de Weimar, Vietnã do Norte, Reino
  da Líbia (1951-1969), Império Coreano, Reino da Iugoslávia. Reino Zulu caiu por um terceiro
  motivo: não existe flag vexilológica padronizada da época, só reconstruções modernas.
- Reino da Prússia da tabela original virou **Império Alemão** (1871-1918) no dado real — o
  arquivo pesquisado por engano era o do Império, não da Prússia isolada; ficou como está por
  ser uma entidade mais reconhecível.

Este arquivo continua sendo o rascunho de curadoria original (datas/fatos não re-checados
desde então) — não foi reescrito linha a linha pra refletir o status acima, só esta nota no
topo. Pra dado exato do que está no jogo, ler `DB.hist` no payload é a fonte de verdade.

---

Rascunho de curadoria pra revisão do jogador, não dado final. Nada disso está no jogo ainda —
é a lista de trabalho antes de virar `meta`-like de verdade no payload. Datas e fatos vêm do
meu conhecimento geral sobre essas entidades (todas de alta notoriedade histórica), não de
checagem primária item a item — antes de qualquer uma virar dado real do jogo, vale uma
conferência rápida contra uma fonte (Wikipédia já serve) pra data exata de início/fim, que às
vezes varia por critério (independência de fato vs. reconhecimento internacional).

Campos: `tipo` (imperio/extinto/movimento) · `reg`/`sub` (mesma taxonomia do jogo) · `ini`-`fim` ·
`cap` · `fato` · `sucessor` (país atual herdeiro) · nota de acervo (achado real da pesquisa
anterior, não verificado item a item — ✓ = categoria confirmada por amostragem, ? = a checar).

Uma decisão de curadoria que tomei sozinho, sinalizando pra você reverter se achar errado:
**não incluí as 15 repúblicas soviéticas como entradas separadas** — contaria de propósito
como URSS + 15, mas a maioria tem baixíssima distinção visual entre si (variação pequena em
cima do mesmo desenho vermelho+foice-martelo+texto) e fama individual muito menor que a URSS
como conjunto. Deixei como nota de expansão futura, não descartado.

---

## Europa

| pt | tipo | sub | início–fim | capital | fato | sucessor | acervo |
|---|---|---|---|---|---|---|---|
| Império Otomano | imperio | Europa (transcontinental) | 1299–1922 | Constantinopla | Dissolvido após a 1ª Guerra Mundial; sultanato abolido em 1922, califado em 1924 | Turquia | ✓ (36 SVGs) |
| Áustria-Hungria | extinto | Europa Central | 1867–1918 | Viena | Dupla monarquia; dissolvida no fim da 1ª Guerra Mundial em vários países novos | Áustria, Hungria e outros | ✓ (amostrado) |
| Alemanha Nazista (Terceiro Reich) | extinto | Europa Central | 1933–1945 | Berlim | Regime nazista; dissolvido com a derrota na 2ª Guerra Mundial | Alemanha | ✓ (amostrado) |
| República de Weimar | extinto | Europa Central | 1919–1933 | Berlim | Primeira república alemã, entre o Império e o nazismo; caiu com a ascensão de Hitler | Alemanha | ? |
| Alemanha Oriental (RDA) | extinto | Europa Central | 1949–1990 | Berlim Oriental | Estado socialista; reunificação com a Alemanha Ocidental em 1990 | Alemanha | ✓ (amostrado) |
| Alemanha Ocidental (RFA) | extinto | Europa Central | 1949–1990 | Bonn | Absorveu a Alemanha Oriental na reunificação, virando a Alemanha atual | Alemanha | ? |
| União Soviética (URSS) | extinto | Europa/Ásia (transcontinental) | 1922–1991 | Moscou | Dissolvida em 15 países independentes, incluindo a Rússia | Rússia + 14 outros | ✓ (amostrado) |
| Reino da Iugoslávia | extinto | Balcãs | 1918–1941 | Belgrado | Ocupada no início da 2ª Guerra Mundial | Sérvia e outros | ? |
| Iugoslávia (RSF) | extinto | Balcãs | 1945–1992 | Belgrado | Federação socialista de Tito; dissolvida em guerras nos anos 1990 | Sérvia, Croácia, Bósnia e outros | ✓ (amostrado) |
| Tchecoslováquia | extinto | Europa Central | 1918–1992 | Praga | "Divórcio de veludo" — dissolução pacífica em 1993 | Chéquia, Eslováquia | ✓ (amostrado) |
| Reino da Prússia | imperio | Europa Central | 1701–1871 | Berlim | Absorvida na unificação da Alemanha em 1871 | Alemanha | ? |
| Espanha Franquista | movimento | Europa Ocidental | 1939–1975 | Madri | Ditadura de Franco após a Guerra Civil Espanhola | Espanha | ? |
| Estado Francês (Vichy France) | movimento | Europa Ocidental | 1940–1944 | Vichy | Governo colaboracionista durante a ocupação nazista da França | França | ✓ (amostrado) |
| Reino da Itália | extinto | Europa Ocidental | 1861–1946 | Roma | Virou república após referendo pós-2ª Guerra Mundial | Itália | ? |

## Ásia

| pt | tipo | sub | início–fim | capital | fato | sucessor | acervo |
|---|---|---|---|---|---|---|---|
| Dinastia Qing (Império Chinês) | imperio | Ásia Oriental | 1644–1912 | Pequim | Última dinastia imperial chinesa; caiu na Revolução Xinhai | China | ? |
| Manchukuo | extinto | Ásia Oriental | 1932–1945 | Xinjing | Estado fantoche japonês na Manchúria durante a 2ª Guerra Mundial | China | ✓ |
| Pérsia (dinastia Qajar) | imperio | Ásia Ocidental | 1789–1925 | Teerã | Deposta por golpe que instalou a dinastia Pahlavi | Irã | ? |
| Irã (Estado Imperial, Pahlavi) | extinto | Ásia Ocidental | 1925–1979 | Teerã | Derrubado pela Revolução Iraniana de 1979 | Irã | ? |
| Império Mogol | imperio | Ásia Meridional | 1526–1857 | Délhi | Dissolvido após a Revolta Indiana de 1857, Índia vira colônia direta britânica | Índia, Paquistão, Bangladesh | ? |
| Vietnã do Norte (Rep. Democrática) | extinto | Sudeste Asiático | 1945–1976 | Hanói | Venceu a Guerra do Vietnã, unificando o país em 1976 | Vietnã | ? |
| Vietnã do Sul (República) | extinto | Sudeste Asiático | 1955–1975 | Saigon | Caiu com a Queda de Saigon, fim da Guerra do Vietnã | Vietnã | ✓ (amostrado) |
| Camboja Democrático (Khmer Vermelho) | movimento | Sudeste Asiático | 1975–1979 | Phnom Penh | Regime do Khmer Vermelho; derrubado pela invasão vietnamita | Camboja | ? |
| Império Coreano | imperio | Ásia Oriental | 1897–1910 | Seul | Anexado pelo Japão em 1910 | Coreia do Sul, Coreia do Norte | ? |
| Tibete | extinto | Ásia Oriental | 1912–1951 | Lhasa | De facto independente; anexado pela China em 1951 | China | ? |
| Afeganistão (Rep. Democrática) | movimento | Ásia Ocidental/Central | 1978–1992 | Cabul | Regime comunista da Guerra Fria; caiu após a retirada soviética | Afeganistão | ? |

## África

| pt | tipo | sub | início–fim | capital | fato | sucessor | acervo |
|---|---|---|---|---|---|---|---|
| Reino do Egito | extinto | Norte da África | 1922–1953 | Cairo | Monarquia; derrubada pela Revolução Egípcia de 1952 | Egito | ? |
| República Árabe Unida | extinto | Norte da África/Oriente Médio | 1958–1961 | Cairo | União Egito–Síria; Síria se retirou em 1961, Egito manteve o nome até 1971 | Egito, Síria | ? |
| Reino da Líbia | extinto | Norte da África | 1951–1969 | Trípoli | Derrubado pelo golpe de Gaddafi | Líbia | ? |
| Sultanato de Zanzibar | extinto | África Oriental | 1856–1964 | Zanzibar (cidade) | Fundiu-se com o Tanganica formando a Tanzânia | Tanzânia | ? |
| Reino Zulu | extinto | África Austral | 1816–1897 | Ulundi | Anexado pelo Império Britânico após a Guerra Anglo-Zulu | África do Sul | ? |
| República Sul-Africana (Transvaal) | extinto | África Austral | 1852–1902 | Pretória | República bôer; anexada pelos britânicos após a Segunda Guerra Bôer | África do Sul | ? |
| Estado Livre de Orange | extinto | África Austral | 1854–1902 | Bloemfontein | República bôer; mesma anexação britânica do Transvaal | África do Sul | ? |
| Estado Livre do Congo | extinto | África Central | 1885–1908 | Boma | Propriedade pessoal do rei Leopoldo II da Bélgica, notório por abusos coloniais | República Democrática do Congo | ? |
| Estado de Katanga | movimento | África Central | 1960–1963 | Elisabethville | Secessão da recém-independente RD Congo; reincorporado à força | RD Congo | ✓ |
| Biafra | movimento | África Ocidental | 1967–1970 | Enugu | Secessão da Nigéria; guerra civil terminou com reincorporação | Nigéria | ✓ |
| Rodésia | extinto | África Austral | 1965–1979 | Salisbury | Declaração unilateral de independência do domínio branco; virou Zimbábue | Zimbábue | ✓ (amostrado) |
| Império Etíope | imperio | Chifre da África | 1270–1974 | Adis Abeba | Um dos estados mais antigos da África; monarquia derrubada por golpe militar | Etiópia | ? |
| Califado de Sokoto | imperio | África Ocidental | 1804–1903 | Sokoto | Um dos maiores estados islâmicos da África pré-colonial; anexado pelos britânicos | Nigéria | ? |

## Américas

| pt | tipo | sub | início–fim | capital | fato | sucessor | acervo |
|---|---|---|---|---|---|---|---|
| Estados Confederados da América | movimento | América do Norte | 1861–1865 | Richmond | Secessão que causou a Guerra Civil Americana; derrotados | Estados Unidos | ✓ |
| República do Texas | extinto | América do Norte | 1836–1846 | Austin | Independente do México; depois anexado pelos EUA | Estados Unidos | ? |
| Reino do Havaí | extinto | Oceania/Américas (ilhas do Pacífico) | 1795–1893 | Honolulu | Monarquia derrubada por golpe apoiado por interesses americanos | Estados Unidos | ? |
| Grã-Colômbia | extinto | América do Sul | 1819–1831 | Bogotá | União de Bolívar; fragmentou-se em Colômbia, Venezuela, Equador (e Panamá depois) | Colômbia, Venezuela, Equador, Panamá | ? |
| Primeiro Império Mexicano | extinto | América do Norte | 1821–1823 | Cidade do México | Monarquia efêmera logo após a independência do México | México | ? |
| Segundo Império Mexicano | extinto | América do Norte | 1864–1867 | Cidade do México | Monarquia imposta pela França sob Maximiliano; fuzilado na queda | México | ? |
| Confederação Peru-Boliviana | extinto | América do Sul | 1836–1839 | — (dupla capital) | União efêmera entre Peru e Bolívia; desfeita por guerra | Peru, Bolívia | ? |

---

**Total**: 45 entradas (14 Europa + 11 Ásia + 13 África + 7 Américas). Sem repúblicas
soviéticas individuais e sem Oceania além do Havaí (que reclassifiquei pra Américas por
sucessor ser EUA — pode reclassificar pra Oceania se preferir manter pela geografia).

**Acervo**: "✓" = mesma categoria/família de entidades já testada na pesquisa anterior
(império, EUA-histórico, guerra/secessão) — confiança alta que a Commons tem. "?" = ainda não
testado individualmente, mas a mesma pesquisa mostrou cobertura ampla e sistemática pra esse
tipo de conteúdo, então a expectativa é positiva, só não confirmada arquivo por arquivo.

**Não incluído de propósito, pra você decidir**: as 15 repúblicas soviéticas (nota acima),
Kingdom of Sikkim, Estado da Palestina histórico, entidades da Guerra Fria mais obscuras
(Cazaquistão pré-URSS, canatos da Ásia Central). Se quiser mais Ásia/Oceania representada,
esses são os candidatos naturais pra completar até 50+.
