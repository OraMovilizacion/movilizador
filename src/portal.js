import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import MapLibreGlDirections from "@maplibre/maplibre-gl-directions";
import "./portal.css";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const API_URL = "./api.php";
const isAdminPanel = document.body.dataset.portalMode === "admin";
const PENDING_KEY = "movilizaciones-pending-tracking-v1";
const TRACKING_DB = "movilizaciones-local";
const TRACKING_STORE = "tracking_sessions";
const POINT_DISTANCE_METERS = 20;
const TRACKING_SIGNAL_STALE_SECONDS = 120;

const loginScreen = document.getElementById("login-screen");
const portalScreen = document.getElementById("portal-screen");
const workflowScreen = document.getElementById("mobilizer-workflow-screen");
const workflowContent = document.getElementById("mobilizer-workflow-content");
const loginMessage = document.getElementById("login-message");
const noticeTimers = new WeakMap();
const loginForm = document.getElementById("login-form");
const eventModal = document.getElementById("event-modal");
const detailModal = document.getElementById("detail-modal");
const eventForm = document.getElementById("event-form");
const eventMessage = document.getElementById("event-message");

let csrfToken = "";
let user = null;
let events = [];
let reportEvents = [];
let territories = [];
let systemRoles = [];
let systemAdminUsers = [];
let routeMap = null;
let detailMap = null;
let endMarker = null;
let activeEvent = null;
let activeTracking = null;
let trackingPoints = [];
let pointSaveChain = Promise.resolve();
let trackingDatabase;
let currentPortalPage = isAdminPanel ? "tracking" : "events";
let trackingOverviewMap = null;
let trackingOverviewEvents = [];
let trackingOverviewMobilizers = [];
let selectedTrackingEventId = "";
let selectedTrackingAssignmentId = "";
let trackingOverviewMarkers = new Map();
let trackingOverviewRoute = null;
let trackingDestinationMarker = null;
let trackingRouteRequestId = 0;
let trackingRoutedCoordinateKey = "";
let trackingRouteStatus = null;
let trackingMapEventId = "";
let trackingWalkedKey = "";
let trackingWalkedLayers = [];
let trackingWalkedPoints = [];
let trackingWalkedRequestId = 0;
let trackingDirections = null;
let trackingOverviewLoading = false;
let trackingPresentationActive = false;
const workflowMaps = new Map();
const workflowTrackingMaps = new Map();
const reverseGeocodeCache = new Map();
let reverseGeocodeQueue = Promise.resolve();
let lastReverseGeocodeAt = 0;

const openStreetMapStyle = "https://tiles.openfreemap.org/styles/liberty";
const mapAttribution = '&copy; <a href="https://openfreemap.org/">OpenFreeMap</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function createMap(container, center = [-66.9036, 10.4806], zoom = 11, options = {}) {
  return new maplibregl.Map({
    container,
    style: openStreetMapStyle,
    center,
    zoom,
    attributionControl: true,
    customAttribution: mapAttribution,
    ...options
  });
}

function fitMapToPoints(map, points, padding = 24, maxZoom = 15) {
  const validPoints = points.filter(point =>
    Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
  );
  if (!validPoints.length) return;
  const bounds = new maplibregl.LngLatBounds(validPoints[0], validPoints[0]);
  validPoints.slice(1).forEach(point => bounds.extend(point));
  map.fitBounds(bounds, { padding, maxZoom });
}

function setMapLine(map, id, coordinates, paint = {}) {
  if (!map || !Array.isArray(coordinates) || coordinates.length < 2) return;
  const update = () => {
    if (!map.getStyle()) return;
    const casingId = `${id}-casing`;
    const data = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates }
    };
    [id, casingId].forEach(sourceId => {
      const source = map.getSource(sourceId);
      if (source) source.setData(data);
      else map.addSource(sourceId, { type: "geojson", data });
    });
    if (!map.getLayer(casingId)) {
      map.addLayer({
        id: casingId,
        type: "line",
        source: casingId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": (paint.weight || 4) + 4,
          "line-opacity": 0.95
        }
      });
    }
    if (!map.getLayer(id)) {
      if (!map.getSource(id)) map.addSource(id, { type: "geojson", data });
      map.addLayer({
        id,
        type: "line",
        source: id,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": paint.color || "#1681b4",
          "line-width": paint.weight || 4,
          "line-opacity": paint.opacity ?? 0.9,
          ...(paint.dashArray ? { "line-dasharray": [2, 2] } : {})
        }
      });
    }
    map.moveLayer(casingId);
    map.moveLayer(id);
  };
  if (map.getStyle()) update();
  else map.once("style.load", update);
}

function removeMapLine(map, id) {
  if (!map || !map.getStyle()) return;
  if (map.getLayer(id)) map.removeLayer(id);
  const casingId = `${id}-casing`;
  if (map.getLayer(casingId)) map.removeLayer(casingId);
  if (map.getSource(id)) map.removeSource(id);
  if (map.getSource(casingId)) map.removeSource(casingId);
}

function setDirectionsWaypoints(directions, points) {
  if (!directions || points.some(point => !Array.isArray(point))) return;
  directions.waypoints = points;
}

function createMapMarker(map, coordinates, {
  className = "",
  html = "",
  draggable = false,
  popup = "",
  popupClass = ""
} = {}) {
  if (!className && !html) {
    className = "route-map-marker";
    html = '<span aria-hidden="true"></span>';
  }
  const element = document.createElement("div");
  element.className = className;
  element.innerHTML = html;
  const marker = new maplibregl.Marker({ element, anchor: "bottom", draggable })
    .setLngLat(coordinates)
    .addTo(map);
  if (popup) {
    marker.setPopup(new maplibregl.Popup({
      closeButton: true,
      offset: 24,
      className: popupClass,
      maxWidth: "280px"
    }).setHTML(popup));
  }
  return marker;
}

function showFormMessage(element, message, isError = true) {
  element.textContent = message;
  element.classList.toggle("visible", Boolean(message));
  element.style.color = isError ? "" : "var(--blue)";
}

function displayTemporaryNotice(notice, message, isError = true) {
  if (!notice) return;
  const previousTimeout = noticeTimers.get(notice);
  if (previousTimeout) window.clearTimeout(previousTimeout);
  notice.textContent = message;
  notice.hidden = !message;
  notice.style.borderColor = isError ? "" : "#cfe3d5";
  notice.style.background = isError ? "" : "#f0f7f2";
  notice.style.color = isError ? "" : "#426650";
  if (message) {
    noticeTimers.set(notice, window.setTimeout(() => {
      notice.hidden = true;
      notice.textContent = "";
      notice.style.borderColor = "";
      notice.style.background = "";
      notice.style.color = "";
    }, 6000));
  }
}

function showNotice(message, isError = true, page = isAdminPanel ? currentPortalPage : "events") {
  const notice = document.getElementById(`${page}-notice`);
  if (notice) displayTemporaryNotice(notice, message, isError);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

async function request(action, { method = "GET", data, form, query = {} } = {}) {
  const url = new URL(API_URL, window.location.href);
  url.searchParams.set("action", action);
  if (isAdminPanel) url.searchParams.set("area", "admin");
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const headers = {};
  const options = { method, credentials: "same-origin", headers };
  if (method !== "GET") {
    headers["X-CSRF-Token"] = csrfToken;
    if (form) {
      options.body = form;
    } else {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(data ?? {});
    }
  }
  const response = await fetch(url.toString(), options);
  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("El servidor devolvió una respuesta inválida. Verifica PHP y la API.");
  }
  if (!response.ok) {
    if (response.status === 401 && action !== "login") {
      showLogin("Tu sesión expiró. Inicia sesión nuevamente.");
    }
    throw new Error(result.error || "No se pudo completar la solicitud.");
  }
  return result;
}

function showLogin(message = "") {
  loginScreen.hidden = false;
  portalScreen.hidden = true;
  workflowScreen.hidden = true;
  document.querySelectorAll(".modal-backdrop").forEach(modal => {
    modal.hidden = true;
  });
  if (message) showFormMessage(loginMessage, message);
}

function showPortal() {
  loginScreen.hidden = true;
  workflowScreen.hidden = true;
  portalScreen.hidden = false;
  loginMessage.textContent = "";
  loginMessage.classList.remove("visible");
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-avatar").textContent = user.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  document.getElementById("user-role").textContent = isAdminPanel
    ? user.superadmin ? "Superadministrador" : user.roleName || "Administración"
    : "Responsable";
  document.getElementById("heading-name").textContent = isAdminPanel ? "Seguimiento en vivo" : "Movilizaciones disponibles";
  document.getElementById("heading-description").textContent = isAdminPanel
    ? "Ubicación y avance de los movilizadores en ruta."
    : "Selecciona una movilización para completar los pasos y registrar tu viaje.";
  document.getElementById("new-event-button").hidden =
    currentPortalPage !== "events" || user.role !== "admin" || !canAccessModule("events");
  document.querySelectorAll("[data-module-nav]").forEach(button => {
    button.hidden = !canAccessModule(button.dataset.moduleNav);
  });
  document.getElementById("today-label").textContent = new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(new Date());
}

function canAccessModule(module) {
  return !isAdminPanel || user?.role !== "admin" || user.superadmin ||
    (Array.isArray(user.modules) && user.modules.includes(module));
}

async function enterWorkspace() {
  showPortal();
  if (!isAdminPanel) {
    await loadEvents();
    await flushPendingPoints();
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (eventId) await openEvent(eventId);
    return;
  }
  if (canAccessModule("events")) await loadEvents();
  const firstModule = ["tracking", "events", "reports", "structure", "settings"]
    .find(canAccessModule);
  const eventId = new URLSearchParams(window.location.search).get("event");
  if (eventId && canAccessModule("events")) {
    showPage("events");
    await openEvent(eventId);
  } else if (firstModule) {
    showPage(firstModule);
  } else {
    showNotice("Esta cuenta no tiene módulos habilitados. Contacta al superadministrador.");
  }
}

function showPage(page) {
  if (isAdminPanel && !canAccessModule(page)) {
    showNotice("Tu rol no tiene acceso a este módulo.");
    return;
  }
  currentPortalPage = page;
  document.querySelectorAll("[data-page]").forEach(section => {
    section.hidden = section.dataset.page !== page;
  });
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === page);
  });
  const pageLabels = {
    tracking: ["Seguimiento en vivo", "Ubicación y avance de los movilizadores en ruta."],
    events: [isAdminPanel ? "Movilizaciones" : "Movilizaciones disponibles", isAdminPanel ? "Crea y administra las actividades de movilización." : "Selecciona una movilización para completar los pasos y registrar tu viaje."],
    structure: ["Estructura", "Gestiona las cuentas y unidades de movilización."],
    reports: ["Reportes de movilización", "Elige una actividad para generar su presentación resumida."],
    settings: ["Configuración", "Administra usuarios administrativos y permisos por módulo."]
  };
  const [heading, description] = pageLabels[page] || pageLabels.events;
  document.getElementById("heading-name").textContent = heading;
  document.getElementById("heading-description").textContent = description;
  document.getElementById("current-page-label").textContent =
    page === "structure" ? "Estructura" : page === "tracking" ? "Seguimiento" :
      page === "reports" ? "Reportes" : page === "settings" ? "Configuración" :
        isAdminPanel ? "Movilizaciones" : "Mis movilizaciones";
  document.getElementById("new-event-button").hidden =
    page !== "events" || user.role !== "admin" || !canAccessModule("events");
  if (page === "structure") void loadStructure().catch(error => showStructureNotice(error.message));
  if (page === "reports" && isAdminPanel) void loadReportEvents().catch(error => showNotice(error.message, true, "reports"));
  if (page === "settings" && isAdminPanel) void loadSystemSettings().catch(error => showSettingsNotice(error.message));
  if (page === "tracking" && isAdminPanel) {
    initializeTrackingOverviewMap();
    window.setTimeout(() => trackingOverviewMap?.resize(), 50);
    void loadTrackingOverview().catch(error => showNotice(error.message, true, "tracking"));
  }
}

async function loadEvents() {
  const result = await request("events");
  events = result.events;
  renderEvents();
}

async function loadReportEvents() {
  const result = await request("report-events");
  reportEvents = result.events;
  renderReportEvents();
}

function renderReportEvents() {
  const list = document.getElementById("report-events-list");
  if (!list) return;
  list.innerHTML = reportEvents.length
    ? reportEvents.map(event => `<article class="report-event-row">
        <div class="report-event-info">
          <strong>${escapeHtml(event.nombre)}</strong>
          <span>${escapeHtml(eventDate(event.fecha))}${event.hora_inicio ? ` · ${escapeHtml(String(event.hora_inicio).slice(0, 5))}` : ""} · ${escapeHtml(event.lugar || "Lugar no especificado")}</span>
        </div>
        <button class="report-event-action" type="button" data-generate-event-report="${Number(event.id)}"
          aria-label="Generar resumen de ${escapeHtml(event.nombre)}" title="Generar resumen">${reportIcon("chart")}</button>
      </article>`).join("")
    : '<div class="empty-state">No hay movilizaciones registradas para reportar.</div>';
}

function reportValue(value, fallback = "Sin registrar") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function reportDateTime(value) {
  if (!value) return "Sin registrar";
  const date = new Date(String(value).replace(" ", "T") + (String(value).endsWith("Z") ? "" : "Z"));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function reportCoordinate(latitude, longitude) {
  if (latitude === null || longitude === null || latitude === "" || longitude === "") return "Sin registrar";
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(7)}, ${lng.toFixed(7)}` : "Sin registrar";
}

function reportVehicleItems(assignment) {
  const vehicles = parseTrackingVehicles(assignment.vehiculos_json);
  if (vehicles.length) {
    return vehicles.map(vehicle => ({
      id: String(vehicle.id || ""),
      type: String(vehicle.type || "Vehículo"),
      count: Math.max(0, Number(vehicle.count) || 0),
      plates: String(vehicle.plates || "").trim()
    }));
  }
  const buses = Number(assignment.cantidad_autobuses) || 0;
  return buses ? [{ type: "Autobús", count: buses, plates: "" }] : [];
}

function reportPhotoCaption(photo, assignment) {
  const type = String(photo.tipo || "evidencia").replaceAll("_", " ");
  if (photo.tipo !== "vehiculo") return type;
  const vehicle = parseTrackingVehicles(assignment.vehiculos_json)
    .find(item => String(item.id || "") === String(photo.vehiculo_id || ""));
  if (!vehicle) return "Vehículo · sin asociación individual";
  const details = [vehicle.type || "Vehículo", vehicle.plates ? `placa ${vehicle.plates}` : ""].filter(Boolean);
  return `Vehículo · ${details.join(" · ")}`;
}

function reportDuration(seconds) {
  const duration = Number(seconds);
  return Number.isFinite(duration) && duration > 0 ? formatEstimatedDuration(duration) : "Sin estimación";
}

function reportRouteSummary(value) {
  if (!value) return "Sin ruta guardada";
  const coordinates = parseTrackingRoute(value);
  if (coordinates.length < 2) return "Ruta guardada; geometría no disponible";
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return `${coordinates.length.toLocaleString("es")} puntos · inicio ${reportCoordinate(first[1], first[0])} · fin ${reportCoordinate(last[1], last[0])}`;
}

function reportField(label, value) {
  return `<div class="report-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(reportValue(value))}</strong></div>`;
}

function reportTrackingSession(session) {
  const points = Array.isArray(session.points) ? session.points : [];
  const pointRows = points.map(point => `<tr>
    <td>${escapeHtml(reportValue(point.secuencia))}</td>
    <td>${escapeHtml(reportDateTime(point.registrado_en))}</td>
    <td>${escapeHtml(reportCoordinate(point.latitud, point.longitud))}</td>
    <td>${escapeHtml(point.precision_metros === null ? "Sin dato" : `${point.precision_metros} m`)}</td>
    <td>${escapeHtml(point.altitud_metros === null ? "Sin dato" : `${point.altitud_metros} m`)}</td>
    <td>${escapeHtml(point.velocidad_metros_segundo === null ? "Sin dato" : `${point.velocidad_metros_segundo} m/s`)}</td>
    <td>${escapeHtml(point.rumbo_grados === null ? "Sin dato" : `${point.rumbo_grados}°`)}</td>
    <td>${Number(point.simulado) ? "Sí" : "No"}</td>
  </tr>`).join("");
  return `<section class="report-subsection">
    <h4>Sesión GPS #${escapeHtml(session.id)}${session.tipo === "retorno" ? " (retorno)" : ""} · ${escapeHtml(session.llegada_confirmada_en ? (session.tipo === "retorno" ? "Regresó" : "Llegó") : String(session.estado || "").replaceAll("_", " "))}</h4>
    <div class="report-fields">
      ${reportField("Inicio", reportDateTime(session.iniciado_en))}
      ${reportField("Finalización", reportDateTime(session.finalizado_en))}
      ${reportField("Llegada confirmada", reportDateTime(session.llegada_confirmada_en))}
      ${reportField("Consentimiento", reportValue(session.consentimiento_version))}
      ${reportField("Consentimiento aceptado", reportDateTime(session.consentimiento_aceptado_en))}
      ${reportField("Puntos GPS registrados", points.length)}
    </div>
    ${points.length ? `<div class="report-table-wrap"><table class="report-table"><thead><tr><th>#</th><th>Fecha y hora</th><th>Coordenadas</th><th>Precisión</th><th>Altitud</th><th>Velocidad</th><th>Rumbo</th><th>Simulado</th></tr></thead><tbody>${pointRows}</tbody></table></div>` : '<p class="report-muted">Esta sesión todavía no tiene puntos GPS guardados.</p>'}
  </section>`;
}

function buildEventReport({ event, assignments }) {
  const planned = assignments.reduce((sum, item) => sum + (Number(item.personas_planificadas) || Number(item.cuota_personas) || 0), 0);
  const withAttendance = assignments.filter(item => item.personas_asistentes !== null && item.personas_asistentes !== "");
  const attendees = withAttendance.reduce((sum, item) => sum + (Number(item.personas_asistentes) || 0), 0);
  const vehiclesByType = new Map();
  let totalVehicles = 0;
  let totalPhotos = 0;
  let totalPoints = 0;
  assignments.forEach(assignment => {
    reportVehicleItems(assignment).forEach(vehicle => {
      totalVehicles += vehicle.count;
      vehiclesByType.set(vehicle.type, (vehiclesByType.get(vehicle.type) || 0) + vehicle.count);
    });
    totalPhotos += assignment.photos?.length || 0;
    totalPoints += (assignment.trackingSessions || []).reduce((count, session) => count + (session.points?.length || 0), 0);
  });
  const vehicleSummary = [...vehiclesByType].map(([type, count]) => `${type}: ${count}`).join(" · ") || "Ningún vehículo reportado";
  const eventRouteDistance = Number(event.ruta_distancia_metros);
  const assignmentsHtml = assignments.length ? assignments.map(assignment => {
    const vehicles = reportVehicleItems(assignment);
    const vehicleRows = vehicles.length ? vehicles.map(vehicle => `<tr><td>${escapeHtml(vehicle.type)}</td><td>${vehicle.count}</td><td>${escapeHtml(vehicle.plates || "Sin placa registrada")}</td></tr>`).join("") : '<tr><td colspan="3">No reportó vehículos</td></tr>';
    const photos = assignment.photos || [];
    const photoGallery = photos.length ? `<div class="report-photos">${photos.map(photo => `
      <figure>${photo.url ? `<img src="${escapeHtml(new URL(photo.url, window.location.href).href)}" alt="${escapeHtml(photo.nombre_original || photo.tipo)}">` : '<div class="report-photo-missing">Imagen no disponible</div>'}
      <figcaption><strong>${escapeHtml(reportPhotoCaption(photo, assignment))}</strong><span>${escapeHtml(reportValue(photo.nombre_original))}</span><small>${escapeHtml(reportDateTime(photo.subido_en))}</small></figcaption></figure>`).join("")}</div>` : '<p class="report-muted">No se cargaron evidencias fotográficas.</p>';
    const sessions = assignment.trackingSessions || [];
    const sessionHtml = sessions.length ? sessions.map(reportTrackingSession).join("") : '<p class="report-muted">No hay sesiones de tracking registradas.</p>';
    const attendedText = assignment.personas_asistentes === null || assignment.personas_asistentes === ""
      ? "Pendiente de reportar"
      : Number(assignment.personas_asistentes).toLocaleString("es");
    const mobilizerName = assignment.responsable || assignment.responsable_legacy || "Sin responsable asignado";
    const territory = [assignment.responsable_unidad, assignment.responsable_estado].filter(Boolean).join(", ");
    const photosByType = ["lista", "vehiculo", "grupo", "asistencia"].map(type =>
      `${type}: ${photos.filter(photo => photo.tipo === type).length}`
    ).join(" · ");
    return `<article class="report-assignment">
      <header class="report-assignment-heading"><div><p>REGISTRO #${escapeHtml(assignment.id)}</p><h3>${escapeHtml(assignment.ente)}</h3><span>${escapeHtml(mobilizerName)}${territory ? ` · ${escapeHtml(territory)}` : ""}</span></div><span class="report-badge">${assignment.datos_confirmados_en ? "Datos confirmados" : "Registro incompleto"}</span></header>
      <section class="report-subsection"><h4>Personas y registro</h4><div class="report-fields">
        ${reportField("Responsable", mobilizerName)}
        ${reportField("Teléfono", assignment.responsable_telefono || assignment.responsable_legacy_telefono)}
        ${reportField("Correo", assignment.responsable_correo || assignment.responsable_legacy_correo)}
        ${reportField("Unidad territorial", territory)}
        ${reportField("Personas planificadas", assignment.personas_planificadas ?? assignment.cuota_personas)}
        ${reportField("Personas asistentes", attendedText)}
        ${reportField("Lista revisada", reportDateTime(assignment.plan_confirmado_en))}
        ${reportField("Asistencia reportada", reportDateTime(assignment.asistencia_reportada_en))}
        ${reportField("Registro creado", reportDateTime(assignment.creado_en))}
        ${reportField("Última actualización", reportDateTime(assignment.actualizado_en))}
      </div></section>
      <section class="report-subsection"><h4>Transporte y ruta individual</h4><div class="report-fields">
        ${reportField("Requiere transporte", assignment.requiere_transporte === null ? "Sin responder" : Number(assignment.requiere_transporte) ? "Sí" : "No")}
        ${reportField("Cantidad de autobuses", assignment.cantidad_autobuses)}
        ${reportField("Receptor del transporte", assignment.receptor_transporte)}
        ${reportField("Transporte confirmado", reportDateTime(assignment.transporte_confirmado_en))}
        ${reportField("Salida", assignment.punto_salida)}
        ${reportField("Coordenadas de salida", reportCoordinate(assignment.punto_salida_lat, assignment.punto_salida_lng))}
        ${reportField("Destino individual", assignment.punto_llegada_nombre)}
        ${reportField("Coordenadas de destino", reportCoordinate(assignment.punto_llegada_lat, assignment.punto_llegada_lng))}
        ${reportField("Distancia estimada", Number(assignment.ruta_personal_distancia_metros) ? `${(Number(assignment.ruta_personal_distancia_metros) / 1000).toFixed(1)} km` : "Sin estimación")}
          ${reportField("Duración estimada", reportDuration(assignment.ruta_personal_duracion_segundos))}
          ${reportField("Geometría de ruta personal", reportRouteSummary(assignment.ruta_personal_geojson))}
          ${reportField("Datos confirmados", reportDateTime(assignment.datos_confirmados_en))}
      </div><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Tipo de vehículo</th><th>Cantidad</th><th>Placas</th></tr></thead><tbody>${vehicleRows}</tbody></table></div></section>
      <section class="report-subsection"><h4>Evidencias fotográficas (${photos.length})</h4><p class="report-muted">${escapeHtml(photosByType)}</p>${photoGallery}</section>
      <section class="report-subsection"><h4>Seguimiento GPS (${sessions.length} sesiones)</h4>${sessionHtml}</section>
    </article>`;
  }).join("") : '<div class="report-empty">Esta movilización aún no tiene registros de movilizadores.</div>';
  const generated = new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  const statusLabels = { planificada: "Planificada", en_curso: "En curso", finalizada: "Finalizada", cancelada: "Cancelada" };
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reporte · ${escapeHtml(event.nombre)}</title>
    <style>
    @page{size:A4;margin:14mm 13mm}*{box-sizing:border-box}body{margin:0;color:#17252d;font:10px/1.48 Arial,Helvetica,sans-serif;background:#fff}.report-toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:center;gap:10px;padding:12px;background:#17252d}.report-toolbar button{padding:10px 16px;border:0;border-radius:6px;background:#1681b4;color:#fff;font-weight:700;cursor:pointer}.report-toolbar .close{background:#fff;color:#17252d}.report-document{max-width:900px;margin:26px auto;padding:0 28px}.report-cover{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 0 16px;border-bottom:3px solid #1681b4}.report-brand{display:flex;align-items:center;gap:14px}.report-brand img{width:88px;height:53px;object-fit:contain}.report-brand p,.report-assignment-heading p{margin:0 0 4px;color:#1681b4;font-size:8px;font-weight:800;letter-spacing:1.1px}.report-brand h1{margin:0;font-size:24px;line-height:1.2}.report-generated{text-align:right;color:#657781;font-size:9px}.report-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.report-stat{padding:10px;border:1px solid #deebf1;border-radius:7px;background:#f3f9fc}.report-stat span{display:block;color:#657781;font-size:8px}.report-stat strong{display:block;margin-top:3px;color:#0c638c;font-size:17px}.report-stat small{display:block;margin-top:3px;color:#657781;font-size:8px}.report-section{margin:18px 0}.report-section>h2{margin:0 0 9px;padding-bottom:6px;border-bottom:1px solid #deebf1;font-size:14px}.report-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.report-field{min-width:0;padding:7px 8px;border:1px solid #e5edf1;border-radius:5px;break-inside:avoid}.report-field span{display:block;margin-bottom:3px;color:#657781;font-size:8px}.report-field strong{display:block;overflow-wrap:anywhere;font-size:9px}.report-description{white-space:pre-wrap}.report-assignment{margin:17px 0;padding-top:13px;border-top:2px solid #1681b4}.report-assignment-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;break-after:avoid}.report-assignment-heading h3{margin:0;font-size:15px}.report-assignment-heading span{display:block;margin-top:4px;color:#657781}.report-badge{padding:4px 8px;border-radius:20px;background:#e4f4fb;color:#0c638c;font-size:8px;font-weight:700;white-space:nowrap}.report-subsection{margin:12px 0;break-inside:auto}.report-subsection h4{margin:0 0 7px;font-size:10px;break-after:avoid}.report-table-wrap{width:100%;margin:8px 0;overflow:visible}.report-table{width:100%;border-collapse:collapse;font-size:8px}.report-table th,.report-table td{padding:5px 6px;border:1px solid #deebf1;text-align:left;vertical-align:top;overflow-wrap:anywhere}.report-table th{background:#edf7fb;color:#0c638c;font-weight:700}.report-table tr{break-inside:avoid}.report-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.report-photos figure{margin:0;padding:6px;border:1px solid #deebf1;border-radius:6px;break-inside:avoid}.report-photos img,.report-photo-missing{display:block;width:100%;height:145px;object-fit:contain;background:#f3f6f7}.report-photo-missing{display:grid;place-items:center;color:#657781}.report-photos figcaption{display:grid;gap:3px;padding-top:5px;overflow-wrap:anywhere}.report-photos figcaption span,.report-photos figcaption small,.report-muted{color:#657781;font-size:8px}.report-empty{padding:20px;border:1px dashed #deebf1;border-radius:7px;text-align:center;color:#657781}.report-footer{margin:24px 0 0;padding-top:8px;border-top:1px solid #deebf1;color:#657781;font-size:8px;text-align:center}.report-page-break{break-before:page}
      @media screen{body{background:#eaf1f4}.report-document{padding:28px;background:#fff;box-shadow:0 5px 30px #17252d18}.report-footer{margin-bottom:20px}}
      @media print{.report-toolbar{display:none}.report-document{max-width:none;margin:0;padding:0}.report-summary,.report-fields,.report-photos,.report-table-wrap{break-inside:auto}a{color:inherit;text-decoration:none}.report-assignment{orphans:3;widows:3}}
      @media(max-width:650px){.report-document{padding:18px}.report-summary{grid-template-columns:repeat(2,1fr)}.report-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.report-photos{grid-template-columns:repeat(2,1fr)}}
    </style></head><body>
    <div class="report-toolbar"><button id="report-print" type="button">Imprimir / Guardar como PDF</button><button id="report-close" type="button" class="close">Cerrar reporte</button></div>
    <main class="report-document">
      <header class="report-cover"><div class="report-brand"><img src="${escapeHtml(new URL("assets/img/ora-logo.png", window.location.href).href)}" alt="ORA"><div><p>ORGANIZACIÓN RENOVADORA AUTÉNTICA</p><h1>Reporte de movilización</h1></div></div><div class="report-generated">Generado el<br><strong>${escapeHtml(generated)}</strong></div></header>
      <section class="report-summary">
        <div class="report-stat"><span>Registros</span><strong>${assignments.length.toLocaleString("es")}</strong><small>movilizadores/entes</small></div>
        <div class="report-stat"><span>Personas planificadas</span><strong>${planned.toLocaleString("es")}</strong><small>según registros</small></div>
        <div class="report-stat"><span>Asistencia reportada</span><strong>${attendees.toLocaleString("es")}</strong><small>${withAttendance.length} de ${assignments.length} responsables</small></div>
        <div class="report-stat"><span>Vehículos</span><strong>${totalVehicles.toLocaleString("es")}</strong><small>${escapeHtml(vehicleSummary)}</small></div>
        <div class="report-stat"><span>Evidencias / GPS</span><strong>${totalPhotos.toLocaleString("es")} / ${totalPoints.toLocaleString("es")}</strong><small>fotos / puntos registrados</small></div>
      </section>
      <section class="report-section"><h2>Datos generales del evento</h2><div class="report-fields">
        ${reportField("Código del evento", event.id)}
        ${reportField("Estado", statusLabels[event.estado] || event.estado)}
        ${reportField("Fecha", eventDate(event.fecha))}
        ${reportField("Hora del evento", event.hora_inicio ? String(event.hora_inicio).slice(0, 5) : "Sin registrar")}
        ${reportField("Lugar", event.lugar)}
        ${reportField("Municipio", event.municipio)}
        ${reportField("Estado / entidad federal", event.estado_nombre)}
        ${reportField("Unidad territorial vinculada", event.unidad_territorial_id)}
        ${reportField("Creado por", event.creador_nombre)}
        ${reportField("Creado el", reportDateTime(event.creado_en))}
        ${reportField("Última actualización", reportDateTime(event.actualizado_en))}
        ${reportField("Punto de llegada", event.punto_llegada_nombre)}
        ${reportField("Coordenadas del destino", reportCoordinate(event.punto_llegada_lat, event.punto_llegada_lng))}
        ${reportField("Distancia de ruta ideal", eventRouteDistance > 0 ? `${(eventRouteDistance / 1000).toFixed(1)} km` : "Sin estimación")}
        ${reportField("Duración estimada de ruta", reportDuration(event.ruta_duracion_segundos))}
      </div><div class="report-field report-description"><span>Descripción e instrucciones</span><strong>${escapeHtml(reportValue(event.descripcion))}</strong></div>
      <div class="report-fields">
        ${reportField("Punto de partida general", event.punto_partida_nombre)}
        ${reportField("Coordenadas de partida general", reportCoordinate(event.punto_partida_lat, event.punto_partida_lng))}
        ${reportField("Geometría de ruta ideal", reportRouteSummary(event.ruta_ideal_geojson))}
      </div></section>
      <section class="report-section"><h2>Desglose de movilizadores, transporte, evidencias y tracking</h2>${assignmentsHtml}</section>
      <footer class="report-footer">Documento generado desde el Panel Administrativo ORA · La asistencia solo suma responsables que reportaron un conteo.</footer>
    </main></body></html>`;
}

