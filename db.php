<?php
declare(strict_types=1);

function load_config(): array
{
    $localConfig = __DIR__ . '/config.local.php';
    $config = is_file($localConfig) ? require $localConfig : [];
    if (!is_array($config)) {
        throw new RuntimeException('La configuración local debe devolver un arreglo.');
    }

    foreach ([
        'db_host' => 'MOV_DB_HOST',
        'db_port' => 'MOV_DB_PORT',
        'db_name' => 'MOV_DB_NAME',
        'db_user' => 'MOV_DB_USER',
        'db_password' => 'MOV_DB_PASSWORD',
        'app_secret' => 'MOV_APP_SECRET'
    ] as $key => $environmentKey) {
        $environmentValue = getenv($environmentKey);
        if ($environmentValue !== false && $environmentValue !== '') {
            $config[$key] = $environmentValue;
        }
    }

    foreach (['db_host', 'db_name', 'db_user', 'db_password', 'app_secret'] as $requiredKey) {
        if (!isset($config[$requiredKey]) || $config[$requiredKey] === '') {
            throw new RuntimeException('Falta configurar la base de datos o el secreto de la aplicación.');
        }
    }
    if (strlen((string) $config['app_secret']) < 32) {
        throw new RuntimeException('El secreto de la aplicación debe tener al menos 32 caracteres.');
    }
    $config['db_port'] = (int) ($config['db_port'] ?? 3306);
    return $config;
}

function database(array $config): PDO
{
    return new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_port'], $config['db_name']),
        $config['db_user'],
        $config['db_password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
}
