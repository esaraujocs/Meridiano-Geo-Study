---
name: Regeneração de dados legados
description: A extração do HTML antigo não preserva todas as correções posteriores do catálogo.
---

Não use a reextração completa do HTML legado para entregar uma alteração pontual de nomes sem comparar os dados estruturados com a versão anterior.

**Why:** A reextração removeu aliases de países e capitais já corrigidos, além de substituir dados de idiomas mais recentes. O HTML antigo não é a fonte completa das correções atuais.

**How to apply:** Preserve as correções existentes ao alterar o catálogo e atualize seu hash no manifesto. Antes de adotar uma regeneração completa, compare os objetos e mantenha os ajustes posteriores.