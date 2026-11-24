# Versão 3.1 — ajustes pedidos (24/11/2026)

Arquivos alterados: `script.js`, `server.js`, `style.css`. (`index.html` não mudou.)
Para atualizar o servidor: feche o servidor, substitua esses 3 arquivos, **mantenha a pasta `dados/`** e inicie de novo.

1. **Sub área / Gestão em um campo só:** o campo "Supervisor / Sub área" basta; a gestão é preenchida automaticamente pela sub área (BRAVO I → BRAVO). O campo Gestão saiu do formulário (continua nas listas, filtros e exportação).
2. **Ocorrência:** "Informação lançada" e "Informação correta" viraram um campo só, **Ocorrência:**. A regra que bloqueava lançada = correta deixou de existir.
3. **Anexos:** novo campo para anexar foto, planilha, PDF ou qualquer arquivo (até 5 por solicitação, 10 MB cada; limites em `CONFIG.anexosMax` / `CONFIG.anexoMaxMB` e `ANEXO_MAX` no server.js). Os arquivos ficam em `dados/anexos/` (as cópias horárias de `dados/backups/` NÃO incluem essa pasta: copie-a também). Só funciona no modo servidor.
4. **Cada supervisor vê só o que criou:** o servidor filtra pelo login que criou a solicitação (CCO e MESTRE continuam vendo tudo). Exige um login por supervisor (veja `adicionar-supervisores.js`). Solicitações antigas, criadas pela conta compartilhada SUPERVISOR, só aparecem para esse login, o CCO e o MESTRE. Anexos seguem a mesma regra.
5. **Evidência removida; Motivo + Observação em um campo só:** **MOTIVO/OBSERVAÇÃO**. Nos registros antigos nada é apagado: Evidência, Observação e lançada/correta continuam visíveis no detalhe ("registro anterior") e na exportação, e são reunidos nos campos novos quando o registro é editado.

## Contas dos supervisores (já incluídas)
Ao iniciar, o servidor cria sozinho, uma única vez, as 35 contas individuais de SUPERVISOR (login = e-mail sem "op." e sem @...; veja `logins.csv`). Senha inicial: `@prosecurity123` (marcada como SENHA INICIAL; peça para cada um trocar). Contas e dados que já existem não são alterados.

## Versão 3.2
- Novo perfil **GERENTE**: somente consulta, vê só as solicitações da(s) sua(s) área(s). Não cria, não edita, não trata, não exclui e não exporta (bloqueado no servidor também).
- **Jefferson (SIERRA/PAPA/MULTIRÃO):** consulta SIERRA e PAPA; no MULTIRÃO vê todos os chamados e também pode solicitar e editar os próprios pendentes.
- Novas áreas/sub áreas: **GSI** e **MULTIRÃO**.
- Contas criadas sozinhas na primeira partida (uma vez): 2 MESTRE (Gilson, Diogo), 7 CCO, 9 gerentes, 6 supervisores da GSI. Lista em `logins-v3.2.csv`.
- Senhas iniciais: MESTRE (as informadas), CCO `ccopro123`, gerentes `Gerenteop1234`, supervisores GSI `@prosecurity123`. Todas marcadas como SENHA INICIAL.
