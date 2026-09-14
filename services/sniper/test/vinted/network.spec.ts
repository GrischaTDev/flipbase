import dns from 'node:dns';
import { afterEach, describe, expect, it } from 'vitest';
import { preferIpv6 } from '../../src/vinted/network.js';

describe('Vinted network preference', () => {
  const originalOrder = dns.getDefaultResultOrder();

  afterEach(() => dns.setDefaultResultOrder(originalOrder));

  it('prefers IPv6 so the production server uses its working Vinted route', () => {
    preferIpv6();

    expect(dns.getDefaultResultOrder()).toBe('ipv6first');
  });
});
