// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the integration modules rely on:
//   - externalIds(type, platformId) -> { device, feature(key) }
//   - publishDiscoveredDevices      -> record calls so tests can assert them
//   - publishStates                 -> record calls so tests can assert them
// `failNext` makes the next publishStates call throw, to test the retries.
// -----------------------------------------------------------------------------

export function createFakeGladys() {
  const discovered = [];
  const stateCalls = [];

  return {
    discovered,
    stateCalls,
    failNext: false,

    externalIds(type, platformId) {
      const device = `ext:teleinfo:${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async publishDiscoveredDevices(devices) {
      discovered.push(devices);
    },

    async publishStates(states) {
      if (this.failNext) {
        this.failNext = false;
        throw new Error('Gladys unavailable');
      }
      stateCalls.push(states);
    },

    // Every state published so far, flattened.
    get published() {
      return stateCalls.flat();
    },
  };
}
