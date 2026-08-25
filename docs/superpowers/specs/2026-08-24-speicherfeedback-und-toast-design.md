# Speicherfeedback und Toasts – Design

## Ziel

Beim Anlegen eines Artikels muss zuerst der echte Datensatz gespeichert werden. Erst danach dürfen abhängige Aktivitätsprotokolle entstehen. Nutzer erhalten für abgeschlossene Aktionen eine kurze, verständliche Rückmeldung unten rechts.

## Speicherregeln

- Im Live-Modus wird der Artikel zuerst in `inventory_items` gespeichert. Das Aktivitätsprotokoll verwendet ausschließlich die von Supabase zurückgegebene Artikel-ID.
- Ein vorläufig angezeigter Artikel wird bei einem Datenbankfehler vollständig aus dem lokalen Signal entfernt.
- Im Demo-Modus bleiben lokale Kennungen und lokale Aktivitätsprotokolle erlaubt.
- Statusprotokolle und Kostenprotokolle entstehen erst nach erfolgreicher Primäränderung.
- Formulare bleiben bei Fehlern geöffnet und behalten die Eingaben.

## Toast-System

- `ToastService` verwaltet flüchtige Meldungen als Signal und bietet `success`, `error`, `warning` und `info`.
- `ToastContainerComponent` wird genau einmal im Shell-Layout eingebunden, steht unten rechts und stapelt höchstens vier Meldungen.
- Erfolg und Information verschwinden nach vier Sekunden, Warnungen nach sechs und Fehler nach acht Sekunden. Jede Meldung kann sofort geschlossen werden.
- Die Komponente nutzt `role="status"` für normale Meldungen und `role="alert"` für Fehler. Bewegungen respektieren `prefers-reduced-motion` über Tailwind.
- Der bestehende `SyncErrorBanner` bleibt für nicht dauerhaft gespeicherte Daten zuständig. Ein roter Toast ergänzt die unmittelbare Rückmeldung, ersetzt das Banner aber nicht.

## Erste Anbindungen

- Artikel in einem Einkauf anlegen: Erfolg oder Fehler.
- Einkauf löschen: Erfolg oder Fehler; Navigation nur bei Erfolg.
- Einkaufskosten anlegen und löschen: Erfolg oder Fehler.
- Weitere Bereiche können später über denselben Service angebunden werden, ohne neue UI-Komponenten zu bauen.

## Abgrenzung

- Keine neue externe Bibliothek.
- Keine Datenbankmigration.
- Kein vollständiger Umbau aller optimistischen Schreibvorgänge in dieser Änderung; geprüft und korrigiert werden die unmittelbar verwandten Inventar- und Einkaufsabläufe.
