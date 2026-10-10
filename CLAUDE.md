# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An **external integration for Gladys Assistant**, built on the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js) and
`@gladysassistant/integration-sdk`. It runs as its own Docker container, talks to Gladys over a
WebSocket the SDK manages, and exposes the Enedis **TIC** (télé-information client) of a Linky or
electronic meter as a device. First supported hardware: the LiXee TIC DIN-rail module (USB).

It is **not** part of the Gladys core: it can only publish devices/states and read its own
configuration. Anything the core UI does with that data is outside this repo's control.

## Commands

```bash
npm test                 # node --test (built-in runner, no framework)
node --test test/frame.test.js                # a single file
node --test --test-name-pattern "historic"    # tests by name
npm run lint             # ESLint
npm run format           # Prettier, write
npm run format:check     # Prettier, check — the CI gate
```

All three gates run on every push and PR (`.github/workflows/ci.yml`), on Node 22 and 24. Pull
requests also build the Docker image and run the store admission checks. Tests never open a
socket: `TcpSource` takes an injected `createConnection`, and frames are built by
`test/helpers/frames.js`.

Before tagging a release, check the manifest against the real store rules:

```bash
npx github:GladysAssistant/integration-store .
```

Two findings are expected before a release exists: the `docker_image` tag is not on ghcr.io yet,
and `cover_image` 404s until the branch is pushed. For the same reason the CI `store` job fails on
pull requests until the first release is published.

