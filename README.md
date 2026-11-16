# Portal de movilizaciones

Portal web para coordinación y movilizadores. Incluye inicio de sesión con sesiones PHP, gestión de movilizaciones y un flujo móvil de cuatro etapas para registrar personas, transporte, ruta, confirmación y tracking con mapas MapLibre GL/OpenStreetMap.

## Requisitos

- XAMPP con PHP 8.1 o superior, Apache, las extensiones `pdo_mysql`, `fileinfo` y `mbstring`, y MySQL/MariaDB.
- Node.js LTS y npm para compilar MapLibre GL, MapLibre GL Directions y los estilos.
- Para que los teléfonos pidan ubicación, publica el portal bajo HTTPS. `localhost` solo funciona como origen seguro en el mismo equipo.

## Instalación inicial en XAMPP

1. Inicia Apache y MySQL/MariaDB desde XAMPP.
2. Para una instalación nueva, importa `schema.sql`. Si ya tienes la base anterior, conserva sus datos y ejecuta las migraciones pendientes en orden: `migrations/20261113_portal.sql` (solo si aún no habías agregado rutas y tracking), `migrations/20261114_estructura.sql`, `migrations/20261115_admin_login.sql`, `migrations/20261116_flujo_movilizador.sql`, `migrations/20261117_personas_estimadas.sql`, `migrations/20261118_roles_modulos_admin.sql`, `migrations/20261119_estadisticas_modulo.sql`, `migrations/20261120_remove_statistics_module.sql` y `migrations/20261121_tracking_arrival_vehicle_photos.sql`. Ejecuta cada migración una sola vez.
3. Crea un usuario MySQL propio de la aplicación con permisos sobre la base `movilizaciones`; no uses `root` ni guardes una contraseña dentro del código.
4. Copia `config.example.php` como `config.local.php` y reemplaza los datos de conexión. Genera un secreto de aplicación de al menos 32 caracteres; por ejemplo:

   ```sh
   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
   ```

5. Desde esta carpeta, compila el portal:

   ```sh
   npm install
   npm run build
   ```

6. Carga la estructura territorial. El comando es idempotente y registra el nivel nacional, las 24 entidades federales y sus 335 municipios:

   ```powershell
   C:\xampp\php\php.exe scripts\seed_territories.php
   ```

7. Crea la cuenta superadministradora inicial con el usuario `admin`. Introduce la contraseña mediante una variable de entorno; no se guarda en el repositorio ni se pasa como argumento del comando:

   ```powershell
   $securePassword = Read-Host "Contraseña inicial" -AsSecureString
   $env:MOV_SUPER_ADMIN_PASSWORD = [Net.NetworkCredential]::new("", $securePassword).Password
   C:\xampp\php\php.exe scripts\seed_super_admin.php
   Remove-Item Env:MOV_SUPER_ADMIN_PASSWORD
   ```

   Si ya existe el usuario `admin`, el script no lo sobrescribe. Usa **Configuración** en el panel para crear otros usuarios administrativos y asignarles un rol. `scripts\create_user.php` queda para crear cuentas de movilizador; estas inician sesión con su teléfono. Mantén `config.local.php` fuera del control de versiones.

8. Abre `http://localhost/movilizacion/` para entrar al **panel administrativo**. El portal de movilizadores está en `http://localhost/movilizacion/portal.php`. En teléfonos y en cualquier acceso fuera del equipo servidor, utiliza el dominio HTTPS real.

## Estructura territorial