function buildDetailedEventSheet({ event, assignments }) {
  const formatCount = value => Number(value || 0).toLocaleString("es");
  const placeName = value => {
    const text = reportValue(value, "");
    return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(text)
      ? "Ubicación seleccionada en el mapa"
      : text;
  };
  const plannedPeople = assignments.reduce((sum, item) =>
    sum + (Number(item.personas_planificadas ?? item.cuota_personas) || 0), 0);
  const attendanceAssignments = assignments.filter(item =>
    item.personas_asistentes !== null && item.personas_asistentes !== undefined && item.personas_asistentes !== "");
  const mobilizedPeople = attendanceAssignments.reduce((sum, item) =>
    sum + (Number(item.personas_asistentes) || 0), 0);
  const vehicles = assignments.flatMap(reportVehicleItems);
  const vehiclesCount = vehicles.reduce((sum, vehicle) => sum + vehicle.count, 0);
  const photosCount = assignments.reduce((sum, item) => sum + (item.photos?.length || 0), 0);
  const eventStatus = {
    planificada: "Planificada",
    en_curso: "En curso",
    finalizada: "Finalizada",
    cancelada: "Cancelada"
  }[event.estado] || "Sin estado";
  const eventDistance = Number(event.ruta_distancia_metros);
  const eventDistanceLabel = eventDistance > 0
    ? eventDistance >= 1000 ? `${(eventDistance / 1000).toFixed(1)} km` : `${Math.round(eventDistance)} m`
    : "Sin estimación";
  const generalDetails = [
    ["Fecha", eventDate(event.fecha)],
    ["Hora", event.hora_inicio ? String(event.hora_inicio).slice(0, 5) : "No especificada"],
    ["Hora de finalización", event.hora_fin ? String(event.hora_fin).slice(0, 5) : "No especificada"],
    ["Lugar", event.lugar],
    ["Municipio", event.municipio],
    ["Estado", event.estado_nombre],
    ["Estado de la movilización", eventStatus],
    ["Personas estimadas", event.personas_estimadas_movilizar],
    ["Punto de partida", placeName(event.punto_partida_nombre)],
    ["Destino", placeName(event.punto_llegada_nombre)],
    ["Distancia estimada", eventDistanceLabel],
    ["Duración estimada", reportDuration(event.ruta_duracion_segundos)]
  ].map(([label, value]) => reportField(label, value)).join("");
  const statusLabels = { en_curso: "En curso", finalizada: "Finalizado", interrumpida: "Interrumpido" };
  const assignmentsHtml = assignments.length ? assignments.map(assignment => {
    const responsible = assignment.responsable || "Sin responsable asignado";
    const territory = [assignment.responsable_unidad, assignment.responsable_estado].filter(Boolean).join(", ");
    const isGeneratedEntry = /^Registro movilizador #\d+$/i.test(assignment.ente || "");
    const entryName = isGeneratedEntry ? responsible : reportValue(assignment.ente, "Registro sin nombre");
    const assignmentSubtitle = [
      entryName !== responsible ? responsible : "",
      territory
    ].filter(Boolean).join(" · ");
    const attendance = assignment.personas_asistentes === null || assignment.personas_asistentes === undefined || assignment.personas_asistentes === ""
      ? "Pendiente de informar"
      : formatCount(assignment.personas_asistentes);
    const vehicleItems = reportVehicleItems(assignment);
    const vehicleRows = vehicleItems.length
      ? vehicleItems.map(vehicle => `<tr><td>${escapeHtml(vehicle.type)}</td><td>${formatCount(vehicle.count)}</td><td>${escapeHtml(vehicle.plates || "Sin placa informada")}</td></tr>`).join("")
      : '<tr><td colspan="3">No informó vehículos</td></tr>';
    const photos = Array.isArray(assignment.photos) ? assignment.photos : [];
    const photoGallery = photos.length
      ? `<div class="sheet-photos">${photos.map(photo => {
        const photoType = reportPhotoCaption(photo, assignment);
        const imageUrl = photo.url ? new URL(photo.url, window.location.href).href : "";
        return `<figure>
          ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(photo.nombre_original || photoType)}">` : '<div class="sheet-photo-missing">Imagen no disponible</div>'}
          <figcaption><strong>${escapeHtml(photoType)}</strong><span>${escapeHtml(reportValue(photo.nombre_original))}</span><small>${escapeHtml(reportDateTime(photo.subido_en))}</small></figcaption>
        </figure>`;
      }).join("")}</div>`
      : '<p class="sheet-muted">No se adjuntaron fotografías.</p>';
    const trackingSessions = Array.isArray(assignment.trackingSessions) ? assignment.trackingSessions : [];
    const trackingSummary = trackingSessions.length
      ? `<div class="sheet-tracking-list">${trackingSessions.map(session => `<div class="sheet-tracking-row">
          <strong>${escapeHtml(`${session.tipo === "retorno" ? "Retorno · " : ""}${session.llegada_confirmada_en ? (session.tipo === "retorno" ? "Regresó" : "Llegó") : statusLabels[session.estado] || "Seguimiento registrado"}`)}</strong>
          <span>Inicio: ${escapeHtml(reportDateTime(session.iniciado_en))}</span>
          <span>Finalización: ${escapeHtml(reportDateTime(session.finalizado_en))}</span>
          <span>${session.tipo === "retorno" ? "Regreso confirmado" : "Llegada confirmada"}: ${escapeHtml(reportDateTime(session.llegada_confirmada_en))}</span>
        </div>`).join("")}</div>`
      : '<p class="sheet-muted">No se informó el inicio del seguimiento del recorrido.</p>';
    const transportAnswer = assignment.requiere_transporte === null || assignment.requiere_transporte === undefined
      ? "Sin respuesta"
      : Number(assignment.requiere_transporte) ? "Sí" : "No";
    const confirmedAt = assignment.datos_confirmados_en
      ? `Datos confirmados · ${reportDateTime(assignment.datos_confirmados_en)}`
      : "Datos pendientes de confirmar";
    return `<article class="sheet-assignment">
      <header class="sheet-assignment-heading">
        <div><p>REGISTRO DEL MOVILIZADOR</p><h3>${escapeHtml(entryName)}</h3>
          ${assignmentSubtitle ? `<span>${escapeHtml(assignmentSubtitle)}</span>` : ""}</div>
        <span class="sheet-badge">${escapeHtml(confirmedAt)}</span>
      </header>
      <section class="sheet-subsection"><h4>Personas y contacto</h4><div class="sheet-fields">
        ${reportField("Responsable", responsible)}
        ${reportField("Teléfono", assignment.responsable_telefono)}
        ${reportField("Correo", assignment.responsable_correo)}
        ${reportField("Unidad territorial", territory)}
        ${reportField("Personas planificadas", assignment.personas_planificadas ?? assignment.cuota_personas)}
        ${reportField("Personas movilizadas", attendance)}
        ${reportField("Lista revisada", assignment.plan_confirmado_en ? reportDateTime(assignment.plan_confirmado_en) : "Pendiente")}
        ${reportField("Asistencia informada", assignment.asistencia_reportada_en ? reportDateTime(assignment.asistencia_reportada_en) : "Pendiente")}
      </div></section>
      <section class="sheet-subsection"><h4>Transporte y recorrido</h4><div class="sheet-fields">
        ${reportField("¿Necesita transporte?", transportAnswer)}
        ${reportField("Salida", placeName(assignment.punto_salida))}
        ${reportField("Destino", placeName(assignment.punto_llegada_nombre))}
        ${reportField("Persona que recibe", assignment.receptor_transporte)}
        ${reportField("Distancia aproximada", Number(assignment.ruta_personal_distancia_metros) > 0 ? `${(Number(assignment.ruta_personal_distancia_metros) / 1000).toFixed(1)} km` : "Sin estimación")}
        ${reportField("Duración aproximada", reportDuration(assignment.ruta_personal_duracion_segundos))}
        ${reportField("Transporte confirmado", assignment.transporte_confirmado_en ? reportDateTime(assignment.transporte_confirmado_en) : "Pendiente")}
      </div><div class="sheet-table-wrap"><table class="sheet-table"><thead><tr><th>Tipo de vehículo</th><th>Cantidad</th><th>Placa</th></tr></thead><tbody>${vehicleRows}</tbody></table></div></section>
      <section class="sheet-subsection"><h4>Fotografías adjuntas (${photos.length})</h4>${photoGallery}</section>
      <section class="sheet-subsection"><h4>Seguimiento del recorrido (${trackingSessions.length})</h4>${trackingSummary}</section>
    </article>`;
  }).join("") : '<p class="sheet-empty">Esta movilización aún no tiene registros de movilizadores.</p>';
  const attendanceLabel = attendanceAssignments.length
    ? `${formatCount(mobilizedPeople)} · informado por ${attendanceAssignments.length} de ${assignments.length}`
    : "Pendiente";
  const summary = [
    ["Movilizadores registrados", formatCount(assignments.length)],
    ["Personas estimadas", formatCount(event.personas_estimadas_movilizar)],
    ["Personas planificadas", formatCount(plannedPeople)],
    ["Personas movilizadas", attendanceLabel],
    ["Vehículos informados", formatCount(vehiclesCount)],
    ["Fotografías adjuntas", formatCount(photosCount)]
  ].map(([label, value]) => `<article class="sheet-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  const description = reportValue(event.descripcion, "No se agregó una descripción para esta movilización.");
  const generated = new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ficha · ${escapeHtml(event.nombre)}</title>
    <style>
      @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}
      body{margin:0;background:#eef5f8;color:#17252d;font:11px/1.5 Arial,Helvetica,sans-serif}
      .sheet-toolbar{position:fixed;top:12px;right:14px;z-index:2;display:flex;gap:8px}
      .sheet-toolbar button{min-height:36px;padding:0 13px;border:0;border-radius:7px;background:#1681b4;color:#fff;font:inherit;font-weight:700;cursor:pointer}
      .sheet-toolbar .close{border:1px solid #dfeaf0;background:#fff;color:#17252d}
      .sheet-document{width:min(980px,calc(100% - 32px));margin:62px auto 28px;padding:28px;border:1px solid #dfeaf0;border-radius:16px;background:#fff;box-shadow:0 12px 40px rgb(23 37 45 / 10%)}
      .sheet-cover{padding:24px;border-radius:12px;background:linear-gradient(120deg,#083f5d,#117fae);color:#fff}
      .sheet-cover-brand{display:flex;align-items:center;gap:16px}
      .sheet-brand-logo{width:88px;height:56px;flex:0 0 auto;padding:4px;border-radius:8px;background:#fff;object-fit:contain}
      .sheet-cover p{margin:0 0 6px;font-size:9px;font-weight:800;letter-spacing:1px;opacity:.82}
      .sheet-cover h1{margin:0;font-size:27px;line-height:1.2;overflow-wrap:anywhere}
      .sheet-cover small{display:block;margin-top:8px;opacity:.85}
      .sheet-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:14px 0}
      .sheet-stat{min-width:0;padding:10px;border:1px solid #deebf1;border-radius:8px;background:#f6fafc}
      .sheet-stat span{display:block;color:#657781;font-size:8px;font-weight:700}
      .sheet-stat strong{display:block;margin-top:5px;color:#0c638c;font-size:15px;overflow-wrap:anywhere}
      .sheet-section{margin:16px 0}
      .sheet-section h2{margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid #deebf1;font-size:15px}
      .sheet-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .report-field{min-width:0;padding:7px 8px;border:1px solid #e5edf1;border-radius:5px;break-inside:avoid}
      .report-field span{display:block;margin-bottom:3px;color:#657781;font-size:8px}
      .report-field strong{display:block;overflow-wrap:anywhere;font-size:9px}
      .sheet-description{margin-top:8px;padding:10px;border:1px solid #e5edf1;border-radius:6px;white-space:pre-wrap}
      .sheet-assignment{margin:18px 0;padding-top:12px;border-top:2px solid #1681b4}
      .sheet-assignment-heading{display:flex;justify-content:space-between;gap:12px;margin-bottom:10px}
      .sheet-assignment-heading p{margin:0 0 3px;color:#1681b4;font-size:8px;font-weight:800;letter-spacing:.8px}
      .sheet-assignment-heading h3{margin:0;font-size:15px}
      .sheet-assignment-heading span{display:block;margin-top:4px;color:#657781}
      .sheet-badge{align-self:flex-start;padding:4px 8px;border-radius:14px;background:#e4f4fb;color:#0c638c;font-size:8px;font-weight:700}
      .sheet-subsection{margin:12px 0}
      .sheet-subsection h4{margin:0 0 7px;font-size:11px}
      .sheet-table-wrap{margin-top:8px;overflow-x:auto}
      .sheet-table{width:100%;border-collapse:collapse;font-size:9px}
      .sheet-table th,.sheet-table td{padding:6px;border:1px solid #deebf1;text-align:left;overflow-wrap:anywhere}
      .sheet-table th{background:#edf7fb;color:#0c638c}
      .sheet-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .sheet-photos figure{min-width:0;margin:0;padding:6px;border:1px solid #deebf1;border-radius:6px;break-inside:avoid}
      .sheet-photos img,.sheet-photo-missing{display:block;width:100%;height:155px;object-fit:contain;background:#f3f6f7}
      .sheet-photo-missing{display:grid;place-items:center;color:#657781}
      .sheet-photos figcaption{display:grid;gap:3px;padding-top:5px;overflow-wrap:anywhere}
      .sheet-photos figcaption span,.sheet-photos figcaption small,.sheet-muted{color:#657781;font-size:8px}
      .sheet-tracking-list{display:grid;gap:6px}
      .sheet-tracking-row{display:flex;flex-wrap:wrap;gap:6px 15px;padding:8px;border:1px solid #e5edf1;border-radius:5px}
      .sheet-tracking-row strong{color:#0c638c}
      .sheet-empty{padding:14px;border:1px dashed #deebf1;border-radius:7px;color:#657781;text-align:center}
      .sheet-footer{margin-top:18px;padding-top:8px;border-top:1px solid #deebf1;color:#657781;font-size:8px;text-align:right}
      @media(max-width:700px){.sheet-document{padding:16px}.sheet-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.sheet-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.sheet-photos{grid-template-columns:repeat(2,minmax(0,1fr))}.sheet-assignment-heading{flex-direction:column}}
      @media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet-toolbar{display:none}.sheet-document{width:100%;max-width:none;margin:0;padding:0;border:0;border-radius:0;box-shadow:none}.sheet-cover{padding:16px}.sheet-brand-logo{width:76px;height:48px}.sheet-cover h1{font-size:23px}.sheet-summary{grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}.sheet-stat{padding:7px}.sheet-stat strong{font-size:12px}.sheet-fields{grid-template-columns:repeat(3,minmax(0,1fr))}.sheet-photos{grid-template-columns:repeat(3,minmax(0,1fr))}.sheet-assignment{break-inside:auto}.sheet-assignment-heading,.sheet-subsection h4,.sheet-table tr,.sheet-photos figure{break-inside:avoid}.sheet-footer{margin-bottom:0}}
    </style></head><body>
    <div class="sheet-toolbar"><button id="report-print" type="button">Imprimir / Guardar como PDF</button><button id="report-close" class="close" type="button">Cerrar ficha</button></div>
    <main class="sheet-document">
      <header class="sheet-cover"><div class="sheet-cover-brand"><img class="sheet-brand-logo" src="${escapeHtml(new URL("assets/img/ora-logo.png", window.location.href).href)}" alt="Logo ORA"><div><p>ORGANIZACIÓN RENOVADORA AUTÉNTICA · FICHA DETALLADA</p><h1>${escapeHtml(event.nombre || "Movilización sin nombre")}</h1><small>Preparada el ${escapeHtml(generated)}</small></div></div></header>
      <section class="sheet-summary">${summary}</section>
      <section class="sheet-section"><h2>Datos de la movilización</h2><div class="sheet-fields">${generalDetails}</div><div class="sheet-description">${escapeHtml(description)}</div></section>
      <section class="sheet-section"><h2>Registros de movilizadores (${assignments.length})</h2>${assignmentsHtml}</section>
      <footer class="sheet-footer">Ficha detallada de la movilización · Incluye la información y las fotografías registradas por los movilizadores.</footer>
    </main></body></html>`;
}

