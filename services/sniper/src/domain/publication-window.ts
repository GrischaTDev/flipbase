export interface PublicationInterval {
  earliest: string | null;
  latest: string | null;
  label: string | null;
}

const DAY_MS = 86_400_000;

/** Quellenrundung bleibt sichtbar: ein Intervall ist kein erfundenes Einstelldatum. */
export function parseVintedPublicationDate(
  label: string | null,
  observedAt: Date,
): PublicationInterval {
  const result: PublicationInterval = { earliest: null, latest: null, label };
  const observed = observedAt.getTime();
  if (!label || !Number.isFinite(observed)) return result;
  const text = label
    .trim()
    .toLowerCase()
    .replace(/^vor\s+/, '');
  let earliest: number;
  let latest: number;
  const iso =
    /^(\d{4}-\d{2}-\d{2})(?:t(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:z|[+-]\d{2}:\d{2}))?$/i.exec(
      text,
    );
  if (iso) {
    const day = Date.parse(`${iso[1]}T00:00:00Z`);
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== iso[1]) return result;
    if (iso[2] && (Number(iso[2]) > 23 || Number(iso[3]) > 59 || Number(iso[4]) > 59))
      return result;
    const exact = iso[2] ? Date.parse(text) : day;
    earliest = iso[2] ? exact : day - 14 * 3_600_000;
    latest = iso[2] ? exact : day + DAY_MS + 14 * 3_600_000;
  } else if (['heute', 'gerade eben', 'soeben', 'jetzt'].includes(text)) {
    earliest = observed - DAY_MS;
    latest = observed;
  } else if (text === 'gestern') {
    earliest = observed - 2 * DAY_MS;
    latest = observed;
  } else {
    const relative =
      /^(\d{1,4}|ein(?:e|er|em|en)?)\s*(min(?:\.|ute[n]?)?|h|stunde[n]?|tag(?:e|en)?|woche[n]?|monat(?:e|en)?|jahr(?:e|en)?)$/i.exec(
        text,
      );
    if (!relative) return result;
    const count = relative[1]!.startsWith('ein') ? 1 : Number(relative[1]);
    const unit = relative[2]!;
    const [minimumUnit, maximumUnit] = unit.startsWith('min')
      ? [60_000, 60_000]
      : unit === 'h' || unit.startsWith('stunde')
        ? [3_600_000, 3_600_000]
        : unit.startsWith('tag')
          ? [DAY_MS, DAY_MS]
          : unit.startsWith('woche')
            ? [7 * DAY_MS, 7 * DAY_MS]
            : unit.startsWith('monat')
              ? [28 * DAY_MS, 31 * DAY_MS]
              : [365 * DAY_MS, 366 * DAY_MS];
    earliest = observed - (count + 1) * maximumUnit!;
    latest = observed - Math.max(0, count - 1) * minimumUnit!;
  }
  if (
    !Number.isFinite(earliest) ||
    !Number.isFinite(latest) ||
    earliest > latest ||
    earliest > observed
  )
    return result;
  return {
    earliest: new Date(earliest).toISOString(),
    latest: new Date(Math.min(latest, observed)).toISOString(),
    label,
  };
}

/** Überlappung der Grenze bleibt unbekannt und darf nicht als exakter Sieben-Tage-Beleg gelten. */
export function publicationWindowStatus(
  publication: Pick<PublicationInterval, 'earliest' | 'latest'>,
  windowStart: Date,
  windowEnd: Date,
): 'within_window' | 'outside_window' | 'unknown' {
  const earliest = publication.earliest === null ? NaN : Date.parse(publication.earliest);
  const latest = publication.latest === null ? NaN : Date.parse(publication.latest);
  const start = windowStart.getTime();
  const end = windowEnd.getTime();
  if (
    ![earliest, latest, start, end].every(Number.isFinite) ||
    earliest > latest ||
    start > end ||
    latest > end
  )
    return 'unknown';
  if (earliest >= start) return 'within_window';
  return latest < start ? 'outside_window' : 'unknown';
}
