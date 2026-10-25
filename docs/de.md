# Teleinfo

Diese Integration liest die **TIC (télé-information client)** deines
französischen Stromzählers (Linky oder ein älterer elektronischer Zähler) über
das **LiXee-TIC-Modul für die Hutschiene** (USB) aus und sendet die Werte an
Gladys: Zählerstände, Scheinleistung, Stromstärke, Spannung, aktueller
Tarifzeitraum…

## Was du brauchst

- Ein LiXee-TIC-Modul für die Hutschiene, angeschlossen an die Klemmen **I1**
  und **I2** des Zählers (ohne Polarität).
- Einen Rechner in deinem Netzwerk, an den das Modul per USB angeschlossen ist
  (der Gladys-Server selbst oder ein Raspberry Pi neben dem Stromverteiler).
- **ser2net** auf diesem Rechner.
- **Gladys 5.3.0 oder neuer**.

## Warum ser2net?

Gladys-Integrationen laufen in einem isolierten Container, der **keinen
USB-Port öffnen kann**. ser2net gibt die serielle Schnittstelle des Moduls im
Netzwerk frei (über TCP), und die Integration verbindet sich damit.

## 1. Den TIC-Modus des Zählers ermitteln

- **Historisch** (1200 Baud): elektronische Zähler vor Linky und die meisten
  Linky-Zähler im Auslieferungszustand.
- **Standard** (9600 Baud): ein in den Standardmodus umgestellter Linky
  (frag deinen Stromanbieter).

Im Zweifel probiere zuerst 1200 Baud. Die Schaltfläche **Verbindung
testen** zeigt dir, ob Frames ankommen.

## 2. ser2net installieren und konfigurieren

Auf dem Rechner, an den das Modul angeschlossen ist (Debian / Raspberry Pi OS):

```bash
sudo apt install ser2net
ls -l /dev/serial/by-id/   # find the module (FTDI / LiXee)
```

Datei `/etc/ser2net.yaml` (ser2net 4):

```yaml
connection: &teleinfo
  accepter: tcp,2000
  enable: on
  options:
    kickolduser: true
  connector: serialdev,/dev/serial/by-id/usb-XXXX-if00-port0,1200e71,local
```

- Ersetze den Pfad durch den, den `ls` anzeigt.
- Ersetze `1200e71` durch `9600e71` für einen Linky im **Standardmodus**.

Dann:

```bash
sudo systemctl restart ser2net
sudo systemctl enable ser2net
```

Schnelltest von einem anderen Rechner aus: `nc <ip> 2000` sollte Zeilen wie
`PAPP 00420 '` (historisch) oder `SINSTS 00718` (Standard) ausgeben. Beende
`nc`, bevor du fortfährst: ser2net akzeptiert nur einen Client
gleichzeitig.

## 3. Die Integration konfigurieren

1. Öffne den Tab **Konfiguration** der Integration.
2. **Bridge-Adresse**: die IP des Rechners, auf dem ser2net läuft (ist es der
   Gladys-Server selbst, seine IP im lokalen Netzwerk, nicht `localhost`).
3. **TCP-Port**: der in ser2net eingestellte Port (standardmäßig 2000).
4. **Sendeintervall**: wie oft die Werte an Gladys gesendet werden, in
   Sekunden (standardmäßig 60 s, mindestens 15 s). Nur geänderte Werte werden
   gesendet, dazu alle 10 Minuten eine vollständige Aktualisierung.
5. Speichere und klicke dann auf **Verbindung testen**: Die
   Zählernummer und die aktuelle Leistung werden angezeigt.
6. Wechsle zum Tab **Entdecken** und füge den Zähler mit **Zu Gladys hinzufügen** hinzu.

## Werte

Es werden nur die Werte angelegt, die dein Zähler sendet (einphasig oder
dreiphasig, Base, Niedertarif, Tempo, EJP…).

**Historischer Modus**: Zählerstände (Base, Nieder-/Hochtarif, EJP, Tempo) in
kWh, Scheinleistung (PAPP), momentane und maximale Stromstärke, vertraglich
vereinbarte Stromstärke, aktueller Tarifzeitraum, Überschreitungswarnung
(ADPS).

**Standardmodus**: bezogene Energie gesamt und je Zählwerk (Anbieter und
Netzbetreiber), eingespeiste Energie, momentane und maximale Scheinleistung,
Effektivwerte von Strom und Spannung, mittlere Spannung, Lastgang, Referenz-
und Abschaltleistung, aktueller Tarif.

## Szenen (ab Gladys 5.1)

Im Szenen-Editor, Kategorie **Integrationen**:

- **Tarifzeitraum gewechselt** (Auslöser): startet die Szene, wenn der Zähler
  den Zeitraum wechselt. Optional kannst du nach dem **neuen Zeitraum**
  filtern (Niedertarif, Hochtarif, Einheitstarif, Sonstige), z. B. um den
  Warmwasserspeicher im Niedertarif einzuschalten. Variablen:
  `{{triggerEvent.data.period}}` (Bezeichnung des Zählers),
  `{{triggerEvent.data.period_type}}`, `{{triggerEvent.data.previous_period}}`.
- **Vertragsleistung überschritten** (Auslöser): Die Leistung übersteigt deine
  Vertragsleistung (Auslösegefahr). Ein Auslöser pro Überschreitung, auch wenn
  die Leistung um die Grenze schwankt. Variable: `{{triggerEvent.data.power}}`
  (VA). Im historischen Modus ist es die ADPS-Kennung des Zählers, im
  Standardmodus die Scheinleistung oberhalb der Referenzleistung (PREF).
- **Zähler auslesen** (Aktion): liefert `available` (der Zähler antwortet),
  `power` (VA), `period`, `period_type`, `index_kwh` und `overload` für die
  folgenden Aktionen (Bedingung, Nachricht…).

## Dashboard (ab Gladys 5.1)

Füge das Widget **Stromzähler** hinzu (**Dashboard → Bearbeiten → Neues Widget**,
unter **Integrations-Widgets**) und wähle den Zähler: Live-
Leistung, Gesamtzählerstand, Leistungskurve der letzten 24 h, Tarifzeitraum,
Überschreitung und Frame-Empfang.

## Fehlerbehebung

- **„Keine Verbindung zu …“**: falsche Adresse oder falscher Port, ser2net
  gestoppt oder Firewall.
- **„Verbunden mit …, aber kein gültiger TIC-Frame“**: falsche Geschwindigkeit
  (1200 / 9600), falsches Format (`e71` ist erforderlich: 7 Bit, gerade
  Parität) oder Modul falsch mit dem Zähler verbunden.
- **Der Zähler erscheint nicht unter Entdecken**: Warte auf den ersten
  Frame (einige Sekunden) und klicke dann auf **Scannen**.
- Ausführliche Logs: Umgebungsvariable `LOG_LEVEL=debug`.
