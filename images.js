(function (root) {
    'use strict';
    // Cache promises as well as successful loads; cap decoded image memory.
    const cache = new Map();
    const decodedSizes = new Map();
    function evict(url) { cache.delete(url); decodedSizes.delete(url); }
    function trim() {
        let bytes = [...decodedSizes.values()].reduce((total, size) => total + size, 0);
        for (const [url, size] of decodedSizes) {
            if (bytes <= 96 * 1024 * 1024) break;
            bytes -= size; evict(url);
        }
    }
    function assetUrl(src, fullResolution = false) { return (fullResolution && root.CARD_EXPORT_ASSETS?.[src]) || root.CARD_ASSETS?.[src] || src; }
    function load(src, { required = false, fullResolution = false } = {}) {
        if (!src) return required ? Promise.reject(new Error('Falta una imagen obligatoria.')) : Promise.resolve(null);
        src = CardCore.safeImage(src);
        const url = assetUrl(src, fullResolution);
        if (!cache.has(url)) {
            const promise = new Promise((resolve, reject) => {
                const image = new Image();
                const timer = setTimeout(() => finish(new Error('Tiempo de espera de imagen agotado.')), 15000);
                function finish(error) {
                    clearTimeout(timer);
                    image.onload = image.onerror = null;
                    if (error) { evict(url); reject(error); }
                    else { decodedSizes.set(url, image.naturalWidth * image.naturalHeight * 4); trim(); resolve(image); }
                }
                image.crossOrigin = 'anonymous';
                image.onload = () => finish();
                image.onerror = () => finish(new Error('No se pudo cargar la imagen: ' + (src.startsWith('data:') ? 'imagen importada' : src)));
                image.src = url;
            });
            cache.set(url, promise);
            while (cache.size > 20) evict(cache.keys().next().value);
        }
        return cache.get(url).catch(error => { if (required) throw error; return null; });
    }
    async function evolution(card, required = false, fullResolution = false) {
        if (card.evoArtData) return load(card.evoArtData, { required, fullResolution });
        if (!card.evoId) return null;
        const id = String(card.evoId);
        const variants = Object.keys(root.CARD_ASSETS || {}).filter(src => src.startsWith(`pokemons/pm${id.padStart(4, '0')}_`) && src.endsWith('_big.png')).sort();
        for (const src of [...new Set([`pokemons/pm${id.padStart(4, '0')}_00_00_00_big.png`, `pokemons_other/${id.padStart(3, '0')}.png`, ...variants, `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`])]) {
            // The asset manifest avoids speculative 404s on static hosting.
            if (root.CARD_ASSETS && !src.startsWith('https:') && !root.CARD_ASSETS[src]) continue;
            const image = await load(src, { fullResolution });
            if (image) return image;
        }
        if (required) throw new Error('No se encontró la imagen de pre-evolución.');
        return null;
    }
    function canvasBlob(canvas) {
        return new Promise((resolve, reject) => {
            try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo codificar el PNG.')), 'image/png'); }
            catch (error) { reject(error); }
        });
    }
    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = name;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    let fontsReady;
    function fonts() {
        if (!fontsReady) fontsReady = Promise.all(['PokeName', 'PokeStats', 'AttackTitle', 'BodyText', 'BodyTextBold', 'BodyTextItalic', 'BodyTextBoldItalic', 'BodyTextCondensed', 'EvoFont', 'FlavorText', 'PokeSymbols', 'StageFont', 'SegoeSymbols'].map(name => document.fonts.load(`20px "${name}"`)).concat(document.fonts.load('bold 20px "FuturaStdHeavy"'))).then(() => document.fonts.ready);
        return fontsReady;
    }
    root.CardImages = { load, evolution, assetUrl, canvasBlob, download, fonts };
})(globalThis);
