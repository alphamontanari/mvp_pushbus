const DEFAULT_CENTER = [-23.5716, -48.0252];
const ROUTE_LINE = Array.isArray(window.PUSHBUS_LINES) ? window.PUSHBUS_LINES[0] : null;

if (!ROUTE_LINE) {
  throw new Error("Dados da linha nao foram carregados.");
}

const STOPS = ROUTE_LINE.stops.map(stop => ({
  id: stop.id,
  name: stop.name,
  display: stop.name,
  address: [stop.street, stop.direction].filter(Boolean).join(" - "),
  type: stop.type,
  lat: stop.lat,
  lng: stop.lng,
  plannedTime: stop.time,
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
  selectedVehicleSummary: document.querySelector("#selectedVehicleSummary"),
  vehicleSelect: document.querySelector("#vehicleSelect"),
  btnLogin: document.querySelector("#btnLogin"),
  btnRefresh: document.querySelector("#btnRefresh"),
  btnNotify: document.querySelector("#btnNotify"),
  btnFit: document.querySelector("#btnFit"),
  refreshInterval: document.querySelector("#refreshInterval")
};

const map = L.map("map", { zoomControl: false, doubleClickZoom: false }).setView(DEFAULT_CENTER, 14);
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

let latestVehicles = [];
let selectedVehicleKey = "";
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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
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
  return vehicle.prefix || vehicle.id || "BUS";
}

function lineLabel(vehicle) {
  return vehicle.line || vehicle.route || "sem linha";
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

function distanceVehicleStop(vehicle, stop) {
  return distanceMeters([vehicle.latitude, vehicle.longitude], [stop.lat, stop.lng]);
}

function nearestStopForVehicle(vehicle) {
  return STOPS
    .map(stop => ({
      stop,
      distance: distanceVehicleStop(vehicle, stop)
    }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function selectedVehicle() {
  return latestVehicles.find(vehicle => vehicleKey(vehicle) === selectedVehicleKey) || null;
}

function markerIcon(vehicle) {
  const key = vehicleKey(vehicle);
  const selected = key === selectedVehicleKey;
  const noLine = !vehicle.line && !vehicle.route;

  return L.divIcon({
    className: "",
    html: `<div class="vehicle-pin all-vehicle-pin ${selected ? "selected" : ""} ${noLine ? "no-line" : ""}">${escapeHtml(vehicleLabel(vehicle))}</div>`,
    iconSize: selected ? [58, 42] : [48, 34],
    iconAnchor: selected ? [29, 21] : [24, 17]
  });
}

function popupHtml(vehicle) {
  return `
    <strong>Carro ${escapeHtml(vehicleLabel(vehicle))}</strong><br>
    Linha informada: ${escapeHtml(lineLabel(vehicle))}<br>
    Rota: ${escapeHtml(vehicle.route || "-")}<br>
    Velocidade: ${escapeHtml(vehicle.velocity ?? "-")} km/h<br>
    GPS: ${escapeHtml(formatDateTime(vehicle.gpsDatetime))}<br>
    Ultimo ponto API: ${escapeHtml(vehicle.lastPointName || "-")}
    <span class="vehicle-popup-note">Duplo clique no marcador para colocar este onibus em foco.</span>
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

function selectVehicle(key, options = {}) {
  selectedVehicleKey = key || "";
  els.vehicleSelect.value = selectedVehicleKey;

  renderVehicleMarkers(latestVehicles);
  renderSelectedVehicle();
  renderPointList(latestVehicles);

  const vehicle = selectedVehicle();
  if (!vehicle) return;

  const marker = vehicleMarkers.get(selectedVehicleKey);
  if (options.center && marker) {
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
  }
  if (options.openPopup && marker) {
    marker.openPopup();
  }

  const nearest = nearestStopForVehicle(vehicle);
  els.eventHeadline.textContent = `Carro ${vehicleLabel(vehicle)} em foco`;
  els.eventDetail.textContent = nearest
    ? `${lineLabel(vehicle)} - ${formatDistance(nearest.distance)} de ${nearest.stop.display}.`
    : `${lineLabel(vehicle)} - aguardando calculo de aproximacao.`;
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

      marker.on("dblclick", () => selectVehicle(key, { center: true, openPopup: true }));
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

function renderVehicleSelect(vehicles) {
  const selectedStillExists = vehicles.some(vehicle => vehicleKey(vehicle) === selectedVehicleKey);
  if (!selectedStillExists) selectedVehicleKey = "";

  els.vehicleSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = vehicles.length ? "Escolha um onibus" : "Nenhum onibus retornado";
  els.vehicleSelect.appendChild(placeholder);

  vehicles
    .slice()
    .sort((a, b) => String(vehicleLabel(a)).localeCompare(String(vehicleLabel(b)), "pt-BR", { numeric: true }))
    .forEach(vehicle => {
      const nearest = nearestStopForVehicle(vehicle);
      const option = document.createElement("option");
      option.value = vehicleKey(vehicle);
      option.textContent = nearest
        ? `${vehicleLabel(vehicle)} | ${lineLabel(vehicle)} | ${formatDistance(nearest.distance)} de ${nearest.stop.display}`
        : `${vehicleLabel(vehicle)} | ${lineLabel(vehicle)}`;
      els.vehicleSelect.appendChild(option);
    });

  els.vehicleSelect.value = selectedVehicleKey;
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
  if (!nearest) return { label: "Sem onibus", className: "empty" };
  if (nearest.distance <= stop.radiusEnter) return { label: "Passando", className: "arriving" };
  if (nearest.distance <= 250) return { label: "Proximo", className: "near" };
  if (nearest.distance <= 1200) return { label: "A caminho", className: "" };
  return { label: "Distante", className: "warning" };
}

function renderSelectedVehicle() {
  const vehicle = selectedVehicle();

  if (!vehicle) {
    els.selectedVehicleSummary.textContent = "Escolha pelo combo ou de duplo clique em um onibus no mapa.";
    return;
  }

  const nearest = nearestStopForVehicle(vehicle);
  els.selectedVehicleSummary.textContent = nearest
    ? `Carro ${vehicleLabel(vehicle)} em foco: ${lineLabel(vehicle)}, ${formatDistance(nearest.distance)} de ${nearest.stop.display}.`
    : `Carro ${vehicleLabel(vehicle)} em foco: ${lineLabel(vehicle)}.`;
}

function renderPointList(vehicles) {
  const selected = selectedVehicle();
  els.pointList.innerHTML = "";

  STOPS.forEach((stop, index) => {
    const nearest = nearestVehicleForStop(stop, vehicles);
    const selectedDistance = selected ? distanceVehicleStop(selected, stop) : null;
    const badge = pointBadge(nearest, stop);
    const card = document.createElement("article");
    card.className = `point-card ${selectedDistance !== null && selectedDistance <= 250 ? "focused" : ""}`;

    const nearestText = nearest
      ? `Mais proximo: Carro ${escapeHtml(vehicleLabel(nearest.vehicle))} (${escapeHtml(lineLabel(nearest.vehicle))}) a ${formatDistance(nearest.distance)} - ETA ${etaLabel(nearest.distance, nearest.vehicle.velocity)}`
      : "Nenhum onibus retornado pela API para este ponto.";
    const selectedText = selected
      ? `<br><b>Em foco:</b> Carro ${escapeHtml(vehicleLabel(selected))} a ${formatDistance(selectedDistance)} - ETA ${etaLabel(selectedDistance, selected.velocity)}`
      : "";
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
        <div class="point-message">${nearestText}${selectedText}<br>${escapeHtml(lastMessage)}</div>
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
    els.eventList.innerHTML = "<div class=\"empty-state\">As mensagens aparecem aqui quando qualquer onibus entra no raio de um ponto.</div>";
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

function pushPassageEvent(vehicle, stop) {
  const now = new Date();
  const label = vehicleLabel(vehicle);
  const distance = distanceVehicleStop(vehicle, stop);
  const title = `Carro ${label} passou no ponto ${stop.name}`;
  const detail = `${formatClock(now)} - ${lineLabel(vehicle)} - ${stop.display} - ${formatDistance(distance)} do ponto.`;
  const event = {
    id: `${Date.now()}-${vehicleKey(vehicle)}-${stop.id}-passage`,
    title,
    detail,
    stopId: stop.id,
    createdAt: now
  };

  events.unshift(event);
  if (events.length > 60) events.pop();

  messagesByStop.set(stop.id, `${formatClock(now)} - Passagem detectada do carro ${label} (${lineLabel(vehicle)}).`);
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
      }
    }

    if (!insideStop) {
      const enteringStop = nearestEnteringStop(vehicle);
      if (enteringStop && previous.insideStopId !== enteringStop.id) {
        pushPassageEvent(vehicle, enteringStop);
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
    lines: [],
    vehicles: []
  });
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  els.status.textContent = "Consultando todos os onibus monitorados...";

  try {
    const data = await fetchPositions();
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
    latestVehicles = vehicles;

    detectMessages(vehicles);
    renderVehicleSelect(vehicles);
    renderSelectedVehicle();
    renderVehicleMarkers(vehicles);
    renderPointList(vehicles);

    els.vehicleCount.textContent = String(vehicles.length);
    els.pointCount.textContent = String(STOPS.length);
    els.updatedAt.textContent = formatDateTime(data.updatedAt);

    if (vehicles.length) {
      els.status.textContent = `${vehicles.length} onibus atualizados em ${formatDateTime(data.updatedAt)}. Duplo clique em um marcador para colocar em foco.`;
    } else {
      els.status.textContent = "Nenhum onibus retornou agora. Confira a lista padrao de veiculos do servidor e a autenticacao.";
      els.eventHeadline.textContent = "Sem onibus na ultima consulta";
      els.eventDetail.textContent = `Atualizado em ${formatDateTime(data.updatedAt)}.`;
    }
  } catch (err) {
    console.error(err);
    els.status.textContent = `Erro ao consultar todos os onibus: ${err.message}`;
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

els.vehicleSelect.addEventListener("change", () => selectVehicle(els.vehicleSelect.value, { center: true, openPopup: true }));

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
