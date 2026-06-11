const { API_BASE_URL, ROUTING_API_BASE_URL } = window.APP_CONFIG;

const ADMIN_USERNAME = "Machine";
const ADMIN_PASSWORD = "Sagar@1234";
const ADMIN_SESSION_KEY = "bus_tracking_admin_logged_in";
const ADMIN_THEME_KEY = "sagar_go_theme";

const adminLoginView = document.getElementById("adminLoginView");
const adminDashboard = document.getElementById("adminDashboard");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminUsername = document.getElementById("adminUsername");
const adminPassword = document.getElementById("adminPassword");
const adminLoginMessage = document.getElementById("adminLoginMessage");
const adminLogout = document.getElementById("adminLogout");
const adminThemeButtons = Array.from(document.querySelectorAll("[data-theme-toggle]"));

const adminState = document.getElementById("adminState");
const adminMessage = document.getElementById("adminMessage");
const adminSidebarToggle = document.getElementById("adminSidebarToggle");
const adminBusSearch = document.getElementById("adminBusSearch");
const totalBusesMetric = document.getElementById("totalBusesMetric");
const activeRoutesMetric = document.getElementById("activeRoutesMetric");
const onlineDriversMetric = document.getElementById("onlineDriversMetric");
const alertsMetric = document.getElementById("alertsMetric");
const adminRouteCount = document.getElementById("adminRouteCount");
const adminAlertCount = document.getElementById("adminAlertCount");
const adminMapHint = document.getElementById("adminMapHint");
const quickRouteHint = document.getElementById("quickRouteHint");
const busForm = document.getElementById("busForm");
const quickRouteForm = document.getElementById("quickRouteForm");
const stopForm = document.getElementById("stopForm");
const adminBusList = document.getElementById("adminBusList");
const reloadAdmin = document.getElementById("reloadAdmin");
const rebuildDirections = document.getElementById("rebuildDirections");
const stopBusId = document.getElementById("stopBusId");
const quickRouteSelectedBus = document.getElementById("quickRouteSelectedBus");
const quickRouteName = document.getElementById("quickRouteName");
const quickStartName = document.getElementById("quickStartName");
const quickEndName = document.getElementById("quickEndName");
const quickStartCoords = document.getElementById("quickStartCoords");
const quickEndCoords = document.getElementById("quickEndCoords");
const pickQuickStartButton = document.getElementById("pickQuickStartButton");
const pickQuickEndButton = document.getElementById("pickQuickEndButton");
const stopCode = document.getElementById("stopCode");
const stopName = document.getElementById("stopName");
const stopLatitude = document.getElementById("stopLatitude");
const stopLongitude = document.getElementById("stopLongitude");
const stopOrder = document.getElementById("stopOrder");
const setStartPinButton = document.getElementById("setStartPinButton");
const setStopPinButton = document.getElementById("setStopPinButton");
const setEndPinButton = document.getElementById("setEndPinButton");
const routeDistanceValue = document.getElementById("routeDistanceValue");
const routeDurationValue = document.getElementById("routeDurationValue");
const routeStopCountValue = document.getElementById("routeStopCountValue");
const routeStepsList = document.getElementById("routeStepsList");
const routeStopNamesList = document.getElementById("routeStopNamesList");

let adminMap = null;
let adminTileLayers = null;
let currentAdminTheme = "dark";
let routePreviewLine = null;
let previewMarker = null;
let quickStartMarker = null;
let quickEndMarker = null;
let stopMarkers = [];
let adminBuses = [];
let filteredAdminBuses = [];
let selectedBusId = null;
let pinMode = "start";
let quickPinMode = "start";
let quickRoutePoints = {
  start: null,
  end: null,
};

function applyAdminTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("light-admin", nextTheme === "light");
  document.body.classList.toggle("dark-admin", nextTheme !== "light");
  adminThemeButtons.forEach((button) => {
    button.textContent = nextTheme === "light" ? "Dark Mode" : "Light Mode";
    button.setAttribute("aria-pressed", nextTheme === "light" ? "true" : "false");
  });
  updateAdminMapTheme();
}

function getSavedAdminTheme() {
  try {
    return window.localStorage.getItem(ADMIN_THEME_KEY) || "dark";
  } catch (error) {
    return "dark";
  }
}

