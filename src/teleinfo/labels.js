// -----------------------------------------------------------------------------
// TIC labels -> Gladys device features.
//
// Categories, types and units mirror the ones the Gladys core already uses
// for the LiXee ZLinky_TIC through Zigbee2MQTT, so a meter read here looks
// the same in Gladys as one read over Zigbee. Feature names are in French,
// like the TIC itself and the core mapping.
//
// The feature key is the lower-cased label: it ends up in the feature
// external_id, so a published key is never renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { MODES } from './frame.js';
import { periodLabel } from './reading.js';

// Value converters: the TIC sends digits, with leading zeros.
const toInteger = (value) => {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  return Number.parseInt(value, 10);
};
// Energy indexes are sent in Wh, Gladys stores kWh.
const whToKwh = (value) => {
  const wh = toInteger(value);
  return wh === null ? null : wh / 1000;
};
// Same cleaning as the scene triggers, so the feature and the event agree.
const toText = periodLabel;

const ENERGY_INDEX_MAX = 1_000_000_000; // kWh, a 9-digit Wh index fits easily

function index(name, category, type) {
  return {
    name,
    category,
    type,
    unit: UNITS.KILOWATT_HOUR,
    min: 0,
    max: ENERGY_INDEX_MAX,
    convert: whToKwh,
  };
}

function measure(name, category, type, unit, max) {
  return { name, category, type, unit, min: 0, max, convert: toInteger };
}

// The core stores min/max as NOT NULL with no default: a feature without them
// is published fine, then the user's "add device" click fails. Text included.
function text(name) {
  return {
    name,
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.TEXT,
    min: 0,
    max: 0,
    convert: toText,
    text: true,
  };
}

const ES = CATEGORIES.ENERGY_SENSOR;
const TI = CATEGORIES.TELEINFORMATION;

// --- Historic mode (Linky in historic mode + older electronic meters) --------
const HISTORIC = {
  ISOUSC: measure('Intensité souscrite', ES, TYPES.ENERGY_SENSOR.CURRENT, UNITS.AMPERE, 200),
  BASE: index('Index Base', ES, TYPES.ENERGY_SENSOR.INDEX),
  HCHC: index('Index Heures Creuses', ES, TYPES.ENERGY_SENSOR.INDEX),
  HCHP: index('Index Heures Pleines', ES, TYPES.ENERGY_SENSOR.INDEX),
  EJPHN: index('Index EJP Heures Normales', ES, TYPES.ENERGY_SENSOR.INDEX),
  EJPHPM: index('Index EJP Heures de Pointe Mobile', ES, TYPES.ENERGY_SENSOR.INDEX),
  BBRHCJB: index('Index Heures Creuses Jours Bleus', ES, TYPES.ENERGY_SENSOR.INDEX),
  BBRHPJB: index('Index Heures Pleines Jours Bleus', ES, TYPES.ENERGY_SENSOR.INDEX),
  BBRHCJW: index('Index Heures Creuses Jours Blancs', ES, TYPES.ENERGY_SENSOR.INDEX),
  BBRHPJW: index('Index Heures Pleines Jours Blancs', ES, TYPES.ENERGY_SENSOR.INDEX),
  BBRHCJR: index('Index Heures Creuses Jours Rouges', ES, TYPES.ENERGY_SENSOR.INDEX),
  BBRHPJR: index('Index Heures Pleines Jours Rouges', ES, TYPES.ENERGY_SENSOR.INDEX),
  PTEC: text('Période tarifaire en cours'),
  IINST: measure('Intensité instantanée', ES, TYPES.ENERGY_SENSOR.CURRENT, UNITS.AMPERE, 200),
  IINST1: measure(
    'Intensité instantanée Phase 1',
    ES,
    TYPES.ENERGY_SENSOR.CURRENT,
    UNITS.AMPERE,
    200,
  ),
  IINST2: measure(
    'Intensité instantanée Phase 2',
    ES,
    TYPES.ENERGY_SENSOR.CURRENT,
    UNITS.AMPERE,
    200,
  ),
  IINST3: measure(
    'Intensité instantanée Phase 3',
    ES,
    TYPES.ENERGY_SENSOR.CURRENT,
    UNITS.AMPERE,
    200,
  ),
  IMAX: measure('Intensité maximale', TI, TYPES.TELEINFORMATION.IMAX, UNITS.AMPERE, 200),
  IMAX1: measure('Intensité maximale Phase 1', TI, TYPES.TELEINFORMATION.IMAX1, UNITS.AMPERE, 200),
  IMAX2: measure('Intensité maximale Phase 2', TI, TYPES.TELEINFORMATION.IMAX2, UNITS.AMPERE, 200),
  IMAX3: measure('Intensité maximale Phase 3', TI, TYPES.TELEINFORMATION.IMAX3, UNITS.AMPERE, 200),
  // Only sent while the subscribed power is exceeded: 0 the rest of the time.
  ADPS: {
    ...measure(
      'Avertissement de dépassement de puissance souscrite',
      TI,
      TYPES.TELEINFORMATION.ADPS,
      UNITS.AMPERE,
      200,
    ),
    always: true,
    absent: 0,
  },
  PAPP: measure('Puissance apparente', ES, TYPES.ENERGY_SENSOR.POWER, UNITS.VOLT_AMPERE, 100_000),
};

// --- Standard mode (Linky only) ---------------------------------------------
const va = (name, type) => measure(name, TI, type, UNITS.VOLT_AMPERE, 100_000);
const kva = (name, type) => measure(name, TI, type, UNITS.KILOVOLT_AMPERE, 100);
const volt = (name, type) => measure(name, TI, type, UNITS.VOLT, 500);
const ampere = (name, type) => measure(name, TI, type, UNITS.AMPERE, 200);
const watt = (name, type) => measure(name, TI, type, UNITS.WATT, 100_000);
const varh = (name, type) => measure(name, TI, type, UNITS.VOLT_AMPERE_REACTIVE, ENERGY_INDEX_MAX);
const T = TYPES.TELEINFORMATION;

