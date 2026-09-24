import { Injectable } from '@angular/core';

interface ProductReturnContext {
  token: string;
  returnUrl: string;
  workspaceId: string;
  draft: unknown;
  createdProductId: string | null;
}

const storageKey = 'flipbase:purchase-product-return';

@Injectable({ providedIn: 'root' })
export class PurchaseProductReturnService {
  private read(): ProductReturnContext | null {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return null;
      const value: unknown = JSON.parse(stored);
      if (!value || typeof value !== 'object') return null;
      const context = value as Partial<ProductReturnContext>;
      if (
        typeof context.token !== 'string' ||
        typeof context.returnUrl !== 'string' ||
        !/^\/purchases\/(new|[^/]+(?:\/edit)?)$/.test(context.returnUrl) ||
        typeof context.workspaceId !== 'string' ||
        !context.draft
      )
        return null;
      return context as ProductReturnContext;
    } catch {
      return null;
    }
  }

  begin(returnUrl: string, workspaceId: string, draft: unknown): string {
    const token = crypto.randomUUID();
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        token,
        returnUrl,
        workspaceId,
        draft,
        createdProductId: null,
      } satisfies ProductReturnContext),
    );
    return token;
  }

  forCatalog(token: string | null, workspaceId: string | null): ProductReturnContext | null {
    const context = this.read();
    return context && context.token === token && context.workspaceId === workspaceId
      ? context
      : null;
  }

  isCatalogHandoff(url: string): boolean {
    const context = this.read();
    if (!context) return false;
    const [path, query] = url.split('?', 2);
    return (
      path === '/catalog/new' && new URLSearchParams(query).get('purchaseReturn') === context.token
    );
  }

  setCreatedProduct(token: string, productId: string): void {
    const context = this.read();
    if (context?.token !== token) return;
    sessionStorage.setItem(storageKey, JSON.stringify({ ...context, createdProductId: productId }));
  }

  consume(returnUrl: string, workspaceId: string): ProductReturnContext | null {
    const context = this.read();
    if (!context || context.returnUrl !== returnUrl || context.workspaceId !== workspaceId)
      return null;
    sessionStorage.removeItem(storageKey);
    return context;
  }
}