Run locally against a real Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="teleinfo" LOG_LEVEL=debug npm start
```

No meter at hand: replay a raw capture (`nc <bridge> 2000 > capture.bin`) with
`socat TCP-LISTEN:2000,reuseaddr,fork FILE:capture.bin` and point the config at it.

## Architecture

`index.js` is pure wiring — SDK handlers, config lifecycle, the TCP reader's lifecycle — and holds
no protocol logic. Everything else lives under `src/`:

- **`src/transport/tcpSource.js`** — the TCP client to the serial bridge: reconnection with a
  5 s → 60 s backoff, and a 30 s watchdog that reports "connected but no valid frame" (wrong
  speed, wrong port, meter not wired). It only moves bytes; the serial settings are ser2net's.
- **`src/teleinfo/frame.js`** — the pure TIC decoder: STX/ETX frames, LF/CR groups, checksums,
  7E1 parity bit stripped (`& 0x7F`). Historic vs standard mode is told by the separator (space
  vs tab), never configured.
- **`src/teleinfo/labels.js`** — TIC label → Gladys feature (name, category, type, unit, min,
  max, converter). The categories, types and units copy the core's ZLinky_TIC mapping
  (`server/services/zigbee2mqtt/exposes/numericType.js`), so a meter looks the same whether it is
  read here or over Zigbee.
- **`src/teleinfo/meter.js`** — one meter: its device payload, built from the labels it has
  actually sent, and its states from its last frame.
- **`src/teleinfo/hub.js`** — the meters registry and the throttled publication.
- **`src/teleinfo/reading.js`** — pure: power, tariff period (+ normalized type), total index
  and overload of a frame. The scene triggers, the scene action and the widget all read it.
- **`src/sceneTriggers.js`** — the scene trigger keys; `Meter.detectEvents()` decides when they
  fire, `TeleinfoHub.fireSceneEvent()` sends them.
- **`src/scenes.js`** — the `read_meter` scene action (`createSceneActions(hub)`).
- **`src/widgets.js`** — the `meter` dashboard widget (`createWidgets(hub)`).
- **`src/status.js`** — the bilingual connection status and the "Test the connection" message.
- **`src/config.js`** — defaults and normalization.

### Why TCP and not the USB port

The integration container cannot open a serial port: the manifest only grants the `coral-usb`,
`coral-pcie`, `gpu` and `video` hardware classes (store `schemas/manifest.schema.json`), and only
to sub-containers. The LiXee module is therefore shared on the network by **ser2net** (raw TCP,
`1200e71` or `9600e71`) and read here as a byte stream. ser2net accepts one client at a time:
`kickolduser` in the documented config lets the integration take the port back from a forgotten
`nc`.

### The device follows the meter, not the configuration

- The device `external_id` is `gladys.externalIds('meter', <ADCO|ADSC>)`: the serial number the
  meter sends in every frame. The feature key is the lower-cased TIC label (`smaxsn-1`…).
  **Both are forever**: Gladys keys the device history, dashboards and scenes on them.
- Features are created only for the labels the meter sends (single vs three phase, Base vs HC vs
  Tempo…). A new label re-publishes the device; a mode switch (historic ↔ standard) keeps the
  same serial number, hence the same device, with other features.
- `ADPS` (historic overload warning) is only sent while the overload lasts: it is declared from
  the first frame (`always`) and published as `0` when absent (`absent`).
- Labels without a Gladys feature type (`DATE`, `STGE`, `NGTF`, `OPTARIF`, `HHPHC`, `MOTDETAT`…)
  are decoded and ignored.

### Publication pace

A meter sends a frame every 1 to 2 s; `POST /state` is rate-limited to 300 states per minute per
integration, and every state is a history row. So the hub publishes at most every
`publish_interval` seconds (15–3600, default 60), only the values that changed, plus every value
every 10 minutes (heartbeat) and right after `onDeviceCreated` / a scan (`forgetPublished()`).
Frames arriving while a request is in flight are recorded, the next frame publishes them.

### Scenes and widgets (Gladys >= 5.1.0)

- Every trigger, action and widget picks the meter through a `device` field
  (`"source": "devices"`). The core compares a trigger field with the event value of the
  **same key**, so the hub always puts the device external_id under `device`.
- One event per transition, never per frame (300 events/min cap): the first frame only sets the
  baseline; an overload ends after `OVERLOAD_END_MS` (60 s) without one, so a flickering ADPS
  fires once.
- `period_type` (`off_peak` / `peak` / `base` / `other`) is what a scene filters on: the raw
  label differs between meters and suppliers. The raw label stays available as `period`.
- `read_meter` never throws for a silent meter: it answers `available: false` (a scene action
  is never a condition). A reading older than `STALE_MS` (60 s) is not "the meter now".
- The widget's power tile and chart are bound to device features (live). Its status rows are
  computed and cached by the core: `index.js` nudges it (`requestWidgetRefresh`) on every scene
  event, reader status change and (re)connection.

## Gladys core constraints that are not obvious

The core sources are worth cloning when in doubt (`GladysAssistant/Gladys`, public, read-only
clone is enough).

- **Every feature needs an explicit numeric `min` and `max`**, text features included —
  `t_device_feature.min/max` are `NOT NULL` with no default. Publishing passes, then the user's
  "add device" click fails. `test/meter.test.js` pins it for every label.
- **The core silently drops states for a feature that does not exist yet**
  (`externalIntegration.saveStates.js`). States published before the user adds the device go
  nowhere, hence `onDeviceCreated` → `forgetPublished()`.
- **`poll_frequency` is an enum in milliseconds capped at one minute.** The TIC is pushed by the
  meter, so no device declares polling at all.
- **A `number` config field is locale-dependent** (`<input type="number">`): fine for the port
  and the interval, which are integers; a decimal the user types belongs in a `string` field.
- **Energy indexes are sent in Wh and stored in kWh** (`/ 1000`), like the core ZLinky mapping.
- **Text states go through `{ text }`**, not `{ state }` (SDK `publishState` / `publishStates`).

## Manifest gotchas

`gladys-assistant-integration.json` is validated by the store schema, not by anything in this repo.
The traps, each pinned by a test in `test/manifest.test.js`:

- the free-text field type is **`string`**, not `text`;
- `label`, `description` and `placeholder` are multi-language **objects**, never bare strings;
- the catalog `description.en` / `.fr` hold **10 to 100 characters**;
- **`categories` costs a `gladys_version` floor of `>=4.86.0`**; ours is `["energy"]`;
- `transports` is `["local"]` (LAN only): a single channel, so no "Prefer the local
  connection" toggle and no per-device `publishTransports` badge;
- `widgets`, `scene_triggers`, `scene_actions` cost a floor of **`>=5.1.0`** (ours); a widget
  label is 3-30 characters, its description ≤ 100; a trigger field cannot be `boolean`;
- the trigger keys equal `SCENE_TRIGGERS`, the action and widget keys equal the factories' keys;
- every manifest `actions` key has a `gladys.onAction(...)` in `index.js`, and vice versa;
- the `config_schema` defaults equal `DEFAULT_CONFIG`.

## Releasing

**Actions → Release → Run workflow** (`patch`/`minor`/`major`). It bumps `package.json` and the
manifest `version` + `docker_image` tag together, reformats both with Prettier, moves the
`## [Unreleased]` section of `CHANGELOG.md` under the version
(`.github/scripts/changelog-release.mjs`), commits, tags `vX.Y.Z`, calls `build.yml` for the
multi-arch image and `github-release.yml` for the GitHub Release (notes = the version's changelog
section). Never edit the versions by hand.

Every user-visible change adds a line under `## [Unreleased]` (`### Added`, `Changed`, `Fixed`,
`Removed`, `Security`). Never write a version heading yourself.

Config-schema and feature changes only reach users through a release. A feature-set change also
requires the user to update the already-created device from the Discovery screen.

## Conventions

Comments explain **why**, not what — particularly the core constraints above, which look arbitrary
without their reason. Keep the protocol pure (`frame.js`, `labels.js`, `meter.js` never touch the
network) so it stays testable offline. Feature names are French, like the TIC and the core
mapping; every user-facing message (status, action answer, manifest texts, docs) is an `en`/`fr`
pair, and `docs/en.md` / `docs/fr.md` stay in sync.

The container rootfs is read-only: write only under `/data`. The meter serial number and the
bridge address may appear in logs (they are needed to diagnose); the raw frames never do.
