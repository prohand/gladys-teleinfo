import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionStatusOf, testConnection } from '../src/status.js';
import { STATUS } from '../src/transport/tcpSource.js';

const config = { host: '192.168.1.20', port: 2000 };

test('every reported status is bilingual', () => {
  for (const status of ['not_configured', STATUS.NO_DATA, STATUS.ERROR]) {
    const { connected, message } = connectionStatusOf(status, { config, detail: 'ECONNREFUSED' });
    assert.equal(connected, false);
    assert.ok(message.en && message.fr, status);
  }
  assert.deepEqual(connectionStatusOf(STATUS.CONNECTED), { connected: true });
  assert.equal(connectionStatusOf(STATUS.CONNECTING), null);
});

test('the error status names the address and the reason', () => {
  const { message } = connectionStatusOf(STATUS.ERROR, { config, detail: 'ECONNREFUSED' });
  assert.match(message.fr, /192\.168\.1\.20:2000 \(ECONNREFUSED\)/);
});

test('testConnection describes the meter, or explains the timeout', async () => {
  const meter = { summary: () => ({ id: '021528603314', mode: 'historic', power: 420 }) };
  const found = await testConnection({ waitForFrame: async () => meter });
  assert.equal(found.fr, 'Compteur 021528603314 trouvé (mode historique, 420 VA).');
  assert.equal(found.en, 'Meter 021528603314 found (historic mode, 420 VA).');

  const missing = await testConnection({ waitForFrame: async () => null }, 15_000);
  assert.match(missing.fr, /Aucune trame TIC reçue en 15 s/);
});