function updateAdminMapTheme() {
  if (!adminMap || !adminTileLayers) return;
  const nextTheme = document.body.classList.contains("light-admin") ? "light" : "dark";
  if (nextTheme === currentAdminTheme && adminMap.hasLayer(adminTileLayers[nextTheme])) {
    return;
  }
  if (adminTileLayers[currentAdminTheme] && adminMap.hasLayer(adminTileLayers[currentAdminTheme])) {
    adminMap.removeLayer(adminTileLayers[currentAdminTheme]);
  }
  currentAdminTheme = nextTheme;
  adminTileLayers[currentAdminTheme].addTo(adminMap);
}

function isLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function showLogin(message = "Use your admin ID and password to continue.") {
  adminLoginView.classList.remove("hidden");
  adminDashboard.classList.add("hidden");
  adminLoginMessage.textContent = message;
}

function showDashboard() {
  adminLoginView.classList.add("hidden");
  adminDashboard.classList.remove("hidden");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

function setState(online, message) {
  adminState.textContent = online ? "Online" : "Offline";
  adminState.className = online
    ? "text-2xl font-black text-success"
    : "text-2xl font-black text-danger";
  adminMessage.textContent = message;
}

function getBusStatusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "live") {
    return '<span class="rounded-pill bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">Live</span>';
  }
  if (normalized === "ready") {
    return '<span class="rounded-pill bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-200">Ready</span>';
  }
  return '<span class="rounded-pill bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200">Offline</span>';
}

function updateDashboardMetrics(buses) {
  const totalBuses = buses.length;
  const activeRoutes = buses.filter((bus) => getSortedStops(bus).length >= 2).length;
  const onlineDrivers = buses.filter((bus) => String(bus.status || "").toLowerCase() === "live").length;
  const alerts = buses.filter((bus) => getSortedStops(bus).length < 2 || String(bus.status || "").toLowerCase() !== "live").length;

  if (totalBusesMetric) totalBusesMetric.textContent = String(totalBuses);
  if (activeRoutesMetric) activeRoutesMetric.textContent = String(activeRoutes);
  if (onlineDriversMetric) onlineDriversMetric.textContent = String(onlineDrivers);
  if (alertsMetric) alertsMetric.textContent = String(alerts);
  if (adminRouteCount) adminRouteCount.textContent = String(activeRoutes);
  if (adminAlertCount) adminAlertCount.textContent = String(alerts);
}

function applyBusSearchFilter() {
  const query = adminBusSearch ? adminBusSearch.value.trim().toLowerCase() : "";
  filteredAdminBuses = adminBuses.filter((bus) => {
    if (!query) return true;
    return (
      String(bus.busCode || "").toLowerCase().includes(query) ||
      String(bus.routeName || "").toLowerCase().includes(query)
    );
  });
  renderBusList(filteredAdminBuses);
}

function getSelectedBus() {
  return adminBuses.find((bus) => String(bus.id) === String(selectedBusId)) || null;
}

function getSortedStops(bus) {
  return (bus && bus.stops ? bus.stops.slice() : []).sort((a, b) => a.stopOrder - b.stopOrder);
}

function setPinMode(mode) {
  pinMode = mode;
  setStartPinButton.classList.toggle("active", mode === "start");
  setStopPinButton.classList.toggle("active", mode === "stop");
  setEndPinButton.classList.toggle("active", mode === "end");
}

function setQuickPinMode(mode) {
  quickPinMode = mode;
  pickQuickStartButton.classList.toggle("active", mode === "start");
  pickQuickEndButton.classList.toggle("active", mode === "end");
}

function fillStopFormFromPin(lat, lng) {
  stopLatitude.value = lat.toFixed(6);
  stopLongitude.value = lng.toFixed(6);

  const bus = getSelectedBus();
  const stops = getSortedStops(bus);
  const nextOrder = stops.length + 1;
  const busCodeValue = bus && bus.busCode ? bus.busCode : "BUS";

  if (pinMode === "start") {
    stopOrder.value = "1";
    stopCode.value = `START-${busCodeValue}`;
    stopName.value = "Route Start";
    return;
  }

  if (pinMode === "end") {
    stopOrder.value = String(nextOrder);
    stopCode.value = `END-${busCodeValue}`;
    stopName.value = "Route End";
    return;
  }

  if (!stopOrder.value) {
    stopOrder.value = String(nextOrder);
  }
  if (!stopCode.value) {
    stopCode.value = `STOP-${nextOrder}`;
  }
  if (!stopName.value) {
    stopName.value = `Stop ${nextOrder}`;
  }
}