- En el panel administrativo, coordinación abre **Estructura** para asignar el movilizador nacional, los 24 estadales y los 335 municipales. Una unidad solo puede tener una cuenta responsable.
- Desde **Estructura**, **Mostrar Estructura** abre una vista imprimible en formato horizontal con la jerarquía nacional, estadal y municipal, los nombres de responsables y su territorio; también señala las unidades que aún no tienen movilizador asignado.
- El panel administrativo de `index.php` y el portal de movilizadores de `portal.php` son accesos separados a la misma base. El primero solo admite cuentas `admin`; el segundo solo cuentas de movilizador y mantiene otra cookie de sesión.
- Las cuentas administrativas inician sesión con nombre de usuario y contraseña; las cuentas de movilizador, con teléfono y contraseña. Desde Estructura se puede cambiar la unidad de un movilizador, restablecer su contraseña o desactivar el acceso.
- **Configuración** permite crear y editar roles con permisos por módulo y cuentas administrativas asociadas a esos roles. Cada módulo permite ver y usar sus funciones; una cuenta no puede conceder permisos que ella misma no tenga. La cuenta `admin` conserva acceso total como superadministradora. La migración asigna a las demás cuentas administrativas existentes un rol con acceso general para conservar su acceso.
- El menú administrativo se organiza en **Seguimiento**, **Movilizaciones**, **Reportes**, **Estructura** y **Configuración**. La migración `20261120_remove_statistics_module.sql` elimina de los roles el permiso del módulo de Estadísticas, que ya no forma parte del panel.
- En **Movilizaciones**, **Abrir actividad** prepara una ficha extensa lista para imprimir o guardar como PDF, con los datos del evento, registros de responsables, personas, transporte, fotografías y estado del seguimiento.
- Al crear una movilización se elige estado y municipio. Todas las movilizaciones aparecen a todas las cuentas de movilizador activas, sin importar su nivel territorial. Cada persona recibe un registro individual al abrir la actividad; las fotos, cambios y sesiones de tracking quedan asociados a ese registro.
- Las cuentas heredadas que todavía no tengan teléfono no podrán iniciar sesión hasta que la persona administradora de la base les asigne uno (por ejemplo, en phpMyAdmin: `UPDATE usuarios SET telefono = '<telefono>' WHERE correo = '<correo>' AND telefono IS NULL;`). Las movilizaciones anteriores sin municipio también aparecen a todas las cuentas de movilizador activas.
- Los datos de divisiones territoriales se distribuyen en [`data/venezuela_territories.csv`](./data/venezuela_territories.csv). Fuente: [open-admin-data/venezuela-administrative-divisions](https://github.com/open-admin-data/venezuela-administrative-divisions), revisión `4ca781cd08378e1019610357fc7f5719859191f9`; dataset bajo licencia [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). La atribución y la revisión fijada se conservan aquí para facilitar su actualización responsable.

## Rutas y mapa

Al crear una movilización, coordinación puede hacer clic en el mapa para elegir el punto de partida y el destino. También puede usar el GPS del dispositivo para marcar la partida. El portal solicita a **OSRM** el trazado vial de conducción y muestra una distancia y tiempo estimados. Usa el estilo vectorial Liberty de OpenFreeMap con datos de OpenStreetMap como mapa base.

La estimación es de ruta vial, **no considera tráfico en tiempo real**. Las instancias públicas de OpenFreeMap/OSRM son servicios compartidos sin garantía de disponibilidad; para un despliegue de producción, revisa sus condiciones de uso y considera alojar los servicios o contratar un proveedor con SLA. La ruta incluye el punto elegido en el mapa, no una geocodificación de direcciones.

## Registro del movilizador y seguimiento

- El panel administrativo abre en **Seguimiento**. La vista presenta las movilizaciones en curso, las sesiones de tracking activas, la última ubicación recibida y las llegadas confirmadas; se actualiza cada 15 segundos. Al seleccionar un movilizador se muestra su ficha y recorrido; al pulsar **Movilizadores en ruta** se vuelve a encuadrar el mapa con todos los puntos actuales. Si deja de llegar señal, muestra por separado la última ubicación GPS y una posición proyectada a lo largo de la ruta guardada, según el tiempo estimado desde el inicio. Cuando se sincronizan puntos GPS pendientes, prevalece la señal real más reciente y se compara con la proyección. La posición proyectada es solo una estimación; una página web no puede obtener GPS mientras el navegador o el teléfono suspenden la página.
- En **Seguimiento**, el botón **Modo presentación** expande el mapa y muestra a su derecha todas las movilizaciones activas, con conteos de movilizadores y GPS. Seleccionar una tarjeta cambia el evento mostrado en el mapa. Se sale con el mismo botón o con `Esc`.
- El módulo administrativo **Reportes** lista todas las movilizaciones y permite generar una presentación resumida e imprimible desde cada fila: nombre, fecha, hora, lugar, municipio/estado, movilizadores registrados, personas estimadas al crear el evento, personas movilizadas reportadas o planificadas y vehículos agrupados por tipo. No incluye datos personales, códigos internos, coordenadas ni desglose por movilizador. Se puede imprimir o guardar como PDF desde el navegador.
- Todos los mapas usan MapLibre GL JS con el estilo vectorial Liberty de OpenFreeMap y datos de OpenStreetMap, sin requerir una clave de API. Los mapas de cálculo de ruta integran MapLibre GL Directions con OSRM; los de seguimiento muestran marcadores y rutas GPS, y los de consulta dibujan las rutas guardadas.
- Al seleccionar o pulsar el punto de un movilizador, el panel calcula la ruta vial desde la señal GPS actual al destino si hay conexión; sin señal dibuja la ruta planificada y muestra su avance y hora de llegada estimados. La ficha incluye su plan de personas, transporte, placas y evidencias cargadas.
- Los tiempos estimados se muestran en minutos hasta 59 minutos; desde una hora se presentan en horas y minutos. Las rutas de OSRM no incluyen tráfico en tiempo real y dependen de la conectividad.
- Una cuenta `admin` puede crear movilizaciones en estado **En curso**, con fecha, hora del evento, estimación de personas a movilizar, territorio y punto de llegada. No se asignan responsables ni cuotas durante la creación.
- Todas las cuentas activas de movilizador pueden ver y abrir cualquier movilización, independientemente de su jerarquía o territorio. Al abrirla, el sistema crea su registro individual sin asignación previa.
- En el listado del panel administrativo está disponible **Eliminar** para cada movilización. La acción solicita confirmación y elimina sus registros, evidencias y puntos de tracking; si algún archivo de foto no se puede borrar del disco, la interfaz informa cuántos quedaron pendientes.
- En cada asignación, el portal móvil guía al responsable por cuatro etapas: fotografía de la lista y revisión manual del conteo; vehículos individuales con tipo, placa y evidencia fotográfica asociada a cada vehículo; selección de salida/llegada; revisión y confirmación con evidencia fotográfica del grupo; e inicio del tracking. En las etapas se puede volver atrás para editar los datos antes de iniciar el viaje.
- En la confirmación y en la pantalla de inicio del viaje, las coordenadas de salida y llegada se consultan con Nominatim/OpenStreetMap para mostrar una zona aproximada (municipio/estado cuando esté disponible). Si no hay resultado, se muestran las coordenadas. Las coordenadas se envían a ese servicio público de geocodificación.
- La cantidad de personas y las placas de los vehículos se ingresan manualmente. Las fotos de la lista y de cada vehículo se guardan como evidencia; no se ejecuta reconocimiento automático de imágenes.
- Las fotos JPEG/PNG/WebP se guardan en el servidor (máximo 8 MB cada una) y se clasifican como lista, vehículo o grupo. El backend exige foto de lista antes de guardar el conteo, al menos una foto asociada a cada vehículo antes de guardar el transporte, y foto grupal antes de confirmar e iniciar el tracking. Las fotos históricas de vehículos permanecen disponibles, pero se identifican como evidencia sin asociación individual porque no se guardaba ese vínculo anteriormente.
- Administración marca únicamente el punto de llegada de la movilización. Cada movilizador marca su punto de partida y el portal calcula la ruta hasta el destino del evento con OSRM y muestra el tiempo aproximado; la estimación no incluye tráfico en tiempo real.
- El enlace compartido abre la actividad, pero solicita login y no activa la ubicación automáticamente.
- La persona acepta un consentimiento y pulsa **Inicio de viaje**. La página captura ubicaciones mientras está abierta y en primer plano, guarda los puntos localmente y los envía al backend. Si no hay Internet, el portal avisa que las ubicaciones quedan en el teléfono y se sincronizan al recuperar la conexión; se necesita conexión para iniciar un viaje y para confirmar su llegada.
- Al volver a abrir la movilización, el portal recupera la sesión activa del servidor y reanuda el GPS si el navegador conserva los permisos. **Confirmar llegada** guarda la ubicación actual y marca al movilizador como llegado en Seguimiento. Al cambiar de aplicación, bloquear el teléfono o cerrar el navegador, iOS/Android pueden detener la geolocalización de una página web; la sesión se conserva, pero el navegador no transmite mientras está suspendido o cerrado. Este modo **no garantiza seguimiento continuo en segundo plano**. Si ese requisito cambia, será necesario distribuir una app móvil nativa.

## Seguridad y operación

Las contraseñas se almacenan con `password_hash` y requieren al menos 8 caracteres; el acceso usa cookies de sesión `HttpOnly` y `SameSite=Lax`, las escrituras verifican CSRF y se limitan los intentos de inicio de sesión. El backend aplica permisos de responsable en lecturas, cambios, fotos y sesiones de tracking.

Antes de publicar:

- Configura HTTPS y un usuario de base de datos de privilegios mínimos.
- Define consentimiento, acceso interno y plazo de conservación de las rutas y fotos.
- Protege y respalda la base de datos y el directorio `uploads/attendance`.
- Reemplaza el servicio público de OSRM/OpenStreetMap si el volumen o el uso del proyecto lo requieren.
- En una base antigua, aplica las migraciones pendientes del paso de instalación (incluida la migración del flujo paso a paso) y carga la estructura territorial con el seeder antes de crear cuentas territoriales.
