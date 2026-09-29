import type { TableConfig } from '../models/table-preferences.models';

export type MasterDataColumnId = 'name' | 'kind' | 'status' | 'actions';
export type MasterDataSortField = 'name';
export type MasterDataTableId = 'master_brands' | 'master_sources' | 'master_platforms';

const name = {
  id: 'name',
  label: 'Name',
  visible: true,
  order: 0,
  locked: true,
} as const;
const actions = {
  id: 'actions',
  label: 'Aktionen',
  visible: true,
  order: 3,
  locked: true,
} as const;
const sorting = {
  defaultSort: { field: 'name', direction: 'asc' },
  sortOptions: [{ value: 'name', label: 'Name', kind: 'text' }],
} as const;

export const MASTER_DATA_TABLE_CONFIGS: Record<
  MasterDataTableId,
  TableConfig<MasterDataColumnId, MasterDataSortField>
> = {
  master_brands: { ...sorting, defaultColumns: [name, { ...actions, order: 1 }] },
  master_sources: {
    ...sorting,
    defaultColumns: [
      name,
      { id: 'kind', label: 'Vorgabe', visible: true, order: 1 },
      { id: 'status', label: 'Status', visible: true, order: 2 },
      actions,
    ],
  },
  master_platforms: {
    ...sorting,
    defaultColumns: [name, { id: 'kind', label: 'Typ', visible: true, order: 1 }],
  },
};

export type SellerMasterDataColumnId =
  | 'name'
  | 'type'
  | 'contact'
  | 'communication'
  | 'location'
  | 'status'
  | 'actions';

export const SELLER_MASTER_DATA_TABLE_CONFIG: TableConfig<SellerMasterDataColumnId, 'name'> = {
  ...sorting,
  defaultColumns: [
    { ...name, label: 'Name / Firma' },
    { id: 'type', label: 'Typ', visible: true, order: 1 },
    { id: 'contact', label: 'Kontaktperson', visible: true, order: 2 },
    { id: 'communication', label: 'E-Mail / Telefon', visible: true, order: 3 },
    { id: 'location', label: 'Ort / Land', visible: true, order: 4 },
    { id: 'status', label: 'Status', visible: true, order: 5 },
    { ...actions, order: 6 },
  ],
};
