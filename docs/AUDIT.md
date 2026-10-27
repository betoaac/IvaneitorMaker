# Auditoría de código · 27 de octubre de 2026

## Alcance y evidencia

Se revisaron `main.js`, HTML, CSS, arranque Electron, dependencias/lockfile, fuentes, rutas de imágenes, persistencia, editor, rich text, exportaciones y galería. La copia recuperada no tenía Git ni pruebas. Las referencias **originales** de esta tabla corresponden al proyecto conservado en `C:/Users/CaptainHec/Downloads/_OLD/CaptainHec_Cardmaker`; el código actual está separado en módulos, por lo que sus números de línea cambiaron.

Se realizó revisión independiente adicional, probes con VM, pruebas Node y pruebas con Chrome. No se creó un índice GitNexus: la evidencia es inspección directa y ejecución, sin atribuir cobertura de análisis de grafo/taint no realizado. No se inspeccionaron documentos privados del usuario ni se conectaron cuentas Google.

## Hallazgos y tratamiento

| Prioridad | Ubicación original | Problema comprobado | Tratamiento actual |
| --- | --- | --- | --- |
| Alta | `electron-main.js:12–15`, `main.js:2710,2767,3025` | Node habilitado en renderer y datos de cartas en `innerHTML`: inyección con acceso al sistema | Web sin Node; galería construye DOM/texto; arranque Electron aislado y sandbox; ya no hay guardado por fs en frontend |
| Alta | `main.js:955–1580` | Renders comparten datos/contexto y continúan tras awaits sin comprobar vigencia | Snapshot y canvas propios; composición atómica de vista previa |
| Alta | `main.js:1586,2385,2447` | Descarga PNG/miniatura antes de completar dibujo | Descarga y guardado esperan un render completo de su snapshot |
| Alta | `main.js:3069–3236` | Lote muta cardData, imágenes y controles; renders cancelados guardan imágenes viejas | Lote aislado serial; entradas congeladas; nombres únicos; errores por carta e informe; cancelación |
| Alta | `main.js:1624,2807,325` | JSON sin validar o fusionado con carta previa | Validación de estructuras, URLs, límites y aliases desde defaults; no reemplaza editor si falla |
| Alta | `main.js:2885–2926` | Carta en blanco conserva arte, evo, tipos, retirada y costes | Reinicio del modelo y controles; prueba de regresión |
| Media | `main.js:338–477,817–933` | Restauración parcial borra posiciones/config importada | Restauración completa de campos existentes y preservación de ajustes sin control; probes de posiciones y valores cero |
| Media | `main.js:589–708,76–130` | Respuestas viejas PokeAPI/evo pisan una carta posterior | AbortController, timeout y generación; cancelar al importar, resetear y guardar |
| Media | `main.js:1052` | Carga de imagen inválida puede colgar render indefinidamente | Error explícito, timeout y liberación de canvas |
| Media | `main.js:1858–1881` | Iconos custom no están cargados en primera exportación | Precarga esperada por snapshot; símbolos guardados por carta |
| Media | Fuentes Canvas | `document.fonts.ready` por sí solo no solicita fuentes usadas solo en canvas | `document.fonts.load` explícito antes del primer dibujo |
| Media | `main.js:318–320` | localStorage con imágenes puede agotar cuota sin informar | Borrador/biblioteca IndexedDB; errores visibles; respaldo JSON |
| Media | `main.js:2347–2363,3195` | Nombres inválidos, números rompen padStart y duplicados sobrescriben PNG | Conversión de tipos, sanitización y prefijo secuencial de lote |
| Media | `main.js:3236–3310` | Fórmulas CSV ejecutables, ceros perdidos, orden muta lista | Escape de fórmulas/control whitespace, preserva 0 y copia antes de ordenar |
| Media | `main.js:2456–2469` | Escritura JSON y thumbnail separadas; fallo parcial | Registro local atómico con miniatura y snapshot ya dibujados; Drive guarda un solo documento |
| Media | `main.js:2381,2536,3070,3237` | Guardado/galería/lotes deshabilitados en navegador | Proveedores IndexedDB/Drive y exportaciones de navegador |
| Media | `main.js:533` | Tipo TCG activo busca ID inexistente | Corregido `tcg_type_selector` |
| Media | `main.js:151,650` | Mapas de tipos con nombres incompatibles y tipos API faltantes | Corrección Psychic/Dark/Dragon/Steel/Normal/Ground/Rock |
| Media | `main.js:1020,1520` | Fairy no encuentra Hada; Estelar sin fondo; doble Inverted | Hada mapeado; Cookie mantiene Estelar con fondo Normal reemplazable; evita doble sufijo |
| Media | CSS y `main.js:167` | Fuente y arte inicial apuntan a archivos ausentes | Fuente existente y arte local existente; manifest de recursos |
| Media | `main.js:1720,1762` | `[g]` se parsea distinto a `[G]` | Lookup normalizado a mayúsculas |
| Media | `main.js:1472` | Debilidad siempre multiplica aunque se escribe +20 | Se dibuja + o multiplicador según el dato |
| Media | `main.js:952`, fondos | Caché decodificada sin límite; PNG gigantes y canvas UHD | Caché de 20 imágenes, previews 1x, fondos optimizados y liberación de temporales; lotes por partes |
| Media | `main.js:2153–2167` | Texto importado enorme en algoritmo de composición de flavor | Límites de texto y profundidad de JSON; no se reescribió el algoritmo tipográfico |
| Media | HTML/controles | Sin viewport, layout móvil fijo, quitar energía depende de clic derecho | Viewport, adaptación móvil, foco visible, controles con teclado y botón −; falta auditoría WCAG exhaustiva |
| Alta | Integración nueva | Cambio de cuenta durante importación/perfil podría mezclar bibliotecas | Operaciones bloquean cambio de sesión; token ligado a repositorio; invalidación de consultas; prueba de carrera de cuentas |
| Media | Persistencia nueva | Actualizar/borrar carta desde pestaña obsoleta | Revisiones en transacciones IndexedDB y ETag/If-Match en Drive; no actualiza remoto si falta revisión |

