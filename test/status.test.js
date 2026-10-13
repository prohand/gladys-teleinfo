import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionStatusOf, testConnection } from '../src/status.js';
import { STATUS } from '../src/transport/tcpSource.js';

const config = { host: '192.168.1.20', port: 2000 };

const LANGUAGES = ['de', 'en', 'es', 'fr'];

test('every reported status is in the four languages', () => {
  for (const status of ['not_configured', STATUS.NO_DATA, STATUS.ERROR]) {
    const { connected, message } = connectionStatusOf(status, { config, detail: 'ECONNREFUSED' });
    assert.equal(connected, false);
    assert.deepEqual(Object.keys(message).sort(), LANGUAGES, status);
    assert.ok(Object.values(message).every(Boolean), status);
  }
  assert.deepEqual(connectionStatusOf(STATUS.CONNECTED), { connected: true });
  assert.equal(connectionStatusOf(STATUS.CONNECTING), null);
});

test('the error status names the address and the reason', () => {
  const { message } = connectionStatusOf(STATUS.ERROR, { config, detail: 'ECONNREFUSED' });
  for (const lang of LANGUAGES) {
    assert.match(message[lang], /192\.168\.1\.20:2000 \(ECONNREFUSED\)/, lang);
  }
});

test('testConnection describes the meter, or explains the timeout', async () => {
  const meter = { summary: () => ({ id: '021528603314', mode: 'historic', power: 420 }) };
  const found = await testConnection({ waitForFrame: async () => meter });
  assert.equal(found.fr, 'Compteur 021528603314 trouvé (mode historique, 420 VA).');
  assert.equal(found.en, 'Meter 021528603314 found (historic mode, 420 VA).');
  assert.equal(found.de, 'Zähler 021528603314 gefunden (historischer Modus, 420 VA).');
  assert.equal(found.es, 'Contador 021528603314 encontrado (modo histórico, 420 VA).');

  const standard = { summary: () => ({ id: '021528603314', mode: 'standard', power: null }) };
  const linky = await testConnection({ waitForFrame: async () => standard });
  assert.equal(linky.de, 'Zähler 021528603314 gefunden (Standardmodus).');
  assert.equal(linky.es, 'Contador 021528603314 encontrado (modo estándar).');

  const missing = await testConnection({ waitForFrame: async () => null }, 15_000);
  assert.match(missing.fr, /Aucune trame TIC reçue en 15 s/);
  assert.deepEqual(Object.keys(missing).sort(), LANGUAGES);
});
