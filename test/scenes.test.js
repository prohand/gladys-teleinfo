import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TicDecoder } from '../src/teleinfo/frame.js';
import { TeleinfoHub } from '../src/teleinfo/hub.js';
import { createSceneActions, READ_METER_ACTION, STALE_MS } from '../src/scenes.js';
import { historicFrame, HISTORIC_HC } from './helpers/frames.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declaredOutputs = manifest.scene_actions
  .find((a) => a.key === READ_METER_ACTION)
  .outputs.map((o) => o.key);

function decode(bytes) {
  let decoded = null;
  new TicDecoder((frame) => {
    decoded = frame;
  }).push(bytes);
  return decoded;
}

async function setup() {
  let now = 1_000_000;
  const hub = new TeleinfoHub(createFakeGladys(), { publishIntervalMs: 60_000, now: () => now });
  await hub.handleFrame(decode(historicFrame({ ...HISTORIC_HC, ADPS: '047' })));
  const readMeter = createSceneActions(hub)[READ_METER_ACTION];
  return { readMeter, advance: (ms) => (now += ms) };
}

const DEVICE = 'ext:teleinfo:meter:021528603314';

test('read_meter returns the declared outputs of a live meter', async () => {
  const { readMeter } = await setup();
  const outputs = await readMeter({ device: DEVICE });
  assert.deepEqual(outputs, {
    available: true,
    overload: true,
    power: 420,
    period: 'HP',
    period_type: 'peak',
    index_kwh: 35802.467,
  });
  for (const key of Object.keys(outputs)) {
    assert.ok(declaredOutputs.includes(key), `output "${key}" is not declared`);
  }
});

test('read_meter answers available: false for an unknown or silent meter', async () => {
  const { readMeter, advance } = await setup();
  assert.deepEqual(await readMeter({ device: 'ext:teleinfo:meter:000000000000' }), {
    available: false,
  });
  advance(STALE_MS + 1);
  assert.deepEqual(await readMeter({ device: DEVICE }), { available: false });
});
