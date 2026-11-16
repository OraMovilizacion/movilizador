USE movilizaciones;

INSERT IGNORE INTO roles_sistema_modulos (rol_sistema_id, modulo)
SELECT DISTINCT rol_sistema_id, 'statistics'
FROM roles_sistema_modulos
WHERE modulo = 'events';
