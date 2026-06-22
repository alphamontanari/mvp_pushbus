const DEFAULT_CENTER = [-23.5917, -48.0531];

const DEFAULT_VEHICLES = [
  129923, 129922, 129616, 129615, 129614, 129991, 129607, 119919, 119917,
  129606, 119968, 119403, 113995, 119920, 119918, 129987, 119916, 119389,
  129988, 119915, 119387, 129992, 129989, 129956, 129955
];

const map = L.map("map").setView(DEFAULT_CENTER, 13);
const markers = new Map();

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const statusEl = document.querySelector("#status");
const listEl = document.querySelector("#vehicleList");
const btnLogin = document.querySelector("#btnLogin");
const btnRefresh = document.querySelector("#btnRefresh");
const vehicleSelectEl = document.querySelector("#vehicleSelect");
const refreshIntervalEl = document.querySelector("#refreshInterval");

let timer = null;
const vehicleLabels = new Map();

function selectedVehicleIds() {
  const selected = vehicleSelectEl.value;
  if (selected === "all") return DEFAULT_VEHICLES;
  return [Number(selected)].filter(Number.isFinite);
}

function renderVehicleSelect() {
  const selected = vehicleSelectEl.value || String(DEFAULT_VEHICLES[0]);

  vehicleSelectEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Todos os veículos";
  vehicleSelectEl.appendChild(allOption);

  DEFAULT_VEHICLES.forEach(id => {
    const option = document.createElement("option");
    option.value = String(id);
    option.textContent = vehicleLabels.get(id) || `Veículo ${id}`;
    vehicleSelectEl.appendChild(option);
  });

  vehicleSelectEl.value = [...vehicleSelectEl.options].some(option => option.value === selected)
    ? selected
    : String(DEFAULT_VEHICLES[0]);
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR");
}

function markerIcon(vehicle) {
  const label = vehicle.prefix || "BUS";
  return L.divIcon({
    className: "",
    html: `<div class="bus-marker">${label}</div>`,
    iconSize: [42, 34],
    iconAnchor: [21, 17]
  });
}

function popupHtml(v) {
  return `
    <strong>Prefixo ${v.prefix}</strong><br>
    Linha: ${v.line || "-"}<br>
    Rota: ${v.route || "-"}<br>
    Sentido: ${v.direction || "-"}<br>
    Velocidade: ${v.velocity ?? "-"} km/h<br>
    Ignição: ${v.ignition ? "Ligada" : "Desligada"}<br>
    GPS: ${formatDateTime(v.gpsDatetime)}<br>
    Último ponto: ${v.lastPointName || "-"}
  `;
}

function renderVehicleList(vehicles) {
  listEl.innerHTML = "";

  vehicles
    .slice()
    .sort((a, b) => String(a.prefix).localeCompare(String(b.prefix)))
    .forEach(v => {
      const card = document.createElement("div");
      card.className = "vehicle-card";
      card.innerHTML = `
        <div class="vehicle-title">
          <span>${v.prefix}</span>
          <span class="badge">${v.velocity ?? "-"} km/h</span>
        </div>
        <div class="vehicle-meta">
          Linha ${v.line || "-"} · ${v.route || "-"}<br>
          GPS: ${formatDateTime(v.gpsDatetime)}
        </div>
      `;

      card.addEventListener("click", () => {
        const marker = markers.get(v.id);
        if (marker) {
          map.setView([v.latitude, v.longitude], 16);
          marker.openPopup();
        }
      });

      listEl.appendChild(card);
    });
}

function updateVehicleLabels(vehicles) {
  vehicles.forEach(v => {
    const parts = [];
    parts.push(v.prefix ? `Prefixo ${v.prefix}` : `Veículo ${v.id}`);
    if (v.line) parts.push(`Linha ${v.line}`);
    if (v.route) parts.push(v.route);
    vehicleLabels.set(Number(v.id), parts.join(" — "));
  });

  renderVehicleSelect();
}

function renderMarkers(vehicles) {
  const activeIds = new Set();

  vehicles.forEach(v => {
    activeIds.add(v.id);
    const latlng = [v.latitude, v.longitude];

    if (markers.has(v.id)) {
      markers.get(v.id)
        .setLatLng(latlng)
        .setIcon(markerIcon(v))
        .setPopupContent(popupHtml(v));
    } else {
      const marker = L.marker(latlng, { icon: markerIcon(v) })
        .addTo(map)
        .bindPopup(popupHtml(v));
      markers.set(v.id, marker);
    }
  });

  for (const [id, marker] of markers.entries()) {
    if (!activeIds.has(id)) {
      marker.remove();
      markers.delete(id);
    }
  }

  if (vehicles.length) {
    const bounds = L.latLngBounds(vehicles.map(v => [v.latitude, v.longitude]));
    map.fitBounds(bounds.pad(0.2));
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
  statusEl.textContent = "Autenticando no FLITS...";
  const data = await apiPost("/api/auth/login");
  statusEl.textContent = `Autenticado. Token válido até ${formatDateTime(data.expiresAt)}`;
}

async function fetchPositions() {
  statusEl.textContent = "Consultando posições...";

  return apiPost("/api/vehicles/positions", {
    lines: [],
    vehicles: selectedVehicleIds()
  });
}

async function refresh() {
  try {
    const data = await fetchPositions();
    updateVehicleLabels(data.vehicles);
    renderMarkers(data.vehicles);
    renderVehicleList(data.vehicles);
    const selected = vehicleSelectEl.value === "all" ? "todos" : vehicleSelectEl.options[vehicleSelectEl.selectedIndex]?.textContent;
    statusEl.textContent = `${data.count} veículo(s) atualizado(s) em ${formatDateTime(data.updatedAt)} · Filtro: ${selected}`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Erro: ${err.message}`;
  }
}

function setupTimer() {
  if (timer) clearInterval(timer);
  const interval = Number(refreshIntervalEl.value);
  if (interval > 0) timer = setInterval(refresh, interval);
}

btnLogin.addEventListener("click", async () => {
  try {
    await login();
    await refresh();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Erro no login: ${err.message}`;
  }
});

btnRefresh.addEventListener("click", refresh);
vehicleSelectEl.addEventListener("change", refresh);
refreshIntervalEl.addEventListener("change", setupTimer);

renderVehicleSelect();
setupTimer();
refresh();
