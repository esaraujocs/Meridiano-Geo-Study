---
name: Liquidação independente dos bots
description: Regra acordada para movimentação dos troféus dos bots no ranking.
---

Mudanças de troféus e MMR do bot devem ser calculadas do ponto de vista dele, usando suas próprias métricas e o resultado correspondente. Nunca deduzir o delta do bot como o negativo do delta do jogador.

**Why:** o cálculo existente depende do estado individual de cada participante; vitória e derrota não constituem uma transferência de troféus de soma zero. O usuário corrigiu explicitamente a proposta de espelhar os deltas.

**How to apply:** preservar a fórmula atual do jogador e usar cálculos independentes tanto em confrontos jogador–bot quanto bot–bot. A movimentação diária pode ser simulada sem executar quizzes completos, calculada ao abrir o jogo e estável entre atualizações.