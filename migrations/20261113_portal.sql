USE movilizaciones;

ALTER TABLE movilizaciones
  ADD COLUMN IF NOT EXISTS punto_partida_nombre VARCHAR(180) NULL,
  ADD COLUMN IF NOT EXISTS punto_partida_lat DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS punto_partida_lng DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS punto_llegada_nombre VARCHAR(180) NULL,
  ADD COLUMN IF NOT EXISTS punto_llegada_lat DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS punto_llegada_lng DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS ruta_ideal_geojson LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS ruta_distancia_metros INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS ruta_duracion_segundos INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS creado_por BIGINT UNSIGNED NULL;

ALTER TABLE movilizacion_entes
  ADD COLUMN IF NOT EXISTS responsable_usuario_id BIGINT UNSIGNED NULL;

ALTER TABLE movilizaciones
  ADD CONSTRAINT fk_movilizaciones_creado_por
    FOREIGN KEY (creado_por) REFERENCES usuarios (id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE movilizacion_entes
  ADD CONSTRAINT fk_movilizacion_entes_usuario
    FOREIGN KEY (responsable_usuario_id) REFERENCES usuarios (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
