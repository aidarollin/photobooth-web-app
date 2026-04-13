/* =========================================
   AIDA'S BEAUTY PHOTOBOOTH - ENGINE
========================================= */

const CONFIG = {
    filters: ["Normal", "Black & White", "Sepia", "Vintage", "Cool", "Warm", "Red Filter", "Green Filter", "Blue Filter"],
    camera: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
    handles: { size: 30, offset: 15, colorAccent: "#ff477e", colorWhite: "#ffffff", colorDelete: "#ff0000" }
};

let capturedImages = [];
let stickers = []; 

// Interaction State
let dragTarget = null; 
let selectedStickerIndex = null; 
let interactionMode = null; 
let startInteractionState = { sticker: {}, pos: {} };

let zoomState = { scale: 1, panning: false, pointX: 0, pointY: 0, startX: 0, startY: 0 };

const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const captureCanvas = document.getElementById('capture-canvas');
const finalCanvas = document.getElementById('final-canvas');
const printWrapper = document.getElementById('print-wrapper');
const finalCtx = finalCanvas.getContext('2d');
const viewport = document.getElementById('viewport');

// --- INITIALIZATION ---
window.onload = () => {
    const setupFilterSel = document.getElementById('setup-filter');
    const editFilterSel = document.getElementById('edit-filter');
    CONFIG.filters.forEach(f => {
        setupFilterSel.add(new Option(f, f));
        editFilterSel.add(new Option(f, f));
    });

    navigator.mediaDevices.getUserMedia({ video: CONFIG.camera })
        .then(stream => video.srcObject = stream)
        .catch(e => alert("Camera Error: " + e));
        
    setupSmartInteractions();
};

// --- UI CONTROLS ---
function selectLayout(layoutName, element) {
    document.getElementById('active-layout').value = layoutName;
    document.querySelectorAll('.layout-card').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
}

function setBg(color) {
    document.getElementById('bg-color').value = color;
    render();
}

// Sync function for Slider <-> Number Input
function syncVal(el) {
    if (el.tagName.toLowerCase() === 'input' && el.type === 'range') {
        el.nextElementSibling.value = el.value;
    } else {
        el.previousElementSibling.value = el.value;
    }
}

function openTab(tabId, event) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
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

// --- CAPTURE & UPLOAD LOGIC ---
async function startSequence() {
    capturedImages = [];
    stickers = []; 
    selectedStickerIndex = null;
    const layout = document.getElementById('active-layout').value;
    const targetCount = (layout === 'strip_3') ? 3 : 4;
    document.getElementById('edit-filter').value = document.getElementById('setup-filter').value;

    for (let i = 1; i <= targetCount; i++) {
        overlay.classList.remove('hidden');
        for (let c = 3; c > 0; c--) { overlay.innerText = c; await sleep(1000); }
        overlay.innerText = "📸"; await sleep(200);
        
        snapPhoto();
        video.style.opacity = 0; await sleep(100); video.style.opacity = 1;
        overlay.classList.add('hidden'); await sleep(1000);
    }
    
    triggerPrintingAnimation();
}

