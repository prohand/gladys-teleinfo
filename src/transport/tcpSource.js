// -----------------------------------------------------------------------------
// Reads the TIC stream from a raw TCP socket.
//
// Why TCP and not the USB port directly: the integration runs in a sandboxed
// container, and Gladys only grants hardware classes (coral-usb, gpu, video…)
// to integrations, not serial ports. The LiXee TIC module is therefore
// exposed on the network by a serial-to-TCP bridge (ser2net, socat…) running
// on the machine it is plugged into, and the integration connects to it.
//
// The bridge does the serial settings (1200 or 9600 bauds, 7E1): this module
// only receives bytes, reconnects with a backoff, and reports its status.
// -----------------------------------------------------------------------------

import net from 'node:net';
import { createLogger } from '@gladysassistant/integration-sdk';
import { TicDecoder } from '../teleinfo/frame.js';

const logger = createLogger({ name: 'tcp' });

const CONNECT_TIMEOUT_MS = 10_000;
const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
// No valid frame for this long while connected: wrong speed, wrong port, or
// the meter is not wired.
export const NO_DATA_TIMEOUT_MS = 30_000;

export const STATUS = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected', // valid frames are flowing
  NO_DATA: 'no_data', // socket open, but no valid frame
  ERROR: 'error', // socket closed or refused, retrying
  STOPPED: 'stopped',
};

export class TcpSource {
  /**
   * @param {{ host: string, port: number,
   *   onFrame: (frame: object) => void,
   *   onStatus: (status: string, detail?: string) => void,
   *   createConnection?: typeof net.createConnection }} options
   */
  constructor({ host, port, onFrame, onStatus, createConnection = net.createConnection }) {
    this.host = host;
    this.port = port;
    this.onStatus = onStatus;
    this.createConnection = createConnection;
    this.socket = null;
    this.reconnectTimer = null;
    this.watchdog = null;
    this.retryDelay = RECONNECT_MIN_MS;
    this.stopped = true;
    this.status = STATUS.STOPPED;
    this.decoder = new TicDecoder((frame) => {
      this.retryDelay = RECONNECT_MIN_MS;
      this.armWatchdog();
      this.setStatus(STATUS.CONNECTED);
      onFrame(frame);
    });
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.watchdog);
    this.reconnectTimer = null;
    this.watchdog = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.on('error', () => {});
      this.socket.destroy();
      this.socket = null;
    }
    this.setStatus(STATUS.STOPPED);
  }

  connect() {
    if (this.stopped) {
      return;
    }
    this.decoder.reset();
    this.setStatus(STATUS.CONNECTING);
    logger.info(`Connecting to ${this.host}:${this.port}`);

    const socket = this.createConnection({ host: this.host, port: this.port });
    this.socket = socket;
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.setKeepAlive(true, 30_000);

    socket.on('connect', () => {
      logger.info(`Connected to ${this.host}:${this.port}, waiting for TIC frames`);
      // The idle timeout only guards the connection itself: the data
      // watchdog takes over once connected.
      socket.setTimeout(0);
      this.armWatchdog();
    });
    socket.on('data', (chunk) => this.decoder.push(chunk));
    socket.on('timeout', () => socket.destroy(new Error('connection timed out')));
    socket.on('error', (err) => {
      this.lastError = err.code ?? err.message;
    });
    socket.on('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      clearTimeout(this.watchdog);
      if (this.stopped) {
        return;
      }
      const reason = this.lastError ?? 'connection closed';
      this.lastError = undefined;
      logger.warn(
        `Connection to ${this.host}:${this.port} lost (${reason}), retry in ${this.retryDelay / 1000} s`,
      );
      this.setStatus(STATUS.ERROR, reason);
      this.reconnectTimer = setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, RECONNECT_MAX_MS);
    });
  }

  armWatchdog() {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      logger.warn(`No valid TIC frame for ${NO_DATA_TIMEOUT_MS / 1000} s`);
      this.setStatus(STATUS.NO_DATA);
    }, NO_DATA_TIMEOUT_MS);
  }

  setStatus(status, detail) {
    if (status === this.status && status !== STATUS.ERROR) {
      return;
    }
    this.status = status;
    this.onStatus(status, detail);
  }
}
