export function downloadOfflinePurchases(snapshot: { context: { workspaceId: string } }): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `flipbase-purchase-drafts-${snapshot.context.workspaceId}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
