import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CatalogViewStateService {
  private readonly searches = new Map<string, string>();

  searchFor(workspaceId: string): string {
    return this.searches.get(workspaceId) ?? '';
  }

  rememberSearch(workspaceId: string, search: string): void {
    this.searches.set(workspaceId, search);
  }
}
