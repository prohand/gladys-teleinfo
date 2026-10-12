// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the integration modules rely on:
//   - externalIds(type, platformId) -> { device, feature(key) }
//   - publishDiscoveredDevices      -> record calls so tests can assert them
//   - publishStates                 -> record calls so tests can assert them
//   - publishChangedStates / forgetPublishedStates
//                                   -> the SDK's dedupe (0.15.0), on `now`
//   - publishSceneEvent             -> record calls so tests can assert them
//   - requestWidgetRefresh          -> record calls so tests can assert them
// `failNext` makes the next publishStates call throw, to test the retries.
// -----------------------------------------------------------------------------

/**
 * @param {object} [options]
 * @param {() => number} [options.now] the clock of the heartbeat of
 *   publishChangedStates: the SDK reads Date.now(), the hub tests hand theirs
 */
export function createFakeGladys({ now = () => Date.now() } = {}) {
  const discovered = [];
  // feature external_id -> { state, text, at }: the last value Gladys accepted.
  const accepted = new Map();
  const stateCalls = [];
  const sceneEvents = [];
  const widgetRefreshes = [];

  return {
    discovered,
    stateCalls,
    sceneEvents,
    widgetRefreshes,
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

    // Same contract as the SDK: an entry equal (state AND text) to the last
    // accepted value of its feature is skipped unless older than `heartbeat`,
    // at most 100 states per request, a refused batch is forgotten.
    async publishChangedStates(states, { heartbeat } = {}) {
      const time = now();
      const previous = new Map();
      const changed = states.filter(({ device_feature_external_id: id, state, text }) => {
        const last = previous.has(id) ? previous.get(id) : accepted.get(id);
        previous.set(id, { state, text, at: time });
        return (
          last === undefined ||
          last.state !== state ||
          last.text !== text ||
          (heartbeat !== undefined && time - last.at >= heartbeat)
        );
      });
      for (let start = 0; start < changed.length; start += 100) {
        const batch = changed.slice(start, start + 100);
        batch.forEach(({ device_feature_external_id: id, state, text }) =>
          accepted.set(id, { state, text, at: time }),
        );
        try {
          await this.publishStates(batch);
        } catch (err) {
          batch.forEach(({ device_feature_external_id: id }) => accepted.delete(id));
          throw err;
        }
      }
      return { success: true, count: changed.length };
    },

    forgetPublishedStates(externalId) {
      if (externalId === undefined) {
        accepted.clear();
        return;
      }
      for (const id of [...accepted.keys()]) {
        if (id === externalId || id.startsWith(`${externalId}:`)) {
          accepted.delete(id);
        }
      }
    },

    async publishSceneEvent(key, data = {}) {
      sceneEvents.push({ key, data });
      return { success: true };
    },

    // Fire-and-forget in the SDK too: synchronous, resolves nothing.
    requestWidgetRefresh(key) {
      widgetRefreshes.push(key);
    },

    // Every state published so far, flattened.
    get published() {
      return stateCalls.flat();
    },
  };
}
