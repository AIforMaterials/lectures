// Live demos for the AI for Materials lectures.
// Vanilla JS and inline SVG/canvas, no libraries, so the deck runs offline.
// Data come from js/demo-data.js (built by tools/build_data.py).
//
// Each demo is attached to a container by class name and is started/paused as
// its slide becomes current. In print-pdf mode every demo draws a final frame.
(function () {
  "use strict";

  const DATA = window.AIM_DATA || {};
  // ?still freezes every demo at its final frame (used for screenshots).
  const PRINT = /print-pdf|still/gi.test(window.location.search);
  const SVGNS = "http://www.w3.org/2000/svg";
  const C = {
    ink: "#2c3e50", axis: "#4d4d4d", muted: "#8a939c", faint: "#d9dcdf",
    teal: "#5faba2", pink: "#d4447e", tan: "#e9a66c", steel: "#507baa",
    paper: "#fbfaf7",
  };

  function el(name, attrs, parent) {
    const node = document.createElementNS(SVGNS, name);
    for (const k in attrs || {}) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // -------------------------------------------------------------------------
  // Title backdrop: the 118 elements settle into their learned embedding
  // (the same map as fig 1.1), then breathe gently.
  // -------------------------------------------------------------------------
  const FAMILY = {
    alkali: "#e74c3c", alkaline: "#e67e22", metal: "#3498db", metalloid: "#27ae60",
    nonmetal: "#2c3e50", halogen: "#8e44ad", noble: "#17becf", fblock: "#95a5a6",
  };
  const LABELLED = new Set(["H", "Li", "Na", "K", "Fe", "Au", "Si", "Ne", "La", "C"]);

  function constellation(host) {
    const pts = (DATA.elements || []).map((e, i) => ({
      ...e,
      // Start scattered on a wide ring, so the map assembles out of noise.
      a0: Math.random() * Math.PI * 2,
      r0: 0.55 + Math.random() * 0.5,
      delay: 0.15 * Math.random() + 0.5 * (e.x + e.y) / 2,
      phase: Math.random() * Math.PI * 2,
      idx: i,
    }));
    // Each element links to its two nearest neighbours in the embedding.
    const links = [];
    pts.forEach((p, i) => {
      const near = pts
        .map((q, j) => [j, (p.x - q.x) ** 2 + (p.y - q.y) ** 2])
        .filter(([j]) => j !== i)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2);
      near.forEach(([j]) => { if (i < j) links.push([i, j]); });
    });

    const canvas = document.createElement("canvas");
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, start = null, raf = null;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * 1.5;
      w = host.offsetWidth; h = host.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const pad = 0.1, cx = w / 2, cy = h / 2;
      const pos = pts.map(p => {
        const k = easeInOut(Math.min(1, Math.max(0, (t - p.delay) / 1.8)));
        const tx = (pad + (1 - 2 * pad) * p.x) * w;
        const ty = (pad + (1 - 2 * pad) * (1 - p.y)) * h;
        const sx = cx + Math.cos(p.a0) * p.r0 * w;
        const sy = cy + Math.sin(p.a0) * p.r0 * h;
        const drift = 3.5 * k;
        return {
          x: sx + (tx - sx) * k + drift * Math.sin(t * 0.6 + p.phase),
          y: sy + (ty - sy) * k + drift * Math.cos(t * 0.5 + p.phase),
          k,
        };
      });
      ctx.lineWidth = 1;
      links.forEach(([i, j]) => {
        const k = Math.min(pos[i].k, pos[j].k);
        if (k <= 0) return;
        ctx.strokeStyle = `rgba(44, 62, 80, ${0.13 * k})`;
        ctx.beginPath();
        ctx.moveTo(pos[i].x, pos[i].y);
        ctx.lineTo(pos[j].x, pos[j].y);
        ctx.stroke();
      });
      pts.forEach((p, i) => {
        const q = pos[i];
        ctx.globalAlpha = 0.25 + 0.75 * q.k;
        ctx.fillStyle = FAMILY[p.f] || C.muted;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        if (LABELLED.has(p.s) && q.k > 0.95) {
          ctx.globalAlpha = Math.min(1, (q.k - 0.95) * 20) * 0.85;
          ctx.fillStyle = C.ink;
          ctx.font = "700 24px Lato, sans-serif";
          ctx.fillText(p.s, q.x + 10, q.y - 8);
        }
      });
      ctx.globalAlpha = 1;
    }

    function loop(ts) {
      if (start === null) start = ts;
      draw((ts - start) / 1000);
      raf = requestAnimationFrame(loop);
    }
    return {
      play() { resize(); start = null; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); },
      pause() { cancelAnimationFrame(raf); raf = null; },
      still() { resize(); draw(60); },
    };
  }

  // -------------------------------------------------------------------------
  // Configuration explosion: 64 anion sites of a 128-atom ZnO(1-x)S(x) cell,
  // each O or S. The lattice shuffles while a counter shows how little of the
  // 2^64 configurations a brute-force search would ever reach.
  // -------------------------------------------------------------------------
  function configExplosion(host) {
    const N = 8, CELL = 60;
    const svg = el("svg", { viewBox: `0 0 ${N * CELL} ${N * CELL}` }, host);
    const sites = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const isS = (r + c) % 2 === 0;
        const node = el("circle", {
          cx: c * CELL + CELL / 2, cy: r * CELL + CELL / 2, r: CELL * 0.3,
          fill: isS ? C.pink : C.paper, stroke: isS ? C.pink : C.ink, "stroke-width": 3,
        }, svg);
        node.style.transition = "fill 0.25s ease, stroke 0.25s ease";
        sites.push({ node, isS });
      }
    }
    const readout = document.createElement("div");
    readout.className = "readout";
    readout.innerHTML =
      '<span>anion sites</span><span class="v">64</span>' +
      '<span>arrangements</span><span class="v">2<sup>64</sup> = 18,446,744,073,709,551,616</span>' +
      '<span>evaluated so far</span><span class="v js-count">0</span>' +
      '<span>fraction explored</span><span class="v accent js-frac">0 %</span>';
    host.appendChild(readout);
    const countEl = readout.querySelector(".js-count");
    const fracEl = readout.querySelector(".js-frac");
    const TOTAL = Math.pow(2, 64);
    let n = 0, timer = null;

    function tick() {
      // Flip a handful of sites each step: a new configuration every tick.
      for (let k = 0; k < 5; k++) {
        const s = sites[Math.floor(Math.random() * sites.length)];
        s.isS = !s.isS;
        s.node.setAttribute("fill", s.isS ? C.pink : C.paper);
        s.node.setAttribute("stroke", s.isS ? C.pink : C.ink);
      }
      n += 1;
      countEl.textContent = n.toLocaleString("en-GB");
      fracEl.textContent = (100 * n / TOTAL).toFixed(18).replace(/0+$/, "") + " %";
    }
    return {
      play() { if (!timer) timer = setInterval(tick, 110); },
      pause() { clearInterval(timer); timer = null; },
      still() { for (let i = 0; i < 40; i++) tick(); },
    };
  }

  // -------------------------------------------------------------------------
  // Bias-variance slider on the book's Lennard-Jones data (fig 2.3).
  // Fragments on the slide (data-step = degree) let a clicker step it too.
  // -------------------------------------------------------------------------
  function biasVariance(host) {
    const lj = DATA.lj;
    if (!lj) return null;

    // Main plot: V(r) with training points and the current polynomial fit.
    const W = 900, H = 560, M = { l: 70, r: 20, t: 46, b: 64 };
    const xr = [0.9, 2.52], yr = [-1.5, 2.5];
    const X = x => M.l + (x - xr[0]) / (xr[1] - xr[0]) * (W - M.l - M.r);
    const Y = y => M.t + (1 - (y - yr[0]) / (yr[1] - yr[0])) * (H - M.t - M.b);

    const main = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const clipId = "bv-clip";
    const defs = el("defs", {}, main);
    const cp = el("clipPath", { id: clipId }, defs);
    el("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }, cp);

    // Axes.
    el("line", { x1: M.l, y1: H - M.b, x2: W - M.r, y2: H - M.b, stroke: C.axis, "stroke-width": 1.5 }, main);
    el("line", { x1: M.l, y1: M.t, x2: M.l, y2: H - M.b, stroke: C.axis, "stroke-width": 1.5 }, main);
    el("line", { x1: M.l, y1: Y(0), x2: W - M.r, y2: Y(0), stroke: C.faint, "stroke-width": 1 }, main);
    [1.0, 1.5, 2.0, 2.5].forEach(v => {
      el("line", { x1: X(v), y1: H - M.b, x2: X(v), y2: H - M.b + 8, stroke: C.axis, "stroke-width": 1.5 }, main);
      el("text", { x: X(v), y: H - M.b + 32, "text-anchor": "middle", "font-size": 26 }, main).textContent = v.toFixed(1);
    });
    [-1, 0, 1, 2].forEach(v => {
      el("line", { x1: M.l - 8, y1: Y(v), x2: M.l, y2: Y(v), stroke: C.axis, "stroke-width": 1.5 }, main);
      el("text", { x: M.l - 14, y: Y(v) + 7, "text-anchor": "end", "font-size": 26 }, main).textContent = v;
    });
    el("text", { x: W - M.r, y: H - 4, "text-anchor": "end", "font-size": 26, "font-style": "italic" }, main).textContent = "r / σ";
    el("text", { x: M.l - 14, y: M.t - 22, "font-size": 26, "font-style": "italic" }, main).textContent = "V / ε";

    const path = (xs, ys) => xs.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join("");
    const g = el("g", { "clip-path": `url(#${clipId})` }, main);
    el("path", { d: path(lj.x_grid, lj.true), fill: "none", stroke: C.muted, "stroke-width": 2.5, "stroke-dasharray": "9 7" }, g);
    const fitPath = el("path", { fill: "none", stroke: C.pink, "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    lj.x_train.forEach((x, i) => {
      el("circle", { cx: X(x), cy: Y(lj.y_train[i]), r: 7.5, fill: C.ink, "fill-opacity": 0.75 }, g);
    });

    // Legend.
    const lg = el("g", { transform: `translate(${W - M.r - 250}, ${M.t + 10})` }, main);
    el("line", { x1: 0, y1: 0, x2: 40, y2: 0, stroke: C.muted, "stroke-width": 2.5, "stroke-dasharray": "9 7" }, lg);
    el("text", { x: 52, y: 7, "font-size": 26 }, lg).textContent = "Lennard-Jones V(r)";
    el("circle", { cx: 20, cy: 34, r: 7.5, fill: C.ink, "fill-opacity": 0.75 }, lg);
    el("text", { x: 52, y: 41, "font-size": 26 }, lg).textContent = "30 noisy samples";
    el("line", { x1: 0, y1: 68, x2: 40, y2: 68, stroke: C.pink, "stroke-width": 5 }, lg);
    el("text", { x: 52, y: 75, "font-size": 26 }, lg).textContent = "polynomial fit";

    // Side panel: degree dial, verdict, slider, and the error curves.
    const side = document.createElement("div");
    side.className = "side";
    side.innerHTML =
      '<div class="dial"><div class="dial-label">polynomial degree</div>' +
      '<div class="dial-value js-deg">1</div>' +
      '<input type="range" min="1" max="15" step="1" value="1" aria-label="polynomial degree">' +
      '<div class="verdict js-verdict"></div></div>';
    host.appendChild(side);

    const EW = 520, EH = 330, EM = { l: 64, r: 16, t: 24, b: 52 };
    const lo = Math.log10(0.0015), hi = Math.log10(0.4);
    const EX = d => EM.l + (d - 1) / 14 * (EW - EM.l - EM.r);
    const EY = v => EM.t + (1 - (Math.log10(v) - lo) / (hi - lo)) * (EH - EM.t - EM.b);
    const err = el("svg", { viewBox: `0 0 ${EW} ${EH}`, preserveAspectRatio: "xMidYMid meet" }, side);
    el("line", { x1: EM.l, y1: EH - EM.b, x2: EW - EM.r, y2: EH - EM.b, stroke: C.axis, "stroke-width": 1.5 }, err);
    el("line", { x1: EM.l, y1: EM.t, x2: EM.l, y2: EH - EM.b, stroke: C.axis, "stroke-width": 1.5 }, err);
    [1, 5, 10, 15].forEach(d => {
      el("text", { x: EX(d), y: EH - EM.b + 30, "text-anchor": "middle", "font-size": 24 }, err).textContent = d;
    });
    el("text", { x: EM.l - 12, y: EM.t + 10, "text-anchor": "end", "font-size": 24, "font-style": "italic" }, err).textContent = "error";
    el("text", { x: EW - EM.r, y: EH - 2, "text-anchor": "end", "font-size": 24, "font-style": "italic" }, err).textContent = "degree";
    const marker = el("line", { y1: EM.t, y2: EH - EM.b, stroke: C.faint, "stroke-width": 10, "stroke-linecap": "round" }, err);
    const series = [["train_mse", C.teal, "training"], ["test_mse", C.pink, "test"]];
    const dots = {};
    series.forEach(([key, col, label], s) => {
      const d = lj.fits.map((f, i) => `${i ? "L" : "M"}${EX(f.degree).toFixed(1)},${EY(f[key]).toFixed(1)}`).join("");
      el("path", { d, fill: "none", stroke: col, "stroke-width": 3.5, "stroke-linejoin": "round" }, err);
      lj.fits.forEach(f => el("circle", { cx: EX(f.degree), cy: EY(f[key]), r: 4, fill: col }, err));
      dots[key] = el("circle", { r: 10, fill: col, stroke: C.paper, "stroke-width": 3 }, err);
      el("circle", { cx: EX(8) + 130 * s, cy: EM.t - 2, r: 6, fill: col }, err);
      el("text", { x: EX(8) + 130 * s + 14, y: EM.t + 5, "font-size": 24, "font-weight": 700, fill: col }, err).textContent = label;
    });

    const slider = side.querySelector("input");
    const degEl = side.querySelector(".js-deg");
    const verdictEl = side.querySelector(".js-verdict");
    let shown = lj.fits[0].curve.slice(), anim = null, current = 1;

    function verdict(deg, r2) {
      if (deg <= 5) return `<strong style="color:${C.steel}">Underfit</strong> · too rigid`;
      if (deg <= 8) return `<strong style="color:${C.teal}">Just right</strong> · follows the well`;
      return `<strong style="color:${C.pink}">Overfit</strong> · chasing noise`;
    }

    function setDegree(deg, instant) {
      deg = Math.max(1, Math.min(15, Math.round(deg)));
      current = deg;
      const fit = lj.fits[deg - 1];
      slider.value = deg;
      degEl.textContent = deg;
      verdictEl.innerHTML = verdict(deg, fit.test_r2);
      marker.setAttribute("x1", EX(deg)); marker.setAttribute("x2", EX(deg));
      series.forEach(([key]) => {
        dots[key].setAttribute("cx", EX(deg)); dots[key].setAttribute("cy", EY(fit[key]));
      });
      // Morph the curve from what is shown to the new fit.
      cancelAnimationFrame(anim);
      const from = shown.slice(), to = fit.curve, t0 = performance.now(), dur = instant ? 0 : 450;
      const step = now => {
        const k = dur ? easeInOut(Math.min(1, (now - t0) / dur)) : 1;
        // Clamp so off-scale values (degree 15 at the edges) morph sensibly.
        shown = from.map((v, i) => Math.max(-6, Math.min(8, v + (to[i] - v) * k)));
        fitPath.setAttribute("d", path(lj.x_grid, shown));
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }

    slider.addEventListener("input", () => setDegree(+slider.value));
    // Keep the slide deck from reacting to keys while the slider has focus.
    slider.addEventListener("keydown", e => e.stopPropagation());
    setDegree(1, true);
    return {
      step(k, instant) { setDegree(k || 1, instant); },
      play() {}, pause() {}, still() { setDegree(7, true); },
    };
  }


  // -------------------------------------------------------------------------
  // Gradient descent on a one-parameter loss L(θ) = θ². Fragments step the
  // learning rate: too small (crawls), about right, too large (overshoots).
  // -------------------------------------------------------------------------
  const ETAS = [
    null,
    { eta: 0.04, word: "Too small", note: "crawls downhill", col: C.steel },
    { eta: 0.3, word: "Just right", note: "settles in a few steps", col: C.teal },
    { eta: 0.97, word: "Too large", note: "overshoots and oscillates", col: C.pink },
  ];

  function gradientDescent(host) {
    const W = 900, H = 560, M = { l: 40, r: 40, t: 40, b: 70 };
    const tr = [-2.4, 2.4], lr = [-0.2, 6.2];
    const X = t => M.l + (t - tr[0]) / (tr[1] - tr[0]) * (W - M.l - M.r);
    const Y = v => M.t + (1 - (v - lr[0]) / (lr[1] - lr[0])) * (H - M.t - M.b);
    const L = t => t * t;
    const STEPS = 14, T0 = -2.1;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    el("line", { x1: M.l, y1: Y(0), x2: W - M.r, y2: Y(0), stroke: C.axis, "stroke-width": 1.5 }, svg);
    el("text", { x: W - M.r, y: Y(0) + 40, "text-anchor": "end", "font-size": 28, "font-style": "italic" }, svg).textContent = "parameter θ";
    el("text", { x: X(0) + 14, y: M.t + 6, "font-size": 28, "font-style": "italic" }, svg).textContent = "loss L(θ)";
    el("line", { x1: X(0), y1: Y(0), x2: X(0), y2: M.t + 14, stroke: C.faint, "stroke-width": 1.5 }, svg);
    let d = "";
    for (let i = 0; i <= 200; i++) {
      const t = tr[0] + (tr[1] - tr[0]) * i / 200;
      d += `${i ? "L" : "M"}${X(t).toFixed(1)},${Y(L(t)).toFixed(1)}`;
    }
    el("path", { d, fill: "none", stroke: C.ink, "stroke-width": 4 }, svg);
    el("text", { x: X(0), y: Y(0) + 40, "text-anchor": "middle", "font-size": 26, fill: C.muted }, svg).textContent = "minimum";
    const trail = el("g", {}, svg);
    const ball = el("circle", { r: 17, fill: C.pink, stroke: C.paper, "stroke-width": 4 }, svg);

    const side = host.parentNode.querySelector(".side");
    const dial = document.createElement("div");
    dial.innerHTML =
      '<div class="dial-label">learning rate <span style="text-transform:none">η</span></div>' +
      '<div class="dial-value js-eta">·</div>' +
      '<div class="verdict js-verdict">Click to take steps downhill.</div>';
    side.appendChild(dial);
    const etaEl = dial.querySelector(".js-eta");
    const verdictEl = dial.querySelector(".js-verdict");

    let timer = null;
    function place(t) { ball.setAttribute("cx", X(t)); ball.setAttribute("cy", Y(L(t))); }

    function step(k, instant) {
      clearTimeout(timer);
      while (trail.firstChild) trail.removeChild(trail.firstChild);
      place(T0);
      const s = ETAS[k];
      if (!s) {
        etaEl.textContent = "·";
        verdictEl.innerHTML = "Click to take steps downhill.";
        return;
      }
      etaEl.textContent = s.eta.toFixed(2);
      verdictEl.innerHTML = `<strong style="color:${s.col}">${s.word}</strong> · ${s.note}`;
      const ts = [T0];
      for (let i = 0; i < STEPS; i++) ts.push(ts[i] - s.eta * 2 * ts[i]);
      let i = 0;
      const next = () => {
        if (i >= STEPS) return;
        const a = ts[i], b = ts[i + 1];
        el("line", {
          x1: X(a), y1: Y(L(a)), x2: X(b), y2: Y(L(b)),
          stroke: s.col, "stroke-width": 3, "stroke-opacity": 0.55,
        }, trail);
        el("circle", { cx: X(a), cy: Y(L(a)), r: 7, fill: s.col, "fill-opacity": 0.5 }, trail);
        place(b);
        i += 1;
        if (instant) next(); else timer = setTimeout(next, 330);
      };
      next();
    }
    place(T0);
    return { step, play() {}, pause() { clearTimeout(timer); }, still() { step(3, true); } };
  }

  // -------------------------------------------------------------------------
  // Database scale (Table 3.1) as log-scale bars that grow on arrival.
  // -------------------------------------------------------------------------
  const DBS = [
    ["CSD", 1.0e6, ">1M", "exp"],
    ["ICSD", 3.3e5, ">330k", "exp"],
    ["Materials Project", 2.0e5, ">200k", "comp"],
    ["OQMD", 1.4e6, "~1.4M", "comp"],
    ["AFLOW", 3.0e6, ">3M", "comp"],
    ["Alexandria", 5.8e6, "~5.8M", "comp"],
    ["OMat24", 1.0e8, ">100M", "corpus"],
  ];
  const KIND = {
    exp: [C.tan, "experiment"],
    comp: [C.steel, "computation"],
    corpus: [C.pink, "training corpus"],
  };

  function dbChart(host) {
    const W = 1500, H = 620, LBL = 300, R = 120, TOP = 70, ROW = 72;
    const X = v => LBL + (Math.log10(v) - 4) / 4 * (W - LBL - R);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    // Grid and log ticks.
    [[1e4, "10k"], [1e5, "100k"], [1e6, "1M"], [1e7, "10M"], [1e8, "100M"]].forEach(([v, t]) => {
      el("line", { x1: X(v), y1: TOP - 10, x2: X(v), y2: TOP + ROW * DBS.length, stroke: C.faint, "stroke-width": 1.5 }, svg);
      el("text", { x: X(v), y: TOP + ROW * DBS.length + 40, "text-anchor": "middle", "font-size": 28, fill: C.muted }, svg).textContent = t;
    });
    el("text", { x: W - R, y: TOP + ROW * DBS.length + 80, "text-anchor": "end", "font-size": 26, "font-style": "italic", fill: C.muted }, svg).textContent = "entries, log scale";
    // Legend.
    Object.values(KIND).forEach(([col, name], i) => {
      el("rect", { x: LBL + i * 300, y: 6, width: 28, height: 28, rx: 5, fill: col }, svg);
      el("text", { x: LBL + i * 300 + 40, y: 30, "font-size": 28 }, svg).textContent = name;
    });
    const bars = DBS.map(([name, v, label, kind], i) => {
      const y = TOP + i * ROW + 10;
      el("text", { x: LBL - 24, y: y + 36, "text-anchor": "end", "font-size": 30, "font-weight": 700, fill: C.ink }, svg).textContent = name;
      const rect = el("rect", { x: LBL, y, width: 0, height: ROW - 22, rx: 6, fill: KIND[kind][0] }, svg);
      const txt = el("text", { x: X(v) + 14, y: y + 36, "font-size": 30, "font-weight": 900, fill: C.ink, opacity: 0 }, svg);
      txt.textContent = label;
      return { rect, txt, w: X(v) - LBL, delay: i * 0.12 };
    });
    let raf = null;
    function draw(t) {
      bars.forEach(b => {
        const k = easeInOut(Math.min(1, Math.max(0, (t - b.delay) / 1.1)));
        b.rect.setAttribute("width", (b.w * k).toFixed(1));
        b.txt.setAttribute("opacity", Math.max(0, (k - 0.85) / 0.15).toFixed(2));
      });
    }
    return {
      play() {
        cancelAnimationFrame(raf);
        const t0 = performance.now();
        const loop = now => { const t = (now - t0) / 1000; draw(t); if (t < 2.2) raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      },
      pause() { cancelAnimationFrame(raf); draw(0); },
      still() { draw(10); },
    };
  }

  // -------------------------------------------------------------------------
  // Tyranny of the middle: a property distribution whose tail, where the
  // record breakers sit, fills in pink.
  // -------------------------------------------------------------------------
  function tail(host) {
    const W = 1500, H = 600, M = { l: 40, r: 40, t: 40, b: 80 };
    const xr = [-3.6, 4.2];
    const X = x => M.l + (x - xr[0]) / (xr[1] - xr[0]) * (W - M.l - M.r);
    const Y = y => M.t + (1 - y / 0.42) * (H - M.t - M.b);
    const pdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
    const CUT = 1.9;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const curve = [], tailPts = [];
    for (let i = 0; i <= 300; i++) {
      const x = xr[0] + (xr[1] - xr[0]) * i / 300;
      curve.push(`${i ? "L" : "M"}${X(x).toFixed(1)},${Y(pdf(x)).toFixed(1)}`);
      if (x >= CUT) tailPts.push(`L${X(x).toFixed(1)},${Y(pdf(x)).toFixed(1)}`);
    }
    // Bulk of the distribution, faint.
    let bulk = `M${X(xr[0])},${Y(0)}`;
    for (let i = 0; i <= 300; i++) {
      const x = xr[0] + (CUT - xr[0]) * i / 300;
      bulk += `L${X(x).toFixed(1)},${Y(pdf(x)).toFixed(1)}`;
    }
    bulk += `L${X(CUT)},${Y(0)}Z`;
    el("path", { d: bulk, fill: C.faint, "fill-opacity": 0.6 }, svg);
    const tailArea = el("path", {
      d: `M${X(CUT)},${Y(0)}L${X(CUT)},${Y(pdf(CUT))}${tailPts.join("")}L${X(xr[1])},${Y(0)}Z`,
      fill: C.pink, opacity: 0,
    }, svg);
    tailArea.style.transition = "opacity 0.8s ease 0.6s";
    el("path", { d: curve.join(""), fill: "none", stroke: C.ink, "stroke-width": 4 }, svg);
    el("line", { x1: M.l, y1: Y(0), x2: W - M.r, y2: Y(0), stroke: C.axis, "stroke-width": 1.5 }, svg);
    el("text", { x: W - M.r, y: Y(0) + 50, "text-anchor": "end", "font-size": 28, "font-style": "italic" }, svg).textContent = "property value";
    el("text", { x: X(0), y: Y(0.2), "text-anchor": "middle", "font-size": 34, "font-weight": 700, fill: C.ink }, svg).textContent = "most of the data";
    el("text", { x: X(0), y: Y(0.2) + 40, "text-anchor": "middle", "font-size": 28, fill: C.muted }, svg).textContent = "where an average score is earned";
    const lbl = el("g", { opacity: 0 }, svg);
    lbl.style.transition = "opacity 0.6s ease 1.2s";
    el("line", { x1: X(2.9), y1: Y(0.035), x2: X(2.9), y2: Y(0.17), stroke: C.pink, "stroke-width": 2 }, lbl);
    el("text", { x: X(2.9), y: Y(0.17) - 50, "text-anchor": "middle", "font-size": 34, "font-weight": 900, fill: C.pink }, lbl).textContent = "record breakers";
    el("text", { x: X(2.9), y: Y(0.17) - 12, "text-anchor": "middle", "font-size": 28, fill: C.ink }, lbl).textContent = "where discovery happens";
    function show(on, instant) {
      [tailArea, lbl].forEach(n => {
        if (instant) n.style.transitionDuration = "0s";
        n.setAttribute("opacity", on ? 1 : 0);
      });
    }
    return { play() { show(true); }, pause() { show(false, true); }, still() { show(true, true); } };
  }

  // -------------------------------------------------------------------------
  // Random against stratified split: 20 compounds, 2 stable, a 10-compound
  // test set. Fragments step: 1 = random draw, 2 = stratified draw.
  // -------------------------------------------------------------------------
  function splitDemo(host) {
    const W = 1500, H = 560, CELL = 78, R = 25;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const STABLE = new Set([7, 14]);
    const pool = [];
    const P0 = { x: 40, y: 70 };
    for (let i = 0; i < 20; i++) {
      pool.push({ x: P0.x + (i % 5) * CELL + CELL / 2, y: P0.y + Math.floor(i / 5) * CELL + CELL / 2, s: STABLE.has(i) });
    }
    const dot = (x, y, s, parent) => el("circle", {
      cx: x, cy: y, r: R, fill: s ? C.pink : C.paper, stroke: s ? C.pink : C.ink, "stroke-width": 3.5,
    }, parent);
    pool.forEach(p => dot(p.x, p.y, p.s, svg));
    const text = (x, y, str, attrs) => {
      const t = el("text", Object.assign({ x, y, "font-size": 30 }, attrs || {}), svg);
      t.textContent = str;
      return t;
    };
    text(P0.x + CELL * 2.5, P0.y - 24, "pool of 20 compounds", { "text-anchor": "middle", "font-weight": 700 });
    text(P0.x + CELL * 2.5, P0.y + CELL * 4 + 50, "2 stable", { "text-anchor": "middle", fill: C.pink, "font-weight": 900 });

    // Two test-set panels, 5 x 2 each.
    const panels = [
      { x: 560, title: "random test set", pick: [0, 2, 4, 5, 9, 11, 13, 16, 18, 19], col: C.ink },
      { x: 1040, title: "stratified test set", pick: [7, 1, 3, 6, 8, 10, 12, 15, 17, 19], col: C.ink },
    ];
    panels.forEach((pn, k) => {
      pn.g = el("g", { opacity: 0 }, svg);
      const frame = el("rect", {
        x: pn.x - 16, y: P0.y + CELL - 16, width: CELL * 5 + 32, height: CELL * 2 + 32, rx: 14,
        fill: "none", stroke: C.faint, "stroke-width": 2, "stroke-dasharray": "8 7",
      }, pn.g);
      void frame;
      const t = el("text", { x: pn.x + CELL * 2.5, y: P0.y - 24, "text-anchor": "middle", "font-size": 30, "font-weight": 700 }, pn.g);
      t.textContent = pn.title;
      pn.dots = pn.pick.map((src, j) => {
        const c = dot(pool[src].x, pool[src].y, pool[src].s, pn.g);
        return { c, from: pool[src], to: { x: pn.x + (j % 5) * CELL + CELL / 2, y: P0.y + CELL + Math.floor(j / 5) * CELL + CELL / 2 } };
      });
      const nStable = pn.pick.filter(i => STABLE.has(i)).length;
      pn.count = el("text", {
        x: pn.x + CELL * 2.5, y: P0.y + CELL * 4 + 50, "text-anchor": "middle", "font-size": 30, "font-weight": 900,
        fill: nStable ? C.teal : C.pink, opacity: 0,
      }, svg);
      pn.count.textContent = nStable ? "1 stable: the ratio survives" : "0 stable: the rare class is gone";
      void k;
    });

    let raf = null;
    function setPanel(pn, on, instant) {
      pn.g.setAttribute("opacity", on ? 1 : 0);
      pn.count.setAttribute("opacity", 0);
      if (!on) return;
      const t0 = performance.now(), dur = instant ? 0 : 900;
      const go = now => {
        let done = true;
        pn.dots.forEach((d, j) => {
          const raw = dur ? (now - t0 - j * 60) / dur : 1;
          const k = easeInOut(Math.min(1, Math.max(0, raw)));
          if (raw < 1) done = false;
          d.c.setAttribute("cx", d.from.x + (d.to.x - d.from.x) * k);
          d.c.setAttribute("cy", d.from.y + (d.to.y - d.from.y) * k);
        });
        if (done) pn.count.setAttribute("opacity", 1);
        else raf = requestAnimationFrame(go);
      };
      raf = requestAnimationFrame(go);
      if (instant) go(performance.now() + 1e6);
    }
    function step(k, instant) {
      cancelAnimationFrame(raf);
      setPanel(panels[0], k >= 1, instant || k > 1);
      setPanel(panels[1], k >= 2, instant);
    }
    step(0, true);
    return { step, play() {}, pause() {}, still() { step(2, true); } };
  }


  // -------------------------------------------------------------------------
  // Invariance: a water molecule drifts and tumbles. Its Cartesian coordinates
  // change every frame; the bond lengths and angle computed from them do not.
  // -------------------------------------------------------------------------
  const WATER = [["O", 0, 0, 0], ["H", 0.758, 0.587, 0], ["H", -0.758, 0.587, 0]];

  function invariance(host) {
    const W = 560, H = 520, S = 190;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const bonds = [1, 2].map(() => el("line", { stroke: C.ink, "stroke-width": 9, "stroke-linecap": "round" }, svg));
    const atoms = WATER.map(([s]) => el("circle", {
      fill: s === "O" ? C.pink : C.steel, stroke: C.paper, "stroke-width": 4,
    }, svg));
    const side = document.createElement("div");
    side.className = "side";
    side.innerHTML =
      '<div class="dial-label">Cartesian coordinates (Å)</div>' +
      '<table class="coords"><tbody>' +
      WATER.map(([s]) => `<tr><th>${s}</th><td></td><td></td><td></td></tr>`).join("") +
      "</tbody></table>" +
      '<div class="dial-label">bond lengths and angle</div>' +
      '<div class="internal"><span>r<sub>1</sub> = <b class="js-r1"></b> Å</span>' +
      '<span>r<sub>2</sub> = <b class="js-r2"></b> Å</span>' +
      '<span>θ = <b class="js-th"></b>°</span></div>';
    host.appendChild(side);
    const cells = [...side.querySelectorAll("td")];
    const r1El = side.querySelector(".js-r1"), r2El = side.querySelector(".js-r2"), thEl = side.querySelector(".js-th");

    function pose(t) {
      const a = 0.55 * t, b = 0.8 * Math.sin(0.37 * t), c = 0.3 * t;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
      const T = [0.35 * Math.sin(0.41 * t), 0.25 * Math.cos(0.29 * t), 0.2 * Math.sin(0.23 * t)];
      return WATER.map(([, x0, y0, z0]) => {
        // Rotate about z, then y, then x, then translate.
        let x = ca * x0 - sa * y0, y = sa * x0 + ca * y0, z = z0;
        [x, z] = [cb * x + sb * z, -sb * x + cb * z];
        [y, z] = [cc * y - sc * z, sc * y + cc * z];
        return [x + T[0], y + T[1], z + T[2]];
      });
    }
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const fmt = v => (v < 0 ? "−" : "") + Math.abs(v).toFixed(3);
    let raf = null, start = null, lastTable = -1;

    function draw(t, forceTable) {
      const P = pose(t);
      const order = [0, 1, 2].sort((i, j) => P[i][2] - P[j][2]);
      const px = p => [W / 2 + S * p[0], H / 2 - S * (p[1] - 0.25)];
      [1, 2].forEach((h, k) => {
        const [x1, y1] = px(P[0]), [x2, y2] = px(P[h]);
        bonds[k].setAttribute("x1", x1); bonds[k].setAttribute("y1", y1);
        bonds[k].setAttribute("x2", x2); bonds[k].setAttribute("y2", y2);
      });
      order.forEach(i => {
        const [x, y] = px(P[i]);
        const r = (i === 0 ? 46 : 30) * (1 + 0.12 * P[i][2]);
        atoms[i].setAttribute("cx", x); atoms[i].setAttribute("cy", y); atoms[i].setAttribute("r", r);
        svg.appendChild(atoms[i]);   // paint far atoms first
      });
      // Refresh the numbers a few times a second so they stay readable.
      if (forceTable || t - lastTable > 0.15) {
        lastTable = t;
        P.forEach((p, i) => p.forEach((v, j) => { cells[3 * i + j].textContent = fmt(v); }));
        const r1 = dist(P[0], P[1]), r2 = dist(P[0], P[2]);
        const u = [0, 1, 2].map(j => P[1][j] - P[0][j]), v = [0, 1, 2].map(j => P[2][j] - P[0][j]);
        const th = Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (r1 * r2)) * 180 / Math.PI;
        r1El.textContent = r1.toFixed(2); r2El.textContent = r2.toFixed(2); thEl.textContent = th.toFixed(1);
      }
    }
    function loop(ts) {
      if (start === null) start = ts;
      draw((ts - start) / 1000);
      raf = requestAnimationFrame(loop);
    }
    draw(0, true);
    return {
      play() { start = null; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); },
      pause() { cancelAnimationFrame(raf); raf = null; },
      still() { draw(2.6, true); },
    };
  }

  // -------------------------------------------------------------------------
  // Invariant against equivariant: a checkerboard lattice turns by 90 degrees
  // per click. The atoms land on their old sites; the spin arrows turn too.
  // -------------------------------------------------------------------------
  function equivariance(host) {
    const W = 1400, H = 560, CELL = 110, N = 3;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const centres = [380, 1020];
    const groups = centres.map((cx, panel) => {
      const cy = 250;
      // Ghosts of the starting sites, so the eye can see atoms land on them.
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        el("circle", { cx: cx + (c - 1) * CELL, cy: cy + (r - 1) * CELL, r: 34, fill: "none", stroke: C.faint, "stroke-width": 2, "stroke-dasharray": "5 6" }, svg);
      }
      const g = el("g", {}, svg);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const filled = (r + c) % 2 === 0;
        const x = cx + (c - 1) * CELL, y = cy + (r - 1) * CELL;
        el("circle", { cx: x, cy: y, r: 30, fill: filled ? C.pink : C.paper, stroke: filled ? C.pink : C.ink, "stroke-width": 4 }, g);
        if (panel === 1) {
          const up = filled ? -1 : 1;
          el("line", { x1: x, y1: y - up * 38, x2: x, y2: y + up * 38, stroke: C.ink, "stroke-width": 6, "stroke-linecap": "round" }, g);
          el("path", { d: `M${x - 13},${y + up * 22} L${x},${y + up * 44} L${x + 13},${y + up * 22} Z`, fill: C.ink }, g);
        }
      }
      return { g, cx, cy };
    });
    const label = (x, y, txt, attrs) => { const t = el("text", Object.assign({ x, y, "text-anchor": "middle", "font-size": 32 }, attrs || {}), svg); t.textContent = txt; return t; };
    label(centres[0], 470, "atoms only", { "font-weight": 700 });
    label(centres[1], 470, "atoms with magnetic moments", { "font-weight": 700 });
    const verdicts = [
      label(centres[0], 515, "energy unchanged: invariant", { fill: C.teal, "font-weight": 900, opacity: 0 }),
      label(centres[1], 515, "arrows turn with the crystal: equivariant", { fill: C.pink, "font-weight": 900, opacity: 0 }),
    ];
    let angle = 0, raf = null;
    function setAngle(a, instant) {
      cancelAnimationFrame(raf);
      const from = angle, t0 = performance.now(), dur = instant ? 0 : 1400;
      const go = now => {
        const k = dur ? easeInOut(Math.min(1, (now - t0) / dur)) : 1;
        angle = from + (a - from) * k;
        groups.forEach(({ g, cx, cy }) => g.setAttribute("transform", `rotate(${angle} ${cx} ${cy})`));
        if (k < 1) raf = requestAnimationFrame(go);
      };
      raf = requestAnimationFrame(go);
      if (instant) go(performance.now());
      verdicts.forEach(v => v.setAttribute("opacity", a > 0 ? 1 : 0));
    }
    return { step(k, instant) { setAngle(90 * k, instant); }, play() {}, pause() {}, still() { setAngle(90, true); } };
  }

  // -------------------------------------------------------------------------
  // k-nearest neighbours on the metal/insulator map of fig 5.2. A query point
  // wanders the map; its k nearest compounds vote. Fragments set k.
  // -------------------------------------------------------------------------
  function knnVote(host) {
    const mi = DATA.mi;
    if (!mi) return null;
    const W = 960, H = 620, PAD = 30;
    const sx = (W - 2 * PAD) / (mi.xr[1] - mi.xr[0]), sy = (H - 2 * PAD) / (mi.yr[1] - mi.yr[0]);
    const s = Math.min(sx, sy);   // equal axes, so drawn distance is real distance
    const ox = W / 2 - s * (mi.xr[0] + mi.xr[1]) / 2, oy = H / 2 + s * (mi.yr[0] + mi.yr[1]) / 2;
    const X = v => ox + s * v, Y = v => oy - s * v;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const COL = [C.tan, C.steel];   // insulator, metal
    mi.x.forEach((x, i) => el("circle", { cx: X(x), cy: Y(mi.y[i]), r: 5, fill: COL[mi.m[i]], "fill-opacity": 0.55 }, svg));
    const links = el("g", {}, svg);
    const ring = el("g", {}, svg);
    const q = el("circle", { r: 14, fill: C.paper, stroke: C.pink, "stroke-width": 5 }, svg);

    const side = host.parentNode.querySelector(".side");
    const dial = document.createElement("div");
    dial.innerHTML =
      '<div class="dial-label">neighbours k</div><div class="dial-value js-k">1</div>' +
      '<div class="tally"><span style="color:' + C.steel + '">metal <b class="js-m">0</b></span>' +
      '<span style="color:' + C.tan + '">insulator <b class="js-i">0</b></span></div>' +
      '<div class="verdict js-v"></div>';
    side.appendChild(dial);
    const kEl = dial.querySelector(".js-k"), mEl = dial.querySelector(".js-m"), iEl = dial.querySelector(".js-i"), vEl = dial.querySelector(".js-v");
    let k = 1, raf = null, start = null, tNow = 0;
    const cx = (mi.xr[0] + mi.xr[1]) / 2, cy = (mi.yr[0] + mi.yr[1]) / 2;
    const ax = 0.36 * (mi.xr[1] - mi.xr[0]), ay = 0.34 * (mi.yr[1] - mi.yr[0]);

    function draw(t) {
      tNow = t;
      const qx = cx + ax * Math.sin(0.21 * t), qy = cy + ay * Math.sin(0.33 * t + 0.8);
      const near = mi.x.map((x, i) => [i, (x - qx) ** 2 + (mi.y[i] - qy) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, k);
      while (links.firstChild) links.removeChild(links.firstChild);
      while (ring.firstChild) ring.removeChild(ring.firstChild);
      let metals = 0;
      near.forEach(([i]) => {
        metals += mi.m[i];
        el("line", { x1: X(qx), y1: Y(qy), x2: X(mi.x[i]), y2: Y(mi.y[i]), stroke: C.ink, "stroke-width": 1.5, "stroke-opacity": 0.45 }, links);
        el("circle", { cx: X(mi.x[i]), cy: Y(mi.y[i]), r: 8, fill: COL[mi.m[i]], stroke: C.ink, "stroke-width": 1.5 }, ring);
      });
      q.setAttribute("cx", X(qx)); q.setAttribute("cy", Y(qy));
      mEl.textContent = metals; iEl.textContent = k - metals;
      const metal = metals * 2 > k;
      vEl.innerHTML = `Predicted: <strong style="color:${metal ? C.steel : C.tan}">${metal ? "metal" : "insulator"}</strong>`;
    }
    function loop(ts) {
      if (start === null) start = ts - tNow * 1000;
      draw((ts - start) / 1000);
      raf = requestAnimationFrame(loop);
    }
    draw(4);
    return {
      step(n) { k = n || 1; kEl.textContent = k; draw(tNow); },
      play() { start = null; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); },
      pause() { cancelAnimationFrame(raf); raf = null; },
      still() { k = 7; kEl.textContent = k; draw(11); },
    };
  }

  // -------------------------------------------------------------------------
  // A decision tree grows on the same map as the k-NN demo: each fragment adds
  // a level of yes/no questions (axis-aligned cuts, the newest in pink), the
  // last one grows it in full. Leaves are tinted by the class they predict.
  // -------------------------------------------------------------------------
  function treeGrow(host) {
    const mi = DATA.mi, tr = DATA.tree;
    if (!mi || !tr) return null;
    const W = 960, H = 620, PAD = 30;   // geometry of knnVote, so the map sits in the same place
    const sx = (W - 2 * PAD) / (mi.xr[1] - mi.xr[0]), sy = (H - 2 * PAD) / (mi.yr[1] - mi.yr[0]);
    const s = Math.min(sx, sy);
    const ox = W / 2 - s * (mi.xr[0] + mi.xr[1]) / 2, oy = H / 2 + s * (mi.yr[0] + mi.yr[1]) / 2;
    const X = v => ox + s * v, Y = v => oy - s * v;
    // leaf boxes stop just beyond the outermost compounds
    const ext = a => [Math.min(...a) - 0.3, Math.max(...a) + 0.3];
    const [xa, xb] = ext(mi.x), [ya, yb] = ext(mi.y);
    const clampX = v => X(Math.max(xa, Math.min(xb, v))), clampY = v => Y(Math.max(ya, Math.min(yb, v)));
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const COL = ["#e67e22", "#3498db"];   // insulator, metal (book colours of figs 5.2 and 5.3)
    const leaves = el("g", {}, svg);
    const cuts = el("g", {}, svg);
    mi.x.forEach((x, i) => el("circle", { cx: X(x), cy: Y(mi.y[i]), r: 5, fill: COL[mi.m[i]], "fill-opacity": 0.8 }, svg));

    const side = host.parentNode.querySelector(".side");
    const panel = document.createElement("div");
    panel.innerHTML =
      '<div class="dial-label">tree depth</div><div class="dial-value js-d">0</div>' +
      '<div class="tally"><span>leaves <b class="js-l">1</b></span></div>' +
      '<div class="tally"><span>training <b class="js-tr">&ndash;</b></span><span>unseen <b class="js-te">&ndash;</b></span></div>' +
      '<div class="verdict js-v"></div>';
    side.appendChild(panel);
    const q = sel => panel.querySelector(sel);
    const dEl = q(".js-d"), lEl = q(".js-l"), trEl = q(".js-tr"), teEl = q(".js-te"), vEl = q(".js-v");

    function step(k) {
      while (leaves.firstChild) leaves.removeChild(leaves.firstChild);
      while (cuts.firstChild) cuts.removeChild(cuts.firstChild);
      const st = k > 0 ? tr.steps[Math.min(k, tr.steps.length) - 1] : null;
      if (!st) {
        dEl.textContent = 0; lEl.textContent = 1; trEl.innerHTML = teEl.innerHTML = "&ndash;";
        vEl.innerHTML = "No questions yet.";
        return;
      }
      st.leaves.forEach(([x0, x1, y0, y1, c]) => {
        el("rect", { x: clampX(x0), y: clampY(y1), width: clampX(x1) - clampX(x0), height: clampY(y0) - clampY(y1),
                     fill: COL[c], "fill-opacity": 0.13 }, leaves);
      });
      st.cuts.forEach(([x0, y0, x1, y1, isNew]) => {
        el("line", { x1: clampX(x0), y1: clampY(y0), x2: clampX(x1), y2: clampY(y1),
                     stroke: isNew ? C.pink : C.ink, "stroke-width": isNew ? 4 : (st.full ? 1 : 2),
                     "stroke-opacity": isNew ? 1 : 0.55 }, cuts);
      });
      dEl.textContent = st.depth;
      lEl.textContent = st.leaves.length;
      trEl.textContent = st.train + "%";
      teEl.textContent = st.test + "%";
      vEl.innerHTML = k === 1 ? `First question: <strong>${tr.question}</strong>`
        : st.full ? "Grown in full: <strong>each leaf holds one class</strong>"
        : "Each box asks <strong>one more question</strong>";
    }
    step(0);
    return { step, play() {}, pause() {}, still() { step(tr.steps.length); } };
  }

  // -------------------------------------------------------------------------
  // Gaussian process on the Lennard-Jones data (settings of fig 5.5). Each
  // fragment adds training points; the 95% band tightens where they land.
  // -------------------------------------------------------------------------
  function gpGrow(host) {
    const gp = DATA.gp;
    if (!gp) return null;
    const W = 1400, H = 600, M = { l: 80, r: 30, t: 30, b: 70 };
    const xr = [0.9, 2.52], yr = [-1.6, 2.6];
    const X = x => M.l + (x - xr[0]) / (xr[1] - xr[0]) * (W - M.l - M.r);
    const Y = y => M.t + (1 - (y - yr[0]) / (yr[1] - yr[0])) * (H - M.t - M.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const cp = el("clipPath", { id: "gp-clip" }, el("defs", {}, svg));
    el("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }, cp);
    el("line", { x1: M.l, y1: H - M.b, x2: W - M.r, y2: H - M.b, stroke: C.axis, "stroke-width": 1.5 }, svg);
    el("line", { x1: M.l, y1: M.t, x2: M.l, y2: H - M.b, stroke: C.axis, "stroke-width": 1.5 }, svg);
    [1.0, 1.5, 2.0, 2.5].forEach(v => {
      el("text", { x: X(v), y: H - M.b + 36, "text-anchor": "middle", "font-size": 28 }, svg).textContent = v.toFixed(1);
    });
    [-1, 0, 1, 2].forEach(v => {
      el("text", { x: M.l - 16, y: Y(v) + 9, "text-anchor": "end", "font-size": 28 }, svg).textContent = v;
    });
    el("text", { x: W - M.r, y: H - 6, "text-anchor": "end", "font-size": 28, "font-style": "italic" }, svg).textContent = "r / σ";
    const g = el("g", { "clip-path": "url(#gp-clip)" }, svg);
    const path = (ys) => gp.x_grid.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join("");
    const band = el("path", { fill: C.pink, "fill-opacity": 0.16 }, g);
    el("path", { d: path(gp.true), fill: "none", stroke: C.muted, "stroke-width": 2.5, "stroke-dasharray": "9 7" }, g);
    const mean = el("path", { fill: "none", stroke: C.pink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
    const dots = gp.x_train.map((x, i) => el("circle", { cx: X(x), cy: Y(gp.y_train[i]), r: 9, fill: C.ink }, g));
    const count = el("text", { x: W - M.r - 10, y: M.t + 40, "text-anchor": "end", "font-size": 40, "font-weight": 900, fill: C.ink }, svg);
    const sub = el("text", { x: W - M.r - 10, y: M.t + 80, "text-anchor": "end", "font-size": 28, fill: C.muted }, svg);
    sub.textContent = "shaded: 95% interval";
    const clamp = v => Math.max(-8, Math.min(8, v));
    let shown = null, raf = null;

    function step(k, instant) {
      const st = gp.steps.find(s => s.n === k) || gp.steps[0];
      const used = new Set(st.idx);
      dots.forEach((d, i) => { d.setAttribute("opacity", used.has(i) ? 1 : 0); });
      count.textContent = `${st.n} measurements`;
      const target = { mu: st.mu.map(clamp), sd: st.sd.map(clamp) };
      const from = shown || target;
      cancelAnimationFrame(raf);
      const t0 = performance.now(), dur = instant ? 0 : 700;
      const go = now => {
        const a = dur ? easeInOut(Math.min(1, (now - t0) / dur)) : 1;
        const mu = from.mu.map((v, i) => v + (target.mu[i] - v) * a);
        const sd = from.sd.map((v, i) => v + (target.sd[i] - v) * a);
        mean.setAttribute("d", path(mu));
        const up = mu.map((v, i) => v + sd[i]), lo = mu.map((v, i) => v - sd[i]);
        band.setAttribute("d", path(up) + gp.x_grid.slice().reverse().map((x, j) => {
          const i = gp.x_grid.length - 1 - j;
          return `L${X(x).toFixed(1)},${Y(lo[i]).toFixed(1)}`;
        }).join("") + "Z");
        shown = { mu, sd };
        if (a < 1) raf = requestAnimationFrame(go);
      };
      raf = requestAnimationFrame(go);
      if (instant) go(performance.now());
    }
    step(3, true);
    return { step: (k, instant) => step(k || 3, instant), play() {}, pause() {}, still() { step(12, true); } };
  }

  // -------------------------------------------------------------------------
  // Grid against random search: nine trials each. Only the horizontal
  // hyperparameter matters; the grid tries 3 values of it, random tries 9.
  // -------------------------------------------------------------------------
  function gridRandom(host) {
    const W = 1400, H = 700, SQ = 380, TOP = 190;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const score = x => Math.exp(-((x - 0.68) ** 2) / 0.012) + 0.25 * Math.exp(-((x - 0.3) ** 2) / 0.05);
    const grid = [];
    [1 / 6, 1 / 2, 5 / 6].forEach(y => [1 / 6, 1 / 2, 5 / 6].forEach(x => grid.push([x, y])));
    const rx = [0.07, 0.18, 0.29, 0.41, 0.52, 0.63, 0.71, 0.84, 0.93];
    const ry = [0.62, 0.15, 0.88, 0.33, 0.71, 0.05, 0.47, 0.92, 0.26];
    const random = rx.map((x, i) => [x, ry[i]]);
    const panels = [[110, grid, "grid search", "3 values tried"], [810, random, "random search", "9 values tried"]];
    const pops = [];
    panels.forEach(([x0, pts, title, verdict], p) => {
      const y0 = TOP;
      // Marginal: validation score against the one hyperparameter that matters.
      let d = "";
      for (let i = 0; i <= 120; i++) {
        const x = i / 120;
        d += `${i ? "L" : "M"}${(x0 + x * SQ).toFixed(1)},${(y0 - 20 - 120 * score(x)).toFixed(1)}`;
      }
      el("path", { d, fill: "none", stroke: C.ink, "stroke-width": 3.5 }, svg);
      el("rect", { x: x0, y: y0, width: SQ, height: SQ, fill: "none", stroke: C.axis, "stroke-width": 1.5 }, svg);
      const t = el("text", { x: x0 + SQ / 2, y: 40, "text-anchor": "middle", "font-size": 32, "font-weight": 700 }, svg);
      t.textContent = title;
      const lx = el("text", { x: x0 + SQ / 2, y: y0 + SQ + 40, "text-anchor": "middle", "font-size": 26, "font-style": "italic" }, svg);
      lx.textContent = "important hyperparameter";
      const ly = el("text", { x: x0 - 18, y: y0 + SQ / 2, "text-anchor": "middle", "font-size": 26, "font-style": "italic", transform: `rotate(-90 ${x0 - 18} ${y0 + SQ / 2})` }, svg);
      ly.textContent = "unimportant";
      const v = el("text", { x: x0 + SQ / 2, y: y0 + SQ + 90, "text-anchor": "middle", "font-size": 32, "font-weight": 900, fill: p ? C.teal : C.pink, opacity: 0 }, svg);
      v.textContent = verdict;
      pts.forEach(([x, y], i) => {
        const g = el("g", { opacity: 0 }, svg);
        const px = x0 + x * SQ, py = y0 + (1 - y) * SQ, sy = y0 - 20 - 120 * score(x);
        el("line", { x1: px, y1: py, x2: px, y2: sy, stroke: C.pink, "stroke-width": 1.5, "stroke-dasharray": "4 5", "stroke-opacity": 0.6 }, g);
        el("circle", { cx: px, cy: sy, r: 7, fill: C.pink }, g);
        el("circle", { cx: px, cy: py, r: 13, fill: C.pink, stroke: C.paper, "stroke-width": 3 }, g);
        pops.push({ g, delay: 0.25 + i * 0.16 + p * 0.08 });
      });
      pops.push({ g: v, delay: 2.0 });
    });
    let raf = null;
    function draw(t) { pops.forEach(o => o.g.setAttribute("opacity", Math.max(0, Math.min(1, (t - o.delay) / 0.25)))); }
    return {
      play() {
        cancelAnimationFrame(raf);
        const t0 = performance.now();
        const loop = now => { const t = (now - t0) / 1000; draw(t); if (t < 3) raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      },
      pause() { cancelAnimationFrame(raf); draw(0); },
      still() { draw(10); },
    };
  }

  // -------------------------------------------------------------------------
  // A perceptron weighs, adds and bends: three inputs, the colours of
  // fig 6.2 (a, b). Each fragment runs one stage (weigh, add, bend), and the
  // last turns the weights towards a target, as the Mark I's motors turned
  // its dials.
  // -------------------------------------------------------------------------
  function perceptron(host) {
    const W = 1400, H = 620;
    const BLUE = "#3498db", GREEN = "#27ae60", RED = "#e74c3c";
    const xs = [1.0, 0.5, -1.0], w0 = [0.8, -0.4, 0.6], b0 = 0.3, target = 1.0;
    const ETA = 0.15, ITERS = 6;
    // the weights after each training step: w += eta (y - y_hat) x, b likewise
    const hist = [{ w: w0.slice(), b: b0 }];
    for (let n = 0; n < ITERS; n++) {
      const p = hist[n], e = target - Math.max(0, p.w.reduce((a, wi, i) => a + wi * xs[i], 0) + p.b);
      hist.push({ w: p.w.map((wi, i) => wi + ETA * e * xs[i]), b: p.b + ETA * e });
    }
    const IN = { x: 190, ys: [140, 300, 460], r: 46 };
    const SUM = { x: 640, y: 300, r: 58 }, F = { x: 920, y: 300, r: 50 }, OUT = { x: 1190, y: 300, r: 50 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const fmt = (v, d) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
    const txt = (x, y, size, attrs, parent) =>
      el("text", Object.assign({ x, y, "text-anchor": "middle", "font-size": size }, attrs), parent || svg);

    // edges from each input to the sum, then their labels on top
    const edges = IN.ys.map(y => {
      const x1 = IN.x + IN.r, y1 = y, x2 = SUM.x - SUM.r * 0.8, y2 = SUM.y + (y - SUM.y) * 0.25;
      const line = el("line", { x1, y1, x2, y2, stroke: C.ink, "stroke-linecap": "round" }, svg);
      return { line, x1, y1, x2, y2 };
    });
    const halo = { stroke: C.paper, "stroke-width": 10, "paint-order": "stroke", "stroke-linejoin": "round" };
    edges.forEach((e, i) => {
      // labels sit beside the edge: above for the upper two, below for the lowest
      const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1), nx = (e.y2 - e.y1) / len, ny = -(e.x2 - e.x1) / len;
      const side = i === 2 ? -1 : 1, off = 34 * side;
      const at = (t, extra) => [e.x1 + t * (e.x2 - e.x1) + nx * (off + extra), e.y1 + t * (e.y2 - e.y1) + ny * (off + extra) + 10];
      const [wx, wy] = at(0.3, 0), [px, py] = at(0.7, 0);
      e.wl = txt(wx, wy, 30, Object.assign({ "font-weight": 700, fill: C.ink }, halo));
      e.prod = txt(px, py, 30, Object.assign({ "font-weight": 700, fill: C.pink }, halo));
      e.dot = el("circle", { r: 11, fill: C.pink, opacity: 0 }, svg);
    });
    // inputs
    IN.ys.forEach((y, i) => {
      el("circle", { cx: IN.x, cy: y, r: IN.r, fill: BLUE, stroke: C.ink, "stroke-width": 2 }, svg);
      txt(IN.x, y + 10, 30, { "font-weight": 700, fill: "#fff" }).textContent = fmt(xs[i], 1);
      const lab = txt(IN.x - IN.r - 18, y + 10, 32, { "text-anchor": "end", "font-style": "italic", fill: C.ink });
      lab.textContent = "x"; el("tspan", { "font-size": 22, dy: 8 }, lab).textContent = i + 1;
    });
    // sum, activation, output, joined by arrows
    const arrow = (x1, x2) => el("line", { x1, y1: SUM.y, x2, y2: SUM.y, stroke: C.ink, "stroke-width": 3 }, svg);
    arrow(SUM.x + SUM.r, F.x - F.r); arrow(F.x + F.r, OUT.x - OUT.r);
    const dot2 = el("circle", { r: 11, fill: C.pink, opacity: 0 }, svg);
    el("circle", { cx: SUM.x, cy: SUM.y, r: SUM.r, fill: C.ink }, svg);
    txt(SUM.x, SUM.y + 16, 46, { "font-weight": 700, fill: "#fff" }).textContent = "Σ";
    const bias = txt(SUM.x, SUM.y + SUM.r + 44, 28, { fill: C.ink });
    const uLab = txt(SUM.x, SUM.y + SUM.r + 84, 30, { "font-weight": 700, fill: C.pink });
    el("circle", { cx: F.x, cy: F.y, r: F.r, fill: GREEN }, svg);
    txt(F.x, F.y + 13, 40, { "font-weight": 700, "font-style": "italic", fill: "#fff" }).textContent = "f";
    txt(F.x, F.y + F.r + 44, 28, { fill: GREEN, "font-style": "italic" }).textContent = "activation";
    el("circle", { cx: OUT.x, cy: OUT.y, r: OUT.r, fill: RED }, svg);
    txt(OUT.x, OUT.y + 13, 38, { "font-weight": 700, fill: "#fff" }).textContent = "ŷ";
    const yLab = txt(OUT.x, OUT.y + OUT.r + 50, 40, { "font-weight": 900, fill: C.pink });
    const tLab = txt(OUT.x, OUT.y + OUT.r + 92, 28, { fill: C.muted });
    // ReLU inset above and right of f, with the current u marked
    const RX = F.x + 160, RY = 70, RW = 180, RH = 120, ur = [-1, 1.5];
    const RXs = u => RX + (u - ur[0]) / (ur[1] - ur[0]) * RW, RYs = v => RY + RH - v / ur[1] * RH;
    const ax0 = RXs(0), ay0 = RYs(0);
    el("line", { x1: RX, y1: ay0, x2: RX + RW + 10, y2: ay0, stroke: C.muted, "stroke-width": 2 }, svg);
    el("line", { x1: ax0, y1: RY + RH, x2: ax0, y2: RY - 10, stroke: C.muted, "stroke-width": 2 }, svg);
    el("path", { d: `M${RX + RW + 20},${ay0} l-12,-6 v12 z`, fill: C.muted }, svg);
    el("path", { d: `M${ax0},${RY - 20} l-6,12 h12 z`, fill: C.muted }, svg);
    el("path", { d: `M${RX},${ay0} L${ax0},${ay0} L${RX + RW},${RYs(ur[1])}`, fill: "none", stroke: GREEN, "stroke-width": 4 }, svg);
    txt(RX - 12, ay0 - 8, 26, { "text-anchor": "end", "font-weight": 700, fill: GREEN }).textContent = "ReLU";
    // axis labels: what goes in, what comes out
    txt(RX + RW + 28, ay0 + 9, 24, { "text-anchor": "start", fill: C.ink }).textContent = "input u";
    txt(ax0 - 12, RY - 2, 24, { "text-anchor": "end", fill: C.ink }).textContent = "output f(u)";
    const uDot = el("circle", { r: 10, fill: C.pink, opacity: 0 }, svg);
    // stage caption and equation
    const eq = txt(W / 2, 30, 42, { fill: C.ink });
    const stage = txt(W / 2, 590, 32, { "font-weight": 900, fill: C.ink });
    const parts = ["ŷ = ", "f", "(", "Σ ", "wᵢxᵢ", " + b", ")"].map(s => {
      const t = el("tspan", {}, eq); t.textContent = s; return t;
    });
    const HI = { 1: [4], 2: [3, 5], 3: [0, 1, 2, 6] };
    const STAGE = ["", "1 · Weigh each input", "2 · Add them up, plus a bias", "3 · Bend with the activation", "4 · Learn: turn the weights towards the target"];

    let raf = null;
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    function params(k, t) {   // weights at stage k, progress t
      if (k < 4) return hist[0];
      const pos = t * ITERS, n = Math.min(ITERS - 1, Math.floor(pos)), f = easeInOut(clamp01(pos - n));
      const a = hist[n], c = hist[n + 1];
      return { w: a.w.map((wi, i) => lerp(wi, c.w[i], f)), b: lerp(a.b, c.b, f), it: t >= 1 ? ITERS : n + (f > 0.5 ? 1 : 0) };
    }
    function draw(k, t) {
      const p = params(k, t), u = p.w.reduce((a, wi, i) => a + wi * xs[i], 0) + p.b, yh = Math.max(0, u);
      edges.forEach((e, i) => {
        e.line.setAttribute("stroke-width", 2 + 7 * Math.abs(p.w[i]));
        e.line.setAttribute("stroke", k === 4 && t < 1 ? C.pink : C.ink);
        e.wl.textContent = "w = " + fmt(p.w[i], 2);
        const travel = k === 1 && t < 0.6, s = easeInOut(clamp01(t / 0.6));
        e.dot.setAttribute("opacity", travel ? 1 : 0);
        e.dot.setAttribute("cx", lerp(e.x1, e.x2, s));
        e.dot.setAttribute("cy", lerp(e.y1, e.y2, s));
        e.prod.textContent = k > 1 || (k === 1 && t >= 0.6) ? fmt(p.w[i] * xs[i], 2) : "";
      });
      const add = k > 2 || (k === 2 && t >= 0.5), bend = k > 3 || (k === 3 && t >= 0.6);
      bias.textContent = k >= 2 ? "+ b = " + fmt(p.b, 2) : "";
      uLab.textContent = add ? "u = " + fmt(u, 2) : "";
      const run = (x1, x2, live) => {
        dot2.setAttribute("opacity", live ? 1 : 0);
        dot2.setAttribute("cx", lerp(x1, x2, easeInOut(clamp01(t / 0.6)))); dot2.setAttribute("cy", SUM.y);
      };
      if (k === 2) run(SUM.x + SUM.r, F.x - F.r, false);
      if (k === 3) run(F.x + F.r, OUT.x - OUT.r, t < 0.6); else if (k !== 2) dot2.setAttribute("opacity", 0);
      uDot.setAttribute("opacity", k >= 3 ? 1 : 0);
      uDot.setAttribute("cx", RXs(u)); uDot.setAttribute("cy", RYs(yh));
      yLab.textContent = bend ? "ŷ = " + fmt(yh, 2) : "";
      tLab.textContent = k === 4 ? `target y = ${fmt(target, 2)} · step ${p.it}` : "";
      stage.textContent = STAGE[k];
      parts.forEach((s, i) => s.setAttribute("fill", (HI[k] || []).includes(i) ? C.pink : C.ink));
      parts.forEach((s, i) => s.setAttribute("font-weight", (HI[k] || []).includes(i) ? 900 : 400));
    }
    function step(k, instant) {
      cancelAnimationFrame(raf);
      k = Math.max(0, Math.min(4, k));
      if (instant || PRINT || k === 0) { draw(k, 1); return; }
      const dur = k === 4 ? 3600 : 1400, t0 = performance.now();
      const go = now => {
        const t = clamp01((now - t0) / dur);
        draw(k, t);
        if (t < 1) raf = requestAnimationFrame(go);
      };
      raf = requestAnimationFrame(go);
    }
    draw(0, 1);
    return {
      step,
      play() {},
      pause() { cancelAnimationFrame(raf); },
      still() { draw(4, 1); },
    };
  }

  // -------------------------------------------------------------------------
  // Watch a network learn: replay the training of the three models of
  // fig 6.2 (d)-(f) on the Lennard-Jones data. Snapshots come from
  // tools/build_data.py, so every run (and the still frame) is the book's.
  // -------------------------------------------------------------------------
  function netTrain(host) {
    const nn = DATA.nn;
    if (!nn) return null;
    const W = 1400, H = 600, M = { l: 80, r: 30, t: 30, b: 70 };
    const xr = [0.9, 2.52], yr = [-1.6, 2.6];
    const X = x => M.l + (x - xr[0]) / (xr[1] - xr[0]) * (W - M.l - M.r);
    const Y = y => M.t + (1 - (y - yr[0]) / (yr[1] - yr[0])) * (H - M.t - M.b);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const cp = el("clipPath", { id: "nn-clip" }, el("defs", {}, svg));
    el("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }, cp);
    el("line", { x1: M.l, y1: H - M.b, x2: W - M.r, y2: H - M.b, stroke: C.axis, "stroke-width": 1.5 }, svg);
    el("line", { x1: M.l, y1: M.t, x2: M.l, y2: H - M.b, stroke: C.axis, "stroke-width": 1.5 }, svg);
    [1.0, 1.5, 2.0, 2.5].forEach(v => {
      el("text", { x: X(v), y: H - M.b + 36, "text-anchor": "middle", "font-size": 28 }, svg).textContent = v.toFixed(1);
    });
    [-1, 0, 1, 2].forEach(v => {
      el("text", { x: M.l - 16, y: Y(v) + 9, "text-anchor": "end", "font-size": 28 }, svg).textContent = v;
    });
    el("text", { x: W - M.r, y: H - 6, "text-anchor": "end", "font-size": 28, "font-style": "italic" }, svg).textContent = "r / σ";
    const g = el("g", { "clip-path": "url(#nn-clip)" }, svg);
    const path = ys => nn.x_grid.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(Math.max(-8, Math.min(8, ys[i]))).toFixed(1)}`).join("");
    el("path", { d: path(nn.true), fill: "none", stroke: C.muted, "stroke-width": 2.5, "stroke-dasharray": "9 7" }, g);
    nn.x_train.forEach((x, i) => el("circle", { cx: X(x), cy: Y(nn.y_train[i]), r: 9, fill: C.ink }, g));
    const fit = el("path", { fill: "none", stroke: C.pink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
    const name = el("text", { x: W - M.r - 10, y: M.t + 40, "text-anchor": "end", "font-size": 34, "font-weight": 900, fill: C.ink }, svg);
    const iter = el("text", { x: W - M.r - 10, y: M.t + 84, "text-anchor": "end", "font-size": 28, fill: C.muted }, svg);
    const score = el("text", { x: W - M.r - 10, y: M.t + 150, "text-anchor": "end", "font-size": 56, "font-weight": 900, fill: C.pink }, svg);
    let raf = null, pending = false;

    function show(run, s) {
      const st = run.steps[s];
      fit.setAttribute("d", path(st.curve));
      iter.textContent = `training step ${st.it}`;
      score.textContent = `R² = ${st.r2.toFixed(2)}`;
    }
    function step(k, instant) {
      const run = nn.runs[Math.min(k, nn.runs.length - 1)];
      name.textContent = run.name;
      cancelAnimationFrame(raf);
      if (instant && !pending) { show(run, run.steps.length - 1); return; }
      pending = false;
      const per = 2600 / run.steps.length, t0 = performance.now();
      const go = now => {
        const s = Math.min(run.steps.length - 1, Math.max(0, Math.floor((now - t0) / per)));
        show(run, s);
        if (s < run.steps.length - 1) raf = requestAnimationFrame(go);
      };
      raf = requestAnimationFrame(go);
      show(run, 0);
    }
    step(0, true);
    return {
      step,
      play() { pending = true; },   // the follow-up step() call replays the run
      pause() { cancelAnimationFrame(raf); pending = false; },
      still() { step(nn.runs.length - 1, true); },
    };
  }

  // -------------------------------------------------------------------------
  // A filter slides over the image: the 2 x 2 diagonal filter of the book's
  // worked example sweeps an 8 x 8 "micrograph" with a diagonal boundary,
  // and the feature map fills in beside it.
  // -------------------------------------------------------------------------
  function convSlide(host) {
    const N = 8, K = 2, M = N - K + 1, S = 56;
    const W = 1400, H = 600, IX = 40, FX = 600, MX = 900, Y0 = 92;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const img = [];
    for (let i = 0; i < N; i++) img.push(Array.from({ length: N }, (_, j) => +(i === j)));
    [[0, 5], [5, 1], [2, 6]].forEach(([i, j]) => { img[i][j] = 1; });   // stray bright pixels
    const filt = [[1, 0], [0, 1]];
    const label = (x, text) => el("text", { x, y: 56, "text-anchor": "middle", "font-size": 30, "font-weight": 700 }, svg).textContent = text;
    label(IX + N * S / 2, "micrograph");
    label(FX + K * S / 2, "filter K");
    label(MX + M * S / 2, "feature map");
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      el("rect", { x: IX + j * S, y: Y0 + i * S, width: S, height: S, fill: img[i][j] ? C.ink : C.paper, stroke: C.faint, "stroke-width": 1.5 }, svg);
    }
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
      el("rect", { x: FX + j * S, y: Y0 + 2 * S + i * S, width: S, height: S, fill: filt[i][j] ? C.ink : C.paper, stroke: C.pink, "stroke-width": 3 }, svg);
    }
    el("text", { x: FX + K * S / 2, y: Y0 + 2 * S + K * S + 46, "text-anchor": "middle", "font-size": 26, fill: C.muted }, svg).textContent = "same weights";
    el("text", { x: FX + K * S / 2, y: Y0 + 2 * S + K * S + 80, "text-anchor": "middle", "font-size": 26, fill: C.muted }, svg).textContent = "everywhere";
    const cells = [];
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      let v = 0;
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) v += img[i + a][j + b] * filt[a][b];
      const r = el("rect", { x: MX + j * S, y: Y0 + i * S, width: S, height: S, fill: C.paper, stroke: C.faint, "stroke-width": 1.5 }, svg);
      const t = el("text", { x: MX + j * S + S / 2, y: Y0 + i * S + S / 2 + 10, "text-anchor": "middle", "font-size": 28, "font-weight": 700 }, svg);
      cells.push({ i, j, v, r, t });
    }
    const win = el("rect", { width: K * S, height: K * S, fill: "none", stroke: C.pink, "stroke-width": 5, rx: 4 }, svg);
    const out = el("rect", { width: S, height: S, fill: "none", stroke: C.pink, "stroke-width": 5, rx: 4 }, svg);
    const FILL = [C.paper, "#f3d3df", C.pink];
    let raf = null;

    function draw(n) {   // n cells of the feature map computed so far
      cells.forEach((c, k) => {
        const on = k < n;
        c.r.setAttribute("fill", on ? FILL[c.v] : C.paper);
        c.t.textContent = on ? c.v : "";
        c.t.setAttribute("fill", c.v === 2 ? C.paper : C.ink);
      });
      const cur = cells[Math.min(n, cells.length) - 1];
      const vis = n > 0 && n <= cells.length && !(n === cells.length && done);
      [win, out].forEach(r => r.setAttribute("opacity", vis ? 1 : 0));
      if (cur) {
        win.setAttribute("x", IX + cur.j * S); win.setAttribute("y", Y0 + cur.i * S);
        out.setAttribute("x", MX + cur.j * S); out.setAttribute("y", Y0 + cur.i * S);
      }
    }
    let done = false;
    return {
      play() {
        cancelAnimationFrame(raf);
        done = false;
        const t0 = performance.now(), per = 140;
        const loop = now => {
          const n = Math.floor((now - t0 - 400) / per) + 1;
          if (n > cells.length) { done = true; draw(cells.length); return; }
          draw(Math.max(0, n));
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      },
      pause() { cancelAnimationFrame(raf); done = false; draw(0); },
      still() { done = true; draw(cells.length); },
    };
  }

  // -------------------------------------------------------------------------
  // Cat or dog: one edge filter scans two drawn faces. Each face is also drawn
  // on a hidden 64 x 64 canvas, filtered with K, and max-pooled to an 8 x 8
  // feature map, so the numbers that fill in are computed, not typed in.
  // -------------------------------------------------------------------------
  const CREAM = "#fff3e0", TAN_DARK = "#c98a52";
  const PET_FACES = {
    dog: [
      { d: "M 92 185 L 108 52 Q 116 38 128 50 L 190 122 Z", fill: C.tan, stroke: 5 },
      { d: "M 308 185 L 292 52 Q 284 38 272 50 L 210 122 Z", fill: C.tan, stroke: 5 },
      { d: "M 200 98 C 282 98 332 152 332 228 C 332 302 276 350 200 350 C 124 350 68 302 68 228 C 68 152 118 98 200 98 Z", fill: C.tan },
      { d: "M 116 150 L 124 78 L 160 124 Z", fill: CREAM },
      { d: "M 284 150 L 276 78 L 240 124 Z", fill: CREAM },
      { d: "M 200 222 C 250 218 300 238 318 272 C 304 326 256 346 200 346 C 144 346 96 326 82 272 C 100 238 150 218 200 222 Z", fill: CREAM },
      { e: [200, 276, 58, 48], fill: CREAM },
      { e: [158, 174, 14, 8], fill: CREAM },
      { e: [242, 174, 14, 8], fill: CREAM },
      { e: [158, 204, 14, 11], fill: C.ink },
      { e: [242, 204, 14, 11], fill: C.ink },
      { e: [162, 200, 3.5, 3.5], fill: "#ffffff" },
      { e: [246, 200, 3.5, 3.5], fill: "#ffffff" },
      { d: "M 200 98 C 282 98 332 152 332 228 C 332 302 276 350 200 350 C 124 350 68 302 68 228 C 68 152 118 98 200 98 Z", stroke: 5 },
      { d: "M 178 252 Q 200 244 222 252 Q 216 274 200 277 Q 184 274 178 252 Z", fill: C.ink },
      { d: "M 200 277 L 200 292 M 200 292 Q 186 306 170 296 M 200 292 Q 214 306 230 296", stroke: 5 },
    ],
    cat: [
      { d: "M 82 200 L 92 66 Q 98 52 110 62 L 178 130 Z", fill: C.tan, stroke: 5 },
      { d: "M 318 200 L 308 66 Q 302 52 290 62 L 222 130 Z", fill: C.tan, stroke: 5 },
      { e: [200, 238, 138, 114], fill: C.tan, stroke: 5 },
      { d: "M 106 160 L 110 92 L 150 134 Z", fill: CREAM },
      { d: "M 294 160 L 290 92 L 250 134 Z", fill: CREAM },
      { d: "M 200 130 L 200 160 M 176 134 L 182 160 M 224 134 L 218 160", stroke: 7, color: TAN_DARK },
      { e: [200, 284, 50, 34], fill: CREAM },
      { e: [118, 272, 20, 11], fill: C.pink, opacity: 0.18 },
      { e: [282, 272, 20, 11], fill: C.pink, opacity: 0.18 },
      { e: [150, 222, 32, 32], fill: C.ink },
      { e: [250, 222, 32, 32], fill: C.ink },
      { e: [161, 209, 11, 11], fill: "#ffffff" },
      { e: [261, 209, 11, 11], fill: "#ffffff" },
      { e: [141, 236, 5, 5], fill: "#ffffff" },
      { e: [241, 236, 5, 5], fill: "#ffffff" },
      { d: "M 188 264 L 212 264 L 200 277 Z", fill: C.ink, stroke: 3 },
      { d: "M 200 277 Q 192 294 178 288 M 200 277 Q 208 294 222 288", stroke: 4.5 },
      { d: "M 140 276 L 52 262 M 140 288 L 50 292 M 142 300 L 60 320 M 260 276 L 348 262 M 260 288 L 350 292 M 258 300 L 340 320", stroke: 3 },
    ],
  };

  function petFaceSVG(shapes, parent) {
    shapes.forEach(sh => {
      const a = {
        fill: sh.fill || "none", stroke: sh.stroke ? (sh.color || C.ink) : "none",
        "stroke-width": sh.stroke || 0, "stroke-linejoin": "round", "stroke-linecap": "round",
      };
      if (sh.opacity) a.opacity = sh.opacity;
      if (sh.d) el("path", Object.assign({ d: sh.d }, a), parent);
      else el("ellipse", Object.assign({ cx: sh.e[0], cy: sh.e[1], rx: sh.e[2], ry: sh.e[3] }, a), parent);
    });
  }

  // Grey levels (0 dark, 1 light) of a face drawn at R x R pixels.
  function petFacePixels(shapes, R) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = R;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, R, R);
    ctx.scale(R / 400, R / 400);
    ctx.lineJoin = ctx.lineCap = "round";
    shapes.forEach(sh => {
      const path = sh.d ? new Path2D(sh.d) : new Path2D();
      if (!sh.d) path.ellipse(sh.e[0], sh.e[1], sh.e[2], sh.e[3], 0, 0, 2 * Math.PI);
      ctx.globalAlpha = sh.opacity || 1;
      if (sh.fill) { ctx.fillStyle = sh.fill; ctx.fill(path); }
      if (sh.stroke) { ctx.strokeStyle = sh.color || C.ink; ctx.lineWidth = sh.stroke; ctx.stroke(path); }
    });
    const px = ctx.getImageData(0, 0, R, R).data, g = [];
    for (let i = 0; i < R; i++) {
      g.push([]);
      for (let j = 0; j < R; j++) {
        const k = 4 * (i * R + j);
        g[i].push((0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]) / 255);
      }
    }
    return g;
  }

  function petConv(host) {
    const KER = [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]];
    const R = 64, M = 8, B = R / M;                      // 8 x 8 pooled map
    // One row per animal, left to right: image, filter K, feature map, classifier.
    const W = 870, H = 570, ROW = 270, TOP = 50, FS = 190, KC = 42, CELL = 30;
    const KX = 240, MX = 418, CX = 718, CW = 150, CH = 112;
    const COLS = [{ name: "dog" }, { name: "cat" }];
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    // Step 0 shows the faces alone; step 1 fades in the pipeline and runs the scan.
    const pipe = el("g", { opacity: 0, style: "transition: opacity 0.6s" });
    const text = (x, y, s, a, parent) => { const t = el("text", Object.assign({ x, y, "text-anchor": "middle", "font-size": 26 }, a || {}), parent || pipe); t.textContent = s; return t; };
    const arrow = (x1, x2, y) => {
      el("line", { x1, y1: y, x2: x2 - 10, y2: y, stroke: C.muted, "stroke-width": 3 }, pipe);
      el("path", { d: `M${x2 - 14},${y - 8} L${x2},${y} L${x2 - 14},${y + 8} Z`, fill: C.muted }, pipe);
    };
    text(FS / 2, 26, "image", { "font-weight": 700, fill: C.muted }, svg);
    [[KX + 1.5 * KC, "filter K"], [MX + M * CELL / 2, "feature map"], [CX + CW / 2, "classifier"]]
      .forEach(([x, t]) => text(x, 26, t, { "font-weight": 700, fill: C.muted }));

    // Filter each face, take |response|, max-pool to M x M, scale both maps together to 0-9.
    const raw = COLS.map(col => {
      const g = petFacePixels(PET_FACES[col.name], R), out = [];
      for (let a = 0; a < M; a++) {
        out.push([]);
        for (let b = 0; b < M; b++) {
          let m = 0;
          for (let i = Math.max(1, a * B); i < Math.min(R - 1, (a + 1) * B); i++)
            for (let j = Math.max(1, b * B); j < Math.min(R - 1, (b + 1) * B); j++) {
              let v = 0;
              for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) v += KER[u + 1][w + 1] * g[i + u][j + w];
              m = Math.max(m, Math.abs(v));
            }
          out[a].push(m);
        }
      }
      return out;
    });
    const top = Math.max(...raw.flat(2));
    const SHADE = ["#fbfaf7", "#fbeef3", "#f7dde7", "#f3ccdb", "#efbbcf", "#eaa9c3", "#e597b6", "#e085aa", "#da6f97", C.pink];

    const panels = COLS.map((col, n) => {
      const y0 = TOP + n * ROW, mid = y0 + M * CELL / 2;
      const fx = 0, fy = mid - FS / 2, mx = MX, my = y0;
      petFaceSVG(PET_FACES[col.name], el("g", { transform: `translate(${fx} ${fy}) scale(${FS / 400})` }, svg));
      arrow(FS + 12, KX - 10, mid);
      // The same filter K in both rows: same weights, different images.
      const ky = mid - 1.5 * KC;
      KER.forEach((row, i) => row.forEach((v, j) => {
        el("rect", { x: KX + j * KC, y: ky + i * KC, width: KC, height: KC, fill: v > 0 ? C.pink : C.paper, stroke: C.pink, "stroke-width": 2 }, pipe);
        text(KX + j * KC + KC / 2, ky + i * KC + KC / 2 + 8, v > 0 ? v : "−" + -v, { "font-size": 26, "font-weight": 700, fill: v > 0 ? C.paper : C.ink });
      }));
      arrow(KX + 3 * KC + 10, MX - 10, mid);
      const cells = [];
      for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) {
        const v = Math.round(9 * raw[n][a][b] / top);
        const r = el("rect", { x: mx + b * CELL, y: my + a * CELL, width: CELL, height: CELL, fill: C.paper, stroke: C.faint, "stroke-width": 1 }, pipe);
        const t = text(mx + b * CELL + CELL / 2, my + a * CELL + CELL / 2 + 10, "", { "font-size": 27, "font-weight": 700, fill: v > 5 ? C.paper : C.ink });
        cells.push({ v, r, t, a, b });
      }
      arrow(MX + M * CELL + 10, CX - 10, mid);
      // Classifier: reads the feature map and names the animal once the scan is done.
      el("rect", { x: CX, y: mid - CH / 2, width: CW, height: CH, rx: 12, fill: C.paper, stroke: C.ink, "stroke-width": 3 }, pipe);
      const labels = ["dog", "cat"].map((name, k) =>
        ({ name, t: text(CX + CW / 2, mid - 12 + k * 40, name, { "font-size": 30 }) }));
      const win = el("rect", { width: FS / M, height: FS / M, fill: "none", stroke: C.pink, "stroke-width": 4, rx: 3, opacity: 0 }, pipe);
      const out = el("rect", { width: CELL, height: CELL, fill: "none", stroke: C.pink, "stroke-width": 4, rx: 3, opacity: 0 }, pipe);
      return { cells, win, out, fx, fy, mx, my, labels, name: col.name };
    });

    let raf = null;
    function draw(n, done) {   // n cells of each feature map computed so far
      panels.forEach(p => {
        p.cells.forEach((c, k) => {
          const on = k < n;
          c.r.setAttribute("fill", on ? SHADE[c.v] : C.paper);
          c.t.textContent = on ? c.v : "";
        });
        p.labels.forEach(l => {
          const hit = done && l.name === p.name;
          l.t.setAttribute("fill", hit ? C.pink : C.faint);
          l.t.setAttribute("font-weight", hit ? 900 : 300);
        });
        const cur = p.cells[n - 1], vis = n > 0 && !done;
        [p.win, p.out].forEach(r => r.setAttribute("opacity", vis ? 1 : 0));
        if (cur) {
          p.win.setAttribute("x", p.fx + cur.b * FS / M); p.win.setAttribute("y", p.fy + cur.a * FS / M);
          p.out.setAttribute("x", p.mx + cur.b * CELL); p.out.setAttribute("y", p.my + cur.a * CELL);
        }
      });
    }
    svg.appendChild(pipe);   // above the faces, so the scan window shows on top
    const N = M * M;
    function scan() {
      cancelAnimationFrame(raf);
      const t0 = performance.now(), per = 110;
      const loop = now => {
        const n = Math.floor((now - t0 - 700) / per) + 1;
        if (n > N) { draw(N, true); return; }
        draw(Math.max(0, n), false);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    function step(k, instant) {
      cancelAnimationFrame(raf);
      pipe.setAttribute("opacity", k > 0 ? 1 : 0);
      if (k === 0) draw(0, false);
      else if (instant) draw(N, true);
      else scan();
    }
    return {
      step,
      play() {},
      pause() { step(0, true); },
      still() { step(1, true); },
    };
  }

  // -------------------------------------------------------------------------
  // Each layer sees one hop further: a rocksalt layer as a graph. Stepping to
  // L layers sends messages inward shell by shell, and the receptive field of
  // the central atom grows to every atom within L hops.
  // -------------------------------------------------------------------------
  function messagePass(host) {
    const N = 7, G = 82, c = 3;
    const W = 1400, H = 620, OX = 120, OY = 60;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const P = (i, j) => [OX + j * G, OY + i * G];
    const hop = (i, j) => Math.abs(i - c) + Math.abs(j - c);
    const field = el("path", { fill: C.pink, "fill-opacity": 0.08, stroke: C.pink, "stroke-width": 3, "stroke-dasharray": "10 8" }, svg);
    const edges = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      [[0, 1], [1, 0]].forEach(([di, dj]) => {
        if (i + di >= N || j + dj >= N) return;
        const [x1, y1] = P(i, j), [x2, y2] = P(i + di, j + dj);
        el("line", { x1, y1, x2, y2, stroke: C.faint, "stroke-width": 3 }, svg);
        edges.push([[i, j], [i + di, j + dj]]);
      });
    }
    const nodes = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const [x, y] = P(i, j), centre = i === c && j === c;
      const n = el("circle", { cx: x, cy: y, r: (i + j) % 2 ? 17 : 23, fill: centre ? C.pink : (i + j) % 2 ? C.steel : C.tan, stroke: C.paper, "stroke-width": 3 }, svg);
      nodes.push({ i, j, h: hop(i, j), n });
    }
    const pulses = el("g", {}, svg);
    const RX = OX + (N - 1) * G + 140;
    const big = el("text", { x: RX, y: 230, "font-size": 150, "font-weight": 900, fill: C.pink }, svg);
    const sub = el("text", { x: RX, y: 300, "font-size": 34, "font-weight": 700, fill: C.ink }, svg);
    const seen = el("text", { x: RX, y: 380, "font-size": 30, fill: C.ink }, svg);
    const reach = el("text", { x: RX, y: 430, "font-size": 30, fill: C.muted }, svg);
    let raf = null, shown = 0;

    function setField(L) {
      const [cx, cy] = P(c, c), r = L * G + 30;
      field.setAttribute("d", L ? `M${cx},${cy - r}L${cx + r},${cy}L${cx},${cy + r}L${cx - r},${cy}Z` : "");
      const count = nodes.filter(o => o.h <= L).length;
      nodes.forEach(o => o.n.setAttribute("opacity", o.h <= L ? 1 : 0.35));
      big.textContent = `L = ${L}`;
      sub.textContent = L === 1 ? "layer" : "layers";
      seen.textContent = `atom sees ${count} atom${count > 1 ? "s" : ""}`;
      reach.textContent = L ? `within ${L} hop${L > 1 ? "s" : ""}` : "only itself";
    }
    function step(L, instant) {
      cancelAnimationFrame(raf);
      while (pulses.firstChild) pulses.removeChild(pulses.firstChild);
      if (instant || L <= shown) { shown = L; setField(L); return; }
      // Information from hop L reaches the centre after L layers: animate the
      // messages inward, one shell per layer, then widen the field.
      const legs = [];
      for (let s = L; s >= 1; s--) {
        edges.forEach(([a, b]) => {
          const ha = hop(...a), hb = hop(...b);
          if (Math.max(ha, hb) === s && Math.min(ha, hb) === s - 1) {
            const [from, to] = ha > hb ? [a, b] : [b, a];
            legs.push({ from: P(...from), to: P(...to), start: (L - s) * 0.55,
                        dot: el("circle", { r: 9, fill: C.pink, opacity: 0 }, pulses) });
          }
        });
      }
      const t0 = performance.now(), total = L * 0.55 + 0.5;
      setField(shown);
      const go = now => {
        const t = (now - t0) / 1000;
        legs.forEach(o => {
          const a = (t - o.start) / 0.5;
          o.dot.setAttribute("opacity", a > 0 && a < 1 ? 1 : 0);
          const e = easeInOut(Math.max(0, Math.min(1, a)));
          o.dot.setAttribute("cx", o.from[0] + (o.to[0] - o.from[0]) * e);
          o.dot.setAttribute("cy", o.from[1] + (o.to[1] - o.from[1]) * e);
        });
        if (t < total) raf = requestAnimationFrame(go);
        else { shown = L; setField(L); }
      };
      raf = requestAnimationFrame(go);
    }
    step(0, true);
    return { step, play() {}, pause() { cancelAnimationFrame(raf); }, still() { step(3, true); } };
  }

  // -------------------------------------------------------------------------
  // Carve a crystal out of noise: the Chemeleon BaTiO3 run of fig 7.3.
  // Forward: the finished cell scrambled by growing noise (the fixed process).
  // Reverse: the recorded denoising from random coordinates (the learned one).
  // Between the five recorded frames the atoms are interpolated smoothly,
  // taking the shortest periodic path so none jumps across the cell.
  // -------------------------------------------------------------------------
  function diffusion(host) {
    const d = DATA.diff;
    if (!d) return null;
    const W = 1400, H = 600, S = 400, OX = 170, OY = 520, KX = 0.30, KY = 0.18;
    const proj = f => [OX + S * (f[0] + KX * f[1]), OY - S * (f[2] + KY * f[1])];
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const COL = { 56: C.tan, 22: C.steel, 8: C.ink }, RAD = { 56: 26, 22: 20, 8: 14 }, SYM = { 56: "Ba", 22: "Ti", 8: "O" };
    const corners = [];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) corners.push([a, b, c]);
    corners.forEach((p, i) => corners.forEach((q, j) => {
      if (j > i && Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) === 1) {
        const [x1, y1] = proj(p), [x2, y2] = proj(q);
        el("line", { x1, y1, x2, y2, stroke: C.muted, "stroke-width": 1.5, "stroke-opacity": 0.6 }, svg);
      }
    }));
    const layer = el("g", {}, svg);
    const RX = 900;
    const tText = el("text", { x: RX, y: 210, "font-size": 96, "font-weight": 900, fill: C.pink }, svg);
    const what = el("text", { x: RX, y: 280, "font-size": 34, "font-weight": 700, fill: C.ink }, svg);
    const how = el("text", { x: RX, y: 330, "font-size": 30, fill: C.muted }, svg);
    [56, 22, 8].forEach((z, k) => {
      el("circle", { cx: RX + 14 + k * 130, cy: 440, r: RAD[z], fill: COL[z] }, svg);
      el("text", { x: RX + 50 + k * 130, y: 450, "font-size": 30 }, svg).textContent = SYM[z];
    });
    const EPS = 0.06, BOND = 0.55;
    const wrap = v => v - Math.floor(v);
    const mi = v => v - Math.round(v);

    function lerp(frames, s) {   // s in [0, frames.length - 1]
      const k = Math.min(frames.length - 2, Math.floor(s)), a = easeInOut(s - k);
      return frames[k].map((p, i) => p.map((v, x) => wrap(v + a * mi(frames[k + 1][i][x] - v))));
    }
    function draw(frac) {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      const pos = [];
      frac.forEach((f, i) => {
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const p = [f[0] + a, f[1] + b, f[2] + c];
          if (p.every(v => v >= -EPS && v <= 1 + EPS)) pos.push({ p, z: d.Z[i] });
        }
      });
      pos.forEach(u => { if (u.z !== 22) return; pos.forEach(v => {
        if (v.z !== 8 || Math.hypot(u.p[0] - v.p[0], u.p[1] - v.p[1], u.p[2] - v.p[2]) >= BOND) return;
        const [x1, y1] = proj(u.p), [x2, y2] = proj(v.p);
        el("line", { x1, y1, x2, y2, stroke: C.ink, "stroke-width": 4, "stroke-opacity": 0.45, "stroke-linecap": "round" }, layer);
      }); });
      pos.sort((u, v) => v.p[1] - u.p[1]).forEach(u => {
        const [x, y] = proj(u.p);
        el("circle", { cx: x, cy: y, r: RAD[u.z], fill: COL[u.z], stroke: C.paper, "stroke-width": 2.5 }, layer);
      });
    }
    function label(t, mode) {
      tText.textContent = `t = ${Math.round(t)}`;
      what.textContent = mode === "rev" ? "denoising" : mode === "fwd" ? "adding noise" : "a real crystal";
      how.textContent = mode === "rev" ? "learned: the network removes noise" : mode === "fwd" ? "fixed: no learning here" : "BaTiO₃, five atoms per cell";
    }
    let raf = null;
    function run(frames, ts, mode, dur) {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const go = now => {
        const a = Math.max(0, Math.min(1, (now - t0) / dur)), s = a * (frames.length - 1);
        draw(lerp(frames, s));
        const k = Math.min(ts.length - 2, Math.floor(s));
        label(ts[k] + (ts[k + 1] - ts[k]) * (s - k), mode);
        if (a < 1) raf = requestAnimationFrame(go);
      };
      raf = requestAnimationFrame(go);
    }
    const fwdT = d.t.slice().reverse();          // 0 ... 256
    function step(k, instant) {
      cancelAnimationFrame(raf);
      if (k === 1 && !instant) return run(d.forward, fwdT, "fwd", 3200);
      if (k === 2 && !instant) return run(d.reverse, d.t, "rev", 4400);
      if (k === 1) { draw(d.forward[d.forward.length - 1]); label(256, "fwd"); return; }
      draw(d.reverse[d.reverse.length - 1]); label(0, k === 2 ? "rev" : "start");
    }
    step(0, true);
    return { step, play() {}, pause() { cancelAnimationFrame(raf); }, still() { step(2, true); } };
  }

  // -------------------------------------------------------------------------
  // Sampling is not design: the Chemeleon2 latent map of fig 7.4. Known
  // materials, then unconditional samples, then the samples that meet the
  // condition (a wide band gap).
  // -------------------------------------------------------------------------
  function latentSample(host) {
    const lt = DATA.latent;
    if (!lt) return null;
    const W = 1400, H = 620, PL = 20, PT = 20, PW = 860, PH = 580;
    const X = v => PL + (v - lt.xr[0]) / (lt.xr[1] - lt.xr[0]) * PW;
    const Y = v => PT + (1 - (v - lt.yr[0]) / (lt.yr[1] - lt.yr[0])) * PH;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    el("rect", { x: PL, y: PT, width: PW, height: PH, fill: "none", stroke: C.faint, "stroke-width": 1.5 }, svg);
    const inside = ([x, y]) => x >= lt.xr[0] && x <= lt.xr[1] && y >= lt.yr[0] && y <= lt.yr[1];
    const gT = el("g", {}, svg), gD = el("g", {}, svg), gC = el("g", {}, svg);
    lt.train.filter(inside).forEach(([x, y]) => el("circle", { cx: X(x), cy: Y(y), r: 4.5, fill: C.muted, "fill-opacity": 0.55 }, gT));
    const dn = lt.denovo.filter(inside).map(([x, y]) => el("circle", { cx: X(x), cy: Y(y), r: 7, fill: "none", stroke: C.tan, "stroke-width": 2.5 }, gD));
    const cd = lt.cond.filter(inside).map(([x, y]) => el("circle", { cx: X(x), cy: Y(y), r: 7, fill: "none", stroke: C.tan, "stroke-width": 2.5 }, gC));
    // Shuffle the arrival order once, with a fixed seed, so the rain looks random.
    const all = dn.concat(cd);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const delay = all.map(() => rnd() * 1.6);
    const RX = PL + PW + 50;
    const head = el("text", { x: RX, y: 150, "font-size": 48, "font-weight": 900, fill: C.ink }, svg);
    const l1 = el("text", { x: RX, y: 220, "font-size": 30, fill: C.ink }, svg);
    const l2 = el("text", { x: RX, y: 265, "font-size": 30, fill: C.muted }, svg);
    const l3 = el("text", { x: RX, y: 310, "font-size": 30, fill: C.muted }, svg);
    const STEP = [
      ["p(x)", "known materials", "a learned distribution", ""],
      ["x ~ p(x)", "new samples", "land where the data", "already are"],
      ["x ~ p(x | c)", "condition c:", "band gap > 2.5 eV", `${cd.length} samples hit it`],
    ];
    let raf = null;

    function paint(k, t) {   // t: seconds into the arrival animation
      [head, l1, l2, l3].forEach((n, i) => { n.textContent = STEP[k][i]; });
      head.setAttribute("fill", k === 2 ? C.pink : C.ink);
      gT.setAttribute("opacity", k === 2 ? 0.35 : 1);
      all.forEach((c, i) => {
        const a = k === 0 ? 0 : Math.max(0, Math.min(1, (t - delay[i]) / 0.3));
        c.setAttribute("opacity", a);
        const hit = i >= dn.length;
        c.setAttribute("stroke", k === 2 ? (hit ? C.pink : C.faint) : C.tan);
        c.setAttribute("r", k === 2 && hit ? 10 : 7);
        c.setAttribute("stroke-width", k === 2 && hit ? 4 : 2.5);
      });
    }
    function step(k, instant) {
      cancelAnimationFrame(raf);
      if (k !== 1 || instant) return paint(k, 99);
      const t0 = performance.now();
      const go = now => { const t = (now - t0) / 1000; paint(1, t); if (t < 2) raf = requestAnimationFrame(go); };
      raf = requestAnimationFrame(go);
    }
    step(0, true);
    return { step, play() {}, pause() { cancelAnimationFrame(raf); }, still() { step(2, true); } };
  }

  // -------------------------------------------------------------------------
  // Every word reads every other: the real first-layer attention of a
  // materials-domain encoder (MatSciBERT) reading one sentence, as in fig 8.2.
  // Arcs fan out from the query token to every key, thickness by weight, and
  // the bars beneath give the weights themselves (each row sums to one).
  // -------------------------------------------------------------------------
  function attention(host) {
    const at = DATA.attn;
    if (!at) return null;
    const A = at.layers[0], T = at.tokens, N = T.length;
    const W = 1400, H = 600, X0 = 110, DX = (W - 2 * X0) / (N - 1), TY = 330, BY = 390, BH = 170;
    const CHEM = new Set(["ZnO", "band", "gap", "3.4", "eV"]);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const X = i => X0 + i * DX;
    const arcs = el("g", {}, svg);
    const toks = T.map((t, i) => {
      const n = el("text", { x: X(i), y: TY, "text-anchor": "middle", "font-size": 44, "font-weight": CHEM.has(t) ? 900 : 300 }, svg);
      n.textContent = t;
      return n;
    });
    el("line", { x1: X0 - 60, y1: BY + BH, x2: W - X0 + 60, y2: BY + BH, stroke: C.faint, "stroke-width": 2 }, svg);
    const bars = T.map((_, i) => ({
      r: el("rect", { x: X(i) - 34, width: 68, fill: C.pink, "fill-opacity": 0.85 }, svg),
      v: el("text", { x: X(i), "text-anchor": "middle", "font-size": 26, fill: C.ink }, svg),
    }));
    let raf = null, pinned = 0;

    function show(q, fade) {
      while (arcs.firstChild) arcs.removeChild(arcs.firstChild);
      toks.forEach((n, i) => n.setAttribute("fill", i === q ? C.pink : C.ink));
      A[q].forEach((w, k) => {
        const h = Math.max(4, (w / 0.42) * BH);
        bars[k].r.setAttribute("y", BY + BH - h); bars[k].r.setAttribute("height", h);
        bars[k].r.setAttribute("fill", k === q ? C.muted : C.pink);
        bars[k].v.setAttribute("y", BY + BH - h - 10); bars[k].v.textContent = w.toFixed(2);
        if (k === q) return;
        const x1 = X(q), x2 = X(k), mid = (x1 + x2) / 2, lift = 40 + Math.abs(k - q) * 34;
        el("path", { d: `M${x1},${TY - 52} Q${mid},${TY - 52 - 2 * lift} ${x2},${TY - 52}`, fill: "none",
                     stroke: C.pink, "stroke-width": 1 + 40 * w, "stroke-opacity": 0.25 + 1.6 * w * (fade ?? 1), "stroke-linecap": "round" }, arcs);
      });
    }
    function cycle() {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const go = now => { show(Math.floor((now - t0) / 1600) % N); raf = requestAnimationFrame(go); };
      raf = requestAnimationFrame(go);
    }
    function step(k) {
      cancelAnimationFrame(raf);
      pinned = k;
      if (k === 0) return cycle();
      show(T.indexOf(k === 1 ? "band" : "3.4"));
    }
    show(0);
    return {
      step,
      play() { if (!pinned) cycle(); },
      pause() { cancelAnimationFrame(raf); },
      still() { step(2); },
    };
  }

  // -------------------------------------------------------------------------
  // A language model predicts the next word: real next-token probabilities of
  // a small open model (data/next_token.json). Steps 1-4 append the most likely
  // token and show the distribution for the new prefix; step 5 reheats the
  // last distribution to a higher temperature, so the bars flatten.
  // -------------------------------------------------------------------------
  function nextWord(host) {
    const nx = DATA.next;
    if (!nx) return null;
    const S = nx.steps, K = S[0].top.length, last = S.length - 1;
    const W = 1400, H = 600, LX = 470, BX = 490, BW = 760, PMAX = 0.5, RY = 150, RH = 54;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    const prompt = el("text", { x: 0, y: 56, "font-size": 46, "font-weight": 300 }, svg);
    const temp = el("text", { x: W, y: 56, "text-anchor": "end", "font-size": 30, fill: C.muted }, svg);
    el("line", { x1: BX, y1: RY - 20, x2: BX, y2: RY + K * RH - 6, stroke: C.faint, "stroke-width": 2 }, svg);
    const rows = Array.from({ length: K }, (_, i) => {
      const y = RY + i * RH;
      return {
        t: el("text", { x: LX, y: y + 30, "text-anchor": "end", "font-size": 36 }, svg),
        r: el("rect", { x: BX, y: y, height: RH - 14, rx: 4 }, svg),
        v: el("text", { y: y + 30, "font-size": 28, fill: C.ink }, svg),
      };
    });
    const show = s => (s > last ? { ...S[last], top: S[last].hot } : S[s]);

    function step(s) {
      const d = show(s), hot = s > last;
      prompt.textContent = "";
      const pre = el("tspan", {}, prompt);
      pre.textContent = nx.steps[0].prefix;
      const added = el("tspan", { fill: C.pink, "font-weight": 700 }, prompt);
      added.textContent = d.prefix.slice(nx.steps[0].prefix.length);
      const gap = el("tspan", { fill: C.muted }, prompt);
      gap.textContent = " ___";
      temp.textContent = `sampling temperature ${hot ? nx.t_hot : 1}`;
      temp.setAttribute("fill", hot ? C.pink : C.muted);
      d.top.forEach(([tok, p], i) => {
        const w = Math.max(3, (p / PMAX) * BW), row = rows[i];
        row.t.textContent = tok.trim();
        row.t.setAttribute("font-weight", i === 0 ? 900 : 300);
        row.r.setAttribute("width", w);
        row.r.setAttribute("fill", i === 0 ? C.pink : C.steel);
        row.r.setAttribute("fill-opacity", i === 0 ? 0.9 : 0.55);
        row.v.setAttribute("x", BX + w + 12);
        row.v.textContent = `${(100 * p).toFixed(p < 0.1 ? 1 : 0)}%`;
      });
    }
    step(0);
    return { step, play() {}, pause() {}, still() { step(last + 1); } };
  }

  // -------------------------------------------------------------------------
  // Bayesian optimisation, one experiment at a time: the synthesis-yield
  // example of fig 9.3 run on. Top: the Gaussian-process surrogate. Bottom:
  // the upper-confidence-bound acquisition, whose peak is the next anneal.
  // -------------------------------------------------------------------------
  function boLoop(host) {
    const bo = DATA.bo;
    if (!bo) return null;
    const W = 1400, H = 640, L = 110, R = 330, T1 = 20, B1 = 300, T2 = 360, B2 = 560;
    const X = t => L + (t - 400) / 500 * (W - L - R);
    const Y1 = y => B1 - (y + 0.05) / 1.15 * (B1 - T1);
    const Y2 = y => B2 - (y - 0.0) / 1.3 * (B2 - T2);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    [[T1, B1], [T2, B2]].forEach(([t, b]) => {
      el("line", { x1: L, y1: b, x2: W - R, y2: b, stroke: C.axis, "stroke-width": 1.5 }, svg);
      el("line", { x1: L, y1: t, x2: L, y2: b, stroke: C.axis, "stroke-width": 1.5 }, svg);
    });
    [400, 500, 600, 700, 800, 900].forEach(t => {
      el("text", { x: X(t), y: B2 + 36, "text-anchor": "middle", "font-size": 26 }, svg).textContent = t;
    });
    el("text", { x: (L + W - R) / 2, y: B2 + 74, "text-anchor": "middle", "font-size": 26, "font-style": "italic" }, svg).textContent = "annealing temperature (°C)";
    el("text", { x: L - 20, y: (T1 + B1) / 2, "text-anchor": "middle", "font-size": 26, transform: `rotate(-90 ${L - 20} ${(T1 + B1) / 2})` }, svg).textContent = "yield";
    el("text", { x: L - 20, y: (T2 + B2) / 2, "text-anchor": "middle", "font-size": 26, transform: `rotate(-90 ${L - 20} ${(T2 + B2) / 2})` }, svg).textContent = "UCB";
    const path = (ys, Y) => bo.grid.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join("");
    const band = el("path", { fill: C.steel, "fill-opacity": 0.16 }, svg);
    el("path", { d: path(bo.true, Y1), fill: "none", stroke: C.muted, "stroke-width": 2.5, "stroke-dasharray": "9 7" }, svg);
    const mean = el("path", { fill: "none", stroke: C.steel, "stroke-width": 4.5 }, svg);
    const acq = el("path", { fill: "none", stroke: C.teal, "stroke-width": 4.5 }, svg);
    const pick = el("line", { y1: T1, y2: B2, stroke: C.pink, "stroke-width": 3, "stroke-dasharray": "6 6" }, svg);
    const pickLbl = el("text", { y: T2 - 14, "text-anchor": "middle", "font-size": 28, "font-weight": 900, fill: C.pink }, svg);
    const dots = el("g", {}, svg);
    const RX = W - R + 40;
    const nTxt = el("text", { x: RX, y: 80, "font-size": 30, fill: C.muted }, svg);
    el("text", { x: RX, y: 150, "font-size": 30, "font-weight": 700, fill: C.ink }, svg).textContent = "best so far";
    const bestT = el("text", { x: RX, y: 210, "font-size": 56, "font-weight": 900, fill: C.pink }, svg);
    const bestY = el("text", { x: RX, y: 252, "font-size": 30, fill: C.ink }, svg);
    let shown = null, raf = null;

    function draw(st, mu, bd, ac, fresh) {
      mean.setAttribute("d", path(mu, Y1));
      const up = mu.map((v, i) => v + bd[i]), lo = mu.map((v, i) => v - bd[i]);
      band.setAttribute("d", path(up, Y1) + bo.grid.slice().reverse().map((x, j) => {
        const i = bo.grid.length - 1 - j;
        return `L${X(x).toFixed(1)},${Y1(lo[i]).toFixed(1)}`;
      }).join("") + "Z");
      acq.setAttribute("d", path(ac, Y2));
      while (dots.firstChild) dots.removeChild(dots.firstChild);
      st.x.forEach((x, i) => el("circle", { cx: X(x), cy: Y1(st.y[i]), r: 11, fill: i === st.x.length - 1 && fresh ? C.pink : C.ink, stroke: C.paper, "stroke-width": 3 }, dots));
      [pick].forEach(n => { n.setAttribute("x1", X(st.next)); n.setAttribute("x2", X(st.next)); });
      // Beside the dashed pick line, flipping to its left near the right edge.
      const right = X(st.next) > W - R - 240;
      pickLbl.setAttribute("x", X(st.next) + (right ? -12 : 12));
      pickLbl.setAttribute("text-anchor", right ? "end" : "start");
      pickLbl.textContent = `next: ${Math.round(st.next)} °C`;
      nTxt.textContent = `${st.x.length} experiments`;
      bestT.textContent = `${Math.round(st.best_x)} °C`;
      bestY.textContent = `yield ${st.best_y.toFixed(2)}`;
    }
    function step(k, instant) {
      const st = bo.steps[Math.min(k, bo.steps.length - 1)];
      const target = { mu: st.mu, bd: st.band, ac: st.acq };
      const from = shown || target;
      cancelAnimationFrame(raf);
      const t0 = performance.now(), dur = instant ? 0 : 900;
      const go = now => {
        const a = dur ? easeInOut(Math.max(0, Math.min(1, (now - t0) / dur))) : 1;
        const mix = (p, q) => p.map((v, i) => v + (q[i] - v) * a);
        const cur = { mu: mix(from.mu, target.mu), bd: mix(from.bd, target.bd), ac: mix(from.ac, target.ac) };
        draw(st, cur.mu, cur.bd, cur.ac, k > 0);
        shown = cur;
        if (a < 1) raf = requestAnimationFrame(go);
      };
      if (instant) go(performance.now()); else raf = requestAnimationFrame(go);
    }
    step(0, true);
    return { step, play() {}, pause() { cancelAnimationFrame(raf); }, still() { step(bo.steps.length - 1, true); } };
  }

  // -------------------------------------------------------------------------
  // Correlation is not intervention: the synthetic doped films of fig 10.2.
  // Pooled, mobility rises with dopant content; split by anneal temperature
  // (the confounder), it falls within every group.
  // -------------------------------------------------------------------------
  function simpson(host) {
    const sp = DATA.simpson;
    if (!sp) return null;
    const W = 1400, H = 600, L = 110, R = 260, T = 20, B = 500;
    const X = x => L + x / 4.6 * (W - L - R);
    const Y = y => B - (y - 18) / 58 * (B - T);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, host);
    el("line", { x1: L, y1: B, x2: W - R, y2: B, stroke: C.axis, "stroke-width": 1.5 }, svg);
    el("line", { x1: L, y1: T, x2: L, y2: B, stroke: C.axis, "stroke-width": 1.5 }, svg);
    [0, 1, 2, 3, 4].forEach(v => { el("text", { x: X(v), y: B + 36, "text-anchor": "middle", "font-size": 26 }, svg).textContent = v; });
    [20, 40, 60].forEach(v => { el("text", { x: L - 14, y: Y(v) + 9, "text-anchor": "end", "font-size": 26 }, svg).textContent = v; });
    el("text", { x: (L + W - R) / 2, y: B + 76, "text-anchor": "middle", "font-size": 26, "font-style": "italic" }, svg).textContent = "dopant content x (at.%)";
    el("text", { x: L - 66, y: (T + B) / 2, "text-anchor": "middle", "font-size": 26, "font-style": "italic", transform: `rotate(-90 ${L - 66} ${(T + B) / 2})` }, svg).textContent = "mobility y";
    const COL = [C.steel, C.teal, C.pink], NAME = ["low T", "medium T", "high T"];
    const pts = [], lines = [];
    sp.groups.forEach((g, k) => {
      g.x.forEach((x, i) => pts.push({ k, n: el("circle", { cx: X(x), cy: Y(g.y[i]), r: 8, stroke: C.paper, "stroke-width": 1.5 }, svg) }));
      const [x1, y1, x2, y2] = g.fit;
      const gl = el("g", {}, svg);
      el("line", { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), stroke: COL[k], "stroke-width": 5, "stroke-linecap": "round" }, gl);
      el("text", { x: X(x2) + 14, y: Y(y2) + 9, "font-size": 28, "font-weight": 900, fill: COL[k] }, gl).textContent = NAME[k];
      lines.push(gl);
    });
    const [px1, py1, px2, py2] = sp.pooled;
    const pooled = el("line", { x1: X(px1), y1: Y(py1), x2: X(px2), y2: Y(py2), stroke: C.ink, "stroke-width": 4, "stroke-dasharray": "14 9" }, svg);
    const RX = W - R + 40;
    const head = el("text", { x: RX, y: 80, "font-size": 40, "font-weight": 900 }, svg);
    const sub1 = el("text", { x: RX, y: 125, "font-size": 28 }, svg);
    const sub2 = el("text", { x: RX, y: 162, "font-size": 28, fill: C.muted }, svg);
    let raf = null;

    function paint(a) {   // a: 0 pooled view, 1 split by temperature
      const grey = [0x8a, 0x93, 0x9c];
      pts.forEach(p => {
        const c = COL[p.k].match(/\w\w/g).map(h => parseInt(h, 16));
        const mix = c.map((v, i) => Math.round(grey[i] + (v - grey[i]) * a));
        p.n.setAttribute("fill", `rgb(${mix.join(",")})`);
        p.n.setAttribute("fill-opacity", 0.8);
      });
      lines.forEach(g => g.setAttribute("opacity", a));
      pooled.setAttribute("opacity", 1 - 0.65 * a);
      const split = a > 0.5;
      head.textContent = split ? "p(y | do(x))" : "p(y | x)";
      head.setAttribute("fill", split ? C.pink : C.ink);
      sub1.textContent = split ? "fixed anneal T:" : "all samples:";
      sub2.textContent = split ? "more dopant, lower" : "more dopant,";
      sub3.textContent = split ? "mobility" : "higher mobility?";
    }
    const sub3 = el("text", { x: RX, y: 199, "font-size": 28, fill: C.muted }, svg);
    function step(k, instant) {
      cancelAnimationFrame(raf);
      if (instant) return paint(k ? 1 : 0);
      const t0 = performance.now(), from = k ? 0 : 1, to = k ? 1 : 0;
      const go = now => {
        const a = easeInOut(Math.max(0, Math.min(1, (now - t0) / 1200)));
        paint(from + (to - from) * a);
        if (a < 1) raf = requestAnimationFrame(go);
      };
      raf = requestAnimationFrame(go);
    }
    step(0, true);
    return { step, play() {}, pause() { cancelAnimationFrame(raf); }, still() { step(1, true); } };
  }

  // -------------------------------------------------------------------------
  // Wiring: create each demo once, run only while its slide is current.
  // -------------------------------------------------------------------------
  const REGISTRY = [
    [".constellation", constellation],
    [".demo-config .lattice", configExplosion],
    [".demo-bv .bv-host", biasVariance],
    [".demo-gd .gd-host", gradientDescent],
    [".demo-db", dbChart],
    [".demo-tail", tail],
    [".demo-split", splitDemo],
    [".demo-inv", invariance],
    [".demo-eqv", equivariance],
    [".demo-knn .knn-host", knnVote],
    [".demo-tree .tree-host", treeGrow],
    [".demo-gp", gpGrow],
    [".demo-grid", gridRandom],
    [".demo-perc", perceptron],
    [".demo-net", netTrain],
    [".demo-conv", convSlide],
    [".demo-pets", petConv],
    [".demo-mp", messagePass],
    [".demo-diff", diffusion],
    [".demo-latent", latentSample],
    [".demo-attn", attention],
    [".demo-next", nextWord],
    [".demo-bo", boLoop],
    [".demo-simpson", simpson],
  ];
  const instances = [];

  function slideOf(node) { return node.closest("section"); }

  function init() {
    REGISTRY.forEach(([sel, make]) => {
      document.querySelectorAll(sel).forEach(host => {
        const demo = make(host);
        if (demo) instances.push({ host, demo, slide: slideOf(host) });
      });
    });
    if (PRINT) {
      // Final frames only. Slides are laid out lazily, so draw each on arrival
      // (and all at once for the print-pdf layout, where every slide is shown).
      instances.forEach(i => { i.demo.play = i.demo.still; i.demo.pause = () => {}; });
      if (/print-pdf/gi.test(window.location.search)) {
        Reveal.on("pdf-ready", () => instances.forEach(i => i.demo.still()));
      }
    }
    // ?showall reveals every fragment at once (for checking layouts).
    if (/showall/i.test(window.location.search)) Reveal.configure({ fragments: false });
    sync();
    Reveal.on("slidechanged", sync);
    Reveal.on("resize", sync);
    Reveal.on("fragmentshown", e => fragmentStep(e.fragment));
    Reveal.on("fragmenthidden", e => fragmentStep(e.fragment));
  }

  // A stepped demo follows the last visible [data-step] fragment (0 if none).
  function currentStep(slide) {
    const visible = slide.querySelectorAll("[data-step].visible");
    return visible.length ? +visible[visible.length - 1].dataset.step : 0;
  }
  function fragmentStep(fragment) {
    if (!fragment.matches("[data-step]")) return;
    const slide = slideOf(fragment);
    instances.forEach(i => { if (i.slide === slide && i.demo.step) i.demo.step(currentStep(slide)); });
  }

  function sync() {
    const current = Reveal.getCurrentSlide();
    instances.forEach(i => {
      if (i.slide !== current) { i.demo.pause(); return; }
      i.demo.play();
      // Arriving by the back key leaves fragments shown: match the demo to them.
      if (i.demo.step && !PRINT) i.demo.step(currentStep(current), true);
    });
  }

  if (window.Reveal && Reveal.isReady && Reveal.isReady()) init();
  else window.addEventListener("load", () => {
    if (Reveal.isReady()) init(); else Reveal.on("ready", init);
  });
})();
