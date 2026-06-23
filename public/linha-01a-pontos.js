const LINE_CODE = "01A";
const LINE_ALIASES = ["001A", "01A", "1A", "001", "01"];
const LINE_NEAR_STOP_RADIUS_METERS = 1200;
const DEFAULT_CENTER = [-23.5716, -48.0252];

const STOPS = [
  {
    id: "hospital-unimed",
    name: "Hospital Unimed",
    display: "HOSPITAL UNIMED",
    address: "Av. Wenceslau Braz - sentido centro",
    type: "ABRIGO",
    lat: -23.56055431668441,
    lng: -48.01244525902669,
    plannedTime: "05:50"
  },
  {
    id: "cohab-estancia",
    name: "Cohab Estancia 4 Irmaos",
    display: "COHAB ESTANCIA 4 IRMAOS",
    address: "Rotatoria - sentido centro",
    type: "ABRIGO",
    lat: -23.56461184211462,
    lng: -48.01586334332148,
    plannedTime: "05:53"
  },
  {
    id: "igreja-carmo",
    name: "Igreja Nossa Senhora do Carmo",
    display: "IGREJA NOSSA SENHORA DO CARMO",
    address: "Av. Wenceslau Braz - sentido centro",
    type: "ABRIGO",
    lat: -23.565261657312014,
    lng: -48.017521891254425,
    plannedTime: "05:55"
  },
  {
    id: "prefeitura",
    name: "Prefeitura Municipal",
    display: "PREFEITURA MUNICIPAL",
    address: "R. Carlos Cardoso - sentido centro",
    type: "ABRIGO",
    lat: -23.570429930319264,
    lng: -48.02053370655511,
    plannedTime: "05:58"
  },
  {
    id: "tres-poderes",
    name: "Praca dos Tres Poderes",
    display: "PRACA DOS TRES PODERES",
    address: "R. Carlos Cardoso - sentido centro",
    type: "ABRIGO",
    lat: -23.57174793791974,
    lng: -48.022839449607304,
    plannedTime: "06:00"
  },
  {
    id: "cambara",
    name: "Residencial Cambara",
    display: "RESIDENCIAL CAMBARA",
    address: "Av. Wenceslau Braz - sentido centro",
    type: "ABRIGO",
    lat: -23.572341683943222,
    lng: -48.02627407946567,
    plannedTime: "06:03"
  },
  {
    id: "igreja-sao-joao",
    name: "Igreja Sao Joao Batista",
    display: "IGREJA SAO JOAO BATISTA",
    address: "R. Antonio Avelino da Costa - sentido centro",
    type: "ABRIGO",
    lat: -23.572860341973797,
    lng: -48.030278023827044,
    plannedTime: "06:05"
  },
  {
    id: "vila-aurora",
    name: "Vila Aurora",
    display: "VILA AURORA",
    address: "R. Antonio Anunciato - sentido centro",
    type: "PLACA",
    lat: -23.575161788526295,
    lng: -48.033304907330695,
    plannedTime: "06:07"
  },
  {
    id: "portinari",
    name: "Edificio Portinari",
    display: "EDIFICIO PORTINARI",
    address: "R. Antonio Anunciato - sentido centro",
    type: "PLACA",
    lat: -23.57694284963109,
    lng: -48.03269856993608,
    plannedTime: "06:09"
  },
  {
    id: "parque-lagoa",
    name: "Parque da Lagoa",
    display: "PARQUE DA LAGOA",
    address: "R. Dr. Coutinho - sentido centro",
    type: "ABRIGO",
    lat: -23.577943565893037,
    lng: -48.033917897389706,
    plannedTime: "06:11"
  },
  {
    id: "vila-grace",
    name: "Vila Grace",
    display: "VILA GRACE",
    address: "R. Senador Jose Hermirio de Moraes - sentido centro",
    type: "ABRIGO",
    lat: -23.579379711422494,
    lng: -48.033981114896186,
    plannedTime: "06:13"
  },
  {
    id: "meia-lua",
    name: "Meia Lua Rodoviaria",
    display: "MEIA LUA RODOVIARIA",
    address: "R. Saturnino Gonzales - sentido centro",
    type: "INTEGRACAO",
    lat: -23.581101124478643,
    lng: -48.03227304173673,
    plannedTime: "06:15"
  }
].map(stop => ({
  ...stop,
  radiusEnter: 42,
  radiusExit: 70
}));

const stopById = new Map(STOPS.map(stop => [stop.id, stop]));
const route = STOPS.map(stop => [stop.lat, stop.lng]);

