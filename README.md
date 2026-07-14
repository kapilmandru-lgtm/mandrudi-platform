# Mandrudi Plattform

Modulare KMU-Plattform (Phase 0 – Gerüst). Statisch (kein Node), Supabase-ready, Mandrudi-Look.

## Lokal starten
`python3 -m http.server 8890` → http://localhost:8890/

## Struktur
- index.html · styles.css · app.js · config.js
- assets/ (Logo, Design-Tokens)

Demo-Modus bis Supabase in config.js eingetragen ist.

## Beleg-Auslesen (OCR) – lokal & remote-fähig
Das Auslesen (pdf.js + tesseract.js) läuft **client-seitig im Browser des jeweils angemeldeten Nutzers** – nicht auf einem Server und nicht auf einem bestimmten Rechner. Remote-Kollegen können es also überall nutzen; die Datei verlässt dabei nie ihren Browser (DSGVO-freundlich, keine fremde Cloud-KI). Die Bibliotheken werden beim ersten Auslesen einmalig per CDN geladen.

## Beleg-Typen mehrsprachig
Belegnamen/Kategorien werden **kanonisch auf Deutsch** gespeichert (Tankbeleg/Restaurantbeleg/Hotelbeleg/Rechnung/Beleg) und **bei der Anzeige** in die App-Sprache übersetzt (de/en/fr/es/it/ro) – inkl. Suche („fuel" findet „Tankbeleg") und Umbenennen (übersetzter Präfix wird beim Speichern zurückübersetzt). Keine DB-Migration nötig.
