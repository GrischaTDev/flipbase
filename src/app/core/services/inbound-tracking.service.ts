import { Injectable } from '@angular/core';
import {
  TrackingCarrier,
  InboundTrackingStatus,
  InboundTrackingInfo,
  InboundTrackingCheckpoint,
} from '../models/reflip.models';

export interface CarrierMeta {
  id: TrackingCarrier;
  name: string;
  badgeClass: string;
  borderClass: string;
  textClass: string;
  bgClass: string;
  placeholder: string;
}

export const CARRIER_METAS: Record<TrackingCarrier, CarrierMeta> = {
  dhl: {
    id: 'dhl',
    name: 'DHL Paket',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    borderClass: 'border-amber-500/40',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    placeholder: 'z.B. 00340434... oder JJD00...',
  },
  dpd: {
    id: 'dpd',
    name: 'DPD',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    borderClass: 'border-rose-500/40',
    textClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    placeholder: 'z.B. 01458923456789 (14 Ziffern)',
  },
  hermes: {
    id: 'hermes',
    name: 'Hermes',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    borderClass: 'border-sky-500/40',
    textClass: 'text-sky-400',
    bgClass: 'bg-sky-500/10',
    placeholder: 'z.B. H100234567890123456',
  },
  ups: {
    id: 'ups',
    name: 'UPS',
    badgeClass: 'bg-amber-700/20 text-amber-200 border-amber-600/40',
    borderClass: 'border-amber-600/40',
    textClass: 'text-amber-300',
    bgClass: 'bg-amber-700/10',
    placeholder: 'z.B. 1Z9999999999999999',
  },
  gls: {
    id: 'gls',
    name: 'GLS',
    badgeClass: 'bg-blue-600/15 text-blue-300 border-blue-500/30',
    borderClass: 'border-blue-500/40',
    textClass: 'text-blue-400',
    bgClass: 'bg-blue-600/10',
    placeholder: 'z.B. 12345678901 (11-12 Ziffern)',
  },
  fedex: {
    id: 'fedex',
    name: 'FedEx',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    borderClass: 'border-purple-500/40',
    textClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    placeholder: 'z.B. 123456789012 (12 Ziffern)',
  },
  deutsche_post: {
    id: 'deutsche_post',
    name: 'Deutsche Post',
    badgeClass: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    borderClass: 'border-yellow-500/40',
    textClass: 'text-yellow-400',
    bgClass: 'bg-yellow-500/10',
    placeholder: 'z.B. RR123456789DE',
  },
  other: {
    id: 'other',
    name: 'Sonstiger Paketdienst',
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    borderClass: 'border-slate-500/40',
    textClass: 'text-slate-400',
    bgClass: 'bg-slate-500/10',
    placeholder: 'Sendungsnummer eingeben',
  },
};

export const TRACKING_STATUS_CONFIG: Record<
  InboundTrackingStatus,
  { label: string; badgeClass: string; iconName: string; step: number }
> = {
  pending: {
    label: 'Angekündigt',
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    iconName: 'Clock',
    step: 1,
  },
  in_transit: {
    label: 'Unterwegs',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    iconName: 'Truck',
    step: 2,
  },
  out_for_delivery: {
    label: 'In Zustellung',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    iconName: 'Package',
    step: 3,
  },
  delivered: {
    label: 'Zugestellt',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    iconName: 'CheckCircle2',
    step: 4,
  },
  exception: {
    label: 'Verzögerung / Problem',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    iconName: 'AlertTriangle',
    step: 2,
  },
};

@Injectable({
  providedIn: 'root',
})
export class InboundTrackingService {
  readonly carrierMetas = CARRIER_METAS;
  readonly statusConfig = TRACKING_STATUS_CONFIG;

  readonly carrierOptions = [
    { value: 'dhl', label: 'DHL Paket' },
    { value: 'dpd', label: 'DPD' },
    { value: 'hermes', label: 'Hermes' },
    { value: 'ups', label: 'UPS' },
    { value: 'gls', label: 'GLS' },
    { value: 'fedex', label: 'FedEx' },
    { value: 'deutsche_post', label: 'Deutsche Post' },
    { value: 'other', label: 'Sonstige' },
  ];

  /**
   * Automatische Erkennung des Paketdienstes anhand der Sendungsnummer
   */
  autoDetectCarrier(trackingNumber: string): TrackingCarrier {
    const raw = trackingNumber.trim().replace(/[\s\-_]/g, '');
    if (!raw) return 'other';

    // 1. UPS (starts with 1Z and ~18 chars)
    if (/^1Z[0-9A-Z]{16}$/i.test(raw)) {
      return 'ups';
    }

    // 2. DPD (14 digits or starts with 01)
    if (/^(01\d{12}|05\d{12}|\d{14})$/.test(raw)) {
      return 'dpd';
    }

    // 3. Hermes (Starts with H + 19-20 chars or 11/14/20 digits)
    if (/^(H\d{15,20}|\d{11}|\d{14}|\d{20})$/i.test(raw)) {
      if (raw.length === 14 && (raw.startsWith('01') || raw.startsWith('05'))) {
        return 'dpd';
      }
      if (raw.startsWith('H') || raw.length === 11) {
        return 'hermes';
      }
    }

    // 4. DHL (10, 12, 20 digits, JJD, CY, etc.)
    if (/^(0034\d{16}|JJD\d{16,20}|CY\d{9}[A-Z]{2}|\d{10}|\d{12}|\d{20})$/i.test(raw)) {
      return 'dhl';
    }

    // 5. GLS (11-12 digits)
    if (/^\d{11,12}$/.test(raw)) {
      return 'gls';
    }

    // 6. Deutsche Post (Letter tracking / Einspeisung)
    if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(raw)) {
      return 'deutsche_post';
    }

