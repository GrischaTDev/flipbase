import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ToastContainerComponent } from './toast-container.component';
import { ToastService } from './toast.service';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('ToastContainerComponent', () => {
  let fixture: ComponentFixture<ToastContainerComponent>;
  let service: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
    });
    fixture = TestBed.createComponent(ToastContainerComponent);
    service = TestBed.inject(ToastService);
  });

  it('richtet Icon, Inhalt und Schließen-Schaltfläche auf festen 32-Pixel-Spalten aus', () => {
    service.success('Gespeichert.');
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.fb-toast') as HTMLElement;
    const icon = fixture.nativeElement.querySelector('.fb-toast__icon') as HTMLElement;
    const close = fixture.nativeElement.querySelector('.fb-toast__close') as HTMLElement;

    expect(toast.className).toContain('grid-cols-[2rem_minmax(0,1fr)_2rem]');
    expect(icon.classList).toContain('h-8');
    expect(icon.classList).toContain('w-8');
    expect(close.classList).toContain('h-8');
    expect(close.classList).toContain('w-8');
  });

  it('verwendet eine neutrale Toast-Fläche mit dem Flipbase-Erfolgston', () => {
    service.success('Workspace wurde erstellt.');
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.fb-toast') as HTMLElement;
    expect(toast.classList).toContain('fb-toast--success');
    expect(toast.className).not.toMatch(/emerald-950|bg-green|bg-emerald/);
  });
});
