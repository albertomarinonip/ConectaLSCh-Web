# ConectaLSCh v1.2.7

Prototipo PWA de accesibilidad centrado en Lengua de Señas Chilena (LSCh). Funciona con cuatro pestañas: **Señas**, **Escuchar**, **Mis señas** y **Notas**.

## Qué hace esta versión

- **Señas:** reconoce únicamente ejemplos personales grabados en **Mis señas**. Una seña confirmada se agrega a la transcripción y permanece visible; bajar las manos no borra el texto. Cada nueva seña aparece en una línea nueva.
- **Escuchar:** convierte voz a subtítulos en español (cuando el navegador ofrece reconocimiento de voz) y permite guardar el texto como nota.
- **Mis señas:** permite crear varias muestras por seña, exportar/importar respaldo y administrar ejemplos personales. No incluye un diccionario LSCh precargado.
- **Notas:** conserva notas guardadas independientemente de los subtítulos.

## Reconocimiento de movimiento v1.2.7

Esta versión mejora especialmente las señas dinámicas. Para una muestra que contiene movimiento, el reconocedor separa el tramo activo de la preparación y de la postura final, compara la evolución temporal de la forma de las manos y la trayectoria de las muñecas, y tolera diferencias naturales de velocidad entre la grabación y la ejecución en vivo. Una postura quieta no debe bastar para confirmar una muestra dinámica.

El reconocimiento sigue siendo **experimental**: usa landmarks de manos y comparación temporal; no es todavía un traductor completo de LSCh. Rostro/cuerpo pueden mostrarse como seguimiento experimental, pero no participan en la clasificación de esta versión.

## Cómo entrenar una seña

1. En **Mis señas**, escribe el nombre y pulsa **Grabar ejemplo**.
2. Espera la cuenta regresiva 3–2–1.
3. Haz la seña completa y natural durante la captura.
4. Guarda el ejemplo o repítelo si salió mal.
5. Graba varias repeticiones naturales de la misma seña; no intentes hacerlas idénticas.
6. Exporta periódicamente **ConectaLSCh-mis-senas.json** como respaldo.

Los datos personales se guardan en IndexedDB `conectalsch-personal` con respaldo local. Actualizar los archivos de la PWA no debería borrar Mis señas ni Notas.

## Actualizar GitHub Pages / iPhone

Descomprime el ZIP y reemplaza los archivos de la raíz del repositorio. El service worker usa una caché nueva para v1.2.7. Abre la web con conexión y acepta la actualización; si el iPhone conserva una versión anterior, cierra la PWA y sus pestañas y vuelve a abrirla.

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

## Cambios v1.2.7
- Reduce falsos positivos: un movimiento cualquiera ya no basta para emitir una palabra.
- En señas dinámicas se exige recorrido suficiente y semejanza de trayectoria con los ejemplos de “Mis señas”.
- Después de confirmar una seña hay una breve protección contra el movimiento residual, para evitar que aparezca otra palabra sin haberla realizado.
- Los estados internos de detección no se agregan a la transcripción; solo las señas confirmadas quedan como líneas.
