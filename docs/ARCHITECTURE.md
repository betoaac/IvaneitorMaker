# ADR 001: editor estático con almacenamiento por usuario

Fecha: 27 de octubre de 2026. Estado: implementado localmente; activación OAuth y despliegue pendientes.

La aplicación recuperada dependía de `fs`, rutas del usuario y globals de Electron. Publicar esos archivos como HTML dejaba sin biblioteca, guardado y lotes. Sus renders y operaciones de disco compartían el estado mutable del editor.

Se mantiene el editor Canvas y su motor tipográfico para preservar las cartas existentes. Se separan las responsabilidades:

| Archivo | Responsabilidad |
| --- | --- |
| `core.js` | Validación/normalización desde defaults, aliases históricos, nombres portables y CSV seguro |
| `main.js` | Controles y captura de ajustes del editor recuperado |
| `editor.js` | Carga transaccional de cartas/imágenes, borrador y vista previa |
| `renderer.js` | Dibujo de un snapshot en un canvas propio; sin leer campos del formulario |
| `images.js` | Resolución de recursos optimizados, carga con timeout/caché acotada y fuentes |
| `storage.js` | Biblioteca y borrador IndexedDB; transacciones y revisiones |
| `drive.js` | REST de Drive, paginación, errores de permiso/sesión y revisiones |
| `auth.js` | Consentimiento/selección de cuenta Google y token temporal en memoria |
| `library.js` | Galería, abrir/borrar/guardar/importar y respaldo JSON |
| `batch.js` | Lotes seriales aislados, ZIP por partes, cancelación e informe; CSV |
| `scripts/build.js` | Artefacto estático por lista explícita, configuración pública y presupuesto de tamaño |

Un proveedor de biblioteca expone `list()`, `get(id)`, `save(record, revision)` y `remove(id, revision)`. Un registro tiene `id`, `timestamp`, `data` normalizada, `thumbnail` opcional y revisión opaca del proveedor. Una carta importada se normaliza desde defaults, nunca sobre la carta anterior. La marca `remote` distingue un registro de Drive que requiere revisión para sobrescribirlo.

El render recibe un snapshot, multiplicador y canvas de destino. Precarga las fuentes y símbolos antes de dibujar. Cada vista previa se compone fuera de pantalla y solo la solicitud vigente copia el resultado al canvas visible. El lote no modifica el DOM ni `cardData`, por lo que editar o recibir una respuesta PokeAPI no cambia sus entradas.

Para evitar un servidor propio se usa el token model oficial de Google Identity Services y `drive.appdata`. La autorización pertenece a la cuenta elegida; no hay un backend que acepte identidades declaradas por el frontend. Si se incorpora un servidor futuro, deberá validar sesiones en el servidor y comprobar propiedad de cada objeto; este código cliente no es una frontera de autorización para un backend futuro.

No se eligió una base compartida: exigiría cuentas, reglas de autorización, mantenimiento y cuotas adicionales. Drive permite independencia de bibliotecas, pero la carpeta es oculta y las actualizaciones reales/ETag requieren la verificación de integración documentada. El guardado sigue siendo explícito; no hay sincronización automática bidireccional ni edición colaborativa.

Los PNG de fondos de 3571×5000 se conservan localmente. La vista previa usa fondos WebP ligeros a 745×1040. Cada exportación usa fondos remuestreados desde los originales a exactamente 2980×4160 y codificados en WebP sin pérdida (lossless=True, exact=True), además de los PNG originales de iconos y sprites. CARD_EXPORT_ASSETS separa estos recursos de los de previsualización; la carga es bajo demanda. Se compara cada imagen decodificada contra el remuestreo de referencia, incluyendo su canal alfa. La caché limita los píxeles decodificados a 96 MB. Las imágenes de usuario se conservan sin recomprimir ni reducir. Los JSON históricos conservan sus rutas `.png`; el manifest `assets.js` las resuelve a `web-assets/`. Esto evita renombrar datos históricos y funciona en subcarpetas de Pages. El build no necesita Pillow: solo regenerar imágenes requiere Python/Pillow.

La configuración pública contiene solo un OAuth client ID. No se incluyen secretos, refresh tokens ni carpetas de usuarios. CSP limita orígenes, pero mantiene `unsafe-inline` para los handlers del editor recuperado: sigue siendo deuda técnica, no una política CSP estricta.