function createStopMarker(stop, index, totalStops) {
  const isStart = index === 0;
  const isEnd = index === totalStops - 1;
  const marker = L.circleMarker([stop.latitude, stop.longitude], {
    radius: isStart || isEnd ? 10 : 8,
    color: isStart ? "#0f8b83" : isEnd ? "#244b74" : "#d95f39",
    fillColor: isStart ? "#7ce4d0" : isEnd ? "#a8c7ef" : "#efb63f",
    fillOpacity: 0.95,
    weight: 2,
  }).addTo(adminMap);

  const role = isStart ? "Start pin" : isEnd ? "End pin" : "Stop pin";
  marker.bindPopup(`<strong>${role}</strong><br>${stop.stopName}<br>${stop.stopCode}<br>Order ${stop.stopOrder}`);
  marker.bindTooltip(stop.stopName, {
    direction: "top",
    offset: [0, -8],
    opacity: 0.94,
  });
  return marker;
}

function createQuickMarker(latlng, label, existingMarker) {
  if (existingMarker) {
    adminMap.removeLayer(existingMarker);
  }

  const marker = L.marker([latlng.lat, latlng.lng]).addTo(adminMap);
  marker.bindPopup(label).openPopup();
  return marker;
}

function updateQuickCoords() {
  quickStartCoords.textContent = quickRoutePoints.start
    ? `${quickRoutePoints.start.lat.toFixed(5)}, ${quickRoutePoints.start.lng.toFixed(5)}`
    : "Pick on map";
  quickEndCoords.textContent = quickRoutePoints.end
    ? `${quickRoutePoints.end.lat.toFixed(5)}, ${quickRoutePoints.end.lng.toFixed(5)}`
    : "Pick on map";
}

function syncQuickRouteForm(bus) {
  if (quickRouteSelectedBus) {
    quickRouteSelectedBus.textContent = `${bus.busCode} - ${bus.routeName}`;
  }
  quickRouteName.value = bus.routeName || "";
  const stops = getSortedStops(bus);
  const startStop = stops[0] || null;
  const endStop = stops.length > 1 ? stops[stops.length - 1] : null;

  quickStartName.value = startStop ? startStop.stopName : "";
  quickEndName.value = endStop ? endStop.stopName : "";

  quickRoutePoints.start = startStop ? { lat: Number(startStop.latitude), lng: Number(startStop.longitude) } : null;
  quickRoutePoints.end = endStop ? { lat: Number(endStop.latitude), lng: Number(endStop.longitude) } : null;
  updateQuickCoords();
}
function ensureMap() {
  if (adminMap) {
    return;
  }

  adminMap = L.map("adminRouteMap", {
    zoomControl: false,
  }).setView([23.8388, 78.7387], 13);

  L.control.zoom({ position: "bottomright" }).addTo(adminMap);

  adminTileLayers = {
    dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    }),
    light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    }),
  };

  currentAdminTheme = document.body.classList.contains("light-admin") ? "light" : "dark";
  adminTileLayers[currentAdminTheme].addTo(adminMap);

  adminMap.on("click", (event) => {
    quickRoutePoints[quickPinMode] = { lat: event.latlng.lat, lng: event.latlng.lng };
    if (quickPinMode === "start") {
      quickStartMarker = createQuickMarker(event.latlng, "Quick route start selected", quickStartMarker);
      quickRouteHint.textContent = `Start point selected at ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}. Now choose the end point or save the route.`;
    } else {
      quickEndMarker = createQuickMarker(event.latlng, "Quick route end selected", quickEndMarker);
      quickRouteHint.textContent = `End point selected at ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}. Save the route to generate the road directions.`;
    }
    updateQuickCoords();

    fillStopFormFromPin(event.latlng.lat, event.latlng.lng);

    if (previewMarker) {
      adminMap.removeLayer(previewMarker);
    }

    previewMarker = L.marker([event.latlng.lat, event.latlng.lng]).addTo(adminMap);
    previewMarker.bindPopup(`${pinMode === "start" ? "Start" : pinMode === "end" ? "End" : "Stop"} pin selected`).openPopup();
    adminMapHint.textContent = `Selected ${pinMode} pin at ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}. Save the form to add it to the route.`;
  });
}