function buildConciseEventReport({ event, assignments }) {
  const registeredMobilizers = assignments.length;
  const estimatedPeopleValue = event.personas_estimadas_movilizar;
  const hasEstimatedPeople = estimatedPeopleValue !== null && estimatedPeopleValue !== "" &&
    Number.isFinite(Number(estimatedPeopleValue));
  const estimatedPeople = hasEstimatedPeople ? Number(estimatedPeopleValue) : null;
  const reportedPeople = item => {
    if (item.personas_asistentes !== null && item.personas_asistentes !== undefined && item.personas_asistentes !== "") {
      return item.personas_asistentes;
    }
    if (item.personas_planificadas !== null && item.personas_planificadas !== undefined && item.personas_planificadas !== "") {
      return item.personas_planificadas;
    }
    return Number(item.cuota_personas) > 0 ? item.cuota_personas : null;
  };
  const peopleAssignments = assignments.filter(item => reportedPeople(item) !== null);
  const mobilizedPeople = peopleAssignments.reduce((sum, item) => sum + (Number(reportedPeople(item)) || 0), 0);
  const vehiclesByType = new Map();
  let totalVehicles = 0;
  assignments.forEach(assignment => {
    reportVehicleItems(assignment).forEach(vehicle => {
      totalVehicles += vehicle.count;
      vehiclesByType.set(vehicle.type, (vehiclesByType.get(vehicle.type) || 0) + vehicle.count);
    });
  });
  const formatCount = value => Number(value || 0).toLocaleString("es");
  const territory = [event.municipio, event.estado_nombre].filter(Boolean).join(", ");
  const attendancePercent = estimatedPeople > 0 ? Math.round((mobilizedPeople / estimatedPeople) * 100) : 0;
  const attendanceWidth = Math.min(100, attendancePercent);
  const estimateSummary = estimatedPeople === null
    ? "No se registró una estimación para este evento."
    : estimatedPeople === 0
      ? "La estimación es 0; no se puede calcular el porcentaje."
      : `${formatCount(mobilizedPeople)} personas registradas de ${formatCount(estimatedPeople)} estimadas.`;
  const estimatePercent = estimatedPeople > 0 ? `${attendancePercent}%` : "—";
  const details = [
    { icon: "date", label: "Fecha del evento", value: eventDate(event.fecha) },
    { icon: "time", label: "Hora de inicio", value: event.hora_inicio ? String(event.hora_inicio).slice(0, 5) : "No especificada" },
    { icon: "place", label: "Lugar", value: event.lugar || "No especificado" },
    { icon: "place", label: "Municipio y estado", value: territory || "No especificados" }
  ].map(item => `<article class="report-event-detail">
    <span class="report-icon">${reportIcon(item.icon)}</span>
    <div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong></div>
  </article>`).join("");
  const stats = [
    { icon: "people", label: "Movilizadores registrados", value: formatCount(registeredMobilizers), note: "con registro para este evento", tone: "blue" },
    { icon: "crowd", label: "Personas estimadas", value: estimatedPeople === null ? "—" : formatCount(estimatedPeople), note: "meta definida para esta movilización", tone: "green" },
    { icon: "chart", label: "Personas movilizadas", value: formatCount(mobilizedPeople), note: `${formatCount(peopleAssignments.length)} registros con cantidad`, tone: "amber" },
    { icon: "vehicle", label: "Vehículos utilizados", value: formatCount(totalVehicles), note: "unidades reportadas", tone: "violet" }
  ].map(item => `<article class="report-stat ${item.tone}">
    <span class="report-stat-icon">${reportIcon(item.icon)}</span>
    <span class="report-stat-label">${escapeHtml(item.label)}</span>
    <strong>${item.value}</strong>
    <small>${escapeHtml(item.note)}</small>
  </article>`).join("");
  const vehicleTypes = [...vehiclesByType].map(([type, count]) => `<span class="report-vehicle-chip">${reportIcon("vehicle")}<strong>${formatCount(count)}</strong>${escapeHtml(type)}</span>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Resumen · ${escapeHtml(event.nombre)}</title>
    <style>
      @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}
      body{margin:0;background:#eef5f8;color:#17252d;font:14px/1.45 Inter,Arial,Helvetica,sans-serif}
      .report-toolbar{position:fixed;top:12px;right:14px;z-index:2;display:flex;justify-content:flex-end;gap:7px;padding:0;background:transparent}
      .report-toolbar button{display:inline-flex;min-height:34px;align-items:center;gap:6px;padding:0 11px;border:0;border-radius:8px;background:#1681b4;color:#fff;font:inherit;font-size:11px;font-weight:700;cursor:pointer;transition:background .18s ease}
      .report-toolbar button:hover{background:#0c638c}.report-toolbar button svg{width:15px;height:15px}.report-toolbar .close{background:#fff;color:#17252d;border:1px solid #dfeaf0}
      .report-document{width:min(1120px,calc(100% - 36px));margin:60px auto 28px;padding:clamp(22px,4vw,48px);border:1px solid #dfeaf0;border-radius:24px;background:#fff;box-shadow:0 22px 65px rgb(23 37 45 / 12%)}
      .report-cover{position:relative;overflow:hidden;padding:clamp(24px,4vw,42px);border-radius:18px;background:linear-gradient(120deg,#083f5d,#117fae 68%,#5bb9cc);color:#fff}
      .report-cover:after{position:absolute;top:-95px;right:-40px;width:280px;height:280px;border:1px solid rgb(255 255 255 / 22%);border-radius:50%;box-shadow:0 0 0 34px rgb(255 255 255 / 8%),0 0 0 70px rgb(255 255 255 / 6%);content:""}
      .report-brand{position:relative;z-index:1;display:flex;align-items:center;gap:22px}
      .report-brand img{width:96px;height:62px;padding:5px;border-radius:10px;background:#fff;object-fit:contain}
      .report-kicker{margin:0 0 8px;font-size:10px;font-weight:800;letter-spacing:1.8px;opacity:.82}
      .report-brand h1{display:flex;align-items:flex-start;gap:10px;max-width:780px;margin:0;font-size:clamp(28px,5vw,47px);font-weight:780;letter-spacing:-1.6px;line-height:1.08;overflow-wrap:anywhere}
      .report-brand h1 svg{width:30px;height:30px;flex:0 0 auto;margin-top:5px}
      .report-event-details{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 24px}
      .report-event-detail{display:flex;min-width:0;align-items:flex-start;gap:10px;padding:14px;border:1px solid #e6edf1;border-radius:13px;background:linear-gradient(145deg,#fff,#f8fbfd);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
      .report-event-detail:hover{transform:translateY(-3px);border-color:#b9dced;box-shadow:0 10px 24px rgb(22 129 180 / 10%)}
      .report-icon,.report-stat-icon{display:grid;width:36px;height:36px;flex:0 0 auto;place-items:center;border-radius:11px;background:#e6f4fa;color:#087baa}
      .report-icon svg,.report-stat-icon svg,.report-vehicle-chip svg,.report-progress-heading svg{width:19px;height:19px}
      .report-event-detail div{display:grid;min-width:0;gap:4px}.report-event-detail small{color:#788a94;font-size:9px;font-weight:700}
      .report-event-detail strong{font-size:12px;line-height:1.35;overflow-wrap:anywhere}
      .report-section-heading{display:flex;align-items:center;gap:9px;margin:0 0 12px;color:#263c49;font-size:14px;font-weight:800;letter-spacing:.1px}
      .report-section-heading svg{width:19px;height:19px;color:#1681b4}
      .report-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .report-stat{position:relative;display:grid;min-height:164px;align-content:start;justify-items:start;gap:7px;overflow:hidden;padding:18px;border:1px solid transparent;border-radius:16px;transition:transform .18s ease,box-shadow .18s ease}
      .report-stat:hover{transform:translateY(-4px);box-shadow:0 15px 28px rgb(23 37 45 / 10%)}
      .report-stat:after{position:absolute;right:-32px;bottom:-50px;width:130px;height:130px;border-radius:50%;background:rgb(255 255 255 / 35%);content:""}
      .report-stat.blue{border-color:#d4eaf5;background:#eaf6fc;color:#075d88}.report-stat.green{border-color:#d7eee3;background:#edf8f1;color:#277650}
      .report-stat.amber{border-color:#f4e3bf;background:#fff7e8;color:#976416}.report-stat.violet{border-color:#e2def5;background:#f3f1fb;color:#6355a0}
      .report-stat-icon{background:rgb(255 255 255 / 72%);color:inherit}.report-stat-label{color:#455963;font-size:10px;font-weight:750}
      .report-stat strong{font-size:clamp(27px,4vw,38px);font-weight:800;letter-spacing:-1px;line-height:1}.report-stat small{color:#667a83;font-size:9px}
      .report-lower{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:14px;margin-top:16px}
      .report-panel{min-width:0;padding:17px;border:1px solid #e4edf1;border-radius:15px;background:#fbfdfe}.report-panel .report-section-heading{margin-bottom:10px}
      .report-vehicle-list{display:flex;flex-wrap:wrap;gap:8px}
      .report-vehicle-chip{display:inline-flex;min-height:36px;align-items:center;gap:7px;padding:7px 11px;border:1px solid #deebf1;border-radius:999px;background:#fff;color:#455963;font-size:10px;transition:transform .18s ease,border-color .18s ease}
      .report-vehicle-chip:hover{transform:translateY(-2px);border-color:#98cde2}.report-vehicle-chip svg{color:#1681b4}.report-vehicle-chip strong{color:#0c638c;font-size:12px}
      .report-empty{margin:0;color:#74858d;font-size:11px}
      .report-progress-heading{display:flex;align-items:center;gap:8px;color:#536872;font-size:10px;font-weight:700}.report-progress-heading svg{color:#1681b4}
      .report-progress-numbers{display:flex;align-items:baseline;gap:6px;margin-top:10px}
      .report-progress-numbers strong{color:#0c638c;font-size:26px;letter-spacing:-.7px}.report-progress-numbers span{color:#74858d;font-size:10px}
      .report-progress-track{height:9px;margin-top:9px;overflow:hidden;border-radius:99px;background:#e8f0f3}
      .report-progress-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#1681b4,#53b9b1);transition:width .5s ease}
      .report-progress-note{margin:7px 0 0;color:#74858d;font-size:9px}.report-footer{margin:18px 0 0;color:#8a989e;font-size:9px;text-align:right}
      @media(max-width:760px){.report-document{width:calc(100% - 20px);padding:16px;border-radius:17px}.report-event-details{grid-template-columns:repeat(2,minmax(0,1fr))}.report-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.report-lower{grid-template-columns:1fr}.report-brand h1{font-size:30px}}
      @media(max-width:440px){.report-brand{align-items:flex-start;flex-direction:column;gap:12px}.report-brand h1{font-size:26px}.report-event-detail{gap:7px;padding:10px}.report-icon{width:30px;height:30px;border-radius:9px}.report-event-detail strong{font-size:10px}.report-stat{min-height:150px;padding:13px}.report-stat-label{font-size:9px}}
      @media print{@page{size:A4 landscape;margin:9mm}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.report-toolbar{display:none}.report-document{width:100%;max-width:none;margin:0;padding:0;border:0;border-radius:0;box-shadow:none}.report-cover{padding:18px 22px}.report-brand img{width:72px;height:46px}.report-kicker{font-size:8px}.report-brand h1{font-size:30px}.report-event-details{gap:7px;margin:10px 0 15px}.report-event-detail{padding:9px;gap:7px}.report-icon{width:29px;height:29px}.report-event-detail small{font-size:7px}.report-event-detail strong{font-size:9px}.report-section-heading{margin-bottom:8px;font-size:11px}.report-summary{gap:8px}.report-stat{min-height:122px;padding:12px;gap:5px}.report-stat-icon{width:28px;height:28px}.report-stat-label{font-size:8px}.report-stat strong{font-size:27px}.report-stat small{font-size:7px}.report-lower{gap:9px;margin-top:10px}.report-panel{padding:11px}.report-vehicle-chip{min-height:29px;padding:5px 8px;font-size:8px}.report-progress-numbers{margin-top:5px}.report-progress-numbers strong{font-size:20px}.report-progress-track{height:7px;margin-top:5px}.report-progress-note,.report-footer{font-size:7px}}
    </style></head><body>
    <div class="report-toolbar"><button id="report-print" type="button">${reportIcon("date")} Imprimir / Guardar como PDF</button><button id="report-close" class="close" type="button">× Cerrar</button></div>
    <main class="report-document">
      <header class="report-cover"><div class="report-brand"><img src="${escapeHtml(new URL("assets/img/ora-logo.png", window.location.href).href)}" alt="ORA"><div><p class="report-kicker">RESUMEN DE MOVILIZACIÓN</p><h1>${reportIcon("event")}${escapeHtml(event.nombre || "Movilización sin nombre")}</h1></div></div></header>
      <section class="report-event-details" aria-label="Datos del evento">${details}</section>
      <section aria-labelledby="report-highlights"><h2 class="report-section-heading" id="report-highlights">${reportIcon("chart")} Resumen de la movilización</h2><div class="report-summary">${stats}</div></section>
      <div class="report-lower">
        <section class="report-panel" aria-labelledby="report-vehicles-heading"><h2 class="report-section-heading" id="report-vehicles-heading">${reportIcon("vehicle")} Transporte por tipo</h2><div class="report-vehicle-list">${vehicleTypes || '<p class="report-empty">No se reportaron vehículos.</p>'}</div></section>
        <section class="report-panel" aria-labelledby="report-attendance-heading">
          <div class="report-progress-heading" id="report-attendance-heading">${reportIcon("chart")} Personas movilizadas frente a estimadas</div>
          <div class="report-progress-numbers"><strong>${estimatePercent}</strong><span>de la estimación</span></div>
          <div class="report-progress-track" role="progressbar" aria-label="Porcentaje de personas movilizadas respecto a la estimación" aria-valuenow="${attendanceWidth}" aria-valuemin="0" aria-valuemax="100"><div class="report-progress-fill" style="width:${attendanceWidth}%"></div></div>
          <p class="report-progress-note">${estimateSummary}${estimatedPeople > 0 && mobilizedPeople > estimatedPeople ? " El porcentaje supera el 100% porque se movilizaron más personas que las estimadas." : ""}</p>
        </section>
      </div>
      <footer class="report-footer">Organización Renovadora Auténtica · Resumen consolidado</footer>
    </main></body></html>`;
}

function reportIcon(name) {
  const paths = {
    event: '<path d="M4 5.5h16v15H4z"/><path d="M8 3v5m8-5v5M4 10h16"/>',
    date: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4m9-4v4M3.5 10h17m-12 4h3m-3 3h7"/>',
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    place: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/>',
    people: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7" r="3.5"/><path d="M17 11a3.5 3.5 0 0 0 0-7m4 16v-1.5a4 4 0 0 0-3-3.87"/>',
    crowd: '<circle cx="12" cy="8" r="3"/><path d="M5 20v-1a7 7 0 0 1 14 0v1m-15 0v-1a5 5 0 0 1 3-4.58M17 14.42A5 5 0 0 1 20 19v1"/>',
    vehicle: '<path d="M3 11h18l-1.5-5h-15zM5 11v7h14v-7m-12 7v2m10-2v2"/><circle cx="7.5" cy="14.5" r=".8"/><circle cx="16.5" cy="14.5" r=".8"/>',
    chart: '<path d="M4 19V5m0 14h17"/><path d="m7 15 4-4 3 2 5-6"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.event}</svg>`;
}

async function generateEventReport(eventId, triggerButton, fullSheet = false) {
  if (!eventId) return;
  const popup = window.open("", "_blank");
  if (!popup) {
    showNotice("El navegador bloqueó la nueva ventana. Permite ventanas emergentes para generar la ficha.", true, fullSheet ? "events" : "reports");
    return;
  }
  popup.document.open();
  popup.document.write("<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>Preparando ficha</title><body style=\"font:16px system-ui;padding:40px;color:#17252d\">Preparando la ficha de la movilización…</body></html>");
  popup.document.close();
  const button = triggerButton;
  if (button) button.disabled = true;
  try {
    const query = { id: eventId };
    if (fullSheet) query.full = "1";
    const report = await request("event-report", { query });
    popup.document.open();
    popup.document.write(fullSheet ? buildDetailedEventSheet(report) : buildConciseEventReport(report));
    popup.document.close();
    popup.document.getElementById("report-print")?.addEventListener("click", () => popup.print());
    popup.document.getElementById("report-close")?.addEventListener("click", () => popup.close());
    const images = [...popup.document.images];
    await Promise.all(images.map(image => image.complete
      ? Promise.resolve()
      : new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
        window.setTimeout(resolve, 8000);
      })));
    window.setTimeout(() => {
      if (!popup.closed) {
        popup.focus();
        popup.print();
      }
    }, 350);
    showNotice(
      fullSheet
        ? "La ficha de la actividad está lista para imprimir o guardar como PDF."
        : "Reporte completo preparado. En el diálogo de impresión puedes elegir «Guardar como PDF».",
      false,
      fullSheet ? "events" : "reports"
    );
  } catch (error) {
    popup.close();
    showNotice(error.message, true, fullSheet ? "events" : "reports");
  } finally {
    if (button) button.disabled = false;
  }
}

function initializeTrackingOverviewMap() {
  const mapElement = document.getElementById("tracking-overview-map");
  if (!mapElement || trackingOverviewMap) return;
  trackingOverviewMap = createMap(mapElement, [-66.9036, 10.4806], 6);
  trackingOverviewMap.addControl(new maplibregl.NavigationControl(), "top-left");
  trackingOverviewMap.on("load", () => {
    trackingDirections = new MapLibreGlDirections(trackingOverviewMap, {
      api: "https://router.project-osrm.org/route/v1",
      profile: "driving"
    });
    trackingDirections.interactive = false;
  });
}

async function loadTrackingOverview() {
  if (!isAdminPanel || trackingOverviewLoading) return;
  trackingOverviewLoading = true;
  try {
    const result = await request("tracking-overview");
    trackingOverviewEvents = result.events;
    const receivedAt = Date.now();
    trackingOverviewMobilizers = result.mobilizers.map(mobilizer => ({
      ...mobilizer,
      last_seen_received_at_ms: receivedAt
    }));
    renderTrackingOverview();
    document.getElementById("tracking-updated-at").textContent =
      `Actualizado ${new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`;
  } finally {
    trackingOverviewLoading = false;
  }
}

function trackingEventById(eventId) {
  return trackingOverviewEvents.find(event => String(event.id) === String(eventId));
}

function trackingMobilizerById(assignmentId) {
  return trackingOverviewMobilizers.find(mobilizer => String(mobilizer.assignment_id) === String(assignmentId));
}

function parseTrackingVehicles(value) {
  try {
    const vehicles = JSON.parse(value || "[]");
    return Array.isArray(vehicles) ? vehicles : [];
  } catch (error) {
    console.error("No se pudieron leer los vehículos guardados para el seguimiento:", error);
    return [];
  }
}

function trackingPoint(mobilizer) {
  const latitude = Number(mobilizer.latitude);
  const longitude = Number(mobilizer.longitude);
  return mobilizer.latitude !== null && mobilizer.longitude !== null &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

function trackingSignalAgeSeconds(mobilizer, now = Date.now()) {
  if (mobilizer.last_seen_age_seconds === null ||
      mobilizer.last_seen_age_seconds === undefined ||
      mobilizer.last_seen_age_seconds === "") return Infinity;
  const age = Number(mobilizer.last_seen_age_seconds);
  return Number.isFinite(age) && age >= 0
    ? Math.max(0, age + (now - Number(mobilizer.last_seen_received_at_ms || now)) / 1000)
    : Infinity;
}

function trackingSignalIsFresh(mobilizer) {
  return trackingSignalAgeSeconds(mobilizer) <= TRACKING_SIGNAL_STALE_SECONDS;
}

function parseTrackingRoute(value) {
  try {
    const route = typeof value === "string" ? JSON.parse(value) : value;
    const coordinates = route?.type === "Feature" ? route.geometry?.coordinates : route?.coordinates;
    if (route?.type === "Feature" && route.geometry?.type !== "LineString") return [];
    if (route?.type !== "Feature" && route?.type !== "LineString") return [];
    return Array.isArray(coordinates)
      ? coordinates.filter(point => Array.isArray(point) &&
        Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])) &&
        Math.abs(Number(point[0])) <= 180 && Math.abs(Number(point[1])) <= 90)
        .map(point => [Number(point[0]), Number(point[1])])
      : [];
  } catch (error) {
    console.error("No se pudo interpretar la ruta guardada para estimar la posición:", error);
    return [];
  }
}

