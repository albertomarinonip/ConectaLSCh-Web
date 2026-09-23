# ConectaLSCh v1.4.1

Prototipo PWA de accesibilidad en LSCh.

## Cambio principal
`Mis señas` incorpora un **Control de captura** para enseñar señas dinámicas con el mismo detector de manos y el mismo segmentador de movimiento que usa `Señas`.

Durante la captura muestra manos detectadas, movimiento/actividad, rostro disponible como apoyo y cantidad de frames. Para una seña dinámica, una mano quieta no se acepta: debe detectarse inicio, trayectoria y final del movimiento antes de habilitar el guardado.

El rostro/cuerpo son contexto opcional. Las manos y su movimiento son el canal principal y nunca se inventan datos visuales ausentes.

## Escuchar
La función `Escuchar` se mantiene sin cambios funcionales en esta versión.

## Datos
Los ejemplos siguen almacenándose localmente con el esquema compatible existente. Conviene respaldarlos desde `Mis señas` antes de cambios importantes.

## Limitaciones
Este sigue siendo un prototipo personal basado en ejemplos, no un traductor completo de LSCh. La calidad depende de cámara, encuadre, iluminación, variedad de ejemplos y rendimiento del dispositivo.
