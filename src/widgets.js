// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys >= 5.1.0).
//
// The content is declarative, rendered by the core with its own theme. The
// power tile and the chart are bound to device features: they are LIVE, they
// follow the published states with no refresh. The status rows are computed
// here: the core caches them until `ttl_seconds`, and index.js nudges the
// widget on every tariff change, overload and connection change.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { MODES } from './teleinfo/frame.js';
import { PERIOD_TYPES } from './teleinfo/reading.js';
import { STALE_MS } from './scenes.js';

const logger = createLogger({ name: 'widgets' });

export const METER_WIDGET = 'meter';

const PERIOD_COLORS = {
  [PERIOD_TYPES.OFF_PEAK]: WIDGET_COLORS.SUCCESS,
  [PERIOD_TYPES.PEAK]: WIDGET_COLORS.WARNING,
  [PERIOD_TYPES.BASE]: WIDGET_COLORS.INFO,
  [PERIOD_TYPES.OTHER]: WIDGET_COLORS.NEUTRAL,
};

const WAITING = {
  ttl_seconds: 30,
  components: [
    {
      type: 'text',
      variant: 'body',
      text: {
        en: 'Waiting for the meter frames. Check the bridge with the "Test the connection" button of the integration.',
        fr: "En attente des trames du compteur. Vérifiez la passerelle avec le bouton « Tester la connexion » de l'intégration.",
      },
    },
  ],
};

/**
 * Content of the `meter` widget for one meter.
 * @param {object} gladys SDK instance (external ids)
 * @param {import('./teleinfo/meter.js').Meter | null} meter
 * @param {number} now
 */
export function meterWidgetContent(gladys, meter, now) {
  const reading = meter?.reading();
  if (!reading) {
    return WAITING;
  }
  const standard = meter.mode === MODES.STANDARD;
  const powerFeature = meter.featureId(gladys, standard ? 'SINSTS' : 'PAPP');
  const components = [];

  if (powerFeature) {
    components.push({
      type: 'value',
      label: { en: 'Power', fr: 'Puissance' },
      icon: 'zap',
      device_feature: powerFeature,
    });
  }
  if (reading.indexKwh !== null) {
    // Standard mode: EAST is the total, a live feature. Historic mode: the
    // total is the sum of the tariff indexes, computed here.
    const eastFeature = standard ? meter.featureId(gladys, 'EAST') : null;
    components.push(
      eastFeature
        ? {
            type: 'value',
            label: { en: 'Index', fr: 'Index' },
            icon: 'activity',
            device_feature: eastFeature,
          }
        : {
            type: 'value',
            label: { en: 'Index', fr: 'Index' },
            icon: 'activity',
            value: Math.floor(reading.indexKwh),
            unit: 'kWh',
          },
    );
  }
  if (powerFeature) {
    components.push({
      type: 'chart',
      chart_type: 'area',
      title: { en: 'Power, last 24 h', fr: 'Puissance, 24 h' },
      device_features: [powerFeature],
      interval: 'last-day',
    });
  }

  const receiving = now - meter.lastFrameAt <= STALE_MS;
  const overload = meter.overloadActive(now);
  const items = [];
  if (reading.period !== null) {
    items.push({
      label: { en: 'Tariff period', fr: 'Période tarifaire' },
      icon: 'clock',
      value: reading.period,
      color: PERIOD_COLORS[reading.periodType],
    });
  }
  items.push(
    {
      label: { en: 'Overload', fr: 'Dépassement' },
      icon: 'alert-triangle',
      value: overload ? { en: 'Yes', fr: 'Oui' } : { en: 'No', fr: 'Non' },
      color: overload ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
    {
      label: { en: 'Reception', fr: 'Réception' },
      icon: 'radio',
      value: receiving ? { en: 'OK', fr: 'OK' } : { en: 'Interrupted', fr: 'Interrompue' },
      color: receiving ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    },
    {
      label: { en: 'TIC mode', fr: 'Mode TIC' },
      icon: 'info',
      value: standard ? { en: 'Standard', fr: 'Standard' } : { en: 'Historic', fr: 'Historique' },
      color: WIDGET_COLORS.NEUTRAL,
    },
  );
  components.push({ type: 'status', items });

  // Safety net only: the transitions nudge the widget (see index.js).
  return { ttl_seconds: 300, components };
}

/**
 * Handlers of the manifest `widgets`, keyed by widget key.
 * @param {import('./teleinfo/hub.js').TeleinfoHub} hub
 */
export function createWidgets(hub) {
  return {
    [METER_WIDGET]: {
      async get(gladys, { settings }) {
        logger.debug(`onWidgetGet <- ${METER_WIDGET}`);
        return meterWidgetContent(gladys, hub.findMeter(settings?.device), hub.now());
      },
    },
  };
}
