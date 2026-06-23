# Relatorio de prontidao para producao

Gerado em: 2026-06-22 19:49 BRT  
Projeto novo: `C:\Desenvolvimento\mvp_pushbus_productionfull`  
Projeto fonte preservado: `C:\Desenvolvimento\mvp_pushbus`

## Escopo

O MVP original foi copiado para uma pasta separada, sem alterar a pasta fonte. Arquivos compactados foram ignorados. A regra de negocio, dados mockados, telas de pontos, mapa e mensagens foram preservados; as alteracoes ficaram concentradas em empacotamento Docker, runtime de producao, documentacao e smoke test.

## Versionamento

- `main`: baseline funcional copiado do MVP original.
- `production`: branch usada para implementar e testar Docker.
- `productionfull`: branch final esperada para envio ao GitHub.

O arquivo `.env` real permanece fora do Git. O repositorio versiona apenas `.env.example`.

## Itens adicionados

- `Dockerfile` com build multi-stage, `node:22-alpine`, usuario nao-root `node`, `tini` e `HEALTHCHECK`.
- `docker-compose.yml` para execucao local na porta 3000.
- `.dockerignore` excluindo segredos, dependencias, compactados e artefatos locais.
- `scripts/smoke-test.mjs` para validar endpoints e paginas principais.
- README atualizado com execucao Docker e comandos de operacao.
- Pagina `mapa.html` adicionada para visualizar todos os onibus nos pontos da linha 01A, com foco por select ou duplo clique no marcador.

## Ajustes de runtime

- `server.js` passou a aceitar `HOST` alem de `PORT`.
- Arquivos estaticos agora usam caminho absoluto baseado em `__dirname`.
- Header `X-Powered-By` do Express foi desabilitado.
- Encerramento limpo para `SIGTERM` e `SIGINT`.

## Validacao local antes do Docker

| Verificacao | Resultado |
| --- | --- |
| `npm ci` | OK, 71 pacotes instalados, 0 vulnerabilidades |
| `npm start` | OK, servidor na porta 3000 |
| `GET /api/health` | HTTP 200, `ok=true`, configuracao completa |
| `GET /` | HTTP 200, titulo `MVPPUSHBS` |
| `GET /linha-01a-pontos.html` | HTTP 200 |
| `GET /realtime-pontos.html` | HTTP 200 |
| Browser: selecionar Linha 01A | OK, exibiu acompanhamento, veiculo e 12 pontos |

## Validacao Docker

| Verificacao | Resultado |
| --- | --- |
| `docker build -t pushbus-mvp:productionfull .` | OK |
| Imagem | `pushbus-mvp:productionfull` |
| Image ID | `sha256:cfdcd3a3dbf718ce5e17308104c1fbcfc8a5167bc8f5ca817ba60f92516dc857` |
| Tamanho local | 58.2 MB |
| Usuario do container | `node` |
| Healthcheck | `/api/health`, intervalo 30s, timeout 5s |
| `docker compose up -d --build` | OK |
| Container | `pushbus-app-1` |
| Status | `Up ... (healthy)` |
| Porta | `0.0.0.0:3000->3000/tcp`, `[::]:3000->3000/tcp` |
| `GET /api/health` no container | HTTP 200, `ok=true` |
| Header `X-Powered-By` | Ausente |
| `npm run smoke` | OK em `/api/health`, `/`, `/linha-01a-pontos.html`, `/realtime-pontos.html`, `/manifest.webmanifest`, `/sw.js` |
| Browser em Docker: tela principal | OK |
| Browser em Docker: fluxo Linha 01A | OK |
| Browser em Docker: telas com mapa | OK em `linha-01a-pontos.html` e `realtime-pontos.html` |
| Console do browser apos teste filtrado por timestamp | 0 erros novos |

## Incremento: pagina mapa

Adicionado depois da primeira preparacao Docker:

- `public/mapa.html`
- `public/mapa.css`
- `public/mapa.js`

A pagina consulta `/api/vehicles/positions` com `lines: []` e `vehicles: []`, deixando o backend usar a lista padrao de veiculos sem aplicar `lineCode`. Isso permite localizar onibus mesmo quando a escalacao nao relaciona corretamente `001A`, `01A` ou `1A`.

Comportamento esperado:

- Plota todos os veiculos retornados pela API.
- Mantem os mesmos pontos da linha 01A.
- Permite colocar um onibus em foco pelo select.
- Permite colocar um onibus em foco com duplo clique rapido no marcador do mapa.
- Permite voltar para a opcao `Todos os onibus` e enquadrar todos os marcadores na tela.
- Todos os veiculos, selecionados ou nao, geram mensagem ao entrar no raio de um ponto.

