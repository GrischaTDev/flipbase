import { Injectable } from '@angular/core';
import type { ResearchComparisonItem } from './research.service';

@Injectable({ providedIn: 'root' })
export class EbayApiService {
  /** Die abgeschaltete Finding API liefert keine marktweiten Verkaufspreise mehr. */
  async searchSoldItems(_query: string, _limit = 10): Promise<ResearchComparisonItem[]> {
    return [];
  }
}
