# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

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

[Unreleased]: https://github.com/prohand/gladys-teleinfo/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-teleinfo/releases/tag/v1.0.1
