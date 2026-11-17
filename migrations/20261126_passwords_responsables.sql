USE movilizaciones;

-- ============================================================================
-- Contraseñas de los responsables estadales: la contraseña inicial es el
-- NOMBRE DEL ESTADO tal como está escrito en la estructura (con tildes y
-- espacios), por ejemplo «Distrito Capital» o «Anzoátegui».
--
-- Solo se asigna a cuentas que todavía no tienen contraseña ('!'), así no se
-- pisan las contraseñas que ya hayan cambiado. Puede ejecutarse varias veces.
-- Inicio de sesión del portal: número de teléfono + contraseña.
-- Recomendación: pedir a cada responsable que la cambie al entrar.
-- ============================================================================

START TRANSACTION;

CREATE TEMPORARY TABLE tmp_password_estado (
  codigo VARCHAR(10) NOT NULL PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

INSERT INTO tmp_password_estado (codigo, password_hash) VALUES
  ('VE01', '$2y$10$JE5gU77DUU791InJ5YflluPmcxuvAKgnig3KNGmZj9jD.kWZhc5Q.'),
  ('VE02', '$2y$10$aW0HAdmGB5fc8.0iX9609.NkDTu1jFhJG2GuJm5h0fnCW3Dm/TB/C'),
  ('VE03', '$2y$10$lJU1yVfC7KYmFXqxLLYqhusS0DbOd213d53ujKOHC9pJhmtpJc6VW'),
  ('VE04', '$2y$10$YnG/zSU5Aaljq4UreA5FX.XD7KNRZkjM0wI0hu8bwfRJF.ImPEqLi'),
  ('VE05', '$2y$10$LnmLHgXXO2efJbNJAMTgLOLtQP7e9O5xPu2OLKN2vOu3HsXxYgPCG'),
  ('VE06', '$2y$10$OwKi8ujSQA4aJYZeCFf5GOdl/DgAzsBYfxdLHLKdMPwfTs7Y42f3W'),
  ('VE07', '$2y$10$AZ6t7el861UiQV8WcGPTbuyksgyyVYqvM20U8YGMESknHniSYLlTW'),
  ('VE08', '$2y$10$18hew8c5fKHrDD2AsQYqD.xONbKU2wELnqYrhWHuYQOmWo31F4OMi'),
  ('VE09', '$2y$10$OkjSfq7kYSFhY7mtG4HM6eTjewnLk7T0aHJjR.NQ6HqCepCDCHNn2'),
  ('VE10', '$2y$10$ytxn9mrseu6rtwJiL.lgBuLvHzk27/8dMLA8/D1jlcQmqglz2I7bG'),
  ('VE11', '$2y$10$QTYhG4vRTDllrxasqH33WOLuB4qfOEmr8TVu0WRtSWdm1PTF6aYni'),
  ('VE12', '$2y$10$WrD7m3huromxFB8KDjRzJ.8Y3swh4DOQIar2wzJrHPmlqhgW3zPyy'),
  ('VE13', '$2y$10$ukPhR.c3m4uZsevbfBojFeegW27ORkBVFtEwOVPbroz6grrfTpZz6'),
  ('VE14', '$2y$10$VZG0CCcufLBLyeLkLbXXwuvRY3Lomeshxepw25mOsuPP9ZyPmIQNm'),
  ('VE15', '$2y$10$pE9.jclhwnLCT6lOqo30POkq8znyjoRPEusFBXjbFMsmDv6a2jxyi'),
  ('VE16', '$2y$10$wNVpHq3tjWhipEaidcvopOTi36F.8yVBuJzMaxduXXPRuW0AQIpxO'),
  ('VE17', '$2y$10$ge88f5wMSR7AU9F.HRo7Y.zFgWEZt7117j9WXqpsxhxLXPMR6XbWO'),
  ('VE18', '$2y$10$koFbZ.W2qVZSJSq9e1fiRuxuokvQsYp1.uFhX/jyg13pLIHA0fteK'),
  ('VE19', '$2y$10$fabEVUIySDVwbNeZPyddQOhTK757HWmBm9Gz3dW4yhqKeCIr.mgWK'),
  ('VE20', '$2y$10$HC3ohv2YftUzQHcjTS5GS.gq2gAtQNv1vWbZS6tcySwwfecEPh5VC'),
  ('VE21', '$2y$10$OPQZWNNKkOQgifl/jnUqr.Eivc8lN6jtt3dC.YDaQO3WhSaZzspdu'),
  ('VE22', '$2y$10$RhPZbyVaJqgRztO3CBB49.nsMZ7P74xjO/03Wr67MP0HtAc2HQAt2'),
  ('VE23', '$2y$10$3dA6pZTSFMy7XUKM/V4kOOcTL.crXbx5HBNAuGrbDyDniwFZpkjVO'),
  ('VE24', '$2y$10$SgfBIjNLy90RB7bod3UrdOP7sKzzslAOtfVORAVpfuV9u0nMyC6Fy');

UPDATE usuarios u
JOIN unidades_territoriales t ON t.id = u.unidad_territorial_id AND t.nivel = 'estadal'
JOIN tmp_password_estado p ON p.codigo = t.codigo
SET u.password_hash = p.password_hash
WHERE u.rol = 'responsable'
  AND u.password_hash = '!';

DROP TEMPORARY TABLE tmp_password_estado;

COMMIT;

-- Verificación: cuentas que siguen sin contraseña
SELECT t.nombre AS estado, u.nombre AS responsable, u.telefono
FROM usuarios u
JOIN unidades_territoriales t ON t.id = u.unidad_territorial_id
WHERE u.rol = 'responsable' AND u.password_hash = '!';
