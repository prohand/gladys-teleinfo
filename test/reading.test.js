import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TicDecoder } from '../src/teleinfo/frame.js';
import { readingOf, periodTypeOf, periodLabel, PERIOD_TYPES } from '../src/teleinfo/reading.js';
import { historicFrame, standardFrame, HISTORIC_HC, STANDARD_LINKY } from './helpers/frames.js';

function decode(bytes) {
  let decoded = null;
  new TicDecoder((frame) => {
    decoded = frame;
  }).push(bytes);
  return decoded;
}

test('periodTypeOf normalizes the historic and standard labels', () => {
  const cases = {
    HC: PERIOD_TYPES.OFF_PEAK,
    HCJB: PERIOD_TYPES.OFF_PEAK,
    'HEURE CREUSE': PERIOD_TYPES.OFF_PEAK,
    'HC BLEU': PERIOD_TYPES.OFF_PEAK,
    HP: PERIOD_TYPES.PEAK,
    HPJR: PERIOD_TYPES.PEAK,
    PM: PERIOD_TYPES.PEAK,
    'HEURE PLEINE': PERIOD_TYPES.PEAK,
    TH: PERIOD_TYPES.BASE,
    HN: PERIOD_TYPES.BASE,
    BASE: PERIOD_TYPES.BASE,
    'SEMAINE ETE': PERIOD_TYPES.OTHER,
  };
  for (const [label, type] of Object.entries(cases)) {
    assert.equal(periodTypeOf(label), type, label);
  }
  assert.equal(periodTypeOf(null), null);
});

test('periodLabel drops the padding dots and spaces', () => {
  assert.equal(periodLabel('HC..'), 'HC');
  assert.equal(periodLabel('  HEURE  PLEINE  '), 'HEURE PLEINE');
  assert.equal(periodLabel('....'), null);
});

test('a historic reading sums the tariff indexes and reads ADPS', () => {
  const reading = readingOf(decode(historicFrame(HISTORIC_HC)));
  assert.deepEqual(reading, {
    power: 420,
    period: 'HP',
    periodType: PERIOD_TYPES.PEAK,
    indexKwh: 35802.467,
    overload: false,
  });
  assert.equal(readingOf(decode(historicFrame({ ...HISTORIC_HC, ADPS: '047' }))).overload, true);
});

test('a standard reading uses EAST, and SINSTS above PREF as the overload', () => {
  const reading = readingOf(decode(standardFrame(STANDARD_LINKY)));
  assert.deepEqual(reading, {
    power: 718,
    period: 'HEURE PLEINE',
    periodType: PERIOD_TYPES.PEAK,
    indexKwh: 2787.211,
    overload: false,
  });
  // PREF 09 kVA: 9001 VA is over.
  assert.equal(
    readingOf(decode(standardFrame({ ...STANDARD_LINKY, SINSTS: '09001' }))).overload,
    true,
  );
  assert.equal(
    readingOf(decode(standardFrame({ ...STANDARD_LINKY, SINSTS: '09000' }))).overload,
    false,
  );
});
