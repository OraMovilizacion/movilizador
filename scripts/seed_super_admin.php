<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/db.php';

$password = getenv('MOV_SUPER_ADMIN_PASSWORD') ?: '';
if (strlen($password) < 8 || strlen($password) > 1024) {
    fwrite(STDERR, "Define MOV_SUPER_ADMIN_PASSWORD con al menos 8 caracteres.\n");
    exit(2);
}

try {
    $pdo = database(load_config());
    $pdo->beginTransaction();
    $existing = $pdo->prepare("SELECT id FROM usuarios WHERE nombre_usuario = 'admin' FOR UPDATE");
    $existing->execute();
    if ($existing->fetchColumn()) {
        $pdo->rollBack();
        fwrite(STDERR, "Ya existe una cuenta con el usuario admin; no se modificó su contraseña.\n");
        exit(1);
    }

    $statement = $pdo->prepare(
        "INSERT INTO usuarios " .
        "(nombre, nombre_usuario, correo, telefono, password_hash, rol, activo) " .
        "VALUES ('Super administrador', 'admin', NULL, NULL, ?, 'admin', 1)"
    );
    $statement->execute([password_hash($password, PASSWORD_DEFAULT)]);
    $pdo->commit();
    putenv('MOV_SUPER_ADMIN_PASSWORD');
    fwrite(STDOUT, "Cuenta superadministradora creada correctamente.\n");
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    putenv('MOV_SUPER_ADMIN_PASSWORD');
    fwrite(STDERR, "No se pudo crear la cuenta superadministradora. Revisa la migración y la conexión a la base.\n");
    error_log('Create super admin error: ' . $error->getMessage());
    exit(1);
}
