# Revisión de ConectaLSCh v1.2.1

## Alcance final y archivos

Se continuó el trabajo interrumpido, sin rehacer la interfaz ni revertir las correcciones. Por la nueva instrucción, se retiró la reparación de muestras precargadas y el reconocimiento quedó exclusivamente basado en muestras personales.

Modificados respecto de v1.2: `app.js`, `index.html`, `style.css`, `recognition-state.js`, `sample-store.js`, `sw.js` y documentación. Nuevos módulos: `recognition-math.js`, `recognition-clock.js`, `temporal-sequence.js`, `visual-provider.js` y `visual-tracking.js`. Se añadieron pruebas de regresión, secuencias personales y aplicación integrada. `hand-overlay.js`, `content-store.js`, `notes-ui.js`, manifest e iconos mantienen sus funciones.

Retirados del paquete: dataset `training-data.js`, `training.json`, `training_frames.json` y 75 JPG precargados. El módulo provisional `original-cache.js` tampoco forma parte de esta entrega. No se ejecuta código para borrar claves antiguas del navegador ni datos personales.

## Errores encontrados y correcciones

1. **Caché inicial incompleta aceptada como modelo listo.** Esa ruta ya no existe: ninguna caché del dataset original se usa para reconocer. Solo se cargan los ejemplos personales. Tener cero ejemplos es un estado normal que invita a entrenar.
2. **Inferencia lenta confundida con pérdida de fotogramas.** La versión anterior podía reiniciar la estabilidad continuamente cuando una inferencia tardaba más de 350 ms. El reloj de observaciones distingue tiempo de procesamiento e interrupciones reales. Cada frame fresco aporta como máximo 100 ms al tiempo de estabilidad: la lentitud no regala confirmaciones. Se mantienen las seis observaciones, 650 ms activos y filtros de distancia/margen. Pausas reales limpian la candidatura sin liberar indebidamente la voz.
3. **Proporción de cámara no incorporada a la comparación.** MediaPipe normaliza x respecto del ancho e y respecto de la altura. Para muestras personales nuevas con proporción conocida, se transforma la consulta al formato de la muestra antes de aplicar la normalización compatible y DTW. No se inventa esa información para muestras antiguas. No hay rotación o espejo automático que pueda confundir señas diferentes. Referencia: [guía oficial de manos](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
4. **Rechazo sin explicación.** El diagnóstico opcional diferencia distancia excesiva, ambigüedad, secuencia incompleta, estabilidad pendiente, bloqueo de repetición y ausencia de manos.
5. **Grabaciones reducidas a nueve vectores sin conservar la captura.** Las nuevas guardan todos los frames válidos, tiempos y landmarks. La comparación remuestrea temporalmente; el original guardado no se reduce. Los respaldos incluyen todo lo necesario para recuperar esos ejemplos.
6. **Inicio tardío de escucha tras salir de la pestaña.** Se distingue la intención de escuchar del evento asíncrono de inicio y se cancela correctamente. Errores de permisos/conexión detienen el reinicio automático.
7. **Eliminación con posible recuperación desde el respaldo viejo.** Eliminar exige actualizar ambas copias o informar el fallo. Cancelar no modifica datos.
8. **Área fija de cámara con márgenes negros innecesarios.** Al activarse, usa la proporción real y comparte transformaciones con el canvas. El espacio de cámara apagada es más compacto.

El fallo concreto reportado con HOLA no puede atribuirse con certeza a una sola causa sin el diagnóstico de ese dispositivo. Se reprodujeron y corrigieron problemas de estabilidad y geometría; no se afirma haber medido una mejora de precisión en la cámara del usuario. Las muestras precargadas de HOLA dejaron de intervenir por decisión expresa del usuario.

## Mis señas, secuencias y almacenamiento

Las muestras personales llamadas HOLA, GRACIAS, SÍ, NO o AYÚDAME se conservan. No se filtran por nombre: la separación es por origen de almacenamiento.

Una seña admite varios ejemplos. Cada captura nueva guarda `sampleVersion: 2`, `featureVersion: hands-relative-v1`, `aspectRatio`, vectores completos, timestamps relativos y landmarks xyz por mano/fotograma. Rostro, expresión y pose no se incorporan a estas muestras ni a la clasificación. La validación admite de 8 a 40 frames por captura actual; la cadencia objetivo de diez capturas por segundo durante tres segundos queda dentro de ese límite.

Los registros históricos de nueve vectores se leen sin conversión destructiva. La migración es aditiva y por registro; no se cambia nombre ni versión de las bases de datos. Se conservan claves, notas, ajustes y fallback. Un fallo al escribir localStorage con IndexedDB disponible se informa sin descartar el ejemplo guardado en IndexedDB.

Exportación JSON con esquema v2; importación v1/v2 por unión y deduplicación. Se conservan metadatos temporales y de cámara. El usuario controla por separado la eliminación, con confirmación. Los subtítulos confirmados tienen un borrador independiente y las notas nunca se borran al limpiar el texto actual.

## Qué utiliza realmente el reconocimiento

| Canal | Seguimiento | Uso para reconocer LSCh |
|---|---|---|
| Manos | Hasta dos manos, 21 landmarks xyz por mano | Sí: geometría relativa a muñeca, escala, orientación y evolución temporal de las articulaciones; comparación DTW y filtros de estabilidad |
| Rostro | Opcional: 24 puntos de ojos/cejas y línea básica de orientación; matriz de cabeza cuando existe | No |
| Expresión | Coeficientes estimados de ojos/cejas, cuando el modelo los devuelve | No |
| Boca/labios | No se dibujan ni se requieren; siempre desconocidos en este módulo | No |
| Cuerpo | Opcional: hombros, codos y muñecas con visibilidad suficiente | No |
| Interpretación lingüística | Arquitectura preparada para separar observación y significado | No hay traducción multimodal de LSCh |

La comparación de manos emplea 126 componentes por frame; una mano ausente ocupa el bloque vacío compatible. Las manos se ordenan horizontalmente, por lo que un cruce puede intercambiar bloques. Los ejemplos antiguos usan nueve puntos temporales y ventana compatible; los nuevos se comparan en 18 puntos y esperan una duración observada suficiente para sus ejemplos activos. Los frames completos permanecen guardados.

**Límite importante:** la posición absoluta de la muñeca se guarda en los landmarks nuevos, pero el clasificador actual usa vectores relativos. No distingue de forma fiable señas cuya única diferencia sea el desplazamiento global de una misma postura. Mejorar ese punto requiere una representación de movimiento calibrada, no bajar filtros indiscriminadamente. Tampoco usa relación con rostro/cuerpo ni expresiones para decidir una palabra.

## Seguimiento visual y rendimiento

Un único bucle procesa frames nuevos de la cámara. El modelo de manos se reutiliza. El overlay no crea otro detector y desaparece al ponerlo OFF. Apagar cámara, cambiar de pestaña o esconder la aplicación detiene tracks y procesamiento.

Rostro/cuerpo se cargan solo al activarlos expresamente. Alternan turnos cada 250 ms (aproximadamente dos observaciones por segundo por canal), reducen frecuencia tras procesamiento costoso y se pausan si la inferencia de manos consume demasiado. Se pausan durante la grabación. Los datos visuales vencen tras 600 ms y se limpian al detener/cambiar cámara o perder el canal. Una descarga o detector opcional fallido no desactiva las manos.

Los puntos faciales son estimaciones del modelo: no se garantiza la visibilidad individual de cada rasgo. Por eso no se usan labios ni coeficientes de boca, incluso si el modelo infiere posiciones detrás de una máscara. Los puntos de cuerpo requieren visibilidad mínima 0,6. No se identifican personas. Referencias: [Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) y [Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js).

## Pruebas efectuadas

- Lógica: silencio sin manos, incertidumbre por distancia/margen, alternancia, estabilidad, seña mantenida durante un minuto, retirada/repetición, pausa y pérdida breve de seguimiento.
- Regresión reproducible: inferencias de 500 ms que antes impedían confirmar; el nuevo reloj confirma una sola vez y no cuenta CPU como estabilidad. Conversión de proporción verificada con la misma geometría proyectada a formatos distintos; ejemplos sin metadatos mantienen su cálculo anterior.
- Aplicación en Edge con cámara/detector/voz simulados: biblioteca vacía ignorando las cinco señas del caché viejo; grabar HOLA dos veces; grabar una segunda seña; reconocer y distinguir ambas; postura desconocida y ausencia de manos en silencio; bloqueo y rearme de voz.
- Overlay: una/dos manos, 42 puntos cuando corresponden, tamaño intrínseco del video, OFF limpia el dibujo, giro de cámara y cambio a formato vertical alineados.
- Canales visuales simulados: aparición/ausencia, cadencia reducida, datos vencidos, coeficientes de cejas, boca excluida, OFF sin procesamiento adicional ni eventos de voz.
- Modelos reales de rostro/pose sobre una fotografía de prueba: 24 puntos superiores de rostro, 19 coeficientes de ojos/cejas, matriz de cabeza y tres puntos corporales con visibilidad suficiente. Una oclusión rectangular sobre la boca conservó esos resultados; una imagen vacía eliminó todos los puntos. Esto no equivale a validar mascarillas reales, sonrisa o movimientos de cabeza/cejas en vivo.
- Almacenamiento real: captura completa, respaldo v2 idéntico al contenido guardado, reimportación sin duplicados, importación v1 por unión, recarga y cierre/reapertura del navegador, borrar/cancelar borrar sin resurrección de ejemplos.
- Escucha simulada → subtítulos → copiar → nota con fecha/hora; recarga conserva borrador; limpiar no elimina nota; cierre/reapertura conserva notas.
- Service worker real: v1.2 → v1.2.1 conserva ejemplos personales (incluido HOLA) y claves antiguas, pero no activa las señas precargadas. Actualización posterior conserva borrador y notas. Interfaz y datos cargan sin conexión.
- Diseño: 320×568, 390×844, 844×390, 768×1024 y 1440×900 sin desbordamiento horizontal y navegación inferior fija.

Las pruebas integradas se basan en entradas simuladas donde se indica. No se ha probado esta entrega con cámara física, Safari ni una PWA instalada en iPhone real. Rendimiento, permisos de voz, oclusiones reales y precisión LSCh necesitan validación en ese dispositivo. No se promete 100 % de precisión; ante distancia insuficiente o ambigüedad, el sistema permanece en silencio.
