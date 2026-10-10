# Teleinfo

Cette intégration lit la **télé-information client (TIC)** de votre compteur
électrique (Linky, ou compteur électronique plus ancien) grâce au module
**LiXee TIC sur rail DIN** (USB), et envoie les valeurs à Gladys :
index de consommation, puissance apparente, intensité, tension, période
tarifaire…

## Ce qu'il vous faut

- Un module LiXee TIC sur rail DIN, relié aux bornes **I1** et **I2** du
  compteur (sans polarité).
- Une machine de votre réseau où le module est branché en USB (le serveur
  Gladys lui-même, ou un Raspberry Pi près du tableau électrique).
- **ser2net** sur cette machine.

## Pourquoi ser2net ?

Les intégrations Gladys tournent dans un conteneur isolé qui **ne peut pas
ouvrir un port USB**. ser2net partage le port série du module sur le réseau
(en TCP), et l'intégration s'y connecte.

## 1. Trouver le mode TIC du compteur

- **Historique** (1200 bauds) : compteurs électroniques avant Linky, et la
  plupart des Linky par défaut.
- **Standard** (9600 bauds) : Linky passé en mode standard (demande à votre
  fournisseur).

Dans le doute, essayez d'abord 1200 bauds. Le bouton **Tester la connexion**
vous dira si des trames arrivent.

## 2. Installer et configurer ser2net

Sur la machine où le module est branché (Debian / Raspberry Pi OS) :

```bash
sudo apt install ser2net
ls -l /dev/serial/by-id/   # repérez le module (FTDI / LiXee)
```

Fichier `/etc/ser2net.yaml` (ser2net 4) :

```yaml
connection: &teleinfo
  accepter: tcp,2000
  enable: on
  options:
    kickolduser: true
  connector: serialdev,/dev/serial/by-id/usb-XXXX-if00-port0,1200e71,local
```

- Remplacez le chemin par celui affiché par `ls`.
- Remplacez `1200e71` par `9600e71` pour un Linky en mode **standard**.

Puis :

```bash
sudo systemctl restart ser2net
sudo systemctl enable ser2net
```

Vérification rapide depuis une autre machine : `nc <ip> 2000` doit afficher
des lignes du type `PAPP 00420 '` (historique) ou `SINSTS 00718` (standard).
Fermez `nc` avant de continuer : ser2net n'accepte qu'un client à la fois.

## 3. Configurer l'intégration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. **Adresse de la passerelle** : l'IP de la machine qui fait tourner ser2net
   (si c'est le serveur Gladys lui-même, son IP sur le réseau local, pas
   `localhost`).
3. **Port TCP** : celui choisi dans ser2net (2000 par défaut).
4. **Intervalle d'envoi** : toutes les combien de secondes les valeurs sont
   envoyées à Gladys (60 s par défaut, 15 s minimum). Seules les valeurs qui
   ont changé sont renvoyées, plus un envoi complet toutes les 10 minutes.
5. Enregistrez, puis cliquez sur **Tester la connexion** : le numéro du
   compteur et la puissance actuelle s'affichent.
6. Allez dans l'onglet **Découverte** et ajoutez le compteur.

## Valeurs remontées

Seules les valeurs envoyées par votre compteur sont créées (monophasé ou
triphasé, Base, Heures Creuses, Tempo, EJP…).

**Mode historique** : index (Base, HC/HP, EJP, Tempo) en kWh, puissance
apparente (PAPP), intensité instantanée et maximale, intensité souscrite,
période tarifaire en cours, avertissement de dépassement (ADPS).

**Mode standard** : énergie soutirée totale et par index (fournisseur et
distributeur), énergie injectée, puissance apparente instantanée et
maximale, courant et tension efficaces, tension moyenne, courbe de charge,
puissance de référence et de coupure, tarif en cours.

## Dépannage

- **« Impossible de joindre … »** : mauvaise adresse ou mauvais port, ser2net
  arrêté, ou pare-feu.
- **« Connecté, mais aucune trame TIC valide »** : mauvaise vitesse (1200 /
  9600), mauvais format (il faut `e71`, 7 bits parité paire), ou module mal
  câblé sur le compteur.
- **Le compteur n'apparaît pas dans Découverte** : attendez la première trame
  (quelques secondes), puis rafraîchissez.
- Logs détaillés : variable d'environnement `LOG_LEVEL=debug`.
