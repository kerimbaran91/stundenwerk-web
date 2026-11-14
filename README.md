# Stundenwerk (Web-App für iPhone)

Web-Version der Android-App [Stundenwerk](https://github.com/kerimbaran91/stundenwerk): Arbeitszeit, Lohn und Spritpauschale – Jahre → Monate → Tage, Nachtschichten, nächste Schicht, Dienstplan aus WhatsApp einfügen, Monats-PDF, Backup in Dropbox und Dateien/iCloud.

Läuft komplett im Browser, ohne Server. Die Daten liegen nur auf dem Gerät (plus Backups).

## Auf dem iPhone installieren

1. Die Adresse in **Safari** öffnen.
2. Unten auf **Teilen** tippen → **„Zum Home-Bildschirm“** → **Hinzufügen**.
3. Die App ab jetzt **nur über das neue Symbol** öffnen. Safari und die Home-Bildschirm-App haben getrennte Speicher.

## Backup

- **Dropbox:** Einstellungen → Dropbox-Backup → anmelden, Code kopieren, einfügen. Danach wird nach jeder Änderung automatisch gesichert (`Apps/<App-Name>/Stundenwerk-Backup.json` und eine Tageskopie unter `Verlauf/`).
- **Dateien/iCloud:** Einstellungen oder ⋯ → „In Dateien / iCloud sichern“ → im Teilen-Menü „In Dateien sichern“. Die App erinnert, wenn die letzte Sicherung zu alt ist.
- Backups haben das gleiche Format wie bei der Android-App und sind in beide Richtungen austauschbar.

## Technik

- Reines HTML/CSS/JavaScript (ES-Module), kein Build-Schritt. Hosting über GitHub Pages.
- `js/core.js`: Rechenlogik und Dienstplan-Parser, 1:1 aus der Android-App übertragen. Tests: `node tests/core.test.mjs`
- `js/config.js`: Dropbox-App-Key.
- PDF: [jsPDF](https://github.com/parallax/jsPDF) (MIT), liegt unter `vendor/`.
- Offline-Betrieb über `sw.js`. **Bei jeder neuen Version `VERSION` in `sw.js` erhöhen**, sonst bekommen die Geräte das Update nicht.
