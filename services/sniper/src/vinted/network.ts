import dns from 'node:dns';

/**
 * Der Produktionsserver wird von Vinted ueber seine IPv4-Adresse mit einer
 * Cloudflare-Pruefung abgefangen. Der Server besitzt eine von Vinted
 * erreichbare IPv6-Route; Node bevorzugt diese bei ausgehenden Vinted-
 * Anfragen, sobald sie verfuegbar ist.
 */
export function preferIpv6(): void {
  dns.setDefaultResultOrder('ipv6first');
}
