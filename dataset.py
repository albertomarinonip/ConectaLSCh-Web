"""Validate exported v4 observations and prepare isolated-sign sequences. No PyTorch needed."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np

FEATURE_VERSION = 'hands-body-face-v2'
FEATURE_SIZE = 216
TIME_STEPS = 48
UNKNOWN = '__UNKNOWN__'

def resample(observations):
    times = np.asarray([o['time'] for o in observations], dtype=np.float64)
    vectors = np.asarray([o['vector'] for o in observations], dtype=np.float32)
    if not 8 <= len(times) <= 180 or vectors.shape != (len(times), FEATURE_SIZE):
        raise ValueError('Invalid frame count or feature shape')
    if not np.isfinite(vectors).all() or not np.isfinite(times).all() or times[0] != 0 or not np.all(np.diff(times) > 0):
        raise ValueError('Invalid timestamps or nonfinite features')
    if times[-1] > 15000:
        raise ValueError('Sequence too long')
    targets = np.linspace(times[0], times[-1], TIME_STEPS)
    indices = np.abs(times[:, None] - targets[None, :]).argmin(axis=0)
    return vectors[indices]

def group_key(sample, by):
    m = sample['metadata']
    return m['signerId'] if by == 'person' else json.dumps([m['signerId'], m['sessionId']], separators=(',', ':'), ensure_ascii=False)

def load_samples(paths):
    samples = {}
    for path in paths:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if (data.get('format'), data.get('schemaVersion'), data.get('featureVersion'), data.get('featureSize'), data.get('timeSteps')) != ('conectalsch-dataset', 1, FEATURE_VERSION, FEATURE_SIZE, TIME_STEPS):
            raise ValueError('Use the new «Datos para entrenar en PC» export, not a legacy backup')
        for s in data['samples']:
            if s.get('sampleVersion') != 4 or s.get('featureVersion') != FEATURE_VERSION or not isinstance(s.get('id'), str) or not s['id']:
                raise ValueError('Invalid v4 sample')
            m = s.get('metadata', {})
            if not all(isinstance(m.get(k), str) and m[k].strip() for k in ['signerId', 'sessionId', 'variant']):
                raise ValueError('Missing signer/session/variant')
            if m.get('captureMode') not in ['dynamic', 'static', 'background']:
                raise ValueError('Unknown capture mode')
            if s.get('timestamps') != [o['time'] for o in s['observations']]:
                raise ValueError('Observation/timestamp mismatch')
            resample(s['observations'])
            if s['id'] in samples and samples[s['id']] != s:
                raise ValueError('Two different samples share an id')
            samples[s['id']] = s
    if not samples:
        raise ValueError('No multimodal samples')
    return list(samples.values())

def partition(samples, split):
    by = split.get('groupBy')
    if split.get('format') != 'conectalsch-splits-v1' or by not in ['person', 'session']:
        raise ValueError('Invalid split file')
    result = {k: [] for k in ['train', 'validation', 'test']}
    hashes = {}
    for s in samples:
        key = group_key(s, by)
        part = split.get('groups', {}).get(key)
        if part not in result:
            raise ValueError(f'Assign group {key} to train, validation or test')
        x = resample(s['observations'])
        fingerprint = hashlib.sha256(np.round(x, 6).astype('<f4').tobytes()).hexdigest()
        if fingerprint in hashes and hashes[fingerprint] != part:
            raise ValueError('The same feature sequence appears in different splits (data leakage)')
        hashes[fingerprint] = part
        label = UNKNOWN if s['metadata']['captureMode'] == 'background' else s['label']
        result[part].append((s, x, label))
    if any(not entries for entries in result.values()):
        raise ValueError('All three splits need complete groups')
    labels = sorted({entry[2] for entry in result['train']})
    if UNKNOWN not in labels or len(labels) < 3:
        raise ValueError('Train needs at least two signs and non-sign examples')
    for name, entries in result.items():
        counts = {label: sum(e[2] == label for e in entries) for label in labels}
        if any(e[2] not in labels for e in entries):
            raise ValueError(f'{name}: class absent from train; collect more training samples')
        minimum = 4 if name == 'train' else 2
        if any(count < minimum for label, count in counts.items() if label != UNKNOWN):
            raise ValueError(f'{name}: needs at least {minimum} clips for each sign')
        if counts[UNKNOWN] < (4 if name == 'train' else 20):
            raise ValueError(f'{name}: collect more non-sign examples (20 for validation/test)')
    return result, labels

def main():
    parser = argparse.ArgumentParser(description='Inspect the dataset and create an explicit group split draft')
    parser.add_argument('exports', nargs='+')
    parser.add_argument('--out', default='dataset-review')
    parser.add_argument('--group-by', choices=['person', 'session'], default='session')
    args = parser.parse_args()
    samples = load_samples(args.exports)
    groups = sorted({group_key(s, args.group_by) for s in samples})
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    summary = {'clips': len(samples), 'groupBy': args.group_by, 'groups': groups,
               'labels': {label: sum(s['label'] == label for s in samples) for label in sorted({s['label'] for s in samples})}}
    (out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    draft = out / 'splits.json'
    if draft.exists():
        raise ValueError('splits.json already exists; use another --out to avoid replacing your assignments')
    draft.write_text(json.dumps({'format': 'conectalsch-splits-v1', 'groupBy': args.group_by,
                                'groups': {g: 'UNASSIGNED' for g in groups}}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{len(samples)} clips, {len(groups)} groups. Review {draft} before training.')

if __name__ == '__main__':
    main()
