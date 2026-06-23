# MVPPUSHBS + Cittati/FLITS + Leaflet + Node

App local/PWA instalavel para acompanhar linhas, carros e pontos de onibus usando um proxy Node/Express com autenticacao na API Cittati/FLITS.

## Como rodar

```bash
npm install
copy .env.example .env
npm start
```

Servidor local padrao:

```text
http://localhost:3000
```

Se definir `PORT` no `.env`, troque `3000` pela porta configurada.

## Como rodar com Docker em producao

A branch `productionfull` usa `docker-compose.yml` para servidor com Traefik, rede externa `web` e TLS automatico. Crie o `.env` no servidor a partir do exemplo e preencha as variaveis da Cittati/FLITS e do host publico:

```powershell
copy .env.example .env
```

Variaveis principais de deploy:

```env
APP_HOST=mvp-pushbus.i9cidade.com.br
TRAEFIK_NETWORK=web
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_CERTRESOLVER=lets-encrypt
IMAGE_NAME=mvp-pushbus
IMAGE_TAG=productionfull
```

No servidor, a rede externa do Traefik precisa existir:

```bash
docker network create web
```

Suba o servico:

```bash
docker compose up -d --build
```

O Compose de producao nao publica `3000:3000` diretamente. O acesso publico deve passar pelo Traefik no host configurado em `APP_HOST`.

Para ver o estado:

```bash
docker compose ps
docker compose logs -f api
```

Comandos uteis:

```bash
docker compose ps
docker compose logs -f api
docker compose down
```

Para rodar na maquina local por `npm start`, use a branch `main`.

## Perfil de producao

- Imagem baseada em `node:22-alpine`.
- Instalacao deterministica com `npm ci --omit=dev`.
- Processo executando como usuario nao-root `node`.
- `tini` como entrypoint para tratamento correto de sinais.
- `HEALTHCHECK` HTTP em `/api/health`.
- `.dockerignore` exclui `.env`, `node_modules`, compactados e artefatos locais.
- Servidor aceita `HOST` e `PORT`, usando `HOST=0.0.0.0` no container.
- O header `X-Powered-By` do Express fica desabilitado.
- Compose de producao usa Traefik na rede externa `web`, sem bind direto da porta 3000.

Relatorio da validacao local: [`docs/production-readiness-report.md`](docs/production-readiness-report.md).

## Configuracao

No arquivo `.env`, preencha:

```env
CITTATI_BASE_URL=https://flits.cittati.com.br
CITTATI_APP_CODE=200
CITTATI_CLIENT_ID=1
CITTATI_COMPANY_ID=seu_company_id
CITTATI_USERNAME=seu_usuario
CITTATI_PASSWORD=sua_senha
```

Tambem e possivel usar `CITTATI_TOKEN` no lugar de `CITTATI_USERNAME` e `CITTATI_PASSWORD`.

Nao coloque usuario, senha ou token no JavaScript publico.

## Paginas locais

| Pagina | URL local | Descricao |
| --- | --- | --- |
| MVPPUSHBS | `http://localhost:3000/` | App principal instalavel no celular. Abre na lista de linhas e, ao selecionar uma linha, exibe a progressao dos pontos e o onibus/carro monitorado. Inclui botao para ativar push local. |
| MVPPUSHBS | `http://localhost:3000/index.html` | Mesma tela principal, acessada pelo arquivo HTML diretamente. |
| Mapa de todos os onibus | `http://localhost:3000/mapa.html` | Mapa com os mesmos pontos da linha 01A, mas consultando todos os veiculos padrao sem filtro de linha. Permite mostrar todos, focar um onibus, focar um ponto, ligar/desligar camadas do mapa e gerar mensagem quando qualquer onibus passa no ponto. |
| Pontos de onibus | `http://localhost:3000/pontos-onibus.html` | Lista pesquisavel dos pontos cadastrados. Ao clicar em um ponto, abre `mapa.html?ponto=<id>` com o ponto centralizado e destacado. |
| Linha 01A por ponto | `http://localhost:3000/linha-01a-pontos.html` | Tela com pontos da linha 01A, geofence, mapa dos veiculos filtrados e mensagens de entrada/saida dos pontos. |
| Onibus em tempo real por ponto | `http://localhost:3000/realtime-pontos.html` | Nova tela com um veiculo em tempo real, pontos no mapa, circulos de geofence e mensagem `Passou no ponto X` quando o veiculo entra no raio do ponto. |

Todas as paginas carregam um menu responsivo tipo sanduiche para navegar entre Inicio, Mapa, Pontos de onibus, Linha 01A e Tempo real.

Arquivos estaticos carregados pelas paginas:

