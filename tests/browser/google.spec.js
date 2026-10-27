const { test, expect } = require('@playwright/test');
test('Google UI and Drive create/update round trip with simulated responses', async ({ page }) => {
    let stored; let preview;
    const requests = [];
    await page.route(/\/(?:config|app-config-[a-f0-9]+)\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: "globalThis.CARDMAKER_CONFIG={googleClientId:'mock.apps.googleusercontent.com'};" }));
    await page.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/javascript', body: `globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'mock-token',expires_in:3600})}),revoke:(token,done)=>done()}}};` }));
    await page.route('https://www.googleapis.com/**', async route => {
        const request = route.request(); const url = request.url(); const method = request.method();
        requests.push({ url, method, auth: request.headers().authorization, revision: request.headers()['if-match'] });
        if (url.includes('/about?')) return route.fulfill({ json: { user: { emailAddress: 'mock@example.test' } } });
        if (url.includes('/files?') && decodeURIComponent(url).includes('pokecard-preview-v1')) return route.fulfill({ json: { files: preview ? [{ id: 'preview', appProperties: { cardId: 'mock-card', sourceModifiedTime: 'time-1' } }] : [] } });
        if (url.includes('/files/preview?alt=media')) return route.fulfill({ json: preview });
        if (url.includes('/files/mock-card?fields=id,modifiedTime')) return route.fulfill({ json: { id: 'mock-card', modifiedTime: 'time-1' } });
        if ((method === 'POST' || method === 'PATCH') && request.postData()?.includes('pokecard-preview-v1')) {
            const dataPart = request.postData().split('Content-Type: application/json\r\n\r\n')[1];
            preview = JSON.parse(dataPart.slice(0, dataPart.lastIndexOf('\r\n--')));
            return route.fulfill({ json: { id: 'preview' } });
        }
        if (method === 'POST') {
            const body = request.postData();
            const dataPart = body.split('Content-Type: application/json\r\n\r\n')[1];
            stored = JSON.parse(dataPart.slice(0, dataPart.lastIndexOf('\r\n--')));
            return route.fulfill({ json: { id: 'mock-card' } });
        }
        if (method === 'PUT') { stored = JSON.parse(request.postData()); return route.fulfill({ json: { id: 'mock-card' } }); }
        if (url.includes('/files/mock-card?fields=etag')) return route.fulfill({ json: { etag: 'etag-1' } });
        if (url.includes('/files/mock-card?alt=media')) return route.fulfill({ json: stored, headers: { etag: 'etag-1', 'access-control-expose-headers': 'ETag' } });
        if (url.includes('/files?')) return route.fulfill({ json: { files: stored ? [{ id: 'mock-card', modifiedTime: 'time-1' }] : [] } });
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
    await page.getByRole('button', { name: /GUARDAR/ }).click();
    await page.getByRole('dialog', { name: 'Guardar carta abierta' }).getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(stored.data.namePrefix).toBe('Prueba');
    expect(requests.some(r => r.method === 'PUT')).toBe(false);
    await page.getByRole('button', { name: /GUARDAR/ }).click();
    await page.getByRole('dialog', { name: 'Guardar carta abierta' }).getByRole('button', { name: 'Actualizar carta', exact: true }).click();
    await expect.poll(() => stored.data.namePrefix).toBe('Actualizada');
    expect(requests.some(r => r.method === 'PUT' && r.revision === 'etag-1')).toBe(true);
    expect(requests.every(r => r.auth === 'Bearer mock-token')).toBe(true);
    await page.reload();
    await expect(page.locator('#account-label')).toHaveText('Drive · pendiente de reconectar');
    await page.getByRole('button', { name: /GALERÍA/ }).click();
    await page.getByRole('button', { name: 'Reconectar Google Drive', exact: true }).click();
    await expect(page.locator('#account-label')).toHaveText('Drive · mock@example.test');
    await expect(page.locator('.saved-card-item')).toHaveCount(1);
    await expect(page.locator('.gallery-source')).toHaveText('Google Drive');
});

