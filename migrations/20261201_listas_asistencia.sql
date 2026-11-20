USE movilizaciones;

-- ============================================================================
-- Listas de asistencia transcritas (14 listas, personas con nombre, cédula y
-- teléfono) del evento del 20/11/2026.
--
-- Qué hace:
--   1. Crea la tabla `asistentes` (una fila por persona de cada lista).
--   2. Crea el ente de cada lista si no existe y lo liga a la movilización.
--   3. Evita duplicados: si el ente ya tiene lista cargada, se conserva la que
--      tenga MÁS personas (la otra se descarta).
--   4. Marca cada lista como «llegada»: punto de salida en el centro de su zona,
--      punto de llegada en el destino de la movilización, y una sesión de
--      tracking finalizada con puntos simulados (simulado = 1).
--   5. Las rutas por calle se completan con: php scripts/rutas_listas.php
--
-- Antes de ejecutar: revisa las coordenadas de `tmp_listas` (aproximadas) y que
-- exista UNA movilización con fecha 2026-11-20 (si hay varias, usa la primera).
-- Los datos vienen de fotos escritas a mano: verifica nombres, cédulas y
-- teléfonos contra los originales. Los teléfonos que terminan en «?» están
-- incompletos.
-- Idempotente: puedes ejecutarlo varias veces.
-- ============================================================================

