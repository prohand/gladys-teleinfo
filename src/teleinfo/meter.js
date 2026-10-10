// -----------------------------------------------------------------------------
// One electricity meter seen on the TIC line, turned into a Gladys device.
//
// The features are not fixed: a single-phase "Base" meter and a three-phase
// "Tempo" one do not send the same labels. The device is built from the
// labels the meter actually sent, and re-published when a new one shows up.
// -----------------------------------------------------------------------------

import { LABELS, METER_ID_LABEL, featureKey } from './labels.js';
import { MODES } from './frame.js';

const DEVICE_TYPE = 'meter';

/**
 * Serial number of the meter that sent a frame, or null when the frame does
 * not carry it.
 * @param {{ mode: string, groups: Map<string, { value: string }> }} frame
 */
export function meterIdOf(frame) {
  const id = frame.groups.get(METER_ID_LABEL[frame.mode])?.value?.trim();
  return id && /^[0-9A-Za-z]+$/.test(id) ? id : null;
}

export class Meter {
  /**
   * @param {string} id serial number (ADCO / ADSC)
   * @param {string} mode MODES.HISTORIC | MODES.STANDARD
   */
  constructor(id, mode) {
    this.id = id;
    this.mode = mode;
    this.labels = new Set(
      Object.entries(LABELS[mode])
        .filter(([, def]) => def.always)
        .map(([label]) => label),
    );
    this.lastFrame = null;
    this.lastFrameAt = 0;
  }

  /**
   * Record a frame of this meter.
   * @returns {boolean} true when it brought new labels (the device must be
   *   re-published).
   */
  update(frame, now = Date.now()) {
    const definitions = LABELS[this.mode];
    let added = false;
    for (const label of frame.groups.keys()) {
      if (definitions[label] && !this.labels.has(label)) {
        this.labels.add(label);
        added = true;
      }
    }
    this.lastFrame = frame;
    this.lastFrameAt = now;
    return added;
  }

  ids(gladys) {
    return gladys.externalIds(DEVICE_TYPE, this.id);
  }

  /** Discovery payload sent to Gladys. */
  buildDevice(gladys) {
    const ids = this.ids(gladys);
    const definitions = LABELS[this.mode];
    // Keep the TIC order of the table, not the arrival order.
    const labels = Object.keys(definitions).filter((label) => this.labels.has(label));
    return {
      name: `${this.mode === MODES.STANDARD ? 'Linky' : 'Compteur'} ${this.id}`,
      external_id: ids.device,
      features: labels.map((label) => {
        const def = definitions[label];
        const feature = {
          name: def.name,
          external_id: ids.feature(featureKey(label)),
          category: def.category,
          type: def.type,
          min: def.min,
          max: def.max,
          read_only: true,
          has_feedback: false,
          keep_history: !def.text,
        };
        if (def.unit !== undefined) {
          feature.unit = def.unit;
        }
        return feature;
      }),
    };
  }

  /**
   * States of the last frame, in the publishStates format. Labels the frame
   * does not carry are skipped, except those with an `absent` value.
   */
  buildStates(gladys) {
    if (!this.lastFrame) {
      return [];
    }
    const ids = this.ids(gladys);
    const definitions = LABELS[this.mode];
    const states = [];
    for (const label of this.labels) {
      const def = definitions[label];
      const group = this.lastFrame.groups.get(label);
      const value = group ? def.convert(group.value) : (def.absent ?? null);
      if (value === null) {
        continue;
      }
      const state = { device_feature_external_id: ids.feature(featureKey(label)) };
      if (def.text) {
        state.text = value;
      } else {
        state.state = value;
      }
      states.push(state);
    }
    return states;
  }

  /** Short human summary, for the action messages. */
  summary() {
    const groups = this.lastFrame?.groups;
    const power = groups?.get('SINSTS')?.value ?? groups?.get('PAPP')?.value;
    return {
      id: this.id,
      mode: this.mode,
      power: power === undefined ? null : Number.parseInt(power, 10),
    };
  }
}
