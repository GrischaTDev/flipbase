export interface VintedTransferSource {
  readonly externalAccountId: string;
  readonly externalId: string;
  readonly title: string;
  readonly description: string;
  readonly priceCents: number | null;
  readonly currency: string;
  readonly photoReferences: readonly string[];
  readonly attributeHints: Readonly<Record<string, string>>;
}

export interface KleinanzeigenSourceReference {
  readonly platform: 'vinted';
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly externalId: string;
  readonly entryId: string;
  readonly fingerprint: string;
}

export interface KleinanzeigenDraftContent {
  readonly title: string;
  readonly description: string;
  readonly priceCents: number;
  readonly currency: 'EUR';
  readonly priceType: 'FIXED' | 'NEGOTIABLE';
  readonly postalCode: string | null;
  readonly shippingType: 'pickup' | 'shipping' | 'both';
  readonly shippingPriceCents: number | null;
  readonly categoryId: string | null;
  readonly categoryFields: Readonly<Record<string, string>>;
  readonly schemaRevision: string | null;
}

export type KleinanzeigenTransferRequest = {
  readonly workspaceId: string;
  readonly targetConnectionId: string;
  readonly requestId: string;
} & (
  | {
      readonly action: 'prepare_transfer';
      readonly source: {
        readonly platform: 'vinted';
        readonly workspaceId: string;
        readonly connectionId: string;
        readonly externalId: string;
      };
    }
  | {
      readonly action: 'save_transfer';
      readonly source: KleinanzeigenSourceReference;
      readonly content: KleinanzeigenDraftContent;
      readonly draftId: string | null;
      readonly expectedRevision: number | null;
    }
);

export interface KleinanzeigenTransferSourceRead {
  readonly state: 'needs_source' | 'ready';
  readonly workspaceId: string;
  readonly targetConnectionId: string;
  readonly connectionId: string;
  readonly entryId: string;
  readonly externalId: string;
  readonly externalAccountId: string;
  readonly executionMode: 'cloud' | 'local';
  readonly source?: VintedTransferSource;
  readonly observedAt?: string;
  readonly fingerprint?: string;
}

export interface KleinanzeigenTransferDraft {
  readonly id: string;
  readonly workspaceId: string;
  readonly targetConnectionId: string;
  readonly sourceReference: KleinanzeigenSourceReference;
  readonly revision: number;
  readonly status: 'prepared' | 'online' | 'ended';
  readonly content: KleinanzeigenDraftContent;
  readonly imagesComplete: boolean;
}
