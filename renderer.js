// The renderer owns its immutable snapshot, canvas and decoded custom icons.
async function renderCardSnapshot(input, canvas, options = {}) {
    const symbolMap = {
    '[N]': '0', '[G]': '1', '[R]': '2', '[W]': '3', '[L]': '4',
    '[P]': '5', '[F]': '6', '[C]': '7', '[D]': '8', '[M]': '9'
};
    const cardData = structuredClone(input);
    const fullResolution = options.fullResolution || options.multiplier > 1;
    const customIconsConfig = structuredClone(cardData.config.symbols || { enabled: false, icons: {} });
    const customImages = {};
    const evoImageGlobal = await CardImages.evolution(cardData, cardData.stageVal !== 'Basico', fullResolution);
    const evoCacheKey = 0;
    const staticCacheCanvas = document.createElement('canvas');
    const staticCacheCtx = staticCacheCanvas.getContext('2d');
    let lastCacheKey = ''; let sharedTempCanvas = null; const userUploadedArt = null;
    await CardImages.fonts();
    if (customIconsConfig.enabled) for (const def of Object.values(customIconsConfig.icons)) {
        if (def.enabled) customImages[`customicons/${def.file}`] = await CardImages.load(`customicons/${def.file}`, { required: true, fullResolution });
    }
    try { await drawCard(); return canvas; }
    finally { staticCacheCanvas.width = staticCacheCanvas.height = 0; if (sharedTempCanvas) sharedTempCanvas.width = sharedTempCanvas.height = 0; }
async function drawCard() {
    await document.fonts.ready;

    // 1. GENERAR TICKET ÚNICO PARA ESTE RENDER
    const thisRenderId = 1; const renderRequestCounter = 1;

    // SI HAY CUSTOM CANVAS (EXPORTACIÓN MASIVA), USARLO. SI NO, USAR EL DEL DOM.

    const ctx = canvas.getContext('2d');
    const c = cardData.config;

    // MODIFICACIÓN: Si es exportación masiva (customCanvas), forzamos resolución x4 (Ultra)
    // Si es normal, leemos del input del usuario.
    const multiplier = options.multiplier || 1;

    const W = 745 * multiplier;
    const H = 1040 * multiplier;
    const logicalW = 747; const logicalH = 1040;
    const scaleX = W / logicalW; const scaleY = H / logicalH;

    // Ajustar tamaño del canvas si cambió (borra el contenido automáticamente)
    if(canvas.width !== W) {
        canvas.width = W;
        canvas.height = H;
        lastCacheKey = ""; // Forzar redibujado de caché estática
    }

    // --- VARIABLES DE DATOS ---
    const type = cardData.tcgType || "Planta";
    const stage = cardData.stageVal || "Basico";
    const artParams = `${c.artX}_${c.artY}_${c.artZoom}_${c.artRot}`;
    const hasCustomArt = !!(userUploadedArt || cardData.customArtData);

    // Variables Pre-Evo
    const evoX = c.evoX ?? 48;
    const evoY = c.evoY ?? 42;
    const evoZoom = c.evoZoom ?? 1;
    const evoRot = c.evoRot ?? 0;
    const evoFlip = c.evoFlip;
    const evoParams = `${evoX}_${evoY}_${evoZoom}_${evoRot}_${evoFlip}_${evoCacheKey}`;

    // --- HELPER: CARGA DE IMÁGENES CON CACHÉ (OPTIMIZACIÓN CLAVE) ---
    // Si la imagen ya se pidió antes, la devuelve al instante sin parpadeos.
    const loadImgCached = (src) => CardImages.load(src, { required: true, fullResolution });

    // Clave para saber si debemos redibujar el fondo estático
    const currentCacheKey = `${type}_${stage}_${cardData.pokemonImgUrl}_${multiplier}_${artParams}_${hasCustomArt}_${c.artFlip}_${evoParams}`;

    // =========================================================
    // 1. GENERACIÓN DE CAPAS ESTÁTICAS (CACHE)
    // =========================================================
    if (currentCacheKey !== lastCacheKey) {

        // 1. CARGAR IMÁGENES BASE
        const borderImg = await loadImgCached(cardData.backgroundData || CardCore.backgroundPath(type, stage));
        // Cargar Máscara (solo si no es básico)
        let maskImg = null;
        if (stage !== "Basico") maskImg = await loadImgCached('mascaras/prevo_mask.png');

        // --- CHECKPOINT 1 ---
        if (thisRenderId !== renderRequestCounter) return;

        // 2. CARGAR ARTE PRINCIPAL
        const imgToDraw = await CardImages.load(cardData.customArtData || cardData.pokemonImgUrl, { required: true, fullResolution });
        // --- CHECKPOINT 2 ---
        if (thisRenderId !== renderRequestCounter) return;

        // --- DIBUJO EN CANVAS ESTÁTICO ---
        staticCacheCanvas.width = W;
        staticCacheCanvas.height = H;
        staticCacheCtx.clearRect(0, 0, W, H);

        // 3.1 ARTE PRINCIPAL (Recortado)
        staticCacheCtx.save();
        staticCacheCtx.setTransform(1, 0, 0, 1, 0, 0);
        staticCacheCtx.scale(scaleX, scaleY);
        staticCacheCtx.beginPath();
        staticCacheCtx.rect(20, 20, 715, 580);
        staticCacheCtx.clip();
        staticCacheCtx.translate(c.artX, c.artY);
        staticCacheCtx.rotate(c.artRot * Math.PI / 180);
        const flipX = c.artFlip ? -1 : 1;
        staticCacheCtx.scale(c.artZoom * flipX, c.artZoom);
        if (imgToDraw && imgToDraw.width > 0) staticCacheCtx.drawImage(imgToDraw, -imgToDraw.width/2, -imgToDraw.height/2);
        staticCacheCtx.restore();

        // 3.2 MARCO / BORDE
        if (borderImg) {
            staticCacheCtx.save();
            staticCacheCtx.scale(scaleX, scaleY);
            staticCacheCtx.drawImage(borderImg, 0, 0, 747, 1040);
            staticCacheCtx.restore();
        }

        // 3.3 PRE-EVOLUCIÓN
        if (stage !== "Basico" && evoImageGlobal) {

            // Inicializar canvas temporal compartido si no existe (OPTIMIZACIÓN MEMORIA)
            if (!sharedTempCanvas) sharedTempCanvas = document.createElement('canvas');
            sharedTempCanvas.width = W;
            sharedTempCanvas.height = H;
            const tCtx = sharedTempCanvas.getContext('2d');
            tCtx.clearRect(0, 0, W, H);

            if (maskImg) {
                // MODO MÁSCARA
                tCtx.save();
                tCtx.scale(scaleX, scaleY);
                tCtx.drawImage(maskImg, 0, 0, 747, 1040);
                tCtx.restore();

                tCtx.globalCompositeOperation = 'source-in';

                tCtx.save();
                tCtx.scale(scaleX, scaleY);
                tCtx.translate(evoX, evoY);
                tCtx.rotate(evoRot * Math.PI / 180);
                tCtx.scale(evoFlip ? -evoZoom : evoZoom, evoZoom);
                tCtx.drawImage(evoImageGlobal, -30, -30, 60, 60);
                tCtx.restore();

                // Pintar resultado sobre el estático
                staticCacheCtx.save();
                staticCacheCtx.setTransform(1, 0, 0, 1, 0, 0);
                staticCacheCtx.drawImage(sharedTempCanvas, 0, 0);
                staticCacheCtx.restore();

            } else {
                // FALLBACK SIN MÁSCARA
                staticCacheCtx.save();
                staticCacheCtx.setTransform(1, 0, 0, 1, 0, 0);
                staticCacheCtx.scale(scaleX, scaleY);
                staticCacheCtx.translate(evoX, evoY);
                staticCacheCtx.rotate(evoRot * Math.PI / 180);
                staticCacheCtx.scale(evoFlip ? -evoZoom : evoZoom, evoZoom);
                staticCacheCtx.drawImage(evoImageGlobal, -30, -30, 60, 60);
                staticCacheCtx.restore();
            }
        }

        lastCacheKey = currentCacheKey;
    }

    // --- CHECKPOINT 3 ---
    if (thisRenderId !== renderRequestCounter) return;

    // =========================================================
    // 2. PINTADO FINAL (TEXTOS Y ELEMENTOS DINÁMICOS)
    // =========================================================
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticCacheCanvas, 0, 0); // Pintar el fondo caché
    ctx.scale(scaleX, scaleY); // Escalar sistema de coordenadas para textos

    const textColor = c.isLightText ? "#FFFFFF" : "#000000";

    // --- TAG DE ETAPA (DIBUJO DINÁMICO) ---
    const STAGE_LIMIT_WIDTH = 87;
    const STAGE_SKEW_X = -0.00;
    const STAGE_WIDTH_STRETCH = 1.2;
    const STAGE_COLOR = "#6b6b6b";
    const STAGE_OUTLINE = "#FFFFFF";
    const STAGE_OUTLINE_WIDTH = 3;
    const stagePosX = 70; const stagePosY = 46;

    ctx.save();
    ctx.translate(stagePosX, stagePosY);

    let textParts = [];
    if (stage === "Basico") {
        textParts.push({ text: "BÁSICO", size: 19 });
    } else {
        const num = stage.replace("Fase", "").replace("Stage", "").trim();
        textParts.push({ text: "FASE", size: 19 });
        textParts.push({ text: num, size: 24 });
    }

    ctx.font = `28px StageFont`;
    let totalStageWidth = 0; const gap = 5;
    textParts.forEach((part, i) => {
        ctx.font = `${part.size}px StageFont`;
        totalStageWidth += ctx.measureText(part.text).width;
        if (i < textParts.length - 1) totalStageWidth += gap;
    });

    let finalScaleX = STAGE_WIDTH_STRETCH;
    if ((totalStageWidth * STAGE_WIDTH_STRETCH) > STAGE_LIMIT_WIDTH) {
        finalScaleX = STAGE_LIMIT_WIDTH / totalStageWidth;
    }

    ctx.transform(finalScaleX, 0, STAGE_SKEW_X, 1, 0, 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.lineWidth = STAGE_OUTLINE_WIDTH; ctx.strokeStyle = STAGE_OUTLINE; ctx.fillStyle = STAGE_COLOR;

    let cursorX = -(totalStageWidth / 2);
    textParts.forEach((part) => {
        ctx.font = `${part.size}px StageFont`;
        const partWidth = ctx.measureText(part.text).width;
        const xPos = cursorX + (partWidth / 2);
        ctx.strokeText(part.text, xPos, 0);
        ctx.fillText(part.text, xPos, 0);
        cursorX += partWidth + gap;
    });
    ctx.restore();

    // --- NOMBRE DEL POKEMON ---
    ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = textColor;
    const LIMIT_NAME_BOX = 350;
    const mainSize = 49; const subSize = 33;

    const wPre = measureKernedWidth(ctx, cardData.namePrefix, c.nameFont, subSize, 0, false);
    const wMain = measureKernedWidth(ctx, cardData.mainName, c.nameFont, mainSize, 0, false);
    const wSuf = measureKernedWidth(ctx, cardData.nameSuffix, c.nameFont, subSize, 0, false);

    const spaceBetween = 8;
    let totalNameW = wMain;
    if(cardData.namePrefix) totalNameW += wPre + spaceBetween;
    if(cardData.nameSuffix) totalNameW += wSuf + spaceBetween;

    let nameScaleX = 1;
    if (totalNameW > LIMIT_NAME_BOX) nameScaleX = LIMIT_NAME_BOX / totalNameW;

    ctx.save();
    ctx.scale(nameScaleX, 1);
    let currentNX = c.namePos.x / nameScaleX;

    if(cardData.namePrefix) {
        ctx.font = `${subSize}px ${c.nameFont}`;
        drawKernedText(ctx, cardData.namePrefix, currentNX, c.namePos.y + 3, 0, false);
        currentNX += wPre + spaceBetween;
    }
    ctx.font = `${mainSize}px ${c.nameFont}`;
    drawKernedText(ctx, cardData.mainName, currentNX, c.namePos.y + 3, 0, false);
    currentNX += wMain + spaceBetween;

    if(cardData.nameSuffix) {
        ctx.font = `${subSize}px ${c.nameFont}`;
        drawKernedText(ctx, cardData.nameSuffix, currentNX, c.namePos.y + 3, 0, false);
    }
    ctx.restore(); ctx.restore();

    // --- HP ---
    ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = textColor; ctx.translate(c.hpPos.x, c.hpPos.y);
    const hpText = String(cardData.hpVal);
    const baseKerning = c.hpKerning || 0; const opticalOffset = -6;
    ctx.font = `bold ${c.hpSize}px ${c.numFont}`;

    let totalHpWidth = 0;
    for(let i=0; i < hpText.length; i++) {
        let cw = ctx.measureText(hpText[i]).width; let ck = baseKerning;
        if (hpText.length === 3 && hpText.startsWith('1') && i === 0) ck += opticalOffset;
        if (i < hpText.length - 1) totalHpWidth += cw + ck; else totalHpWidth += cw;
    }

    ctx.save(); ctx.scale(c.scaleHP, 1);
    let currentHpX = -totalHpWidth;
    for(let i=0; i < hpText.length; i++) {
        ctx.fillText(hpText[i], currentHpX, 0);
        let w = ctx.measureText(hpText[i]).width; let k = baseKerning;
        if (hpText.length === 3 && hpText.startsWith('1') && i === 0) k += opticalOffset;
        currentHpX += w + k;
    }
    ctx.restore();

    // Etiqueta PS
    const leftEdgeOfNumber = (-totalHpWidth * c.scaleHP);
    let fixOneOffset = (hpText.startsWith('1')) ? 6 : 0; const psExtraKerning = 1.5;
    ctx.font = `bold ${c.hpLabelSize}px ${c.numFont}`;
    let currentLabelX = leftEdgeOfNumber + c.hpLabelX + fixOneOffset;
    ctx.save(); ctx.lineWidth = 1.0; ctx.strokeStyle = ctx.fillStyle;
    const labelText = c.hpLabelText || "PS";
    for (let char of labelText) {
        ctx.strokeText(char, currentLabelX, c.hpLabelY); ctx.fillText(char, currentLabelX, c.hpLabelY);
        currentLabelX += ctx.measureText(char).width + psExtraKerning;
    }
    ctx.restore(); ctx.restore();

// --- STATS DE POKEDEX (CORREGIDO Y CENTRADO) ---
    ctx.save();
    const statsText = cardData.mainStats || "";
    const statsFont = c.statsFont || 'PokeStats';
    const statsSize = 16;
    ctx.fillStyle = "#000000";

    // 1. Parsear el texto completo (separa palabras y detecta símbolos)
    // Asegúrate de tener parseRichText definido
    const richWords = (typeof parseRichText === 'function') ? parseRichText(statsText) : [];

    if (richWords.length === 0) {
        // Fallback simple si no hay texto o falla el parser
        ctx.font = `${statsSize}px ${statsFont}`;
        ctx.textAlign = "center";
        ctx.fillText(statsText, 373, 513);
    } else {
        // 2. Medir el ancho TOTAL (Palabras + Espacios)
        ctx.font = `${statsSize}px ${statsFont}`; // Configurar fuente base para medir el espacio
        const spaceWidth = ctx.measureText(" ").width; // Ancho de un espacio en blanco
        let totalStatsW = 0;

        richWords.forEach((word, i) => {
            // Medir cada palabra usando tu función avanzada
            totalStatsW += measureRichWord(ctx, word, statsFont, statsSize, c.symbolFont, 0, 1);

            // Sumar el ancho del espacio si no es la última palabra
            if (i < richWords.length - 1) totalStatsW += spaceWidth;
        });

        // 3. Calcular coordenada X inicial para CENTRAR en 373
        // (Centro deseado) - (Mitad del ancho total)
        let currentStatsX = 373 - (totalStatsW / 2);
        const statsY = 513;

        // 4. Dibujar palabra por palabra
        richWords.forEach((word, i) => {
            // Dibujar la palabra (y actualiza currentStatsX al final de ella)
            currentStatsX = drawRichWord(ctx, word, currentStatsX, statsY, statsFont, statsSize, c.symbolFont, 0, false, 0);

            // Añadir espacio visualmente (avanzando el cursor)
            if (i < richWords.length - 1) {
                currentStatsX += spaceWidth;
            }
        });
    }
    ctx.restore();

// --- EVOLUCIONA DE... (CON SOPORTE PARA SÍMBOLOS ♂/♀) ---
    if (stage !== "Basico") {
        const evoLabel = c.evoLabel || "Evoluciona de";
        let evoName = c.evoName || "";

        // 1. Forzar mayúscula inicial
        if (evoName && evoName.length > 0) {
            evoName = evoName.charAt(0).toUpperCase() + evoName.slice(1);
        }

        const fontName = c.evolucionaFont || 'BodyText';
        ctx.save();
        ctx.textAlign = "left";
        ctx.fillStyle = "#000000";

        // Texto completo a dibujar
        const fullText = evoName ? `${evoLabel} ${evoName}` : evoLabel;

        // 2. FUNCIÓN DE DIBUJO MIXTO (Texto + Símbolos)
        // Separa por (m), (f), ♂, ♀
        const parts = fullText.split(/(\(m\)|\(f\)|♂|♀)/i);
        let curX = 143; // Posición X inicial
        const curY = 113; // Posición Y inicial

        parts.forEach(part => {
            if (!part) return;

            if (part.match(/^(\(m\)|♂)$/i)) {
                // ES MACHO -> Fuente de Símbolos
                ctx.font = `18px 'SegoeSymbols'`;
                ctx.fillText("♂", curX, curY);
                curX += ctx.measureText("♂").width;
            }
            else if (part.match(/^(\(f\)|♀)$/i)) {
                // ES HEMBRA -> Fuente de Símbolos
                ctx.font = `18px 'SegoeSymbols'`;
                ctx.fillText("♀", curX, curY);
                curX += ctx.measureText("♀").width;
            }
            else {
                // TEXTO NORMAL -> Fuente Itálica seleccionada
                ctx.font = `italic 18px '${fontName}'`;
                ctx.fillText(part, curX, curY);
                curX += ctx.measureText(part).width;
            }
        });

        ctx.restore();
    }

    // --- CUERPO (HABILIDAD Y ATAQUES) ---
    const bodyW = c.bodyW || 635;
    let totalHeight = 0;
    const measureBodyText = (txt) => measureWrapHeight(ctx, txt, bodyW, c.bodyLeading, c.bodyKerning, c.bodyFont, c.bodySize, c.isThin, c.scaleBody);

    if(cardData.abilityName) totalHeight += 28 + c.titleDescSpacing + measureBodyText(cardData.abilityDesc) + c.bodyLeading;
    cardData.attacks.forEach(atq => { if(atq.name) totalHeight += Math.max(c.iconSize, 32) + 5 + c.titleDescSpacing + measureBodyText(atq.desc) + c.bodyLeading; });

    let curY = c.bodyYCenter - (totalHeight / 2) + 20;

    // 1. HABILIDAD
    if(cardData.abilityName) {
        const abilityIcon = await loadImgCached("tags/Habilidad_FINAL.png");
        if (abilityIcon) ctx.drawImage(abilityIcon, c.bodyX - 7, curY - 35, 177, 40);

        ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = "rgb(153, 0, 0)"; ctx.font = `40px ${c.titleFont}`;

        const LIMIT_ABILITY_NAME = 458;
        const abNameW = measureKernedWidth(ctx, cardData.abilityName, c.titleFont, 40, c.bodyKerning, c.isThin);
        let abScale = c.scaleTitle;
        if (abNameW * abScale > LIMIT_ABILITY_NAME) abScale = LIMIT_ABILITY_NAME / abNameW;

        if (c.isLightText && c.abilityStrokeBoost) {
            ctx.forcedStrokeStyle = `rgba(255, 255, 255, 0.8)`;
            drawKernedText(ctx, cardData.abilityName, c.bodyX + 177, curY, c.bodyKerning, c.isThin, 3.5, abScale);
            delete ctx.forcedStrokeStyle;
        } else {
            drawKernedText(ctx, cardData.abilityName, c.bodyX + 177, curY, c.bodyKerning, c.isThin, 0, abScale);
        }
        ctx.restore(); curY += c.titleDescSpacing;

        ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = textColor;
        curY = wrapTextJustified(ctx, cardData.abilityDesc, c.bodyX, curY - 3, bodyW, c.bodyLeading, c.bodyKerning, c.bodyFont, c.bodySize, c.isThin, c.textStroke, c.scaleBody);
        ctx.restore(); curY += c.bodyLeading - 5;
    }

    // 2. ATAQUES
    const LIMIT_ATTACK_NAME = 390;
    for (const atq of cardData.attacks) {
        if(!atq.name) continue;

        // Iconos de energía del coste (CACHÉ)
        for (let ei = 0; ei < atq.cost.length; ei++) {
             const t = atq.cost[ei];
             const eImg = await loadImgCached(`energias/${energyFiles[t]}`);
             if (eImg) {
                const iconY = curY - c.iconSize;
                ctx.drawImage(eImg, c.bodyX + (ei * c.iconSpacing), iconY - 1.5, c.iconSize, c.iconSize);
             }
        }

        ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = textColor; ctx.font = `40px ${c.titleFont}`;
        const offsetName = (Math.max(atq.cost.length, 4) * c.iconSpacing) + 6;

        const atqNameW = measureKernedWidth(ctx, atq.name, c.titleFont, 40, c.bodyKerning, c.isThin);
        let atqScale = c.scaleTitle;
        if (atqNameW * atqScale > LIMIT_ATTACK_NAME) atqScale = LIMIT_ATTACK_NAME / atqNameW;

        drawKernedText(ctx, atq.name, c.bodyX + offsetName - 4, curY - 5, c.bodyKerning, c.isThin, c.textStroke, atqScale);
        ctx.restore();

        if (atq.dmg) {
            ctx.save(); ctx.textAlign = "right"; ctx.fillStyle = textColor; ctx.font = `bold 36px ${c.numFont}`;
            ctx.fillText(String(atq.dmg), 694, curY - 5);
            if (atq.mod) {
                ctx.textAlign = "left";
                let ms = 28, my = -8.5, mx = 2;
                if (atq.mod === "✖") { ms=18; my=-11.5; } else if (atq.mod === "+") { ms=26; my=-11.5; mx=1.5; } else if (atq.mod === "−") { ms=24; my=-11.5; }
                ctx.font = `bold ${ms}px ${c.numFont}`; ctx.fillText(atq.mod, 694 + mx, curY + my);
            }
            ctx.restore();
        }
        curY += c.titleDescSpacing;
        ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = textColor;
        curY = wrapTextJustified(ctx, atq.desc, c.bodyX, curY -10, bodyW, c.bodyLeading, c.bodyKerning, c.bodyFont, c.bodySize, c.isThin, c.textStroke, c.scaleBody);
        ctx.restore(); curY += c.bodyLeading - 5;
    }

    // --- ICONOS DE TIPO Y PIE DE PÁGINA (CON CACHÉ) ---
    if (cardData.tcgType && energyFiles[cardData.tcgType]) {
        const typeIcon = await loadImgCached(`energias/${energyFiles[cardData.tcgType]}`);
        if (typeIcon) ctx.drawImage(typeIcon, 656, 36, 56, 56);
    }

    // Etiquetas Debilidad/Resistencia
    const labelsY = 915; const labelsKerning = 0.1;
    const weakLX = 43; const resLX = 228; const retLX = 465;
    ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = textColor; ctx.font = `bold 18px ${c.bodyFont}`;
    drawSimpleKerned(ctx, "Debilidad", weakLX, labelsY, labelsKerning);
    drawSimpleKerned(ctx, "Resistencia", resLX, labelsY, labelsKerning);
    drawSimpleKerned(ctx, "Retirada", retLX, labelsY, labelsKerning);
    ctx.restore();

    // Valores Debilidad
    const smallIcon = 28; const weakSymSize = 14; const weakSymYOffset = -1.5; const weakGap = 5;
    if(cardData.weakType && cardData.weakType !== "Ninguna") {
        const wImg = await loadImgCached(`energias/${energyFiles[cardData.weakType]}`);
        if(wImg) ctx.drawImage(wImg, c.weakPos.x, c.weakPos.y - 1, smallIcon, smallIcon);

        let curX = c.weakPos.x + smallIcon + weakGap;
        ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = textColor; ctx.font = `bold ${weakSymSize}px ${c.numFont}`;
        ctx.fillText(cardData.weakVal.trim().startsWith("+") ? "+" : "✖", curX, c.weakPos.y + (smallIcon * 0.75) + weakSymYOffset);
        curX += ctx.measureText("✖").width + 2;
        const cleanWeakVal = cardData.weakVal.replace(/[x✖+]/gi, '');
        ctx.font = `bold 28px ${c.numFont}`;
        ctx.fillText(cleanWeakVal, curX, c.weakPos.y + 3 + (smallIcon * 0.75));
        ctx.restore();
    }

    // Valores Resistencia
    const resSymSize = 20; const resSymYOffset = -2; const resGap = 5;
    if(cardData.resType && cardData.resType !== "Ninguna") {
        const rImg = await loadImgCached(`energias/${energyFiles[cardData.resType]}`);
        if(rImg) ctx.drawImage(rImg, c.resPos.x, c.resPos.y - 1, smallIcon, smallIcon);

        let curX = c.resPos.x + smallIcon + resGap;
        ctx.save(); ctx.textAlign = "left"; ctx.fillStyle = textColor; ctx.font = `bold ${resSymSize}px ${c.numFont}`;
        ctx.fillText("−", curX, c.resPos.y + (smallIcon * 0.75) + resSymYOffset);
        curX += ctx.measureText("−").width + 1;
        const cleanResVal = cardData.resVal.replace(/-|−/gi, '');
        ctx.font = `bold 28px ${c.numFont}`;
        ctx.fillText(cleanResVal, curX, c.resPos.y + 3 + (smallIcon * 0.75));
        ctx.restore();
    }

    // Coste Retirada
    const retreatSpacing = 32;
    for(let i=0; i < cardData.retreatCost; i++) {
        const retImg = await loadImgCached("energias/colorless.png");
        if(retImg) ctx.drawImage(retImg, c.retreatPos.x + (i * retreatSpacing), c.retreatPos.y - 1, smallIcon, smallIcon);
    }

    // Flavor Text
    ctx.save(); ctx.textAlign = "right"; ctx.fillStyle = textColor;
    ctx.font = `${c.flavorS || 15.5}px ${c.flavorFont}`;
    wrapFlavorBalanced(ctx, cardData.mainFlavor, c.flavorPos.x + c.flavorW, c.flavorPos.y, c.flavorW, c.flavorLeading);
    ctx.restore();

    // Footer (Iconos Set, Regulación, etc.)
    let anchorX = c.regX; let anchorY = c.regY;
    if (c.regMarkImg) {
        const regImg = await loadImgCached(c.regMarkImg);
        if (regImg && regImg.width > 0) {
            ctx.drawImage(regImg, c.regX, c.regY, 14, 23.6);
        }
    }

    let setIconDrawX = anchorX + c.setIconX; let setIconDrawY = anchorY + c.setIconY;
    if (c.setIconImg) {
        let iconSrc = c.setIconImg; if (c.isLightText && !iconSrc.includes('_Inverted')) iconSrc = iconSrc.replace('.png', '_Inverted.png');
        const setImg = await loadImgCached(iconSrc);
        if (setImg && setImg.width > 0) ctx.drawImage(setImg, setIconDrawX, setIconDrawY, 44.8, 23.6);
    }

    // Texto Set (SVI)
    if (c.setIconImg && c.setTextVal) {
        ctx.save(); ctx.fillStyle = c.isLightText ? "#000000" : "#FFFFFF"; ctx.textAlign = "left";
        const txtY = setIconDrawY + c.setTextY + c.setTextSizeBig;
        const chars = c.setTextVal.split(''); let totalWidth = 0;
        chars.forEach(char => {
            const isUpper = (char === char.toUpperCase()) && (char !== char.toLowerCase());
            ctx.font = `bold ${isUpper ? c.setTextSizeBig : c.setTextSizeSmall}px ${c.numFont}`;
            totalWidth += ctx.measureText(char.toUpperCase()).width + 1;
        });
        let scaleText = 1; if (totalWidth > c.setTextWidth) scaleText = c.setTextWidth / totalWidth;
        let cursorX = setIconDrawX + c.setTextX;
        chars.forEach(char => {
            const isUpper = (char === char.toUpperCase()) && (char !== char.toLowerCase());
            ctx.font = `bold ${isUpper ? c.setTextSizeBig : c.setTextSizeSmall}px ${c.numFont}`;
            ctx.save(); ctx.translate(cursorX, txtY); ctx.scale(scaleText, 1);
            ctx.fillText(char.toUpperCase(), 0, 0); ctx.restore();
            cursorX += (ctx.measureText(char.toUpperCase()).width + 1) * scaleText;
        });
        ctx.restore();
    }

    // Números Set
    if (c.setNumCurr && c.setNumTotal) {
        ctx.save(); ctx.fillStyle = c.isLightText ? "#FFFFFF" : "#000000";
        ctx.font = `italic bold 14px ${c.numFont}`; ctx.textAlign = "left";
        const numX = setIconDrawX + c.setNumX; const numY = setIconDrawY + c.setNumY + 14;
        const textNum = `${c.setNumCurr}/${c.setNumTotal}`;
        if (c.isLightText) { ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = .2; ctx.lineJoin = "round"; ctx.strokeText(textNum, numX, numY); }
        ctx.fillText(textNum, numX, numY); ctx.restore();
    }

    // Rareza
    if (c.rarityIcon) {
        ctx.save(); ctx.fillStyle = c.isLightText ? "#FFFFFF" : "#000000";
        ctx.font = `20px ${c.symbolFont || 'Arial'}`; ctx.textAlign = "right";
        const rarityX = setIconDrawX + c.setNumX + 77; const rarityY = setIconDrawY + c.setNumY + 14.7;
        if (c.isLightText) { ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 0.2; ctx.strokeText(c.rarityIcon, rarityX, rarityY); }
        ctx.fillText(c.rarityIcon, rarityX, rarityY); ctx.restore();
    }

    // Ilustrador
    if (c.illusName) {
        ctx.save(); ctx.fillStyle = c.isLightText ? "#FFFFFF" : "#000000"; ctx.textAlign = "left";
        ctx.font = `bold 14px ${c.numFont}`;
        ctx.fillText(c.illusName, c.illusX -17, c.illusY); ctx.restore();
    }

    // Copyright
    if (c.authorText) {
        ctx.save(); ctx.fillStyle = "#000000"; ctx.textAlign = "center";
        ctx.font = `11px ${c.numFont}`;
        ctx.fillText(c.authorText, 373.5, c.authorY + 14);
        ctx.restore();
    }
}


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




function parseRichText(text) {
    if (!text) return [];

    let processedText = text;

    // FASE 0: PRE-PROCESAMIENTO DE ICONOS CUSTOM
    if (customIconsConfig.enabled) {
        Object.keys(customIconsConfig.icons).forEach(key => {
            const iconDef = customIconsConfig.icons[key];
            if (!iconDef.enabled) return;
            iconDef.phrases.forEach(phrase => {
                const regex = getRegexForPhrase(phrase);
                processedText = processedText.replace(regex, `{{{${key}}}}`);
            });
        });
    }

    // FASE 1: REGEX STANDARD + TOKEN + NUEVA LINEA
    const regex = /(\n|\+\+|\*\*|__|\[[NGRWLPFCDM]\]|\(m\)|\(f\)|♂|♀|\{\{\{[a-zA-Z0-9_]+\}\}\})/gi;

    const rawParts = processedText.split(regex);
    let words = [];
    let currentWord = [];
    let isBold = false, isItalic = false, isCondensed = false;

    const flush = () => { if(currentWord.length) words.push(currentWord); currentWord = []; };

    rawParts.forEach(part => {
        // Corrección: Permitimos cadenas vacías si son resultado explícito de un split previo
        // pero aquí 'part' viene del regex general. Si es undefined o null salimos.
        // Si es string vacío '' lo dejamos pasar solo si venía del split (pero el regex split suele omitirlos o dejarlos).
        // Para seguridad, filtramos aquí solo si es estrictamente necesario, pero tu lógica original filtraba al inicio.
        if (part === undefined || part === null) return;
        if (part === '' && part !== '\n') return; // Ignoramos vacíos del Regex principal, pero NO los saltos de línea

        // DETECTAR SALTO DE LÍNEA
        if (part === '\n') {
            flush();
            words.push([{ type: 'newline' }]);
            return;
        }

        // A. TOGGLERS
        if (part === '**') { isBold = !isBold; return; }
        if (part === '__') { isItalic = !isItalic; return; }
        if (part === '++') { isCondensed = !isCondensed; return; }

        // B. ICONOS CUSTOM
        if (part.startsWith('{{{') && part.endsWith('}}}')) {
            const key = part.replace(/\{\{\{|\}\}\}/g, '');
            const iconDef = customIconsConfig.icons[key];
            if (iconDef) {
                currentWord.push({
                    text: '', type: 'custom_icon', iconKey: key, b: isBold, i: isItalic, c: isCondensed
                });
                return;
            }
        }

        // C. ENERGÍAS
        if (symbolMap[part.toUpperCase()]) {
            currentWord.push({
                text: symbolMap[part.toUpperCase()], type: 'energy', symbol: true, b: isBold, i: isItalic, c: isCondensed
            });
        }
        // D. GÉNEROS
        else if (part.toLowerCase() === '(m)' || part === '♂') {
            currentWord.push({ text: '♂', type: 'gender', symbol: true, b: isBold, i: isItalic, c: isCondensed });
        }
        else if (part.toLowerCase() === '(f)' || part === '♀') {
            currentWord.push({ text: '♀', type: 'gender', symbol: true, b: isBold, i: isItalic, c: isCondensed });
        }
        // E. TEXTO NORMAL (AQUÍ ESTÁ LA CORRECCIÓN DE ESPACIOS)
        else {
            const subWords = part.split(' ');
            subWords.forEach((sub, idx) => {
                if (idx > 0) flush(); // Cierra la palabra anterior (añade 1 espacio)

                if (sub) {
                    currentWord.push({
                        text: sub, type: 'text', symbol: false, b: isBold, i: isItalic, c: isCondensed
                    });
                } else {
                    // --- CORRECCIÓN CLAVE ---
                    // Si 'sub' está vacío, significa que hay un espacio extra (ej: "A  B").
                    // Insertamos una "palabra vacía". Flush la aceptará porque length será 1.
                    // El renderizador medirá ancho 0, pero le añadirá su espacio circundante.
                    currentWord.push({
                        text: '', type: 'text', symbol: false, b: isBold, i: isItalic, c: isCondensed
                    });
                }
            });
        }
    });
    flush();
    return words;
}

function getStyledFont(baseFont, b, i, c) {
    if (baseFont === 'BodyText' || baseFont.includes('GillSans')) {
        if (c) return 'BodyTextCondensed';
        if (b && i) return 'BodyTextBoldItalic';
        if (b) return 'BodyTextBold';
        if (i) return 'BodyTextItalic';
    }
    return baseFont;
}

function measureRichWord(ctx, word, font, fontSize, symFont, kerning, scaleX, baseStyle="") {
    let width = 0;
    const symbolScale = 0.85;
    ctx.save();

    word.forEach(seg => {
        // --- MEDIR ICONO CUSTOM ---
        if (seg.type === 'custom_icon') {
            const iconDef = customIconsConfig.icons[seg.iconKey];
            if (iconDef) {
                width += iconDef.w;
            }
            return;
        }

        let currentFont = getStyledFont(font, seg.b, seg.i, seg.c);
        let prefix = "";
        if (currentFont === font) {
             if (seg.b) prefix += "bold ";
             if (seg.i) prefix += "italic ";
        }

        if (seg.type === 'gender') {
            ctx.font = `${prefix}${fontSize}px 'SegoeSymbols'`;
            width += ctx.measureText(seg.text).width;
        }
        else if (seg.symbol || seg.type === 'energy') {
            ctx.font = `${prefix}${fontSize * symbolScale}px ${symFont}`;
            width += ctx.measureText(seg.text).width;
        }
        else {
            ctx.font = `${prefix}${fontSize}px ${currentFont}`;
            width += ctx.measureText(seg.text).width + (seg.text.length * kerning);
        }
    });
    ctx.restore();
    return width;
}

function drawRichWord(ctx, word, x, y, font, fontSize, symFont, kerning, isThin, strokeW, baseStyle="") {
    let cx = x;
    const symbolScale = 0.85;

    word.forEach(seg => {
        // --- DIBUJAR ICONO CUSTOM ---
        if (seg.type === 'custom_icon') {
            const iconDef = customIconsConfig.icons[seg.iconKey];
            if (iconDef) {
                const path = `customicons/${iconDef.file}`;

                // Intentamos usar la caché global si existe, si no, creamos nueva
                // (Para evitar parpadeos, idealmente estas imágenes deberían precargarse)
                const img = customImages[path];

                if (img) {
                    ctx.save();

                    // Lógica de modo oscuro (Texto Claro = Icono Blanco)
                    const isLightText = cardData.config.isLightText;
                    if (isLightText) {
                        // Invierte el color del PNG (Negro -> Blanco)
                        ctx.filter = "invert(1) brightness(2)";
                    }

                    // CALCULO DE Y: Baseline (y) - AlturaImagen + Offset Manual
                    // Esto alinea la parte inferior de la imagen con la línea de texto
                    const drawY = y - iconDef.h + (iconDef.yOffset || 0);

                    ctx.drawImage(img, cx, drawY, iconDef.w, iconDef.h);
                    ctx.restore();
                }
                cx += iconDef.w;
            }
            return;
        }

        let currentFont = getStyledFont(font, seg.b, seg.i, seg.c);
        let prefix = "";
        if (currentFont === font) {
             if (seg.b) prefix += "bold ";
             if (seg.i) prefix += "italic ";
        }

        if (seg.type === 'gender') {
            ctx.font = `${prefix}${fontSize}px 'SegoeSymbols'`;
            if(strokeW > 0) ctx.strokeText(seg.text, cx, y);
            ctx.fillText(seg.text, cx, y);
            cx += ctx.measureText(seg.text).width;
        }
        else if (seg.symbol || seg.type === 'energy') {
            ctx.font = `${prefix}${fontSize * symbolScale}px ${symFont}`;
            ctx.fillText(seg.text, cx, y);
            cx += ctx.measureText(seg.text).width;
        }
        else {
            ctx.font = `${prefix}${fontSize}px ${currentFont}`;
            drawKernedTextHelper(ctx, seg.text, cx, y, kerning, isThin, strokeW);
            cx += ctx.measureText(seg.text).width + (seg.text.length * kerning);
        }
    });
    return cx;
}

function measureWrapHeight(ctx, text, maxWidth, lineHeight, kerning, font, fontSize, isThin, scaleX=1, baseStyle="") {
    if(!text) return 0;
    const words = parseRichText(text);
    const symFont = cardData.config.symbolFont || 'PokeSymbols';
    const effMaxW = maxWidth / scaleX;

    ctx.font = `${fontSize}px ${font}`;
    const spaceW = ctx.measureText(" ").width;
    let lineW = 0;
    let count = 1;

    words.forEach((word, n) => {
        // --- CAMBIO: DETECTAR NUEVA LÍNEA ---
        if (word[0] && word[0].type === 'newline') {
            count++;
            lineW = 0;
            return; // Pasar a la siguiente palabra
        }

        const wW = measureRichWord(ctx, word, font, fontSize, symFont, kerning, scaleX, baseStyle);

        // Lógica estándar de wrap automático
        if (lineW > 0 && lineW + spaceW + wW > effMaxW) {
            count++;
            lineW = wW;
        } else {
            // Si no es la primera palabra de la línea, suma el espacio
            lineW += (lineW > 0 ? spaceW : 0) + wW;
        }
    });
    return count * lineHeight;
}

function wrapTextJustified(ctx, text, x, y, maxWidth, lineHeight, kerning, font, fontSize, isThin, strokeWidth=0, scaleX=1) {
    if(!text) return y;
    const symFont = cardData.config.symbolFont || 'PokeSymbols';
    const effectiveMaxW = maxWidth / scaleX;
    const words = parseRichText(text);

    ctx.save();
    ctx.scale(scaleX, 1);
    let cx = x / scaleX;
    let cy = y;

    ctx.font = `${fontSize}px ${font}`;
    const spaceW = ctx.measureText(" ").width;

    let line = [];
    let lineContentWidth = 0;

    // --- FUNCIÓN INTERNA DE DIBUJADO ---
    // isHardBreak = true: El usuario pulsó ENTER o es la última línea (Alineación Izquierda)
    // isHardBreak = false: Wrap automático por falta de espacio (Justificación Forzada)
    const drawLine = (currentLine, isHardBreak) => {
        if (currentLine.length === 0) return;

        // CRITERIO DE JUSTIFICACIÓN:
        // Solo justificamos si NO es un salto duro (ENTER) y tenemos más de 1 palabra.
        const shouldJustify = !isHardBreak && currentLine.length > 1;

        if (shouldJustify) {
             // --- MODO JUSTIFICADO (Stretch) ---
             let totalWordsPureWidth = 0;
             currentLine.forEach(w => {
                 totalWordsPureWidth += measureRichWord(ctx, w, font, fontSize, symFont, kerning, scaleX, "");
             });

             // Calculamos el espacio que sobra y lo repartimos entre los huecos
             const availableSpace = effectiveMaxW - totalWordsPureWidth;
             const gap = availableSpace / (currentLine.length - 1);

             let lx = cx;
             currentLine.forEach((w, idx) => {
                 let endOfWordX = drawRichWord(ctx, w, lx, cy, font, fontSize, symFont, kerning, isThin, strokeWidth, "");
                 // Si no es la última palabra de la línea, sumamos el hueco calculado
                 if (idx < currentLine.length - 1) lx = endOfWordX + gap;
             });
        }
        else {
             // --- MODO NORMAL (Izquierda) ---
             // Se usa para: Última línea, líneas con ENTER manual, o líneas de 1 sola palabra
             let lx = cx;
             currentLine.forEach((w, idx) => {
                let endOfWordX = drawRichWord(ctx, w, lx, cy, font, fontSize, symFont, kerning, isThin, strokeWidth, "");
                lx = endOfWordX + spaceW; // Espacio normal
             });
        }
    };

    // --- BUCLE PRINCIPAL DE PALABRAS ---
    for (let i = 0; i < words.length; i++) {
        const word = words[i];

        // 1. DETECTAR SALTO MANUAL (ENTER)
        // Usamos el token que creamos en parseRichText
        if (word[0] && word[0].type === 'newline') {
            // Dibujamos lo acumulado como "Salto Duro" (Izquierda)
            drawLine(line, true);

            // Movemos cursor abajo y reseteamos
            cy += lineHeight;
            line = [];
            lineContentWidth = 0;
            continue;
        }

        // 2. CALCULAR ANCHO DE PALABRA
        const wW = measureRichWord(ctx, word, font, fontSize, symFont, kerning, scaleX, "");

        // 3. VERIFICAR SI CABE EN LA LÍNEA
        if (line.length > 0 && (lineContentWidth + spaceW + wW) > effectiveMaxW) {
            // ¡NO CABE! -> Wrap Automático -> PASAMOS 'false' PARA FORZAR JUSTIFICACIÓN
            drawLine(line, false);

            cy += lineHeight;
            line = [word];
            lineContentWidth = wW;
        } else {
            // SÍ CABE -> Acumular
            if(line.length > 0) lineContentWidth += spaceW;
            line.push(word);
            lineContentWidth += wW;
        }
    }

    // Dibujar la última línea remanente (Siempre a la izquierda, true)
    drawLine(line, true);

    ctx.restore();
    return cy + lineHeight;
}

function drawKernedText(ctx, text, x, y, kerning, isThin, strokeWidth=0, scaleX=1) {
    if(!text) return;
    const sizeMatch = ctx.font.match(/(\d+(\.\d+)?)px/);
    const fontSize = sizeMatch ? parseFloat(sizeMatch[1]) : 20;

    const isBold = ctx.font.toLowerCase().includes('bold');
    const isItalic = ctx.font.toLowerCase().includes('italic');
    let fontStyle = '';
    if(isBold) fontStyle += 'bold ';
    if(isItalic) fontStyle += 'italic ';

    const parts = ctx.font.split('px ');
    let font = parts.length > 1 ? parts[1] : 'BodyText';
    font = font.replace(/bold|italic/gi, '').trim();

    const symFont = cardData.config.symbolFont || 'PokeSymbols';

    ctx.save();
    if(scaleX !== 1) {
        ctx.scale(scaleX, 1);
        x = x / scaleX;
    }

    const words = parseRichText(text);
    let cx = x;
    const spaceW = ctx.measureText(" ").width;

    words.forEach(w => {
        cx = drawRichWord(ctx, w, cx, y, font, fontSize, symFont, kerning, isThin, strokeWidth, fontStyle.trim());
        cx += spaceW;
    });
    ctx.restore();
}

function drawKernedTextHelper(ctx, text, x, y, kerning, isThin, strokeWidth) {
    let cx = x;
    const txt = isThin ? text.replace(/ /g, '\u2009') : text;

    if(strokeWidth > 0) {
        ctx.lineWidth = strokeWidth;
        // MODIFICACIÓN: Si definimos un estilo forzado, úsalo. Si no, usa el color de relleno.
        ctx.strokeStyle = ctx.forcedStrokeStyle || ctx.fillStyle;
    }

    for(let char of txt) {
        if(strokeWidth > 0) ctx.strokeText(char, cx, y); // Dibujar borde primero
        ctx.fillText(char, cx, y); // Dibujar relleno encima
        cx += ctx.measureText(char).width + kerning;
    }
}

function wrapFlavorVerticalCenter(ctx, text, rightX, centerY, maxWidth, lineHeight) {
    if(!text) return;
    const words = text.split(' ');
    let line = '', count = 1;
    words.forEach((w, i) => {
        let test = line + w + ' ';
        if(ctx.measureText(test).width > maxWidth && i > 0) { line = w + ' '; count++; } else { line = test; }
    });
    let cy = centerY - ((count * lineHeight) / 2) + (lineHeight / 2);
    line = '';
    words.forEach((w, i) => {
        let test = line + w + ' ';
        if(ctx.measureText(test).width > maxWidth && i > 0) {
            ctx.fillText(line, rightX, cy);
            line = w + ' '; cy += lineHeight;
        } else { line = test; }
    });
    ctx.fillText(line, rightX, cy);
}

function wrapFlavorBalanced(ctx, text, rightX, centerY, maxWidth, lineHeight) {
    if (!text) return;

    const words = text.split(' ');
    const totalWidth = ctx.measureText(text).width;

    // Determinar cantidad de líneas según el ancho total
    let targetLines = 1;
    if (totalWidth > maxWidth * 2) {
        targetLines = 3;
    } else if (totalWidth > maxWidth * 0.85) { // 0.85 para forzar el balanceo un poco antes
        targetLines = 2;
    }

    let lines = [];

    if (targetLines === 1) {
        lines = [text];
    } else if (targetLines === 2) {
        // Algoritmo de equilibrio para 2 líneas
        let minDiff = Infinity;
        let splitIdx = 1;
        for (let i = 1; i < words.length; i++) {
            const w1 = ctx.measureText(words.slice(0, i).join(' ')).width;
            const w2 = ctx.measureText(words.slice(i).join(' ')).width;
            const diff = Math.abs(w1 - w2);
            if (diff < minDiff) {
                minDiff = diff;
                splitIdx = i;
            }
        }
        lines = [words.slice(0, splitIdx).join(' '), words.slice(splitIdx).join(' ')];
    } else {
        // Algoritmo de equilibrio para 3 líneas
        let bestDist = Infinity;
        let splits = [1, 2];
        for (let i = 1; i < words.length - 1; i++) {
            for (let j = i + 1; j < words.length; j++) {
                const l1 = ctx.measureText(words.slice(0, i).join(' ')).width;
                const l2 = ctx.measureText(words.slice(i, j).join(' ')).width;
                const l3 = ctx.measureText(words.slice(j).join(' ')).width;

                // Buscamos que las 3 líneas se acerquen al promedio
                const avg = (l1 + l2 + l3) / 3;
                const dist = Math.abs(l1 - avg) + Math.abs(l2 - avg) + Math.abs(l3 - avg);

                if (dist < bestDist) {
                    bestDist = dist;
                    splits = [i, j];
                }
            }
        }
        lines = [
            words.slice(0, splits[0]).join(' '),
            words.slice(splits[0], splits[1]).join(' '),
            words.slice(splits[1]).join(' ')
        ];
    }

    // Dibujar las líneas centradas verticalmente
    const totalH = lines.length * lineHeight;
    let startY = centerY - (totalH / 2) + (lineHeight / 2);

    lines.forEach(line => {
        ctx.fillText(line, rightX, startY);
        startY += lineHeight;
    });
}


function measureKernedWidth(ctx, text, font, fontSize, kerning, isThin) {
    if(!text) return 0;
    ctx.save();
    ctx.font = `${fontSize}px ${font}`;
    const words = parseRichText(text);
    const symFont = cardData.config.symbolFont || 'PokeSymbols';
    let width = 0;
    const spaceW = ctx.measureText(" ").width;

    words.forEach((w, i) => {
        width += measureRichWord(ctx, w, font, fontSize, symFont, kerning, 1);
        if(i < words.length - 1) width += spaceW;
    });
    ctx.restore();
    return width;
}

/**
 * Dibuja texto simple con espaciado de letras manual
 */
function drawSimpleKerned(ctx, text, x, y, kerning) {
    let currentX = x;
    for (let char of text) {
        ctx.fillText(char, currentX, y);
        // Avanzamos el cursor: ancho de la letra + el kerning extra
        currentX += ctx.measureText(char).width + kerning;
    }
}


}
