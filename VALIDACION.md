# Validación de la entrega v1.6.0 alfa

## Ejecutado

- Pruebas JavaScript del motor antiguo compatible y del nuevo: identidad al cruzar manos y reordenar resultados del detector, movimiento opuesto, movimiento de dedos con muñeca fija, pérdidas de manos y eventos sin final, formatos y máscaras, ambas manos por variante, ejemplos duplicados, inversión temporal, posición respecto a cuerpo, orden de expresiones, rostro requerido y negativos.
- Control de repetición de voz por evento y rechazo del adaptador ONNX ante desconocido/ambigüedad/canales ausentes. ONNX Runtime se simula en estas pruebas; no se ejecuta un modelo real.
- Prueba de integración que ejecuta `app.js` y sus módulos reales en Node VM, con UI mínima, cámara/coordenadas sintéticas, reloj virtual y almacenamiento local simulado: siete capturas guardadas (dos dinámicas por mano, dos estáticas y un negativo sin manos), exportación de dataset/respaldo, reconocimiento de cada mano, silencio ante desconocido, conservación de transcripción y evento de voz a texto.
- Pruebas Python de selección temporal, rechazo/calibración y detección de secuencias idénticas repartidas entre conjuntos.
- Lectura por el preparador Python de un dataset generado a través de los handlers reales de la app.
- Comprobación de sintaxis JavaScript/Python y de integridad del ZIP final.

## Pendiente

- Prueba Playwright de `tests/browser-v160.cjs`: no pudo ejecutarse; el entorno no tenía Chromium y la descarga del navegador no produjo un archivo válido. No se verificó layout en navegador real.
- Carga real de modelos MediaPipe/GPU/CPU, permisos y cámara en iPhone/Android/PC. Los detectores se simularon; no hay resultados reales de FPS/latencia.
- Entrenamiento PyTorch, exportación y equivalencia ONNX real. En el entorno de entrega no estaban instalados PyTorch/ONNX/ONNX Runtime y no hay un dataset LSCh etiquetado dentro del archivo adjunto.
- Precisión de HOLA/GRACIAS y generalización con personas/sesiones nuevas. Las pruebas no contienen interpretaciones lingüísticas de LSCh; sus etiquetas son nombres para secuencias geométricas sintéticas.
- Reconocimiento continuo sin pausas, traducción de frases y avatar LSCh.

Esta alfa corrige errores verificables de la mecánica y prepara una evaluación real. No debe presentarse como una mejora porcentual demostrada de precisión, un detector de miles de señas ya entrenado ni un producto nativo publicado.

## v1.6.1 alfa

26 pruebas Node aprobadas y prueba de integración de captura/reconocimiento aprobada con cámara sintética. Nuevas pruebas: rechazo de dos fotogramas rápidos y cierre del movimiento a 10, 20 y 60 FPS. No se midió precisión con personas ni se verificó visualmente la interfaz en un navegador real. Debe probarse en iPhone/Android; el cambio de inicio exige movimiento sostenido 50 ms y puede omitir gestos extremadamente breves.
