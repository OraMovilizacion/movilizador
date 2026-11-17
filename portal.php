<?php
declare(strict_types=1);

$portalMode = $portalMode ?? 'mobilizer';
$adminPanel = $portalMode === 'admin';
$manifestPath = __DIR__ . '/dist/.vite/manifest.json';
$entry = null;
if (is_file($manifestPath)) {
    $manifest = json_decode((string) file_get_contents($manifestPath), true);
    if (is_array($manifest)) {
        $entry = $manifest['src/portal.js'] ?? null;
    }
}
$assetScript = is_array($entry) && isset($entry['file']) ? 'dist/' . $entry['file'] : null;
$assetStyle = is_array($entry) && !empty($entry['css'][0]) ? 'dist/' . $entry['css'][0] : null;
// Si el manifest quedó desactualizado (p. ej. no se copió la carpeta oculta dist/.vite),
// se usan los archivos portal-*.js / portal-*.css más recientes de dist/assets.
foreach (['assetScript' => 'js', 'assetStyle' => 'css'] as $variable => $extension) {
    $files = glob(__DIR__ . '/dist/assets/portal-*.' . $extension) ?: [];
    if ($files) {
        usort($files, static fn(string $a, string $b): int => filemtime($b) <=> filemtime($a));
        $current = $$variable !== null ? __DIR__ . '/' . $$variable : null;
        if ($current === null || !is_file($current) || filemtime($files[0]) > filemtime($current)) {
            $$variable = 'dist/assets/' . basename($files[0]);
        }
    }
}
// Los archivos con nombre fijo (dist/assets/portal.js y portal.css) tienen prioridad: así un manifest
// viejo o archivos con hash antiguos que sigan en el servidor nunca hacen cargar una versión anterior.
foreach (['assetScript' => 'portal.js', 'assetStyle' => 'portal.css'] as $variable => $fixedName) {
    if (is_file(__DIR__ . '/dist/assets/' . $fixedName)) {
        $$variable = 'dist/assets/' . $fixedName;
    }
}
// Versión por fecha de modificación para que el navegador no use una copia en caché.
foreach (['assetScript', 'assetStyle'] as $variable) {
    if ($$variable !== null) {
        $file = __DIR__ . '/' . $$variable;
        $$variable = htmlspecialchars($$variable . (is_file($file) ? '?v=' . filemtime($file) : ''), ENT_QUOTES, 'UTF-8');
    }
}
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org https://router.project-osrm.org https://nominatim.openstreetmap.org; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0c1018">
  <link rel="icon" type="image/svg+xml" href="assets/icons/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="assets/icons/favicon-32.png">
  <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
  <title><?= $adminPanel ? 'Panel administrativo ORA' : 'Portal de movilización ORA' ?></title>
  <?php if ($assetStyle !== null): ?>
    <link rel="stylesheet" href="<?= $assetStyle ?>">
  <?php endif; ?>
  <?php if ($assetScript !== null): ?>
    <script type="module" src="<?= $assetScript ?>"></script>
  <?php endif; ?>
