const CONFIG_FIELDS = {"x": "retreat_x", "y": "retreat_y", "hpSize": "hp_size", "hpLabelText": "hp_label_text", "flavorW": "flavor_width", "flavorS": "flavor_size", "flavorLeading": "flavor_leading", "bodyX": "body_x", "bodyYCenter": "body_y_center", "bodyW": "body_width", "bodySize": "body_size", "bodyLeading": "body_leading", "titleDescSpacing": "title_desc_spacing", "scaleBody": "scale_body", "bodyKerning": "body_kerning", "isThin": "thin_spaces", "isLightText": "light_text_mode", "abilityStrokeBoost": "ability_stroke_boost", "artFlip": "art_flip", "iconSize": "energy_size", "iconSpacing": "energy_spacing", "regMarkImg": "reg_mark_img", "regX": "reg_x", "regY": "reg_y", "setIconX": "set_icon_x", "setIconY": "set_icon_y", "setTextVal": "set_text_val", "setTextX": "set_text_x", "setTextY": "set_text_y", "setTextWidth": "set_text_width", "setTextSizeBig": "set_text_size_big", "setTextSizeSmall": "set_text_size_small", "illusName": "illustrator_name", "illusX": "illu_x", "illusY": "illu_y", "authorText": "author_text", "authorX": "author_x", "authorY": "author_y", "setNumCurr": "set_num_curr", "setNumTotal": "set_num_total", "setNumX": "set_num_x", "setNumY": "set_num_y", "rarityIcon": "rarity_icon", "evoLabel": "evo_label", "evoName": "evo_name", "evoX": "evo_x", "evoY": "evo_y", "evoZoom": "evo_zoom", "evoRot": "evo_rot", "evoFlip": "evo_flip"};
let currentLoadedFilePath = null;
let currentSetFilter = null;
let currentUser = 'local';
let editorGeneration = 0;
let pokeController = null;
let defaultConfig = {};
let formDefaults = [];
let evoImageGlobal = null;
let evoCacheKey = 0;
let renderRequestCounter = 0;

// =========================================================
// GESTIÓN DE IMÁGENES PRE-EVOLUCIÓN (PERSISTENTE)
// =========================================================

function loadLocalEvo(input) { return loadRasterInput(input, 'evoArtData'); }

async function loadEvoImageFromData(id, name) {
    const ticket = editorGeneration;
    cardData.evoId = id; cardData.evoNameRef = name; cardData.evoArtData = null;
    updateCardData();
    try {
        const image = await CardImages.evolution({ evoId: id }, true);
        if (ticket !== editorGeneration) return;
        evoImageGlobal = image; evoCacheKey++;
        const online = image.src.startsWith('https:');
        document.getElementById('evo-status').textContent = `${name || id}: imagen ${online ? 'de respaldo en Internet' : 'local'} cargada. Se muestra en Fase 1 o Fase 2.`;
        updateCardData();
    } catch (error) {
        if (ticket === editorGeneration) document.getElementById('evo-status').textContent = error.message;
    }
}

const energyFiles = {
    "Planta": "grass.png", "Fuego": "fire.png", "Agua": "water.png",
    "Rayo": "Lightning.png", "Psiquico": "Psyquic.png", "Lucha": "fighting.png",
    "Dark": "dark.png", "Metal": "metal.png", "Dragon": "dragon.png",
    "Normal": "colorless.png", "Fairy": "Fairy.png",
    // NUEVOS TIPOS
    "Volador": "Flying.png", "Bicho": "Bug.png", "Fantasma": "Ghost.png",
    "Tierra": "Ground.png", "Hielo": "Ice.png", "Veneno": "Poison.png",
    "Roca": "Rock.png", "Estelar": "Stellar.png"
};

const tcgTypesList = [
    "Planta", "Fuego", "Agua", "Rayo", "Psiquico", "Lucha", "Dark",
    "Metal", "Dragon", "Normal", "Fairy", "Volador", "Bicho",
    "Fantasma", "Tierra", "Hielo", "Veneno", "Roca", "Estelar"
];

const typeTrans = {
    "normal": "Normal", "ground": "Tierra", "rock": "Roca", "grass": "Planta", "bug": "Bicho", "fire": "Fuego", "water": "Agua",
    "electric": "Rayo", "psychic": "Psiquico", "fighting": "Lucha",
    "poison": "Veneno", "dark": "Dark", "flying": "Volador",
    "dragon": "Dragon", "steel": "Metal", "ice": "Hielo", "fairy": "Fairy"
};

let cardData = {
    attacks: [
        { name: "", desc: "", dmg: "", mod: "", cost: [] },
        { name: "", desc: "", dmg: "", mod: "", cost: [] },
        { name: "", desc: "", dmg: "", mod: "", cost: [] }
    ],
    weakMod: "✖", resMod: "−", retreatCost: 0,
    weakType: "Ninguna", resType: "Ninguna",
    tcgType: "Planta", // Valor por defecto
    pokemonImgUrl: "pokemons/pm0001_00_00_00_big.png",
    customArtData: null,
    config: {}
};


