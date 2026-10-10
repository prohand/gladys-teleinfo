// -----------------------------------------------------------------------------
// User-facing messages: the connection status shown in the Configuration
// screen, and the answer of the "Test the connection" action. Bilingual, like
// every text the user reads.
// -----------------------------------------------------------------------------

import { STATUS } from './transport/tcpSource.js';

const MODE_LABEL = {
  historic: { en: 'historic', fr: 'historique' },
  standard: { en: 'standard', fr: 'standard' },
};

const TEST_TIMEOUT_MS = 15_000;

/**
 * Connection status for a reader status.
 * @param {string} status a STATUS value, or 'not_configured'
 * @returns {{ connected: boolean, message?: { en: string, fr: string } } | null}
 *   null when nothing needs to be reported (transient state).
 */
export function connectionStatusOf(status, { config, detail } = {}) {
  const address = config ? `${config.host}:${config.port}` : '';
  switch (status) {
    case 'not_configured':
      return {
        connected: false,
        message: {
          en: 'Enter the address of the ser2net bridge in the configuration.',
          fr: "Indiquez l'adresse de la passerelle ser2net dans la configuration.",
        },
      };
    case STATUS.CONNECTED:
      return { connected: true };
    case STATUS.NO_DATA:
      return {
        connected: false,
        message: {
          en: `Connected to ${address}, but no valid TIC frame: check the ser2net speed (1200 or 9600 bauds, 7E1) and the meter wiring.`,
          fr: `Connecté à ${address}, mais aucune trame TIC valide : vérifiez la vitesse ser2net (1200 ou 9600 bauds, 7E1) et le câblage du compteur.`,
        },
      };
    case STATUS.ERROR:
      return {
        connected: false,
        message: {
          en: `Cannot reach ${address} (${detail ?? 'error'}), retrying.`,
          fr: `Impossible de joindre ${address} (${detail ?? 'erreur'}), nouvel essai en cours.`,
        },
      };
    default:
      return null;
  }
}

/**
 * Wait for a frame and describe it, for the "Test the connection" action.
 * @param {import('./teleinfo/hub.js').TeleinfoHub} hub
 */
export async function testConnection(hub, timeoutMs = TEST_TIMEOUT_MS) {
  const meter = await hub.waitForFrame(timeoutMs);
  if (!meter) {
    return {
      en: `No TIC frame received in ${timeoutMs / 1000} s. Check the bridge address, the ser2net speed (1200 or 9600 bauds, 7E1) and the meter wiring.`,
      fr: `Aucune trame TIC reçue en ${timeoutMs / 1000} s. Vérifiez l'adresse de la passerelle, la vitesse ser2net (1200 ou 9600 bauds, 7E1) et le câblage du compteur.`,
    };
  }
  const { id, mode, power } = meter.summary();
  const powerText = power === null ? '' : `, ${power} VA`;
  return {
    en: `Meter ${id} found (${MODE_LABEL[mode].en} mode${powerText}).`,
    fr: `Compteur ${id} trouvé (mode ${MODE_LABEL[mode].fr}${powerText}).`,
  };
}
