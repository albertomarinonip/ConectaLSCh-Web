# SeñaLink PWA v0.6 — reconocimiento LSCh experimental

Incluye 25 videos de entrenamiento etiquetados por Alberto:
HOLA (5), GRACIAS (5), SÍ (4), NO (5), AYÚDAME (6).

La app usa MediaPipe Hand Landmarker en el navegador para extraer secuencias de 21 puntos por mano.
Al pulsar “Entrenar con mis 25 videos”, genera plantillas temporales y las guarda en el iPhone.
El reconocimiento en vivo compara la secuencia de la cámara con esas plantillas usando DTW.

IMPORTANTE: es un prototipo personalizado y experimental, no un traductor general de LSCh.
Requiere internet la primera vez para cargar MediaPipe y su modelo.
