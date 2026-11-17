<?php
// Diagnóstico temporal: súbelo a la raíz del proyecto, ábrelo en el navegador y BÓRRALO después.
header('Content-Type: text/plain; charset=utf-8');
$dir = __DIR__ . '/dist/assets';
echo "Carpeta: $dir\n\n";
foreach (glob($dir . '/portal*.{js,css}', GLOB_BRACE) ?: [] as $file) {
    $text = (string) file_get_contents($file);
    printf("%-28s %8d bytes  modificado %s\n", basename($file), filesize($file), date('Y-m-d H:i:s', filemtime($file)));
    if (substr($file, -3) === '.js') {
        echo "   contiene 'bar-logout-button': ", strpos($text, 'bar-logout-button') !== false ? 'SI' : 'NO', "\n";
        echo "   contiene 'territoryName'    : ", strpos($text, 'territoryName') !== false ? 'SI' : 'NO', "\n";
    } else {
        echo "   contiene '.mobilizer-bar'   : ", strpos($text, 'mobilizer-bar') !== false ? 'SI' : 'NO', "\n";
    }
}
$manifest = __DIR__ . '/dist/.vite/manifest.json';
echo "\nmanifest.json: ", is_file($manifest) ? "existe\n" . file_get_contents($manifest) : "NO existe", "\n";
$portal = (string) @file_get_contents(__DIR__ . '/portal.php');
echo "\nportal.php tiene barra nueva (bar-logout-button): ", strpos($portal, 'bar-logout-button') !== false ? 'SI' : 'NO', "\n";
echo "portal.php usa nombres fijos (portal.js): ", strpos($portal, "'portal.js'") !== false ? 'SI' : 'NO', "\n";
