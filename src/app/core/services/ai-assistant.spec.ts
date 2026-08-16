import { describe, it, expect, beforeEach } from 'vitest';
import { AiAssistantService } from './ai-assistant.service';

describe('AI Identification & Assistant Engine (Phase 8 & 9)', () => {
  let aiService: AiAssistantService;

  beforeEach(() => {
    aiService = new AiAssistantService();
  });

  it('should identify brand, model, category and condition from raw text (Chapter 13 & 14)', async () => {
    const raw = 'Bosch Akku-Bohrschrauber GSR 18V-55 wie neu mit 2 Akkus';
    const result = await aiService.identifyProduct(raw);

    expect(result.brand).toBe('Bosch');
    expect(result.model).toBe('GSR 18V-55');
    expect(result.category).toBe('Heimwerken & Werkzeug');
    expect(result.condition).toBe('like_new');
    expect(result.estimatedMarketPrice).toBeGreaterThan(50);
  });

  it('should detect defects and missing accessories accurately (Chapter 16)', async () => {
    const raw = 'iPhone 13 128GB mit starken Kratzern und Akku schwach ohne Kabel';
    const result = await aiService.identifyProduct(raw);

    expect(result.brand).toBe('Apple');
    expect(result.detectedDefects.length).toBeGreaterThanOrEqual(2);
    expect(result.detectedDefects.some((d) => d.includes('Kratzer'))).toBe(true);
    expect(result.detectedDefects.some((d) => d.includes('Akku'))).toBe(true);
  });

  it('should enhance listing copy for Kleinanzeigen with polite tone and defect warning (Chapter 15)', async () => {
    const title = 'Nintendo Switch OLED';
    const rawNotes = 'Kratzer auf der Rückseite, Display einwandfrei';
    const enhanced = await aiService.enhanceListingCopy(title, rawNotes, 'used', 'kleinanzeigen');

    expect(enhanced.enhancedTitle).toContain('Nintendo Switch OLED');
    expect(enhanced.enhancedDescription).toContain('Hallo zusammen,');
    expect(enhanced.enhancedDescription).toContain('Kratzer auf der Rückseite');
    expect(enhanced.suggestedKeywords.length).toBeGreaterThan(0);
  });
});
