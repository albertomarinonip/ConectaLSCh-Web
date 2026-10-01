# Revisión de las grabaciones — v1.6.2 alfa

Se validaron 18 capturas nuevas: 9 HOLA y 9 GRACIAS. Por etiqueta hay 3 capturas con cada mano y 3 con ambas. Todas provienen de una persona y una sesión. No hay ejemplos de movimientos ajenos a señas.

Al reproducir las observaciones por el detector de movimiento, las 18 iniciaron y cerraron un evento. Esto no demuestra que todo intento en vivo cierre correctamente.

Comparación de cada secuencia completa con las restantes, excluyendo su propio ID: 4 de 9 HOLA tuvieron candidato HOLA, 5 fueron rechazadas. Las 9 GRACIAS fueron rechazadas. No se trata de una evaluación independiente: es una misma sesión usada para investigar. Tampoco mide falsos positivos. Los casos muestran consenso insuficiente, diferencias de trayectoria y, en algunos casos, de forma.

La foto del diagnóstico muestra una mano y 18 fotogramas válidos mientras el motor está READY. Es una instantánea; no permite concluir que el intento anterior no comenzó.

## Corrección incluida

Se conserva el último evento completo o abortado en el diagnóstico. Los rechazos ahora muestran una comparación cercana y sus criterios fallidos, claramente como información diagnóstica; no habilitan texto/voz como si fueran señas confirmadas. Los umbrales siguen iguales. No se incluye un modelo entrenado ni una mejora de precisión demostrada.

## Actualizar y probar

1. En el iPhone, descarga «Respaldar» para conservar tus ejemplos.
2. Actualiza los archivos del sitio GitHub Pages usando este paquete y conserva la misma dirección de la app. El ZIP por sí solo no actualiza el sitio.
3. Acepta el aviso de actualización cuando aparezca. Confirma v1.6.2 alfa en el encabezado.
4. Activa cámara, reconocimiento y modo de diagnóstico. Realiza una seña de forma natural. La fila «Último intento» conserva el resultado al dejar de mover las manos.
5. No necesitas repetir las 18 grabaciones para esta revisión.

En Windows extrae el paquete en C:\Users\alber\ConectaLSCh; contiene código, no tu entorno .venv. Esta sesión de chat no tiene control remoto de Windows.

## Validación

28 pruebas Node y 3 pruebas Python aprobadas. Integración con cámara sintética aprobada, incluida conservación del diagnóstico después de retirar las manos. No se realizó verificación visual en navegador real ni prueba con cámara física. PyTorch instalado en el PC no significa que el reconocimiento de la web ya esté usando un modelo neuronal.
