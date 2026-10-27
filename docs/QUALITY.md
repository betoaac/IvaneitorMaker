# Corrección de calidad de exportación

27 de octubre de 2026. Reemplaza la limitación de calidad de la primera preparación web.

## Qué fallaba

Los fondos originales tenían 3571×5000 píxeles. La primera optimización los reducía a 1486×2080 y WebP con pérdida. Ultra seguía creando un PNG de 2980×4160, pero ampliaba una imagen con menos detalle. Además, los archivos de usuario se reducían a 1600/2080 píxeles y se recomprimían.

## Corrección

- Vista previa: fondos a 745×1040 con WebP ligero. Estos archivos no se usan para descargar cartas.
- Exportación individual y por lotes, en todas las resoluciones: fondos remuestreados directamente desde el original a 2980×4160 y codificados como WebP **sin pérdida** (`lossless=True, exact=True`). Es suficiente para Ultra, sin publicar resolución sobrante de 5000 píxeles.
- Iconos, sprites, etiquetas y marcas de exportación: copias exactas de sus PNG originales, sin la conversión con pérdida de la vista previa.
- Archivos cargados por el usuario: se validan y se conservan sus bytes y dimensiones. No se reducen ni recomprimen automáticamente. La opción desactivada por defecto «Comprimir nuevas imágenes y fondos» permite WebP calidad 95 con pérdida, conservando las dimensiones; solo afecta cargas o duplicados posteriores. Sin comprimir, la entrada admite hasta 10 MB; con compresión opcional, hasta 20 MB. Duplicar un fondo utiliza la variante de exportación y PNG sin pérdida.
- Salida: PNG de Canvas, que comprime sin pérdida. No existe un parámetro de «calidad JPEG» que altere este PNG. JPEG y WebP con pérdida son distintos de PNG/WebP sin pérdida.

El remuestreo de 5000 a 4160 píxeles elimina resolución que el archivo final no puede contener; no se afirma conservar todos los píxeles del original sobredimensionado. Se evita la ampliación anterior y la pérdida adicional por codificación.

## Evidencia

El generador decodificó las **47 variantes de fondos/máscara** y comparó todos los bytes RGBA con la referencia remuestreada al tamaño final: coincidencia exacta, incluida transparencia. La prueba Node verifica tamaño 2980×4160 y codificación VP8L sin pérdida en cada variante. La prueba de navegador comprueba rutas distintas de vista previa/exportación y que una imagen cargada de 2200×1800 no se reduce ni recodifica.

Ejemplo Planta Básico: original de 5000 píxeles, **6,58 MiB**; versión Ultra de 4160 píxeles en WebP sin pérdida, **3,88 MiB**; vista previa ligera, **0,045 MiB**. En una comparación separada, el PNG optimizado a la misma resolución Ultra ocupó **5,38 MiB**. Menor peso no implica necesariamente pérdida de calidad: en este caso cambia el formato de compresión y la resolución innecesaria del original.

El sitio completo ahora ocupa **244,1 MiB**, porque incluye los recursos de exportación además de las vistas previas. El archivo mayor mide **4,9 MiB**. Las variantes grandes se cargan bajo demanda al exportar; la caché limita las imágenes decodificadas a 96 MiB. Esto no significa que la pestaña nunca supere 96 MiB: los canvas y la imagen en uso también consumen memoria.

## Compatibilidad y límites

Se mantienen las rutas históricas de las cartas mediante dos manifests (`CARD_ASSETS` y `CARD_EXPORT_ASSETS`). No se modifican las imágenes originales locales. Los JSON que ya se guardaron con arte reducido no recuperan detalle por actualizar la app: para ellos hay que volver a cargar el archivo de imagen original.

Drive mantiene el límite explícito de 5 MB por documento. Conservar imágenes grandes puede superar ese límite; en ese caso la app avisa y no afirma haber guardado. No reduce su calidad silenciosamente para hacerlas caber. Los JSON exportados y la biblioteca local permiten conservar los datos dentro de sus respectivos límites.
