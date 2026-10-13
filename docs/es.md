# Teleinfo

Esta integración lee la **TIC (télé-information client)** de su contador
eléctrico francés (Linky o un contador electrónico más antiguo) mediante el
**módulo TIC LiXee para carril DIN** (USB) y envía los valores a Gladys:
lecturas de energía, potencia aparente, intensidad, tensión, periodo
tarifario actual…

## Lo que necesita

- Un módulo TIC LiXee para carril DIN, conectado a los bornes **I1** e **I2**
  del contador (sin polaridad).
- Un equipo de su red al que el módulo esté conectado por USB (el propio
  servidor Gladys o una Raspberry Pi junto al cuadro eléctrico).
- **ser2net** en ese equipo.

## ¿Por qué ser2net?

Las integraciones de Gladys se ejecutan en un contenedor aislado que **no
puede abrir un puerto USB**. ser2net comparte el puerto serie del módulo en
la red (por TCP) y la integración se conecta a él.

## 1. Averiguar el modo TIC del contador

- **Histórico** (1200 baudios): contadores electrónicos anteriores a Linky y
  la mayoría de los Linky por defecto.
- **Estándar** (9600 baudios): un Linky cambiado al modo estándar (pídalo a
  su comercializadora).

En caso de duda, pruebe primero con 1200 baudios. El botón **Probar la
conexión** le indica si llegan tramas.

## 2. Instalar y configurar ser2net

En el equipo al que está conectado el módulo (Debian / Raspberry Pi OS):

```bash
sudo apt install ser2net
ls -l /dev/serial/by-id/   # find the module (FTDI / LiXee)
```

Archivo `/etc/ser2net.yaml` (ser2net 4):

```yaml
connection: &teleinfo
  accepter: tcp,2000
  enable: on
  options:
    kickolduser: true
  connector: serialdev,/dev/serial/by-id/usb-XXXX-if00-port0,1200e71,local
```

- Sustituya la ruta por la que muestra `ls`.
- Sustituya `1200e71` por `9600e71` para un Linky en modo **estándar**.

Después:

```bash
sudo systemctl restart ser2net
sudo systemctl enable ser2net
```

Comprobación rápida desde otro equipo: `nc <ip> 2000` debería mostrar líneas
como `PAPP 00420 '` (histórico) o `SINSTS 00718` (estándar). Cierre `nc`
antes de continuar: ser2net solo acepta un cliente a la vez.

## 3. Configurar la integración

1. Abra la pestaña **Configuración** de la integración.
2. **Dirección de la pasarela**: la IP del equipo en el que se ejecuta ser2net
   (si es el propio servidor Gladys, su IP en la red local, no `localhost`).
3. **Puerto TCP**: el configurado en ser2net (2000 por defecto).
4. **Intervalo de envío**: cada cuántos segundos se envían los valores a
   Gladys (60 s por defecto, 15 s como mínimo). Solo se envían los valores que
   han cambiado, además de una actualización completa cada 10 minutos.
5. Guarde y pulse **Probar la conexión**: aparecen el número del contador y
   la potencia actual.
6. Vaya a la pestaña **Descubrir** y añada el contador.

## Valores

Solo se crean los valores que envía su contador (monofásico o trifásico,
Base, horas valle, Tempo, EJP…).

**Modo histórico**: lecturas (Base, horas valle/punta, EJP, Tempo) en kWh,
potencia aparente (PAPP), intensidad instantánea y máxima, intensidad
contratada, periodo tarifario actual, aviso de sobrecarga (ADPS).

**Modo estándar**: energía consumida total y por registro (comercializadora y
distribuidora), energía vertida, potencia aparente instantánea y máxima,
intensidad y tensión eficaces, tensión media, curva de carga, potencia de
referencia y de corte, tarifa actual.

## Escenas (Gladys 5.1 o posterior)

En el editor de escenas, categoría **Integraciones**:

- **Cambio de periodo tarifario** (activador): inicia la escena cuando el
  contador cambia de periodo. Opcionalmente, filtre por el **nuevo periodo**
  (horas valle, horas punta, tarifa única, otro), por ejemplo para encender el
  termo eléctrico en horas valle. Variables: `{{triggerEvent.data.period}}`
  (etiqueta del contador), `{{triggerEvent.data.period_type}}`,
  `{{triggerEvent.data.previous_period}}`.
- **Potencia contratada superada** (activador): la potencia supera la
  contratada (riesgo de que salte el limitador). Un solo activador por
  sobrecarga, aunque la potencia oscile alrededor del límite. Variable:
  `{{triggerEvent.data.power}}` (VA). En modo histórico es la etiqueta ADPS
  del contador; en modo estándar, la potencia aparente por encima de la
  potencia de referencia (PREF).
- **Leer el contador** (acción): devuelve `available` (el contador responde),
  `power` (VA), `period`, `period_type`, `index_kwh` y `overload`, para las
  acciones siguientes (condición, mensaje…).

## Panel (Gladys 5.1 o posterior)

Añada el widget **Contador eléctrico** y elija el contador: potencia en
directo, lectura total, curva de potencia de 24 h, periodo tarifario,
sobrecarga y recepción de tramas.

## Solución de problemas

- **«No se puede conectar con …»**: dirección o puerto incorrectos, ser2net
  detenido o cortafuegos.
- **«Conectado a …, pero sin ninguna trama TIC válida»**: velocidad incorrecta
  (1200 / 9600), formato incorrecto (`e71` es obligatorio: 7 bits, paridad
  par) o módulo mal conectado al contador.
- **El contador no aparece en Descubrir**: espere a la primera trama (unos
  segundos) y luego actualice.
- Registros detallados: variable de entorno `LOG_LEVEL=debug`.