function distanceBetweenCoordinates(first, second) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDifference = radians(second.latitude - first.latitude);
  const longitudeDifference = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine = Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) *
    Math.sin(longitudeDifference / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

// Ruta prevista del movilizador: la guardada o, si falta, una línea recta salida → destino
// con duración estimada a ~30 km/h, para que el avance estimado nunca quede sin datos.
function plannedRouteInfo(mobilizer) {
  let coordinates = parseTrackingRoute(mobilizer.ruta_personal_geojson);
  let fallback = false;
  if (coordinates.length < 2) {
    const event = trackingEventById(mobilizer.movilizacion_id);
    const destination = event ? eventDestination(event) : null;
    const startLat = Number(mobilizer.punto_salida_lat);
    const startLng = Number(mobilizer.punto_salida_lng);
    if (destination && mobilizer.punto_salida_lat !== null && mobilizer.punto_salida_lat !== undefined &&
        mobilizer.punto_salida_lat !== "" && Number.isFinite(startLat) && Number.isFinite(startLng)) {
      coordinates = [[startLng, startLat], [destination[1], destination[0]]];
      fallback = true;
    } else {
      coordinates = [];
    }
  }
  let durationSeconds = Number(mobilizer.ruta_personal_duracion_segundos);
  if ((!Number.isFinite(durationSeconds) || durationSeconds <= 0) && coordinates.length >= 2) {
    let meters = 0;
    for (let index = 1; index < coordinates.length; index += 1) {
      meters += distanceBetweenCoordinates(
        { latitude: coordinates[index - 1][1], longitude: coordinates[index - 1][0] },
        { latitude: coordinates[index][1], longitude: coordinates[index][0] }
      );
    }
    durationSeconds = meters / 8.33;
  }
  return { coordinates, durationSeconds, fallback };
}

function estimateTrackingPosition(mobilizer, now = Date.now(), anchor = null) {
  if (mobilizer.tracking_leg === "retorno") return null;
  const planned = plannedRouteInfo(mobilizer);
  const route = planned.coordinates;
  const startedAt = Number(mobilizer.tracking_started_at_epoch);
  const durationSeconds = planned.durationSeconds;
  if (route.length < 2 || !Number.isFinite(startedAt) || startedAt <= 0 ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;

  const segments = [];
  let totalDistance = 0;
  for (let index = 1; index < route.length; index += 1) {
    const start = { latitude: route[index - 1][1], longitude: route[index - 1][0] };
    const end = { latitude: route[index][1], longitude: route[index][0] };
    const segmentDistance = distanceBetweenCoordinates(start, end);
    segments.push({ start, end, segmentDistance, startDistance: totalDistance });
    totalDistance += segmentDistance;
  }
  if (totalDistance <= 0) return null;

  let elapsedSeconds = Math.max(0, now / 1000 - startedAt);
  let progress = Math.min(1, elapsedSeconds / durationSeconds);
  let targetDistance = totalDistance * progress;
  if (anchor?.point && Number.isFinite(anchor.ageSeconds)) {
    // Parte desde la última posición real proyectada sobre la ruta y avanza a la velocidad media prevista.
    const kLat = 111320;
    const kLng = 111320 * Math.cos(anchor.point.latitude * Math.PI / 180);
    let best = { gap: Infinity, along: 0 };
    segments.forEach(item => {
      const ax = (item.start.longitude - anchor.point.longitude) * kLng;
      const ay = (item.start.latitude - anchor.point.latitude) * kLat;
      const bx = (item.end.longitude - anchor.point.longitude) * kLng;
      const by = (item.end.latitude - anchor.point.latitude) * kLat;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
      const gap = Math.hypot(ax + dx * t, ay + dy * t);
      if (gap < best.gap) best = { gap, along: item.startDistance + item.segmentDistance * t };
    });
    const speed = totalDistance / durationSeconds;
    targetDistance = Math.min(totalDistance, best.along + speed * Math.max(0, anchor.ageSeconds));
    progress = targetDistance / totalDistance;
    elapsedSeconds = progress * durationSeconds;
  }
  const segment = segments.find(item => targetDistance <= item.startDistance + item.segmentDistance) || segments[segments.length - 1];
  const segmentProgress = segment.segmentDistance > 0
    ? Math.max(0, Math.min(1, (targetDistance - segment.startDistance) / segment.segmentDistance))
    : 0;
  return {
    latitude: segment.start.latitude + (segment.end.latitude - segment.start.latitude) * segmentProgress,
    longitude: segment.start.longitude + (segment.end.longitude - segment.start.longitude) * segmentProgress,
    progress,
    remainingSeconds: Math.max(0, durationSeconds - elapsedSeconds),
    expectedArrival: startedAt * 1000 + durationSeconds * 1000,
    totalDistance
  };
}

function trackingDisplayPosition(mobilizer, now = Date.now()) {
  const actual = trackingPoint(mobilizer);
  const arrived = Boolean(mobilizer.llegada_confirmada_en);
  const returning = mobilizer.tracking_leg === "retorno";
  if (arrived) {
    return {
      returning,
      returned: returning,
      actual,
      estimated: null,
      expected: null,
      deviation: null,
      fresh: false,
      arrived: true,
      primary: actual,
      ageSeconds: trackingSignalAgeSeconds(mobilizer, now)
    };
  }
  const fresh = trackingSignalIsFresh(mobilizer);
  const expected = estimateTrackingPosition(mobilizer, now,
    !fresh && actual ? { point: actual, ageSeconds: trackingSignalAgeSeconds(mobilizer, now) } : null);
  const deviation = actual && expected ? distanceBetweenCoordinates(actual, expected) : null;
  // El punto estimado se muestra mientras no haya señal GPS fresca (sin señal nunca o conexión perdida);
  // al recuperar la conexión desaparece y el punto real corrige la posición.
  const estimated = expected && !(fresh && actual) ? expected : null;
  return {
    returning,
    returned: false,
    actual,
    estimated,
    expected,
    deviation,
    fresh,
    arrived: false,
    primary: fresh && actual ? actual : estimated || actual,
    ageSeconds: trackingSignalAgeSeconds(mobilizer, now)
  };
}

function trackingCoordinateKey(mobilizer) {
  const point = trackingDisplayPosition(mobilizer).primary;
  return point ? `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}` : "";
}

function renderTrackingOverview() {
  if (!isAdminPanel) return;
  const selector = document.getElementById("tracking-event-select");
  const previousEventId = selectedTrackingEventId;
  const optionsKey = trackingOverviewEvents
    .map(event => `${event.id}:${event.nombre}:${event.lugar}`)
    .join("|");
  if (selector.dataset.optionsKey !== optionsKey) {
    selector.innerHTML = trackingOverviewEvents.length
      ? trackingOverviewEvents.map(event =>
        `<option value="${Number(event.id)}">${escapeHtml(event.nombre)} · ${escapeHtml(event.lugar)}</option>`
      ).join("")
      : '<option value="">No hay movilizaciones en curso</option>';
    selector.dataset.optionsKey = optionsKey;
  }

  if (!trackingEventById(selectedTrackingEventId)) {
    selectedTrackingEventId = trackingOverviewEvents.length ? String(trackingOverviewEvents[0].id) : "";
  }
  if (selector.value !== selectedTrackingEventId) selector.value = selectedTrackingEventId;
  renderTrackingPresentationEvents();
  if (previousEventId !== selectedTrackingEventId) {
    selectedTrackingAssignmentId = "";
    trackingRouteStatus = null;
    trackingRoutedCoordinateKey = "";
    trackingRouteRequestId += 1;
    removeMapLine(trackingOverviewMap, "tracking-overview-route");
    trackingDirections?.clear();
    trackingOverviewRoute = null;
  }
  const event = trackingEventById(selectedTrackingEventId);
  const noEvents = !event;
  const empty = document.getElementById("tracking-empty");
  empty.hidden = !noEvents;
  empty.textContent = noEvents
    ? "No hay movilizaciones en curso. Cuando administración active una, aparecerá aquí."
    : "";
  document.getElementById("tracking-refresh").disabled = noEvents;
  if (noEvents) {
    selectedTrackingAssignmentId = "";
    trackingRouteStatus = null;
    trackingRoutedCoordinateKey = "";
    trackingRouteRequestId += 1;
    document.getElementById("tracking-rider-count").textContent = "Sin seguimiento activo";
    document.getElementById("tracking-rider-list").innerHTML = "";
    document.getElementById("tracking-rider-detail").innerHTML =
      '<div class="empty-state">No hay una movilización activa para mostrar.</div>';
    clearTrackingOverviewMap();
    return;
  }

  const riders = trackingOverviewMobilizers.filter(mobilizer =>
    String(mobilizer.movilizacion_id) === selectedTrackingEventId
  );
  const positions = riders.map(mobilizer => trackingDisplayPosition(mobilizer));
  const liveGpsCount = positions.filter(position => position.fresh && position.actual).length;
  const estimatedCount = positions.filter(position => position.estimated).length;
  const arrivedCount = positions.filter(position => position.arrived).length;
  const staleLocationCount = positions.filter(position =>
    !position.fresh && !position.arrived && position.actual && !position.estimated
  ).length;
  document.getElementById("tracking-rider-count").textContent =
    `${riders.length} movilizadores · ${liveGpsCount} con GPS · ${estimatedCount} estimadas · ${arrivedCount} llegaron` +
    (staleLocationCount ? ` · ${staleLocationCount} últimas señales` : "");
  document.getElementById("tracking-rider-list").innerHTML = riders.length
    ? riders.map(mobilizer => {
      const position = trackingDisplayPosition(mobilizer);
      const selected = String(mobilizer.assignment_id) === selectedTrackingAssignmentId;
      const seen = position.arrived
        ? `${position.returned ? "Regreso confirmado" : "Llegada confirmada"} · ${formatLastSeen(mobilizer.llegada_confirmada_en)}`
        : position.fresh && mobilizer.last_seen_at
        ? `${position.returning ? "En retorno · " : ""}Señal recibida · ${formatLastSeen(mobilizer.last_seen_at)}`
        : position.actual
          ? `Última señal ${formatAge(position.ageSeconds)}`
        : position.estimated
          ? `Avance estimado · última señal ${Number.isFinite(position.ageSeconds) ? formatAge(position.ageSeconds) : "pendiente"}`
          : "Esperando GPS y ruta estimada";
      return `<button type="button" class="tracking-rider ${selected ? "selected" : ""}" data-tracking-rider="${Number(mobilizer.assignment_id)}">
        <span class="tracking-rider-pin ${position.arrived ? "arrived" : position.fresh && position.actual ? "connected" : position.estimated ? "estimated" : "waiting"}" aria-hidden="true"></span>
        <span class="tracking-rider-copy"><strong>${escapeHtml(mobilizer.responsable)}</strong><small>${escapeHtml(seen)}</small></span>
        <span class="tracking-rider-arrow">›</span>
      </button>`;
    }).join("")
    : '<div class="tracking-list-empty">Todavía no hay movilizadores con tracking activo en esta movilización.</div>';

  updateTrackingOverviewMap(event, riders);
  const selectedMobilizer = trackingMobilizerById(selectedTrackingAssignmentId);
  if (!selectedMobilizer || String(selectedMobilizer.movilizacion_id) !== selectedTrackingEventId) {
    selectedTrackingAssignmentId = "";
    trackingRouteStatus = null;
    trackingRoutedCoordinateKey = "";
    trackingRouteRequestId += 1;
    removeMapLine(trackingOverviewMap, "tracking-overview-route");
    trackingDirections?.clear();
    trackingOverviewRoute = null;
    clearWalkedRoute();
    document.getElementById("tracking-rider-detail").innerHTML =
      '<div class="empty-state">Selecciona un punto del mapa o un movilizador para ver su ruta y registro.</div>';
    return;
  }
  if (selectedMobilizer.llegada_confirmada_en) {
    trackingRouteStatus = {
      type: "success",
      message: "Llegada confirmada",
      arrival: formatLastSeen(selectedMobilizer.llegada_confirmada_en)
    };
    removeMapLine(trackingOverviewMap, "tracking-overview-route");
    trackingOverviewRoute = null;
    trackingDirections?.clear();
    renderTrackingMobilizerDetail(selectedMobilizer, event);
    void drawWalkedRoute(selectedMobilizer);
    return;
  }
  clearWalkedRoute();
  renderTrackingMobilizerDetail(selectedMobilizer, event);
  const displayPosition = trackingDisplayPosition(selectedMobilizer);
  if (!displayPosition.fresh && displayPosition.estimated) {
    const routeKey = `estimated:${trackingCoordinateKey(selectedMobilizer)}`;
    if (routeKey !== trackingRoutedCoordinateKey) {
      trackingRoutedCoordinateKey = routeKey;
      trackingRouteStatus = {
        type: "estimated",
        message: `Avance estimado · ${formatEstimatedDuration(displayPosition.estimated.remainingSeconds)}`,
        arrival: estimatedArrival(displayPosition.estimated.remainingSeconds)
      };
      drawPlannedTrackingRoute(selectedMobilizer);
    }
    renderTrackingMobilizerDetail(selectedMobilizer, event);
  } else if (displayPosition.actual && displayPosition.fresh) {
    const routeKey = `actual:${trackingCoordinateKey(selectedMobilizer)}`;
    if (routeKey !== trackingRoutedCoordinateKey) {
      trackingRoutedCoordinateKey = routeKey;
      trackingRouteStatus = { type: "loading", message: "Actualizando la ruta desde la señal GPS…" };
      void calculateTrackingRoute(selectedMobilizer, event);
    }
  }
}

function renderTrackingPresentationEvents() {
  const list = document.getElementById("tracking-presentation-event-list");
  const count = document.getElementById("tracking-event-count");
  if (!list || !count) return;
  count.textContent = `${trackingOverviewEvents.length} ${trackingOverviewEvents.length === 1 ? "evento" : "eventos"}`;
  list.innerHTML = trackingOverviewEvents.length
    ? trackingOverviewEvents.map(event => {
      const riders = trackingOverviewMobilizers.filter(mobilizer =>
        String(mobilizer.movilizacion_id) === String(event.id)
      );
      const gpsCount = riders.filter(mobilizer => {
        const position = trackingDisplayPosition(mobilizer);
        return position.fresh && position.actual;
      }).length;
      return `<button type="button" class="tracking-presentation-event ${String(event.id) === selectedTrackingEventId ? "selected" : ""}" data-presentation-event="${Number(event.id)}">
        <span class="tracking-presentation-event-top"><strong>${escapeHtml(event.nombre)}</strong><span>${escapeHtml(eventDate(event.fecha))}</span></span>
        <span class="tracking-presentation-event-location">${escapeHtml(event.punto_llegada_nombre || event.lugar)}</span>
        <span class="tracking-presentation-event-meta">${riders.length} ${riders.length === 1 ? "movilizador" : "movilizadores"} · ${gpsCount} con GPS</span>
      </button>`;
    }).join("")
    : '<div class="tracking-presentation-events-empty">No hay movilizaciones activas en este momento.</div>';
}

function setTrackingPresentation(active) {
  trackingPresentationActive = active;
  document.body.classList.toggle("tracking-presentation-mode", active);
  const toggle = document.getElementById("tracking-presentation-toggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(active));
    toggle.textContent = active ? "× Salir de presentación" : "⛶ Modo presentación";
  }
  if (active) {
    initializeTrackingOverviewMap();
    window.setTimeout(() => trackingOverviewMap?.resize(), 80);
  } else {
    window.setTimeout(() => trackingOverviewMap?.resize(), 80);
  }
}

function formatAge(seconds) {
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `hace ${hours} h${remainingMinutes ? ` ${remainingMinutes} min` : ""}`;
}

function formatLastSeen(epoch) {
  const timestamp = typeof epoch === "number"
    ? epoch * 1000
    : Date.parse(`${String(epoch || "").replace(" ", "T")}Z`);
  if (!Number.isFinite(timestamp)) return "hora no disponible";
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(timestamp));
}

function clearWalkedRoute() {
  trackingWalkedLayers.forEach(layerId => removeMapLine(trackingOverviewMap, layerId));
  trackingWalkedLayers = [];
  trackingWalkedPoints = [];
  trackingWalkedKey = "";
  trackingWalkedRequestId += 1;
}

// Dibuja sobre el mapa toda la ruta GPS que recorrió el movilizador (ida y retorno).
async function drawWalkedRoute(mobilizer) {
  const key = `${mobilizer.assignment_id}:${mobilizer.tracking_leg || "ida"}:${mobilizer.llegada_confirmada_en}`;
  if (key === trackingWalkedKey) return;
  clearWalkedRoute();
  trackingWalkedKey = key;
  const requestId = trackingWalkedRequestId;
  try {
    const result = await request("tracking-route", { query: { assignmentId: mobilizer.assignment_id } });
    if (requestId !== trackingWalkedRequestId || !trackingOverviewMap) return;
    const allPoints = [];
    result.legs.forEach((leg, index) => {
      if (!Array.isArray(leg.points) || leg.points.length < 2) return;
      const layerId = `tracking-walked-${index}`;
      const returning = leg.type === "retorno";
      setMapLine(trackingOverviewMap, layerId, leg.points, {
        color: returning ? "#7c5cff" : "#0e9f62",
        weight: 5,
        opacity: 1,
        dashArray: returning
      });
      trackingWalkedLayers.push(layerId);
      allPoints.push(...leg.points);
    });
    trackingWalkedPoints = allPoints;
    if (allPoints.length) fitMapToPoints(trackingOverviewMap, allPoints, 45, 16);
    else showNotice("Este movilizador no tiene puntos GPS guardados para dibujar su ruta.", false);
  } catch (error) {
    if (requestId === trackingWalkedRequestId) trackingWalkedKey = "";
    console.error("No se pudo cargar la ruta recorrida:", error);
  }
}

function clearTrackingOverviewMap() {
  clearWalkedRoute();
  trackingOverviewMarkers.forEach(marker => {
    marker.trackingPopup?.remove();
    marker.remove();
  });
  trackingOverviewMarkers.clear();
  removeMapLine(trackingOverviewMap, "tracking-overview-route");
  if (trackingDestinationMarker) trackingDestinationMarker.remove();
  trackingDirections?.clear();
  trackingOverviewRoute = null;
  trackingDestinationMarker = null;
  trackingMapEventId = "";
}

function updateTrackingOverviewMap(event, mobilizers) {
  initializeTrackingOverviewMap();
  if (!trackingOverviewMap) return;
  const eventChanged = trackingMapEventId !== String(event.id);
  if (eventChanged) {
    clearTrackingOverviewMap();
    trackingMapEventId = String(event.id);
  }
  const activeMarkerKeys = new Set();
  mobilizers.forEach(mobilizer => {
    const position = trackingDisplayPosition(mobilizer);
    const assignmentId = String(mobilizer.assignment_id);
    if (position.actual) {
      const markerKey = `${assignmentId}:actual`;
      activeMarkerKeys.add(markerKey);
      updateTrackingMarker(
        markerKey,
        position.actual,
        mobilizer,
        event,
        position.returned ? "returned" : position.arrived ? "arrived" : position.fresh ? "connected" : "stale",
        position.returned
          ? `Regreso confirmado · ${formatLastSeen(mobilizer.llegada_confirmada_en)}`
          : position.arrived
          ? `Llegada confirmada · ${formatLastSeen(mobilizer.llegada_confirmada_en)}`
          : position.fresh
            ? position.returning ? "En retorno · señal GPS recibida" : "Señal GPS recibida"
            : `Última señal · ${formatAge(position.ageSeconds)}`,
        position.ageSeconds
      );
    }
    if (position.estimated) {
      const markerKey = `${assignmentId}:estimated`;
      activeMarkerKeys.add(markerKey);
      updateTrackingMarker(
        markerKey,
        position.estimated,
        mobilizer,
        event,
        "estimated",
        "Avance estimado sobre la ruta",
        position.ageSeconds
      );
    }
  });
  trackingOverviewMarkers.forEach((marker, markerKey) => {
    if (!activeMarkerKeys.has(markerKey)) {
      marker.trackingPopup?.remove();
      marker.remove();
      trackingOverviewMarkers.delete(markerKey);
    }
  });

  const destination = eventDestination(event);
  if (destination) {
    if (!trackingDestinationMarker) {
      trackingDestinationMarker = createMapMarker(
        trackingOverviewMap,
        [destination[1], destination[0]],
        { className: "tracking-destination-marker", html: '<span aria-hidden="true"></span>' }
      );
      trackingDestinationMarker.setPopup(new maplibregl.Popup({ offset: 12 })
        .setText(`Destino: ${event.punto_llegada_nombre || event.lugar}`));
    } else {
      trackingDestinationMarker.setLngLat([destination[1], destination[0]]);
    }
  }

  if (eventChanged) {
    const points = [];
    mobilizers.forEach(mobilizer => {
      const position = trackingDisplayPosition(mobilizer);
      [position.actual, position.estimated].filter(Boolean).forEach(point =>
        points.push([point.longitude, point.latitude])
      );
    });
    if (destination) points.push([destination[1], destination[0]]);
    if (points.length) fitMapToPoints(trackingOverviewMap, points, 35, 13);
    else trackingOverviewMap.setCenter([-66.9036, 10.4806]).setZoom(6);
  }
}

function eventDestination(event) {
  const latitude = Number(event.punto_llegada_lat);
  const longitude = Number(event.punto_llegada_lng);
  return event.punto_llegada_lat !== null && event.punto_llegada_lng !== null &&
    event.punto_llegada_lat !== "" && event.punto_llegada_lng !== "" &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? [latitude, longitude]
    : null;
}

function trackingMarkerPopup(mobilizer, event, signalLabel, ageSeconds) {
  const lastSignal = mobilizer.llegada_confirmada_en
    ? `${mobilizer.tracking_leg === "retorno" ? "Regreso confirmado" : "Llegada confirmada"} · ${escapeHtml(formatLastSeen(mobilizer.llegada_confirmada_en))}`
    : Number.isFinite(ageSeconds)
    ? `${escapeHtml(formatAge(ageSeconds))} · ${escapeHtml(formatLastSeen(mobilizer.last_seen_at))}`
    : "Aún no se recibió GPS";
  const expectedLabel = "";
  return `<div class="tracking-popup">
    <span class="tracking-popup-status">${escapeHtml(signalLabel)}</span>
    <strong>${escapeHtml(mobilizer.responsable)}</strong>
    <span>${escapeHtml(event.nombre)}</span>
    <span>Personas: ${Number(mobilizer.personas_planificadas || 0).toLocaleString("es")} planificadas</span>
    <span>Destino: ${escapeHtml(event.punto_llegada_nombre || event.lugar)}</span>
    <span>Último GPS: ${lastSignal}</span>
    ${expectedLabel}
    <button type="button" class="tracking-popup-button" data-tracking-popup-assignment="${Number(mobilizer.assignment_id)}">Ver ficha del movilizador</button>
  </div>`;
}

function updateTrackingMarker(markerKey, point, mobilizer, event, state, signalLabel, ageSeconds) {
  const selected = String(mobilizer.assignment_id) === selectedTrackingAssignmentId;
  const markerState = state === "connected" && selected ? "connected selected" : state;
  const iconHtml = `<span class="tracking-map-pin ${state === "arrived" || state === "returned" ? state : markerState}" aria-hidden="true"><span>${state === "arrived" ? "✓" : state === "returned" ? "⌂" : state === "estimated" ? "≈" : "●"}</span></span>`;
  const coordinates = [point.longitude, point.latitude];
  let marker = trackingOverviewMarkers.get(markerKey);
  if (!marker) {
    marker = createMapMarker(trackingOverviewMap, coordinates, {
      className: "tracking-map-icon",
      html: iconHtml
    });
    marker.getElement().title = `${mobilizer.responsable} · ${signalLabel}`;
    marker.trackingPopup = new maplibregl.Popup({
      className: "tracking-map-popup",
      closeButton: true,
      offset: 24,
      maxWidth: "280px"
    }).setHTML(trackingMarkerPopup(mobilizer, event, signalLabel, ageSeconds));
    marker.trackingPopup.on("open", popupEvent => {
      const selectButton = popupEvent.target.getElement()?.querySelector("[data-tracking-popup-assignment]");
      selectButton?.addEventListener("click", () =>
        selectTrackingMobilizer(selectButton.dataset.trackingPopupAssignment)
      );
    });
    marker.getElement().addEventListener("click", event => {
      event.stopPropagation();
      selectTrackingMobilizer(mobilizer.assignment_id);
      marker.trackingPopup.setLngLat(marker.getLngLat()).addTo(trackingOverviewMap);
    });
    trackingOverviewMarkers.set(markerKey, marker);
  } else {
    marker.setLngLat(coordinates);
    marker.getElement().innerHTML = iconHtml;
    marker.getElement().title = `${mobilizer.responsable} · ${signalLabel}`;
    marker.trackingPopup.setLngLat(coordinates)
      .setHTML(trackingMarkerPopup(mobilizer, event, signalLabel, ageSeconds));
  }
}

function drawPlannedTrackingRoute(mobilizer) {
  removeMapLine(trackingOverviewMap, "tracking-overview-route");
  trackingOverviewRoute = null;
  const coordinates = plannedRouteInfo(mobilizer).coordinates;
  if (coordinates.length < 2 || !trackingOverviewMap) return;
  trackingOverviewRoute = "tracking-overview-route";
  trackingDirections?.clear();
  setMapLine(trackingOverviewMap, trackingOverviewRoute, coordinates, {
    color: "#087eae",
    weight: 6,
    opacity: 1
  });
  fitMapToPoints(trackingOverviewMap, coordinates, 35, 10);
}

function selectTrackingMobilizer(assignmentId) {
  const mobilizer = trackingMobilizerById(assignmentId);
  if (!mobilizer) return;
  selectedTrackingAssignmentId = String(assignmentId);
  trackingRouteStatus = null;
  trackingRoutedCoordinateKey = "";
  trackingRouteRequestId += 1;
  removeMapLine(trackingOverviewMap, "tracking-overview-route");
  trackingDirections?.clear();
  trackingOverviewRoute = null;
  renderTrackingOverview();
  const point = trackingDisplayPosition(mobilizer).primary;
  if (trackingWalkedKey) {
    if (trackingWalkedPoints.length) fitMapToPoints(trackingOverviewMap, trackingWalkedPoints, 45, 16);
  } else if (point && !trackingOverviewRoute) {
    trackingOverviewMap?.jumpTo({ center: [point.longitude, point.latitude], zoom: 13 });
  }
}

function showAllTrackingMobilizers() {
  selectedTrackingAssignmentId = "";
  trackingRouteStatus = null;
  trackingRoutedCoordinateKey = "";
  trackingRouteRequestId += 1;
  removeMapLine(trackingOverviewMap, "tracking-overview-route");
  trackingDirections?.clear();
  trackingOverviewRoute = null;
  renderTrackingOverview();
  const event = trackingEventById(selectedTrackingEventId);
  if (!event || !trackingOverviewMap) return;
  const points = trackingOverviewMobilizers
    .filter(mobilizer => String(mobilizer.movilizacion_id) === selectedTrackingEventId)
    .map(mobilizer => trackingDisplayPosition(mobilizer).primary)
    .filter(Boolean)
    .map(point => [point.longitude, point.latitude]);
  const destination = eventDestination(event);
  if (destination) points.push([destination[1], destination[0]]);
  if (points.length) fitMapToPoints(trackingOverviewMap, points, 35, 13);
}

function renderTrackingMobilizerDetail(mobilizer, event) {
  const vehicles = parseTrackingVehicles(mobilizer.vehiculos_json);
  const vehicleSummary = Number(mobilizer.requiere_transporte)
    ? vehicles.length
      ? vehicles.map(vehicle => {
        const type = String(vehicle.type || "Vehículo");
        const count = Number(vehicle.count) || 1;
        const plates = String(vehicle.plates || "").trim();
        return `${escapeHtml(type)} × ${count}${plates ? ` · Placa(s): ${escapeHtml(plates)}` : ""}`;
      }).join("<br>")
      : "Transporte reportado; sin vehículos detallados"
    : "No requiere transporte";
  const personSummary = [
    `${Number(mobilizer.personas_planificadas || 0).toLocaleString("es")} planificadas`,
    mobilizer.personas_asistentes !== null
      ? `${Number(mobilizer.personas_asistentes).toLocaleString("es")} movilizadas`
      : "personas movilizadas pendientes"
  ].filter(Boolean).join(" · ");
  const position = trackingDisplayPosition(mobilizer);
  const routeMessage = !position.primary
    ? "No hay una posición calculable para este recorrido."
    : trackingRouteStatus?.message || "Calculando ruta y tiempo aproximado…";
  const routeStatusClass = trackingRouteStatus?.type === "error" ? " error" : trackingRouteStatus?.type === "loading" ? " loading" : "";
  const destinationLabel = event.punto_llegada_nombre || event.lugar;
  const accuracy = mobilizer.accuracy !== null && mobilizer.accuracy !== undefined
    ? ` ±${Math.round(Number(mobilizer.accuracy))} m`
    : "";
  const signalDescription = position.arrived
    ? `${position.returned ? "Regreso confirmado" : "Llegada confirmada"} · ${formatLastSeen(mobilizer.llegada_confirmada_en)}`
    : position.fresh
    ? "Señal recibida"
    : position.actual
      ? `Sin señal · última ubicación ${formatAge(position.ageSeconds)}${position.estimated ? " · avance proyectado" : ""}`
      : position.estimated
        ? "Sin GPS recibido · avance proyectado"
        : "Esperando GPS";
  document.getElementById("tracking-rider-detail").innerHTML = `
    <article class="tracking-info-card">
      <header><div><p class="eyebrow">Ficha del movilizador</p><h3>${escapeHtml(mobilizer.responsable)}</h3></div><span class="tracking-live-badge${position.arrived ? " arrived" : ""}">${position.returned ? "Regresó" : position.arrived ? "Llegó" : position.returning ? "En retorno" : "En ruta"}</span></header>
      <div class="tracking-info-grid">
        <div><small>Personas</small><strong>${escapeHtml(personSummary)}</strong></div>
        <div><small>Salida registrada</small><strong>${escapeHtml(mobilizer.punto_salida || "No indicada")}</strong></div>
        <div class="tracking-info-wide"><small>Transporte y placas</small><strong>${vehicleSummary}</strong></div>
        <div><small>Evidencias</small><strong>${Number(mobilizer.photo_count) || 0} foto(s): lista ${Number(mobilizer.list_photo_count) || 0} · vehículo ${Number(mobilizer.vehicle_photo_count) || 0} · grupo ${Number(mobilizer.group_photo_count) || 0}</strong></div>
        <div><small>Estado de señal</small><strong>${escapeHtml(signalDescription)}</strong></div>
        <div><small>Último GPS real</small><strong>${escapeHtml(mobilizer.last_seen_at ? formatLastSeen(mobilizer.last_seen_at) : "Esperando GPS")}${escapeHtml(accuracy)}</strong></div>
      </div>
      <div class="tracking-route-estimate${routeStatusClass}"><small>Destino: ${escapeHtml(destinationLabel)}</small><strong>${escapeHtml(routeMessage)}</strong>${trackingRouteStatus?.arrival ? `<span>${position.arrived ? "Llegó:" : "Llegada estimada:"} ${escapeHtml(trackingRouteStatus.arrival)}</span>` : ""}</div>
    </article>`;
}

function estimatedArrival(durationSeconds) {
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(Date.now() + Number(durationSeconds) * 1000));
}

async function calculateTrackingRoute(mobilizer, event) {
  const point = trackingDisplayPosition(mobilizer).primary;
  const destination = eventDestination(event);
  const requestId = ++trackingRouteRequestId;
  removeMapLine(trackingOverviewMap, "tracking-overview-route");
  trackingOverviewRoute = null;
  if (!point || !destination) {
    trackingRouteStatus = { type: "error", message: "No se puede calcular: falta la posición o el destino." };
    renderTrackingMobilizerDetail(mobilizer, event);
    return;
  }
  trackingRouteStatus = { type: "loading", message: "Calculando ruta vial desde su última posición…" };
  renderTrackingMobilizerDetail(mobilizer, event);
  const waypoints = [[point.longitude, point.latitude], [destination[1], destination[0]]];
  if (trackingDirections) setDirectionsWaypoints(trackingDirections, waypoints);
  else trackingOverviewMap?.once("load", () => setDirectionsWaypoints(trackingDirections, waypoints));
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${point.longitude},${point.latitude};${destination[1]},${destination[0]}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("El servicio de rutas no está disponible.");
    const result = await response.json();
    const route = result.routes?.[0];
    if (result.code !== "Ok" || !route || !Array.isArray(route.geometry?.coordinates)) {
      throw new Error("No se encontró una ruta vial desde la última posición.");
    }
    if (requestId !== trackingRouteRequestId || selectedTrackingAssignmentId !== String(mobilizer.assignment_id)) return;
    trackingOverviewRoute = "tracking-overview-route";
    setMapLine(trackingOverviewMap, trackingOverviewRoute, route.geometry.coordinates, {
      color: "#087eae",
      weight: 6,
      opacity: 1
    });
    fitMapToPoints(trackingOverviewMap, route.geometry.coordinates, 35, 14);
    const distance = Number(route.distance);
    const distanceLabel = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
    trackingRouteStatus = {
      type: "success",
      message: `${distanceLabel} · ${formatEstimatedDuration(route.duration)}`,
      arrival: estimatedArrival(route.duration)
    };
    renderTrackingMobilizerDetail(mobilizer, event);
  } catch (error) {
    if (requestId !== trackingRouteRequestId) return;
    trackingRouteStatus = { type: "error", message: `${error.message} Revisa la conexión.` };
    renderTrackingMobilizerDetail(mobilizer, event);
  }
}

