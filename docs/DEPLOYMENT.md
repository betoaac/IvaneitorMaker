# Publicación y Google Drive

Preparado el 27 de octubre de 2026. Ningún recurso se ha publicado ni ninguna cuenta se ha conectado durante esta preparación.

## Opción recomendada: GitHub Pages + Drive

Para este editor personal, GitHub Pages permite servir los archivos y Drive guarda las cartas de cada usuario. GitHub Free ofrece Pages para repositorios públicos; no debe confundirse el código público de la aplicación con las cartas privadas que se guardan en Drive. El sitio tiene que respetar los límites y usos permitidos de Pages. [Documentación oficial](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

1. Crea o elige el repositorio. Comprueba `.gitignore`: las imágenes originales, instaladores, respaldos y datos locales están excluidos. `web-assets/` sí debe subirse.
2. Sube el código mediante Git. No arrastres toda `F:/CARDMAKER` a GitHub; contiene originales y archivos locales que no pertenecen al sitio.
3. En Settings → Pages elige **GitHub Actions**.
4. Configura Google como se indica abajo.
5. En Settings → Secrets and variables → Actions → Variables crea `GOOGLE_CLIENT_ID` con el ID público OAuth. No uses un client secret.
6. En Actions ejecuta **Verify and publish** manualmente. Push y PR verifican; solo la ejecución manual publica. El workflow comprueba sintaxis, pruebas, dependencias, build y navegador antes de desplegar.

Todas las rutas son relativas para funcionar bajo `https://usuario.github.io/repositorio/`. La carpeta publicada es **site/**, no la raíz del proyecto.

Referencia: [workflows oficiales de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

El modo de descarga sin Google puede publicarse con `config.js` vacío y sin la variable `GOOGLE_CLIENT_ID`. Guardar entrega un ZIP con PNG Ultra y JSON editable; configurar Google no es un requisito para ese modo.

## Instalación de Kotcia

- URL de producción: `https://cardmaker.kotcia.com/` (GitHub Pages, HTTPS obligatorio).
- Cloudflare DNS: CNAME `cardmaker` → `betoaac.github.io`, DNS only, TTL Auto.
- Cliente OAuth web existente en el proyecto `ivancardmaker`; origen autorizado `https://cardmaker.kotcia.com`.
- Inicio y privacidad de OAuth: `https://cardmaker.kotcia.com/` y `/privacy.html`.
- El ID público se inyecta mediante la variable de Actions `GOOGLE_CLIENT_ID`. El build genera un nombre con hash para evitar configuración antigua en caché.

## Configuración Google

1. En Google Cloud crea/elige un proyecto y habilita **Google Drive API**.
2. Configura Google Auth Platform / pantalla de consentimiento: nombre, contacto, audiencia, página de inicio y política de privacidad. Este proyecto incluye `privacy.html`; verifica que sus datos describan tu instalación.
3. Solicita únicamente `https://www.googleapis.com/auth/drive.appdata`. Es un permiso no sensible para los datos de esta aplicación; no necesita acceso general a los documentos del usuario. [Permisos oficiales](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
4. Crea un **OAuth client ID → Web application**.
5. Añade los orígenes JavaScript autorizados. Para desarrollo: `http://localhost:4173`. Para Pages: `https://TU_USUARIO.github.io`, sin `/repositorio/`. Para dominio propio o Cloudflare: su origen HTTPS exacto. Este flujo usa popup y no necesita un callback de servidor.
6. Mientras la app esté en modo Testing, añade las cuentas permitidas como usuarios de prueba. Antes de abrirla a otras personas, configura la audiencia/publicación y requisitos vigentes que muestre Google.
7. Pon el ID público en la variable de repositorio `GOOGLE_CLIENT_ID`, o en `config.js` para pruebas locales. No pongas un client secret en JavaScript, GitHub ni el navegador.
8. Reconstruye/publica y prueba **Conectar con Google**.

El modelo implementado es el [token model de Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/use-token-model). La cuenta se elige en Google y el token temporal permite operar en su Drive; no hay contraseñas ni un servidor de login de Cardmaker. No se almacenan tokens en localStorage, IndexedDB, archivos ni registros. El cliente OAuth público no es una contraseña.

Los JSON se almacenan en la [carpeta privada appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata). Está oculta en Mi unidad y solo esta app puede acceder a ella. Para obtener una carpeta visible/compartible habría que cambiar al permiso `drive.file` y diseñar ese flujo; no está implementado.

## Revisiones y comprobación real de Drive

La descarga `v3/files/{id}?alt=media` no proporciona una revisión utilizable en el navegador. Para evitar bloquear todas las actualizaciones, se obtiene el campo JSON `etag` mediante [Drive v2 files](https://developers.google.com/workspace/drive/api/reference/rest/v2/files) antes y después de leer el contenido; si difiere, la lectura se rechaza. Las actualizaciones usan [v2 files.update](https://developers.google.com/workspace/drive/api/reference/rest/v2/files/update) con `PUT` e `If-Match`; un HTTP 412 conserva los cambios en el editor. La creación, listado y descarga siguen usando v3. Se mantiene el mismo permiso `drive.appdata`, sin ampliar acceso.

Con un cliente OAuth real y el sitio en su origen autorizado:

1. Conectar una cuenta de prueba y confirmar que el correo de destino coincide.
2. Guardar una carta con arte, fondo propio, evo e iconos; recargar y volver a conectar; abrirla y descargar PNG.
3. Modificarla y confirmar actualización sin duplicados. Comprobar ETag/If-Match y el mensaje de conflicto desde otra sesión.
4. Importar varios JSON y respaldarlos; borrar una carta de prueba y verificar desaparición tras recargar.
5. Cancelar consentimiento, bloquear popup, revocar permisos, agotar espacio y expirar token: no debe aparecer un falso guardado exitoso.
6. Cambiar de cuenta y comprobar que ninguna carta se filtra entre bibliotecas. Conectar/desconectar está bloqueado durante guardados e importaciones.

Las pruebas automatizadas usan respuestas simuladas para Google. **No sustituyen esta comprobación**. Si hay timeout después de crear un archivo remoto, recarga la galería antes de repetir Guardar para comprobar si Google recibió el archivo; no hay reintento automático de escrituras ambiguas.

## Alternativa gratuita: Cloudflare Pages

Si prefieres mantener privado el repositorio o cambiar de hosting, el mismo build puede publicarse en Cloudflare Pages: comando `npm ci --ignore-scripts && npm run build`, directorio de salida `site`, Node 24 y variable pública `GOOGLE_CLIENT_ID`. Autoriza en Google el origen de producción estable; no añadas indiscriminadamente dominios de preview. El plan Free tiene límites de archivos, tamaño por archivo y builds. [Límites oficiales](https://developers.cloudflare.com/pages/platform/limits/).

No se ha creado un backend, una base de datos compartida ni almacenamiento de servidor. El contrato de repositorio permite incorporarlos más adelante, pero Google Drive es el proveedor remoto implementado.
