import '@angular/compiler';
import { Component, input, output, signal } from '@angular/core';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { PageLayoutService } from '../../core/services/page-layout.service';
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
  it('passt die Inhaltsbreite beim Navigieren und bei der Layoutwahl an', () => {
    const events = new Subject<NavigationEnd>();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { url: '/marketplaces/overview', events } },
        { provide: WorkspaceContextLockService, useValue: { locked: signal(false) } },
      ],
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
    const content = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-page-content]',
    )!;
    expect(content.style.maxWidth).toBe('80rem');
    events.next(new NavigationEnd(1, '/purchases', '/purchases'));
    fixture.detectChanges();
    expect(content.style.maxWidth).toBe('');
    TestBed.inject(PageLayoutService).setWidth('narrow');
    fixture.detectChanges();
    expect(content.style.maxWidth).toBe('64rem');
    events.next(new NavigationEnd(2, '/marketplaces/vinted/feed', '/marketplaces/vinted/feed'));
    fixture.detectChanges();
    expect(content.style.maxWidth).toBe('64rem');
    TestBed.inject(PageLayoutService).setWidth('full');
    fixture.detectChanges();
    expect(content.style.maxWidth).toBe('');
  });

  it('rendert eindeutige Druckhaken für alle Teile des Admin-Rahmens', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkspaceContextLockService, useValue: { locked: signal(false) } },
      ],
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