function clearMapLayers() {
  stopMarkers.forEach((marker) => adminMap.removeLayer(marker));
  stopMarkers = [];

  if (routePreviewLine) {
    adminMap.removeLayer(routePreviewLine);
    routePreviewLine = null;
  }

  if (quickStartMarker) {
    adminMap.removeLayer(quickStartMarker);
    quickStartMarker = null;
  }

  if (quickEndMarker) {
    adminMap.removeLayer(quickEndMarker);
    quickEndMarker = null;
  }
}

function resetDirectionsPanel(message = "Save at least two route pins to build a directions-style road preview.") {
  routeDistanceValue.textContent = "--";
  routeDurationValue.textContent = "--";
  routeStopCountValue.textContent = "0";
  routeStopNamesList.innerHTML = '<p class="route-steps-empty">Saved route stops will appear here after you add pins.</p>';
  routeStepsList.innerHTML = `<p class="route-steps-empty">${message}</p>`;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "--";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "--";
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours} hr ${minutes} min`;
}

function formatStepDistance(step) {
  return formatDistance(Number(step.distance || 0));
}

function describeStep(step) {
  const maneuver = step.maneuver || {};
  const modifier = maneuver.modifier ? ` ${maneuver.modifier}` : "";
  const type = maneuver.type ? maneuver.type.replace(/_/g, " ") : "continue";
  const baseText = step.name ? `${type}${modifier} on ${step.name}` : `${type}${modifier}`;
  return baseText.charAt(0).toUpperCase() + baseText.slice(1);
}

function renderStopNamesPanel(stops) {
  routeStopNamesList.innerHTML = stops
    .map((stop, index, allStops) => {
      const role = index === 0 ? "Start" : index === allStops.length - 1 ? "End" : "Stop";
      return `
        <article class="route-stop-name-item">
          <div class="route-stop-name-badge">${index + 1}</div>
          <div class="route-stop-name-copy">
            <h4>${stop.stopName}</h4>
            <p>${role} | ${stop.stopCode}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDirectionsPanel(route, stops) {
  routeDistanceValue.textContent = formatDistance(Number(route.distance));
  routeDurationValue.textContent = formatDuration(Number(route.duration));
  routeStopCountValue.textContent = String(stops.length);
  renderStopNamesPanel(stops);

  const steps = (route.legs || []).reduce((allSteps, leg) => allSteps.concat(leg.steps || []), []);
  if (!steps.length) {
    routeStepsList.innerHTML = '<p class="route-steps-empty">Road route generated. No turn-by-turn steps were returned for this path.</p>';
    return;
  }

  routeStepsList.innerHTML = steps
    .map(
      (step, index) => `
        <article class="route-step-item">
          <div class="route-step-index">${index + 1}</div>
          <div class="route-step-copy">
            <h4>${describeStep(step)}</h4>
            <p>${formatStepDistance(step)}</p>
          </div>
        </article>
      `
    )
    .join("");
}

async function fetchDirectionsRoute(stops) {
  const coords = stops.map((stop) => `${stop.longitude},${stop.latitude}`).join(";");
  const routeUrl = `${ROUTING_API_BASE_URL}/${coords}?overview=full&steps=true&geometries=geojson`;
  const response = await fetch(routeUrl);
  const data = await response.json();

  if (!response.ok || !data.routes || !data.routes.length) {
    throw new Error(data.message || "Could not build road directions preview");
  }

  return data.routes[0];
}

