# ConectaLSCh v1.4.0 — reconocimiento multimodal personal

PWA experimental de accesibilidad para LSCh. Mantiene tres áreas: **Señas**, **Escuchar** y **Mis señas**.

## Cambio principal
Las muestras nuevas de **Mis señas** ya no guardan solamente la forma relativa de las manos. Guardan una secuencia temporal local de: manos (21 puntos por mano), trayectoria/movimiento, rasgos geométricos seleccionados de rostro superior (ojos/cejas/cabeza) y pose superior (hombros, codos, muñecas) cuando MediaPipe puede observarlos. No se guardan fotos ni video en la muestra.

Los canales visuales faltantes se marcan como no disponibles; no se inventan. Las manos y el movimiento siguen siendo el canal principal. El contexto visual solo participa cuando existe tanto en entrenamiento como en vivo. Esto sigue siendo un prototipo y no un traductor completo de LSCh.

## Mis señas
Para aprovechar el formato multimodal v3, graba nuevamente cada seña importante con **5–10 ejemplos naturales**. Los ejemplos antiguos de v1.3.x se conservan y siguen siendo compatibles, pero son solo de manos. La app no los borra automáticamente.

Flujo: PREPARADO → 3 → 2 → 1 → GRABANDO → CAPTURA TERMINADA → Guardar/Repetir. La cuenta regresiva no forma parte de la muestra.

## Privacidad
Las muestras se almacenan localmente en IndexedDB/localStorage y se pueden exportar a JSON. Las nuevas muestras contienen coordenadas/descritores, no imágenes de cámara.

## Limitaciones
La calidad depende de cámara, luz, encuadre y rendimiento del dispositivo. Rostro/cuerpo se procesan a menor frecuencia para priorizar las manos en iPhone. Para usos médicos, legales o de emergencia no debe sustituir a un intérprete profesional de LSCh.