Incremento posterior em `feature/mvppushbs-app-shell`:

- App renomeado para `MVPPUSHBS` no manifesto e nos metadados.
- Menu responsivo tipo sanduiche adicionado em todas as paginas.
- Registro de service worker feito em todas as paginas pelo menu compartilhado.
- Botao `Ativar push` adicionado na tela inicial.
- Horarios individuais dos pontos removidos da linha do tempo da tela inicial.
- Assets locais versionados com `?v=mvppushbs2` para evitar que um service worker antigo entregue JS/CSS desatualizado.
- Service worker atualizado para `mvppushbs-v0-0-3-shell`.

Fix posterior em `fix/mapa-controles-pontos`:

- `productionfull` recebeu a app shell por fast-forward antes da criacao da branch fix.
- Tela `mapa.html` removeu a lista lateral completa de pontos.
- Tela `mapa.html` ganhou select `Ponto em foco`, com destaque escuro no ponto selecionado.
- Tela `mapa.html` passou a aceitar `?ponto=<id>` e `?point=<id>` para abrir ja focada em um ponto.
- Linha entre pontos agora fica desligada por padrao e pode ser ativada em `Ligar pontos com linha`.
- Controles de camadas adicionados para raios dos pontos, pontos no mapa e onibus.
- Service worker atualizado para `mvppushbs-v0-0-4-map-controls`.

Validacao do fix em Docker:

- `docker compose up -d --build`: OK, container `healthy`.
- `npm run smoke`: OK.
- Browser em `/mapa.html`: lista lateral `#pointList` ausente.
- Select de ponto: 13 opcoes, sendo `Todos os pontos` + 12 pontos.
- Rota entre pontos: checkbox desligado por padrao; ao ligar, a camada da linha e adicionada.
- Raios dos pontos: checkbox ligado por padrao; ao desligar, os raios somem e os marcadores dos pontos permanecem.
- Foco por ponto: selecionar `hospital-unimed` destaca 1 ponto e suaviza os outros 11.
- URL `/mapa.html?ponto=hospital-unimed`: abre com o ponto selecionado e destacado.
- Erros novos de console na validacao: 0.

Validacao final da branch `feature/mvppushbs-app-shell` em Docker:

- `docker compose up -d --build`: OK, container `healthy`.
- `npm run smoke`: OK em `/api/health`, `/`, `/mapa.html`, `/linha-01a-pontos.html`, `/realtime-pontos.html`, `/manifest.webmanifest` e `/sw.js`.
- Tela inicial: titulo `MVPPUSHBS`, menu com Inicio/Mapa/Linha 01A/Tempo real, manifesto carregado e botao `Ativar push`.
- Tela inicial apos selecionar Linha 01A: 12 pontos renderizados e 0 elementos de horario individual na linha do tempo.
- Mapa: opcao inicial `Todos os onibus`, 25 marcadores, 25 veiculos, 12 pontos e 0 marcador em foco.
- Mapa apos selecionar um onibus: 1 marcador em foco.
- Mapa apos voltar para `Todos os onibus`: foco limpo, 25 marcadores visiveis e resumo `Todos os onibus no mapa`.
- Linha 01A e Tempo real: menu responsivo, manifesto e mapa carregados.
- Erros novos de console nas validacoes filtradas por timestamp: 0.

Validacao local em Docker:

- `npm run smoke`: OK, incluindo `/mapa.html`.
- Browser em `http://127.0.0.1:3000/mapa.html`: OK.
- Veiculos plotados na validacao: 25.
- Opcoes no select de onibus: 25.
- Pontos renderizados: 12.
- Marcador em foco apos selecao: 1.
- Duplo clique no marcador em foco: OK, popup aberto e onibus mantido em foco.
- Mensagens de passagem geradas na tela durante a validacao: 4.
- Erros novos de console apos validacao filtrada por timestamp: 0.

Observacao: durante a troca entre Node local e Docker, uma aba antiga que continuou aberta registrou erros `Failed to fetch` enquanto a porta 3000 estava sem servidor. A validacao final filtrada por timestamp no container nao apresentou erros novos.

## Como reproduzir

```bash
npm ci
docker compose up -d --build
npm run smoke
docker compose ps
```

Para parar:

```bash
docker compose down
```

## Recomendacoes para deploy

- Definir as variaveis de ambiente no provedor de producao ou secret manager.
- Nao publicar `.env` real no GitHub.
- Publicar a porta interna `3000` atras de proxy/TLS do ambiente.
- Monitorar `/api/health` no orquestrador.
- Revisar politica de CORS quando houver dominio publico definitivo.
