USE movilizaciones;

-- ============================================================================
-- Estructura territorial cargada directamente desde la base de datos
-- (reemplaza a scripts/seed_territories.php; ya no hace falta ejecutar PHP).
--
--   1 nivel nacional (VE00) + 24 estados + 335 municipios.
--   Agrega el nivel «parroquial» (parroquias de cada municipio).
--
-- Idempotente: se puede ejecutar varias veces sin duplicar ni borrar datos.
-- ============================================================================

ALTER TABLE unidades_territoriales
  MODIFY nivel ENUM('nacional', 'estadal', 'municipal', 'parroquial') NOT NULL;

INSERT INTO unidades_territoriales (codigo, nombre, nivel, padre_id, activo)
VALUES ('VE00', 'Venezuela', 'nacional', NULL, 1)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), activo = 1;

SET @nacional := (SELECT id FROM unidades_territoriales WHERE codigo = 'VE00');

-- Estados
INSERT INTO unidades_territoriales (codigo, nombre, nivel, padre_id, activo) VALUES
('VE01', 'Distrito Capital', 'estadal', @nacional, 1),
('VE02', 'Amazonas', 'estadal', @nacional, 1),
('VE03', 'Anzoátegui', 'estadal', @nacional, 1),
('VE04', 'Apure', 'estadal', @nacional, 1),
('VE05', 'Aragua', 'estadal', @nacional, 1),
('VE06', 'Barinas', 'estadal', @nacional, 1),
('VE07', 'Bolívar', 'estadal', @nacional, 1),
('VE08', 'Carabobo', 'estadal', @nacional, 1),
('VE09', 'Cojedes', 'estadal', @nacional, 1),
('VE10', 'Delta Amacuro', 'estadal', @nacional, 1),
('VE11', 'Falcón', 'estadal', @nacional, 1),
('VE12', 'Guárico', 'estadal', @nacional, 1),
('VE13', 'Lara', 'estadal', @nacional, 1),
('VE14', 'Mérida', 'estadal', @nacional, 1),
('VE15', 'Miranda', 'estadal', @nacional, 1),
('VE16', 'Monagas', 'estadal', @nacional, 1),
('VE17', 'Nueva Esparta', 'estadal', @nacional, 1),
('VE18', 'Portuguesa', 'estadal', @nacional, 1),
('VE19', 'Sucre', 'estadal', @nacional, 1),
('VE20', 'Táchira', 'estadal', @nacional, 1),
('VE21', 'Trujillo', 'estadal', @nacional, 1),
('VE22', 'Yaracuy', 'estadal', @nacional, 1),
('VE23', 'Zulia', 'estadal', @nacional, 1),
('VE24', 'La Guaira', 'estadal', @nacional, 1)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), nivel = VALUES(nivel), padre_id = VALUES(padre_id), activo = 1;

