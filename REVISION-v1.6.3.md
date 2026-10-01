# ConectaLSCh v1.6.3 alfa — revisión del reconocimiento

Fecha: 1 de octubre de 2026. Base encontrada: C:\Users\alber\ConectaLSCh, package 1.6.1-alpha.1 y pantalla v1.6.1 alfa. No se encontró la entrega v1.6.2; no se afirma que sus cambios estén incluidos. Se reservó v1.6.3 para evitar confundir esta copia con esa entrega.

## Resultado concreto

Antes de modificar el motor se reprodujeron exactamente los resultados indicados: 18 eventos iniciados/cerrados; 4 HOLA aceptados, 5 HOLA rechazados, 0 GRACIAS aceptados, 9 GRACIAS rechazados. Cada consulta excluyó su propio ejemplo. Evidencia: audit/baseline-v161.json.

Después: 4 HOLA y 1 GRACIAS aceptados; 5 HOLA y 8 GRACIAS rechazados. Ninguna aceptación llevó la etiqueta equivocada en este replay. Los mismos resultados se obtuvieron usando los fotogramas devueltos por el segmentador, pasando por SignGate y comprobando speak. Son resultados de depuración dentro de una sesión, NO precisión general ni una estimación de falsos positivos. Evidencia detallada por muestra y comparación: audit/replay-v163.json. La GRACIAS aceptada es el índice 14 (numeración desde cero).

## Correcciones verificadas

1. El motor definía la variante por manos presentes en al menos el 50% de la secuencia, pero luego incluía en las distancias las detecciones breves de otras manos. Ahora los descriptores de forma, trayectoria y posición usan las manos de esa misma firma. El cálculo de recorrido y la validación de postura fija aplican también ese criterio. Los originales, vectores y máscaras guardados no se reescriben. Se mantiene la comprobación de calidad/identidad previa; no se ignora una segunda mano persistente. Riesgo: la regla de firma del 50%, ya existente, necesita validación futura para señas con una segunda mano que entra tarde.
2. SignGate podía consumir otra vez el último eventId después de retirar las manos, al pasar por la ruta secundaria de confirmación. Ahora rechaza ese resultado repetido. Un nuevo evento puede confirmar de nuevo la misma palabra. Esto no explica los rechazos de forma/trayectoria, pero era un fallo demostrable en confirmación.
3. Los rechazos multimodales no conservaban el candidato más próximo ni distinguían el canal que fallaba. Ahora muestran forma, trayectoria, contexto, distancia o falta de un segundo voto. El mensaje se conserva dos segundos o hasta comenzar otro movimiento. Solo cambia el diagnóstico, nunca la aceptación ni la voz.

No se cambiaron los límites de distancia, forma, movimiento, duración, calidad, margen ni la exigencia de dos ejemplos distintos por firma/variante. No se agregaron negativos a las grabaciones del usuario.

## Recorrido revisado y pendientes

- Detección/identidad: la captura y el reconocimiento consumen el mismo bucle MediaPipe y HandIdentityTracker. Los slots siguen identidad temporal; pruebas de cruce y reordenación pasan. El JSON tiene landmarks/identidades ya procesados, no video ni resultados crudos con handedness: no permite demostrar si MediaPipe asignó correctamente la mano anatómica en cámara real. La convención frontal y el cambio de cámara requieren prueba por dispositivo.
- Segmentación: se reprodujo un evento completo en las 18 grabaciones. Se mantienen pruebas de quietud, dedos con muñeca fija, movimientos opuestos, pérdida de manos, timeout y tasas de fotogramas. No se ajustó este detector para el dataset. Esta reproducción empieza en el primer fotograma grabado: no reproduce un flujo de cámara con reposo anterior, oclusiones nuevas o latencia variable.
- Comparación temporal: consulta y plantilla se remuestrean por tiempo, con DTW que conserva orden. Las variantes de una y dos manos siguen separadas y necesitan dos votos. Persisten discrepancias de forma y trayectoria, especialmente con ambas manos. No hay evidencia para ampliar los límites. El origen de trayectoria depende del primer fotograma válido y la escala de esa mano; las pausas/entradas distintas merecen estudiar con video y sesiones independientes. Los canales usan alineaciones DTW independientes: no se afirma haber validado una alineación conjunta óptima.
- Confirmación: los cinco candidatos del replay segmentado llegan a voz; los trece rechazados permanecen en silencio. El hecho de que la pantalla muestre «Esperando seña…» sin transcripción no implica cámara detenida; el estado pequeño indica el rechazo.
- Compatibilidad: validSamples acepta los 18 ejemplos y Python load_samples también; observaciones, timestamps y vectores de 216 componentes son coherentes. Se conserva sampleVersion 4 y hands-body-face-v2; no se requiere volver a grabar ni convertir el dataset. También se mantienen las rutas de muestras antiguas.

