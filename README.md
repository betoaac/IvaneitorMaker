# CaptainHec Cardmaker · web

Editor de cartas recuperado de la aplicación Electron y preparado para alojamiento estático. Conserva el editor, añade biblioteca local, acceso Google/Drive y exportación de colecciones sin modificar el editor mientras genera PNG.

## Probar localmente

Requiere Node.js 22 o posterior; se verificó con Node 24.

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Abre http://localhost:4173. No abras `index.html` directamente: las dependencias del navegador y recursos publicables se preparan en `site/`.

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

En Windows, la configuración de pruebas utiliza Chrome instalado; CI utiliza Chromium aislado.

## Uso

- Sin Google, Guardar conserva la carta en la biblioteca IndexedDB de este navegador. El borrador se guarda tras 500 ms sin cambios; Guardar también confirma el borrador antes de terminar.
- Con Google conectado, Guardar conserva cada carta en el Drive de esa cuenta. No hay usuarios simulados ni selector de nombres compartidos. No se envían cartas automáticamente al conectar.
- La galería permite abrir/borrar cartas, filtrar colecciones, importar varios JSON del escritorio, respaldar JSON en ZIP, exportar CSV y generar PNG.
- El lote respeta la resolución elegida. Produce ZIP separados cada cinco imágenes o 32 MB de PNG, con nombres únicos. Descarga las partes de los enlaces; la última contiene `informe.json`. Una carta dañada se informa y las demás continúan. Cancelar termina después de la carta actual.
- Fondo personalizado permite cargar PNG/JPG/WebP, duplicar el fondo base y volver al original. El fondo viaja en el JSON y se conserva hasta pulsar Original, incluso si cambias de tipo o etapa. Usa una imagen transparente en la zona donde debe verse el Pokémon.
- Hada utiliza los recursos `Hada`. Cookie reutiliza el tipo histórico `Estelar` y su icono `Stellar.png`; no se duplicó el tipo ni se rompen JSON existentes. Su marco base es Normal hasta cargar uno propio.
- Para quitar energía puedes pulsar el botón −, usar clic derecho o enfocar el coste y pulsar Suprimir.

## Publicar

Ver [configuración y publicación](docs/DEPLOYMENT.md). El código de Google está implementado, pero `config.js` está vacío intencionalmente: falta un cliente OAuth real y el origen autorizado. No se ha publicado este proyecto ni se ha probado acceso real a una cuenta Google.

El sitio se construye con una lista explícita de archivos: no publica instaladores, `node_modules`, `_savedata`, copias originales ni documentos del usuario. Los recursos optimizados están en `web-assets/`; las imágenes originales siguen en esta PC y están excluidas de Git. El clon original sigue en `C:/Users/CaptainHec/Downloads/_OLD/CaptainHec_Cardmaker`.

## Arquitectura y auditoría

Ver [auditoría completa](docs/AUDIT.md) y [decisión de arquitectura](docs/ARCHITECTURE.md). La web no depende de Electron ni de un servidor de Cardmaker. `electron-main.js` se conserva endurecido como referencia; no hay un nuevo instalador desktop ni flujo OAuth compatible con `file://`.

## Límites conocidos

- La carpeta `appDataFolder` de Drive es privada de la aplicación y no aparece como una carpeta normal en Mi unidad. Usa Galería → Respaldar JSON para exportar tus datos. Cuenta dentro del espacio disponible del usuario y depende de las cuotas de Google.
- Los tokens solo están en memoria. Tras expirar o recargar, hay que volver a conectar. Una sesión expirada no cambia silenciosamente el destino de guardado a local.
- Un JSON de importación puede tener hasta 24 MB; el documento enviado a Drive debe tener como máximo 5 MB. Las imágenes cargadas conservan sus bytes y dimensiones; un archivo grande puede requerir optimización manual para entrar en ese límite. No se degrada silenciosamente para que quepa. Puedes activar Comprimir nuevas imágenes y fondos (WebP 95) antes de cargar o duplicar: mantiene las dimensiones y acepta una pérdida de detalle para reducir peso. Está desactivado por defecto. No hay subida reanudable de archivos grandes en esta versión.
- Las actualizaciones remotas usan ETag/If-Match. Si el navegador/API no entrega ETag, se bloquea la actualización y se permite exportar o guardar como nueva. Falta verificar este flujo contra Drive real.
- Las partes ZIP quedan disponibles en la pestaña hasta otra exportación o cerrar la página. Para colecciones muy grandes conviene exportar por set: los enlaces de descarga también retienen datos del resultado.
- La vista previa usa fondos ligeros de 745×1040. Las descargas individuales y los lotes usan fondos de 2980×4160 en WebP sin pérdida y el resto de recursos PNG originales. Ultra ya no amplía fondos de 2080 px. Los fondos de 5000 px se remuestrean una sola vez al tamaño final; no se publica resolución sobrante.
- Se mantiene la mayor parte del motor tipográfico original. Se revisó y probó su funcionamiento; la fidelidad de cada carta histórica y las fuentes no tiene una certificación visual exhaustiva.

La aplicación incluye recursos de terceros recuperados del proyecto original; no se concede una licencia nueva sobre esas imágenes o fuentes.
