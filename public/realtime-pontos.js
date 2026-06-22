const DEFAULT_CENTER = [-23.5716, -48.0252];

const DEFAULT_VEHICLES = [
  129923, 129922, 129616, 129615, 129614, 129991, 129607, 119919, 119917,
  129606, 119968, 119403, 113995, 119920, 119918, 129987, 119916, 119389,
  129988, 119915, 119387, 129992, 129989, 129956, 129955
];

const BUS_STOPS = [
  {
    id: "hospital-unimed",
    name: "Hospital Unimed",
    display: "HOSPITAL UNIMED - AV. WENCESLAU BRAZ - SENTIDO CENTRO",
    type: "ABRIGO",
    lat: -23.56055431668441,
    lng: -48.01244525902669,
    radius: 80
  },
  {
    id: "cohab-estancia-4-irmaos",
    name: "Cohab Est\u00e2ncia 4 Irm\u00e3os",
    display: "COHAB EST\u00c2NCIA 4 IRM\u00c3OS - ROTAT\u00d3RIA - SENTIDO CENTRO",
    type: "ABRIGO",
    lat: -23.56461184211462,
    lng: -48.01586334332148,
    radius: 80
  },
  {
    id: "igreja-nossa-senhora-do-carmo",
    name: "Igreja Nossa Senhora do Carmo",
    display: "IGREJA NOSSA SENHORA DO CARMO - AV. WENCESLAU BRAZ - SENTIDO CENTRO",
    type: "ABRIGO",
    lat: -23.565261657312014,
    lng: -48.017521891254425,
    radius: 80
  },
  {
    id: "prefeitura-municipal",
    name: "Prefeitura Municipal",
    display: "PREFEITURA MUNICIPAL - R. CARLOS CARDOSO - SENTIDO CENTRO",
    type: "ABRIGO",
    lat: -23.570429930319264,
    lng: -48.02053370655511,
    radius: 80
  },
  {
    id: "praca-dos-tres-poderes",
    name: "Pra\u00e7a dos Tr\u00eas Poderes",
    display: "PRA\u00c7A DOS TR\u00caS PODERES - R. CARLOS CARDOSO - SENTIDO CENTRO",
    type: "ABRIGO",
    lat: -23.57174793791974,
    lng: -48.022839449607304,
    radius: 80
  },
  {
    id: "residencial-cambara",
    name: "Residencial Cambar\u00e1",
    display: "RESIDENCIAL CAMBAR\u00c1",
    type: "PONTO",
    lat: -23.572341683943222,
    lng: -48.02627407946567,
    radius: 80
  },
  {
    id: "ponto-07",
    name: "Ponto 07",
    display: "PONTO 07",
    type: "PONTO",
    lat: -23.572860341973797,
    lng: -48.030278023827044,
    radius: 80
  },
  {
    id: "ponto-08",
    name: "Ponto 08",
    display: "PONTO 08",
    type: "PONTO",
    lat: -23.575161788526295,
    lng: -48.033304907330695,
    radius: 80
  },
  {
    id: "ponto-09",
    name: "Ponto 09",
    display: "PONTO 09",
    type: "PONTO",
    lat: -23.57694284963109,
    lng: -48.03269856993608,
    radius: 80
  },
  {
    id: "ponto-10",
    name: "Ponto 10",
    display: "PONTO 10",
    type: "PONTO",
    lat: -23.577943565893037,
    lng: -48.033917897389706,
    radius: 80
  },
  {
    id: "ponto-11",
    name: "Ponto 11",
    display: "PONTO 11",
    type: "PONTO",
    lat: -23.579379711422494,
    lng: -48.033981114896186,
    radius: 80
  },
  {
    id: "rodoviaria",
    name: "Rodovi\u00e1ria",
    display: "MEIA LUA RODOVI\u00c1RIA",
    type: "TERMINAL",
    lat: -23.581101124478643,
    lng: -48.03227304173673,
    radius: 80
  }
];

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
  vehicleCard: document.querySelector("#vehicleCard"),
  btnLogin: document.querySelector("#btnLogin"),
  btnRefresh: document.querySelector("#btnRefresh"),
  btnFit: document.querySelector("#btnFit"),
  vehicleSelect: document.querySelector("#vehicleSelect"),
  refreshInterval: document.querySelector("#refreshInterval")
};