```text
http://localhost:3000/style.css
http://localhost:3000/app.js
http://localhost:3000/pushbus.css
http://localhost:3000/pushbus.js
http://localhost:3000/pushbus-data.js
http://localhost:3000/manifest.webmanifest
http://localhost:3000/sw.js
http://localhost:3000/mapa.css
http://localhost:3000/mapa.js
http://localhost:3000/pontos-onibus.css
http://localhost:3000/pontos-onibus.js
http://localhost:3000/linha-01a-pontos.css
http://localhost:3000/linha-01a-pontos.js
http://localhost:3000/realtime-pontos.css
http://localhost:3000/realtime-pontos.js
http://localhost:3000/nav.css
http://localhost:3000/nav.js
```

## MVPPUSHBS

- A tela inicial mostra as linhas cadastradas e permite pesquisar por codigo/nome.
- A primeira versao vem com a Linha 01A/001A a partir da planilha `LEVANTAMENTO PONTOS DE ONIBUS.xlsx`.
- Ao selecionar a linha, o app consulta `/api/vehicles/positions` e mostra os pontos atendidos por aquela linha.
- O app identifica o onibus/carro retornado pela FLITS/Cittati e acompanha a progressao dos pontos.
- Quando o carro entra no raio de um ponto, o app registra `Passou no ponto X`.
- A progressao marca todos os pontos anteriores como concluidos quando um ponto mais adiante e detectado.
- Ao chegar no ponto final, todos os pontos ficam marcados por 30 segundos e a verificacao da linha e reiniciada.
- O app tem `manifest.webmanifest`, `sw.js`, icones e menu compartilhado para instalacao como PWA no celular.

Observacao: o arquivo `pushbus-geofence-leaflet(1).html` esta na raiz do projeto e nao e publicado pelo Express, porque o servidor usa apenas `express.static("public")`. Para acessar por `localhost`, mova esse arquivo para a pasta `public`.

## Endpoints locais

### GET `/api/health`

URL:

```text
http://localhost:3000/api/health
```

Verifica se a configuracao foi carregada e retorna o estado basico da autenticacao em memoria.

Exemplo de resposta:

```json
{
  "ok": true,
  "missingConfig": [],
  "baseUrl": "https://flits.cittati.com.br",
  "appCode": "200",
  "clientId": "1",
  "companyIdConfigured": true,
  "loginConfigured": true,
  "tokenInMemory": false,
  "tokenFresh": false,
  "expiresAt": null
}
```

### POST `/api/auth/login`

URL:

```text
http://localhost:3000/api/auth/login
```

Autentica no FLITS com as credenciais do `.env` e guarda o token em memoria no processo Node.

Corpo da requisicao:

```json
{}
```

Exemplo de resposta:

```json
{
  "ok": true,
  "expiresAt": "2026-06-20T15:00:00.000Z",
  "preference": {
    "userId": 123,
    "appCode": "200",
    "id": 456
  }
}
```

### POST `/api/vehicles/positions`

URL:

```text
http://localhost:3000/api/vehicles/positions
```

Consulta as ultimas posicoes dos veiculos no FLITS. Se o token expirar e houver usuario/senha configurados, o backend tenta autenticar novamente.

Corpo usado pela pagina principal para consultar os veiculos padrao:

```json
{
  "lines": [],
  "vehicles": []
}
```

Corpo usado pela pagina principal para consultar um veiculo especifico:

```json
{
  "lines": [],
  "vehicles": [129923]
}
```

Corpo usado pela pagina da linha 01A:

```json
{
  "lineCode": "01A"
}
```

Corpo usado pela pagina `mapa.html` para consultar todos os veiculos padrao sem filtro de linha:

```json
{
  "lines": [],
  "vehicles": []
}
```

Exemplo de resposta:

```json
{
  "count": 1,
  "updatedAt": "2026-06-20T15:00:00.000Z",
  "filter": {
    "lineCode": "01A"
  },
  "vehicles": [
    {
      "id": 129923,
      "prefix": "129923",
      "line": "01A",
      "route": "BAIRRO - CENTRO",
      "latitude": -23.5716,
      "longitude": -48.0252,
      "velocity": 32,
      "gpsDatetime": "2026-06-20T14:59:30.000Z"
    }
  ]
}
```

## APIs externas usadas pelo backend

Estas rotas nao sao acessadas diretamente pelo navegador; o `server.js` chama elas por meio do proxy local:

```text
POST https://flits.cittati.com.br/api/auth/authenticate
POST https://flits.cittati.com.br/api/mapView/findLastVehiclesPositions
```

## Observacoes

- O token fica apenas em memoria no processo Node.
- Ao reiniciar o servidor, a autenticacao precisa ser feita novamente.
- As paginas usam Leaflet via CDN (`https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`).
