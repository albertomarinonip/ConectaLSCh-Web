// v1.8.0 — Avisos visuales para que la cámara vea mejor las manos.
// Revisa la luz de la imagen y el encuadre de las manos. Solo da consejos:
// nunca cambia el reconocimiento.

export function lumaOf(data) {
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) { sum += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]; n++ }
  return n ? sum / n : 0;
}

// hands: arreglo de manos (21 puntos normalizados). Devuelve el aviso más importante o null.
export function framingAdvice(hands, aspect = 16 / 9) {
  for (const h of hands || []) {
    if (!Array.isArray(h) || h.length !== 21) continue;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of h) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
    const size = Math.max((maxX - minX) * aspect, maxY - minY);
    if (size > .62) return {kind: 'close', text: 'Estás muy cerca: aléjate un poco de la cámara'};
    if (minX < .015 || maxX > .985 || minY < .015 || maxY > .985) return {kind: 'edge', text: 'Tu mano sale de la imagen: deja las manos dentro del cuadro'};
  }
  return null;
}

export function lightAdvice(luma) {
  if (!Number.isFinite(luma)) return null;
  if (luma < 55) return {kind: 'dark', text: 'Poca luz: enciende una luz frente a ti. Con poca luz las manos salen borrosas'};
  if (luma < 80) return {kind: 'dim', text: 'Luz baja: con más luz el movimiento se detecta mejor'};
  return null;
}

export class CameraCoach {
  constructor({intervalMs = 700} = {}) {
    this.intervalMs = intervalMs; this.last = -Infinity; this.luma = null;
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) { this.canvas.width = 32; this.canvas.height = 18 }
  }
  reset() { this.last = -Infinity; this.luma = null; this.stableAdvice = null; this.pendingKey = null; this.adviceSince = 0 }
  // Mide la luz como máximo cada intervalMs. Barato: imagen de 32x18 píxeles.
  measure(video, now) {
    if (!this.canvas || now - this.last < this.intervalMs || !video?.videoWidth) return this.luma;
    this.last = now;
    try {
      const ctx = this.canvas.getContext('2d', {willReadFrequently: true});
      ctx.drawImage(video, 0, 0, 32, 18);
      const l = lumaOf(ctx.getImageData(0, 0, 32, 18).data);
      this.luma = this.luma === null ? l : .5 * this.luma + .5 * l;
    } catch { /* algunas cámaras no permiten leer píxeles; se omite el aviso de luz */ }
    return this.luma;
  }
  // Un aviso debe repetirse 600 ms antes de mostrarse, para que no parpadee.
  advice(video, hands, now) {
    const aspect = video?.videoWidth && video?.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const a = framingAdvice(hands, aspect) || lightAdvice(this.measure(video, now));
    const key = a?.kind || null;
    if (key !== this.pendingKey) { this.pendingKey = key; this.adviceSince = now }
    if (key === null) this.stableAdvice = null;
    else if (now - this.adviceSince >= 600) this.stableAdvice = a;
    return this.stableAdvice || null;
  }
}
