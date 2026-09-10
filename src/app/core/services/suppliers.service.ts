import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncStatusService } from './sync-status.service';
import { SellerFormValue, Supplier } from '../models/flipbase.models';
import { nurAktive } from './stammdaten-filter';

type SupplierUpdate = Partial<SellerFormValue> & Pick<Partial<Supplier>, 'contact_info'>;

function trimmedOrNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function normalizeSeller(value: SellerFormValue): SellerFormValue {
  const sellerType = value.seller_type;

  return {
    seller_type: sellerType,
    name: value.name.trim(),
    contact_person: sellerType === 'business' ? trimmedOrNull(value.contact_person) : null,
    country_code: value.country_code?.toUpperCase() || null,
    street: trimmedOrNull(value.street),
    address_extra: trimmedOrNull(value.address_extra),
    postal_code: trimmedOrNull(value.postal_code),
    city: trimmedOrNull(value.city),
    email: trimmedOrNull(value.email),
    phone: trimmedOrNull(value.phone),
    website: sellerType === 'business' ? trimmedOrNull(value.website) : null,
    notes: trimmedOrNull(value.notes),
  };
}

@Injectable({
  providedIn: 'root',
})
export class SuppliersService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly suppliers = signal<Supplier[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const currentWs = this.workspaceService.currentWorkspace();
        if (currentWs) {
          this.loadSuppliers(currentWs.id);
        } else {
          this.suppliers.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  /**
   * Ob auch archivierte Lieferanten geladen werden.
   *
   * Der Filter sitzt bewusst nur hier und nicht in den Komponenten: Wird er
   * an einer Stelle vergessen, tauchen archivierte Eintraege in Auswahllisten
   * wieder auf - der haeufigste Fehler bei dieser Bauweise.
   */
  readonly zeigeArchivierte = signal<boolean>(false);

  /** Nur waehlbare Lieferanten - fuer Auswahllisten in Formularen. */
  readonly aktiveSuppliers = computed<Supplier[]>(() => nurAktive(this.suppliers()));

  async loadSuppliers(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      const local = this.mockStore.getSuppliers(workspaceId);
      this.suppliers.set(this.zeigeArchivierte() ? local : nurAktive(local));
      return;
    }

    this.isLoading.set(true);
    try {
      let abfrage = this.supabase.client
        .from('suppliers')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (!this.zeigeArchivierte()) {
        abfrage = abfrage.eq('is_active', true);
      }

      const { data, error } = await abfrage.order('name', { ascending: true });

      if (error) {
        this.syncStatus.melde('Laden der Lieferanten', error);
        this.suppliers.set([]);
      } else if (data) {
        this.suppliers.set(data as Supplier[]);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Lieferanten', err);
      this.suppliers.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSupplier(
    value: SellerFormValue,
  ): Promise<{ data: Supplier | null; error: Error | null }>;
  /** @deprecated Übergang für die bisherige Quellenverwaltung. */
  async createSupplier(
    name: string,
    contactInfo?: string,
    notes?: string,
    details?: Partial<
      Pick<
        Supplier,
        | 'seller_type'
        | 'contact_person'
        | 'country'
        | 'street'
        | 'address_extra'
        | 'postal_code'
        | 'city'
        | 'email'
        | 'phone'
        | 'website'
      >
    >,
  ): Promise<{ data: Supplier | null; error: Error | null }>;
  async createSupplier(
    valueOrName: SellerFormValue | string,
    contactInfo?: string,
    notes?: string,
    legacyDetails: Partial<
      Pick<
        Supplier,
        | 'seller_type'
        | 'contact_person'
        | 'country'
        | 'street'
        | 'address_extra'
        | 'postal_code'
        | 'city'
        | 'email'
        | 'phone'
        | 'website'
      >
    > = {},
  ): Promise<{ data: Supplier | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt') };

    const isStructured = typeof valueOrName !== 'string';
    const details = isStructured
      ? normalizeSeller(valueOrName)
      : {
          ...legacyDetails,
          name: valueOrName.trim(),
          contact_info: trimmedOrNull(contactInfo),
          notes: trimmedOrNull(notes),
        };

    if (!details.name) return { data: null, error: new Error('Der Name darf nicht leer sein') };

    const newSup: Supplier = {
      ...details,
      id: crypto.randomUUID(),
      workspace_id: ws.id,
      is_active: true,
    };

    if (this.mockStore.isDemoMode()) {
      this.mockStore.saveSupplier(newSup);
      this.suppliers.update((list) => [...list, newSup]);
      return { data: newSup, error: null };
    }

    try {
      const { data: dbSup, error: dbError } = await this.supabase.client
        .from('suppliers')
        .insert({
          ...details,
          workspace_id: ws.id,
          is_active: true,
        })
        .select()
        .single();

      if (dbError) {
        return { data: null, error: this.syncStatus.melde('Anlegen des Lieferanten', dbError) };
      }
      if (!dbSup) return { data: null, error: new Error('Lieferant wurde nicht zurückgegeben') };

      const finalSup: Supplier = { ...newSup, id: dbSup.id };
      this.mockStore.saveSupplier(finalSup);
      this.suppliers.update((list) => [finalSup, ...list.filter((s) => s.id !== finalSup.id)]);
      return { data: finalSup, error: null };
    } catch (e) {
      return { data: null, error: this.syncStatus.melde('Anlegen des Lieferanten', e) };
    }
  }

  /**
   * Ändert Name, Kontaktangaben oder Notizen eines Lieferanten.
   *
   * Unkritisch: Einkäufe verweisen über die unveränderliche Kennung, nicht
   * über den Namen. Eine Umbenennung erscheint deshalb überall sofort, ohne
   * dass eine Verknüpfung verlorengeht.
   */
  async updateSupplier(
    supplierId: string,
    aenderungen: SupplierUpdate,
  ): Promise<{ data: Supplier | null; error: Error | null }> {
    const current = this.suppliers().find((supplier) => supplier.id === supplierId);
    const isStructured = aenderungen.seller_type !== undefined;
    const bereinigt: SupplierUpdate = isStructured
      ? normalizeSeller({
          seller_type: aenderungen.seller_type ?? current?.seller_type ?? 'private',
          name: aenderungen.name ?? current?.name ?? '',
          contact_person: aenderungen.contact_person ?? current?.contact_person ?? null,
          country_code: aenderungen.country_code ?? current?.country_code ?? null,
          street: aenderungen.street ?? current?.street ?? null,
          address_extra: aenderungen.address_extra ?? current?.address_extra ?? null,
          postal_code: aenderungen.postal_code ?? current?.postal_code ?? null,
          city: aenderungen.city ?? current?.city ?? null,
          email: aenderungen.email ?? current?.email ?? null,
          phone: aenderungen.phone ?? current?.phone ?? null,
          website: aenderungen.website ?? current?.website ?? null,
          notes: aenderungen.notes ?? current?.notes ?? null,
        })
      : {
          ...aenderungen,
          ...(aenderungen.name !== undefined ? { name: aenderungen.name.trim() } : {}),
          ...(aenderungen.contact_info !== undefined
            ? { contact_info: trimmedOrNull(aenderungen.contact_info) }
            : {}),
          ...(aenderungen.notes !== undefined ? { notes: trimmedOrNull(aenderungen.notes) } : {}),
        };

    if (bereinigt.name !== undefined && bereinigt.name.length === 0) {
      return { data: null, error: new Error('Der Name darf nicht leer sein') };
    }

    const lokalAnwenden = (): Supplier | null => {
      this.suppliers.update((list) =>
        list.map((s) => (s.id === supplierId ? { ...s, ...bereinigt } : s)),
      );
      const vorhanden = this.suppliers().find((s) => s.id === supplierId);
      if (vorhanden) this.mockStore.saveSupplier(vorhanden);
      return vorhanden ?? null;
    };

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('suppliers')
          .update(bereinigt)
          .eq('id', supplierId);
        if (error) {
          return { data: null, error: this.syncStatus.melde('Ändern des Lieferanten', error) };
        }
      } catch (e: unknown) {
        return { data: null, error: this.syncStatus.melde('Ändern des Lieferanten', e) };
      }
    }
    return { data: lokalAnwenden(), error: null };
  }

  /**
   * Archiviert einen Lieferanten oder holt ihn zurück.
   *
   * Archivieren statt Löschen, weil Einkäufe darauf verweisen und diese
   * Verweise nachvollziehbar bleiben müssen.
   */
  async setSupplierArchiviert(
    supplierId: string,
    archiviert: boolean,
  ): Promise<{ error: Error | null }> {
    const neuerWert = !archiviert;

    const lokalAnwenden = () => {
      const geaendert = this.suppliers().find((s) => s.id === supplierId);
      if (geaendert) this.mockStore.saveSupplier({ ...geaendert, is_active: neuerWert });
      this.suppliers.update((list) =>
        this.zeigeArchivierte()
          ? list.map((s) => (s.id === supplierId ? { ...s, is_active: neuerWert } : s))
          : list.filter((s) => s.id !== supplierId),
      );
    };

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('suppliers')
          .update({ is_active: neuerWert })
          .eq('id', supplierId);
        if (error) {
          return { error: this.syncStatus.melde('Archivieren des Lieferanten', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Archivieren des Lieferanten', e) };
      }
    }
    lokalAnwenden();
    return { error: null };
  }

  /** Zählt die Einkäufe, die auf diesen Lieferanten verweisen. */
  async zaehleVerknuepfteEinkaeufe(
    supplierId: string,
  ): Promise<{ count: number | null; error: Error | null }> {
    if (this.mockStore.isDemoMode()) {
      return {
        count: this.mockStore.getPurchases().filter((p) => p.supplier_id === supplierId).length,
        error: null,
      };
    }
    try {
      const { count, error } = await this.supabase.client
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', supplierId);
      if (error) {
        return {
          count: null,
          error: this.syncStatus.melde('Prüfen der verknüpften Einkäufe', error),
        };
      }
      return { count: count ?? 0, error: null };
    } catch (e) {
      return {
        count: null,
        error: this.syncStatus.melde('Prüfen der verknüpften Einkäufe', e),
      };
    }
  }

  /**
   * Löscht einen Lieferanten endgültig - aber nur, wenn kein Einkauf darauf
   * verweist. Sonst setzt die Datenbank `purchases.supplier_id` stillschweigend
   * auf leer (ON DELETE SET NULL), und die Angabe ist unwiederbringlich weg.
   */
  async deleteSupplier(supplierId: string): Promise<{ error: Error | null }> {
    const pruefung = await this.zaehleVerknuepfteEinkaeufe(supplierId);
    if (pruefung.error) return { error: pruefung.error };
    const verknuepft = pruefung.count ?? 0;

    if (verknuepft > 0) {
      const anzahl = verknuepft === 1 ? 'hängt 1 Einkauf' : `hängen ${verknuepft} Einkäufe`;
      return {
        error: new Error(
          `An diesem Lieferanten ${anzahl}. Endgültiges Löschen würde die Angabe dort ` +
            'entfernen. Archiviere den Lieferanten stattdessen.',
        ),
      };
    }

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('suppliers')
          .delete()
          .eq('id', supplierId);
        if (error) {
          return { error: this.syncStatus.melde('Löschen des Lieferanten', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Löschen des Lieferanten', e) };
      }
    }
    this.mockStore.deleteSupplier(supplierId);
    this.suppliers.update((list) => list.filter((s) => s.id !== supplierId));
    return { error: null };
  }

  /**
   * Laedt Lieferanten des aktiven Workspace neu.
   *
   * Noetig nach dem Umschalten von `zeigeArchivierte`, weil der Filter in der
   * Datenbankabfrage sitzt und nicht in der Anzeige.
   */
  async neuLaden(): Promise<void> {
    const ws = this.workspaceService.currentWorkspace();
    if (ws) await this.loadSuppliers(ws.id);
  }
}
