import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Registrierungsbedingungen', () => {
  const register = readFileSync('src/app/features/auth/register/register.component.html', 'utf8');

  it('stellt funktionslose Rechtshinweise nicht als Links dar', () => {
    expect(register).not.toContain('href="#"');
    expect(register).not.toContain('(click)="$event.preventDefault()"');
  });
});
