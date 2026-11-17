USE movilizaciones;

INSERT INTO usuarios
  (nombre, nombre_usuario, correo, telefono, password_hash, rol, rol_sistema_id, unidad_territorial_id, activo)
VALUES
  (
    'Super administrador',
    'Admin',
    NULL,
    NULL,
    '$2y$10$QnmLMZU9OXOTti50XmZYgu9eZrQqWoBWdx/OgBs9zbnmsv89K3y0.',
    'admin',
    NULL,
    NULL,
    1
  )
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  nombre_usuario = VALUES(nombre_usuario),
  password_hash = VALUES(password_hash),
  rol = 'admin',
  rol_sistema_id = NULL,
  activo = 1;
