# DFX Services Handbook

Statische, deutschsprachige Übersichtsseite aller committeten Screenshot-Baselines,
Design-Tokens und Markdown-Dokumentation dieses Repos. Ausgeliefert von nginx in einem
Docker-Image hinter Basic Auth unter [handbook.app.dfx.swiss](https://handbook.app.dfx.swiss).

## Wie es funktioniert

Das Assembly-Script `scripts/handbook/build.js` **findet** die meisten Artefakte selbst
(echte Discovery für Screenshots A/B, SVG-Teil von D und Docs E). Die Einzeldatei
`public/logo.png` ist bewusst kuratiert — `public/` enthält viele unzusammenhängende
Statik-Dateien, die nicht ins Handbook gehören:

| Quelle | Pfad                                                                                                                                                                                                       | Inhalt                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A      | `e2e/screenshots/baseline/*.png`                                                                                                                                                                           | Playwright Visual-Baselines (flach)                                          |
| B      | `e2e/screenshots/*.png`                                                                                                                                                                                    | Top-Level-Screenshots (nicht rekursiv; `baseline/` und `debug/` ausgenommen) |
| C      | `tailwind.config.js`                                                                                                                                                                                       | Farben und Schriftgrössen                                                    |
| D      | `src/static/assets/*.svg` (Verzeichnis-Scan) plus `public/logo.png` (kuratiert, einzelne Datei)                                                                                                            | Logos                                                                        |
| E      | rekursiver Scan aller `*.md` ab Repo-Root, mit Ausschlussliste (`node_modules`, `.git`, `_handbook-deps`, `build`, `dist`, `coverage`, `e2e`, `docs/handbook`, sowie jedes mit `.` beginnende Verzeichnis) | Markdown-Doku (gerendert mit `marked`)                                       |

Ausgabe pro Build:

```
<out>/
  index.html
  manifest.json
  screenshots/…
  docs/…
  assets/…
```

Guards (Build bricht ab bei Verletzung):

- **Floor:** mindestens `MIN_SCREENSHOTS` (170) PNGs
- **Floor:** mindestens `MIN_DOCS` (4) Markdown-Dokumente (nach Ausschlussregeln)
- **PNG-Integrität:** Magic-Bytes `\x89PNG…` und Grösse > 1000 Bytes
- **HTML-Integrität:** jedes Artefakt im Manifest muss im Ausgabeverzeichnis liegen; zusätzlich
  muss jedes lokale `src`/`href` in den gerenderten Markdown-Seiten auflösen. Die `index.html`
  wird dafür nicht erneut geparst — ihre Artefakte deckt die Manifest-Prüfung ab

Überschreitung der Mindestzahl ist **kein** Fehler — neue Baselines landen automatisch.

Metadaten in `scripts/handbook/metadata.json` sind **nur Anreicherung** (deutsche Titel/
Beschreibungen pro Screenshot-Gruppe; optional Titel-Overrides für Docs unter dem
Schlüssel `docs`, pro repo-relativem Markdown-Pfad). Fehlende Einträge sind kein Fehler;
verwaiste Einträge erzeugen nur eine Warnung auf stderr.

## Lokal bauen

`marked` wird **isoliert** installiert — nicht in `package.json` / Lockfile des Repos:

```bash
npm install --prefix ./_handbook-deps --no-save --no-audit --no-fund marked@15.0.7
NODE_PATH=./_handbook-deps/node_modules node scripts/handbook/build.js docs/handbook/build
```

Anschliessend `docs/handbook/build/index.html` im Browser öffnen.

Das Scratch-Verzeichnis `_handbook-deps/` und `docs/handbook/build/` sind gitignored.

Optional: `GIT_SHA=…` (oder `HANDBOOK_GIT_SHA`) setzt den Stand im Seitenkopf.
Optional: `HANDBOOK_REPO_ROOT=/pfad/zum/repo` überschreibt die Root-Erkennung
(Standard: zwei Ebenen über dem Script).

## Docker-Image lokal

```bash
# _handbook-deps darf nicht im Build-Kontext liegen
rm -rf _handbook-deps

docker build -f Dockerfile.handbook \
  --build-arg GIT_SHA="$(git rev-parse HEAD)" \
  -t dfx-app-handbook:local .

# Credentials nur zur lokalen Prüfung — echte Werte kommen von der Deployment-Umgebung
docker run --rm -p 8080:8080 \
  -e HANDBOOK_USER=local \
  -e HANDBOOK_PASSWORD=local \
  dfx-app-handbook:local
```

- `http://127.0.0.1:8080/healthz` → `200 OK` ohne Auth
- `http://127.0.0.1:8080/` → `401` ohne Auth, `200` mit Basic Auth

Ohne `HANDBOOK_USER` / `HANDBOOK_PASSWORD` startet der Container **nicht** (fail loud).

## Neue Baseline hinzufügen

1. PNG unter `e2e/screenshots/baseline/` (Playwright) oder als Top-Level-Datei unter
   `e2e/screenshots/` ablegen und committen.
2. Nächster Handbook-Build (lokal oder CI nach Merge auf `develop`) nimmt die Datei
   automatisch auf — **keine** Mapping-Tabelle und **keinen** Count anpassen.
3. In `scripts/handbook/metadata.json` einen deutschen Titel/Beschreibung für den
   Gruppenschlüssel ergänzen (Präfix vor `.spec.ts-` bzw. gemeinsamer Präfix bei
   manuellen Screenshots). Für den Build ist das optional; für einen Screen, den ein
   PR ändert, verlangt `CONTRIBUTING.md` den Eintrag.

## Deployment

Bei Push auf `develop` (relevante Pfade) baut `.github/workflows/handbook-deploy.yaml`
das Image `dfxswiss/dfx-app-handbook:latest` (linux/arm64), pusht es und löst den
serverseitigen Deploy-Hook aus. Anschliessend Smoke gegen
`https://handbook.app.dfx.swiss/healthz`.

Basic-Auth-Zugangsdaten werden **ausschliesslich** in der Deployment-Umgebung als
`HANDBOOK_USER` / `HANDBOOK_PASSWORD` gesetzt. Weder Klartext noch Hash gehören in
dieses öffentliche Repository.

Pull Requests (nicht-Draft) laufen durch `.github/workflows/handbook-check.yaml`,
sofern sie einen Pfad aus dessen `paths`-Filter berühren — unterhalb von `src/` ist
das nur `src/static/assets/**`. Der Check macht einen Image-Build ohne Push und
einen Container-Smoke (`/healthz`, Auth-Wand, Stichprobe aus `manifest.json`).