CREATE TABLE IF NOT EXISTS asistentes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movilizacion_ente_id BIGINT UNSIGNED NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  nombre VARCHAR(160) NOT NULL,
  cedula VARCHAR(20) NULL,
  telefono VARCHAR(30) NULL,
  origen ENUM('lista','ocr','manual') NOT NULL DEFAULT 'lista',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_asistentes_ente (movilizacion_ente_id, orden),
  KEY idx_asistentes_cedula (cedula),
  CONSTRAINT fk_asistentes_movilizacion_ente
    FOREIGN KEY (movilizacion_ente_id) REFERENCES movilizacion_entes (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

SET @mov := (SELECT id FROM movilizaciones WHERE fecha = '2026-11-20' ORDER BY id LIMIT 1);

DROP TEMPORARY TABLE IF EXISTS tmp_listas;
CREATE TEMPORARY TABLE tmp_listas (
  lista VARCHAR(120) NOT NULL PRIMARY KEY,
  centro VARCHAR(180) NULL,
  lat DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  total INT NOT NULL
);
INSERT INTO tmp_listas (lista, centro, lat, lng, total) VALUES
  ('Consejo Pastoral', 'Centro de Caracas', 10.5061, -66.9146, 67),
  ('Movimiento Social Cristiano - ORA', 'Centro de Los Teques (Guaicaipuro)', 10.344, -67.04, 14),
  ('Mujeres La Guaira', 'Centro de La Guaira', 10.599, -66.934, 20),
  ('ORA El Valle', 'Centro de El Valle', 10.46, -66.904, 12),
  ('ORA La Vega', 'Centro de La Vega', 10.464, -66.944, 22),
  ('Corpocapital GDC', 'Centro de Caracas', 10.5061, -66.9146, 24),
  ('Juventud ORA', NULL, NULL, NULL, 30),
  ('ORA Parroquia Sucre', 'Centro de Sucre (Catia)', 10.516, -66.947, 30),
  ('Consejo Pastoral de Miranda', 'Centro de Los Teques', 10.344, -67.04, 24),
  ('Iglesia Omega', NULL, NULL, NULL, 24),
  ('ORA Caricuao', 'Centro de Caricuao', 10.439, -66.979, 20),
  ('ORA San Bernardino', 'Centro de San Bernardino', 10.517, -66.901, 29),
  ('ORA Macarao', 'Centro de Macarao', 10.44, -67.01, 22),
  ('ORA Antímano', 'Centro de Antímano', 10.493, -66.95, 20);

DROP TEMPORARY TABLE IF EXISTS tmp_asistentes;
CREATE TEMPORARY TABLE tmp_asistentes (
  lista VARCHAR(120) NOT NULL,
  orden SMALLINT UNSIGNED NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  cedula VARCHAR(20) NULL,
  telefono VARCHAR(30) NULL
);
-- Consejo Pastoral (67)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('Consejo Pastoral', 1, 'Mairelys García', '16170796', '04126543031'),
  ('Consejo Pastoral', 2, 'Daniel Ramírez', '28115142', '04298875722'),
  ('Consejo Pastoral', 3, 'Maryuri Martínez', '15911704', '04241207537'),
  ('Consejo Pastoral', 4, 'Félix González', '8246700', '04242314948'),
  ('Consejo Pastoral', 5, 'Andrés Salazar', '32291811', '04226600069'),
  ('Consejo Pastoral', 6, 'Flor Raquel Barrera', '6149589', NULL),
  ('Consejo Pastoral', 7, 'María Daza', '9223237', '04241343059'),
  ('Consejo Pastoral', 8, 'Sarai Vásquez', '23405827', '04143551552'),
  ('Consejo Pastoral', 9, 'Omaira Morillo', '12783665', '04142229648'),
  ('Consejo Pastoral', 10, 'Moraima Jaramillo', '5074179', '04247435847'),
  ('Consejo Pastoral', 11, 'Laura Loyo', '11680032', NULL),
  ('Consejo Pastoral', 12, 'Enrique Uribe', '6281899', NULL),
  ('Consejo Pastoral', 13, 'Anibal Chacón', '10819195', NULL),
  ('Consejo Pastoral', 14, 'Leonela Rivero', '15205888', '04262154657'),
  ('Consejo Pastoral', 15, 'Luis Escalona', '22024681', '04242895814'),
  ('Consejo Pastoral', 16, 'Jesday Sosa', '10348745', '04128001204'),
  ('Consejo Pastoral', 17, 'Yuleidy Alcalá', '11843407', NULL),
  ('Consejo Pastoral', 18, 'Berta Álvarez', NULL, NULL),
  ('Consejo Pastoral', 19, 'Yusmaris Villegas', '11930860', '04125827016'),
  ('Consejo Pastoral', 20, 'William Díaz', '10787072', '04160324470'),
  ('Consejo Pastoral', 21, 'Alis Mailin Ortigoza', '11217209', '04142639726'),
  ('Consejo Pastoral', 22, 'Demetrio Gil', '9483525', '04122001088'),
  ('Consejo Pastoral', 23, 'Anabell Serrano', '21283438', '04260390044'),
  ('Consejo Pastoral', 24, 'José Madriz', '20416042', '04161242531'),
  ('Consejo Pastoral', 25, 'Cipriano Rangel', '6563207', '04129850230'),
  ('Consejo Pastoral', 26, 'Antonio Piña', '9704396', '04141642600'),
  ('Consejo Pastoral', 27, 'Teresa Socco', '12629230', '04163571335'),
  ('Consejo Pastoral', 28, 'Maritza Alvarado', '6453903', '04140106411'),
  ('Consejo Pastoral', 29, 'Lisbel Moyul', '10467615', '04124005'),
  ('Consejo Pastoral', 30, 'Edisson García', NULL, NULL),
  ('Consejo Pastoral', 31, 'Anital', NULL, NULL),
  ('Consejo Pastoral', 32, 'Thais Cordero', '6203890', '04122926713'),
  ('Consejo Pastoral', 33, 'Dessiree Rodríguez', '12642048', '04125742618'),
  ('Consejo Pastoral', 34, 'Jesús Murillo', '31934705', '04125742018'),
  ('Consejo Pastoral', 35, 'Denis Nieves', '10822051', '04143268137'),
  ('Consejo Pastoral', 36, 'Adelia Bernal', '6370364', '04126049'),
  ('Consejo Pastoral', 37, 'Damelys Pérez', '12978589', '04141977576'),
  ('Consejo Pastoral', 38, 'Omar Sepúlveda', '13405681', NULL),
  ('Consejo Pastoral', 39, 'Argenis De Soto', '6031944', NULL),
  ('Consejo Pastoral', 40, 'José Estaba', '6848440', '04241004079'),
  ('Consejo Pastoral', 41, 'Narrobi Contreras', '12671574', NULL),
  ('Consejo Pastoral', 42, 'César Rivas', '14935850', '04243738999'),
  ('Consejo Pastoral', 43, 'Carmen de Rivas', '14001525', '04243738990'),
  ('Consejo Pastoral', 44, 'Jorge Puerto', '16677642', '04242866460'),
  ('Consejo Pastoral', 45, 'María Castillo', '17448801', '04124825402'),
  ('Consejo Pastoral', 46, 'Senar Balboa', '30309412', NULL),
  ('Consejo Pastoral', 47, 'Zaida Pacheco', '10379869', '04120959165'),
  ('Consejo Pastoral', 48, 'María Moreno', '24530838', '04295900042'),
  ('Consejo Pastoral', 49, 'Milagros Álvarez', '6444943', '04266167599'),
  ('Consejo Pastoral', 50, 'José Benavides', '13860839', '04242459884'),
  ('Consejo Pastoral', 51, 'Pedro García', '5431533', '04144149134'),
  ('Consejo Pastoral', 52, 'Ricardo Yecerra', '14018702', '04147925522'),
  ('Consejo Pastoral', 53, 'Yamilet Isturiz', '10806894', '04241269859'),
  ('Consejo Pastoral', 54, 'Luisa Mota', '3871991', '04241385314'),
  ('Consejo Pastoral', 55, 'Damelis de Flores', '14130783', '04120103786'),
  ('Consejo Pastoral', 56, 'Alberto Flores', '12068285', '04120103786'),
  ('Consejo Pastoral', 57, 'Magaly Colmenárez', '9628884', NULL),
  ('Consejo Pastoral', 58, 'Raúl Tomante', '5973331', NULL),
  ('Consejo Pastoral', 59, 'Luis Martínez', '18647699', NULL),
  ('Consejo Pastoral', 60, 'Juan Rodríguez', '10526540', NULL),
  ('Consejo Pastoral', 61, 'Álvaro Avilarte', '7711485', NULL),
  ('Consejo Pastoral', 62, 'Roberto Michelena', '12458317', '04242418487'),
  ('Consejo Pastoral', 63, 'Elsie de Agara', '6047449', NULL),
  ('Consejo Pastoral', 64, 'Sidonia Caridad', '6150391', '04249949662'),
  ('Consejo Pastoral', 65, 'Sandra Ostulin', '14286921', '04241099872'),
  ('Consejo Pastoral', 66, 'Eliade Palacios Ruiz', '8745995', '04242964'),
  ('Consejo Pastoral', 67, 'Yenniree Romero', '14204498', NULL);

-- Movimiento Social Cristiano - ORA (14)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('Movimiento Social Cristiano - ORA', 1, 'Romina Lames', '13405953', '04120191848'),
  ('Movimiento Social Cristiano - ORA', 2, 'Gina Abreu', '15912684', '04129313307'),
  ('Movimiento Social Cristiano - ORA', 3, 'Gianni Castaño', '13232609', '04242156511'),
  ('Movimiento Social Cristiano - ORA', 4, 'Edinson Montilla', '18441689', '04124637203'),
  ('Movimiento Social Cristiano - ORA', 5, 'William Pérez', '5564283', '04269063736'),
  ('Movimiento Social Cristiano - ORA', 6, 'Engelbert Carrillo', '12416441', '04122254437'),
  ('Movimiento Social Cristiano - ORA', 7, 'Yohan Olives', '17282058', '04149068207'),
  ('Movimiento Social Cristiano - ORA', 8, 'Luisa de Leal', '10465508', '04120907159'),
  ('Movimiento Social Cristiano - ORA', 9, 'Juana Mota', '9672806', '04122110850'),
  ('Movimiento Social Cristiano - ORA', 10, 'María Isabel Lara', '15119121', '04168355828'),
  ('Movimiento Social Cristiano - ORA', 11, 'Jorge Méndez', '6109492', '04264624984'),
  ('Movimiento Social Cristiano - ORA', 12, 'Andrés Rincón', '6905544', '04142364846'),
  ('Movimiento Social Cristiano - ORA', 13, 'John Ramos', '8643666', '04124136008'),
  ('Movimiento Social Cristiano - ORA', 14, 'Derwin Castillo', '12415926', '04120232109');

-- Mujeres La Guaira (20)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('Mujeres La Guaira', 1, 'Marialys Rodríguez', '8184410', '04242137800'),
  ('Mujeres La Guaira', 2, 'Yorbis', '13671441', '04141330834'),
  ('Mujeres La Guaira', 3, 'Loreangelis Guillén', NULL, NULL),
  ('Mujeres La Guaira', 4, 'Isley', '18931420', '04129703972'),
  ('Mujeres La Guaira', 5, 'Sujet Santoya', NULL, NULL),
  ('Mujeres La Guaira', 6, 'Marisela Maza', '14313608', '04242843883'),
  ('Mujeres La Guaira', 7, 'Petra Díaz', NULL, NULL),
  ('Mujeres La Guaira', 8, 'Berta', '4433789', '04141713367'),
  ('Mujeres La Guaira', 9, 'Nurbis Díaz', NULL, '04120387790'),
  ('Mujeres La Guaira', 10, 'Maritza Mayora', NULL, NULL),
  ('Mujeres La Guaira', 11, 'María Montilla', '5307089', '04242933237'),
  ('Mujeres La Guaira', 12, 'Erika Vásquez', NULL, NULL),
  ('Mujeres La Guaira', 13, 'Geraldine Fontalvo', NULL, NULL),
  ('Mujeres La Guaira', 14, 'Marielén Rivas', NULL, NULL),
  ('Mujeres La Guaira', 15, 'Carla Díaz', NULL, NULL),
  ('Mujeres La Guaira', 16, 'Verónica', NULL, NULL),
  ('Mujeres La Guaira', 17, 'Marys Torres', NULL, NULL),
  ('Mujeres La Guaira', 18, 'Milagros Laya', NULL, NULL),
  ('Mujeres La Guaira', 19, 'Antonieta Olivero', NULL, NULL),
  ('Mujeres La Guaira', 20, 'Juana Chirinos', '5170449', '04140891569');

-- ORA El Valle (12)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('ORA El Valle', 1, 'Rosalba de Marcano', '18750861', NULL),
  ('ORA El Valle', 2, 'Alí Martínez', '6195623', NULL),
  ('ORA El Valle', 3, 'Alexander Aguilera', '14498450', NULL),
  ('ORA El Valle', 4, 'Francis Martínez', '14584630', NULL),
  ('ORA El Valle', 5, 'Isidra Toro', '14428270', NULL),
  ('ORA El Valle', 6, 'Pastor García', '18749460', NULL),
  ('ORA El Valle', 7, 'Orlando Montaño', '13712060', NULL),
  ('ORA El Valle', 8, 'María Brito', '15700527', NULL),
  ('ORA El Valle', 9, 'Yaurimar Carmona', '14126347', NULL),
  ('ORA El Valle', 10, 'Kelly Mendoza', '22572140', NULL),
  ('ORA El Valle', 11, 'Mathías Brito', NULL, NULL),
  ('ORA El Valle', 12, 'Luisa Maribel Delgado', '10865094', NULL);

-- ORA La Vega (22)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('ORA La Vega', 1, 'Jesús Romero', '20764281', NULL),
  ('ORA La Vega', 2, 'Wladimir Rodríguez', '16682398', NULL),
  ('ORA La Vega', 3, 'Johannis Rodríguez', NULL, NULL),
  ('ORA La Vega', 4, 'Yulis Crespo', '10524832', NULL),
  ('ORA La Vega', 5, 'Hilary Crespo', '20963773', NULL),
  ('ORA La Vega', 6, 'Samuel Carrasquel', NULL, NULL),
  ('ORA La Vega', 7, 'Yudith Hernández', '6035559', NULL),
  ('ORA La Vega', 8, 'Mayra Ruiz', '10180669', NULL),
  ('ORA La Vega', 9, 'Wilmer Hosting', '33089523', NULL),
  ('ORA La Vega', 10, 'Sebastián Silva', '36640934', NULL),
  ('ORA La Vega', 11, 'Jesús González', '12663492', NULL),
  ('ORA La Vega', 12, 'Marisol Duran', '13088711', NULL),
  ('ORA La Vega', 13, 'Yohatan Ozuna', '23692796', NULL),
  ('ORA La Vega', 14, 'Elian Aponte', '33623875', NULL),
  ('ORA La Vega', 15, 'Juan Baroni', '19152004', NULL),
  ('ORA La Vega', 16, 'Merlin Torres', '14059432', NULL),
  ('ORA La Vega', 17, 'Gregorio Saavedra', '13328360', NULL),
  ('ORA La Vega', 18, 'William Biancucci', '23880934', NULL),
  ('ORA La Vega', 19, 'Luisa Sandoval', '11689696', NULL),
  ('ORA La Vega', 20, 'Job Soto', NULL, NULL),
  ('ORA La Vega', 21, 'Isaac Ramírez', NULL, NULL),
  ('ORA La Vega', 22, 'Ramírez', NULL, NULL);

-- Corpocapital GDC (24)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('Corpocapital GDC', 1, 'Mairy Fernández', '34780732', NULL),
  ('Corpocapital GDC', 2, 'Shinessa Hernández', '32895561', NULL),
  ('Corpocapital GDC', 3, 'Camila Gonzales', NULL, NULL),
  ('Corpocapital GDC', 4, 'Yonanyel Angulo', NULL, NULL),
  ('Corpocapital GDC', 5, 'Neyuesly Cáceres', NULL, NULL),
  ('Corpocapital GDC', 6, 'Ysaac Castro', NULL, NULL),
  ('Corpocapital GDC', 7, 'Dayechsy Mosqueda', NULL, NULL),
  ('Corpocapital GDC', 8, 'Stivenson Berríos', NULL, NULL),
  ('Corpocapital GDC', 9, 'Dylan Mijares', '33742059', NULL),
  ('Corpocapital GDC', 10, 'Santiago Meléndez', '37663548', NULL),
  ('Corpocapital GDC', 11, 'Oriana Mata', '32490314', NULL),
  ('Corpocapital GDC', 12, 'Israel Hernández', '37942611', NULL),
  ('Corpocapital GDC', 13, 'Esteban Arias', '33417944', NULL),
  ('Corpocapital GDC', 14, 'Estefany Arias', '33417906', NULL),
  ('Corpocapital GDC', 15, 'Efraín Ramírez', '37112767', NULL),
  ('Corpocapital GDC', 16, 'Iraudy Lozano', '26435685', NULL),
  ('Corpocapital GDC', 17, 'Maikel Linares', '26312051', NULL),
  ('Corpocapital GDC', 18, 'Dorka de Molina', '31360220', NULL),
  ('Corpocapital GDC', 19, 'Saray Sánchez', '33950999', NULL),
  ('Corpocapital GDC', 20, 'Joerlys Omañas', '33159561', NULL),
  ('Corpocapital GDC', 21, 'Otoniel Vega', '3631143', NULL),
  ('Corpocapital GDC', 22, 'Yuliet Mendoza', '37908907', NULL),
  ('Corpocapital GDC', 23, 'Akeissy Mendoza', '33951871', NULL),
  ('Corpocapital GDC', 24, 'Anyel Quintero', '32263910', NULL);

-- Juventud ORA (30)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('Juventud ORA', 1, 'Yurbis', NULL, NULL),
  ('Juventud ORA', 2, 'Pedro', NULL, NULL),
  ('Juventud ORA', 3, 'Yuru 1', NULL, NULL),
  ('Juventud ORA', 4, 'Yuru 2', NULL, NULL),
  ('Juventud ORA', 5, 'Génesis', NULL, NULL),
  ('Juventud ORA', 6, 'Lesker', NULL, NULL),
  ('Juventud ORA', 7, 'Alexander', NULL, NULL),
  ('Juventud ORA', 8, 'Ambar', NULL, NULL),
  ('Juventud ORA', 9, 'Mailin', NULL, NULL),
  ('Juventud ORA', 10, 'Selene', NULL, NULL),
  ('Juventud ORA', 11, 'Ana', NULL, NULL),
  ('Juventud ORA', 12, 'Cristóbal', NULL, NULL),
  ('Juventud ORA', 13, 'Yovanna', NULL, NULL),
  ('Juventud ORA', 14, 'Jhonathan', NULL, NULL),
  ('Juventud ORA', 15, 'Tais', NULL, NULL),
  ('Juventud ORA', 16, 'Luisana', NULL, NULL),
  ('Juventud ORA', 17, 'Marlene', NULL, NULL),
  ('Juventud ORA', 18, 'Pedro', NULL, NULL),
  ('Juventud ORA', 19, 'Lisbeth', NULL, NULL),
  ('Juventud ORA', 20, 'Andreina', NULL, NULL),
  ('Juventud ORA', 21, 'Yeli', NULL, NULL),
  ('Juventud ORA', 22, 'Mayerlin', NULL, NULL),
  ('Juventud ORA', 23, 'Ciro', NULL, NULL),
  ('Juventud ORA', 24, 'María', NULL, NULL),
  ('Juventud ORA', 25, 'Ilya', NULL, NULL),
  ('Juventud ORA', 26, 'Rebeca', NULL, NULL),
  ('Juventud ORA', 27, 'Naomi', NULL, NULL),
  ('Juventud ORA', 28, 'Victoria', NULL, NULL),
  ('Juventud ORA', 29, 'María', NULL, NULL),
  ('Juventud ORA', 30, 'Noryorlis', NULL, NULL);

-- ORA Parroquia Sucre (30)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('ORA Parroquia Sucre', 1, 'Ana Lozano', '11852992', '04149317004'),
  ('ORA Parroquia Sucre', 2, 'Ana de Quica', '6963978', '0412805?'),
  ('ORA Parroquia Sucre', 3, 'Wellmer Benítez', '10913508', '04242688706'),
  ('ORA Parroquia Sucre', 4, 'Nerva Bernal', '9062873', '04123200518'),
  ('ORA Parroquia Sucre', 5, 'Yelin Martínez', '15039604', '04162047889'),
  ('ORA Parroquia Sucre', 6, 'Carlos Martínez', '6168943', '0416214?95'),
  ('ORA Parroquia Sucre', 7, 'Isael Martínez', '18009094', '04167148?'),
  ('ORA Parroquia Sucre', 8, 'Carlos Cadiz', '13563563', '0426806661?'),
  ('ORA Parroquia Sucre', 9, 'Leonardo Díaz', '12513754', '04248664665'),
  ('ORA Parroquia Sucre', 10, 'Edilene Bracho', '9534748', '0412718?52'),
  ('ORA Parroquia Sucre', 11, 'Amarilys Moreno', '10505112', '04126189537'),
  ('ORA Parroquia Sucre', 12, 'Valentín Gonzalez', '6278412', '04120289005'),
  ('ORA Parroquia Sucre', 13, 'Shirley de Molina', '16330241', '0412568502?'),
  ('ORA Parroquia Sucre', 14, 'Fermín Goyo', '6101210', '04122945954'),
  ('ORA Parroquia Sucre', 15, 'Rosi Hernández', '24500643', '04124177098'),
  ('ORA Parroquia Sucre', 16, 'Jorge Castillo', '32543635', '04124177098'),
  ('ORA Parroquia Sucre', 17, 'Joeber Ortega', '32970562', '04124177098'),
  ('ORA Parroquia Sucre', 18, 'Daniela Briceño', '32517735', '04124177098'),
  ('ORA Parroquia Sucre', 19, 'Gabriel Paredes', '32869765', '04124177098'),
  ('ORA Parroquia Sucre', 20, 'Camila Reyes', '33280453', '04124177098'),
  ('ORA Parroquia Sucre', 21, 'Rut Fuente', '32105385', '04124177098'),
  ('ORA Parroquia Sucre', 22, 'Carolain Ramos', '30633576', '04124177098'),
  ('ORA Parroquia Sucre', 23, 'Yhoany Puente', '13643434', '04242714599'),
  ('ORA Parroquia Sucre', 24, 'Lida Garzón', '12543079', '04241204960'),
  ('ORA Parroquia Sucre', 25, 'Manuel González', '9960063', '04120156814'),
  ('ORA Parroquia Sucre', 26, 'Mohamed Rebje', '17782183', '04126304647'),
  ('ORA Parroquia Sucre', 27, 'Esther de Correa', '11983563', '04122960725'),
  ('ORA Parroquia Sucre', 28, 'Anais de Martínez', '19849833', '04242944942'),
  ('ORA Parroquia Sucre', 29, 'Edicta Luces', '19125376', '0416299?92'),
  ('ORA Parroquia Sucre', 30, 'Luis Morales', NULL, '04264322193');

-- Consejo Pastoral de Miranda (24)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('Consejo Pastoral de Miranda', 1, 'Alcides Parra Molina', '10695746', NULL),
  ('Consejo Pastoral de Miranda', 2, 'Alcymar Parra', '31394138', NULL),
  ('Consejo Pastoral de Miranda', 3, 'Yeismar Hidalgo', '32679718', NULL),
  ('Consejo Pastoral de Miranda', 4, 'Juan Barinas', '9980819', NULL),
  ('Consejo Pastoral de Miranda', 5, 'Dayci Anton', '11384630', NULL),
  ('Consejo Pastoral de Miranda', 6, 'Monzón', '5529370', NULL),
  ('Consejo Pastoral de Miranda', 7, 'Raúl Suárez', '8654770', NULL),
  ('Consejo Pastoral de Miranda', 8, 'Ángel Serra', '25478175', NULL),
  ('Consejo Pastoral de Miranda', 9, 'Maribel Lara', '6887308', NULL),
  ('Consejo Pastoral de Miranda', 10, 'Raiyucett López', '14260404', NULL),
  ('Consejo Pastoral de Miranda', 11, 'Julián Córdova', '6837885', NULL),
  ('Consejo Pastoral de Miranda', 12, 'Justo Yendi', '11416504', NULL),
  ('Consejo Pastoral de Miranda', 13, 'Gregoria García', '8266583', NULL),
  ('Consejo Pastoral de Miranda', 14, 'Jenny Reinosa de Duarte', '11489426', NULL),
  ('Consejo Pastoral de Miranda', 15, 'Alexander Ivimas', '15706541', NULL),
  ('Consejo Pastoral de Miranda', 16, 'Robert Verbel García', '28303893', NULL),
  ('Consejo Pastoral de Miranda', 17, 'Jonny Duarte', '11481084', NULL),
  ('Consejo Pastoral de Miranda', 18, 'José de los Santos Hernández', '6793186', NULL),
  ('Consejo Pastoral de Miranda', 19, 'Zulay Parra', '12829914', NULL),
  ('Consejo Pastoral de Miranda', 20, 'Gustavo García', '6346650', NULL),
  ('Consejo Pastoral de Miranda', 21, 'Corina Sotillo', '13319246', NULL),
  ('Consejo Pastoral de Miranda', 22, 'Yamilex Fernández', '6288112', NULL),
  ('Consejo Pastoral de Miranda', 23, 'Nectario Ferrer', '6215344', NULL),
  ('Consejo Pastoral de Miranda', 24, 'Wilmer Rodríguez', '6112004', NULL);

-- Iglesia Omega (24)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('Iglesia Omega', 1, 'Lindary Moreno', '14127956', '04241341480'),
  ('Iglesia Omega', 2, 'Andrea de los Santos', '13339192', '04142831920'),
  ('Iglesia Omega', 3, 'Thamara Núñez', '6453808', '04264117879'),
  ('Iglesia Omega', 4, 'Juan Pablo Ariza', '16468494', '04241982526'),
  ('Iglesia Omega', 5, 'Maritza Suárez', '11994720', '04127255217'),
  ('Iglesia Omega', 6, 'Tanny Torrealba', '13735521', '04241947571'),
  ('Iglesia Omega', 7, 'Atkinson Torrealba', '14953491', '04126303358'),
  ('Iglesia Omega', 8, 'Perla González', '14050865', '04211170768'),
  ('Iglesia Omega', 9, 'Yuneri Ruiz', '12258316', '04242462691'),
  ('Iglesia Omega', 10, 'Dayana Ruiz', '19292961', '04123404294'),
  ('Iglesia Omega', 11, 'Eduardo Ramírez', '20127839', '04123464294'),
  ('Iglesia Omega', 12, 'Narciso Arias', NULL, '0414259516?'),
  ('Iglesia Omega', 13, 'Liliana Madriz', '17855852', '04125751427'),
  ('Iglesia Omega', 14, 'Miriam del Valle', '11923924', '04123936958'),
  ('Iglesia Omega', 15, 'Gabriela Aponte', '20309597', '04142245603'),
  ('Iglesia Omega', 16, 'Noris Díaz', '6693698', '04129018462'),
  ('Iglesia Omega', 17, 'Iván Núñez', '9415933', '04129709220'),
  ('Iglesia Omega', 18, 'Sunira Quintero', '10670281', '04125733894'),
  ('Iglesia Omega', 19, 'Yoleska Gómez', '31937432', '04128823390'),
  ('Iglesia Omega', 20, 'Frissette Aponte', '19993554', '04243656548'),
  ('Iglesia Omega', 21, 'Alejandra Ramírez', '31382769', '04245841841'),
  ('Iglesia Omega', 22, 'Edilia Castillo', '36707251', '04162171492'),
  ('Iglesia Omega', 23, 'Raúl Sandoval', '13911923', '04269078223'),
  ('Iglesia Omega', 24, 'Arturo Sánchez', '12161819', '04127321119');

-- ORA Caricuao (20)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('ORA Caricuao', 1, 'Salazar', '18674951', NULL),
  ('ORA Caricuao', 2, 'Sin nombre', '14526342', NULL),
  ('ORA Caricuao', 3, 'Jesenia', '14322548', NULL),
  ('ORA Caricuao', 4, 'Coromoto de Bermúdez', NULL, '04241786253'),
  ('ORA Caricuao', 5, 'Noneli Rangel', '8450929', NULL),
  ('ORA Caricuao', 6, 'Alejandro Cáceres', '23618259', NULL),
  ('ORA Caricuao', 7, 'Marilyn Díaz', '16576537', NULL),
  ('ORA Caricuao', 8, 'Zaida de Sánchez', '25409200', NULL),
  ('ORA Caricuao', 9, 'Sin nombre', '15161229', NULL),
  ('ORA Caricuao', 10, 'Marcos Castillo', '6866310', NULL),
  ('ORA Caricuao', 11, 'Freddy Sánchez', '13853859', NULL),
  ('ORA Caricuao', 12, 'Carla Sosa', '19452292', NULL),
  ('ORA Caricuao', 13, 'Patricia Figueroa', '16022158', NULL),
  ('ORA Caricuao', 14, 'Darlen', '6120935', '04148330555'),
  ('ORA Caricuao', 15, 'Sin nombre', '21438700', '04123416818'),
  ('ORA Caricuao', 16, 'Sin nombre', '20566290', '04122709071'),
  ('ORA Caricuao', 17, 'Sin nombre', '23712430', '04242443728'),
  ('ORA Caricuao', 18, 'Sin nombre', '23631773', '04241334461'),
  ('ORA Caricuao', 19, 'Sin nombre', '20506218', '0412032245?'),
  ('ORA Caricuao', 20, 'Neydy Pérez', NULL, '04142254283');

-- ORA San Bernardino (29)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('ORA San Bernardino', 1, 'Neurimar Flores', '16887355', '04242789634'),
  ('ORA San Bernardino', 2, 'Eduardo Egui', '12421938', '04262266021'),
  ('ORA San Bernardino', 3, 'Omaira Castro', '6192973', '04129093172'),
  ('ORA San Bernardino', 4, 'Belkis Lovera', '6314338', '04142933331'),
  ('ORA San Bernardino', 5, 'Sara Rodríguez', '14574354', '04127184152'),
  ('ORA San Bernardino', 6, 'Freddy Sojo', '6837326', '04263113700'),
  ('ORA San Bernardino', 7, 'Elías Quintana', '33887791', '04266140283'),
  ('ORA San Bernardino', 8, 'Elizabeth Castillo', '29656070', '04167143785'),
  ('ORA San Bernardino', 9, 'Yoneisa Barrios', '20289238', '04241567724'),
  ('ORA San Bernardino', 10, 'Freiber Sojo', '20184723', '04241490613'),
  ('ORA San Bernardino', 11, 'Gloria Esturiz', '10184678', '04125530859'),
  ('ORA San Bernardino', 12, 'Luis Ceballos', '29725190', '04122011884'),
  ('ORA San Bernardino', 13, 'Jesús Ceballos', '12533532', '04241657307'),
  ('ORA San Bernardino', 14, 'Aracelis Hernández', '14689652', '04129832295'),
  ('ORA San Bernardino', 15, 'Yanitza Ayala', '8927601', '04264977685'),
  ('ORA San Bernardino', 16, 'Maribella Lovera', '6314346', '04242947576'),
  ('ORA San Bernardino', 17, 'Dayanna Rodríguez', '27344289', '04142169286'),
  ('ORA San Bernardino', 18, 'Felipe Flores', '5692696', '04264313652'),
  ('ORA San Bernardino', 19, 'Mildred Vera', '22749762', '0412826523'),
  ('ORA San Bernardino', 20, 'Eglimey Rivas', '17141437', NULL),
  ('ORA San Bernardino', 21, 'María Ramírez', '9959825', '04142296980'),
  ('ORA San Bernardino', 22, 'Luis Solórzano', '60055126', '04168306846'),
  ('ORA San Bernardino', 23, 'Yorsi Rumbos', '29686976', '04149063005'),
  ('ORA San Bernardino', 24, 'Erik Lovera', '14143701', '04241259195'),
  ('ORA San Bernardino', 25, 'Sebastián Zambrano', '32811695', '04143991655'),
  ('ORA San Bernardino', 26, 'Yolanda Cova', '12062725', '04241212427'),
  ('ORA San Bernardino', 27, 'Yosaima Álvarez', '12748665', '04128706195'),
  ('ORA San Bernardino', 28, 'Yeny Mijares', '10823472', '04242872091'),
  ('ORA San Bernardino', 29, 'Jasmar Rivas', '10485099', '04149186198');

-- ORA Macarao (22)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('ORA Macarao', 1, 'Yorgelis Marrero', '25466284', NULL),
  ('ORA Macarao', 2, 'Lisman Velásquez', NULL, NULL),
  ('ORA Macarao', 3, 'Adonay Borrios', '16107229', NULL),
  ('ORA Macarao', 4, 'Eliam Álvarez', NULL, NULL),
  ('ORA Macarao', 5, 'Brigette Palacio', '12164208', NULL),
  ('ORA Macarao', 6, 'Wided Álvarez', '17389634', NULL),
  ('ORA Macarao', 7, 'Dina Delgado', '5404113', NULL),
  ('ORA Macarao', 8, 'Yeritza Gustamonte', '16474664', NULL),
  ('ORA Macarao', 9, 'Eudis Guerra', '12557350', NULL),
  ('ORA Macarao', 10, 'Yajaira Torrealba', '11899828', NULL),
  ('ORA Macarao', 11, 'Valentina Eniza', NULL, NULL),
  ('ORA Macarao', 12, 'Vanesa Morales', '23388080', NULL),
  ('ORA Macarao', 13, 'Yosan Jiménez', '31761024', NULL),
  ('ORA Macarao', 14, 'Sanety Vaez', '31490967', NULL),
  ('ORA Macarao', 15, 'Dilvia Herrera', '16766667', NULL),
  ('ORA Macarao', 16, 'Dalloña de Leal', '11677168', NULL),
  ('ORA Macarao', 17, 'Leixganys Orozco', '29989638', NULL),
  ('ORA Macarao', 18, 'Aura Balza', '18676631', NULL),
  ('ORA Macarao', 19, 'Yoweiken Rodríguez', '31793719', NULL),
  ('ORA Macarao', 20, 'Leyeglix Orosco', '30990354', NULL),
  ('ORA Macarao', 21, 'Gregonio Yepez', '12881195', NULL),
  ('ORA Macarao', 22, 'Carolina de Yepez', '14852057', NULL);

-- ORA Antímano (20)
INSERT INTO tmp_asistentes (lista, orden, nombre, cedula, telefono) VALUES
  ('ORA Antímano', 1, 'Rayna Brito', '14526128', '04242221384'),
  ('ORA Antímano', 2, 'Yulby Marcano', '15605149', '04143128603'),
  ('ORA Antímano', 3, 'Yoselin Guédez', '19313688', '04241793778'),
  ('ORA Antímano', 4, 'Sixto Álvarez', '9572927', '04127180414'),
  ('ORA Antímano', 5, 'Raúl Márquez', '6908346', '04241927802'),
  ('ORA Antímano', 6, 'Balza Aguinaldo', '9052388', '04145316099'),
  ('ORA Antímano', 7, 'Abraham Hernández', '15420509', '04241333539'),
  ('ORA Antímano', 8, 'Saylimar Quevedo', '26271538', '04121057172'),
  ('ORA Antímano', 9, 'Junior Pérez', '19509340', '04242785087'),
  ('ORA Antímano', 10, 'Adimar De Pérez', '20103191', NULL),
  ('ORA Antímano', 11, 'Iris Laya', '6277888', '04122448410'),
  ('ORA Antímano', 12, 'Vanessa de Méndez', '21574108', '04242837363'),
  ('ORA Antímano', 13, 'Marisol De García', '21104009', '04142195377'),
  ('ORA Antímano', 14, 'Miguel Hernández', NULL, NULL),
  ('ORA Antímano', 15, 'Miguel Medina', '11203484', '04127196073'),
  ('ORA Antímano', 16, 'Percy Ayala', '13070468', '04142022171'),
  ('ORA Antímano', 17, 'Cristian Hernández', '18459074', '04241282669'),
  ('ORA Antímano', 18, 'Alexandra Zambrano', '17300149', '04164796657'),
  ('ORA Antímano', 19, 'Isabela Quijada (5 años)', NULL, NULL),
  ('ORA Antímano', 20, 'Flor Padilla', '14755542', '04123315492');

-- 1. Entes que faltan
INSERT INTO entes (nombre)
SELECT l.lista FROM tmp_listas l
WHERE @mov IS NOT NULL AND NOT EXISTS (SELECT 1 FROM entes e WHERE e.nombre = l.lista);

-- 2. Ente dentro de la movilización (uno solo por ente: no se duplica)
INSERT INTO movilizacion_entes (movilizacion_id, ente_id)
SELECT @mov, e.id FROM tmp_listas l JOIN entes e ON e.nombre = l.lista
WHERE @mov IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM movilizacion_entes me WHERE me.movilizacion_id = @mov AND me.ente_id = e.id);

