// --- PIXEL-ART SCENERY ---
// Draws the backdrop (string lights, clouds, hills, flowers) and the landing sprites (booth, curtain, cat)
// into pixel buffers, then emits one <path> per colour. Everything shares one art pixel (--px).
// Backdrop colours are CSS variables (--c-*), so dark mode repaints it without redrawing.
(function () {
    function rng(seed) {
        return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    }

    class Pixels {
        constructor(w, h) { this.w = w; this.h = h; this.buf = new Array(w * h).fill(null); }
        get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? null : this.buf[y * this.w + x]; }
        set(x, y, c) {
            x = Math.round(x); y = Math.round(y);
            if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.buf[y * this.w + x] = c;
        }
        rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
        frame(x, y, w, h, c) {
            this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c);
            this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c);
        }
        sprite(x, y, rows, key) {
            rows.forEach((row, j) => [...row].forEach((ch, i) => { if (key[ch]) this.set(x + i, y + j, key[ch]); }));
        }
        // Ink outline around every filled shape (4-neighbour edge detection)
        outline(c) {
            const edge = [];
            for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
                if (this.get(x, y) && (!this.get(x - 1, y) || !this.get(x + 1, y) || !this.get(x, y - 1) || !this.get(x, y + 1))) edge.push([x, y]);
            }
            edge.forEach(([x, y]) => this.set(x, y, c));
        }
        toSVG() {
            const runs = {};
            for (let y = 0; y < this.h; y++) {
                let x = 0;
                while (x < this.w) {
                    const c = this.buf[y * this.w + x];
                    let end = x + 1;
                    while (end < this.w && this.buf[y * this.w + end] === c) end++;
                    if (c) (runs[c] = runs[c] || []).push(`M${x} ${y}h${end - x}v1h${x - end}z`);
                    x = end;
                }
            }
            return Object.entries(runs)
                .map(([c, d]) => `<path class="c-${c}" style="fill:var(--c-${c})" d="${d.join('')}"/>`).join('');
        }
    }

    const dots = pts => pts.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
    const gauss = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

    // The backdrop is laid out in a 320-wide "design" space (the old cover-scaled layout) but drawn
    // on the real art grid, where one pixel is exactly --px screen pixels, so it matches every
    // other sprite. Shapes scale with the screen; small sprites (bulbs, flowers) stay 1:1.
    function metrics() {
        const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
        const vw = window.innerWidth, vh = window.innerHeight;
        const f = Math.max(vw / 320, vh * 0.005) / px;      // art pixels per design unit
        const W = Math.ceil(vw / px) + 1;
        return { px, f, W, skyH: Math.ceil(70 * f), groundH: Math.ceil(110 * f), left: Math.floor((vw - W * px) / 2) };
    }

    function sizeSVG(svg, w, h, m) {
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.style.width = `${w * m.px}px`;
        svg.style.height = `${h * m.px}px`;
        svg.style.left = `${m.left}px`;
    }

    // Stepped two-ring halo, in three groups so the bulbs don't all pulse together
    function halo(p, cx, cy, group) {
        for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d <= 3.6) p.set(x, y, 'g2' + group);
            else if (d <= 6 && !(p.get(x, y) || '').startsWith('g2')) p.set(x, y, 'g1' + group);
        }
    }

    // --- SKY: string lights, confetti, sparkles, stars ---
    function drawSky(svg, m) {
        const { f, W } = m, H = m.skyH, r = rng(11), p = new Pixels(W, H);
        const X = xd => Math.round((xd - 160) * f + W / 2), Y = yd => Math.round(yd * f);
        const area = (W * H) / (320 * 70);

        for (let i = 0; i < 70 * area; i++) p.set(r() * W, r() * (H - 4), 'star');
        for (let i = 0; i < 150 * area; i++) {
            const x = r() * W, y = 6 * f + r() * (H - 8 * f), c = 'cf' + (1 + Math.floor(r() * 4)), roll = r();
            p.set(x, y, c);
            if (roll < 0.4) p.set(x + 1, y, c); else if (roll < 0.6) p.set(x, y + 1, c);
        }

        const bulbs = [];
        function strand(x0, y0, x1, y1, sag, gap) {
            x0 = X(x0); x1 = X(x1); y0 = Y(y0); y1 = Y(y1); sag *= f; gap *= f;
            const yAt = x => { const t = (x - x0) / (x1 - x0); return Math.round(y0 + (y1 - y0) * t + 4 * sag * t * (1 - t)); };
            let prev = yAt(x0);
            for (let x = x0; x <= x1; x++) {
                const y = yAt(x);
                if (y > prev) for (let yy = prev + 1; yy <= y; yy++) p.set(x, yy, 'wire');
                else if (y < prev) for (let yy = y; yy < prev; yy++) p.set(x, yy, 'wire');
                else p.set(x, y, 'wire');
                prev = y;
            }
            for (let x = x0 + gap / 2; x < x1 - 2; x += gap) bulbs.push([Math.round(x), yAt(Math.round(x))]);
        }
        strand(-2, 1, 162, 5, 24, 11);
        strand(158, 5, 322, 0, 21, 11);

        bulbs.forEach(([bx, by], i) => halo(p, bx, by + 3, 'abc'[i % 3]));
        bulbs.forEach(([bx, by]) => {
            p.set(bx, by + 1, 'sock');
            p.rect(bx - 1, by + 2, 3, 3, 'bulb');
            p.set(bx, by + 5, 'bulb');
            p.set(bx, by + 3, 'core');
        });

        let sparkles = '';
        for (let i = 0; i < 12 * W / (320 * f); i++) {
            const x = Math.round(8 + r() * (W - 16)), y = Math.round(16 * f + r() * (H - 22 * f)), arm = r() < 0.45 ? 3 : 2;
            const pts = [[x, y]];
            for (let a = 1; a <= arm; a++) pts.push([x + a, y], [x - a, y], [x, y + a], [x, y - a]);
            sparkles += `<path class="twinkle" style="fill:var(--c-spk);animation-delay:${(-r() * 3).toFixed(2)}s" d="${dots(pts)}"/>`;
        }

        sizeSVG(svg, W, H, m);
        svg.innerHTML = p.toSVG() + sparkles;
    }

    // --- GROUND: clouds, rolling hills, flowers, grass ---
    function drawGround(svg, m) {
        const { f, W } = m, H = m.groundH, r = rng(5), p = new Pixels(W, H);
        const X = xd => Math.round((xd - 160) * f + W / 2), Y = yd => Math.round(H - (110 - yd) * f);
        const xd = x => (x - W / 2) / f + 160;
        const area = (W * H) / (320 * 110);

        function cloud(design) {
            const circles = design.map(([cx, cy, rad]) => [X(cx), Y(cy), rad * f]);
            const inside = (x, y) => circles.some(([cx, cy, rad]) => (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad);
            const x0 = Math.min(...circles.map(c => c[0] - c[2])), x1 = Math.max(...circles.map(c => c[0] + c[2]));
            const y0 = Math.min(...circles.map(c => c[1] - c[2])), y1 = Math.max(...circles.map(c => c[1] + c[2]));
            for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W, x1); x++) {
                if (!inside(x, y)) continue;
                let c = 'cl2';
                if (!inside(x + 2, y + 1) || !inside(x, y + 3)) c = 'cl3';
                // light rim on top of the whole cloud, plus on the upper arc of each front puff
                const puffRim = circles.some(([cx, cy, rad], i) => {
                    const d = Math.hypot(x - cx, y - cy);
                    return i > 0 && y < cy - 1 && d > rad - 1.3 && d <= rad &&
                        circles.slice(0, i).some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br);
                });
                if (!inside(x, y - 2) || puffRim) c = 'cl1';
                p.set(x, y, c);
            }
        }
        cloud([[-12, 42, 22], [10, 54, 20], [36, 44, 17], [60, 54, 14], [80, 61, 11]]);
        cloud([[330, 32, 20], [312, 46, 20], [288, 40, 19], [264, 50, 16], [244, 60, 12]]);
        cloud([[150, 66, 9], [166, 61, 11], [183, 67, 8]]);

        function hill(topFn, body, rim, rimH) {
            for (let x = 0; x < W; x++) {
                const t = Y(topFn(xd(x)));
                for (let y = Math.max(0, t); y < H; y++) p.set(x, y, y < t + rimH ? rim : body);
            }
        }
        const farTop = x => 76 - 22 * gauss(x, 268, 34) - 15 * gauss(x, 214, 28) - 11 * gauss(x, 42, 40) - 6 * gauss(x, 122, 24) + Math.sin(x / 7);
        const midTop = x => 86 - 10 * gauss(x, 30, 45) - 8 * gauss(x, 145, 50) - 9 * gauss(x, 300, 40) + 1.5 * Math.sin(x / 11);
        const meadowTop = x => 95 - 5 * gauss(x, 90, 60) - 4 * gauss(x, 250, 50) + 1.2 * Math.sin(x / 9);

        hill(farTop, 'hf', 'hf2', 2);
        hill(midTop, 'hm', 'hm2', 2);

        // tiny far-away flowers on the green hills
        for (let i = 0; i < 80 * area; i++) {
            const x = Math.floor(r() * W), y = Y(midTop(xd(x))) + Math.round((3 + r() * 9) * f);
            p.set(x, y, ['fp', 'fv', 'fy'][Math.floor(r() * 3)]);
        }

        hill(meadowTop, 'mf', 'mf2', 2);
        for (let i = 0; i < 90 * area; i++) {
            const x = Math.floor(r() * W), y = Y(meadowTop(xd(x))) + Math.round((2 + r() * 12) * f);
            p.sprite(x, y, r() < 0.5 ? ['g.g', '.g.'] : ['.g', 'gg'], { g: r() < 0.7 ? 'gr' : 'gr2' });
        }

        const pickX = () => { let x; do { x = r() * W; } while (Math.abs(x - W / 2) < 60 * f && r() < 0.65); return Math.round(x); };
        const COLORS = [{ p: 'fp', d: 'fpd', c: 'fy' }, { p: 'fv', d: 'fvd', c: 'fy' }, { p: 'fy', d: 'fyd', c: 'fpd' }];
        const TULIP = ['pdp', 'ppp', '.s.', '.sl', '.s.'];
        const ROSE = ['.ppp.', 'ppdpp', 'pdcdp', 'ppdpp', '.ppp.', '..s..', '.ls..', '..sl.', '..s..'];
        const flowers = [];
        for (let i = 0; i < 44 * area; i++) flowers.push({ x: pickX(), y: Y(86 + r() * 12), rows: TULIP, col: COLORS[Math.floor(r() * 3)] });
        for (let i = 0; i < 34 * area; i++) flowers.push({ x: pickX(), y: Y(94 + r() * 11), rows: ROSE, col: COLORS[Math.floor(r() * 3)] });
        flowers.sort((a, b) => a.y - b.y).forEach(fl =>
            p.sprite(fl.x, fl.y, fl.rows, { p: fl.col.p, d: fl.col.d, c: fl.col.c, s: 'fs', l: 'fl' }));

        // dark grass blades along the bottom edge
        for (let i = 0; i < 170 * W / 320; i++) {
            const x = Math.floor(r() * W), h = 2 + Math.floor(r() * 4 * f);
            p.rect(x, H - h, 1, h, 'gr');
        }

        sizeSVG(svg, W, H, m);
        svg.innerHTML = p.toSVG();
    }

    // --- LANDING SPRITES ---
    // Higher-detail than the backdrop, with fixed colours (dark mode dims them with a CSS filter).
    const PROP_COLORS = {
        ink: '#4b3550', shd: 'rgba(75, 53, 80, 0.22)',
        // booth
        pk1: '#f5a3c0', pk2: '#e783a8', pk3: '#ffc6da', pk4: '#d86c95',
        rf1: '#5d8b8c', rf2: '#3f6668', rf3: '#8ebcb9',
        sg1: '#c9524f', sg2: '#e57b70', sg3: '#93333a', sgc: '#fff3dc', sgc2: '#f0dcc0', sgt: '#6b2f3c',
        sgb: '#f4eff1', sgb2: '#d9d0d8',
        aw1: '#f08cb2', aw1d: '#d96d97', aw2: '#fff5f5', aw2d: '#ead6dc',
        in1: '#b9433f', in2: '#8c2e31', in3: '#cf5a4d',
        cr1: '#fff4e1', cr2: '#efdfc6', cr3: '#dcc6a6', cr4: '#b89c80',
        st1: '#f4f0f2', st2: '#d2c9d2', st3: '#ffffff',
        fl1: '#30283a', fl2: '#f6f0e8', fl3: '#5a4c62',
        bs1: '#4a4157', bs2: '#352e40', bs3: '#655a73',
        pst: '#fff7e8', pst2: '#efe0c8', nv1: '#34405f', cl1: '#f6a5bd', cl2: '#9ddfbd',
        or1: '#f59a4a', or2: '#c9692a',
        cb1: '#a7aeb3', cb2: '#737b81', cb3: '#d3d8db',
        bl1: '#7d9df0', bl2: '#5574c8',
        sy1: '#f9d96b', sy2: '#e0ac3a', sy3: '#fff1b0',
        // cat
        o: '#4b3550', W: '#fffdf9', w: '#f1ebe8', g: '#dcd3d1', G: '#bdb2b3',
        f: '#e2dad8', F: '#c3b8b9', p: '#f7a1aa', P: '#e27d8b', e: '#3a2a40', s: '#ffffff',
        n: '#f07f95', b: '#fbc4cf', cc: '#f08cb2', cy: '#f9d96b', cyd: '#d9a636',
    };

    const GLYPHS = {
        P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
        H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
        O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
        T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
        B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    };
    const STAR5 = ['..a..', '.aba.', 'abbba', '.aba.', '.a.a.'];
    const SMILEY9 = ['..ooooo..', '.oyyyyyo.', 'oyhyyyyyo', 'oyyoyoyyo', 'oyyoyoyyo', 'oyyyyyyYo', 'oyoyyyoYo', '.oyoooYo.', '..ooooo..'];
    const SMILEY_KEY = { o: 'ink', y: 'sy1', Y: 'sy2', h: 'sy3' };

    function text(p, str, x, y, c) {
        [...str].forEach((ch, i) => GLYPHS[ch].forEach((row, j) =>
            [...row].forEach((bit, k) => { if (bit === '1') p.set(x + i * 6 + k, y + j, c); })));
    }
    function disc(p, cx, cy, r, fill, shade, line) {
        for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            if (d <= r) p.set(x, y, (x + 0.5 - cx) + (y + 0.5 - cy) > r * 0.7 ? shade : fill);
            else if (d <= r + 1) p.set(x, y, line);
        }
    }
    function smiley(p, cx, cy, r) {
        disc(p, cx, cy, r, 'sy1', 'sy2', 'ink');
        const e = Math.max(1, Math.round(r * 0.4));
        p.rect(Math.round(cx - e - 1), Math.round(cy - r * 0.35), 1, r > 5 ? 2 : 1, 'ink');
        p.rect(Math.round(cx + e), Math.round(cy - r * 0.35), 1, r > 5 ? 2 : 1, 'ink');
        const my = Math.round(cy + r * 0.3);
        p.rect(Math.round(cx - e), my + 1, e * 2, 1, 'ink');
        p.set(Math.round(cx - e - 1), my, 'ink'); p.set(Math.round(cx + e), my, 'ink');
    }
    const star = (p, x, y) => p.sprite(x, y, STAR5, { a: 'sy2', b: 'sy1' });

    function toSVGFixed(p) {
        return p.toSVG().replace(/style="fill:var\(--c-([\w]+)\)"/g, (_, c) => `fill="${PROP_COLORS[c]}"`);
    }

    // Photobooth: marquee sign, roof, polka-dot panel with poster + coin slot, striped awning,
    // curtained doorway with a red interior and checkered floor.
    function drawBooth(svg) {
        const W = 112, H = 134, p = new Pixels(W, H);
        const box = (x, y, w, h, fill, line) => { p.rect(x, y, w, h, fill); if (line) p.frame(x, y, w, h, line); };

        p.rect(6, 130, 100, 2, 'shd'); p.rect(14, 132, 84, 1, 'shd');

        // base platform
        box(2, 121, 108, 9, 'bs1', 'ink'); p.rect(3, 122, 106, 1, 'bs3'); p.rect(3, 127, 106, 2, 'bs2');

        // body with polka-dot texture
        box(6, 32, 100, 90, 'pk1', 'ink');
        for (let y = 33; y < 121; y++) for (let x = 7; x < 105; x++) {
            if ((x % 4 === 0 && y % 4 === 0) || ((x + 2) % 4 === 0 && (y + 2) % 4 === 0)) p.set(x, y, 'pk2');
        }
        p.rect(7, 33, 1, 88, 'pk3');
        p.rect(7, 33, 98, 2, 'pk4');

        // roof slab + sign band
        box(1, 26, 110, 7, 'rf1', 'ink'); p.rect(2, 27, 108, 1, 'rf3'); p.rect(2, 31, 108, 1, 'rf2');
        box(30, 21, 52, 6, 'sgb', 'ink'); p.rect(31, 25, 50, 1, 'sgb2');

        // marquee sign
        box(12, 0, 88, 22, 'sg1', 'ink');
        p.rect(13, 1, 86, 1, 'sg2'); p.rect(13, 19, 86, 2, 'sg3');
        box(15, 3, 82, 16, 'sgc', 'sg3'); p.rect(16, 4, 80, 1, 'sgc2');
        text(p, 'PHOTOBOOTH', 27, 7, 'sgt');
        p.sprite(17, 6, SMILEY9, SMILEY_KEY);
        p.sprite(87, 8, STAR5, { a: 'sy2', b: 'sy1' });

        // doorway: awning, interior, open curtains, seat, checkered floor
        p.rect(59, 47, 38, 63, 'in1');
        p.rect(59, 47, 38, 9, 'in2');
        for (let x = 59; x < 97; x++) { if (x % 2) p.set(x, 56, 'in2'); else p.set(x, 57, 'in2'); }
        p.rect(59, 47, 2, 63, 'in2');
        p.rect(95, 56, 2, 54, 'in3');
        box(84, 92, 11, 18, 'st1', 'ink'); p.rect(85, 93, 9, 1, 'st3'); p.rect(93, 94, 1, 15, 'st2');
        for (let y = 110; y < 118; y++) for (let x = 59; x < 97; x++) {
            p.set(x, y, (Math.floor((x - 59) / 3) + Math.floor((y - 110) / 3)) % 2 ? 'fl1' : 'fl2');
        }
        p.rect(59, 109, 38, 1, 'fl3');

        const curtain = (x0, x1, outerLeft) => {
            for (let x = x0; x <= x1; x++) {
                const t = outerLeft ? x - x0 : x1 - x;
                const yb = 84 - Math.round(t * 0.55);
                for (let y = 47; y <= yb; y++) {
                    let c = 'cr1';
                    if (t % 4 === 3) c = 'cr2';
                    if (t % 4 === 0 && t > 0) c = 'cr3';
                    if (y >= yb - 1) c = 'cr3';
                    p.set(x, y, c);
                }
                p.set(x, yb + 1, 'cr4');
            }
            const edge = outerLeft ? x1 : x0;
            for (let y = 47; y <= 84 - Math.round((x1 - x0) * 0.55); y++) p.set(edge, y, 'cr4');
        };
        curtain(59, 75, true);
        curtain(80, 96, false);

        for (let x = 59; x < 97; x++) {
            const stripe = Math.floor((x - 59) / 4), mid = (x - 59) % 4 === 1 || (x - 59) % 4 === 2;
            const light = stripe % 2 === 1;
            p.rect(x, 35, 1, 11, light ? 'aw2' : 'aw1');
            p.set(x, 35, light ? 'aw2d' : 'aw1d');
            p.set(x, 45, light ? 'aw2d' : 'aw1d');
            if (mid) { p.set(x, 46, light ? 'aw2d' : 'aw1d'); p.set(x, 47, 'ink'); } else p.set(x, 46, 'ink');
        }
        p.frame(58, 34, 40, 84, 'ink');

        // poster with photostrips, a smiley and a price burst
        p.rect(15, 42, 31, 41, 'pk4');
        box(13, 40, 31, 41, 'pst', 'ink'); p.frame(14, 41, 29, 39, 'pst2');
        box(17, 45, 9, 30, 'nv1', 'ink');
        for (let i = 0; i < 4; i++) p.rect(19, 47 + i * 7, 5, 5, i % 2 ? 'cl2' : 'cl1');
        box(30, 50, 9, 28, 'nv1', 'ink');
        for (let i = 0; i < 4; i++) p.rect(32, 52 + i * 6 + (i > 1 ? 1 : 0), 5, 5, i % 2 ? 'cl1' : 'cl2');
        p.sprite(33, 41, SMILEY9, SMILEY_KEY);
        disc(p, 21.5, 75.5, 4, 'or1', 'or1', 'or2');
        [[17, 71], [26, 71], [17, 80], [26, 80], [21, 69], [21, 82], [15, 75], [28, 75]].forEach(([x, y]) => p.set(x, y, 'or2'));
        p.sprite(19, 74, ['s.s', 'sss', '.s.'], { s: 'st3' });

        // coin box with an arrow pointing at it
        box(26, 88, 11, 14, 'cb1', 'ink'); p.rect(27, 89, 9, 1, 'cb3'); p.rect(35, 90, 1, 11, 'cb2');
        p.rect(31, 91, 1, 5, 'ink');
        box(29, 97, 5, 3, 'cb2', 'ink');
        p.sprite(40, 92, ['..bb..', '.bbbbb', 'bbbBBB', '.bBBBB', '..BB..'], { b: 'bl1', B: 'bl2' });

        smiley(p, 15, 111, 7);
        [[9, 37], [47, 37], [49, 60], [9, 86], [45, 104], [50, 82], [99, 41], [100, 74], [99, 102], [25, 106]].forEach(([x, y]) => star(p, x, y));

        svg.innerHTML = toSVGFixed(p);
    }

    // The curtain that drops over the doorway once the cat is inside
    function drawDropCurtain(svg) {
        const p = new Pixels(38, 63);
        for (let x = 0; x < 38; x++) for (let y = 0; y < 63; y++) {
            let c = 'cr1';
            if (x % 5 === 3) c = 'cr2';
            if (x % 5 === 4) c = 'cr3';
            if (y >= 61 - (x % 5 === 1 ? 1 : 0)) c = 'cr3';
            p.set(x, y, c);
        }
        p.rect(0, 0, 38, 2, 'cr3');
        p.rect(18, 0, 1, 61, 'cr4');
        svg.innerHTML = toSVGFixed(p);
    }

    // --- CAT (side view, facing left) ---
    // Built from shapes, then shaded and outlined pixel by pixel. Poses swap the legs.
    const CAT_POSES = {
        idle: { front: [[17, 20, 16, 28.5], [32, 20, 33, 28.5]], back: [[13, 20, 12, 28.5], [28, 20, 28.5, 28.5]] },
        run1: { front: [[15, 21, 6.5, 27.5], [32, 21, 40.5, 27.5]], back: [[13, 20, 3.5, 25], [30, 20, 38.5, 25]] },
        run2: { front: [[17, 21, 20.5, 28.5], [31, 21, 26.5, 28.5]], back: [[14, 21, 17.5, 28], [33, 20, 29.5, 27.5]] },
    };

    // k scales the shapes, not the pixels: k = 0.75 draws a smaller cat at the same pixel size
    function catFrame(pose, blink, k = 1) {
        const OX = 2, OY = 1, W = Math.ceil(44 * k) + 4, H = Math.ceil(32 * k) + 2, p = new Pixels(W, H), legs = CAT_POSES[pose];
        const q = v => Math.round(v * k), d = 1 / k;
        const put = (x, y, c) => p.set(x + OX, y + OY, c);
        const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
        const seg = (x, y, x1, y1, x2, y2) => {
            const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
        };
        const tri = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
            const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
            const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
            const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
            return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
        };
        const shrink = (t, k) => {
            const mx = (t[0][0] + t[1][0] + t[2][0]) / 3, my = (t[0][1] + t[1][1] + t[2][1]) / 3;
            return t.map(([x, y]) => [mx + (x - mx) * k, my + (y - my) * k + 0.6]);
        };
        const EARS = [[[2.5, 0.5], [1, 9], [9, 6]], [[15, 1], [10.5, 6], [18, 8.5]]];
        const head = (x, y) => ell(x, y, 10, 12.5, 9, 7.6) || ell(x, y, 9.5, 15.3, 8.6, 3.8) || EARS.some(t => tri(x, y, ...t));
        const body = (x, y) => ell(x, y, 26, 17.6, 11.5, 6.4) || ell(x, y, 17.5, 18.5, 6.5, 6);
        const tail = (x, y) => seg(x, y, 35, 15, 38, 9.5) <= 2.3 || seg(x, y, 38, 9.5, 40, 4) <= 2.1 || seg(x, y, 40, 4, 41.5, 1.8) <= 1.8;
        const leg = (x, y, [x1, y1, x2, y2]) => seg(x, y, x1, y1, x2, y2) <= 2 || ell(x, y, x2 - 0.7, y2 + 0.6, 2.7, 1.9);
        const nearLeg = (x, y) => legs.front.some(l => leg(x, y, l));
        const farLeg = (x, y) => legs.back.some(l => leg(x, y, l));
        const front = (x, y) => head(x, y) || body(x, y) || tail(x, y) || nearLeg(x, y);

        const F = [], B = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const cx = (x + 0.5 - OX) * d, cy = (y + 0.5 - OY) * d;
            F[y * W + x] = front(cx, cy);
            B[y * W + x] = !F[y * W + x] && farLeg(cx, cy);
        }
        const inF = (x, y) => x >= 0 && y >= 0 && x < W && y < H && F[y * W + x];
        const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H && B[y * W + x];
        const any = (x, y) => inF(x, y) || inB(x, y);

        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const cx = (x + 0.5 - OX) * d, cy = (y + 0.5 - OY) * d;
            if (inF(x, y)) {
                let c = 'W';
                if (body(cx, cy) && !head(cx, cy) && cy > 20) c = 'w';
                if (!inF(x, y + 2) || (!inF(x + 1, y) && cy > 14)) c = 'g';
                if (!inF(x, y + 1)) c = 'G';
                if (head(cx, cy) && !head(cx, cy + d) && inF(x, y + 1)) c = 'g';
                if (nearLeg(cx, cy) && !nearLeg(cx + d, cy) && !head(cx, cy)) c = 'g';
                p.set(x, y, c);
            } else if (inB(x, y)) {
                p.set(x, y, (!inB(x, y + 1) || !inB(x + 1, y)) ? 'F' : 'f');
                if (inF(x - 1, y) || inF(x + 1, y) || inF(x, y - 1)) p.set(x, y, 'o');
            } else if (any(x - 1, y) || any(x + 1, y) || any(x, y - 1) || any(x, y + 1)) {
                p.set(x, y, 'o');
            }
        }

        // ear insides
        EARS.forEach((t, i) => {
            const inner = shrink(t, 0.5);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                if (tri((x + 0.5) * d, (y + 0.5) * d, ...inner)) put(x, y, y * d > inner[1][1] - 2.5 ? 'P' : 'p');
            }
        });

        // face (simplified when the cat is drawn smaller, so details stay whole pixels)
        const big = k > 0.9;
        [[5, 10], [12, 10]].forEach(([ex, ey]) => {
            const x = q(ex), y = q(ey);
            if (!big) { put(x, y + (blink ? 1 : 0), 'e'); if (!blink) put(x, y + 1, 'e'); return; }
            if (blink) { put(x, y + 2, 'e'); put(x + 1, y + 2, 'e'); return; }
            for (let j = 0; j < 3; j++) { put(x, y + j, 'e'); put(x + 1, y + j, 'e'); }
            put(x, y, 's');
        });
        if (big) {
            put(8, 13, 'n'); put(9, 13, 'n');
            put(7, 14, 'o'); put(8, 15, 'o'); put(9, 15, 'o'); put(10, 14, 'o');
            put(3, 13, 'b'); put(4, 13, 'b'); put(14, 13, 'b'); put(15, 13, 'b');
        } else {
            put(q(8.5), q(13), 'n');
            put(q(3.5), q(13), 'b'); put(q(14.5), q(13), 'b');
        }

        // pink collar hugging the bottom of the head, with a little bell
        for (let x = q(7); x <= q(16); x++) {
            let y = 0;
            while (y < H && !(head((x + 0.5) * d, (y + 0.5) * d) && !head((x + 0.5) * d, (y + 1.5) * d))) y++;
            if (y < H - 2) { put(x, y + 1, 'cc'); if (big && x > 8 && x < 15) put(x, y + 2, 'cc'); }
        }
        if (big) { put(11, 22, 'cy'); put(12, 22, 'cy'); put(11, 23, 'cyd'); put(12, 23, 'cy'); }
        else put(q(11.5), q(21) + 1, 'cy');

        return p;
    }

    function drawCat(svg) {
        const frame = (cls, pose, blink) => `<g class="${cls}">${toSVGFixed(catFrame(pose, blink))}</g>`;
        svg.innerHTML = frame('cat-idle', 'idle', false) + frame('cat-blink', 'idle', true) +
            frame('cat-run1', 'run1', false) + frame('cat-run2', 'run2', false);
    }

    // The same cat drawn smaller (not scaled), standing inside the doorway further from the viewer
    function drawCatInside(svg) {
        const p = catFrame('idle', false, 0.75);
        svg.setAttribute('viewBox', `0 0 ${p.w} ${p.h}`);
        svg.style.setProperty('--sw', p.w);
        svg.style.setProperty('--sh', p.h);
        svg.innerHTML = toSVGFixed(p);
    }

    const el = id => document.getElementById(id);

    // Place the booth group on whole pixels in phase with the backdrop grid, so every art pixel
    // renders exactly --px wide (a fractional offset makes some pixels thinner than others)
    function placeProps(m) {
        const props = document.querySelector('.landing-props');
        if (!props) return;
        const vw = window.innerWidth, width = 152 * m.px;
        const wanted = vw <= 1000 ? (vw - width) / 2 : vw / 2 - width + 8 * m.px - 0.03 * vw;
        props.style.left = `${m.left + Math.round((wanted - m.left) / m.px) * m.px}px`;
        props.style.transform = 'none';
    }

    let last = '';
    function drawBackdrop() {
        const m = metrics(), key = `${m.px}|${m.W}|${m.skyH}|${m.groundH}|${m.left}`;
        placeProps(m);
        if (key === last) return;
        last = key;
        if (el('scene-sky')) drawSky(el('scene-sky'), m);
        if (el('scene-ground')) drawGround(el('scene-ground'), m);
    }
    drawBackdrop();
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawBackdrop, 150); });

    if (el('sprite-booth')) drawBooth(el('sprite-booth'));
    if (el('sprite-cat')) drawCat(el('sprite-cat'));
    if (el('sprite-cat-inside')) drawCatInside(el('sprite-cat-inside'));
    if (el('sprite-curtain')) drawDropCurtain(el('sprite-curtain'));
})();
