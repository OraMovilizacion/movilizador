<?php
declare(strict_types=1);

// Completa las rutas por calle de las listas cargadas con
// migrations/20261201_listas_asistencia.sql (sesiones «carga-manual»).
// Uso: php scripts/rutas_listas.php
// Necesita salida a internet (usa el servicio público OSRM).

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/db.php';

$pdo = database(load_config());
$rows = $pdo->query(
    "SELECT ts.id AS sesion_id, ts.iniciado_en, ts.llegada_confirmada_en, me.id AS me_id, " .
    "me.punto_salida_lat AS slat, me.punto_salida_lng AS slng, me.punto_llegada_lat AS elat, me.punto_llegada_lng AS elng " .
    "FROM tracking_sesiones ts JOIN movilizacion_entes me ON me.id = ts.movilizacion_ente_id " .
    "WHERE ts.consentimiento_version = 'carga-manual' AND me.punto_salida_lat IS NOT NULL AND me.punto_llegada_lat IS NOT NULL"
)->fetchAll();

foreach ($rows as $row) {
    $url = sprintf(
        'https://router.project-osrm.org/route/v1/driving/%s,%s;%s,%s?overview=full&geometries=geojson&steps=false',
        $row['slng'], $row['slat'], $row['elng'], $row['elat']
    );
    $context = stream_context_create(['http' => ['timeout' => 20, 'header' => "User-Agent: movilizador-rutas\r\n"]]);
    $body = @file_get_contents($url, false, $context);
    $data = $body ? json_decode($body, true) : null;
    $route = $data['routes'][0] ?? null;
    if (!$route || empty($route['geometry']['coordinates'])) {
        fwrite(STDERR, "Sin ruta para la sesión {$row['sesion_id']}; se mantiene la línea recta.\n");
        continue;
    }
    $coordinates = $route['geometry']['coordinates'];
    $step = max(1, (int) ceil(count($coordinates) / 150));
    $sample = [];
    foreach ($coordinates as $index => $point) {
        if ($index % $step === 0) $sample[] = $point;
    }
    $last = end($coordinates);
    if (end($sample) !== $last) $sample[] = $last;

    $pdo->beginTransaction();
    $pdo->prepare('UPDATE movilizacion_entes SET ruta_personal_geojson = ?, ruta_personal_distancia_metros = ?, ruta_personal_duracion_segundos = ? WHERE id = ?')
        ->execute([json_encode(['type' => 'LineString', 'coordinates' => $coordinates]), (int) $route['distance'], (int) $route['duration'], $row['me_id']]);
    $pdo->prepare('DELETE FROM tracking_puntos WHERE tracking_sesion_id = ?')->execute([$row['sesion_id']]);
    $start = strtotime((string) $row['iniciado_en']);
    $end = strtotime((string) $row['llegada_confirmada_en']);
    $insert = $pdo->prepare('INSERT INTO tracking_puntos (tracking_sesion_id, secuencia, latitud, longitud, simulado, registrado_en) VALUES (?, ?, ?, ?, 1, ?)');
    $total = max(1, count($sample) - 1);
    foreach ($sample as $i => $point) {
        $insert->execute([$row['sesion_id'], $i + 1, $point[1], $point[0], date('Y-m-d H:i:s', (int) ($start + ($end - $start) * $i / $total))]);
    }
    $pdo->commit();
    echo "Sesión {$row['sesion_id']}: ruta de " . round($route['distance'] / 1000, 1) . " km con " . count($sample) . " puntos.\n";
    sleep(1);
}
