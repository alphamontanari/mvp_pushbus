const lines = Array.isArray(window.PUSHBUS_LINES) ? window.PUSHBUS_LINES : [];
const defaultVehicles = Array.isArray(window.PUSHBUS_DEFAULT_VEHICLES)
  ? window.PUSHBUS_DEFAULT_VEHICLES
  : [];

const RESET_AFTER_FINAL_MS = 30000;
const LINE_NEAR_STOP_RADIUS_METERS = 1200;
const START_STOP_PRIORITY_RADIUS_METERS = 1200;

const state = {
  selectedLineId: "",
  selectedVehicleId: "auto",
  lineVehicles: [],
  discoveredLines: [],
  events: [],
  progressByLine: loadProgress(),
  latestVehicle: null,
  timer: null,
  resetTimer: null,
  inFlight: false,
  currentScreen: "lines",
  deferredInstallPrompt: null,
  notificationsEnabled: false
};

const els = {
  lineScreen: document.querySelector("#lineScreen"),
  routeScreen: document.querySelector("#routeScreen"),
  connectionPill: document.querySelector("#connectionPill"),
  lineSearch: document.querySelector("#lineSearch"),
  lineList: document.querySelector("#lineList"),
  backButton: document.querySelector("#backButton"),
  selectedLineTitle: document.querySelector("#selectedLineTitle"),
  routeTitle: document.querySelector("#routeTitle"),
  routeStart: document.querySelector("#routeStart"),
  routeEnd: document.querySelector("#routeEnd"),
  eventHeadline: document.querySelector("#eventHeadline"),
  etaText: document.querySelector("#etaText"),
  vehicleSelect: document.querySelector("#vehicleSelect"),
  refreshInterval: document.querySelector("#refreshInterval"),
  refreshButton: document.querySelector("#refreshButton"),
  installButton: document.querySelector("#installButton"),
  notifyButtons: document.querySelectorAll("[data-notify-button]"),
  startTime: document.querySelector("#startTime"),
  serviceText: document.querySelector("#serviceText"),
  timeline: document.querySelector("#timeline"),
  lastUpdate: document.querySelector("#lastUpdate"),
  vehicleStatus: document.querySelector("#vehicleStatus"),
  progressText: document.querySelector("#progressText"),
  eventList: document.querySelector("#eventList")
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

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
    minute: "2-digit"
  });
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "-";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
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

function currentLine() {
  return lines.find(line => line.id === state.selectedLineId) || null;
}

function lineMatchesQuery(line, query) {
  if (!query) return true;
  const haystack = normalizeText([
    line.code,
    line.displayCode,
    line.name,
    line.startName,
    line.endName,
    ...(line.aliases || [])
  ].join(" "));
  return haystack.includes(normalizeText(query));
}

function progressKey(line = currentLine()) {
  return line?.id || "line";
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem("pushbus-line-progress-v001") || "{}");
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem("pushbus-line-progress-v001", JSON.stringify(state.progressByLine));
}

function getPassedIndex(line = currentLine()) {
  return Number(state.progressByLine[progressKey(line)] ?? -1);
}

function setPassedIndex(index, line = currentLine()) {
  const key = progressKey(line);
  const current = Number(state.progressByLine[key] ?? -1);
  if (index > current) {
    state.progressByLine[key] = index;
    saveProgress();
  }
}

function resetProgress(line = currentLine()) {
  if (!line) return;
  delete state.progressByLine[progressKey(line)];
  saveProgress();
  state.events.unshift({
    id: `${Date.now()}-${line.id}-reset`,
    title: "Linha reiniciada",
    detail: `${formatClock()} - O ponto final foi atendido. A verificacao voltou para o primeiro ponto.`
  });
  if (state.events.length > 50) state.events.pop();
  renderTimeline();
  renderEvents();
  renderLiveSummary(state.latestVehicle, line);
}

function scheduleFinalReset(line = currentLine()) {
  if (!line) return;
  const passedIndex = getPassedIndex(line);
  const finalIndex = line.stops.length - 1;
  if (passedIndex < finalIndex || state.resetTimer) return;

  els.eventHeadline.textContent = "Linha chegou ao ponto final";
  els.etaText.textContent = "reiniciando verificacao em 30 segundos";
  state.resetTimer = setTimeout(() => {
    state.resetTimer = null;
    if (getPassedIndex(line) >= finalIndex) resetProgress(line);
  }, RESET_AFTER_FINAL_MS);
}

