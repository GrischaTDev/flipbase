import { ProductCategory } from '../models/product-category.models';

function category(id: string, fullName: string, isLeaf: boolean): ProductCategory {
  const parts = fullName.split(' > ');
  const segments = id.split('-');
  return {
    id,
    parentId: segments.length === 1 ? null : segments.slice(0, -1).join('-'),
    name: parts[parts.length - 1],
    fullName,
    level: parts.length,
    isLeaf,
    isDeprecated: false,
  };
}

/**
 * Auszug aus der Shopify Standard Product Taxonomy v2026-08 (MIT, Copyright (c)
 * Shopify) für den Demo-Modus. Kennungen und Pfade sind echt, damit Demo- und
 * Datenbankbetrieb dieselben Werte speichern.
 */
export const DEMO_PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  category('el', 'Elektronik', false),
  category('el-2', 'Elektronik > Audio', false),
  category('el-2-3', 'Elektronik > Audio > Audioplayer & -rekorder', true),
  category('el-6', 'Elektronik > Computer', false),
  category('el-6-6', 'Elektronik > Computer > Laptops', true),
  category('el-6-8', 'Elektronik > Computer > Tablet-PCs', true),
  category('el-7', 'Elektronik > Elektronisches Zubehör', false),
  category('el-7-8', 'Elektronik > Elektronisches Zubehör > Computerzubehör', true),
  category('el-18', 'Elektronik > Zubehör für Videospielkonsolen', false),
  category('el-18-5', 'Elektronik > Zubehör für Videospielkonsolen > Videospiel-Controller', true),
  category('el-19', 'Elektronik > Videospielkonsolen', false),
  category('el-19-1', 'Elektronik > Videospielkonsolen > Tragbare Spielkonsolen', true),
  category('el-19-2', 'Elektronik > Videospielkonsolen > Heimspielkonsolen', true),
  category('aa', 'Bekleidung & Accessoires', false),
  category('aa-1', 'Bekleidung & Accessoires > Bekleidung', false),
  category('aa-1-13', 'Bekleidung & Accessoires > Bekleidung > Bekleidungsoberteile', false),
  category(
    'aa-1-13-8',
    'Bekleidung & Accessoires > Bekleidung > Bekleidungsoberteile > T-Shirts',
    true,
  ),
  category('aa-8', 'Bekleidung & Accessoires > Schuhe', false),
  category('aa-8-1', 'Bekleidung & Accessoires > Schuhe > Turnschuhe', true),
  category('aa-8-3', 'Bekleidung & Accessoires > Schuhe > Stiefel', true),
  category('aa-8-8', 'Bekleidung & Accessoires > Schuhe > Sneaker', true),
  category('co', 'Kameras & Optik', false),
  category('co-1', 'Kameras & Optik > Kamera- & Optisches Zubehör', true),
  category('co-2', 'Kameras & Optik > Kameras', true),
  category('ha', 'Heimwerkerbedarf', false),
  category('ha-14', 'Heimwerkerbedarf > Werkzeugzubehör', false),
  category('ha-14-16', 'Heimwerkerbedarf > Werkzeugzubehör > Elektrowerkzeug-Akkus', true),
  category('ha-15', 'Heimwerkerbedarf > Werkzeuge', false),
  category('ha-15-14', 'Heimwerkerbedarf > Werkzeuge > Bohrmaschinen', false),
  category(
    'ha-15-14-3',
    'Heimwerkerbedarf > Werkzeuge > Bohrmaschinen > Elektrische Handbohrmaschinen',
    true,
  ),
  category('ha-15-38', 'Heimwerkerbedarf > Werkzeuge > Multifunktionales Elektrowerkzeug', true),
];
