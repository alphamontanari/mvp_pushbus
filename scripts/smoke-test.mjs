#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

const pageChecks = [
  { path: "/", title: "PushBus V0.0.1" },
  { path: "/mapa.html", title: "Mapa - Todos os onibus" },
  { path: "/linha-01a-pontos.html", title: "Linha 01A - Pontos de Onibus" },
  { path: "/realtime-pontos.html", title: "&Ocirc;nibus em tempo real por ponto" },
  { path: "/manifest.webmanifest", contains: "PushBus" },
  { path: "/sw.js", contains: "pushbus-v0-0-1-flow-mapa" }
];

async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const results = [];

  const health = await request("/api/health");
  assert(health.response.ok, `/api/health retornou HTTP ${health.response.status}`);
  const healthJson = JSON.parse(health.body);
  assert(healthJson.ok === true, "/api/health nao retornou ok=true");
  results.push({ path: "/api/health", status: health.response.status, ok: healthJson.ok });

  for (const check of pageChecks) {
    const { response, body } = await request(check.path);
    assert(response.ok, `${check.path} retornou HTTP ${response.status}`);

    if (check.title) {
      const titleMatch = body.match(/<title>(.*?)<\/title>/i);
      assert(titleMatch?.[1] === check.title, `${check.path} nao contem o titulo esperado`);
    }

    if (check.contains) {
      assert(body.includes(check.contains), `${check.path} nao contem '${check.contains}'`);
    }

    results.push({ path: check.path, status: response.status });
  }

  console.log(`Smoke test OK em ${baseUrl}`);
  console.table(results);
}

run().catch(error => {
  console.error(`Smoke test falhou: ${error.message}`);
  process.exit(1);
});
