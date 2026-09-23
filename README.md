# ConectaLSCh v1.2.1

Reconocimiento basado **únicamente en Mis señas**, con cuatro pestañas: Señas, Escuchar, Mis señas y Notas. Esta entrega continúa las correcciones de v1.2.1 y aplica la decisión de retirar las cinco señas precargadas.

## Empezar

1. Abre Mis señas, escribe el nombre y pulsa Grabar ejemplo.
2. Hay tres segundos para prepararte y tres para hacer la seña completa. Mantén las manos dentro del encuadre y graba varios ejemplos con variaciones naturales.
3. Cada captura conserva su secuencia completa de fotogramas válidos, tiempos, landmarks de manos y proporción del video. La lista muestra la cantidad por seña.
4. En Señas, activa la cámara y el reconocimiento. Completa la seña y espera su confirmación. Retira las manos antes de repetirla.

Sin ejemplos aparece «Aún no tienes señas entrenadas. Agrega una desde Mis señas». Sin manos, «No se detectan manos». Si la comparación es insuficiente o ambigua, «No estoy seguro» y silencio. La seña confirmada no se vuelve a pronunciar por un temporizador.

HOLA, GRACIAS, SÍ, NO y AYÚDAME ya no se precargan. Si tú habías guardado ejemplos personales con esos nombres, siguen disponibles. Las claves antiguas del dataset no se leen ni se borran; no intervienen en la clasificación. El paquete ya no contiene sus imágenes ni archivos de entrenamiento.

## Seguimiento y reconocimiento

«🤟 Seguimiento de señas» muestra u oculta el overlay. El reconocimiento de manos sigue funcionando con el overlay OFF. Video y canvas comparten proporción, tamaño y espejo; no se deforma la imagen. En videos verticales puede ser necesario desplazar la pantalla para conservar el encuadre completo.

En Estado del reconocimiento puedes activar:

- **Modo de diagnóstico**: candidato, DTW, segundo candidato, diferencia, frames, duración, manos, estabilidad y motivo del rechazo.
- **Rostro y cuerpo · experimental**: seguimiento visual opcional de ojos, cejas, orientación básica de cabeza, hombros y brazos. Se carga solo al solicitarlo y prioriza el presupuesto de procesamiento de manos. No distingue señas ni genera voz.

No se dibuja la malla facial completa. La boca permanece desconocida y no se usa, porque el detector no certifica su visibilidad cuando está tapada. El modelo facial produce estimaciones, no identidad ni traducción LSCh. Ausencia de rostro/cuerpo o fallas de sus modelos no impiden reconocer manos.

## Datos, respaldo y compatibilidad

Se mantienen IndexedDB `conectalsch-personal`, almacén `samples`, clave `conectalsch-personal-v1` y su respaldo localStorage. Notas y ajustes conservan `conectalsch-content` y sus almacenes `notes`/`settings`. No hay eliminación de bases de datos durante una actualización.

Los ejemplos anteriores de nueve vectores siguen válidos y no se convierten ni se sobrescriben. Las nuevas capturas usan `sampleVersion: 2`, con secuencia completa, tiempos, landmarks, `featureVersion` y proporción de cámara. Ambos formatos conviven en el mismo almacén. La comparación con una muestra antigua sin proporción conserva su vía compatible.

Exportar produce JSON `format: conectalsch-personal`, `version: 2`, `schemaVersion: 2`, con todos los ejemplos y ajustes. Importar acepta respaldos v1 y v2, agrega ejemplos y evita duplicados; conserva los ajustes existentes ante conflictos. No reemplaza ni elimina automáticamente datos. La eliminación de ejemplos es una acción separada, con confirmación, que actualiza ambas copias para evitar que reaparezcan al recargar. Límite: 500 ejemplos y respaldos de hasta 200 MB; archivos grandes pueden ser lentos en teléfonos.

Los subtítulos confirmados también conservan un borrador local entre recargas. Guardar nota crea una nota independiente con texto, fecha y hora. Limpiar subtítulos no elimina notas. Si no hay espacio para el borrador o respaldo local, la interfaz indica el problema; conserva un JSON descargado de tus señas.

## Actualizar GitHub Pages / iPhone

1. Exporta un respaldo personal desde la versión instalada.
2. Descomprime el ZIP y sube su contenido a la misma raíz de tu repositorio, incluyendo todos los módulos JavaScript, iconos, manifest y `sw.js`. No cambies el dominio ni borres datos del sitio.
3. Abre la PWA con conexión. Cuando aparezca el aviso, pulsa Actualizar; conserva los subtítulos confirmados durante la recarga. No actives la actualización mientras grabas o guardas.
4. Si no aparece el aviso, cierra todas las pestañas y la PWA, vuelve a abrirla con conexión y comprueba **v1.2.1**. Comprueba tus señas y notas.

El paquete no necesita los antiguos `training-data.js`, `training.json`, `training_frames.json` ni los JPG de entrenamiento. Si todavía existen en el repositorio, la aplicación no los solicita ni los utiliza. Su retirada del repositorio no requiere borrar almacenamiento del navegador.

El service worker instala el paquete completo antes de activarlo y usa una caché nueva, separada de los datos personales. No limpia IndexedDB, localStorage ni cachés anteriores. La interfaz, notas y ejemplos están disponibles sin conexión tras instalar la caché; la primera carga de los modelos y el servicio de voz pueden requerir internet. Cámara y micrófono requieren HTTPS o localhost y permisos del navegador.

Esta entrega no se ha publicado automáticamente. El almacenamiento del navegador no sustituye un respaldo: borrarlo, cambiar de perfil o dispositivo puede perder datos locales.

## Pruebas

Con Node:

```sh
node tests/recognition-state.test.mjs
node tests/tracking.test.mjs
node tests/regressions-v121.test.mjs
node tests/personal-temporal.test.mjs
```

Para la prueba integrada, instala Playwright y su navegador en un entorno de desarrollo, y ejecuta `node tests/browser.e2e.cjs`. Opcionalmente `BROWSER_CHANNEL=msedge` usa Edge instalado. Este ensayo usa cámara, voz y resultados del detector simulados; el almacenamiento y la aplicación son reales. No mide precisión LSCh.

Consulta **REVISION-v1.2.1.md** para archivos modificados, errores corregidos, pruebas y límites. No se ha validado esta versión con tu cámara física ni Safari/PWA instalado en un iPhone real. La precisión no está calibrada y no se promete reconocimiento perfecto.
