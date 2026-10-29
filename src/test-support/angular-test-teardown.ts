import { TestBed } from '@angular/core/testing';

/** Lebende Fixtures dürfen keine zurückgesetzten Bindungsmetadaten mehr verwenden. */
export function teardownAngularRendering(restoreBindings?: () => void): void {
  try {
    TestBed.resetTestingModule();
  } finally {
    restoreBindings?.();
  }
}
