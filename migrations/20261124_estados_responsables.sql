USE movilizaciones;

-- ============================================================================
-- Estructura estadal y responsables de movilización (Dirección Nacional de
-- Movilización · ORA). Fuente: «Responsables de Movilización Estadales»,
-- actualizado con el Excel de seguimiento.
--
--   1. Crea/actualiza la unidad nacional y los 24 estados (idempotente).
--   2. Crea la cuenta de movilizador de cada estado que ya tiene responsable.
--
-- Puede ejecutarse más de una vez: no duplica estados ni cuentas existentes.
-- No se carga el estimado de personas ni los municipios (usa
-- scripts/seed_territories.php para los municipios).
--
-- CONTRASEÑAS: las cuentas se crean con un valor de contraseña no válido
-- ('!'), por lo que nadie puede iniciar sesión hasta que un administrador
-- asigne una contraseña en Estructura > Editar. SQL no puede generar el hash.
-- ============================================================================

START TRANSACTION;

-- 1. Estructura territorial -------------------------------------------------
INSERT INTO unidades_territoriales (codigo, nombre, nivel, padre_id, activo)
VALUES ('VE00', 'Venezuela', 'nacional', NULL, 1)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), nivel = VALUES(nivel), activo = 1;

SET @nacional_id = (SELECT id FROM unidades_territoriales WHERE codigo = 'VE00');

INSERT INTO unidades_territoriales (codigo, nombre, nivel, padre_id, activo) VALUES
  ('VE01', 'Distrito Capital', 'estadal', @nacional_id, 1),
  ('VE02', 'Amazonas', 'estadal', @nacional_id, 1),
  ('VE03', 'Anzoátegui', 'estadal', @nacional_id, 1),
  ('VE04', 'Apure', 'estadal', @nacional_id, 1),
  ('VE05', 'Aragua', 'estadal', @nacional_id, 1),
  ('VE06', 'Barinas', 'estadal', @nacional_id, 1),
  ('VE07', 'Bolívar', 'estadal', @nacional_id, 1),
  ('VE08', 'Carabobo', 'estadal', @nacional_id, 1),
  ('VE09', 'Cojedes', 'estadal', @nacional_id, 1),
  ('VE10', 'Delta Amacuro', 'estadal', @nacional_id, 1),
  ('VE11', 'Falcón', 'estadal', @nacional_id, 1),
  ('VE12', 'Guárico', 'estadal', @nacional_id, 1),
  ('VE13', 'Lara', 'estadal', @nacional_id, 1),
  ('VE14', 'Mérida', 'estadal', @nacional_id, 1),
  ('VE15', 'Miranda', 'estadal', @nacional_id, 1),
  ('VE16', 'Monagas', 'estadal', @nacional_id, 1),
  ('VE17', 'Nueva Esparta', 'estadal', @nacional_id, 1),
  ('VE18', 'Portuguesa', 'estadal', @nacional_id, 1),
  ('VE19', 'Sucre', 'estadal', @nacional_id, 1),
  ('VE20', 'Táchira', 'estadal', @nacional_id, 1),
  ('VE21', 'Trujillo', 'estadal', @nacional_id, 1),
  ('VE22', 'Yaracuy', 'estadal', @nacional_id, 1),
  ('VE23', 'Zulia', 'estadal', @nacional_id, 1),
  ('VE24', 'La Guaira', 'estadal', @nacional_id, 1)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), nivel = VALUES(nivel), padre_id = VALUES(padre_id), activo = 1;

-- 2. Responsables estadales -------------------------------------------------
-- Anzoátegui: Alexander Atopo
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Alexander Atopo', 'alextopo65@gmail.com', '04248191884', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE03'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04248191884' OR u.correo = 'alextopo65@gmail.com');

-- Apure: Alejandra Muñoz
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Alejandra Muñoz', 'ale2022ee@gmail.com', '04165586335', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE04'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04165586335' OR u.correo = 'ale2022ee@gmail.com');

-- Aragua: Ramón Liriano
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Ramón Liriano', 'Antonio77.Morrobel@gmail.com', '04241294679', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE05'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04241294679' OR u.correo = 'Antonio77.Morrobel@gmail.com');

-- Barinas: Alejandro Garrido
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Alejandro Garrido', 'garridoalejandei@gmail.com', '04125041680', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE06'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04125041680' OR u.correo = 'garridoalejandei@gmail.com');

-- Bolívar: Sherllys Tovar
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Sherllys Tovar', 'sherllyscarolina@gmail.com', '04249116056', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE07'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04249116056' OR u.correo = 'sherllyscarolina@gmail.com');

-- Delta Amacuro: Luis Carrasquel
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Luis Carrasquel', 'lcarrasquel447@gmail.com', '04160945885', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE10'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04160945885' OR u.correo = 'lcarrasquel447@gmail.com');

-- Falcón: Mileidy González
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Mileidy González', 'yaquelingonzale027@gmail.com', '04121344235', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE11'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04121344235' OR u.correo = 'yaquelingonzale027@gmail.com');

-- Guárico: Oscar Gonzalez
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Oscar Gonzalez', 'oags2021@gmail.com', '04243513411', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE12'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04243513411' OR u.correo = 'oags2021@gmail.com');

-- Lara: Daniela Izaga
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Daniela Izaga', NULL, '04245141396', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE13'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04245141396');

-- Mérida: Aymar Marquina
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Aymar Marquina', NULL, '04121336565', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE14'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04121336565');

-- Portuguesa: Amado Bonilla
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Amado Bonilla', NULL, '04122784122', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE18'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04122784122');

-- Sucre: William Blanco
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'William Blanco', 'williamblanco236@gmail.com', '04248667744', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE19'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04248667744' OR u.correo = 'williamblanco236@gmail.com');

-- Táchira: Dixon Chacón
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Dixon Chacón', 'dachg1317@gmail.com', '04147385916', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE20'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04147385916' OR u.correo = 'dachg1317@gmail.com');

-- Zulia: Gerardo Rondón
INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, unidad_territorial_id, activo)
SELECT 'Gerardo Rondón', 'respaldodedios28@gmail.com', '04247303440', '!', 'responsable', t.id, 1
FROM unidades_territoriales t
WHERE t.codigo = 'VE23'
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.unidad_territorial_id = t.id OR u.telefono = '04247303440' OR u.correo = 'respaldodedios28@gmail.com');

COMMIT;

-- Verificación: estados con y sin responsable
SELECT t.codigo, t.nombre AS estado, u.nombre AS responsable, u.telefono, u.correo
FROM unidades_territoriales t
LEFT JOIN usuarios u ON u.unidad_territorial_id = t.id AND u.rol = 'responsable'
WHERE t.nivel = 'estadal'
ORDER BY t.nombre;
