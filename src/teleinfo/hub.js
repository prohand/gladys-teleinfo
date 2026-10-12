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
// The last two are the SDK's `publishChangedStates` (0.15): it remembers what
// Gladys ACCEPTED per feature, splits the batches and forgets a device's values
// when Gladys reports it created, updated or deleted. The throttle is ours.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { Meter, meterIdOf } from './meter.js';

const logger = createLogger({ name: 'teleinfo' });

export const HEARTBEAT_MS = 10 * 60 * 1000;

export class TeleinfoHub {
  /**
   * @param {object} gladys SDK instance
   * @param {{ publishIntervalMs: number, now?: () => number,
   *   onEvent?: (key: string, data: object) => void }} options
   *   `onEvent` is called after every scene event fired (e.g. to refresh the
   *   widgets, whose status rows follow the same transitions).
   */
  constructor(gladys, { publishIntervalMs, now = Date.now, onEvent = () => {} }) {
    this.gladys = gladys;
    this.onEvent = onEvent;
    this.publishIntervalMs = publishIntervalMs;
    this.now = now;
    this.meters = new Map();
    this.lastPublishAt = 0;
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

  /**
   * The meter of a Gladys device, from its external_id (the value a
   * `"source": "devices"` select stores), or null.
   */
  findMeter(deviceExternalId) {
    for (const meter of this.meters.values()) {
      if (meter.ids(this.gladys).device === deviceExternalId) {
        return meter;
      }
    }
    return null;
  }

  /**
   * Re-send every value at the next frame (e.g. after a scan): the SDK's
   * memory of the accepted values is dropped, and the throttle too, so the
   * values do not wait up to `publish_interval` more.
   */
  forgetPublished() {
    this.gladys.forgetPublishedStates();
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
    for (const event of meter.detectEvents(now)) {
      this.fireSceneEvent(meter, event);
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

  // Fire-and-forget: a refused event (429, Gladys restarting) must not delay
  // the states, and the next transition fires its own event anyway.
  fireSceneEvent(meter, { key, data }) {
    const payload = { device: meter.ids(this.gladys).device, ...data };
    logger.info(`Scene event ${key} (meter ${meter.id})`);
    this.gladys
      .publishSceneEvent(key, payload)
      .catch((err) => logger.error(`publishSceneEvent ${key} failed`, err));
    this.onEvent(key, payload);
  }

  async publishStates(now = this.now()) {
    const states = [...this.meters.values()].flatMap((meter) => meter.buildStates(this.gladys));
    this.lastPublishAt = now;
    // Only what changed, or was not re-sent for HEARTBEAT_MS. A refused batch
    // is not remembered as sent: the next publication re-sends it.
    const { count } = await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    logger.debug(`${count} state(s) published`);
  }
}
