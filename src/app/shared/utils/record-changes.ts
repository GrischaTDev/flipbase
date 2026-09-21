/**
 * Vergleicht die `changes`-Nutzlast eines Geschäftsereignisses und liefert je
 * tatsächlicher Änderung eine Zeile. Unveränderte Werte fallen weg, damit ein
 * gespeicherter Schnappschuss nicht als Liste aller Felder erscheint.
 */
export interface RecordChange {
  readonly label: string;
  /** Alter Wert; `null`, wenn es keinen sinnvollen Vorher-Wert gibt. */
  readonly from: string | null;
  /** Neuer Wert; `null`, wenn es keinen sinnvollen Nachher-Wert gibt. */
  readonly to: string | null;
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  purchase_price: 'Einkaufspreis',
  shipping_cost: 'Versandkosten',
  other_costs: 'Sonstige Kosten',
  total_purchase_cost: 'Gesamte Einkaufskosten',
  allocated_total_cost: 'Zugeordnete Gesamtkosten',
  entry_status: 'Status',
  receiving_status: 'Wareneingang',
  shipment_status: 'Versandstatus',
  arrived_at: 'Angekommen am',
  sale_id: 'Verkauf',
  refund_amount: 'Erstattungsbetrag',
  returned_at: 'Retourniert am',
  is_full_refund: 'Vollerstattung',
  restock_action: 'Wiedereinlagerung',
  restocked_quantity: 'Wiedereingelagerte Menge',
  migration: 'Übernahme',
  item_count: 'Artikelanzahl',
  is_package: 'Paketposition',
  purchase: 'Einkauf',
  costs: 'Kosten',
  inventory_items: 'Bestandsartikel',
  lines: 'Positionen',
  title: 'Bezeichnung',
  title_snapshot: 'Bezeichnung',
  ordered_quantity: 'Menge',
  unit_purchase_price: 'Stückpreis',
  line_total: 'Positionssumme',
  amount: 'Betrag',
  description: 'Beschreibung',
  type: 'Art',
  allocation_method: 'Kostenverteilung',
  target_line: 'Zielposition',
  source_id: 'Bezugsquelle',
  supplier_id: 'Verkäufer',
  purchase_date: 'Einkaufsdatum',
  cost_allocation_mode: 'Kostenverteilung',
  notes: 'Beschreibung',
  source_name: 'Bezugsquelle',
  supplier_name: 'Verkäufer',
  tracking_number: 'Sendungsnummer',
  tracking_carrier: 'Versanddienstleister',
  tracking_status: 'Sendungsstatus',
  content_status: 'Inhaltskenntnis',
  pricing_mode: 'Preisführung',
  supplier_reference: 'Verkäuferreferenz',
  seller_type: 'Verkäuferart',
  seller_name: 'Verkäufername',
  seller_street: 'Straße',
  seller_address_extra: 'Adresszusatz',
  seller_postal_code: 'PLZ',
  seller_city: 'Ort',
  seller_country_code: 'Land',
  document_type: 'Belegart',
  original_file_name: 'Dateiname',
  discount_amount: 'Rabatt',
  catalog_product_id: 'Katalogartikel',
  ean_snapshot: 'EAN',
  line_kind: 'Positionsart',
  allocated_additional_cost: 'Zugeordnete Zusatzkosten',
  price_mode: 'Preisführung',
  condition_snapshot: 'Zustand',
  estimated_market_value: 'Geschätzter Marktwert',
  direct_costs: 'Direkte Kosten',
  external_order_id: 'Bestellnummer',
};

const MONEY_KEYS: ReadonlySet<string> = new Set([
  'purchase_price',
  'shipping_cost',
  'other_costs',
  'total_purchase_cost',
  'allocated_total_cost',
  'refund_amount',
  'unit_purchase_price',
  'line_total',
  'amount',
  'discount_amount',
  'allocated_additional_cost',
  'estimated_market_value',
]);

const VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  receiving_status: {
    draft: 'Entwurf',
    ordered: 'Bestellt',
    partially_received: 'Teillieferung',
    received: 'Angekommen',
    archived: 'Archiviert',
    cancelled: 'Storniert',
  },
  shipment_status: {
    not_shipped: 'Nicht versendet',
    in_transit: 'Unterwegs',
    arrived: 'Angekommen',
  },
  entry_status: {
    draft: 'Entwurf',
    capturing: 'In Erfassung',
    finalized: 'Abgeschlossen',
  },
  tracking_status: {
    pending: 'Noch nicht unterwegs',
    in_transit: 'Unterwegs',
    out_for_delivery: 'In Zustellung',
    delivered: 'Zugestellt',
    exception: 'Problem beim Versand',
  },
  content_status: { known: 'Bekannt', unknown: 'Unbekannt' },
  pricing_mode: { individual: 'Einzelpreise', total: 'Gesamtpreis' },
  price_mode: {
    priced: 'Preis erfasst',
    open: 'Preis offen',
    unpriced_mystery: 'Preis wird verteilt',
  },
  condition_snapshot: {
    new: 'Neu',
    like_new: 'Wie neu',
    very_good: 'Sehr gut',
    used: 'Gebraucht',
    heavily_used: 'Stark gebraucht',
    defective: 'Defekt / Ersatzteil',
  },
  cost_allocation_mode: {
    manual: 'Manuell',
    even: 'Gleichmäßig',
    value_weighted: 'Nach Artikelwert',
  },
  allocation_method: {
    direct: 'Direkt zugeordnet',
    quantity: 'Nach Stückzahl',
    value_weighted: 'Nach Artikelwert',
  },
  tracking_carrier: {
    dhl: 'DHL Paket',
    dpd: 'DPD',
    hermes: 'Hermes',
    ups: 'UPS',
    gls: 'GLS',
    fedex: 'FedEx',
    deutsche_post: 'Deutsche Post',
    other: 'Anderer Dienstleister',
  },
};

const CURRENCY_FORMATTER = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

/** Einzahlform für Einträge einer Liste, damit „Position 2“ statt „Positionen · 2“ erscheint. */
const LIST_ITEM_LABELS: Readonly<Record<string, string>> = {
  lines: 'Position',
  costs: 'Kostenposition',
  inventory_items: 'Artikel',
  direct_costs: 'Direkte Kosten',
};

/** Behälter, die den Datensatz selbst benennen und in seiner Chronik nichts beitragen. */
const REDUNDANT_CONTAINERS: ReadonlySet<string> = new Set(['purchase', 'sale']);

/** Rein technische Felder, die in einer Chronik nichts erklären. */
const TECHNICAL_KEYS: ReadonlySet<string> = new Set([
  'id',
  'workspace_id',
  'created_at',
  'updated_at',
  'correlation_id',
]);

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u;

/** Felder, aus denen eine kurze Bezeichnung für einen ganzen Listeneintrag stammt. */
const SUMMARY_FIELDS = ['title', 'title_snapshot', 'description', 'name'] as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return /token|secret|password|api[_-]?key|authorization|webhook[_-]?url/iu.test(key);
}

function equalValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => equalValue(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && equalValue(left[key], right[key]))
    );
  }
  return false;
}

export function humanizeRecordKey(key: string): string {
  const label = FIELD_LABELS[key];
  if (label) return label;
  const words = key.replaceAll('_', ' ').replaceAll('-', ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Wert';
}

export function formatRecordValue(value: unknown, key: string): string {
  if (isSensitiveKey(key)) return '[geschützt]';
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  if (typeof value === 'number')
    return MONEY_KEYS.has(key)
      ? CURRENCY_FORMATTER.format(value)
      : new Intl.NumberFormat('de-DE').format(value);
  if (typeof value === 'string') return VALUE_LABELS[key]?.[value] ?? formatIsoDate(value);
  if (Array.isArray(value)) return `${value.length} Einträge`;
  return 'Mehrere Werte';
}

/** Gespeicherte ISO-Daten sind für Menschen schwer zu lesen. */
function formatIsoDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (ISO_DATE_PATTERN.test(value))
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
  if (ISO_TIMESTAMP_PATTERN.test(value))
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(
      date,
    );
  return value;
}