## Dependencias

El lockfile original reportaba **23 paquetes afectados: 1 crítico, 21 altos y 1 moderado**. Pertenecían a la cadena de desarrollo Electron/electron-builder; no eran 23 vulnerabilidades servidas al navegador. Se separó la web de ese empaquetado, sin aplicar `audit fix --force`. El instalador original no fue actualizado.

La web utiliza `fflate` 0.8.3 para ZIP y Playwright para pruebas. `npm audit` del nuevo lockfile reportó **0 vulnerabilidades** al ejecutar la comprobación. fflate 0.8.3 corrige el aviso de ZIP64; [release oficial](https://github.com/101arrowz/fflate/releases/tag/v0.8.3). Auditoría de dependencias es una fotografía de esa fecha, no una garantía permanente.

## Verificación y límites del resultado

El artefacto final ocupa **20,2 MB**. Se optimizaron **1565 imágenes de 360,8 MB a 16,2 MB**, sin modificar los originales. Se verificaron todas las rutas y sus mayúsculas para alojamiento Linux. La validación local ejecutó **11 pruebas Node y 9 pruebas de navegador**, incluyendo un recorrido UI Google/Drive con respuestas simuladas.

Las pruebas cubren normalización/archivos malformados, nombres, CSV, mapeo Hada/Cookie, paginación Drive, expiración, conflictos, límite de documentos, carrera de cuentas; en Chrome prueban los tipos y rich text, import/reset, PNG real, galería/persistencia/XSS textual, lote con errores y edición simultánea, y adaptación móvil. Los escenarios están en `tests/` y pueden reejecutarse con los comandos del README.

La nueva ruta de despliegue no está publicada. Falta configurar OAuth y ejecutar las pruebas reales indicadas en [DEPLOYMENT.md](DEPLOYMENT.md). En particular, los mocks de Drive no prueban CORS, entrega de ETag, permisos reales, cuotas, consentimiento ni políticas de la cuenta. Tampoco se probaron todos los archivos históricos de cartas, porque la carpeta de proyecto recuperada no contenía esos datos.

Puntos que permanecen deliberadamente visibles:

- El renderer y parte del editor conservan estructura y comentarios heredados; no se hizo una reescritura tipográfica completa. Hay deuda de modularidad y accesibilidad.
- La CSP permite handlers inline del editor heredado; se eliminó la interpolación de datos de usuarios en HTML, pero conviene migrar todos los handlers a addEventListener para endurecerla más.
- Drive guarda documentos de hasta 5 MB, no subidas reanudables. No hay backend propio ni sincronización automática/collaborativa.
- Si una creación remota termina en timeout, su estado es ambiguo: la app no reintenta automáticamente y se debe recargar la galería antes de repetir Guardar.
- Borradores locales tienen debounce de 500 ms: cerrar antes puede perder el último cambio no guardado. Guardar explícitamente confirma el registro; no depende de ese temporizador.
- Los enlaces ZIP retienen los resultados mientras están disponibles. Para colecciones muy grandes se recomienda trabajar por set.
- La compresión reduce detalle de fondos; 4x exporta texto a esa resolución y amplía el fondo reducido. Los originales de 5000 px siguen intactos localmente.

La conclusión es **preparado y probado localmente para publicación estática**, con **integración Google implementada pendiente de activación y prueba real**. No equivale a producción certificada ni a una actualización del instalador Electron original.
