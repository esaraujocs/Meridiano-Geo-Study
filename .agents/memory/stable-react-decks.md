---
name: Baralhos React estáveis
description: Regra para impedir que pools semanticamente iguais reiniciem uma sessão após carregamentos assíncronos.
---

Um baralho de sessão só deve ser recriado quando sua variante, recorte ou conjunto de IDs mudar; uma nova referência de array não é motivo suficiente.

**Why:** dados auxiliares podem terminar de carregar depois que a primeira carta já foi exibida. Isso recria pools equivalentes e pode trocar o alvo enquanto o usuário está respondendo.

**How to apply:** derive uma chave semântica estável da configuração e dos IDs do pool. Compare essa chave antes de criar um novo baralho e preserve a instância existente quando a chave não mudar.