// =========================================================
// CONFIGURACIÓN DE REEMPLAZO SIMBÓLICO (CUSTOM ICONS)
// =========================================================
const customIconsConfig = {
    // Master Switch (se controla desde el checkbox global)
    enabled: false,

    // Lista de reemplazos
    icons: {
        'pokemon_activo': {
            phrases: ["Pokemon Activo", "Pokémon Activo"],
            file: "Semicon_PokemonActivo_normal.png",
            w: 45, h: 22, yOffset: 0, enabled: true
        },
        'pokemon_banca': {
            phrases: ["Pokemon en Banca", "Pokémon en Banca", "Pokemon en la Banca", "Pokémon en la Banca"],
            file: "Semicon_PokemonBanca_normal.png",
            w: 45, h: 22, yOffset: 0, enabled: true
        },
        'pila_descartes': {
            phrases: ["Pila de Descartes", "Pila de Descarte"],
            file: "Semicon_PilaDescartes_normal.png",
            w: 45, h: 22, yOffset: 0, enabled: true
        },
        'baraja_baraja': {
            phrases: ["Baraja tu baraja", "Baraja las cartas de tu baraja"],
            file: "Semicon_BarajaBaraja_normal.png",
            w: 60, h: 22, yOffset: 0, enabled: true
        },
        'habilidad': {
            phrases: ["Habilidad"],
            file: "Semicon_Habilidad_normal.png",
            w: 80, h: 22, yOffset: 0, enabled: true
        },
        'contadores_dano': {
            phrases: ["Contadores de Daño"], // Plural primero para que haga match antes
            file: "Semicon_ContadoresDaño_normal.png", // Usaré el plural para ambos casos o ajusta aquí
            w: 34, h: 24, yOffset: 0, enabled: true
        },
        'contador_dano_single': { // Caso específico singular si tienes icono distinto
            phrases: ["Contador de Daño"],
            file: "Semicon_ContadorDaño_normal.png",
            w: 34, h: 24, yOffset: 0, enabled: true
        },
        'cartas_energia': {
            phrases: ["Cartas de Energía Básica", "Cartas de Energia Basica"],
            file: "Semicon_CartasEnergia_normal.png",
            w: 40, h: 24, yOffset: 0, enabled: true
        },
        'carta_energia': {
            phrases: ["Carta de Energía Básica", "Carta de Energia Basica"],
            file: "Semicon_CartaEnergia_normal.png",
            w: 40, h: 24, yOffset: 0, enabled: true
        }
    }
};

// Generador de Regex flexible (ignora tildes y mayúsculas)
function getRegexForPhrase(phrase) {
    // Escapar caracteres especiales
    let clean = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Reemplazar vocales por grupos que aceptan tildes
    clean = clean.replace(/[aá]/gi, '[aá]');
    clean = clean.replace(/[eé]/gi, '[eé]');
    clean = clean.replace(/[ií]/gi, '[ií]');
    clean = clean.replace(/[oó]/gi, '[oó]');
    clean = clean.replace(/[uú]/gi, '[uú]');
    // Espacios flexibles
    clean = clean.replace(/\s+/g, '\\s+');
    return new RegExp(clean, 'gi'); // Global + Case Insensitive
}

// =========================================================

// Variables globales de caché y canvas
let staticCacheCanvas = document.createElement('canvas');
let staticCacheCtx = staticCacheCanvas.getContext('2d');
let lastCacheKey = "";
let userUploadedArt = null;
let typingTimer;

// =========================================================
// GESTIÓN DE ESTADO E IMÁGENES
// =========================================================

function loadLocalArt(input) { return loadRasterInput(input, 'customArtData'); }

