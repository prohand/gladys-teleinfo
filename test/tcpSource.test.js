import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TcpSource, STATUS } from '../src/transport/tcpSource.js';
import { historicFrame, HISTORIC_HC } from './helpers/frames.js';

// Stand-in for a net.Socket: no network in the tests.
function createFakeSocketFactory() {
  const sockets = [];
  const createConnection = (options) => {
    const socket = new EventEmitter();
    socket.options = options;
    socket.setTimeout = () => {};
    socket.setKeepAlive = () => {};
    socket.destroy = (err) => {
      if (err) socket.emit('error', err);
      socket.emit('close');
    };
    sockets.push(socket);
    return socket;
  };
  return { sockets, createConnection };
}

test('frames read from the socket reach onFrame, and the status follows', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { sockets, createConnection } = createFakeSocketFactory();
  const frames = [];
  const statuses = [];
  const source = new TcpSource({
    host: '192.168.1.20',
    port: 2000,
    onFrame: (frame) => frames.push(frame),
    onStatus: (status) => statuses.push(status),
    createConnection,
  });
  source.start();
  assert.deepEqual(sockets[0].options, { host: '192.168.1.20', port: 2000 });

  sockets[0].emit('connect');
  sockets[0].emit('data', historicFrame(HISTORIC_HC));
  assert.equal(frames.length, 1);
  assert.deepEqual(statuses, [STATUS.CONNECTING, STATUS.CONNECTED]);

  // No frame for 30 s: reported once.
  t.mock.timers.tick(30_000);
  assert.equal(statuses.at(-1), STATUS.NO_DATA);
  source.stop();
  assert.equal(statuses.at(-1), STATUS.STOPPED);
});

test('a lost connection is retried with a growing delay', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { sockets, createConnection } = createFakeSocketFactory();
  const statuses = [];
  const source = new TcpSource({
    host: 'bridge',
    port: 2000,
    onFrame: () => {},
    onStatus: (status, detail) => statuses.push([status, detail]),
    createConnection,
  });
  source.start();
  sockets[0].emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
  sockets[0].emit('close');
  assert.deepEqual(statuses.at(-1), [STATUS.ERROR, 'ECONNREFUSED']);

  t.mock.timers.tick(4_999);
  assert.equal(sockets.length, 1);
  t.mock.timers.tick(1);
  assert.equal(sockets.length, 2);

  sockets[1].emit('close');
  t.mock.timers.tick(9_999);
  assert.equal(sockets.length, 2, 'second retry waits twice as long');
  t.mock.timers.tick(1);
  assert.equal(sockets.length, 3);
  source.stop();
});

test('stop() prevents any reconnection', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { sockets, createConnection } = createFakeSocketFactory();
  const source = new TcpSource({
    host: 'bridge',
    port: 2000,
    onFrame: () => {},
    onStatus: () => {},
    createConnection,
  });
  source.start();
  source.stop();
  t.mock.timers.tick(120_000);
  assert.equal(sockets.length, 1);
});
