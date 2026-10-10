// -----------------------------------------------------------------------------
// Entry point of the Teleinfo integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the TIC reader. It holds no protocol
// logic (see src/teleinfo/) and no socket logic (see src/transport/). It:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. starts the TCP reader once connected, and restarts it on config change.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { TeleinfoHub } from './src/teleinfo/hub.js';
import { TcpSource } from './src/transport/tcpSource.js';
import { connectionStatusOf, testConnection } from './src/status.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();
const hub = new TeleinfoHub(gladys, { publishIntervalMs: config.publish_interval * 1000 });
let source = null;

// (Re)start the TCP reader with the current config.
function restartSource() {
  source?.stop();
  source = null;
  hub.setPublishInterval(config.publish_interval * 1000);
  if (!config.host) {
    reportStatus(connectionStatusOf('not_configured'));
    return;
  }
  source = new TcpSource({
    host: config.host,
    port: config.port,
    onFrame: (frame) => {
      hub.handleFrame(frame);
    },
    onStatus: (status, detail) => reportStatus(connectionStatusOf(status, { config, detail })),
  });
  source.start();
}

function reportStatus(status) {
  if (!status) {
    return;
  }
  gladys
    .setConnectionStatus(status.connected, status.message)
    .catch((err) => logger.error('setConnectionStatus failed', err));
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the meters seen so far');
  await gladys.publishDiscoveredDevices(hub.buildDevices());
  // A device just created from this list has no value yet: re-send them all.
  hub.forgetPublished();
});

// --- Device created from the Discovery screen --------------------------------
// The core silently drops the states of a feature that does not exist yet, and
// only changed values are re-sent: without this, the new device would wait up
// to the 10-minute heartbeat for its first values.
gladys.onDeviceCreated(async (device) => {
  logger.info(`onDeviceCreated -> ${device.external_id}, re-sending every value`);
  hub.forgetPublished();
});

// --- No command: every TIC value is read-only --------------------------------
gladys.onSetValue(async (device) => {
  throw new Error(`${device.external_id} is read-only`);
});

// --- Manifest action: "Test the connection" ----------------------------------
gladys.onAction('test_connection', async () => {
  logger.info('Action test_connection');
  if (!config.host) {
    return connectionStatusOf('not_configured').message;
  }
  // Restart the reader if it is not receiving: the user may just have fixed
  // the bridge, no need to wait for the next retry.
  if (source?.status !== 'connected') {
    restartSource();
  }
  return testConnection(hub);
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  restartSource();
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK itself logs the WebSocket lifecycle under the `gladys-sdk` name.
// The TCP reader keeps running while Gladys is unreachable: publications fail
// and are logged, the next ones go through once Gladys is back.
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    // Re-publish the meters already known (reconnection after a Gladys restart).
    if (hub.meters.size > 0) {
      await gladys.publishDiscoveredDevices(hub.buildDevices());
      hub.forgetPublished();
    }
    restartSource();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  source?.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Teleinfo integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