/** Kurzbezeichnung eines ganzen Listeneintrags, sofern er ein sprechendes Feld hat. */
function summarizeItem(value: unknown): string | null {
  if (!isRecord(value)) return typeof value === 'string' ? value : null;
  for (const field of SUMMARY_FIELDS) {
    const candidate = value[field];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
}

/**
 * Eine Kennung erklärt einem Menschen nichts. Verweise auf andere Datensätze
 * fallen deshalb weg, sobald beide Seiten nur aus einer UUID oder nichts bestehen.
 */
function isTechnicalChange(key: string, before: unknown, after: unknown): boolean {
  if (TECHNICAL_KEYS.has(key)) return true;
  if (!key.endsWith('_id')) return false;
  return [before, after].every(
    (value) => value == null || (typeof value === 'string' && UUID_PATTERN.test(value)),
  );
}

function listItemLabel(listKey: string, position: number): string {
  const singular = LIST_ITEM_LABELS[listKey] ?? humanizeRecordKey(listKey);
  return `${singular} ${position}`;
}

export interface RecordChangeOptions {
  /** Feldnamen, die der begleitende Text bereits ausspricht. */
  readonly hiddenKeys?: ReadonlySet<string>;
}

export function mapRecordChanges(
  changes: unknown,
  options: RecordChangeOptions = {},
): readonly RecordChange[] {
  const result: RecordChange[] = [];
  const hidden = options.hiddenKeys ?? new Set<string>();

  const compare = (before: unknown, after: unknown, path: readonly string[]): void => {
    if (equalValue(before, after) || (before == null && after == null)) return;
    const key = path.at(-1) ?? '';
    if (path.length === 2 && path[0] === 'purchase' && key === 'title') return;
    if (hidden.has(key) || isTechnicalChange(key, before, after)) return;
    if (path.some(isSensitiveKey)) {
      result.push({ label: buildLabel(path), from: '[geschützt]', to: '[geschützt]' });
      return;
    }
    if (isRecord(before) || isRecord(after)) {
      const previous = isRecord(before) ? before : {};
      const current = isRecord(after) ? after : {};
      for (const field of new Set([...Object.keys(previous), ...Object.keys(current)])) {
        compare(previous[field], current[field], [...path, field]);
      }
      return;
    }
    if (Array.isArray(before) || Array.isArray(after)) {
      compareLists(
        Array.isArray(before) ? before : [],
        Array.isArray(after) ? after : [],
        path,
        key,
      );
      return;
    }
    result.push({
      label: buildLabel(path),
      from: formatRecordValue(before, key),
      to: formatRecordValue(after, key),
    });
  };

  /**
   * Zwei Einträge gelten als derselbe Eintrag, wenn es dafür einen Beleg gibt:
   * dieselbe Kennung oder dieselbe Bezeichnung. Ohne Beleg wird nichts
   * verknüpft — ein Prüfprotokoll darf keine Verbindung behaupten.
   */
  const isSameItem = (left: unknown, right: unknown): boolean => {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftId = left['id'];
    const rightId = right['id'];
    if (typeof leftId === 'string' && leftId === rightId) return true;
    const summary = summarizeItem(left);
    return summary !== null && summary === summarizeItem(right);
  };

  const compareLists = (
    before: readonly unknown[],
    after: readonly unknown[],
    path: readonly string[],
    listKey: string,
  ): void => {
    const usedAfter = new Set<number>();
    const openBefore: number[] = [];
    // Unveränderte Einträge fallen ganz heraus, egal an welcher Stelle sie
    // stehen. Damit verschiebt ein Einschub nicht alles Folgende.
    before.forEach((item, index) => {
      const match = after.findIndex(
        (candidate, position) => !usedAfter.has(position) && equalValue(item, candidate),
      );
      if (match >= 0) usedAfter.add(match);
      else openBefore.push(index);
    });

    const openAfter = after
      .map((_, position) => position)
      .filter((position) => !usedAfter.has(position));
    const pairedAfter = new Set<number>();
    const removed: number[] = [];
    for (const index of openBefore) {
      const match = openAfter.find(
        (position) => !pairedAfter.has(position) && isSameItem(before[index], after[position]),
      );
      if (match === undefined) {
        removed.push(index);
        continue;
      }
      pairedAfter.add(match);
      compare(before[index], after[match], [...path, `#${match + 1}`]);
    }

    for (const index of removed) {
      result.push({
        label: `${listItemLabel(listKey, index + 1)} entfernt`,
        from: summarizeItem(before[index]),
        to: null,
      });
    }
    for (const position of openAfter) {
      if (pairedAfter.has(position)) continue;
      result.push({
        label: `${listItemLabel(listKey, position + 1)} hinzugefügt`,
        from: null,
        to: summarizeItem(after[position]),
      });
    }
  };

  const buildLabel = (path: readonly string[]): string => {
    const parts: string[] = [];
    for (const [index, segment] of path.entries()) {
      // „#2“ steht für den zweiten Eintrag der Liste davor: aus
      // „Positionen · #2“ wird „Position 2“.
      if (segment.startsWith('#')) {
        if (!REDUNDANT_CONTAINERS.has(path[index - 1] ?? '')) parts.pop();
        parts.push(listItemLabel(path[index - 1] ?? '', Number(segment.slice(1))));
        continue;
      }
      // Der Datensatz selbst muss in seiner eigenen Chronik nicht benannt werden.
      if (REDUNDANT_CONTAINERS.has(segment) && path.length > index + 1) continue;
      parts.push(humanizeRecordKey(segment));
    }
    return parts.join(' · ') || 'Wert';
  };

  const visit = (value: unknown, path: readonly string[]): void => {
    if (!isRecord(value)) return;
    if ('before' in value || 'after' in value) {
      compare(value['before'], value['after'], path);
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      visit(nested, [...path, key]);
    }
  };

  visit(changes, []);
  return result;
}
