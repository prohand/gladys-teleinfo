// -----------------------------------------------------------------------------
// Receives the decoded TIC frames and turns them into Gladys calls.
//
// A meter sends a frame every 1 to 2 seconds. Gladys does not need that pace
// (POST /state is rate-limited to 300 states per minute per integration), so:
//   - the device is (re-)published only when a meter or a label appears;
//   - the states are published at most every `publish_interval` seconds, and
//     only the values that changed since the last publication;
//   - every value is re-sent at least every HEARTBEAT_MS, so a device created
//     after its values were first sent still gets them.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { Meter, meterIdOf } from './meter.js';

const logger = createLogger({ name: 'teleinfo' });

export const HEARTBEAT_MS = 10 * 60 * 1000;
const MAX_STATES_PER_REQUEST = 100;

export class TeleinfoHub {
  /**
   * @param {object} gladys SDK instance
   * @param {{ publishIntervalMs: number, now?: () => number }} options
   */
  constructor(gladys, { publishIntervalMs, now = Date.now }) {
    this.gladys = gladys;
    this.publishIntervalMs = publishIntervalMs;
    this.now = now;
    this.meters = new Map();
    this.published = new Map(); // feature external_id -> last published value
    this.lastPublishAt = 0;
    this.lastHeartbeatAt = 0;
    this.busy = false;
    this.devicesDirty = false;
    this.waiters = new Set();
  }

  setPublishInterval(publishIntervalMs) {
    this.publishIntervalMs = publishIntervalMs;
  }

  /** Discovery payload of every meter seen so far. */
  buildDevices() {
    return [...this.meters.values()].map((meter) => meter.buildDevice(this.gladys));
  }

  /** The meter that sent the most recent frame, if any. */
  latestMeter() {
    let latest = null;
    for (const meter of this.meters.values()) {
      if (!latest || meter.lastFrameAt > latest.lastFrameAt) {
        latest = meter;
      }
    }
    return latest;
  }

  /** Time of the last valid frame, 0 when none was received. */
  lastFrameAt() {
    return this.latestMeter()?.lastFrameAt ?? 0;
  }

  /** Re-send every value at the next publication (e.g. after a scan). */
  forgetPublished() {
    this.published.clear();
    this.lastPublishAt = 0;
  }

  /**
   * Resolve with the meter of the next valid frame, or null after
   * `timeoutMs`.
   */
  waitForFrame(timeoutMs) {
    return new Promise((resolve) => {
      const waiter = (meter) => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(meter);
      };
      const timer = setTimeout(() => waiter(null), timeoutMs);
      this.waiters.add(waiter);
    });
  }

  /**
   * Handle one decoded frame. Never throws: a Gladys error is logged and the
   * next frame retries.
   */
  async handleFrame(frame) {
    const id = meterIdOf(frame);
    if (!id) {
      logger.debug('Frame without meter serial number, ignored');
      return;
    }
    const now = this.now();
    let meter = this.meters.get(id);
    if (!meter || meter.mode !== frame.mode) {
      // New meter, or the meter switched between historic and standard mode:
      // same serial number, same device, other features.
      logger.info(`Meter ${id} detected (${frame.mode} mode)`);
      meter = new Meter(id, frame.mode);
      this.meters.set(id, meter);
      this.devicesDirty = true;
    }
    if (meter.update(frame, now)) {
      this.devicesDirty = true;
    }
    for (const waiter of [...this.waiters]) {
      waiter(meter);
    }

    // Frames keep coming while a request is in flight: they are recorded
    // above, the next frame after the request publishes them.
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      if (this.devicesDirty) {
        this.devicesDirty = false;
        await this.gladys.publishDiscoveredDevices(this.buildDevices());
      }
      if (now - this.lastPublishAt >= this.publishIntervalMs) {
        await this.publishStates(now);
      }
    } catch (err) {
      logger.error('Publication to Gladys failed', err);
    } finally {
      this.busy = false;
    }
  }

  async publishStates(now = this.now()) {
    const heartbeat = now - this.lastHeartbeatAt >= HEARTBEAT_MS;
    const states = [...this.meters.values()]
      .flatMap((meter) => meter.buildStates(this.gladys))
      .filter((state) => {
        const value = state.text ?? state.state;
        return heartbeat || this.published.get(state.device_feature_external_id) !== value;
      });
    this.lastPublishAt = now;
    if (heartbeat) {
      this.lastHeartbeatAt = now;
    }
    for (let start = 0; start < states.length; start += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(start, start + MAX_STATES_PER_REQUEST);
      await this.gladys.publishStates(batch);
      // Remembered only once Gladys took them: a failed batch is re-sent.
      for (const state of batch) {
        this.published.set(state.device_feature_external_id, state.text ?? state.state);
      }
    }
    logger.debug(`${states.length} state(s) published`);
  }
}
