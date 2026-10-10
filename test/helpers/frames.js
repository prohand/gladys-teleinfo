// -----------------------------------------------------------------------------
// Builders of raw TIC frames for the tests, checksums included.
// -----------------------------------------------------------------------------

import { checksum } from '../../src/teleinfo/frame.js';

/** Historic group: LF label SP data SP checksum CR. */
export function historicGroup(label, value) {
  const body = `${label} ${value}`;
  return `\n${body} ${checksum(body)}\r`;
}

/** Standard group: LF label HT [timestamp HT] data HT checksum CR. */
export function standardGroup(label, value, timestamp) {
  const body = timestamp ? `${label}\t${timestamp}\t${value}\t` : `${label}\t${value}\t`;
  return `\n${body}${checksum(body)}\r`;
}

/** Wrap groups in STX / ETX, as bytes. */
export function frameBytes(groups) {
  return Buffer.from(`\x02${groups.join('')}\x03`, 'latin1');
}

export function historicFrame(entries) {
  return frameBytes(Object.entries(entries).map(([label, value]) => historicGroup(label, value)));
}

export function standardFrame(entries) {
  return frameBytes(
    Object.entries(entries).map(([label, value]) =>
      Array.isArray(value) ? standardGroup(label, value[1], value[0]) : standardGroup(label, value),
    ),
  );
}

// A single-phase "Heures Creuses" meter in historic mode.
export const HISTORIC_HC = {
  ADCO: '021528603314',
  OPTARIF: 'HC..',
  ISOUSC: '45',
  HCHC: '012345678',
  HCHP: '023456789',
  PTEC: 'HP..',
  IINST: '002',
  IMAX: '090',
  PAPP: '00420',
  HHPHC: 'A',
  MOTDETAT: '000000',
};

// A single-phase Linky in standard mode.
export const STANDARD_LINKY = {
  ADSC: '041876097413',
  VTIC: '02',
  DATE: ['H081225223518', ''],
  NGTF: 'H PLEINE/CREUSE ',
  LTARF: '  HEURE  PLEINE  ',
  EAST: '000002787211',
  EASF01: '000001187244',
  EASF02: '000001599967',
  IRMS1: '003',
  URMS1: '232',
  PREF: '09',
  PCOUP: '09',
  SINSTS: '00718',
  SMAXSN: ['H081225071419', '03018'],
  'SMAXSN-1': ['H081224195605', '04256'],
  CCASN: ['H081225223000', '00698'],
  UMOY1: ['H081225223000', '231'],
  STGE: '003A0001',
  NTARF: '02',
};
