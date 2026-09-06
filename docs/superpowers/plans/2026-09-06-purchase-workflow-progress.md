# Umsetzung Einkaufsumbau – Fortschritt

Stand: Umsetzung beauftragt am 2026-09-06. Eigener bestehender Worktree purchase-workflow-plan. Kein fremder Zweig geändert.

| Paket                              | Verantwortung  | Stand / Vertrag                                                                               |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| Tabellen/Flohmarkt                 | purchase_list  | in Arbeit; record_number, shipment_status, supplier_reference                                 |
| Erfassung/Verkäufer/Scanner        | purchase_entry | in Arbeit; content_status known/unknown, pricing_mode individual/total                        |
| Nummernkreise                      | numbering      | in Arbeit; 110_numbering.sql, record_number/numbering_series_id/numbered_at/numbering_version |
| Datenverträge/Status/Kosten        | root           | in Arbeit; Migrationen/Typen zentral erzeugen                                                 |
| Details/Design/Chronik             | root           | offen                                                                                         |
| Integration/Tests/visuelle Abnahme | root           | offen                                                                                         |

Entscheidungen: Alle-Ansicht ohne Archiv. Bestehende technische Einkaufsarten erhalten, neue Preisregeln unabhängig. Erstellen immer Entwurf ohne Bestand. Ankunft separat von Artikelaufnahme; unbekannter Inhalt wird ausdrücklich abgeschlossen. Unbekannte Kosten nicht als Null anzeigen. Bereits gebuchte Kosten nicht still verändern. Kein Verkaufsfreigabe-Umbau ohne vorhandene fachliche Absicherung. Rabatt ist separate Warenpreisreduktion, keine negative Nebenkostenzeile. Rücksetzung stellt gemeinsame Standardansicht her. Keine Veröffentlichung in diesem Umsetzungsschritt ohne vollständige Prüfung.

Schnittstellenüberschneidungen: root besitzt core/models, purchase.service und bestehendes SQL; Agenten melden benötigte Felder. Root generiert alle Migrationen und Typen nach Schemaabschluss. Nummernagent besitzt neue Schema-Datei; UI-Agenten lesen gemeinsame Typen. Tests nach Integration prüfen diese Verträge.
