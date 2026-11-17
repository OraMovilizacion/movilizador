<?php
declare(strict_types=1);

// Cierre de sesión del movilizador sin depender de JavaScript.
// Recibe un POST desde el botón «Cerrar sesión» de portal.php.
require_once __DIR__ . '/db.php';

$isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off';
session_name('movilizaciones_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax'
]);
session_start();

function go(string $target): never
{
    header('Location: ' . $target, true, 303);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    go('portal.php');
}
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && strcasecmp((string) parse_url($origin, PHP_URL_HOST), explode(':', (string) ($_SERVER['HTTP_HOST'] ?? ''))[0]) !== 0) {
    go('portal.php');
}

$userId = (int) ($_SESSION['user']['id'] ?? 0);
if ($userId > 0 && ($_POST['forzar'] ?? '') !== '1') {
    try {
        $pdo = database(load_config());
        $active = $pdo->prepare(
            "SELECT 1 FROM tracking_sesiones ts JOIN movilizacion_entes me ON me.id = ts.movilizacion_ente_id " .
            "WHERE me.responsable_usuario_id = ? AND ts.estado = 'en_curso' LIMIT 1"
        );
        $active->execute([$userId]);
        if ($active->fetchColumn()) {
            go('portal.php?aviso=viaje');
        }
    } catch (Throwable $error) {
        error_log('Movilizaciones logout check: ' . $error->getMessage());
    }
}

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600,
        'path' => $params['path'],
        'secure' => $params['secure'],
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}
session_destroy();
go('portal.php');
