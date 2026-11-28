// JavaScript / gui.js / Android WebView / GlassLab panel, 5 functions, color pickers, timing toast, game review + eval bar.
(function () {
  if (window.__caGui) return;

  var EASE = 'cubic-bezier(.22,1,.36,1)';
  var FILL_GRAD = 'linear-gradient(90deg,#425f3f 0%,#597c53 45%,#6c8f63 100%)';
  var NOSEL = '-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;' +
    '-webkit-touch-callout:none;outline:none;';
  var TEXT = '#f2f1ed';

  try {
    document.documentElement.style.setProperty('-webkit-tap-highlight-color', 'transparent');
  } catch (e) {}

  var cfg = {
    accuracy: 78,
    accuracyOn: false,
    rating: 1500,
    multi: false,
    arrows: false,
    auto: false,
    timing: true,
    focusPause: true,
    weakMoves: false,
    proctorGuard: true,
    review: false,
    advantage: false,
    pure: false,
    openings: false,
    style: 'squares',
    fromColor: '#14B8A6',
    toColor: '#14B8A6',
    arrowColor: '#14B8A6'
  };

  var openMenu = null;
  var openColor = null;
  var colorOpens = 0, colorCloses = 0, okClicks = 0;
  var picking = null;
  var draft = { h: 0, s: 0, v: 0 };
  var queued = 0;
  var lastConfigUrl = '';
  var toastShown = false, toastTimer = 0;

  var menus = {};
  var rows = {};
  var dots = {};
  var segEls = [];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function stop(e) { e.stopPropagation(); }
  function el(tag, css, parent, text) {
    var e = document.createElement(tag);
    e.style.cssText = NOSEL + (css || '');
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function jelly(node) {
    if (reduced() || !node || !node.animate) return;
    node.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.03,.94)', offset: .24 },
      { transform: 'scale(.985,1.04)', offset: .45 },
      { transform: 'scale(1.012,.985)', offset: .68 },
      { transform: 'scale(1)' }
    ], { duration: 620, easing: EASE });
  }
  function plateBg() {
    return 'rgba(100,100,100,.245)';
  }
  function plateCss(radius) {
    return 'background:' + plateBg() + ';' +
      '-webkit-backdrop-filter:blur(30px) saturate(150%);backdrop-filter:blur(30px) saturate(150%);' +
      'border-radius:' + radius + 'px;';
  }

  // ---------- root + panel (lab geometry, mobile branch) ----------
  var root = el('div',
    'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483647;' +
    'display:none;align-items:center;justify-content:center;box-sizing:border-box;' +
    'pointer-events:none;font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif;', null);

  var panel = el('div',
    'position:relative;width:86vw;max-width:400px;min-height:200px;box-sizing:border-box;' +
    'border-radius:20px;border:0;overflow:visible;pointer-events:auto;color:' + TEXT + ';' +
    'background:rgba(18,20,26,.45);' +
    '-webkit-backdrop-filter:blur(7px) saturate(150%);backdrop-filter:blur(7px) saturate(150%);' +
    'box-shadow:0 28px 70px rgba(0,0,0,.42);' +
    'transition:background 260ms ease;', root);
  panel.className = 'glass';
  root.addEventListener('pointerdown', stop);
  root.addEventListener('selectstart', function (e) { e.preventDefault(); });

  // ---------- panel drag ----------
  // The panel floats above the page, so it can be parked anywhere. Position is
  // kept as a translate offset from the flex-centred layout: no reflow, no
  // fight with the open/close animations, and the board keeps spinning.
  var panelPos = { x: 0, y: 0 };
  var panelDrag = null;

  function panelTf(dx, dy, scale) {
    return 'translate3d(' + (panelPos.x + (dx || 0)) + 'px,' +
      (panelPos.y + (dy || 0)) + 'px,0)' + (scale ? ' scale(' + scale + ')' : '');
  }
  function applyPanelPos() {
    panel.style.transform = panelTf(0, 0, 1);
  }
  function panelLimits(baseL, baseT, w, h) {
    var vw = window.innerWidth || 360, vh = window.innerHeight || 640, m = 6;
    var minX = m - baseL, maxX = vw - m - baseL - w;
    var minY = m - baseT, maxY = vh - m - baseT - h;
    if (minX > maxX) minX = maxX = (vw - w) / 2 - baseL;
    if (minY > maxY) minY = maxY = (vh - h) / 2 - baseT;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }
  function clampPanelPos() {
    if (root.style.display === 'none') return;
    var r = panel.getBoundingClientRect();
    var lim = panelLimits(r.left - panelPos.x, r.top - panelPos.y, r.width, r.height);
    panelPos.x = clamp(panelPos.x, lim.minX, lim.maxX);
    panelPos.y = clamp(panelPos.y, lim.minY, lim.maxY);
    applyPanelPos();
  }
  function startPanelDrag(e) {
    if (panelDrag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (panel.getAnimations) {
      panel.getAnimations().forEach(function (a) {
        try { a.cancel(); } catch (er) {}
      });
    }
    var r = panel.getBoundingClientRect();
    panelDrag = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: panelPos.x, oy: panelPos.y,
      baseL: r.left - panelPos.x, baseT: r.top - panelPos.y, w: r.width, h: r.height
    };
    panel.style.cursor = 'grabbing';
    try { panel.setPointerCapture(e.pointerId); } catch (er) {}
    e.preventDefault();
    e.stopPropagation();
  }
  function movePanelDrag(e) {
    if (!panelDrag || e.pointerId !== panelDrag.id) return;
    var d = panelDrag;
    var lim = panelLimits(d.baseL, d.baseT, d.w, d.h);
    panelPos.x = clamp(d.ox + (e.clientX - d.sx), lim.minX, lim.maxX);
    panelPos.y = clamp(d.oy + (e.clientY - d.sy), lim.minY, lim.maxY);
    applyPanelPos();
    e.preventDefault();
  }
  function endPanelDrag(e) {
    if (!panelDrag || (e && e.pointerId !== panelDrag.id)) return;
    panelDrag = null;
    panel.style.cursor = 'grab';
  }
  // A real grip instead of touch-action:none on the whole panel: keeps the
  // function stack scrollable and the accuracy slider draggable.
  var dragGrip = el('div',
    'position:absolute;left:0;top:0;right:0;height:38px;z-index:0;' +
    'touch-action:none;cursor:grab;background:transparent;', panel);
  dragGrip.className = 'glass-drag';
  dragGrip.setAttribute('aria-label', 'Перетащить панель');
  dragGrip.addEventListener('pointerdown', startPanelDrag);
  panel.addEventListener('pointermove', movePanelDrag);
  panel.addEventListener('pointerup', endPanelDrag);
  panel.addEventListener('pointercancel', endPanelDrag);
  panel.addEventListener('lostpointercapture', endPanelDrag);
  panel.addEventListener('pointerdown', function (e) {
    if (e.target === panel) startPanelDrag(e);
  });
  window.addEventListener('resize', clampPanelPos);

  // ---------- 3D board (baked turntable of marble_chess_board.glb) ----------
  var board = el('div',
    'position:absolute;top:40px;left:4px;width:140px;height:140px;overflow:hidden;' +
    'border-radius:10px;touch-action:none;cursor:grab;z-index:0;', panel);
  board.className = 'glass-canvas';
  var boardCanvas = document.createElement('canvas');
  boardCanvas.width = 280;
  boardCanvas.height = 280;
  boardCanvas.style.cssText = 'display:block;width:100%;height:100%;opacity:.9;';
  board.appendChild(boardCanvas);
  var boardCtx = boardCanvas.getContext('2d');
  var boardImg = null;
  var BOARD_FRAMES = 36, BOARD_COLS = 6, BOARD_STEP = Math.PI * 2 / BOARD_FRAMES;
  var boardYaw = 0, boardVel = 0, boardDrag = false, boardLastX = 0, boardLastT = 0;
  (function loadBoard() {
    var src = window.__caBoardSheet;
    if (!src) return;
    var img = new Image();
    img.onload = function () { boardImg = img; };
    img.src = src;
  })();
  function drawBoard(now) {
    var dt = boardLastT ? Math.min(0.06, (now - boardLastT) / 1000) : 0;
    boardLastT = now;
    if (!boardImg || root.style.display === 'none') {
      requestAnimationFrame(drawBoard);
      return;
    }
    if (!boardDrag) {
      boardYaw += (0.1 + boardVel) * dt;
      boardVel *= Math.exp(-2.6 * dt);
      if (Math.abs(boardVel) < 0.0006) boardVel = 0;
    }
    if (boardImg) {
      var f = (((boardYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / BOARD_STEP;
      var base = Math.floor(f);
      var i0 = base % BOARD_FRAMES, i1 = (i0 + 1) % BOARD_FRAMES, t = f - base;
      boardCtx.clearRect(0, 0, 280, 280);
      boardCtx.globalAlpha = 1 - t;
      boardCtx.drawImage(boardImg, (i0 % BOARD_COLS) * 280, Math.floor(i0 / BOARD_COLS) * 280,
        280, 280, 0, 0, 280, 280);
      if (t > 0.002) {
        boardCtx.globalAlpha = t;
        boardCtx.drawImage(boardImg, (i1 % BOARD_COLS) * 280, Math.floor(i1 / BOARD_COLS) * 280,
          280, 280, 0, 0, 280, 280);
      }
      boardCtx.globalAlpha = 1;
    }
    requestAnimationFrame(drawBoard);
  }
  requestAnimationFrame(drawBoard);
  board.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    e.stopPropagation();
    boardDrag = true;
    boardLastX = e.clientX;
    boardVel = 0;
    board.style.cursor = 'grabbing';
    try { board.setPointerCapture(e.pointerId); } catch (er) {}
  });
  board.addEventListener('pointermove', function (e) {
    if (!boardDrag) return;
    var dx = e.clientX - boardLastX;
    boardLastX = e.clientX;
    var step = dx * 0.006;
    boardYaw += step;
    boardVel = step * 18;
  });
  function boardRelease() {
    if (!boardDrag) return;
    boardDrag = false;
    board.style.cursor = 'grab';
  }
  board.addEventListener('pointerup', boardRelease);
  board.addEventListener('pointercancel', boardRelease);
  board.addEventListener('lostpointercapture', boardRelease);

  // ---------- header ----------
  var avatar = el('img',
    'position:absolute;top:12px;left:8px;width:28px;height:28px;display:block;' +
    'object-fit:cover;object-position:center;border:0;border-radius:50%;', panel);
  avatar.src = window.__caGuiAvatar || '';
  avatar.alt = '';
  avatar.draggable = false;

  var link = el('a',
    'position:absolute;top:12px;left:44px;height:28px;display:flex;align-items:center;' +
    'color:rgba(255,255,255,.82);font:500 12px/1 Inter,"Segoe UI",system-ui,sans-serif;' +
    'letter-spacing:.01em;text-decoration:none;white-space:nowrap;cursor:pointer;' +
    'text-shadow:0 1px 2px rgba(0,0,0,.6),0 -1px 0 rgba(255,255,255,.14);', panel, 'github.com/wekodik-fostein');
  link.href = 'https://github.com/wekodik-fostein';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  var closeBtn = el('button',
    'position:absolute;top:-2px;right:2px;width:32px;height:32px;padding:0;border:0;' +
    'display:grid;place-items:center;background:transparent;z-index:40;cursor:pointer;' +
    'color:rgba(255,255,255,.42);font:300 18px/1 Inter,"Segoe UI",system-ui,sans-serif;' +
    'text-shadow:0 1px 2px rgba(0,0,0,.55);', panel, '\u00d7');
  closeBtn.type = 'button';
  closeBtn.className = 'glass-close';
  closeBtn.setAttribute('aria-label', 'Закрыть');
  closeBtn.addEventListener('pointerenter', function () { closeBtn.style.color = 'rgba(255,255,255,.9)'; });
  closeBtn.addEventListener('pointerleave', function () { closeBtn.style.color = 'rgba(255,255,255,.42)'; });

  // ---------- function stack ----------
  var stack = el('div',
    'position:absolute;top:72px;left:146px;right:10px;bottom:12px;display:flex;' +
    'flex-direction:column;align-items:stretch;justify-content:flex-start;gap:4px;' +
    'overflow-y:auto;overflow-x:hidden;overflow-anchor:none;padding-right:2px;' +
    'scrollbar-width:thin;', panel);
  stack.className = 'glass-functions';

  var ROW_CSS =
    'position:relative;overflow:hidden;isolation:isolate;flex:0 0 auto;width:100%;box-sizing:border-box;' +
    'min-height:24px;padding:4px 8px;border:0;border-radius:10px;' + plateCss(10) +
    'color:rgba(255,255,255,.58);font:500 10px/1.3 Inter,"Segoe UI",system-ui,sans-serif;text-align:left;' +
    'text-shadow:0 1px 0 rgba(255,255,255,.2),0 -1px 2px rgba(0,0,0,.9);cursor:pointer;' +
    'transition:color 280ms ease,transform 450ms ' + EASE + ';';
  var FILL_CSS =
    'position:absolute;left:0;top:0;right:0;bottom:0;z-index:0;border-radius:inherit;background:' + FILL_GRAD + ';' +
    'transform:scaleX(0);transform-origin:left center;pointer-events:none;' +
    'transition:transform 520ms ' + EASE + ';';

  function makeRow(key, label, hasDots) {
    var wrap = el('div', 'position:relative;flex:0 0 auto;width:100%;', stack);
    wrap.className = 'glass-function-wrap';
    var button = el('button', ROW_CSS, wrap);
    button.type = 'button';
    button.className = 'glass-function';
    var fill = el('span', FILL_CSS, button);
    fill.className = 'glass-function-fill';
    el('span', 'position:relative;z-index:1;padding-right:24px;', button, label);
    var dot = null;
    if (hasDots) {
      dot = el('span',
        'position:absolute;right:7px;top:50%;width:14px;height:18px;z-index:2;cursor:pointer;' +
        'transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;' +
        'justify-content:center;gap:2px;', button);
      dot.className = 'glass-function-dots';
      dot.setAttribute('role', 'button');
      dot.setAttribute('aria-label', 'Настройки');
      dot.tabIndex = 0;
      for (var d = 0; d < 3; d++) {
        el('span', 'width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.55);', dot);
      }
    }
    rows[key] = { wrap: wrap, button: button, fill: fill, dots: dot };
    return rows[key];
  }

  function paintRow(key, on) {
    var r = rows[key];
    if (!r) return;
    r.fill.style.transform = 'scaleX(' + (on ? 1 : 0) + ')';
    r.button.style.color = on ? '#f2ede4' : 'rgba(255,255,255,.58)';
    r.button.style.textShadow = on
      ? '0 1px 0 rgba(255,255,255,.14),0 -1px 2px rgba(0,0,0,.8)'
      : '0 1px 0 rgba(255,255,255,.2),0 -1px 2px rgba(0,0,0,.9)';
    r.button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // ---------- menus ----------
  function menuFor(key) {
    var m = el('div',
      'display:block;max-height:0;opacity:0;transform:translateY(-6px);overflow:hidden;' +
      'pointer-events:none;transition:max-height 320ms ' + EASE + ',opacity 220ms ease,' +
      'transform 320ms ' + EASE + ';', rows[key].wrap);
    m.className = 'glass-menu';
    var inner = el('div', 'min-height:0;overflow:hidden;margin-top:4px;padding:10px;' + plateCss(10), m);
    inner.className = 'glass-menu-inner';
    menus[key] = { root: m, inner: inner };
    return inner;
  }

  function setMenu(key, open, instant) {
    var m = menus[key];
    if (!m) return;
    if (open) {
      closeMenus(key, true);
      m.root.style.maxHeight = (m.inner.scrollHeight + 6) + 'px';
      m.root.style.opacity = '1';
      m.root.style.transform = 'translateY(0)';
      m.root.style.pointerEvents = 'auto';
      openMenu = key;
    } else {
      m.root.style.maxHeight = instant ? '0px' : '0px';
      m.root.style.opacity = '0';
      m.root.style.transform = 'translateY(-6px)';
      m.root.style.pointerEvents = 'none';
      if (openMenu === key) openMenu = null;
    }
  }
  function closeMenus(except, instant) {
    Object.keys(menus).forEach(function (k) {
      if (k !== except) setMenu(k, false, instant);
    });
    if (!except) openMenu = null;
  }
  function toggleMenu(key) {
    closeColor(true);
    setMenu(key, openMenu !== key);
  }

  function bindDots(key) {
    var d = rows[key] && rows[key].dots;
    if (!d) return;
    d.addEventListener('pointerdown', stop);
    d.addEventListener('click', function (e) {
      stop(e);
      toggleMenu(key);
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        stop(e);
        toggleMenu(key);
      }
    });
  }

  // ---------- multi ----------
  var multi = makeRow('multi', 'Несколько вариантов ходов', true);
  bindDots('multi');
  multi.button.addEventListener('click', function () {
    cfg.multi = !cfg.multi;
    paintRow('multi', cfg.multi);
    queue();
    jelly(multi.button);
  });

  var multiInner = menuFor('multi');
  var displayRow = el('div',
    'display:flex;flex-direction:column;align-items:stretch;gap:6px;margin-bottom:8px;' +
    'color:rgba(255,255,255,.72);font-size:11px;', multiInner);
  displayRow.className = 'glass-menu-row is-display';
  el('span', 'font:500 11px/1.3 Inter,"Segoe UI",system-ui,sans-serif;', displayRow, 'Отображение');
  var seg = el('div', 'display:flex;gap:4px;flex-shrink:0;width:100%;', displayRow);
  seg.className = 'glass-menu-seg';
  [['arrows', 'стрелки'], ['squares', 'квадраты']].forEach(function (p) {
    var b = el('button',
      'position:relative;overflow:hidden;isolation:isolate;flex:1;text-align:center;' +
      'padding:5px 4px;border:0;border-radius:7px;background:rgba(255,255,255,.08);' +
      'color:rgba(255,255,255,.68);font:500 10px/1 Inter,sans-serif;cursor:pointer;white-space:nowrap;' +
      'transition:color 280ms ease;', seg);
    b.type = 'button';
    var f = el('span',
      'position:absolute;left:0;top:0;right:0;bottom:0;z-index:0;border-radius:inherit;background:' + FILL_GRAD + ';' +
      'transform:scaleX(0);transform-origin:left center;pointer-events:none;' +
      'transition:transform 520ms ' + EASE + ';', b);
    el('span', 'position:relative;z-index:1;', b, p[1]);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      cfg.style = p[0];
      cfg.arrows = p[0] === 'arrows';
      renderSeg();
      queue();
      jelly(b);
    });
    segEls.push({ key: p[0], root: b, fill: f });
  });
  function renderSeg() {
    segEls.forEach(function (s) {
      var on = cfg.style === s.key;
      s.fill.style.transform = 'scaleX(' + (on ? 1 : 0) + ')';
      s.root.style.color = on ? '#fff' : 'rgba(255,255,255,.68)';
    });
  }

  var COLOR_ROWS = [['fromColor', 'Откуда'], ['toColor', 'Куда'], ['arrowColor', 'Стрелка']];
  COLOR_ROWS.forEach(function (p) {
    var line = el('div',
      'display:flex;align-items:center;justify-content:space-between;gap:8px;' +
      'margin-bottom:8px;color:rgba(255,255,255,.72);font-size:11px;', multiInner);
    line.className = 'glass-menu-color-row';
    el('span', 'font:500 11px/1.3 Inter,"Segoe UI",system-ui,sans-serif;', line, p[1]);
    var dot = el('button',
      'width:22px;height:22px;flex:none;border:0;border-radius:6px;cursor:pointer;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);', line);
    dot.type = 'button';
    dot.className = 'color-dot';
    dot.setAttribute('aria-label', 'Выбрать цвет');
    dot.addEventListener('pointerdown', stop);
    dot.addEventListener('click', function (e) {
      stop(e);
      if (openColor === p[0]) closeColor();
      else openPicker(p[0], dot);
    });
    dots[p[0]] = dot;
  });
  function renderColors() {
    COLOR_ROWS.forEach(function (p) {
      if (dots[p[0]]) dots[p[0]].style.background = cfg[p[0]];
    });
  }

  // ---------- accuracy ----------
  var acc = makeRow('accuracy', 'Точность', true);
  bindDots('accuracy');
  acc.button.addEventListener('click', function () {
    cfg.accuracyOn = !cfg.accuracyOn;
    paintRow('accuracy', cfg.accuracyOn);
    queue();
    jelly(acc.button);
  });

  var accInner = menuFor('accuracy');
  var accRow = el('div',
    'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;' +
    'color:rgba(255,255,255,.72);font-size:11px;', accInner);
  accRow.className = 'glass-menu-row';
  var accLabel = el('span', 'font:500 11px/1.3 Inter,"Segoe UI",system-ui,sans-serif;', accRow, '78%');
  var meter = el('div',
    'position:relative;height:12px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden;', accInner);
  meter.className = 'glass-menu-meter';
  var meterFill = el('div',
    'position:absolute;left:0;top:0;bottom:0;width:0;' +
    'transition:width 120ms linear,background-color 180ms ease;', meter);
  meterFill.className = 'glass-menu-meter-fill';
  var accRange = el('input',
    'position:absolute;left:0;right:0;top:-4px;bottom:-4px;width:100%;height:20px;margin:0;' +
    'opacity:0;cursor:pointer;', meter);
  accRange.type = 'range';
  accRange.min = '30';
  accRange.max = '100';
  accRange.step = '1';
  accRange.className = 'acc-range';
  accRange.setAttribute('aria-label', 'Точность');
  function accColor(v) {
    return v < 50 ? '#d45a4a' : v < 70 ? '#d4b24a' : v < 90 ? '#8bc978' : '#4f8a4c';
  }
  function paintAccuracy() {
    var v = clamp(Math.round(cfg.accuracy), 30, 100);
    accLabel.textContent = v + '%';
    meterFill.style.width = (((v - 30) / 70) * 100) + '%';
    meterFill.style.background = accColor(v);
    accRange.value = String(v);
    paintRow('accuracy', cfg.accuracyOn);
  }
  accRange.addEventListener('input', function () {
    cfg.accuracy = clamp(parseInt(accRange.value, 10) || 30, 30, 100);
    paintAccuracy();
    queue();
  });

  // ---------- auto ----------
  var auto = makeRow('auto', 'Авто ход', false);
  auto.button.addEventListener('click', function () {
    cfg.auto = !cfg.auto;
    paintRow('auto', cfg.auto);
    queue();
    jelly(auto.button);
  });

  // ---------- pure engine ----------
  var pure = makeRow('pure', 'Чистый движок', false);
  pure.button.addEventListener('click', function () {
    cfg.pure = !cfg.pure;
    paintRow('pure', cfg.pure);
    queue();
    jelly(pure.button);
  });

  // ---------- openings ----------
  var openings = makeRow('openings', 'Открытия', false);
  openings.button.addEventListener('click', function () {
    cfg.openings = !cfg.openings;
    paintRow('openings', cfg.openings);
    queue();
    jelly(openings.button);
  });

  // ---------- review (разбор ходов, в духе chess.com) ----------
  var review = makeRow('review', 'Разбор ходов', true);
  bindDots('review');
  review.button.addEventListener('click', function () {
    cfg.review = !cfg.review;
    paintRow('review', cfg.review);
    queue();
    jelly(review.button);
    if (!cfg.review) hideReviewBadge();
  });

  var RV_COLORS = {
    'Лучший': '#26c2a3',
    'Отличный': '#95bb4a',
    'Хороший': '#a3b7cd',
    'Неточность': '#f7c631',
    'Ошибка': '#ffa459',
    'Зевок': '#fa412d'
  };

  function reviewState() {
    try {
      return window.__ca && window.__ca.getReviewState ? window.__ca.getReviewState() : null;
    } catch (e) { return null; }
  }

  var reviewInner = menuFor('review');
  var rvHead = el('div',
    'display:flex;align-items:center;gap:8px;margin-bottom:8px;', reviewInner);
  var rvEval = el('span',
    'flex:none;min-width:44px;font:600 13px/1 Inter,"Segoe UI",system-ui,sans-serif;color:' + TEXT + ';',
    rvHead, '+0.00');
  var rvBarWrap = el('div',
    'position:relative;flex:1;height:10px;border-radius:999px;background:#3a3937;overflow:hidden;' +
    'box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);', rvHead);
  var rvBarFill = el('div',
    'position:absolute;left:0;top:0;bottom:0;width:50%;border-radius:999px;background:#f2f1ed;' +
    'transition:width 400ms ease;', rvBarWrap);
  var rvGraphWrap = el('div',
    'position:relative;height:56px;margin:8px 0 2px;border-radius:8px;overflow:hidden;' +
    'background:#232220;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);', reviewInner);
  rvGraphWrap.className = 'glass-review-graph';
  var rvGraph = el('canvas', 'display:block;width:100%;height:100%;', rvGraphWrap);
  var rvList = el('div',
    'max-height:190px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;', reviewInner);
  var rvSum = el('div',
    'margin-top:8px;color:rgba(255,255,255,.62);font:500 10px/1.5 Inter,"Segoe UI",system-ui,sans-serif;white-space:pre-line;',
    reviewInner, 'Партия не начата');
  var rvPgn = el('button',
    'margin-top:8px;width:100%;border:0;border-radius:8px;padding:7px;background:rgba(255,255,255,.1);' +
    'color:rgba(255,255,255,.82);font:500 11px/1 Inter,"Segoe UI",system-ui,sans-serif;cursor:pointer;' +
    'transition:color 280ms ease;', reviewInner, 'Копировать PGN');
  rvPgn.type = 'button';

  // График перевеса: кривая оценки по всем ходам, как в game review.
  var rvGraphSig = '';
  function drawGraph(st) {
    var c = rvGraph;
    if (!c || !c.getContext) return;
    var w = rvGraphWrap.clientWidth || 280, h = 56;
    var dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var sig = st.total + '|' + st.moves.map(function (m) { return m.evalWhite; }).join(',');
    if (sig === rvGraphSig) return;
    rvGraphSig = sig;
    var pts = [0], i;
    for (i = 0; i < st.moves.length; i++) {
      var cp = st.moves[i].evalWhite || 0;
      pts.push(cp);
    }
    if (pts.length === 1) pts.push(0);   // пустая партия: ровная линия по центру
    var span = Math.max(1, pts.length - 1);
    var shareAt = function (cp) {
      return 1 / (1 + Math.pow(10, -cp / 400));
    };
    var xs = [], ys = [];
    for (i = 0; i < pts.length; i++) {
      xs.push(pts.length > 1 ? (i / span) * (w - 2) + 1 : w / 2);
      ys.push(shareAt(pts[i]) * (h - 4) + 2);
    }
    for (var x = 0; x < w; x++) {
      var t = (x - 1) / (w - 2) * span;
      var k = Math.max(0, Math.min(span - 1, Math.floor(t)));
      var f = Math.max(0, Math.min(1, t - k));
      var s = ys[k] + (ys[Math.min(span, k + 1)] - ys[k]) * f;
      ctx.fillStyle = '#e8e6e1';
      ctx.fillRect(x, 0, 1, Math.max(1, s));
      ctx.fillStyle = '#191817';
      ctx.fillRect(x, s, 1, h - s);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.strokeStyle = '#26c2a3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i < xs.length; i++) {
      if (i) ctx.lineTo(xs[i], ys[i]);
      else ctx.moveTo(xs[i], ys[i]);
    }
    ctx.stroke();
    for (i = 0; i < st.moves.length; i++) {
      if (st.moves[i].label !== 'Зевок') continue;
      ctx.fillStyle = '#fa412d';
      ctx.beginPath();
      ctx.arc(xs[i + 1], ys[i + 1], 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  var rvPgnBusy = false;
  rvPgn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (rvPgnBusy) return;
    var cf = window.__ca;
    var pgn = cf && typeof cf.getPgn === 'function' ? cf.getPgn() : null;
    if (!pgn || !pgn.ok) {
      rvPgn.textContent = 'Партия не начата';
      setTimeout(function () { rvPgn.textContent = 'Копировать PGN'; }, 1600);
      return;
    }
    var done = function (ok) {
      rvPgnBusy = false;
      rvPgn.textContent = ok ? 'Скопировано' : 'Не удалось скопировать';
      setTimeout(function () { rvPgn.textContent = 'Копировать PGN'; }, 1800);
    };
    rvPgnBusy = true;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pgn.text).then(function () { done(true); }, function () {
        fallbackCopy(pgn.text, done);
      });
    } else {
      fallbackCopy(pgn.text, done);
    }
  });
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (er) { ok = false; }
      document.body.removeChild(ta);
      if (!ok) showPgnSheet(text);
      done(ok);
    } catch (er) {
      showPgnSheet(text);
      done(false);
    }
  }
  function showPgnSheet(text) {
    var ov = el('div',
      'position:fixed;left:0;right:0;top:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.72);' +
      'display:flex;align-items:center;justify-content:center;padding:18px;', document.body);
    var box = el('div',
      'width:100%;max-width:420px;padding:12px;border-radius:12px;background:#232220;display:flex;' +
      'flex-direction:column;gap:8px;', ov);
    var ta = el('textarea',
      'width:100%;height:170px;border:0;border-radius:8px;padding:8px;background:#191817;color:#f2f1ed;' +
      'font:500 10px/1.4 monospace;resize:none;', box);
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    var hint = el('div',
      'color:rgba(255,255,255,.6);font:500 10px/1.4 Inter,sans-serif;', box,
      'Скопируйте вручную: удерживайте текст и выберите «Копировать».');
    var closeB = el('button',
      'border:0;border-radius:8px;padding:8px;background:rgba(255,255,255,.14);color:#f2f1ed;' +
      'font:500 11px/1 Inter,sans-serif;cursor:pointer;', box, 'Закрыть');
    closeB.type = 'button';
    closeB.addEventListener('click', function () { document.body.removeChild(ov); });
  }

  var rvSig = '';
  function fmtRvSum(s) {
    if (!s.n) return 'нет ходов';
    return 'зевков ' + s.blunder + ', ошибок ' + s.mistake + ', неточностей ' + s.inaccuracy +
      ', ср. потеря ' + (s.loss / s.n / 100).toFixed(2);
  }
  function renderReview() {
    var st = reviewState();
    if (!st) { rvSum.textContent = 'Движок не готов'; return; }
    rvEval.textContent = st.evalText;
    rvEval.style.color = st.evalWhite > 60 ? '#ffffff' : (st.evalWhite < -60 ? '#b5b1ac' : TEXT);
    rvBarFill.style.width = Math.round(st.share * 100) + '%';
    drawGraph(st);
    var sig = st.total + '|' + st.evalText + '|' +
      (st.moves.length ? st.moves[st.moves.length - 1].label : '');
    if (sig === rvSig) return;
    rvSig = sig;
    rvList.textContent = '';
    if (!st.moves.length) {
      el('div', 'color:rgba(255,255,255,.5);font-size:10.5px;', rvList, 'Ходов пока нет');
    }
    st.moves.forEach(function (m) {
      var row = el('div',
        'display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:7px;' +
        (m.mine ? 'background:rgba(255,255,255,.05);' : ''), rvList);
      el('span',
        'flex:none;width:30px;color:rgba(255,255,255,.45);font:500 10px/1.2 Inter,sans-serif;',
        row, Math.ceil(m.n / 2) + (m.color === 'w' ? '.' : '...'));
      el('span',
        'flex:none;width:56px;color:' + TEXT + ';font:600 11px/1.2 Inter,sans-serif;', row, m.san);
      var lab = el('span',
        'flex:none;font:600 10px/1.2 Inter,sans-serif;', row, m.label === null ? '\u2014' : m.label);
      lab.style.color = m.label === null ? 'rgba(255,255,255,.4)' : (RV_COLORS[m.label] || TEXT);
      if (m.label !== null && m.loss > 0) {
        el('span', 'flex:none;color:rgba(255,255,255,.4);font:500 10px/1.2 Inter,sans-serif;',
          row, (m.approx ? '\u2248' : '') + '-' + (m.loss / 100).toFixed(2));
      }
      if (m.best) {
        el('span',
          'flex:none;margin-left:auto;color:rgba(255,255,255,.35);font:500 9.5px/1.2 Inter,sans-serif;',
          row, 'лучше ' + m.best);
      }
    });
    var sv = rvList.querySelector('div:last-child');
    if (sv && sv.scrollIntoView) { try { sv.scrollIntoView({ block: 'end' }); } catch (er) {} }
    rvSum.textContent = 'Белые: ' + fmtRvSum(st.sumW) + '\nЧёрные: ' + fmtRvSum(st.sumB);
  }

  // Плавающий бейдж с оценкой последнего хода.
  var rvBadge = el('div',
    'position:fixed;left:50%;bottom:27%;transform:translate(-50%,10px);z-index:2147483645;' +
    'display:none;align-items:center;gap:6px;padding:6px 13px;border-radius:999px;' +
    'background:rgba(18,20,26,.85);color:' + TEXT + ';' +
    '-webkit-backdrop-filter:blur(12px) saturate(140%);backdrop-filter:blur(12px) saturate(140%);' +
    'box-shadow:0 12px 30px rgba(0,0,0,.35);opacity:0;pointer-events:none;' +
    'font:600 12px/1 Inter,"Segoe UI",system-ui,sans-serif;white-space:nowrap;' +
    'transition:opacity 220ms ease,transform 260ms ' + EASE + ';', null, '');
  document.documentElement.appendChild(rvBadge);
  var rvBadgeTimer = 0;
  var rvBadgeN = -1;
  function hideReviewBadge() {
    rvBadge.style.opacity = '0';
    rvBadge.style.transform = 'translate(-50%,10px)';
    if (rvBadgeTimer) { clearTimeout(rvBadgeTimer); rvBadgeTimer = 0; }
    setTimeout(function () {
      if (rvBadge.style.opacity === '0') rvBadge.style.display = 'none';
    }, 260);
  }
  function updateReviewBadge() {
    if (!cfg.review) return;
    var st = reviewState();
    if (!st || !st.moves.length) return;
    var m = st.moves[st.moves.length - 1];
    if (m.n === rvBadgeN || m.label === null) return;
    rvBadgeN = m.n;
    rvBadge.textContent = (m.color === 'w' ? 'Белые: ' : 'Чёрные: ') + m.san + ' \u2014 ' + m.label;
    rvBadge.style.color = RV_COLORS[m.label] || TEXT;
    rvBadge.style.display = 'flex';
    requestAnimationFrame(function () {
      rvBadge.style.opacity = '1';
      rvBadge.style.transform = 'translate(-50%,0)';
    });
    if (rvBadgeTimer) clearTimeout(rvBadgeTimer);
    rvBadgeTimer = setTimeout(hideReviewBadge, 3200);
  }

  // ---------- advantage (шкала перевеса) ----------
  var advantage = makeRow('advantage', 'Перевес', false);
  advantage.button.addEventListener('click', function () {
    cfg.advantage = !cfg.advantage;
    paintRow('advantage', cfg.advantage);
    queue();
    jelly(advantage.button);
    updateAdvantage();
  });

  var advBar = el('div',
    'position:fixed;left:6px;top:50%;transform:translateY(-50%);width:9px;height:42vh;' +
    'z-index:2147483646;border-radius:999px;background:#33312e;' +
    'box-shadow:0 0 0 1px rgba(255,255,255,.28);pointer-events:none;display:none;', null);
  var advFill = el('div',
    'position:absolute;left:0;right:0;bottom:0;height:50%;border-radius:999px;background:#f2f1ed;' +
    'transition:height 400ms ease;', advBar);
  var advText = el('div',
    'position:fixed;left:-4px;top:calc(50% + 22vh);width:30px;z-index:2147483646;' +
    'pointer-events:none;display:none;text-align:center;color:' + TEXT + ';' +
    'font:700 9.5px/1.2 Inter,"Segoe UI",system-ui,sans-serif;letter-spacing:.02em;' +
    'text-shadow:0 1px 3px rgba(0,0,0,.85);', null, '+0.0');
  document.documentElement.appendChild(advBar);
  document.documentElement.appendChild(advText);
  function updateAdvantage() {
    var on = cfg.advantage;
    advBar.style.display = on ? 'block' : 'none';
    advText.style.display = on ? 'block' : 'none';
    if (!on) return;
    var st = reviewState();
    if (!st) return;
    advFill.style.height = Math.round(st.share * 100) + '%';
    advText.textContent = st.evalText;
    advText.style.color = st.evalWhite >= 0 ? '#f2f1ed' : '#a9a5a0';
  }

  // ---------- stats (статистика сессии) ----------
  var stats = makeRow('stats', 'Статистика', true);
  bindDots('stats');
  stats.button.addEventListener('click', function () {
    toggleMenu('stats');
    jelly(stats.button);
  });
  var statsInner = menuFor('stats');
  var statsText = el('div',
    'color:rgba(255,255,255,.72);font:500 11px/1.7 Inter,"Segoe UI",system-ui,sans-serif;white-space:pre-line;',
    statsInner, 'Нет данных');
  function renderStats() {
    var s = window.__ca && typeof window.__ca.getSessionStats === 'function'
      ? window.__ca.getSessionStats() : null;
    if (!s || (!s.games && !s.myMoves && !s.oppMoves)) {
      statsText.textContent = 'Нет данных';
      return;
    }
    statsText.textContent =
      'Партий: ' + s.games +
      '\nМоих ходов разобрано: ' + s.myMoves +
      '\nМоя точность: ' + (s.myMoves ? s.myAcc + '%' : '\u2014') +
      '\nМоих зевков: ' + s.myBlunders +
      '\nХодов соперника разобрано: ' + s.oppMoves +
      '\nЗевков у соперника: ' + s.oppBlunders;
  }

  // ---------- color popup ----------
  var pop = el('div',
    'position:absolute;left:146px;right:10px;bottom:12px;z-index:20;padding:10px;' + plateCss(10) +
    'display:none;opacity:0;transform:translateY(8px) scale(.9);', panel);
  pop.className = 'color-pop';
  var area = el('div',
    'position:relative;width:100%;height:96px;border-radius:8px;overflow:hidden;touch-action:none;cursor:crosshair;' +
    'background-image:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent);', pop);
  area.className = 'color-area';
  var areaDot = el('div',
    'position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;' +
    'border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none;', area);
  areaDot.className = 'color-area-dot';
  var hue = el('div',
    'position:relative;width:100%;height:10px;margin:10px 0 0;border-radius:999px;' +
    'background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);' +
    'box-shadow:0 0 0 1px rgba(0,0,0,.35);cursor:pointer;touch-action:none;', pop);
  hue.className = 'color-hue';
  var hueDot = el('div',
    'position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;' +
    'border:2px solid #fff;background:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.45);' +
    'pointer-events:none;', hue);
  hueDot.className = 'color-hue-dot';
  var ok = el('button',
    'margin-top:8px;width:100%;border:0;border-radius:8px;padding:5px;background:rgba(255,255,255,.12);' +
    'color:rgba(255,255,255,.88);font:500 11px/1 Inter,sans-serif;cursor:pointer;', pop, 'ok');
  ok.type = 'button';
  ok.className = 'color-ok';

  function hsv2hex(h, s, v) {
    var sat = s / 100, val = v / 100;
    var c = val * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = val - c;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    function q(n) { return Math.round((n + m) * 255).toString(16).padStart(2, '0'); }
    return '#' + q(r) + q(g) + q(b);
  }
  function hex2hsv(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return { h: 0, s: 0, v: 100 };
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: max ? (d / max) * 100 : 0, v: max * 100 };
  }
  function paintPicker() {
    area.style.backgroundColor = 'hsl(' + draft.h + ' 100% 50%)';
    areaDot.style.left = draft.s + '%';
    areaDot.style.top = (100 - draft.v) + '%';
    areaDot.style.background = hsv2hex(draft.h, draft.s, draft.v);
    hueDot.style.left = ((draft.h / 360) * 100) + '%';
  }
  function pickArea(e) {
    var r = area.getBoundingClientRect();
    if (!r.width || !r.height) return;
    draft.s = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
    draft.v = clamp(100 - ((e.clientY - r.top) / r.height) * 100, 0, 100);
    paintPicker();
  }
  function pickHue(e) {
    var r = hue.getBoundingClientRect();
    if (!r.width) return;
    draft.h = clamp(((e.clientX - r.left) / r.width) * 360, 0, 360);
    paintPicker();
  }
  area.addEventListener('pointerdown', function (e) {
    e.preventDefault(); e.stopPropagation();
    picking = 'area';
    pickArea(e);
  });
  hue.addEventListener('pointerdown', function (e) {
    e.preventDefault(); e.stopPropagation();
    picking = 'hue';
    pickHue(e);
  });
  document.addEventListener('pointermove', function (e) {
    if (!picking) return;
    if (picking === 'area') pickArea(e);
    else pickHue(e);
  }, { passive: true });
  document.addEventListener('pointerup', function () { picking = null; }, { passive: true });
  document.addEventListener('pointercancel', function () { picking = null; }, { passive: true });

  function openPicker(key, anchor) {
    openColor = key;
    draft = hex2hsv(cfg[key]);
    paintPicker();
    colorOpens++;
    pop.style.display = 'block';
    pop.style.transition = 'none';
    pop.style.opacity = '0';
    pop.style.transform = 'translateY(8px) scale(.9)';
    requestAnimationFrame(function () {
      pop.style.transition = 'opacity 200ms ease,transform 300ms ' + EASE;
      pop.style.opacity = '1';
      pop.style.transform = 'translateY(0) scale(1)';
      if (!reduced() && pop.animate) {
        pop.animate([
          { transform: 'translateY(8px) scale(.82,.92)' },
          { transform: 'translateY(0) scale(1.05,.95)', offset: .34 },
          { transform: 'translateY(0) scale(.98,1.03)', offset: .6 },
          { transform: 'translateY(0) scale(1.01,.99)', offset: .8 },
          { transform: 'translateY(0) scale(1)' }
        ], { duration: 440, easing: EASE });
      }
    });
    if (anchor) jelly(anchor);
  }
  function closeColor(instant) {
    if (!openColor) return;
    openColor = null;
    colorCloses++;
    if (instant || reduced() || !pop.animate) {
      pop.style.display = 'none';
      pop.style.opacity = '0';
      return;
    }
    pop.style.transition = 'opacity 300ms ease,transform 300ms ' + EASE;
    pop.style.opacity = '0';
    pop.style.transform = 'translateY(6px) scale(.88)';
    setTimeout(function () {
      if (!openColor) pop.style.display = 'none';
    }, 300);
  }
  ok.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!openColor) return;
    cfg[openColor] = hsv2hex(draft.h, draft.s, draft.v);
    okClicks++;
    renderColors();
    jelly(dots[openColor]);
    closeColor();
    queue();
  });
  pop.addEventListener('pointerdown', stop);

  // ---------- config push ----------
  function queue() {
    if (queued) clearTimeout(queued);
    queued = setTimeout(pushConfig, 120);
  }
  function pushConfig() {
    queued = 0;
    var url = 'ca://cfg?accuracy=' + cfg.accuracy +
      '&accuracyOn=' + (cfg.accuracyOn ? 1 : 0) +
      '&rating=' + cfg.rating +
      '&multi=' + (cfg.multi ? 1 : 0) +
      '&arrows=' + (cfg.arrows ? 1 : 0) +
      '&auto=' + (cfg.auto ? 1 : 0) +
      '&timing=' + (cfg.timing ? 1 : 0) +
      '&focusPause=' + (cfg.focusPause ? 1 : 0) +
      '&weakMoves=' + (cfg.weakMoves ? 1 : 0) +
      '&proctorGuard=' + (cfg.proctorGuard ? 1 : 0) +
      '&review=' + (cfg.review ? 1 : 0) +
      '&advantage=' + (cfg.advantage ? 1 : 0) +
      '&pure=' + (cfg.pure ? 1 : 0) +
      '&openings=' + (cfg.openings ? 1 : 0) +
      '&style=' + cfg.style +
      '&fromColor=' + encodeURIComponent(cfg.fromColor) +
      '&toColor=' + encodeURIComponent(cfg.toColor) +
      '&arrowColor=' + encodeURIComponent(cfg.arrowColor);
    lastConfigUrl = url;
    if (window.__caGuiNoNav) return;
    try { location.href = url; } catch (e) {}
  }

  // ---------- timing toast ----------
  var toast = el('div',
    'position:fixed;left:50%;bottom:19%;transform:translate(-50%,14px);z-index:2147483646;' +
    'display:none;align-items:center;gap:8px;padding:7px 12px 7px 7px;border-radius:999px;' +
    'background:rgba(18,20,26,.84);color:' + TEXT + ';' +
    '-webkit-backdrop-filter:blur(12px) saturate(140%);backdrop-filter:blur(12px) saturate(140%);' +
    'box-shadow:0 12px 30px rgba(0,0,0,.35);opacity:0;pointer-events:none;' +
    'font-family:Inter,"Segoe UI",system-ui,sans-serif;transition:opacity 220ms ease,transform 260ms ' + EASE + ';', null);
  var toastAvatar = el('img',
    'width:24px;height:24px;flex:none;object-fit:cover;border-radius:50%;' +
    'border:2px solid rgba(255,255,255,.85);box-shadow:0 3px 10px rgba(0,0,0,.35);', toast);
  toastAvatar.src = window.__caGuiAvatar || '';
  toastAvatar.alt = '';
  toastAvatar.draggable = false;
  var toastText = el('div',
    'font-size:12.5px;font-weight:500;color:' + TEXT + ';white-space:nowrap;', toast, '');
  if (!toast.parentNode) document.documentElement.appendChild(toast);

  function guiState() {
    try {
      return window.__ca && window.__ca.getGuiState ? window.__ca.getGuiState() : null;
    } catch (e) { return null; }
  }
  function showToast(txt) {
    if (toastText.textContent !== txt) toastText.textContent = txt;
    if (toastShown) return;
    toastShown = true;
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
    toast.style.display = 'flex';
    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translate(-50%,0)';
      if (!reduced() && toast.animate) {
        toast.animate([
          { opacity: 0, transform: 'translate(-50%,14px) scale(.94)' },
          { opacity: 1, transform: 'translate(-50%,-2px) scale(1.015)', offset: .7 },
          { opacity: 1, transform: 'translate(-50%,0) scale(1)' }
        ], { duration: 280, easing: EASE });
      }
    });
  }
  function hideToast() {
    if (!toastShown) return;
    toastShown = false;
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%,14px)';
    toastTimer = setTimeout(function () {
      toast.style.display = 'none';
      toastTimer = 0;
    }, 230);
  }

  setInterval(function () {
    var g = guiState();
    if (g && g.our && !g.auto && !g.proctor) {
      showToast('Лучшее время хода - через ' + g.delaySec + ' секунд.');
    } else {
      hideToast();
    }
    if (cfg.advantage) updateAdvantage();
    if (cfg.review) updateReviewBadge();
    if (openMenu === 'review') renderReview();
    if (openMenu === 'stats') renderStats();
  }, 240);

  // ---------- open / close / apply ----------
  function notifyNativeClose() {
    try {
      if (window.caHost && typeof caHost.closeGui === 'function') {
        caHost.closeGui();
        return;
      }
      if (!window.__caGuiNoNav) location.href = 'ca://close';
    } catch (e) {}
  }
  function open() {
    if (!root.parentNode) document.documentElement.appendChild(root);
    if (!toast.parentNode) document.documentElement.appendChild(toast);
    root.style.display = 'flex';
    clampPanelPos();
    closeMenus(null, true);
    closeColor(true);
    if (reduced() || !panel.animate) return;
    panel.animate([
      { opacity: 0, transform: panelTf(0, 18, .98) },
      { opacity: 1, transform: panelTf(0, 0, 1) }
    ], { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function close() {
    if (root.style.display === 'none') return;
    closeMenus(null, true);
    closeColor(true);
    var done = function () {
      root.style.display = 'none';
      notifyNativeClose();
    };
    if (reduced() || !panel.animate) { done(); return; }
    panel.animate([
      { opacity: 1, transform: panelTf(0, 0, 1) },
      { transform: panelTf(0, -3, 1.018), offset: .34 },
      { opacity: 0, transform: panelTf(0, 10, .94) }
    ], { duration: 300, easing: 'cubic-bezier(.4,0,.7,1)' }).onfinish = done;
  }

  function apply(c) {
    if (!c) return;
    if (typeof c.accuracy === 'number') cfg.accuracy = clamp(Math.round(c.accuracy), 30, 100);
    if (typeof c.accuracyOn === 'boolean') cfg.accuracyOn = c.accuracyOn;
    if (typeof c.rating === 'number') cfg.rating = clamp(Math.round(c.rating), 400, 2900);
    if (typeof c.multi === 'boolean') cfg.multi = c.multi;
    if (typeof c.auto === 'boolean') cfg.auto = c.auto;
    if (typeof c.timing === 'boolean') cfg.timing = c.timing;
    if (typeof c.focusPause === 'boolean') cfg.focusPause = c.focusPause;
    if (typeof c.weakMoves === 'boolean') cfg.weakMoves = c.weakMoves;
    if (typeof c.proctorGuard === 'boolean') cfg.proctorGuard = c.proctorGuard;
    if (typeof c.review === 'boolean') cfg.review = c.review;
    if (typeof c.advantage === 'boolean') cfg.advantage = c.advantage;
    if (typeof c.pure === 'boolean') cfg.pure = c.pure;
    if (typeof c.openings === 'boolean') cfg.openings = c.openings;
    if (typeof c.arrows === 'boolean') cfg.arrows = c.arrows;
    if (c.style === 'arrows' || c.style === 'squares') {
      cfg.style = c.style;
      cfg.arrows = cfg.style === 'arrows';
    }
    if (c.fromColor) cfg.fromColor = c.fromColor;
    if (c.toColor) cfg.toColor = c.toColor;
    if (c.arrowColor) cfg.arrowColor = c.arrowColor;
    paintRow('multi', cfg.multi);
    paintRow('auto', cfg.auto);
    paintRow('review', cfg.review);
    paintRow('advantage', cfg.advantage);
    paintRow('pure', cfg.pure);
    paintRow('openings', cfg.openings);
    paintAccuracy();
    renderSeg();
    renderColors();
    updateAdvantage();
    if (!cfg.review) hideReviewBadge();
  }

  closeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    close();
  });

  window.__caGui = {
    open: open,
    close: close,
    apply: apply,
    state: function () {
      return {
        cfg: {
          accuracy: cfg.accuracy, accuracyOn: cfg.accuracyOn, rating: cfg.rating,
          multi: cfg.multi, auto: cfg.auto, timing: cfg.timing, focusPause: cfg.focusPause,
          weakMoves: cfg.weakMoves, proctorGuard: cfg.proctorGuard,
          review: cfg.review, advantage: cfg.advantage,
          style: cfg.style, fromColor: cfg.fromColor, toColor: cfg.toColor, arrowColor: cfg.arrowColor
        },
        openMenu: openMenu, openColor: openColor,
        colorOpens: colorOpens, colorCloses: colorCloses, okClicks: okClicks,
        lastUrl: lastConfigUrl,
        boardReady: !!boardImg, boardYaw: boardYaw,
        panelX: Math.round(panelPos.x), panelY: Math.round(panelPos.y),
        panelDragging: !!panelDrag,
        visible: root.style.display !== 'none'
      };
    }
  };
  apply(cfg);
  document.documentElement.appendChild(root);
})();
