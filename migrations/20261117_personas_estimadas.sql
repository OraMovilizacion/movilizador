USE movilizaciones;

ALTER TABLE movilizaciones
  ADD COLUMN IF NOT EXISTS personas_estimadas_movilizar INT UNSIGNED NULL
  AFTER hora_inicio;
