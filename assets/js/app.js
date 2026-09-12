/*
  Esteem Multi Systems — flipbook catalogue.
  To update the catalogue: replace files in /images following the
  page-01.jpg, page-02.jpg ... naming pattern (2-digit, sequential,
  no gaps) and push. Page count is auto-detected below — nothing
  else needs to change.
*/
(function () {
  "use strict";

  var CONFIG = {
    dir: "images/",
    ext: "jpg",
    pad: 2,
    maxProbe: 300,
    enquireEmail: "info@esteemmultisystems.com"
  };

  var state = {
    total: 0,
    pages: [],       // array of image URLs, 1-indexed via pages[i-1]
    pageFlip: null,
    currentPage: 1,
    settleTimer: null
  };

  function pad(n) {
    var s = String(n);
    while (s.length < CONFIG.pad) s = "0" + s;
    return s;
  }

  function pageUrl(n) {
    return CONFIG.dir + "page-" + pad(n) + "." + CONFIG.ext;
  }

  function imageExists(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = url;
    });
  }

  // Exponential probe then binary search to find the last existing page.
  function detectPageCount() {
    return imageExists(pageUrl(1)).then(function (hasFirst) {
      if (!hasFirst) return 0;
      var lo = 1, hi = 1;
      function grow() {
        var next = hi * 2;
        if (next > CONFIG.maxProbe) next = CONFIG.maxProbe;
        return imageExists(pageUrl(next)).then(function (ok) {
          if (ok) {
            lo = next; hi = next;
            if (next >= CONFIG.maxProbe) return binarySearch(lo, CONFIG.maxProbe);
            return grow();
          } else {
            return binarySearch(lo, next);
          }
        });
      }
      function binarySearch(low, high) {
        if (high - low <= 1) return Promise.resolve(low);
        var mid = Math.floor((low + high) / 2);
        return imageExists(pageUrl(mid)).then(function (ok) {
          if (ok) return binarySearch(mid, high);
          return binarySearch(low, mid);
        });
      }
      return grow();
    });
  }

  function preloadAll(urls, onProgress) {
    var loaded = 0;
    return Promise.all(urls.map(function (url) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = img.onerror = function () {
          loaded++;
          onProgress(loaded, urls.length);
          resolve();
        };
        img.src = url;
      });
    }));
  }

  function buildPageDom(n, total) {
    var wrap = document.createElement("div");
    wrap.className = "page";
    wrap.setAttribute("data-density", (n === 1 || n === total) ? "hard" : "soft");

    var isRight = n % 2 === 1;
    var face = document.createElement("div");
    face.className = "page-face " + (isRight ? "right" : "left");

    var img = document.createElement("img");
    img.src = pageUrl(n);
    img.alt = "Catalogue page " + n;
    img.loading = "eager";
    img.draggable = false;

    var grain = document.createElement("div");
    grain.className = "page-grain";

    var sheen = document.createElement("div");
    sheen.className = "page-sheen";

    var spine = document.createElement("div");
    spine.className = "page-spine-shadow " + (isRight ? "left" : "right");

    var numTag = document.createElement("span");
    numTag.className = "page-number-tag";
    numTag.textContent = String(n);

    face.appendChild(img);
    face.appendChild(grain);
    face.appendChild(sheen);
    face.appendChild(spine);
    face.appendChild(numTag);
    wrap.appendChild(face);
    return wrap;
  }

  function initFlipbook() {
    var bookEl = document.getElementById("book");
    for (var i = 1; i <= state.total; i++) {
      bookEl.appendChild(buildPageDom(i, state.total));
    }

    var aspect = 1600 / 2263;
    var singleW = Math.min(520, Math.round(window.innerHeight * 0.62 * aspect));

    var pageFlip = new St.PageFlip(bookEl, {
      width: singleW,
      height: Math.round(singleW / aspect),
      size: "stretch",
      minWidth: 220,
      maxWidth: 900,
      minHeight: 310,
      maxHeight: 1200,
      maxShadowOpacity: 0.6,
      showCover: false,
      usePortrait: true,
      mobileScrollSupport: false,
      flippingTime: 900,
      useMouseEvents: true,
      drawShadow: true
    });

    pageFlip.loadFromHTML(document.querySelectorAll("#book .page"));
    state.pageFlip = pageFlip;

    pageFlip.on("flip", function (e) {
      state.currentPage = e.data + 1;
      updatePageUI();
      showSettleLabel();
    });

    pageFlip.on("changeState", function (e) {
      var container = document.getElementById("book");
      if (e.data === "flipping" || e.data === "user_fold" || e.data === "fold_corner") {
        container.classList.add("is-flipping");
      } else {
        container.classList.remove("is-flipping");
      }
    });

    updatePageUI();
    wireNav();
  }

  function updatePageUI() {
    var current = state.currentPage;
    var total = state.total;
    document.getElementById("page-counter").textContent = current + " / " + total;
    document.getElementById("page-counter").style.display = "inline";

    var pct = total > 1 ? ((current - 1) / (total - 1)) * 100 : 0;
    document.getElementById("progress-rail-fill").style.width = pct + "%";
    document.getElementById("progress-rail-handle").style.left = pct + "%";

    document.getElementById("nav-prev").disabled = current <= 1;
    document.getElementById("nav-next").disabled = current >= total;

    document.getElementById("page-settle-label").textContent =
      "Page " + current + " of " + total;
  }

  function showSettleLabel() {
    var label = document.getElementById("page-settle-label");
    label.classList.remove("show");
    clearTimeout(state.settleTimer);
    // allow reflow before re-triggering
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        label.classList.add("show");
      });
    });
    state.settleTimer = setTimeout(function () {
      label.classList.remove("show");
    }, 2200);
  }

  function wireNav() {
    document.getElementById("nav-prev").addEventListener("click", function () {
      state.pageFlip.flipPrev();
    });
    document.getElementById("nav-next").addEventListener("click", function () {
      state.pageFlip.flipNext();
    });
    document.getElementById("tap-left").addEventListener("click", function () {
      state.pageFlip.flipPrev();
    });
    document.getElementById("tap-right").addEventListener("click", function () {
      state.pageFlip.flipNext();
    });

    document.addEventListener("keydown", function (e) {
      if (isOverlayOpen()) return;
      if (e.key === "ArrowLeft") state.pageFlip.flipPrev();
      if (e.key === "ArrowRight") state.pageFlip.flipNext();
    });

    var rail = document.getElementById("progress-rail");
    rail.addEventListener("click", function (e) {
      var rect = rail.getBoundingClientRect();
      var ratio = (e.clientX - rect.left) / rect.width;
      ratio = Math.max(0, Math.min(1, ratio));
      var target = Math.round(ratio * (state.total - 1)) + 1;
      state.pageFlip.turnToPage(target - 1);
    });
  }

  function isOverlayOpen() {
    return document.getElementById("toc-drawer").classList.contains("open") ||
      document.getElementById("zoom-overlay").classList.contains("open");
  }

  /* ---------- TOC drawer ---------- */
  function buildToc() {
    var grid = document.getElementById("toc-grid");
    for (var i = 1; i <= state.total; i++) {
      (function (n) {
        var thumb = document.createElement("div");
        thumb.className = "toc-thumb";
        var img = document.createElement("img");
        img.loading = "lazy";
        img.src = pageUrl(n);
        img.alt = "Page " + n + " thumbnail";
        var tag = document.createElement("span");
        tag.className = "toc-num";
        tag.textContent = n;
        thumb.appendChild(img);
        thumb.appendChild(tag);
        thumb.addEventListener("click", function () {
          state.pageFlip.turnToPage(n - 1);
          closeToc();
        });
        grid.appendChild(thumb);
      })(i);
    }
  }

  function openToc() {
    document.getElementById("toc-drawer").classList.add("open");
    document.getElementById("toc-drawer").setAttribute("aria-hidden", "false");
    document.getElementById("drawer-scrim").classList.add("open");
  }
  function closeToc() {
    document.getElementById("toc-drawer").classList.remove("open");
    document.getElementById("toc-drawer").setAttribute("aria-hidden", "true");
    document.getElementById("drawer-scrim").classList.remove("open");
  }

  /* ---------- Zoom overlay ---------- */
  var zoom = { scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0, pinchDist: 0 };

  function openZoom() {
    var img = document.getElementById("zoom-image");
    img.src = pageUrl(state.currentPage);
    zoom.scale = 1; zoom.x = 0; zoom.y = 0;
    applyZoomTransform();
    document.getElementById("zoom-overlay").classList.add("open");
    document.getElementById("zoom-overlay").setAttribute("aria-hidden", "false");
  }
  function closeZoom() {
    document.getElementById("zoom-overlay").classList.remove("open");
    document.getElementById("zoom-overlay").setAttribute("aria-hidden", "true");
  }
  function applyZoomTransform() {
    var img = document.getElementById("zoom-image");
    img.style.transform = "translate(-50%,-50%) translate(" + zoom.x + "px," + zoom.y + "px) scale(" + zoom.scale + ")";
  }
  function clampScale(s) {
    return Math.max(0.6, Math.min(6, s));
  }

  function wireZoom() {
    var viewport = document.getElementById("zoom-viewport");

    document.getElementById("btn-zoom").addEventListener("click", openZoom);
    document.getElementById("btn-zoom-close").addEventListener("click", closeZoom);
    document.getElementById("btn-zoom-in").addEventListener("click", function () {
      zoom.scale = clampScale(zoom.scale + 0.4); applyZoomTransform();
    });
    document.getElementById("btn-zoom-out").addEventListener("click", function () {
      zoom.scale = clampScale(zoom.scale - 0.4); applyZoomTransform();
    });

    viewport.addEventListener("wheel", function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.15 : 0.15;
      zoom.scale = clampScale(zoom.scale + delta);
      applyZoomTransform();
    }, { passive: false });

    viewport.addEventListener("mousedown", function (e) {
      zoom.dragging = true;
      viewport.classList.add("dragging");
      zoom.lastX = e.clientX; zoom.lastY = e.clientY;
    });
    window.addEventListener("mousemove", function (e) {
      if (!zoom.dragging) return;
      zoom.x += e.clientX - zoom.lastX;
      zoom.y += e.clientY - zoom.lastY;
      zoom.lastX = e.clientX; zoom.lastY = e.clientY;
      applyZoomTransform();
    });
    window.addEventListener("mouseup", function () {
      zoom.dragging = false;
      viewport.classList.remove("dragging");
    });

    // touch: single-finger pan, two-finger pinch
    viewport.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) {
        zoom.dragging = true;
        zoom.lastX = e.touches[0].clientX;
        zoom.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        zoom.dragging = false;
        zoom.pinchDist = touchDist(e.touches);
      }
    }, { passive: true });

    viewport.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1 && zoom.dragging) {
        var t = e.touches[0];
        zoom.x += t.clientX - zoom.lastX;
        zoom.y += t.clientY - zoom.lastY;
        zoom.lastX = t.clientX; zoom.lastY = t.clientY;
        applyZoomTransform();
      } else if (e.touches.length === 2) {
        var d = touchDist(e.touches);
        var ratio = d / (zoom.pinchDist || d);
        zoom.scale = clampScale(zoom.scale * ratio);
        zoom.pinchDist = d;
        applyZoomTransform();
      }
    }, { passive: true });

    viewport.addEventListener("touchend", function () {
      zoom.dragging = false;
    });

    function touchDist(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
  }

  /* ---------- Fullscreen ---------- */
  function wireFullscreen() {
    document.getElementById("btn-fullscreen").addEventListener("click", function () {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function () {});
      } else {
        document.exitFullscreen();
      }
    });
  }

  /* ---------- Enquire ---------- */
  function buildMailto() {
    var subject = encodeURIComponent("Enquiry — Esteem Multi Systems Catalogue (Page " + state.currentPage + ")");
    var body = encodeURIComponent(
      "Hello Esteem Multi Systems team,\n\n" +
      "I was viewing page " + state.currentPage + " of your catalogue and would like to enquire about it.\n\n" +
      "Please share more details / a quotation.\n\nThank you."
    );
    return "mailto:" + CONFIG.enquireEmail + "?subject=" + subject + "&body=" + body;
  }
  function wireEnquire() {
    document.getElementById("btn-enquire").addEventListener("click", function () {
      window.location.href = buildMailto();
    });
    document.getElementById("hero-enquire").addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = buildMailto();
    });
  }

  /* ---------- TOC open/close wiring ---------- */
  function wireToc() {
    document.getElementById("btn-toc").addEventListener("click", openToc);
    document.getElementById("btn-toc-close").addEventListener("click", closeToc);
    document.getElementById("drawer-scrim").addEventListener("click", function () {
      closeToc(); closeZoom();
    });
  }

  /* ---------- Loading screen ---------- */
  function setLoadingProgress(loaded, total) {
    var pct = Math.round((loaded / total) * 100);
    document.getElementById("loading-bar-fill").style.width = pct + "%";
    document.getElementById("loading-percent").textContent = "Loading catalogue — " + pct + "%";
  }
  function hideLoadingScreen() {
    document.getElementById("loading-screen").classList.add("hidden");
    var wrap = document.getElementById("book-wrap");
    wrap.classList.add("entered");
  }

  /* ---------- Boot ---------- */
  function boot() {
    detectPageCount().then(function (total) {
      state.total = Math.max(total, 1);
      var urls = [];
      for (var i = 1; i <= state.total; i++) urls.push(pageUrl(i));

      preloadAll(urls, setLoadingProgress).then(function () {
        initFlipbook();
        buildToc();
        wireZoom();
        wireFullscreen();
        wireEnquire();
        wireToc();
        setTimeout(hideLoadingScreen, 250);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
