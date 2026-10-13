if (process.env.PUSH_PROCESS === 'gateway') {
  const { createPushGateway } = await import('./push-gateway.ts');
  const server = createPushGateway({ commit: process.env.FLIPBASE_COMMIT ?? '' });
  server.listen(4177, '0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close());
} else if (!process.env.PUSH_PROCESS || process.env.PUSH_PROCESS === 'worker') {
  await import('./main.ts');
} else {
  throw new Error('Invalid push process');
}
