let libraryRecords = [];
let galleryTicket = 0;
let libraryBusy = false;
function repository() { return CloudAuth.usingDrive() ? CloudAuth.store() : LocalCards; }
function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
}
function button(text, action, className = 'btn-dash-action') {
    const el = element('button', text, className); el.type = 'button'; el.onclick = action; return el;
}
async function saveSystemCard() {
    if (savingCard) return;
    savingCard = true;
    cancelLookup();
    let existing = loadedRecord ? structuredClone(loadedRecord) : null;
    let canvas;
    try {
        const store = repository();
        const localSave = !CloudAuth.usingDrive();
        const { snapshot, canvas: rendered } = await snapshotCanvas(localSave ? 4 : 1, localSave); canvas = rendered;
        // Gallery snapshot and JSON come from the same completed render.
        const thumb = document.createElement('canvas'); thumb.width = 220; thumb.height = 307;
        thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
        const thumbnail = thumb.toDataURL('image/webp', 0.75); thumb.width = thumb.height = 0;
        if (existing && !confirm('¿Actualizar la carta abierta? Cancelar permite guardarla como una carta nueva.')) {
            if (!confirm('¿Guardar como una carta nueva?')) return;
            existing = null;
        }
        const set = snapshot.config.setTextVal.trim().toLowerCase();
        const num = snapshot.config.setNumCurr.trim();
        if (set && num) {
            const cards = await store.list();
            if (cards.some(x => x.id !== existing?.id && x.data.config?.setTextVal?.trim().toLowerCase() === set && x.data.config?.setNumCurr === num) && !confirm('Ya existe otra carta con ese set y número. ¿Guardar de todas formas?')) return;
        }
        const record = { id: existing?.id || crypto.randomUUID(), remote: existing?.remote || false, timestamp: Date.now(), data: snapshot, thumbnail };
        if (localSave) {
            const png = new Uint8Array(await (await CardImages.canvasBlob(canvas)).arrayBuffer());
            const files = {
                [CardCore.fileName(snapshot, 'png')]: png,
                [CardCore.fileName(snapshot, 'json')]: fflate.strToU8(JSON.stringify(snapshot, null, 2))
            };
            const archive = new Blob([fflate.zipSync(files, { level: 0 })], { type: 'application/zip' });
            let localError = '';
            try {
                const saved = await store.save(record, existing?.revision);
                loadedRecord = saved; currentLoadedFilePath = saved.id;
                clearTimeout(draftTimer); await LocalCards.saveDraft(snapshot);
            } catch (error) { localError = error.message; }
            // One download keeps PNG and editable JSON together and avoids multi-download blocking.
            CardImages.download(archive, CardCore.fileName(snapshot, 'zip'));
            if (!localError) await toggleDashboard(true);
            status(localError ? 'PNG Ultra y JSON preparados en ZIP. No se pudo guardar la copia en el navegador: ' + localError : 'PNG Ultra y JSON preparados en ZIP. También se guardó una copia en este navegador.', !!localError);
            return;
        }
        const saved = await store.save(record, existing?.revision);
        loadedRecord = saved; currentLoadedFilePath = saved.id;
        if (!CloudAuth.usingDrive()) { clearTimeout(draftTimer); await LocalCards.saveDraft(snapshot); }
        status(CloudAuth.connected() ? 'Carta guardada y confirmada en Google Drive.' : 'Carta guardada en la biblioteca de este navegador.');
        await toggleDashboard(true);
    } catch (error) { status('No se confirmó el guardado: ' + error.message, true); }
    finally { if (canvas) canvas.width = canvas.height = 0; savingCard = false; }
}
async function toggleDashboard(show) {
    const overlay = document.getElementById('dashboard-overlay'); overlay.style.display = show ? 'flex' : 'none';
    if (show) { currentSetFilter = null; await renderGallery(); document.getElementById('dashboard_search').focus(); }
    else document.getElementById('pokeName').focus();
}
async function renderGallery() {
    const ticket = ++galleryTicket;
    const grid = document.getElementById('cards_grid'); grid.replaceChildren(element('p', 'Cargando biblioteca…'));
    try {
        const records = await repository().list();
        if (ticket !== galleryTicket) return;
        libraryRecords = records;
        drawGallery();
    } catch (error) { if (ticket === galleryTicket) { grid.replaceChildren(element('p', error.message)); status(error.message, true); } }
}
function drawGallery() {
    const grid = document.getElementById('cards_grid'); grid.replaceChildren();
    const setName = record => record.data.config?.setTextVal || 'SIN SET';
    const setNames = [...new Set(libraryRecords.map(setName))].sort();
    const header = element('div', undefined, 'gallery-toolbar');
    const select = element('select'); select.setAttribute('aria-label', 'Colección');
    const all = element('option', 'Todas las colecciones'); all.value = ''; select.append(all);
    for (const name of setNames) { const option = element('option', name); option.value = name; select.append(option); }
    select.value = currentSetFilter || ''; select.onchange = () => { currentSetFilter = select.value || null; drawGallery(); };
    const selected = libraryRecords.filter(record => !currentSetFilter || setName(record) === currentSetFilter).sort((a, b) => Number(a.data.config?.setNumCurr || 0) - Number(b.data.config?.setNumCurr || 0));
    header.append(select, button('Exportar CSV', () => exportSetToCSV(currentSetFilter || 'Todas', selected)), button('Descargar PNG en ZIP', () => downloadSetUltra(currentSetFilter || 'Todas', selected)), button('Respaldar JSON en ZIP', () => backupLibrary(selected)), button('Recargar', renderGallery));
    grid.append(header);
    if (!selected.length) grid.append(element('p', 'Aún no hay cartas. Guarda una desde el editor o importa tus JSON del escritorio.'));
    for (const record of selected) {
        const data = record.data;
        const item = element('article', undefined, 'saved-card-item');
        item.dataset.search = `${data.mainName} ${setName(record)} ${data.config?.setNumCurr || ''} ${data.config?.rarityIcon || ''}`.toLowerCase();
        if (record.thumbnail) {
            const img = element('img'); img.src = CardCore.safeImage(record.thumbnail); img.alt = data.mainName || 'Carta'; img.className = 'card-thumb'; img.loading = 'lazy'; item.append(img);
        }
        const info = element('div', undefined, 'card-info');
        info.append(element('div', `${setName(record)} · ${data.config?.setNumCurr || '?'}`, 'info-line-1'), element('div', data.mainName || 'Sin nombre', 'info-line-2'));
        info.append(button('Abrir', async () => { try { await applyCard(data, record); toggleDashboard(false); } catch (error) { status(error.message, true); } }));
        info.append(button('Borrar', async () => {
            if (!confirm(`¿Borrar definitivamente ${data.mainName || 'esta carta'}?`)) return;
            try { await repository().remove(record.id, record.revision); if (loadedRecord?.id === record.id) { loadedRecord = null; currentLoadedFilePath = null; } await renderGallery(); }
            catch (error) { status(error.message, true); }
        }));
        item.append(info); grid.append(item);
    }
    filterCards();
}
function filterCards() {
    const term = document.getElementById('dashboard_search').value.toLowerCase();
    document.querySelectorAll('.saved-card-item').forEach(item => item.hidden = !item.dataset.search.includes(term));
}
async function importLibrary(input) {
    if (libraryBusy) return;
    libraryBusy = true;
    let count = 0; const failures = [];
    try {
        const store = repository();
        for (const file of input.files) {
            try {
                if (file.size > 24 * 1024 * 1024) throw new Error('JSON mayor de 24 MB');
                const data = CardCore.normalizeCard(JSON.parse(await file.text()), defaultConfig);
                await store.save({ id: crypto.randomUUID(), timestamp: Date.now(), data }, undefined); count++;
            } catch (error) { failures.push(`${file.name}: ${error.message}`); }
        }
        await renderGallery(); status(`Importadas ${count} cartas. ${failures.length} errores.`, !!failures.length);
        if (failures.length) CardImages.download(new Blob([failures.join('\n')], { type: 'text/plain' }), 'errores-importacion.txt');
    } catch (error) { status(error.message, true); }
    finally { input.value = ''; libraryBusy = false; }
}
async function backupLibrary(records) {
    const entries = {};
    records.forEach((record, index) => entries[`${String(index + 1).padStart(5, '0')}_${CardCore.fileName(record.data, 'json')}`] = fflate.strToU8(JSON.stringify(record.data)));
    CardImages.download(new Blob([fflate.zipSync(entries, { level: 0 })], { type: 'application/zip' }), 'IvaneitorMaker-respaldo.zip');
}
document.addEventListener('keydown', event => { if (event.key === 'Escape') toggleDashboard(false); });
