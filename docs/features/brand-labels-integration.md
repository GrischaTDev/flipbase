# Marken-, Label- und Größenreferenzen

Stand: 08.10.2026. Assistent: Juna. Lokale Fortsetzung von PR 331.

Unter `/tools/brand-labels` vergleichen Nutzer veröffentlichte Bekleidungslabels.
`/tools/brand-labels/sizes` zeigt quellengebundene Größenreferenzen für Hosen,
Oberteile, Schuhe und weitere Kleidung. Die Sammlung enthält keine erfundenen
Markenbelege oder pauschalen Größenumrechnungen. Sie liefert Vergleichsmaterial,
kein automatisches Echtheitsurteil.

Plattformbetreiber pflegen globale Referenzmarken und Linien, Bilder mit
Bildrechten, Labels und Größentabellen unter `/tools/brand-labels/admin`.
Workspace-Stammdaten bleiben getrennt. Die Redaktion öffnet den Leserzugang
nach einer gültigen Label- oder Größenveröffentlichung ausdrücklich.
Leser benötigen einen gültigen Workspacezugang.

Die Schemata `430` bis `440` sind registriert; die erzeugte Migration enthält
Startzeilen und eingeschränkte Rollenrechte. Die API-Typen stammen aus der
frisch migrierten lokalen Supabase. Der CLI-Abgleich allein erfasst weder
Startzeilen noch sämtliche geerbten Supabase-Rechte. Der tatsächliche
Migrationspfad wird zusätzlich über
`supabase/tests/reference-library-permissions.test.sql` geprüft.

Die Edge Function `brand-label-media` muss vor der Leserfreigabe mit den
übrigen Funktionsordnern bereitgestellt werden, siehe
[Deployment](../../deploy/README.md). Bilder bleiben privat. Der Endpunkt prüft
die aktuelle Anmeldung und Freigabe und erstellt Links mit 60 Sekunden Laufzeit.
Browser erhalten keine direkte Storage-Lesepolicy.

Redaktionelle Referenzinhalte und Bilder werden über die Oberfläche eingepflegt.
Die lokale Umsetzung und Abnahme verändern keine Produktionsdaten. Push, PR,
Merge und Produktionsfreigabe folgen erst nach dem vereinbarten PR-Abschluss.
