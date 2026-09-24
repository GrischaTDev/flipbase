import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../core/services/auth.service';
import { ArticleLifecycleService } from './article-lifecycle.service';

describe('ArticleLifecycleService', () => {
  const workspace = signal({ id: 'own' });
  const user = signal({ id: 'member' });
  const rpc = vi.fn();

  beforeEach(() => {
    workspace.set({ id: 'own' });
    user.set({ id: 'member' });
    rpc.mockReset().mockResolvedValue({
      data: { id: 'article', workspace_id: 'own', deleted: true },
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: SupabaseService, useValue: { client: { rpc } } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('verwendet für beide Artikelarten die richtige Archivfunktion', async () => {
    const service = TestBed.inject(ArticleLifecycleService);
    await service.setArchived('own', 'catalog', 'article', true);
    await service.setArchived('own', 'item', 'article', false);
    expect(rpc).toHaveBeenNthCalledWith(1, 'set_catalog_product_archived', {
      p_workspace_id: 'own',
      p_product_id: 'article',
      p_archived: true,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_inventory_item_archived', {
      p_workspace_id: 'own',
      p_item_id: 'article',
      p_archived: false,
    });
  });

  it('lässt eine verspätete Antwort nach Workspacewechsel nicht als Erfolg gelten', async () => {
    let finish!: (value: unknown) => void;
    rpc.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const service = TestBed.inject(ArticleLifecycleService);
    const pending = service.setArchived('own', 'catalog', 'article', true);
    workspace.set({ id: 'other' });
    finish({ data: { id: 'article', workspace_id: 'own' }, error: null });
    await expect(pending).rejects.toThrow('Workspace');
    expect(service.pendingIds().size).toBe(0);
  });

  it('löscht nur über den geschützten Datenbankaufruf', async () => {
    const service = TestBed.inject(ArticleLifecycleService);
    await service.deleteUnused('own', 'catalog', 'article');
    expect(rpc).toHaveBeenCalledWith('delete_unused_article', {
      p_workspace_id: 'own',
      p_article_kind: 'catalog',
      p_article_id: 'article',
    });
  });
});
