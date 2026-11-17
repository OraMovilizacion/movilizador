USE movilizaciones;

-- Cada sesión de tracking pertenece a un tramo: 'ida' (salida -> destino)
-- o 'retorno' (destino -> punto de salida). Las sesiones existentes son de ida.
ALTER TABLE tracking_sesiones
  ADD COLUMN IF NOT EXISTS tipo ENUM('ida', 'retorno') NOT NULL DEFAULT 'ida'
  AFTER movilizacion_ente_id;
