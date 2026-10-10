import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { TicDecoder } from '../src/teleinfo/frame.js';
import { Meter, meterIdOf } from '../src/teleinfo/meter.js';
import { LABELS } from '../src/teleinfo/labels.js';
import { historicFrame, standardFrame, HISTORIC_HC, STANDARD_LINKY } from './helpers/frames.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

function decode(bytes) {
  let decoded = null;
  new TicDecoder((frame) => {
    decoded = frame;
  }).push(bytes);
  return decoded;
}

function stateOf(states, key) {
  const found = states.find((s) => s.device_feature_external_id.endsWith(`:${key}`));
  return found && (found.text ?? found.state);
}

test('meterIdOf reads ADCO in historic mode and ADSC in standard mode', () => {
  assert.equal(meterIdOf(decode(historicFrame(HISTORIC_HC))), '021528603314');
  assert.equal(meterIdOf(decode(standardFrame(STANDARD_LINKY))), '041876097413');
  assert.equal(meterIdOf(decode(historicFrame({ PAPP: '00420' }))), null);
});

test('a historic meter becomes a device with the labels it sends', () => {
  const gladys = createFakeGladys();
  const frame = decode(historicFrame(HISTORIC_HC));
  const meter = new Meter('021528603314', frame.mode);
  assert.equal(meter.update(frame), true);

  const device = meter.buildDevice(gladys);
  assert.equal(device.external_id, 'ext:teleinfo:meter:021528603314');
  assert.equal(device.name, 'Compteur 021528603314');
  const keys = device.features.map((f) => f.external_id.split(':').pop());
  assert.deepEqual(keys, ['isousc', 'hchc', 'hchp', 'ptec', 'iinst', 'imax', 'adps', 'papp']);

  const papp = device.features.find((f) => f.external_id.endsWith(':papp'));
  assert.equal(papp.category, DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR);
  assert.equal(papp.type, DEVICE_FEATURE_TYPES.ENERGY_SENSOR.POWER);
  for (const feature of device.features) {
    assert.equal(feature.read_only, true);
    // NOT NULL in the core: the "add device" click fails without them.
    assert.equal(typeof feature.min, 'number', `${feature.external_id}: min`);
    assert.equal(typeof feature.max, 'number', `${feature.external_id}: max`);
  }
  const ptec = device.features.find((f) => f.external_id.endsWith(':ptec'));
  assert.equal(ptec.keep_history, false);
});

test('historic states are converted (Wh -> kWh, text, ADPS at 0 when absent)', () => {
  const gladys = createFakeGladys();
  const frame = decode(historicFrame(HISTORIC_HC));
  const meter = new Meter('021528603314', frame.mode);
  meter.update(frame);
  const states = meter.buildStates(gladys);
  assert.equal(stateOf(states, 'hchc'), 12345.678);
  assert.equal(stateOf(states, 'hchp'), 23456.789);
  assert.equal(stateOf(states, 'papp'), 420);
  assert.equal(stateOf(states, 'iinst'), 2);
  assert.equal(stateOf(states, 'ptec'), 'HP');
  assert.equal(stateOf(states, 'adps'), 0);
  assert.equal(states.find((s) => s.device_feature_external_id.endsWith(':ptec')).state, undefined);

  meter.update(decode(historicFrame({ ...HISTORIC_HC, ADPS: '047' })));
  assert.equal(stateOf(meter.buildStates(gladys), 'adps'), 47);
});

test('a standard Linky becomes a device with the core teleinformation types', () => {
  const gladys = createFakeGladys();
  const frame = decode(standardFrame(STANDARD_LINKY));
  const meter = new Meter('041876097413', frame.mode);
  meter.update(frame);
  const device = meter.buildDevice(gladys);
  assert.equal(device.name, 'Linky 041876097413');

  const byKey = Object.fromEntries(device.features.map((f) => [f.external_id.split(':').pop(), f]));
  assert.equal(byKey.east.type, DEVICE_FEATURE_TYPES.TELEINFORMATION.EAST);
  assert.equal(byKey.sinsts.type, DEVICE_FEATURE_TYPES.TELEINFORMATION.SINSTS);
  assert.equal(byKey.smaxsn.type, DEVICE_FEATURE_TYPES.TELEINFORMATION.SMAXN);
  assert.equal(byKey['smaxsn-1'].type, DEVICE_FEATURE_TYPES.TELEINFORMATION.SMAXN_1);
  assert.equal(byKey.ccasn.type, DEVICE_FEATURE_TYPES.TELEINFORMATION.CCASN);
  // Labels without a Gladys feature are not published.
  assert.equal(byKey.date, undefined);
  assert.equal(byKey.stge, undefined);
  assert.equal(byKey.ngtf, undefined);

  const states = meter.buildStates(gladys);
  assert.equal(stateOf(states, 'east'), 2787.211);
  assert.equal(stateOf(states, 'sinsts'), 718);
  assert.equal(stateOf(states, 'smaxsn'), 3018);
  assert.equal(stateOf(states, 'umoy1'), 231);
  assert.equal(stateOf(states, 'ltarf'), 'HEURE  PLEINE');
  assert.equal(stateOf(states, 'ntarf'), 2);
});

test('a new label makes the device grow, a non-numeric value is skipped', () => {
  const gladys = createFakeGladys();
  const meter = new Meter('041876097413', 'standard');
  meter.update(decode(standardFrame({ ADSC: '041876097413', SINSTS: '00718' })));
  assert.equal(
    meter.update(decode(standardFrame({ ADSC: '041876097413', SINSTS: '00718' }))),
    false,
  );
  assert.equal(
    meter.update(decode(standardFrame({ ADSC: '041876097413', SINSTS: 'XX', SINSTI: '00100' }))),
    true,
  );
  const states = meter.buildStates(gladys);
  assert.equal(stateOf(states, 'sinsts'), undefined);
  assert.equal(stateOf(states, 'sinsti'), 100);
});

test('every label definition is a valid Gladys feature', () => {
  for (const [mode, labels] of Object.entries(LABELS)) {
    for (const [label, def] of Object.entries(labels)) {
      const where = `${mode} ${label}`;
      const categoryKey = Object.keys(DEVICE_FEATURE_CATEGORIES).find(
        (key) => DEVICE_FEATURE_CATEGORIES[key] === def.category,
      );
      assert.ok(categoryKey, `${where}: unknown category ${def.category}`);
      assert.ok(
        Object.values(DEVICE_FEATURE_TYPES[categoryKey]).includes(def.type),
        `${where}: unknown type ${def.type} for ${def.category}`,
      );
      assert.equal(typeof def.convert, 'function', `${where}: missing converter`);
      assert.ok(def.name.length > 0, `${where}: missing name`);
      assert.equal(typeof def.min, 'number', `${where}: missing min`);
      assert.equal(typeof def.max, 'number', `${where}: missing max`);
    }
  }
});
