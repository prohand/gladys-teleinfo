import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TicDecoder } from '../src/teleinfo/frame.js';
import { TeleinfoHub } from '../src/teleinfo/hub.js';
import { OVERLOAD_END_MS } from '../src/teleinfo/meter.js';
import { SCENE_TRIGGERS } from '../src/sceneTriggers.js';
import { historicFrame, standardFrame, HISTORIC_HC, STANDARD_LINKY } from './helpers/frames.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

function decode(bytes) {
  let decoded = null;
  new TicDecoder((frame) => {
    decoded = frame;
  }).push(bytes);
  return decoded;
}

function setup() {
  const gladys = createFakeGladys();
  const notified = [];
  let now = 1_000_000;
  const hub = new TeleinfoHub(gladys, {
    publishIntervalMs: 60_000,
    now: () => now,
    onEvent: (key) => notified.push(key),
  });
  return { gladys, hub, notified, advance: (ms) => (now += ms) };
}

const DEVICE = 'ext:teleinfo:meter:021528603314';

test('a tariff period change fires one event, never on the first frame', async () => {
  const { gladys, hub, notified, advance } = setup();
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  advance(2_000);
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  assert.equal(gladys.sceneEvents.length, 0);

  advance(2_000);
  await hub.handleFrame(decode(historicFrame({ ...HISTORIC_HC, PTEC: 'HC..' })));
  advance(2_000);
  await hub.handleFrame(decode(historicFrame({ ...HISTORIC_HC, PTEC: 'HC..' })));
  assert.deepEqual(gladys.sceneEvents, [
    {
      key: SCENE_TRIGGERS.TARIFF_PERIOD_CHANGED,
      data: { device: DEVICE, period: 'HC', period_type: 'off_peak', previous_period: 'HP' },
    },
  ]);
  assert.deepEqual(notified, [SCENE_TRIGGERS.TARIFF_PERIOD_CHANGED]);
});

test('an overload fires once, even when ADPS flickers, and again after a calm minute', async () => {
  const { gladys, hub, advance } = setup();
  const over = decode(historicFrame({ ...HISTORIC_HC, ADPS: '047', PAPP: '11000' }));
  const calm = decode(historicFrame(HISTORIC_HC));
  for (const frame of [calm, over, calm, over, over, calm]) {
    advance(2_000);
    await hub.handleFrame(frame);
  }
  const overloads = () =>
    gladys.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.OVERLOAD_STARTED);
  assert.equal(overloads().length, 1);
  assert.deepEqual(overloads()[0].data, { device: DEVICE, power: 11000 });

  advance(OVERLOAD_END_MS + 1);
  await hub.handleFrame(over);
  assert.equal(overloads().length, 2);
});

test('a standard Linky fires the same events', async () => {
  const { gladys, hub, advance } = setup();
  await hub.handleFrame(decode(standardFrame(STANDARD_LINKY)));
  advance(2_000);
  await hub.handleFrame(
    decode(standardFrame({ ...STANDARD_LINKY, LTARF: 'HEURE CREUSE', SINSTS: '09500' })),
  );
  assert.deepEqual(
    gladys.sceneEvents.map((e) => e.key),
    [SCENE_TRIGGERS.TARIFF_PERIOD_CHANGED, SCENE_TRIGGERS.OVERLOAD_STARTED],
  );
  assert.equal(gladys.sceneEvents[0].data.device, 'ext:teleinfo:meter:041876097413');
});

test('a refused scene event never breaks the frame handling', async () => {
  const { gladys, hub, advance } = setup();
  gladys.publishSceneEvent = async () => {
    throw new Error('429');
  };
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  advance(2_000);
  await hub.handleFrame(decode(historicFrame({ ...HISTORIC_HC, PTEC: 'HC..' })));
  assert.equal(gladys.stateCalls.length, 1);
});
