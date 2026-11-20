USE movilizaciones;

-- ============================================================================
-- Organizaciones de la estructura.
--
-- Cada organización tiene su propio responsable nacional y sus responsables
-- estadales/municipales. Las cuentas que ya existían quedan en «ORA».
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizaciones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organizaciones_codigo (codigo)
) ENGINE=InnoDB;

INSERT INTO organizaciones (codigo, nombre, orden) VALUES
  ('ORA', 'ORA', 1),
  ('ORA_JUVENTUD', 'ORA JUVENTUD', 2),
  ('MUJERES_AUTORIDAD_GOBIERNO', 'MUJERES DE AUTORIDAD Y GOBIERNO', 3),
  ('CTU', 'CTU', 4),
  ('SOCIAL_CRISTIANO', 'SOCIAL CRISTIANO', 5),
  ('CONSEJO_PASTORAL_CARACAS', 'CONSEJO PASTORAL DE CARACAS', 6),
  ('CONSEJO_PASTORAL_MIRANDA', 'CONSEJO PASTORAL DE MIRANDA', 7),
  ('MESA_MINISTERIAL', 'MESA MINISTERIAL', 8)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), orden = VALUES(orden);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS organizacion_id INT UNSIGNED NULL AFTER unidad_territorial_id;

-- Las cuentas responsables existentes pertenecen a ORA.
UPDATE usuarios
SET organizacion_id = (SELECT id FROM organizaciones WHERE codigo = 'ORA')
WHERE rol = 'responsable' AND unidad_territorial_id IS NOT NULL AND organizacion_id IS NULL;

ALTER TABLE usuarios
  ADD CONSTRAINT IF NOT EXISTS fk_usuarios_organizacion
    FOREIGN KEY (organizacion_id) REFERENCES organizaciones (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Antes: una sola cuenta por unidad territorial. Ahora: una por unidad y organización.
ALTER TABLE usuarios
  ADD UNIQUE INDEX IF NOT EXISTS uq_usuarios_unidad_organizacion (unidad_territorial_id, organizacion_id);
ALTER TABLE usuarios
  DROP INDEX IF EXISTS uq_usuarios_unidad_territorial;

SELECT o.nombre, COUNT(u.id) AS cuentas
FROM organizaciones o LEFT JOIN usuarios u ON u.organizacion_id = o.id
GROUP BY o.id ORDER BY o.orden;