-- 3. Listas que se cargan: sin lista previa o con menos personas que la nueva
DROP TEMPORARY TABLE IF EXISTS tmp_cargar;
CREATE TEMPORARY TABLE tmp_cargar AS
SELECT me.id AS me_id, l.lista
FROM tmp_listas l
JOIN entes e ON e.nombre = l.lista
JOIN movilizacion_entes me ON me.ente_id = e.id AND me.movilizacion_id = @mov
WHERE (SELECT COUNT(*) FROM asistentes a WHERE a.movilizacion_ente_id = me.id) < l.total;

DELETE a FROM asistentes a JOIN tmp_cargar c ON c.me_id = a.movilizacion_ente_id;

INSERT INTO asistentes (movilizacion_ente_id, orden, nombre, cedula, telefono, origen)
SELECT c.me_id, t.orden, t.nombre, t.cedula, t.telefono, 'lista'
FROM tmp_asistentes t JOIN tmp_cargar c ON c.lista = t.lista;

-- 4. Datos del ente y ruta personal (línea recta; rutas_listas.php la cambia por la ruta por calle)
UPDATE movilizacion_entes me
JOIN tmp_cargar c ON c.me_id = me.id
JOIN tmp_listas l ON l.lista = c.lista
JOIN movilizaciones m ON m.id = me.movilizacion_id
SET me.personas_asistentes = l.total,
    me.personas_planificadas = COALESCE(me.personas_planificadas, l.total),
    me.asistencia_reportada_en = COALESCE(me.asistencia_reportada_en, NOW()),
    me.datos_confirmados_en = COALESCE(me.datos_confirmados_en, NOW()),
    me.punto_salida = COALESCE(l.centro, me.punto_salida),
    me.punto_salida_lat = COALESCE(l.lat, me.punto_salida_lat),
    me.punto_salida_lng = COALESCE(l.lng, me.punto_salida_lng),
    me.punto_llegada_nombre = COALESCE(me.punto_llegada_nombre, m.punto_llegada_nombre),
    me.punto_llegada_lat = COALESCE(me.punto_llegada_lat, m.punto_llegada_lat),
    me.punto_llegada_lng = COALESCE(me.punto_llegada_lng, m.punto_llegada_lng),
    me.ruta_personal_geojson = IF(l.lat IS NULL OR m.punto_llegada_lat IS NULL, me.ruta_personal_geojson,
      CONCAT('{"type":"LineString","coordinates":[[', l.lng, ',', l.lat, '],[', m.punto_llegada_lng, ',', m.punto_llegada_lat, ']]}'));

