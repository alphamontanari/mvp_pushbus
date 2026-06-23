const routeLine = Array.isArray(window.PUSHBUS_LINES) ? window.PUSHBUS_LINES[0] : null;
const points = routeLine?.stops || [];

const els = {
  search: document.querySelector("#pointSearch"),
  list: document.querySelector("#pointsList"),
  count: document.querySelector("#pointCount")
};

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
    .toUpperCase();
}

function pointHref(point) {
  return `/mapa.html?ponto=${encodeURIComponent(point.id)}`;
}

function pointSearchText(point) {
  return normalizeText([
    point.name,
    point.display,
    point.type,
    point.street,
    point.direction,
    point.service
  ].join(" "));
}

function renderPoints() {
  const query = normalizeText(els.search.value.trim());
  const visible = points.filter(point => !query || pointSearchText(point).includes(query));

  els.count.textContent = String(visible.length);

  if (!visible.length) {
    els.list.innerHTML = "<div class=\"empty-state\">Nenhum ponto encontrado para essa busca.</div>";
    return;
  }

  els.list.innerHTML = visible.map((point, index) => `
    <a class="point-link" href="${escapeHtml(pointHref(point))}">
      <span class="point-index">${index + 1}</span>
      <span>
        <strong>${escapeHtml(point.name)}</strong>
        <span>${escapeHtml(point.type)} - ${escapeHtml(point.street || "")} - ${escapeHtml(point.direction || "")}</span>
        <span>${escapeHtml(point.service || "Linha 01A")}</span>
        <small>Abrir no mapa</small>
      </span>
    </a>
  `).join("");
}

els.search.addEventListener("input", renderPoints);
renderPoints();