function snapPhoto() {
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext('2d');
    ctx.translate(captureCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    let img = new Image();
    img.src = captureCanvas.toDataURL('image/jpeg', 1.0);
    capturedImages.push(img);
}

async function handleUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const layout = document.getElementById('active-layout').value;
    const targetCount = (layout === 'strip_3') ? 3 : 4;

    if (files.length < targetCount) {
        alert(`Please select at least ${targetCount} photos for this layout!`);
        return;
    }

    capturedImages = [];
    stickers = [];
    selectedStickerIndex = null;
    document.getElementById('edit-filter').value = document.getElementById('setup-filter').value;

    for (let i = 0; i < targetCount; i++) {
        const file = files[i];
        const img = await loadImageFile(file);
        capturedImages.push(img);
    }

    triggerPrintingAnimation();
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

// --- PRINTING OVERLAY & DROP ANIMATION ---
async function triggerPrintingAnimation() {
    document.getElementById('screen-setup').classList.add('hidden');
    document.getElementById('printing-overlay').classList.remove('hidden');
    
    render(); 
    
    await sleep(2000); 
    
    document.getElementById('printing-overlay').classList.add('hidden');
    document.getElementById('screen-editor').classList.remove('hidden');
    
    printWrapper.classList.remove('drop-in-animation');
    void printWrapper.offsetWidth; 
    printWrapper.classList.add('drop-in-animation');
}

// --- STICKERS & ZOOM LOGIC ---
function addSticker(char) {
    stickers.push({ char: char, x: finalCanvas.width / 2, y: finalCanvas.height / 2, size: 250, rotation: 0 });
    selectedStickerIndex = stickers.length - 1; 
    render();
}
function clearStickers() { stickers = []; selectedStickerIndex = null; render(); }

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
function getHandlePositions(s) {
    const h = s.size / 2 + CONFIG.handles.offset;
    const corners = [
        { x: -h, y: -h, type: 'resize' }, 
        { x: h, y: -h, type: 'delete' }, 
        { x: h, y: h, type: 'resize' },  
        { x: -h, y: h, type: 'resize' } 
    ];
    const rotHandle = { x: 0, y: -h - 60, type: 'rotate' };
    return { corners, rotHandle };
}

function setupSmartInteractions() {
    function handleStart(e) {
        const pos = getCanvasPos(e);
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragTarget = null;
        interactionMode = null;
        const s = stickers[selectedStickerIndex];

        if (s) {
            finalCtx.save();
            finalCtx.translate(s.x, s.y);
            finalCtx.rotate(s.rotation);
            const handles = getHandlePositions(s);
            
            if (finalCtx.isPointInPath(createCirclePath(handles.rotHandle.x, handles.rotHandle.y, CONFIG.handles.size), pos.x, pos.y)) {
                interactionMode = 'rotate';
                startInteractionState = { sticker: { ...s }, pos };
                finalCtx.restore();
                if(e.cancelable) e.preventDefault();
                return;
            }

            for (const h of handles.corners) {
                if (finalCtx.isPointInPath(createCirclePath(h.x, h.y, CONFIG.handles.size), pos.x, pos.y)) {
                    if (h.type === 'delete') {
                        stickers.splice(selectedStickerIndex, 1);
                        selectedStickerIndex = null;
                        render();
                    } else {
                        interactionMode = 'resize';
                        startInteractionState = { sticker: { ...s }, pos };
                    }
                    finalCtx.restore();
                    if(e.cancelable) e.preventDefault();
                    return;
                }
            }
            finalCtx.restore();
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
            startInteractionState = { pos };
            if(e.cancelable) e.preventDefault();
            render(); 
            return;
        }
        
        if(e.cancelable) e.preventDefault();
        zoomState.startX = clientX - zoomState.pointX; 
        zoomState.startY = clientY - zoomState.pointY; 
        zoomState.panning = true;
        selectedStickerIndex = null; 
        render(); 
    }

    function handleMove(e) {
        if(e.cancelable) e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const s = stickers[selectedStickerIndex];

        if (interactionMode === 'drag' && dragTarget) {
            const pos = getCanvasPos(e);
            dragTarget.x = pos.x; dragTarget.y = pos.y;
            render();
        } else if (interactionMode === 'resize' && s) {
            const pos = getCanvasPos(e);
            const initialDist = Math.hypot(startInteractionState.pos.x - s.x, startInteractionState.pos.y - s.y);
            const currentDist = Math.hypot(pos.x - s.x, pos.y - s.y);
            s.size = Math.max(100, Math.min(1000, startInteractionState.sticker.size * (currentDist / initialDist)));
            render();
        } else if (interactionMode === 'rotate' && s) {
            const pos = getCanvasPos(e);
            const initialAngle = Math.atan2(startInteractionState.pos.y - s.y, startInteractionState.pos.x - s.x);
            const currentAngle = Math.atan2(pos.y - s.y, pos.x - s.x);
            s.rotation = startInteractionState.sticker.rotation + (currentAngle - initialAngle);
            render();
        } else if (zoomState.panning) {
            zoomState.pointX = clientX - zoomState.startX; 
            zoomState.pointY = clientY - zoomState.startY; 
            setTransform();
        }
    }

    function handleEnd() { dragTarget = null; zoomState.panning = false; interactionMode = null; }

    function createCirclePath(x, y, r) {
        const path = new Path2D();
        path.arc(x, y, r, 0, Math.PI * 2);
        return path;
    }

    finalCanvas.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    finalCanvas.addEventListener('touchstart', handleStart, {passive: false});
    window.addEventListener('touchmove', handleMove, {passive: false});
    window.addEventListener('touchend', handleEnd);
}

// --- RENDER ENGINE (SPLIT MARGINS & SHORTER FOOTER) ---
function render() {
    if (capturedImages.length === 0) return;

    const layout = document.getElementById('active-layout').value;
    const bgColor = document.getElementById('bg-color').value;
    
    // Split Margin Logic
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

    let targetRatio;
    if (layout === "strip_4") targetRatio = 4.5 / 3.2;       
    else if (layout === "strip_3") targetRatio = 4.5 / 4.2; 
    else targetRatio = 4.6 / 6.5;                            

    // Calculate Photo Sizes mathematically using Outer and Inner limits
    let photoW = (w - (2 * marginOuter) - ((cols - 1) * marginInner)) / cols;
    let photoH = photoW / targetRatio;
    
    // Base Height needed for photos and margins
    let baseH = (2 * marginOuter) + (photoH * rows) + (marginInner * (rows - 1));

    // Shorter Footer
    let footerH = (enableFooter) ? (layout === "grid_4" ? 300 : 400) : 0;

    finalCanvas.width = w;
    finalCanvas.height = baseH + footerH;
    finalCtx.fillStyle = bgColor;
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    capturedImages.forEach((img, i) => {
        if (!img.complete) return;
        let r = Math.floor(i / cols);
        let c = i % cols;
        
        // Accurate X & Y using Split Margins
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
        
        // Relative placement so it always scales safely inside the shorter footer
        const noteY = ((document.getElementById('note-y').value / 100) * footerH) + baseH + (footerH/2);
        const textOffset = footerH * 0.15; // Dynamic spacing to avoid clashes
        
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
        finalCtx.save();
        finalCtx.translate(s.x, s.y);
        finalCtx.rotate(s.rotation);
        finalCtx.font = `${s.size}px Arial`;
        finalCtx.fillText(s.char, 0, 0); 
        finalCtx.restore();
    });

    const s = stickers[selectedStickerIndex];
    if (s && selectedStickerIndex !== null) {
        finalCtx.save();
        finalCtx.translate(s.x, s.y);
        finalCtx.rotate(s.rotation);
        
        finalCtx.strokeStyle = CONFIG.handles.colorAccent;
        finalCtx.lineWidth = 4;
        finalCtx.setLineDash([15, 10]); 
        finalCtx.strokeRect(-s.size/2 - 10, -s.size/2 - 10, s.size + 20, s.size + 20);
        finalCtx.setLineDash([]);

        const h = s.size / 2 + CONFIG.handles.offset;
        const r = CONFIG.handles.size;

        finalCtx.fillStyle = CONFIG.handles.colorWhite;
        finalCtx.strokeStyle = CONFIG.handles.colorAccent;
        finalCtx.lineWidth = 3;
        const corners = [ {x: -h, y: -h}, {x: h, y: h}, {x: -h, y: h} ];
        corners.forEach(c => {
            finalCtx.beginPath();
            finalCtx.arc(c.x, c.y, r, 0, Math.PI * 2);
            finalCtx.fill();
            finalCtx.stroke();
        });

        finalCtx.fillStyle = CONFIG.handles.colorDelete; 
        finalCtx.beginPath(); finalCtx.arc(h, -h, r, 0, Math.PI * 2); finalCtx.fill();
        finalCtx.fillStyle = "white"; finalCtx.font = `${r*1.5}px Arial`; finalCtx.fillText('X', h, -h);

        finalCtx.fillStyle = CONFIG.handles.colorAccent;
        finalCtx.beginPath(); finalCtx.arc(0, -h - 60, r, 0, Math.PI * 2); finalCtx.fill();
        finalCtx.strokeStyle = "white"; finalCtx.lineWidth = 4;
        finalCtx.beginPath(); finalCtx.arc(0, -h - 60, r*0.6, 0.2*Math.PI, 1.8*Math.PI); finalCtx.stroke();

        finalCtx.restore();
    }
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = `AidasBooth_${Date.now()}.png`;
    link.href = finalCanvas.toDataURL('image/png', 1.0);
    link.click();
}
