> Revisión actual: consulta REVISION-v1.6.3.md. La base instalada encontrada fue v1.6.1; esta entrega corrige fallos concretos y no acredita precisión general.

# ConectaLSCh v1.6.3 alfa — primera base temporal multimodal

Esta versión cambia el reconocimiento, la captura y el formato de datos de v1.5.3. **Sigue siendo un prototipo por ejemplos personales; no incluye un modelo neuronal entrenado en LSCh ni una precisión medida con personas.**

## Ajustes de v1.6.3

- Cámara amplia, texto y subtítulos más grandes, controles de 48 px y navegación más legible.
- Inicio del movimiento confirmado durante al menos 50 ms para evitar que dos fotogramas rápidos activen una seña.
- Historial previo al movimiento de hasta 350 ms, independiente de la velocidad de la cámara.
- Estos ajustes no constituyen una precisión medida en LSCh. Falta probar grabaciones reales y revisar la interfaz en iPhone/Android.

## Qué cambia

- Seguimiento de cada mano mediante identidad izquierda/derecha del detector y continuidad temporal, sin ordenar las manos por su posición horizontal para el motor nuevo.
- Actividad por mano y por articulaciones. Los movimientos opuestos de dos manos ya no se cancelan; el movimiento de dedos puede iniciar una captura aunque la muñeca esté quieta.
- Se guardan secuencias con tiempos reales, posición de las manos respecto al cuerpo/rostro, expresiones estimadas y máscaras de canales ausentes.
- Consenso separado por variante y mano. Graba al menos **dos ejemplos nuevos** de cada variante/mano que quieras reconocer.
- Captura de postura fija, seña con movimiento y movimientos que **no son señas**, para rechazo y entrenamiento.
- Una pérdida de seguimiento o un tiempo máximo sin final estable no se consideran una seña completa.
- Exportación para entrenamiento en PC, herramientas de preparación/evaluación y un clasificador temporal pequeño en PyTorch con exportación ONNX.
- Adaptador ONNX para integrar el modelo una vez entrenado y validado; todavía no está conectado al botón de reconocimiento de la PWA.

La función de voz/subtítulos conserva su implementación. El indicador de identidad mide cobertura del seguimiento, **no precisión del reconocimiento**.

## Primera prueba con Alberto

1. Descarga el respaldo de «Mis señas» en tu versión anterior.
2. Usa esta versión en el mismo origen HTTPS para conservar el almacenamiento del navegador, o importa el respaldo al cambiar de origen/dispositivo. Para probar en un PC con Python instalado: `python -m http.server 8000 --bind 127.0.0.1` y abre `http://localhost:8000`. Abrir `index.html` como archivo no sirve para estos módulos/cámara. Para iPhone/Android en otro dispositivo se necesita HTTPS.
3. Graba dos ejemplos nuevos de HOLA con tu mano habitual y dos de GRACIAS. Selecciona «Con movimiento» y termina cada seña con una breve pausa. Si hay variantes distintas, usa nombres de variante distintos.
4. Si quieres reconocer la otra mano y esa variante es válida en LSCh, graba también dos ejemplos con ella. No hay un espejo automático universal.
5. Prueba cada seña, con y sin la otra mano visible. Graba en «No es una seña» ejemplos como tocarte el pelo o ajustar la ropa. Esos ejemplos nunca se pronuncian como palabras.
6. Marca «necesita rostro/cuerpo» cuando esos canales sean necesarios para distinguir la seña. Una muestra así se rechaza si falta el canal durante reconocimiento.
7. Cambia el código de sesión al comenzar una nueva sesión. Exporta «Datos para entrenar en PC» cuando tengamos suficientes ejemplos.

Las muestras v1–v3 se conservan en sus claves originales y se pueden respaldar/importar. No se inventan rostro, identidad o cuerpo para esas muestras. Cuando hay muestras v4 de una etiqueta, el motor nuevo toma prioridad para esa etiqueta; necesita dos capturas por variante/mano. Las otras etiquetas antiguas conservan su comparación compatible. Los respaldos v3 nuevos no son importables por la antigua app v1.5.3: conserva también tu respaldo anterior.

No hay sincronización en nube en esta entrega. El JSON contiene datos personales de movimiento y expresiones, aunque no guarde imágenes ni nombre real. Compártelo de forma deliberada.

## Documentación y entrenamiento

- [ARCHITECTURA.md](ARCHITECTURA.md): auditoría del código, decisiones técnicas, límites y ruta hacia miles de señas.
- [training/README.md](training/README.md): flujo de datos, división de sesiones/personas, entrenamiento y exportación.
- [VALIDACION.md](VALIDACION.md): qué se ejecutó y qué sigue pendiente.

## Pruebas

Con Node.js:

```sh
npm test
npm run test:app
```

Con Python y NumPy:

```sh
python -m unittest discover -s training -p 'test_*.py'
```

Prueba en navegador, pendiente en esta entrega:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

`tests/browser.e2e.cjs` es un archivo histórico anterior a la interfaz recibida, no la prueba vigente. La prueba vigente es `tests/browser-v160.cjs`. Las pruebas usan coordenadas sintéticas y no certifican LSCh.