function eventDate(date) {
  if (!date) return "Sin fecha";
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function formatEstimatedDuration(seconds) {
  const totalMinutes = Math.max(1, Math.ceil(Number(seconds) / 60));
  if (totalMinutes < 60) return `${totalMinutes} min aprox.`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h${minutes ? ` ${minutes} min` : ""} aprox.`;
}

function routeSummary(event) {
  const distance = Number(event.ruta_distancia_metros);
  const duration = Number(event.ruta_duracion_segundos);
  if (!distance || !duration) return event.punto_llegada_lat !== null && event.punto_llegada_lat !== undefined
    ? "Destino definido · ruta por definir"
    : "Ruta por definir";
  const km = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
  return `${km} · ${formatEstimatedDuration(duration)}`;
}

function renderEvents() {
  const query = document.getElementById("event-search").value.trim().toLocaleLowerCase("es");
  const visible = events.filter(event => `${event.nombre} ${event.lugar} ${event.municipio || ""} ${event.estado_nombre || ""}`.toLocaleLowerCase("es").includes(query));
  document.getElementById("events-list").innerHTML = visible.map(event => `
    <article class="event-card">
      <div class="event-card-top"><div><h3>${escapeHtml(event.nombre)}</h3><p class="event-location">${escapeHtml(event.municipio ? `${event.municipio}, ${event.estado_nombre}` : event.lugar)}</p></div><span class="status">${escapeHtml(event.estado.replace("_", " "))}</span></div>
      <div class="event-card-meta"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg> ${escapeHtml(eventDate(event.fecha))}${event.hora_inicio ? ` · ${escapeHtml(String(event.hora_inicio).slice(0, 5))}` : ""}</span>${isAdminPanel ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3 2.6 3 5"/></svg> ${Number(event.cantidad_entes) || 0} registros</span>` : ""}<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.5"/></svg> ${escapeHtml(routeSummary(event))}</span></div>
      <div class="event-card-actions">${isAdminPanel ? `<button class="button secondary" type="button" data-share-event="${Number(event.id)}">Compartir</button>` : ""}<button class="button primary" type="button" data-open-event="${Number(event.id)}">${isAdminPanel ? "Abrir actividad →" : "Completar pasos →"}</button>${isAdminPanel ? `<button class="button danger" type="button" data-delete-event="${Number(event.id)}" data-event-name="${escapeHtml(event.nombre)}">Eliminar</button>` : ""}</div>
    </article>`).join("");
  document.getElementById("events-empty").hidden = visible.length > 0;
}

function readCoordinates(name) {
  return {
    latitude: Number(eventForm.elements[`${name}Lat`].value),
    longitude: Number(eventForm.elements[`${name}Lng`].value)
  };
}

function writeCoordinates(name, latlng) {
  eventForm.elements[`${name}Lat`].value = latlng.lat.toFixed(7);
  eventForm.elements[`${name}Lng`].value = latlng.lng.toFixed(7);
  eventForm.elements[`${name}Name`].value = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
}

function createRouteMap() {
  if (routeMap) {
    routeMap.resize();
    return;
  }
  routeMap = createMap("route-map", [-66.9036, 10.4806], 11);
  routeMap.addControl(new maplibregl.NavigationControl(), "top-left");
  routeMap.on("click", event => {
    writeCoordinates("end", event.lngLat);
    if (endMarker) endMarker.setLngLat(event.lngLat);
    else {
      endMarker = createMapMarker(routeMap, event.lngLat, {
        className: "route-map-marker",
        html: '<span aria-hidden="true"></span>',
        draggable: true,
        popup: "Destino de la movilización"
      });
      endMarker.on("dragend", () => writeCoordinates("end", endMarker.getLngLat()));
    }
  });
}

function resetEventForm() {
  eventForm.reset();
  populateEventMunicipalities();
  if (endMarker) endMarker.remove();
  endMarker = null;
  showFormMessage(eventMessage, "");
}

function showEventModal() {
  resetEventForm();
  eventModal.hidden = false;
  window.setTimeout(createRouteMap, 80);
}

function showStructureNotice(message, isError = true) {
  const notice = document.getElementById("structure-notice");
  displayTemporaryNotice(notice, message, isError);
}

function renderStructureTree() {
  const tree = document.getElementById("structure-tree");
  const unitsByParent = new Map();
  territories.forEach(unit => {
    const key = String(unit.padre_id ?? "root");
    if (!unitsByParent.has(key)) unitsByParent.set(key, []);
    unitsByParent.get(key).push(unit);
  });
  const userLabel = unit => unit.usuario_id
    ? `<span class="structure-account">${escapeHtml(unit.usuario_nombre)} · ${escapeHtml(unit.usuario_telefono)}${Number(unit.usuario_activo) ? "" : " · Desactivado"}</span>`
    : '<span class="structure-account unassigned">Sin cuenta asignada</span>';
  const editButton = unit => `<button class="button small secondary" type="button" data-edit-territory="${Number(unit.id)}">${unit.usuario_id ? "Editar" : "Asignar cuenta"}</button>`;
  const municipalityRows = state => (unitsByParent.get(String(state.id)) || []).map(unit =>
    `<div class="structure-row"><span><strong>${escapeHtml(unit.nombre)}</strong>${userLabel(unit)}</span>${editButton(unit)}</div>`
  ).join("");
  const stateRows = (unitsByParent.get(String(territories.find(unit => unit.nivel === "nacional")?.id)) || []).map(state =>
    `<details class="structure-state"><summary><span><strong>${escapeHtml(state.nombre)}</strong>${userLabel(state)}</span>${editButton(state)}</summary><div class="structure-children">${municipalityRows(state)}</div></details>`
  ).join("");
  const national = territories.find(unit => unit.nivel === "nacional");
  tree.innerHTML = `${national ? `<div class="structure-row structure-national"><span><strong>${escapeHtml(national.nombre)} · Nacional</strong>${userLabel(national)}</span>${editButton(national)}</div>` : ""}
    <h3>Estados y municipios</h3>${stateRows || '<div class="empty-state">Esta base de datos aún no tiene estados ni municipios cargados. Ejecuta <code>php scripts/seed_territories.php</code> en la carpeta del proyecto del servidor y vuelve a cargar esta sección.</div>'}`;
}

function structureMobilizerName(unit) {
  if (!unit?.usuario_id) return "";
  const name = String(unit.usuario_nombre || "").trim();
  return name || "Nombre no registrado";
}

function structureManagerCard(unit, level, territoryName, emptyMessage) {
  const assigned = Boolean(unit?.usuario_id);
  const active = assigned && Number(unit.usuario_activo);
  const name = assigned ? structureMobilizerName(unit) : emptyMessage;
  return `<div class="print-structure-manager ${assigned ? "" : "unassigned"}">
    <span class="print-structure-level">${escapeHtml(level)}</span>
    <strong>${escapeHtml(name)}</strong>
    <span>${escapeHtml(territoryName)}</span>
    ${assigned && !active ? '<small class="print-structure-disabled">Cuenta desactivada</small>' : ""}
  </div>`;
}

function buildStructurePresentation() {
  const municipalitiesByState = new Map();
  territories.filter(unit => unit.nivel === "municipal").forEach(municipality => {
    const key = String(municipality.padre_id ?? "");
    if (!municipalitiesByState.has(key)) municipalitiesByState.set(key, []);
    municipalitiesByState.get(key).push(municipality);
  });
  const national = territories.find(unit => unit.nivel === "nacional");
  const states = territories.filter(unit => unit.nivel === "estadal");
  const nationalCard = structureManagerCard(
    national,
    "Nivel nacional",
    "Responsabilidad: todo el país",
    "Sin movilizador nacional asignado"
  );
  const stateBranches = states.map(state => {
    const stateCard = structureManagerCard(
      state,
      "Movilizador estadal",
      `Estado a cargo: ${state.nombre}`,
      `Sin movilizador en ${state.nombre}`
    );
    const municipalities = municipalitiesByState.get(String(state.id)) || [];
    const municipalNodes = municipalities.map(municipality => {
      const assigned = Boolean(municipality.usuario_id);
      const name = assigned ? structureMobilizerName(municipality) : "Sin movilizador";
      const disabled = assigned && !Number(municipality.usuario_activo);
      return `<li><div class="print-structure-municipality ${assigned ? "" : "unassigned"}">
        <strong>${escapeHtml(municipality.nombre)}</strong>
        <span>${escapeHtml(name)}${disabled ? " · Desactivado" : ""}</span>
      </div></li>`;
    }).join("");
    const municipalityContent = municipalities.length
      ? `<ul class="print-structure-municipalities">${municipalNodes}</ul>`
      : '<p class="print-structure-empty">No hay municipios registrados en este estado.</p>';
    return `<article class="print-structure-state">
      ${stateCard}
      <div class="print-structure-children"><span class="print-structure-children-label">Movilizadores municipales</span>${municipalityContent}</div>
    </article>`;
  }).join("");
  const noStates = states.length
    ? ""
    : '<div class="print-structure-empty">No hay estados registrados en la estructura territorial.</div>';
  const generatedAt = new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Estructura territorial ORA</title>
    <style>
      @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#17252d;background:#fff;font:10px/1.4 Arial,Helvetica,sans-serif}.print-structure-toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:center;gap:8px;padding:10px;background:#17252d}.print-structure-toolbar button{min-height:36px;padding:0 14px;border:0;border-radius:6px;background:#1681b4;color:#fff;font-weight:700;cursor:pointer}.print-structure-toolbar .close{background:#fff;color:#17252d}.print-structure-document{max-width:1400px;margin:20px auto;padding:0 22px}.print-structure-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:3px solid #1681b4}.print-structure-brand{display:flex;align-items:center;gap:13px}.print-structure-brand img{width:75px;height:44px;object-fit:contain}.print-structure-brand p{margin:0 0 3px;color:#1681b4;font-size:8px;font-weight:800;letter-spacing:1px}.print-structure-brand h1{margin:0;font-size:22px}.print-structure-date{color:#657781;font-size:9px;text-align:right}.print-structure-root{position:relative;display:flex;justify-content:center;padding:17px 0 27px}.print-structure-root:after{position:absolute;bottom:0;left:50%;height:19px;border-left:2px solid #8fc9df;content:""}.print-structure-manager{display:grid;min-width:0;gap:3px;padding:8px 9px;border:1px solid #cfe5ef;border-left:3px solid #1681b4;border-radius:6px;background:#f3faff;break-inside:avoid}.print-structure-root .print-structure-manager{width:min(300px,100%);padding:11px 14px;text-align:center;border-left:1px solid #cfe5ef;border-top:3px solid #1681b4}.print-structure-level{color:#0c638c;font-size:7px;font-weight:800;letter-spacing:.65px;text-transform:uppercase}.print-structure-manager strong{font-size:10px;overflow-wrap:anywhere}.print-structure-manager>span:last-of-type{color:#53636b;font-size:8px;overflow-wrap:anywhere}.print-structure-manager.unassigned{border-color:#eed9a9;border-left-color:#c08322;background:#fffaf0}.print-structure-manager.unassigned .print-structure-level{color:#8b611c}.print-structure-disabled{color:#a83e38;font-size:7px;font-weight:700}.print-structure-state-grid{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:13px;row-gap:14px;padding-top:20px}.print-structure-state-grid:before{position:absolute;top:0;right:24%;left:24%;border-top:2px solid #8fc9df;content:""}.print-structure-state{position:relative;min-width:0;padding:9px;border:1px solid #dce8ed;border-radius:8px;background:#fff;break-inside:avoid}.print-structure-state:before{position:absolute;top:-21px;left:50%;height:20px;border-left:2px solid #8fc9df;content:""}.print-structure-children{position:relative;margin:10px 0 0 8px;padding:8px 0 0 11px;border-left:1px solid #c9dde5}.print-structure-children:before{position:absolute;top:0;left:-1px;width:10px;border-top:1px solid #c9dde5;content:""}.print-structure-children-label{display:block;margin:0 0 6px;color:#52636d;font-size:7px;font-weight:800;letter-spacing:.4px;text-transform:uppercase}.print-structure-municipalities{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin:0;padding:0;list-style:none}.print-structure-municipalities li{min-width:0}.print-structure-municipalities .print-structure-manager{height:100%;padding:5px 6px;gap:2px;border-radius:4px}.print-structure-municipalities .print-structure-manager strong{font-size:8px}.print-structure-municipalities .print-structure-manager>span:last-of-type{font-size:7px}.print-structure-municipalities .print-structure-level{font-size:6px}.print-structure-empty{margin:5px 0 0;padding:7px;border:1px dashed #e6d3aa;border-radius:5px;background:#fffaf0;color:#805b21;font-size:8px}.print-structure-footer{margin:14px 0 0;padding-top:7px;border-top:1px solid #deebf1;color:#657781;font-size:8px;text-align:center}
      @media screen{body{background:#eaf1f4}.print-structure-document{padding:22px;background:#fff;box-shadow:0 5px 30px #17252d18}}
      @media print{ @page{size:A4 landscape;margin:6mm}.print-structure-toolbar{display:none}.print-structure-document{max-width:none;margin:0;padding:0}.print-structure-header{gap:8px;padding-bottom:6px;border-bottom-width:2px}.print-structure-brand{gap:7px}.print-structure-brand img{width:48px;height:29px}.print-structure-brand p{font-size:6px;letter-spacing:.5px}.print-structure-brand h1{font-size:15px}.print-structure-date{font-size:7px}.print-structure-root{padding:7px 0 12px}.print-structure-root:after{height:8px}.print-structure-root .print-structure-manager{width:210px;padding:5px 8px}.print-structure-manager{gap:1px;padding:4px 5px;border-radius:4px}.print-structure-level{font-size:5.5px;letter-spacing:.3px}.print-structure-manager strong{font-size:7px}.print-structure-manager>span:last-of-type{font-size:6px}.print-structure-disabled{font-size:5.5px}.print-structure-state-grid{grid-template-columns:repeat(6,minmax(0,1fr));column-gap:2mm;row-gap:3mm;padding-top:5mm}.print-structure-state-grid:before{right:8%;left:8%}.print-structure-state{padding:2mm;border-radius:4px;break-inside:avoid-page}.print-structure-state:before{top:-5mm;height:5mm}.print-structure-children{margin:3px 0 0 2px;padding:3px 0 0 3px}.print-structure-children:before{width:3px}.print-structure-children-label{margin-bottom:3px;font-size:5px;letter-spacing:.2px}.print-structure-municipalities{grid-template-columns:repeat(3,minmax(0,1fr));gap:1px}.print-structure-municipalities .print-structure-manager{height:auto;padding:2px;gap:1px}.print-structure-municipality{display:grid;align-content:start;min-width:0;padding:1px 2px;border-left:1px solid #c9dde5;overflow-wrap:anywhere;break-inside:avoid}.print-structure-municipality strong{font-size:5.6px;line-height:1.05}.print-structure-municipality span{font-size:5.2px;line-height:1.05;color:#53636b}.print-structure-municipality.unassigned{border-left-color:#c08322;color:#805b21}.print-structure-empty{margin:2px 0 0;padding:3px;font-size:6px}.print-structure-footer{margin-top:5px;padding-top:4px;font-size:6px}}
      @media print{@page{size:1189mm 841mm;margin:8mm}.print-structure-root{padding:5mm 0 8mm}.print-structure-root:after{height:5mm}.print-structure-root .print-structure-manager{width:240px}.print-structure-state-grid{grid-template-columns:repeat(24,minmax(0,1fr));column-gap:1mm;row-gap:0;padding-top:5mm}.print-structure-state-grid:before{right:2%;left:2%}.print-structure-state{padding:1.5mm}.print-structure-state:before{top:-5mm;height:5mm}.print-structure-manager{padding:1.5mm 1mm}.print-structure-level{font-size:6px}.print-structure-manager strong{font-size:8px}.print-structure-manager>span:last-of-type{font-size:7px}.print-structure-children{margin:2mm 0 0;padding:2mm 0 0 1.5mm}.print-structure-children-label{font-size:6px}.print-structure-municipalities{grid-template-columns:1fr;gap:1mm}.print-structure-municipality{padding:1mm;border-left:1px solid #c9dde5}.print-structure-municipality strong{font-size:7px;line-height:1.1}.print-structure-municipality span{font-size:6.5px;line-height:1.1}.print-structure-empty{font-size:7px}.print-structure-footer{margin-top:5mm;font-size:7px}}
      @media(max-width:760px){.print-structure-document{padding:15px}.print-structure-state-grid{grid-template-columns:1fr}.print-structure-state-grid:before{display:none}.print-structure-state:before{display:none}}
    </style></head><body>
    <div class="print-structure-toolbar"><button id="print-structure-button" type="button">Imprimir Estructura</button><button id="close-structure-button" class="close" type="button">Cerrar</button></div>
    <main class="print-structure-document">
      <header class="print-structure-header"><div class="print-structure-brand"><img src="${escapeHtml(new URL("assets/img/ora-logo.png", window.location.href).href)}" alt="ORA"><div><p>ORGANIZACIÓN RENOVADORA AUTÉNTICA</p><h1>Estructura de movilizadores</h1></div></div><div class="print-structure-date">Generada el<br><strong>${escapeHtml(generatedAt)}</strong></div></header>
      <section class="print-structure-root">${nationalCard}</section>
      <section class="print-structure-state-grid">${stateBranches || noStates}</section>
      <footer class="print-structure-footer">Jerarquía territorial: nivel nacional → responsables estadales → responsables municipales. Los niveles sin cuenta asignada se identifican en el árbol.</footer>
    </main></body></html>`;
}

function showStructurePresentation() {
  const popup = window.open("", "_blank");
  if (!popup) {
    showStructureNotice("El navegador bloqueó la nueva ventana. Permite ventanas emergentes para mostrar e imprimir la estructura.");
    return;
  }
  popup.document.open();
  popup.document.write(buildStructurePresentation());
  popup.document.close();
  popup.document.getElementById("print-structure-button")?.addEventListener("click", () => popup.print());
  popup.document.getElementById("close-structure-button")?.addEventListener("click", () => popup.close());
}

function populateStructureUnitSelect() {
  const select = document.getElementById("structure-form").elements.namedItem("territoryId");
  const national = territories.filter(unit => unit.nivel === "nacional");
  const states = territories.filter(unit => unit.nivel === "estadal");
  const municipalities = territories.filter(unit => unit.nivel === "municipal");
  const stateById = new Map(states.map(state => [Number(state.id), state]));
  select.innerHTML = '<option value="">Selecciona una unidad</option>';
  if (national.length) {
    select.insertAdjacentHTML("beforeend", `<optgroup label="Nacional">${national.map(unit =>
      `<option value="${Number(unit.id)}">Movilizador nacional · ${escapeHtml(unit.nombre)}</option>`
    ).join("")}</optgroup>`);
  }
  select.insertAdjacentHTML("beforeend", `<optgroup label="Estados">${states.map(unit =>
    `<option value="${Number(unit.id)}">Movilizador estadal · ${escapeHtml(unit.nombre)}</option>`
  ).join("")}</optgroup>`);
  select.insertAdjacentHTML("beforeend", `<optgroup label="Municipios">${municipalities.map(unit =>
    `<option value="${Number(unit.id)}">${escapeHtml(stateById.get(Number(unit.padre_id))?.nombre || "")} · ${escapeHtml(unit.nombre)}</option>`
  ).join("")}</optgroup>`);
}

function populateEventStates() {
  const stateSelect = eventForm.elements.namedItem("stateId");
  const states = territories.filter(unit => unit.nivel === "estadal");
  stateSelect.innerHTML = `<option value="">Selecciona una entidad federal</option>${states.map(unit =>
    `<option value="${Number(unit.id)}">${escapeHtml(unit.nombre)}</option>`
  ).join("")}`;
  populateEventMunicipalities();
}

function populateEventMunicipalities() {
  const stateId = Number(eventForm.elements.namedItem("stateId").value);
  const select = eventForm.elements.namedItem("territoryId");
  const municipalities = territories.filter(unit => unit.nivel === "municipal" && Number(unit.padre_id) === stateId);
  select.innerHTML = `<option value="">${stateId ? "Selecciona un municipio" : "Selecciona primero una entidad federal"}</option>${municipalities.map(unit =>
    `<option value="${Number(unit.id)}">${escapeHtml(unit.nombre)}</option>`
  ).join("")}`;
  select.disabled = !stateId;
}

async function loadStructure() {
  const result = await request("structure");
  territories = result.territories;
  renderStructureTree();
  populateStructureUnitSelect();
  populateEventStates();
}

function resetStructureForm() {
  const form = document.getElementById("structure-form");
  form.reset();
  form.elements.namedItem("userId").value = "";
  document.getElementById("structure-form-title").textContent = "Nueva cuenta de movilizador";
  document.getElementById("structure-message").textContent = "";
  document.getElementById("structure-message").classList.remove("visible");
  form.hidden = false;
}

function editStructureUser(unitId) {
  const unit = territories.find(item => Number(item.id) === unitId);
  if (!unit) return;
  resetStructureForm();
  const form = document.getElementById("structure-form");
  form.elements.namedItem("userId").value = unit.usuario_id || "";
  form.elements.namedItem("name").value = unit.usuario_nombre || "";
  form.elements.namedItem("phone").value = unit.usuario_telefono || "";
  form.elements.namedItem("email").value = unit.usuario_correo || "";
  form.elements.namedItem("territoryId").value = String(unit.id);
  form.elements.namedItem("active").value = unit.usuario_id && !Number(unit.usuario_activo) ? "0" : "1";
  document.getElementById("structure-form-title").textContent = unit.usuario_id ? "Editar cuenta de movilizador" : "Asignar movilizador";
  document.getElementById("structure-password-help").textContent = unit.usuario_id
    ? "Al editar, deja la contraseña vacía para conservar la contraseña actual. Una nueva contraseña debe tener al menos 8 caracteres."
    : "Define una contraseña inicial de al menos 8 caracteres.";
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function saveStructureUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const userId = data.get("userId");
  const password = String(data.get("password") || "");
  const message = document.getElementById("structure-message");
  if ((!userId && password.length < 8) || (password && password.length < 8)) {
    showFormMessage(message, "La contraseña debe tener al menos 8 caracteres.");
    return;
  }
  const button = document.getElementById("save-structure-user");
  button.disabled = true;
  try {
    const result = await request("structure-user-save", {
      method: "POST",
      data: {
        userId: userId || null,
        name: data.get("name"),
        phone: data.get("phone"),
        email: data.get("email"),
        territoryId: Number(data.get("territoryId")),
        active: data.get("active") === "1",
        password
      }
    });
    form.hidden = true;
    showStructureNotice(result.message, false);
    await loadStructure();
  } catch (error) {
    showFormMessage(message, error.message);
  } finally {
    button.disabled = false;
  }
}

function showSettingsNotice(message, isError = true) {
  const notice = document.getElementById("settings-notice");
  if (!notice) return;
  displayTemporaryNotice(notice, message, isError);
}

function renderSystemSettings() {
  const moduleNames = {
    tracking: "Seguimiento",
    events: "Movilizaciones",
    structure: "Estructura",
    reports: "Reportes",
    settings: "Configuración"
  };
  document.querySelectorAll('#system-role-form input[name="modules"]').forEach(input => {
    input.disabled = !user.superadmin && !user.modules.includes(input.value);
  });
  document.getElementById("system-roles-list").innerHTML = systemRoles.length
    ? systemRoles.map(role => `<article class="settings-item">
        <div><strong>${escapeHtml(role.name)}</strong><small>${escapeHtml(role.description || "Sin descripción")}</small>
          <span>${role.modules.map(module => escapeHtml(moduleNames[module] || module)).join(" · ")}</span></div>
        <button class="button small secondary" type="button" data-edit-system-role="${role.id}">Editar</button>
      </article>`).join("")
    : '<p class="settings-empty">Todavía no hay roles configurados.</p>';
  document.getElementById("system-admin-users-list").innerHTML = systemAdminUsers.length
    ? systemAdminUsers.map(account => `<article class="settings-item">
        <div><strong>${escapeHtml(account.name)}</strong><small>@${escapeHtml(account.username)} · ${escapeHtml(account.roleName)}</small>
          <span>${account.active ? "Activo" : "Desactivado"}</span></div>
        <button class="button small secondary" type="button" data-edit-system-user="${account.id}">Editar</button>
      </article>`).join("")
    : '<p class="settings-empty">Todavía no hay usuarios administrativos creados.</p>';
  const roleSelect = document.getElementById("system-admin-user-form").elements.namedItem("roleId");
  const selectedRole = roleSelect.value;
  roleSelect.innerHTML = `<option value="">Selecciona un rol</option>${systemRoles.map(role =>
    `<option value="${role.id}">${escapeHtml(role.name)}</option>`
  ).join("")}`;
  if (systemRoles.some(role => String(role.id) === selectedRole)) roleSelect.value = selectedRole;
}

async function loadSystemSettings() {
  const result = await request("system-settings");
  systemRoles = result.roles;
  systemAdminUsers = result.users;
  renderSystemSettings();
}

function resetSystemRoleForm() {
  const form = document.getElementById("system-role-form");
  form.reset();
  form.elements.namedItem("roleId").value = "";
  document.getElementById("system-role-message").textContent = "";
  document.getElementById("system-role-message").classList.remove("visible");
  document.getElementById("save-system-role").textContent = "Guardar rol";
}

function editSystemRole(roleId) {
  const role = systemRoles.find(item => item.id === roleId);
  if (!role) return;
  const form = document.getElementById("system-role-form");
  form.elements.namedItem("roleId").value = String(role.id);
  form.elements.namedItem("name").value = role.name;
  form.elements.namedItem("description").value = role.description || "";
  form.querySelectorAll('input[name="modules"]').forEach(input => {
    input.checked = role.modules.includes(input.value);
  });
  document.getElementById("system-role-message").textContent = "";
  document.getElementById("system-role-message").classList.remove("visible");
  document.getElementById("save-system-role").textContent = "Actualizar rol";
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function saveSystemRole(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = document.getElementById("save-system-role");
  button.disabled = true;
  try {
    const result = await request("system-role-save", {
      method: "POST",
      data: {
        roleId: data.get("roleId") || null,
        name: data.get("name"),
        description: data.get("description"),
        modules: [...form.querySelectorAll('input[name="modules"]:checked')].map(input => input.value)
      }
    });
    resetSystemRoleForm();
    showSettingsNotice(result.message, false);
    await loadSystemSettings();
  } catch (error) {
    showFormMessage(document.getElementById("system-role-message"), error.message);
  } finally {
    button.disabled = false;
  }
}

function resetSystemAdminUserForm() {
  const form = document.getElementById("system-admin-user-form");
  form.reset();
  form.elements.namedItem("userId").value = "";
  form.elements.namedItem("active").value = "1";
  form.elements.namedItem("password").required = true;
  document.getElementById("system-admin-password-help").textContent =
    "Define una contraseña de al menos 8 caracteres.";
  document.getElementById("system-admin-user-message").textContent = "";
  document.getElementById("system-admin-user-message").classList.remove("visible");
  document.getElementById("save-system-admin-user").textContent = "Crear usuario";
}

function editSystemAdminUser(userId) {
  const account = systemAdminUsers.find(item => item.id === userId);
  if (!account) return;
  const form = document.getElementById("system-admin-user-form");
  form.elements.namedItem("userId").value = String(account.id);
  form.elements.namedItem("name").value = account.name;
  form.elements.namedItem("username").value = account.username;
  form.elements.namedItem("password").value = "";
  form.elements.namedItem("password").required = false;
  form.elements.namedItem("roleId").value = String(account.roleId);
  form.elements.namedItem("active").value = account.active ? "1" : "0";
  document.getElementById("system-admin-password-help").textContent =
    "Al editar, deja la contraseña vacía para conservarla. Una nueva contraseña debe tener al menos 8 caracteres.";
  document.getElementById("system-admin-user-message").textContent = "";
  document.getElementById("system-admin-user-message").classList.remove("visible");
  document.getElementById("save-system-admin-user").textContent = "Actualizar usuario";
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function saveSystemAdminUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const userId = data.get("userId");
  const password = String(data.get("password") || "");
  const message = document.getElementById("system-admin-user-message");
  if ((!userId && password.length < 8) || (password && password.length < 8)) {
    showFormMessage(message, "La contraseña debe tener al menos 8 caracteres.");
    return;
  }
  const button = document.getElementById("save-system-admin-user");
  button.disabled = true;
  try {
    const result = await request("system-admin-user-save", {
      method: "POST",
      data: {
        userId: userId || null,
        name: data.get("name"),
        username: data.get("username"),
        password,
        roleId: Number(data.get("roleId")),
        active: data.get("active") === "1"
      }
    });
    resetSystemAdminUserForm();
    showSettingsNotice(result.message, false);
    await loadSystemSettings();
  } catch (error) {
    showFormMessage(message, error.message);
  } finally {
    button.disabled = false;
  }
}

async function createEvent(event) {
  event.preventDefault();
  const formData = new FormData(eventForm);
  const end = readCoordinates("end");
  if (!Number.isFinite(end.latitude) || !Number.isFinite(end.longitude) ||
      Math.abs(end.latitude) > 90 || Math.abs(end.longitude) > 180) {
    showFormMessage(eventMessage, "Marca el punto de llegada de la movilización en el mapa.");
    return;
  }
  const payload = {
    name: formData.get("name"),
    description: formData.get("description"),
    date: formData.get("date"),
    eventTime: formData.get("eventTime"),
    estimatedPeople: Number(formData.get("estimatedPeople")),
    location: formData.get("location"),
    territoryId: Number(formData.get("territoryId")),
    endName: formData.get("endName"),
    endLat: formData.get("endLat"),
    endLng: formData.get("endLng")
  };
  const button = document.getElementById("save-event");
  button.disabled = true;
  try {
    await request("event-create", { method: "POST", data: payload });
    eventModal.hidden = true;
    showNotice("La movilización quedó creada y estará disponible para todos los movilizadores.", false);
    await loadEvents();
  } catch (error) {
    showFormMessage(eventMessage, error.message);
  } finally {
    button.disabled = false;
  }
}

function currentWorkflowStage(assignment) {
  if (!assignment.plan_confirmado_en) return 1;
  if (!assignment.transporte_confirmado_en) return 2;
  if (!assignment.datos_confirmados_en) return 3;
  return 4;
}

function workflowProgress(stage) {
  return ["Personas", "Transporte y ruta", "Confirmación", "Inicio de viaje"]
    .map((label, index) => {
      const number = index + 1;
      const state = number < stage ? "complete" : number === stage ? "active" : "";
      return `<div class="wizard-progress-item ${state}"><span>${number < stage ? "✓" : number}</span><strong>${label}</strong></div>`;
    }).join("");
}

function workflowCoordinate(assignment, prefix) {
  const latitudeValue = assignment[`punto_${prefix}_lat`];
  const longitudeValue = assignment[`punto_${prefix}_lng`];
  if (latitudeValue === null || latitudeValue === "" || longitudeValue === null || longitudeValue === "") return null;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

function reverseGeocodeLocation(coordinate) {
  const key = `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`;
  if (reverseGeocodeCache.has(key)) return reverseGeocodeCache.get(key);
  const request = reverseGeocodeQueue.then(async () => {
    const delay = Math.max(0, 1100 - (Date.now() - lastReverseGeocodeAt));
    if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
    lastReverseGeocodeAt = Date.now();
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({
      format: "jsonv2",
      lat: String(coordinate.latitude),
      lon: String(coordinate.longitude),
      zoom: "14",
      addressdetails: "1"
    });
    const response = await fetch(url, { headers: { "Accept-Language": "es" } });
    if (!response.ok) throw new Error("El servicio de lugares no está disponible.");
    const result = await response.json();
    const address = result.address || {};
    const neighbourhood = address.neighbourhood || address.suburb || address.quarter || address.city_district;
    const municipality = address.city || address.town || address.village || address.municipality ||
      address.county || address.state_district;
    const parts = [...new Set([neighbourhood, municipality, address.state, address.country].filter(Boolean))];
    if (!parts.length) throw new Error("No se encontró un nombre para estas coordenadas.");
    return parts.join(", ");
  });
  reverseGeocodeQueue = request.catch(() => {});
  reverseGeocodeCache.set(key, request);
  request.catch(() => reverseGeocodeCache.delete(key));
  return request;
}

function formatWorkflowCoordinates(coordinate) {
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

async function updateWorkflowLocationLabels(assignmentId) {
  const card = document.querySelector(`[data-assignment-id="${assignmentId}"].assignment-card`);
  if (!card) return;
  const locations = [["departure", "salida"], ["arrival", "llegada"]];
  await Promise.all(locations.map(async ([key, label]) => {
    const location = card.querySelector(`[data-geocode="${key}"]`);
    const coordinates = location?.dataset.latitude && location?.dataset.longitude
      ? { latitude: Number(location.dataset.latitude), longitude: Number(location.dataset.longitude) }
      : null;
    if (!location || !coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
      if (location) location.textContent = `Punto de ${label} sin coordenadas`;
      return;
    }
    const coordinateText = formatWorkflowCoordinates(coordinates);
    location.textContent = `Buscando zona… · ${coordinateText}`;
    try {
      location.textContent = `${await reverseGeocodeLocation(coordinates)} · ${coordinateText}`;
    } catch (error) {
      location.textContent = `Zona no identificada · ${coordinateText}`;
      console.warn(`No se pudo identificar la zona de ${label}:`, error);
    }
  }));
}

function getAssignmentVehicles(assignment) {
  try {
    const vehicles = JSON.parse(assignment.vehiculos_json || "[]");
    return Array.isArray(vehicles) ? vehicles : [];
  } catch (error) {
    console.error("No se pudieron leer los vehículos guardados:", error);
    return [];
  }
}

function renderMobilizerAssignment(assignment, event) {
  const assignmentId = Number(assignment.id);
  const stage = currentWorkflowStage(assignment);
  const assignmentSessions = assignment.trackingSessions || [];
  const activeServerSession = assignmentSessions.find(session => session.estado === "en_curso");
  const arrivedSession = activeServerSession
    ? null
    : assignmentSessions.find(session => session.tipo !== "retorno" && session.llegada_confirmada_en);
  const returnSessions = assignmentSessions.filter(session => session.tipo === "retorno");
  const returnedSession = activeServerSession
    ? null
    : returnSessions.find(session => session.llegada_confirmada_en);
  const canStartReturn = Boolean(arrivedSession && !returnSessions.length);
  const activeLeg = activeServerSession?.tipo === "retorno" ? "retorno" : "ida";
  const tripFinished = Boolean(returnedSession || (arrivedSession && !canStartReturn));
  const recoveryPending = Boolean(activeServerSession &&
    (!activeTracking || activeTracking.assignmentId !== assignmentId));
  const vehicles = getAssignmentVehicles(assignment);
  const progress = workflowProgress(stage);
  const listPhotos = Number(assignment.fotos_lista) || 0;
  const vehiclePhotos = Number(assignment.fotos_vehiculo) || 0;
  const groupPhotos = Number(assignment.fotos_grupo) || 0;
  const routeTime = routeSummary({
    ruta_distancia_metros: assignment.ruta_personal_distancia_metros,
    ruta_duracion_segundos: assignment.ruta_personal_duracion_segundos
  });
  const start = workflowCoordinate(assignment, "salida");
  const end = workflowCoordinate(assignment, "llegada") || workflowCoordinate({
    punto_llegada_lat: event.punto_llegada_lat,
    punto_llegada_lng: event.punto_llegada_lng
  }, "llegada");
  let stepContent = "";

  if (stage === 1) {
    stepContent = `<section class="wizard-stage">
      <h3>1. ¿Cuántas personas llevarás?</h3>
      <p>Registra manualmente la cantidad de personas y agrega una foto clara de la lista como evidencia.</p>
      <form class="wizard-form" data-step-form data-step="plan" data-assignment-id="${assignmentId}">
        <label>Cantidad de personas<input name="plannedPeople" type="number" min="0" max="1000000" value="${assignment.personas_planificadas ?? ""}" required></label>
        <label class="camera-button">▧ Tomar o seleccionar foto(s) de la lista
          <input type="file" accept="image/*" capture="environment" multiple data-workflow-photo data-photo-category="lista" data-assignment-id="${assignmentId}">
        </label>
        <p class="wizard-help" data-photo-status="${assignmentId}" data-saved-count="${listPhotos}">${listPhotos} foto(s) de lista guardada(s). Puedes añadir más fotos en varias tandas.</p>
        <div class="wizard-actions"><button class="button primary" type="submit">Guardar y continuar →</button></div>
      </form>
    </section>`;
  } else if (stage === 2) {
    const requiresTransport = assignment.requiere_transporte === null || String(assignment.requiere_transporte) === "1";
    stepContent = `<section class="wizard-stage">
      <h3>2. Transporte y ruta</h3>
      <p>Indica los vehículos, registra manualmente sus placas y agrega una foto de cada uno. Marca el origen y el destino para calcular la ruta vial estimada.</p>
      <form class="wizard-form" data-step-form data-step="transport" data-assignment-id="${assignmentId}">
        <label>¿Qué transporte utilizarás?
          <select name="requiresTransport" data-transport-choice="${assignmentId}" required>
            <option value="yes" ${requiresTransport ? "selected" : ""}>Usaré vehículo(s)</option>
            <option value="no" ${!requiresTransport ? "selected" : ""}>No requiere vehículo</option>
          </select>
        </label>
        <div data-vehicle-section="${assignmentId}" ${requiresTransport ? "" : "hidden"}>
          <div class="route-heading"><div><h3>Vehículos</h3><p>Registra cada vehículo y agrega otra fila con +.</p></div></div>
          <div class="vehicle-list" data-vehicle-list="${assignmentId}"></div>
          <p class="wizard-help" data-photo-status="${assignmentId}" data-saved-count="${vehiclePhotos}">${vehiclePhotos} evidencia(s) de vehículo guardada(s). Ingresa la placa manualmente y agrega su foto como evidencia.</p>
        </div>
        <div class="route-picker-grid">
          <section class="route-picker-card"><h4>Punto de salida</h4>
            <label class="field">Referencia<input name="departure" maxlength="180" value="${escapeHtml(assignment.punto_salida || "")}" placeholder="Referencia del lugar"></label>
            <div class="map-frame" id="departure-map-${assignmentId}" aria-label="Seleccionar punto de salida en el mapa"></div>
            <button class="button small secondary" type="button" data-use-location="${assignmentId}">Usar mi ubicación</button>
          </section>
          <section class="route-picker-card"><h4>Punto de llegada</h4>
            <label class="field">Destino de la movilización<input name="arrival" maxlength="180" value="${escapeHtml(event.punto_llegada_nombre || event.lugar || "")}" readonly></label>
            <div class="map-frame" id="arrival-map-${assignmentId}" aria-label="Seleccionar punto de llegada y ver la ruta"></div>
          </section>
        </div>
        <input type="hidden" name="startLat" value="${assignment.punto_salida_lat ?? ""}">
        <input type="hidden" name="startLng" value="${assignment.punto_salida_lng ?? ""}">
        <input type="hidden" name="endLat" value="${event.punto_llegada_lat ?? assignment.punto_llegada_lat ?? ""}">
        <input type="hidden" name="endLng" value="${event.punto_llegada_lng ?? assignment.punto_llegada_lng ?? ""}">
        <input type="hidden" name="routeGeojson" value="${escapeHtml(assignment.ruta_personal_geojson || "")}">
        <input type="hidden" name="distanceMeters" value="${assignment.ruta_personal_distancia_metros ?? ""}">
        <input type="hidden" name="durationSeconds" value="${assignment.ruta_personal_duracion_segundos ?? ""}">
        <div class="route-result workflow-route-result" data-route-result="${assignmentId}" role="status">${routeTime}</div>
        <p class="wizard-help">El destino ya está fijado por la movilización. Marca solamente tu punto de salida; la estimación vial no incluye tráfico en tiempo real.</p>
        <div class="wizard-actions">
          <button class="button secondary" type="button" data-edit-stage="${assignmentId}" data-stage="1">← Volver a personas</button>
          <button class="button primary" type="submit">Guardar transporte y continuar →</button>
        </div>
      </form>
    </section>`;
  } else if (stage === 3) {
    const vehiclesSummary = vehicles.length
      ? vehicles.map(vehicle => `${escapeHtml(vehicle.type)} × ${Number(vehicle.count)}${vehicle.plates ? ` · placas: ${escapeHtml(vehicle.plates)}` : ""}`).join("<br>")
      : "Sin vehículo";
    stepContent = `<section class="wizard-stage">
      <h3>3. Revisa y confirma los datos</h3>
      <p>Verifica la lista, el transporte y la ruta. La zona de salida y llegada se estima desde el mapa con OpenStreetMap. Toma una o más fotos del grupo antes de confirmar.</p>
      <div class="review-grid">
        <div class="review-item"><small>Personas planificadas · ${listPhotos} foto(s) de lista</small><strong>${Number(assignment.personas_planificadas) || 0}</strong></div>
        <div class="review-item"><small>Vehículos · ${vehiclePhotos} evidencia(s)</small><strong>${vehiclesSummary}</strong></div>
        <div class="review-item"><small>Salida · zona aproximada</small><strong><span data-geocode="departure" data-latitude="${start?.latitude ?? ""}" data-longitude="${start?.longitude ?? ""}">${escapeHtml(assignment.punto_salida || "Buscando zona…")}</span></strong></div>
        <div class="review-item"><small>Llegada · ruta estimada</small><strong><span data-geocode="arrival" data-latitude="${end?.latitude ?? ""}" data-longitude="${end?.longitude ?? ""}">${escapeHtml(event.punto_llegada_nombre || assignment.punto_llegada_nombre || "Buscando zona…")}</span><span class="route-summary-time"> · ${escapeHtml(routeTime)}</span></strong></div>
      </div>
      <form class="wizard-form" data-step-form data-step="confirm" data-assignment-id="${assignmentId}">
        <label class="camera-button">▧ Tomar foto(s) del grupo
          <input type="file" accept="image/*" capture="environment" multiple data-workflow-photo data-photo-category="grupo" data-assignment-id="${assignmentId}">
        </label>
        <p class="wizard-help" data-photo-status="${assignmentId}" data-saved-count="${groupPhotos}">${groupPhotos} foto(s) de grupo guardada(s). Necesitas al menos una para confirmar.</p>
        <div class="wizard-alert" data-photo-alert="${assignmentId}" ${groupPhotos ? "hidden" : ""}>Primero toma y guarda al menos una foto del grupo.</div>
        <div class="wizard-actions">
          <button class="button secondary" type="button" data-edit-stage="${assignmentId}" data-stage="2">← Volver a transporte</button>
          <button class="button secondary" type="button" data-edit-stage="${assignmentId}" data-stage="1">Editar personas</button>
          <button class="button primary" type="submit">Confirmar movilización →</button>
        </div>
      </form>
    </section>`;
  } else {
    stepContent = `<section class="trip-interface">
      <header class="trip-summary">
        <div><small>${escapeHtml(event.nombre)}</small><strong data-geocode="departure" data-latitude="${start?.latitude ?? ""}" data-longitude="${start?.longitude ?? ""}">${escapeHtml(assignment.punto_salida || "Salida aproximada")}</strong></div>
        <span aria-hidden="true">→</span>
        <div><small>Destino · ruta estimada</small><strong><span data-geocode="arrival" data-latitude="${end?.latitude ?? ""}" data-longitude="${end?.longitude ?? ""}">${escapeHtml(event.punto_llegada_nombre || assignment.punto_llegada_nombre || "Destino")}</span><span class="route-summary-time"> · ${escapeHtml(routeTime)}</span></strong></div>
        <button class="button small secondary" type="button" data-edit-stage="${assignmentId}" data-stage="3">Editar datos</button>
      </header>
      <div class="map-frame workflow-tracking-map trip-map" id="tracking-map-${assignmentId}" aria-label="Mapa y ruta estimada del viaje"></div>
      <div class="trip-tracking-dock">
        <label><input type="checkbox" data-tracking-consent="${assignmentId}" ${arrivedSession || activeServerSession || returnedSession ? "checked disabled" : ""}><span>Autorizo registrar mi ubicación durante el viaje.</span></label>
        <div class="tracking-live" data-tracking-state="${assignmentId}" role="status">${returnedSession ? `Retorno completado · ${escapeHtml(formatLastSeen(returnedSession.llegada_confirmada_en))}` : arrivedSession ? `Llegada confirmada · ${escapeHtml(formatLastSeen(arrivedSession.llegada_confirmada_en))}${canStartReturn ? ". Cuando salgas de regreso, pulsa «Iniciar retorno»." : ""}` : activeServerSession ? `${activeLeg === "retorno" ? "Retorno activo" : "Sesión activa"}. Recuperando el GPS…` : "Viaje listo para iniciar."}</div>
        <div class="trip-tracking-help">El navegador puede pausar el GPS al suspender o cerrar la página. La sesión se conserva y el envío se reanuda al volver a abrir esta movilización.</div>
        <div class="tracking-panel-actions"><button class="button primary trip-start-button" type="button" data-tracking-start="${assignmentId}" data-tracking-leg="${canStartReturn ? "retorno" : "ida"}" ${tripFinished ? "hidden" : ""} ${recoveryPending ? "disabled" : ""}>${recoveryPending ? "Recuperando viaje…" : canStartReturn ? "Iniciar retorno" : "Inicio de viaje"}</button><button class="button secondary trip-start-button" type="button" data-tracking-stop="${assignmentId}" hidden>${activeLeg === "retorno" ? "Confirmar regreso" : "Confirmar llegada"}</button></div>
      </div>
    </section>`;
  }

  return `<article class="assignment-card mobilizer-assignment ${stage === 4 ? "mobilizer-trip-card" : ""}" data-assignment-id="${assignmentId}">
    ${stage === 4 ? "" : `<div class="mobilizer-assignment-heading"><div><h2>Registro de movilización</h2><p>Destino: ${escapeHtml(event.punto_llegada_nombre || event.lugar)}</p></div>${assignment.datos_confirmados_en ? '<span class="status">Datos confirmados</span>' : ""}</div>
    <div class="wizard-progress">${progress}</div>`}
    ${stepContent}
  </article>`;
}

function destroyWorkflowMaps() {
  workflowMaps.forEach(maps => {
    maps.departure.remove();
    maps.arrival.remove();
  });
  workflowMaps.clear();
  workflowTrackingMaps.forEach(maps => maps.map.remove());
  workflowTrackingMaps.clear();
}

function initializeMobilizerTrackingMap(assignment) {
  const assignmentId = Number(assignment.id);
  const start = assignment.punto_salida_lat !== null && assignment.punto_salida_lng !== null
    ? { latitude: Number(assignment.punto_salida_lat), longitude: Number(assignment.punto_salida_lng) }
    : null;
  const end = assignment.punto_llegada_lat !== null && assignment.punto_llegada_lng !== null
    ? { latitude: Number(assignment.punto_llegada_lat), longitude: Number(assignment.punto_llegada_lng) }
    : null;
  const center = end || start || { latitude: 10.4806, longitude: -66.9036 };
  const map = createMap(`tracking-map-${assignmentId}`, [center.longitude, center.latitude], start ? 13 : 10);
  map.addControl(new maplibregl.NavigationControl(), "top-left");
  const routeCoordinates = parseTrackingRoute(assignment.ruta_personal_geojson);
  if (routeCoordinates.length >= 2) {
    setMapLine(map, `mobilizer-route-${assignmentId}`, routeCoordinates, {
      color: "#087eae",
      weight: 6,
      opacity: 1
    });
    fitMapToPoints(map, routeCoordinates, 18);
  }
  if (start) createMapMarker(map, [start.longitude, start.latitude], { popup: "Salida" });
  if (end) createMapMarker(map, [end.longitude, end.latitude], { popup: "Llegada" });
  if (!routeCoordinates.length && start && end) {
    fitMapToPoints(map, [[start.longitude, start.latitude], [end.longitude, end.latitude]], 18);
  }
  map.on("load", () => {
    if (start && end) {
      const directions = new MapLibreGlDirections(map, {
        api: "https://router.project-osrm.org/route/v1",
        profile: "driving"
      });
      directions.interactive = false;
      setDirectionsWaypoints(directions, [
        [start.longitude, start.latitude],
        [end.longitude, end.latitude]
      ]);
    }
  });
  workflowTrackingMaps.set(assignmentId, { map, routeLayer: null });
  (assignment.trackingSessions || []).filter(session => session.estado !== "en_curso").forEach(session => {
    const walked = (session.points || [])
      .map(point => [Number(point.longitud), Number(point.latitud)])
      .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    setMapLine(map, `walked-${session.id}`, walked, {
      color: session.tipo === "retorno" ? "#7c5cff" : "#0e9f62",
      weight: 4
    });
  });
  if (activeTracking?.assignmentId === assignmentId && activeTracking.points.length > 1) {
    activeTracking.routeLayer = `active-tracking-route-${assignmentId}`;
    setMapLine(map, activeTracking.routeLayer, activeTracking.points.map(point => [point.longitude, point.latitude]), {
      color: "#bd594e",
      weight: 4
    });
  }
  window.setTimeout(() => map.resize(), 50);
}

function renderMobilizerWorkflow(event, assignments) {
  destroyWorkflowMaps();
  portalScreen.hidden = true;
  workflowScreen.hidden = false;
  workflowScreen.classList.toggle(
    "workflow-trip-mode",
    assignments.length > 0 && assignments.every(assignment => currentWorkflowStage(assignment) === 4)
  );
  document.getElementById("workflow-event-title").textContent = event.nombre;
  document.getElementById("workflow-event-meta").textContent =
    `${eventDate(event.fecha)} · ${event.lugar}${event.hora_inicio ? ` · ${String(event.hora_inicio).slice(0, 5)}` : ""}`;
  workflowContent.innerHTML = assignments.length
    ? assignments.map(assignment => renderMobilizerAssignment(assignment, event)).join("")
    : '<div class="empty-state">Esta movilización no tiene asignaciones disponibles para tu cuenta.</div>';
  window.history.replaceState({}, "", `${window.location.pathname}?event=${encodeURIComponent(event.id)}`);
  window.setTimeout(() => {
    assignments.filter(assignment => currentWorkflowStage(assignment) === 2).forEach(initializeWorkflowMaps);
    assignments.filter(assignment => currentWorkflowStage(assignment) === 2).forEach(initializeVehicleRows);
    assignments.filter(assignment => currentWorkflowStage(assignment) === 4).forEach(initializeMobilizerTrackingMap);
    assignments.filter(assignment => currentWorkflowStage(assignment) === 3 || currentWorkflowStage(assignment) === 4)
      .forEach(assignment => void updateWorkflowLocationLabels(Number(assignment.id)));
  }, 50);
}

function renderDetail(event, assignments) {
  if (!isAdminPanel) {
    renderMobilizerWorkflow(event, assignments);
    return;
  }
  const detailBody = document.getElementById("detail-body");
  document.getElementById("detail-title").textContent = event.nombre;
  const geoJson = event.ruta_ideal_geojson;
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set("event", event.id);
  detailBody.innerHTML = `
    <div class="detail-meta"><span>${escapeHtml(eventDate(event.fecha))}${event.hora_inicio ? ` · ${escapeHtml(String(event.hora_inicio).slice(0, 5))}` : ""}</span><span>${escapeHtml(event.lugar)}</span><span>${escapeHtml(event.estado.replace("_", " "))}</span><span>${escapeHtml(routeSummary(event))}</span></div>
    ${event.descripcion ? `<p class="subtle">${escapeHtml(event.descripcion)}</p>` : ""}
    ${geoJson ? '<div class="detail-route-map" id="detail-route-map"></div>' : ""}
    ${user.role === "admin" ? `<div class="route-heading"><div><h3>Enlace del portal de responsables</h3><p>Al abrirlo se solicitará el ingreso antes de mostrar la actividad.</p></div><button class="button small secondary" id="copy-event-link" type="button" data-link="${escapeHtml(shareUrl.toString())}">Compartir enlace</button></div>` : ""}
    <div class="route-heading"><div><h3>Movilizadores y seguimiento</h3><p>Registros territoriales, transporte, asistencia y rutas.</p></div></div>
    ${assignments.length ? assignments.map(assignment => renderAssignment(assignment)).join("") : '<div class="empty-state">Todavía no hay responsables asignados.</div>'}`;
  detailModal.hidden = false;
  if (geoJson) {
    window.setTimeout(() => {
      if (detailMap) detailMap.remove();
      detailMap = createMap("detail-route-map", [-66.9, 10.48], 11, {
        interactive: false,
        attributionControl: true
      });
      const boundsPoints = [];
      try {
        const geometry = typeof geoJson === "string" ? JSON.parse(geoJson) : geoJson;
        const routeGeometry = geometry.type === "Feature" ? geometry.geometry : geometry;
        const routeCoordinates = routeGeometry.coordinates || [];
        setMapLine(detailMap, "detail-ideal-route", routeCoordinates, {
          color: "#087eae",
          weight: 6,
          opacity: 1
        });
        boundsPoints.push(...routeCoordinates);
        assignments.forEach(assignment => {
          (assignment.trackingSessions || []).forEach(session => {
            const points = session.points || [];
            if (points.length < 2) return;
            const coordinates = points.map(point => [Number(point.longitud), Number(point.latitud)]);
            boundsPoints.push(...coordinates);
            setMapLine(detailMap, `detail-track-${session.id}`, coordinates, {
              color: session.estado === "en_curso" ? "#bd594e" : "#5975b7",
              weight: 3,
              dashArray: "7 6",
              opacity: 0.9
            });
          });
        });
      } catch (error) {
        console.error("Ruta ideal inválida:", error);
      }
      fitMapToPoints(detailMap, boundsPoints, 15);
      detailMap.resize();
    }, 75);
  }
}

function renderAssignment(assignment) {
  const editable = user.role === "admin" || Number(assignment.responsable_usuario_id) === Number(user.id);
  const stateLabel = (value, label) => `<p class="workflow-state">${value ? `✓ ${label} confirmado` : "Pendiente de completar"}</p>`;
  const isTerritorialRegistration = String(assignment.ente).startsWith("Registro movilizador #");
  const assignmentTitle = isTerritorialRegistration
    ? assignment.responsable || "Movilizador territorial"
    : assignment.ente;
  const trackingConsent = `<div class="tracking-panel">
    <p>La ruta recorrida se registra durante el tracking y se sincroniza con el sistema cuando hay conexión. Si el navegador pasa a segundo plano, el teléfono puede pausarlo.</p>
    <label><input type="checkbox" data-tracking-consent="${Number(assignment.id)}"><span>Autorizo registrar mi ubicación para esta movilización mientras el tracking esté activo.</span></label>
    <div class="tracking-live" data-tracking-state="${Number(assignment.id)}">Tracking detenido.</div>
    <div class="tracking-panel-actions"><button class="button primary" type="button" data-tracking-start="${Number(assignment.id)}" ${!editable ? "disabled" : ""}>Iniciar tracking</button><button class="button secondary" type="button" data-tracking-stop="${Number(assignment.id)}" hidden>Confirmar llegada</button></div>
  </div>`;
  return `<article class="assignment-card">
    <div class="assignment-title"><div><h3>${escapeHtml(assignmentTitle)}</h3><p>${isTerritorialRegistration ? "Registro territorial" : `Responsable: ${escapeHtml(assignment.responsable || "Sin asignar")} · Cuota: ${Number(assignment.cuota_personas) || 0}`}</p></div></div>
    <div class="workflow-grid">
      <form class="workflow-step" data-step-form data-step="plan" data-assignment-id="${Number(assignment.id)}">
        <h4>01 · Plan de movilidad</h4>
        <label>Personas planificadas<input name="plannedPeople" type="number" min="0" max="1000000" value="${assignment.personas_planificadas ?? ""}" required ${editable ? "" : "disabled"}></label>
        <button class="button secondary" type="submit" ${editable ? "" : "disabled"}>Confirmar plan</button>
        ${stateLabel(assignment.plan_confirmado_en, "Plan")}
      </form>
      <form class="workflow-step" data-step-form data-step="transport" data-assignment-id="${Number(assignment.id)}">
        <h4>02 · Transporte</h4>
        <label>¿Requiere transporte?<select name="requiresTransport" ${editable ? "" : "disabled"}><option value="">Selecciona…</option><option value="yes" ${String(assignment.requiere_transporte) === "1" ? "selected" : ""}>Sí</option><option value="no" ${String(assignment.requiere_transporte) === "0" ? "selected" : ""}>No</option></select></label>
        <label>Cantidad de autobuses<input name="buses" type="number" min="0" max="1000" value="${assignment.cantidad_autobuses ?? ""}" ${editable ? "" : "disabled"}></label>
        <label>Punto de salida<input name="departure" maxlength="180" value="${escapeHtml(assignment.punto_salida || "")}" ${editable ? "" : "disabled"}></label>
        <label>Quién recibe el transporte<input name="receiver" maxlength="140" value="${escapeHtml(assignment.receptor_transporte || "")}" ${editable ? "" : "disabled"}></label>
        <button class="button secondary" type="submit" ${editable ? "" : "disabled"}>Guardar transporte</button>
        ${stateLabel(assignment.transporte_confirmado_en, "Transporte")}
      </form>
      <form class="workflow-step" data-step-form data-step="attendance" data-assignment-id="${Number(assignment.id)}">
        <h4>03 · Personas movilizadas</h4>
        <label>Personas movilizadas<input name="attendees" type="number" min="0" max="1000000" value="${assignment.personas_asistentes ?? ""}" required ${editable ? "" : "disabled"}></label>
        <button class="button secondary" type="submit" ${editable ? "" : "disabled"}>Registrar personas movilizadas</button>
        <label>Adjuntar fotos<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple ${editable ? "" : "disabled"}></label>
        <p class="workflow-state">${Number(assignment.fotos) || 0} foto(s) · ${assignment.asistencia_reportada_en ? "Reporte enviado" : "Reporte pendiente"}</p>
      </form>
    </div>
    ${trackingConsent}
  </article>`;
}

function workflowCoordinates(form, prefix) {
  const latitudeValue = form.elements.namedItem(`${prefix}Lat`).value;
  const longitudeValue = form.elements.namedItem(`${prefix}Lng`).value;
  if (latitudeValue === "" || longitudeValue === "") return null;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

function updateWorkflowMarker(form, maps, latlng) {
  const point = [latlng.lng, latlng.lat];
  form.elements.namedItem("startLat").value = latlng.lat.toFixed(7);
  form.elements.namedItem("startLng").value = latlng.lng.toFixed(7);
  if (!form.elements.namedItem("departure").value) {
    form.elements.namedItem("departure").value = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  }
  if (maps.departureMarker) {
    maps.departureMarker.setLngLat(point);
  } else {
    maps.departureMarker = createMapMarker(maps.departure, point, {
      className: "route-map-marker",
      html: '<span aria-hidden="true"></span>',
      draggable: true,
      popup: "Punto de salida"
    });
    maps.departureMarker.on("dragend", () =>
      updateWorkflowMarker(form, maps, maps.departureMarker.getLngLat())
    );
  }
  if (maps.routeStartMarker) maps.routeStartMarker.setLngLat(point);
  else maps.routeStartMarker = createMapMarker(maps.arrival, point, { popup: "Salida" });
  const end = workflowCoordinates(form, "end");
  updateWorkflowDirections(maps, end
    ? [point, [end.longitude, end.latitude]]
    : []);
  form.elements.namedItem("routeGeojson").value = "";
  form.elements.namedItem("distanceMeters").value = "";
  form.elements.namedItem("durationSeconds").value = "";
  void calculateWorkflowRoute(form, maps);
}

function updateWorkflowDirections(maps, points) {
  if (maps.directions) {
    setDirectionsWaypoints(maps.directions, points);
  } else {
    maps.arrival.once("load", () => setDirectionsWaypoints(maps.directions, points));
  }
}

function initializeWorkflowMaps(assignment) {
  const assignmentId = Number(assignment.id);
  const form = document.querySelector(`[data-step-form][data-step="transport"][data-assignment-id="${assignmentId}"]`);
  if (!form) return;
  const start = workflowCoordinates(form, "start");
  const end = workflowCoordinates(form, "end");
  const center = end || start || { latitude: 10.4806, longitude: -66.9036 };
  const departureMap = createMap(
    `departure-map-${assignmentId}`,
    [center.longitude, center.latitude],
    start ? 14 : 11
  );
  const arrivalCenter = end || start || center;
  const arrivalMap = createMap(
    `arrival-map-${assignmentId}`,
    [arrivalCenter.longitude, arrivalCenter.latitude],
    end ? 14 : 11
  );
  departureMap.addControl(new maplibregl.NavigationControl(), "top-left");
  arrivalMap.addControl(new maplibregl.NavigationControl(), "top-left");
  const maps = {
    departure: departureMap,
    arrival: arrivalMap,
    departureMarker: null,
    arrivalMarker: null,
    routeStartMarker: null,
    routeEndMarker: null,
    directions: null
  };
  workflowMaps.set(assignmentId, maps);
  arrivalMap.on("load", () => {
    maps.directions = new MapLibreGlDirections(arrivalMap, {
      api: "https://router.project-osrm.org/route/v1",
      profile: "driving"
    });
    maps.directions.interactive = false;
    const savedStart = workflowCoordinates(form, "start");
    const savedEnd = workflowCoordinates(form, "end");
    if (savedStart && savedEnd) {
      setDirectionsWaypoints(maps.directions, [
        [savedStart.longitude, savedStart.latitude],
        [savedEnd.longitude, savedEnd.latitude]
      ]);
    }
  });
  if (start) {
    maps.departureMarker = createMapMarker(departureMap, [start.longitude, start.latitude], {
      className: "route-map-marker",
      html: '<span aria-hidden="true"></span>',
      draggable: true,
      popup: "Punto de salida"
    });
    maps.routeStartMarker = createMapMarker(arrivalMap, [start.longitude, start.latitude], { popup: "Salida" });
    maps.departureMarker.on("dragend", () =>
      updateWorkflowMarker(form, maps, maps.departureMarker.getLngLat())
    );
  }
  if (end) {
    maps.arrivalMarker = createMapMarker(arrivalMap, [end.longitude, end.latitude], {
      className: "route-map-marker",
      html: '<span aria-hidden="true"></span>',
      popup: "Destino de la movilización"
    });
    maps.routeEndMarker = createMapMarker(arrivalMap, [end.longitude, end.latitude], { popup: "Llegada" });
  }
  departureMap.on("click", event => updateWorkflowMarker(form, maps, event.lngLat));
  [departureMap, arrivalMap].forEach(map => window.setTimeout(() => map.resize(), 50));
  if (start && end && form.elements.namedItem("routeGeojson").value) {
    const savedRoute = parseTrackingRoute(form.elements.namedItem("routeGeojson").value);
    if (savedRoute.length >= 2) {
      setMapLine(arrivalMap, `workflow-route-${assignmentId}`, savedRoute, {
        color: "#087eae",
        weight: 6,
        opacity: 1
      });
      fitMapToPoints(arrivalMap, savedRoute, 18);
    } else {
      fitMapToPoints(arrivalMap, [
        [start.longitude, start.latitude],
        [end.longitude, end.latitude]
      ], 18);
    }
  } else if (start && end) {
    void calculateWorkflowRoute(form, maps);
  }
}

async function calculateWorkflowRoute(form, maps) {
  const result = form.querySelector(`[data-route-result="${form.dataset.assignmentId}"]`);
  const start = workflowCoordinates(form, "start");
  const end = workflowCoordinates(form, "end");
  if (!start || !end) {
    result.textContent = "Selecciona un punto de salida y otro de llegada para calcular la ruta.";
    result.className = "route-result workflow-route-result";
    return;
  }
  result.textContent = "Calculando la ruta vial…";
  result.className = "route-result workflow-route-result loading";
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("El servicio de rutas no está disponible.");
    const resultData = await response.json();
    const route = resultData.routes?.[0];
    if (resultData.code !== "Ok" || !route || !Array.isArray(route.geometry?.coordinates)) {
      throw new Error("No se encontró una ruta vial entre esos puntos.");
    }
    form.elements.namedItem("routeGeojson").value = JSON.stringify(route.geometry);
    form.elements.namedItem("distanceMeters").value = String(Math.round(route.distance));
    form.elements.namedItem("durationSeconds").value = String(Math.round(route.duration));
    setMapLine(maps.arrival, `workflow-route-${form.dataset.assignmentId}`, route.geometry.coordinates, {
      color: "#087eae",
      weight: 6,
      opacity: 1
    });
    updateWorkflowDirections(maps, [
      [start.longitude, start.latitude],
      [end.longitude, end.latitude]
    ]);
    fitMapToPoints(maps.arrival, route.geometry.coordinates, 18);
    result.textContent = `Ruta estimada: ${routeSummary({ ruta_distancia_metros: route.distance, ruta_duracion_segundos: route.duration })}. No incluye tráfico en tiempo real.`;
    result.className = "route-result workflow-route-result";
  } catch (error) {
    result.textContent = `${error.message} Revisa tu conexión a Internet.`;
    result.className = "route-result workflow-route-result error";
  }
}

function addWorkflowVehicleRow(container, vehicle = {}, photoCounts = {}) {
  const row = document.createElement("div");
  row.className = "vehicle-row";
  row.dataset.vehicleId = vehicle.id || crypto.randomUUID();
  const photoCount = Number(photoCounts[row.dataset.vehicleId]) || 0;
  row.innerHTML = `<label class="field vehicle-type">Tipo de vehículo
      <select name="vehicleType">
        <option value="Autobús">Autobús</option><option value="Auto">Auto</option>
        <option value="Camioneta">Camioneta</option><option value="Minibús">Minibús</option>
        <option value="Moto">Moto</option><option value="Otro">Otro</option>
      </select>
    </label>
    <input type="hidden" name="vehicleCount" value="${Number(vehicle.count) || 1}">
    <label class="field vehicle-plates">Placa<input name="vehiclePlates" maxlength="160" value="${escapeHtml(vehicle.plates || "")}" placeholder="ABC123"></label>
    <label class="camera-button vehicle-photo-button">▧ Foto
      <input type="file" accept="image/*" capture="environment" multiple data-workflow-photo data-photo-category="vehiculo" data-vehicle-id="${row.dataset.vehicleId}" data-assignment-id="${container.closest("[data-assignment-id]")?.dataset.assignmentId || ""}">
    </label>
    <div class="vehicle-row-actions">
      <button class="button small secondary" type="button" data-add-vehicle="${container.closest("[data-assignment-id]")?.dataset.assignmentId || ""}" aria-label="Agregar otro vehículo">＋</button>
      <button class="remove-row" type="button" aria-label="Quitar vehículo">×</button>
    </div>`;
  row.insertAdjacentHTML("beforeend", `<p class="wizard-help vehicle-photo-status" data-vehicle-photo-status data-saved-count="${photoCount}">${photoCount} foto(s) guardada(s) para este vehículo.</p>`);
  row.querySelector('[name="vehicleType"]').value = vehicle.type || "Autobús";
  row.querySelector(".remove-row").addEventListener("click", () => {
    if (container.childElementCount > 1) row.remove();
    else row.querySelector('[name="vehiclePlates"]').value = "";
  });
  container.appendChild(row);
}

function initializeVehicleRows(assignment) {
  const list = document.querySelector(`[data-vehicle-list="${Number(assignment.id)}"]`);
  if (!list || list.childElementCount) return;
  const vehicles = getAssignmentVehicles(assignment);
  const photoCounts = assignment.vehiclePhotoCounts || {};
  (vehicles.length ? vehicles : [{}]).forEach(vehicle => addWorkflowVehicleRow(list, vehicle, photoCounts));
}

function workflowNotice(message, isError = true) {
  const notice = document.getElementById("workflow-notice");
  notice.textContent = message;
  notice.hidden = !message;
  notice.classList.toggle("success", !isError);
}

async function compressPhoto(file) {
  // Reduce fotos grandes del teléfono antes de subirlas (máx. 2200 px, JPEG).
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (error) {
    return file;
  }
}

async function uploadWorkflowPhotos(input, files) {
  if (!files.length) return;
  if (files.length > 5) throw new Error("Puedes subir hasta 5 fotos por tanda. Selecciona menos imágenes.");
  const form = new FormData();
  form.append("assignmentId", input.dataset.assignmentId);
  form.append("type", input.dataset.photoCategory);
  if (input.dataset.photoCategory === "vehiculo") {
    form.append("vehicleId", input.dataset.vehicleId || "");
  }
  (await Promise.all(files.map(compressPhoto))).forEach(file => form.append("photos[]", file));
  await request("photo-upload", { method: "POST", form });
  const status = input.dataset.photoCategory === "vehiculo"
    ? input.closest(".vehicle-row")?.querySelector("[data-vehicle-photo-status]")
    : document.querySelector(`[data-photo-status="${input.dataset.assignmentId}"]`);
  if (status) {
    const savedCount = Number(status.dataset.savedCount) || 0;
    status.dataset.savedCount = String(savedCount + files.length);
    status.textContent = input.dataset.photoCategory === "vehiculo"
      ? `${savedCount + files.length} foto(s) guardada(s) para este vehículo.`
      : `${savedCount + files.length} foto(s) guardada(s).`;
  }
  if (input.dataset.photoCategory === "grupo") {
    const alert = document.querySelector(`[data-photo-alert="${input.dataset.assignmentId}"]`);
    if (alert) alert.hidden = true;
  }
}

async function processWorkflowPhotos(input) {
  const files = [...(input.files || [])];
  if (!files.length) return;
  try {
    await uploadWorkflowPhotos(input, files);
  } catch (error) {
    workflowNotice(error.message || "No se pudo guardar la foto. Inténtalo otra vez.");
  } finally {
    input.value = "";
  }
}

async function deleteEvent(eventId, eventName, button) {
  const confirmed = window.confirm(
    `¿Eliminar la movilización "${eventName}"?\n\nSe eliminarán también sus registros, fotos y puntos de tracking. Esta acción no se puede deshacer.`
  );
  if (!confirmed) return;
  button.disabled = true;
  try {
    const result = await request("event-delete", {
      method: "POST",
      data: { eventId }
    });
    showNotice(result.message, Boolean(result.warning));
    await loadEvents();
  } catch (error) {
    showNotice(error.message);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

async function openEvent(eventId) {
  if (activeTracking && String(activeTracking.eventId) !== String(eventId)) {
    showNotice("Tu viaje sigue activo. Abre esa misma movilización para continuar el seguimiento.");
    return;
  }
  try {
    const result = await request("event-detail", { query: { id: eventId } });
    activeEvent = result.event;
    renderDetail(result.event, result.assignments);
    if (!isAdminPanel) {
      updateTrackingButtons(activeTracking?.assignmentId);
      await restoreTrackingSession(result.event, result.assignments);
    }
  } catch (error) {
    showNotice(error.message);
  }
}

async function updateAssignment(form) {
  const data = new FormData(form);
  const step = form.dataset.step;
  const payload = { step, assignmentId: Number(form.dataset.assignmentId) };
  if (step === "plan") {
    payload.plannedPeople = Number(data.get("plannedPeople"));
  } else if (step === "transport") {
    const choice = data.get("requiresTransport");
    if (!choice) throw new Error("Indica si necesitas transporte.");
    payload.requiresTransport = choice === "yes";
    payload.departure = data.get("departure");
    payload.arrival = data.get("arrival");
    payload.startLat = data.get("startLat");
    payload.startLng = data.get("startLng");
    payload.endLat = data.get("endLat");
    payload.endLng = data.get("endLng");
    payload.distanceMeters = data.get("distanceMeters");
    payload.durationSeconds = data.get("durationSeconds");
    try {
      payload.routeGeojson = JSON.parse(data.get("routeGeojson") || "null");
    } catch (error) {
      throw new Error("No se pudo leer la ruta. Vuelve a seleccionar los puntos en el mapa.");
    }
    payload.vehicles = [...form.querySelectorAll(".vehicle-row")].map(row => ({
      id: row.dataset.vehicleId,
      type: row.querySelector('[name="vehicleType"]').value,
      count: Number(row.querySelector('[name="vehicleCount"]').value),
      plates: row.querySelector('[name="vehiclePlates"]').value.trim()
    }));
    if (!payload.requiresTransport) payload.vehicles = [];
  } else if (step === "confirm") {
    payload.step = "confirm";
  } else {
    payload.attendees = Number(data.get("attendees"));
  }
  await request("assignment-update", { method: "POST", data: payload });
  if (!isAdminPanel) workflowNotice("La etapa se guardó correctamente.", false);
  else showNotice("La etapa se guardó correctamente.", false);
  await openEvent(activeEvent.id);
}

async function editWorkflowStage(assignmentId, stage) {
  try {
    await request("assignment-update", {
      method: "POST",
      data: { step: "edit", assignmentId, stage }
    });
    workflowNotice("");
    await openEvent(activeEvent.id);
  } catch (error) {
    workflowNotice(error.message);
  }
}

function useWorkflowLocation(assignmentId) {
  const form = document.querySelector(`[data-step-form][data-step="transport"][data-assignment-id="${assignmentId}"]`);
  const maps = workflowMaps.get(assignmentId);
  if (!form || !maps) return;
  if (!navigator.geolocation) {
    workflowNotice("Este navegador no permite obtener la ubicación. Marca el punto de salida en el mapa.");
    return;
  }
  workflowNotice("Buscando tu ubicación…", false);
  navigator.geolocation.getCurrentPosition(position => {
    updateWorkflowMarker(form, maps, {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    });
    workflowNotice("Tu ubicación quedó como punto de salida. Revisa y calcula la ruta.", false);
  }, error => {
    workflowNotice(error.code === 1
      ? "Se denegó el permiso de ubicación. Puedes marcar la salida manualmente en el mapa."
      : "No se pudo obtener tu ubicación. Puedes marcar la salida manualmente en el mapa.");
  }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
}

async function uploadPhotos(input) {
  if (!input.files?.length) return;
  const form = new FormData();
  form.append("assignmentId", input.closest("[data-assignment-id]").dataset.assignmentId);
  (await Promise.all([...input.files].slice(0, 5).map(compressPhoto))).forEach(file => form.append("photos[]", file));
  try {
    await request("photo-upload", { method: "POST", form });
    showNotice("Las fotos de asistencia se guardaron correctamente.", false);
    await openEvent(activeEvent.id);
  } catch (error) {
    showNotice(error.message);
  } finally {
    input.value = "";
  }
}

function getTrackingDatabase() {
  if (trackingDatabase) return trackingDatabase;
  trackingDatabase = new Promise((resolve, reject) => {
    const open = indexedDB.open(TRACKING_DB, 1);
    open.onupgradeneeded = () => {
      const database = open.result;
      if (!database.objectStoreNames.contains(TRACKING_STORE)) {
        const store = database.createObjectStore(TRACKING_STORE, { keyPath: "id" });
        store.createIndex("eventId", "eventId", { unique: false });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error || new Error("No se pudo abrir el almacenamiento de rutas del teléfono."));
  });
  return trackingDatabase;
}

async function saveLocalTrack(session) {
  const database = await getTrackingDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRACKING_STORE, "readwrite");
    transaction.objectStore(TRACKING_STORE).put(session);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar la ruta local."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado local."));
  });
}

async function loadLocalTracks() {
  const database = await getTrackingDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRACKING_STORE, "readonly");
    const request = transaction.objectStore(TRACKING_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("No se pudieron leer las sesiones locales."));
    transaction.onabort = () => reject(transaction.error || new Error("Se canceló la lectura de sesiones locales."));
  });
}

function distanceMeters(first, second) {
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function pendingPoints() {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.error("No se pudo leer la cola local de tracking:", error);
    return [];
  }
}

function storePendingPoints(points) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(points));
}