async function renderBusRouteOnMap(bus) {
  ensureMap();
  clearMapLayers();

  if (previewMarker) {
    adminMap.removeLayer(previewMarker);
    previewMarker = null;
  }

  const stops = getSortedStops(bus);
  routeStopCountValue.textContent = String(stops.length);

  if (!stops.length) {
    adminMap.setView([23.8388, 78.7387], 13);
    adminMapHint.textContent = "This bus has no saved route points yet. Use the quick route setup to add start and end points.";
    resetDirectionsPanel();
    syncQuickRouteForm(bus);
    return;
  }

  stops.forEach((stop, index) => {
    const marker = createStopMarker(stop, index, stops.length);
    stopMarkers.push(marker);

    if (index === stops.length - 1) {
      marker.openPopup();
    }
  });

  syncQuickRouteForm(bus);
  const bounds = L.latLngBounds(stops.map((stop) => [stop.latitude, stop.longitude]));
  adminMap.fitBounds(bounds.pad(0.2));

  if (stops.length < 2) {
    renderStopNamesPanel(stops);
    adminMapHint.textContent = `Saved ${stops.length} route pin for ${bus.busCode}. Add an end pin to generate directions on the road network.`;
    routeDistanceValue.textContent = "--";
    routeDurationValue.textContent = "--";
    routeStopCountValue.textContent = String(stops.length);
    routeStepsList.innerHTML = '<p class="route-steps-empty">Add one more route pin to build the driving route between start and end points.</p>';
    return;
  }

  try {
    const route = await fetchDirectionsRoute(stops);
    const geometry = route.geometry;

    if (geometry) {
      routePreviewLine = L.geoJSON(geometry, {
        style: {
          color: "#0f8b83",
          weight: 5,
          opacity: 0.9,
        },
      }).addTo(adminMap);
    } else {
      routePreviewLine = L.polyline(stops.map((stop) => [stop.latitude, stop.longitude]), {
        color: "#0f8b83",
        weight: 5,
        opacity: 0.9,
      }).addTo(adminMap);
    }

    renderDirectionsPanel(route, stops);
    adminMapHint.textContent = `Directions preview ready for ${bus.busCode}. This same route will be shown on the passenger map.`;
    quickRouteHint.textContent = `Route ${bus.routeName} is ready. Start and end names are saved and visible on the passenger side.`;
  } catch (error) {
    console.error("Failed to preview route", error);
    routePreviewLine = L.polyline(stops.map((stop) => [stop.latitude, stop.longitude]), {
      color: "#0f8b83",
      weight: 5,
      opacity: 0.9,
    }).addTo(adminMap);
    renderStopNamesPanel(stops);
    routeDistanceValue.textContent = "--";
    routeDurationValue.textContent = "--";
    routeStopCountValue.textContent = String(stops.length);
    routeStepsList.innerHTML = '<p class="route-steps-empty">Road preview service is unavailable right now, so a direct route line is shown instead.</p>';
    adminMapHint.textContent = `Pins were saved for ${bus.busCode}, and a direct route line is shown on the map.`;
  }
}

function focusBus(busId) {
  selectedBusId = String(busId);
  stopBusId.value = String(busId);
  const bus = getSelectedBus();

  if (!bus) {
    return;
  }

  const nextOrder = ((bus.stops && bus.stops.length) || 0) + 1;
  stopOrder.value = String(nextOrder);
  renderBusRouteOnMap(bus);
}

function renderBusOptions(buses) {
  const optionsHtml = buses
    .map((bus) => `<option value="${bus.id}">${bus.busCode} - ${bus.routeName}</option>`)
    .join("");

  stopBusId.innerHTML = optionsHtml;

  if (buses.length) {
    if (!selectedBusId || !buses.some((bus) => String(bus.id) === String(selectedBusId))) {
      selectedBusId = String(buses[0].id);
    }
    stopBusId.value = selectedBusId;
  }
}

