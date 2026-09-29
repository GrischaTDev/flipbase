export type EbaySellerType = 'private' | 'business';
export type EbayShopType = 'none' | 'basic' | 'top' | 'premium' | 'platinum';
export type EbayListingFormat = 'fixed-price' | 'auction';
export type EbayDestination =
  | 'germany'
  | 'eurozone-sweden'
  | 'europe-us-canada'
  | 'uk'
  | 'rest-world';

export type EbayCondition =
  | 'new'
  | 'new-other'
  | 'refurbished'
  | 'seller-refurbished'
  | 'used'
  | 'used-excellent'
  | 'used-good'
  | 'used-acceptable';

export type EbayCategoryKey =
  | 'electronics-devices'
  | 'electronics-accessories'
  | 'auto-parts'
  | 'auto-entertainment'
  | 'wheels-tires'
  | 'moto-clothing'
  | 'business-office'
  | 'garden'
  | 'diy'
  | 'clothing-accessories'
  | 'sneakers'
  | 'watches-jewelry'
  | 'watch-parts'
  | 'watches'
  | 'coins'
  | 'media'
  | 'musical-instruments'
  | 'nfts'
  | 'standard-recommerce'
  | 'model-trading'
  | 'collectibles';

type EbayFeeRule =
  | {
      readonly mode: 'flat';
      readonly rate: number;
      readonly recommerceRate?: number;
    }
  | {
      readonly mode: 'tiered';
      readonly rate: number;
      readonly rateAbove: number;
      readonly threshold: number;
      readonly shopThreshold?: number;
      readonly recommerceRate?: number;
    }
  | {
      readonly mode: 'sneakers';
      readonly under100Rate: number;
      readonly rate: number;
      readonly rateAbove: number;
      readonly threshold: number;
    };

export interface EbayCategoryDefinition {
  readonly key: EbayCategoryKey;
  readonly label: string;
  readonly description: string;
  readonly categoryIds: readonly string[];
  readonly validFrom: string;
  readonly rule: EbayFeeRule;
}

export interface EbayFeeInput {
  readonly sellerType: EbaySellerType;
  readonly shopType: EbayShopType;
  readonly category: EbayCategoryKey;
  readonly condition: EbayCondition;
  readonly salePrice: number;
  readonly buyerShipping: number;
  readonly purchaseCost: number;
  readonly actualShippingCost: number;
  readonly packagingCost: number;
  readonly promotedRatePercent: number;
  readonly destination: EbayDestination;
  readonly useEbayInternationalShipping: boolean;
  readonly includeBusinessFeeVat: boolean;
  readonly listingOutsideFreeQuota: boolean;
  readonly listingFormat: EbayListingFormat;
}

export interface EbayFeeResult {
  readonly transactionAmount: number;
  readonly variableFee: number;
  readonly orderFee: number;
  readonly platinumDiscount: number;
  readonly finalValueFee: number;
  readonly listingFee: number;
  readonly internationalFee: number;
  readonly promotedFee: number;
  readonly feeVat: number;
  readonly ebayFeesTotal: number;
  readonly payoutAfterEbay: number;
  readonly ownCosts: number;
  readonly profit: number;
  readonly marginPercent: number;
  readonly roiPercent: number;
  readonly effectiveEbayFeePercent: number;
  readonly ruleLabel: string;
}

export const EBAY_FEE_RULES_VALID_FROM = '2026-07-01';

