require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const CITTATI_BASE_URL = process.env.CITTATI_BASE_URL || "https://flits.cittati.com.br";
const CITTATI_APP_CODE = process.env.CITTATI_APP_CODE || "200";
const CITTATI_CLIENT_ID = process.env.CITTATI_CLIENT_ID || "1";
const CITTATI_COMPANY_ID = process.env.CITTATI_COMPANY_ID || "";
const CITTATI_USERNAME = process.env.CITTATI_USERNAME || "";
const CITTATI_PASSWORD = process.env.CITTATI_PASSWORD || "";

let authState = {
  accessToken: process.env.CITTATI_TOKEN || "",
  expiresAt: 0,
  preference: null
};

const DEFAULT_VEHICLES = [
  129923, 129922, 129616, 129615, 129614, 129991, 129607, 119919, 119917,
  129606, 119968, 119403, 113995, 119920, 119918, 129987, 119916, 119389,
  129988, 119915, 119387, 129992, 129989, 129956, 129955
];

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function missingConfig() {
  const missing = [];

  if (!CITTATI_COMPANY_ID) missing.push("CITTATI_COMPANY_ID");

  const hasStaticToken = Boolean(authState.accessToken);
  const hasLogin = Boolean(CITTATI_USERNAME && CITTATI_PASSWORD);

  if (!hasStaticToken && !hasLogin) {
    missing.push("CITTATI_USERNAME/CITTATI_PASSWORD ou CITTATI_TOKEN");
  }

  return missing;
}

function isTokenFresh() {
  return Boolean(authState.accessToken && authState.expiresAt && Date.now() < authState.expiresAt - 60_000);
}

