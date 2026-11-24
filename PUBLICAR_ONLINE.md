# Publicar online COM anexos e dados compartilhados

O GitHub Pages NÃO serve: ele só entrega páginas. É preciso rodar o `server.js` (Node) num servidor com disco.

## Opção A — Render (mais simples)
1. Suba esta pasta para um repositório PRIVADO no GitHub (o `.gitignore` já exclui `dados/` e os arquivos de logins).
2. No Render: New > Blueprint > escolha o repositório. Ele lê o `render.yaml` (serviço + disco de 5 GB em /var/data).
3. Abra o endereço https://... que o Render mostrar. As contas são criadas na primeira partida.
Custo: serviço pago + disco (sem disco os dados e anexos se perdem a cada reinício).

## Opção B — servidor da empresa (o que já existia)
Rode `iniciar.bat` no computador da rede (http://192.168.3.2:3000). Sem custo; só funciona dentro da rede.

## Importante
- Faça cópia periódica da pasta de dados (`dados/`, inclusive `dados/anexos/`).
- Peça para todos trocarem a senha inicial no primeiro acesso.