const els = {
  status: document.querySelector("#status"),
  updatedAt: document.querySelector("#updatedAt"),
  pointList: document.querySelector("#pointList"),
  eventList: document.querySelector("#eventList"),
  vehicleCount: document.querySelector("#vehicleCount"),
  pointCount: document.querySelector("#pointCount"),
  messageCount: document.querySelector("#messageCount"),
  eventHeadline: document.querySelector("#eventHeadline"),
  eventDetail: document.querySelector("#eventDetail"),
  btnLogin: document.querySelector("#btnLogin"),
  btnRefresh: document.querySelector("#btnRefresh"),
  btnNotify: document.querySelector("#btnNotify"),
  btnFit: document.querySelector("#btnFit"),
  refreshInterval: document.querySelector("#refreshInterval")
};

const map = L.map("map", { zoomControl: false }).setView(DEFAULT_CENTER, 14);
L.control.zoom({ position: "bottomleft" }).addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  maxZoom: 20,
  subdomains: "abcd",
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
}).addTo(map);

L.polyline(route, {
  color: "#16833a",
  weight: 5,
  opacity: 0.85,
  lineCap: "round",
  lineJoin: "round"
}).addTo(map);

const stopLayer = L.layerGroup().addTo(map);
const vehicleMarkers = new Map();
const vehicleStates = new Map();
const messagesByStop = new Map();
const events = [];

let timer = null;
let refreshInFlight = false;
let notificationsEnabled = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR");
}

