---
name: Reconciliação de progresso local
description: Regra para upgrades, reimportação legada e gravação atômica de eventos de aprendizagem.
---

Ao reimportar um save legado cujo fingerprint mudou, substitua o baseline legado anterior e reaplique somente a evidência adquirida no app atual. Nunca some dois snapshots legados nem mantenha registros paralelos para a mesma entidade.

**Why:** uma abordagem de upsert por origem transformava registros migrados em “combinados”; a próxima importação deixava o registro combinado e criava outro legado, duplicando evidência. Usuários sem save legado também mostraram que o gameplay precisa inicializar o schema, não depender do importador.

**How to apply:** qualquer mudança no schema deve funcionar tanto pelo importador quanto pelo primeiro uso do jogo. A gravação de uma resposta deve manter sessão, progresso e ledger na mesma transação; conclusão explícita e abandono continuam estados distintos.