async function flushPendingPoints() {
  if (!user) return false;
  const pending = pendingPoints();
  if (!pending.length) return true;
  if (!navigator.onLine) {
    if (activeTracking) showTrackingState("Sin conexión a Internet. El GPS se guarda en este teléfono y se enviará al recuperar la conexión.");
    return false;
  }
  const groups = new Map();
  pending.forEach(point => {
    if (!groups.has(point.sessionId)) groups.set(point.sessionId, []);
    groups.get(point.sessionId).push(point);
  });
  const remaining = [];
  for (const [sessionId, points] of groups) {
    for (let offset = 0; offset < points.length; offset += 100) {
      const batch = points.slice(offset, offset + 100);
      try {
        await request("tracking-points", { method: "POST", data: { sessionId: Number(sessionId), points: batch.map(({ sessionId: ignored, ...point }) => point) } });
      } catch (error) {
        remaining.push(...points.slice(offset));
        if (activeTracking && String(activeTracking.serverSessionId) === String(sessionId)) {
          showTrackingState(navigator.onLine
            ? `No se pudo sincronizar la ubicación con el servidor. Se conserva en este teléfono para reintentar: ${error.message}`
            : "Sin conexión a Internet. El GPS se guarda en este teléfono y se enviará al recuperar la conexión.");
        }
        break;
      }
    }
  }
  storePendingPoints(remaining);
  if (!remaining.length && activeTracking) showTrackingState("Conexión restablecida. La ruta está sincronizada con el servidor.", false);
  return remaining.length === 0;
}

