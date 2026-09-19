---
name: Carrosséis responsivos determinísticos
description: Regra para carrosséis cíclicos acessíveis e seus testes responsivos.
---

Em carrosséis cíclicos, o índice ativo deve ser a fonte de verdade e produzir explicitamente as posições anterior, atual e próxima. Não derive o estado ativo de uma animação de rolagem suave.

**Why:** A rolagem animada pode emitir estados intermediários e tornar `aria-hidden`, foco, peeks e testes intermitentes. Além disso, testar o carrossel em uma largura onde ele vira grade produz falsos erros.

**How to apply:** Teste loop, centralização e peeks em um breakpoint que realmente usa carrossel. Em larguras de grade, teste a grade separadamente. Meça overflow do documento, não cartões intencionalmente recortados pelo trilho.