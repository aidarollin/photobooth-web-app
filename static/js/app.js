const CONFIG = {
    filters: ["Normal", "Black & White", "Sepia", "Vintage", "Cool", "Warm", "Red Filter", "Green Filter", "Blue Filter"],
    camera: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
    handles: { size: 30, offset: 15, colorAccent: "#d4628c", colorWhite: "#ffffff", colorDelete: "#ff0000" }
};

let capturedImages = [];
let stickers = []; 

// Interaction State
let dragTarget = null; 
let selectedStickerIndex = null; 
let interactionMode = null; 
let startInteractionState = { sticker: {}, pos: {} };
let zoomState = { scale: 1, panning: false, pointX: 0, pointY: 0, startX: 0, startY: 0 };
let pinchState = { active: false, startDist: 0, startScale: 1 };

const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const captureCanvas = document.getElementById('capture-canvas');
const finalCanvas = document.getElementById('final-canvas');
const printWrapper = document.getElementById('print-wrapper');
const finalCtx = finalCanvas.getContext('2d');
const viewport = document.getElementById('viewport');

// --- PERFORMANCE THROTTLE ---
// Fixes "uninteractive" frozen sliders by offloading rendering to the GPU paint cycle
let isRendering = false;
function requestRender() {
    if (!isRendering) {
        isRendering = true;
        requestAnimationFrame(() => {
            render();
            isRendering = false;
        });
    }
}

// --- INITIALIZATION ---
window.onload = () => {

    // Check for saved dark mode preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('theme-toggle').innerText = '☀️';
    }

    const setupFilterSel = document.getElementById('setup-filter');
    const editFilterSel = document.getElementById('edit-filter');
    CONFIG.filters.forEach(f => {
        setupFilterSel.add(new Option(f, f));
        editFilterSel.add(new Option(f, f));
    });

    buildStickerPanel();
    setupStickerPanel();
    setupSmartInteractions();
};

// --- SCREEN FLOW: landing -> frame -> capture -> editor ---
const SCREENS = ['screen-landing', 'screen-frame', 'screen-setup', 'screen-editor'];
// ratio = width / height of one photo on the strip (used by the camera preview, crops and render)
const LAYOUTS = {
    strip_4: { name: 'Classic Strip', shots: 4, ratio: 4.5 / 3.2 },
    strip_3: { name: 'Short Strip', shots: 3, ratio: 4.5 / 4.2 },
    grid_4:  { name: 'Grid', shots: 4, ratio: 4.6 / 6.5 }
};

function showScreen(id) {
    SCREENS.forEach(s => document.getElementById(s).classList.toggle('hidden', s !== id));
}

// The cat runs into the booth, the curtain drops and the camera flashes, then on to frames
function enterBooth() {
    const landing = document.getElementById('screen-landing');
    if (landing.classList.contains('entering')) return;
    landing.classList.add('entering');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
        showScreen('screen-frame');
        landing.classList.remove('entering');
    }, reduceMotion ? 200 : 2100);
}

function confirmFrame() {
    const layout = LAYOUTS[document.getElementById('active-layout').value];
    document.getElementById('frame-summary-text').innerText = `${layout.name} · ${layout.shots} shots`;
    syncShotsToLayout();
    showScreen('screen-setup');
    startCamera();
}

// Only ask for camera permission once the user actually reaches the capture step
function startCamera() {
    if (video.srcObject) return;
    navigator.mediaDevices.getUserMedia({ video: CONFIG.camera })
        .then(stream => video.srcObject = stream)
        .catch(e => alert("Camera Error: " + e));
}

// --- UI & TAB CONTROLS ---
const TABS = ['tab-layout', 'tab-color', 'tab-text', 'tab-stickers'];
const TAB_TITLES = ['Layout', 'Color', 'Text', 'Decorations'];
let currentTabIndex = 0;

function navigateTab(direction) {
    currentTabIndex += direction;
    if (currentTabIndex < 0) currentTabIndex = TABS.length - 1;
    if (currentTabIndex >= TABS.length) currentTabIndex = 0;
    syncTabs();
}

function openTab(tabId, index, event) {
    currentTabIndex = index;
    syncTabs();
}

function syncTabs() {
    // Sync Mobile Header
    document.getElementById('mobile-tab-title').innerText = TAB_TITLES[currentTabIndex];
    
    // Sync Content Panels
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(TABS[currentTabIndex]).classList.add('active');
    
    // Sync Desktop Buttons
    document.querySelectorAll('.tab-btn').forEach((b, idx) => {
        if (idx === currentTabIndex) b.classList.add('active');
        else b.classList.remove('active');
    });
}

// --- DARK MODE LOGIC ---
function toggleTheme() {
    const htmlTag = document.documentElement;
    const toggleBtn = document.getElementById('theme-toggle');
    
    if (htmlTag.getAttribute('data-theme') === 'dark') {
        // Switch to Light Mode
        htmlTag.removeAttribute('data-theme');
        toggleBtn.innerText = '🌙'; 
        localStorage.setItem('theme', 'light');
    } else {
        // Switch to Dark Mode
        htmlTag.setAttribute('data-theme', 'dark');
        toggleBtn.innerText = '☀️'; 
        localStorage.setItem('theme', 'dark');
    }
}

function selectLayout(layoutName, element) {
    document.getElementById('active-layout').value = layoutName;
    document.querySelectorAll('.frame-card').forEach(c => {
        c.classList.toggle('active', c === element);
        c.setAttribute('aria-pressed', c === element);
    });
}

function setBg(color) {
    document.getElementById('bg-color').value = color;
    requestRender();
}

