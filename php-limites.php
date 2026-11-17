<?php
// Archivo temporal de diagnóstico. Súbelo a la raíz del proyecto, ábrelo en el navegador y BÓRRALO después.
header('Content-Type: text/plain; charset=utf-8');
foreach (['upload_max_filesize', 'post_max_size', 'max_file_uploads', 'memory_limit', 'file_uploads', 'upload_tmp_dir'] as $k) {
    echo str_pad($k, 22), ini_get($k) ?: '(vacío)', "\n";
}
echo str_pad('SAPI', 22), PHP_SAPI, "\n";
echo str_pad('php.ini cargado', 22), php_ini_loaded_file() ?: '(ninguno)', "\n";
echo str_pad('ini adicionales', 22), php_ini_scanned_files() ?: '(ninguno)', "\n";
echo str_pad('versión PHP', 22), PHP_VERSION, "\n";
