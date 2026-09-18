const PURCHASE_COST_TYPE_LABELS: Readonly<Record<string, string>> = {
  shipping: 'Versandkosten',
  travel: 'Fahrtkosten',
  packaging: 'Verpackung',
  transport: 'Frachtgebühr',
  customs: 'Zölle',
  import: 'Importabgaben',
  fee: 'Gebühr',
  other: 'Sonstiges',
};

export function purchaseCostTypeLabel(type: string): string {
  return PURCHASE_COST_TYPE_LABELS[type] ?? 'Zusätzliche Kosten';
}