function syncVal(el) {
    if (el.tagName.toLowerCase() === 'input' && el.type === 'range') {
        el.nextElementSibling.value = el.value;
    } else {
        el.previousElementSibling.value = el.value;
    }
}

function applyLiveFilter() {
    const f = document.getElementById('setup-filter').value;
    let css = 'none';
    if (f === "Black & White") css = 'grayscale(1)';
    else if (f === "Sepia") css = 'sepia(1)';
    else if (f === "Vintage") css = 'sepia(0.5) contrast(0.9)';
    else if (f === "Cool") css = 'hue-rotate(180deg) saturate(0.8)';
    else if (f === "Warm") css = 'sepia(0.4) saturate(1.4)';
    video.style.filter = css;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- SHOTS ---
// One slot per photo in the chosen layout. Each shot keeps its original image plus a crop
// (zoom + centre), so it can be re-cropped until the strip is printed. `out` is the cropped
// canvas the strip is rendered from, with exactly the layout's photo ratio.
let shots = [];
let capturing = false;
let uploadTarget = null; // slot index for a single-slot upload, or null to fill empty slots

const currentLayout = () => LAYOUTS[document.getElementById('active-layout').value];
const MAX_SHOT_WIDTH = 1600;

// Largest rect of the photo ratio that fits the source (what zoom = 1 shows)
function baseCrop(src, ratio) {
    return src.width / src.height > ratio ? { w: src.height * ratio, h: src.height } : { w: src.width, h: src.width / ratio };
}

// Source-pixel crop for a zoom/centre, clamped inside the image (and the centre clamped to match)
function cropRect(src, state, ratio) {
    const b = baseCrop(src, ratio), w = b.w / state.zoom, h = b.h / state.zoom;
    const x = Math.min(Math.max(state.cx * src.width - w / 2, 0), src.width - w);
    const y = Math.min(Math.max(state.cy * src.height - h / 2, 0), src.height - h);
    state.cx = (x + w / 2) / src.width;
    state.cy = (y + h / 2) / src.height;
    return { x, y, w, h };
}

function renderShot(shot) {
    const r = cropRect(shot.src, shot, currentLayout().ratio);
    const scale = Math.min(1, MAX_SHOT_WIDTH / r.w);
    const out = document.createElement('canvas');
    out.width = Math.round(r.w * scale);
    out.height = Math.round(r.h * scale);
    out.getContext('2d').drawImage(shot.src, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
    shot.out = out;
}

function makeShot(src) {
    const shot = { src, zoom: 1, cx: 0.5, cy: 0.5 };
    renderShot(shot);
    return shot;
}

// Called when the layout is confirmed: resize the slot list and re-crop existing shots to the new ratio
function syncShotsToLayout() {
    const layout = currentLayout();
    shots = Array.from({ length: layout.shots }, (_, i) => shots[i] || null);
    shots.forEach(shot => shot && renderShot(shot));
    document.documentElement.style.setProperty('--shot-ratio', layout.ratio);
    // tall photos fit one row; wide ones look better two per row
    document.documentElement.style.setProperty('--slot-cols', layout.ratio < 1.2 ? layout.shots : 2);
    renderSlots();
}

function renderSlots() {
    const wrap = document.getElementById('shot-slots');
    const ratio = currentLayout().ratio;
    wrap.innerHTML = '';
    shots.forEach((shot, i) => {
        const btn = document.createElement('button');
        btn.className = 'shot-slot' + (shot ? ' filled' : ' empty');
        btn.setAttribute('aria-label', shot ? `Adjust photo ${i + 1}` : `Upload photo ${i + 1}`);
        btn.onclick = () => shot ? openCrop([i]) : uploadInto(i);
        if (shot) {
            const thumb = document.createElement('canvas');
            thumb.width = 240; thumb.height = Math.round(240 / ratio);
            thumb.getContext('2d').drawImage(shot.out, 0, 0, thumb.width, thumb.height);
            btn.appendChild(thumb);
        } else {
            btn.insertAdjacentHTML('beforeend', '<span class="slot-add" aria-hidden="true">＋</span>');
        }
        btn.insertAdjacentHTML('beforeend', `<span class="slot-num">${i + 1}</span>`);
        wrap.appendChild(btn);
    });
    const filled = shots.filter(Boolean).length;
    document.getElementById('shot-count').innerText = `${filled} / ${shots.length}`;
    document.getElementById('print-btn').disabled = capturing || filled < shots.length;
}

function setCapturing(on) {
    capturing = on;
    document.getElementById('camera-btn').disabled = on;
    document.getElementById('upload-btn').disabled = on;
    renderSlots();
}

// --- CAPTURE & UPLOAD LOGIC ---
// The camera fills the empty slots (or retakes all if every slot is full); the preview frame
// already shows the exact crop, so the shot lands on the strip as seen.
async function startSequence() {
    if (capturing) return;
    if (!video.videoWidth) { alert('The camera is not ready yet. Please allow camera access and try again.'); return; }
    let targets = shots.map((s, i) => s ? -1 : i).filter(i => i >= 0);
    if (targets.length === 0) { shots = shots.map(() => null); targets = shots.map((_, i) => i); }

    setCapturing(true);
    const badge = document.getElementById('shot-badge');
    for (const i of targets) {
        badge.innerText = `Shot ${i + 1} of ${shots.length}`;
        badge.classList.remove('hidden');
        overlay.classList.remove('hidden');
        for (let c = 3; c > 0; c--) { overlay.innerText = c; await sleep(1000); }
        overlay.innerText = "📸"; await sleep(200);

        shots[i] = makeShot(snapPhoto());
        renderSlots();
        video.style.opacity = 0; await sleep(100); video.style.opacity = 1;
        overlay.classList.add('hidden'); await sleep(1000);
    }
    badge.classList.add('hidden');
    setCapturing(false);

    if (shots.every(Boolean)) printStrip();
}

// Full mirrored camera frame; makeShot() centre-crops it exactly like the preview (object-fit: cover)
function snapPhoto() {
    const frame = document.createElement('canvas');
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    const ctx = frame.getContext('2d');
    ctx.translate(frame.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    return frame;
}

function uploadInto(slot) {
    uploadTarget = slot;
    const input = document.getElementById('file-upload');
    input.multiple = slot === null;
    input.click();
}

// Upload one or more photos: into a chosen slot, or into the empty slots in order
// (starting over if every slot is already full), then open the crop editor for them
async function handleUpload(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (files.length === 0) return;

    let targets;
    if (uploadTarget !== null) targets = [uploadTarget];
    else {
        targets = shots.map((s, i) => s ? -1 : i).filter(i => i >= 0);
        if (targets.length === 0) { shots = shots.map(() => null); targets = shots.map((_, i) => i); }
    }
    targets = targets.slice(0, files.length);

    for (let k = 0; k < targets.length; k++) {
        shots[targets[k]] = makeShot(await loadImageFile(files[k]));
    }
    renderSlots();
    openCrop(targets);
}

function loadImageFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function printStrip() {
    if (!shots.length || !shots.every(Boolean)) return;
    capturedImages = shots.map(s => s.out);
    stickers = [];
    selectedStickerIndex = null;
    document.getElementById('edit-filter').value = document.getElementById('setup-filter').value;
    triggerPrintingAnimation();
}

// --- CROP EDITOR ---
// Steps through a queue of slots; drag pans, wheel / pinch / slider zooms (1x = fill the frame)
let cropQueue = [], cropStep = 0, cropState = null;
const cropStage = document.getElementById('crop-stage');
const cropCanvas = document.getElementById('crop-canvas');
const cropPointers = new Map();
let cropPinch = null;

function openCrop(indices) {
    if (!indices.length) return;
    cropQueue = indices;
    showCropStep(0);
    document.getElementById('crop-modal').classList.remove('hidden');
    drawCrop();
}

function showCropStep(k) {
    cropStep = k;
    const i = cropQueue[k], shot = shots[i];
    cropState = { zoom: shot.zoom, cx: shot.cx, cy: shot.cy };
    const n = cropQueue.length;
    document.getElementById('crop-title').innerText = `Adjust photo ${i + 1}` + (n > 1 ? ` (${k + 1} of ${n})` : '');
    document.getElementById('crop-done').innerText = k < n - 1 ? 'Next →' : 'Done ✓';
    document.getElementById('crop-zoom').value = Math.round(cropState.zoom * 100);
    drawCrop();
}

function drawCrop() {
    const shot = shots[cropQueue[cropStep]];
    if (!shot || !cropState) return;
    const dpr = window.devicePixelRatio || 1;
    const box = cropStage.getBoundingClientRect();
    if (!box.width) return;
    cropCanvas.width = Math.round(box.width * dpr);
    cropCanvas.height = Math.round(box.height * dpr);
    const r = cropRect(shot.src, cropState, currentLayout().ratio);
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(shot.src, r.x, r.y, r.w, r.h, 0, 0, cropCanvas.width, cropCanvas.height);
    // rule-of-thirds guide
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    for (let t = 1; t < 3; t++) {
        const x = Math.round(cropCanvas.width * t / 3) + 0.5, y = Math.round(cropCanvas.height * t / 3) + 0.5;
        ctx.moveTo(x, 0); ctx.lineTo(x, cropCanvas.height);
        ctx.moveTo(0, y); ctx.lineTo(cropCanvas.width, y);
    }
    ctx.stroke();
}

function setCropZoom(z) {
    if (!cropState) return;
    cropState.zoom = Math.min(4, Math.max(1, z));
    document.getElementById('crop-zoom').value = Math.round(cropState.zoom * 100);
    drawCrop();
}

function saveCrop() {
    const shot = shots[cropQueue[cropStep]];
    Object.assign(shot, cropState);
    renderShot(shot);
    renderSlots();
    if (cropStep < cropQueue.length - 1) showCropStep(cropStep + 1);
    else closeCrop();
}

function closeCrop() {
    document.getElementById('crop-modal').classList.add('hidden');
    cropQueue = []; cropState = null;
}

function replaceShot() {
    const i = cropQueue[cropStep];
    closeCrop();
    uploadInto(i);
}

function removeShot() {
    shots[cropQueue[cropStep]] = null;
    renderSlots();
    const rest = cropQueue.slice(cropStep + 1).filter(i => shots[i]);
    closeCrop();
    if (rest.length) openCrop(rest);
}

cropStage.addEventListener('pointerdown', e => {
    try { cropStage.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
    cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (cropPointers.size === 2) {
        const [a, b] = [...cropPointers.values()];
        cropPinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: cropState.zoom };
    }
});
cropStage.addEventListener('pointermove', e => {
    const prev = cropPointers.get(e.pointerId);
    if (!prev || !cropState) return;
    cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (cropPointers.size >= 2 && cropPinch) {
        const [a, b] = [...cropPointers.values()];
        setCropZoom(cropPinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / cropPinch.dist);
        return;
    }
    // dragging the photo right moves the crop window left
    const shot = shots[cropQueue[cropStep]];
    const r = cropRect(shot.src, cropState, currentLayout().ratio);
    const perPx = r.w / cropStage.getBoundingClientRect().width;
    cropState.cx -= (e.clientX - prev.x) * perPx / shot.src.width;
    cropState.cy -= (e.clientY - prev.y) * perPx / shot.src.height;
    drawCrop();
});
['pointerup', 'pointercancel'].forEach(type => cropStage.addEventListener(type, e => {
    cropPointers.delete(e.pointerId);
    if (cropPointers.size < 2) cropPinch = null;
}));
cropStage.addEventListener('wheel', e => {
    e.preventDefault();
    if (cropState) setCropZoom(cropState.zoom * Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
window.addEventListener('resize', () => { if (cropState) drawCrop(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cropState) closeCrop();
});

// --- PRINTING OVERLAY & DROP ANIMATION ---
async function triggerPrintingAnimation() {
    showScreen(null);
    document.getElementById('printing-overlay').classList.remove('hidden');
    
    requestRender(); 
    
    await sleep(2000); 
    
    document.getElementById('printing-overlay').classList.add('hidden');
    showScreen('screen-editor');
    
    printWrapper.classList.remove('drop-in-animation');
    void printWrapper.offsetWidth; 
    printWrapper.classList.add('drop-in-animation');

    // Smoothly vanish the tip after 7 seconds
    setTimeout(() => {
        const hint = document.getElementById('drag-hint');
        if (hint) {
            hint.style.opacity = '0';
            hint.style.transform = 'translateY(-10px)';
            setTimeout(() => hint.remove(), 500); // Remove from DOM after fade
        }
    }, 5000);
}

// --- STICKERS & ZOOM LOGIC ---
// Sticker colour choice: 'classic' (each sprite's own colours), 'mix' (random per sticker) or a family key
let stickerFamily = 'classic';
let stickerBorder = true;

function resolveFamily(spriteId) {
    const families = Object.keys(PixelStickers.FAMILIES);
    if (stickerFamily === 'mix') return families[Math.floor(Math.random() * families.length)];
    if (stickerFamily === 'classic') return PixelStickers.SPRITES[spriteId].family;
    return stickerFamily;
}

function buildStickerPanel() {
    const variants = document.getElementById('sticker-variants');
    const options = [
        { key: 'classic', label: 'Classic' },
        ...Object.entries(PixelStickers.FAMILIES).map(([key, f]) => ({ key, label: f.label })),
        { key: 'mix', label: 'Mix' }
    ];
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'variant-btn' + (opt.key === stickerFamily ? ' active' : '');
        btn.dataset.family = opt.key;
        btn.title = opt.label;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-label', opt.label);
        btn.setAttribute('aria-checked', opt.key === stickerFamily);
        const f = PixelStickers.FAMILIES[opt.key];
        if (f) btn.style.background = `linear-gradient(135deg, ${f.c} 0 33%, ${f.a} 33% 66%, ${f.b} 66%)`;
        else btn.textContent = opt.key === 'mix' ? '?' : '★';
        btn.onclick = () => setStickerFamily(opt.key);
        variants.appendChild(btn);
    });

    const grid = document.getElementById('sticker-grid');
    Object.entries(PixelStickers.SPRITES).forEach(([id, sprite]) => {
        const btn = document.createElement('button');
        btn.className = 'sticker-btn';
        btn.dataset.sprite = id;
        btn.title = sprite.label;
        btn.setAttribute('aria-label', `Add ${sprite.label} sticker`);
        btn.onclick = () => addSticker(id);
        btn.appendChild(document.createElement('img')).alt = '';
        grid.appendChild(btn);
    });
    refreshStickerPreviews();
}

function refreshStickerPreviews() {
    document.querySelectorAll('#sticker-grid [data-sprite]').forEach(btn => {
        const id = btn.dataset.sprite;
        const fam = (stickerFamily === 'classic' || stickerFamily === 'mix') ? PixelStickers.SPRITES[id].family : stickerFamily;
        btn.querySelector('img').src = PixelStickers.previewURL(id, fam, stickerBorder);
    });
}

function setStickerFamily(key) {
    stickerFamily = key;
    document.querySelectorAll('.variant-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.family === key);
        b.setAttribute('aria-checked', b.dataset.family === key);
    });
    refreshStickerPreviews();
    // Recolour the sticker that's currently selected on the strip
    const s = stickers[selectedStickerIndex];
    if (s) { s.family = resolveFamily(s.sprite); requestRender(); }
}

function setStickerBorder(on) {
    stickerBorder = on;
    refreshStickerPreviews();
    const s = stickers[selectedStickerIndex];
    if (s) { s.border = on; requestRender(); }
}

function addSticker(spriteId) {
    stickers.push({
        sprite: spriteId, family: resolveFamily(spriteId), border: stickerBorder,
        x: finalCanvas.width / 2, y: finalCanvas.height / 2, size: 250, rotation: 0
    });
    selectedStickerIndex = stickers.length - 1; 
    requestRender();
}
function clearStickers() { stickers = []; selectedStickerIndex = null; requestRender(); }

function setTransform() {
    finalCanvas.style.transform = `translate(${zoomState.pointX}px, ${zoomState.pointY}px) scale(${zoomState.scale})`;
}
function adjustZoom(delta) {
    zoomState.scale = Math.max(0.5, Math.min(3, zoomState.scale + delta));
    setTransform();
}
function resetZoom() {
    zoomState.scale = 1; zoomState.pointX = 0; zoomState.pointY = 0;
    setTransform();
}


function getCanvasPos(e) {
    const rect = finalCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = finalCanvas.width / rect.width;
    const scaleY = finalCanvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}
// Handles are sized in screen pixels (converted to canvas pixels), so they stay big enough to
// grab whatever the strip's display size or zoom: ~22px on desktop, ~32px on touch screens.
const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
function handleMetrics(s) {
    const rect = finalCanvas.getBoundingClientRect();
    const k = rect.width ? finalCanvas.width / rect.width : 1; // canvas px per screen px
    const coarse = isCoarsePointer();
    const r = (coarse ? 16 : 11) * k;
    const h = s.size / 2 + 6 * k;
    return { k, r, h, rotY: -(h + (coarse ? 36 : 28) * k), hit: r * 1.35 };
}
function getHandlePositions(s) {
    const m = handleMetrics(s);
    const corners = [
        { x: -m.h, y: -m.h, type: 'resize' },
        { x: m.h, y: -m.h, type: 'delete' },
        { x: m.h, y: m.h, type: 'resize' },
        { x: -m.h, y: m.h, type: 'resize' }
    ];
    return { corners, rotHandle: { x: 0, y: m.rotY, type: 'rotate' }, hit: m.hit };
}

// --- STICKER EDITING (panel buttons + keyboard) ---
const STICKER_MIN = 80, STICKER_MAX = 1200;
function selectedSticker() { return selectedStickerIndex !== null ? stickers[selectedStickerIndex] : null; }

function stickerAction(act) {
    const s = selectedSticker();
    if (!s) return;
    const deg = Math.round(s.rotation * 180 / Math.PI);
    if (act === 'bigger') s.size = Math.min(STICKER_MAX, s.size * 1.1);
    else if (act === 'smaller') s.size = Math.max(STICKER_MIN, s.size / 1.1);
    else if (act === 'rotl') s.rotation = (Math.round(deg / 15) * 15 - 15) * Math.PI / 180;
    else if (act === 'rotr') s.rotation = (Math.round(deg / 15) * 15 + 15) * Math.PI / 180;
    else if (act === 'delete') { stickers.splice(selectedStickerIndex, 1); selectedStickerIndex = null; }
    else if (act === 'done') selectedStickerIndex = null;
    requestRender();
}

function updateStickerPanel() {
    const panel = document.getElementById('sticker-panel');
    const s = selectedSticker();
    panel.classList.toggle('hidden', !s);
    if (!s) return;
    const deg = ((Math.round(s.rotation * 180 / Math.PI) % 360) + 360) % 360;
    document.getElementById('sticker-panel-info').innerText = `${Math.round(s.size / 250 * 100)}% · ${deg}°`;
}

// Panel buttons: tap for one step, press and hold to keep going (size / rotate)
function setupStickerPanel() {
    document.querySelectorAll('#sticker-panel [data-act]').forEach(btn => {
        const act = btn.dataset.act, repeats = !['delete', 'done'].includes(act);
        let timer = null;
        const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; };
        btn.addEventListener('click', e => {
            // keyboard / screen-reader activation (pointer presses are handled below)
            if (e.detail === 0 || !repeats) stickerAction(act);
        });
        if (!repeats) return;
        btn.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            stickerAction(act);
            timer = setTimeout(() => { timer = setInterval(() => stickerAction(act), 90); }, 400);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, stop));
    });

    // Keyboard: arrows move (Shift = bigger steps), + / - resize, [ / ] rotate, Delete removes, Esc deselects
    document.addEventListener('keydown', e => {
        const s = selectedSticker();
        if (!s || document.getElementById('screen-editor').classList.contains('hidden')) return;
        if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable]')) return;
        const step = e.shiftKey ? 50 : 10;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) { s.x += moves[e.key][0]; s.y += moves[e.key][1]; requestRender(); }
        else if (e.key === '+' || e.key === '=') stickerAction('bigger');
        else if (e.key === '-' || e.key === '_') stickerAction('smaller');
        else if (e.key === '[') stickerAction('rotl');
        else if (e.key === ']') stickerAction('rotr');
        else if (e.key === 'Delete' || e.key === 'Backspace') stickerAction('delete');
        else if (e.key === 'Escape') stickerAction('done');
        else return;
        e.preventDefault();
    });
}

