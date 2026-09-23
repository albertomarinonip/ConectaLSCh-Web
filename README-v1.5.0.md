# ConectaLSCh v1.5.0 — seguimiento avanzado

Esta versión refuerza exclusivamente Señas y Mis señas. Escuchar se conserva funcionalmente.

## Captura avanzada
- manos como canal principal, hasta ~20 observaciones/s cuando el dispositivo lo permite;
- ambas manos con 21 landmarks, trayectoria temporal y segmentación inicio/movimiento/fin;
- Face Landmarker y Pose Landmarker Full como contexto secundario;
- Mis señas muestra continuidad de manos, actividad, pose/rostro, frames y calidad 0–100;
- una captura dinámica no se guarda si la mano queda quieta o el seguimiento es discontinuo;
- las muestras nuevas son schema sampleVersion 3 y guardan descriptores geométricos de apoyo, no fotos ni video.

El tamaño del ZIP no determina la precisión. Los modelos MediaPipe se cargan desde sus fuentes en tiempo de ejecución; inflar el archivo a 100 MB con datos de relleno no mejoraría el reconocimiento.
