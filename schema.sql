CREATE DATABASE IF NOT EXISTS movilizaciones
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(140) NOT NULL,
  nombre_usuario VARCHAR(80) NULL,
  correo VARCHAR(190) NULL,
  telefono VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'responsable') NOT NULL DEFAULT 'responsable',
  rol_sistema_id BIGINT UNSIGNED NULL,
  unidad_territorial_id BIGINT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_nombre_usuario (nombre_usuario),
  UNIQUE KEY uq_usuarios_correo (correo),
  UNIQUE KEY uq_usuarios_telefono (telefono),
  UNIQUE KEY uq_usuarios_unidad_territorial (unidad_territorial_id),
  KEY idx_usuarios_rol_activo (rol, activo),
  CONSTRAINT fk_usuarios_rol_sistema
    FOREIGN KEY (rol_sistema_id) REFERENCES roles_sistema (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

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
  ADD CONSTRAINT fk_usuarios_unidad_territorial
    FOREIGN KEY (unidad_territorial_id) REFERENCES unidades_territoriales (id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS intentos_login (
  llave CHAR(64) NOT NULL,
  intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  inicio_ventana DATETIME NOT NULL,
  bloqueado_hasta DATETIME NULL,
  PRIMARY KEY (llave),
  KEY idx_intentos_login_bloqueado (bloqueado_hasta)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movilizaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(140) NOT NULL,
  descripcion TEXT NULL,
  fecha DATE NOT NULL,
  hora_inicio TIME NULL,
  personas_estimadas_movilizar INT UNSIGNED NULL,
  hora_fin TIME NULL,
  lugar VARCHAR(180) NOT NULL,
  unidad_territorial_id BIGINT UNSIGNED NULL,
  estado ENUM('planificada', 'en_curso', 'finalizada', 'cancelada') NOT NULL DEFAULT 'planificada',
  punto_partida_nombre VARCHAR(180) NULL,
  punto_partida_lat DECIMAL(10, 7) NULL,
  punto_partida_lng DECIMAL(10, 7) NULL,
  punto_llegada_nombre VARCHAR(180) NULL,
  punto_llegada_lat DECIMAL(10, 7) NULL,
  punto_llegada_lng DECIMAL(10, 7) NULL,
  ruta_ideal_geojson LONGTEXT NULL,
  ruta_distancia_metros INT UNSIGNED NULL,
  ruta_duracion_segundos INT UNSIGNED NULL,
  creado_por BIGINT UNSIGNED NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_movilizaciones_fecha_estado (fecha, estado),
  KEY idx_movilizaciones_unidad_territorial (unidad_territorial_id, fecha),
  CONSTRAINT fk_movilizaciones_unidad_territorial
    FOREIGN KEY (unidad_territorial_id) REFERENCES unidades_territoriales (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movilizaciones_creado_por
    FOREIGN KEY (creado_por) REFERENCES usuarios (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS entes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_entes_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS responsables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(140) NOT NULL,
  telefono VARCHAR(30) NULL,
  correo VARCHAR(190) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_responsables_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movilizacion_entes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movilizacion_id BIGINT UNSIGNED NOT NULL,
  ente_id BIGINT UNSIGNED NOT NULL,
  responsable_id BIGINT UNSIGNED NULL,
  responsable_usuario_id BIGINT UNSIGNED NULL,
  cuota_personas INT UNSIGNED NULL,
  personas_planificadas INT UNSIGNED NULL,
  personas_lista_ocr INT UNSIGNED NULL,
  plan_confirmado_en DATETIME NULL,
  requiere_transporte TINYINT(1) NULL,
  cantidad_autobuses SMALLINT UNSIGNED NULL,
  vehiculos_json LONGTEXT NULL,
  punto_salida VARCHAR(180) NULL,
  punto_salida_lat DECIMAL(10, 7) NULL,
  punto_salida_lng DECIMAL(10, 7) NULL,
  punto_llegada_nombre VARCHAR(180) NULL,
  punto_llegada_lat DECIMAL(10, 7) NULL,
  punto_llegada_lng DECIMAL(10, 7) NULL,
  ruta_personal_geojson LONGTEXT NULL,
  ruta_personal_distancia_metros INT UNSIGNED NULL,
  ruta_personal_duracion_segundos INT UNSIGNED NULL,
  receptor_transporte VARCHAR(140) NULL,
  transporte_confirmado_en DATETIME NULL,
  datos_confirmados_en DATETIME NULL,
  personas_asistentes INT UNSIGNED NULL,
  asistencia_reportada_en DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_movilizacion_ente (movilizacion_id, ente_id),
  KEY idx_movilizacion_entes_responsable (responsable_id),
  CONSTRAINT fk_movilizacion_entes_movilizacion
    FOREIGN KEY (movilizacion_id) REFERENCES movilizaciones (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_movilizacion_entes_ente
    FOREIGN KEY (ente_id) REFERENCES entes (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_movilizacion_entes_responsable
    FOREIGN KEY (responsable_id) REFERENCES responsables (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_movilizacion_entes_usuario
    FOREIGN KEY (responsable_usuario_id) REFERENCES usuarios (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tracking_sesiones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movilizacion_ente_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('ida', 'retorno') NOT NULL DEFAULT 'ida',
  identificador_cliente CHAR(36) NOT NULL,
  estado ENUM('en_curso', 'finalizada', 'interrumpida') NOT NULL DEFAULT 'en_curso',
  consentimiento_version VARCHAR(32) NOT NULL,
  consentimiento_aceptado_en DATETIME NOT NULL,
  iniciado_en DATETIME NOT NULL,
  finalizado_en DATETIME NULL,
  llegada_confirmada_en DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tracking_sesiones_cliente (identificador_cliente),
  KEY idx_tracking_sesiones_ente_fecha (movilizacion_ente_id, iniciado_en),
  CONSTRAINT fk_tracking_sesiones_movilizacion_ente
    FOREIGN KEY (movilizacion_ente_id) REFERENCES movilizacion_entes (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tracking_puntos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tracking_sesion_id BIGINT UNSIGNED NOT NULL,
  secuencia INT UNSIGNED NOT NULL,
  latitud DECIMAL(10, 7) NOT NULL,
  longitud DECIMAL(10, 7) NOT NULL,
  precision_metros DECIMAL(8, 2) NULL,
  altitud_metros DECIMAL(9, 2) NULL,
  velocidad_metros_segundo DECIMAL(8, 3) NULL,
  rumbo_grados DECIMAL(7, 3) NULL,
  simulado TINYINT(1) NOT NULL DEFAULT 0,
  registrado_en DATETIME(3) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tracking_puntos_secuencia (tracking_sesion_id, secuencia),
  KEY idx_tracking_puntos_sesion_fecha (tracking_sesion_id, registrado_en),
  CONSTRAINT fk_tracking_puntos_sesion
    FOREIGN KEY (tracking_sesion_id) REFERENCES tracking_sesiones (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fotos_asistencia (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movilizacion_ente_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('asistencia', 'lista', 'vehiculo', 'grupo') NOT NULL DEFAULT 'asistencia',
  vehiculo_id VARCHAR(64) NULL,
  ruta_archivo VARCHAR(500) NOT NULL,
  nombre_original VARCHAR(255) NULL,
  subido_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fotos_asistencia_movilizacion_ente (movilizacion_ente_id),
  KEY idx_fotos_asistencia_vehiculo (movilizacion_ente_id, vehiculo_id),
  CONSTRAINT fk_fotos_asistencia_movilizacion_ente
    FOREIGN KEY (movilizacion_ente_id) REFERENCES movilizacion_entes (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
