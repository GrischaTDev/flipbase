# Kosten und Steuerberechnung

Freigegeben: Nutzer „Los“, Basis origin/master 15b07ca.

1. Positive Einzeldifferenzen getrennt berechnen. Die darin enthaltene Steuer
   herausrechnen; Verlustpositionen dürfen andere Steuern nicht vermindern.
2. Einkaufspreis für § 25a getrennt von betriebswirtschaftlichen Gesamtkosten
   speichern. Verkäuferleistungen und separat bezahlte Kosten unterscheiden.
   Keine Rückdatierung oder erfundene Zuordnung für Altdaten.
3. Steuerkosten beim Verkauf festhalten, auch für Losentnahmen. Gemeinsame
   Verkaufskosten und Käufer-Versand centgenau verteilen; niemals die Steuer
   einer letzten Position auf eine vorher aggregierte Marge abstimmen.
4. Keine Vorsteuer allein aus Kostenbetrag/Kostenart ableiten. Eine belegbezogene
   Vorsteuererfassung ist noch nicht vorhanden; dies in der Auswertung klarstellen.
5. Fehlende steuerliche Herkunft sichtbar lassen, betroffene Steuerexporte sperren.
   Monatsbericht und Journal verwenden dieselben Positionswerte.
6. Gezielte Rechen-, Datenbank- und UI-Tests, Typen, Format/Lint und Angular-Bau;
   abschließendes unabhängiges Review. Danach PR-Freigabe einholen.

Quellen: § 25a Abs. 3/6 UStG, § 15 UStG, UStAE 25a.1 Abs. 8/11 sowie
Art. 312/315 Richtlinie 2006/112/EG. Keine Gesamtdifferenz oder Pauschalmarge
implementieren. Keine neue Shop-, Wareneingangs- oder Konvolutoberfläche.
