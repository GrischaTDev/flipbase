import type { Server } from 'node:http';

export interface ProxyForwarderOptions {
  server: string;
  username: string;
  password: string;
}

export function isPublicHost(hostname: string): boolean;
export function createProxyForwarder(proxy: ProxyForwarderOptions): Server;
