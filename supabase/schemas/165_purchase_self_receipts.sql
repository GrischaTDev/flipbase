-- Eigenbelegmodus fuer Einkaeufe ohne eindeutig identifizierbaren Verkaeufer.
-- Betroffen: public.purchases.receipt_mode.
alter table public.purchases
  add column receipt_mode text not null default 'external'
    constraint purchases_receipt_mode_check
    check (receipt_mode in ('external', 'self'));

alter table public.purchases
  add constraint purchases_self_receipt_supplier_check
  check (receipt_mode <> 'self' or supplier_id is null);

comment on column public.purchases.receipt_mode is
  'external: vorhandener Fremdbeleg; self: Eigenbeleg fuer diesen Einkauf.';