const STANDARD = {
  VTIC: measure('Version de la TIC', TI, T.VTIC, undefined, 99),
  LTARF: text('Libellé tarif fournisseur en cours'),
  NTARF: measure("Numéro de l'index tarifaire en cours", TI, T.NTARF, undefined, 10),
  EAST: index('Energie active soutirée totale', TI, T.EAST),
  EASF01: index('Energie active soutirée Fournisseur Index 01', TI, T.EASF01),
  EASF02: index('Energie active soutirée Fournisseur Index 02', TI, T.EASF02),
  EASF03: index('Energie active soutirée Fournisseur Index 03', TI, T.EASF03),
  EASF04: index('Energie active soutirée Fournisseur Index 04', TI, T.EASF04),
  EASF05: index('Energie active soutirée Fournisseur Index 05', TI, T.EASF05),
  EASF06: index('Energie active soutirée Fournisseur Index 06', TI, T.EASF06),
  EASF07: index('Energie active soutirée Fournisseur Index 07', TI, T.EASF07),
  EASF08: index('Energie active soutirée Fournisseur Index 08', TI, T.EASF08),
  EASF09: index('Energie active soutirée Fournisseur Index 09', TI, T.EASF09),
  EASF10: index('Energie active soutirée Fournisseur Index 10', TI, T.EASF10),
  EASD01: index('Energie active soutirée Distributeur Index 01', TI, T.EASD01),
  EASD02: index('Energie active soutirée Distributeur Index 02', TI, T.EASD02),
  EASD03: index('Energie active soutirée Distributeur Index 03', TI, T.EASD03),
  EASD04: index('Energie active soutirée Distributeur Index 04', TI, T.EASD04),
  EAIT: index('Energie active injectée totale', TI, T.EAIT),
  ERQ1: varh('Energie réactive Q1 totale', T.ERQ1),
  ERQ2: varh('Energie réactive Q2 totale', T.ERQ2),
  ERQ3: varh('Energie réactive Q3 totale', T.ERQ3),
  ERQ4: varh('Energie réactive Q4 totale', T.ERQ4),
  IRMS1: ampere('Courant efficace Phase 1', T.IRMS1),
  IRMS2: ampere('Courant efficace Phase 2', T.IRMS2),
  IRMS3: ampere('Courant efficace Phase 3', T.IRMS3),
  URMS1: volt('Tension efficace Phase 1', T.URMS1),
  URMS2: volt('Tension efficace Phase 2', T.URMS2),
  URMS3: volt('Tension efficace Phase 3', T.URMS3),
  PREF: kva('Puissance apparente de référence', T.PREF),
  PCOUP: kva('Puissance apparente de coupure', T.PCOUP),
  SINSTS: va('Puissance apparente instantanée soutirée', T.SINSTS),
  SINSTS1: va('Puissance apparente instantanée soutirée Phase 1', T.SINSTS1),
  SINSTS2: va('Puissance apparente instantanée soutirée Phase 2', T.SINSTS2),
  SINSTS3: va('Puissance apparente instantanée soutirée Phase 3', T.SINSTS3),
  SMAXSN: va('Puissance apparente maximale soutirée n', T.SMAXN),
  SMAXSN1: va('Puissance apparente maximale soutirée n Phase 1', T.SMAXN1),
  SMAXSN2: va('Puissance apparente maximale soutirée n Phase 2', T.SMAXN2),
  SMAXSN3: va('Puissance apparente maximale soutirée n Phase 3', T.SMAXN3),
  'SMAXSN-1': va('Puissance apparente maximale soutirée n-1', T.SMAXN_1),
  'SMAXSN1-1': va('Puissance apparente maximale soutirée n-1 Phase 1', T.SMAXN1_1),
  'SMAXSN2-1': va('Puissance apparente maximale soutirée n-1 Phase 2', T.SMAXN2_1),
  'SMAXSN3-1': va('Puissance apparente maximale soutirée n-1 Phase 3', T.SMAXN3_1),
  SINSTI: va('Puissance apparente instantanée injectée', T.SINSTI),
  SMAXIN: va('Puissance apparente maximale injectée n', T.SMAXIN),
  'SMAXIN-1': va('Puissance apparente maximale injectée n-1', T.SMAXIN_1),
  CCASN: watt('Point n de la courbe de charge active soutirée', T.CCASN),
  'CCASN-1': watt('Point n-1 de la courbe de charge active soutirée', T.CCASN_1),
  CCAIN: watt('Point n de la courbe de charge active injectée', T.CCAIN),
  'CCAIN-1': watt('Point n-1 de la courbe de charge active injectée', T.CCAIN_1),
  UMOY1: volt('Tension moyenne Phase 1', T.UMOY1),
  UMOY2: volt('Tension moyenne Phase 2', T.UMOY2),
  UMOY3: volt('Tension moyenne Phase 3', T.UMOY3),
};

export const LABELS = {
  [MODES.HISTORIC]: HISTORIC,
  [MODES.STANDARD]: STANDARD,
};

// Label carrying the meter serial number, used as the device platform id.
export const METER_ID_LABEL = {
  [MODES.HISTORIC]: 'ADCO',
  [MODES.STANDARD]: 'ADSC',
};

/**
 * Feature key of a label, used in the feature external_id.
 * @param {string} label
 */
export function featureKey(label) {
  return label.toLowerCase();
}
