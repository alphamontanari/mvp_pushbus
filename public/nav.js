(() => {
  const APP_NAME = "MVPPUSHBS";
  const links = [
    { href: "/", label: "Inicio" },
    { href: "/mapa.html", label: "Mapa" },
    { href: "/pontos-onibus.html", label: "Pontos de onibus" },
    { href: "/linha-01a-pontos.html", label: "Linha 01A" },
    { href: "/realtime-pontos.html", label: "Tempo real" }
  ];

  let deferredInstallPrompt = null;

  function currentPath() {
    const path = window.location.pathname || "/";
    return path === "/index.html" ? "/" : path;
  }

  function createMenu() {
    if (document.querySelector(".app-menu")) return;

    const nav = document.createElement("nav");
    nav.className = "app-menu";
    nav.setAttribute("aria-label", "Menu do aplicativo");
    nav.setAttribute("aria-expanded", "false");

    const button = document.createElement("button");
    button.className = "app-menu-toggle";
    button.type = "button";
    button.setAttribute("aria-label", "Abrir menu");
    button.setAttribute("aria-controls", "appMenuPanel");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = "<span></span>";

    const panel = document.createElement("div");
    panel.id = "appMenuPanel";
    panel.className = "app-menu-panel";

    const title = document.createElement("strong");
    title.className = "app-menu-title";
    title.textContent = APP_NAME;
    panel.appendChild(title);

    const path = currentPath();
    links.forEach(link => {
      const anchor = document.createElement("a");
      anchor.className = `app-menu-link${path === link.href ? " active" : ""}`;
      anchor.href = link.href;
      anchor.textContent = link.label;
      panel.appendChild(anchor);
    });

    const installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "app-menu-install hidden";
    installButton.textContent = "Instalar app";
    panel.appendChild(installButton);

    button.addEventListener("click", () => {
      const expanded = nav.getAttribute("aria-expanded") === "true";
      nav.setAttribute("aria-expanded", String(!expanded));
      button.setAttribute("aria-expanded", String(!expanded));
      button.setAttribute("aria-label", expanded ? "Abrir menu" : "Fechar menu");
    });

    document.addEventListener("click", event => {
      if (nav.contains(event.target)) return;
      nav.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Abrir menu");
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      nav.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Abrir menu");
    });

    installButton.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      installButton.classList.add("hidden");
    });

    nav.appendChild(button);
    nav.appendChild(panel);
    document.body.appendChild(nav);

    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installButton.classList.remove("hidden");
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createMenu);
  } else {
    createMenu();
  }

  registerServiceWorker();
})();
