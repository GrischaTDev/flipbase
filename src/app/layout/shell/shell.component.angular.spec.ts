import '@angular/compiler';
import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceContextLockService } from '../../core/services/workspace-context-lock.service';
import { ShellComponent } from './shell.component';

class SidebarStubComponent {
  readonly isOpen = input(false);
  readonly closed = output<void>();
}
Component({ selector: 'app-sidebar', template: '' })(SidebarStubComponent);

class HeaderStubComponent {
  readonly isSidebarOpen = input(false);
  readonly workspaceActionsBlocked = input(false);
  readonly toggleSidebar = output<void>();
  readonly openCreateWorkspace = output<void>();
}
Component({ selector: 'app-header', template: '' })(HeaderStubComponent);

class BottomNavStubComponent {
  readonly isMenuOpen = input(false);
  readonly toggleMenu = output<void>();
}
Component({ selector: 'app-bottom-nav', template: '' })(BottomNavStubComponent);

class ConfirmDialogStubComponent {}
Component({ selector: 'app-confirm-dialog', template: '' })(ConfirmDialogStubComponent);

class WorkspaceModalStubComponent {
  readonly closed = output<void>();
  readonly created = output<void>();
}
Component({ selector: 'app-workspace-modal', template: '' })(WorkspaceModalStubComponent);

class RouterOutletStubComponent {}
Component({ selector: 'router-outlet', template: '' })(RouterOutletStubComponent);

afterEach(() => TestBed.resetTestingModule());

describe('ShellComponent', () => {
  it('rendert eindeutige Druckhaken für alle Teile des Admin-Rahmens', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: WorkspaceContextLockService, useValue: { locked: signal(false) } }],
    });
    TestBed.overrideComponent(ShellComponent, {
      set: {
        template: readFileSync('src/app/layout/shell/shell.component.html', 'utf8'),
        imports: [
          SidebarStubComponent,
          HeaderStubComponent,
          BottomNavStubComponent,
          ConfirmDialogStubComponent,
          WorkspaceModalStubComponent,
          RouterOutletStubComponent,
        ],
      },
    });

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const shell = fixture.nativeElement as HTMLElement;

    for (const hook of [
      '[data-shell-sidebar]',
      '[data-shell-content]',
      '[data-shell-header]',
      '[data-shell-main]',
      '[data-shell-bottom-nav]',
    ]) {
      expect(shell.querySelector(hook)).not.toBeNull();
    }
  });
});