function showTrackingState(message, isError = false) {
  if (!activeTracking) return;
  const state = document.querySelector(`[data-tracking-state="${activeTracking.assignmentId}"]`);
  if (state) {
    state.textContent = message;
    state.classList.toggle("tracking-live", !isError);
  }
  if (!isAdminPanel && workflowScreen.hidden &&
      (isError || /conexión|sesión|viaje sigue/i.test(message))) {
    showNotice(message, isError);
  }
}

function updateTrackingButtons(assignmentId = activeTracking?.assignmentId) {
  if (!assignmentId) return;
  const card = document.querySelector(`[data-tracking-state="${assignmentId}"]`)?.closest(".assignment-card");
  if (!card) return;
  const tracking = activeTracking?.assignmentId === assignmentId;
  const recording = tracking && Boolean(activeTracking.watchId);
  const sessionReady = tracking && Boolean(activeTracking.serverSessionId);
  const startButton = card.querySelector("[data-tracking-start]");
  const stopButton = card.querySelector("[data-tracking-stop]");
  if (startButton) {
    startButton.hidden = recording;
    startButton.disabled = tracking && (!sessionReady || Boolean(activeTracking.arrivalInProgress));
    startButton.textContent = tracking
      ? "Reanudar GPS"
      : card.closest("#mobilizer-workflow-screen")
        ? startButton.dataset.trackingLeg === "retorno" ? "Iniciar retorno" : "Inicio de viaje"
        : "Iniciar tracking";
  }
  if (stopButton) {
    if (tracking) stopButton.textContent = activeTracking.leg === "retorno" ? "Confirmar regreso" : "Confirmar llegada";
    stopButton.hidden = !sessionReady;
    stopButton.disabled = tracking && Boolean(activeTracking.arrivalInProgress);
  }
  const consent = card.querySelector(`[data-tracking-consent="${assignmentId}"]`);
  if (consent) consent.disabled = tracking;
  card.querySelectorAll("[data-edit-stage]").forEach(button => { button.disabled = tracking; });
}

