import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { TicDecoder } from '../src/teleinfo/frame.js';
import { TeleinfoHub } from '../src/teleinfo/hub.js';
import { createWidgets, METER_WIDGET } from '../src/widgets.js';
import { STALE_MS } from '../src/scenes.js';
import { historicFrame, standardFrame, HISTORIC_HC, STANDARD_LINKY } from './helpers/frames.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

function decode(bytes) {
  let decoded = null;
  new TicDecoder((frame) => {
    decoded = frame;
  }).push(bytes);
  return decoded;
}

async function setup(bytes) {
  const gladys = createFakeGladys();
  let now = 1_000_000;
  const hub = new TeleinfoHub(gladys, { publishIntervalMs: 60_000, now: () => now });
  await hub.handleFrame(decode(bytes));
  const widget = createWidgets(hub)[METER_WIDGET];
  const device = hub.buildDevices()[0];
  const get = (deviceId = device.external_id) =>
    widget.get(gladys, { settings: { device: deviceId }, language: 'fr', units: 'metric' });
  return { gladys, device, get, advance: (ms) => (now += ms) };
}

for (const [mode, bytes] of [
  ['historic', historicFrame(HISTORIC_HC)],
  ['standard', standardFrame(STANDARD_LINKY)],
]) {
  test(`the ${mode} meter widget is rendered exactly as sent`, async () => {
    const { get } = await setup(bytes);
    const content = await get();
    // [] = nothing the core would drop, truncate or trim to the content budget.
    assert.deepEqual(validateWidgetContent(content), []);
    assert.ok(content.components.some((c) => c.type === 'chart'));
    assert.ok(content.components.some((c) => c.type === 'status'));
  });

  test(`the ${mode} live tiles and chart point to features of the device`, async () => {
    const { get, device } = await setup(bytes);
    const featureIds = new Set(device.features.map((f) => f.external_id));
    const bound = (await get()).components.flatMap((c) => [
      ...(c.device_feature ? [c.device_feature] : []),
      ...(c.device_features ?? []),
    ]);
    assert.ok(bound.length > 0);
    for (const id of bound) {
      assert.ok(featureIds.has(id), `unknown feature ${id}`);
    }
  });
}

test('the historic index tile is the computed total', async () => {
  const { get } = await setup(historicFrame(HISTORIC_HC));
  const index = (await get()).components.find((c) => c.icon === 'activity');
  assert.deepEqual([index.value, index.unit], [35802, 'kWh']);
});

test('an unknown meter shows a valid waiting message', async () => {
  const { get } = await setup(historicFrame(HISTORIC_HC));
  const content = await get('ext:teleinfo:meter:000000000000');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('a silent meter shows an interrupted reception', async () => {
  const { get, advance } = await setup(historicFrame(HISTORIC_HC));
  advance(STALE_MS + 1);
  const status = (await get()).components.find((c) => c.type === 'status');
  const reception = status.items.find((i) => i.label.en === 'Reception');
  assert.equal(reception.color, 'danger');
});
