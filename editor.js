let initialized = false;
let draftTimer;
let previewTimer;
let previewTicket = 0;
let previewRunning = false;
let previewPending = false;
let savingCard = false;
let loadedRecord = null;
let evoLookupTimer;

function clearEvoData() {
    cancelLookup(); clearTimeout(evoLookupTimer);
    cardData.evoId = null; cardData.evoNameRef = ''; cardData.evoArtData = null;
    evoImageGlobal = null; evoCacheKey++;
    document.getElementById('evoInput').value = '';
    document.getElementById('evo-status').textContent = 'Imagen eliminada. Puedes buscar por nombre o número de Pokédex.';
    updateCardData();
}
function scheduleEvoLookup() {
    cancelLookup(); clearTimeout(evoLookupTimer);
    evoLookupTimer = setTimeout(lookupEvolution, 500);
}
async function lookupEvolution() {
    clearTimeout(evoLookupTimer); cancelLookup();
    const ticket = editorGeneration;
    const name = document.getElementById('evo_search').value.trim();
    if (!name) { document.getElementById('evo-status').textContent = 'Escribe el nombre o número de Pokédex.'; return; }
    try {
        let id = /^\d{1,5}$/.test(name) ? Number(name) : null;
        let reference = name;
        if (!id) {
            document.getElementById('evo-status').textContent = 'Consultando nombre en la Pokédex…';
            const slug = name.toLowerCase().replace(/♀|\(f\)$/g, '-f').replace(/♂|\(m\)$/g, '-m');
            const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error('No se encontró ese Pokémon. Prueba con su número de Pokédex o carga una imagen.');
            const species = await response.json(); id = species.id; reference = species.name;
        }
        if (ticket !== editorGeneration) return;
        if (!/^\d+$/.test(name)) document.getElementById('evo_name').value = reference.charAt(0).toUpperCase() + reference.slice(1);
        await loadEvoImageFromData(id, reference);
    } catch (error) { if (ticket === editorGeneration) document.getElementById('evo-status').textContent = error.message; }
}

