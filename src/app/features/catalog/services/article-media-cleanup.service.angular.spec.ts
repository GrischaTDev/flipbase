import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ArticleMediaCleanupService } from './article-media-cleanup.service';

describe('ArticleMediaCleanupService', () => {
  const workspace = signal({ id: 'own' });
  const invoke = vi.fn();
  beforeEach(() => {
    workspace.set({ id: 'own' });
    invoke
      .mockReset()
      .mockResolvedValue({ data: { completed: 1, pending: 0, failed: 0 }, error: null });
    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('löst nur Aufträge des aktiven Workspace aus', async () => {
    const service = TestBed.inject(ArticleMediaCleanupService);
    expect(await service.retry('own', true)).toEqual({ completed: 1, pending: 0, failed: 0 });
    expect(invoke).toHaveBeenCalledWith('article-media-cleanup', {
      body: { workspaceId: 'own', force: true },
    });
    await expect(service.retry('other', true)).rejects.toThrow('Workspace');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('behält ausstehende Bilddateien als sichtbaren Zustand', async () => {
    invoke.mockResolvedValueOnce({ data: { completed: 0, pending: 2, failed: 1 }, error: null });
    const service = TestBed.inject(ArticleMediaCleanupService);
    await service.retry('own', false);
    expect(service.status()).toEqual({ completed: 0, pending: 2, failed: 1 });
  });
});
