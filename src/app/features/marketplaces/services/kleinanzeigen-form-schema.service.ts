import { DestroyRef, Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import type {
  KleinanzeigenFormResult,
  KleinanzeigenProviderSchema,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
export interface KleinanzeigenFormScope {
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly externalAccountId: string;
  readonly generation: number;
}
@Injectable()
export class KleinanzeigenFormSchemaService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly bridge = inject(KleinanzeigenExtensionBridge);
  private generation = 0;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());
  }
  cancel(): void {
    this.generation++;
    this.bridge.cancel();
  }
  async browse(
    scope: KleinanzeigenFormScope,
    categoryPath: string,
  ): Promise<KleinanzeigenFormResult> {
    const userId = this.auth.currentUser()?.id;
    const generation = ++this.generation;
    const current = () => {
      const workspace = this.workspace.currentWorkspace();
      if (
        !userId ||
        this.auth.currentUser()?.id !== userId ||
        workspace?.id !== scope.workspaceId ||
        workspace.archived_at ||
        generation !== this.generation
      )
        throw new Error('Die Ansicht oder Anmeldung wurde gewechselt. Öffne das Formular erneut.');
    };
    current();
    if (!this.bridge.formSchemaAvailable())
      throw new Error(
        'Aktualisiere und prüfe die Flipbase-Erweiterung für das Kleinanzeigen-Formular.',
      );
    const binding = await this.bridge.status(scope.workspaceId);
    current();
    if (
      !binding ||
      (['workspaceId', 'connectionId', 'externalAccountId', 'generation'] as const).some(
        (key) => binding[key] !== scope[key],
      )
    )
      throw new Error('Dieses Kleinanzeigen-Konto ist in einem anderen Browserprofil verbunden.');
    const result = await this.bridge.loadFormSchema(scope, categoryPath);
    current();
    return result;
  }
  async load(
    scope: KleinanzeigenFormScope,
    categoryPath: string,
  ): Promise<KleinanzeigenProviderSchema> {
    const result = await this.browse(scope, categoryPath);
    if (!result.schema) throw new Error('Wähle eine vollständige Zielkategorie.');
    return result.schema;
  }
}
