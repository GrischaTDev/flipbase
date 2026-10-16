# Kleinanzeigen: lesend geprüfte Anbieterverträge

Geprüft am 16.10.2026 in einer bereits angemeldeten privaten Browsersitzung. Keine Anzeige veröffentlicht, kein Entwurf gespeichert, keine echten Kontoeinstellungen geändert. Personenbezogene Profildaten und vollständige Seitenquellen werden nicht als Fixtures abgelegt. Die Tests verwenden synthetische Identitäten.

## Kontokennung und offizielles Kontingent

Auf /m-einstellungen.html und im Anzeigenformular steht die Identität in einem Script mit id astroSharedData und type application/json. user.userId und userProfile.userId müssen als Dezimalstrings identisch sein. Privatkonto wird nur bei accountType PRIVATE zusammen mit commercialUser false angenommen. Kontaktname, Kontokennung und Kontotyp sind die einzigen übernommenen Profilfelder.

Die Einstellungsseite zeigte unabhängig voneinander 17 aktive Anzeigen und 8 in den letzten 30 Tagen aufgegebene Anzeigen. Nur der ausdrücklich beschriftete 30-Tage-Zähler ist eine Kontingentquelle. Aktive Anzeigen sind dafür ungeeignet. Der Adapter fordert genau ein passendes Zählerfeld und eine erfolgreiche Kontoprüfung.

Die eigene Anzeigenliste hat aktuell keine Astro-Identität. Ein literaler Aufruf window.myAdsFrontend.render mit userId identifiziert das Konto. Er wird als Text gelesen, niemals ausgeführt. Kontoname aus der Überschrift Profil von und die ausdrückliche Angabe Privater Nutzer vervollständigen diesen älteren Vertrag. Gewerbliche Konten mit diesem älteren Format sind nicht nachgewiesen.

## Eigene Anzeigen und Seitenabschluss

Liste: #my-manageitems-adlist. Jede direkte Zeile hat data-testid ad-card und data-adid. Der Link unter h3 muss auf dieselbe Kleinanzeigen-Domain zeigen und die identische Anzeigenkennung tragen. Das sichtbare Ablaufdatum ist kein Veröffentlichungsdatum; publishedAt bleibt deshalb null.

Die Seitennavigation hat die zugängliche Beschriftung Seiten-Navigation, teils über aria-labelledby. Genau ein Button hat aria-current page und die Beschriftung Seite 1. Der Button Nächste ist am beobachteten Ende mit aria-disabled true gesperrt; das native disabled-Attribut allein genügt nicht. Die beobachtete Liste hat 17 Einträge auf einer Seite. Ein tatsächlicher Wechsel auf eine zweite Seite ist mangels weiterer Seite bisher nicht live geprüft. Fehlende Navigation, Loginseite oder unbekannte Kennung dürfen keinen vollständigen leeren Abgleich ergeben.

## Anzeigenformular und Kategorien

Formular: /p-anzeige-aufgeben-schritt2.html. Gemessen: #ad-title mit maximal 65 Zeichen und #ad-description mit maximal 4000 Zeichen. Foto-Hilfe: bis zu 20 Fotos mit jeweils maximal 12 MB. Der Datei-Input erlaubt mehrere Dateien, hat aber keinen stabilen id-Wert. Diese Grenzen bestätigen die bisherigen Textgrenzen in Flipbase.

Die leere Kategorieauswahl wurde bis Mode & Beauty (153), Herrenbekleidung (160), Shirts (shirts) geöffnet. Das Anzeigenformular zeigt anschließend kleidung_herren.art, kleidung_herren.brand, kleidung_herren.groesse und kleidung_herren.color. Der Zustand wird über einen Button mit zugänglicher Beschriftung Zustand auswählen bedient; die Beschriftung des Felds ist kein Beleg für eine gleichnamige id am Button. Die sichtbaren Zustandsoptionen sind Neu mit Etikett, Neu, Sehr Gut, Gut, In Ordnung. Größenoptionen umfassen Einheitsgröße und XXS bis 8XL & mehr. Interne Optionskennungen und alle Pflichtfeldregeln sind noch nicht vollständig belegt. Vinted-Kennungen dürfen nicht als Kleinanzeigen-Optionen übernommen werden.

