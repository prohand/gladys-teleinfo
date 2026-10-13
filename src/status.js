// -----------------------------------------------------------------------------
// User-facing messages: the connection status shown in the Configuration
// screen, and the answer of the "Test the connection" action. In English,
// French, German and Spanish, like every text the user reads.
// -----------------------------------------------------------------------------

import { STATUS } from './transport/tcpSource.js';

// The whole "<mode> mode" phrase: the word order and the agreement differ
// between the languages.
const MODE_PHRASE = {
  historic: {
    en: 'historic mode',
    fr: 'mode historique',
    de: 'historischer Modus',
    es: 'modo histórico',
  },
  standard: { en: 'standard mode', fr: 'mode standard', de: 'Standardmodus', es: 'modo estándar' },
};

const TEST_TIMEOUT_MS = 15_000;

/**
 * Connection status for a reader status.
 * @param {string} status a STATUS value, or 'not_configured'
 * @returns {{ connected: boolean, message?: { en: string, fr: string, de: string, es: string } } | null}
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
          de: 'Tragen Sie die Adresse der ser2net-Bridge in der Konfiguration ein.',
          es: 'Introduzca la dirección de la pasarela ser2net en la configuración.',
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
          de: `Verbunden mit ${address}, aber kein gültiger TIC-Frame: Prüfen Sie die ser2net-Geschwindigkeit (1200 oder 9600 Baud, 7E1) und die Verkabelung des Zählers.`,
          es: `Conectado a ${address}, pero sin ninguna trama TIC válida: compruebe la velocidad de ser2net (1200 o 9600 baudios, 7E1) y el cableado del contador.`,
        },
      };
    case STATUS.ERROR:
      return {
        connected: false,
        message: {
          en: `Cannot reach ${address} (${detail ?? 'error'}), retrying.`,
          fr: `Impossible de joindre ${address} (${detail ?? 'erreur'}), nouvel essai en cours.`,
          de: `Keine Verbindung zu ${address} (${detail ?? 'Fehler'}), neuer Versuch läuft.`,
          es: `No se puede conectar con ${address} (${detail ?? 'error'}), reintentando.`,
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
      de: `Kein TIC-Frame in ${timeoutMs / 1000} s empfangen. Prüfen Sie die Adresse der Bridge, die ser2net-Geschwindigkeit (1200 oder 9600 Baud, 7E1) und die Verkabelung des Zählers.`,
      es: `No se ha recibido ninguna trama TIC en ${timeoutMs / 1000} s. Compruebe la dirección de la pasarela, la velocidad de ser2net (1200 o 9600 baudios, 7E1) y el cableado del contador.`,
    };
  }
  const { id, mode, power } = meter.summary();
  const powerText = power === null ? '' : `, ${power} VA`;
  const phrase = MODE_PHRASE[mode];
  return {
    en: `Meter ${id} found (${phrase.en}${powerText}).`,
    fr: `Compteur ${id} trouvé (${phrase.fr}${powerText}).`,
    de: `Zähler ${id} gefunden (${phrase.de}${powerText}).`,
    es: `Contador ${id} encontrado (${phrase.es}${powerText}).`,
  };
}
