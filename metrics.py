"""Metrics and rejection thresholds are separate from neural model implementation."""
import numpy as np

def softmax(logits):
    exp = np.exp(logits - logits.max(axis=1, keepdims=True))
    return exp / exp.sum(axis=1, keepdims=True)

def predictions(probs, unknown, threshold, margin):
    ordered = np.sort(probs, axis=1)
    pred = probs.argmax(axis=1)
    accepted = (ordered[:, -1] >= threshold) & (ordered[:, -1] - ordered[:, -2] >= margin) & (pred != unknown)
    return np.where(accepted, pred, unknown)

def report(y, pred, labels, unknown):
    matrix = np.zeros((len(labels), len(labels)), dtype=np.int64)
    for a, b in zip(y, pred):
        matrix[a, b] += 1
    f1, recall = [], {}
    for i, label in enumerate(labels):
        tp = int(matrix[i, i]); fn = int(matrix[i, :].sum()) - tp; fp = int(matrix[:, i].sum()) - tp
        f1.append(2 * tp / max(1, 2 * tp + fp + fn))
        recall[label] = tp / max(1, tp + fn)
    neg = y == unknown; accepted = pred != unknown; known = ~neg
    return {'accuracy': float((y == pred).mean()), 'macroF1': float(np.mean(f1)),
            'acceptedPrecision': float(((y == pred) & accepted).sum() / max(1, accepted.sum())),
            'knownCoverage': float((accepted & known).sum() / max(1, known.sum())),
            'unknownFalseAcceptRate': float((accepted & neg).sum() / max(1, neg.sum())),
            'unknownClips': int(neg.sum()), 'falseAccepts': int((accepted & neg).sum()),
            'perClassRecall': recall, 'confusionMatrix': matrix.tolist(), 'labels': labels}

def calibrate(y, probs, labels, unknown):
    if (y == unknown).sum() < 20:
        raise ValueError('Rejection calibration needs at least 20 held-out non-sign clips')
    best = None
    for threshold in np.arange(.5, .995, .01):
        for margin in [.05, .1, .15, .2, .3, .4]:
            pred = predictions(probs, unknown, threshold, margin)
            stats = report(y, pred, labels, unknown)
            if stats['unknownFalseAcceptRate'] > .05 or stats['acceptedPrecision'] < .95:
                continue
            quality = ((y == pred) & (y != unknown)).sum()
            if quality and (best is None or quality > best[0]):
                best = (quality, float(threshold), margin, stats)
    if best is None:
        raise ValueError('No useful threshold met validation goals. Improve data/model before exporting.')
    return {'threshold': best[1], 'margin': best[2], 'validation': best[3]}
