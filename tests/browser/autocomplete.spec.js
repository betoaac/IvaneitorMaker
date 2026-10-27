const { test, expect } = require('@playwright/test');
test('both Pokemon fields offer local name suggestions and pre-evolution works without PokeAPI', async ({ page }) => {
    await page.route('https://accounts.google.com/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('https://pokeapi.co/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#pokemon-name-suggestions option')).toHaveCount(1025);
    await expect(page.locator('#pokeName')).toHaveAttribute('list', 'pokemon-name-suggestions');
    await page.getByRole('button', { name: 'Fase 1', exact: true }).click();
    const input = page.getByLabel('Buscar Pokémon de preevolución', { exact: true });
    await expect(input).toHaveAttribute('list', 'pokemon-name-suggestions');
    expect(await page.locator('#pokemon-name-suggestions option').evaluateAll(options => options.filter(option => option.value.toLowerCase().startsWith('bul')).map(option => option.value))).toContain('Bulbasaur');
    await input.fill('Bulbasaur'); await input.press('Enter');
    await expect.poll(() => page.evaluate(() => Number(cardData.evoId))).toBe(1);
    await expect(page.locator('#evo-status')).toContainText('local');
    await expect(page.locator('#evo_name')).toHaveValue('Bulbasaur');
});
