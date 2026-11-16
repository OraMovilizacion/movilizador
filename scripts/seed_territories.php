<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/db.php';

try {
    $pdo = database(load_config());
    $file = fopen(dirname(__DIR__) . '/data/venezuela_territories.csv', 'rb');
    if ($file === false) {
        throw new RuntimeException('No se pudo abrir data/venezuela_territories.csv.');
    }

    try {
        $headers = fgetcsv($file);
        if ($headers !== ['codigo', 'nivel', 'nombre', 'codigo_padre']) {
            throw new RuntimeException('La cabecera de data/venezuela_territories.csv no es válida.');
        }

        $states = [];
        $municipalities = [];
        $seen = [];
        while (($row = fgetcsv($file)) !== false) {
            if (count($row) !== 4) {
                throw new RuntimeException('El archivo territorial contiene una fila incompleta.');
            }

            [$code, $level, $name, $parentCode] = $row;
            if ($code === '' || $name === '' || isset($seen[$code]) ||
                !in_array($level, ['estadal', 'municipal'], true)) {
                throw new RuntimeException("La fila territorial {$code} contiene datos inválidos o duplicados.");
            }
            $seen[$code] = true;
            $unit = ['codigo' => $code, 'nombre' => $name, 'codigo_padre' => $parentCode];

            if ($level === 'estadal' && $parentCode === '') {
                $states[] = $unit;
            } elseif ($level === 'municipal' && $parentCode !== '') {
                $municipalities[] = $unit;
            } else {
                throw new RuntimeException("La jerarquía de la fila {$code} no es válida.");
            }
        }
    } finally {
        fclose($file);
    }

    if (count($states) !== 24 || count($municipalities) !== 335) {
        throw new RuntimeException(sprintf(
            'Se esperaban 24 estados y 335 municipios; el archivo contiene %d estados y %d municipios.',
            count($states),
            count($municipalities)
        ));
    }

    $stateCodes = array_column($states, 'codigo');
    foreach ($municipalities as $municipality) {
        if (!in_array($municipality['codigo_padre'], $stateCodes, true)) {
            throw new RuntimeException("El municipio {$municipality['codigo']} referencia un estado inexistente.");
        }
    }

    $pdo->beginTransaction();
    $saveUnit = $pdo->prepare(
        'INSERT INTO unidades_territoriales (codigo, nombre, nivel, padre_id, activo) VALUES (?, ?, ?, ?, 1) ' .
        'ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), nivel = VALUES(nivel), padre_id = VALUES(padre_id), activo = 1'
    );
    $findUnit = $pdo->prepare('SELECT id FROM unidades_territoriales WHERE codigo = ?');

    $saveUnit->execute(['VE00', 'Venezuela', 'nacional', null]);
    $nationalId = (int) $pdo->lastInsertId();
    if ($nationalId === 0) {
        $findUnit->execute(['VE00']);
        $nationalId = (int) $findUnit->fetchColumn();
    }

    $stateIds = [];
    foreach ($states as $state) {
        $saveUnit->execute([$state['codigo'], $state['nombre'], 'estadal', $nationalId]);
        $stateId = (int) $pdo->lastInsertId();
        if ($stateId === 0) {
            $findUnit->execute([$state['codigo']]);
            $stateId = (int) $findUnit->fetchColumn();
        }
        $stateIds[$state['codigo']] = $stateId;
    }

    foreach ($municipalities as $municipality) {
        $saveUnit->execute([
            $municipality['codigo'],
            $municipality['nombre'],
            'municipal',
            $stateIds[$municipality['codigo_padre']]
        ]);
    }

    $counts = $pdo->query(
        "SELECT nivel, COUNT(*) AS cantidad FROM unidades_territoriales " .
        "WHERE nivel IN ('nacional', 'estadal', 'municipal') GROUP BY nivel"
    )->fetchAll(PDO::FETCH_KEY_PAIR);
    if ((int) ($counts['nacional'] ?? 0) !== 1 || (int) ($counts['estadal'] ?? 0) !== 24 ||
        (int) ($counts['municipal'] ?? 0) !== 335) {
        throw new RuntimeException('La cantidad de territorios persistidos no coincide con los datos del país.');
    }

    $pdo->commit();
    fwrite(STDOUT, "Estructura creada/actualizada: 1 movilizador nacional, 24 estadales y 335 municipales.\n");
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "No se pudo cargar la estructura territorial: {$error->getMessage()}\n");
    error_log('Seed territorial structure error: ' . $error->getMessage());
    exit(1);
}