function renderBusList(buses) {
  if (!buses.length) {
    adminBusList.innerHTML = `
      <div class="rounded-card border border-dashed border-white/10 bg-slate-950/30 px-5 py-8 text-center text-sm text-slate-400">
        No buses match the current search. Add a bus or clear the filter.
      </div>
    `;
    return;
  }

  adminBusList.innerHTML = buses
    .map((bus) => {
      const stops = (bus.stops || [])
        .sort((a, b) => a.stopOrder - b.stopOrder)
        .map(
          (stop, index, allStops) => `
            <div class="rounded-2xl border border-white/8 bg-slate-950/30 p-4 ${index === 0 ? "ring-1 ring-blue-400/20" : index === allStops.length - 1 ? "ring-1 ring-emerald-400/20" : ""}">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h4 class="text-sm font-semibold text-white">${stop.stopName}</h4>
                  <p class="mt-1 text-xs text-slate-400">${stop.stopCode} | Order ${stop.stopOrder}</p>
                  <p class="mt-2 text-xs text-slate-500">${Number(stop.latitude).toFixed(5)}, ${Number(stop.longitude).toFixed(5)}</p>
                </div>
                <button type="button" data-stop-id="${stop.id}" class="delete-stop">Delete</button>
              </div>
            </div>
          `
        )
        .join("");

      return `
        <article class="rounded-card border border-white/10 bg-slate-950/30 p-5 transition-all duration-300 ${String(bus.id) === String(selectedBusId) ? "active-bus-card" : ""}">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-3">
                <h3 class="text-lg font-bold text-white">${bus.busCode}</h3>
                ${getBusStatusBadge(bus.status)}
              </div>
              <p class="mt-2 text-sm text-slate-300">${bus.routeName}</p>
              <p class="mt-1 text-xs text-slate-500">Driver PIN | ${bus.driverPin}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" data-focus-bus="${bus.id}" class="focus-route-btn">Show Route</button>
              <button type="button" data-delete-bus="${bus.id}" data-bus-code="${bus.busCode}" class="remove-bus-btn">Remove</button>
            </div>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <div class="rounded-2xl bg-white/5 px-4 py-3">
              <span class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Stops</span>
              <strong class="mt-2 block text-lg text-white">${(bus.stops || []).length}</strong>
            </div>
            <div class="rounded-2xl bg-white/5 px-4 py-3">
              <span class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Latitude</span>
              <strong class="mt-2 block text-sm text-white">${bus.latitude == null ? "--" : Number(bus.latitude).toFixed(5)}</strong>
            </div>
            <div class="rounded-2xl bg-white/5 px-4 py-3">
              <span class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Longitude</span>
              <strong class="mt-2 block text-sm text-white">${bus.longitude == null ? "--" : Number(bus.longitude).toFixed(5)}</strong>
            </div>
          </div>
          <div class="mt-4 space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Saved stops</p>
              <p class="text-xs text-slate-500">${(bus.stops || []).length ? "Route points configured" : "No route points yet"}</p>
            </div>
            <div class="space-y-3">${stops || '<p class="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">No route points yet. Use the start/end route setup above.</p>'}</div>
          </div>
        </article>
      `;
    })
    .join("");

  adminBusList.querySelectorAll(".delete-stop").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await requestJson(`${API_BASE_URL}/api/admin/stops/${button.dataset.stopId}`, {
          method: "DELETE",
        });
        await loadAdminData();
      } catch (error) {
        setState(false, error.message);
      }
    });
  });

  adminBusList.querySelectorAll(".focus-route-btn").forEach((button) => {
    button.addEventListener("click", () => {
      focusBus(button.dataset.focusBus);
    });
  });

  adminBusList.querySelectorAll(".remove-bus-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const busCode = button.dataset.busCode || "this bus";
      const shouldDelete = window.confirm(`Are you sure you want to remove ${busCode}? This will also remove its route, sessions, and saved location history.`);
      if (!shouldDelete) return;

      try {
        await requestJson(`${API_BASE_URL}/api/admin/buses/${button.dataset.deleteBus}`, {
          method: "DELETE",
        });
        if (String(selectedBusId) === String(button.dataset.deleteBus)) {
          selectedBusId = null;
        }
        await loadAdminData();
        setState(true, `${busCode} removed`);
      } catch (error) {
        setState(false, error.message);
      }
    });
  });
}