const map = L.map("map", { zoomControl: false }).setView(DEFAULT_CENTER, 14);
L.control.zoom({ position: "bottomleft" }).addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  maxZoom: 20,
  subdomains: "abcd",
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
}).addTo(map);

const stopLayer = L.layerGroup().addTo(map);
const vehicleMarkers = new Map();
const vehicleLabels = new Map();
const messagesByStop = new Map();
const distancesByStop = new Map();
const insideStops = new Set();
const events = [];

let timer = null;
let refreshInFlight = false;
let firstVehicleFocusDone = false;
let latestVehicles = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR");
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "-";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function vehicleKey(vehicle) {
  return String(vehicle.id || vehicle.prefix || `${vehicle.latitude},${vehicle.longitude}`);
}

function vehicleLabel(vehicle) {
  return vehicle.prefix || vehicle.id || "BUS";
}

function toRad(value) {
  return value * Math.PI / 180;
}

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function distanceVehicleStop(vehicle, stop) {
  return distanceMeters([vehicle.latitude, vehicle.longitude], [stop.lat, stop.lng]);
}

function selectedVehicleIds() {
  const selected = els.vehicleSelect.value || String(DEFAULT_VEHICLES[0]);
  if (selected === "all") return DEFAULT_VEHICLES;
  return [Number(selected)].filter(Number.isFinite);
}

function renderVehicleSelect() {
  const selected = els.vehicleSelect.value || String(DEFAULT_VEHICLES[0]);

  els.vehicleSelect.innerHTML = "";

  DEFAULT_VEHICLES.forEach(id => {
    const option = document.createElement("option");
    option.value = String(id);
    option.textContent = vehicleLabels.get(id) || `Ve\u00edculo ${id}`;
    els.vehicleSelect.appendChild(option);
  });

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Todos os ve\u00edculos";
  els.vehicleSelect.appendChild(allOption);

  els.vehicleSelect.value = [...els.vehicleSelect.options].some(option => option.value === selected)
    ? selected
    : String(DEFAULT_VEHICLES[0]);
}

function updateVehicleLabels(vehicles) {
  vehicles.forEach(vehicle => {
    const id = Number(vehicle.id);
    if (!Number.isFinite(id)) return;

    const parts = [];
    parts.push(vehicle.prefix ? `Prefixo ${vehicle.prefix}` : `Ve\u00edculo ${id}`);
    if (vehicle.line) parts.push(`Linha ${vehicle.line}`);
    vehicleLabels.set(id, parts.join(" - "));
  });

  renderVehicleSelect();
}

