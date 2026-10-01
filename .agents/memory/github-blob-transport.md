---
name: Transporte de blobs para GitHub
description: Evitar truncamento silencioso ao enviar commits grandes pela integração.
---

Não use saída de comandos como transporte de blobs grandes para a API Git do GitHub. Leia os bytes com fs dentro da função impure e valide o hash Git de cada blob antes de atualizar a referência.

**Why:** a saída de um comando com imagem em base64 chegou incompleta apesar de truncated:false, produzindo outro hash. A leitura binária direta preservou os bytes.

**How to apply:** quando o push autenticado por CLI não funcionar e for necessário usar a integração, confira os hashes de blobs, árvore e commit, mantenha metadados originais e atualize a referência sem force.