import test from 'node:test';
import assert from 'node:assert/strict';
import {HandRecovery} from '../hand-recovery.js';
import {framingAdvice, lightAdvice} from '../camera-coach.js';

const hand = (x, y, size = .1) => Array.from({length: 21}, (_, i) => ({x: x + (i % 5) * size / 5, y: y + Math.floor(i / 5) * size / 5, z: 0}));
const det = (...hands) => ({landmarks: hands, handednesses: hands.map(() => [{categoryName: 'Right', score: .9}])});

test('una mano borrosa que se pierde 3 fotogramas se mantiene (seña HOLA)', () => {
  const r = new HandRecovery({maxGapMs: 300, smooth: false});
  let t = 0;
  for (let i = 0; i < 5; i++) { r.process(det(hand(.3 + i * .02, .4)), t); t += 33 }
  for (let i = 0; i < 3; i++) {
    const out = r.process(det(), t); t += 33;
    assert.equal(out.landmarks.length, 1, 'la mano sigue presente');
    assert.equal(out.recovered, 1);
    assert.ok(out.landmarks[0][0].x > .38, 'avanza en la dirección del movimiento');
  }
  const back = r.process(det(hand(.42, .4)), t);
  assert.equal(back.recovered, 0);
});

test('si la mano desaparece más de 300 ms, ya no se inventa', () => {
  const r = new HandRecovery({maxGapMs: 300, smooth: false});
  r.process(det(hand(.5, .5)), 0);
  assert.equal(r.process(det(), 200).landmarks.length, 1);
  assert.equal(r.process(det(), 350).landmarks.length, 0);
});

test('con dos manos, si se pierde una se mantiene solo esa', () => {
  const r = new HandRecovery({maxGapMs: 300, smooth: false});
  r.process(det(hand(.2, .5), hand(.7, .5)), 0);
  const out = r.process(det(hand(.71, .5)), 33);
  assert.equal(out.landmarks.length, 2);
  assert.equal(out.recovered, 1);
  assert.equal(out.detected, 1);
});

test('el suavizado reduce el temblor de una mano quieta', () => {
  const r = new HandRecovery({smooth: true});
  let maxJump = 0, prev = null;
  for (let i = 0; i < 40; i++) {
    const noise = (i % 2 ? 1 : -1) * .006;
    const x = r.process(det(hand(.5 + noise, .5)), i * 33).landmarks[0][0].x;
    if (prev !== null && i > 5) maxJump = Math.max(maxJump, Math.abs(x - prev));
    prev = x;
  }
  assert.ok(maxJump < .012 * .6, `salto ${maxJump}`);
});

test('el suavizado sigue un movimiento rápido sin quedarse atrás', () => {
  const r = new HandRecovery({smooth: true});
  let x = 0;
  for (let i = 0; i < 12; i++) x = r.process(det(hand(.2 + i * .04, .5)), i * 33).landmarks[0][0].x;
  assert.ok(Math.abs(x - (.2 + 11 * .04)) < .05, `retraso ${(.64 - x).toFixed(3)}`);
});

test('avisos de encuadre y luz', () => {
  assert.equal(framingAdvice([hand(.98, .5)], 1)?.kind, 'edge');
  assert.equal(framingAdvice([hand(.1, .1, .9)], 1)?.kind, 'close');
  assert.equal(framingAdvice([hand(.4, .4)], 1), null);
  assert.equal(lightAdvice(40)?.kind, 'dark');
  assert.equal(lightAdvice(70)?.kind, 'dim');
  assert.equal(lightAdvice(120), null);
});
