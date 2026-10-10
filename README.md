# Teleinfo — Gladys Assistant integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
reads the **Enedis TIC** (télé-information client) of a Linky or electronic
meter and publishes it as a Gladys device.

First supported hardware: the
[LiXee TIC DIN-rail module](https://www.domadoo.fr/fr/interface-domotique/8827-lixee-compteur-tic-sur-rail-din-linky-ou-classique.html)
(USB, historic or standard mode).

Built from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js)
with [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [`docs/fr.md`](docs/fr.md) / [`docs/en.md`](docs/en.md).

## How it works

```
Meter (I1/I2) ──> LiXee TIC (USB) ──> ser2net (raw TCP) ──> this integration ──> Gladys
```

Gladys integrations run in a sandboxed container that **cannot open a USB
serial port** (the manifest only grants the `coral-usb`, `coral-pcie`, `gpu`
and `video` hardware classes). The module is therefore shared on the network
by **ser2net** (on the Gladys host or on a Raspberry Pi), and the integration
reads the stream over TCP.

- **Historic** (1200 bauds) and **standard** (9600 bauds) modes are detected
  automatically from the frames; the serial speed is set in ser2net.
- One Gladys device per meter (external id built from ADCO / ADSC), with only
  the features of the labels the meter sends (single/three phase, tariffs).
- Categories, types and units mirror the Gladys core mapping of the LiXee
  ZLinky_TIC (Zigbee2MQTT), so values look the same in Gladys.
- Values are sent at most every `publish_interval` seconds (default 60),
  changed values only, plus a full refresh every 10 minutes.
- Connection status in the Configuration screen and a **Test the connection**
  action.
- Gladys 5.1+: scene triggers **Tariff period changed** and **Subscribed power
  exceeded**, scene action **Read the meter**, and an **Electricity meter**
  dashboard widget (live power, index, 24 h curve, tariff, overload).

## Project structure

```
.
├─ index.js                     # SDK wiring (no protocol logic)
├─ src/
│  ├─ transport/tcpSource.js    # TCP client to ser2net: reconnection, data watchdog
│  ├─ teleinfo/frame.js         # TIC decoder: frames, groups, checksums, 7E1
│  ├─ teleinfo/labels.js        # TIC label -> Gladys feature
│  ├─ teleinfo/meter.js         # one meter -> device + states
│  ├─ teleinfo/hub.js           # meters registry, throttled publication
│  ├─ status.js                 # bilingual status / action messages
│  └─ config.js                 # config defaults + normalization
├─ docs/{en,fr}.md              # user documentation (re-hosted by Gladys)
├─ test/                        # unit tests (node --test), no network
├─ gladys-assistant-integration.json
└─ Dockerfile                   # Node 24 Alpine, read-only rootfs ready
```

## Develop

```bash
npm install
npm test               # unit tests
npm run lint           # ESLint
npm run format:check   # Prettier
```

Run against a local Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="teleinfo" \
LOG_LEVEL=debug \
npm start
```

No meter at hand? Replay a capture through a TCP server, e.g.
`socat TCP-LISTEN:2000,reuseaddr,fork FILE:capture.bin` (a raw dump taken
with `nc <bridge> 2000 > capture.bin`).

## Publish

1. Add the GitHub topic `gladys-assistant-integration` to the repository.
2. Describe the changes under `## [Unreleased]` in `CHANGELOG.md`, then run
   **Actions → Release → Run workflow** (patch / minor / major). It bumps the
   versions, tags, builds the multi-arch image to `ghcr.io` and creates the
   GitHub Release.
3. Make the `ghcr.io` package public, then check with
   `npx github:GladysAssistant/integration-store .`

## License

Apache-2.0
