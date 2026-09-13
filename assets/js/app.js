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
    spread: true,
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
  function icon(name) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }
  function setIcon(btn, name) {
    const use = btn.querySelector("use");
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
    const values = {
      machines: products,
      chapters,
      years: new Date().getFullYear() - FOUNDED,
      pages: S.total
    };
    qsa("[data-stat]").forEach((el) => { el.textContent = values[el.dataset.stat]; });
    $("year").textContent = new Date().getFullYear();
    $("rail").setAttribute("aria-valuemax", S.total);

    const cover = $("book3d-cover");
    cover.src = page(1).src;
    cover.alt = page(1).title;

    const cats = $("cats");
    S.groups.forEach((g, gi) => {
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
    const w = Math.max(160, tray.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24);
    const hgt = Math.max(160, tray.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
    const r = DATA.ratio;
    const spreadH = Math.min(hgt, w / (2 * r));
    const singleH = Math.min(hgt, w / r);
    const spread = window.innerWidth >= 700 && spreadH >= singleH * 0.72;
    const pageH = Math.floor(spread ? spreadH : singleH);
    const pageW = Math.floor(pageH * r);
    return { spread, pageW, pageH, wrapW: spread ? pageW * 2 : pageW };
  }

  function layout() {
    const L = computeLayout();
    const wrap = $("book-wrap");
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

    const shell = $("book-shell");
    shell.style.top = "0px";
    shell.style.height = bh + "px";
    shell.style.left = (coverAlone ? half : 0) + "px";
    shell.style.width = (spread && (coverAlone || backAlone) ? half : bw) + "px";

    $("book-slide").style.transform = coverAlone ? `translateX(${-half / 2}px)` : backAlone ? `translateX(${half / 2}px)` : "none";

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
      ? "Touch & hold a page, then drag — or swipe"
      : "Click & hold a page, then drag left or right";
    $("hint").classList.add("is-on");
    setTimeout(dismissHint, 7000);
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
    $("scrim").addEventListener("click", closeDrawer);
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
    $("scrim").classList.remove("is-open");
  }
  const drawerOpen = () => $("drawer").classList.contains("is-open");

  function openInReader(n) {
    const reader = $("catalogue");
    const top = reader.getBoundingClientRect().top + window.scrollY;
    const far = Math.abs(window.scrollY - top) > 40;
    window.scrollTo({ top, behavior: "smooth" });
    if (n) setTimeout(() => goTo(n), far ? 750 : 0);
  }

  /* ---------- zoom ---------- */
  const Z = { open: false, n: 1, s: 1, fit: 1, x: 0, y: 0, iw: 0, ih: 0, pts: new Map(), pinch: null, lastTap: 0, moved: 0 };

  function openZoom(n) {
    Z.n = n || primaryPage(visiblePages()).n;
    Z.open = true;
    $("zoom").classList.add("is-open");
    $("zoom").setAttribute("aria-hidden", "false");
    loadZoom();
  }
  function closeZoom() {
    Z.open = false;
    $("zoom").classList.remove("is-open");
    $("zoom").setAttribute("aria-hidden", "true");
  }
  function loadZoom() {
    const p = page(Z.n);
    const img = $("zoom-img");
    $("zoom-title").textContent = `Page ${Z.n} · ${p.title}`;
    $("zoom-prev").disabled = Z.n <= 1;
    $("zoom-next").disabled = Z.n >= S.total;
    const ready = () => {
      Z.iw = img.naturalWidth;
      Z.ih = img.naturalHeight;
      img.style.width = Z.iw + "px";
      img.style.height = Z.ih + "px";
      fitZoom();
    };
    img.onload = ready;
    img.alt = p.title;
    img.src = p.src;
    if (img.complete && img.naturalWidth) ready();
  }
  function fitZoom() {
    if (!Z.iw) return;
    const st = $("zoom-stage");
    const barSpace = 96;
    Z.fit = Math.min((st.clientWidth - 32) / Z.iw, (st.clientHeight - barSpace - 32) / Z.ih);
    Z.s = Z.fit;
    Z.x = (st.clientWidth - Z.iw * Z.s) / 2;
    Z.y = (st.clientHeight - barSpace - Z.ih * Z.s) / 2 + 12;
    applyZoom();
  }
  function applyZoom() {
    $("zoom-img").style.transform = `translate(${Z.x}px, ${Z.y}px) scale(${Z.s})`;
    $("zoom-level").textContent = Math.round((Z.s / Z.fit) * 100) + "%";
  }
  function zoomAt(scale, px, py) {
    const ns = clamp(scale, Z.fit * 0.8, Z.fit * 6);
    Z.x = px - (px - Z.x) * (ns / Z.s);
    Z.y = py - (py - Z.y) * (ns / Z.s);
    Z.s = ns;
    applyZoom();
  }
  function stageCenter() {
    const st = $("zoom-stage");
    return { x: st.clientWidth / 2, y: (st.clientHeight - 96) / 2 };
  }

  function wireZoom() {
    const stage = $("zoom-stage");
    const local = (x, y) => {
      const r = stage.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };
    $("btn-zoom").addEventListener("click", () => openZoom());
    $("zoom-close").addEventListener("click", closeZoom);
    $("zoom-fit").addEventListener("click", fitZoom);
    $("zoom-in").addEventListener("click", () => { const c = stageCenter(); zoomAt(Z.s * 1.35, c.x, c.y); });
    $("zoom-out").addEventListener("click", () => { const c = stageCenter(); zoomAt(Z.s / 1.35, c.x, c.y); });
    $("zoom-prev").addEventListener("click", () => { if (Z.n > 1) { Z.n--; loadZoom(); } });
    $("zoom-next").addEventListener("click", () => { if (Z.n < S.total) { Z.n++; loadZoom(); } });

    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = local(e.clientX, e.clientY);
      zoomAt(Z.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
    }, { passive: false });

    stage.addEventListener("pointerdown", (e) => {
      stage.setPointerCapture(e.pointerId);
      Z.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      Z.moved = 0;
      if (Z.pts.size === 2) {
        const [a, b] = [...Z.pts.values()];
        Z.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      }
      stage.classList.add("is-grabbing");
    });
    stage.addEventListener("pointermove", (e) => {
      const prevPt = Z.pts.get(e.pointerId);
      if (!prevPt) return;
      const cur = { x: e.clientX, y: e.clientY };
      Z.pts.set(e.pointerId, cur);
      if (Z.pts.size === 2 && Z.pinch) {
        const [a, b] = [...Z.pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(Z.s * (d / Z.pinch.d), mid.x, mid.y);
        Z.pinch.d = d;
        Z.moved += 10;
      } else if (Z.pts.size === 1) {
        Z.x += cur.x - prevPt.x;
        Z.y += cur.y - prevPt.y;
        Z.moved += Math.abs(cur.x - prevPt.x) + Math.abs(cur.y - prevPt.y);
        applyZoom();
      }
    });
    const release = (e) => {
      if (!Z.pts.has(e.pointerId)) return;
      Z.pts.delete(e.pointerId);
      if (Z.pts.size < 2) Z.pinch = null;
      if (!Z.pts.size) stage.classList.remove("is-grabbing");
      if (e.type === "pointerup" && Z.moved < 6) {
        const now = Date.now();
        if (now - Z.lastTap < 320) {
          const p = local(e.clientX, e.clientY);
          if (Z.s > Z.fit * 1.05) fitZoom();
          else zoomAt(Z.fit * 2.4, p.x, p.y);
          Z.lastTap = 0;
        } else Z.lastTap = now;
      }
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
  }

  /* ---------- sound ---------- */
  function ensureAudio() {
    if (S.audio) return S.audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.045 * (Math.random() * 2 - 1)) / 1.045;
      d[i] = last * 3.4;
    }
    S.audio = { ctx, buf };
    return S.audio;
  }
  function playFlip() {
    if (!S.sound) return;
    const a = ensureAudio();
    if (!a) return;
    const { ctx, buf } = a;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.8;
    band.frequency.setValueAtTime(3000, t);
    band.frequency.exponentialRampToValueAtTime(650, t + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.45, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.56);
  }
  function setSound(on) {
    S.sound = on;
    const btn = $("btn-sound");
    btn.setAttribute("aria-pressed", on);
    btn.dataset.tip = on ? "Page sound on" : "Page sound off";
    setIcon(btn, on ? "sound" : "mute");
    store.set("ems-sound", on ? "1" : "0");
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
    const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!enabled) { btn.hidden = true; return; }
    const current = () => document.fullscreenElement || document.webkitFullscreenElement;
    btn.addEventListener("click", () => {
      if (current()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (reader.requestFullscreen || reader.webkitRequestFullscreen).call(reader);
    });
    const sync = () => {
      const on = !!current();
      setIcon(btn, on ? "collapse" : "expand");
      btn.dataset.tip = on ? "Exit fullscreen" : "Fullscreen";
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
      if (Z.open) {
        const c = stageCenter();
        if (e.key === "Escape") closeZoom();
        else if (e.key === "ArrowRight" && Z.n < S.total) { Z.n++; loadZoom(); }
        else if (e.key === "ArrowLeft" && Z.n > 1) { Z.n--; loadZoom(); }
        else if (e.key === "+" || e.key === "=") zoomAt(Z.s * 1.3, c.x, c.y);
        else if (e.key === "-") zoomAt(Z.s / 1.3, c.x, c.y);
        else if (e.key === "0") fitZoom();
        return;
      }
      if (drawerOpen()) {
        if (e.key === "Escape") closeDrawer();
        return;
      }
      if (!S.flip) return;
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
    $("btn-prev").addEventListener("click", prev);
    $("btn-next").addEventListener("click", next);
    $("side-prev").addEventListener("click", prev);
    $("side-next").addEventListener("click", next);
    $("btn-first").addEventListener("click", () => goTo(1));
    $("btn-last").addEventListener("click", () => goTo(S.total));
    $("btn-share").addEventListener("click", share);
    $("btn-sound").addEventListener("click", () => setSound(!S.sound));
    qsa("[data-enquire]").forEach((b) => b.addEventListener("click", enquire));
    $("book3d").addEventListener("click", () => openInReader(2));
    $("hero-chronicle").addEventListener("click", () => {
      openInReader(0);
      setTimeout(() => openDrawer("chronicle"), 800);
    });

    if ("ResizeObserver" in window) new ResizeObserver(scheduleLayout).observe($("tray"));
    window.addEventListener("resize", () => { scheduleLayout(); if (Z.open) fitZoom(); });

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

    buildBook();
    [...first].forEach(loadPage);
    initFlip(start ? start - 1 : 0);
    buildDrawer();
    wireRail();
    wireZoom();
    wireFullscreen();
    wireReadingMode();
    wireKeys();
    wireControls();

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
