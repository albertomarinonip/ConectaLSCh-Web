# ConectaLSCh v1.3.0

Prototipo PWA de accesibilidad centrado en Lengua de Señas Chilena (LSCh). Funciona con cuatro pestañas: **Señas**, **Escuchar** y **Mis señas**.

## Qué hace esta versión

- **Señas:** reconoce únicamente ejemplos personales grabados en **Mis señas**. Una seña confirmada se agrega a la transcripción y permanece visible; bajar las manos no borra el texto. Cada nueva seña aparece en una línea nueva.
- **Escuchar:** convierte voz a subtítulos en español (cuando el navegador ofrece reconocimiento de voz) y permite guardar el texto como nota.
- **Mis señas:** permite crear varias muestras por seña, exportar/importar respaldo y administrar ejemplos personales. No incluye un diccionario LSCh precargado.

## Reconocimiento de movimiento v1.3.0

Esta versión mejora especialmente las señas dinámicas. Para una muestra que contiene movimiento, el reconocedor separa el tramo activo de la preparación y de la postura final, compara la evolución temporal de la forma de las manos y la trayectoria de las muñecas, y tolera diferencias naturales de velocidad entre la grabación y la ejecución en vivo. Una postura quieta no debe bastar para confirmar una muestra dinámica.

El reconocimiento sigue siendo **experimental**: usa landmarks de manos y comparación temporal; no es todavía un traductor completo de LSCh. Rostro/cuerpo pueden mostrarse como seguimiento experimental, pero no participan en la clasificación de esta versión.

## Cómo entrenar una seña

1. En **Mis señas**, escribe el nombre y pulsa **Grabar ejemplo**.
2. Espera la cuenta regresiva 3–2–1.
3. Haz la seña completa y natural durante la captura.
4. Guarda el ejemplo o repítelo si salió mal.
5. Graba varias repeticiones naturales de la misma seña; no intentes hacerlas idénticas.
6. Exporta periódicamente **ConectaLSCh-mis-senas.json** como respaldo.

Los datos personales se guardan en IndexedDB `conectalsch-personal` con respaldo local. Actualizar los archivos de la PWA no debería borrar Mis señas.

## Actualizar GitHub Pages / iPhone

Descomprime el ZIP y reemplaza los archivos de la raíz del repositorio. El service worker usa una caché nueva para v1.3.0. Abre la web con conexión y acepta la actualización; si el iPhone conserva una versión anterior, cierra la PWA y sus pestañas y vuelve a abrirla.

## Límites

La precisión depende de la calidad y variedad de los ejemplos, encuadre, iluminación y detección de manos. No se promete 100% de precisión. Si el sistema no tiene evidencia suficiente, debe evitar inventar una seña. Para usos médicos, legales o de emergencia no sustituye a un intérprete profesional de LSCh.

## Pruebas

Ejecuta con Node:

```sh
node tests/recognition-state.test.mjs
node tests/tracking.test.mjs
node tests/regressions-v121.test.mjs
node tests/personal-temporal.test.mjs
```

## Cambios v1.3.0
- Reduce falsos positivos: un movimiento cualquiera ya no basta para emitir una palabra.
- En señas dinámicas se exige recorrido suficiente y semejanza de trayectoria con los ejemplos de “Mis señas”.
- Después de confirmar una seña hay una breve protección contra el movimiento residual, para evitar que aparezca otra palabra sin haberla realizado.
- Los estados internos de detección no se agregan a la transcripción; solo las señas confirmadas quedan como líneas.


## v1.3.0 — fin de movimiento
El reconocimiento en vivo segmenta cada seña dinámica como un evento: espera movimiento real, conserva un pequeño pre-roll, detecta el fin con histéresis y clasifica inmediatamente al terminar. Las señas dinámicas ya no se confirman por mantener una postura final quieta. Las señas estáticas conservan el flujo de estabilidad.


## v1.3.0 — rechazo de falsos positivos
El reconocimiento ahora usa una compuerta de “seña conocida”: no basta con elegir la plantilla más cercana. Cuando existen varios ejemplos de una seña, al menos dos deben respaldar la coincidencia. Las señas con movimiento exigen recorrido, trayectoria y proporción de movimiento compatibles antes de agregar una palabra. Los movimientos cotidianos deben quedar sin salida en la transcripción.

## v1.3.1 — equilibrio entre reconocimiento y rechazo
El reconocimiento ya no elige una seña solo por ser la plantilla más cercana. Una seña debe obtener consenso entre varios ejemplos personales independientes. En señas dinámicas, cada voto debe coincidir por separado en forma de mano, trayectoria y cantidad de movimiento. Si no existe consenso suficiente, el resultado interno es desconocido y no se agrega ninguna palabra a la transcripción. Esto está diseñado para reducir falsos positivos con gestos cotidianos como tocarse la cabeza o acomodarse el pelo. El reconocimiento continúa siendo un prototipo experimental basado solo en manos y no equivale a un traductor completo de LSCh.


### v1.3.1
Se elimina la pestaña Notas por decisión de producto. El reconocimiento abierto mantiene el rechazo de movimientos desconocidos, pero calibra el consenso dinámico para aceptar variaciones naturales: dos ejemplos personales fuertes pueden confirmar una seña, manteniendo comprobaciones independientes de forma, trayectoria, cantidad de movimiento y margen frente a otras señas.