function stopIcon(index) {
  return L.divIcon({
    className: "",
    html: `<div class="stop-pin">${index + 1}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function vehicleIcon(vehicle) {
  return L.divIcon({
    className: "",
    html: `<div class="vehicle-pin">${escapeHtml(vehicleLabel(vehicle))}</div>`,
    iconSize: [48, 34],
    iconAnchor: [24, 17]
  });
}

function vehiclePopup(vehicle) {
  const tripDescription = vehicle["r" + "oute"] || "-";
  const coords = `${Number(vehicle.latitude).toFixed(6)}, ${Number(vehicle.longitude).toFixed(6)}`;

  return `
    <strong>Prefixo ${escapeHtml(vehicleLabel(vehicle))}</strong><br>
    Linha: ${escapeHtml(vehicle.line || "-")}<br>
    Rota: ${escapeHtml(tripDescription)}<br>
    Velocidade: ${escapeHtml(vehicle.velocity ?? "-")} km/h<br>
    GPS: ${escapeHtml(formatDateTime(vehicle.gpsDatetime))}<br>
    Coordenadas: ${escapeHtml(coords)}
  `;
}

function renderStops() {
  stopLayer.clearLayers();

  BUS_STOPS.forEach((stop, index) => {
    L.circle([stop.lat, stop.lng], {
      radius: stop.radius,
      color: "#16833a",
      weight: 1,
      fillColor: "#20b64b",
      fillOpacity: 0.08
    }).addTo(stopLayer);

    L.marker([stop.lat, stop.lng], { icon: stopIcon(index) })
      .bindPopup(`
        <strong>${index + 1}. ${escapeHtml(stop.name)}</strong><br>
        ${escapeHtml(stop.display)}<br>
        Tipo: ${escapeHtml(stop.type)}<br>
        Raio: ${escapeHtml(stop.radius)} m
      `)
      .addTo(stopLayer);
  });
}

function renderVehicle(vehicle) {
  const key = vehicleKey(vehicle);
  const latlng = [vehicle.latitude, vehicle.longitude];

  if (vehicleMarkers.has(key)) {
    vehicleMarkers.get(key)
      .setLatLng(latlng)
      .setIcon(vehicleIcon(vehicle))
      .setPopupContent(vehiclePopup(vehicle));
  } else {
    const marker = L.marker(latlng, { icon: vehicleIcon(vehicle) })
      .bindPopup(vehiclePopup(vehicle))
      .addTo(map);
    vehicleMarkers.set(key, marker);
  }
}

function renderVehicles(vehicles) {
  const active = new Set();

  vehicles.forEach(vehicle => {
    active.add(vehicleKey(vehicle));
    renderVehicle(vehicle);
  });

  for (const [key, marker] of vehicleMarkers.entries()) {
    if (!active.has(key)) {
      marker.remove();
      vehicleMarkers.delete(key);
    }
  }

  if (vehicles.length && !firstVehicleFocusDone) {
    firstVehicleFocusDone = true;
    map.flyTo([vehicles[0].latitude, vehicles[0].longitude], 16, { duration: 0.8 });
  }
}

function focusVehicle(vehicle = latestVehicles[0]) {
  if (!vehicle) return;
  const key = vehicleKey(vehicle);
  const marker = vehicleMarkers.get(key);
  map.flyTo([vehicle.latitude, vehicle.longitude], 16, { duration: 0.8 });
  if (marker) marker.openPopup();
}

function nearestVehicleForStop(stop, vehicles) {
  return vehicles
    .map(vehicle => ({
      vehicle,
      distance: distanceVehicleStop(vehicle, stop)
    }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function stopStatus(stop, nearest) {
  if (insideStops.has(stop.id)) return { label: "Passou", className: "passed" };
  if (nearest && nearest.distance <= Math.max(stop.radius * 3, 250)) {
    return { label: "Pr\u00f3ximo", className: "near" };
  }
  return { label: "Aguardando", className: "waiting" };
}

function renderVehicleCard(vehicles) {
  if (!vehicles.length) {
    els.vehicleCard.className = "vehicle-card empty-state";
    els.vehicleCard.innerHTML = "Nenhum veiculo retornado na ultima consulta.";
    return;
  }

  const vehicle = vehicles[0];
  const tripDescription = vehicle["r" + "oute"] || "-";
  const selected = els.vehicleSelect.value === "all" ? "todos os ve\u00edculos" : vehicleLabel(vehicle);

  els.vehicleCard.className = "vehicle-card";
  els.vehicleCard.innerHTML = `
    <div class="vehicle-title">
      <span>Carro ${escapeHtml(vehicleLabel(vehicle))}</span>
      <span class="badge near">${escapeHtml(vehicle.velocity ?? "-")} km/h</span>
    </div>
    <div class="vehicle-meta">
      Selecao: ${escapeHtml(selected)}<br>
      Linha ${escapeHtml(vehicle.line || "-")} - ${escapeHtml(tripDescription)}<br>
      GPS: ${escapeHtml(formatDateTime(vehicle.gpsDatetime))}
    </div>
  `;
}

function renderPointList(vehicles) {
  els.pointList.innerHTML = "";

  BUS_STOPS.forEach((stop, index) => {
    const nearest = nearestVehicleForStop(stop, vehicles);
    const status = stopStatus(stop, nearest);
    const lastMessage = messagesByStop.get(stop.id) || "Sem passagem registrada neste ponto.";
    const distance = nearest ? nearest.distance : distancesByStop.get(stop.id);
    const vehicleText = nearest
      ? `Carro ${escapeHtml(vehicleLabel(nearest.vehicle))} a ${formatDistance(nearest.distance)}`
      : "Aguardando posicao do veiculo.";

    const card = document.createElement("article");
    card.className = "point-card";
    card.innerHTML = `
      <div class="point-index">${index + 1}</div>
      <div>
        <div class="point-title">
          <span>${escapeHtml(stop.name)}</span>
          <span class="badge ${status.className}">${escapeHtml(status.label)}</span>
        </div>
        <div class="point-meta">
          ${escapeHtml(stop.type)} - raio ${escapeHtml(stop.radius)} m - distancia atual ${formatDistance(distance)}
        </div>
        <div class="point-message">
          ${vehicleText}<br>
          ${escapeHtml(lastMessage)}
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      map.flyTo([stop.lat, stop.lng], 17, { duration: 0.8 });
    });

    els.pointList.appendChild(card);
  });
}