-- 5. Llegada: sesión de tracking finalizada con dos puntos simulados
--    (hora de llegada = hora de inicio del evento; salida una hora antes)
INSERT INTO tracking_sesiones
  (movilizacion_ente_id, tipo, identificador_cliente, estado, consentimiento_version,
   consentimiento_aceptado_en, iniciado_en, finalizado_en, llegada_confirmada_en)
SELECT me.id, 'ida', UUID(), 'finalizada', 'carga-manual',
  TIMESTAMP(m.fecha, COALESCE(m.hora_inicio, '13:00:00')) - INTERVAL 1 HOUR,
  TIMESTAMP(m.fecha, COALESCE(m.hora_inicio, '13:00:00')) - INTERVAL 1 HOUR,
  TIMESTAMP(m.fecha, COALESCE(m.hora_inicio, '13:00:00')),
  TIMESTAMP(m.fecha, COALESCE(m.hora_inicio, '13:00:00')),
  TIMESTAMP(m.fecha, COALESCE(m.hora_inicio, '13:00:00'))
FROM tmp_cargar c
JOIN movilizacion_entes me ON me.id = c.me_id
JOIN movilizaciones m ON m.id = me.movilizacion_id
WHERE me.punto_salida_lat IS NOT NULL AND me.punto_llegada_lat IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tracking_sesiones ts WHERE ts.movilizacion_ente_id = me.id AND ts.tipo = 'ida');