export const EBAY_CATEGORY_DEFINITIONS: readonly EbayCategoryDefinition[] = [
  {
    key: 'electronics-devices',
    label: 'Technik & elektronische Geräte',
    description: 'Geräte, z. B. Computer, Smartphones, Kameras, Konsolen und Haushaltsgeräte',
    categoryIds: ['58058', '1245', '625', '15032', '20710', '139971', '293'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'flat', rate: 0.07, recommerceRate: 0.05 },
  },
  {
    key: 'electronics-accessories',
    label: 'Technik-Zubehör',
    description: 'Zubehör für Computer, Smartphones, Kameras, Audio, Tablets und ähnliche Geräte',
    categoryIds: ['171961', '9394', '15200', '31530', '176970', '3676'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'flat', rate: 0.12, recommerceRate: 0.05 },
  },
  {
    key: 'auto-parts',
    label: 'Auto & Motorrad: Teile',
    description: 'Standardgebühr für Teile und Zubehör',
    categoryIds: ['131090'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'tiered', rate: 0.12, rateAbove: 0.03, threshold: 990 },
  },
  {
    key: 'auto-entertainment',
    label: 'Autoelektronik & Navigation',
    description: 'Autoentertainment, Dashcams, Navigation und ausgewählte Elektronik',
    categoryIds: ['171101', '174121', '169423', '258037', '139835'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: {
      mode: 'tiered',
      rate: 0.065,
      rateAbove: 0.03,
      threshold: 990,
      shopThreshold: 300,
    },
  },
  {
    key: 'wheels-tires',
    label: 'Felgen, Kompletträder & Reifen',
    description: 'Felgen, Kompletträder und Reifen',
    categoryIds: ['179679', '179681', '179680'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'tiered', rate: 0.065, rateAbove: 0.03, threshold: 990 },
  },
  {
    key: 'moto-clothing',
    label: 'Motorradbekleidung & Schutzausrüstung',
    description: 'Kleidung, Schutzausrüstung und Merchandise im Auto-&-Motorrad-Bereich',
    categoryIds: ['6747'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'tiered', rate: 0.11, rateAbove: 0.03, threshold: 990 },
  },
  {
    key: 'business-office',
    label: 'Business & Industrie / Büro',
    description: 'Business & Industrie sowie Büro & Schreibwaren',
    categoryIds: ['12576', '9815'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'flat', rate: 0.14, recommerceRate: 0.05 },
  },
  {
    key: 'garden',
    label: 'Garten & Terrasse',
    description: 'Garten- und Terrassenartikel',
    categoryIds: ['159912'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'flat', rate: 0.13, recommerceRate: 0.05 },
  },
  {
    key: 'diy',
    label: 'Heimwerker',
    description: 'Werkzeug und Heimwerkerartikel',
    categoryIds: ['3187'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'flat', rate: 0.13, recommerceRate: 0.05 },
  },
  {
    key: 'clothing-accessories',
    label: 'Kleidung & Accessoires',
    description: 'Mode, Vintage, Accessoires und normale Schuhe',
    categoryIds: ['11450'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'tiered', rate: 0.12, rateAbove: 0.03, threshold: 990 },
  },
  {
    key: 'sneakers',
    label: 'Sneaker',
    description: 'Sneaker-Unterkategorien von Herren- und Damenschuhen',
    categoryIds: ['15709', '95672'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: {
      mode: 'sneakers',
      under100Rate: 0.12,
      rate: 0.07,
      rateAbove: 0.03,
      threshold: 990,
    },
  },
  {
    key: 'watches-jewelry',
    label: 'Uhren & Schmuck',
    description: 'Übergeordnete Kategorie Uhren & Schmuck',
    categoryIds: ['281'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: {
      mode: 'tiered',
      rate: 0.16,
      rateAbove: 0.03,
      threshold: 990,
      shopThreshold: 500,
    },
  },
  {
    key: 'watch-parts',
    label: 'Uhren, Teile & Zubehör',
    description: 'Uhrenteile und Zubehör',
    categoryIds: ['260324'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: {
      mode: 'tiered',
      rate: 0.14,
      rateAbove: 0.03,
      threshold: 990,
      shopThreshold: 400,
    },
  },
  {
    key: 'watches',
    label: 'Armband-, Taschen- & Sammleruhren',
    description: 'Armbanduhren, Taschenuhren, Sammleruhren und weiteres Uhrenzubehör',
    categoryIds: ['260325', '10682', '258031', '260328'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: {
      mode: 'tiered',
      rate: 0.11,
      rateAbove: 0.03,
      threshold: 990,
      shopThreshold: 400,
    },
  },
  {
    key: 'coins',
    label: 'Münzen',
    description: 'Münzen',
    categoryIds: ['11116'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'tiered', rate: 0.065, rateAbove: 0.03, threshold: 990 },
  },
  {
    key: 'media',
    label: 'Medien',
    description: 'Filme, Musik, Tickets, PC- & Videospiele, Bücher und Zeitschriften',
    categoryIds: ['11232', '11233', '1305', '1249', '267'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'tiered', rate: 0.12, rateAbove: 0.03, threshold: 990 },
  },
  {
    key: 'musical-instruments',
    label: 'Musikinstrumente',
    description: 'Musikinstrumente',
    categoryIds: ['619'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'flat', rate: 0.11, recommerceRate: 0.05 },
  },
  {
    key: 'nfts',
    label: 'NFTs',
    description: 'Film-, Musik-, Kunst-, TCG- und Sport-Trading-Card-NFTs',
    categoryIds: ['262053', '262054', '262051', '262056', '262052', '262055', '262050'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'flat', rate: 0.05 },
  },
  {
    key: 'standard-recommerce',
    label: 'Sport, Reisen, Baby, Wohnen & weitere Standardkategorien',
    description: 'Sport, Reisen, Verschiedenes, Baby, Basteln, Feinschmecker, Haustierbedarf sowie Möbel & Wohnen',
    categoryIds: ['888', '3252', '99', '2984', '14339', '14308', '1281', '11700'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'flat', rate: 0.14, recommerceRate: 0.05 },
  },
  {
    key: 'model-trading',
    label: 'Modellbau & Trading Cards',
    description: 'Modellbau, Trading Cards und Sammelkartenspiele',
    categoryIds: ['22128', '8662', '2536'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'tiered', rate: 0.11, rateAbove: 0.03, threshold: 990 },
  },
  {
    key: 'collectibles',
    label: 'Antiquitäten, Beauty, Briefmarken, Sammeln & Spielzeug',
    description: 'Ausgewählte Sammel-, Beauty- und Spielzeugkategorien',
    categoryIds: ['353', '26395', '260', '1', '220'],
    validFrom: EBAY_FEE_RULES_VALID_FROM,
    rule: { mode: 'tiered', rate: 0.12, rateAbove: 0.03, threshold: 990 },
  },
] as const;

export const EBAY_SHOP_MONTHLY_NET: Readonly<Record<EbayShopType, number>> = {
  none: 0,
  basic: 39.95,
  top: 79.95,
  premium: 299.95,
  platinum: 4999.95,
};

const RECOMMERCE_CONDITIONS = new Set<EbayCondition>([
  'new-other',
  'refurbished',
  'seller-refurbished',
  'used',
  'used-excellent',
  'used-good',
  'used-acceptable',
]);

const BUSINESS_INTERNATIONAL_RATE: Readonly<Record<EbayDestination, number>> = {
  germany: 0,
  'eurozone-sweden': 0,
  'europe-us-canada': 0.016,
  uk: 0.012,
  'rest-world': 0.033,
};

export function calculateEbayFees(input: EbayFeeInput): EbayFeeResult {
  const transactionAmount = money(nonNegative(input.salePrice) + nonNegative(input.buyerShipping));

  if (input.sellerType === 'private') {
    return calculatePrivateFees(input, transactionAmount);
  }

  return calculateBusinessFees(input, transactionAmount);
}

function calculatePrivateFees(input: EbayFeeInput, transactionAmount: number): EbayFeeResult {
  const listingFee = input.listingOutsideFreeQuota ? 0.5 : 0;
  const internationalFee = input.destination === 'germany' ? 0 : money(transactionAmount * 0.05);
  const promotedFee = percentFee(transactionAmount, input.promotedRatePercent);
  const ebayFeesTotal = money(listingFee + internationalFee + promotedFee);
  const ownCosts = ownCostsFor(input);
  const payoutAfterEbay = money(transactionAmount - ebayFeesTotal);
  const profit = money(payoutAfterEbay - ownCosts);

  return resultFrom({
    transactionAmount,
    variableFee: 0,
    orderFee: 0,
    platinumDiscount: 0,
    finalValueFee: 0,
    listingFee,
    internationalFee,
    promotedFee,
    feeVat: 0,
    ebayFeesTotal,
    payoutAfterEbay,
    ownCosts,
    profit,
    ruleLabel:
      input.destination === 'germany'
        ? 'Privatverkauf innerhalb Deutschlands: keine Verkaufsprovision'
        : 'Privatverkauf über eBay.de ins Ausland: 5 % internationale Gebühr',
  });
}

function calculateBusinessFees(input: EbayFeeInput, transactionAmount: number): EbayFeeResult {
  const definition =
    EBAY_CATEGORY_DEFINITIONS.find((candidate) => candidate.key === input.category) ??
    EBAY_CATEGORY_DEFINITIONS.find((candidate) => candidate.key === 'clothing-accessories')!;

  const variableFee = calculateVariableFee(definition.rule, transactionAmount, input);
  const orderFee = transactionAmount > 10 ? 0.45 : 0.35;
  const discountBase = money(variableFee + orderFee);
  const platinumDiscount = input.shopType === 'platinum' ? money(discountBase * 0.1) : 0;
  const finalValueFee = money(discountBase - platinumDiscount);
  const listingFee = calculateBusinessListingFee(input);
  const internationalFee = input.useEbayInternationalShipping
    ? 0
    : money(transactionAmount * BUSINESS_INTERNATIONAL_RATE[input.destination]);
  const promotedFee = percentFee(transactionAmount, input.promotedRatePercent);

  const feesBeforeVat = money(finalValueFee + listingFee + internationalFee + promotedFee);
  const feeVat = input.includeBusinessFeeVat ? money(feesBeforeVat * 0.19) : 0;
  const ebayFeesTotal = money(feesBeforeVat + feeVat);
  const payoutAfterEbay = money(transactionAmount - ebayFeesTotal);
  const ownCosts = ownCostsFor(input);
  const profit = money(payoutAfterEbay - ownCosts);

  return resultFrom({
    transactionAmount,
    variableFee,
    orderFee,
    platinumDiscount,
    finalValueFee,
    listingFee,
    internationalFee,
    promotedFee,
    feeVat,
    ebayFeesTotal,
    payoutAfterEbay,
    ownCosts,
    profit,
    ruleLabel: describeRule(definition.rule, transactionAmount, input),
  });
}

function calculateVariableFee(
  rule: EbayFeeRule,
  transactionAmount: number,
  input: EbayFeeInput,
): number {
  if (rule.mode === 'flat') {
    const rate =
      rule.recommerceRate !== undefined && RECOMMERCE_CONDITIONS.has(input.condition)
        ? rule.recommerceRate
        : rule.rate;
    return money(transactionAmount * rate);
  }

  if (rule.mode === 'sneakers') {
    if (nonNegative(input.salePrice) < 100) {
      return money(transactionAmount * rule.under100Rate);
    }
    return tieredFee(transactionAmount, rule.threshold, rule.rate, rule.rateAbove);
  }

  if (rule.recommerceRate !== undefined && RECOMMERCE_CONDITIONS.has(input.condition)) {
    return money(transactionAmount * rule.recommerceRate);
  }

  const threshold =
    input.shopType !== 'none' && rule.shopThreshold !== undefined
      ? rule.shopThreshold
      : rule.threshold;

  return tieredFee(transactionAmount, threshold, rule.rate, rule.rateAbove);
}

function tieredFee(amount: number, threshold: number, rate: number, rateAbove: number): number {
  const lower = Math.min(amount, threshold);
  const upper = Math.max(0, amount - threshold);
  return money(lower * rate + upper * rateAbove);
}

function calculateBusinessListingFee(input: EbayFeeInput): number {
  if (!input.listingOutsideFreeQuota) return 0;

  if (input.listingFormat === 'auction') return 0.5;

  if (input.shopType === 'basic') return 0.1;
  if (input.shopType === 'top') return 0.05;
  if (input.shopType === 'premium' || input.shopType === 'platinum') return 0;
  return 0.35;
}

function describeRule(
  rule: EbayFeeRule,
  transactionAmount: number,
  input: EbayFeeInput,
): string {
  if (rule.mode === 'flat') {
    if (rule.recommerceRate !== undefined && RECOMMERCE_CONDITIONS.has(input.condition)) {
      return `${percent(rule.recommerceRate)} Re-Commerce-Verkaufsprovision`;
    }
    return `${percent(rule.rate)} Verkaufsprovision`;
  }

  if (rule.mode === 'sneakers') {
    if (nonNegative(input.salePrice) < 100) {
      return `${percent(rule.under100Rate)} für Sneaker unter 100 €`;
    }
    return `${percent(rule.rate)} bis 990 €, darüber ${percent(rule.rateAbove)}`;
  }

  if (
    rule.recommerceRate !== undefined &&
    RECOMMERCE_CONDITIONS.has(input.condition)
  ) {
    return `${percent(rule.recommerceRate)} Re-Commerce-Verkaufsprovision`;
  }

  const threshold =
    input.shopType !== 'none' && rule.shopThreshold !== undefined
      ? rule.shopThreshold
      : rule.threshold;
  return `${percent(rule.rate)} bis ${threshold.toLocaleString('de-DE')} €, darüber ${percent(rule.rateAbove)}`;
}

function ownCostsFor(input: EbayFeeInput): number {
  return money(
    nonNegative(input.purchaseCost) +
      nonNegative(input.actualShippingCost) +
      nonNegative(input.packagingCost),
  );
}

function resultFrom(
  base: Omit<EbayFeeResult, 'marginPercent' | 'roiPercent' | 'effectiveEbayFeePercent'>,
): EbayFeeResult {
  const marginPercent =
    base.transactionAmount > 0 ? roundPercent((base.profit / base.transactionAmount) * 100) : 0;
  const roiPercent = base.ownCosts > 0 ? roundPercent((base.profit / base.ownCosts) * 100) : 0;
  const effectiveEbayFeePercent =
    base.transactionAmount > 0
      ? roundPercent((base.ebayFeesTotal / base.transactionAmount) * 100)
      : 0;

  return {
    ...base,
    marginPercent,
    roiPercent,
    effectiveEbayFeePercent,
  };
}

function percentFee(amount: number, percentValue: number): number {
  return money(amount * (nonNegative(percentValue) / 100));
}

function percent(rate: number): string {
  return `${(rate * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
