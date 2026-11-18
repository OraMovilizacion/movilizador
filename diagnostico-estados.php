<?php
// Diagnóstico temporal: súbelo a la raíz del proyecto, ábrelo en el navegador y BÓRRALO después.
header('Content-Type: text/plain; charset=utf-8');
require_once __DIR__ . '/db.php';
echo "1) Archivos del servidor\n";
echo "   api.php tiene la consulta 'territories': ", strpos((string) @file_get_contents(__DIR__ . '/api.php'), "'territories'") !== false ? 'SI' : 'NO (api.php viejo)', "\n";
foreach (glob(__DIR__ . '/dist/assets/portal*.js') ?: [] as $file) {
    printf("   %s (%s): ensureEventTerritories %s\n", basename($file), date('Y-m-d H:i', filemtime($file)),
        strpos((string) file_get_contents($file), 'territories') !== false && strpos((string) file_get_contents($file), 'No hay entidades federales') !== false ? 'SI' : 'NO (js viejo)');
}
echo "\n2) Base de datos: unidades territoriales por nivel\n";
try {
    $pdo = database(load_config());
    foreach ($pdo->query("SELECT nivel, COUNT(*) AS total, SUM(activo = 1) AS activas FROM unidades_territoriales GROUP BY nivel") as $row) {
        echo "   {$row['nivel']}: {$row['total']} (activas: {$row['activas']})\n";
    }
    echo "\n   Estados cargados:\n";
    foreach ($pdo->query("SELECT codigo, nombre, activo FROM unidades_territoriales WHERE nivel = 'estadal' ORDER BY nombre") as $row) {
        echo "   {$row['codigo']} {$row['nombre']} activo={$row['activo']}\n";
    }
} catch (Throwable $error) {
    echo "   ERROR: ", $error->getMessage(), "\n";
}
