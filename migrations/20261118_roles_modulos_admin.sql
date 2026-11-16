USE movilizaciones;

CREATE TABLE IF NOT EXISTS roles_sistema (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_sistema_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles_sistema_modulos (
  rol_sistema_id BIGINT UNSIGNED NOT NULL,
  modulo VARCHAR(32) NOT NULL,
  PRIMARY KEY (rol_sistema_id, modulo),
  CONSTRAINT fk_roles_sistema_modulos_rol
    FOREIGN KEY (rol_sistema_id) REFERENCES roles_sistema (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS rol_sistema_id BIGINT UNSIGNED NULL;

ALTER TABLE usuarios
  ADD CONSTRAINT fk_usuarios_rol_sistema
    FOREIGN KEY (rol_sistema_id) REFERENCES roles_sistema (id)
    ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO roles_sistema (nombre, descripcion)
VALUES ('Administrador general', 'Acceso a todos los módulos administrativos.')
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);

SET @admin_general_role_id = LAST_INSERT_ID();

INSERT IGNORE INTO roles_sistema_modulos (rol_sistema_id, modulo)
VALUES
  (@admin_general_role_id, 'tracking'),
  (@admin_general_role_id, 'events'),
  (@admin_general_role_id, 'statistics'),
  (@admin_general_role_id, 'structure'),
  (@admin_general_role_id, 'reports'),
  (@admin_general_role_id, 'settings');

UPDATE usuarios
SET rol_sistema_id = @admin_general_role_id
WHERE rol = 'admin'
  AND (nombre_usuario IS NULL OR nombre_usuario <> 'admin')
  AND rol_sistema_id IS NULL;