function formatClock(value = new Date()) {
  return value.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "-";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function etaLabel(meters, velocity) {
  if (!Number.isFinite(meters)) return "-";
  if (meters <= 45) return "agora";

  const safeVelocity = Number(velocity);
  const kmh = Number.isFinite(safeVelocity) && safeVelocity >= 8 ? safeVelocity : 18;
  const minutes = Math.max(1, Math.round((meters / 1000 / kmh) * 60));

  return `${minutes} min`;
}

function vehicleKey(vehicle) {
  return String(vehicle.id || vehicle.prefix || `${vehicle.latitude},${vehicle.longitude}`);
}

function vehicleLabel(vehicle) {
  return vehicle.prefix || vehicle.id || "01A";
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
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function distanceVehicleStop(vehicle, stop) {
  return distanceMeters([vehicle.latitude, vehicle.longitude], [stop.lat, stop.lng]);
}

function lineStopPayload() {
  return STOPS.map(stop => ({
    id: stop.id,
    lat: stop.lat,
    lng: stop.lng,
    radius: stop.radiusExit || stop.radiusEnter
  }));
}

function markerIcon(vehicle) {
  return L.divIcon({
    className: "",
    html: `<div class="vehicle-pin">${escapeHtml(vehicleLabel(vehicle))}</div>`,
    iconSize: [48, 34],
    iconAnchor: [24, 17]
  });
}

function popupHtml(vehicle) {
  return `
    <strong>Carro ${escapeHtml(vehicleLabel(vehicle))}</strong><br>
    Linha: ${escapeHtml(vehicle.line || "-")}<br>
    Rota: ${escapeHtml(vehicle.route || "-")}<br>
    Velocidade: ${escapeHtml(vehicle.velocity ?? "-")} km/h<br>
    GPS: ${escapeHtml(formatDateTime(vehicle.gpsDatetime))}<br>
    Ultimo ponto: ${escapeHtml(vehicle.lastPointName || "-")}
  `;
}

function stopIcon() {
  return L.divIcon({
    className: "",
    html: "<div class=\"stop-pin\"></div>",
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function renderStopMarkers() {
  stopLayer.clearLayers();

  STOPS.forEach((stop, index) => {
    L.circle([stop.lat, stop.lng], {
      radius: stop.radiusExit,
      color: "#16833a",
      weight: 1,
      fillColor: "#20b64b",
      fillOpacity: 0.08
    }).addTo(stopLayer);

    L.marker([stop.lat, stop.lng], { icon: stopIcon() })
      .bindPopup(`
        <strong>${escapeHtml(index + 1)}. ${escapeHtml(stop.display)}</strong><br>
        ${escapeHtml(stop.address)}<br>
        Tipo: ${escapeHtml(stop.type)}<br>
        Raio: ${stop.radiusEnter}m entrada / ${stop.radiusExit}m saida
      `)
      .addTo(stopLayer);
  });
}

function fitAll() {
  const bounds = L.latLngBounds(route);
  vehicleMarkers.forEach(marker => bounds.extend(marker.getLatLng()));
  map.fitBounds(bounds, { padding: [36, 36] });
}

function renderVehicleMarkers(vehicles) {
  const active = new Set();

  vehicles.forEach(vehicle => {
    const key = vehicleKey(vehicle);
    const latlng = [vehicle.latitude, vehicle.longitude];
    active.add(key);

    if (vehicleMarkers.has(key)) {
      vehicleMarkers.get(key)
        .setLatLng(latlng)
        .setIcon(markerIcon(vehicle))
        .setPopupContent(popupHtml(vehicle));
    } else {
      const marker = L.marker(latlng, { icon: markerIcon(vehicle) })
        .bindPopup(popupHtml(vehicle))
        .addTo(map);
      vehicleMarkers.set(key, marker);
    }
  });

  for (const [key, marker] of vehicleMarkers.entries()) {
    if (!active.has(key)) {
      marker.remove();
      vehicleMarkers.delete(key);
    }
  }
}

function nearestVehicleForStop(stop, vehicles) {
  return vehicles
    .map(vehicle => ({
      vehicle,
      distance: distanceVehicleStop(vehicle, stop)
    }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function nearestEnteringStop(vehicle) {
  return STOPS
    .map(stop => ({
      stop,
      distance: distanceVehicleStop(vehicle, stop)
    }))
    .filter(item => item.distance <= item.stop.radiusEnter)
    .sort((a, b) => a.distance - b.distance)[0]?.stop || null;
}

function pointBadge(nearest, stop) {
  if (!nearest) return { label: "Sem carro", className: "empty" };
  if (nearest.distance <= stop.radiusEnter) return { label: "Chegando", className: "arriving" };
  if (nearest.distance <= 250) return { label: "Proximo", className: "near" };
  if (nearest.distance <= 1200) return { label: "A caminho", className: "" };
  return { label: "Distante", className: "warning" };
}

function renderPointList(vehicles) {
  els.pointList.innerHTML = "";

  STOPS.forEach((stop, index) => {
    const nearest = nearestVehicleForStop(stop, vehicles);
    const badge = pointBadge(nearest, stop);
    const card = document.createElement("article");
    card.className = "point-card";

    const vehicleText = nearest
      ? `Carro ${escapeHtml(vehicleLabel(nearest.vehicle))} a ${formatDistance(nearest.distance)} - ETA ${etaLabel(nearest.distance, nearest.vehicle.velocity)}`
      : "Nenhum carro da linha ou proximo deste ponto retornado agora.";

    const lastMessage = messagesByStop.get(stop.id) || "Sem mensagem disparada neste ponto.";

    card.innerHTML = `
      <div class="point-index">${index + 1}</div>
      <div>
        <div class="point-title">
          <span>${escapeHtml(stop.display)}</span>
          <span class="badge ${badge.className}">${escapeHtml(badge.label)}</span>
        </div>
        <div class="point-meta">
          ${escapeHtml(stop.plannedTime)} - ${escapeHtml(stop.type)} - ${escapeHtml(stop.address)}
        </div>
        <div class="point-message">${vehicleText}<br>${escapeHtml(lastMessage)}</div>
      </div>
    `;

    card.addEventListener("click", () => {
      map.setView([stop.lat, stop.lng], 17);
    });

    els.pointList.appendChild(card);
  });
}

function renderEventList() {
  els.messageCount.textContent = String(events.length);

  if (!events.length) {
    els.eventList.innerHTML = "<div class=\"empty-state\">As mensagens aparecem aqui quando um carro 01A entra ou sai do raio de um ponto.</div>";
    return;
  }

  els.eventList.innerHTML = events.map(event => `
    <article class="event-card">
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(event.detail)}</span>
    </article>
  `).join("");
}

function sendBrowserNotification(event) {
  if (!notificationsEnabled || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification(event.title, {
    body: event.detail,
    tag: event.id
  });
}

function pushEvent(kind, vehicle, stop) {
  const now = new Date();
  const label = vehicleLabel(vehicle);
  const title = kind === "enter"
    ? `Carro ${label} chegando em ${stop.name}`
    : `Carro ${label} saiu de ${stop.name}`;
  const detail = `${formatClock(now)} - Linha ${LINE_CODE} - ${stop.display} - ${formatDistance(distanceVehicleStop(vehicle, stop))} do ponto.`;
  const event = {
    id: `${Date.now()}-${vehicleKey(vehicle)}-${stop.id}-${kind}`,
    title,
    detail,
    stopId: stop.id,
    createdAt: now
  };

  events.unshift(event);
  if (events.length > 40) events.pop();

  messagesByStop.set(stop.id, `${formatClock(now)} - ${kind === "enter" ? "Chegada detectada" : "Saida detectada"} do carro ${label}.`);
  els.eventHeadline.textContent = title;
  els.eventDetail.textContent = detail;

  renderEventList();
  sendBrowserNotification(event);
}

function detectMessages(vehicles) {
  const active = new Set();

  vehicles.forEach(vehicle => {
    const key = vehicleKey(vehicle);
    const previous = vehicleStates.get(key) || { insideStopId: null, lastSeen: 0 };
    const previousStop = previous.insideStopId ? stopById.get(previous.insideStopId) : null;
    let insideStop = null;

    active.add(key);

    if (previousStop) {
      const distance = distanceVehicleStop(vehicle, previousStop);
      if (distance < previousStop.radiusExit) {
        insideStop = previousStop;
      } else {
        pushEvent("exit", vehicle, previousStop);
      }
    }

    if (!insideStop) {
      const enteringStop = nearestEnteringStop(vehicle);
      if (enteringStop && previous.insideStopId !== enteringStop.id) {
        pushEvent("enter", vehicle, enteringStop);
      }
      insideStop = enteringStop;
    }

    vehicleStates.set(key, {
      insideStopId: insideStop ? insideStop.id : null,
      lastSeen: Date.now()
    });
  });

  for (const [key, state] of vehicleStates.entries()) {
    if (!active.has(key) && Date.now() - state.lastSeen > 120000) {
      vehicleStates.delete(key);
    }
  }
}

async function apiPost(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }

  return data;
}

async function login() {
  els.status.textContent = "Autenticando no FLITS...";
  const data = await apiPost("/api/auth/login");
  els.status.textContent = `Autenticado. Token valido ate ${formatDateTime(data.expiresAt)}.`;
}

async function fetchPositions() {
  return apiPost("/api/vehicles/positions", {
    lineCode: LINE_CODE,
    lineAliases: LINE_ALIASES,
    lineStops: lineStopPayload(),
    nearStopRadiusMeters: LINE_NEAR_STOP_RADIUS_METERS,
    allVehicles: true
  });
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  els.status.textContent = `Consultando carros da linha ${LINE_CODE} e proximos dos pontos...`;

  try {
    const data = await fetchPositions();
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];

    detectMessages(vehicles);
    renderVehicleMarkers(vehicles);
    renderPointList(vehicles);

    els.vehicleCount.textContent = String(vehicles.length);
    els.pointCount.textContent = String(STOPS.length);
    els.updatedAt.textContent = formatDateTime(data.updatedAt);

    if (vehicles.length) {
      els.status.textContent = `${vehicles.length} carro(s) da linha ${LINE_CODE} ou proximos dos pontos atualizados em ${formatDateTime(data.updatedAt)}.`;
    } else {
      els.status.textContent = `Nenhum carro da linha ${LINE_CODE}, aliases ${LINE_ALIASES.join(", ")} ou proximo dos pontos retornou agora.`;
      els.eventHeadline.textContent = `Sem carros ${LINE_CODE} na ultima consulta`;
      els.eventDetail.textContent = `Atualizado em ${formatDateTime(data.updatedAt)}.`;
    }
  } catch (err) {
    console.error(err);
    els.status.textContent = `Erro ao consultar linha ${LINE_CODE}: ${err.message}`;
    els.eventHeadline.textContent = "Falha na consulta";
    els.eventDetail.textContent = err.message;
  } finally {
    refreshInFlight = false;
  }
}

function setupTimer() {
  if (timer) clearInterval(timer);

  const interval = Number(els.refreshInterval.value);
  if (interval > 0) {
    timer = setInterval(refresh, interval);
  }
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    els.status.textContent = "Este navegador nao suporta notificacoes.";
    return;
  }

  const permission = await Notification.requestPermission();
  notificationsEnabled = permission === "granted";
  els.btnNotify.textContent = notificationsEnabled ? "Notificacoes ativas" : "Notificacoes bloqueadas";
}

els.btnLogin.addEventListener("click", async () => {
  try {
    await login();
    await refresh();
  } catch (err) {
    console.error(err);
    els.status.textContent = `Erro no login: ${err.message}`;
  }
});

els.btnRefresh.addEventListener("click", refresh);
els.btnNotify.addEventListener("click", enableNotifications);
els.btnFit.addEventListener("click", fitAll);
els.refreshInterval.addEventListener("change", setupTimer);

renderStopMarkers();
renderPointList([]);
renderEventList();
fitAll();
setupTimer();
refresh();
