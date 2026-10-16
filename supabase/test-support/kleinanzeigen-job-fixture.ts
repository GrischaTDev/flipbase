export function kleinanzeigenJobFixture() {
  const workspaceId = '51000000-0000-4000-8000-000000000011';
  const connectionId = '9';
  const draftId = '51000000-0000-4000-8000-000000000041';
  const requestId = '51000000-0000-4000-8000-000000000061';
  const imageId = '51000000-0000-4000-8000-000000000071';
  const at = new Date().toISOString();
  return {
    id: '12',
    workspaceId,
    connectionId,
    draftId,
    draftRevision: 4,
    grantGeneration: 2,
    requestedBy: '51000000-0000-4000-8000-000000000001',
    immutableSnapshot: {
      workspaceId,
      connectionId,
      draftId,
      draftRevision: 4,
      grantGeneration: 2,
      externalAccountId: '88',
      content: {
        title: 'Jacke',
        description: 'Ganz',
        priceCents: 1200,
        currency: 'EUR' as const,
        priceType: 'FIXED' as const,
        postalCode: '12345',
        shippingType: 'pickup' as const,
        shippingPriceCents: null,
        categoryId: '153/160/shirts',
        categoryFields: { 'kleidung_herren.condition': 'ok' },
        schemaRevision: 'a'.repeat(64),
      },
      images: [
        {
          imageId,
          storagePath:
            'kleinanzeigen-jobs/' +
            workspaceId +
            '/' +
            requestId +
            '/51000000-0000-4000-8000-000000000062/' +
            imageId +
            '.jpg',
          fileName: 'Bild.jpg',
          mimeType: 'image/jpeg' as const,
          byteSize: 4,
          sha256: 'b'.repeat(64),
        },
      ],
    },
    state: 'queued' as const,
    version: 1,
    externalId: null,
    providerState: null,
    verifiedAt: null,
    errorCode: null,
    createdAt: at,
    updatedAt: at,
  };
}