    // 7. FedEx (12 digits)
    if (/^\d{12}$/.test(raw)) {
      return 'fedex';
    }

    // Fallback: If starts with JJD or 0034 -> DHL
    if (raw.toUpperCase().startsWith('JJD') || raw.startsWith('0034')) {
      return 'dhl';
    }

    return 'dhl'; // Default to DHL in Germany if ambiguous
  }

  /**
   * Generiert den 1-Click-Direktlink zur offiziellen Tracking-Webseite
   */
  getTrackingPortalUrl(carrier: TrackingCarrier, trackingNumber: string): string {
    const code = encodeURIComponent(trackingNumber.trim().replace(/\s+/g, ''));
    if (!code) return '';

    switch (carrier) {
      case 'dhl':
        return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${code}`;
      case 'dpd':
        return `https://tracking.dpd.de/status/de_DE/shipment/${code}`;
      case 'hermes':
        return `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails#${code}`;
      case 'ups':
        return `https://www.ups.com/track?tracknum=${code}`;
      case 'gls':
        return `https://gls-group.com/DE/de/sendungsverfolgung?match=${code}`;
      case 'fedex':
        return `https://www.fedex.com/fedextrack/?trknbr=${code}`;
      case 'deutsche_post':
        return `https://www.deutschepost.de/sendung/simpleQuery.html?locale=de_DE&form.sendungsnummer=${code}`;
      default:
        return `https://www.google.com/search?q=Sendungsverfolgung+${code}`;
    }
  }

  /**
   * Liefert aufbereitete Tracking-Details inkl. Status, Checkpoints und Portal-Link
   */
  getTrackingInfo(
    trackingNumber?: string | null,
    carrier?: TrackingCarrier | null,
    currentStatus?: InboundTrackingStatus | null,
    purchaseDate?: string,
  ): InboundTrackingInfo | null {
    if (!trackingNumber || !trackingNumber.trim()) {
      return null;
    }

    const trimmed = trackingNumber.trim();
    const effectiveCarrier = carrier || this.autoDetectCarrier(trimmed);
    const meta = CARRIER_METAS[effectiveCarrier] || CARRIER_METAS.other;
    const status: InboundTrackingStatus = currentStatus || 'in_transit';
    const statusCfg = TRACKING_STATUS_CONFIG[status];
    const trackingUrl = this.getTrackingPortalUrl(effectiveCarrier, trimmed);

    // Mock realistic checkpoints based on purchase date & status
    const checkpoints = this.generateCheckpoints(effectiveCarrier, trimmed, status, purchaseDate);

    return {
      carrier: effectiveCarrier,
      carrier_name: meta.name,
      tracking_number: trimmed,
      status,
      status_label: statusCfg.label,
      tracking_url: trackingUrl,
      estimated_delivery: status === 'delivered' ? null : 'Morgen, bis 14:00 Uhr',
      last_checkpoint:
        checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].description : null,
      checkpoints,
    };
  }

  private generateCheckpoints(
    carrier: TrackingCarrier,
    code: string,
    status: InboundTrackingStatus,
    dateStr?: string,
  ): InboundTrackingCheckpoint[] {
    const baseDate = dateStr ? new Date(dateStr) : new Date();
    const cName = CARRIER_METAS[carrier]?.name || 'Paketdienst';

    const points: InboundTrackingCheckpoint[] = [
      {
        timestamp: new Date(baseDate.getTime() + 1000 * 60 * 60 * 2).toISOString(),
        status: 'pending',
        location: 'Elektronisch übermittelt',
        description: `Die Sendungsdaten wurden an ${cName} übermittelt.`,
      },
    ];

    if (status === 'in_transit' || status === 'out_for_delivery' || status === 'delivered') {
      points.push({
        timestamp: new Date(baseDate.getTime() + 1000 * 60 * 60 * 14).toISOString(),
        status: 'in_transit',
        location: 'Paketzentrum',
        description: `Sendung im Start-Paketzentrum bearbeitet und weitertransportiert.`,
      });
    }

    if (status === 'out_for_delivery' || status === 'delivered') {
      points.push({
        timestamp: new Date(baseDate.getTime() + 1000 * 60 * 60 * 26).toISOString(),
        status: 'out_for_delivery',
        location: 'Zustellfahrzeug',
        description: `Die Sendung befindet sich im Zustellfahrzeug.`,
      });
    }

    if (status === 'delivered') {
      points.push({
        timestamp: new Date(baseDate.getTime() + 1000 * 60 * 60 * 30).toISOString(),
        status: 'delivered',
        location: 'Empfängeradresse / Ablageort',
        description: `Erfolgreich zugestellt an Empfänger.`,
      });
    }

    return points;
  }
}