Weitere sichtbare Felder: #ad-price-amount, #ad-zip-code, #ad-name, #ad-street, #ad-price-type, #ad-shipping-enabled-yes und -no sowie #ad-shipping-options. Native required-Attribute beschreiben die fachlichen Pflichtfelder nicht vollständig. Direkt kaufen kann zeitversetzt automatisch ausgewählt werden; daraus folgt keine Zustimmung zu zusätzlichen Bedingungen.

## Gebühren und Ergebnisbeleg

Der Abschnitt Kostenpflichtige Optionen ist auch beim kostenlosen Privatkontingent vorhanden. Die vier beobachteten Checkboxen haben name articles und die Werte 0:204 (Highlight), 0:914 (Wiederholtes Hochschieben), 0:62 (Top-Anzeige), 0:488 (Galerie). Alle waren abgewählt. Die pauschale Suche nach dem Wort kostenpflichtig würde deshalb auch kostenlose Anzeigen blockieren. Ausgewählte Zusatzoptionen dürfen nie automatisch bezahlt werden.

Der eigentliche Veröffentlichungsbutton heißt Anzeige aufgeben und hat type button, aria-disabled und aria-busy; eine stabile id ist nicht vorhanden. Es wurde nicht darauf geklickt. Ein konkreter Gebührenwarnungszustand bei erschöpftem Kontingent, eine Verarbeitungsbestätigung und die aktive Ergebnisanzeige sind bisher nicht live beobachtet. Keine synthetische Erfolgsfixture wird als Live-Nachweis bezeichnet. Die automatische Veröffentlichung bleibt deaktiviert, bis Formular-, Gebühren- und Ergebnisadapter fertig und geprüft sind. Ein geöffneter Tab oder Klick allein ist kein Veröffentlichungsbeleg.