// =========================================================
// RESTAURAR DATOS AL EDITOR (CORREGIDO PARA EVITAR SOBREESCRITURA)
// =========================================================
function restoreFormValues() {
    // A. Helper seguro para asignar valores
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) {
            el.value = val;

            // --- CORRECCIÓN CLAVE ---
            // Si es un slider, actualizamos el input numérico vecino (num_id) MANUALMENTE.
            // NO usamos syncFromRange() aquí porque eso dispararía updateCardData()
            // antes de tiempo, corrompiendo los datos que estamos cargando.
            if (el.type === 'range') {
                const numEl = document.getElementById('num_' + id);
                if (numEl) numEl.value = val;
            }
        }
    };

    // B. Helper para checkboxes
    const setCheck = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
    };

    // --- 1. DATOS BÁSICOS ---
    setVal('pokeName', cardData.mainName || cardData.pokeName);
    setVal('pokeNamePrefix', cardData.namePrefix);
    setVal('pokeNameSuffix', cardData.nameSuffix);
    setVal('pokeStats', cardData.mainStats || cardData.pokeStats);
    setVal('pokeFlavor', cardData.mainFlavor || cardData.pokeFlavor);
    setVal('hp_val', cardData.hpVal || cardData.hp_val);

    // Restaurar Iconos de Tipos (T1/T2)
    setVal('pokeType1', cardData.pokeType1);
    setVal('pokeType2', cardData.pokeType2);
    if (typeof updateTypeVisuals === 'function') {
        updateTypeVisuals(cardData.pokeType1, cardData.pokeType2);
    }

    // Config visual HP
    if (cardData.config) {
        setVal('hp_label_text', cardData.config.hpLabelText);
    }

    // --- 2. CONFIGURACIÓN DEL SET Y AUTOR ---
    if (cardData.config) {
        setVal('illustrator_name', cardData.config.illusName);
        setVal('author_text', cardData.config.authorText);
        setVal('set_icon_img', cardData.config.setIconImg);
        setVal('set_text_val', cardData.config.setTextVal);
        setVal('reg_mark_img', cardData.config.regMarkImg);
        setVal('set_num_curr', cardData.config.setNumCurr);
        setVal('set_num_total', cardData.config.setNumTotal);
        setVal('rarity_icon', cardData.config.rarityIcon);
    }

    // --- 3. DATOS DE PRE-EVOLUCIÓN ---
    if (cardData.config) {
        setVal('evo_label', cardData.config.evoLabel);
        setVal('evo_name', cardData.config.evoName);

        // Sliders de Evo
        setVal('evo_x', cardData.config.evoX);
        setVal('evo_y', cardData.config.evoY);
        setVal('evo_zoom', cardData.config.evoZoom);
        setVal('evo_rot', cardData.config.evoRot);
        setCheck('evo_flip', cardData.config.evoFlip);
    }

    // --- 4. CONFIGURACIÓN DE IMAGEN PRINCIPAL (ARTE) ---
    if (cardData.config) {
        setVal('art_x', cardData.config.artX);
        setVal('art_y', cardData.config.artY);
        setVal('art_zoom', cardData.config.artZoom);
        setVal('art_rotation', cardData.config.artRot);
        setCheck('art_flip', cardData.config.artFlip);
    }

    // --- 5. CONFIGURACIÓN DE TEXTO (CUERPO) ---
    if (cardData.config) {
        setVal('body_y_center', cardData.config.bodyYCenter);
        setVal('body_size', cardData.config.bodySize);
        setVal('body_leading', cardData.config.bodyLeading);
        setVal('body_kerning', cardData.config.bodyKerning);
        setVal('scale_body', cardData.config.scaleBody);

        setCheck('thin_spaces', cardData.config.isThin);
        setCheck('light_text_mode', cardData.config.isLightText);
        setCheck('ability_stroke_boost', cardData.config.abilityStrokeBoost);
    }

    // --- 6. HABILIDAD Y ATAQUES ---
    setVal('ability_name', cardData.abilityName);
    setVal('ability_desc', cardData.abilityDesc);

    if (cardData.attacks) {
        cardData.attacks.forEach((atq, i) => {
            setVal(`atq${i}_name`, atq.name);
            setVal(`atq${i}_dmg`, atq.dmg);
            setVal(`atq${i}_mod`, atq.mod);
            setVal(`atq${i}_desc`, atq.desc);

            Object.keys(energyFiles).forEach(t => {
                const span = document.getElementById(`c-${i}-${t}`);
                if(span) {
                    const count = atq.cost ? atq.cost.filter(x => x === t).length : 0;
                    span.innerText = count;
                }
            });
        });
    }

    // --- 7. DEBILIDAD, RESISTENCIA, RETIRADA ---
    setVal('weak_val', cardData.weakVal);
    setVal('res_val', cardData.resVal);

    updateTypeButtons('tcg', cardData.tcgType);
    updateTypeButtons('weak', cardData.weakType);
    updateTypeButtons('res', cardData.resType);
    updateRetreatButtons(cardData.retreatCost || 0);

    // --- 8. RESTAURAR BOTONES DE ETAPA ---
    const stageVal = cardData.stageVal || 'Basico';
    setVal('stage_val', stageVal);

    // Restaurar visualmente los botones de Etapa
    const stageBtns = document.querySelectorAll('.btn-group-stage button');
    stageBtns.forEach(btn => {
        if(btn.innerText.includes(stageVal) || (stageVal === 'Basico' && btn.innerText.includes('Básico'))) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Auto-expandir textareas
    setTimeout(() => {
        document.querySelectorAll('textarea.auto-expand').forEach(el => autoResize(el));
    }, 50);
}
// =========================================================
// LÓGICA DE UI E INTERACCIÓN
// =========================================================

function populateTypeSelectors() {
    const createBtns = (containerId, prefix) => {
        const container = document.getElementById(containerId);
        if(!container) return;

        let html = `<div class="type-btn" onclick="setType('${prefix}', 'Ninguna')" title="Ninguna" style="border:1px solid #555;">🚫</div>`;

        tcgTypesList.forEach(t => {
            if(energyFiles[t]) {
                html += `<div class="type-btn" onclick="setType('${prefix}', '${t}')" title="${t === 'Estelar' ? 'Cookie' : t === 'Fairy' ? 'Hada' : t}">
                            <img src="${CardImages.assetUrl(`energias/${energyFiles[t]}`)}">
                         </div>`;
            }
        });
        container.innerHTML = html;
    };

    createBtns('weak_selector', 'weak');
    createBtns('res_selector', 'res');
    createBtns('tcg_type_selector', 'tcg');
}

function setType(prefix, type) {
    if(prefix === 'weak') {
        cardData.weakMod = "✖";
        cardData.weakType = type;
    }
    if(prefix === 'res') {
        cardData.resType = type;
    }
    if(prefix === 'tcg') {
        cardData.tcgType = (type === "Ninguna") ? "Normal" : type;

        // --- AUTO-ACTIVAR MODO TEXTO CLARO ---
        // Tipos oscuros: Roca, Siniestro(Dark), Fantasma, Veneno
        const darkTypes = ["Roca", "Dark", "Fantasma", "Veneno"];
        const isDark = darkTypes.includes(cardData.tcgType);

        const textCheck = document.getElementById('light_text_mode');
        if(textCheck) {
            textCheck.checked = isDark;
            // Actualizamos visualmente el estado
            updateCardData();
        }
    }

    updateTypeButtons(prefix, type);
    updateCardData();
}

function updateTypeButtons(prefix, selectedType) {
    const container = document.getElementById(prefix === 'tcg' ? 'tcg_type_selector' : `${prefix}_selector`);
    if(!container) return;
    const btns = container.children;
    for(let btn of btns) btn.classList.remove('active');

    if(selectedType === "Ninguna" || !selectedType) {
        btns[0].classList.add('active');
    } else {
        const idx = tcgTypesList.indexOf(selectedType);
        if(idx >= 0 && btns[idx+1]) btns[idx+1].classList.add('active');
    }
}

function resetVal(id, val) {
    document.getElementById(id).value = val;
    updateCardData();
}

function initAttackForm() {
    const container = document.getElementById('attacks-container');
    if(!container) return;
    container.innerHTML = "";

    cardData.attacks.forEach((atq, i) => {
        container.innerHTML += `
            <div class="attack-box" style="border:1px solid #444; padding:10px; margin-top:10px; border-radius:5px; background:#222;">
                <label style="color:#4db8ff">ATAQUE ${i+1}</label>
                <div class="row">
                    <input type="text" id="atq${i}_name" placeholder="Nombre" oninput="updateCardData()">
                    <input type="number" id="atq${i}_dmg" placeholder="Dmg" style="width:60px" oninput="updateCardData()">
                    <select id="atq${i}_mod" style="width:50px" onchange="updateCardData()">
                        <option value="">-</option><option value="+">+</option><option value="✖">x</option><option value="−">-</option>
                    </select>
                </div>
                <textarea id="atq${i}_desc" class="auto-expand" placeholder="Descripción..."
                          oninput="autoResize(this); updateCardData()"></textarea>

                <div class="energy-selector">
                    ${Object.keys(energyFiles).map(t => `
                        <div class="energy-btn"
                             onclick="modifyEnergy(${i}, '${t}', 'add')"
                             oncontextmenu="modifyEnergy(${i}, '${t}', 'remove'); return false;">
                            <img src="${CardImages.assetUrl(`energias/${energyFiles[t]}`)}">
                            <span id="c-${i}-${t}">0</span>
                        </div>`).join('')}
                </div>
            </div>`;
    });
}

// Función para vaciar el costo de un ataque
function clearEnergies(idx) {
    cardData.attacks[idx].cost = [];
    updateCardData();
}

async function fetchPokeData() {
    // 1. ACTUALIZACIÓN VISUAL INMEDIATA
    updateCardData();

    // 2. LÓGICA DE AUTO-COMPLETADO (API)
    // Obtenemos el valor real que escribió el usuario
    const name = document.getElementById('pokeName').value.toLowerCase().trim();

    // Si es muy corto, no hacemos nada
    clearTimeout(typingTimer);
    if (pokeController) pokeController.abort();
    const lookupGeneration = ++editorGeneration;
    if (name.length < 3) return;

    // --- CORRECCIÓN NIDORAN (Mapeo manual) ---
    // Creamos la variable que usaremos PARA BUSCAR (searchName)
    // Por defecto es igual a lo que escribió el usuario
    let searchName = name;

    // Si escribió variantes de Nidoran, forzamos el nombre correcto de la API
    if (name === 'nidoran')  searchName = 'nidoran-m';
    if (name === 'nidoranm') searchName = 'nidoran-m';
    if (name === 'nidoranf') searchName = 'nidoran-f';
    if (name === 'nidoran(m)')  searchName = 'nidoran-m';
    if (name === 'nidoran♂') searchName = 'nidoran-m';
    if (name === 'nidoran(f)') searchName = 'nidoran-f';
    if (name === 'nidoran♀') searchName = 'nidoran-f';
    // ------------------------------------------

    clearTimeout(typingTimer);
    typingTimer = setTimeout(async () => {
        pokeController = new AbortController();
        const signal = AbortSignal.any([pokeController.signal, AbortSignal.timeout(12000)]);
        try {
            // IMPORTANTE: Aquí usamos 'searchName' (el corregido), NO 'name'
            const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(searchName)}`, { signal });

            // Si no encuentra nada (404), paramos.
            if (!res.ok) return;

            const data = await res.json();
            const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(data.species.name)}`, { signal });
            if (!speciesRes.ok) throw new Error("No se pudo consultar la Pokédex.");
            const speciesData = await speciesRes.json();
            if (lookupGeneration !== editorGeneration) return;

            cardData.pokedexId = data.id;
            cardData.pokemonImgUrl = `pokemons/pm${String(data.id).padStart(4, '0')}_00_00_00_big.png`;
            if (!CARD_ASSETS[cardData.pokemonImgUrl]) cardData.pokemonImgUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${data.id}.png`;

            // =========================================================
            // LÓGICA DE ICONOS Y TIPOS
            // =========================================================

            // 1. Obtener tipos crudos de la API
            const type1 = data.types[0].type.name;
            const type2 = data.types[1] ? data.types[1].type.name : "";

            // 2. Guardar valores en inputs ocultos
            if(document.getElementById('pokeType1')) document.getElementById('pokeType1').value = type1;
            if(document.getElementById('pokeType2')) document.getElementById('pokeType2').value = type2;

            // 3. ACTUALIZAR ICONOS VISUALES
            if(typeof updateTypeVisuals === "function") {
                updateTypeVisuals(type1, type2);
            }

            // 4. Auto-seleccionar el tipo TCG principal
            const mapTypes = {
                'grass': 'Planta', 'fire': 'Fuego', 'water': 'Agua', 'lightning': 'Rayo',
                'psychic': 'Psiquico', 'fighting': 'Lucha', 'darkness': 'Dark',
                'steel': 'Metal', 'dark': 'Dark', 'metal': 'Metal', 'fairy': 'Fairy', 'dragon': 'Dragon', 'normal': 'Normal',
                'flying': 'Normal', 'bug': 'Planta', 'rock': 'Lucha', 'ground': 'Lucha',
                'ghost': 'Psiquico', 'poison': 'Dark', 'ice': 'Agua', 'electric': 'Rayo'
            };

            // Si el tipo existe en el mapa, cambiamos el fondo de la carta
            if(mapTypes[type1]) {
                // Nota: Asegúrate de que tu mapTypes coincida con los nombres exactos de tus archivos
                // He ajustado 'lightning'->'Rayo', 'darkness'->'Dark', etc. según tu lista anterior.
                // Si usas otros nombres, ajústalos aquí.
                cardData.tcgType = mapTypes[type1];
                updateTypeButtons('tcg', mapTypes[type1]);
            }

            // Stats de HP
            if(document.getElementById('hp_val')) document.getElementById('hp_val').value = data.stats[0].base_stat;

            // Textos (Género y Descripción)
            const genus = speciesData.genera.find(g => g.language.name === "es")?.genus || "Pokémon";
            const flavor = speciesData.flavor_text_entries.find(f => f.language.name === "es")?.flavor_text.replace(/\f/g, ' ') || "";

            // AQUÍ AGREGAMOS (m) o (f) SI APLICA PARA QUE LA FUENTE LO DETECTE LUEGO
            // (La API de especies tiene 'gender_rate'. -1 es sin género. 8 es solo hembra, 0 solo macho)
            // Pero para Nidoran, el nombre ya nos lo dice.

            document.getElementById('pokeStats').value = `NO. ${String(data.id).padStart(4,'0')}  ${genus}  Altura: ${data.height/10} m  Peso: ${data.weight/10} kg`;
            document.getElementById('pokeFlavor').value = flavor;

            // Lógica de Pre-Evolución
            if (speciesData.evolves_from_species) {
                const prevName = speciesData.evolves_from_species.name;
                const prevUrl = speciesData.evolves_from_species.url;

                // Formatear nombre
                const formatName = prevName.charAt(0).toUpperCase() + prevName.slice(1);
                const evoNameInput = document.getElementById('evo_name');
                if(evoNameInput) evoNameInput.value = formatName;

                // Extraer ID
                const parts = prevUrl.split('/');
                const prevId = parts[parts.length - 2];

                // Cargar Imagen Pre-Evo
                loadEvoImageFromData(prevId, prevName);

            } else {
                // Es básico
                if(document.getElementById('evo_name')) document.getElementById('evo_name').value = "";
                evoImageGlobal = null; cardData.evoId = null; cardData.evoArtData = null;
            }

            // Redibujamos con los nuevos datos encontrados
            updateCardData();

        } catch (e) {
            console.log("No se encontró datos automáticos o error de API.", e);
        }
    }, 500);
}

function modifyEnergy(idx, type, action) {
    if(action === 'add') {
        if(cardData.attacks[idx].cost.length < 5) cardData.attacks[idx].cost.push(type);
    } else {
        const i = cardData.attacks[idx].cost.indexOf(type);
        if(i > -1) cardData.attacks[idx].cost.splice(i, 1);
    }
    updateCardData();
}

function setRetreat(val) {
    cardData.retreatCost = val;
    updateRetreatButtons(val);
    updateCardData();
}

function updateRetreatButtons(val) {
    const container = document.getElementById('retreat-selector');
    if(!container) return;
    const btns = container.children;
    for(let btn of btns) btn.classList.remove('active');
    if(btns[val]) btns[val].classList.add('active');
}

function setMod(type, val) {
    if(type === 'weak') cardData.weakMod = val;
    if(type === 'res') cardData.resMod = val;
    updateCardData();
}

// =========================================================
// ACTUALIZACIÓN DE DATOS (DATA BINDING)
// =========================================================

function updateCardData() {
    updateSliderLabels();
// ... inicio de updateCardData ...

    const stageVal = document.getElementById('stage_val').value;

    // Mostrar/Ocultar panel de Evo
    const evoPanel = document.getElementById('evo_controls_panel');
    if(evoPanel) {
        evoPanel.style.display = (stageVal === 'Basico') ? 'none' : 'block';
    }
    const getV = (id) => document.getElementById(id)?.value || "";
    const statsVal = getV('pokeStats');
    const match = statsVal.match(/NO\.\s*(\d+)/i);
    if (match) {
        cardData.pokedexId = parseInt(match[1]);
    } else {
        cardData.pokedexId = cardData.pokedexId || 0;
    }


    const getN = (id, def=0) => {
        const el = document.getElementById(id);
        const value = Number.parseFloat(el?.value);
        if (!Number.isFinite(value)) return def;
        return Math.max(el?.min !== '' && el?.min !== undefined ? Number(el.min) : -10000, Math.min(el?.max !== '' && el?.max !== undefined ? Number(el.max) : 10000, value));
    };
    const getC = (id) => document.getElementById(id)?.checked || false;

    // Arte y Config
    const artZoom = getN('art_zoom', 1);
    const artX = getN('art_x', 373);
    const artY = getN('art_y', 315);
    const artRot = getN('art_rotation', 0);

    // Actualizar Previews de imágenes
    const regPreview = document.getElementById('reg_mark_preview');
    if(regPreview) regPreview.src = CardImages.assetUrl(getV('reg_mark_img')) || "";

    const setIconPreview = document.getElementById('set_icon_preview');
    const setIconImg = getV('set_icon_img');
    if(setIconPreview) setIconPreview.src = CardImages.assetUrl(setIconImg) || "";

    // Toggle para caja de texto del Set
    const setTextContainer = document.getElementById('set_text_container');
    if(setTextContainer) {
        if(!setIconImg) {
            setTextContainer.style.opacity = "0.5";
            setTextContainer.style.pointerEvents = "none";
        } else {
            setTextContainer.style.opacity = "1";
            setTextContainer.style.pointerEvents = "auto";
        }
    }

    // Recolectar Configuración
    const priorConfig = cardData.config;
    cardData.config = {
        ...cardData.config,
        symbols: structuredClone(customIconsConfig),
        namePos: { x: getN('name_x', 142), y: getN('name_y', 77) },
        hpPos: { x: getN('hp_x', 649), y: getN('hp_y', 84) },
        hpSize: getN('hp_size', 54),
        hpLabelText: getV('hp_label_text') || "PS",
        // Fijos
        hpLabelSize: 15, hpLabelX: -24, hpLabelY: -1, hpKerning: 0,

        stagePos: { x: getN('stage_x', 70), y: getN('stage_y', 82) },

        flavorPos: { x: getN('flavor_x', 265), y: getN('flavor_y', 975) },
        flavorW: getN('flavor_width', 440),
        flavorS: getN('flavor_size', 15.5),
        flavorLeading: getN('flavor_leading', 21),

        weakPos: { x: getN('weak_x', 120), y: getN('weak_y', 897) },
        resPos: { x: getN('res_x', 316), y: getN('res_y', 897) },
        retreatPos: { x: getN('retreat_x', 532), y: getN('retreat_y', 897) },

        bodyX: getN('body_x', 58),
        bodyYCenter: getN('body_y_center', 749),
        bodyW: getN('body_width', 635),

        // Controles de cuerpo y presets
        bodySize: getN('body_size', 28),
        bodyLeading: getN('body_leading', 29),
        titleDescSpacing: getN('title_desc_spacing', 37),
        scaleBody: getN('scale_body', 0.97),
        bodyKerning: getN('body_kerning', -0.5),
        isThin: getC('thin_spaces'),
        isLightText: getC('light_text_mode'),
        abilityStrokeBoost: getC('ability_stroke_boost'), // <--- NUEVO

        scaleTitle: 0.94,
        scaleHP: 0.96,

        artZoom: artZoom,
        artX: artX,
        artY: artY,
        artRot: artRot,
        artFlip: getC('art_flip'),

        nameFont: 'PokeName', statsFont: 'PokeStats', titleFont: 'AttackTitle',
        bodyFont: 'BodyText', flavorFont: 'FlavorText', symbolFont: 'PokeSymbols', evolucionaFont: 'EvoFont',
        numFont: 'FuturaStdHeavy', stageFont: 'HandelGothic',

        iconSize: getN('energy_size', 36),
        iconSpacing: getN('energy_spacing', 44),

        // 7. AUTORÍA Y SET
        regMarkImg: getV('reg_mark_img'),
        regX: getN('reg_x', 44),
        regY: getN('reg_y', 978),

        setIconImg: setIconImg,
        setIconX: getN('set_icon_x', 19),
        setIconY: getN('set_icon_y', 0),

        setTextVal: getV('set_text_val'),
        setTextX: getN('set_text_x', 5),
        setTextY: getN('set_text_y', 0),
        setTextWidth: getN('set_text_width', 35),
        setTextSizeBig: getN('set_text_size_big', 19),
        setTextSizeSmall: getN('set_text_size_small', 12),

        illusName: getV('illustrator_name'),
        illusX: getN('illu_x', 60),
        illusY: getN('illu_y', 970),

        authorText: getV('author_text'),
        authorX: getN('author_x', 230),
        authorY: getN('author_y', 1015),

        setNumCurr: getV('set_num_curr'),
        setNumTotal: getV('set_num_total'),
        setNumX: getN('set_num_x', 52),
        setNumY: getN('set_num_y', 7),

        rarityIcon: getV('rarity_icon'),
        // --- NUEVO: GUARDAR AJUSTES DE PRE-EVOLUCIÓN ---
        // Aquí es donde se "graban" tus cambios en memoria
        evoLabel: getV('evo_label') || "Evoluciona de",
        evoName: getV('evo_name'),
        evoX: getN('evo_x', 48),
        evoY: getN('evo_y', 42),
        evoZoom: getN('evo_zoom', 2),
        evoRot: getN('evo_rot', 0),
        evoFlip: getC('evo_flip')
    };

    for (const [key, id] of Object.entries(CONFIG_FIELDS)) {
        if (!document.getElementById(id) && priorConfig[key] !== undefined) cardData.config[key] = priorConfig[key];
    }
    for (const key of ['nameFont','statsFont','titleFont','bodyFont','flavorFont','symbolFont','evolucionaFont','numFont','stageFont','hpLabelSize','hpLabelX','hpLabelY','hpKerning','scaleTitle','scaleHP']) {
        if (priorConfig[key] !== undefined) cardData.config[key] = priorConfig[key];
    }
    // Datos Principales
    for (const [key, prefix] of Object.entries({ namePos: 'name', hpPos: 'hp', stagePos: 'stage', flavorPos: 'flavor', weakPos: 'weak', resPos: 'res', retreatPos: 'retreat' })) {
        for (const axis of ['x', 'y']) if (!document.getElementById(`${prefix}_${axis}`) && priorConfig[key]?.[axis] !== undefined) cardData.config[key][axis] = priorConfig[key][axis];
    }
    cardData.mainName = getV('pokeName');
    cardData.namePrefix = getV('pokeNamePrefix'); // Nuevo
    cardData.nameSuffix = getV('pokeNameSuffix'); // Nuevo
    cardData.mainStats = getV('pokeStats');
    cardData.mainFlavor = getV('pokeFlavor');
    cardData.hpVal = getV('hp_val');
    cardData.stageVal = getV('stage_val');

    // NOTA IMPORTANTE: cardData.tcgType YA NO se lee del DOM aquí para evitar conflictos con los botones.
    // Se actualiza únicamente vía setType().

    cardData.weakVal = getV('weak_val');
    cardData.resVal = getV('res_val');
    cardData.abilityName = getV('ability_name');
    cardData.abilityDesc = getV('ability_desc');

    cardData.attacks.forEach((atq, i) => {
        atq.name = getV(`atq${i}_name`);
        atq.desc = getV(`atq${i}_desc`);
        atq.dmg = getV(`atq${i}_dmg`);
        atq.mod = getV(`atq${i}_mod`);
        Object.keys(energyFiles).forEach(t => {
            const span = document.getElementById(`c-${i}-${t}`);
            if(span) span.innerText = atq.cost.filter(x => x === t).length;
        });
    });

    const lightModeCheck = document.getElementById('light_text_mode');
    const boostContainer = document.getElementById('ability_boost_container');
    const boostCheck = document.getElementById('ability_stroke_boost');

    if (lightModeCheck && boostContainer && boostCheck) {
        if (lightModeCheck.checked) {
            boostContainer.style.opacity = "1";
            boostContainer.style.pointerEvents = "auto";
        } else {
            boostContainer.style.opacity = "0.5";
            boostContainer.style.pointerEvents = "none";
            boostCheck.checked = false; // Desmarcar si se apaga el modo dark
            cardData.config.abilityStrokeBoost = false; // Actualizar data interna
        }
    }



    saveState();
    schedulePreview();
}


function toggleSymbolConfig(el, key) {
    if (key === 'global') {
        customIconsConfig.enabled = el.checked;
        const sub = document.getElementById('symbol_suboptions');
        if (sub) sub.style.display = el.checked ? 'flex' : 'none';
    } else {
        if (customIconsConfig.icons[key]) {
            customIconsConfig.icons[key].enabled = el.checked;
        }
    }
    updateCardData(); // Redibujar
}
// =========================================================
// VARIABLES GLOBALES DE CACHÉ (Para optimización extrema)
// =========================================================
function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight) + 'px';
}

function updateSliderLabels() {
    const sliders = [
        'body_y_center', 'scale_body', 'body_size', 'body_leading', 'body_kerning',
        'art_zoom', 'art_x', 'art_y', 'art_rotation'
    ];
    sliders.forEach(id => {
        const input = document.getElementById(id);
        const label = document.getElementById('val_' + id);
        if (input && label) label.innerText = input.value;
    });
}

function applyBodyPreset(mode) {
    let values = {};
    if (mode === 'condensed') {
        values = {
            'body_y_center': 803, 'scale_body': 0.97, 'body_size': 26, 'body_leading': 27, 'body_kerning': -0.75
        };
    } else if (mode === 'standard') {
        values = {
            'body_y_center': 818, 'scale_body': 0.97, 'body_size': 28, 'body_leading': 29, 'body_kerning': -0.5
        };
    }
    Object.keys(values).forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = values[id];
    });
    updateCardData();
}


// =========================================================
// NUEVAS UTILIDADES DE INTERFAZ (v5.5 UI Update)
// =========================================================

// 1. GESTIÓN DE PEGAR IMAGEN (CTRL+V)
document.addEventListener('paste', (event) => {
    for (const item of event.clipboardData?.items || []) {
        if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
        const panel = document.getElementById('evo_controls_panel');
        const target = panel?.contains(document.activeElement) ? loadLocalEvo : loadLocalArt;
        target({ files: [item.getAsFile()] });
    }
});

// 2. CONTROL DE BOTONES DE ETAPA (STAGE)
function setStageVal(val, btnElement) {
    // Actualizar valor oculto
    const input = document.getElementById('stage_val');
    if(input) {
        input.value = val;
        updateCardData(); // Esto disparará tu lógica de mostrar/ocultar evo
    }

    // Actualizar visualmente los botones
    const parent = btnElement.parentElement;
    Array.from(parent.children).forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
}

// 3. ACTUALIZAR LOS BOTONES DE ETAPA AL CARGAR/RESTAURAR
// (Añade esta pequeña lógica dentro de tu función restoreFormValues al final)
/* Copia y pega este bloque DENTRO de restoreFormValues(), justo antes del updateCardData() final:
*/
/*
    // Restaurar visualmente los botones de Etapa
    const stageVal = cardData.stageVal || 'Basico';
    const stageBtns = document.querySelectorAll('.btn-group-stage button');
    stageBtns.forEach(btn => {
        if(btn.innerText.includes(stageVal) || (stageVal === 'Basico' && btn.innerText === 'Básico')) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
*/


// Función para pintar iconos en los cuadraditos T1 y T2
function updateTypeVisuals(apiType1, apiType2) {
    const box1 = document.getElementById('icon_t1');
    const box2 = document.getElementById('icon_t2');

    // Función auxiliar para obtener el archivo correcto
    const getIconFile = (apiType) => {
        if (!apiType) return null;

        // 1. Traducir API (inglés) -> Tu Clave (Español)
        // Usamos tu objeto 'typeTrans' que ya existe en main.js
        const spanishType = typeTrans[apiType.toLowerCase()];

        if (!spanishType) return null;

        // 2. Obtener nombre de archivo exacto
        // Usamos tu objeto 'energyFiles'
        const filename = energyFiles[spanishType];

        return filename;
    };

    const render = (box, filename) => {
        if (filename) {
            box.innerHTML = `<img src="${CardImages.assetUrl(`energias/${filename}`)}" alt="Type">`;
        } else {
            box.innerHTML = '<span style="color:#444; font-size:10px;">-</span>';
        }
    };

    render(box1, getIconFile(apiType1));
    render(box2, getIconFile(apiType2));
}

function syncFromRange(id) {
    const range = document.getElementById(id);
    const number = document.getElementById('num_' + id);
    if(range && number) {
        number.value = range.value;
        updateCardData(); // Redibujar carta
    }
}

// 2. Cuando escribes el NÚMERO -> Actualiza la barra
function syncFromNum(id) {
    const range = document.getElementById(id);
    const number = document.getElementById('num_' + id);
    if(range && number) {
        range.value = number.value;
        updateCardData(); // Redibujar carta
    }
}

// 3. Cuando pulsas "R" -> Resetea al valor por defecto
function resetSlider(id) {
    const range = document.getElementById(id);
    const number = document.getElementById('num_' + id);

    // Obtenemos el valor por defecto del atributo 'data-default'
    const defVal = range.getAttribute('data-default');

    if(range && number && defVal !== null) {
        range.value = defVal;
        number.value = defVal;
        updateCardData(); // Redibujar carta
    }
}
