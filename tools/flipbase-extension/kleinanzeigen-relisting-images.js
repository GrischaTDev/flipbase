// Beim erneuten Inserieren niemals die signierte 96-Pixel-Bearbeitungsvorschau kopieren.
(function defineRelistingImages(root) {
  function sourceUrl(value) {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['img.kleinanzeigen.de', 'img.classistatic.de', 'i.ebayimg.com'].includes(url.hostname)
    )
      throw new Error('images_incomplete');
    if (
      url.hostname === 'img.kleinanzeigen.de' &&
      /^\/api\/v1\/prod-ads\/images\/[a-f0-9]{2}\/[a-f0-9-]+$/u.test(url.pathname)
    ) {
      // Dieselbe große Fassung, die der Anbieter in seiner öffentlichen Galerie ausliefert.
      url.search = '';
      url.searchParams.set('rule', '$_59.AUTO');
      url.hash = '';
    }
    return url.href;
  }
  async function verify(bytes, mimeType, decode = (blob) => root.createImageBitmap(blob)) {
    let bitmap;
    try {
      bitmap = await decode(new Blob([bytes], { type: mimeType }));
      // Qualitätsuntergrenze vor dem Löschen: eine Vorschau ist kein Ersatzfoto.
      if (
        !Number.isInteger(bitmap.width) ||
        !Number.isInteger(bitmap.height) ||
        Math.min(bitmap.width, bitmap.height) < 1 ||
        Math.max(bitmap.width, bitmap.height) < 512
      )
        throw new Error('image_quality_insufficient');
      return { width: bitmap.width, height: bitmap.height };
    } catch {
      throw new Error('image_quality_insufficient');
    } finally {
      bitmap?.close();
    }
  }
  root.FlipbaseKleinanzeigenRelistingImages = Object.freeze({ sourceUrl, verify });
})(globalThis);
