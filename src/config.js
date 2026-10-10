// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  host: '', // address of the serial-to-TCP bridge (ser2net…)
  port: 2000,
  publish_interval: 60, // seconds between two state publications
};

const PUBLISH_INTERVAL_MIN = 15;
const PUBLISH_INTERVAL_MAX = 3600;

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && value !== '' && value !== null ? number : fallback;
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const port = Math.trunc(toNumber(raw.port, DEFAULT_CONFIG.port));
  const interval = toNumber(raw.publish_interval, DEFAULT_CONFIG.publish_interval);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // Config may arrive as strings from a form.
    host: String(raw.host ?? DEFAULT_CONFIG.host).trim(),
    port: port >= 1 && port <= 65535 ? port : DEFAULT_CONFIG.port,
    publish_interval: Math.min(Math.max(interval, PUBLISH_INTERVAL_MIN), PUBLISH_INTERVAL_MAX),
  };
}