async function authenticate() {
  if (!CITTATI_USERNAME || !CITTATI_PASSWORD) {
    if (authState.accessToken) return authState.accessToken;
    throw new Error("Informe CITTATI_USERNAME/CITTATI_PASSWORD ou CITTATI_TOKEN no .env");
  }

  const form = new FormData();
  form.append("client_id", "cittati");
  form.append("scope", "flits flits_fret");
  form.append("password", CITTATI_PASSWORD);
  form.append("username", CITTATI_USERNAME);

  const response = await fetch(`${CITTATI_BASE_URL}/api/auth/authenticate`, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      "AppCode": CITTATI_APP_CODE,
      "ClientId": CITTATI_CLIENT_ID
    },
    body: form
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Falha no login FLITS: HTTP ${response.status} - ${text.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Login FLITS não retornou JSON: ${text.slice(0, 300)}`);
  }

  if (!data.access_token) {
    throw new Error("Login FLITS não retornou access_token");
  }

  authState = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    preference: data.preference || null
  };

  return authState.accessToken;
}

async function getAccessToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && isTokenFresh()) return authState.accessToken;

  if (!forceRefresh && authState.accessToken && !CITTATI_USERNAME) {
    return authState.accessToken;
  }

  return authenticate();
}

function normalizeVehicle(v) {
  return {
    id: v.companyVehicleId,
    prefix: v.companyVehiclePrefix || String(v.companyVehicleId || ""),
    company: v.companyName || "",
    lineId: v.companyLineId,
    line: v.companyLineDescription || "",
    routeId: v.tripRouteId,
    route: v.tripRouteDescription || "",
    direction: v.direction || "",
    velocity: v.velocity ?? null,
    ignition: Boolean(v.ignition),
    accessibility: Boolean(v.hasAcessibility),
    vehicleType: v.vehicleType || "",
    latitude: Number(v.latitude),
    longitude: Number(v.longitude),
    gpsDatetime: v.gpsDatetime || "",
    transmissionDateTime: v.transmissionDateTime || "",
    lastPointName: v.lastGeographicPointName || "",
    lastPointAddress: v.lastGeographicPointAdrres || "",
    raw: v
  };
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeCodeText(value) {
  return normalizeSearchText(value).replace(/[^A-Z0-9]/g, "");
}

function addLineCodeVariants(variants, value) {
  const normalized = normalizeCodeText(value);
  if (!normalized) return;

  variants.add(normalized);

  const match = normalized.match(/^(\d+)([A-Z]+)?$/);
  if (!match) return;

  const digits = match[1];
  const suffix = match[2] || "";
  const trimmedDigits = digits.replace(/^0+/, "") || "0";
  const widths = new Set([digits.length, 2, 3]);

  widths.forEach(width => {
    if (trimmedDigits.length <= width) {
      variants.add(`${trimmedDigits.padStart(width, "0")}${suffix}`);
      variants.add(trimmedDigits.padStart(width, "0"));
    }
  });

  if (suffix) variants.add(`${trimmedDigits}${suffix}`);
  if (digits.length > 1) variants.add(trimmedDigits);
}

function lineCodeVariants(lineCodes) {
  const variants = new Set();
  const values = Array.isArray(lineCodes) ? lineCodes : [lineCodes];

  values.forEach(value => addLineCodeVariants(variants, value));

  return [...variants];
}

function lineCandidateValues(value) {
  const normalized = normalizeSearchText(value);
  const compact = normalizeCodeText(value);
  const tokens = normalized
    .replace(/[^A-Z0-9]+/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  return [compact, ...tokens].filter(Boolean);
}

function candidateMatchesVariant(candidate, variant) {
  if (candidate === variant) return true;
  if (variant.length < 3) return false;
  return candidate.includes(variant);
}

function lineMatches(vehicle, lineCodes) {
  const expected = lineCodeVariants(lineCodes);
  if (!expected.length) return true;

  return [
    vehicle.line,
    vehicle.route,
    vehicle.lineId,
    vehicle.routeId
  ].some(value => lineCandidateValues(value)
    .some(candidate => expected.some(code => candidateMatchesVariant(candidate, code))));
}

function toRad(value) {
  return value * Math.PI / 180;
}

function distanceMeters(a, b) {
  const radius = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function parseLineStops(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map(stop => ({
      id: stop.id || "",
      lat: Number(stop.lat),
      lng: Number(stop.lng),
      radius: Number(stop.radius)
    }))
    .filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}

function nearestLineStopDistance(vehicle, stops) {
  if (!stops.length) return null;

  return stops
    .map(stop => ({
      stop,
      distance: distanceMeters([vehicle.latitude, vehicle.longitude], [stop.lat, stop.lng])
    }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function vehicleListFromApiData(data) {
  return Array.isArray(data) ? data : (data.items || data.data || data.list || []);
}

async function fetchPositionsWithToken(token, payload) {
  return fetch(`${CITTATI_BASE_URL}/api/mapView/findLastVehiclesPositions`, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Authorization": `Bearer ${token}`,
      "CompanyId": CITTATI_COMPANY_ID,
      "AppCode": CITTATI_APP_CODE,
      "ClientId": CITTATI_CLIENT_ID
    },
    body: JSON.stringify(payload)
  });
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    missingConfig: missingConfig(),
    baseUrl: CITTATI_BASE_URL,
    appCode: CITTATI_APP_CODE,
    clientId: CITTATI_CLIENT_ID,
    companyIdConfigured: Boolean(CITTATI_COMPANY_ID),
    loginConfigured: Boolean(CITTATI_USERNAME && CITTATI_PASSWORD),
    tokenInMemory: Boolean(authState.accessToken),
    tokenFresh: isTokenFresh(),
    expiresAt: authState.expiresAt ? new Date(authState.expiresAt).toISOString() : null
  });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const missing = missingConfig();
    if (missing.length) {
      return res.status(500).json({ error: "Configuração incompleta no .env", missing });
    }

    await authenticate();

    res.json({
      ok: true,
      expiresAt: authState.expiresAt ? new Date(authState.expiresAt).toISOString() : null,
      preference: authState.preference
        ? {
            userId: authState.preference.userId,
            appCode: authState.preference.appCode,
            id: authState.preference.id
          }
        : null
    });
  } catch (err) {
    res.status(401).json({ error: "Não foi possível autenticar", message: err.message });
  }
});

app.post("/api/vehicles/positions", async (req, res) => {
  try {
    const missing = missingConfig();
    if (missing.length) {
      return res.status(500).json({ error: "Configuração incompleta no .env", missing });
    }

    const requestedVehicles = Array.isArray(req.body.vehicles)
      ? req.body.vehicles.map(Number).filter(Number.isFinite)
      : [];
    const allVehicles = req.body.allVehicles === true;
    const payload = {
      lines: Array.isArray(req.body.lines) ? req.body.lines : [],
      vehicles: requestedVehicles.length
        ? requestedVehicles
        : allVehicles
          ? []
          : DEFAULT_VEHICLES
    };
    const lineCode = typeof req.body.lineCode === "string" ? req.body.lineCode.trim() : "";
    const lineAliases = Array.isArray(req.body.lineAliases)
      ? req.body.lineAliases.map(value => String(value || "").trim()).filter(Boolean)
      : [];
    const lineFilter = [lineCode, ...lineAliases].filter(Boolean);
    const lineStops = parseLineStops(req.body.lineStops);
    const requestedNearStopRadiusMeters = Number(req.body.nearStopRadiusMeters || 0);
    const nearStopRadiusMeters = Number.isFinite(requestedNearStopRadiusMeters)
      ? Math.max(0, Math.min(requestedNearStopRadiusMeters, 5000))
      : 0;

    let token = await getAccessToken();
    let response = await fetchPositionsWithToken(token, payload);

    if (response.status === 401 && CITTATI_USERNAME && CITTATI_PASSWORD) {
      token = await getAccessToken({ forceRefresh: true });
      response = await fetchPositionsWithToken(token, payload);
    }

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro ao consultar API Cittati/FLITS",
        status: response.status,
        body: text.slice(0, 1000)
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "Resposta não veio em JSON", body: text.slice(0, 1000) });
    }

    let list = vehicleListFromApiData(data);

    if (!list.length && allVehicles && !requestedVehicles.length && DEFAULT_VEHICLES.length) {
      payload.vehicles = DEFAULT_VEHICLES;
      response = await fetchPositionsWithToken(token, payload);
      const fallbackText = await response.text();

      if (!response.ok) {
        return res.status(response.status).json({
          error: "Erro ao consultar API Cittati/FLITS",
          status: response.status,
          body: fallbackText.slice(0, 1000)
        });
      }

      try {
        data = JSON.parse(fallbackText);
      } catch {
        return res.status(502).json({ error: "Resposta nÃ£o veio em JSON", body: fallbackText.slice(0, 1000) });
      }

      list = vehicleListFromApiData(data);
    }

    const vehicles = list
      .map(normalizeVehicle)
      .filter(v => Number.isFinite(v.latitude) && Number.isFinite(v.longitude))
      .map(vehicle => {
        const nearest = nearestLineStopDistance(vehicle, lineStops);
        const lineMatch = lineMatches(vehicle, lineFilter);
        const nearbyLineStop = Boolean(nearest && nearStopRadiusMeters && nearest.distance <= nearStopRadiusMeters);

        return {
          ...vehicle,
          lineMatch,
          nearbyLineStop,
          nearestLineStopDistance: nearest ? Math.round(nearest.distance) : null,
          nearestLineStopId: nearest?.stop?.id || null
        };
      })
      .filter(vehicle => {
        if (!lineFilter.length && !lineStops.length) return true;
        return vehicle.lineMatch || vehicle.nearbyLineStop;
      });

    res.json({
      count: vehicles.length,
      updatedAt: new Date().toISOString(),
      filter: {
        lineCode: lineCode || null,
        lineAliases,
        lineVariants: lineCodeVariants(lineFilter),
        nearStopRadiusMeters: nearStopRadiusMeters || null,
        allVehicles,
        fallbackDefaultVehicles: allVehicles && !requestedVehicles.length && payload.vehicles.length > 0
      },
      vehicles
    });
  } catch (err) {
    res.status(500).json({ error: "Falha interna no proxy", message: err.message });
  }
});

const server = app.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Painel rodando em http://${displayHost}:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando servidor HTTP...`);
  server.close(() => {
    console.log("Servidor HTTP encerrado.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
