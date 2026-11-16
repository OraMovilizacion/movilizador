USE movilizaciones;

ALTER TABLE tracking_sesiones
  ADD COLUMN IF NOT EXISTS llegada_confirmada_en DATETIME NULL
  AFTER finalizado_en;

ALTER TABLE fotos_asistencia
  ADD COLUMN IF NOT EXISTS vehiculo_id VARCHAR(64) NULL
  AFTER tipo,
  ADD KEY idx_fotos_asistencia_vehiculo (movilizacion_ente_id, vehiculo_id);
