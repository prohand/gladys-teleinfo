# Security policy

## Supported versions

Only the latest release of the Teleinfo integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-teleinfo](https://github.com/prohand/gladys-teleinfo/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), ser2net, the
LiXee TIC module and the electricity meter.

## Good practices for users

- ser2net has no authentication: expose its TCP port on your local network only, never on the
  Internet, and restrict it to the Gladys host when your firewall allows it.
- The TIC carries your meter serial number and your consumption: treat the logs accordingly
  before sharing them.
- Keep Gladys and the integration up to date.
