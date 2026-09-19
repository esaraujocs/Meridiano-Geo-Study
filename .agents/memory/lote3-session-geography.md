---
name: Semântica de partida e geografia
description: Decisões não óbvias sobre conclusão de sessões, evidências do mapa e auditoria de densidade costeira.
---

Uma sessão só é `complete` quando o baralho finito se esgota. Sair, voltar ao recorte, ir ao início ou desmontar o motor encerra a sessão como incompleta.

**Why:** Achievements de partida precisam representar uma partida concluída; tratar abandono como conclusão libera marcos de fim de baralho indevidamente.

**How to apply:** Novos motores devem separar explicitamente conclusão natural de abandono em todos os atalhos e no cleanup.

O Achievement oculto de interação no mar usa cinco respostas iniciadas no mar, corretas ou não. Cliques e respostas por teclado no mapa persistem distância ao alvo e o sinal de água.

**Why:** Exigir ao mesmo tempo clique no mar e acerto territorial é impossível no modelo atual; a adaptação mantém uma descoberta mensurável sem criar recompensa econômica.

**How to apply:** Preservar a mesma evidência para mouse, toque e teclado; testar o contexto a partir de rodadas persistidas, não apenas com métricas pré-calculadas.

A densidade costeira exclui segmentos exteriores compartilhados entre entidades antes de calcular quilômetros por Haversine e vértices por km; outliers usam a mediana regional.

**Why:** O perímetro político inclui fronteiras terrestres e distorce a comparação de detalhe costeiro.

**How to apply:** Qualquer regeneração do mapa deve manter a exclusão determinística de segmentos compartilhados, a auditoria por mediana e os testes de fronteira/ilha.