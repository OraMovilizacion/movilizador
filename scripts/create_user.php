<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/db.php';

if ($argc !== 4 && $argc !== 5) {
    fwrite(STDERR, "Uso: php scripts/create_user.php \"Nombre\" \"+584121234567\" responsable [correo@dominio.com]\n");
    exit(2);
}

[$script, $name, $phone, $role] = $argv;
$email = $argv[4] ?? '';
$name = trim($name);
$phone = preg_replace('/[\s().-]+/', '', trim($phone));
$email = strtolower(trim($email));
$password = getenv('MOV_NEW_USER_PASSWORD') ?: '';

if (!is_string($phone) || !preg_match('/^\+?\d{7,20}$/', $phone) ||
    $name === '' || mb_strlen($name) > 140 ||
    ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190)) ||
    $role !== 'responsable' || strlen($password) < 8) {
    fwrite(STDERR, "Datos inválidos. Este comando solo crea cuentas de movilizador; crea cuentas administrativas en Configuración. La contraseña debe tener al menos 8 caracteres y enviarse en MOV_NEW_USER_PASSWORD.\n");
    exit(2);
}

try {
    $pdo = database(load_config());
    $statement = $pdo->prepare(
        'INSERT INTO usuarios (nombre, nombre_usuario, correo, telefono, password_hash, rol) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $name,
        null,
        $email !== '' ? $email : null,
        $phone,
        password_hash($password, PASSWORD_DEFAULT),
        $role
    ]);
    putenv('MOV_NEW_USER_PASSWORD');
    fwrite(STDOUT, "Usuario creado correctamente: {$phone} ({$role}).\n");
} catch (Throwable $error) {
    fwrite(STDERR, "No se pudo crear el usuario. Revisa la configuración, el esquema y que el teléfono o correo no estén registrados.\n");
    error_log('Create user error: ' . $error->getMessage());
    exit(1);
}
