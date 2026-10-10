# Teleinfo

This integration reads the **TIC (télé-information client)** of your French
electricity meter (Linky, or an older electronic meter) through the **LiXee
TIC DIN-rail module** (USB), and sends the values to Gladys: energy indexes,
apparent power, current, voltage, current tariff period…

## What you need

- A LiXee TIC DIN-rail module, wired to the **I1** and **I2** terminals of the
  meter (no polarity).
- A machine of your network the module is plugged into over USB (the Gladys
  server itself, or a Raspberry Pi next to the electrical panel).
- **ser2net** on that machine.

## Why ser2net?

Gladys integrations run in a sandboxed container that **cannot open a USB
port**. ser2net shares the serial port of the module on the network (over
TCP), and the integration connects to it.

## 1. Find the TIC mode of the meter

- **Historic** (1200 bauds): electronic meters before Linky, and most Linky
  meters by default.
- **Standard** (9600 bauds): a Linky switched to standard mode (ask your
  energy supplier).

If unsure, try 1200 bauds first. The **Test the connection** button tells you
whether frames come in.

## 2. Install and configure ser2net

On the machine the module is plugged into (Debian / Raspberry Pi OS):

```bash
sudo apt install ser2net
ls -l /dev/serial/by-id/   # find the module (FTDI / LiXee)
```

`/etc/ser2net.yaml` file (ser2net 4):

```yaml
connection: &teleinfo
  accepter: tcp,2000
  enable: on
  options:
    kickolduser: true
  connector: serialdev,/dev/serial/by-id/usb-XXXX-if00-port0,1200e71,local
```

- Replace the path with the one `ls` shows.
- Replace `1200e71` with `9600e71` for a Linky in **standard** mode.

Then:

```bash
sudo systemctl restart ser2net
sudo systemctl enable ser2net
```

Quick check from another machine: `nc <ip> 2000` should print lines like
`PAPP 00420 '` (historic) or `SINSTS 00718` (standard). Close `nc` before
going on: ser2net accepts one client at a time.

## 3. Configure the integration

1. Open the **Configuration** tab of the integration.
2. **Bridge address**: the IP of the machine running ser2net (if it is the
   Gladys server itself, its LAN IP, not `localhost`).
3. **TCP port**: the one set in ser2net (2000 by default).
4. **Publish interval**: how often, in seconds, the values are sent to Gladys
   (60 s by default, 15 s minimum). Only the values that changed are sent,
   plus a full refresh every 10 minutes.
5. Save, then click **Test the connection**: the meter number and the current
   power show up.
6. Go to the **Discovery** tab and add the meter.

## Values

Only the values your meter sends are created (single or three phase, Base,
Off-peak, Tempo, EJP…).

**Historic mode**: indexes (Base, off-peak/peak, EJP, Tempo) in kWh, apparent
power (PAPP), instantaneous and maximum current, subscribed current, current
tariff period, overload warning (ADPS).

**Standard mode**: total and per-index (supplier and distributor) imported
energy, exported energy, instantaneous and maximum apparent power, RMS current
and voltage, average voltage, load curve, reference and cut-off power,
current tariff.

## Troubleshooting

- **"Cannot reach …"**: wrong address or port, ser2net stopped, or firewall.
- **"Connected, but no valid TIC frame"**: wrong speed (1200 / 9600), wrong
  format (`e71` is required: 7 bits, even parity), or module badly wired to
  the meter.
- **The meter does not show up in Discovery**: wait for the first frame (a
  few seconds), then refresh.
- Detailed logs: `LOG_LEVEL=debug` environment variable.