-- Municipios (el estado se resuelve por código)
INSERT INTO unidades_territoriales (codigo, nombre, nivel, padre_id, activo)
SELECT m.codigo, m.nombre, 'municipal', e.id, 1 FROM (
SELECT 'VE0101' AS codigo, 'Libertador' AS nombre, 'VE01' AS padre
UNION ALL SELECT 'VE0201' AS codigo, 'Autónomo Alto Orinoco' AS nombre, 'VE02' AS padre
UNION ALL SELECT 'VE0202' AS codigo, 'Autónomo Atabapo' AS nombre, 'VE02' AS padre
UNION ALL SELECT 'VE0203' AS codigo, 'Autónomo Atures' AS nombre, 'VE02' AS padre
UNION ALL SELECT 'VE0204' AS codigo, 'Autónomo Autana' AS nombre, 'VE02' AS padre
UNION ALL SELECT 'VE0205' AS codigo, 'Autónomo Maroa' AS nombre, 'VE02' AS padre
UNION ALL SELECT 'VE0206' AS codigo, 'Manapiare' AS nombre, 'VE02' AS padre
UNION ALL SELECT 'VE0207' AS codigo, 'Autónomo Rio Negro' AS nombre, 'VE02' AS padre
UNION ALL SELECT 'VE0301' AS codigo, 'Anaco' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0302' AS codigo, 'Aragua' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0303' AS codigo, 'Fernando de Peñalver' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0304' AS codigo, 'Francisco del Carmen Carvajal' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0305' AS codigo, 'Francisco de Miranda' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0306' AS codigo, 'Guanta' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0307' AS codigo, 'Independencia' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0308' AS codigo, 'Juan Antonio Sotillo' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0309' AS codigo, 'Juan Manuel Cajigal' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0310' AS codigo, 'José Gregorio Monagas' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0311' AS codigo, 'Libertad' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0312' AS codigo, 'Manuel Ezequiel Bruzual' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0313' AS codigo, 'Pedro María Freites' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0314' AS codigo, 'Piritu' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0315' AS codigo, 'San José de Guanipa' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0316' AS codigo, 'San Juan de Capistrano' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0317' AS codigo, 'Santa Ana' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0318' AS codigo, 'Simón Bolívar' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0319' AS codigo, 'Simón Rodríguez' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0320' AS codigo, 'Sir Arthur Mc Gregor' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0321' AS codigo, 'Diego Bautista Urbaneja' AS nombre, 'VE03' AS padre
UNION ALL SELECT 'VE0401' AS codigo, 'Achaguas' AS nombre, 'VE04' AS padre
UNION ALL SELECT 'VE0402' AS codigo, 'Biruaca' AS nombre, 'VE04' AS padre
UNION ALL SELECT 'VE0403' AS codigo, 'Muñoz' AS nombre, 'VE04' AS padre
UNION ALL SELECT 'VE0404' AS codigo, 'Páez' AS nombre, 'VE04' AS padre
UNION ALL SELECT 'VE0405' AS codigo, 'Pedro Camejo' AS nombre, 'VE04' AS padre
UNION ALL SELECT 'VE0406' AS codigo, 'Rómulo Gallegos' AS nombre, 'VE04' AS padre
UNION ALL SELECT 'VE0407' AS codigo, 'San Fernando' AS nombre, 'VE04' AS padre
UNION ALL SELECT 'VE0501' AS codigo, 'Bolívar' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0502' AS codigo, 'Camatagua' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0503' AS codigo, 'Girardot' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0504' AS codigo, 'José Ángel Lamas' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0505' AS codigo, 'José Félix Ribas' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0506' AS codigo, 'José Rafael Revenga' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0507' AS codigo, 'Libertador' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0508' AS codigo, 'Mario Briceño Iragorri' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0509' AS codigo, 'San Casimiro' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0510' AS codigo, 'San Sebastián' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0511' AS codigo, 'Santiago Mariño' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0512' AS codigo, 'Santos Michelena' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0513' AS codigo, 'Sucre' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0514' AS codigo, 'Tovar' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0515' AS codigo, 'Urdaneta' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0516' AS codigo, 'Ezequiel Zamora' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0517' AS codigo, 'Francisco Linares Alcántara' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0518' AS codigo, 'Ocumare de la Costa de Oro' AS nombre, 'VE05' AS padre
UNION ALL SELECT 'VE0601' AS codigo, 'Alberto Arvelo Torrealba' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0602' AS codigo, 'Antonio José de Sucre' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0603' AS codigo, 'Arismendi' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0604' AS codigo, 'Barinas' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0605' AS codigo, 'Bolívar' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0606' AS codigo, 'Cruz Paredes' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0607' AS codigo, 'Ezequiel Zamora' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0608' AS codigo, 'Obispos' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0609' AS codigo, 'Pedraza' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0610' AS codigo, 'Rojas' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0611' AS codigo, 'Sosa' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0612' AS codigo, 'Andrés Eloy Blanco' AS nombre, 'VE06' AS padre
UNION ALL SELECT 'VE0701' AS codigo, 'Caroní' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0702' AS codigo, 'Cedeño' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0703' AS codigo, 'El Callao' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0704' AS codigo, 'Gran Sabana' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0705' AS codigo, 'Angostura del Orinoco' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0706' AS codigo, 'Piar' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0707' AS codigo, 'Bolivariano Angostura' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0708' AS codigo, 'Roscio' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0709' AS codigo, 'Sifontes' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0710' AS codigo, 'Sucre' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0711' AS codigo, 'Padre Pedro Chien' AS nombre, 'VE07' AS padre
UNION ALL SELECT 'VE0801' AS codigo, 'Bejuma' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0802' AS codigo, 'Carlos Arvelo' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0803' AS codigo, 'Diego Ibarra' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0804' AS codigo, 'Guacara' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0805' AS codigo, 'Juan José Mora' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0806' AS codigo, 'Libertador' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0807' AS codigo, 'Los Guayos' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0808' AS codigo, 'Miranda' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0809' AS codigo, 'Montalbán' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0810' AS codigo, 'Naguanagua' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0811' AS codigo, 'Puerto Cabello' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0812' AS codigo, 'San Diego' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0813' AS codigo, 'San Joaquín' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0814' AS codigo, 'Valencia' AS nombre, 'VE08' AS padre
UNION ALL SELECT 'VE0901' AS codigo, 'Anzoátegui' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE0902' AS codigo, 'Tinaquillo' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE0903' AS codigo, 'Girardot' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE0904' AS codigo, 'Lima Blanco' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE0905' AS codigo, 'Pao de San Juan Bautista' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE0906' AS codigo, 'Ricaurte' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE0907' AS codigo, 'Rómulo Gallegos' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE0908' AS codigo, 'Ezequiel Zamora' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE0909' AS codigo, 'Tinaco' AS nombre, 'VE09' AS padre
UNION ALL SELECT 'VE1001' AS codigo, 'Antonio Díaz' AS nombre, 'VE10' AS padre
UNION ALL SELECT 'VE1002' AS codigo, 'Casacoima' AS nombre, 'VE10' AS padre
UNION ALL SELECT 'VE1003' AS codigo, 'Pedernales' AS nombre, 'VE10' AS padre
UNION ALL SELECT 'VE1004' AS codigo, 'Tucupita' AS nombre, 'VE10' AS padre
UNION ALL SELECT 'VE1101' AS codigo, 'Acosta' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1102' AS codigo, 'Bolívar' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1103' AS codigo, 'Buchivacoa' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1104' AS codigo, 'Cacique Manaure' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1105' AS codigo, 'Carirubana' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1106' AS codigo, 'Colina' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1107' AS codigo, 'Dabajuro' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1108' AS codigo, 'Democracia' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1109' AS codigo, 'Falcón' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1110' AS codigo, 'Federación' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1111' AS codigo, 'Jacura' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1112' AS codigo, 'Los Taques' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1113' AS codigo, 'Mauroa' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1114' AS codigo, 'Miranda' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1115' AS codigo, 'Monseñor Iturriza' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1116' AS codigo, 'Palmasola' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1117' AS codigo, 'Petit' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1118' AS codigo, 'Piritu' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1119' AS codigo, 'San Francisco' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1120' AS codigo, 'Silva' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1121' AS codigo, 'Sucre' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1122' AS codigo, 'Tocopero' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1123' AS codigo, 'Unión' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1124' AS codigo, 'Urumaco' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1125' AS codigo, 'Zamora' AS nombre, 'VE11' AS padre
UNION ALL SELECT 'VE1201' AS codigo, 'Camaguan' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1202' AS codigo, 'Chaguaramas' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1203' AS codigo, 'El Socorro' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1204' AS codigo, 'San Gerónimo de Guayabal' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1205' AS codigo, 'Leonardo Infante' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1206' AS codigo, 'Las Mercedes' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1207' AS codigo, 'Julián Mellado' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1208' AS codigo, 'Francisco de Miranda' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1209' AS codigo, 'José Tadeo Monagas' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1210' AS codigo, 'Ortiz' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1211' AS codigo, 'José Félix Ribas' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1212' AS codigo, 'Juan Germán Roscio' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1213' AS codigo, 'San José de Guaribe' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1214' AS codigo, 'Santa María de Ipire' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1215' AS codigo, 'Pedro Zaraza' AS nombre, 'VE12' AS padre
UNION ALL SELECT 'VE1301' AS codigo, 'Andrés Eloy Blanco' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1302' AS codigo, 'Crespo' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1303' AS codigo, 'Iribarren' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1304' AS codigo, 'Jiménez' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1305' AS codigo, 'Moran' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1306' AS codigo, 'Palavecino' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1307' AS codigo, 'Simón Planas' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1308' AS codigo, 'Torres' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1309' AS codigo, 'Urdaneta' AS nombre, 'VE13' AS padre
UNION ALL SELECT 'VE1401' AS codigo, 'Alberto Adriani' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1402' AS codigo, 'Andrés Bello' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1403' AS codigo, 'Antonio Pinto Salinas' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1404' AS codigo, 'Aricagua' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1405' AS codigo, 'Arzobispo Chacón' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1406' AS codigo, 'Campo Elías' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1407' AS codigo, 'Caracciolo Parra Olmedo' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1408' AS codigo, 'Cardenal Quintero' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1409' AS codigo, 'Guaraque' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1410' AS codigo, 'Julio Cesar Sala' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1411' AS codigo, 'Justo Briceño' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1412' AS codigo, 'Libertador' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1413' AS codigo, 'Miranda' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1414' AS codigo, 'Obispo Ramos de Lora' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1415' AS codigo, 'Padre Noguera' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1416' AS codigo, 'Pueblo Llano' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1417' AS codigo, 'Rangel' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1418' AS codigo, 'Rivas Dávila' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1419' AS codigo, 'Santos Marquina' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1420' AS codigo, 'Sucre' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1421' AS codigo, 'Tovar' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1422' AS codigo, 'Tulio Febres Cordero' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1423' AS codigo, 'Zea' AS nombre, 'VE14' AS padre
UNION ALL SELECT 'VE1501' AS codigo, 'Acevedo' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1502' AS codigo, 'Andrés Bello' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1503' AS codigo, 'Baruta' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1504' AS codigo, 'Brión' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1505' AS codigo, 'Buroz' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1506' AS codigo, 'Carrizal' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1507' AS codigo, 'Chacao' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1508' AS codigo, 'Cristóbal Rojas' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1509' AS codigo, 'El Hatillo' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1510' AS codigo, 'Bolivariano Guaicaipuro' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1511' AS codigo, 'Independencia' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1512' AS codigo, 'Lander' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1513' AS codigo, 'Los Salías' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1514' AS codigo, 'Páez' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1515' AS codigo, 'Paz Castillo' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1516' AS codigo, 'Pedro Gual' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1517' AS codigo, 'Plaza' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1518' AS codigo, 'Simón Bolívar' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1519' AS codigo, 'Sucre' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1520' AS codigo, 'Urdaneta' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1521' AS codigo, 'Zamora' AS nombre, 'VE15' AS padre
UNION ALL SELECT 'VE1601' AS codigo, 'Acosta' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1602' AS codigo, 'Aguasay' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1603' AS codigo, 'Bolívar' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1604' AS codigo, 'Caripe' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1605' AS codigo, 'Cedeño' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1606' AS codigo, 'Ezequiel Zamora' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1607' AS codigo, 'Libertador' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1608' AS codigo, 'Maturín' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1609' AS codigo, 'Piar' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1610' AS codigo, 'Punceres' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1611' AS codigo, 'Santa Babara' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1612' AS codigo, 'Sotillo' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1613' AS codigo, 'Uracoa' AS nombre, 'VE16' AS padre
UNION ALL SELECT 'VE1701' AS codigo, 'Antolín del Campo' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1702' AS codigo, 'Arismendi' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1703' AS codigo, 'Díaz' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1704' AS codigo, 'García' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1705' AS codigo, 'Gómez' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1706' AS codigo, 'Maneiro' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1707' AS codigo, 'Marcano' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1708' AS codigo, 'Mariño' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1709' AS codigo, 'Macanao' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1710' AS codigo, 'Tubores' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1711' AS codigo, 'Villalba' AS nombre, 'VE17' AS padre
UNION ALL SELECT 'VE1801' AS codigo, 'Agua Blanca' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1802' AS codigo, 'Araure' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1803' AS codigo, 'Esteller' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1804' AS codigo, 'Guanare' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1805' AS codigo, 'Guanarito' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1806' AS codigo, 'Monseñor José Vicente de Und' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1807' AS codigo, 'Ospino' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1808' AS codigo, 'Páez' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1809' AS codigo, 'Papelón' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1810' AS codigo, 'San Genaro de Boconoito' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1811' AS codigo, 'San Rafael de Onoto' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1812' AS codigo, 'Santa Rosalía' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1813' AS codigo, 'Sucre' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1814' AS codigo, 'Turen' AS nombre, 'VE18' AS padre
UNION ALL SELECT 'VE1901' AS codigo, 'Andrés Eloy Blanco' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1902' AS codigo, 'Andrés Mata' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1903' AS codigo, 'Arismendi' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1904' AS codigo, 'Benítez' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1905' AS codigo, 'Bermúdez' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1906' AS codigo, 'Bolívar' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1907' AS codigo, 'Cajigal' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1908' AS codigo, 'Cruz Salmerón Acosta' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1909' AS codigo, 'Libertador' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1910' AS codigo, 'Mariño' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1911' AS codigo, 'Mejía' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1912' AS codigo, 'Montes' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1913' AS codigo, 'Ribero' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1914' AS codigo, 'Sucre' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE1915' AS codigo, 'Valdez' AS nombre, 'VE19' AS padre
UNION ALL SELECT 'VE2001' AS codigo, 'Andrés Bello' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2002' AS codigo, 'Antonio Rómulo Costa' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2003' AS codigo, 'Ayacucho' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2004' AS codigo, 'Bolívar' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2005' AS codigo, 'Cárdenas' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2006' AS codigo, 'Córdoba' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2007' AS codigo, 'Fernández Feo' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2008' AS codigo, 'Francisco de Miranda' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2009' AS codigo, 'García de Hevia' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2010' AS codigo, 'Guasimos' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2011' AS codigo, 'Independencia' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2012' AS codigo, 'Jáuregui' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2013' AS codigo, 'José María Vargas' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2014' AS codigo, 'Junín' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2015' AS codigo, 'Libertad' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2016' AS codigo, 'Libertador' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2017' AS codigo, 'Lobatera' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2018' AS codigo, 'Michelena' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2019' AS codigo, 'Panamericano' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2020' AS codigo, 'Pedro María Ureña' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2021' AS codigo, 'Rafael Urdaneta' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2022' AS codigo, 'Samuel Darío Maldonado' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2023' AS codigo, 'San Cristóbal' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2024' AS codigo, 'Seboruco' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2025' AS codigo, 'Simón Rodríguez' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2026' AS codigo, 'Sucre' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2027' AS codigo, 'Torbes' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2028' AS codigo, 'Uribante' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2029' AS codigo, 'San Judas Tadeo' AS nombre, 'VE20' AS padre
UNION ALL SELECT 'VE2101' AS codigo, 'Andrés Bello' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2102' AS codigo, 'Bocono' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2103' AS codigo, 'Bolívar' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2104' AS codigo, 'Candelaria' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2105' AS codigo, 'Carache' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2106' AS codigo, 'Escuque' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2107' AS codigo, 'José Felipe Márquez Cañizal' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2108' AS codigo, 'Juan Vicente Campo Elías' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2109' AS codigo, 'La Ceiba' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2110' AS codigo, 'Miranda' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2111' AS codigo, 'Monte Carmelo' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2112' AS codigo, 'Motatan' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2113' AS codigo, 'Pampan' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2114' AS codigo, 'Pampanito' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2115' AS codigo, 'Rafael Rangel' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2116' AS codigo, 'San Rafael de Carvajal' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2117' AS codigo, 'Sucre' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2118' AS codigo, 'Trujillo' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2119' AS codigo, 'Urdaneta' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2120' AS codigo, 'Valera' AS nombre, 'VE21' AS padre
UNION ALL SELECT 'VE2201' AS codigo, 'Arístides Bastidas' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2202' AS codigo, 'Bolívar' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2203' AS codigo, 'Bruzual' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2204' AS codigo, 'Cocorote' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2205' AS codigo, 'Independencia' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2206' AS codigo, 'José Antonio Páez' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2207' AS codigo, 'La Trinidad' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2208' AS codigo, 'Manuel Monge' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2209' AS codigo, 'Nirgua' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2210' AS codigo, 'Peña' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2211' AS codigo, 'San Felipe' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2212' AS codigo, 'Sucre' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2213' AS codigo, 'Urachiche' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2214' AS codigo, 'Veroes' AS nombre, 'VE22' AS padre
UNION ALL SELECT 'VE2301' AS codigo, 'Almirante Padilla' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2302' AS codigo, 'Baralt' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2303' AS codigo, 'Cabimas' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2304' AS codigo, 'Catatumbo' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2305' AS codigo, 'Colon' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2306' AS codigo, 'Francisco Javier Pulgar' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2307' AS codigo, 'Jesús Enrique Lossada' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2308' AS codigo, 'Jesús María Semprum' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2309' AS codigo, 'La Cañada de Urdaneta' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2310' AS codigo, 'Lagunillas' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2311' AS codigo, 'Machiques de Perija' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2312' AS codigo, 'Mara' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2313' AS codigo, 'Maracaibo' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2314' AS codigo, 'Miranda' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2315' AS codigo, 'Indígena Bolivariano Guajira' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2316' AS codigo, 'Rosario de Perija' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2317' AS codigo, 'San Francisco' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2318' AS codigo, 'Santa Rita' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2319' AS codigo, 'Simón Bolívar' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2320' AS codigo, 'Sucre' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2321' AS codigo, 'Valmore Rodríguez' AS nombre, 'VE23' AS padre
UNION ALL SELECT 'VE2401' AS codigo, 'Vargas' AS nombre, 'VE24' AS padre
) m JOIN unidades_territoriales e ON e.codigo = m.padre
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), nivel = VALUES(nivel), padre_id = VALUES(padre_id), activo = 1;

-- Verificación: debe mostrar 1 nacional, 24 estadales, 335 municipales.
SELECT nivel, COUNT(*) AS cantidad FROM unidades_territoriales GROUP BY nivel;
