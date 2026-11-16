USE movilizaciones;

CREATE TABLE IF NOT EXISTS unidades_territoriales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(10) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  nivel ENUM('nacional', 'estadal', 'municipal') NOT NULL,
  padre_id BIGINT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_unidades_territoriales_codigo (codigo),
  KEY idx_unidades_territoriales_padre_nivel (padre_id, nivel, activo),
  CONSTRAINT fk_unidades_territoriales_padre
    FOREIGN KEY (padre_id) REFERENCES unidades_territoriales (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS telefono VARCHAR(20) NULL AFTER correo,
  MODIFY correo VARCHAR(190) NULL,
  ADD COLUMN IF NOT EXISTS unidad_territorial_id BIGINT UNSIGNED NULL,
  ADD UNIQUE KEY uq_usuarios_telefono (telefono),
  ADD UNIQUE KEY uq_usuarios_unidad_territorial (unidad_territorial_id);

ALTER TABLE usuarios
  ADD CONSTRAINT fk_usuarios_unidad_territorial
    FOREIGN KEY (unidad_territorial_id) REFERENCES unidades_territoriales (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE movilizaciones
  ADD COLUMN IF NOT EXISTS unidad_territorial_id BIGINT UNSIGNED NULL,
  ADD KEY idx_movilizaciones_unidad_territorial (unidad_territorial_id, fecha);

ALTER TABLE movilizaciones
  ADD CONSTRAINT fk_movilizaciones_unidad_territorial
    FOREIGN KEY (unidad_territorial_id) REFERENCES unidades_territoriales (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
