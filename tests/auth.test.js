const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness(storage = new Map()) {
    let initCount = 0; const callbacks = []; const elements = new Map(); const timers = [];
    let resolveProfile;
    const requests = [];
    const profile = new Promise(resolve => resolveProfile = resolve);
    const context = vm.createContext({
        Date, console, savingCard: false, batchRunning: false, libraryBusy: false, loadedRecord: null, currentLoadedFilePath: null, libraryRecords: [], galleryTicket: 0, draftTimer: null,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        CARDMAKER_CONFIG: { googleClientId: 'test.apps.googleusercontent.com' }, DRIVE_SCOPE: 'drive.appdata',
        setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}, status() {},
        document: { getElementById: id => { if (!elements.has(id)) elements.set(id, { style: {}, replaceChildren() {} }); return elements.get(id); } },
        DriveCards: class { constructor(options) { this.options = options; } profile() { return profile; } },
        google: { accounts: { oauth2: { hasGrantedAllScopes: () => true, initTokenClient: options => { initCount++; callbacks.push(options.callback); return { requestAccessToken: request => requests.push(request) }; } } } }
    });
    vm.runInContext(fs.readFileSync('auth.js', 'utf8') + '\nglobalThis.auth = CloudAuth;', context);
    return { context, callbacks, elements, timers, resolveProfile, storage, requests, get initCount() { return initCount; } };
}
test('OAuth connection cannot race profile from another account', async () => {
    const h = harness(); h.context.auth.connect();
    const pending = h.callbacks[0]({ access_token: 'account-A', expires_in: 3600 });
    h.context.auth.connect(); assert.equal(h.initCount, 1);
    h.resolveProfile({ emailAddress: 'a@example.test' }); await pending;
    assert.equal(h.elements.get('account-label').textContent, 'Drive · a@example.test');
    assert.equal(h.context.auth.store().options.token(), 'account-A');
});
test('expired Google session never silently switches saves to local storage', async () => {
    const h = harness(); h.context.auth.connect();
    const pending = h.callbacks[0]({ access_token: 'account-A', expires_in: 3600 });
    h.resolveProfile({ emailAddress: 'a@example.test' }); await pending;
    const ticket = h.context.galleryTicket;
    h.timers.at(-1)();
    assert.equal(h.context.auth.connected(), false);
    assert.equal(h.context.auth.usingDrive(), true);
    assert.ok(h.context.galleryTicket > ticket);
    assert.throws(() => h.context.auth.store(), /Reconecta/);
});

test('remembered Drive survives reload as a disconnected destination without persisting credentials', async () => {
    const h = harness(); h.context.auth.connect();
    const pending = h.callbacks[0]({ access_token: 'private-token', expires_in: 3600 });
    h.resolveProfile({ emailAddress: 'private@example.test' }); await pending;
    assert.deepEqual([...h.storage.entries()], [['ivaneitormaker-drive-preferred', 'true']]);
    const reloaded = harness(h.storage); reloaded.context.auth.restore();
    assert.equal(reloaded.context.auth.usingDrive(), true);
    assert.equal(reloaded.context.auth.connected(), false);
    assert.equal(reloaded.context.auth.needsReconnect(), true);
    assert.match(reloaded.elements.get('account-label').textContent, /pendiente de reconectar/);
    assert.equal(reloaded.initCount, 0);
    reloaded.context.auth.connect();
    assert.equal(reloaded.requests[0].prompt, '');
    reloaded.context.auth.useLocal(); // A connection in progress cannot change destinations.
    assert.equal(reloaded.context.auth.usingDrive(), true);
});

test('choosing local explicitly clears remembered Drive without touching the editor', () => {
    const h = harness(new Map([['ivaneitormaker-drive-preferred', 'true']]));
    h.context.auth.restore(); h.context.auth.useLocal();
    assert.equal(h.context.auth.usingDrive(), false);
    assert.equal(h.storage.size, 0);
    assert.equal(h.elements.get('account-label').textContent, 'Biblioteca de este navegador');
});
