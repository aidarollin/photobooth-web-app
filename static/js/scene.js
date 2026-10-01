// --- PIXEL-ART SCENERY ---
// Draws the backdrop (string lights, clouds, hills, flowers) and the landing sprites (booth + cat)
// into pixel buffers, then emits one <path> per colour. Colours are CSS variables (--c-*), so
// dark mode repaints the whole scene without redrawing it.
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

    // --- SKY: string lights, confetti, sparkles, stars ---
    function drawSky(svg) {
        const W = 320, H = 70, r = rng(11), p = new Pixels(W, H), glows = [];

        for (let i = 0; i < 70; i++) p.set(r() * W, r() * (H - 4), 'star');
        for (let i = 0; i < 150; i++) {
            const x = r() * W, y = 6 + r() * (H - 8), c = 'cf' + (1 + Math.floor(r() * 4)), roll = r();
            p.set(x, y, c);
            if (roll < 0.4) p.set(x + 1, y, c); else if (roll < 0.6) p.set(x, y + 1, c);
        }

        function strand(x0, y0, x1, y1, sag, gap) {
            const yAt = x => { const t = (x - x0) / (x1 - x0); return Math.round(y0 + (y1 - y0) * t + 4 * sag * t * (1 - t)); };
            let prev = yAt(x0);
            for (let x = x0; x <= x1; x++) {
                const y = yAt(x);
                if (y > prev) for (let yy = prev + 1; yy <= y; yy++) p.set(x, yy, 'wire');
                else if (y < prev) for (let yy = y; yy < prev; yy++) p.set(x, yy, 'wire');
                else p.set(x, y, 'wire');
                prev = y;
            }
            for (let x = x0 + gap / 2; x < x1 - 2; x += gap) {
                const bx = Math.round(x), by = yAt(bx);
                p.set(bx, by + 1, 'sock');
                p.rect(bx - 1, by + 2, 3, 3, 'bulb');
                p.set(bx, by + 5, 'bulb');
                p.set(bx, by + 3, 'core');
                glows.push([bx + 0.5, by + 3.5]);
            }
        }
        strand(-2, 1, 162, 5, 24, 11);
        strand(158, 5, 322, 0, 21, 11);

        let sparkles = '';
        for (let i = 0; i < 12; i++) {
            const x = Math.round(8 + r() * (W - 16)), y = Math.round(16 + r() * (H - 22)), arm = r() < 0.45 ? 2 : 1;
            const pts = [[x, y]];
            for (let a = 1; a <= arm; a++) pts.push([x + a, y], [x - a, y], [x, y + a], [x, y - a]);
            sparkles += `<path class="twinkle" style="fill:var(--c-spk);animation-delay:${(-r() * 3).toFixed(2)}s" d="${dots(pts)}"/>`;
        }

        const glowSVG = glows.map(([x, y], i) =>
            `<circle class="glow" cx="${x}" cy="${y}" r="6.5" fill="url(#bulb-glow)" shape-rendering="auto" style="animation-delay:${(-(i * 0.37) % 3).toFixed(2)}s"/>`).join('');

        svg.innerHTML =
            `<defs><radialGradient id="bulb-glow">` +
            `<stop offset="0" style="stop-color:var(--c-glow);stop-opacity:.85"/>` +
            `<stop offset="1" style="stop-color:var(--c-glow);stop-opacity:0"/>` +
            `</radialGradient></defs>` + glowSVG + p.toSVG() + sparkles;
    }

    // --- GROUND: clouds, rolling hills, flowers, grass ---
    function drawGround(svg) {
        const W = 320, H = 110, r = rng(5), p = new Pixels(W, H);

        function cloud(circles) {
            const inside = (x, y) => circles.some(([cx, cy, rad]) => (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad);
            const x0 = Math.min(...circles.map(c => c[0] - c[2])), x1 = Math.max(...circles.map(c => c[0] + c[2]));
            const y0 = Math.min(...circles.map(c => c[1] - c[2])), y1 = Math.max(...circles.map(c => c[1] + c[2]));
            for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
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
                const t = Math.round(topFn(x));
                for (let y = t; y < H; y++) p.set(x, y, y < t + rimH ? rim : body);
            }
        }
        const farTop = x => 76 - 22 * gauss(x, 268, 34) - 15 * gauss(x, 214, 28) - 11 * gauss(x, 42, 40) - 6 * gauss(x, 122, 24) + Math.sin(x / 7);
        const midTop = x => 86 - 10 * gauss(x, 30, 45) - 8 * gauss(x, 145, 50) - 9 * gauss(x, 300, 40) + 1.5 * Math.sin(x / 11);
        const meadowTop = x => 95 - 5 * gauss(x, 90, 60) - 4 * gauss(x, 250, 50) + 1.2 * Math.sin(x / 9);

        hill(farTop, 'hf', 'hf2', 2);
        hill(midTop, 'hm', 'hm2', 2);

        // tiny far-away flowers on the green hills
        for (let i = 0; i < 80; i++) {
            const x = Math.floor(r() * W), top = Math.round(midTop(x)), y = top + 3 + Math.floor(r() * 9);
            p.set(x, y, ['fp', 'fv', 'fy'][Math.floor(r() * 3)]);
        }

        hill(meadowTop, 'mf', 'mf2', 1);
        for (let i = 0; i < 90; i++) {
            const x = Math.floor(r() * W), y = Math.round(meadowTop(x)) + 2 + Math.floor(r() * 12);
            p.sprite(x, y, r() < 0.5 ? ['g.g', '.g.'] : ['.g', 'gg'], { g: r() < 0.7 ? 'gr' : 'gr2' });
        }

        const pickX = () => { let x; do { x = r() * W; } while (Math.abs(x - 160) < 60 && r() < 0.65); return Math.round(x); };
        const COLORS = [{ p: 'fp', d: 'fpd', c: 'fy' }, { p: 'fv', d: 'fvd', c: 'fy' }, { p: 'fy', d: 'fyd', c: 'fpd' }];
        const TULIP = ['pdp', 'ppp', '.s.', '.sl', '.s.'];
        const ROSE = ['.ppp.', 'ppdpp', 'pdcdp', 'ppdpp', '.ppp.', '..s..', '.ls..', '..sl.', '..s..'];
        const flowers = [];
        for (let i = 0; i < 44; i++) flowers.push({ x: pickX(), y: 86 + Math.floor(r() * 12), rows: TULIP, col: COLORS[Math.floor(r() * 3)] });
        for (let i = 0; i < 34; i++) flowers.push({ x: pickX(), y: 94 + Math.floor(r() * 11), rows: ROSE, col: COLORS[Math.floor(r() * 3)] });
        flowers.sort((a, b) => a.y - b.y).forEach(f =>
            p.sprite(f.x, f.y, f.rows, { p: f.col.p, d: f.col.d, c: f.col.c, s: 'fs', l: 'fl' }));

        // dark grass blades along the bottom edge
        for (let i = 0; i < 170; i++) {
            const x = Math.floor(r() * W), h = 2 + Math.floor(r() * 5);
            p.rect(x, H - h, 1, h, 'gr');
        }

        svg.innerHTML = p.toSVG();
    }

    // --- LANDING SPRITES ---
    function drawBooth(svg) {
        const p = new Pixels(44, 67);

        // side panel + rounded front, then outline the silhouette
        p.rect(1, 9, 12, 56, 'bd');
        p.set(1, 9, null); p.set(2, 9, null); p.set(1, 10, null);
        for (let y = 3; y <= 64; y++) for (let x = 12; x <= 42; x++) {
            if (y < 9 && ((x < 18 && (x - 18) ** 2 + (y - 9) ** 2 > 42) || (x > 36 && (x - 36) ** 2 + (y - 9) ** 2 > 42))) continue;
            p.set(x, y, 'bp');
        }
        p.outline('ink');
        p.rect(12, 9, 1, 56, 'ink');

        // highlights and cap seam
        for (let x = 13; x <= 41; x++) { let y = 0; while (y < p.h && p.get(x, y) !== 'bp') y++; p.set(x, y, 'bl'); }
        p.rect(13, 6, 1, 58, 'bl');
        p.rect(1, 13, 11, 1, 'bdd');
        p.rect(13, 12, 29, 1, 'bdd');

        // arch with a tiny heart on the dome
        for (let y = 4; y < 12; y++) for (let x = 13; x <= 41; x++) {
            const d = Math.hypot(x - 27, y - 12);
            if (d >= 4.5 && d <= 5.6) p.set(x, y, 'bdd');
        }
        p.set(26, 9, 'dp'); p.set(28, 9, 'dp'); p.rect(26, 10, 3, 1, 'dp'); p.set(27, 11, 'dp');

        // recessed side panel
        p.frame(4, 17, 6, 42, 'bdd');
        p.rect(5, 18, 1, 40, 'bl');

        // screen
        p.rect(16, 16, 23, 20, 'bl');
        p.frame(16, 16, 23, 20, 'bdd');
        p.rect(18, 18, 19, 14, 'scr');
        p.frame(18, 18, 19, 14, 'ink');
        p.set(20, 20, 'scrhi'); p.set(21, 20, 'scrhi'); p.set(20, 21, 'scrhi');
        p.set(34, 28, 'scrhi'); p.set(33, 29, 'scrhi');
        p.rect(20, 33, 3, 1, 'dp'); p.rect(26, 33, 3, 1, 'dm'); p.rect(32, 33, 3, 1, 'dy');

        // button panel
        p.rect(16, 38, 23, 9, 'mt');
        p.frame(16, 38, 23, 9, 'ink');
        [19, 25, 31].forEach(x => {
            p.rect(x, 40, 4, 4, 'btn');
            [[0, 0], [3, 0], [0, 3], [3, 3]].forEach(([dx, dy]) => p.set(x + dx, 40 + dy, 'mtd'));
            p.set(x + 1, 41, 'scrhi');
        });

        // print slot with a fresh strip sticking out
        p.rect(16, 49, 23, 13, 'mt');
        p.frame(16, 49, 23, 13, 'ink');
        p.rect(19, 52, 17, 1, 'ink');
        p.rect(19, 53, 17, 1, 'mtd');
        p.rect(24, 53, 7, 8, 'f');
        p.rect(25, 54, 5, 2, 'dp');
        p.rect(25, 57, 5, 2, 'dm');

        // base trim + ground shadow
        p.rect(14, 62, 28, 2, 'bdd');
        p.rect(2, 62, 10, 2, 'bdd');
        p.rect(2, 65, 40, 1, 'shd');
        p.rect(6, 66, 32, 1, 'shd');

        svg.innerHTML = p.toSVG();
    }

    function drawCat(svg) {
        const p = new Pixels(20, 28);
        p.sprite(0, 0, [
            '...o............o...',
            '..owo..........owo..',
            '..owpo........opwo..',
            '.owppwoooooooowppwo.',
            '.owwwwwwwwwwqqqwwwo.',
            'owwwwwwwwwwqqqqwwwwo',
            'owwwwwwwwwwqqqqqwwwo',
            'owwwwkkwwwwqqkkqwwwo',
            'owwwwkkwwwwqqkkqwwwo',
            'owccwwwwwnnwwwwwccwo',
            'owwwwwwwowwowwwwwwwo',
            '.owwwwwwwwwwwwwwwwo.',
            '..oowwwwwwwwwwwwoo..',
            '...owwwwyyyywwwwo...',
            '..owwoooooooooowwo..',
            '..owwoffffffffowwo..',
            '..owwofvvvvvvfowwo..',
            '..owwofhhvvhhfowwo..',
            '.owwwwfhhhhhhfwwwwo.',
            '..owwofvhhhhvfowwo..',
            '..owwofvvhhvvfowwo..',
            '..owwofvvvvvvfowwo..',
            '..owwoffffffffowwo..',
            '..owwoooooooooowwo..',
            '..owwwwwwwwwwwwwwo..',
            '..owwwwwwwwwwwwwwo..',
            '..oooooooooooooooo..',
            '...ssssssssssssss...',
        ], { o: 'ink', w: 'cw', q: 'cq', p: 'cp', k: 'ck', c: 'cc', n: 'cn', y: 'cy', f: 'f', v: 'cv', h: 'ch', s: 'shd' });
        svg.innerHTML = p.toSVG();
    }

    const el = id => document.getElementById(id);
    if (el('scene-sky')) drawSky(el('scene-sky'));
    if (el('scene-ground')) drawGround(el('scene-ground'));
    if (el('sprite-booth')) drawBooth(el('sprite-booth'));
    if (el('sprite-cat')) drawCat(el('sprite-cat'));
})();
