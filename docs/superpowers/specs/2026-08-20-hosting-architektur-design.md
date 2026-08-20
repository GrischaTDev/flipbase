# Hosting-Architektur: ReFlip und Wiehenstore

**Datum:** 2026-08-20
**Beteiligt:** Grischa Tänzer, Claude Opus 5
**Status:** Grundinstallation umgesetzt, DNS-Umstellung offen

---

## Ausgangsfrage

Die Domain `wiehenstore.de` wurde registriert. Zu klären war, wie ReFlip
(das Betriebssystem) und der öffentliche Shop zueinander stehen und wo beides
gehostet wird.

## Getroffene Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Shop und ReFlip trennen? | **Ja, nach Domain getrennt** | ReFlip ist das Werkzeug, Wiehenstore die Kundenmarke. Ein Shop braucht seine eigene Domain. |
| Mehrmandantenfähigkeit jetzt bauen? | **Nein, bewusst zurückgestellt** | Es gibt einen Nutzer und einen Shop. Die Grenze lässt sich später ziehen; `store_settings` hält das Impressum bereits pro Shop. |
| Getrennte Angular-Builds? | **Nein, eine App** | Ein Bundle für beide Domains. Der Kunde lädt dabei den Dashboard-Code mit – bei einem kleinen Shop hinnehmbar. Aufteilen, wenn es stört. |
| Dashboard-Domain | **`app.n3odev.de`** | Technische Verwaltungsadresse, unabhängig von der Shop-Marke. Kein Domainkauf nötig. |
| Hosting | **Eigener Server statt netcup-Webhosting** | Shared Hosting kann weder Docker noch Supabase noch Edge Functions. Der fertige Container aus Phase 7 läuft auf dem Server unverändert. |
| Datenbank | **Supabase selbst gehostet** | Volle Kontrolle über Geschäfts- und Steuerdaten; Preis. Gegenleistung: Sicherungen und Updates liegen beim Betreiber. |
| Anbieter | **Hetzner CX33** (4 Kerne, 8 GB, 80 GB) | Nach Preisvergleich mit netcup, Contabo und Hostinger. netcup wäre bei mehr Plattenplatz ähnlich teuer; entschieden wurde für Hetzner. |

### Verworfene Alternativen

- **Alles auf netcup-Webhosting** – technisch unmöglich für Supabase und Edge Functions.
- **Supabase auf dem bestehenden n8n-Server** – 2 Kerne / 3,7 GB reichen nicht; Gefahr, dass n8n mitgerissen wird.
- **Hostinger VPS** – Einstiegspreis nur bei mehrjähriger Vorauszahlung, Verlängerung etwa doppelt, und nur 2 Kerne.
- **Supabase Cloud** – wurde erwogen; verworfen zugunsten voller Datenhoheit.

---

## Zielbild

```
Server 168.119.246.33 (Hetzner CX33, Ubuntu 26.04 LTS)
│
├── Caddy ─────────────────── Ports 80/443, Zertifikate automatisch
│   ├── api.n3odev.de ....... Supabase (API offen, Studio hinter Passwort)
│   ├── app.n3odev.de ....... ReFlip-Dashboard, noindex
│   └── wiehenstore.de ...... Shop (später, siehe offene Punkte)
│
├── reflip-web .............. Angular-App hinter nginx, Container aus Phase 7
│                             keine öffentlichen Ports, nur über Caddy
│
└── Supabase (self-hosted v0.8.0)
    └── db, auth, rest, realtime, storage, imgproxy, meta,
        functions, studio, supavisor, envoy
        Alle Ports ausschliesslich auf 127.0.0.1
```

### Sicherheitsgrundsätze

1. **Docker umgeht ufw.** Deshalb binden Datenbank (5432), Pooler (6543) und
   API-Gateway (8000) ausschliesslich an `127.0.0.1`. Festgehalten in
   `docker-compose.localports.yml` – als Zusatzdatei, damit Supabase-Updates
   sie nicht überschreiben.
2. **Nach aussen offen sind nur 22, 80 und 443.**
3. **Anmeldung ausschliesslich per SSH-Schlüssel**, Passwortanmeldung abgeschaltet.
4. **Öffentliche Registrierung abgeschaltet** (`DISABLE_SIGNUP=true`) – Konten
   legt nur der Betreiber über Studio an.
5. **RLS auf allen 32 Tabellen**, Storage-Bucket nicht öffentlich.

---

## Umgesetzt

- Grundhärtung: ufw, 4 GB Swap (`vm.swappiness=10`), automatische
  Sicherheitsupdates, SSH nur mit Schlüssel
- Docker 29.7.2 mit Compose v5.5.0
- Supabase self-hosted v0.8.0, alle Dienste gesund, ~1,7 GB RAM belegt
- Alle sechs Migrationen eingespielt; 32 Tabellen, 123 Policies, alle mit RLS
- ReFlip-Container gebaut und laufend, Gesundheitsprüfung grün
- Caddy-Konfiguration vorbereitet für `api.` und `app.`

### Behobene Fehler nebenbei

- **Healthcheck schlug immer fehl:** `http://localhost/healthz` löst im Container
  zuerst auf IPv6 auf, nginx lauscht nur auf IPv4. Jetzt `127.0.0.1`.
- **CSP hätte die Anwendung lahmgelegt:** `connect-src` erlaubte nur die lokale
  Entwicklungsdatenbank. Jetzt `https://api.n3odev.de` und `wss://` für Realtime.

---

## Offene Punkte

| # | Punkt | Blockiert durch |
|---|---|---|
| 1 | DNS: `app` und `api` als A/AAAA auf den Server | Grischa |
| 2 | Caddy aktivieren, Zertifikate holen | Punkt 1 |
| 3 | Erstes Benutzerkonto in Studio anlegen | Punkt 2 |
| 4 | Nächtliche Datensicherung per Cron einrichten | – |
| 5 | Shop: Zahlungsart am Starttag (Schaufenster / Vorkasse / Stripe abwarten) | Entscheidung Grischa |
| 6 | Einstiegsroute je nach Hostname (`/shop` statt `/dashboard`) | Punkt 5 |
| 7 | Rechtstexte für den Shop | Grischa (Anwalt / Händlerbund) |
| 8 | Phase 8 des Sanierungsplans | – |
| 9 | Projekt hat kein Git-Remote – Quellcode liegt nur lokal | Grischa |
