USE movilizaciones;

ALTER TABLE movilizacion_entes
  ADD COLUMN IF NOT EXISTS personas_lista_ocr INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS vehiculos_json LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS punto_salida_lat DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS punto_salida_lng DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS punto_llegada_nombre VARCHAR(180) NULL,
  ADD COLUMN IF NOT EXISTS punto_llegada_lat DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS punto_llegada_lng DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS ruta_personal_geojson LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS ruta_personal_distancia_metros INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS ruta_personal_duracion_segundos INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS datos_confirmados_en DATETIME NULL;

ALTER TABLE fotos_asistencia
  ADD COLUMN IF NOT EXISTS tipo ENUM('asistencia', 'lista', 'vehiculo', 'grupo') NOT NULL DEFAULT 'asistencia'
  AFTER movilizacion_ente_id;
