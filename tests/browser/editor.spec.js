const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { unzipSync, strFromU8 } = require('fflate');
async function start(page) {
    await page.route(/\/(?:config|app-config-[a-f0-9]+)\.js(?:\?.*)?$/, route => route.fulfill({ body: "globalThis.CARDMAKER_CONFIG = {googleClientId:''};", contentType: 'text/javascript' }));
    await page.route('https://accounts.google.com/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('https://pokeapi.co/**', route => route.fulfill({ status: 404, body: '{}' }));
    await page.goto('/');
    await expect(page.locator('#app-status')).not.toContainText('Iniciando');
    await expect.poll(() => page.locator('#cardCanvas').evaluate(c => c.width)).toBe(745);
}
test('initial load, all type backgrounds, and custom symbols render without console errors', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await start(page);
    const result = await page.evaluate(async () => {
        const snapshot = CardCore.normalizeCard(cardData, defaultConfig);
        snapshot.abilityName = 'Poder'; snapshot.abilityDesc = 'Tu Pokémon Activo recibe [g] energía.';
        snapshot.config.symbols.enabled = true;
        const canvas = document.createElement('canvas');
        for (const type of CardCore.TYPES) {
            snapshot.tcgType = type;
            await renderCardSnapshot(snapshot, canvas, { multiplier: 1 });
        }
        snapshot.stageVal = 'Fase2'; snapshot.config.evoX = 0;
        await renderCardSnapshot(snapshot, canvas, { multiplier: 1 });
        return { width: canvas.width, height: canvas.height, artX: cardData.config.artX };
    });
    expect(result.width).toBe(745); expect(result.height).toBe(1040); expect(errors).toEqual([]);
});
test('custom background is embedded in portable JSON and survives import', async ({ page }) => {
    await start(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Cargar mi fondo personalizado' }).click();
    await chooser;
    // Small real PNG, including transparency, rather than relying on external media.
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 2; c.getContext('2d').fillRect(0, 0, 1, 1); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    await page.locator('#background-file').setInputFiles({ name: 'background.png', mimeType: 'image/png', buffer: png });
    await expect.poll(() => page.evaluate(() => cardData.backgroundData?.startsWith('data:image/png;'))).toBe(true);
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'JSON ⬇' }).click();
    const data = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
    expect(data.backgroundData).toBe('data:image/png;base64,' + png.toString('base64'));
    await page.getByRole('button', { name: /GALERÍA/ }).click(); await page.getByRole('button', { name: /Carta en blanco/ }).click();
    expect(await page.evaluate(() => cardData.backgroundData)).toBeNull();
    await page.locator('input[accept=".json"]').first().setInputFiles({ name: 'portable.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await expect.poll(() => page.evaluate(() => cardData.backgroundData)).toBe(data.backgroundData);
});
test('local store prevents stale updates and stale deletes', async ({ page }) => {
    await start(page);
    const result = await page.evaluate(async () => {
        const record = { id: crypto.randomUUID(), data: CardCore.defaults() };
        const first = await LocalCards.save(record);
        const second = await LocalCards.save({ ...first, data: { ...first.data, mainName: 'New' } }, first.revision);
        let saveConflict = false, deleteConflict = false;
        try { await LocalCards.save(first, first.revision); } catch { saveConflict = true; }
        try { await LocalCards.remove(first.id, first.revision); } catch { deleteConflict = true; }
        const preserved = await LocalCards.get(first.id);
        await LocalCards.remove(first.id, second.revision);
        return { saveConflict, deleteConflict, preserved: preserved.data.mainName, removed: !(await LocalCards.get(first.id)) };
    });
    expect(result).toEqual({ saveConflict: true, deleteConflict: true, preserved: 'New', removed: true });
});
test('shorter name cancels an older autocomplete response', async ({ page }) => {
    await start(page);
    await page.unroute('https://pokeapi.co/**');
    let pokemonRequest;
    await page.route('https://pokeapi.co/api/v2/pokemon/pikachu', route => { pokemonRequest = route; });
    await page.locator('#pokeName').fill('Pikachu');
    await expect.poll(() => !!pokemonRequest).toBe(true);
    await page.locator('#pokeName').fill('x');
    await pokemonRequest.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 25, species: { name: 'pikachu' }, types: [{ type: { name: 'electric' } }], stats: [{ base_stat: 99 }] }) }).catch(() => {});
    await expect(page.locator('#pokeName')).toHaveValue('x');
    await expect(page.locator('#hp_val')).toHaveValue('60');
});
test('import is atomic, accepts desktop envelopes, and new card clears all state', async ({ page }) => {
    await start(page);
    const imported = { fullData: { pokeName: 'Importada', tcgType: 'Estelar', retreatCost: 4, attacks: [{ name: 'Golpe', cost: ['Fuego'] }], config: { artX: 0, bodyX: 123, setNumCurr: 7 } } };
    await page.locator('input[accept=".json"]').first().setInputFiles({ name: 'card.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await expect(page.locator('#pokeName')).toHaveValue('Importada');
    expect(await page.evaluate(() => [cardData.config.artX, cardData.config.bodyX, cardData.config.setNumCurr])).toEqual([0, 123, '7']);
    await page.locator('input[accept=".json"]').first().setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"attacks":null}') });
    await expect(page.locator('#app-status')).toContainText('No se importó');
    await expect(page.locator('#pokeName')).toHaveValue('Importada');
    await page.getByRole('button', { name: /GALERÍA/ }).click();
    await page.getByRole('button', { name: /Carta en blanco/ }).click();
    expect(await page.evaluate(() => ({ art: cardData.customArtData, evo: cardData.evoId, costs: cardData.attacks.map(a => a.cost), type: cardData.tcgType, retreat: cardData.retreatCost }))).toEqual({ art: null, evo: null, costs: [[], [], []], type: 'Planta', retreat: 0 });
});
test('PNG download waits for current state, local library round trips, and text is not HTML', async ({ page }) => {
    await start(page);
    await page.locator('#pokeName').fill('<img onerror=alert(1)>');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar PNG', exact: true }).click();
    const file = await downloaded;
    const data = fs.readFileSync(await file.path());
    expect(data.readUInt32BE(16)).toBe(2980); expect(data.readUInt32BE(20)).toBe(4160);
    await page.getByRole('button', { name: /GUARDAR/ }).click();
    await expect(page.locator('.saved-card-item')).toHaveCount(1);
    await expect(page.locator('.info-line-2')).toHaveText('<img onerror=alert(1)>');
    expect(await page.locator('.card-info img').count()).toBe(0);
    await page.reload();
    await expect(page.locator('#pokeName')).toHaveValue('<img onerror=alert(1)>');
    await page.getByRole('button', { name: /GALERÍA/ }).click();
    await expect(page.locator('.saved-card-item')).toHaveCount(1);
});
test('batch uses isolated snapshots, unique names, reports failures and leaves editor untouched', async ({ page }) => {
    await start(page);
    await page.evaluate(() => {
        const a = CardCore.normalizeCard(cardData, defaultConfig); a.mainName = 'Lote'; a.config.artX = 0;
        const b = structuredClone(a); b.config.evoName = 'Diferente'; b.stageVal = 'Fase1';
        const broken = structuredClone(a); broken.customArtData = 'data:image/png;base64,AAAA';
        window.batchPromise = downloadSetUltra('Prueba', [{ data: a }, { data: b }, { data: broken }]);
    });
    await page.locator('#pokeName').fill('Editor intacto');
    await expect(page.locator('#batch-status')).toContainText('2 PNG, 1 errores', { timeout: 45000 });
    await expect(page.locator('#pokeName')).toHaveValue('Editor intacto');
    const downloaded = page.waitForEvent('download'); await page.locator('#batch-downloads a').last().click();
    const zip = unzipSync(fs.readFileSync(await (await downloaded).path()));
    const names = Object.keys(zip).filter(n => n.endsWith('.png'));
    expect(names.length).toBe(2); expect(new Set(names).size).toBe(2);
    const report = JSON.parse(strFromU8(zip['informe.json'])); expect(report.errors.length).toBe(1); expect(report.succeeded).toBe(2);
});
test('mobile layout and missing Google configuration have clear states', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await start(page);
    await page.getByRole('button', { name: 'Conectar con Google' }).click();
    await expect(page.locator('#app-status')).toContainText('Falta configurar');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