Die offizielle [Gebührenhilfe](https://hilfe.kleinanzeigen.de/hc/de/articles/17087642921628-Geb%C3%BChren-bei-Kleinanzeigen) beschreibt den privaten 30-Tage-Zähler und den Gebührenhinweis vor dem Einstellen. Die genaue Einordnung des Bekleidungsbereichs und die Grenzen stehen ergänzend in der [Privatkonto-Recherche](2026-10-15-kleinanzeigen-private-listing-quota.md). Bei unbekanntem Kontotyp, unbekanntem Kontingent oder nicht eindeutig kostenlosem Formular wird gestoppt.

## Ergänzende Formularaufnahme, 16. Oktober 2026

Die Kategorieauswahl liegt auf /p-kategorie-aendern.html. Sichtbare Links unter #postad-category-select-box verwenden cat_<code> und #?path=...&isParent=true beziehungsweise undefined. Beispiel nur als belegte Navigation, nicht als allgemeine Zuordnung: 153 → 160 → shirts. Nach einer Blattwahl sendet Weiter das Kategorieformular an /p-anzeige-aufgeben-schritt2.html; es veröffentlicht keine Anzeige.

Die vier Grundfelder haben die gemessenen Grenzen 65/4000/8/5 Zeichen. Ein kurz eingegebener, anschließend vollständig gelöschter Preis 12,34 wurde nach Fokuswechsel als 1234 angezeigt. Der automatische Weg verlangt deshalb volle Euro und erhält Centbeträge bis zur bewussten Korrektur. Optionale Eigenschaften melden aria-required=false. Die bewusste Zustandswahl ist eine zusätzliche Flipbase-Prüfung, keine behauptete Anbieterpflicht. Zustand stammt aus dem offenen nativen Dialog: new_with_tag/new/like_new/ok/alright. Eigenschaftslisten werden mit Escape ohne Wertänderung geschlossen.

Versanddialog: Andere Versandmethoden → Paketgröße SMALL/MEDIUM/LARGE → Weiter → angebotene Checkboxwerte. SMALL: HERMES_001, HERMES_002, DHL_001; MEDIUM: HERMES_003, DHL_002; LARGE: HERMES_004, DHL_003, DHL_005, DHL_004. Labels, Beschreibungen und Preise werden aktuell gelesen, nicht aus dieser Aufnahme festgeschrieben. Käufer bezahlt, Abholung bleibt möglich. Alle Erkundungsdialoge wurden mit Schließen/Abbrechen beendet, kein Fertig/Bestätigen, Upload, Speichern oder Inserieren.

Ein ausdrücklich kostenloser Gesamtpreis der Veröffentlichung wurde noch nicht beobachtet. Das Wort kostenlos bei Direkt kaufen ist kein Beleg für kostenlose Veröffentlichung. Eine mögliche Ableitung aus frischem Privatkontingent, Konsumgüterkategorie und nicht ausgewählten Zusatzoptionen ist bislang kein bestätigter Submitvertrag. Der Veröffentlichungsadapter und reale Erfolgsbeleg bleiben offen.

Zusätzliche lesende Prüfung 16.10.: Zustandsdialog bestätigt mit „Bestätigen“ (abgebrochen, keine Auswahl). Bildinput multiple, accept image/jpeg,image/gif,image/png,.heic,.HEIC,.heif,.HEIF; WebP nicht ausdrücklich im accept belegt. Keine tatsächliche Bildübertragung durchgeführt. Bildbereich besitzt im leeren Zustand keine festen IDs/Test-IDs; untergeordnete Vorschau-/Erfolgssignale sind noch nicht live geprüft. Vier bezahlte articles-Checkboxen besitzen jeweils eine role=group-Grenze und data-includedfp=false. Veröffentlichungsbereich zeigt regulär keinen expliziten Null-Gesamtpreis. Gebührenfreiheit aus frischem offiziellen Kontingent + privater Modekategorie + sämtlichen ungewählten Zusatzoptionen wäre eine abgeleitete Aussage anhand der Gebührenbedingungen, kein sichtbarer Nullpreis. Ein Anbieterfehler, abweichender Bezahl-/Gebührenschritt oder unbekanntes Layout muss diese Ableitung blockieren.

## Implementierter Prüfstand

Der Adapter und die dauerhafte Auftragssteuerung sind implementiert. Die Veröffentlichungscapability wird erst beim Laden sämtlicher benötigter Erweiterungsmodule angeboten. Gebührenfreiheit wird aus dem frischen offiziellen Privatkontingent, der belegten Modekategorie und ungewählten bezahlten Optionen abgeleitet; ein sichtbarer Null-Gesamtpreis wird damit nicht behauptet. Sichtbare Gebühren, unbekannte ausgewählte Zusatzoptionen, Formularfehler und fehlende oder unklare Daten stoppen vor dem Submit. Geschlossene Dialoge und Beschreibungstext gelten nicht als aktuelle Gebührenmeldung.

Reale MV3-Läufe mit unveränderter Erweiterung prüfen lokal Kategorieauswahl, native Zustandsauswahl, Binärbilder mit Prüfsumme, letzte Kontingentprüfung, begin vor genau einem Submit und anschließenden Statusabgleich. Anbieterantworten sind synthetisch und bleiben vollständig lokal. Windows und Linux verwenden Chromium 151. Ein separater echter Browserneustart aus einem gespeicherten writing-Versuch führt ausschließlich zum lesenden Ergebnisabgleich.

Der echte Anbieter-Upload und die echte Erfolgsseite sind weiterhin nicht live abgenommen. Die erwartete Ergebnisnavigation nach dem Formular ist eine prüfbare Ableitung, kein beobachteter Livevertrag. Nur ein neuer, eindeutig zugeordneter Ergebnislink zusammen mit identischem Konto und bestätigtem aktivem Eintrag in der vollständigen eigenen Anzeigenliste kann Erfolg belegen; jeder Zweifel bleibt outcome_unknown und sperrt einen erneuten Submit. WebP ist im beobachteten Datei-Input nicht ausdrücklich angeboten; eine nicht bestätigte Übernahme stoppt. Eine echte Veröffentlichung erfordert erst die ausdrückliche Auswahl und Freigabe eines konkreten Artikels.
