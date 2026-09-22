# Revisión de reconocimiento — v1.2

Se revisó el código de v1.1.1 del repositorio ConectaLSCh-Web (commit e2f553dc069e82730fe3f6878ccdee9492db072e) antes de modificarlo.

## Decisiones

Se conservan modelo, plantillas originales, normalización, remuestreo y DTW numéricos. Se comprobó igualdad en las características de una/dos manos y en todas las comparaciones entre plantillas disponibles: diferencia máxima 0. recognition-state.js y sample-store.js se mantienen idénticos.

MediaPipe sigue con dos manos, detección mínima 0,4 y seguimiento mínimo 0,4. La presencia mínima se declara explícitamente como 0,5, equivalente al valor predeterminado anterior. La frecuencia aproximada sigue siendo 10 Hz. Captura, reconocimiento y overlay comparten una sola inferencia por fotograma; se rechazan landmarks incompletos o no finitos.

Se mantienen distancia máxima 0,16; margen absoluto 0,035 y relativo 0,20; estabilidad de 650 ms y 6 observaciones; liberación tras 500 ms de ausencia o cambio sostenido de postura con distancia 0,24; intervalo máximo entre observaciones de 350 ms. No se redujeron filtros para aumentar artificialmente las detecciones.

## Auditoría de imágenes originales

Se ejecutó Hand Landmarker real sobre 40 muestras y sus 200 imágenes, en modo IMAGE. Con detección mínima 0,4:

| Seña | Muestras | Imágenes | Imágenes con manos | Muestras utilizables |
|---|---:|---:|---:|---:|
| HOLA | 10 | 40 | 17 | 6 |
| SÍ | 9 | 37 | 18 | 8 |
| NO | 5 | 15 | 13 | 5 |
| AYÚDAME | 6 | 18 | 16 | 5 |
| GRACIAS | 10 | 90 | 32 | 10 |

El umbral 0,4 produjo detecciones en 96 imágenes y 34 muestras utilizables. Con 0,5 fueron 94 imágenes/32 muestras; con 0,6, 92/32. Subir el umbral redujo cobertura y no demuestra una mejora de precisión.

Como diagnóstico, dejando fuera una muestra cada vez entre las 34 utilizables, DTW aceptó correctamente 14, aceptó una etiqueta incorrecta y rechazó 19. No es una evaluación independiente ni un porcentaje de precisión: las muestras son escasas, pueden estar relacionadas y faltan ejemplos negativos y personas independientes. Los filtros temporales del reconocimiento en vivo tampoco se evalúan mediante esta comparación aislada.

## Limitaciones y siguiente etapa

Las imágenes escasas no bastan para calibrar seguimiento VIDEO, intención, movimientos continuos o falsos positivos durante reposo. La normalización actual elimina la traslación absoluta de muñecas y la ordenación horizontal puede intercambiar manos cuando se cruzan. Cambiar esas características alteraría la compatibilidad de las plantillas personales existentes; no se hizo de forma silenciosa.

Para mejorar la precisión hacen falta secuencias continuas etiquetadas, reposo/gestos que no son señas y validación con distintas personas. Una nueva representación temporal deberá versionarse y mantener la vía antigua para ejemplos que no contengan landmarks originales. No se puede garantizar ausencia absoluta de falsos positivos con las plantillas actuales.

hand-overlay.js expone una observación versionada con tiempo, manos, lateralidad y campos separados para rostro, expresión y pose. Estos últimos permanecen nulos: no hay reconocimiento facial ni corporal simulado. Un proveedor futuro podrá poblarlos sin confundir datos de seguimiento con etiquetas LSCh, y necesitará entrenamiento y validación propios.