function setupSmartInteractions() {
    function pinchDist(e) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    function pinchAngle(e) {
        return Math.atan2(e.touches[1].clientY - e.touches[0].clientY, e.touches[1].clientX - e.touches[0].clientX);
    }

    function handleStart(e) {
        if (e.touches && e.touches.length === 2) {
            if (e.cancelable) e.preventDefault();
            const sel = selectedSticker();
            zoomState.panning = false;
            dragTarget = null;
            if (sel) {
                // two fingers on a selected sticker: pinch to resize, twist to rotate
                interactionMode = 'gesture';
                startInteractionState = { sticker: { ...sel }, dist: pinchDist(e), angle: pinchAngle(e) };
                return;
            }
            pinchState.active = true;
            pinchState.startDist = pinchDist(e);
            pinchState.startScale = zoomState.scale;
            return;
        }

        const pos = getCanvasPos(e);
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragTarget = null;
        interactionMode = null;
        const s = stickers[selectedStickerIndex];

        if (s) {
            // tap position in the sticker's own (rotated) space
            const dx = pos.x - s.x, dy = pos.y - s.y;
            const local = { x: dx * Math.cos(-s.rotation) - dy * Math.sin(-s.rotation), y: dx * Math.sin(-s.rotation) + dy * Math.cos(-s.rotation) };
            const handles = getHandlePositions(s);
            const near = hd => Math.hypot(local.x - hd.x, local.y - hd.y) <= handles.hit;

            if (near(handles.rotHandle)) {
                interactionMode = 'rotate';
                startInteractionState = { sticker: { ...s }, pos };
                if(e.cancelable) e.preventDefault();
                return;
            }

            for (const h of handles.corners) {
                if (near(h)) {
                    if (h.type === 'delete') {
                        stickers.splice(selectedStickerIndex, 1);
                        selectedStickerIndex = null;
                        requestRender();
                    } else {
                        interactionMode = 'resize';
                        startInteractionState = { sticker: { ...s }, pos };
                    }
                    if(e.cancelable) e.preventDefault();
                    return;
                }
            }
        }
        
        let foundSticker = null;
        for (let i = stickers.length - 1; i >= 0; i--) {
            const sticker = stickers[i];
            const hitBox = sticker.size / 1.5; 
            if (Math.abs(pos.x - sticker.x) < hitBox && Math.abs(pos.y - sticker.y) < hitBox) {
                foundSticker = i;
                break;
            }
        }
        if (foundSticker !== null) {
            selectedStickerIndex = foundSticker;
            dragTarget = stickers[foundSticker];
            interactionMode = 'drag';
            // keep the grab point under the finger instead of jumping the centre to it
            startInteractionState = { pos, offset: { x: dragTarget.x - pos.x, y: dragTarget.y - pos.y } };
            if(e.cancelable) e.preventDefault();
            requestRender(); 
            return;
        }
        
        if(e.cancelable) e.preventDefault();
        zoomState.startX = clientX - zoomState.pointX; 
        zoomState.startY = clientY - zoomState.pointY; 
        zoomState.panning = true;
        selectedStickerIndex = null; 
        requestRender(); 
    }

    function handleMove(e) {
        if (e.touches && e.touches.length === 2 && interactionMode === 'gesture') {
            if (e.cancelable) e.preventDefault();
            const s = selectedSticker(), start = startInteractionState;
            if (!s) return;
            s.size = Math.max(STICKER_MIN, Math.min(STICKER_MAX, start.sticker.size * pinchDist(e) / start.dist));
            s.rotation = start.sticker.rotation + (pinchAngle(e) - start.angle);
            requestRender();
            return;
        }
        if (interactionMode === 'gesture') return; // one finger lifted mid-gesture
        if (e.touches && e.touches.length === 2 && pinchState.active) {
            if (e.cancelable) e.preventDefault();
            const ratio = pinchDist(e) / pinchState.startDist;
            zoomState.scale = Math.max(0.5, Math.min(3, pinchState.startScale * ratio));
            setTransform();
            return;
        }

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const s = stickers[selectedStickerIndex];

        if (interactionMode === 'drag' && dragTarget) {
            if(e.cancelable) e.preventDefault();
            const pos = getCanvasPos(e), off = startInteractionState.offset || { x: 0, y: 0 };
            dragTarget.x = pos.x + off.x; dragTarget.y = pos.y + off.y;
            requestRender();
        } else if (interactionMode === 'resize' && s) {
            if(e.cancelable) e.preventDefault();
            const pos = getCanvasPos(e);
            const initialDist = Math.hypot(startInteractionState.pos.x - s.x, startInteractionState.pos.y - s.y);
            const currentDist = Math.hypot(pos.x - s.x, pos.y - s.y);
            s.size = Math.max(STICKER_MIN, Math.min(STICKER_MAX, startInteractionState.sticker.size * (currentDist / initialDist)));
            requestRender();
        } else if (interactionMode === 'rotate' && s) {
            if(e.cancelable) e.preventDefault();
            const pos = getCanvasPos(e);
            const initialAngle = Math.atan2(startInteractionState.pos.y - s.y, startInteractionState.pos.x - s.x);
            const currentAngle = Math.atan2(pos.y - s.y, pos.x - s.x);
            s.rotation = startInteractionState.sticker.rotation + (currentAngle - initialAngle);
            requestRender();
        } else if (zoomState.panning) {
            if(e.cancelable) e.preventDefault();
            zoomState.pointX = clientX - zoomState.startX; 
            zoomState.pointY = clientY - zoomState.startY; 
            setTransform();
        }
    }

    function handleEnd(e) {
        if (e && e.touches && e.touches.length < 2) pinchState.active = false;
        if (!e || !e.touches) pinchState.active = false;
        // stay in gesture mode until every finger is up, so lifting one doesn't start a drag
        if (interactionMode === 'gesture' && e && e.touches && e.touches.length > 0) return;
        dragTarget = null; zoomState.panning = false; interactionMode = null;
    }

    finalCanvas.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        adjustZoom(e.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });

    // Using passive:false allows us to strictly prevent default scrolling ONLY when engaging canvas items
    finalCanvas.addEventListener('touchstart', handleStart, {passive: false});
    window.addEventListener('touchmove', handleMove, {passive: false});
    window.addEventListener('touchend', handleEnd);
}

