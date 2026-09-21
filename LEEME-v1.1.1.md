# ConectaLSCh v1.1.1 — Estabilidad

Continúa v1.1 sin reemplazar MediaPipe, las características de manos, el cálculo DTW ni las muestras originales.

## Cambios

- Sin manos: descarta inmediatamente la secuencia anterior y muestra «Esperando seña…».
- Confirmación: exige detecciones consecutivas de la misma seña durante al menos 650 ms y un mínimo de 6 observaciones, con muestreo aproximadamente cada 100 ms. Reunir la secuencia inicial añade tiempo a la confirmación.
- Incertidumbre: «No estoy seguro», sin voz, si la distancia es demasiado alta o las dos mejores señas distintas están demasiado próximas. Varias muestras de una misma seña no compiten como señas distintas.
- Voz: un evento por confirmación. No existe un temporizador que vuelva a pronunciar una seña mantenida.
- Repetición: necesita al menos 500 ms observados sin manos o un cambio sostenido de su configuración. Después debe completar otra confirmación. Una caída breve de detección, fluctuación de puntuación o pausa no liberan por sí solas el bloqueo.
- Las protecciones se aplican tanto a las cinco señas originales como a Mis señas.
- Mis señas: mantiene la clave de v1.1, migra los ejemplos a IndexedDB y conserva una copia compatible en localStorage. Solo confirma el guardado después de completar la escritura. Recupera una copia desde la otra cuando es posible.
- Restaura Mis señas independientemente de la descarga del modelo remoto.
- Conserva cámara, escucha, subtítulos acumulativos, texto a voz y voz de señas.

## Actualizar en GitHub Pages

1. En la versión actual, descarga un respaldo de Mis señas.
2. Descomprime el ZIP y sube su contenido a la raíz del mismo repositorio ConectaLSCh-Web. Incluye los nuevos recognition-state.js y sample-store.js. No borres los archivos multimedia existentes.
3. Espera a que termine GitHub Pages. Abre la página con conexión, después cierra todas sus pestañas y la app instalada y vuelve a abrirla para activar el paquete nuevo en caché. Comprueba el encabezado v1.1.1.
4. Mantén el mismo navegador, perfil y dirección HTTPS. No borres los datos del sitio para actualizar. Si cambias de dispositivo o navegador, importa tu respaldo.

Esta entrega no se publicó automáticamente. Las muestras personales se conservan al recargar y cerrar/reabrir. El navegador todavía puede eliminar datos si tú los borras, si usas modo privado o por sus políticas de almacenamiento; conserva el respaldo descargado. El ZIP no incluye las muestras personales que existen únicamente en tu navegador.

## Prueba con tu cámara

1. Inicia reconocimiento sin manos durante 15 segundos: debe esperar en silencio.
2. Haz una seña conocida completa y mantenla: debe confirmarse una vez y no repetir voz.
3. Retira las manos aproximadamente un segundo y vuelve a hacerla: debe pronunciarla otra vez tras confirmarla.
4. Cambia de seña y prueba también una de Mis señas. Si hay duda debe mostrar «No estoy seguro» sin hablar.
5. Guarda un ejemplo personal, recarga y cierra/reabre: debe continuar en el diccionario.
6. Comprueba escucha ON/OFF, frases acumuladas, texto a voz y voz de señas ON/OFF.

## Verificación y límites

Se probaron secuencias simuladas de ausencia de manos, candidatos alternantes, empate entre señas, confirmación estable, una seña mantenida un minuto, pérdida breve de detección, retirada y repetición, cambio de manos, pausa y caídas de fotogramas.

En Edge con cámara/modelo/voz simulados se probaron el bucle real de la aplicación, captura, importación, voz ON/OFF, controles existentes, migración desde v1.1, cierre y reapertura completa del navegador, recuperación desde IndexedDB y fallo de escritura en localStorage. También pasó la prueba real de actualización del service worker y recuperación de la interfaz y muestras sin conexión.

Los archivos de entrenamiento originales se conservan idénticos a v1.1. No se añadieron muestras ficticias al producto; los datos de prueba están aislados.

No se ha validado la precisión con cámara física, tu repertorio de señas ni iPhone. El filtro reduce falsos positivos, pero un clasificador de plantillas no puede determinar con certeza la intención de una postura muy parecida a una seña. Los umbrales conservadores pueden necesitar ajuste con ejemplos reales. No se cambió ni reentrenó el modelo.

Los umbrales están en recognition-state.js. La distancia es una medida experimental, no una probabilidad calibrada. La interfaz y muestras pueden recuperarse sin conexión; inicializar la visión puede seguir requiriendo conexión para MediaPipe y su modelo.

## Prueba de lógica reproducible

Con Node instalado: `node tests/recognition-state.test.mjs`.
