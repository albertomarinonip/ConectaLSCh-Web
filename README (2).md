# Entrenar el primer modelo en PC

Las herramientas incluidas preparan un **clasificador de señas aisladas**, no un traductor de conversación continua. No hay pesos LSCh en este paquete. El entrenador PyTorch/ONNX está preparado pero no ejecutado en esta entrega: faltan las dependencias y, sobre todo, datos reales etiquetados.

Primero confirma sistema operativo, RAM y modelo de tarjeta gráfica. El modelo pequeño permite comenzar con CPU. La grabación puede hacerse en iPhone; exporta los JSON al PC. La elección de CUDA se hará después de comprobar GPU/controlador.

## Datos y separación

En «Mis señas» cada ejemplo nuevo necesita código de persona, sesión y variante. Cambia la sesión cada vez; no uses nombres reales. Marca los componentes obligatorios y usa «No es una seña» para negativos. Exporta «Datos para entrenar en PC».

Con Python instalado, prepara un entorno virtual e instala `training/requirements.txt` con su Python. En Windows se puede ejecutar directamente `\.venv\Scripts\python.exe`; en Linux/macOS, `.venv/bin/python`. Conserva las versiones exactas de dependencias del entorno después de validar la instalación.

```sh
python -m venv .venv
# Usa el Python del entorno virtual en los comandos siguientes.
python -m pip install -r training/requirements.txt
python training/dataset.py ConectaLSCh-dataset-v1.json --out dataset-review --group-by session
```

`summary.json` muestra las capturas/grupos y `splits.json` inicia todos como `UNASSIGNED`. Edita este último para asignar **grupos completos** a `train`, `validation` o `test`.

- `--group-by session`: agrupa por persona y sesión. Sirve para evaluar un modelo personal en otra sesión; no demuestra reconocimiento de personas nuevas.
- `--group-by person`: cada persona aparece en un único conjunto. Es la evaluación apropiada para generalización a personas nuevas.
- El entrenamiento requiere al menos dos etiquetas de señas más negativos, cuatro clips por seña en entrenamiento y dos por seña en cada conjunto de validación/prueba. Exige además 20 negativos en validación y 20 en prueba. Son mínimos técnicos; una evaluación profesional requerirá más variedad y tamaño.
- Se detectan IDs repetidos contradictorios y secuencias idénticas repartidas entre conjuntos. No se garantiza detectar duplicados editados o todas las formas de fuga; los metadatos deben ser correctos.

## Entrenamiento y exportación

```sh
python training/train.py --data ConectaLSCh-dataset-v1.json --splits dataset-review/splits.json --out model-pilot --device cpu
```

La CNN temporal tiene tres capas de convolución y clasifica 48 observaciones de 216 valores. El entrenador usa validación para detener el aprendizaje y elegir rechazo; evalúa la prueba una vez al final. Si la validación no ofrece un umbral útil dentro de los objetivos, no exporta un modelo que acepte palabras arbitrariamente.

Produce:

- `recognizer.onnx`: clasificador, incluida normalización calculada con entrenamiento.
- `manifest.json`: etiquetas, contrato, requisitos de canales y umbrales de rechazo.
- `evaluation.json`: métricas de validación/prueba y matriz de confusión.
- `weights.pt`: estado del modelo PyTorch para continuar investigación.

Verifica logits de PyTorch frente a ONNX Runtime con hasta diez clips de prueba, exigiendo error absoluto máximo ≤1e-4. Este control de conversión todavía no se ejecutó aquí. El modelo se marca siempre `experimental`: las métricas de clips no validan automáticamente uso con cámara continua ni todas las plataformas.

## Integración web posterior

`adapters/onnx-recognizer.js` es la interfaz preparada. No se ha conectado a la PWA ni se incluye ONNX Runtime Web en su caché actual. En una aplicación con dependencias empaquetadas:

```js
import * as ort from 'onnxruntime-web';
import {OnnxRecognizer} from './adapters/onnx-recognizer.js';

const manifest = await (await fetch('./models/manifest.json')).json();
const bytes = new Uint8Array(await (await fetch('./models/recognizer.onnx')).arrayBuffer());
const recognizer = await OnnxRecognizer.load(ort, bytes, manifest, {
  allowExperimental: true, // Solo piloto de desarrollo con evaluación pendiente.
  executionProviders: ['wasm']
});
const match = await recognizer.predict(event.frames.map(f => f.multimodal), {
  eventComplete: true,
  eventId: event.id
});
// Consumir match con SignGate y la misma transcripción/voz.
```

Antes de conectarlo: fijar la versión ORT/archivos WASM, preparar Worker y ciclo de vida, rechazar resultados de una cámara/sesión anterior, medir equivalencia web/nativo y rendimiento, y verificar falsos positivos de la cámara continua. El adaptador actual se invoca al final de eventos: para posturas fijas habrá que añadir ventanas estables y su control de repetición. Cambiar el extractor requiere nuevo ensayo de equivalencia.

Los entrenamientos grandes necesitarán más datos, mejor anotación y comparación de modelos. Añadir miles de nombres a un diccionario no enseña miles de señas.
