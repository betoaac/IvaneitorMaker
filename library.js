let libraryRecords = [];
let galleryTicket = 0;
let libraryBusy = false;
const galleryThumbCache = new Map();
const galleryThumbQueue = [];
let galleryThumbWorkers = 0;
let galleryThumbObserver;
let galleryLoadPending = false;
let galleryLoadIncomplete = false;
let galleryThumbnailTargets = new WeakMap();
function paintGalleryThumbnail(img, placeholder, source) {
    if (!img.isConnected) return;
    img.src = source; img.hidden = false; placeholder.hidden = true;
}
function pumpGalleryThumbnails() {
    while (galleryThumbWorkers < 2 && galleryThumbQueue.length) {
        const { record, img, placeholder } = galleryThumbQueue.shift();
        if (!img.isConnected) continue;
        galleryThumbWorkers++;
        (async () => {
            const canvas = document.createElement('canvas');
            try {
                await renderCardSnapshot(CardCore.normalizeCard(record.data, defaultConfig), canvas, { multiplier: 0.5 });
                const source = canvas.toDataURL('image/webp', 0.82);
                const key = `${record.id}:${record.revision || record.timestamp}`;
                galleryThumbCache.set(key, source);
                while (galleryThumbCache.size > 200) galleryThumbCache.delete(galleryThumbCache.keys().next().value);
                paintGalleryThumbnail(img, placeholder, source);
            } catch {
                if (placeholder.isConnected) placeholder.textContent = 'Vista previa no disponible. Puedes abrir la carta.';
            } finally { canvas.width = canvas.height = 0; galleryThumbWorkers--; pumpGalleryThumbnails(); }
        })();
    }
}
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
function chooseSaveAction() {
    return new Promise(resolve => {
        const dialog = element('dialog', undefined, 'save-choice');
        const title = element('h2', 'Guardar carta abierta'); title.id = 'save-choice-title';
        dialog.setAttribute('aria-labelledby', title.id);
        const actions = element('div', undefined, 'save-choice-actions');
        for (const [label, value] of [['Actualizar carta', 'update'], ['Guardar como nueva', 'copy'], ['Cancelar', 'cancel']]) {
            const action = button(label, () => dialog.close(value));
            if (value === 'update') action.autofocus = true;
            actions.append(action);
        }
        dialog.append(title, element('p', 'Actualiza la carta de la galería o crea una copia con tus cambios.'), actions);
        dialog.addEventListener('close', () => { const choice = dialog.returnValue; dialog.remove(); resolve(choice); }, { once: true });
        document.body.append(dialog); dialog.showModal();
    });
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
        if (existing) {
            const choice = await chooseSaveAction();
            if (choice !== 'update' && choice !== 'copy') return;
            if (choice === 'copy') existing = null;
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
    galleryLoadPending = true; galleryLoadIncomplete = false; libraryRecords = [];
    galleryThumbObserver?.disconnect(); galleryThumbObserver = null; galleryThumbQueue.length = 0;
    galleryThumbnailTargets = new WeakMap();
    const grid = document.getElementById('cards_grid'); grid.replaceChildren();
    document.getElementById('gallery-load')?.remove();
    if (CloudAuth.needsReconnect()) {
        galleryLoadPending = false;
        const notice = element('section', undefined, 'gallery-reconnect');
        notice.append(element('h3', 'Reconecta Google Drive para ver tus cartas'), element('p', 'La conexión se cerró al recargar o al expirar la sesión. Todavía no hemos consultado tus cartas de Drive; esta pantalla no significa que tu colección esté vacía.'), button('Reconectar Google Drive', () => CloudAuth.connect()), button('Usar biblioteca local', () => CloudAuth.useLocal()));
        grid.append(notice); return;
    }
    const loading = element('section', undefined, 'gallery-load'); loading.id = 'gallery-load';
    const label = element('p', 'Buscando cartas…'); label.setAttribute('role', 'status');
    const progress = element('progress'); progress.setAttribute('aria-label', 'Carga de cartas');
    loading.append(label, progress, element('p', 'Las cartas aparecen mientras se descargan. Puedes abrirlas sin esperar al resto.', 'gallery-load-hint'));
    grid.before(loading);
    try {
        const records = await repository().list({ onProgress: ({ completed, total }) => {
            if (ticket !== galleryTicket) return;
            label.textContent = `Cargando cartas: ${completed} de ${total}`;
            progress.max = Math.max(1, total); progress.value = completed;
        }, onRecord: record => {
            if (ticket !== galleryTicket) return;
            libraryRecords.push(record); drawGallery();
        } });
        if (ticket !== galleryTicket) return;
        galleryLoadPending = false; libraryRecords = records; loading.remove();
        drawGallery();
    } catch (error) {
        if (ticket !== galleryTicket) return;
        galleryLoadPending = false; galleryLoadIncomplete = true;
        label.textContent = `${libraryRecords.length} cartas disponibles. ${error.message}`;
        progress.remove(); loading.append(button('Reintentar carga', renderGallery));
        drawGallery(); status(error.message, true);
    }
}
function drawGallery() {
    if (!galleryThumbObserver) galleryThumbObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
            galleryThumbObserver.unobserve(entry.target);
            galleryThumbQueue.push(galleryThumbnailTargets.get(entry.target)); pumpGalleryThumbnails();
        }
    }, { root: document.querySelector('.dashboard-content'), rootMargin: '200px' });
    const grid = document.getElementById('cards_grid');
    const existing = new Map([...grid.querySelectorAll('.saved-card-item')].map(item => [item.dataset.recordId, item]));
    grid.replaceChildren();
    const setName = record => record.data.config?.setTextVal || 'SIN SET';
    const setNames = [...new Set(libraryRecords.map(setName))].sort();
    const header = element('div', undefined, 'gallery-toolbar');
    const source = element('span', CloudAuth.usingDrive() ? 'Google Drive' : 'Biblioteca local', 'gallery-source');
    const select = element('select'); select.setAttribute('aria-label', 'Colección');
    const all = element('option', 'Todas las colecciones'); all.value = ''; select.append(all);
    for (const name of setNames) { const option = element('option', name); option.value = name; select.append(option); }
    select.value = currentSetFilter || ''; select.onchange = () => { currentSetFilter = select.value || null; drawGallery(); };
    const selected = libraryRecords.filter(record => !currentSetFilter || setName(record) === currentSetFilter).sort((a, b) => Number(a.data.config?.setNumCurr || 0) - Number(b.data.config?.setNumCurr || 0));
    const count = element('span', '', 'gallery-count'); count.setAttribute('aria-live', 'polite');
    header.append(source, select, count, button('Exportar CSV', () => exportSetToCSV(currentSetFilter || 'Todas', selected)), button('Descargar PNG en ZIP', () => downloadSetUltra(currentSetFilter || 'Todas', selected)), button('Respaldar JSON en ZIP', () => backupLibrary(selected)), button('Recargar', renderGallery));
    header.querySelectorAll('button').forEach(action => action.disabled = galleryLoadPending || galleryLoadIncomplete);
    header.lastElementChild.disabled = galleryLoadPending;
    grid.append(header);
    if (!selected.length && !galleryLoadPending && !galleryLoadIncomplete) grid.append(element('p', 'Aún no hay cartas. Guarda una desde el editor o importa tus JSON del escritorio.'));
    for (const record of selected) {
        if (existing.has(record.id)) {
            const item = existing.get(record.id);
            item.querySelector('.gallery-delete').disabled = galleryLoadPending;
            grid.append(item); continue;
        }
        const data = record.data;
        const item = element('article', undefined, 'saved-card-item');
        item.dataset.recordId = record.id;
        item.dataset.search = `${data.mainName} ${setName(record)} ${data.config?.setNumCurr || ''} ${data.config?.rarityIcon || ''}`.toLowerCase();
        const openCard = async () => { try { await applyCard(data, record); toggleDashboard(false); } catch (error) { status(error.message, true); } };
        const preview = button('', openCard, 'card-preview'); preview.setAttribute('aria-label', `Abrir carta ${data.mainName || 'sin nombre'}`);
        const img = element('img', undefined, 'card-thumb'); img.alt = data.mainName || 'Carta'; img.loading = 'lazy'; img.decoding = 'async'; img.hidden = true;
        const placeholder = element('span', 'Preparando miniatura…', 'card-preview-placeholder');
        preview.append(img, placeholder); item.append(preview);
        const cachedThumbnail = galleryThumbCache.get(`${record.id}:${record.revision || record.timestamp}`);
        const source = cachedThumbnail || record.thumbnail;
        if (source) { img.src = CardCore.safeImage(source); img.hidden = false; placeholder.hidden = true; }
        else { galleryThumbnailTargets.set(preview, { record, img, placeholder }); galleryThumbObserver.observe(preview); }
        const info = element('div', undefined, 'card-info');
        info.append(element('div', `${setName(record)} · ${data.config?.setNumCurr || '?'}`, 'info-line-1'), element('div', data.mainName || 'Sin nombre', 'info-line-2'));
        const actions = element('div', undefined, 'gallery-card-actions');
        actions.append(button('Abrir', openCard, 'gallery-open'));
        actions.append(button('Borrar', async () => {
            if (!confirm(`¿Borrar definitivamente ${data.mainName || 'esta carta'}?`)) return;
            try { await repository().remove(record.id, record.revision); if (loadedRecord?.id === record.id) { loadedRecord = null; currentLoadedFilePath = null; } await renderGallery(); }
            catch (error) { status(error.message, true); }
        }, 'gallery-delete'));
        actions.lastElementChild.disabled = galleryLoadPending;
        info.append(actions);
        item.append(info); grid.append(item);
    }
    filterCards();
}
function filterCards() {
    const term = document.getElementById('dashboard_search').value.toLowerCase();
    document.querySelectorAll('.saved-card-item').forEach(item => item.hidden = !item.dataset.search.includes(term));
    const cards = [...document.querySelectorAll('.saved-card-item')];
    const visible = cards.filter(item => !item.hidden).length;
    const count = document.querySelector('.gallery-count');
    if (count) count.textContent = term ? `${visible} de ${cards.length} cartas` : `${visible} cartas`;
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
                status(`Importadas ${count} de ${input.files.length} cartas. Continúa la importación…`);
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
