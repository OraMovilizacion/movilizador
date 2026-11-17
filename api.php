<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
require_once __DIR__ . '/db.php';

const ADMIN_MODULES = ['tracking', 'events', 'reports', 'structure', 'settings'];

function respond(array $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 64);
}

function csrf_token(): string
{
    if (!isset($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function require_csrf(): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf'] ?? '';
    if (!is_string($provided) || !is_string($expected) || $expected === '' || !hash_equals($expected, $provided)) {
        respond(['error' => 'La sesión del formulario expiró. Recarga la página e inténtalo otra vez.'], 419);
    }
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        respond(['error' => 'Inicia sesión para continuar.'], 401);
    }
    return $user;
}

function require_admin(array $user): void
{
    if ($user['role'] !== 'admin') {
        respond(['error' => 'No tienes permiso para realizar esta acción.'], 403);
    }
}

function require_module(array $user, string $module): void
{
    if ($user['role'] !== 'admin' || !in_array($module, $user['modules'] ?? [], true)) {
        respond(['error' => 'Tu rol no tiene acceso a este módulo.'], 403);
    }
}

function public_user(PDO $pdo, array $account): array
{
    $roleId = $account['rol_sistema_id'] === null ? null : (int) $account['rol_sistema_id'];
    $isSuperadmin = $account['rol'] === 'admin' &&
        strcasecmp((string) $account['nombre_usuario'], 'admin') === 0 &&
        $roleId === null;
    $modules = [];
    if ($isSuperadmin) {
        $modules = ADMIN_MODULES;
    } elseif ($account['rol'] === 'admin' && $roleId !== null) {
        $statement = $pdo->prepare(
            'SELECT modulo FROM roles_sistema_modulos WHERE rol_sistema_id = ? ORDER BY modulo'
        );
        $statement->execute([$roleId]);
        $modules = $statement->fetchAll(PDO::FETCH_COLUMN);
    }
    return [
        'id' => (int) $account['id'],
        'name' => $account['nombre'],
        'username' => $account['nombre_usuario'],
        'email' => $account['correo'],
        'phone' => $account['telefono'],
        'role' => $account['rol'],
        'roleName' => $isSuperadmin ? 'Superadministrador' : ($account['rol_sistema_nombre'] ?? 'Responsable'),
        'superadmin' => $isSuperadmin,
        'modules' => $modules,
        'territoryId' => $account['unidad_territorial_id'] === null ? null : (int) $account['unidad_territorial_id']
    ];
}

function role_modules(PDO $pdo, int $roleId): array
{
    $statement = $pdo->prepare(
        'SELECT modulo FROM roles_sistema_modulos WHERE rol_sistema_id = ? ORDER BY modulo'
    );
    $statement->execute([$roleId]);
    return $statement->fetchAll(PDO::FETCH_COLUMN);
}

function can_manage_modules(array $requestedModules, array $user): bool
{
    return !array_diff($requestedModules, $user['modules'] ?? []);
}

function normalize_phone(string $value): string
{
    $phone = preg_replace('/[\s().-]+/', '', trim($value));
    if (!is_string($phone)) {
        return '';
    }

    return preg_match('/^\+?\d{7,20}$/', $phone) ? $phone : '';
}

function require_assignment_access(PDO $pdo, array $user, int $assignmentId, string $message): array
{
    $statement = $pdo->prepare(
        'SELECT id, movilizacion_id, responsable_usuario_id FROM movilizacion_entes WHERE id = ?'
    );
    $statement->execute([$assignmentId]);
    $assignment = $statement->fetch();
    if (!$assignment) {
        respond(['error' => 'No se encontró la asignación.'], 404);
    }
    if ($user['role'] !== 'admin' &&
        (int) $assignment['responsable_usuario_id'] !== (int) $user['id']) {
        respond(['error' => $message], 403);
    }

    return $assignment;
}

function request_data(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($data)) {
        respond(['error' => 'El cuerpo de la solicitud debe ser JSON válido.'], 400);
    }
    return $data;
}

function valid_coordinate(mixed $value, bool $isLatitude): ?float
{
    if (!is_numeric($value)) {
        return null;
    }
    $number = (float) $value;
    $maximum = $isLatitude ? 90 : 180;
    return $number >= -$maximum && $number <= $maximum ? $number : null;
}

try {
    $config = load_config();
} catch (Throwable $error) {
    error_log('Movilizaciones configuration error: ' . $error->getMessage());
    respond(['error' => 'El backend todavía no está configurado. Sigue la guía de instalación de config.local.php.'], 503);
}

$isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off';
$requestHost = strtolower(explode(':', (string) ($_SERVER['HTTP_HOST'] ?? ''))[0]);
if (!$isHttps && !in_array($requestHost, ['localhost', '127.0.0.1', '::1'], true)) {
    respond(['error' => 'El portal requiere HTTPS para proteger la sesión y habilitar geolocalización en teléfonos.'], 400);
}
$area = (string) ($_GET['area'] ?? 'mobilizer');
if (!in_array($area, ['admin', 'mobilizer'], true)) {
    respond(['error' => 'El área solicitada no es válida.'], 400);
}
$isAdminArea = $area === 'admin';
session_name($isAdminArea ? 'movilizaciones_admin' : 'movilizaciones_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax'
]);
session_start();

if (isset($_SESSION['user'])) {
    $now = time();
    if (isset($_SESSION['last_activity']) && $now - (int) $_SESSION['last_activity'] > 7200) {
        $_SESSION = [];
        session_regenerate_id(true);
    } elseif (isset($_SESSION['session_rotated_at']) && $now - (int) $_SESSION['session_rotated_at'] > 900) {
        session_regenerate_id(true);
        $_SESSION['session_rotated_at'] = $now;
    }
    if (isset($_SESSION['user'])) {
        $_SESSION['last_activity'] = $now;
    }
}

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');

