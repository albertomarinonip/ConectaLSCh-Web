"""Small temporal CNN baseline for isolated LSCh signs. No pretrained LSCh weights included."""
from __future__ import annotations
import argparse
import copy
import json
from pathlib import Path
import time
import numpy as np
from dataset import load_samples, partition, FEATURE_SIZE, FEATURE_VERSION, TIME_STEPS, UNKNOWN
from metrics import softmax, report, calibrate, predictions

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', nargs='+', required=True)
    parser.add_argument('--splits', required=True)
    parser.add_argument('--out', default='model-pilot')
    parser.add_argument('--epochs', type=int, default=100)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    args = parser.parse_args()
    # Import after validating the dataset; pip chooses the torch build for the actual PC.
    rows, labels = partition(load_samples(args.data), json.loads(Path(args.splits).read_text(encoding='utf-8')))
    import torch
    from torch import nn
    import onnxruntime as ort
    torch.manual_seed(42); np.random.seed(42); torch.set_num_threads(4)
    if args.device == 'cuda' and not torch.cuda.is_available():
        raise ValueError('CUDA is unavailable: use --device cpu')
    device = torch.device(args.device)
    xs = {k: np.stack([e[1] for e in v]) for k, v in rows.items()}
    ys = {k: np.asarray([labels.index(e[2]) for e in v], dtype=np.int64) for k, v in rows.items()}
    mean = xs['train'].mean(axis=(0, 1)); std = np.maximum(xs['train'].std(axis=(0, 1)), .05)

    class TemporalCNN(nn.Module):
        def __init__(self):
            super().__init__()
            self.register_buffer('mean', torch.from_numpy(mean))
            self.register_buffer('std', torch.from_numpy(std))
            self.encoder = nn.Sequential(nn.Conv1d(FEATURE_SIZE, 64, 3, padding=1), nn.ReLU(),
                nn.Conv1d(64, 64, 3, padding=2, dilation=2), nn.ReLU(),
                nn.Conv1d(64, 64, 3, padding=4, dilation=4), nn.ReLU(), nn.AdaptiveAvgPool1d(1))
            self.classifier = nn.Linear(64, len(labels))
        def forward(self, features):
            # Normalization belongs to the model so PC/web/mobile cannot drift.
            x = ((features - self.mean) / self.std).transpose(1, 2)
            return self.classifier(self.encoder(x).squeeze(-1))

    model = TemporalCNN().to(device)
    weights = len(ys['train']) / np.maximum(1, np.bincount(ys['train'], minlength=len(labels)))
    loss_fn = nn.CrossEntropyLoss(weight=torch.tensor(weights, dtype=torch.float32, device=device))
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.01)
    xtrain = torch.from_numpy(xs['train']).to(device); ytrain = torch.from_numpy(ys['train']).to(device)
    def infer(name):
        model.eval()
        with torch.no_grad():
            return model(torch.from_numpy(xs[name]).to(device)).cpu().numpy()
    best_score = -1; best_state = None; stale = 0
    for epoch in range(args.epochs):
        model.train()
        for ids in torch.randperm(len(xtrain), device=device).split(32):
            optimizer.zero_grad(); loss = loss_fn(model(xtrain[ids]), ytrain[ids]); loss.backward(); optimizer.step()
        logits = infer('validation')
        score = report(ys['validation'], logits.argmax(axis=1), labels, labels.index(UNKNOWN))['macroF1']
        if score > best_score:
            best_score = score; best_state = copy.deepcopy(model.state_dict()); stale = 0
        else:
            stale += 1
        if (epoch + 1) % 10 == 0:
            print(f'Epoch {epoch+1}: validation macro-F1 {score:.3f}')
        if stale >= 15:
            break
    if best_state is None:
        raise ValueError('No training epochs completed')
    model.load_state_dict(best_state); model.eval()
    unknown = labels.index(UNKNOWN)
    calibration = calibrate(ys['validation'], softmax(infer('validation')), labels, unknown)
    # Test is evaluated once after model and thresholds are fixed. Do not tune against it.
    test_probs = softmax(infer('test'))
    test_stats = report(ys['test'], predictions(test_probs, unknown, calibration['threshold'], calibration['margin']), labels, unknown)
    out = Path(args.out)
    if out.exists() and any(out.iterdir()):
        raise ValueError('Use a fresh output directory to preserve earlier model versions')
    out.mkdir(parents=True, exist_ok=True)
    model = model.cpu(); dummy = torch.from_numpy(xs['test'][:1])
    onnx_path = out / 'recognizer.onnx'
    torch.onnx.export(model, (dummy,), str(onnx_path), input_names=['features'], output_names=['logits'],
                      opset_version=18, dynamo=True, external_data=False)
    session = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
    max_error = 0.0
    # Fixed batch size 1 is exactly what the browser/native adapter consumes.
    for x in xs['test'][:10]:
        batch = x[None, ...]
        with torch.no_grad():
            reference = model(torch.from_numpy(batch)).numpy()
        actual = session.run(['logits'], {'features': batch})[0]
        max_error = max(max_error, float(np.abs(reference - actual).max()))
    if max_error > 1e-4:
        raise ValueError(f'ONNX parity failed: {max_error}')
    requirements = {}
    for label in labels:
        requirements[label] = sorted({c for s, _, y in rows['train'] if y == label for c in s['metadata'].get('requiredChannels', [])})
    manifest = {'format': 'conectalsch-model-v1', 'featureVersion': FEATURE_VERSION, 'featureSize': FEATURE_SIZE,
        'timeSteps': TIME_STEPS, 'labels': labels, 'unknownLabel': UNKNOWN, 'inputName': 'features', 'outputName': 'logits',
        'threshold': calibration['threshold'], 'margin': calibration['margin'], 'requiredChannels': requirements,
        'deploymentStatus': 'experimental', 'splitBy': json.loads(Path(args.splits).read_text())['groupBy'],
        'onnxMaxError': max_error, 'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / 'evaluation.json').write_text(json.dumps({'validation': calibration['validation'], 'test': test_stats,
        'note': 'Pilot metrics on isolated clips. Device latency and continuous-camera false positives still need measurement.'}, ensure_ascii=False, indent=2), encoding='utf-8')
    torch.save(model.state_dict(), out / 'weights.pt')
    print(json.dumps({'model': str(onnx_path), 'test': test_stats, 'onnxMaxError': max_error}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
