const { test, expect } = require('@playwright/test');

test('imported cards without thumbnails form a responsive grid and render previews without changing the editor', async ({ page }) => {
    await page.route('https://accounts.google.com/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.goto('/');
    await expect(page.locator('#app-status')).toContainText('Listo');
    await page.evaluate(() => {
        const render = renderCardSnapshot;
        let active = 0; globalThis.galleryMaxActive = 0;
        globalThis.renderCardSnapshot = async (...args) => {
            active++; galleryMaxActive = Math.max(galleryMaxActive, active);
            try { return await render(...args); } finally { active--; }
        };
    });
    const editorName = await page.locator('#pokeName').inputValue();
    await page.getByRole('button', { name: /GALERÍA/ }).click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Importar JSON', exact: true }).click();
    const chooser = await chooserPromise;
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles(Array.from({ length: 8 }, (_, i) => ({ name: `card-${i}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ mainName: `Carta ${i + 1}`, tcgType: 'Planta', config: { setTextVal: 'KANrev', setNumCurr: String(i + 1) } })) })));
    await expect(page.locator('.saved-card-item')).toHaveCount(8);
    await expect.poll(() => page.locator('.card-thumb').first().evaluate(img => img.naturalWidth)).toBeGreaterThan(200);
    const first = await page.locator('.saved-card-item').nth(0).boundingBox();
    const second = await page.locator('.saved-card-item').nth(1).boundingBox();
    expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    expect(await page.evaluate(() => galleryMaxActive)).toBeLessThanOrEqual(2);
    expect(await page.locator('#pokeName').inputValue()).toBe(editorName);
    await page.locator('#dashboard_search').fill('Carta 8');
    await expect(page.locator('.saved-card-item:visible')).toHaveCount(1);
    await expect(page.locator('.gallery-count')).toHaveText('1 de 8 cartas');
    await page.locator('#dashboard_search').fill('');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileFirst = await page.locator('.saved-card-item').nth(0).boundingBox();
    const mobileSecond = await page.locator('.saved-card-item').nth(1).boundingBox();
    expect(Math.abs(mobileFirst.y - mobileSecond.y)).toBeLessThan(2);
    expect(mobileSecond.x + mobileSecond.width).toBeLessThanOrEqual(390);
});

test('gallery shows progress and usable cards before the last download, preserving them on failure', async ({ page }) => {
    await page.route('https://accounts.google.com/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.goto('/');
    await expect(page.locator('#app-status')).toContainText('Listo');
    await page.evaluate(() => {
        LocalCards.list = async ({ onProgress, onRecord } = {}) => {
            onProgress?.({ completed: 0, total: 3 });
            await new Promise(resolve => globalThis.releaseFirstCard = resolve);
            onRecord?.({ id: 'first', data: CardCore.normalizeCard({ mainName: 'Primera', config: { setTextVal: 'KANrev' } }) });
            onProgress?.({ completed: 1, total: 3 });
            await new Promise(resolve => globalThis.failRemainingCards = resolve);
            throw new Error('No se pudieron leer 2 cartas de Drive. Conexión interrumpida.');
        };
    });
    await page.getByRole('button', { name: /GALERÍA/ }).click();
    await expect(page.getByRole('progressbar', { name: 'Carga de cartas' })).toHaveAttribute('max', '3');
    await expect(page.getByText('Cargando cartas: 0 de 3')).toBeVisible();
    await page.evaluate(() => releaseFirstCard());
    await expect(page.locator('.saved-card-item')).toHaveCount(1);
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
    await expect(page.getByRole('button', { name: 'Respaldar JSON en ZIP' })).toBeDisabled();
    const preview = page.getByRole('button', { name: 'Abrir carta Primera' });
    await expect(preview).toBeEnabled();
    await page.evaluate(() => failRemainingCards());
    await expect(page.getByText(/Conexión interrumpida/).first()).toBeVisible();
    await expect(page.locator('.saved-card-item')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Reintentar carga' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Respaldar JSON en ZIP' })).toBeDisabled();
});