test('remembered Drive shows reconnect instead of a misleading empty gallery after reload', async ({ page }) => {
    await page.route('https://accounts.google.com/**', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.goto('/');
    await expect(page.locator('#app-status')).toContainText('Listo');
    await page.evaluate(() => localStorage.setItem('ivaneitormaker-drive-preferred', 'true'));
    await page.reload();
    await expect(page.locator('#account-label')).toHaveText('Drive · pendiente de reconectar');
    await page.getByRole('button', { name: /GALERÍA/ }).click();
    await expect(page.getByRole('heading', { name: 'Reconecta Google Drive para ver tus cartas' })).toBeVisible();
    await expect(page.getByText('0 cartas', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reconectar Google Drive', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Usar biblioteca local', exact: true }).last().click();
    await expect(page.locator('.gallery-count')).toHaveText('0 cartas');
    await expect(page.locator('#account-label')).toHaveText('Biblioteca de este navegador');
    expect(await page.evaluate(() => localStorage.getItem('ivaneitormaker-drive-preferred'))).toBeNull();
    await page.reload();
    await expect(page.locator('#account-label')).toHaveText('Biblioteca de este navegador');
});

test('Drive gallery fetches only thumbnails, persists their cache across reloads, and hydrates opening and JSON backup', async ({ page }) => {
    const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    let previewReads = 0; let originalReads = 0;
    await page.route(/\/(?:config|app-config-[a-f0-9]+)\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: "globalThis.CARDMAKER_CONFIG={googleClientId:'mock.apps.googleusercontent.com'};" }));
    await page.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/javascript', body: `globalThis.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'mock-token',expires_in:3600})})}}};` }));
    await page.route('https://www.googleapis.com/**', async route => {
        const url = route.request().url();
        if (url.includes('/about?')) return route.fulfill({ json: { user: { emailAddress: 'mock@example.test', permissionId: 'account-A' } } });
        if (url.includes('/files?')) {
            const files = decodeURIComponent(url).includes('pokecard-preview-v1')
                ? [{ id: 'preview', appProperties: { cardId: 'card', sourceModifiedTime: 'time-1' } }]
                : [{ id: 'card', modifiedTime: 'time-1' }];
            return route.fulfill({ json: { files } });
        }
        if (url.includes('/preview?alt=media')) {
            previewReads++;
            return route.fulfill({ json: { schemaVersion: 1, cardId: 'card', sourceModifiedTime: 'time-1', revision: 'etag-1', thumbnail, data: { mainName: 'Pikachu', config: { setTextVal: 'KANrev', setNumCurr: '1' } } } });
        }
        if (url.includes('/card?fields=etag')) return route.fulfill({ json: { etag: 'etag-1' } });
        if (url.includes('/card?alt=media')) {
            originalReads++; await new Promise(resolve => setTimeout(resolve, 300));
            return route.fulfill({ json: { data: { mainName: 'Pikachu', abilityName: 'Solo original', customArtData: thumbnail, config: { setTextVal: 'KANrev', setNumCurr: '1' } } } });
        }
        return route.fulfill({ status: 500 });
    });
    await page.goto('/');
    await expect(page.locator('#app-status')).toContainText('Listo');
    await page.getByRole('button', { name: 'Conectar con Google', exact: true }).click();
    await expect(page.locator('#account-label')).toContainText('mock@example.test');
    await page.getByRole('button', { name: /GALERÍA/ }).click();
    await expect(page.locator('.gallery-count')).toHaveText('1 cartas');
    expect(originalReads).toBe(0); expect(previewReads).toBe(1);
    await page.getByRole('button', { name: 'Abrir', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Descarga de cartas' })).toBeVisible();
    await expect(page.locator('#ability_name')).toHaveValue('Solo original');
    expect(originalReads).toBe(1);
    await page.reload();
    await expect(page.locator('#account-label')).toContainText('pendiente de reconectar');
    await page.getByRole('button', { name: /GALERÍA/ }).click();
    await page.getByRole('button', { name: 'Reconectar Google Drive', exact: true }).click();
    await expect(page.locator('.gallery-count')).toHaveText('1 cartas');
    expect(originalReads).toBe(1); expect(previewReads).toBe(1);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Respaldar JSON en ZIP', exact: true }).click();
    const download = await downloadPromise;
    const entries = require('fflate').unzipSync(require('node:fs').readFileSync(await download.path()));
    const saved = JSON.parse(require('fflate').strFromU8(Object.values(entries)[0]));
    expect(saved.abilityName).toBe('Solo original'); expect(saved.customArtData).toBe(thumbnail);
    expect(originalReads).toBe(2);
});
