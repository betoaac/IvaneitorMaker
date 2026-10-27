const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function harness() {
    let initCount = 0; const callbacks = []; const elements = new Map(); const timers = [];
    let resolveProfile;
    const profile = new Promise(resolve => resolveProfile = resolve);
    const context = vm.createContext({
        Date, console, savingCard: false, batchRunning: false, libraryBusy: false, loadedRecord: null, currentLoadedFilePath: null, libraryRecords: [], galleryTicket: 0, draftTimer: null,
        CARDMAKER_CONFIG: { googleClientId: 'test.apps.googleusercontent.com' }, DRIVE_SCOPE: 'drive.appdata',
        setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}, status() {},
        document: { getElementById: id => { if (!elements.has(id)) elements.set(id, { style: {}, replaceChildren() {} }); return elements.get(id); } },
        DriveCards: class { constructor(options) { this.options = options; } profile() { return profile; } },
        google: { accounts: { oauth2: { hasGrantedAllScopes: () => true, initTokenClient: options => { initCount++; callbacks.push(options.callback); return { requestAccessToken() {} }; } } } }
    });
    vm.runInContext(fs.readFileSync('auth.js', 'utf8') + '\nglobalThis.auth = CloudAuth;', context);
    return { context, callbacks, elements, timers, resolveProfile, get initCount() { return initCount; } };
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
