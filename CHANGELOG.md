# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.2.2] - 2026-10-23

- Maintenance release, no functional change.

## [1.2.1] - 2026-10-23

- Maintenance release, no functional change.

## [1.2.0] - 2026-10-13

### Added

- German and Spanish translations (configuration screen, messages, widgets, documentation).

### Fixed

- The English documentation names the Gladys screens as the Gladys interface does.

## [1.1.1] - 2026-10-12

### Changed

- `@gladysassistant/integration-sdk` updated to 0.15.0.

## [1.1.0] - 2026-10-10

### Added

- Scene trigger **Tariff period changed**, filterable on the new period (off-peak, peak,
  single rate, other), with the meter label and the previous period as variables.
- Scene trigger **Subscribed power exceeded** (ADPS in historic mode, apparent power above
  PREF in standard mode), fired once per overload.
- Scene action **Read the meter**: power, tariff period, total index and overload as outputs.
- Dashboard widget **Electricity meter**: live power, total index, 24 h curve, tariff period,
  overload and frame reception.

### Changed

- Gladys 5.1.0 or later is required (scene and widget declarations).
- The tariff period text collapses repeated spaces (`HEURE  PLEINE` → `HEURE PLEINE`).

## [1.0.2] - 2026-10-10

### Added

- The manifest declares the `local` transport: Gladys shows the integration as local (the
  meter is read over the LAN, no cloud).

## [1.0.1] - 2026-10-10

### Added

- First version: reads the Enedis TIC of a Linky or electronic meter through the LiXee TIC
  DIN-rail module, shared on the network by ser2net (raw TCP).
- Historic mode (1200 bauds) and standard mode (9600 bauds), detected automatically; single
  and three-phase meters.
- One device per meter, with the features of the labels it actually sends, using the same
  categories and units as the Gladys LiXee ZLinky mapping.
- Throttled publication: changed values only, every `publish_interval` seconds, plus a full
  refresh every 10 minutes and right after the device is created.
- Connection status in the Configuration screen, and a "Test the connection" action.
- CI runs the tests on Node 22 and 24, and on pull requests builds the Docker image and runs the
  store admission checks; Dependabot keeps the npm dependencies, the GitHub Actions and the
  Docker base image up to date.

[Unreleased]: https://github.com/prohand/gladys-teleinfo/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/prohand/gladys-teleinfo/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/prohand/gladys-teleinfo/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/prohand/gladys-teleinfo/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/prohand/gladys-teleinfo/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/prohand/gladys-teleinfo/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/prohand/gladys-teleinfo/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-teleinfo/releases/tag/v1.0.1
