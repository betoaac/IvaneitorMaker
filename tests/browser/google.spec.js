const { test, expect } = require('@playwright/test');
test('Google UI and Drive create/update round trip with simulated responses', async ({ page }) => {
    let stored;
    const requests = [];
    await page.route(/\/(?:config|app-config-[a-f0-9]+)\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: "globalThis.CARDMAKER_CONFIG={googleClientId:'mock.apps.googleusercontent.com'};" }));
    await page.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/javascript', body: `globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'mock-token',expires_in:3600})}),revoke:(token,done)=>done()}}};` }));
    await page.route('https://www.googleapis.com/**', async route => {
        const request = route.request(); const url = request.url(); const method = request.method();
        requests.push({ url, method, auth: request.headers().authorization, revision: request.headers()['if-match'] });
        if (url.includes('/about?')) return route.fulfill({ json: { user: { emailAddress: 'mock@example.test' } } });
        if (method === 'POST') {
            const body = request.postData();
            const dataPart = body.split('Content-Type: application/json\r\n\r\n')[1];
            stored = JSON.parse(dataPart.slice(0, dataPart.lastIndexOf('\r\n--')));
            return route.fulfill({ json: { id: 'mock-card' } });
        }
        if (method === 'PATCH') { stored = JSON.parse(request.postData()); return route.fulfill({ json: { id: 'mock-card' } }); }
        if (url.includes('/files/mock-card?alt=media')) return route.fulfill({ json: stored, headers: { etag: 'etag-1', 'access-control-expose-headers': 'ETag' } });
        if (url.includes('/files?')) return route.fulfill({ json: { files: stored ? [{ id: 'mock-card' }] : [] } });
        return route.fulfill({ status: 500 });
    });
    await page.goto('/');
    await expect(page.locator('#app-status')).toContainText('Listo');
    await page.getByRole('button', { name: 'Conectar con Google' }).click();
    await expect(page.locator('#app-status')).toContainText('Google conectado');
    await expect(page.locator('#account-label')).toHaveText('Drive · mock@example.test');
    await page.locator('#pokeNamePrefix').fill('Prueba');
    await page.getByRole('button', { name: /GUARDAR/ }).click();
    await expect(page.locator('.saved-card-item')).toHaveCount(1);
    expect(stored.data.namePrefix).toBe('Prueba');
    expect(await page.evaluate(async () => (await LocalCards.list()).length)).toBe(0);
    await page.getByRole('button', { name: 'Abrir', exact: true }).click();
    await expect(page.locator('#dashboard-overlay')).toBeHidden();
    await page.locator('#pokeNamePrefix').fill('Actualizada');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /GUARDAR/ }).click();
    await expect.poll(() => stored.data.namePrefix).toBe('Actualizada');
    expect(requests.some(r => r.method === 'PATCH' && r.revision === 'etag-1')).toBe(true);
    expect(requests.every(r => r.auth === 'Bearer mock-token')).toBe(true);
});
