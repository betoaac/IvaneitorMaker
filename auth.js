const CloudAuth = (() => {
    let accessToken = '';
    let expiresAt = 0;
    let expiryTimer;
    let drive = null;
    let connecting = false;
    let driveDestination = false;
    function connected() { return !!accessToken && Date.now() < expiresAt; }
    function clear() {
        clearTimeout(expiryTimer); accessToken = ''; expiresAt = 0; drive = null;
        loadedRecord = null; currentLoadedFilePath = null; libraryRecords = [];
        galleryTicket++;
        document.getElementById('account-label').textContent = 'Biblioteca de este navegador';
        document.getElementById('google-connect').hidden = false;
        document.getElementById('google-disconnect').hidden = true;
    }
    function expired() {
        clear(); status('La sesión de Google expiró. Reconecta para seguir usando Drive. El editor conserva tus cambios.', true);
        document.getElementById('account-label').textContent = 'Drive · sesión expirada';
        document.getElementById('google-disconnect').hidden = false;
        document.getElementById('cards_grid').replaceChildren();
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
                drive = new DriveCards({ token: () => issuedToken, onExpired: () => { if (accessToken === issuedToken) expired(); } });
                loadedRecord = null; currentLoadedFilePath = null; libraryRecords = [];
                galleryTicket++;
                try {
                    const profile = await drive.profile();
                    document.getElementById('account-label').textContent = 'Drive · ' + (profile.emailAddress || profile.displayName);
                    document.getElementById('google-connect').hidden = true;
                    document.getElementById('google-disconnect').hidden = false;
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
        client.requestAccessToken({ prompt: 'select_account' });
    }
    async function disconnect() {
        if (savingCard || batchRunning || libraryBusy || connecting) { status('Espera a que termine la operación actual.', true); return; }
        if (!confirm('¿Desconectar Google? Exporta JSON si tienes cambios de Drive que aún no guardaste.')) return;
        const token = accessToken;
        clear(); driveDestination = false; cancelLookup(); clearTimeout(draftTimer);
        // Explicit disconnect revokes consent; automatic expiration only clears memory.
        if (token && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
        initialized = false;
        await resetAndClose();
        initialized = true;
        status('Google desconectado. Tus cartas de Drive siguen en tu cuenta.');
    }
    return { connect, disconnect, connected, usingDrive: () => driveDestination, store: () => { if (!connected()) throw new Error('Reconecta Google para usar Drive.'); return drive; } };
})();
