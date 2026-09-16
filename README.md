# SeñaLink PWA v0.5

Primer laboratorio LSCh con 5 clases iniciales:
HOLA, GRACIAS, SÍ, NO y AYÚDAME.

Esta versión mantiene cámara, subtítulos y voz, y agrega la interfaz donde se conectará
el clasificador real. No simula ni inventa reconocimiento de señas.

Siguiente etapa técnica: extraer secuencias de landmarks de manos/pose/cara de las muestras,
entrenar y validar un clasificador temporal y conectarlo a `window.SeñaLinkLSCh.showPrediction`.
