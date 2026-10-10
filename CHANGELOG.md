# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version: reads the Enedis TIC of a Linky or electronic meter through
  the LiXee TIC DIN-rail module, shared on the network by ser2net (raw TCP).
- Historic mode (1200 bauds) and standard mode (9600 bauds), detected
  automatically; single and three-phase meters.
- One device per meter, with the features of the labels it actually sends,
  using the same categories and units as the Gladys LiXee ZLinky mapping.
- Throttled publication: changed values only, every `publish_interval`
  seconds, plus a full refresh every 10 minutes.
- Connection status in the Configuration screen, and a "Test the connection"
  action.

[Unreleased]: https://github.com/prohand/gladys-teleinfo/commits/main
