// v1.8.0 — Recuperación de manos y suavizado.
// Con poca luz, una mano que se mueve rápido (por ejemplo en HOLA) sale borrosa
// y el detector la pierde 1 a 5 fotogramas. Antes eso borraba toda la seña.
// Aquí se mantiene la mano por un tiempo corto, prediciendo su posición con la
// velocidad que traía, y se suaviza el temblor de los puntos sin agregar retraso
// cuando la mano se mueve rápido (filtro One Euro).

const VALID = h => Array.isArray(h) && h.length === 21 && h.every(p => p && [p.x, p.y, p.z].every(Number.isFinite));
const copyHand = h => h.map(p => ({x: p.x, y: p.y, z: p.z}));

class LowPass {
  constructor() { this.y = null }
  filter(x, a) { this.y = this.y === null ? x : a * x + (1 - a) * this.y; return this.y }
}
const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt) };

export class OneEuro {
  constructor({minCutoff = 1.2, beta = 4, dCutoff = 1.0} = {}) {
    Object.assign(this, {minCutoff, beta, dCutoff}); this.x = new LowPass(); this.dx = new LowPass(); this.last = null; this.prev = null;
  }
  filter(value, time) {
    if (this.last === null) { this.last = time; this.prev = value; return this.x.filter(value, 1) }
    const dt = Math.max(1e-3, (time - this.last) / 1000); this.last = time;
    const d = (value - this.prev) / dt; this.prev = value;
    const ed = this.dx.filter(d, alpha(this.dCutoff, dt));
    return this.x.filter(value, alpha(this.minCutoff + this.beta * Math.abs(ed), dt));
  }
}

class HandSmoother {
  constructor(opts) { this.f = Array.from({length: 63}, () => new OneEuro(opts)) }
  apply(hand, time) {
    return hand.map((p, i) => ({x: this.f[i * 3].filter(p.x, time), y: this.f[i * 3 + 1].filter(p.y, time), z: this.f[i * 3 + 2].filter(p.z, time)}));
  }
}

export class HandRecovery {
  constructor({maxGapMs = 300, smooth = true, smoothing = {}} = {}) {
    this.maxGapMs = maxGapMs; this.smooth = smooth; this.smoothing = smoothing; this.reset();
  }
  reset() { this.tracks = []; this.filledFrames = 0 }

  // result: salida de HandLandmarker.detectForVideo. Devuelve un objeto con la
  // misma forma; `recovered` cuenta cuántas manos se mantuvieron por predicción.
  process(result, time) {
    const detected = [];
    const handed = result?.handednesses || result?.handedness || [];
    for (const [i, h] of (result?.landmarks || []).entries()) if (VALID(h) && detected.length < 2) detected.push({hand: h, handedness: handed[i] || []});

    // Emparejar detecciones con las manos que ya veníamos siguiendo (muñeca más cercana).
    const used = new Set(), next = [];
    for (const d of detected) {
      let best = -1, bestDist = Infinity;
      this.tracks.forEach((t, k) => {
        if (used.has(k)) return;
        const dist = Math.hypot(d.hand[0].x - t.raw[0].x, d.hand[0].y - t.raw[0].y);
        if (dist < bestDist) { bestDist = dist; best = k }
      });
      const prev = best >= 0 && bestDist < 0.25 ? this.tracks[best] : null;
      if (prev) used.add(best);
      const dt = prev ? Math.max(1, time - prev.time) : 0;
      const vx = prev ? (d.hand[0].x - prev.raw[0].x) / dt : 0, vy = prev ? (d.hand[0].y - prev.raw[0].y) / dt : 0;
      const smoother = prev?.smoother || new HandSmoother(this.smoothing);
      const out = this.smooth ? smoother.apply(d.hand, time) : copyHand(d.hand);
      next.push({raw: copyHand(d.hand), out, time, seen: time, vx: prev ? .6 * vx + .4 * prev.vx : 0, vy: prev ? .6 * vy + .4 * prev.vy : 0, smoother, handedness: d.handedness, predicted: false});
    }

    // Manos que no aparecieron en este fotograma: mantenerlas si se perdieron hace poco.
    this.tracks.forEach((t, k) => {
      if (used.has(k) || next.length >= 2) return;
      const gap = time - t.seen;
      if (gap > this.maxGapMs) return;
      // Predicción con la velocidad que traía, frenando para no salir disparada.
      const step = Math.min(gap, 120), decay = Math.exp(-gap / 200);
      const dx = t.vx * step * decay, dy = t.vy * step * decay;
      const moved = t.raw.map(p => ({x: p.x + dx, y: p.y + dy, z: p.z}));
      const out = this.smooth ? t.smoother.apply(moved, time) : moved;
      next.push({...t, out, time, raw: t.raw, predicted: true});
    });

    this.tracks = next;
    const recovered = next.filter(t => t.predicted).length;
    this.filledFrames = recovered ? this.filledFrames + 1 : 0;
    return {
      landmarks: next.map(t => t.out),
      handednesses: next.map(t => t.handedness),
      handedness: next.map(t => t.handedness),
      recovered,
      detected: detected.length
    };
  }
}
