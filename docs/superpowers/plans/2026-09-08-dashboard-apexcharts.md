# Paket C – Dashboard und ApexCharts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard, Verkaufsjournal und Diagramm im gemeinsamen Admin-Design darstellen; ApexCharts ersetzt Chart.js ohne geänderte Kennzahlen.

**Architecture:** Bestehenden Shared-`RevenueChartComponent` und seinen fachlichen `points`-Eingang erhalten. Optionen/Serien rein ableiten, Renderer und Lifecycle gezielt ersetzen. Berichtstabelle bleibt Shared-komponierte HTML-Tabelle, keine zusätzliche Grid-Bibliothek.

**Tech Stack:** Angular 22, Tailwind, ApexCharts 7.1.0, ng-apexcharts 3.1.0, Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-09-08-unified-products-admin-design.md`

## Globale Grenzen

Die Grenzen des [Hauptplans](2026-09-08-unified-products-admin.md) gelten vollständig. Keine Buchhaltungsformel, Zeitbereichslogik, Rundung, unbekannten Werte oder Verkaufsfilter als Teil des optischen Umbaus ändern. Keine gekaufte Lizenz, kein ApexGrid und keine ungefragten allgemeinen Paket-Upgrades.

## C1 – Lizenz und Paketvertrag

Umsetzungsentscheidung 08.09.2026: Interne Nutzung und Umsatz einschließlich verbundener Unternehmen unter 2 Mio. USD vom Nutzer bestätigt. ApexCharts 7.1.0 ist installiert. Der zunächst geprüfte Wrapper 3.1.0 wurde wegen fehlender vollständiger Import-/Konstruktor-/Renderfehlerbehandlung durch einen kleinen typisierten direkten Apex-Adapter ersetzt und wieder entfernt. Core/Linien/Legendenmodule werden dynamisch geladen; keine privaten Wrapper-Hooks oder globale Scripts. Nachfolgende ursprüngliche Wrapper-Schritte sind entsprechend durch den direkten Adapter mit demselben sichtbaren/fachlichen Vertrag ersetzt.

**Dateien:** `package.json`, `package-lock.json`, `docs/design/admin-ui-guidelines.md`; vorhandene Lizenzhinweise pflegen, falls eine zentrale Datei existiert.

- [ ] Bestätigte interne Betriebsnutzung festhalten. Vor Installation zusätzlich bestätigen, dass Organisation inklusive verbundener Unternehmen unter 2 Mio. USD Jahresumsatz liegt, oder passende kommerzielle Lizenz nachweisen. Nur C ist durch dieses Gate blockiert, A/B können unabhängig bearbeitet werden.
- [ ] npm-Abfrage vom 08.09.2026: ApexCharts 7.1.0; ng-apexcharts 3.1.0 mit Angular >=20, RxJS ^7.8.2 und ApexCharts ^6 oder ^7. Vor Installation Lockfile-RxJS prüfen; kein `--force`/`--legacy-peer-deps`.
- [ ] Nach Lizenzfreigabe exakt installieren:

```powershell
npm install --save-exact apexcharts@7.1.0 ng-apexcharts@3.1.0
```

- [ ] Paket-Lizenztexte der tatsächlich installierten Version mit der [Community-Lizenz](https://apexcharts.com/license/community/) abgleichen. Keine alten MIT-Annahmen. Keine globale Script-Einbindung in `angular.json`; offiziellen dynamisch geladenen Wrapper verwenden.

## C2 – Shared-Renderer ersetzen

**Dateien:** `src/app/shared/components/revenue-chart/revenue-chart.component.ts`, `.html`, `.angular.spec.ts`, `revenue-chart.config.ts`, `revenue-chart.config.spec.ts`, `revenue-chart.chart.ts`; `src/app/core/models/flipbase.models.ts` nur lesen.

**Schnittstelle:** `points = input.required<readonly DashboardTimePoint[]>()` bleibt. Geplante neue reine Funktion in `revenue-chart.config.ts`:

```ts
import type { ApexAxisChartSeries } from 'ng-apexcharts';
import type { DashboardTimePoint } from '../../../core/models/flipbase.models';

