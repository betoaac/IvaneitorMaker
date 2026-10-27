const CloudAuth = (() => {
    let accessToken = '';
    let expiresAt = 0;
    let expiryTimer;
    let drive = null;
    let connecting = false;
    const preferenceKey = 'ivaneitormaker-drive-preferred';
    let driveDestination = false;
    try { driveDestination = localStorage.getItem(preferenceKey) === 'true'; } catch { /* Storage may be blocked. */ }
    function rememberDrive(preferred) {
        try {
            if (preferred) localStorage.setItem(preferenceKey, 'true');
            else localStorage.removeItem(preferenceKey);
        } catch { /* Authentication still works without persistent preferences. */ }
    }
    function connected() { return !!accessToken && Date.now() < expiresAt; }
    function needsReconnect() { return driveDestination && !connected(); }
    function disconnectedUI() {
        document.getElementById('account-label').textContent = driveDestination ? 'Drive · pendiente de reconectar' : 'Biblioteca de este navegador';
        document.getElementById('google-connect').textContent = driveDestination ? 'Reconectar con Google' : 'Conectar con Google';
        document.getElementById('google-connect').hidden = false;
        document.getElementById('google-disconnect').hidden = true;
        document.getElementById('google-local').hidden = !driveDestination;
    }
    function restore() {
        if (!needsReconnect()) return;
        disconnectedUI();
        status('Usabas Google Drive. Reconecta para ver tus cartas; aún no se ha consultado tu biblioteca de Drive.');
    }
    function useLocal() {
        if (connecting || savingCard || batchRunning || libraryBusy || connected()) return;
        driveDestination = false; rememberDrive(false); clear();
        status('Biblioteca local seleccionada. Las cartas de Drive siguen en tu cuenta.');
        if (document.getElementById('dashboard-overlay').style.display === 'flex') renderGallery();
    }
    function clear() {
        clearTimeout(expiryTimer); accessToken = ''; expiresAt = 0; drive = null;
        loadedRecord = null; currentLoadedFilePath = null; libraryRecords = [];
        galleryTicket++;
        disconnectedUI();
    }
    function expired() {
        clear(); status('La sesión de Google expiró. Reconecta para seguir usando Drive. El editor conserva tus cambios.', true);
        document.getElementById('account-label').textContent = 'Drive · sesión expirada';
        document.getElementById('google-disconnect').hidden = false;
        if (document.getElementById('dashboard-overlay').style.display === 'flex') renderGallery();
    }
    function connect() {
        if (connecting) return;
        if (savingCard || batchRunning || libraryBusy) { status('Espera a que termine la operación actual.', true); return; }
        const clientId = CARDMAKER_CONFIG.googleClientId;
        if (!clientId) { status('Falta configurar el cliente OAuth de Google. Consulta docs/DEPLOYMENT.md. Puedes seguir guardando localmente.', true); return; }
        if (!globalThis.google?.accounts?.oauth2) { status('No se pudo cargar Google. Comprueba conexión y bloqueadores, y vuelve a intentar.', true); return; }
        connecting = true;
        const client = google.accounts.oauth2.initTokenClient({
            client_id: clientId, scope: DRIVE_SCOPE, include_granted_scopes: false,
            error_callback: () => { connecting = false; status('Se canceló o bloqueó el acceso a Google.', true); },
            callback: async response => {
                if (response.error || !google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) { connecting = false; status('No se concedió permiso para guardar en Drive.', true); return; }
                clearTimeout(draftTimer);
                accessToken = response.access_token;
                driveDestination = true;
                expiresAt = Date.now() + Math.max(0, Number(response.expires_in) - 30) * 1000;
                const issuedToken = accessToken;
                drive = new DriveCards({ token: () => issuedToken, createThumbnail: async record => record.thumbnail || makeCardThumbnail(record.data), onExpired: () => { if (accessToken === issuedToken) expired(); } });
                loadedRecord = null; currentLoadedFilePath = null; libraryRecords = [];
                galleryTicket++;
                try {
                    const profile = await drive.profile();
                    rememberDrive(true);
                    document.getElementById('account-label').textContent = 'Drive · ' + (profile.emailAddress || profile.displayName);
                    document.getElementById('google-connect').hidden = true;
                    document.getElementById('google-disconnect').hidden = false;
                    document.getElementById('google-local').hidden = true;
                    expiryTimer = setTimeout(expired, Math.max(0, expiresAt - Date.now()));
                    status('Google conectado. Guardar enviará esta carta a tu Drive.');
                    if (document.getElementById('dashboard-overlay').style.display === 'flex') await renderGallery();
                } catch (error) {
                    clear();
                    document.getElementById('account-label').textContent = 'Drive · conexión no completada';
                    document.getElementById('google-disconnect').hidden = false;
                    status(error.message + ' Puedes reconectar o desconectar para usar la biblioteca local.', true);
                }
                finally { connecting = false; }
            }
        });
        // Must stay in a user gesture; never request a popup from a timer or API retry.
        try { client.requestAccessToken({ prompt: driveDestination ? '' : 'select_account' }); }
        catch { connecting = false; status('No se pudo abrir Google. Pulsa Reconectar para volver a intentarlo.', true); }
    }
    async function disconnect() {
        if (savingCard || batchRunning || libraryBusy || connecting) { status('Espera a que termine la operación actual.', true); return; }
        if (!confirm('¿Desconectar Google? Exporta JSON si tienes cambios de Drive que aún no guardaste.')) return;
        const token = accessToken;
        const accountId = drive?.accountId;
        driveDestination = false; rememberDrive(false); clear(); cancelLookup(); clearTimeout(draftTimer);
        if (accountId) { try { await DrivePreviewCache.clear(accountId); } catch { /* Cache cleanup is best effort. */ } }
        // Explicit disconnect revokes consent; automatic expiration only clears memory.
        if (token && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
        initialized = false;
        await resetAndClose();
        initialized = true;
        status('Google desconectado. Tus cartas de Drive siguen en tu cuenta.');
    }
    return { connect, disconnect, connected, restore, useLocal, needsReconnect, usingDrive: () => driveDestination, store: () => { if (!connected()) throw new Error('Reconecta Google para usar Drive.'); return drive; } };
})();
