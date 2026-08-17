import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class RealProductImageService {
  private readonly imageCache = new Map<string, string[]>();

  /**
   * Fetches real live product photographs for any search query using public media APIs.
   */
  async fetchRealImagesForQuery(query: string, limit: number = 8): Promise<string[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const cacheKey = trimmed.toLowerCase();
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
            `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQ}&gsrlimit=10&gsrnamespace=6&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=600&format=json&origin=*`
          );
          if (res.ok) {
            const data = await res.json();
            const pages = data?.query?.pages || {};
            for (const p of Object.values<any>(pages)) {
              const u = p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url;
              if (
                u &&
                (u.includes('.jpg') || u.includes('.jpeg') || u.includes('.png') || u.includes('.webp')) &&
                !u.includes('.pdf') &&
                !u.includes('.svg') &&
                !u.includes('.ogg') &&
                !u.includes('courant') && // filter old scanned news
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
            `https://de.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQ}&gsrlimit=6&prop=pageimages&pithumbsize=600&format=json&origin=*`
          );
          if (res.ok) {
            const data = await res.json();
            const pages = data?.query?.pages || {};
            for (const p of Object.values<any>(pages)) {
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
            `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanQ}&gsrlimit=6&prop=pageimages&pithumbsize=600&format=json&origin=*`
          );
          if (res.ok) {
            const data = await res.json();
            const pages = data?.query?.pages || {};
            for (const p of Object.values<any>(pages)) {
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

  private getFallbackPhotography(query: string, limit: number): string[] {
    const lower = query.toLowerCase();

    if (lower.includes('airpod') || lower.includes('audio') || lower.includes('kopfhörer') || lower.includes('bose') || lower.includes('sony')) {
      return [
        'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
      ];
    }
    if (lower.includes('switch') || lower.includes('ps5') || lower.includes('xbox') || lower.includes('gaming') || lower.includes('konsole')) {
      return [
        'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=600&auto=format&fit=crop&q=80',
      ];
    }
    if (lower.includes('bosch') || lower.includes('makita') || lower.includes('werkzeug') || lower.includes('dewalt') || lower.includes('bohr')) {
      return [
        'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1581147036324-c17ac41dfa6c?w=600&auto=format&fit=crop&q=80',
      ];
    }
    if (lower.includes('schuhe') || lower.includes('sneaker') || lower.includes('nike') || lower.includes('adidas') || lower.includes('jordan')) {
      return [
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=600&auto=format&fit=crop&q=80',
      ];
    }

    return [
      'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=600&auto=format&fit=crop&q=80',
    ];
  }
}