export function buildRevenueSeries(points: readonly DashboardTimePoint[]): ApexAxisChartSeries {
  return [
    { name: 'Verkaufserlös', data: points.map((point) => point.revenue) },
    { name: 'Wareneinsatz', data: points.map((point) => point.costOfGoodsSold) },
    { name: 'Verkaufskosten', data: points.map((point) => point.sellingCosts) },
    {
      name: 'Ergebnis nach direkten Kosten',
      data: points.map((point) => point.resultAfterDirectCosts),
    },
  ];
}
```

X-Achsenkategorien stammen in gleicher Reihenfolge aus `point.label`; nicht aus Browser-Datumsparsing. EUR-Formatierung und offene Werte bleiben in vorhandenen fachlichen Formatierern.

- [ ] Tests zuerst: gleiche vier Serien/Werte/Reihenfolge wie bisher; `null` bleibt `null`, negative Werte bleiben negativ; Inputliste wird nicht mutiert. Testdaten aus den bestehenden Config-Tests wiederverwenden.
- [ ] Beispiel des reinen Serienvertrags, im bestehenden Testsetup `points` aus dem vorhandenen Fixture verwenden:

```ts
const series = buildRevenueSeries(points);
expect(series.map((entry) => entry.name)).toEqual([
  'Verkaufserlös',
  'Wareneinsatz',
  'Verkaufskosten',
  'Ergebnis nach direkten Kosten',
]);
expect(series[0].data).toEqual(points.map((point) => point.revenue));
expect(series[3].data).toEqual(points.map((point) => point.resultAfterDirectCosts));
```

- [ ] Reine Optionen mit importierten Apex-Typen erstellen: Linien, dezentes Raster, EUR-Achse, keine Datenpunktbeschriftungsflut, keine punktlosen Nullwerte als Nulllinie. Keine Glättung über unbekannte Abschnitte. Gewählte Defaultdarstellung zeigt alle vier Reihen, einzelne Reihen sind über Legende ein-/ausblendbar.
- [ ] `ChartComponent` des offiziellen Wrappers in der separaten HTML-Datei verwenden; keine Inline-Templates aus Herstellerbeispielen übernehmen. Theme-/Datenänderung aktualisiert Signals und darf keine liegenbleibenden Chartinstanzen erzeugen.
- [ ] Laufzeitfehler/fehlgeschlagener Lazy-Import zeigt verständlichen Fehler mit erneuter Ladeaktion und weiterhin zugänglichen Daten. Resize, Route verlassen/wiederkommen, leere/Einpunkt-Daten und große Zeiträume prüfen.
- [ ] Bestehende Tastaturbedienung und zugängliche Datentabelle erhalten. Falls der neue Renderer den gleichen Tastaturvertrag nicht trägt, vorhandenen Shared-Datenpunktnavigator rendererunabhängig anbinden; kein ersatzloses Entfernen des Sliders/Screenreadertexts.
- [ ] Reduced Motion deaktiviert Diagrammanimationen. Tastatur und Touch öffnen dieselben Datumsdetails wie Pointer-Hover. Tooltips am Fensterrand bleiben sichtbar, ohne dynamische Nutzerdaten als ungeprüftes HTML einzusetzen.

## C3 – Typografie und Verkaufsjournal angleichen

**Dateien:** `src/app/features/dashboard/dashboard.component.html`, `.ts`, `.angular.spec.ts`; Shared-RevenueChart-Template; vorhandene `shared/components/card`, `table-sort-header`, `table-toolbar`, `button` nur erweitern, wenn der benötigte Vertrag dort fehlt. Neue `e2e/dashboard-design.spec.ts`.

- [ ] Rote Tests gegen `uppercase` und dekoratives Letterspacing an beiden Abschnittsüberschriften und Tabellenkopf. Kleinere Ergänzungstexte auf mindestens 12 px, normale Texte auf mindestens 13 px bringen.
- [ ] Kartenheader, Journalcontainer, Tabellenkopf, Zeilendichte, Hover und Link „Verkäufe öffnen“ mit den vorhandenen gemeinsamen Bausteinen abgleichen. Keine Sonderfarbe nur für diesen Link. Währungen und Mengen rechtsbündig und tabellarisch lesbar.
- [ ] Bericht ist keine Eingabetabelle: keine Spaltenauswahl/Filterleiste hinzufügen, wenn der bestehende Bericht diese Funktionen nicht benötigt. „Keine bestätigten Verkäufe“, „Keine Treffer“, Laden und Fehler unterscheidbar belassen.
- [ ] Mobile Journalansicht zeigt dieselben Werte; lange Artikelnamen/Plattformen und negative Ergebnisse dürfen den Seitenrahmen nicht verbreitern.
- [ ] Alle Beträge und Summen vor/nachher anhand der vorhandenen `DashboardTimePoint`-/Reportfixtures identisch prüfen. Der Fall aus B3 (35 EUR Wareneinsatz) muss auch im Journal und Chart unverändert ankommen.

## C4 – Entfernen des alten Renderers und Gesamtprüfung

- [ ] Vor dem Entfernen alle Verbraucher ermitteln:

```powershell
rg -n 'chart\.js|ChartConfiguration|TooltipModel|REVENUE_CHART_FACTORY' src e2e package.json
```

- [ ] Wenn kein aktiver Verbraucher übrig ist, `revenue-chart.chart.ts` einschließlich ausschließlich zugehöriger Tests entfernen und `npm uninstall chart.js` ausführen. Historische Plandokumente nicht als angebliche Codeverbraucher behandeln.
- [ ] Ausführen:

```powershell
npx vitest run --project=node src/app/shared/components/revenue-chart/revenue-chart.config.spec.ts
npx vitest run --project=angular src/app/shared/components/revenue-chart src/app/features/dashboard
npm run typecheck
npm run build
npx playwright test e2e/dashboard-design.spec.ts
```

- [ ] Geänderte Dateien formatieren/linten und Bundlebericht prüfen: Apex nicht zusätzlich zu Chart.js im ausgelieferten Code; kein globaler Script-Eintrag. Keine Budgeterhöhung als Ersatz für Importprüfung.
- [ ] Desktop/Mobil, hell/dunkel, Tastatur/Touch, Reduced Motion, Null-/Negativ-/Einpunkt-/Leerdaten und Tooltipposition visuell prüfen; AXE ohne deaktivierte Regeln. Endgültige optische Abnahme ist erforderlich, nicht nur ein erfolgreich gerendertes SVG.
- [ ] Changelog und Quellen aktualisieren. Bei Commitfreigabe `feat(ui): adopt ApexCharts for dashboard reporting`; Veröffentlichung ausschließlich nach separatem Auftrag und grünen PR-Prüfungen.
