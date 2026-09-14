/*
  Esteem Multi Systems — interactive catalogue.
  Page data is generated at build time from the files in /images
  (see scripts/build.mjs) and injected as window.__CATALOGUE__.
*/
(() => {
  "use strict";

  const DATA = window.__CATALOGUE__;
  const EMAIL = "info@esteemmultisystems.com";
  const FOUNDED = 2009;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const $ = (id) => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const S = {
    total: 0,
    idx: 0,
    focus: 0,
    flip: null,
    state: "read",
    spread: true,
    box: null,
    groups: [],
    pageEls: [],
    sound: true,
    audio: null,
    hintDone: false,
    settleTimer: 0,
    toastTimer: 0,
    layoutRaf: 0
  };

  /* ---------- tiny DOM helpers (titles come from file names, so never innerHTML) ---------- */
  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children) if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return el;
  }
  function setIcon(btn, name) {
    const use = btn && btn.querySelector("use");
    if (use) use.setAttribute("href", "#i-" + name);
  }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------- structure ---------- */
  function buildGroups(pages) {
    const groups = [];
    let cur = null;
    let seenSection = false;
    for (const p of pages) {
      if (p.kind === "section") {
        seenSection = true;
        cur = { name: p.title, kind: "section", start: p.n, items: [p] };
        groups.push(cur);
      } else if (p.kind === "product") {
        if (!cur || cur.kind !== "section") {
          cur = { name: "Products", kind: "section", start: p.n, items: [] };
          groups.push(cur);
        }
        cur.items.push(p);
      } else {
        const name = seenSection ? "Customers & Credentials" : "Introduction";
        if (!cur || cur.name !== name) {
          cur = { name, kind: "chapter", start: p.n, items: [] };
          groups.push(cur);
        }
        cur.items.push(p);
      }
    }
    groups.forEach((g) => { g.end = g.items[g.items.length - 1].n; });
    return groups;
  }

  const page = (n) => DATA.pages[n - 1];

  function visiblePages(idx = S.idx) {
    const n = idx + 1;
    if (!S.spread || idx === 0) return [n];
    const left = idx % 2 === 1 ? n : n - 1;
    return left + 1 <= S.total ? [left, left + 1] : [left];
  }
  function primaryPage(vis) {
    if (S.focus && vis.includes(S.focus)) return page(S.focus);
    const ps = vis.map(page);
    return ps.find((p) => p.kind === "product") || ps.find((p) => p.kind === "section") || ps[0];
  }
  const rangeLabel = (vis) => (vis.length > 1 ? `${vis[0]}–${vis[1]}` : String(vis[0]));

  /* ---------- static content ---------- */
  function fillStatic() {
    const products = DATA.pages.filter((p) => p.kind === "product").length;
    const chapters = S.groups.filter((g) => g.kind === "section").length;
    const values = { machines: products, chapters, years: new Date().getFullYear() - FOUNDED, pages: S.total };
    qsa("[data-stat]").forEach((el) => { el.textContent = values[el.dataset.stat]; });
    $("year").textContent = new Date().getFullYear();
    $("rail").setAttribute("aria-valuemax", S.total);

    const cover = $("book3d-cover");
    cover.src = page(1).src;
    cover.alt = page(1).title;

    const cats = $("cats");
    S.groups.forEach((g) => {
      if (g.kind !== "section") return;
      cats.appendChild(h("button", { class: "cat-chip", type: "button", text: g.name, onclick: () => openInReader(g.start) }));
    });
  }

  /* ---------- book DOM ---------- */
  function buildBook() {
    const book = $("book");
    S.pageEls = DATA.pages.map((p) => {
      const img = h("img", { alt: p.title, "data-src": p.src, draggable: "false", decoding: "async" });
      const face = h("div", { class: "page-face is-loading " + (p.n % 2 ? "right" : "left") }, [
        img,
        h("span", { class: "page-grain" }),
        h("span", { class: "gutter" }),
        h("span", { class: "page-sheen" })
      ]);
      img.addEventListener("load", () => face.classList.remove("is-loading"), { once: true });
      const el = h("div", { class: "page", "data-density": p.n === 1 || p.n === S.total ? "hard" : "soft" }, [face]);
      book.appendChild(el);
      return el;
    });
  }

  function loadPage(n) {
    if (n < 1 || n > S.total) return;
    const img = S.pageEls[n - 1].querySelector("img");
    if (!img.getAttribute("src")) img.src = img.dataset.src;
  }
  function loadAround(n) {
    for (let i = n - 3; i <= n + 6; i++) loadPage(i);
  }
  function trickleLoad() {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 150));
    let n = 1;
    const step = () => {
      while (n <= S.total && S.pageEls[n - 1].querySelector("img").getAttribute("src")) n++;
      if (n > S.total) return;
      const img = S.pageEls[n - 1].querySelector("img");
      img.addEventListener("load", () => idle(step), { once: true });
      img.addEventListener("error", () => idle(step), { once: true });
      img.src = img.dataset.src;
    };
    idle(step);
  }

  /* ---------- sizing: fit the book to whatever box the tray gives us ---------- */
  function computeLayout() {
    const tray = $("tray");
    const cs = getComputedStyle(tray);
    const w = Math.max(160, tray.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const hgt = Math.max(160, tray.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
    const r = DATA.ratio;
    const spreadH = Math.min(hgt, (w - 28) / (2 * r)); // room for the page-edge stacks
    const singleH = Math.min(hgt, w / r);
    const spread = window.innerWidth >= 700 && spreadH >= singleH * 0.72;
    const pageH = Math.floor(spread ? spreadH : singleH);
    const pageW = Math.floor(pageH * r);
    return { spread, pageW, pageH, wrapW: spread ? pageW * 2 : pageW };
  }

  function layout() {
    const L = computeLayout();
    const wrap = $("book-wrap");
    if (isZoomed()) resetZoom(false);
    wrap.style.width = L.wrapW + "px";
    wrap.style.height = L.pageH + "px";
    if (S.flip) {
      const st = typeof S.flip.getSettings === "function" ? S.flip.getSettings() : null;
      // page-flip goes single-page when its box is narrower than 2 × minWidth.
      if (st) { st.minWidth = Math.round(L.pageW * 0.75); st.maxWidth = 100000; st.maxHeight = 100000; }
      try { S.flip.update(); } catch (e) {}
    }
    syncShell();
  }
  function scheduleLayout() {
    cancelAnimationFrame(S.layoutRaf);
    S.layoutRaf = requestAnimationFrame(layout);
  }

  function syncShell() {
    const block = document.querySelector("#book .stf__block");
    const wrapper = document.querySelector("#book .stf__wrapper");
    if (!block || !wrapper) return;
    const bw = block.offsetWidth;
    const bh = block.offsetHeight;
    if (!bw || !bh) return;

    const spread = !wrapper.classList.contains("--portrait");
    if (spread !== S.spread) {
      S.spread = spread;
      updateUI();
    }
    document.body.classList.toggle("is-spread", spread);
    document.body.classList.toggle("is-single", !spread);

    const vis = visiblePages();
    const coverAlone = spread && vis.length === 1 && vis[0] === 1;
    const backAlone = spread && vis.length === 1 && vis[0] === S.total && S.total > 1;
    const half = bw / 2;
    const slideX = coverAlone ? -half / 2 : backAlone ? half / 2 : 0;
    const shellLeft = coverAlone ? half : 0;
    const shellW = spread && (coverAlone || backAlone) ? half : bw;

    const shell = $("book-shell");
    shell.style.top = "0px";
    shell.style.height = bh + "px";
    shell.style.left = shellLeft + "px";
    shell.style.width = shellW + "px";
    $("book-slide").style.transform = slideX ? `translateX(${slideX}px)` : "none";
    S.box = { x: shellLeft + slideX, y: 0, w: shellW, h: bh };

    const spine = $("spine");
    spine.classList.toggle("is-on", spread && vis.length > 1);
    spine.style.left = half - bw * 0.04 + "px";
    spine.style.width = bw * 0.08 + "px";
    spine.style.height = bh + "px";

    const maxEdge = spread ? clamp(bw * 0.011, 5, 15) : 0;
    const read = (vis[0] - 1) / Math.max(1, S.total - 1);
    $("edge-left").style.width = (coverAlone ? 0 : 2 + read * maxEdge) + "px";
    $("edge-right").style.width = (backAlone ? 0 : 2 + (1 - read) * maxEdge) + "px";
  }

  /* ---------- page-flip ---------- */
  function initFlip(startIdx) {
    const L = computeLayout();
    const wrap = $("book-wrap");
    wrap.style.width = L.wrapW + "px";
    wrap.style.height = L.pageH + "px";

    S.flip = new St.PageFlip($("book"), {
      width: L.pageW,
      height: L.pageH,
      size: "stretch",
      minWidth: Math.round(L.pageW * 0.75),
      maxWidth: 100000,
      minHeight: 100,
      maxHeight: 100000,
      startPage: startIdx,
      showCover: true,
      usePortrait: true,
      autoSize: true,
      drawShadow: true,
      maxShadowOpacity: 0.5,
      flippingTime: 900,
      swipeDistance: 24,
      mobileScrollSupport: true,
      useMouseEvents: true,
      showPageCorners: true
    });
    S.flip.loadFromHTML(S.pageEls);
    S.idx = S.flip.getCurrentPageIndex();

    S.flip.on("flip", (e) => {
      S.idx = e.data;
      onPageChange(true);
    });
    S.flip.on("changeState", (e) => {
      S.state = e.data;
      document.body.classList.toggle("is-turning", e.data !== "read");
      if (e.data === "flipping") playFlip();
      if (e.data === "user_fold" || e.data === "flipping") dismissHint();
      if (e.data === "read") requestAnimationFrame(syncShell);
    });
    S.flip.on("changeOrientation", () => requestAnimationFrame(() => { syncShell(); updateUI(); }));

    requestAnimationFrame(() => { layout(); onPageChange(false); });
  }

  function onPageChange(fromTurn) {
    const vis = visiblePages();
    loadAround(vis[0]);
    updateUI();
    syncShell();
    if (isZoomed()) { clampPan(); applyZoom(true); }
    if (fromTurn) {
      showSettle(vis);
      history.replaceState(null, "", "#p=" + vis[0]);
    }
  }

  function next() { if (S.flip) { S.focus = 0; S.flip.flipNext("bottom"); } }
  function prev() { if (S.flip) { S.focus = 0; S.flip.flipPrev("bottom"); } }
  function goTo(n) {
    if (!S.flip) return;
    n = clamp(n, 1, S.total);
    S.focus = n;
    if (visiblePages().includes(n)) { updateUI(); return; }
    loadAround(n);
    S.flip.flip(n - 1, "top");
  }

  function updateUI() {
    if (!S.total) return;
    const vis = visiblePages();
    const last = vis[vis.length - 1];
    const main = primaryPage(vis);

    $("counter").textContent = `${rangeLabel(vis)} / ${S.total}`;
    $("counter-sub").textContent = main.label ? `${main.label} · ${main.title}` : main.title;

    const frac = S.total > 1 ? (last - 1) / (S.total - 1) : 0;
    $("rail-fill").style.width = frac * 100 + "%";
    $("rail-knob").style.left = frac * 100 + "%";
    $("rail").setAttribute("aria-valuenow", vis[0]);

    const atStart = vis[0] <= 1;
    const atEnd = last >= S.total;
    ["btn-prev", "btn-first", "side-prev"].forEach((id) => { $(id).disabled = atStart; });
    ["btn-next", "btn-last", "side-next"].forEach((id) => { $(id).disabled = atEnd; });

    qsa(".dc-item, .pg-item").forEach((el) => {
      el.classList.toggle("is-current", vis.includes(+el.dataset.page));
    });
  }

  function showSettle(vis) {
    const el = $("settle");
    el.textContent = `${vis.length > 1 ? "Pages" : "Page"} ${rangeLabel(vis)} of ${S.total}`;
    el.classList.remove("is-on");
    clearTimeout(S.settleTimer);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-on")));
    S.settleTimer = setTimeout(() => el.classList.remove("is-on"), 2600);
  }

  /* ---------- hint ---------- */
  function showHint() {
    if (S.hintDone) return;
    $("hint-text").textContent = coarse
      ? "Swipe or touch & hold to turn · pinch to zoom"
      : "Click & hold a page, then drag left or right";
    $("hint").classList.add("is-on");
    setTimeout(dismissHint, 6500);
  }
  function dismissHint() {
    if (S.hintDone) return;
    S.hintDone = true;
    $("hint").classList.remove("is-on");
  }

  /* ---------- rail ---------- */
  function wireRail() {
    const rail = $("rail");
    const tip = $("rail-tip");
    const ticks = $("rail-ticks");
    S.groups.forEach((g) => {
      if (g.kind !== "section" || S.total < 2) return;
      ticks.appendChild(h("i", { style: `left:${((g.start - 1) / (S.total - 1)) * 100}%` }));
    });

    const pageAt = (clientX) => {
      const r = rail.getBoundingClientRect();
      const f = clamp((clientX - r.left) / r.width, 0, 1);
      return { n: Math.round(f * (S.total - 1)) + 1, f };
    };
    const showTip = (clientX) => {
      const { n, f } = pageAt(clientX);
      const p = page(n);
      $("rail-tip-img").src = p.thumb;
      const text = $("rail-tip-text");
      text.textContent = "";
      text.appendChild(h("b", { text: `Page ${n}` }));
      text.appendChild(document.createTextNode(p.label ? `${p.label} · ${p.title}` : p.title));
      const rw = rail.clientWidth;
      const half = Math.min(130, rw / 2);
      tip.style.left = clamp(f * rw, half, rw - half) + "px";
      tip.classList.add("is-on");
      return n;
    };

    let dragging = false;
    rail.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || dragging) {
        const n = showTip(e.clientX);
        if (dragging) {
          const f = (n - 1) / (S.total - 1);
          $("rail-fill").style.width = f * 100 + "%";
          $("rail-knob").style.left = f * 100 + "%";
        }
      }
    });
    rail.addEventListener("pointerleave", () => { if (!dragging) tip.classList.remove("is-on"); });
    rail.addEventListener("pointerdown", (e) => {
      dragging = true;
      rail.setPointerCapture(e.pointerId);
      rail.classList.add("is-dragging");
      showTip(e.clientX);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      rail.classList.remove("is-dragging");
      tip.classList.remove("is-on");
      const n = pageAt(e.clientX).n;
      updateUI();
      goTo(n);
    };
    rail.addEventListener("pointerup", end);
    rail.addEventListener("pointercancel", () => { dragging = false; rail.classList.remove("is-dragging"); tip.classList.remove("is-on"); updateUI(); });
    rail.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); prev(); }
    });
  }

  /* ---------- drawer ---------- */
  const itemCaption = (p) => (p.kind === "product" ? p.label : p.kind === "section" ? "Chapter opener" : "Chapter");
  const searchText = (p, g) => `${p.title} ${p.label || ""} ${g ? g.name : ""} page ${p.n}`.toLowerCase();

  function buildDrawer() {
    const panel = $("panel-chronicle");
    S.groups.forEach((g, gi) => {
      const list = h("div", { class: "dc-items" });
      g.items.forEach((p) => {
        list.appendChild(h("button", {
          class: "dc-item", type: "button", "data-page": p.n, "data-search": searchText(p, g),
          onclick: () => { closeDrawer(); goTo(p.n); }
        }, [
          h("img", { src: p.thumb, alt: "", loading: "lazy", width: "44", height: "62" }),
          h("span", {}, [h("small", { text: itemCaption(p) }), h("strong", { text: p.title })]),
          h("span", { class: "dc-page", text: pad2(p.n) })
        ]));
      });
      panel.appendChild(h("section", { class: "dc-group" }, [
        h("header", { class: "dc-head" }, [
          h("span", { class: "dc-num", text: pad2(gi + 1) }),
          h("span", { class: "dc-name", text: g.name }),
          h("span", { class: "dc-range", text: `p. ${g.start}–${g.end}` })
        ]),
        list
      ]));
    });

    const grid = $("page-grid");
    DATA.pages.forEach((p) => {
      grid.appendChild(h("button", {
        class: "pg-item", type: "button", "data-page": p.n, "data-search": searchText(p),
        "aria-label": `Page ${p.n}: ${p.title}`,
        onclick: () => { closeDrawer(); goTo(p.n); }
      }, [h("img", { src: p.thumb, alt: "", loading: "lazy", width: "120", height: "170" }), h("span", { text: pad2(p.n) })]));
    });

    qsa(".tab").forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));
    $("drawer-search").addEventListener("input", filterDrawer);
    $("drawer-close").addEventListener("click", closeDrawer);
    $("scrim").addEventListener("click", () => { closeDrawer(); closeSheet(); });
    $("btn-chronicle").addEventListener("click", () => openDrawer("chronicle"));
    $("btn-grid").addEventListener("click", () => openDrawer("pages"));
    updateUI();
  }

  function setTab(name) {
    qsa(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on);
    });
    $("panel-chronicle").classList.toggle("is-active", name === "chronicle");
    $("panel-pages").classList.toggle("is-active", name === "pages");
    filterDrawer();
  }
  function filterDrawer() {
    const q = $("drawer-search").value.trim().toLowerCase();
    let shown = 0;
    const activePanel = document.querySelector(".drawer-panel.is-active");
    qsa("[data-search]", activePanel).forEach((el) => {
      const hit = !q || el.dataset.search.includes(q);
      el.hidden = !hit;
      if (hit) shown++;
    });
    qsa(".dc-group", activePanel).forEach((g) => { g.hidden = !g.querySelector("[data-search]:not([hidden])"); });
    $("drawer-empty").hidden = shown > 0;
  }
  function openDrawer(tab) {
    closeSheet();
    setTab(tab);
    $("drawer").classList.add("is-open");
    $("drawer").setAttribute("aria-hidden", "false");
    $("scrim").classList.add("is-open");
    const cur = document.querySelector(".drawer-panel.is-active .is-current");
    if (cur) cur.scrollIntoView({ block: "center" });
    if (!coarse) setTimeout(() => $("drawer-search").focus({ preventScroll: true }), 350);
  }
  function closeDrawer() {
    $("drawer").classList.remove("is-open");
    $("drawer").setAttribute("aria-hidden", "true");
    if (!sheetOpen()) $("scrim").classList.remove("is-open");
  }
  const drawerOpen = () => $("drawer").classList.contains("is-open");

  /* ---------- more sheet (phones) ---------- */
  const sheetOpen = () => $("more-sheet").classList.contains("is-open");
  function openSheet() {
    $("more-sheet").classList.add("is-open");
    $("more-sheet").setAttribute("aria-hidden", "false");
    $("btn-more").setAttribute("aria-expanded", "true");
    $("scrim").classList.add("is-open");
  }
  function closeSheet() {
    if (!sheetOpen()) return;
    $("more-sheet").classList.remove("is-open");
    $("more-sheet").setAttribute("aria-hidden", "true");
    $("btn-more").setAttribute("aria-expanded", "false");
    if (!drawerOpen()) $("scrim").classList.remove("is-open");
  }
  function wireSheet() {
    $("btn-more").addEventListener("click", () => (sheetOpen() ? closeSheet() : openSheet()));
    $("sheet-close").addEventListener("click", closeSheet);
    $("sheet-chronicle").addEventListener("click", () => openDrawer("chronicle"));
    $("sheet-pages").addEventListener("click", () => openDrawer("pages"));
    $("sheet-sound").addEventListener("click", () => {
      setSound(!S.sound);
      if (S.sound) { unlockAudio(); playFlip(); }
    });
    $("sheet-share").addEventListener("click", () => { closeSheet(); share(); });
    $("sheet-first").addEventListener("click", () => { closeSheet(); goTo(1); });
  }

  function openInReader(n) {
    const reader = $("catalogue");
    const top = reader.getBoundingClientRect().top + window.scrollY;
    const far = Math.abs(window.scrollY - top) > 40;
    window.scrollTo({ top, behavior: "smooth" });
    if (n) setTimeout(() => goTo(n), far ? 750 : 0);
  }

  /* ---------- zoom: the real book scales and pans inside the tray ---------- */
  const Z = { s: 1, tx: 0, ty: 0, max: 4, pts: new Map(), pinch: null, pan: null, gesture: false, lastTurn: 0, lastTap: 0 };
  const isZoomed = () => Z.s > 1.001;

  function contentBox() {
    const wrap = $("book-wrap");
    return S.box || { x: 0, y: 0, w: wrap.offsetWidth, h: wrap.offsetHeight };
  }
  function limits() {
    const T = $("tray").getBoundingClientRect();
    const W = $("book-wrap").getBoundingClientRect();
    const b = contentBox();
    const m = 10;
    const ox = T.left - W.left;
    const oy = T.top - W.top;
    const cw = b.w * Z.s;
    const ch = b.h * Z.s;
    const L = {};
    if (cw <= T.width - 2 * m) L.minX = L.maxX = ox + (T.width - cw) / 2 - b.x * Z.s;
    else { L.minX = ox + T.width - m - cw - b.x * Z.s; L.maxX = ox + m - b.x * Z.s; }
    if (ch <= T.height - 2 * m) L.minY = L.maxY = oy + (T.height - ch) / 2 - b.y * Z.s;
    else { L.minY = oy + T.height - m - ch - b.y * Z.s; L.maxY = oy + m - b.y * Z.s; }
    return L;
  }
  function clampPan() {
    if (!isZoomed()) return;
    const L = limits();
    Z.tx = clamp(Z.tx, L.minX, L.maxX);
    Z.ty = clamp(Z.ty, L.minY, L.maxY);
  }
  function applyZoom(animate) {
    const el = $("book-zoom");
    const on = isZoomed();
    el.style.transition = animate ? "transform .38s cubic-bezier(.22,.68,.32,1)" : "none";
    el.style.transform = on ? `translate3d(${Z.tx}px, ${Z.ty}px, 0) scale(${Z.s})` : "";
    document.body.classList.toggle("is-zoomed", on);
    $("zoom-pill").setAttribute("aria-hidden", String(!on));
    $("btn-zoom").setAttribute("aria-pressed", String(on));
    $("zoom-level").textContent = Math.round(Z.s * 100) + "%";
    if (on) dismissHint();
  }
  function resetZoom(animate) {
    Z.s = 1; Z.tx = 0; Z.ty = 0;
    applyZoom(animate);
  }
  // Scale to ns keeping the screen point (px, py) under the finger/cursor.
  function zoomAt(ns, px, py, animate) {
    ns = clamp(ns, 1, Z.max);
    if (ns <= 1.02) { resetZoom(animate); return; }
    const W = $("book-wrap").getBoundingClientRect();
    const lx = px - W.left;
    const ly = py - W.top;
    const s0 = isZoomed() ? Z.s : 1;
    const tx0 = isZoomed() ? Z.tx : 0;
    const ty0 = isZoomed() ? Z.ty : 0;
    Z.tx = lx - (lx - tx0) * (ns / s0);
    Z.ty = ly - (ly - ty0) * (ns / s0);
    Z.s = ns;
    clampPan();
    applyZoom(animate);
  }
  function trayPoint(fx, fy) {
    const T = $("tray").getBoundingClientRect();
    return { x: T.left + T.width * fx, y: T.top + T.height * fy };
  }
  // Zoom straight into the page being read, starting near its top.
  function enterZoom() {
    const b = contentBox();
    const vis = visiblePages();
    const main = primaryPage(vis);
    const qx = b.x + (S.spread && vis.length > 1 ? (main.n === vis[1] ? b.w * 0.75 : b.w * 0.25) : b.w / 2);
    const qy = b.y + b.h * 0.18;
    const s = coarse ? 2.2 : 1.9;
    const T = $("tray").getBoundingClientRect();
    const W = $("book-wrap").getBoundingClientRect();
    Z.s = s;
    Z.tx = T.left + T.width / 2 - W.left - s * qx;
    Z.ty = T.top + T.height * 0.18 - W.top - s * qy;
    clampPan();
    applyZoom(true);
  }
  function toggleZoom() {
    if (isZoomed()) resetZoom(true);
    else enterZoom();
  }
  // Turning while zoomed: the real book turns, then we land on the start of the new page.
  function turnZoomed(dir) {
    const vis = visiblePages();
    const blocked = dir > 0 ? vis[vis.length - 1] >= S.total : vis[0] <= 1;
    if (!blocked) {
      if (dir > 0) next(); else prev();
      const L = limits();
      Z.tx = dir > 0 ? L.maxX : L.minX;
      Z.ty = L.maxY;
    }
    clampPan();
    applyZoom(true);
  }

  function releasePageFlip() {
    if (!S.flip) return;
    try { const ui = S.flip.getUI && S.flip.getUI(); if (ui) ui.touchPoint = null; } catch (e) {}
    try { S.flip.userStop({ x: 0, y: 0 }, true); } catch (e) {}
  }

  function wireZoom() {
    const tray = $("tray");
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    // While zoomed or pinching, the book's own drag handling must not see the gesture.
    const blockTypes = ["touchstart", "touchmove", "touchend", "touchcancel", "mousedown", "mousemove", "mouseup"];
    blockTypes.forEach((type) => {
      window.addEventListener(type, (e) => {
        const active = Z.gesture || Z.pinch;
        if (!active && !(isZoomed() && tray.contains(e.target))) return;
        if (e.target.closest && e.target.closest("button")) return;
        e.stopPropagation();
        if (type === "touchmove" && e.cancelable) e.preventDefault();
      }, { capture: true, passive: false });
    });

    tray.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      if (e.pointerType === "mouse" && (!isZoomed() || e.button !== 0)) return;
      Z.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });

      if (Z.pts.size === 2) {
        if (S.state !== "read") { Z.pts.delete(e.pointerId); return; }
        releasePageFlip();
        const [a, b] = [...Z.pts.values()];
        Z.pinch = { d: dist(a, b), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        Z.pan = null;
        Z.gesture = true;
      } else if (Z.pts.size === 1 && isZoomed()) {
        Z.pan = { raw: Z.tx, over: 0, moved: 0, t: performance.now() };
        Z.gesture = true;
        tray.classList.add("is-panning");
        $("book-zoom").style.transition = "none";
      }
      if (Z.gesture) { try { tray.setPointerCapture(e.pointerId); } catch (err) {} }
    });

    tray.addEventListener("pointermove", (e) => {
      const prevPt = Z.pts.get(e.pointerId);
      if (!prevPt) return;
      const cur = { x: e.clientX, y: e.clientY, t: prevPt.t };
      Z.pts.set(e.pointerId, cur);

      if (Z.pinch && Z.pts.size >= 2) {
        const [a, b] = [...Z.pts.values()];
        const d = dist(a, b);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        zoomAt((isZoomed() ? Z.s : 1) * (d / Z.pinch.d), mid.x, mid.y, false);
        if (isZoomed()) {
          Z.tx += mid.x - Z.pinch.mid.x;
          Z.ty += mid.y - Z.pinch.mid.y;
          clampPan();
          applyZoom(false);
        }
        Z.pinch.d = d;
        Z.pinch.mid = mid;
      } else if (Z.pan && isZoomed()) {
        const dx = cur.x - prevPt.x;
        const dy = cur.y - prevPt.y;
        Z.pan.moved += Math.abs(dx) + Math.abs(dy);
        const L = limits();
        Z.pan.raw += dx;
        const inside = clamp(Z.pan.raw, L.minX, L.maxX);
        Z.pan.over = Z.pan.raw - inside;
        Z.tx = inside + Z.pan.over * 0.35;
        Z.ty = clamp(Z.ty + dy, L.minY, L.maxY);
        applyZoom(false);
      }
    });

    const end = (e) => {
      if (!Z.pts.has(e.pointerId)) return;
      const pt = Z.pts.get(e.pointerId);
      Z.pts.delete(e.pointerId);

      if (Z.pinch && Z.pts.size < 2) {
        Z.pinch = null;
        if (Z.s < 1.12) resetZoom(true);
        else if (Z.pts.size === 1) Z.pan = { raw: Z.tx, over: 0, moved: 99, t: performance.now() };
      }
      if (Z.pts.size) return;

      tray.classList.remove("is-panning");
      if (Z.pan) {
        const { over, moved } = Z.pan;
        Z.pan = null;
        if (Math.abs(over) > 60 && performance.now() - Z.lastTurn > 700) {
          Z.lastTurn = performance.now();
          turnZoomed(over < 0 ? 1 : -1);
        } else {
          clampPan();
          applyZoom(true);
          // double-tap while zoomed returns to the full book
          if (e.type === "pointerup" && moved < 8 && pt && performance.now() - pt.t < 300) {
            const now = performance.now();
            if (now - Z.lastTap < 320) { resetZoom(true); Z.lastTap = 0; } else Z.lastTap = now;
          }
        }
      }
      Z.gesture = false;
    };
    tray.addEventListener("pointerup", end);
    tray.addEventListener("pointercancel", end);

    tray.addEventListener("wheel", (e) => {
      if (!isZoomed() && !e.ctrlKey) return;
      e.preventDefault();
      zoomAt((isZoomed() ? Z.s : 1) * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022)), e.clientX, e.clientY, false);
    }, { passive: false });

    $("btn-zoom").addEventListener("click", toggleZoom);
    $("zoom-exit").addEventListener("click", () => resetZoom(true));
    $("zoom-in").addEventListener("click", () => { const c = trayPoint(0.5, 0.5); zoomAt(Z.s * 1.4, c.x, c.y, true); });
    $("zoom-out").addEventListener("click", () => { const c = trayPoint(0.5, 0.5); zoomAt(Z.s / 1.4, c.x, c.y, true); });
  }

  /* ---------- sound ---------- */
  function ensureAudio() {
    if (S.audio) return S.audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ctx;
    try { ctx = new AC(); } catch (e) { return null; }
    const len = Math.floor(ctx.sampleRate * 0.7);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.05 * white) / 1.05;
      d[i] = brown * 2.8 + white * 0.22;
    }
    S.audio = { ctx, buf, primed: false };
    return S.audio;
  }
  // Mobile browsers only allow audio after a touch/click, so prime it on the first one.
  function unlockAudio() {
    if (!S.sound) return;
    const a = ensureAudio();
    if (!a) return;
    if (a.ctx.state !== "running") a.ctx.resume().catch(() => {});
    if (!a.primed) {
      try {
        const src = a.ctx.createBufferSource();
        src.buffer = a.ctx.createBuffer(1, 1, 22050);
        src.connect(a.ctx.destination);
        src.start(0);
        a.primed = true;
      } catch (e) {}
    }
  }
  function playFlip() {
    if (!S.sound) return;
    const a = ensureAudio();
    if (!a) return;
    const { ctx, buf } = a;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    const t = ctx.currentTime + 0.01;

    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);

    // paper sweep
    const sweep = ctx.createBufferSource();
    sweep.buffer = buf;
    sweep.playbackRate.value = 0.9 + Math.random() * 0.25;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(4200, t);
    band.frequency.exponentialRampToValueAtTime(900, t + 0.45);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.exponentialRampToValueAtTime(1, t + 0.05);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
    sweep.connect(band).connect(g1).connect(out);
    sweep.start(t);
    sweep.stop(t + 0.56);

    // crisp edge as the page lands
    const snap = ctx.createBufferSource();
    snap.buffer = buf;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 2200;
    const g2 = ctx.createGain();
    const t2 = t + 0.4;
    g2.gain.setValueAtTime(0.0001, t2);
    g2.gain.exponentialRampToValueAtTime(0.8, t2 + 0.012);
    g2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.13);
    snap.connect(high).connect(g2).connect(out);
    snap.start(t2, 0.2);
    snap.stop(t2 + 0.15);
  }
  function setSound(on) {
    S.sound = on;
    const btn = $("btn-sound");
    btn.setAttribute("aria-pressed", String(on));
    btn.dataset.tip = on ? "Page sound on" : "Page sound off";
    setIcon(btn, on ? "sound" : "mute");
    const item = $("sheet-sound");
    item.setAttribute("aria-pressed", String(on));
    setIcon(item, on ? "sound" : "mute");
    $("sheet-sound-label").textContent = on ? "Sound on" : "Sound off";
    store.set("ems-sound", on ? "1" : "0");
  }
  function wireAudioUnlock() {
    ["pointerdown", "touchend", "click", "keydown"].forEach((type) => {
      window.addEventListener(type, unlockAudio, { capture: true, passive: true });
    });
  }

  /* ---------- share, enquire, toast ---------- */
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => el.classList.remove("is-on"), 2600);
  }
  async function share() {
    const vis = visiblePages();
    const p = primaryPage(vis);
    const url = `${location.origin}${location.pathname}#p=${p.n}`;
    if (navigator.share && coarse) {
      try { await navigator.share({ title: `Esteem Multi Systems — ${p.title}`, url }); } catch (e) {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(`Link to page ${p.n} copied`);
    } catch (e) {
      toast(url);
    }
  }
  function enquire() {
    const vis = visiblePages();
    const p = primaryPage(vis);
    const where = vis.length > 1 ? `pages ${vis[0]}–${vis[1]}` : `page ${vis[0]}`;
    const topic = p.kind === "product" || p.kind === "section" ? p.title : "your product catalogue";
    const subject = `Enquiry: ${topic} (catalogue ${where})`;
    const body = [
      "Hello Esteem Multi Systems team,",
      "",
      `I am viewing ${where} of your catalogue${p.kind === "product" ? ` — ${p.label}: ${p.title}` : ""} and would like to know more.`,
      "",
      "Component / part to be processed:",
      "Required output per hour:",
      "Plant location:",
      "",
      "Please share the specifications and a quotation.",
      "",
      "Regards,",
      ""
    ].join("\n");
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /* ---------- fullscreen ---------- */
  function wireFullscreen() {
    const reader = $("catalogue");
    const btn = $("btn-full");
    const item = $("sheet-full");
    const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!enabled) { btn.hidden = true; item.hidden = true; return; }
    const current = () => document.fullscreenElement || document.webkitFullscreenElement;
    const toggle = () => {
      closeSheet();
      if (current()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (reader.requestFullscreen || reader.webkitRequestFullscreen).call(reader);
    };
    btn.addEventListener("click", toggle);
    item.addEventListener("click", toggle);
    const sync = () => {
      const on = !!current();
      setIcon(btn, on ? "collapse" : "expand");
      setIcon(item, on ? "collapse" : "expand");
      btn.dataset.tip = on ? "Exit fullscreen" : "Fullscreen";
      $("sheet-full-label").textContent = on ? "Exit full" : "Fullscreen";
      scheduleLayout();
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
  }

  /* ---------- reading mode (nav hides while the book fills the screen) ---------- */
  function wireReadingMode() {
    const reader = $("catalogue");
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const r = reader.getBoundingClientRect();
      document.body.classList.toggle("reading", r.top <= 70 && r.bottom >= window.innerHeight * 0.6);
    };
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();
  }

  /* ---------- keyboard ---------- */
  function wireKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea") && e.key !== "Escape") return;
      if (drawerOpen() || sheetOpen()) {
        if (e.key === "Escape") { closeDrawer(); closeSheet(); }
        return;
      }
      if (!S.flip) return;
      if (isZoomed()) {
        const c = trayPoint(0.5, 0.5);
        if (e.key === "Escape") resetZoom(true);
        else if (e.key === "ArrowRight") { e.preventDefault(); turnZoomed(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); turnZoomed(-1); }
        else if (e.key === "+" || e.key === "=") zoomAt(Z.s * 1.3, c.x, c.y, true);
        else if (e.key === "-") zoomAt(Z.s / 1.3, c.x, c.y, true);
        else if (e.key === "0") resetZoom(true);
        return;
      }
      const reading = document.body.classList.contains("reading");
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (reading && e.key === "PageDown") { e.preventDefault(); next(); }
      else if (reading && e.key === "PageUp") { e.preventDefault(); prev(); }
      else if (reading && e.key === "Home") { e.preventDefault(); goTo(1); }
      else if (reading && e.key === "End") { e.preventDefault(); goTo(S.total); }
    });
  }

  /* ---------- controls ---------- */
  function wireControls() {
    const turn = (dir) => () => (isZoomed() ? turnZoomed(dir) : dir > 0 ? next() : prev());
    $("btn-prev").addEventListener("click", turn(-1));
    $("btn-next").addEventListener("click", turn(1));
    $("side-prev").addEventListener("click", turn(-1));
    $("side-next").addEventListener("click", turn(1));
    $("btn-first").addEventListener("click", () => goTo(1));
    $("btn-last").addEventListener("click", () => goTo(S.total));
    $("btn-share").addEventListener("click", share);
    $("btn-sound").addEventListener("click", () => {
      setSound(!S.sound);
      if (S.sound) { unlockAudio(); playFlip(); }
    });
    qsa("[data-enquire]").forEach((b) => b.addEventListener("click", () => { closeSheet(); enquire(); }));
    $("book3d").addEventListener("click", () => openInReader(2));
    $("hero-chronicle").addEventListener("click", () => {
      openInReader(0);
      setTimeout(() => openDrawer("chronicle"), 800);
    });

    if ("ResizeObserver" in window) new ResizeObserver(scheduleLayout).observe($("tray"));
    window.addEventListener("resize", scheduleLayout);

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        $("book-wrap").classList.add("is-revealed");
        setTimeout(showHint, 900);
        io.disconnect();
      });
    }, { threshold: 0.3 });
    io.observe($("tray"));
  }

  /* ---------- boot ---------- */
  function preload(src) {
    return new Promise((resolve) => {
      const img = new Image();
      const done = () => resolve();
      img.onload = done;
      img.onerror = done;
      setTimeout(done, 8000);
      img.src = src;
    });
  }
  function progress(f) {
    const pct = Math.round(f * 100);
    $("loader-fill").style.width = pct + "%";
    $("loader-text").textContent = pct + "%";
  }
  function startPageFromHash() {
    const m = location.hash.match(/(?:^#|&)p=(\d+)/);
    return m ? clamp(parseInt(m[1], 10), 1, S.total) : 0;
  }

  async function boot() {
    if (!DATA || !Array.isArray(DATA.pages) || !DATA.pages.length) {
      $("loader-text").textContent = "Catalogue data missing — run the build.";
      return;
    }
    if (!window.St || !window.St.PageFlip) {
      $("loader-text").textContent = "Could not load the page-turn engine. Please refresh.";
      return;
    }

    S.total = DATA.pages.length;
    S.groups = buildGroups(DATA.pages);
    setSound(store.get("ems-sound") !== "0");
    wireAudioUnlock();
    fillStatic();

    const start = startPageFromHash();
    const first = new Set([1, 2, 3].filter((n) => n <= S.total));
    if (start) [start - 1, start, start + 1].forEach((n) => n >= 1 && n <= S.total && first.add(n));
    const jobs = [...first].map((n) => page(n).src);
    let done = 0;
    progress(0.04);
    await Promise.all([
      ...jobs.map((src) => preload(src).then(() => progress((++done / (jobs.length + 1)) * 0.96))),
      document.fonts ? document.fonts.ready.then(() => progress((++done / (jobs.length + 1)) * 0.96)) : null
    ]);
    progress(1);

    // Never leave visitors stuck on the loader, even if one feature fails to start.
    try {
      buildBook();
      [...first].forEach(loadPage);
      initFlip(start ? start - 1 : 0);
      buildDrawer();
      wireSheet();
      wireRail();
      wireZoom();
      wireFullscreen();
      wireReadingMode();
      wireKeys();
      wireControls();
    } catch (err) {
      console.error("Catalogue start-up error:", err);
      $("book-wrap").classList.add("is-revealed");
    }

    setTimeout(() => {
      $("loader").classList.add("is-done");
      if (start) {
        const reader = $("catalogue");
        window.scrollTo({ top: reader.getBoundingClientRect().top + window.scrollY, behavior: "auto" });
      }
    }, 250);
    setTimeout(trickleLoad, 1800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
