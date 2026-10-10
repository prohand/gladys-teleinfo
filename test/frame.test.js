import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksum, parseGroup, parseFrame, TicDecoder, MODES } from '../src/teleinfo/frame.js';
import {
  historicFrame,
  standardFrame,
  standardGroup,
  HISTORIC_HC,
  STANDARD_LINKY,
} from './helpers/frames.js';

test('checksum matches the examples of the Enedis specification', () => {
  // "IINST 002 Y" and "ISOUSC 45 ?" are real historic groups.
  assert.equal(checksum('IINST 002'), 'Y');
  assert.equal(checksum('ISOUSC 45'), '?');
});

test('parseGroup reads a historic group', () => {
  assert.deepEqual(parseGroup('IINST 002 Y'), {
    label: 'IINST',
    value: '002',
    mode: MODES.HISTORIC,
  });
});

test('parseGroup accepts the historic checksum that includes the separator', () => {
  const body = 'PAPP 00420';
  const withSeparator = checksum(`${body} `);
  assert.notEqual(withSeparator, checksum(body));
  assert.equal(parseGroup(`${body} ${withSeparator}`).value, '00420');
});

test('parseGroup rejects a wrong checksum', () => {
  assert.equal(parseGroup('IINST 002 Z'), null);
  assert.equal(parseGroup('IINST 003 Y'), null);
});

test('parseGroup reads a standard group, with and without timestamp', () => {
  const plain = standardGroup('SINSTS', '00718').slice(1, -1);
  assert.deepEqual(parseGroup(plain), { label: 'SINSTS', value: '00718', mode: MODES.STANDARD });

  const stamped = standardGroup('SMAXSN', '03018', 'H081225071419').slice(1, -1);
  assert.deepEqual(parseGroup(stamped), {
    label: 'SMAXSN',
    timestamp: 'H081225071419',
    value: '03018',
    mode: MODES.STANDARD,
  });
});

test('parseFrame detects the mode and counts the invalid groups', () => {
  const raw = historicFrame(HISTORIC_HC).toString('latin1').slice(1, -1);
  const corrupted = raw.replace('PAPP 00420', 'PAPP 00421');
  const frame = parseFrame(corrupted);
  assert.equal(frame.mode, MODES.HISTORIC);
  assert.equal(frame.invalid, 1);
  assert.equal(frame.groups.has('PAPP'), false);
  assert.equal(frame.groups.get('ADCO').value, '021528603314');

  const standard = parseFrame(standardFrame(STANDARD_LINKY).toString('latin1').slice(1, -1));
  assert.equal(standard.mode, MODES.STANDARD);
  assert.equal(standard.invalid, 0);
  assert.equal(standard.groups.get('DATE').value, '');
  assert.equal(standard.groups.get('LTARF').value, '  HEURE  PLEINE  ');
});

test('TicDecoder rebuilds frames split across chunks and skips the partial first one', () => {
  const frames = [];
  const decoder = new TicDecoder((frame) => frames.push(frame));
  const bytes = historicFrame(HISTORIC_HC);
  // Start in the middle of a frame, as when connecting to a live stream.
  decoder.push(bytes.subarray(20));
  assert.equal(frames.length, 0);
  for (let i = 0; i < bytes.length; i += 7) {
    decoder.push(bytes.subarray(i, i + 7));
  }
  assert.equal(frames.length, 1);
  assert.equal(frames[0].groups.get('PAPP').value, '00420');
});

test('TicDecoder strips the parity bit (7E1 read as 8N1)', () => {
  const frames = [];
  const decoder = new TicDecoder((frame) => frames.push(frame));
  const bytes = Buffer.from(historicFrame(HISTORIC_HC)).map((b) => b | 0x80);
  decoder.push(bytes);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].groups.get('ADCO').value, '021528603314');
});

test('TicDecoder drops a frame interrupted by EOT', () => {
  const frames = [];
  const decoder = new TicDecoder((frame) => frames.push(frame));
  const bytes = historicFrame(HISTORIC_HC);
  decoder.push(Buffer.concat([bytes.subarray(0, 30), Buffer.from([0x04]), bytes.subarray(30)]));
  assert.equal(frames.length, 0);
  decoder.push(bytes);
  assert.equal(frames.length, 1);
});

test('TicDecoder ignores garbage (wrong speed)', () => {
  const frames = [];
  const decoder = new TicDecoder((frame) => frames.push(frame));
  decoder.push(Buffer.from('\x02\x7f\x55\x13garbage\x03'));
  decoder.push(Buffer.alloc(10_000, 0x41));
  assert.equal(frames.length, 0);
});
