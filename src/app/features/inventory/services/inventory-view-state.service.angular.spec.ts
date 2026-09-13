import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { InventoryViewStateService } from './inventory-view-state.service';

describe('InventoryViewStateService', () => {
  const currentUser = signal({ id: 'user-a' });
  const currentWorkspace = signal({ id: 'workspace-a' });
  const isDemoMode = signal(false);

  beforeEach(() => {
    TestBed.resetTestingModule();
    currentUser.set({ id: 'user-a' });
    currentWorkspace.set({ id: 'workspace-a' });
    isDemoMode.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser, isDemoMode } },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
      ],
    });
  });

  it('erhält Suche und Filter bei erneutem Aufruf des Bestands', () => {
    const service = TestBed.inject(InventoryViewStateService);
    service.current().searchQuery.set('Tasse');
    service.current().selectedCondition.set('used');
    service.current().selectedStatus.set('reserved');
    service.current().stockView.set('all');
    service.current().activePreset.set('high_margin');
    const reopened = TestBed.inject(InventoryViewStateService).current();
    expect(reopened.searchQuery()).toBe('Tasse');
    expect(reopened.selectedCondition()).toBe('used');
    expect(reopened.selectedStatus()).toBe('reserved');
    expect(reopened.stockView()).toBe('all');
    expect(reopened.activePreset()).toBe('high_margin');
  });

  it('trennt Konten, Workspaces und Demo und stellt deren eigene Ansicht wieder her', () => {
    const service = TestBed.inject(InventoryViewStateService);
    service.current().searchQuery.set('Tasse');
    currentWorkspace.set({ id: 'workspace-b' });
    expect(service.current().searchQuery()).toBe('');
    service.current().searchQuery.set('Lampe');
    currentUser.set({ id: 'user-b' });
    expect(service.current().searchQuery()).toBe('');
    currentUser.set({ id: 'user-a' });
    expect(service.current().searchQuery()).toBe('Lampe');
    currentWorkspace.set({ id: 'workspace-a' });
    expect(service.current().searchQuery()).toBe('Tasse');
    isDemoMode.set(true);
    expect(service.current().searchQuery()).toBe('');
  });
});
