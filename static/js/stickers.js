// --- PIXEL STICKERS ---
// Each sprite is an ASCII grid. Letters o/a/b/c (outline, main, shade, highlight) come from a
// colour family, so every sticker can be recoloured; the other letters are fixed colours.
const PixelStickers = (function () {
    const FAMILIES = {
        pink:     { label: 'Pink',     o: '#6b3550', a: '#f6a5bd', b: '#e07c9d', c: '#ffd6e2' },
        berry:    { label: 'Berry',    o: '#5a1f30', a: '#f0697f', b: '#c9465e', c: '#ff9fb1' },
        peach:    { label: 'Peach',    o: '#6b3a28', a: '#f9bf9a', b: '#e8956a', c: '#ffe1cd' },
        butter:   { label: 'Butter',   o: '#6b4a1c', a: '#fbd96b', b: '#e0ac3a', c: '#fff1b8' },
        mint:     { label: 'Mint',     o: '#2c5a46', a: '#9ddfbd', b: '#67c198', c: '#d3f5e3' },
        sky:      { label: 'Sky',      o: '#2c4568', a: '#a6d0f3', b: '#6fa8dc', c: '#dcefff' },
        lavender: { label: 'Lavender', o: '#47306b', a: '#c3aaf0', b: '#957bd4', c: '#e8dcff' },
        cocoa:    { label: 'Cocoa',    o: '#553423', a: '#d4a27a', b: '#ad7a52', c: '#efcaa6' },
        cream:    { label: 'Cream',    o: '#5b4250', a: '#f7d9c4', b: '#e3b79c', c: '#fffaf3' },
    };

    const FIXED = {
        k: '#3a2a40', w: '#ffffff', p: '#f7a8bd', g: '#9fd68f', G: '#5f9e5c', y: '#fff1a8', Y: '#f2c94c',
    };

    // `family` is the sprite's classic colouring
    const SPRITES = {
        bow: { label: 'Bow', family: 'pink', rows: [
            '.oo.........oo.',
            'ocao.......oaao',
            'occao.....oaaao',
            'ocaaaoooooaaabo',
            'oaaaaoacaoaaabo',
            'oaaaaoaaaoaaabo',
            'obaaaoooooaabbo',
            '.obo.oaaao.obo.',
            '....oao.oao....',
            '...oao...oao...',
            '...ooo...ooo...',
        ] },
        heart: { label: 'Heart', family: 'berry', rows: [
            '.ooo...ooo.',
            'occaoooaaao',
            'occaaoaaaao',
            'ocaaaaaaaao',
            'oaaaaaaaabo',
            '.oaaaaaabo.',
            '..oaaaabo..',
            '...oaabo...',
            '....obo....',
            '.....o.....',
        ] },
        sparkle: { label: 'Sparkle', family: 'butter', rows: [
            '.....o.....',
            '....oco....',
            '....oao....',
            '...ocaao...',
            '.ooccaaaoo.',
            'occaaaaaabo',
            '.ooaaaaboo.',
            '...oaabo...',
            '....oao....',
            '....obo....',
            '.....o.....',
        ] },
        star: { label: 'Star', family: 'butter', rows: [
            '......o......',
            '.....oco.....',
            '.....oao.....',
            '....oacao....',
            'ooooocaaaoooo',
            'oaccaaaaaaabo',
            '.oaaaaaaaabo.',
            '..oaaaaaabo..',
            '.oaaaoooaabo.',
            '.oaao...oabo.',
            'oaao.....obbo',
            'ooo.......ooo',
        ] },
        flower: { label: 'Flower', family: 'pink', rows: [
            '....ooooo....',
            '...ocaaabo...',
            '.oooaaaaaooo.',
            'ocaaoaaaoaabo',
            'oaaaaYYYaaabo',
            'oaaaaYyYaaabo',
            'oaaaaYYYaaabo',
            'obbaoaaaoabbo',
            '.ooobaaabooo.',
            '...oaabbbo...',
            '....ooooo....',
        ] },
        butterfly: { label: 'Butterfly', family: 'lavender', rows: [
            'oo....o.o....oo',
            'ocao...k...oaco',
            'ocaaoo.k.ooaaco',
            'oaaaaaokoaaaaao',
            'oaacaaokoaacaao',
            'oaaaaaokoaaaaao',
            '.obbbbokobbbbo.',
            '..oooookooooo..',
            '...oaaokoaao...',
            '...oabokobao...',
            '....oo.k.oo....',
        ] },
        cloud: { label: 'Cloud', family: 'sky', rows: [
            '....oooo........',
            '...occcao.ooo...',
            '.oooccaaaoocao..',
            'occcaaaaaacaaao.',
            'occaaaaaaaaaaaao',
            'oaaaakaaakaaaabo',
            'obaapaakaapaabbo',
            '.obbbbbbbbbbbbo.',
            '..oooooooooooo..',
        ] },
        teddy: { label: 'Teddy', family: 'cocoa', rows: [
            '.ooo......ooo.',
            'obbao....oabbo',
            'obbaooooooabbo',
            '.oaaaaaaaaaao.',
            'oaaaaaaaaaaaao',
            'oaakaaaaaakaao',
            'oaaaaccccaaaao',
            'oapaackkcaapao',
            'oaaaaccccaaaao',
            '.oaaaaaaaaaao.',
            '..obaaaaaabo..',
            '...oooooooo...',
        ] },
        strawberry: { label: 'Strawberry', family: 'berry', rows: [
            '.....ooo.....',
            '...oogGgoo...',
            '..oggogoggo..',
            '.oaoGGGGGoao.',
            'oacaaaaaaaabo',
            'occayaaayaabo',
            'oaaaaayaaaabo',
            'oayaaaaaayabo',
            '.oaaayaaaabo.',
            '.oayaaaayabo.',
            '..oaaaayabo..',
            '...oaaaabo...',
            '....oabbo....',
            '.....ooo.....',
        ] },
        cherry: { label: 'Cherry', family: 'berry', rows: [
            '........GG...',
            '.......G.G...',
            '......G..G...',
            '.....G...G...',
            '....G....G...',
            '..ooo...ooo..',
            '.occao.occao.',
            'ocaaaoocaaabo',
            'oaaabooaaaabo',
            '.oabo..oabbo.',
            '..oo....ooo..',
        ] },
        crown: { label: 'Crown', family: 'butter', rows: [
            '.o.....o.....o.',
            'oco...oco...oco',
            'oao...oao...oao',
            'oaao.oaaao.oaao',
            'oaaaoaacaaoaaao',
            'oaaaaaaaaaaaaao',
            'oaawaapapaawaao',
            'oaaaaaaaaaaaaao',
            'obbbbbbbbbbbbbo',
            'ooooooooooooooo',
        ] },
        bubble: { label: 'Bubble', family: 'sky', rows: [
            '....oooo....',
            '..oowwccoo..',
            '.owwcccccco.',
            '.owccccccco.',
            'owccccccccco',
            'occcccccccco',
            'occcccccccao',
            'occcccccwcao',
            '.occcccwcao.',
            '.oaccccaaao.',
            '..ooaaaaoo..',
            '....oooo....',
        ] },
        paw: { label: 'Paw', family: 'cocoa', rows: [
            '...oo...oo...',
            '..ocao.ocao..',
            '..oaao.oaao..',
            'oo.oo...oo.oo',
            'ocao.....ocao',
            'oaao.ooo.oaao',
            '.oo.ocaao.oo.',
            '...oaaaaao...',
            '..oaaaaaaao..',
            '..oaaaaaabo..',
            '..oabbbbbbo..',
            '...ooo.ooo...',
        ] },
        bunny: { label: 'Bunny', family: 'cream', rows: [
            '..oo.....oo..',
            '.ocpo...opco.',
            '.ocpo...opco.',
            '.ocpo...opco.',
            '.ocpo...opco.',
            '.ocoooooooco.',
            'occccccccccco',
            'occkcccccckco',
            'ocpcccpcccpco',
            '.occcccccbbo.',
            '..ooooooooo..',
        ] },
        cat: { label: 'Cat', family: 'cream', rows: [
            '.o.........o.',
            'oao.......oao',
            'oaao.....oaao',
            'ocaaoooooaaco',
            'occccccccccco',
            'occkcccccckco',
            'occkcccccckco',
            'ocpccckcccpco',
            '.occckckccbo.',
            '..ooooooooo..',
        ] },
        camera: { label: 'Camera', family: 'mint', rows: [
            '..ooo.....ooo..',
            '..oyo.....owo..',
            'ooooooooooooooo',
            'occccccccccccco',
            'ocaaaoooooaaaao',
            'oaaaokwkkkoaaao',
            'oaaaokkkkkoaaao',
            'oaaaokkkkkoaaao',
            'obbbbooooobbbbo',
            'obbbbbbbbbbbbbo',
            'ooooooooooooooo',
        ] },
    };

    const cache = new Map();

    // Returns a 1px-per-pixel canvas; scale it up with image smoothing off.
    function getCanvas(id, family, border) {
        const key = `${id}|${family}|${border}`;
        if (cache.has(key)) return cache.get(key);

        const sprite = SPRITES[id];
        const fam = FAMILIES[family] || FAMILIES[sprite.family];
        const palette = { ...FIXED, o: fam.o, a: fam.a, b: fam.b, c: fam.c };
        const rows = sprite.rows;
        const w = Math.max(...rows.map(r => r.length)), h = rows.length;
        const pad = border ? 2 : 0;
        const W = w + pad * 2, H = h + pad * 2;

        const filled = (x, y) => {
            const row = rows[y - pad];
            return row !== undefined && x - pad >= 0 && palette[row[x - pad]] !== undefined;
        };

        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        if (border) {
            // die-cut: a soft shadow, then a 1px white margin around the silhouette
            const near = (x, y) => {
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) return true;
                return false;
            };
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                if (near(x, y - 1)) { ctx.fillStyle = 'rgba(60, 40, 70, 0.22)'; ctx.fillRect(x, y, 1, 1); }
            }
            ctx.fillStyle = '#ffffff';
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (near(x, y)) ctx.fillRect(x, y, 1, 1);
        }

        rows.forEach((row, y) => [...row].forEach((ch, x) => {
            if (!palette[ch]) return;
            ctx.fillStyle = palette[ch];
            ctx.fillRect(x + pad, y + pad, 1, 1);
        }));

        cache.set(key, canvas);
        return canvas;
    }

    function previewURL(id, family, border) {
        const src = getCanvas(id, family, border), scale = 6;
        const c = document.createElement('canvas');
        c.width = src.width * scale; c.height = src.height * scale;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, 0, 0, c.width, c.height);
        return c.toDataURL();
    }

    return { FAMILIES, SPRITES, getCanvas, previewURL };
})();
