const { test, expect } = require('@playwright/test');
test('Ultra uses export-sized frames; preview stays light and uploads retain original pixels', async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.route('https://accounts.google.com/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.goto('/');
    await expect.poll(() => page.locator('#cardCanvas').evaluate(c => c.width)).toBe(745);
    expect(requests.some(url => url.includes('/web-assets/export/'))).toBe(false);
    const result = await page.evaluate(async () => {
        const src = CardCore.backgroundPath('Planta', 'Basico');
        const preview = await CardImages.load(src, { required: true });
        const full = await CardImages.load(src, { required: true, fullResolution: true });
        const frame = document.createElement('canvas');
        await renderCardSnapshot(CardCore.normalizeCard(cardData, defaultConfig), frame, { multiplier: 4 });
        const source = document.createElement('canvas'); source.width = 2200; source.height = 1800;
        source.getContext('2d').fillRect(0, 0, 100, 100);
        const original = source.toDataURL('image/png');
        const bytes = Uint8Array.from(atob(original.split(',')[1]), char => char.charCodeAt(0));
        const file = new File([bytes], 'art.png', { type: 'image/png' });
        const uploaded = await rasterFile(file);
        document.getElementById('compress_uploads').checked = true;
        const compressed = await rasterFile(file);
        const compressedImage = await CardImages.load(compressed, { required: true });
        return { preview: [preview.width, preview.height], full: [full.width, full.height], output: [frame.width, frame.height], uploadUnchanged: uploaded === original, compressedDimensions: [compressedImage.width, compressedImage.height], compressedWebp: compressed.startsWith('data:image/webp;') };
    });
    expect(result).toEqual({ preview: [745, 1040], full: [2980, 4160], output: [2980, 4160], uploadUnchanged: true, compressedDimensions: [2200, 1800], compressedWebp: true });
    expect(requests.some(url => url.includes('/web-assets/export/bordes/'))).toBe(true);
});
