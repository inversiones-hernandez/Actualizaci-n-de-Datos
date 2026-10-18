# Portal de clientes · Inversiones Hernández RD

Paquete completo para reemplazar la portada y el registro del portal. Basado en los dos HTML, CSS, JavaScript y recursos adjuntados por la empresa. Conserva el lema «Impulsando tu crecimiento» y adapta ambas páginas a la identidad y estructura de inversioneshernandezrd.com.

## Archivos principales
- index.html: portada, acceso al registro, proceso y contacto. Sin acceso a solicitar préstamos.
- actualizar.html: registro y actualización en cinco pasos, con revisión final.
- style.css y script.js: estilos y comportamiento compartidos.
- Logos, iconos, foto explicativa, manifiesto, CNAME y robots.txt incluidos.

Los nombres de descarga como index(4).html o script(1).js se normalizaron a index.html y script.js dentro del paquete.

## Formulario
1. Datos personales: nombres, apellidos, WhatsApp, apodo, documento, nacionalidad, nacimiento, sexo, estado civil, teléfono principal, otro teléfono, correo y RNC.
2. Direcciones: dirección, provincia, municipio, sector, ruta de cobro/entrega, lugar y dirección de trabajo.
3. Datos básicos: ocupación, ingresos mensuales con centavos, situación laboral, vivienda y dependientes.
4. Firma, coordenadas y documentos: firma dibujada con dedo/mouse o imagen JPG/PNG, botón de borrado, latitud y longitud editables, mapa, botón de ubicación con permiso del navegador y tres fotos del formulario original.
5. Resumen completo y confirmación de la información.

No se rellenaron campos con los datos personales mostrados en las capturas. Las rutas, los municipios y los sectores admiten texto: no se inventó un catálogo de zonas de la empresa.

## Instalar
1. Haz una copia de seguridad del portal actual.
2. Sube el contenido de esta carpeta a la raíz del portal, conservando los nombres y rutas del paquete.
3. Revisa el enlace de registro y realiza una prueba de recepción con el responsable del sistema.

CNAME conserva portal.inversioneshernandezrd.com. No se publicó ni modificó el alojamiento desde esta entrega. Quitar los accesos al préstamo en la portada no bloquea la URL de un formulario de préstamos antiguo.

Para revisión local, ejecuta python3 -m http.server 8080 y abre http://localhost:8080. Geolocalización: HTTPS o localhost. Fuentes, librería Leaflet y teselas del mapa requieren conexión. Si el mapa no carga, se pueden escribir las coordenadas o usar el botón de ubicación.

## Integración pendiente de comprobar
Se conserva exactamente la URL pública de Apps Script del script.js adjuntado. No se realizó ningún envío de prueba al sistema de producción. Los campos nuevos viajan con los nombres rnc, rutaCobro, vivienda, dependientes, firmaBase64, firmaNombre y firmaTipo. La firma se convierte a PNG. El receptor debe admitir estos campos para almacenarlos en Google Sheets o Drive. El código de Apps Script no forma parte de los archivos adjuntos.

El mecanismo actual usa no-cors: no puede comprobar desde el navegador si el servidor guardó el registro. Por eso la pantalla indica que se realizó la petición de envío y pide confirmar recepción con la empresa. Para confirmar recepción de forma automática hace falta una respuesta verificable del servidor.

El borrador conserva datos de texto en este navegador, como la versión anterior. Las fotos, la firma y el consentimiento no se guardan en el borrador. Se elimina después de realizar el envío.

## Comprobaciones
JavaScript: node --check script.js
Pruebas locales: node tests/formulario.cjs

Comprobados los campos, su agrupación, referencias locales, identificadores, etiquetas, serialización y validación. No se realizó comprobación visual en navegador ni prueba real del receptor de Google Sheets.
