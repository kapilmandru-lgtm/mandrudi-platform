# Beleg-Scanner als eigenständiges Produkt — Fahrplan (Stand 14.07.2026)

## 1. Das Asset (was wir schon haben)
Aus dem Plattform-DMS bereits gebaut und getestet:
- **Lokale Beleganalyse ohne Cloud-KI:** pdf.js (digitale PDFs) + tesseract.js (Foto-OCR) laufen im Browser des Nutzers. Datei verlässt den Browser nicht → DSGVO-Verkaufsargument, 0 € KI-Betriebskosten.
- Auto-Erkennen von **Typ** (Tankbeleg/Restaurant/Hotel/Rechnung), **Datum** (validiert), **Betrag**; Auto-Umbenennen.
- Ordner (Baum), Suche, Mehrfachauswahl, Papierkorb, **Excel-Auswertung** (Summen je Kategorie/Monat), Vorschau.
- **6 Sprachen** (Typ-Namen übersetzen mit; Rest der DMS-UI aktuell DE).
- Supabase-Backend (EU/Frankfurt, RLS, Mandanten).

## 2. Positionierung
**„Belege automatisch erkennen, benennen und auswerten — ohne Cloud-KI. Ihre Belege bleiben bei Ihnen."**
- Zielgruppe primär: Selbstständige, Freiberufler, Kleinstbetriebe (DACH) — Reisekosten & Steuervorbereitung.
- Sekundär: kleine Teams (gemeinsame Ablage), Steuerberater-Mandanten (Übergabe-Ordnung).
- Abgrenzung zu lexoffice/sevdesk & Co.: kein Buchhaltungs-Koloss, sondern das schlanke Beleg-Werkzeug; Datenschutz als Speerspitze (Analyse client-seitig statt Cloud-OCR).

## 3. Paketierung — ENTSCHEIDUNG (a)
| Option | Beschreibung | Pro | Contra |
|---|---|---|---|
| A Standalone-App | eigene App + eigenes Supabase-Projekt | klarste Botschaft, sauberer Markttest | zweite Codebasis/Betrieb |
| B Plattform-Add-on | nur Modul der Mandrudi-Plattform | kein Doppelaufwand | „eigenständiges Produkt" verwässert; Plattform noch nicht live |
| **C Hybrid (Empfehlung)** | eigene Landingpage/Marke + eigener Login, technisch dieselbe Codebasis im „Belege-only"-Modus (Modul-Flag) | 1 Codebasis, 2 Gesichter; späterer Upsell zur Plattform eingebaut | etwas Konfigurationslogik |

Wichtig bei eigenem Signup: **separates Supabase-Projekt** fürs Produkt (offener Self-Signup + Honeypot/CAPTCHA). Die Plattform bleibt beim beschlossenen Einladungs-Modell — nicht vermischen.

## 4. Name & Domain — ENTSCHEIDUNG (b)
Muster wie digital./sap.mandrudi.com (GitHub Pages + IONOS-CNAME, 0 €):
- **belege.mandrudi.com** (Vorschlag 1 — deutsch, klar)
- scanner.mandrudi.com (Vorschlag 2 — generischer)
- eigener Produktname darüber, Kandidaten: „Mandrudi Belege", „BelegLokal", „Belegradar" (Markencheck nötig)

## 5. Pricing-Hypothese — ENTSCHEIDUNG (c)
- **Free:** 20 Belege/Monat, 1 Nutzer, Excel-Export — Einstieg & Mundpropaganda.
- **Pro ~7 €/Monat:** unbegrenzte Belege, Ordner/Unterordner, Prioritäts-Support.
- **Team ~19 €/Monat:** mehrere Nutzer/Mandant, gemeinsame Ablage, Backup-Option.
Zahlung im MVP pragmatisch: **Stripe Payment Links** (kein eigener Server nötig) + manuelle/Edge-Function-Freischaltung. Preise vor Launch 1× gegen Wettbewerb validieren.

## 6. Roadmap
**Phase 1 (Woche 1): Schaufenster** — Landingpage im bewährten Muster (9 Sprachen, Chatbot optional), USP Datenschutz/lokal, E-Mail-CTA ReachUs / Early-Access-Liste. Kann VOR dem Produkt live gehen und Interesse messen.
**Phase 2 (Woche 2–3): Produkt-MVP** — separates Supabase-Projekt (Frankfurt), offener Signup + Spamschutz, Belege-only-Ansicht aus dms.js, Free-Limit-Zähler, Onboarding (3 Schritte), Rechtsseiten (Impressum/DSE/AVV — Anwalt-Review-Vorbehalt).
**Phase 3 (Woche 4): Monetarisierung** — Stripe Payment Links, Pro-Freischaltung, AGB.
**Phase 4 (danach):** Feedback-Schleife Early Adopter; v2-Killer-Feature: **DATEV-/Steuerberater-Export**; Team-Funktionen; ggf. PWA („App-Gefühl", offline-Warteschlange).

## 7. Risiken & Antworten
- **OCR-Qualität bei Thermo-/Foto-Belegen mäßig** → Positionierung „Vorschlag zum Bestätigen", nie „100 % automatisch".
- **Supabase-Free-Limits** (Storage 500 MB) → Bild-Kompression beim Upload, Free-Kontingent, Pro-Plan ab Umsatz (~25 €/Mon, revenue-finanziert).
- **Suiten-Konkurrenz** → Nische Datenschutz + Einfachheit + Preis; nicht Feature-Krieg führen.
- **Rechtstexte** → Vorlagen wie bei digital/sap, Anwalt-Review vor Zahlungs-Launch.