function selectedApiLineCode(line) {
  return line?.code || line?.displayCode || "";
}

function selectedLineAliases(line) {
  if (!line) return [];

  return [
    line.code,
    line.displayCode,
    line.name,
    ...(line.aliases || [])
  ].filter(Boolean);
}

function selectedLineStops(line) {
  if (!line) return [];

  return line.stops.map(stop => ({
    id: stop.id,
    lat: stop.lat,
    lng: stop.lng,
    radius: stop.radius
  }));
}

function selectedVehicleIds() {
  if (state.selectedVehicleId !== "auto") return [Number(state.selectedVehicleId)].filter(Number.isFinite);
  return [];
}

function shouldRequestAllVehicles() {
  return state.selectedVehicleId === "auto";
}

function vehicleLabel(vehicle) {
  return vehicle?.prefix || vehicle?.id || "BUS";
}

function showScreen(name) {
  state.currentScreen = name;
  els.lineScreen.classList.toggle("hidden", name !== "lines");
  els.routeScreen.classList.toggle("hidden", name !== "route");

  if (name === "lines") {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    state.selectedLineId = "";
  } else {
    setupTimer();
  }
}

function renderLineBrowser() {
  const query = els.lineSearch.value.trim();
  const visibleLines = lines.filter(line => lineMatchesQuery(line, query));
  const knownKeys = new Set(lines.flatMap(line => [line.code, line.displayCode, ...(line.aliases || [])].map(normalizeText)));
  const observedLines = state.discoveredLines
    .filter(item => !knownKeys.has(normalizeText(item.code)))
    .filter(item => !query || normalizeText(item.code).includes(normalizeText(query)));

  if (!visibleLines.length && !observedLines.length) {
    els.lineList.innerHTML = "<div class=\"empty-state\">Nenhuma linha encontrada para a busca.</div>";
    return;
  }

  const knownCards = visibleLines.map(line => `
    <button class="line-card" data-line-id="${escapeHtml(line.id)}">
      <strong>Linha ${escapeHtml(line.displayCode || line.code)}</strong>
      <span>${escapeHtml(line.startName)} -> ${escapeHtml(line.endName)}</span>
      <span>${line.stops.length} pontos cadastrados</span>
    </button>
  `);
  const observedCards = observedLines.map(item => `
    <button class="line-card observed" disabled>
      <strong>Linha ${escapeHtml(item.code)}</strong>
      <span>${item.count} carro(s) observados agora na API.</span>
      <span>Pontos ainda nao cadastrados nesta versao.</span>
    </button>
  `);

  els.lineList.innerHTML = [...knownCards, ...observedCards].join("");

  els.lineList.querySelectorAll("[data-line-id]").forEach(button => {
    button.addEventListener("click", () => selectLine(button.dataset.lineId));
  });
}

function renderVehicleSelect() {
  const vehicles = state.lineVehicles;
  const line = currentLine();

  if (!vehicles.length) {
    els.vehicleSelect.innerHTML = "<option value=\"auto\">Aguardando API</option>";
    els.vehicleSelect.value = "auto";
    return;
  }

  els.vehicleSelect.innerHTML = [
    "<option value=\"auto\">Automatico</option>",
    ...sortVehiclesByStartPriority(vehicles, line).map(vehicle => {
      const nearby = line ? nearestStop(vehicle, line) : null;
      const nearText = nearby ? ` - ${formatDistance(nearby.distance)} de ${nearby.stop.name}` : "";
      const lineText = vehicle.line || vehicle.route || "sem linha";
      const sourceText = vehicle.lineMatch
        ? `Linha ${lineText}`
        : `Proximo dos pontos (${lineText})`;
      const label = `${vehicleLabel(vehicle)} - ${sourceText}${nearText}`;
      return `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(label)}</option>`;
    })
  ].join("");

  if ([...els.vehicleSelect.options].some(option => option.value === state.selectedVehicleId)) {
    els.vehicleSelect.value = state.selectedVehicleId;
  } else {
    state.selectedVehicleId = "auto";
    els.vehicleSelect.value = "auto";
  }
}

function renderRouteInfo() {
  const line = currentLine();
  if (!line) return;

  els.selectedLineTitle.textContent = `LINHA ${line.displayCode || line.code}`;
  els.routeTitle.textContent = `LINHA ${line.displayCode || line.code}`;
  els.routeStart.textContent = line.startName;
  els.routeEnd.textContent = line.endName;
  els.startTime.textContent = line.startTime || "-";
  els.serviceText.textContent = line.service || "-";
}

