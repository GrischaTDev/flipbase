import { describe, expect, it } from 'vitest';
import { calculateEbayFees, type EbayFeeInput } from './ebay-fees';

const baseBusiness: EbayFeeInput = {
  sellerType: 'business',
  shopType: 'none',
  category: 'clothing-accessories',
  condition: 'used',
  salePrice: 100,
  buyerShipping: 0,
  purchaseCost: 0,
  actualShippingCost: 0,
  packagingCost: 0,
  promotedRatePercent: 0,
  destination: 'germany',
  useEbayInternationalShipping: false,
  includeBusinessFeeVat: false,
  listingOutsideFreeQuota: false,
  listingFormat: 'fixed-price',
};

describe('calculateEbayFees', () => {
  it('berechnet Kleidung gewerblich mit 12 % plus Bestellgebühr', () => {
    const result = calculateEbayFees(baseBusiness);

    expect(result.variableFee).toBe(12);
    expect(result.orderFee).toBe(0.45);
    expect(result.ebayFeesTotal).toBe(12.45);
  });

  it('wendet bei Sneakern ab 100 Euro 7 % an', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      category: 'sneakers',
      salePrice: 100,
    });

    expect(result.variableFee).toBe(7);
    expect(result.ebayFeesTotal).toBe(7.45);
  });

  it('wendet bei Sneakern unter 100 Euro 12 % an', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      category: 'sneakers',
      salePrice: 99.99,
    });

    expect(result.variableFee).toBe(12);
    expect(result.ebayFeesTotal).toBe(12.45);
  });

  it('Versand hebt die Sneaker-Preisschwelle nicht über 100 Euro', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      category: 'sneakers',
      salePrice: 99,
      buyerShipping: 10,
    });

    expect(result.variableFee).toBe(13.08);
    expect(result.orderFee).toBe(0.45);
  });

  it('berechnet private Inlandsverkäufe ohne Verkaufsprovision', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      sellerType: 'private',
      salePrice: 80,
      buyerShipping: 5,
    });

    expect(result.ebayFeesTotal).toBe(0);
    expect(result.payoutAfterEbay).toBe(85);
  });

  it('berechnet private Auslandsverkäufe auf ebay.de mit 5 %', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      sellerType: 'private',
      salePrice: 100,
      buyerShipping: 5,
      destination: 'eurozone-sweden',
    });

    expect(result.internationalFee).toBe(5.25);
    expect(result.ebayFeesTotal).toBe(5.25);
  });

  it('wendet den Re-Commerce-Satz von 5 % nur auf berechtigte Kategorien an', () => {
    const electronics = calculateEbayFees({
      ...baseBusiness,
      category: 'electronics-devices',
      condition: 'used',
    });
    const clothing = calculateEbayFees({
      ...baseBusiness,
      category: 'clothing-accessories',
      condition: 'used',
    });

    expect(electronics.variableFee).toBe(5);
    expect(clothing.variableFee).toBe(12);
  });

  it('berechnet die internationale Gebühr für gewerbliche UK-Verkäufe', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      destination: 'uk',
    });

    expect(result.internationalFee).toBe(1.2);
    expect(result.ebayFeesTotal).toBe(13.65);
  });

  it('setzt die internationale Gebühr bei eBay Internationalem Versand auf null', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      destination: 'rest-world',
      useEbayInternationalShipping: true,
    });

    expect(result.internationalFee).toBe(0);
  });

  it('berücksichtigt 19 % Umsatzsteuer auf gewerbliche eBay-Gebühren optional', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      includeBusinessFeeVat: true,
    });

    expect(result.feeVat).toBe(2.37);
    expect(result.ebayFeesTotal).toBe(14.82);
  });

  it('gewährt beim Platin-Shop 10 % Rabatt auf die Verkaufsprovision inklusive Fixanteil', () => {
    const result = calculateEbayFees({
      ...baseBusiness,
      shopType: 'platinum',
    });

    expect(result.platinumDiscount).toBe(1.25);
    expect(result.finalValueFee).toBe(11.2);
  });

  it('berechnet Angebotsgebühren außerhalb des kostenlosen Kontingents', () => {
    const noShop = calculateEbayFees({
      ...baseBusiness,
      listingOutsideFreeQuota: true,
    });
    const basis = calculateEbayFees({
      ...baseBusiness,
      shopType: 'basic',
      listingOutsideFreeQuota: true,
    });
    const premium = calculateEbayFees({
      ...baseBusiness,
      shopType: 'premium',
      listingOutsideFreeQuota: true,
    });

    expect(noShop.listingFee).toBe(0.35);
    expect(basis.listingFee).toBe(0.1);
    expect(premium.listingFee).toBe(0);
  });
});
