USE movilizaciones;

-- ============================================================================
-- Responsables estadales que faltaban por cargar (Dirección Nacional de
-- Movilización · ORA, «Responsables de Movilización Estadales»).
--
--   1. Agrega los responsables de Carabobo, Distrito Capital, Miranda,
--      Monagas y Yaracuy.
--   2. Completa el correo de Lara (Daniela Izaga) si estaba vacío.
--
-- Requiere que ya exista la estructura de estados (20261124_estados_responsables.sql).
-- Idempotente: no duplica cuentas ni pisa datos ya cargados.
-- Las cuentas nuevas quedan con contraseña '!' hasta ejecutar
-- 20261126_passwords_responsables.sql.
--
-- Siguen sin responsable en el PDF: Amazonas, Cojedes, La Guaira,
-- Nueva Esparta y Trujillo.
-- ============================================================================

START TRANSACTION;

-- Carabobo: Maribel Veliz
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Maribel Veliz', NULL, '04244046164', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE08'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04244046164');

-- Distrito Capital: Eddy Aponte
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Eddy Aponte', 'eddymanta7@gmail.com', '04141107339', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE01'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04141107339' OR u.correo = 'eddymanta7@gmail.com');

-- Miranda: Manuel Ruíz
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Manuel Ruíz', 'munuelalcala855@gmail.com', '04123636241', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE15'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04123636241' OR u.correo = 'munuelalcala855@gmail.com');

-- Monagas: Alexander Morelli
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Alexander Morelli', 'alexandermorell635@gmail.com', '04128951773', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE16'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04128951773' OR u.correo = 'alexandermorell635@gmail.com');

-- Yaracuy: Bartolo Antonio Sánchez
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Bartolo Antonio Sánchez', 'granjalosdoslobos@gmail.com', '04267598561', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE22'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04267598561' OR u.correo = 'granjalosdoslobos@gmail.com');

-- Lara: correo de Daniela Izaga (solo si no tenía)
UPDATE usuarios u
JOIN unidades_territoriales t ON t.id = u.unidad_territorial_id AND t.codigo = 'VE13'
SET u.correo = 'izaga31@gmail.com'
WHERE u.correo IS NULL
  AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM usuarios WHERE correo = 'izaga31@gmail.com') x);

COMMIT;

-- Verificación: estados con y sin responsable
SELECT t.codigo, t.nombre AS estado, u.nombre AS responsable, u.telefono, u.correo
FROM unidades_territoriales t
LEFT JOIN usuarios u ON u.unidad_territorial_id = t.id AND u.rol = 'responsable'
WHERE t.nivel = 'estadal'
ORDER BY t.nombre;
