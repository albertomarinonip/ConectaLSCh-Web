# ConectaLSCh v1.1

Continúa la versión pública 1.0.3 de ConectaLSCh-Web.

## Novedades
- Diccionario con nombre y número de ejemplos por seña.
- Grabación de muestras personales: 3 segundos de preparación y 3 de captura.
- Guardado local separado de las muestras originales.
- Respaldo JSON e importación con validación y eliminación de duplicados exactos.
- Cancelación del ejemplo al apagar o girar la cámara.

## Instalar en GitHub Pages
1. Descomprime este paquete.
2. En tu repositorio ConectaLSCh-Web, sube el contenido de esta carpeta a la raíz, reemplazando los archivos existentes. No borres los videos ni otros archivos del repositorio.
3. Espera a que termine la publicación de GitHub Pages y recarga la página. Comprueba que el encabezado diga v1.1. Si tienes la app instalada, ciérrala y vuelve a abrirla.
4. Conserva una copia de la versión anterior. Esta entrega todavía no fue publicada por Codex.

## Agregar una seña
1. Activa la cámara y espera la preparación inicial.
2. En Mis señas, escribe el nombre. Usa el mismo nombre para repetir ejemplos de una seña existente.
3. Pulsa Grabar ejemplo. Tras la cuenta regresiva, realiza la seña completa con las manos visibles.
4. Repite al menos tres veces y luego pulsa Iniciar reconocimiento para probarla. Tres muestras no garantizan precisión.
5. Descarga el respaldo. Las muestras pertenecen al navegador y dispositivo donde se grabaron; no se suben a un servidor. Se guardan coordenadas de manos, no video.

## Alcance
Se mantiene el reconocimiento experimental por plantillas. No se incorporan señas nuevas preentrenadas, reconocimiento facial ni traducción de frases. La exactitud real requiere pruebas con personas usuarias de LSCh. Esta versión no escala todavía a miles de señas.
La cámara requiere HTTPS o localhost. La preparación inicial requiere conexión para MediaPipe y su modelo. El respaldo incluye únicamente tus nuevas muestras personales; las cinco señas iniciales siguen incluidas en la aplicación.

## Verificación realizada
Pruebas automatizadas en Edge, con cámara y modelo simulados: carga del diccionario, validación del nombre, cámara requerida, captura y persistencia al recargar, importación válida e inválida, deduplicación, conservación de muestras, cancelación al apagar cámara y descarga del respaldo. Sin errores JavaScript durante estas pruebas. Revisión visual a 390 px de ancho.
No se probó cámara física, precisión lingüística, voz real ni iPhone. Las funciones existentes de voz y subtítulos se conservaron sin cambios.
