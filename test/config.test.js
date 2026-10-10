import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig keeps user values and trims the host', () => {
  const config = normalizeConfig({ host: ' 192.168.1.20 ', port: 3333, publish_interval: 30 });
  assert.equal(config.host, '192.168.1.20');
  assert.equal(config.port, 3333);
  assert.equal(config.publish_interval, 30);
});

test('normalizeConfig coerces numeric strings coming from a form', () => {
  const config = normalizeConfig({ port: '3333', publish_interval: '120' });
  assert.equal(config.port, 3333);
  assert.equal(config.publish_interval, 120);
});

test('normalizeConfig falls back on invalid numbers and clamps the interval', () => {
  assert.equal(normalizeConfig({ port: 'abc' }).port, DEFAULT_CONFIG.port);
  assert.equal(normalizeConfig({ port: 70000 }).port, DEFAULT_CONFIG.port);
  assert.equal(normalizeConfig({ port: '' }).port, DEFAULT_CONFIG.port);
  assert.equal(normalizeConfig({ publish_interval: 1 }).publish_interval, 15);
  assert.equal(normalizeConfig({ publish_interval: 99999 }).publish_interval, 3600);
});
