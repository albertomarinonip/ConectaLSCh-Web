# ConectaLSCh v1.2

Actualización de v1.1.1: cuatro pestañas inferiores, seguimiento visual de ambas manos y notas persistentes. Interfaz oscura responsive con safe-area para iPhone.

## Funciones

- Señas: cámara compacta, girar cámara, voz ON/OFF, resultado y confianza experimental. «🖐️ Seguimiento de manos» activa o desactiva los 21 puntos y conexiones de cada mano. El dibujo comparte tamaño, proporción y espejo con el video; se limpia cuando no hay detecciones.
- Escuchar: activar/detener escucha, subtítulos acumulativos, copiar, limpiar y guardar texto completo como nota con fecha y hora. Limpiar el texto actual no elimina notas.
- Mis señas: capturar ejemplos, consultar cantidades, administrar nombres visibles y activar/desactivar ejemplos personales. Respaldo e importación compatibles con la versión anterior. Los nombres visibles y estados se guardan por separado de las muestras originales.
- Notas: abrir, copiar y eliminar notas con confirmación.
- Texto → voz sigue disponible dentro de Señas. Las cinco señas originales se conservan: HOLA, GRACIAS, SÍ, NO y AYÚDAME.

El seguimiento utiliza la misma detección que el reconocimiento y la captura; no ejecuta otro modelo. Al cambiar de pestaña se detiene la cámara o escucha correspondiente, conservando los subtítulos acumulados.

## Reconocimiento y límites

Se mantienen «Esperando seña…», «No estoy seguro», confirmación estable y un solo evento de voz por seña. Retirar las manos o cambiar suficientemente su configuración permite una nueva confirmación. Una pérdida breve de seguimiento no debe rearmar la voz.

Después de revisar los datos reales se conservaron las características numéricas, DTW y umbrales de v1.1.1. No hay evidencia suficiente para prometer más precisión mediante un ajuste automático. Consulta REVISION-RECONOCIMIENTO.md para resultados y limitaciones. La confianza mostrada es experimental, no un porcentaje calibrado.

## Datos y persistencia

Se mantiene sin cambios sample-store.js: IndexedDB `conectalsch-personal`, almacén `samples`, clave `conectalsch-personal-v1`, y respaldo compatible en localStorage. Se conservan también las claves de plantillas anteriores. Ninguna actualización borra IndexedDB ni localStorage.

Las notas y preferencias de nombres/activación usan otra base, `conectalsch-content`, versión 1, con almacenes `notes` y `settings`. Las notas incluyen versión de esquema, identificador, texto, título, fechas, idioma, segmentos y un campo de adjuntos para ampliaciones futuras. El guardado se confirma al terminar la transacción.

Los datos personales existentes solamente en tu navegador no forman parte del ZIP. Mantén el mismo dominio, navegador y perfil; exporta Mis señas antes de cambiar de dispositivo o borrar datos del sitio. La persistencia se verificó tras recarga y cierre completo del navegador; borrar datos o las políticas de almacenamiento del navegador pueden eliminarlos.

## Actualizar GitHub Pages

1. Descarga un respaldo de Mis señas desde tu versión actual.
2. Descomprime este paquete y sube su contenido a la raíz del mismo repositorio. Incluye los módulos nuevos, iconos, manifest y service worker. Conserva los videos y otros archivos existentes del repositorio: el paquete no incluye esos videos.
3. Espera el despliegue de GitHub Pages. Abre el sitio con conexión, cierra todas sus pestañas y la PWA, y vuelve a abrirlo. Esto permite pasar del service worker de v1.1.1 al de v1.2. Comprueba «ConectaLSCh v1.2».
4. No borres los datos del sitio para actualizar. Comprueba tus ejemplos guardados y notas.

Desde v1.2, una actualización posterior muestra un aviso cuando existe un service worker nuevo esperando. Activarla conserva el texto confirmado pendiente durante la recarga; espera a terminar una grabación o guardado. El service worker instala el paquete completo antes de activarlo y no elimina bases de datos ni cachés anteriores. En futuras publicaciones debe cambiarse el identificador CACHE de sw.js.

El paquete no ha sido publicado automáticamente. Cámara y micrófono requieren HTTPS o localhost. El reconocimiento de voz depende del soporte y permisos del navegador. La interfaz, notas y ejemplos funcionan sin conexión tras instalar la caché; cargar MediaPipe, su modelo o el servicio de reconocimiento de voz puede requerir conexión.

## Verificación realizada

- Pruebas de lógica: silencio sin manos, ambigüedad, estabilidad, seña mantenida, retirada y nueva confirmación, cambios de postura y pérdidas breves de detección.
- Aplicación en Edge con entradas de cámara/modelo/voz simuladas: HOLA una vez, mantener sin repetir, retirar/repetir, voz OFF, seguimiento de dos manos, giro de cámara, captura, respaldo/importación y texto → voz.
- Almacenamiento real: migración desde v1.1.1, recarga, cierre/reapertura del navegador, recuperación desde IndexedDB, notas y ajustes personales persistentes, eliminar/cancelar eliminación.
- Voz simulada → subtítulos → guardar nota → limpiar texto sin borrar la nota.
- Service worker real: actualización desde v1.1.1, actualización posterior con borrador, notas y muestras conservadas; recarga de interfaz sin conexión.
- Diseño comprobado a 320×568, 390×844, 844×390, 768×1024 y 1440×900, sin desbordamiento horizontal y con navegación inferior fija.
- MediaPipe real sobre 200 imágenes originales y comparación numérica de DTW: ver informe adjunto.

No se probó una cámara física ni Safari en un iPhone real. Las pruebas simuladas verifican el comportamiento del sistema, no la precisión real de LSCh. Antes de usarlo en conversaciones, comprobar en el dispositivo: silencio sin señas, HOLA una vez, mantener sin repetir, retirar y repetir, recarga de Mis señas, y escucha → guardar nota → recarga.

Pruebas reproducibles con Node:

```sh
node tests/recognition-state.test.mjs
node tests/tracking.test.mjs
```

Los documentos LEEME-v1.1.md y LEEME-v1.1.1.md se conservan como historial; este README corresponde a la entrega actual.
