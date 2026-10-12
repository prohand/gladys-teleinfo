import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TicDecoder } from '../src/teleinfo/frame.js';
import { TeleinfoHub, HEARTBEAT_MS } from '../src/teleinfo/hub.js';
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
  let now = 1_000_000;
  const gladys = createFakeGladys({ now: () => now });
  const hub = new TeleinfoHub(gladys, { publishIntervalMs: 60_000, now: () => now });
  return { gladys, hub, advance: (ms) => (now += ms) };
}

test('the first frame publishes the device and every state', async () => {
  const { gladys, hub } = setup();
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  assert.equal(gladys.discovered.length, 1);
  assert.equal(gladys.discovered[0][0].external_id, 'ext:teleinfo:meter:021528603314');
  assert.equal(gladys.stateCalls.length, 1);
  assert.equal(gladys.stateCalls[0].length, 8);
});

test('states are throttled, and only the changed ones are re-sent', async () => {
  const { gladys, hub, advance } = setup();
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  advance(2_000);
  await hub.handleFrame(decode(historicFrame({ ...HISTORIC_HC, PAPP: '00500' })));
  assert.equal(gladys.stateCalls.length, 1, 'too early: nothing sent');

  advance(60_000);
  await hub.handleFrame(decode(historicFrame({ ...HISTORIC_HC, PAPP: '00500' })));
  assert.equal(gladys.stateCalls.length, 2);
  assert.deepEqual(gladys.stateCalls[1], [
    { device_feature_external_id: 'ext:teleinfo:meter:021528603314:papp', state: 500 },
  ]);
  assert.equal(gladys.discovered.length, 1, 'same labels: device not re-published');
});

test('every value is re-sent at the heartbeat', async () => {
  const { gladys, hub, advance } = setup();
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  advance(HEARTBEAT_MS);
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  assert.equal(gladys.stateCalls.length, 2);
  assert.equal(gladys.stateCalls[1].length, 8);
});

test('forgetPublished re-sends every value at the next frame', async () => {
  const { gladys, hub, advance } = setup();
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  hub.forgetPublished();
  advance(1_000);
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  assert.equal(gladys.stateCalls.length, 2);
  assert.equal(gladys.stateCalls[1].length, 8);
});

test('a failed publication is retried with the same values', async () => {
  const { gladys, hub, advance } = setup();
  gladys.failNext = true;
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  assert.equal(gladys.stateCalls.length, 0);
  advance(60_000);
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  assert.equal(gladys.stateCalls.length, 1);
  assert.equal(gladys.stateCalls[0].length, 8);
});

test('a new label or a mode switch re-publishes the device', async () => {
  const { gladys, hub } = setup();
  await hub.handleFrame(decode(standardFrame({ ADSC: '041876097413', SINSTS: '00718' })));
  await hub.handleFrame(decode(standardFrame(STANDARD_LINKY)));
  assert.equal(gladys.discovered.length, 2);
  assert.ok(gladys.discovered[1][0].features.length > 1);
  assert.equal(hub.buildDevices().length, 1);
});

test('a frame without serial number is ignored', async () => {
  const { gladys, hub } = setup();
  await hub.handleFrame(decode(historicFrame({ PAPP: '00420' })));
  assert.equal(gladys.discovered.length, 0);
  assert.equal(hub.lastFrameAt(), 0);
});

test('waitForFrame resolves with the meter, or null after the timeout', async () => {
  const { hub } = setup();
  const waiting = hub.waitForFrame(1_000);
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  assert.equal((await waiting).id, '021528603314');
  assert.equal(await hub.waitForFrame(10), null);
});

test('a value changed between two heartbeats is sent alone, the rest waits', async () => {
  const { gladys, hub, advance } = setup();
  await hub.handleFrame(decode(historicFrame(HISTORIC_HC)));
  advance(HEARTBEAT_MS / 2);
  await hub.handleFrame(decode(historicFrame({ ...HISTORIC_HC, PAPP: '00500' })));
  assert.equal(gladys.stateCalls[1].length, 1);
  advance(HEARTBEAT_MS / 2);
  await hub.handleFrame(decode(historicFrame({ ...HISTORIC_HC, PAPP: '00500' })));
  // The seven values unchanged since the first frame are due; PAPP is not.
  assert.equal(gladys.stateCalls[2].length, 7);
});
