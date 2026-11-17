<?php
declare(strict_types=1);

function load_config(): array
{
    $config = [];
    $projectConfig = __DIR__ . '/config.php';
    if (is_file($projectConfig)) {
        $config = require $projectConfig;
        if (!is_array($config)) {
            throw new RuntimeException('El archivo config.php debe devolver un arreglo.');
        }
    }

    $localConfig = __DIR__ . '/config.local.php';
    if (is_file($localConfig)) {
        $localValues = require $localConfig;
        if (!is_array($localValues)) {
            throw new RuntimeException('El archivo config.local.php debe devolver un arreglo.');
        }
        $config = array_replace($config, $localValues);
    }

    $externalConfig = getenv('MOV_CONFIG_FILE');
    if ($externalConfig !== false && $externalConfig !== '') {
        $externalValues = is_file($externalConfig) ? require $externalConfig : null;
        if (!is_array($externalValues)) {
            throw new RuntimeException('El archivo indicado por MOV_CONFIG_FILE debe existir y devolver un arreglo.');
        }
        $config = array_replace($config, $externalValues);
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

    foreach (['db_host', 'db_name', 'db_user', 'app_secret'] as $requiredKey) {
        if (!array_key_exists($requiredKey, $config) || trim((string) $config[$requiredKey]) === '') {
            throw new RuntimeException('Falta configurar la base de datos o el secreto de la aplicación.');
        }
    }
    if (!array_key_exists('db_password', $config)) {
        $config['db_password'] = '';
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
