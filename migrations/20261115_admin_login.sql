USE movilizaciones;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS nombre_usuario VARCHAR(80) NULL,
  ADD UNIQUE KEY uq_usuarios_nombre_usuario (nombre_usuario);

UPDATE usuarios
SET nombre_usuario = telefono
WHERE rol = 'admin' AND nombre_usuario IS NULL AND telefono IS NOT NULL;