// --- RENDER ENGINE ---
function render() {
    if (capturedImages.length === 0) return;

    const layout = document.getElementById('active-layout').value;
    const bgColor = document.getElementById('bg-color').value;
    
    const marginOuter = parseInt(document.getElementById('adj-margin-outer').value) * 2; 
    const marginInner = parseInt(document.getElementById('adj-margin-inner').value) * 2; 
    
    const enableFooter = document.getElementById('enable-footer').checked;
    
    const filterName = document.getElementById('edit-filter').value;
    const intensity = parseInt(document.getElementById('filter-intensity').value) / 100;
    const bright = parseInt(document.getElementById('adj-bright').value);
    const contrast = parseInt(document.getElementById('adj-contrast').value);
    const highlight = parseInt(document.getElementById('adj-highlight').value);
    const shadow = parseInt(document.getElementById('adj-shadow').value);
    const sharp = parseInt(document.getElementById('adj-sharp').value);

    let w = 1200; 
    let cols = (layout === "grid_4") ? 2 : 1;
    let rows = (layout === "grid_4") ? 2 : (layout === "strip_3" ? 3 : 4);

    let targetRatio = LAYOUTS[layout].ratio;

    let photoW = (w - (2 * marginOuter) - ((cols - 1) * marginInner)) / cols;
    let photoH = photoW / targetRatio;
    
    let baseH = (2 * marginOuter) + (photoH * rows) + (marginInner * (rows - 1));

    let footerH = (enableFooter) ? (layout === "grid_4" ? 300 : 400) : 0;

    finalCanvas.width = w;
    finalCanvas.height = baseH + footerH;
    finalCtx.fillStyle = bgColor;
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    capturedImages.forEach((img, i) => {
        if (img.complete === false) return; // images still loading; shot canvases are always ready
        let r = Math.floor(i / cols);
        let c = i % cols;
        
        let x = marginOuter + c * (photoW + marginInner);
        let y = marginOuter + r * (photoH + marginInner);

        let tempC = document.createElement('canvas');
        tempC.width = photoW; tempC.height = photoH;
        let tCtx = tempC.getContext('2d');

        let imgRatio = img.width / img.height;
        let sW, sH, sX, sY;
        if (imgRatio > targetRatio) {
            sH = img.height; sW = img.height * targetRatio;
            sX = (img.width - sW) / 2; sY = 0;
        } else {
            sW = img.width; sH = img.width / targetRatio;
            sX = 0; sY = (img.height - sH) / 2;
        }

        tCtx.drawImage(img, sX, sY, sW, sH, 0, 0, photoW, photoH);

        if (intensity > 0) {
            let fC = document.createElement('canvas');
            fC.width = photoW; fC.height = photoH;
            let fCtx = fC.getContext('2d');
            
            let fStr = `brightness(${bright}%) contrast(${contrast}%) `;
            if (filterName === "Black & White") fStr += 'grayscale(1)';
            else if (filterName === "Sepia") fStr += 'sepia(1)';
            else if (filterName === "Vintage") fStr += 'sepia(0.6) contrast(0.8)';
            else if (filterName === "Cool") fStr += 'hue-rotate(180deg) saturate(0.8)';
            else if (filterName === "Warm") fStr += 'sepia(0.4) saturate(1.4)';
            if (sharp > 0) fStr += ` contrast(${100 + (sharp/4)}%)`; 

            fCtx.filter = fStr;
            fCtx.drawImage(img, sX, sY, sW, sH, 0, 0, photoW, photoH);

            if (filterName.includes("Red") || filterName.includes("Green") || filterName.includes("Blue")) {
                fCtx.globalCompositeOperation = 'overlay';
                fCtx.fillStyle = filterName.includes("Red") ? '#ff0000' : filterName.includes("Green") ? '#00ff00' : '#0000ff';
                fCtx.fillRect(0,0, photoW, photoH);
                fCtx.globalCompositeOperation = 'source-over';
            }

            tCtx.globalAlpha = intensity;
            tCtx.drawImage(fC, 0, 0);
            tCtx.globalAlpha = 1.0;
        }

        if (shadow !== 0) {
            tCtx.globalCompositeOperation = (shadow > 0) ? 'overlay' : 'multiply';
            tCtx.fillStyle = (shadow > 0) ? '#fff' : '#000';
            tCtx.globalAlpha = Math.abs(shadow) / 100;
            tCtx.fillRect(0,0, photoW, photoH);
        }
        if (highlight !== 0) {
            tCtx.globalCompositeOperation = (highlight > 0) ? 'screen' : 'multiply';
            tCtx.fillStyle = (highlight > 0) ? '#fff' : '#888';
            tCtx.globalAlpha = Math.abs(highlight) / 100;
            tCtx.fillRect(0,0, photoW, photoH);
        }
        tCtx.globalCompositeOperation = 'source-over';
        tCtx.globalAlpha = 1.0;

        finalCtx.drawImage(tempC, x, y);
    });

    if (enableFooter) {
        const noteText = document.getElementById('note-text').value;
        const showNote = document.getElementById('show-note').checked;
        const showDate = document.getElementById('show-date').checked;
        const fontName = document.getElementById('font-select').value;
        
        const noteSize = parseInt(document.getElementById('note-size').value);
        const noteX = (document.getElementById('note-x').value / 100) * w;
        
        const noteY = ((document.getElementById('note-y').value / 100) * footerH) + baseH + (footerH/2);
        const textOffset = footerH * 0.15; 
        
        const dateSize = parseInt(document.getElementById('date-size').value);
        const dateX = (document.getElementById('date-x').value / 100) * w;
        const dateY = ((document.getElementById('date-y').value / 100) * footerH) + baseH + (footerH/2);

        finalCtx.fillStyle = (bgColor === "#000000") ? "white" : "black";
        finalCtx.textAlign = "center";
        finalCtx.textBaseline = "middle";

        if (showNote) {
            finalCtx.font = `${noteSize}px "${fontName}"`;
            finalCtx.fillText(noteText, noteX, noteY - textOffset);
        }
        if (showDate) {
            finalCtx.font = `${dateSize}px "Courier Prime"`;
            finalCtx.fillText(new Date().toLocaleDateString(), dateX, dateY + textOffset);
        }
    }

    finalCtx.textAlign = "center";
    finalCtx.textBaseline = "middle";
    stickers.forEach(s => {
        // Fit the pixel sprite inside the sticker's size box, scaled with hard pixel edges
        const sprite = PixelStickers.getCanvas(s.sprite, s.family, s.border);
        const scale = s.size / Math.max(sprite.width, sprite.height);
        const dw = sprite.width * scale, dh = sprite.height * scale;
        finalCtx.save();
        finalCtx.translate(s.x, s.y);
        finalCtx.rotate(s.rotation);
        finalCtx.imageSmoothingEnabled = false;
        finalCtx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
        finalCtx.restore();
    });

    const s = stickers[selectedStickerIndex];
    if (s && selectedStickerIndex !== null) {
        const m = handleMetrics(s), lw = 2 * m.k;
        finalCtx.save();
        finalCtx.translate(s.x, s.y);
        finalCtx.rotate(s.rotation);

        finalCtx.strokeStyle = CONFIG.handles.colorAccent;
        finalCtx.lineWidth = lw;
        finalCtx.setLineDash([6 * m.k, 4 * m.k]);
        finalCtx.strokeRect(-m.h, -m.h, m.h * 2, m.h * 2);
        finalCtx.setLineDash([]);
        finalCtx.beginPath(); finalCtx.moveTo(0, -m.h); finalCtx.lineTo(0, m.rotY + m.r); finalCtx.stroke();

        const dot = (x, y, fill, ring) => {
            finalCtx.beginPath(); finalCtx.arc(x, y, m.r, 0, Math.PI * 2);
            finalCtx.fillStyle = fill; finalCtx.fill();
            finalCtx.lineWidth = lw; finalCtx.strokeStyle = ring; finalCtx.stroke();
        };
        // resize corners
        [[-m.h, -m.h], [m.h, m.h], [-m.h, m.h]].forEach(([x, y]) => dot(x, y, CONFIG.handles.colorWhite, CONFIG.handles.colorAccent));
        // delete
        dot(m.h, -m.h, CONFIG.handles.colorDelete, CONFIG.handles.colorWhite);
        const xr = m.r * 0.4;
        finalCtx.strokeStyle = CONFIG.handles.colorWhite; finalCtx.lineWidth = 2.5 * m.k; finalCtx.lineCap = 'round';
        finalCtx.beginPath();
        finalCtx.moveTo(m.h - xr, -m.h - xr); finalCtx.lineTo(m.h + xr, -m.h + xr);
        finalCtx.moveTo(m.h + xr, -m.h - xr); finalCtx.lineTo(m.h - xr, -m.h + xr);
        finalCtx.stroke();
        // rotate
        dot(0, m.rotY, CONFIG.handles.colorAccent, CONFIG.handles.colorWhite);
        finalCtx.strokeStyle = CONFIG.handles.colorWhite; finalCtx.lineWidth = 2 * m.k;
        finalCtx.beginPath(); finalCtx.arc(0, m.rotY, m.r * 0.5, 0.2 * Math.PI, 1.75 * Math.PI); finalCtx.stroke();
        const ax = Math.cos(1.75 * Math.PI) * m.r * 0.5, ay = m.rotY + Math.sin(1.75 * Math.PI) * m.r * 0.5;
        finalCtx.beginPath(); finalCtx.moveTo(ax - 3 * m.k, ay - 3 * m.k); finalCtx.lineTo(ax, ay); finalCtx.lineTo(ax + 1 * m.k, ay + 4 * m.k); finalCtx.stroke();
        finalCtx.lineCap = 'butt';

        finalCtx.restore();
    }
    updateStickerPanel();
}

function isInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /Instagram|FBAN|FBAV|FB_IAB|Twitter\/|Line\/|Snapchat|TikTok|BytedanceWebview/.test(ua);
}

function isIOS() {
    const ua = navigator.userAgent || '';
    // iPadOS 13+ reports itself as Mac, so also check for touch support
    return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Synchronous dataURL -> File so navigator.share() still runs inside the tap gesture
function dataURLToFile(dataURL, filename) {
    const [header, base64] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new File([arr], filename, { type: mime });
}

function showSaveModal(dataURL) {
    document.getElementById('download-modal-img').src = dataURL;
    document.getElementById('download-modal').classList.remove('hidden');
}

function downloadImage() {
    // Drop the sticker selection handles so they aren't baked into the photo
    selectedStickerIndex = null;
    render();

    const filename = `AidasBooth_${Date.now()}.png`;
    const dataURL = finalCanvas.toDataURL('image/png', 1.0);

    if (isInAppBrowser()) {
        showSaveModal(dataURL);
        return;
    }

    // iOS Safari ignores <a download> for Photos (it silently goes to Files, if anywhere),
    // so open the native share sheet, which offers "Save Image" straight to Photos.
    if (isIOS()) {
        const file = dataURLToFile(dataURL, filename);
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file] })
                .then(() => showDownloadToast())
                .catch(err => {
                    if (err.name !== 'AbortError') showSaveModal(dataURL);
                });
        } else {
            showSaveModal(dataURL);
        }
        return;
    }

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    link.click();
    showDownloadToast();
}

function showDownloadToast() {
    const toast = document.getElementById('download-toast');
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 400);
    }, 2500);
}

function closeDownloadModal() {
    document.getElementById('download-modal').classList.add('hidden');
}