function chooseVehicleForProgress(vehicles, line) {
  if (!vehicles.length) return null;

  if (state.selectedVehicleId !== "auto") {
    return vehicles.find(vehicle => String(vehicle.id) === String(state.selectedVehicleId)) || vehicles[0];
  }

  const passedIndex = getPassedIndex(line);
  const targetStop = line.stops[Math.min(passedIndex + 1, line.stops.length - 1)] || line.stops[0];

  return vehicles
    .map(vehicle => ({
      vehicle,
      distance: distanceMeters([vehicle.latitude, vehicle.longitude], [targetStop.lat, targetStop.lng])
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.vehicle || vehicles[0];
}

function distanceVehicleToStop(vehicle, stop) {
  return distanceMeters([vehicle.latitude, vehicle.longitude], [stop.lat, stop.lng]);
}

function startStopPriorityCandidate(vehicles, line) {
  if (state.selectedVehicleId !== "auto") return null;

  const startStop = line?.stops?.[0];
  if (!startStop || !vehicles.length) return null;

  const candidates = vehicles
    .map(vehicle => ({
      vehicle,
      stop: startStop,
      index: 0,
      distance: distanceVehicleToStop(vehicle, startStop)
    }))
    .filter(item => item.distance <= START_STOP_PRIORITY_RADIUS_METERS)
    .sort((a, b) => a.distance - b.distance);

  if (!candidates.length) return null;

  const lineCandidates = candidates.filter(item => item.vehicle.lineMatch);
  return lineCandidates[0] || candidates[0];
}

function sortVehiclesByStartPriority(vehicles, line) {
  const startStop = line?.stops?.[0];
  if (!startStop) return vehicles;

  return [...vehicles].sort((a, b) => {
    const aDistance = distanceVehicleToStop(a, startStop);
    const bDistance = distanceVehicleToStop(b, startStop);
    const aNearStart = aDistance <= START_STOP_PRIORITY_RADIUS_METERS;
    const bNearStart = bDistance <= START_STOP_PRIORITY_RADIUS_METERS;

    if (aNearStart !== bNearStart) return aNearStart ? -1 : 1;
    if (aNearStart && bNearStart && Boolean(a.lineMatch) !== Boolean(b.lineMatch)) {
      return a.lineMatch ? -1 : 1;
    }

    return aDistance - bDistance;
  });
}

function nearestStop(vehicle, line) {
  if (!vehicle) return null;

  return line.stops
    .map((stop, index) => ({
      stop,
      index,
      distance: distanceMeters([vehicle.latitude, vehicle.longitude], [stop.lat, stop.lng])
    }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function vehiclesForProgress(vehicles) {
  if (state.selectedVehicleId === "auto") return vehicles;
  return vehicles.filter(vehicle => String(vehicle.id) === String(state.selectedVehicleId));
}

function updateProgressFromGeofences(vehicles, line) {
  const candidates = vehicles
    .map(vehicle => ({
      vehicle,
      nearby: nearestStop(vehicle, line)
    }))
    .filter(item => item.nearby && item.nearby.distance <= item.nearby.stop.radius)
    .sort((a, b) => a.nearby.index - b.nearby.index || a.nearby.distance - b.nearby.distance);

  let lastPassage = null;
  const progressCandidates = candidates.some(item => item.vehicle.lineMatch)
    ? candidates.filter(item => item.vehicle.lineMatch)
    : candidates;

  progressCandidates.forEach(item => {
    const before = getPassedIndex(line);
    setPassedIndex(item.nearby.index, line);
    const after = getPassedIndex(line);
    if (after > before) {
      addPassageEvent(item.vehicle, line, item.nearby);
      lastPassage = item;
    }
  });

  scheduleFinalReset(line);
  return lastPassage || candidates[0] || null;
}

function nextStopInfo(vehicle, line) {
  const passedIndex = getPassedIndex(line);
  if (passedIndex >= line.stops.length - 1) return null;

  const nextIndex = Math.max(0, Math.min(passedIndex + 1, line.stops.length - 1));
  const stop = line.stops[nextIndex];
  if (!stop) return null;

  const distance = vehicle
    ? distanceMeters([vehicle.latitude, vehicle.longitude], [stop.lat, stop.lng])
    : null;
  const speed = Number(vehicle?.velocity);
  const kmh = Number.isFinite(speed) && speed >= 8 ? speed : line.averageSpeedKmh || 18;
  const minutes = Number.isFinite(distance)
    ? Math.max(1, Math.round((distance / 1000 / kmh) * 60))
    : null;

  return { stop, index: nextIndex, distance, minutes };
}

function renderTimeline() {
  const line = currentLine();
  if (!line) return;

  const passedIndex = getPassedIndex(line);
  const currentIndex = Math.min(Math.max(passedIndex + 1, 0), line.stops.length - 1);
  const progress = line.stops.length <= 1 ? 0 : (Math.max(passedIndex, 0) / (line.stops.length - 1)) * 100;
  els.timeline.style.setProperty("--progress", `${Math.max(0, Math.min(100, progress))}%`);
  els.progressText.textContent = `${Math.max(0, passedIndex + 1)} de ${line.stops.length} pontos`;

  els.timeline.innerHTML = line.stops.map((stop, index) => {
    const done = index <= passedIndex;
    const current = !done && index === currentIndex;
    const status = done
      ? "Passou"
      : current
        ? (index === 0 ? "Inicio" : "Proximo ponto")
        : "";

    return `
      <article class="stop-row ${done ? "done" : ""} ${current ? "current" : ""}">
        <span class="stop-dot"></span>
        <span class="stop-name">
          ${escapeHtml(stop.name)}
          <span class="stop-meta">${escapeHtml(stop.type)} - ${escapeHtml(stop.street || stop.direction || "")}</span>
        </span>
        ${status ? `<span class="status-badge">${escapeHtml(status)}</span>` : ""}
      </article>
    `;
  }).join("");
}

function renderLiveSummary(vehicle, line) {
  const passedIndex = getPassedIndex(line);
  const lastStop = passedIndex >= 0 ? line.stops[passedIndex] : null;
  const next = nextStopInfo(vehicle, line);

  if (passedIndex >= line.stops.length - 1) {
    els.eventHeadline.textContent = "Onibus chegou ao ponto final";
    els.etaText.textContent = "aguardando reinicio da linha";
  } else if (lastStop) {
    els.eventHeadline.textContent = `Onibus passou por ${lastStop.name}`;
  } else if (vehicle) {
    els.eventHeadline.textContent = `Onibus ${vehicleLabel(vehicle)} localizado`;
  } else {
    els.eventHeadline.textContent = "Aguardando posicao real do onibus";
  }

  if (next?.stop && next.minutes !== null) {
    els.etaText.textContent = `${next.stop.name}: ${next.minutes} ${next.minutes === 1 ? "minuto" : "minutos"}`;
  } else if (next?.stop) {
    els.etaText.textContent = `${next.stop.name}: calculando...`;
  }
}

function renderEvents() {
  if (!state.events.length) {
    els.eventList.innerHTML = "<div class=\"empty-state\">As passagens aparecem aqui quando o carro entra no raio de um ponto.</div>";
    return;
  }

  els.eventList.innerHTML = state.events.slice(0, 10).map(event => `
    <article class="event-card">
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(event.detail)}</span>
    </article>
  `).join("");
}

function addPassageEvent(vehicle, line, nearby) {
  const title = `Passou no ponto ${nearby.stop.name}`;
  const detail = [
    formatClock(),
    `Linha ${line.displayCode || line.code}`,
    `Carro ${vehicleLabel(vehicle)}`,
    `${formatDistance(nearby.distance)} do ponto`,
    `GPS ${formatDateTime(vehicle.gpsDatetime)}`
  ].join(" - ");

  state.events.unshift({
    id: `${Date.now()}-${line.id}-${nearby.stop.id}`,
    title,
    detail
  });

  if (state.events.length > 50) state.events.pop();
  renderEvents();
  sendBrowserNotification(title, detail, `${line.id}-${nearby.stop.id}`);
}

function sendBrowserNotification(title, body, tag) {
  if (!state.notificationsEnabled || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification(title, {
    body,
    tag
  });
}

function renderVehicleStatus(vehicle, line, nearby) {
  if (!vehicle) {
    els.vehicleStatus.textContent = "Nenhum onibus da linha ou proximo dos pontos agora.";
    return;
  }

  const stopText = nearby ? `${nearby.stop.name} (${formatDistance(nearby.distance)})` : "ponto nao calculado";
  els.vehicleStatus.textContent = `Carro ${vehicleLabel(vehicle)} - ${stopText}`;
}

function selectLine(lineId) {
  state.selectedLineId = lineId;
  state.selectedVehicleId = "auto";
  state.lineVehicles = [];
  state.latestVehicle = null;
  state.events = [];
  if (state.resetTimer) {
    clearTimeout(state.resetTimer);
    state.resetTimer = null;
  }

  renderRouteInfo();
  renderVehicleSelect();
  renderTimeline();
  renderEvents();
  showScreen("route");
  refreshPositions();
}

async function apiPost(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

async function refreshPositions() {
  if (state.inFlight || state.currentScreen !== "route") return;
  const line = currentLine();
  if (!line) return;

  state.inFlight = true;
  els.connectionPill.textContent = "Atualizando";
  els.connectionPill.classList.remove("warn");

  try {
    const data = await apiPost("/api/vehicles/positions", {
      lineCode: selectedApiLineCode(line),
      lineAliases: selectedLineAliases(line),
      lineStops: selectedLineStops(line),
      nearStopRadiusMeters: LINE_NEAR_STOP_RADIUS_METERS,
      allVehicles: shouldRequestAllVehicles(),
      lines: [],
      vehicles: selectedVehicleIds()
    });
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
    state.lineVehicles = vehicles;
    const progressHit = updateProgressFromGeofences(vehiclesForProgress(vehicles), line);
    const startHit = startStopPriorityCandidate(vehicles, line);
    const vehicle = startHit?.vehicle || progressHit?.vehicle || chooseVehicleForProgress(vehicles, line);
    state.latestVehicle = vehicle || null;
    const nearby = startHit || progressHit?.nearby || nearestStop(vehicle, line);

    renderVehicleSelect();
    renderTimeline();
    renderLiveSummary(vehicle, line);
    renderVehicleStatus(vehicle, line, nearby);
    els.lastUpdate.textContent = formatDateTime(data.updatedAt);
    els.connectionPill.textContent = vehicles.length ? `${vehicles.length} carro(s)` : "Sem carro";
  } catch (err) {
    console.error(err);
    els.connectionPill.textContent = "Falha API";
    els.connectionPill.classList.add("warn");
    els.vehicleStatus.textContent = err.message;
  } finally {
    state.inFlight = false;
  }
}

async function discoverLiveLines() {
  try {
    const data = await apiPost("/api/vehicles/positions", {
      lines: [],
      vehicles: defaultVehicles
    });
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
    const discovered = new Map();
    vehicles.forEach(vehicle => {
      const code = vehicle.line || vehicle.route || "";
      if (!code) return;
      const key = normalizeText(code);
      if (!discovered.has(key)) discovered.set(key, { code, count: 0 });
      discovered.get(key).count += 1;
    });
    state.discoveredLines = [...discovered.values()];
    renderLineBrowser();
  } catch {
    state.discoveredLines = [];
  }
}

function setupTimer() {
  if (state.timer) clearInterval(state.timer);
  const interval = Number(els.refreshInterval.value);
  if (interval > 0 && state.currentScreen === "route") {
    state.timer = setInterval(refreshPositions, interval);
  }
}

function registerPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installButton.classList.remove("hidden");
  });
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    els.connectionPill.textContent = "Sem push";
    els.connectionPill.classList.add("warn");
    return;
  }

  const permission = await Notification.requestPermission();
  state.notificationsEnabled = permission === "granted";

  els.notifyButtons.forEach(button => {
    button.textContent = state.notificationsEnabled ? "Push ativo" : "Push bloqueado";
  });

  els.connectionPill.textContent = state.notificationsEnabled ? "Push ativo" : "Push bloqueado";
  els.connectionPill.classList.toggle("warn", !state.notificationsEnabled);
}

els.lineSearch.addEventListener("input", renderLineBrowser);
els.backButton.addEventListener("click", () => {
  showScreen("lines");
  renderLineBrowser();
});
els.vehicleSelect.addEventListener("change", () => {
  state.selectedVehicleId = els.vehicleSelect.value;
  refreshPositions();
});
els.refreshInterval.addEventListener("change", setupTimer);
els.refreshButton.addEventListener("click", refreshPositions);
els.notifyButtons.forEach(button => {
  button.addEventListener("click", enableNotifications);
});
els.installButton.addEventListener("click", async () => {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice.catch(() => null);
  state.deferredInstallPrompt = null;
  els.installButton.classList.add("hidden");
});

registerPwa();
renderLineBrowser();
renderVehicleSelect();
renderEvents();
showScreen("lines");
discoverLiveLines();
