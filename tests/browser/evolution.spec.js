const { test, expect } = require('@playwright/test');
test('Pre-Evo search resolves primary, secondary and variant sprites locally and clears them', async ({ page }) => {
    const remoteImages = [];
    page.on('request', request => { if (request.url().startsWith('https://raw.githubusercontent.com/')) remoteImages.push(request.url()); });
    await page.route('https://accounts.google.com/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('https://pokeapi.co/api/v2/pokemon-species/bulbasaur', route => route.fulfill({ json: { id: 1, name: 'bulbasaur' } }));
    await page.goto('/');
    await expect.poll(() => page.locator('#cardCanvas').evaluate(c => c.width)).toBe(745);
    await page.getByRole('button', { name: 'Fase 1', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Buscar Pokémon de preevolución' });
    await search.fill('Bulbasaur'); await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Number(cardData.evoId))).toBe(1);
    await expect(page.locator('#evo_name')).toHaveValue('Bulbasaur');
    await expect(page.locator('#evo-status')).toContainText('local');
    for (const id of [10, 550]) {
        await search.fill(String(id)); await search.press('Enter');
        await expect.poll(() => page.evaluate(() => Number(cardData.evoId))).toBe(id);
        const path = await page.evaluate(async () => (await CardImages.evolution(cardData, true)).src);
        expect(path).toContain(id === 10 ? '/pokemons_other/010.webp' : '/pokemons/pm0550_');
    }
    expect(remoteImages).toEqual([]);
    await page.locator('#evo_controls_panel').getByRole('button', { name: 'X', exact: true }).click();
    expect(await page.evaluate(() => [cardData.evoId, cardData.evoArtData])).toEqual([null, null]);
    await expect(page.locator('#evo-status')).toContainText('eliminada');
});
