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
| `GET /` | HTTP 200, titulo `PushBus V0.0.1` |
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
- Todos os veiculos, selecionados ou nao, geram mensagem ao entrar no raio de um ponto.

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
