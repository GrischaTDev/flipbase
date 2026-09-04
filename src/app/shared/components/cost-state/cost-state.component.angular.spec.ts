import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { CostStateComponent } from './cost-state.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('CostStateComponent', () => {
  it('rendert offene Kosten verständlich und ohne Null-Währung', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [CostStateComponent],
    }).createComponent(CostStateComponent);
    Object.assign(fixture.componentInstance, { state: signal({ kind: 'open' }) });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Kosten noch offen');
    expect(host.textContent).not.toContain('0,00');
    expect(host.querySelector('[aria-label]')?.getAttribute('aria-label')).toContain(
      'noch nicht erfasst',
    );
  });

  it('rendert bekannte Kosten als lokalisierten Euro-Betrag', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [CostStateComponent],
    }).createComponent(CostStateComponent);
    Object.assign(fixture.componentInstance, { state: signal({ kind: 'known', amount: 12.5 }) });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('12,50');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('€');
  });
});