## Pruebas ejecutadas

- node --test tests/*.test.mjs: 28 pruebas, todas pasan. Incluye regresiones nuevas de mano transitoria y evento duplicado tras retirada, y pruebas existentes de movimiento inverso/postura fija/ambigüedad.
- node --experimental-vm-modules tests/app-integration.mjs: captura y exportación, voz de señas, texto de voz y conservación de subtítulos pasan con DOM y detecciones simulados.
- Python 3.12.10 del entorno original: 3 pruebas de training/test_pipeline.py pasan. Imports comprobados: PyTorch CPU, NumPy, ONNX, ONNXScript y ONNX Runtime.
- Replay real de los landmarks exportados, sin auto-comparación; comparación directa, segmentación y confirmación final. No hay negativos reales en este dataset; las pruebas sintéticas existentes son regresiones funcionales y no datos de evaluación.
- test:browser no ejecutado: falta el módulo playwright. No se instaló ninguna dependencia. No se probó webcam real, micrófono real, GPU ni Safari/iPhone durante esta revisión.

Repetición en la entrega:

```powershell
node tests/dataset-replay.mjs audit/dataset-original.json audit/replay-nuevo.json
node --test tests/*.test.mjs
node --experimental-vm-modules tests/app-integration.mjs
& 'C:\Users\alber\ConectaLSCh\.venv\Scripts\python.exe' -m unittest discover -s training -p 'test_pipeline.py'
```

La copia original empaquetada incluye el mismo harness para reproducir el baseline (ignora las opciones de diagnóstico nuevas).

## Entrenamiento

18 grabaciones, dos palabras, una persona y una sola sesión. No hay partición independiente de entrenamiento/validación/test por sesión ni ejemplos reales de no-seña. El pipeline rechaza la partición de esta única sesión con «All three splits need complete groups». No se entrenó ni exportó un nuevo modelo ONNX y no se inventó una clase desconocida. Más ejemplos de esta misma sesión tampoco demostrarían generalización a otra sesión/persona. Se avanzó con depuración y conservación de datos, sin pedir nuevas grabaciones ahora.

## Uso de la copia y prueba pendiente en iPhone

Extraer el ZIP en una carpeta aparte. Desde esa carpeta, puede servirse para PC con el Python ya instalado:

```powershell
& 'C:\Users\alber\ConectaLSCh\.venv\Scripts\python.exe' -m http.server 8000 --bind 127.0.0.1
```

Abrir http://127.0.0.1:8000. Las grabaciones guardadas por el navegador dependen del origen (protocolo/host/puerto). Si cambia el origen, usar el importador existente con audit/dataset-original.json; no borrar los datos anteriores. Servir la copia en el mismo origen conserva IndexedDB/localStorage; para evitar mezclar dos servidores, cerrar el anterior primero. El service worker tiene una caché v163 y conserva el mecanismo existente de actualización. Comprobar que la pantalla muestra v1.6.3.

Para iPhone se necesita el sitio en un origen HTTPS con certificado válido y sus permisos de cámara/micrófono; la dirección HTTP de la LAN no equivale al localhost del teléfono. Esta entrega no se publicó ni se instaló sobre la carpeta original. Pendientes: cámara frontal y trasera, espejo/identidad de manos, cambio de orientación, FPS y pausas del navegador, carga de modelos/WASM, actualización de la PWA, importación/persistencia de las 18 muestras, diagnóstico de rechazo, una sola emisión por evento y voz/subtítulos. No se promete que las trece muestras rechazadas funcionen en vivo.

## Preservación

La carpeta original y su .venv no se modificaron. audit/dataset-original.json es una copia byte a byte del adjunto, SHA-256 16FE834234548CBE679000A35BA50B6995A45D051F52A2B5AC628A302F925394. Ambos ZIP excluyen .venv; usan el entorno existente. El JSON y el código de entrenamiento se conservan; no se borran ejemplos ni transcripciones.
