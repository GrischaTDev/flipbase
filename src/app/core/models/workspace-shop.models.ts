import type { Workspace } from './flipbase.models';

export interface WorkspaceShopState {
  readonly workspace_id: string;
  readonly shop_enabled: boolean;
  readonly shop_entitled: boolean;
  readonly shop_version: number;
}

/** Alte lokale Darstellungen bleiben lesbar; neue Serverzeilen enthalten die Flags immer. */
export function isWorkspaceShopActive(workspace: Workspace | null | undefined): boolean {
  return !!workspace && (workspace.shop_enabled ?? true) && (workspace.shop_entitled ?? true);
}