</head>
<body data-portal-mode="<?= $adminPanel ? 'admin' : 'mobilizer' ?>">
  <?php if ($assetScript === null): ?>
    <main class="setup-notice">
      <h1>Portal pendiente de compilación</h1>
      <p>Ejecuta <code>npm install</code> y <code>npm run build</code> en la carpeta del proyecto.</p>
    </main>
  <?php else: ?>
    <main id="login-screen" class="login-layout" hidden>
            <section class="login-panel">
        <img class="ora-logo login-logo" src="assets/img/ora-logo-transparent.png" alt="ORA — Organización Renovadora Auténtica">
        <section class="login-card">
          <h1>Iniciar sesión</h1>
          <p class="login-lead"><?= $adminPanel ? 'Entra con tu usuario del panel administrativo.' : 'Entra con tu número de teléfono.' ?></p>
          <form id="login-form" aria-label="<?= $adminPanel ? 'Acceso administrativo' : 'Acceso de movilizadores' ?>">
            <label for="login-identity"><?= $adminPanel ? 'Nombre de usuario' : 'Número de teléfono' ?></label>
            <input id="login-identity" name="<?= $adminPanel ? 'username' : 'phone' ?>" type="<?= $adminPanel ? 'text' : 'tel' ?>" autocomplete="username" <?= $adminPanel ? 'maxlength="80" autocapitalize="none" spellcheck="false"' : 'inputmode="tel" maxlength="20"' ?> required>
            <label for="login-password">Contraseña</label>
            <input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="1024" required>
            <p class="form-message" id="login-message" role="alert"></p>
            <button class="button primary wide" type="submit">Entrar</button>
          </form>
        </section>
      </section>
    </main>

    <main id="portal-screen" class="portal-shell" hidden>
      <aside class="sidebar">
        <a class="brand" href="<?= $adminPanel ? 'index.php' : 'portal.php' ?>">
          <img class="ora-logo sidebar-logo" src="assets/img/ora-logo-transparent.png" alt="ORA — Organización Renovadora Auténtica">
          <span><strong>Movilizaciones</strong><small><?= $adminPanel ? 'Administración' : 'Portal operativo' ?></small></span>
        </a>
        <p class="nav-caption"><?= $adminPanel ? 'Administración' : 'Mi espacio' ?></p>
        <?php if ($adminPanel): ?>
          <button class="nav-item active" type="button" data-view="tracking" data-module-nav="tracking"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg></span> Seguimiento</button>
          <button class="nav-item" type="button" data-view="events" data-module-nav="events"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg></span> Movilizaciones</button>
          <button class="nav-item" type="button" data-view="reports" data-module-nav="reports"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg></span> Reporte</button>
          <button class="nav-item" id="structure-nav-item" type="button" data-view="structure" data-module-nav="structure"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5H5v5M12 11.5h7v5"/></svg></span> Estructura</button>
          <button class="nav-item" type="button" data-view="settings" data-module-nav="settings"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg></span> Configuración</button>
        <?php else: ?>
          <button class="nav-item active" type="button" data-view="events"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg></span> Mis movilizaciones</button>
        <?php endif; ?>
        <div class="sidebar-bottom">
          <div class="profile-card">
            <span class="avatar" id="user-avatar">US</span>
            <span class="profile-text"><strong id="user-name">Usuario</strong>            <small id="user-role"><?= $adminPanel ? 'Administración' : 'Responsable' ?></small></span>
          </div>
          <button class="nav-item logout" id="logout-button" type="button"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/></svg></span> Cerrar sesión</button>
        </div>
      </aside>

      <section class="main-content">
        <header class="topbar"><span class="breadcrumb"><?= $adminPanel ? 'Administración' : 'Portal' ?> <span>/</span> <strong id="current-page-label"><?= $adminPanel ? 'Seguimiento' : 'Mis movilizaciones' ?></strong></span><span class="today" id="today-label"></span></header>
        <?php if (!$adminPanel): ?>
        <div class="mobilizer-bar" id="mobilizer-bar">
          <span class="mobilizer-id">
            <span class="avatar" id="bar-avatar">US</span>
            <span class="mobilizer-id-text"><strong id="bar-name">Usuario</strong><span class="state-chip" id="bar-state">Estado</span></span>
          </span>
          <button class="button secondary" id="bar-logout-button" type="button">Cerrar sesión</button>
        </div>
        <?php endif; ?>
        <section class="page-heading">
          <div><?php if (!$adminPanel): ?><p class="eyebrow">Panel de trabajo</p><?php endif; ?><h1><span id="heading-name"><?= $adminPanel ? 'Seguimiento en vivo' : 'Movilizaciones disponibles' ?></span></h1><p class="subtle" id="heading-description"><?= $adminPanel ? 'Ubicación y avance de los movilizadores en ruta.' : 'Selecciona una movilización para completar los pasos y registrar tu viaje.' ?></p></div>
          <button class="button primary" id="new-event-button" type="button" hidden>+ Nueva movilización</button>
        </section>
        <?php if ($adminPanel): ?>
        <section class="tracking-view" id="tracking-view" data-page="tracking">
          <div class="notice warning" id="tracking-notice" role="status" hidden></div>
          <div class="tracking-toolbar">
            <label class="tracking-event-picker">Movilización activa
              <select id="tracking-event-select" aria-label="Seleccionar movilización activa"></select>
            </label>
            <button class="button secondary" id="tracking-refresh" type="button">Actualizar</button>
            <button class="button primary" id="tracking-presentation-toggle" type="button" aria-pressed="false">Modo presentación</button>
            <span class="tracking-updated" id="tracking-updated-at">Esperando datos…</span>
          </div>
          <div class="tracking-layout">
            <div class="tracking-map-panel">
              <div class="tracking-map-frame" id="tracking-overview-map"></div>
              <p class="tracking-map-note"><span class="tracking-legend"><i class="legend-live"></i> Señal recibida</span><span class="tracking-legend"><i class="legend-estimated"></i> Avance estimado (solo antes de recibir señal)</span><span class="tracking-legend"><i class="legend-walked"></i> Ruta de ida</span><span class="tracking-legend"><i class="legend-return"></i> Ruta de retorno</span>Toca el ✓ de un movilizador que llegó para ver todo el recorrido que hizo.</p>
            </div>
            <aside class="tracking-sidebar">
              <section class="tracking-presentation-events">
                <div class="tracking-panel-heading"><div><h2>Movilizaciones activas</h2><p id="tracking-event-count">0 eventos</p></div></div>
                <div id="tracking-presentation-event-list" class="tracking-presentation-event-list"></div>
              </section>
              <div class="tracking-panel-heading"><div><button class="tracking-overview-title" id="tracking-show-all" type="button" aria-label="Mostrar todos los movilizadores en el mapa"><h2>Movilizadores en ruta</h2></button><p id="tracking-rider-count">Sin seguimiento activo</p></div><span class="tracking-live-dot" aria-hidden="true"></span></div>
              <div id="tracking-rider-list" class="tracking-rider-list"></div>
              <div id="tracking-rider-detail" class="tracking-rider-detail">
                <div class="empty-state">Selecciona un punto del mapa o un movilizador para ver su ruta y registro.</div>
              </div>
            </aside>
          </div>
          <div id="tracking-empty" class="empty-state tracking-empty" hidden></div>
        </section>
        <?php endif; ?>
        <div id="events-view" data-page="events" <?= $adminPanel ? 'hidden' : '' ?>>
        <div class="notice warning" id="events-notice" role="status" hidden></div>
        <section class="section">
          <div class="section-heading"><div><p><?= $adminPanel ? 'Abre una actividad para revisar registros territoriales y tracking.' : 'Todas las movilizaciones están disponibles para los movilizadores registrados.' ?></p></div><input id="event-search" class="search-input" type="search" placeholder="Buscar movilización…" aria-label="Buscar movilización"></div>
          <div id="events-list" class="event-grid"></div>
          <div class="empty-state" id="events-empty" hidden>No hay movilizaciones para mostrar. Cuando se te asigne una actividad aparecerá aquí.</div>
        </section>
        </div>
        <section class="section" id="structure-view" data-page="structure" hidden>
          <div class="section-heading structure-heading">
            <div class="structure-actions">
              <button class="button secondary" id="show-structure-button" type="button">Mostrar Estructura</button>
              <button class="button primary" id="new-structure-user" type="button">+ Nuevo movilizador</button>
            </div>
          </div>
          <div class="notice warning" id="structure-notice" role="status" hidden></div>
          <div id="structure-tree" class="structure-tree"></div>
          <form id="structure-form" class="structure-form" hidden>
            <div class="route-heading"><div><h3 id="structure-form-title">Cuenta de movilizador</h3><p>El teléfono sirve para iniciar sesión. La contraseña la define administración.</p></div></div>
            <input name="userId" type="hidden">
            <div class="field-grid">
              <label class="field">Nombre completo<input name="name" maxlength="140" required></label>
              <label class="field">Teléfono<input name="phone" type="tel" inputmode="tel" maxlength="20" required placeholder="+58 412 1234567"></label>
              <label class="field">Correo (opcional)<input name="email" type="email" maxlength="190"></label>
              <label class="field">Unidad territorial<select name="territoryId" required></select></label>
              <label class="field">Contraseña inicial / nueva<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="1024"></label>
              <label class="field">Acceso<select name="active"><option value="1">Activo</option><option value="0">Desactivado</option></select></label>
            </div>
            <p class="subtle" id="structure-password-help">Mínimo 8 caracteres. Al editar, déjala vacía para conservar la contraseña actual.</p>
            <p class="form-message" id="structure-message" role="alert"></p>
            <div class="dialog-actions"><button class="button secondary" id="cancel-structure-user" type="button">Cancelar</button><button class="button primary" id="save-structure-user" type="submit">Guardar cuenta</button></div>
          </form>
        </section>
        <?php if ($adminPanel): ?>
        <section class="section settings-view" id="settings-view" data-page="settings" hidden>
          <div class="section-heading">
            <div><h2>Configuración del sistema</h2><p>Crea usuarios administrativos y limita sus acciones por módulo.</p></div>
          </div>
          <div class="notice warning" id="settings-notice" role="status" hidden></div>
          <div class="settings-grid">
            <section class="settings-panel">
              <h3>Roles y permisos</h3>
              <p class="subtle">Cada módulo habilitado permite ver y utilizar sus funciones.</p>
              <form id="system-role-form" class="settings-form">
                <input name="roleId" type="hidden">
                <label class="field">Nombre del rol<input name="name" maxlength="80" required></label>
                <label class="field">Descripción (opcional)<textarea name="description" rows="2" maxlength="255"></textarea></label>
                <fieldset class="settings-modules">
                  <legend>Módulos permitidos</legend>
                  <label><input type="checkbox" name="modules" value="tracking"> Seguimiento</label>
                  <label><input type="checkbox" name="modules" value="events"> Movilizaciones</label>
                  <label><input type="checkbox" name="modules" value="structure"> Estructura</label>
                  <label><input type="checkbox" name="modules" value="reports"> Reportes</label>
                  <label><input type="checkbox" name="modules" value="settings"> Configuración</label>
                </fieldset>
                <p class="form-message" id="system-role-message" role="alert"></p>
                <div class="dialog-actions">
                  <button class="button secondary" id="reset-system-role" type="button">Limpiar</button>
                  <button class="button primary" id="save-system-role" type="submit">Guardar rol</button>
                </div>
              </form>
              <div id="system-roles-list" class="settings-list" aria-live="polite"></div>
            </section>
            <section class="settings-panel">
              <h3>Usuarios administrativos</h3>
              <p class="subtle">Crea cuentas para ingresar al panel con usuario y contraseña.</p>
              <form id="system-admin-user-form" class="settings-form">
                <input name="userId" type="hidden">
                <label class="field">Nombre completo<input name="name" maxlength="140" required></label>
                <label class="field">Nombre de usuario<input name="username" maxlength="80" pattern="[A-Za-z0-9._+\(\)\-]{3,80}" autocomplete="username" required></label>
                <label class="field">Contraseña inicial / nueva<input name="password" type="password" minlength="8" maxlength="1024" autocomplete="new-password" required></label>
                <label class="field">Rol<select name="roleId" required><option value="">Selecciona un rol</option></select></label>
                <label class="field">Acceso<select name="active"><option value="1">Activo</option><option value="0">Desactivado</option></select></label>
                <p class="subtle" id="system-admin-password-help">Define una contraseña de al menos 8 caracteres.</p>
                <p class="form-message" id="system-admin-user-message" role="alert"></p>
                <div class="dialog-actions">
                  <button class="button secondary" id="reset-system-admin-user" type="button">Limpiar</button>
                  <button class="button primary" id="save-system-admin-user" type="submit">Crear usuario</button>
                </div>
              </form>
              <div id="system-admin-users-list" class="settings-list" aria-live="polite"></div>
            </section>
          </div>
        </section>
        <section class="section reports-view" id="reports-view" data-page="reports" hidden>
          <div class="notice warning" id="reports-notice" role="status" hidden></div>
          <div id="report-events-list" class="report-events-list" aria-live="polite">
            <p class="settings-empty">Cargando movilizaciones…</p>
          </div>
        </section>
        <?php endif; ?>
      </section>
    </main>

    <main id="mobilizer-workflow-screen" class="mobilizer-workflow-screen" hidden>
      <header class="workflow-topbar">
        <img class="ora-logo" src="assets/img/ora-logo-transparent.png" alt="ORA — Organización Renovadora Auténtica">
        <div class="workflow-topbar-actions">
          <button class="button secondary" id="back-to-events" type="button">← Movilizaciones</button>
          <button class="button secondary" id="workflow-logout-button" type="button">Cerrar sesión</button>
        </div>
      </header>
      <section class="workflow-page-heading">
        <p class="workflow-user"><strong id="workflow-user-name">Usuario</strong><span class="state-chip" id="workflow-user-state">Estado</span></p>
        <p class="eyebrow">Registro de movilización</p>
        <h1 id="workflow-event-title"></h1>
        <p class="subtle" id="workflow-event-meta"></p>
      </section>
      <div id="workflow-notice" class="workflow-notice" role="status" hidden></div>
      <div id="mobilizer-workflow-content"></div>
    </main>

    <div class="modal-backdrop" id="event-modal" hidden>
      <section class="dialog event-dialog" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
        <header class="dialog-header"><div><p class="eyebrow">Nueva actividad</p><h2 id="event-dialog-title">Crear movilización</h2></div><button class="icon-button" type="button" data-close-dialog aria-label="Cerrar">×</button></header>
        <form id="event-form" class="dialog-body">
          <div class="field-grid">
            <label class="field full">Nombre de la actividad<input name="name" maxlength="140" required placeholder="Jornada de atención comunitaria"></label>
            <label class="field">Fecha<input name="date" type="date" required></label>
            <label class="field">Hora del evento<input name="eventTime" type="time"></label>
            <label class="field">Personas estimadas a movilizar<input name="estimatedPeople" type="number" min="0" max="1000000" step="1" required></label>
            <label class="field">Entidad federal<select name="stateId" required><option value="">Selecciona una entidad federal</option></select></label>
            <label class="field">Municipio<select name="territoryId" required disabled><option value="">Selecciona primero un estado</option></select></label>
            <label class="field">Lugar de la actividad<input name="location" maxlength="180" required placeholder="Municipio o sector"></label>
            <label class="field full">Descripción<textarea name="description" rows="2" maxlength="5000" placeholder="Objetivo o instrucciones para los responsables"></textarea></label>
          </div>
          <div class="route-heading"><div><h3>Punto de llegada</h3><p>Marca el destino de la movilización. Cada movilizador indicará su punto de partida para calcular su ruta.</p></div></div>
          <div class="route-fields">
            <label class="field">Destino de la movilización<input name="endName" required maxlength="180" placeholder="Selecciona el destino en el mapa" readonly></label>
          </div>
          <input name="endLat" type="hidden">
          <input name="endLng" type="hidden">
          <div class="map-toolbar">
            <span class="subtle">Toca el mapa para marcar el destino.</span>
          </div>
          <div class="map-frame" id="route-map" aria-label="Mapa para marcar el punto de llegada"></div>
          <p class="form-message" id="event-message" role="alert"></p>
          <div class="dialog-actions"><button class="button secondary" type="button" data-close-dialog>Cancelar</button><button class="button primary" type="submit" id="save-event">Guardar movilización</button></div>
        </form>
      </section>
    </div>

    <div class="modal-backdrop" id="detail-modal" hidden>
      <section class="dialog detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header class="dialog-header"><div><p class="eyebrow">Seguimiento de actividad</p><h2 id="detail-title"></h2></div><button class="icon-button" type="button" data-close-dialog aria-label="Cerrar">×</button></header>
        <div class="dialog-body" id="detail-body"></div>
      </section>
    </div>
  <?php endif; ?>
</body>
</html>
