# Beleg-Scanner als eigenständiges Produkt — Plan & Stand (aktualisiert 14.07.2026)

## Entscheidungen (Kapil, 14.07.2026)
- **Paketierung: C/Hybrid, radikalisiert zu „100 % serverlos":** eigene Marke + Landingpage, aber die App braucht **gar kein Backend** — kein Supabase, kein Konto, keine laufenden Kosten.
- **Domain: belege.mandrudi.com** (kostenlose Subdomain, GitHub Pages wie digital/sap).
- **Preis: komplett kostenlos** — Lead-Magnet für Mandrudi Digital (wie tools.mandrudi.com), kein Stripe, keine Paywall.

## Architektur (gebaut 14.07.2026)
**„Der Ordner ist die Datenbank."** Die App (app.html, eine Datei) arbeitet direkt auf einem Ordner des Nutzers (File System Access API, Chrome/Edge Desktop; Handle in IndexedDB gemerkt):
- Belege liegen als normale Dateien; **Typ/Datum/Betrag stecken im Dateinamen** („Tankbeleg 30.05.2026 27,50€.jpg") — keine separate DB nötig.
- OCR/Analyse client-seitig (pdf.js + tesseract.js via CDN), Auto-Umbenennen nach Import.
- Unterordner = echter Ordnerbaum; Papierkorb = Unterordner `_Papierkorb`; Excel-Report (SheetJS) aus den Namen.
- UI in 6 Sprachen (de/en/fr/es/it/ro), Typ-Namen übersetzen bei Anzeige (kanonisch DE im Dateinamen, wie Plattform-DMS).
- **Demo-Modus** (`?demo=1`): In-Memory-Dateisystem mit generierten Beispielbelegen — läuft in jedem Browser, dient auch als Live-Demo.
- Team/Backup gratis über einen gemeinsamen OneDrive-/Dropbox-Ordner.

**Kosten: 0 € Betrieb.** GitHub Pages + IONOS-Subdomain + CDN-Bibliotheken. Es gibt nichts, das skaliert kostet.

## Dateien
`~/Desktop/Mandrudi-Belege-Website/` → index.html (Landingpage, 9 Sprachen), **app.html** (die App), impressum.html, datenschutz.html (inkl. Abschnitt lokale Verarbeitung/IndexedDB/jsDelivr-CDN), CNAME.

## Launch-Schritte (offen)
1. GitHub-Repo `belege` (public) anlegen, die 5 Dateien hochladen.
2. Settings → Pages → main/root; Custom Domain kommt aus CNAME-Datei.
3. IONOS: CNAME `belege` → `kapilmandru-lgtm.github.io`; Enforce HTTPS.
4. Live-Check (Sprachen, App-Demo, echter Ordner-Test durch Kapil).
5. Verlinkung: mandrudi.com („Digitale Services") + digital.mandrudi.com Querlink; später LinkedIn-Post.

## Abgrenzung zur Plattform
Plattform-DMS (Supabase, Mandanten, zentrale Ablage) bleibt das **Team-/Kunden-Produkt** innerhalb der Mandrudi-Plattform. „Mandrudi Belege" ist die **kostenlose lokale Einzelplatz-Variante** und Schaufenster; Upsell-Pfad: „Mehr als ein Ordner? Zentrale Team-Ablage mit Rechten → Mandrudi Plattform."

## Risiken & Antworten
- OCR bei Thermo-Fotos mäßig → überall „Vorschlag zum Bestätigen"-Wording.
- Browser-Support: File System Access nur Chrome/Edge Desktop → Hinweis + Demo-Modus überall lauffähig; Safari/Mobil ggf. später (v2: OPFS/Mobile-Variante).
- CDN-Abhängigkeit (jsDelivr) → in Datenschutzerklärung transparent; v2-Option: Bibliotheken ins Repo legen.
- Rechtstexte = Vorlagen → Anwalt-Review empfohlen (keine Zahlungen, geringes Risiko).