try {
    $pdo = database($config);
    $action = (string) ($_GET['action'] ?? '');
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($action === 'session' && $method === 'GET') {
        $user = current_user();
        if ($user) {
            $statement = $pdo->prepare(
                'SELECT u.id, u.nombre, u.nombre_usuario, u.correo, u.telefono, u.rol, u.rol_sistema_id, ' .
                'r.nombre AS rol_sistema_nombre, u.unidad_territorial_id, u.activo ' .
                'FROM usuarios u LEFT JOIN roles_sistema r ON r.id = u.rol_sistema_id WHERE u.id = ?'
            );
            $statement->execute([$user['id']]);
            $account = $statement->fetch();
            $roleMatchesArea = $account && ($isAdminArea
                ? $account['rol'] === 'admin'
                : $account['rol'] !== 'admin');
            if (!$account || !(int) $account['activo'] || !$roleMatchesArea) {
                $_SESSION = [];
                session_regenerate_id(true);
                $user = null;
            } else {
                $user = public_user($pdo, $account);
                $_SESSION['user'] = $user;
            }
        }
        respond(['user' => $user, 'csrf' => csrf_token()]);
    }

    if ($action === 'login' && $method === 'POST') {
        require_csrf();
        $data = request_data();
        $identity = $isAdminArea
            ? trim((string) ($data['username'] ?? ''))
            : normalize_phone((string) ($data['phone'] ?? ''));
        $password = (string) ($data['password'] ?? '');
        $validIdentity = $isAdminArea
            ? (bool) preg_match('/^[A-Za-z0-9._+()-]{3,80}$/', $identity)
            : $identity !== '';
        $identityLabel = $isAdminArea ? 'Usuario' : 'Teléfono';
        if (!$validIdentity || $password === '' || strlen($password) > 1024) {
            respond(['error' => $identityLabel . ' o contraseña incorrectos.'], 422);
        }

        $attemptKey = hash_hmac(
            'sha256',
            strtolower($identity) . '|' . $area . '|' . client_ip(),
            $config['app_secret']
        );
        $attemptStatement = $pdo->prepare('SELECT intentos, inicio_ventana, bloqueado_hasta FROM intentos_login WHERE llave = ?');
        $attemptStatement->execute([$attemptKey]);
        $attempt = $attemptStatement->fetch();
        $now = new DateTimeImmutable('now');
        if ($attempt && $attempt['bloqueado_hasta'] && new DateTimeImmutable($attempt['bloqueado_hasta']) > $now) {
            respond(['error' => 'Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.'], 429);
        }

        $statement = $pdo->prepare($isAdminArea
            ? 'SELECT u.id, u.nombre, u.nombre_usuario, u.correo, u.telefono, u.password_hash, u.rol, u.rol_sistema_id, ' .
                'r.nombre AS rol_sistema_nombre, u.unidad_territorial_id, u.activo ' .
                'FROM usuarios u LEFT JOIN roles_sistema r ON r.id = u.rol_sistema_id WHERE u.nombre_usuario = ?'
            : 'SELECT u.id, u.nombre, u.nombre_usuario, u.correo, u.telefono, u.password_hash, u.rol, u.rol_sistema_id, ' .
                'r.nombre AS rol_sistema_nombre, u.unidad_territorial_id, u.activo ' .
                'FROM usuarios u LEFT JOIN roles_sistema r ON r.id = u.rol_sistema_id WHERE u.telefono = ?');
        $statement->execute([$identity]);
        $account = $statement->fetch();
        $roleMatchesArea = $account && ($isAdminArea
            ? $account['rol'] === 'admin'
            : $account['rol'] !== 'admin');
        if (!$account || !(int) $account['activo'] || !$roleMatchesArea ||
            !password_verify($password, $account['password_hash'])) {
            $windowExpired = !$attempt || $now->getTimestamp() - strtotime($attempt['inicio_ventana']) > 900;
            $count = $windowExpired ? 1 : (int) $attempt['intentos'] + 1;
            $windowStart = $windowExpired ? $now->format('Y-m-d H:i:s') : $attempt['inicio_ventana'];
            $lockedUntil = $count >= 8 ? $now->modify('+15 minutes')->format('Y-m-d H:i:s') : null;
            $saveAttempt = $pdo->prepare(
                'INSERT INTO intentos_login (llave, intentos, inicio_ventana, bloqueado_hasta) VALUES (?, ?, ?, ?) ' .
                'ON DUPLICATE KEY UPDATE intentos = VALUES(intentos), inicio_ventana = VALUES(inicio_ventana), bloqueado_hasta = VALUES(bloqueado_hasta)'
            );
            $saveAttempt->execute([$attemptKey, $count, $windowStart, $lockedUntil]);
            respond(['error' => $identityLabel . ' o contraseña incorrectos.'], 401);
        }

        $pdo->prepare('DELETE FROM intentos_login WHERE llave = ?')->execute([$attemptKey]);
        session_regenerate_id(true);
        $_SESSION['user'] = public_user($pdo, $account);
        $_SESSION['last_activity'] = time();
        $_SESSION['session_rotated_at'] = time();
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'logout' && $method === 'POST') {
        $logoutUser = require_user();
        if (($isAdminArea && $logoutUser['role'] !== 'admin') ||
            (!$isAdminArea && $logoutUser['role'] === 'admin')) {
            respond(['error' => 'Esta cuenta debe cerrar sesión desde su portal correspondiente.'], 403);
        }
        require_csrf();
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['user' => null, 'csrf' => $_SESSION['csrf']]);
    }

    $user = require_user();
    if (($isAdminArea && $user['role'] !== 'admin') ||
        (!$isAdminArea && $user['role'] === 'admin')) {
        respond(['error' => 'Esta cuenta no tiene acceso a este portal.'], 403);
    }
    $accountStatement = $pdo->prepare(
        'SELECT u.id, u.nombre, u.nombre_usuario, u.correo, u.telefono, u.rol, u.rol_sistema_id, ' .
        'r.nombre AS rol_sistema_nombre, u.unidad_territorial_id, u.activo ' .
        'FROM usuarios u LEFT JOIN roles_sistema r ON r.id = u.rol_sistema_id WHERE u.id = ?'
    );
    $accountStatement->execute([$user['id']]);
    $account = $accountStatement->fetch();
    if (!$account || !(int) $account['activo']) {
        $_SESSION = [];
        session_regenerate_id(true);
        respond(['error' => 'La cuenta está inactiva o ya no existe. Inicia sesión nuevamente.'], 401);
    }
    $user = public_user($pdo, $account);
    $_SESSION['user'] = $user;

    if ($action === 'system-settings' && $method === 'GET') {
        require_module($user, 'settings');
        $roles = [];
        $roleStatement = $pdo->query('SELECT id, nombre, descripcion FROM roles_sistema ORDER BY nombre');
        foreach ($roleStatement->fetchAll() as $role) {
            $modules = role_modules($pdo, (int) $role['id']);
            if (!can_manage_modules($modules, $user)) {
                continue;
            }
            $roles[] = [
                'id' => (int) $role['id'],
                'name' => $role['nombre'],
                'description' => $role['descripcion'],
                'modules' => $modules
            ];
        }

        $adminUsers = [];
        $adminStatement = $pdo->query(
            "SELECT u.id, u.nombre, u.nombre_usuario, u.activo, u.rol_sistema_id, r.nombre AS role_name " .
            "FROM usuarios u JOIN roles_sistema r ON r.id = u.rol_sistema_id " .
            "WHERE u.rol = 'admin' AND LOWER(u.nombre_usuario) <> 'admin' ORDER BY u.nombre"
        );
        foreach ($adminStatement->fetchAll() as $admin) {
            $modules = role_modules($pdo, (int) $admin['rol_sistema_id']);
            if (!can_manage_modules($modules, $user)) {
                continue;
            }
            $adminUsers[] = [
                'id' => (int) $admin['id'],
                'name' => $admin['nombre'],
                'username' => $admin['nombre_usuario'],
                'active' => (bool) $admin['activo'],
                'roleId' => (int) $admin['rol_sistema_id'],
                'roleName' => $admin['role_name']
            ];
        }
        respond(['modules' => ADMIN_MODULES, 'roles' => $roles, 'users' => $adminUsers]);
    }

    if ($action === 'system-role-save' && $method === 'POST') {
        require_module($user, 'settings');
        require_csrf();
        $data = request_data();
        $roleIdInput = $data['roleId'] ?? '';
        $roleId = $roleIdInput === '' ? null : filter_var($roleIdInput, FILTER_VALIDATE_INT);
        $name = trim((string) ($data['name'] ?? ''));
        $description = trim((string) ($data['description'] ?? ''));
        $moduleInput = $data['modules'] ?? null;
        if ($roleId === false || ($roleId !== null && $roleId < 1) ||
            $name === '' || mb_strlen($name) > 80 || mb_strlen($description) > 255 ||
            !is_array($moduleInput) || $moduleInput === []) {
            respond(['error' => 'Indica un nombre y al menos un módulo para el rol.'], 422);
        }
        $modules = array_values(array_unique($moduleInput));
        if (array_filter($modules, static fn($module): bool =>
            !is_string($module) || !in_array($module, ADMIN_MODULES, true)
        )) {
            respond(['error' => 'El rol contiene un módulo no válido.'], 422);
        }
        if (!can_manage_modules($modules, $user)) {
            respond(['error' => 'No puedes asignar permisos de módulos que no tienes habilitados.'], 403);
        }
        if ($roleId !== null) {
            $existingRole = $pdo->prepare('SELECT id FROM roles_sistema WHERE id = ?');
            $existingRole->execute([$roleId]);
            if (!$existingRole->fetchColumn()) {
                respond(['error' => 'No se encontró el rol que intentas editar.'], 404);
            }
            if (!can_manage_modules(role_modules($pdo, $roleId), $user)) {
                respond(['error' => 'No puedes modificar un rol con permisos fuera de tu alcance.'], 403);
            }
        }
        $duplicateRole = $pdo->prepare(
            'SELECT id FROM roles_sistema WHERE nombre = ? AND (? IS NULL OR id <> ?) LIMIT 1'
        );
        $duplicateRole->execute([$name, $roleId, $roleId]);
        if ($duplicateRole->fetchColumn()) {
            respond(['error' => 'Ya existe un rol con ese nombre.'], 409);
        }

        $pdo->beginTransaction();
        try {
            if ($roleId === null) {
                $saveRole = $pdo->prepare('INSERT INTO roles_sistema (nombre, descripcion) VALUES (?, ?)');
                $saveRole->execute([$name, $description !== '' ? $description : null]);
                $roleId = (int) $pdo->lastInsertId();
            } else {
                $saveRole = $pdo->prepare('UPDATE roles_sistema SET nombre = ?, descripcion = ? WHERE id = ?');
                $saveRole->execute([$name, $description !== '' ? $description : null, $roleId]);
                $pdo->prepare('DELETE FROM roles_sistema_modulos WHERE rol_sistema_id = ?')->execute([$roleId]);
            }
            $saveModule = $pdo->prepare(
                'INSERT INTO roles_sistema_modulos (rol_sistema_id, modulo) VALUES (?, ?)'
            );
            foreach ($modules as $module) {
                $saveModule->execute([$roleId, $module]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        respond(['id' => $roleId, 'message' => 'El rol y sus permisos se guardaron correctamente.']);
    }

    if ($action === 'system-admin-user-save' && $method === 'POST') {
        require_module($user, 'settings');
        require_csrf();
        $data = request_data();
        $userIdInput = $data['userId'] ?? '';
        $userId = $userIdInput === '' ? null : filter_var($userIdInput, FILTER_VALIDATE_INT);
        $name = trim((string) ($data['name'] ?? ''));
        $username = trim((string) ($data['username'] ?? ''));
        $password = (string) ($data['password'] ?? '');
        $roleId = filter_var($data['roleId'] ?? null, FILTER_VALIDATE_INT);
        $active = filter_var($data['active'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($userId === false || ($userId !== null && $userId < 1) ||
            $name === '' || mb_strlen($name) > 140 ||
            !preg_match('/^[A-Za-z0-9._+()-]{3,80}$/', $username) ||
            $roleId === false || $roleId < 1 || $active === null ||
            ($userId === null && strlen($password) < 8) ||
            ($password !== '' && (strlen($password) < 8 || strlen($password) > 1024))) {
            respond(['error' => 'Completa el nombre, usuario, rol y una contraseña de al menos 8 caracteres para cuentas nuevas.'], 422);
        }

        $roleStatement = $pdo->prepare('SELECT id FROM roles_sistema WHERE id = ?');
        $roleStatement->execute([$roleId]);
        if (!$roleStatement->fetchColumn()) {
            respond(['error' => 'Selecciona un rol existente.'], 422);
        }
        if (!can_manage_modules(role_modules($pdo, $roleId), $user)) {
            respond(['error' => 'No puedes asignar un rol con permisos fuera de tu alcance.'], 403);
        }

        if ($userId !== null) {
            $targetStatement = $pdo->prepare(
                "SELECT id, nombre_usuario, rol_sistema_id FROM usuarios WHERE id = ? AND rol = 'admin'"
            );
            $targetStatement->execute([$userId]);
            $target = $targetStatement->fetch();
            if (!$target || strcasecmp((string) $target['nombre_usuario'], 'admin') === 0 ||
                $target['rol_sistema_id'] === null) {
                respond(['error' => 'No puedes modificar la cuenta superadministradora.'], 403);
            }
            if (!can_manage_modules(role_modules($pdo, (int) $target['rol_sistema_id']), $user)) {
                respond(['error' => 'No puedes modificar una cuenta con permisos fuera de tu alcance.'], 403);
            }
        }

        $duplicateUsername = $pdo->prepare(
            'SELECT id FROM usuarios WHERE nombre_usuario = ? AND (? IS NULL OR id <> ?) LIMIT 1'
        );
        $duplicateUsername->execute([$username, $userId, $userId]);
        if ($duplicateUsername->fetchColumn()) {
            respond(['error' => 'Ese nombre de usuario ya está en uso.'], 409);
        }

        if ($userId === null) {
            $insert = $pdo->prepare(
                "INSERT INTO usuarios (nombre, nombre_usuario, password_hash, rol, rol_sistema_id, activo) " .
                "VALUES (?, ?, ?, 'admin', ?, ?)"
            );
            $insert->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT), $roleId, $active ? 1 : 0]);
            respond(['id' => (int) $pdo->lastInsertId(), 'message' => 'Usuario administrativo creado.']);
        }

        $values = [$name, $username, $roleId, $active ? 1 : 0];
        $sql = 'UPDATE usuarios SET nombre = ?, nombre_usuario = ?, rol_sistema_id = ?, activo = ?';
        if ($password !== '') {
            $sql .= ', password_hash = ?';
            $values[] = password_hash($password, PASSWORD_DEFAULT);
        }
        $sql .= " WHERE id = ? AND rol = 'admin'";
        $values[] = $userId;
        $pdo->prepare($sql)->execute($values);
        respond(['id' => $userId, 'message' => 'Usuario administrativo actualizado.']);
    }

    if ($action === 'users' && $method === 'GET') {
        require_admin($user);
        require_module($user, 'structure');
        $statement = $pdo->query(
            "SELECT id, nombre, correo, telefono, unidad_territorial_id " .
            "FROM usuarios WHERE activo = 1 AND rol = 'responsable' ORDER BY nombre"
        );
        respond(['users' => $statement->fetchAll()]);
    }

    if ($action === 'structure' && $method === 'GET') {
        require_admin($user);
        require_module($user, 'structure');
        $statement = $pdo->query(
            'SELECT t.id, t.codigo, t.nombre, t.nivel, t.padre_id, t.activo, ' .
            'u.id AS usuario_id, u.nombre AS usuario_nombre, u.telefono AS usuario_telefono, ' .
            'u.correo AS usuario_correo, u.activo AS usuario_activo ' .
            'FROM unidades_territoriales t LEFT JOIN usuarios u ON u.unidad_territorial_id = t.id ' .
            'ORDER BY FIELD(t.nivel, \'nacional\', \'estadal\', \'municipal\'), t.nombre'
        );
        respond(['territories' => $statement->fetchAll()]);
    }

    if ($action === 'structure-user-save' && $method === 'POST') {
        require_admin($user);
        require_module($user, 'structure');
        require_csrf();
        $data = request_data();
        $userIdInput = $data['userId'] ?? '';
        $userId = $userIdInput === '' ? null : filter_var($userIdInput, FILTER_VALIDATE_INT);
        $name = trim((string) ($data['name'] ?? ''));
        $phone = normalize_phone((string) ($data['phone'] ?? ''));
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $password = (string) ($data['password'] ?? '');
        $territoryId = filter_var($data['territoryId'] ?? null, FILTER_VALIDATE_INT);
        $active = filter_var($data['active'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($userId === false || ($userId !== null && $userId < 1) || $name === '' || mb_strlen($name) > 140 ||
            $phone === '' || ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190)) ||
            $territoryId === false || $territoryId < 1 || $active === null ||
            ($userId === null && strlen($password) < 8) ||
            ($password !== '' && (strlen($password) < 8 || strlen($password) > 1024))) {
            respond(['error' => 'Completa nombre, teléfono, unidad territorial y una contraseña de al menos 8 caracteres para cuentas nuevas.'], 422);
        }

        $unitStatement = $pdo->prepare(
            "SELECT id FROM unidades_territoriales WHERE id = ? AND activo = 1 AND nivel IN ('nacional', 'estadal', 'municipal')"
        );
        $unitStatement->execute([$territoryId]);
        if (!$unitStatement->fetchColumn()) {
            respond(['error' => 'Selecciona una unidad territorial activa.'], 422);
        }

        $duplicatePhone = $pdo->prepare(
            "SELECT id FROM usuarios WHERE telefono = ? AND (? IS NULL OR id <> ?) LIMIT 1"
        );
        $duplicatePhone->execute([$phone, $userId, $userId]);
        if ($duplicatePhone->fetchColumn()) {
            respond(['error' => 'Ese teléfono ya está asignado a otra cuenta.'], 409);
        }
        $duplicateUnit = $pdo->prepare(
            "SELECT id FROM usuarios WHERE unidad_territorial_id = ? AND rol = 'responsable' AND (? IS NULL OR id <> ?) LIMIT 1"
        );
        $duplicateUnit->execute([$territoryId, $userId, $userId]);
        if ($duplicateUnit->fetchColumn()) {
            respond(['error' => 'Ya existe una cuenta responsable para esa unidad territorial.'], 409);
        }
        if ($email !== '') {
            $duplicateEmail = $pdo->prepare(
                "SELECT id FROM usuarios WHERE correo = ? AND (? IS NULL OR id <> ?) LIMIT 1"
            );
            $duplicateEmail->execute([$email, $userId, $userId]);
            if ($duplicateEmail->fetchColumn()) {
                respond(['error' => 'Ese correo ya está asignado a otra cuenta.'], 409);
            }
        }

        if ($userId === null) {
            $insert = $pdo->prepare(
                "INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo) " .
                "VALUES (?, ?, ?, ?, 'responsable', ?, ?)"
            );
            $insert->execute([
                $name,
                $email !== '' ? $email : null,
                $phone,
                password_hash($password, PASSWORD_DEFAULT),
                $territoryId,
                $active ? 1 : 0
            ]);
            respond(['id' => (int) $pdo->lastInsertId(), 'message' => 'Cuenta de movilizador creada.']);
        }

        $accountStatement = $pdo->prepare("SELECT id FROM usuarios WHERE id = ? AND rol = 'responsable'");
        $accountStatement->execute([$userId]);
        if (!$accountStatement->fetchColumn()) {
            respond(['error' => 'No se encontró la cuenta de movilizador.'], 404);
        }

        $values = [
            $name,
            $email !== '' ? $email : null,
            $phone,
            $territoryId,
            $active ? 1 : 0,
            $userId
        ];
        $sql = 'UPDATE usuarios SET nombre = ?, correo = ?, telefono = ?, unidad_territorial_id = ?, activo = ?';
        if ($password !== '') {
            $sql .= ', password_hash = ?';
            array_splice($values, 5, 0, [password_hash($password, PASSWORD_DEFAULT)]);
        }
        $sql .= ' WHERE id = ? AND rol = \'responsable\'';
        $pdo->prepare($sql)->execute($values);
        respond(['id' => $userId, 'message' => 'Cuenta de movilizador actualizada.']);
    }

    if ($action === 'events' && $method === 'GET') {
        if ($user['role'] === 'admin') {
            require_module($user, 'events');
            $statement = $pdo->query(
                'SELECT m.id, m.nombre, m.descripcion, m.fecha, m.hora_inicio, m.hora_fin, m.lugar, m.estado, ' .
                'm.unidad_territorial_id, t.nombre AS municipio, p.nombre AS estado_nombre, ' .
                'm.punto_partida_nombre, m.punto_partida_lat, m.punto_partida_lng, ' .
                'm.punto_llegada_nombre, m.punto_llegada_lat, m.punto_llegada_lng, ' .
                'm.ruta_ideal_geojson, m.ruta_distancia_metros, m.ruta_duracion_segundos, m.creado_en, ' .
                '(SELECT COUNT(*) FROM movilizacion_entes me WHERE me.movilizacion_id = m.id) AS cantidad_entes, ' .
                '(SELECT COALESCE(SUM(me.cuota_personas), 0) FROM movilizacion_entes me WHERE me.movilizacion_id = m.id) AS total_personas ' .
                'FROM movilizaciones m LEFT JOIN unidades_territoriales t ON t.id = m.unidad_territorial_id ' .
                'LEFT JOIN unidades_territoriales p ON p.id = t.padre_id ORDER BY m.fecha DESC, m.id DESC'
            );
            respond(['events' => $statement->fetchAll()]);
        }
        $statement = $pdo->prepare(
            'SELECT DISTINCT m.id, m.nombre, m.descripcion, m.fecha, m.hora_inicio, m.hora_fin, m.lugar, m.estado, ' .
            'm.unidad_territorial_id, t.nombre AS municipio, p.nombre AS estado_nombre, ' .
            'm.punto_partida_nombre, m.punto_partida_lat, m.punto_partida_lng, ' .
            'm.punto_llegada_nombre, m.punto_llegada_lat, m.punto_llegada_lng, ' .
            'm.ruta_ideal_geojson, m.ruta_distancia_metros, m.ruta_duracion_segundos, m.creado_en, ' .
            '(SELECT COUNT(*) FROM movilizacion_entes count_me WHERE count_me.movilizacion_id = m.id AND count_me.responsable_usuario_id = ?) AS cantidad_entes, ' .
            '(SELECT COALESCE(SUM(count_me.cuota_personas), 0) FROM movilizacion_entes count_me WHERE count_me.movilizacion_id = m.id AND count_me.responsable_usuario_id = ?) AS total_personas ' .
            'FROM movilizaciones m LEFT JOIN unidades_territoriales t ON t.id = m.unidad_territorial_id ' .
            'LEFT JOIN unidades_territoriales p ON p.id = t.padre_id ' .
            'ORDER BY m.fecha DESC, m.id DESC'
        );
        $statement->execute([$user['id'], $user['id']]);
        respond(['events' => $statement->fetchAll()]);
    }

    if ($action === 'report-events' && $method === 'GET') {
        require_module($user, 'reports');
        $statement = $pdo->query(
            'SELECT id, nombre, fecha, hora_inicio, lugar FROM movilizaciones ORDER BY fecha DESC, id DESC'
        );
        respond(['events' => $statement->fetchAll()]);
    }

    if ($action === 'tracking-overview' && $method === 'GET') {
        require_admin($user);
        require_module($user, 'tracking');
        $eventQuery = $pdo->query(
            "SELECT id, nombre, fecha, hora_inicio, lugar, punto_llegada_nombre, " .
            "punto_llegada_lat, punto_llegada_lng " .
            "FROM movilizaciones WHERE estado = 'en_curso' ORDER BY fecha DESC, id DESC"
        );
        $activeEvents = $eventQuery->fetchAll();
        if ($activeEvents === []) {
            respond(['events' => [], 'mobilizers' => []]);
        }

        $eventIds = array_map(static fn(array $event): int => (int) $event['id'], $activeEvents);
        $placeholders = implode(',', array_fill(0, count($eventIds), '?'));
        $mobilizerQuery = $pdo->prepare(
            'SELECT me.movilizacion_id, me.id AS assignment_id, u.nombre AS responsable, ' .
            'me.personas_planificadas, me.personas_asistentes, me.requiere_transporte, me.vehiculos_json, ' .
            'me.punto_salida, me.punto_salida_lat, me.punto_salida_lng, me.ruta_personal_geojson, me.ruta_personal_duracion_segundos, ' .
            'ts.estado AS tracking_status, ts.tipo AS tracking_leg, ts.llegada_confirmada_en, UNIX_TIMESTAMP(ts.iniciado_en) AS tracking_started_at_epoch, ' .
            '(SELECT tp.latitud FROM tracking_puntos tp WHERE tp.tracking_sesion_id = ts.id ORDER BY tp.registrado_en DESC, tp.id DESC LIMIT 1) AS latitude, ' .
            '(SELECT tp.longitud FROM tracking_puntos tp WHERE tp.tracking_sesion_id = ts.id ORDER BY tp.registrado_en DESC, tp.id DESC LIMIT 1) AS longitude, ' .
            '(SELECT tp.precision_metros FROM tracking_puntos tp WHERE tp.tracking_sesion_id = ts.id ORDER BY tp.registrado_en DESC, tp.id DESC LIMIT 1) AS accuracy, ' .
            '(SELECT tp.registrado_en FROM tracking_puntos tp WHERE tp.tracking_sesion_id = ts.id ORDER BY tp.registrado_en DESC, tp.id DESC LIMIT 1) AS last_seen_at, ' .
            '(SELECT TIMESTAMPDIFF(SECOND, tp.registrado_en, UTC_TIMESTAMP()) FROM tracking_puntos tp WHERE tp.tracking_sesion_id = ts.id ORDER BY tp.registrado_en DESC, tp.id DESC LIMIT 1) AS last_seen_age_seconds, ' .
            '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id) AS photo_count, ' .
            '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id AND fa.tipo = \'lista\') AS list_photo_count, ' .
            '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id AND fa.tipo = \'vehiculo\') AS vehicle_photo_count, ' .
            '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id AND fa.tipo = \'grupo\') AS group_photo_count ' .
            'FROM movilizacion_entes me ' .
            'JOIN usuarios u ON u.id = me.responsable_usuario_id AND u.activo = 1 ' .
            'JOIN tracking_sesiones ts ON ts.movilizacion_ente_id = me.id ' .
            'AND (ts.estado = \'en_curso\' OR ts.llegada_confirmada_en IS NOT NULL) ' .
            'WHERE me.movilizacion_id IN (' . $placeholders . ') ' .
            'AND ts.id = (SELECT latest.id FROM tracking_sesiones latest ' .
            'WHERE latest.movilizacion_ente_id = me.id ' .
            'AND (latest.estado = \'en_curso\' OR latest.llegada_confirmada_en IS NOT NULL) ' .
            'ORDER BY latest.iniciado_en DESC, latest.id DESC LIMIT 1) ' .
            'ORDER BY u.nombre'
        );
        $mobilizerQuery->execute($eventIds);
        respond(['events' => $activeEvents, 'mobilizers' => $mobilizerQuery->fetchAll()]);
    }

    if ($action === 'tracking-route' && $method === 'GET') {
        require_admin($user);
        require_module($user, 'tracking');
        $assignmentId = filter_var($_GET['assignmentId'] ?? null, FILTER_VALIDATE_INT);
        if ($assignmentId === false || $assignmentId < 1) {
            respond(['error' => 'La asignación solicitada no es válida.'], 400);
        }
        $legQuery = $pdo->prepare(
            'SELECT id, tipo, estado, iniciado_en, finalizado_en, llegada_confirmada_en FROM tracking_sesiones ' .
            'WHERE movilizacion_ente_id = ? ORDER BY iniciado_en, id'
        );
        $legQuery->execute([$assignmentId]);
        $pointQuery = $pdo->prepare(
            'SELECT latitud, longitud FROM tracking_puntos WHERE tracking_sesion_id = ? ORDER BY secuencia LIMIT 20000'
        );
        $legs = [];
        foreach ($legQuery->fetchAll() as $leg) {
            $pointQuery->execute([$leg['id']]);
            $points = [];
            foreach ($pointQuery->fetchAll() as $point) {
                $points[] = [(float) $point['longitud'], (float) $point['latitud']];
            }
            $legs[] = [
                'type' => $leg['tipo'],
                'finished' => $leg['llegada_confirmada_en'] !== null,
                'startedAt' => $leg['iniciado_en'],
                'finishedAt' => $leg['llegada_confirmada_en'],
                'points' => $points
            ];
        }
        respond(['legs' => $legs]);
    }

    if ($action === 'event-create' && $method === 'POST') {
        require_admin($user);
        require_module($user, 'events');
        require_csrf();
        $data = request_data();
        $name = trim((string) ($data['name'] ?? ''));
        $description = trim((string) ($data['description'] ?? ''));
        $date = (string) ($data['date'] ?? '');
        $location = trim((string) ($data['location'] ?? ''));
        $estimatedPeople = filter_var($data['estimatedPeople'] ?? null, FILTER_VALIDATE_INT);
        $territoryId = filter_var($data['territoryId'] ?? null, FILTER_VALIDATE_INT);
        $endName = trim((string) ($data['endName'] ?? ''));
        $endLat = valid_coordinate($data['endLat'] ?? null, true);
        $endLng = valid_coordinate($data['endLng'] ?? null, false);
        $eventTime = (string) ($data['eventTime'] ?? '');

        $dateValid = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if ($name === '' || mb_strlen($name) > 140 || mb_strlen($description) > 5000 ||
            !$dateValid || $dateValid->format('Y-m-d') !== $date ||
            $location === '' || mb_strlen($location) > 180 ||
            $estimatedPeople === false || $estimatedPeople < 0 || $estimatedPeople > 1000000 ||
            $territoryId === false || $territoryId < 1 ||
            $endName === '' || mb_strlen($endName) > 180 || $endLat === null || $endLng === null) {
            respond(['error' => 'Completa los datos de la movilización y marca su punto de llegada.'], 422);
        }

        $territoryStatement = $pdo->prepare(
            "SELECT id FROM unidades_territoriales WHERE id = ? AND nivel = 'municipal' AND activo = 1"
        );
        $territoryStatement->execute([$territoryId]);
        if (!$territoryStatement->fetchColumn()) {
            respond(['error' => 'Selecciona un municipio activo para la movilización.'], 422);
        }

        $timePattern = '/^(?:[01]\d|2[0-3]):[0-5]\d$/';
        if ($eventTime !== '' && !preg_match($timePattern, $eventTime)) {
            respond(['error' => 'La hora del evento debe estar en formato HH:MM.'], 422);
        }

        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare(
                'INSERT INTO movilizaciones ' .
                '(nombre, descripcion, fecha, hora_inicio, personas_estimadas_movilizar, hora_fin, lugar, unidad_territorial_id, estado, punto_partida_nombre, punto_partida_lat, punto_partida_lng, punto_llegada_nombre, punto_llegada_lat, punto_llegada_lng, ruta_ideal_geojson, ruta_distancia_metros, ruta_duracion_segundos, creado_por) ' .
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $statement->execute([
                $name, $description !== '' ? $description : null, $date,
                $eventTime !== '' ? $eventTime : null, $estimatedPeople, null,
                $location, $territoryId, 'en_curso', null, null, null, $endName, $endLat, $endLng,
                null, null, null, $user['id']
            ]);
            $eventId = (int) $pdo->lastInsertId();
            $pdo->commit();
            respond(['id' => $eventId, 'message' => 'Movilización creada y disponible para todos los movilizadores.']);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }

    if ($action === 'event-delete' && $method === 'POST') {
        require_admin($user);
        require_module($user, 'events');
        require_csrf();
        $data = request_data();
        $eventId = filter_var($data['eventId'] ?? null, FILTER_VALIDATE_INT);
        if ($eventId === false || $eventId < 1) {
            respond(['error' => 'La movilización solicitada no es válida.'], 422);
        }
        $eventQuery = $pdo->prepare('SELECT nombre FROM movilizaciones WHERE id = ?');
        $eventQuery->execute([$eventId]);
        $eventName = $eventQuery->fetchColumn();
        if ($eventName === false) {
            respond(['error' => 'La movilización ya no existe. Actualiza la página e inténtalo otra vez.'], 404);
        }
        $photoQuery = $pdo->prepare(
            'SELECT fa.ruta_archivo FROM fotos_asistencia fa ' .
            'JOIN movilizacion_entes me ON me.id = fa.movilizacion_ente_id WHERE me.movilizacion_id = ?'
        );
        $photoQuery->execute([$eventId]);
        $photoPaths = $photoQuery->fetchAll(PDO::FETCH_COLUMN);
        $pdo->beginTransaction();
        try {
            $deleteEvent = $pdo->prepare('DELETE FROM movilizaciones WHERE id = ?');
            $deleteEvent->execute([$eventId]);
            if ($deleteEvent->rowCount() !== 1) {
                throw new RuntimeException('No se pudo confirmar la eliminación de la movilización.');
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        $failedPhotoDeletes = 0;
        foreach ($photoPaths as $photoPath) {
            $prefix = 'uploads/attendance/';
            if (!is_string($photoPath) || !str_starts_with($photoPath, $prefix)) {
                error_log('Skipped unexpected photo path while deleting mobilization ' . $eventId);
                $failedPhotoDeletes++;
                continue;
            }
            $filename = substr($photoPath, strlen($prefix));
            if ($filename === '' || basename($filename) !== $filename) {
                error_log('Skipped invalid photo filename while deleting mobilization ' . $eventId);
                $failedPhotoDeletes++;
                continue;
            }
            $fullPath = __DIR__ . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'attendance' . DIRECTORY_SEPARATOR . $filename;
            if (is_file($fullPath) && !unlink($fullPath)) {
                error_log('Could not remove photo file while deleting mobilization ' . $eventId);
                $failedPhotoDeletes++;
            }
        }
        if ($failedPhotoDeletes > 0) {
            respond([
                'message' => 'La movilización se eliminó, pero no se pudieron borrar ' . $failedPhotoDeletes . ' archivo(s) de evidencia del disco.',
                'warning' => true
            ]);
        }
        respond(['message' => 'La movilización "' . $eventName . '" y sus registros fueron eliminados.']);
    }

    if ($action === 'event-report' && $method === 'GET') {
        require_admin($user);
        $fullReport = ($_GET['full'] ?? '') === '1';
        require_module($user, $fullReport ? 'events' : 'reports');
        $eventId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
        if ($eventId === false || $eventId < 1) {
            respond(['error' => 'La movilización solicitada no es válida.'], 400);
        }

        if ($fullReport) {
            $fullEventQuery = $pdo->prepare(
                'SELECT m.nombre, m.descripcion, m.fecha, m.hora_inicio, m.hora_fin, ' .
                'm.personas_estimadas_movilizar, m.lugar, m.estado, t.nombre AS municipio, p.nombre AS estado_nombre, ' .
                'm.punto_partida_nombre, m.punto_llegada_nombre, m.ruta_distancia_metros, m.ruta_duracion_segundos ' .
                'FROM movilizaciones m ' .
                'LEFT JOIN unidades_territoriales t ON t.id = m.unidad_territorial_id ' .
                'LEFT JOIN unidades_territoriales p ON p.id = t.padre_id WHERE m.id = ?'
            );
            $fullEventQuery->execute([$eventId]);
            $fullEvent = $fullEventQuery->fetch();
            if (!$fullEvent) {
                respond(['error' => 'No se encontró la movilización.'], 404);
            }

            $fullAssignmentQuery = $pdo->prepare(
                'SELECT me.id, e.nombre AS ente, me.cuota_personas, me.personas_planificadas, me.personas_asistentes, ' .
                'me.requiere_transporte, me.cantidad_autobuses, me.vehiculos_json, me.punto_salida, ' .
                'COALESCE(me.punto_llegada_nombre, m.punto_llegada_nombre) AS punto_llegada_nombre, ' .
                'me.ruta_personal_distancia_metros, me.ruta_personal_duracion_segundos, me.receptor_transporte, ' .
                'me.plan_confirmado_en, me.transporte_confirmado_en, me.datos_confirmados_en, me.asistencia_reportada_en, ' .
                'COALESCE(u.nombre, r.nombre) AS responsable, COALESCE(u.telefono, r.telefono) AS responsable_telefono, ' .
                'COALESCE(u.correo, r.correo) AS responsable_correo, ut.nombre AS responsable_unidad, up.nombre AS responsable_estado ' .
                'FROM movilizacion_entes me JOIN entes e ON e.id = me.ente_id ' .
                'JOIN movilizaciones m ON m.id = me.movilizacion_id ' .
                'LEFT JOIN usuarios u ON u.id = me.responsable_usuario_id ' .
                'LEFT JOIN responsables r ON r.id = me.responsable_id ' .
                'LEFT JOIN unidades_territoriales ut ON ut.id = u.unidad_territorial_id ' .
                'LEFT JOIN unidades_territoriales up ON up.id = ut.padre_id ' .
                'WHERE me.movilizacion_id = ? ORDER BY e.nombre'
            );
            $fullAssignmentQuery->execute([$eventId]);
            $fullAssignments = $fullAssignmentQuery->fetchAll();

            $photosByAssignment = [];
            $photoQuery = $pdo->prepare(
                'SELECT fa.movilizacion_ente_id AS assignment_id, fa.tipo, fa.vehiculo_id, fa.ruta_archivo, fa.nombre_original, fa.subido_en ' .
                'FROM fotos_asistencia fa JOIN movilizacion_entes me ON me.id = fa.movilizacion_ente_id ' .
                'WHERE me.movilizacion_id = ? ORDER BY fa.subido_en, fa.id'
            );
            $photoQuery->execute([$eventId]);
            foreach ($photoQuery->fetchAll() as $photo) {
                $storedPath = (string) $photo['ruta_archivo'];
                $photoPrefix = 'uploads/attendance/';
                $fileName = str_starts_with($storedPath, $photoPrefix)
                    ? substr($storedPath, strlen($photoPrefix))
                    : '';
                $photo['url'] = $fileName !== '' && basename($fileName) === $fileName && !str_contains($fileName, '\\')
                    ? $storedPath
                    : null;
                unset($photo['ruta_archivo']);
                $photosByAssignment[(int) $photo['assignment_id']][] = $photo;
            }

            $sessionsByAssignment = [];
            $sessionQuery = $pdo->prepare(
                'SELECT ts.id, ts.movilizacion_ente_id AS assignment_id, ts.tipo, ts.estado, ts.iniciado_en, ts.finalizado_en, ' .
                'ts.llegada_confirmada_en, ts.consentimiento_version, ts.consentimiento_aceptado_en ' .
                'FROM tracking_sesiones ts JOIN movilizacion_entes me ON me.id = ts.movilizacion_ente_id ' .
                'WHERE me.movilizacion_id = ? ORDER BY ts.iniciado_en'
            );
            $sessionQuery->execute([$eventId]);
            foreach ($sessionQuery->fetchAll() as $session) {
                $sessionsByAssignment[(int) $session['assignment_id']][] = $session;
            }

            foreach ($fullAssignments as &$assignment) {
                $assignmentId = (int) $assignment['id'];
                $assignment['photos'] = $photosByAssignment[$assignmentId] ?? [];
                $assignment['trackingSessions'] = $sessionsByAssignment[$assignmentId] ?? [];
            }
            unset($assignment);
            respond(['event' => $fullEvent, 'assignments' => $fullAssignments]);
        }

        $eventQuery = $pdo->prepare(
            'SELECT m.nombre, m.fecha, m.hora_inicio, m.personas_estimadas_movilizar, m.lugar, t.nombre AS municipio, ' .
            'p.nombre AS estado_nombre ' .
            'FROM movilizaciones m ' .
            'LEFT JOIN unidades_territoriales t ON t.id = m.unidad_territorial_id ' .
            'LEFT JOIN unidades_territoriales p ON p.id = t.padre_id WHERE m.id = ?'
        );
        $eventQuery->execute([$eventId]);
        $event = $eventQuery->fetch();
        if (!$event) {
            respond(['error' => 'No se encontró la movilización.'], 404);
        }

        $assignmentQuery = $pdo->prepare(
            'SELECT me.personas_planificadas, me.personas_asistentes, me.cuota_personas, me.vehiculos_json, ' .
            'me.cantidad_autobuses, me.plan_confirmado_en ' .
            'FROM movilizacion_entes me WHERE me.movilizacion_id = ? ORDER BY me.id'
        );
        $assignmentQuery->execute([$eventId]);
        $assignments = $assignmentQuery->fetchAll();
        respond(['event' => $event, 'assignments' => $assignments]);
    }

    if ($action === 'event-detail' && $method === 'GET') {
        if ($user['role'] === 'admin') {
            require_module($user, 'events');
        }
        $eventId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
        if ($eventId === false || $eventId < 1) {
            respond(['error' => 'La movilización solicitada no es válida.'], 400);
        }
        $eventStatement = $pdo->prepare(
            'SELECT m.id, m.nombre, m.descripcion, m.fecha, m.hora_inicio, m.hora_fin, m.lugar, m.estado, ' .
            'm.unidad_territorial_id, t.nombre AS municipio, p.nombre AS estado_nombre, ' .
            'm.punto_partida_nombre, m.punto_partida_lat, m.punto_partida_lng, ' .
            'm.punto_llegada_nombre, m.punto_llegada_lat, m.punto_llegada_lng, ' .
            'm.ruta_ideal_geojson, m.ruta_distancia_metros, m.ruta_duracion_segundos ' .
            'FROM movilizaciones m LEFT JOIN unidades_territoriales t ON t.id = m.unidad_territorial_id ' .
            'LEFT JOIN unidades_territoriales p ON p.id = t.padre_id WHERE m.id = ?'
        );
        $eventStatement->execute([$eventId]);
        $event = $eventStatement->fetch();
        if (!$event) {
            respond(['error' => 'No se encontró la movilización.'], 404);
        }
        if ($user['role'] !== 'admin') {
            $existingAssignment = $pdo->prepare(
                'SELECT id FROM movilizacion_entes WHERE movilizacion_id = ? AND responsable_usuario_id = ? LIMIT 1'
            );
            $existingAssignment->execute([$eventId, $user['id']]);
            if (!$existingAssignment->fetchColumn()) {
                $entityName = 'Registro movilizador #' . (int) $user['id'];
                $createEntity = $pdo->prepare(
                    'INSERT INTO entes (nombre) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)'
                );
                $createEntity->execute([$entityName]);
                $entityId = (int) $pdo->lastInsertId();
                $createAssignment = $pdo->prepare(
                    'INSERT INTO movilizacion_entes (movilizacion_id, ente_id, responsable_usuario_id) VALUES (?, ?, ?) ' .
                    'ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)'
                );
                $createAssignment->execute([$eventId, $entityId, $user['id']]);
            }
        }
        $assignmentFilter = $user['role'] === 'admin' ? '' : ' AND me.responsable_usuario_id = ?';
        $assignments = $pdo->prepare(
            'SELECT me.id, e.nombre AS ente, me.cuota_personas, me.personas_planificadas, ' .
            'me.requiere_transporte, me.cantidad_autobuses, me.vehiculos_json, me.punto_salida, me.punto_salida_lat, me.punto_salida_lng, ' .
            'me.punto_llegada_nombre, me.punto_llegada_lat, me.punto_llegada_lng, me.ruta_personal_geojson, ' .
            'me.ruta_personal_distancia_metros, me.ruta_personal_duracion_segundos, me.receptor_transporte, ' .
            'me.personas_asistentes, me.plan_confirmado_en, me.transporte_confirmado_en, me.datos_confirmados_en, me.asistencia_reportada_en, ' .
            'u.id AS responsable_usuario_id, u.nombre AS responsable, ' .
            '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id) AS fotos, ' .
            '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id AND fa.tipo = \'lista\') AS fotos_lista, ' .
            '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id AND fa.tipo = \'vehiculo\') AS fotos_vehiculo, ' .
            '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id AND fa.tipo = \'grupo\') AS fotos_grupo ' .
            'FROM movilizacion_entes me JOIN entes e ON e.id = me.ente_id ' .
            'LEFT JOIN usuarios u ON u.id = me.responsable_usuario_id ' .
            'WHERE me.movilizacion_id = ?' . $assignmentFilter . ' ORDER BY e.nombre'
        );
        $assignmentParameters = [$eventId];
        if ($user['role'] !== 'admin') {
            $assignmentParameters[] = $user['id'];
        }
        $assignments->execute($assignmentParameters);
        $assignmentRows = $assignments->fetchAll();
        $sessionQuery = $pdo->prepare(
            'SELECT id, tipo, estado, iniciado_en, finalizado_en, llegada_confirmada_en FROM tracking_sesiones WHERE movilizacion_ente_id = ? ORDER BY iniciado_en DESC, id DESC'
        );
        $vehiclePhotoQuery = $pdo->prepare(
            'SELECT vehiculo_id, COUNT(*) AS total FROM fotos_asistencia ' .
            'WHERE movilizacion_ente_id = ? AND tipo = \'vehiculo\' AND vehiculo_id IS NOT NULL GROUP BY vehiculo_id'
        );
        $pointQuery = $pdo->prepare(
            'SELECT latitud, longitud, precision_metros, registrado_en FROM tracking_puntos WHERE tracking_sesion_id = ? ORDER BY secuencia'
        );
        foreach ($assignmentRows as &$assignment) {
            $sessionQuery->execute([$assignment['id']]);
            $assignment['trackingSessions'] = $sessionQuery->fetchAll();
            $vehiclePhotoQuery->execute([$assignment['id']]);
            $assignment['vehiclePhotoCounts'] = [];
            foreach ($vehiclePhotoQuery->fetchAll() as $vehiclePhotoCount) {
                $assignment['vehiclePhotoCounts'][(string) $vehiclePhotoCount['vehiculo_id']] = (int) $vehiclePhotoCount['total'];
            }
            foreach ($assignment['trackingSessions'] as &$trackingSession) {
                $pointQuery->execute([$trackingSession['id']]);
                $trackingSession['points'] = $pointQuery->fetchAll();
            }
            unset($trackingSession);
        }
        unset($assignment);
        respond(['event' => $event, 'assignments' => $assignmentRows]);
    }

    if ($action === 'assignment-update' && $method === 'POST') {
        if ($user['role'] === 'admin') {
            require_module($user, 'events');
        }
        require_csrf();
        $data = request_data();
        $assignmentId = filter_var($data['assignmentId'] ?? null, FILTER_VALIDATE_INT);
        $step = (string) ($data['step'] ?? '');
        if ($assignmentId === false || $assignmentId < 1 || !in_array($step, ['plan', 'transport', 'attendance', 'confirm', 'edit'], true)) {
            respond(['error' => 'El paso o la asignación no son válidos.'], 422);
        }
        require_assignment_access($pdo, $user, $assignmentId, 'No tienes permiso para actualizar esta asignación.');

        if ($step === 'plan') {
            $planned = filter_var($data['plannedPeople'] ?? null, FILTER_VALIDATE_INT);
            if ($planned === false || $planned < 0 || $planned > 1000000) {
                respond(['error' => 'La cantidad planificada debe ser un entero no negativo.'], 422);
            }
            if ($user['role'] !== 'admin') {
                $photoCheck = $pdo->prepare('SELECT COUNT(*) FROM fotos_asistencia WHERE movilizacion_ente_id = ? AND tipo = \'lista\'');
                $photoCheck->execute([$assignmentId]);
                if ((int) $photoCheck->fetchColumn() < 1) {
                    respond(['error' => 'Toma y guarda al menos una foto de la lista antes de continuar.'], 422);
                }
                $update = $pdo->prepare(
                    'UPDATE movilizacion_entes SET personas_planificadas = ?, plan_confirmado_en = NOW(), transporte_confirmado_en = NULL, datos_confirmados_en = NULL WHERE id = ?'
                );
                $update->execute([$planned, $assignmentId]);
            } else {
                $update = $pdo->prepare('UPDATE movilizacion_entes SET personas_planificadas = ?, plan_confirmado_en = NOW() WHERE id = ?');
                $update->execute([$planned, $assignmentId]);
            }
        } elseif ($step === 'transport') {
            if ($user['role'] !== 'admin') {
                $assignmentState = $pdo->prepare(
                    'SELECT me.plan_confirmado_en, me.punto_llegada_nombre AS assignment_arrival_name, ' .
                    'me.punto_llegada_lat AS assignment_arrival_lat, me.punto_llegada_lng AS assignment_arrival_lng, ' .
                    'm.punto_llegada_nombre AS event_arrival_name, m.punto_llegada_lat AS event_arrival_lat, ' .
                    'm.punto_llegada_lng AS event_arrival_lng ' .
                    'FROM movilizacion_entes me JOIN movilizaciones m ON m.id = me.movilizacion_id WHERE me.id = ?'
                );
                $assignmentState->execute([$assignmentId]);
                $assignment = $assignmentState->fetch();
                if (!$assignment || !$assignment['plan_confirmado_en']) {
                    respond(['error' => 'Completa primero el registro de personas.'], 409);
                }
                $required = $data['requiresTransport'] ?? null;
                $departure = trim((string) ($data['departure'] ?? ''));
                $arrival = (string) ($assignment['event_arrival_name'] ?: $assignment['assignment_arrival_name'] ?: '');
                $startLat = valid_coordinate($data['startLat'] ?? null, true);
                $startLng = valid_coordinate($data['startLng'] ?? null, false);
                $endLat = valid_coordinate($assignment['event_arrival_lat'] ?? null, true)
                    ?? valid_coordinate($assignment['assignment_arrival_lat'] ?? null, true);
                $endLng = valid_coordinate($assignment['event_arrival_lng'] ?? null, false)
                    ?? valid_coordinate($assignment['assignment_arrival_lng'] ?? null, false);
                $distance = filter_var($data['distanceMeters'] ?? null, FILTER_VALIDATE_INT);
                $duration = filter_var($data['durationSeconds'] ?? null, FILTER_VALIDATE_INT);
                $route = $data['routeGeojson'] ?? null;
                $vehicles = $data['vehicles'] ?? [];
                if (!is_bool($required) || mb_strlen($departure) > 180 || $departure === '' ||
                    mb_strlen($arrival) > 180 || $arrival === '' ||
                    $startLat === null || $startLng === null || $endLat === null || $endLng === null ||
                    $distance === false || $distance < 1 || $duration === false || $duration < 1 ||
                    !is_array($route) || ($route['type'] ?? null) !== 'LineString' ||
                    !is_array($route['coordinates'] ?? null) || count($route['coordinates']) < 2 ||
                    count($route['coordinates']) > 10000 || !is_array($vehicles) || count($vehicles) > 20) {
                    respond(['error' => 'Completa el transporte y marca los puntos de salida y llegada para calcular la ruta.'], 422);
                }
                $validatedVehicles = [];
                $vehicleIds = [];
                foreach ($vehicles as $vehicle) {
                    if (!is_array($vehicle)) {
                        respond(['error' => 'Uno de los vehículos no es válido.'], 422);
                    }
                    $type = trim((string) ($vehicle['type'] ?? ''));
                    $count = filter_var($vehicle['count'] ?? null, FILTER_VALIDATE_INT);
                    $plates = trim((string) ($vehicle['plates'] ?? ''));
                    if ($type === '' || mb_strlen($type) > 40 || $count === false || $count < 1 || $count > 1000 || mb_strlen($plates) > 160) {
                        respond(['error' => 'Revisa el tipo, la cantidad y las placas de cada vehículo.'], 422);
                    }
                    $vehicleId = trim((string) ($vehicle['id'] ?? ''));
                    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $vehicleId) || isset($vehicleIds[$vehicleId])) {
                        respond(['error' => 'Cada vehículo debe tener un identificador válido y único.'], 422);
                    }
                    $vehicleIds[$vehicleId] = true;
                    $validatedVehicles[] = ['id' => $vehicleId, 'type' => $type, 'count' => $count, 'plates' => $plates];
                }
                if ($required && $validatedVehicles === []) {
                    respond(['error' => 'Agrega al menos un vehículo o marca que no requiere transporte.'], 422);
                }
                foreach ($route['coordinates'] as $coordinate) {
                    if (!is_array($coordinate) || count($coordinate) < 2 ||
                        valid_coordinate($coordinate[1] ?? null, true) === null ||
                        valid_coordinate($coordinate[0] ?? null, false) === null) {
                        respond(['error' => 'La ruta contiene coordenadas inválidas.'], 422);
                    }
                }
                if ($required) {
                    $photoCheck = $pdo->prepare(
                        'SELECT COUNT(*) FROM fotos_asistencia WHERE movilizacion_ente_id = ? AND tipo = \'vehiculo\' AND vehiculo_id = ?'
                    );
                    foreach ($validatedVehicles as $vehicle) {
                        $photoCheck->execute([$assignmentId, $vehicle['id']]);
                        if ((int) $photoCheck->fetchColumn() < 1) {
                            $vehicleLabel = $vehicle['type'] . ($vehicle['plates'] !== '' ? ' (' . $vehicle['plates'] . ')' : '');
                            respond(['error' => 'Toma y guarda al menos una foto para el vehículo ' . $vehicleLabel . '.'], 422);
                        }
                    }
                }
                $vehicleJson = json_encode($validatedVehicles, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $routeJson = json_encode($route, JSON_UNESCAPED_SLASHES);
                $update = $pdo->prepare(
                    'UPDATE movilizacion_entes SET requiere_transporte = ?, cantidad_autobuses = ?, vehiculos_json = ?, punto_salida = ?, punto_salida_lat = ?, punto_salida_lng = ?, punto_llegada_nombre = ?, punto_llegada_lat = ?, punto_llegada_lng = ?, ruta_personal_geojson = ?, ruta_personal_distancia_metros = ?, ruta_personal_duracion_segundos = ?, transporte_confirmado_en = NOW(), datos_confirmados_en = NULL WHERE id = ?'
                );
                $busCount = array_sum(array_map(
                    static fn (array $vehicle): int => $vehicle['type'] === 'Autobús' ? $vehicle['count'] : 0,
                    $validatedVehicles
                ));
                $update->execute([
                    $required ? 1 : 0, $required ? $busCount : 0, $vehicleJson, $departure,
                    $startLat, $startLng, $arrival, $endLat, $endLng, $routeJson, $distance, $duration, $assignmentId
                ]);
                respond(['message' => 'El transporte y la ruta se guardaron correctamente.']);
            }
            $required = $data['requiresTransport'] ?? null;
            $buses = filter_var($data['buses'] ?? 0, FILTER_VALIDATE_INT);
            $departure = trim((string) ($data['departure'] ?? ''));
            $receiver = trim((string) ($data['receiver'] ?? ''));
            if (!is_bool($required) || $buses === false || $buses < 0 || $buses > 1000 ||
                mb_strlen($departure) > 180 || mb_strlen($receiver) > 140 ||
                ($required && ($buses < 1 || $departure === '' || $receiver === ''))) {
                respond(['error' => 'Indica si necesitas transporte; si es así, completa autobuses, punto de salida y persona que los recibe.'], 422);
            }
            $update = $pdo->prepare(
                'UPDATE movilizacion_entes SET requiere_transporte = ?, cantidad_autobuses = ?, punto_salida = ?, receptor_transporte = ?, transporte_confirmado_en = NOW() WHERE id = ?'
            );
            $update->execute([$required ? 1 : 0, $required ? $buses : 0, $required ? $departure : null, $required ? $receiver : null, $assignmentId]);
        } elseif ($step === 'confirm') {
            if ($user['role'] === 'admin') {
                respond(['error' => 'Esta confirmación solo está disponible para el portal de movilizadores.'], 403);
            }
            $assignmentState = $pdo->prepare(
                'SELECT plan_confirmado_en, transporte_confirmado_en FROM movilizacion_entes WHERE id = ?'
            );
            $assignmentState->execute([$assignmentId]);
            $state = $assignmentState->fetch();
            if (!$state || !$state['plan_confirmado_en'] || !$state['transporte_confirmado_en']) {
                respond(['error' => 'Completa primero las personas, el transporte y la ruta.'], 409);
            }
            $photoCheck = $pdo->prepare('SELECT COUNT(*) FROM fotos_asistencia WHERE movilizacion_ente_id = ? AND tipo = \'grupo\'');
            $photoCheck->execute([$assignmentId]);
            if ((int) $photoCheck->fetchColumn() < 1) {
                respond(['error' => 'Toma y guarda al menos una foto del grupo antes de confirmar.'], 422);
            }
            $pdo->prepare('UPDATE movilizacion_entes SET datos_confirmados_en = NOW() WHERE id = ?')->execute([$assignmentId]);
        } elseif ($step === 'edit') {
            if ($user['role'] === 'admin') {
                respond(['error' => 'Esta acción solo está disponible para el portal de movilizadores.'], 403);
            }
            $activeSession = $pdo->prepare(
                'SELECT COUNT(*) FROM tracking_sesiones WHERE movilizacion_ente_id = ? AND estado = \'en_curso\''
            );
            $activeSession->execute([$assignmentId]);
            if ((int) $activeSession->fetchColumn() > 0) {
                respond(['error' => 'No puedes editar los datos mientras el seguimiento está activo.'], 409);
            }
            $stage = filter_var($data['stage'] ?? null, FILTER_VALIDATE_INT);
            if (!in_array($stage, [1, 2, 3], true)) {
                respond(['error' => 'La etapa solicitada no es válida.'], 422);
            }
            $sql = $stage === 1
                ? 'UPDATE movilizacion_entes SET plan_confirmado_en = NULL, transporte_confirmado_en = NULL, datos_confirmados_en = NULL WHERE id = ?'
                : ($stage === 2
                    ? 'UPDATE movilizacion_entes SET transporte_confirmado_en = NULL, datos_confirmados_en = NULL WHERE id = ?'
                    : 'UPDATE movilizacion_entes SET datos_confirmados_en = NULL WHERE id = ?');
            $pdo->prepare($sql)->execute([$assignmentId]);
        } else {
            $attendees = filter_var($data['attendees'] ?? null, FILTER_VALIDATE_INT);
            if ($attendees === false || $attendees < 0 || $attendees > 1000000) {
                respond(['error' => 'La cantidad de asistentes debe ser un entero no negativo.'], 422);
            }
            $update = $pdo->prepare('UPDATE movilizacion_entes SET personas_asistentes = ?, asistencia_reportada_en = NOW() WHERE id = ?');
            $update->execute([$attendees, $assignmentId]);
        }
        respond(['message' => 'El paso se guardó correctamente.']);
    }

    if ($action === 'photo-upload' && $method === 'POST') {
        if ($user['role'] === 'admin') {
            require_module($user, 'events');
        }
        require_csrf();
        $assignmentId = filter_var($_POST['assignmentId'] ?? null, FILTER_VALIDATE_INT);
        if ($assignmentId === false || $assignmentId < 1) {
            respond(['error' => 'La asignación no es válida.'], 422);
        }
        require_assignment_access($pdo, $user, $assignmentId, 'No tienes permiso para guardar fotos en esta asignación.');
        $photoType = (string) ($_POST['type'] ?? 'asistencia');
        if (!in_array($photoType, ['asistencia', 'lista', 'vehiculo', 'grupo'], true)) {
            respond(['error' => 'La categoría de foto no es válida.'], 422);
        }
        $vehicleId = $photoType === 'vehiculo' ? trim((string) ($_POST['vehicleId'] ?? '')) : null;
        if ($photoType === 'vehiculo' && !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $vehicleId)) {
            respond(['error' => 'Selecciona la fila del vehículo antes de guardar su foto.'], 422);
        }
        $files = $_FILES['photos'] ?? null;
        if (!is_array($files) || !isset($files['name']) || !is_array($files['name'])) {
            respond(['error' => 'Selecciona al menos una foto.'], 422);
        }
        $count = count($files['name']);
        if ($count < 1 || $count > 5) {
            respond(['error' => 'Puedes subir entre 1 y 5 fotos por envío.'], 422);
        }
        $directory = __DIR__ . '/uploads/attendance';
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new RuntimeException('No se pudo crear el directorio de fotos.');
        }
        $mime = new finfo(FILEINFO_MIME_TYPE);
        $allowedTypes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        $insertPhoto = $pdo->prepare('INSERT INTO fotos_asistencia (movilizacion_ente_id, tipo, vehiculo_id, ruta_archivo, nombre_original) VALUES (?, ?, ?, ?, ?)');
        $savedPaths = [];
        $pdo->beginTransaction();
        try {
            for ($index = 0; $index < $count; $index++) {
                $uploadError = $files['error'][$index] ?? UPLOAD_ERR_NO_FILE;
                if ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
                    throw new InvalidArgumentException('Una foto supera el límite de subida del servidor (upload_max_filesize). Intenta con una foto más liviana.');
                }
                if ($uploadError !== UPLOAD_ERR_OK ||
                    !isset($files['tmp_name'][$index], $files['size'][$index]) ||
                    (int) $files['size'][$index] < 1 ||
                    !is_uploaded_file($files['tmp_name'][$index])) {
                    throw new InvalidArgumentException('No se pudo recibir una de las fotos. Vuelve a intentarlo.');
                }
                if ((int) $files['size'][$index] > 25 * 1024 * 1024) {
                    throw new InvalidArgumentException('Cada imagen debe pesar como máximo 25 MB.');
                }
                $type = $mime->file($files['tmp_name'][$index]);
                if (!isset($allowedTypes[$type])) {
                    throw new InvalidArgumentException('Solo se aceptan fotos JPEG, PNG o WebP.');
                }
                $filename = bin2hex(random_bytes(24)) . '.' . $allowedTypes[$type];
                $fullPath = $directory . DIRECTORY_SEPARATOR . $filename;
                if (!move_uploaded_file($files['tmp_name'][$index], $fullPath)) {
                    throw new RuntimeException('No se pudo guardar una foto de asistencia.');
                }
                $relativePath = 'uploads/attendance/' . $filename;
                $savedPaths[] = $fullPath;
                $originalName = mb_substr(basename((string) $files['name'][$index]), 0, 255);
                $insertPhoto->execute([$assignmentId, $photoType, $vehicleId, $relativePath, $originalName]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            foreach ($savedPaths as $savedPath) {
                if (is_file($savedPath)) {
                    unlink($savedPath);
                }
            }
            throw $error;
        }
        respond(['message' => 'Las fotos se guardaron correctamente.']);
    }

    if ($action === 'tracking-start' && $method === 'POST') {
        if ($user['role'] === 'admin') {
            require_module($user, 'tracking');
        }
        require_csrf();
        $data = request_data();
        $assignmentId = filter_var($data['assignmentId'] ?? null, FILTER_VALIDATE_INT);
        $consentAccepted = ($data['consentAccepted'] ?? false) === true;
        $leg = ($data['leg'] ?? 'ida') === 'retorno' ? 'retorno' : 'ida';
        if ($assignmentId === false || $assignmentId < 1 || !$consentAccepted) {
            respond(['error' => 'Confirma tu consentimiento antes de iniciar el tracking.'], 422);
        }
        require_assignment_access($pdo, $user, $assignmentId, 'No tienes permiso para iniciar el tracking de esta movilización.');
        if ($leg === 'retorno') {
            $legState = $pdo->prepare(
                "SELECT " .
                "SUM(tipo = 'ida' AND llegada_confirmada_en IS NOT NULL) AS arrived, " .
                "SUM(estado = 'en_curso') AS running, " .
                "SUM(tipo = 'retorno') AS returns " .
                "FROM tracking_sesiones WHERE movilizacion_ente_id = ?"
            );
            $legState->execute([$assignmentId]);
            $state = $legState->fetch();
            if ((int) ($state['arrived'] ?? 0) < 1) {
                respond(['error' => 'Confirma primero tu llegada al destino para iniciar el retorno.'], 409);
            }
            if ((int) ($state['running'] ?? 0) > 0 || (int) ($state['returns'] ?? 0) > 0) {
                respond(['error' => 'El retorno de esta movilización ya fue iniciado.'], 409);
            }
        } elseif ($user['role'] !== 'admin') {
            $trackingReady = $pdo->prepare(
                'SELECT me.datos_confirmados_en, ' .
                '(SELECT COUNT(*) FROM fotos_asistencia fa WHERE fa.movilizacion_ente_id = me.id AND fa.tipo = \'grupo\') AS group_photos ' .
                'FROM movilizacion_entes me WHERE me.id = ?'
            );
            $trackingReady->execute([$assignmentId]);
            $ready = $trackingReady->fetch();
            if (!$ready || !$ready['datos_confirmados_en'] || (int) $ready['group_photos'] < 1) {
                respond(['error' => 'Confirma los datos y guarda al menos una foto del grupo antes de iniciar el tracking.'], 409);
            }
        }
        $sessionId = bin2hex(random_bytes(16));
        $statement = $pdo->prepare(
            "INSERT INTO tracking_sesiones (movilizacion_ente_id, tipo, identificador_cliente, estado, consentimiento_version, consentimiento_aceptado_en, iniciado_en) " .
            "VALUES (?, ?, ?, 'en_curso', 'route-tracking-v1', NOW(), NOW())"
        );
        $statement->execute([$assignmentId, $leg, $sessionId]);
        respond(['id' => (int) $pdo->lastInsertId(), 'clientId' => $sessionId]);
    }

    if ($action === 'tracking-points' && $method === 'POST') {
        if ($user['role'] === 'admin') {
            require_module($user, 'tracking');
        }
        require_csrf();
        $data = request_data();
        $sessionId = filter_var($data['sessionId'] ?? null, FILTER_VALIDATE_INT);
        $points = $data['points'] ?? null;
        if ($sessionId === false || $sessionId < 1 || !is_array($points) || count($points) < 1 || count($points) > 100) {
            respond(['error' => 'La sesión o el lote de ubicaciones no es válido.'], 422);
        }
        $sessionStatement = $pdo->prepare(
            'SELECT ts.id, me.id AS assignment_id FROM tracking_sesiones ts ' .
            'JOIN movilizacion_entes me ON me.id = ts.movilizacion_ente_id ' .
            'WHERE ts.id = ? AND ts.estado = \'en_curso\''
        );
        $sessionStatement->execute([$sessionId]);
        $trackingSession = $sessionStatement->fetch();
        if (!$trackingSession) {
            respond(['error' => 'La sesión de tracking no está activa o no tienes acceso.'], 403);
        }
        require_assignment_access($pdo, $user, (int) $trackingSession['assignment_id'], 'No tienes acceso a esta sesión de tracking.');
        $sequenceStatement = $pdo->prepare('SELECT COALESCE(MAX(secuencia), 0) FROM tracking_puntos WHERE tracking_sesion_id = ?');
        $sequenceStatement->execute([$sessionId]);
        $sequence = (int) $sequenceStatement->fetchColumn();
        $insertPoint = $pdo->prepare(
            'INSERT INTO tracking_puntos (tracking_sesion_id, secuencia, latitud, longitud, precision_metros, altitud_metros, velocidad_metros_segundo, rumbo_grados, simulado, registrado_en) ' .
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $pdo->beginTransaction();
        try {
            foreach ($points as $point) {
                if (!is_array($point)) {
                    throw new InvalidArgumentException('El lote contiene una ubicación inválida.');
                }
                $latitude = valid_coordinate($point['latitude'] ?? null, true);
                $longitude = valid_coordinate($point['longitude'] ?? null, false);
                $time = filter_var($point['time'] ?? null, FILTER_VALIDATE_INT);
                $accuracy = isset($point['accuracy']) && is_numeric($point['accuracy']) && (float) $point['accuracy'] >= 0
                    ? (float) $point['accuracy'] : null;
                if ($latitude === null || $longitude === null || $time === false || $time < 1) {
                    throw new InvalidArgumentException('El lote contiene coordenadas o fecha inválidas.');
                }
                $date = (new DateTimeImmutable('@' . (int) floor($time / 1000)))->setTimezone(new DateTimeZone('UTC'));
                $insertPoint->execute([
                    $sessionId, ++$sequence, $latitude, $longitude, $accuracy,
                    is_numeric($point['altitude'] ?? null) ? (float) $point['altitude'] : null,
                    is_numeric($point['speed'] ?? null) ? max(0, (float) $point['speed']) : null,
                    is_numeric($point['bearing'] ?? null) ? (float) $point['bearing'] : null,
                    !empty($point['simulated']) ? 1 : 0, $date->format('Y-m-d H:i:s.v')
                ]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        respond(['saved' => count($points)]);
    }

    if ($action === 'tracking-stop' && $method === 'POST') {
        if ($user['role'] === 'admin') {
            require_module($user, 'tracking');
        }
        require_csrf();
        $data = request_data();
        $sessionId = filter_var($data['sessionId'] ?? null, FILTER_VALIDATE_INT);
        if ($sessionId === false || $sessionId < 1 || ($data['arrivalConfirmed'] ?? false) !== true) {
            respond(['error' => 'Confirma tu llegada desde el portal para finalizar el seguimiento.'], 422);
        }
        $sessionStatement = $pdo->prepare(
            'SELECT me.id AS assignment_id, ts.tipo FROM tracking_sesiones ts ' .
            'JOIN movilizacion_entes me ON me.id = ts.movilizacion_ente_id ' .
            'WHERE ts.id = ? AND ts.estado = \'en_curso\''
        );
        $sessionStatement->execute([$sessionId]);
        $trackingSession = $sessionStatement->fetch();
        if (!$trackingSession) {
            respond(['error' => 'No fue posible detener esta sesión; puede que ya esté finalizada.'], 409);
        }
        require_assignment_access($pdo, $user, (int) $trackingSession['assignment_id'], 'No tienes acceso a esta sesión de tracking.');
        $statement = $pdo->prepare(
            "UPDATE tracking_sesiones SET estado = 'finalizada', finalizado_en = NOW(), llegada_confirmada_en = NOW() WHERE id = ? AND estado = 'en_curso'"
        );
        $statement->execute([$sessionId]);
        if ($statement->rowCount() !== 1) {
            respond(['error' => 'No fue posible detener esta sesión; puede que ya esté finalizada o no te pertenezca.'], 409);
        }
        respond(['message' => ($trackingSession['tipo'] ?? 'ida') === 'retorno'
            ? 'Regreso confirmado y tracking finalizado.'
            : 'Llegada confirmada y tracking finalizado.']);
    }

    respond(['error' => 'La acción solicitada no existe.'], 404);
} catch (InvalidArgumentException $error) {
    respond(['error' => $error->getMessage()], 422);
} catch (Throwable $error) {
    error_log('Movilizaciones API error: ' . $error->getMessage());
    respond(['error' => 'Ocurrió un error interno. Revisa la configuración y los registros del servidor.'], 500);
}
