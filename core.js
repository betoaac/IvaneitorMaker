(function (root) {
    'use strict';
    const TYPES = ['Planta', 'Fuego', 'Agua', 'Rayo', 'Psiquico', 'Lucha', 'Dark', 'Metal', 'Dragon', 'Normal', 'Fairy', 'Volador', 'Bicho', 'Fantasma', 'Tierra', 'Hielo', 'Veneno', 'Roca', 'Estelar'];
    const emptyAttack = () => ({ name: '', desc: '', dmg: '', mod: '', cost: [] });
    const defaults = () => ({ attacks: Array.from({ length: 3 }, emptyAttack), mainName: '', namePrefix: '', nameSuffix: '', mainStats: '', mainFlavor: '', hpVal: '60', stageVal: 'Basico', tcgType: 'Planta', weakType: 'Ninguna', resType: 'Ninguna', weakVal: 'x2', resVal: '−30', retreatCost: 0, pokemonImgUrl: 'pokemons/pm0001_00_00_00_big.png', customArtData: null, evoArtData: null, backgroundData: null, evoId: null, pokedexId: 0, abilityName: '', abilityDesc: '', config: {} });
    const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    function checkTree(v, depth = 0) {
        if (depth > 12) throw new Error('JSON demasiado anidado.');
        if (v && typeof v === 'object') for (const key of Object.keys(v)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Clave JSON no permitida.');
            checkTree(v[key], depth + 1);
        }
    }
    function safeImage(value) {
        if (!value) return '';
        if (typeof value !== 'string' || value.length > 16 * 1024 * 1024) throw new Error('Imagen inválida o demasiado grande.');
        if (/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=\s]+$/i.test(value)) return value;
        if (/^(bordes|energias|customicons|images|mascaras|pokemons|pokemons_other|regulationmark|seticon|tags|web-assets)\/[\w .()/áéíóúñ-]+$/i.test(value) && !value.includes('..')) return value;
        try {
            const url = new URL(value);
            if (url.protocol === 'https:' && url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/PokeAPI/sprites/')) return value;
        } catch { /* Relative paths were checked above. */ }
        throw new Error('Origen de imagen no permitido. Importa una imagen PNG, JPG o WebP.');
    }
    function normalizeCard(input, configDefaults = {}) {
        if (!object(input)) throw new Error('La carta debe ser un objeto JSON.');
        checkTree(input);
        const raw = input.fullData ?? input;
        if (!object(raw) || (raw.config !== undefined && !object(raw.config)) || (raw.attacks !== undefined && !Array.isArray(raw.attacks))) throw new Error('Estructura de carta inválida.');
        const card = { ...defaults(), ...structuredClone(raw), config: { ...structuredClone(configDefaults), ...raw.config } };
        const aliases = { mainName: 'pokeName', mainStats: 'pokeStats', mainFlavor: 'pokeFlavor', hpVal: 'hp_val', abilityName: 'ability_name', abilityDesc: 'ability_desc' };
        for (const [key, alias] of Object.entries(aliases)) card[key] = String(raw[key] ?? raw[alias] ?? card[key]);
        for (const key of ['namePrefix', 'nameSuffix', 'weakVal', 'resVal', 'pokeType1', 'pokeType2']) card[key] = String(card[key] ?? '');
        for (const key of ['mainName', 'namePrefix', 'nameSuffix', 'abilityName']) if (card[key].length > 250) throw new Error('Nombre demasiado largo (máximo 250 caracteres).');
        for (const key of ['mainStats', 'mainFlavor', 'abilityDesc']) if (card[key].length > 2000) throw new Error('Texto demasiado largo (máximo 2000 caracteres).');
        card.attacks = Array.from({ length: 3 }, (_, i) => {
            const atq = raw.attacks?.[i] ?? emptyAttack();
            if (!object(atq) || (atq.cost !== undefined && !Array.isArray(atq.cost))) throw new Error('Ataque inválido.');
            const result = { ...emptyAttack(), ...Object.fromEntries(['name', 'desc', 'dmg', 'mod'].map(k => [k, String(atq[k] ?? '')])), cost: (atq.cost ?? []).filter(t => TYPES.includes(t)).slice(0, 5) };
            if (result.desc.length > 2000 || result.name.length > 250) throw new Error('Ataque demasiado largo.');
            return result;
        });
        card.tcgType = TYPES.includes(card.tcgType) ? card.tcgType : card.tcgType === 'Hada' ? 'Fairy' : ['Cookie', 'Cockie'].includes(card.tcgType) ? 'Estelar' : 'Normal';
        card.stageVal = /2/.test(card.stageVal) ? 'Fase2' : /1/.test(card.stageVal) ? 'Fase1' : 'Basico';
        card.retreatCost = Math.min(5, Math.max(0, Number(card.retreatCost) || 0));
        for (const key of ['weakType', 'resType']) if (!TYPES.includes(card[key])) card[key] = 'Ninguna';
        for (const key of ['pokemonImgUrl', 'customArtData', 'evoArtData', 'backgroundData']) card[key] = safeImage(card[key]) || null;
        for (const key of ['setIconImg', 'regMarkImg']) if (card.config[key]) card.config[key] = safeImage(card.config[key]);
        for (const key of ['setNumCurr', 'setNumTotal', 'setTextVal', 'illusName', 'evoName', 'evoLabel', 'authorText']) card.config[key] = String(card.config[key] ?? raw[key] ?? '');
        for (const [key, fallback] of Object.entries(configDefaults)) {
            if (typeof fallback === 'number' && !Number.isFinite(card.config[key])) card.config[key] = fallback;
            if (typeof fallback === 'number' && Math.abs(card.config[key]) > 10000) throw new Error('Ajuste numérico fuera de rango.');
            if (typeof fallback === 'boolean') card.config[key] = card.config[key] === true;
            if (typeof fallback === 'string' && typeof card.config[key] !== 'string') card.config[key] = fallback;
            if (object(fallback)) {
                card.config[key] = { ...fallback, ...(object(card.config[key]) ? card.config[key] : {}) };
                if ('x' in fallback) for (const axis of ['x', 'y']) if (!Number.isFinite(card.config[key][axis]) || Math.abs(card.config[key][axis]) > 10000) throw new Error('Posición de texto inválida.');
            }
        }
        if (configDefaults.symbols) {
            const saved = raw.config?.symbols;
            card.config.symbols = structuredClone(configDefaults.symbols);
            card.config.symbols.enabled = saved?.enabled === true;
            for (const [key, icon] of Object.entries(card.config.symbols.icons)) icon.enabled = saved?.icons?.[key]?.enabled ?? true;
        }
        if (card.evoId !== null && !/^\d{1,5}$/.test(String(card.evoId))) card.evoId = null;
        return card;
    }
    function safeName(value) { return String(value ?? '').normalize('NFKC').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/^\.+|[. ]+$/g, '').slice(0, 120) || 'Carta'; }
    function fileName(card, extension) {
        const c = card.config || {};
        return safeName(`${c.setTextVal || 'NONE'}_${String(c.setNumCurr ?? 0).padStart(4, '0')}_${card.mainName || 'Carta'}`) + '.' + extension;
    }
    function csvCell(value) {
        let text = String(value ?? '');
        if (/^[\s]*[=+@\-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    }
    function backgroundPath(type, stage) {
        const mapped = { Fairy: 'Hada', Cookie: 'GALLETA', Cockie: 'GALLETA', Estelar: 'GALLETA' }[type] || (TYPES.includes(type) ? type : 'Normal');
        return `bordes/PokemonTGC_Plantilla_${mapped}_${stage === 'Basico' ? 'Basico' : 'Fase1'}.png`;
    }
    const api = { TYPES, defaults, normalizeCard, safeImage, safeName, fileName, csvCell, backgroundPath };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CardCore = api;
})(globalThis);
