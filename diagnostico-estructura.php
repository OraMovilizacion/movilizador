<?php
// Diagnóstico temporal: súbelo a la raíz del proyecto, ábrelo en el navegador y BÓRRALO después.
header('Content-Type: text/plain; charset=utf-8');
echo "== Archivos compilados (dist/assets) ==\n";
$newest = null;
foreach (glob(__DIR__ . '/dist/assets/portal*.{js,css}', GLOB_BRACE) ?: [] as $file) {
    $text = (string) file_get_contents($file);
    $mtime = filemtime($file);
    printf("%-30s %8d bytes  modificado %s\n", basename($file), filesize($file), date('Y-m-d H:i:s', $mtime));
    if (substr($file, -3) === '.js') {
        $ok = strpos($text, 'parishes-import') !== false && strpos($text, 'data-open-org') !== false;
        echo "   JS con organizaciones/parroquias: ", $ok ? "SI" : "NO (es una versión vieja)", "\n";
        if ($newest === null || $mtime > $newest[1]) { $newest = [basename($file), $mtime, $ok]; }
    }
}
echo "\nJS que carga el portal (el más reciente): ", $newest ? $newest[0] . ($newest[2] ? "  -> ES LA NUEVA" : "  -> ES VIEJA") : "ninguno", "\n";
$api = (string) @file_get_contents(__DIR__ . '/api.php');
$portal = (string) @file_get_contents(__DIR__ . '/portal.php');
echo "\napi.php nuevo (organizaciones): ", strpos($api, 'organizaciones') !== false ? 'SI' : 'NO', "\n";
echo "portal.php nuevo (structure-orgs): ", strpos($portal, 'structure-orgs') !== false ? 'SI' : 'NO', "\n";
require __DIR__ . '/db.php';
try {
    $pdo = database(load_config());
    echo "\n== Base de datos ==\n";
    echo "organizaciones: ", $pdo->query('SELECT COUNT(*) FROM organizaciones')->fetchColumn(), "\n";
    foreach ($pdo->query('SELECT nivel, COUNT(*) c FROM unidades_territoriales GROUP BY nivel') as $r) { echo $r['nivel'], ': ', $r['c'], "\n"; }
    $col = $pdo->query("SHOW COLUMNS FROM usuarios LIKE 'organizacion_id'")->fetch();
    echo "usuarios.organizacion_id: ", $col ? 'existe' : 'NO EXISTE (falta la migración 20261129)', "\n";
} catch (Throwable $e) { echo "\nBD: ", $e->getMessage(), "\n"; }
