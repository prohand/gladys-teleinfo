// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys >= 5.1.0).
//
// The core relays an action with its RESOLVED fields and exposes the returned
// `outputs` to the following actions of the scene ({{<column>.<row>.<key>}}).
// A scene action is never a condition: a meter that cannot be read is an
// output (`available: false`), not a failure — the scene author gates on it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

export const READ_METER_ACTION = 'read_meter';

// A reading older than this is not "the meter now": the bridge or the meter
// stopped talking (a frame comes every 1 to 2 s).
export const STALE_MS = 60_000;

/**
 * Outputs of `read_meter`, only the keys declared in the manifest.
 * @param {import('./teleinfo/meter.js').Meter | null} meter
 */
export function readMeterOutputs(meter, now) {
  const reading = meter?.reading();
  if (!reading || now - meter.lastFrameAt > STALE_MS) {
    return { available: false };
  }
  const outputs = { available: true, overload: meter.overloadActive(now) };
  if (reading.power !== null) outputs.power = reading.power;
  if (reading.period !== null) outputs.period = reading.period;
  if (reading.periodType !== null) outputs.period_type = reading.periodType;
  if (reading.indexKwh !== null) outputs.index_kwh = reading.indexKwh;
  return outputs;
}

/**
 * Handlers of the manifest `scene_actions`, keyed by action key.
 * @param {import('./teleinfo/hub.js').TeleinfoHub} hub
 */
export function createSceneActions(hub) {
  return {
    async [READ_METER_ACTION](fields) {
      logger.info(`Scene action ${READ_METER_ACTION}`);
      return readMeterOutputs(hub.findMeter(fields.device), hub.now());
    },
  };
}
