import { Injectable } from '@angular/core';

interface MediaWikiImagePage {
  imageinfo?: { thumburl?: string; url?: string }[];
  thumbnail?: { source?: string };
}

interface MediaWikiSearchResponse {
  query?: { pages?: Record<string, MediaWikiImagePage> };
}

@Injectable({
  providedIn: 'root',
})
export class RealProductImageService {
  private readonly imageCache = new Map<string, string[]>();

  /**
   * Fetches real live product photographs for any search query using public media APIs.
   */
  async fetchRealImagesForQuery(query: string, limit = 30): Promise<string[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const cacheKey = `${trimmed.toLowerCase()}_${limit}`;
    if (this.imageCache.has(cacheKey)) {
      return this.imageCache.get(cacheKey)!;
    }

    const cleanQ = encodeURIComponent(trimmed);
    const photos: string[] = [];

    // Parallel fetch from Wikimedia Commons and Wikipedia PageImages
    const fetchPromises = [
      // 1. Wikimedia Commons Real Image Search
      (async () => {
        try {
          const res = await fetch(
            `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQ}&gsrlimit=${Math.min(limit + 10, 50)}&gsrnamespace=6&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=600&format=json&origin=*`,
          );
          if (res.ok) {
            const data = (await res.json()) as MediaWikiSearchResponse;
            const pages = data?.query?.pages || {};
            for (const p of Object.values(pages)) {
              const u = p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url;
              if (
                u &&
                (u.includes('.jpg') ||
                  u.includes('.jpeg') ||
                  u.includes('.png') ||
                  u.includes('.webp')) &&
                !u.includes('.pdf') &&
                !u.includes('.svg') &&
                !u.includes('.ogg') &&
                !u.includes('courant') &&
                !u.includes('Brabander')
              ) {
                photos.push(u);
              }
            }
          }
        } catch {
          // ignore network failure
        }
      })(),

      // 2. Wikipedia German PageImages
      (async () => {
        try {
          const res = await fetch(
            `https://de.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQ}&gsrlimit=12&prop=pageimages&pithumbsize=600&format=json&origin=*`,
          );
          if (res.ok) {
            const data = (await res.json()) as MediaWikiSearchResponse;
            const pages = data?.query?.pages || {};
            for (const p of Object.values(pages)) {
              const src = p.thumbnail?.source;
              if (src && !src.endsWith('.svg') && !src.endsWith('.png.svg')) {
                photos.push(src);
              }
            }
          }
        } catch {
          // ignore network failure
        }
      })(),

      // 3. Wikipedia English PageImages
      (async () => {
        try {
          const res = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQ}&gsrlimit=12&prop=pageimages&pithumbsize=600&format=json&origin=*`,
          );
          if (res.ok) {
            const data = (await res.json()) as MediaWikiSearchResponse;
            const pages = data?.query?.pages || {};
            for (const p of Object.values(pages)) {
              const src = p.thumbnail?.source;
              if (src && !src.endsWith('.svg') && !src.endsWith('.png.svg')) {
                photos.push(src);
              }
            }
          }
        } catch {
          // ignore network failure
        }
      })(),
    ];

    await Promise.allSettled(fetchPromises);

    // Deduplicate URLs
    const uniquePhotos = Array.from(new Set(photos)).slice(0, limit);

    if (uniquePhotos.length > 0) {
      this.imageCache.set(cacheKey, uniquePhotos);
      return uniquePhotos;
    }

    // High quality contextual fallback if real media search didn't return matches
    const fallbackPhotos = this.getFallbackPhotography(trimmed, limit);
    this.imageCache.set(cacheKey, fallbackPhotos);
    return fallbackPhotos;
  }

  private getFallbackPhotography(query: string, _limit: number): string[] {
    const lower = query.toLowerCase();

    const pool = [
      'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=600&auto=format&fit=crop&q=80',
    ];

    if (
      lower.includes('airpod') ||
      lower.includes('audio') ||
      lower.includes('kopfhörer') ||
      lower.includes('bose') ||
      lower.includes('sony')
    ) {
      return [
        'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1598331668826-20cecc596b86?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?w=600&auto=format&fit=crop&q=80',
      ];
    }
    if (
      lower.includes('switch') ||
      lower.includes('ps5') ||
      lower.includes('xbox') ||
      lower.includes('gaming') ||
      lower.includes('konsole')
    ) {
      return [
        'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1612287233207-6b66e3309a47?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=600&auto=format&fit=crop&q=80',
      ];
    }

    return pool;
  }
}