async function loadAdminData() {
  if (!isLoggedIn()) {
    return;
  }

  try {
    const list = await requestJson(`${API_BASE_URL}/api/admin/buses`);
    const detailed = await Promise.all(
      list.buses.map((bus) => requestJson(`${API_BASE_URL}/api/admin/buses/${bus.id}`).then((data) => data.bus))
    );

    adminBuses = detailed;
    updateDashboardMetrics(detailed);
    renderBusOptions(detailed);
    applyBusSearchFilter();

    if (detailed.length) {
      focusBus(selectedBusId || detailed[0].id);
    } else {
      ensureMap();
      clearMapLayers();
      adminMap.setView([23.8388, 78.7387], 13);
      adminMapHint.textContent = "Add a bus first, then choose the start and end points on the map to create its route.";
      quickRouteHint.textContent = "Add a bus first, then pick the start point and end point on the map.";
      resetDirectionsPanel();
    }

    setState(true, `Loaded ${detailed.length} buses`);
  } catch (error) {
    setState(false, error.message);
  }
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = adminUsername.value.trim();
  const password = adminPassword.value;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    showLogin("Invalid admin ID or password.");
    adminPassword.value = "";
    return;
  }

  sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
  showDashboard();
  ensureMap();
  window.setTimeout(() => adminMap.invalidateSize(), 120);
  await loadAdminData();
});

adminLogout.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  showLogin("Logged out.");
  adminLoginForm.reset();
});

stopBusId.addEventListener("change", () => {
  selectedBusId = stopBusId.value;

  focusBus(selectedBusId);
});

pickQuickStartButton.addEventListener("click", () => setQuickPinMode("start"));
pickQuickEndButton.addEventListener("click", () => setQuickPinMode("end"));
setStartPinButton.addEventListener("click", () => setPinMode("start"));
setStopPinButton.addEventListener("click", () => setPinMode("stop"));
setEndPinButton.addEventListener("click", () => setPinMode("end"));

busForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    busCode: document.getElementById("busCode").value.trim(),
    routeName: document.getElementById("routeName").value.trim(),
    driverPin: document.getElementById("driverPin").value.trim(),
  };

  try {
    await requestJson(`${API_BASE_URL}/api/admin/buses`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    busForm.reset();
    await loadAdminData();
  } catch (error) {
    setState(false, error.message);
  }
});

quickRouteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!quickRoutePoints.start || !quickRoutePoints.end) {
    setState(false, "Choose both start and end points on the map before saving the route");
    return;
  }

  const busId = selectedBusId;
  if (!busId) {
    setState(false, "Select a bus from the bus list first");
    return;
  }

  const payload = {
    routeName: quickRouteName.value.trim(),
    startName: quickStartName.value.trim(),
    endName: quickEndName.value.trim(),
    startLatitude: quickRoutePoints.start.lat,
    startLongitude: quickRoutePoints.start.lng,
    endLatitude: quickRoutePoints.end.lat,
    endLongitude: quickRoutePoints.end.lng,
  };

  try {
    await requestJson(`${API_BASE_URL}/api/admin/buses/${busId}/quick-route`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    quickRouteHint.textContent = "Start point and end point saved. This route is now available on the passenger map.";
    await loadAdminData();
  } catch (error) {
    setState(false, error.message);
  }
});

stopForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const busId = stopBusId.value;
  if (!busId) {
    setState(false, "Select a bus from the bus list first");
    return;
  }

  const payload = {
    stopCode: stopCode.value.trim(),
    stopName: stopName.value.trim(),
    latitude: Number(stopLatitude.value),
    longitude: Number(stopLongitude.value),
    stopOrder: Number(stopOrder.value),
  };

  try {
    await requestJson(`${API_BASE_URL}/api/admin/buses/${busId}/stops`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    stopForm.reset();
    await loadAdminData();
  } catch (error) {
    setState(false, error.message);
  }
});

reloadAdmin.addEventListener("click", loadAdminData);
rebuildDirections.addEventListener("click", () => {
  const bus = getSelectedBus();
  if (bus) {
    renderBusRouteOnMap(bus);
  }
});

if (adminBusSearch) {
  adminBusSearch.addEventListener("input", () => {
    applyBusSearchFilter();
  });
}

if (adminSidebarToggle) {
  adminSidebarToggle.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });
}

applyAdminTheme(getSavedAdminTheme());

adminThemeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("light-admin") ? "dark" : "light";
    applyAdminTheme(nextTheme);
    try {
      window.localStorage.setItem(ADMIN_THEME_KEY, nextTheme);
    } catch (error) {
      console.warn("Could not persist admin theme", error);
    }
  });
});

if (isLoggedIn()) {
  showDashboard();
  ensureMap();
  window.setTimeout(() => adminMap.invalidateSize(), 120);
  loadAdminData();
} else {
  showLogin();
}