INSERT INTO tracking_puntos (tracking_sesion_id, secuencia, latitud, longitud, simulado, registrado_en)
SELECT ts.id, 1, me.punto_salida_lat, me.punto_salida_lng, 1, ts.iniciado_en
FROM tracking_sesiones ts JOIN movilizacion_entes me ON me.id = ts.movilizacion_ente_id
WHERE ts.consentimiento_version = 'carga-manual'
  AND NOT EXISTS (SELECT 1 FROM tracking_puntos tp WHERE tp.tracking_sesion_id = ts.id);

INSERT INTO tracking_puntos (tracking_sesion_id, secuencia, latitud, longitud, simulado, registrado_en)
SELECT ts.id, 2, me.punto_llegada_lat, me.punto_llegada_lng, 1, ts.llegada_confirmada_en
FROM tracking_sesiones ts JOIN movilizacion_entes me ON me.id = ts.movilizacion_ente_id
WHERE ts.consentimiento_version = 'carga-manual'
  AND NOT EXISTS (SELECT 1 FROM tracking_puntos tp WHERE tp.tracking_sesion_id = ts.id AND tp.secuencia = 2);

SELECT l.lista, l.total AS personas_en_lista,
  (SELECT COUNT(*) FROM asistentes a JOIN movilizacion_entes me ON me.id = a.movilizacion_ente_id
   JOIN entes e ON e.id = me.ente_id WHERE e.nombre = l.lista AND me.movilizacion_id = @mov) AS personas_cargadas
FROM tmp_listas l;