function renderEventList() {
  els.messageCount.textContent = String(events.length);

  if (!events.length) {
    els.eventList.innerHTML = "<div class=\"empty-state\">As mensagens aparecem aqui quando o veiculo entra no raio de um ponto.</div>";
    return;
  }

  els.eventList.innerHTML = events.map(event => `
    <article class="event-card">
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(event.detail)}</span>
    </article>
  `).join("");
}

function addEvent(vehicle, stop, distance) {
  const title = `Passou no ponto ${stop.name}`;
  const detail = [
    `Prefixo ${vehicleLabel(vehicle)}`,
    `Linha ${vehicle.line || "-"}`,
    `Velocidade ${vehicle.velocity ?? "-"} km/h`,
    `GPS ${formatDateTime(vehicle.gpsDatetime)}`,
    `Dist\u00e2ncia ${formatDistance(distance)}`
  ].join(" - ");

  events.unshift({
    id: `${Date.now()}-${stop.id}-${vehicleKey(vehicle)}`,
    title,
    detail,
    stopId: stop.id
  });

  if (events.length > 50) events.pop();

  messagesByStop.set(stop.id, `${title} - ${detail}`);
  els.eventHeadline.textContent = title;
  els.eventDetail.textContent = detail;
  renderEventList();
}

function checkGeofences(vehicle) {
  BUS_STOPS.forEach(stop => {
    const distance = distanceVehicleStop(vehicle, stop);
    distancesByStop.set(stop.id, distance);

    if (distance <= stop.radius) {
      if (!insideStops.has(stop.id)) {
        insideStops.add(stop.id);
        addEvent(vehicle, stop, distance);
      }
      return;
    }

    insideStops.delete(stop.id);
  });
}

function fitStops() {
  const bounds = L.latLngBounds(BUS_STOPS.map(stop => [stop.lat, stop.lng]));

  latestVehicles.forEach(vehicle => {
    bounds.extend([vehicle.latitude, vehicle.longitude]);
  });

  map.fitBounds(bounds, { padding: [36, 36] });
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
    lines: [],
    vehicles: selectedVehicleIds()
  });
}

async function refresh() {
  if (refreshInFlight) return;

  refreshInFlight = true;
  els.status.textContent = "Consultando posi\u00e7\u00e3o do ve\u00edculo...";

  try {
    const data = await fetchPositions();
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];

    latestVehicles = vehicles;
    updateVehicleLabels(vehicles);
    renderVehicles(vehicles);
    vehicles.forEach(checkGeofences);
    renderVehicleCard(vehicles);
    renderPointList(vehicles);

    els.vehicleCount.textContent = String(vehicles.length);
    els.pointCount.textContent = String(BUS_STOPS.length);
    els.updatedAt.textContent = formatDateTime(data.updatedAt);

    if (vehicles.length) {
      els.status.textContent = `${vehicles.length} ve\u00edculo(s) atualizado(s) em ${formatDateTime(data.updatedAt)}.`;
    } else {
      els.status.textContent = "Nenhum ve\u00edculo retornou na ultima consulta.";
      els.eventHeadline.textContent = "Sem ve\u00edculo na ultima consulta";
      els.eventDetail.textContent = `Atualizado em ${formatDateTime(data.updatedAt)}.`;
    }
  } catch (err) {
    console.error(err);
    els.status.textContent = `Erro ao consultar posicoes: ${err.message}`;
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
els.btnFit.addEventListener("click", fitStops);
els.vehicleSelect.addEventListener("change", () => {
  firstVehicleFocusDone = false;
  insideStops.clear();
  refresh();
});
els.vehicleCard.addEventListener("click", () => focusVehicle());
els.refreshInterval.addEventListener("change", setupTimer);

renderVehicleSelect();
renderStops();
renderPointList([]);
renderEventList();
els.pointCount.textContent = String(BUS_STOPS.length);
fitStops();
setupTimer();
refresh();