function status(message, error = false) {
    const el = document.getElementById('app-status');
    if (el) { el.textContent = message; el.dataset.error = String(error); }
}
function cancelLookup() {
    editorGeneration++;
    clearTimeout(typingTimer);
    clearTimeout(evoLookupTimer);
    pokeController?.abort();
}
function resetFormControls() {
    for (const item of formDefaults) {
        const el = document.getElementById(item.id);
        if (el.type === 'checkbox') el.checked = item.checked; else el.value = item.value;
    }
}
function restoreConfigControls() {
    for (const [key, id] of Object.entries(CONFIG_FIELDS)) {
        const el = document.getElementById(id);
        const value = cardData.config[key];
        if (!el || value === undefined) continue;
        if (el.type === 'checkbox') el.checked = value;
        else { el.value = value; const n = document.getElementById('num_' + id); if (n) n.value = value; }
    }
    for (const [key, prefix] of Object.entries({ namePos: 'name', hpPos: 'hp', stagePos: 'stage', flavorPos: 'flavor', weakPos: 'weak', resPos: 'res', retreatPos: 'retreat' })) {
        for (const axis of ['x', 'y']) {
            const el = document.getElementById(`${prefix}_${axis}`);
            if (el && cardData.config[key]) el.value = cardData.config[key][axis];
        }
    }
    const symbols = cardData.config.symbols;
    customIconsConfig.enabled = !!symbols?.enabled;
    for (const [key, def] of Object.entries(customIconsConfig.icons)) def.enabled = symbols?.icons?.[key]?.enabled ?? true;
    document.getElementById('chk_global_symbols').checked = customIconsConfig.enabled;
    document.getElementById('symbol_suboptions').style.display = customIconsConfig.enabled ? 'flex' : 'none';
    document.querySelectorAll('[data-symbol]').forEach(el => el.checked = customIconsConfig.icons[el.dataset.symbol]?.enabled ?? true);
}
async function applyCard(input, record = null) {
    if (savingCard) throw new Error('Espera a que termine el guardado antes de abrir otra carta.');
    const next = CardCore.normalizeCard(input, defaultConfig);
    cancelLookup();
    const ticket = editorGeneration;
    // Validate and decode before replacing a working editor.
    await CardImages.load(next.customArtData || next.pokemonImgUrl, { required: true });
    if (next.backgroundData) await CardImages.load(next.backgroundData, { required: true });
    if (ticket !== editorGeneration) return;
    if (savingCard) throw new Error('Espera a que termine el guardado antes de abrir otra carta.');
    cardData = next;
    userUploadedArt = null; evoImageGlobal = null; lastCacheKey = ''; evoCacheKey++;
    loadedRecord = record;
    currentLoadedFilePath = record?.id || null;
    resetFormControls(); restoreFormValues(); restoreConfigControls();
    updateCardData();
    status(record ? 'Carta cargada. Los cambios se guardan al pulsar Guardar.' : 'Carta cargada en el editor.');
}
function saveState() {
    if (!initialized) return;
    clearTimeout(draftTimer);
    // Cloud account data is never silently written into a shared local library.
    if (CloudAuth.usingDrive()) { status('Cambios en el editor. Pulsa Guardar para enviarlos a Drive.'); return; }
    const snapshot = structuredClone(cardData);
    draftTimer = setTimeout(() => LocalCards.saveDraft(snapshot).then(() => status('Borrador guardado en este navegador.')).catch(error => status(error.message, true)), 500);
}
function schedulePreview() {
    previewTicket++;
    previewPending = true;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 100);
}
async function renderPreview() {
    if (previewRunning) return;
    previewRunning = true;
    const ticket = previewTicket;
    const canvas = document.createElement('canvas');
    try {
        previewPending = false;
        const snapshot = CardCore.normalizeCard(cardData, defaultConfig);
        await renderCardSnapshot(snapshot, canvas, { multiplier: 1 });
        if (ticket === previewTicket) {
            const visible = document.getElementById('cardCanvas');
            visible.width = canvas.width; visible.height = canvas.height;
            visible.getContext('2d').drawImage(canvas, 0, 0);
        }
    } catch (error) { if (ticket === previewTicket) status(error.message, true); }
    finally { canvas.width = canvas.height = 0; previewRunning = false; if (previewPending) schedulePreview(); }
}
function renderCard() { schedulePreview(); }
async function snapshotCanvas(multiplier, fullResolution = false) {
    updateCardData();
    const snapshot = CardCore.normalizeCard(cardData, defaultConfig);
    const canvas = document.createElement('canvas');
    try { await renderCardSnapshot(snapshot, canvas, { multiplier, fullResolution }); return { snapshot, canvas }; }
    catch (error) { canvas.width = canvas.height = 0; throw error; }
}
async function downloadCard() {
    let canvas;
    try {
        status('Preparando PNG…');
        const rendered = await snapshotCanvas(Number(document.getElementById('exportResolution').value), true);
        canvas = rendered.canvas;
        CardImages.download(await CardImages.canvasBlob(canvas), CardCore.fileName(rendered.snapshot, 'png'));
        status('PNG generado.');
    } catch (error) { status(error.message, true); }
    finally { if (canvas) canvas.width = canvas.height = 0; }
}
function exportJSON(event) {
    event?.preventDefault(); updateCardData();
    CardImages.download(new Blob([JSON.stringify(cardData, null, 2)], { type: 'application/json' }), CardCore.fileName(cardData, 'json'));
    status('JSON exportado. Incluye imágenes personalizadas y ajustes.');
}
async function importJSON(input) {
    try {
        const files = [...input.files];
        if (files.length !== 1) throw new Error('Selecciona una carta para abrirla en el editor.');
        if (files[0].size > 24 * 1024 * 1024) throw new Error('El JSON supera 24 MB.');
        await applyCard(JSON.parse(await files[0].text()));
    } catch (error) { status('No se importó: ' + error.message, true); }
    finally { input.value = ''; }
}
async function rasterFile(file, background = false) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Usa una imagen PNG, JPG o WebP.');
    const compress = document.getElementById('compress_uploads')?.checked;
    if (file.size > 20 * 1024 * 1024) throw new Error('La imagen supera 20 MB.');
    if (!compress && file.size > 10 * 1024 * 1024) throw new Error('Sin comprimir, usa una imagen de hasta 10 MB o activa Comprimir nuevas imágenes.');
    const image = await createImageBitmap(file);
    if (image.width * image.height > 50_000_000) { image.close(); throw new Error('Imagen demasiado grande (máximo 50 megapíxeles).'); }
    if (compress) {
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0); image.close();
        const data = canvas.toDataURL('image/webp', 0.95);
        canvas.width = canvas.height = 0;
        return CardCore.safeImage(data);
    }
    image.close();
    // Preserve the supplied pixels and encoding; export must not upscale an auto-reduced upload.
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.onload = () => { try { resolve(CardCore.safeImage(reader.result)); } catch (error) { reject(error); } };
        reader.readAsDataURL(file);
    });
}
async function loadRasterInput(input, kind) {
    const ticket = ++editorGeneration;
    try {
        const data = await rasterFile(input.files[0], kind === 'backgroundData');
        if (ticket !== editorGeneration) return;
        cardData[kind] = data;
        if (kind === 'evoArtData') { cardData.evoId = null; evoCacheKey++; }
        userUploadedArt = null; evoImageGlobal = null; lastCacheKey = '';
        updateCardData();
    } catch (error) { status(error.message, true); }
    finally { input.value = ''; }
}
function clearBackground() { cardData.backgroundData = null; updateCardData(); }
async function duplicateBackground() {
    const ticket = editorGeneration;
    try {
        const image = await CardImages.load(CardCore.backgroundPath(cardData.tcgType, cardData.stageVal), { required: true, fullResolution: true });
        if (ticket !== editorGeneration) return;
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        cardData.backgroundData = document.getElementById('compress_uploads')?.checked ? canvas.toDataURL('image/webp', 0.95) : canvas.toDataURL('image/png');
        canvas.width = canvas.height = 0;
        updateCardData(); status('Fondo duplicado en esta carta. Puedes reemplazarlo con Cargar fondo.');
    } catch (error) { status(error.message, true); }
}
async function resetAndClose() {
    if (savingCard) { status('Espera a que termine el guardado antes de crear otra carta.', true); return; }
    cancelLookup();
    cardData = CardCore.normalizeCard(CardCore.defaults(), defaultConfig);
    loadedRecord = null; currentLoadedFilePath = null;
    userUploadedArt = null; evoImageGlobal = null;
    resetFormControls(); restoreFormValues(); restoreConfigControls();
    updateCardData(); toggleDashboard(false);
    status('Carta nueva.');
}
function makeAccessibleControls() {
    document.querySelectorAll('.type-btn, .energy-btn').forEach(el => {
        el.tabIndex = 0; el.setAttribute('role', 'button');
        el.setAttribute('aria-label', el.title || el.querySelector('img')?.alt || 'Energía');
        el.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el.click(); }
            if ((event.key === 'Delete' || event.key === 'Backspace') && el.oncontextmenu) { event.preventDefault(); el.oncontextmenu(event); }
        };
        const img = el.querySelector('img');
        if (img) img.src = CardImages.assetUrl(img.getAttribute('src'));
        if (el.classList.contains('energy-btn')) {
            const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '−';
            remove.className = 'energy-remove'; remove.title = 'Quitar una energía'; remove.setAttribute('aria-label', 'Quitar una energía');
            remove.onclick = event => { event.stopPropagation(); el.oncontextmenu?.(event); };
            el.append(remove);
        }
    });
    document.querySelectorAll('label').forEach(label => {
        const next = label.nextElementSibling;
        if (!label.htmlFor && next?.matches('input[id],textarea[id],select[id]')) label.htmlFor = next.id;
    });
}
window.addEventListener('load', async () => {
    populateTypeSelectors(); initAttackForm();
    formDefaults = [...document.querySelectorAll('input[id]:not([type=file]),select[id],textarea[id]')].filter(el => !['dashboard_search', 'user_selector'].includes(el.id)).map(el => ({ id: el.id, value: el.value, checked: el.checked }));
    updateCardData(); defaultConfig = structuredClone(cardData.config);
    makeAccessibleControls();
    initialized = true;
    try {
        const draft = await LocalCards.getDraft();
        let legacy;
        try { legacy = localStorage.getItem('pokecard_v5_0'); } catch { /* Browser may block legacy storage. */ }
        if (draft) await applyCard(draft.data);
        else if (legacy) await applyCard(JSON.parse(legacy));
        else status('Listo. Guarda en este navegador o conecta Google Drive.');
    } catch (error) { status('No se pudo recuperar el borrador: ' + error.message, true); }
});