function showTrackingNotice(message, isError = true, assignmentId = null) {
  if (isAdminPanel) {
    showNotice(message, isError);
    return;
  }
  if (activeTracking) {
    showTrackingState(message, isError);
    return;
  }
  const state = assignmentId
    ? document.querySelector(`[data-tracking-state="${assignmentId}"]`)
    : document.querySelector("[data-tracking-state]");
  if (state) {
    state.textContent = message;
    state.classList.toggle("tracking-live", !isError);
  } else {
    workflowNotice(message, isError);
  }
}

function trackingSnapshot(session) {
  return {
    id: session.localId,
    eventId: String(session.eventId),
    assignmentId: session.assignmentId,
    serverSessionId: session.serverSessionId,
    state: "recording",
    startedAt: session.startedAt,
    points: [...session.points]
  };
}

function trackingLocation(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    speed: position.coords.speed,
    bearing: position.coords.heading,
    simulated: false,
    time: position.timestamp
  };
}

function appendTrackingLocation(location, force = false) {
  const current = activeTracking;
  if (!current) return Promise.resolve();
  const previous = current.points.at(-1);
  if (!force && previous && distanceMeters(previous, location) < POINT_DISTANCE_METERS) return pointSaveChain;
  current.points.push(location);
  const trackingMap = workflowTrackingMaps.get(current.assignmentId)?.map || detailMap;
  if (trackingMap) {
    current.routeLayer = `active-tracking-route-${current.assignmentId}`;
    setMapLine(
      trackingMap,
      current.routeLayer,
      current.points.map(point => [point.longitude, point.latitude]),
      { color: "#bd594e", weight: 4 }
    );
  }
  pointSaveChain = pointSaveChain.then(async () => {
    if (activeTracking !== current) return;
    await saveLocalTrack(trackingSnapshot(current));
    const queued = pendingPoints();
    queued.push({ ...location, sessionId: current.serverSessionId });
    storePendingPoints(queued);
    await flushPendingPoints();
    if (activeTracking === current && !navigator.onLine) {
      showTrackingState("Sin conexión a Internet. El GPS se guarda en este teléfono y se enviará al recuperar la conexión.");
    } else if (activeTracking === current && !pendingPoints().some(point =>
      String(point.sessionId) === String(current.serverSessionId)
    )) {
      showTrackingState("Tracking activo · ubicación sincronizada con el servidor.", false);
    }
    return true;
  }).catch(error => {
    if (activeTracking === current) showTrackingState(`No se pudo guardar una ubicación localmente: ${error.message}`, true);
    console.error("Error guardando el punto de tracking:", error);
    return false;
  });
  return pointSaveChain;
}

function attachTrackingWatch(assignmentId) {
  const current = activeTracking;
  if (!current || current.assignmentId !== assignmentId || current.watchId) return;
  if (!window.isSecureContext || !navigator.geolocation) {
    showTrackingState("Para reanudar el GPS, abre este portal con HTTPS y permite la geolocalización.", true);
    updateTrackingButtons(assignmentId);
    return;
  }
  current.watchId = navigator.geolocation.watchPosition(position => {
    void appendTrackingLocation(trackingLocation(position));
  }, error => {
    if (current.watchId) navigator.geolocation.clearWatch(current.watchId);
    current.watchId = null;
    updateTrackingButtons(assignmentId);
    const message = error.code === 1
      ? "Se denegó el permiso de ubicación. Actívalo en el navegador para reanudar el GPS."
      : error.code === 2
        ? "El teléfono no pudo obtener una señal GPS. Revisa los permisos y la ubicación del dispositivo."
        : "La ubicación tardó demasiado. El viaje sigue abierto; vuelve a intentar reanudar el GPS.";
    showTrackingState(message, true);
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  updateTrackingButtons(assignmentId);
  showTrackingState(navigator.onLine
    ? "GPS activo. Si sales o cierras la página, el navegador puede pausarlo; vuelve a abrir esta movilización para reanudar."
    : "Sin conexión a Internet. El GPS se guarda en este teléfono y se enviará al recuperar la conexión.");
}

async function restoreTrackingSession(event, assignments) {
  if (isAdminPanel || activeTracking) return;
  const assignment = assignments.find(item =>
    (item.trackingSessions || []).some(session => session.estado === "en_curso")
  );
  if (!assignment) return;
  const serverSession = assignment.trackingSessions.find(session => session.estado === "en_curso");
  if (!serverSession) return;
  try {
    let localSession = null;
    try {
      const localSessions = await loadLocalTracks();
      localSession = localSessions.find(session =>
        String(session.serverSessionId) === String(serverSession.id) &&
        session.state === "recording"
      ) || null;
    } catch (error) {
      console.error("No se pudo leer la ruta local para reanudarla:", error);
      showTrackingNotice(`La sesión del servidor sigue activa, pero no se pudo leer la ruta local: ${error.message}`, true, Number(assignment.id));
    }
    const restoredPoints = localSession?.points || (serverSession.points || []).map(point => ({
      latitude: Number(point.latitud),
      longitude: Number(point.longitud),
      accuracy: point.precision_metros === null ? null : Number(point.precision_metros),
      altitude: point.altitud_metros === null ? null : Number(point.altitud_metros),
      speed: point.velocidad_metros_segundo === null ? null : Number(point.velocidad_metros_segundo),
      bearing: point.rumbo_grados === null ? null : Number(point.rumbo_grados),
      simulated: Boolean(Number(point.simulado)),
      time: Date.parse(`${String(point.registrado_en || "").replace(" ", "T")}Z`)
    })).filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    const serverStartedAt = Date.parse(`${String(serverSession.iniciado_en || "").replace(" ", "T")}Z`);
    activeTracking = {
      assignmentId: Number(assignment.id),
      eventId: String(event.id),
      leg: serverSession.tipo === "retorno" ? "retorno" : "ida",
      watchId: null,
      serverSessionId: Number(serverSession.id),
      localId: localSession?.id || crypto.randomUUID(),
      startedAt: Number(localSession?.startedAt) || (Number.isFinite(serverStartedAt) ? serverStartedAt : Date.now()),
      points: restoredPoints,
      routeLayer: null,
      arrivalInProgress: false
    };
    if (!localSession) {
      try {
        await saveLocalTrack(trackingSnapshot(activeTracking));
      } catch (error) {
        console.error("No se pudo crear el registro local para el seguimiento reanudado:", error);
        showTrackingState(`El viaje se reanudó, pero no se pudo guardar una copia local: ${error.message}`, true);
      }
    }
    trackingPoints = [...activeTracking.points];
    updateTrackingButtons(activeTracking.assignmentId);
    const trackingMap = workflowTrackingMaps.get(activeTracking.assignmentId)?.map;
    if (trackingMap && activeTracking.points.length > 1) {
      activeTracking.routeLayer = `active-tracking-route-${activeTracking.assignmentId}`;
      setMapLine(trackingMap, activeTracking.routeLayer, activeTracking.points.map(point => [point.longitude, point.latitude]), {
        color: "#bd594e",
        weight: 4
      });
    }
    if (!navigator.onLine) {
      showTrackingState("Se recuperó tu viaje activo. Sin conexión a Internet: el GPS se guardará en este teléfono y se enviará al volver la conexión.");
    }
    attachTrackingWatch(activeTracking.assignmentId);
  } catch (error) {
    showTrackingNotice(`No se pudo recuperar el seguimiento guardado: ${error.message}`, true, Number(assignment.id));
    console.error("No se pudo recuperar la sesión activa de tracking:", error);
  }
}

async function startTracking(assignmentId, leg = "ida") {
  if (!window.isSecureContext || !navigator.geolocation) {
    showTrackingNotice("Para registrar la ubicación, abre este portal con HTTPS y permite la geolocalización.", true, assignmentId);
    return;
  }
  if (activeTracking) {
    if (activeTracking.assignmentId === assignmentId && !activeTracking.watchId) {
      attachTrackingWatch(assignmentId);
      return;
    }
    showTrackingNotice("Ya hay un viaje activo. Continúa esa movilización antes de iniciar otro.", true, assignmentId);
    return;
  }
  if (!navigator.onLine) {
    showTrackingNotice("Conéctate a Internet para iniciar el viaje. Una vez iniciado, las ubicaciones pueden quedar en cola hasta recuperar la conexión.", true, assignmentId);
    return;
  }
  const card = document.querySelector(`[data-tracking-state="${assignmentId}"]`)?.closest(".assignment-card");
  const checkbox = card?.querySelector(`[data-tracking-consent="${assignmentId}"]`);
  if (leg === "retorno") {
    if (!window.confirm("¿Iniciar el retorno al punto de salida? Se registrará tu ubicación hasta que confirmes tu regreso.")) return;
  } else if (!checkbox?.checked) {
    showTrackingNotice("Confirma el consentimiento informado antes de registrar la ubicación.", true, assignmentId);
    return;
  }
  showNotice("");
  activeTracking = {
    assignmentId,
    eventId: String(activeEvent.id),
    leg,
    watchId: null,
    serverSessionId: null,
    localId: crypto.randomUUID(),
    startedAt: Date.now(),
    points: [],
    routeLayer: null,
    arrivalInProgress: false
  };
  const current = activeTracking;
  showTrackingNotice(leg === "retorno" ? "Iniciando el retorno…" : "Iniciando sesión segura de tracking…", false);
  updateTrackingButtons(assignmentId);
  trackingPoints = [];
  try {
    const result = await request("tracking-start", { method: "POST", data: { assignmentId, consentAccepted: true, leg } });
    if (activeTracking !== current) return;
    current.serverSessionId = result.id;
    await saveLocalTrack(trackingSnapshot(current));
    attachTrackingWatch(assignmentId);
  } catch (error) {
    if (current.serverSessionId) {
      showTrackingNotice(`La sesión se inició, pero no se pudo guardar su estado local: ${error.message}. Vuelve a intentarlo para reanudar.`, true, assignmentId);
      updateTrackingButtons(assignmentId);
    } else {
      activeTracking = null;
      updateTrackingButtons(assignmentId);
      showTrackingNotice(error.message, true, assignmentId);
    }
  }
}

async function stopTracking(assignmentId) {
  if (!activeTracking || activeTracking.assignmentId !== assignmentId || activeTracking.arrivalInProgress) return;
  const returning = activeTracking.leg === "retorno";
  if (!window.confirm(returning
    ? "¿Confirmas que ya regresaste al punto de salida? Se guardará tu ubicación actual como punto final y se cerrará el seguimiento."
    : "¿Confirmas que ya llegaste al destino? Se guardará tu ubicación actual como punto final y se cerrará el seguimiento.")) return;
  const stopped = activeTracking;
  const wasWatching = Boolean(stopped.watchId);
  stopped.arrivalInProgress = true;
  if (stopped.watchId) navigator.geolocation.clearWatch(stopped.watchId);
  stopped.watchId = null;
  updateTrackingButtons();
  showTrackingState(returning ? "Obteniendo ubicación para confirmar el regreso…" : "Obteniendo ubicación para confirmar la llegada…", false);
  try {
    if (!window.isSecureContext || !navigator.geolocation) {
      throw new Error("Para confirmar, abre el portal con HTTPS y permite la geolocalización.");
    }
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, error => {
        reject(new Error(error.code === 1
          ? "Se denegó el permiso de ubicación. Actívalo para registrar el punto de llegada."
          : "No se pudo obtener tu ubicación actual. El viaje sigue activo; vuelve a intentar."));
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    });
    const finalPointSaved = await appendTrackingLocation(trackingLocation(position), true);
    if (!finalPointSaved) throw new Error("No se pudo guardar el punto final en el teléfono. El viaje sigue activo.");
    await flushPendingPoints();
    if (pendingPoints().some(point => String(point.sessionId) === String(stopped.serverSessionId))) {
      throw new Error("No se pudo sincronizar el punto final. Tu viaje sigue activo y se reintentará al recuperar Internet.");
    }
    await request("tracking-stop", {
      method: "POST",
      data: { sessionId: stopped.serverSessionId, arrivalConfirmed: true }
    });
    if (stopped.watchId) navigator.geolocation.clearWatch(stopped.watchId);
    stopped.watchId = null;
    const trackingMap = workflowTrackingMaps.get(assignmentId)?.map || detailMap;
    if (stopped.routeLayer && trackingMap) removeMapLine(trackingMap, stopped.routeLayer);
    activeTracking = null;
    trackingPoints = [];
    await saveLocalTrack({ ...trackingSnapshot(stopped), state: "arrived", endedAt: Date.now() })
      .catch(error => console.error("No se pudo guardar el cierre local de la llegada:", error));
    updateTrackingButtons(assignmentId);
    await openEvent(stopped.eventId);
  } catch (error) {
    stopped.arrivalInProgress = false;
    if (wasWatching) attachTrackingWatch(assignmentId);
    updateTrackingButtons(assignmentId);
    showTrackingNotice(`${returning ? "No se confirmó el regreso; tu retorno sigue activo." : "No se confirmó la llegada; tu viaje sigue activo."} ${error.message}`, true, assignmentId);
    console.error("No se pudo confirmar la llegada del movilizador:", error);
  }
}

async function shareEvent(eventId, button) {
  const url = new URL(isAdminPanel ? "portal.php" : window.location.href, window.location.href);
  url.searchParams.set("event", eventId);
  try {
    if (navigator.share) await navigator.share({ title: "Seguimiento de movilización", url: url.toString() });
    else if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url.toString());
    else window.prompt("Copia este enlace para abrir la actividad:", url.toString());
    button.textContent = navigator.share ? "Compartido" : "Copiado";
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = "Compartir";
    }, 2000);
  } catch (error) {
    if (error.name !== "AbortError") {
      showNotice("No fue posible compartir el enlace.");
      console.error("Error al compartir el enlace:", error);
    }
  }
}

async function initialize() {
  try {
    const session = await request("session");
    csrfToken = session.csrf;
    user = session.user;
    if (!user) {
      showLogin();
      return;
    }
    await enterWorkspace();
  } catch (error) {
    showLogin(`No se pudo conectar con el backend: ${error.message}`);
  }
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showFormMessage(loginMessage, "");
  try {
    const formData = new FormData(loginForm);
    const identityField = isAdminPanel ? "username" : "phone";
    const result = await request("login", {
      method: "POST",
      data: { [identityField]: formData.get(identityField), password: formData.get("password") }
    });
    if ((isAdminPanel && result.user.role !== "admin") || (!isAdminPanel && result.user.role === "admin")) {
      throw new Error(isAdminPanel
        ? "Esta cuenta no tiene acceso al panel administrativo."
        : "Las cuentas administrativas deben ingresar desde el panel administrativo.");
    }
    csrfToken = result.csrf;
    user = result.user;
    loginForm.reset();
    await enterWorkspace();
  } catch (error) {
    showFormMessage(loginMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("logout-button").addEventListener("click", async () => {
  if (activeTracking) {
    showTrackingNotice("Confirma la llegada antes de cerrar sesión; el viaje permanece activo.", true, activeTracking.assignmentId);
    return;
  }
  try {
    const result = await request("logout", { method: "POST" });
    csrfToken = result.csrf;
    user = null;
    showLogin("Sesión cerrada.");
  } catch (error) {
    showNotice(error.message);
  }
});

document.getElementById("workflow-logout-button").addEventListener("click", async () => {
  if (activeTracking) {
    workflowNotice("Confirma la llegada antes de cerrar sesión; el viaje permanece activo.");
    return;
  }
  try {
    const result = await request("logout", { method: "POST" });
    csrfToken = result.csrf;
    user = null;
    destroyWorkflowMaps();
    showLogin("Sesión cerrada.");
  } catch (error) {
    workflowNotice(error.message);
  }
});

document.getElementById("back-to-events").addEventListener("click", () => {
  destroyWorkflowMaps();
  activeEvent = null;
  showPortal();
  if (activeTracking) {
    showNotice("El viaje sigue activo. Al volver a abrir esta movilización, el GPS se reanudará si el navegador lo permite.", false);
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("event");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
});

document.getElementById("new-event-button").addEventListener("click", showEventModal);
eventForm.addEventListener("submit", event => void createEvent(event));
eventForm.elements.namedItem("stateId").addEventListener("change", populateEventMunicipalities);
document.getElementById("event-search").addEventListener("input", renderEvents);
if (isAdminPanel) {
  document.getElementById("system-role-form").addEventListener("submit", event => void saveSystemRole(event));
  document.getElementById("reset-system-role").addEventListener("click", resetSystemRoleForm);
  document.getElementById("system-admin-user-form").addEventListener("submit", event => void saveSystemAdminUser(event));
  document.getElementById("reset-system-admin-user").addEventListener("click", resetSystemAdminUserForm);
  document.getElementById("tracking-presentation-toggle").addEventListener("click", () =>
    setTrackingPresentation(!trackingPresentationActive)
  );
  document.getElementById("tracking-presentation-event-list").addEventListener("click", event => {
    const eventButton = event.target.closest("[data-presentation-event]");
    if (!eventButton) return;
    selectedTrackingEventId = eventButton.dataset.presentationEvent;
    document.getElementById("tracking-event-select").value = selectedTrackingEventId;
    selectedTrackingAssignmentId = "";
    trackingRouteStatus = null;
    trackingRoutedCoordinateKey = "";
    trackingRouteRequestId += 1;
    renderTrackingOverview();
  });
  document.getElementById("tracking-event-select").addEventListener("change", event => {
    selectedTrackingEventId = event.target.value;
    selectedTrackingAssignmentId = "";
    trackingRouteStatus = null;
    trackingRoutedCoordinateKey = "";
    trackingRouteRequestId += 1;
    renderTrackingOverview();
  });
  document.getElementById("tracking-refresh").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadTrackingOverview();
      showNotice("");
    } catch (error) {
      showNotice(error.message);
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("tracking-rider-list").addEventListener("click", event => {
    const rider = event.target.closest("[data-tracking-rider]");
    if (rider) selectTrackingMobilizer(rider.dataset.trackingRider);
  });
  document.getElementById("tracking-show-all").addEventListener("click", showAllTrackingMobilizers);
}
document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    if (trackingPresentationActive) setTrackingPresentation(false);
    showPage(button.dataset.view);
  });
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && trackingPresentationActive) setTrackingPresentation(false);
});
document.getElementById("show-structure-button").addEventListener("click", showStructurePresentation);
document.getElementById("new-structure-user").addEventListener("click", resetStructureForm);
document.getElementById("cancel-structure-user").addEventListener("click", () => {
  document.getElementById("structure-form").hidden = true;
});
document.getElementById("structure-form").addEventListener("submit", event => void saveStructureUser(event));

document.addEventListener("click", event => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) {
    closeButton.closest(".modal-backdrop").hidden = true;
    return;
  }
  if (event.target.classList.contains("modal-backdrop")) {
    event.target.hidden = true;
    return;
  }
  const openButton = event.target.closest("[data-open-event]");
  if (openButton) {
    if (isAdminPanel) void generateEventReport(Number(openButton.dataset.openEvent), openButton, true);
    else void openEvent(openButton.dataset.openEvent);
  }
  const deleteButton = event.target.closest("[data-delete-event]");
  if (deleteButton && isAdminPanel) {
    void deleteEvent(Number(deleteButton.dataset.deleteEvent), deleteButton.dataset.eventName, deleteButton);
    return;
  }
  const shareButton = event.target.closest("[data-share-event]");
  if (shareButton) void shareEvent(shareButton.dataset.shareEvent, shareButton);
  const startButton = event.target.closest("[data-tracking-start]");
  if (startButton) startTracking(Number(startButton.dataset.trackingStart), startButton.dataset.trackingLeg === "retorno" ? "retorno" : "ida");
  const stopButton = event.target.closest("[data-tracking-stop]");
  if (stopButton) void stopTracking(Number(stopButton.dataset.trackingStop));
  const copyLink = event.target.closest("#copy-event-link");
  if (copyLink) void shareEvent(activeEvent.id, copyLink);
  const editTerritory = event.target.closest("[data-edit-territory]");
  if (editTerritory) {
    event.preventDefault();
    editStructureUser(Number(editTerritory.dataset.editTerritory));
  }
  const editSystemRoleButton = event.target.closest("[data-edit-system-role]");
  if (editSystemRoleButton && isAdminPanel) {
    editSystemRole(Number(editSystemRoleButton.dataset.editSystemRole));
  }
  const editSystemUserButton = event.target.closest("[data-edit-system-user]");
  if (editSystemUserButton && isAdminPanel) {
    editSystemAdminUser(Number(editSystemUserButton.dataset.editSystemUser));
  }
  const reportButton = event.target.closest("[data-generate-event-report]");
  if (reportButton && isAdminPanel) {
    void generateEventReport(Number(reportButton.dataset.generateEventReport), reportButton);
    return;
  }
  const addVehicle = event.target.closest("[data-add-vehicle]");
  if (addVehicle) {
    const list = addVehicle.closest(".vehicle-list");
    if (list) {
      if (list.childElementCount >= 20) {
        workflowNotice("Puedes registrar hasta 20 tipos o vehículos en esta movilización.");
      } else {
        addWorkflowVehicleRow(list);
      }
    }
  }
  const locateStart = event.target.closest("[data-use-location]");
  if (locateStart) useWorkflowLocation(Number(locateStart.dataset.useLocation));
  const editStage = event.target.closest("[data-edit-stage]");
  if (editStage) editWorkflowStage(Number(editStage.dataset.editStage), Number(editStage.dataset.stage));
});

document.addEventListener("submit", event => {
  const form = event.target.closest("[data-step-form]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  updateAssignment(form)
    .catch(error => {
      if (form.closest("#mobilizer-workflow-screen")) workflowNotice(error.message);
      else showNotice(error.message);
    })
    .finally(() => { button.disabled = false; });
});

document.addEventListener("change", event => {
  if (event.target.matches('input[type="file"][name="photos"]')) void uploadPhotos(event.target);
  if (event.target.matches("[data-workflow-photo]")) void processWorkflowPhotos(event.target);
  if (event.target.matches("[data-transport-choice]")) {
    const section = document.querySelector(`[data-vehicle-section="${Number(event.target.dataset.transportChoice)}"]`);
    if (section) section.hidden = event.target.value !== "yes";
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") document.querySelectorAll(".modal-backdrop").forEach(modal => { modal.hidden = true; });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && activeTracking) {
    showTrackingState("Página en segundo plano: el navegador puede pausar el GPS. La sesión queda abierta y se reanudará al volver.");
  } else if (!document.hidden && activeTracking) {
    if (!activeTracking.watchId) attachTrackingWatch(activeTracking.assignmentId);
    else showTrackingState("Página activa de nuevo. El viaje sigue abierto; verifica que el GPS esté funcionando.");
  }
});

window.addEventListener("pagehide", () => {
  if (!activeTracking) return;
  if (activeTracking.watchId) navigator.geolocation.clearWatch(activeTracking.watchId);
  activeTracking.watchId = null;
  void saveLocalTrack(trackingSnapshot(activeTracking)).catch(error => {
    console.error("No se pudo guardar la sesión antes de salir de la página:", error);
  });
});

window.addEventListener("pageshow", () => {
  if (activeTracking && !activeTracking.watchId) attachTrackingWatch(activeTracking.assignmentId);
});

window.addEventListener("offline", () => {
  if (activeTracking) {
    showTrackingState("Sin conexión a Internet. El GPS se guarda en este teléfono y se enviará al recuperar la conexión.");
  }
});

window.addEventListener("online", () => {
  if (activeTracking) showTrackingState("Conexión restablecida. Sincronizando las ubicaciones guardadas…", false);
  void flushPendingPoints();
});
window.setInterval(() => {
  if (activeTracking) void flushPendingPoints();
}, 30000);

window.setInterval(() => {
  if (isAdminPanel && currentPortalPage === "tracking" && !portalScreen.hidden) {
    void loadTrackingOverview().catch(error => showNotice(error.message));
  }
}, 15000);

initialize();
