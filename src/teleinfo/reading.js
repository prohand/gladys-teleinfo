// -----------------------------------------------------------------------------
// The few values a person reasons about, read from the last frame of a meter:
// power, tariff period, total index, overload. Pure: the scene triggers, the
// scene action and the widget all start from here, so they always agree.
// -----------------------------------------------------------------------------

import { MODES } from './frame.js';

// Normalized tariff period: what a scene filters on. The raw label differs
// from one meter and one supplier to another ("HC..", "HCJB", "HEURE
// CREUSE", "HC BLEU"…), these four values do not.
export const PERIOD_TYPES = {
  OFF_PEAK: 'off_peak', // heures creuses
  PEAK: 'peak', // heures pleines, EJP pointe mobile
  BASE: 'base', // toutes heures, EJP heures normales
  OTHER: 'other',
};

// Historic labels holding an energy index, in Wh (single-phase or not, one
// tariff or several: the total is their sum).
const HISTORIC_INDEXES = [
  'BASE',
  'HCHC',
  'HCHP',
  'EJPHN',
  'EJPHPM',
  'BBRHCJB',
  'BBRHPJB',
  'BBRHCJW',
  'BBRHPJW',
  'BBRHCJR',
  'BBRHPJR',
];

function integer(groups, label) {
  const value = groups.get(label)?.value?.trim();
  return value && /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;
}

/** The tariff period as the meter labels it, trailing dots and spaces removed. */
export function periodLabel(value) {
  const label = value?.replace(/\.+$/, '').trim().replace(/\s+/g, ' ');
  return label || null;
}

/**
 * Normalized type of a period label.
 * @param {string | null} label
 */
export function periodTypeOf(label) {
  if (!label) {
    return null;
  }
  const upper = label.toUpperCase();
  if (upper.startsWith('HC') || upper.includes('CREUSE')) {
    return PERIOD_TYPES.OFF_PEAK;
  }
  if (upper.startsWith('HP') || upper.startsWith('PM') || upper.includes('PLEINE')) {
    return PERIOD_TYPES.PEAK;
  }
  if (upper.startsWith('TH') || upper.startsWith('HN') || upper.includes('BASE')) {
    return PERIOD_TYPES.BASE;
  }
  return PERIOD_TYPES.OTHER;
}

/**
 * Values of a frame.
 * @param {{ mode: string, groups: Map<string, { value: string }> }} frame
 * @returns {{ power: number | null, period: string | null, periodType: string | null,
 *   indexKwh: number | null, overload: boolean }}
 */
export function readingOf(frame) {
  const { groups } = frame;
  if (frame.mode === MODES.STANDARD) {
    const power = integer(groups, 'SINSTS');
    const reference = integer(groups, 'PREF'); // kVA
    const east = integer(groups, 'EAST');
    const period = periodLabel(groups.get('LTARF')?.value);
    return {
      power,
      period,
      periodType: periodTypeOf(period),
      indexKwh: east === null ? null : east / 1000,
      // Standard mode has no ADPS label: the overload is the apparent power
      // above the reference power.
      overload: power !== null && reference !== null && reference > 0 && power > reference * 1000,
    };
  }
  const indexes = HISTORIC_INDEXES.map((label) => integer(groups, label)).filter((v) => v !== null);
  const period = periodLabel(groups.get('PTEC')?.value);
  return {
    power: integer(groups, 'PAPP'),
    period,
    periodType: periodTypeOf(period),
    indexKwh: indexes.length === 0 ? null : indexes.reduce((sum, wh) => sum + wh, 0) / 1000,
    // ADPS is only sent while the subscribed current is exceeded.
    overload: (integer(groups, 'ADPS') ?? 0) > 0,
  };
}
