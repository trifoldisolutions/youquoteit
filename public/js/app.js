(function () {
  'use strict';

  var THEME_KEY = 'yqi-theme';
  var root = document.documentElement;

  function initThemeSwitcher() {
    var dots = document.querySelectorAll('.theme-dot');
    if (!dots.length) return;

    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved) root.setAttribute('data-theme', saved);

    function setActive(theme) {
      dots.forEach(function (dot) {
        dot.setAttribute('aria-pressed', dot.dataset.theme === theme ? 'true' : 'false');
      });
    }

    setActive(root.getAttribute('data-theme') || 'daylight');

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        var theme = dot.dataset.theme;
        root.setAttribute('data-theme', theme);
        setActive(theme);
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
      });
    });
  }

  // Reveals/removes text via textContent slicing so the browser's own line
  // wrapping is used — no per-letter <span> elements to fight with.
  function Typewriter(el, opts) {
    this.el = el;
    this.speed = (opts && opts.speed) || 32;
    this.jitter = (opts && opts.jitter) || 16;
    this.timer = null;
    this.erasing = false;
    this.erasingFullText = ''; // what an in-flight erase started from, for reverseErase()
  }

  Typewriter.prototype.type = function (text, onDone) {
    var self = this;
    clearTimeout(this.timer);
    this.erasing = false;
    this.el.textContent = '';
    this.el.classList.remove('is-done');
    this.el.classList.add('is-typing');

    var i = 0;
    function step() {
      i += 1;
      self.el.textContent = text.slice(0, i);
      if (i < text.length) {
        var delay = self.speed + (Math.random() * self.jitter - self.jitter / 2);
        self.timer = setTimeout(step, delay);
      } else {
        self.timer = null;
        self.el.classList.remove('is-typing');
        self.el.classList.add('is-done');
        if (onDone) onDone();
      }
    }
    self.timer = setTimeout(step, 120);
  };

  Typewriter.prototype.erase = function (onDone) {
    var self = this;
    clearTimeout(this.timer);
    var text = this.el.textContent;

    if (!text.length) {
      this.timer = null;
      this.erasing = false;
      if (onDone) onDone();
      return;
    }

    this.erasing = true;
    this.erasingFullText = text;
    this.el.classList.add('is-typing');
    this.el.classList.remove('is-done');

    var i = text.length;
    function step() {
      i -= 1;
      self.el.textContent = text.slice(0, Math.max(i, 0));
      if (i > 0) {
        self.timer = setTimeout(step, self.speed / 2);
      } else {
        self.timer = null;
        self.erasing = false;
        // Keep the caret blinking (slow, "idle" rate) through the blank
        // gap before the next quote starts typing, instead of vanishing.
        self.el.classList.remove('is-typing');
        self.el.classList.add('is-done');
        if (onDone) onDone();
      }
    }
    self.timer = setTimeout(step, self.speed / 2);
  };

  // Reverses an in-flight erase: stops erasing further and types the
  // remaining tail back in instead, restoring the text it was erasing
  // from — used so Stop never has to run an erase down to a blank block
  // just to retype the same thing from scratch afterward.
  Typewriter.prototype.reverseErase = function (onDone) {
    if (!this.erasing) return false;
    clearTimeout(this.timer);
    this.erasing = false;

    var self = this;
    var text = this.erasingFullText;
    var i = this.el.textContent.length;

    function step() {
      i += 1;
      self.el.textContent = text.slice(0, i);
      if (i < text.length) {
        var delay = self.speed + (Math.random() * self.jitter - self.jitter / 2);
        self.timer = setTimeout(step, delay);
      } else {
        self.timer = null;
        self.el.classList.remove('is-typing');
        self.el.classList.add('is-done');
        if (onDone) onDone();
      }
    }
    self.timer = setTimeout(step, self.speed);
    return true;
  };

  // Whether a character-by-character type or erase is currently mid-flight.
  Typewriter.prototype.isActive = function () {
    return this.timer !== null;
  };

  // Hard-stops whatever's mid-flight without finishing it or firing its
  // onDone — used by Next/Prev, which cut straight to the new quote instead
  // of waiting out the current type/erase.
  Typewriter.prototype.cancel = function () {
    clearTimeout(this.timer);
    this.timer = null;
    this.erasing = false;
  };

  Typewriter.prototype.isErasing = function () {
    return this.erasing;
  };

  // Reserves the box height the *final* text will need (however many lines
  // it wraps to) before a single character is typed. Because the element's
  // height is fixed up front, line 1 never has to shift up to make room for
  // line 2/3 as they appear — it just sits at the top of a box that was
  // already the right size.
  function reserveHeight(el, fullText) {
    var prevMinHeight = el.style.minHeight;
    var prevTransition = el.style.transition;

    // The min-height transition would otherwise apply to this reset too,
    // so a synchronous read right after setting '0px' still reports the
    // *old* min-height (the transition hasn't been committed for layout
    // yet) — measuring against the wrong baseline. Kill it for the
    // measurement, then restore it only for the final animated resize.
    el.style.transition = 'none';
    el.style.minHeight = '0px';
    el.textContent = fullText;
    var height = el.scrollHeight;
    el.textContent = '';
    el.style.minHeight = prevMinHeight;
    void el.offsetHeight;

    el.style.transition = prevTransition;
    el.style.minHeight = height + 'px';
  }

  function formatCompact(n) {
    try {
      return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
    } catch (e) {
      return String(n || 0);
    }
  }

  function initQuoteDeck() {
    var stage = document.getElementById('quote-stage');
    var textEl = document.getElementById('quote-text');
    var authorRowEl = document.getElementById('quote-author-row');
    var statsEl = document.getElementById('quote-stats');
    var authorEl = document.getElementById('quote-author');
    var likesEl = document.getElementById('quote-likes');
    var commentsEl = document.getElementById('quote-comments');
    var screenshotsEl = document.getElementById('quote-screenshots');
    var viewsEl = document.getElementById('quote-views');
    var dataScript = document.getElementById('quotes-data');
    if (!stage || !textEl || !dataScript) return;

    var quotes = [];
    try { quotes = JSON.parse(dataScript.textContent) || []; } catch (e) {}
    if (!quotes.length) return;

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var typewriter = new Typewriter(textEl, { speed: 45, jitter: 20 });
    var index = 0;
    var HOLD_MS = 7000;
    var BETWEEN_QUOTES_MS = 2000;
    // How many times the typing animation replays the same quote before
    // moving to the next one. Will become a user-facing setting later.
    var REPEAT_COUNT = 3;
    var repeatsLeft = REPEAT_COUNT;
    // Toggled by the loop button: locks autoplay onto the current quote,
    // retyping it forever instead of advancing after REPEAT_COUNT passes.
    // Manual prev/next still switch quotes freely — only the automatic
    // advance in scheduleNext() checks this.
    var loopCurrent = false;
    var advanceTimer = null;
    var betweenTimer = null;
    // Stop only cancels scheduling of the *next* step — an in-flight
    // type/erase animation is never interrupted mid-character, it always
    // finishes on its own first.
    var isPlaying = true;
    // Set by initPlayToggle(): called once a Stop click's in-flight
    // animation actually finishes and the deck has genuinely settled.
    var onSettled = null;

    function applyBackground(quote) {
      if (quote.bgImage) {
        stage.style.backgroundImage =
          'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.55)), url("' + quote.bgImage + '")';
        stage.style.backgroundSize = 'cover';
        stage.style.backgroundPosition = 'center';
        stage.classList.remove('quote-stage--fallback');
      } else {
        stage.style.backgroundImage = '';
        stage.style.backgroundSize = '';
        stage.style.backgroundPosition = '';
        stage.classList.add('quote-stage--fallback');
      }
    }

    function renderMeta(quote) {
      authorEl.textContent = quote.author || '';
      likesEl.textContent = formatCompact(quote.likes);
      commentsEl.textContent = formatCompact(quote.comments);
      screenshotsEl.textContent = formatCompact(quote.screenshots);
      viewsEl.textContent = formatCompact(quote.views);
    }

    // Author row (above the quote) and stats row (below it) show/hide
    // together — they're two separate blocks now that they sit on
    // opposite sides of the quote text.
    function setMetaVisible(visible) {
      var opacity = visible ? 1 : 0;
      authorRowEl.style.opacity = opacity;
      statsEl.style.opacity = opacity;
    }

    function scheduleNext() {
      clearTimeout(advanceTimer);
      if (!isPlaying) {
        if (onSettled) onSettled();
        return;
      }
      advanceTimer = setTimeout(function () {
        var isNewQuote = false;
        if (!loopCurrent) {
          repeatsLeft -= 1;
          isNewQuote = repeatsLeft <= 0;
          if (isNewQuote) {
            repeatsLeft = REPEAT_COUNT;
            index = (index + 1) % quotes.length;
          }
        }
        showQuote(index, !isNewQuote);
      }, HOLD_MS);
    }

    // isRepeat: same quote retyping (part of its REPEAT_COUNT cycle) vs.
    // actually advancing to a different quote. The author/meta block only
    // hides and reappears for a real quote change — it stays put across
    // repeats of the same quote.
    function showQuote(nextIndex, isRepeat) {
      var quote = quotes[nextIndex];
      applyBackground(quote);
      // Read by the screenshot export so it can source the *full* quote
      // text from data instead of whatever's live in the DOM — which, if
      // the typewriter hasn't finished, is only a partial string.
      stage.dataset.quoteIndex = nextIndex;

      function typeIn() {
        renderMeta(quote);
        reserveHeight(textEl, quote.text);
        // Show the author/meta block up front — it shouldn't wait for the
        // quote text to finish typing.
        setMetaVisible(true);
        if (reduceMotion) {
          textEl.textContent = quote.text;
          textEl.classList.add('is-done');
          scheduleNext();
        } else {
          typewriter.type(quote.text, scheduleNext);
        }
      }

      if (reduceMotion || !textEl.textContent) {
        typeIn();
        return;
      }

      typewriter.erase(function () {
        clearTimeout(betweenTimer);
        // The blank pause is only for switching to a different quote —
        // a same-quote repeat goes straight from erase into retyping.
        // (A Stop click mid-erase never reaches here at all — it reverses
        // the erase in place instead, see initPlayToggle's stopDeck.)
        if (isRepeat) {
          typeIn();
          return;
        }
        // The author/meta block stays on screen through the whole erase —
        // it's the last thing to disappear, not the first — and only
        // hides now, during the blank gap before the next quote types in.
        setMetaVisible(false);
        betweenTimer = setTimeout(typeIn, BETWEEN_QUOTES_MS);
      });
    }

    initPlayToggle();
    initNavButtons();
    initLoopButton();
    showQuote(index);

    // Repeat-one toggle: an accent-colored icon plus a small corner dot
    // mark the active state (no distinct "off" glyph exists in this icon
    // set for it), matching how the like icon reads active via color
    // rather than a swap.
    function initLoopButton() {
      var btn = document.getElementById('loop-btn');
      var dot = document.getElementById('loop-dot');
      if (!btn) return;

      btn.addEventListener('click', function () {
        loopCurrent = !loopCurrent;
        btn.setAttribute('aria-pressed', loopCurrent ? 'true' : 'false');
        btn.setAttribute('aria-label', loopCurrent ? 'Stop repeating this quote' : 'Repeat this quote');
        btn.classList.toggle('text-accent-500', loopCurrent);
        btn.classList.toggle('text-ink', !loopCurrent);
        if (dot) dot.classList.toggle('opacity-0', !loopCurrent);
      });
    }

    function initPlayToggle() {
      var btn = document.getElementById('play-toggle-btn');
      var icon = document.getElementById('play-toggle-icon');
      if (!btn || !icon) return;

      // Reflects the deck actually settling into a stopped state — the
      // icon only flips to "play" once there's genuinely nothing left
      // animating, not the instant Stop is clicked.
      function settleStopped() {
        btn.disabled = false;
        icon.setAttribute('icon', 'mynaui:play-solid');
        btn.setAttribute('aria-label', 'Play');
        btn.setAttribute('aria-pressed', 'false');
      }

      function stopDeck() {
        isPlaying = false;
        // Only cancel the idle waits (hold / blank gap) — nothing to
        // interrupt there, the screen isn't animating either way. A blank
        // block is never treated as "stopped" though: mid-erase reverses
        // in place (typing the erased tail back in) instead of finishing
        // the erase and retyping from scratch, and if it was already
        // sitting blank and idle (caught mid blank-gap) that retype gets
        // kicked off here instead. Either way the button stays disabled,
        // still showing the stop icon, until settleStopped() fires once a
        // complete quote is back on screen.
        clearTimeout(advanceTimer);
        clearTimeout(betweenTimer);

        if (typewriter.isErasing()) {
          btn.disabled = true;
          typewriter.reverseErase(function () {
            // Restores author/stats too, in case this was a real
            // quote-switch erase that had already hidden them.
            setMetaVisible(true);
            scheduleNext();
          });
        } else if (typewriter.isActive()) {
          btn.disabled = true;
        } else if (!textEl.textContent) {
          btn.disabled = true;
          showQuote(index, true);
        } else {
          // Already fully typed and idle (mid-hold) — nothing to wait for.
          settleStopped();
        }
      }

      function resume() {
        isPlaying = true;
        btn.disabled = false;
        icon.setAttribute('icon', 'mynaui:stop-solid');
        btn.setAttribute('aria-label', 'Stop');
        btn.setAttribute('aria-pressed', 'true');

        var quote = quotes[index];
        if (textEl.textContent === quote.text) {
          // Was sitting fully typed (mid-hold) — just carry on,
          // no need to retype anything.
          scheduleNext();
        } else {
          // Was mid-type, mid-erase, or blank (mid-gap) when it settled —
          // cleanly (re)type the current quote and resume from there.
          showQuote(index, true);
        }
      }

      onSettled = settleStopped;

      btn.addEventListener('click', function () {
        if (isPlaying) {
          stopDeck();
        } else {
          resume();
        }
      });
    }

    function initNavButtons() {
      var prevBtn = document.getElementById('prev-quote-btn');
      var nextBtn = document.getElementById('next-quote-btn');
      var prevIcon = document.getElementById('prev-quote-icon');
      var nextIcon = document.getElementById('next-quote-icon');
      if (!prevBtn && !nextBtn) return;

      var PREV_ICON = 'mynaui:skip-back-solid';
      var NEXT_ICON = 'mynaui:skip-forward-solid';
      var SPINNER_ICON = 'svg-spinners:6-dots-scale-middle';
      // Stand-in "fetch" delay so the pending spinner is actually visible —
      // a Promise microtask resolves before the next paint, so setting and
      // clearing pending in the same tick never rendered anything. Drop
      // this once quote lookup is a real request with its own latency.
      var PENDING_STAND_IN_MS = 250;

      // Disables both nav buttons (so clicks can't overlap) but only swaps
      // the spinner onto the one actually pressed — the other just sits
      // disabled with its normal icon. This is the seam the real request
      // will hang off once quote lookup goes async; today it's a no-op wait.
      function setPending(pending, activeBtn, activeIcon) {
        if (prevBtn) prevBtn.disabled = pending;
        if (nextBtn) nextBtn.disabled = pending;
        if (activeIcon) {
          activeIcon.setAttribute('icon', pending ? SPINNER_ICON : (activeBtn === prevBtn ? PREV_ICON : NEXT_ICON));
        }
      }

      // Cancels whatever's mid-flight, waits out the (currently instant)
      // quote fetch, then lets showQuote's normal quote-switch path erase
      // what's on screen before typing the target quote in — same
      // erase/pause/type transition autoplay uses, just aimed at an
      // explicit index instead of index + 1. Continues auto-advancing from
      // there if the deck was playing, or settles stopped if not.
      function jumpTo(newIndex, activeBtn, activeIcon) {
        clearTimeout(advanceTimer);
        clearTimeout(betweenTimer);
        typewriter.cancel();
        setPending(true, activeBtn, activeIcon);
        setTimeout(function () {
          setPending(false, activeBtn, activeIcon);
          index = newIndex;
          repeatsLeft = REPEAT_COUNT;
          showQuote(index, false);
        }, PENDING_STAND_IN_MS);
      }

      if (prevBtn) {
        prevBtn.addEventListener('click', function () {
          jumpTo((index - 1 + quotes.length) % quotes.length, prevBtn, prevIcon);
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          jumpTo((index + 1) % quotes.length, nextBtn, nextIcon);
        });
      }
    }
  }

  // Renders a 1080x1080 export of the brand name + the current quote
  // (author, text, stats) — everything in <main> — with the header's
  // nav icons and the transport-control footer left out entirely, by
  // building an off-screen clone instead of capturing the live page.
  function initScreenshotButton() {
    var btn = document.getElementById('screenshot-btn');
    var icon = document.getElementById('screenshot-icon');
    var stage = document.getElementById('quote-stage');
    var brandEl = document.getElementById('brand-name');
    var contentEl = document.getElementById('quote-content');
    var authorRowEl = document.getElementById('quote-author-row');
    var dataScript = document.getElementById('quotes-data');
    if (!btn || !icon || !stage || !brandEl || !contentEl || !authorRowEl) return;

    var quotes = [];
    try { quotes = (dataScript && JSON.parse(dataScript.textContent)) || []; } catch (e) {}

    var CAMERA_ICON = 'mynaui:image-solid';
    var SPINNER_ICON = 'svg-spinners:6-dots-scale-middle';
    var EXPORT_SIZE = 1080;
    // The live quote-text size is a vw-based clamp() — vw resolves against
    // the real browser viewport, not this offscreen 1080px box, so left
    // alone it renders far too large in the export. Fixed size instead.
    var EXPORT_QUOTE_FONT_SIZE = '2.5rem';

    // html2canvas's flexbox cross-axis centering (`items-center`) is
    // unreliable for rows mixing very differently-sized children — an
    // 18px icon next to a line of text renders close but visibly off.
    // `vertical-align: middle` on inline-block children is the classic
    // pre-flexbox centering trick and html2canvas reproduces it
    // accurately, so swap to it for these rows in the export clone only.
    function centerRowChildren(row, gapPx) {
      if (!row) return;
      row.style.display = 'block';
      row.style.whiteSpace = 'nowrap';
      Array.prototype.forEach.call(row.children, function (child, i) {
        child.style.display = 'inline-block';
        child.style.verticalAlign = 'middle';
        if (i > 0 && gapPx) child.style.marginLeft = gapPx + 'px';
      });
    }

    // For the author row specifically: inline vertical-align:middle (centers
    // against the ambient font's baseline/x-height), table-cell
    // vertical-align:middle (centers against the row's computed height) and
    // top:50%/translateY(-50%) (same, via transform) all still left the rule
    // sitting high — every one of them centers against some *computed* row
    // height that isn't matching the name text's actual visual center.
    // Pulling the rule out of flow here only sets up left/marginLeft; the
    // vertical position gets pinned separately, in pixels, once the clone is
    // attached to the document and its real layout can be measured directly
    // — see the getBoundingClientRect step below, right after appendChild.
    function centerAuthorRow(row, ruleWidthPx, gapPx) {
      if (!row) return;
      var rule = row.children[0];
      var name = row.children[1];
      if (!rule || !name) return;
      row.style.display = 'block';
      row.style.position = 'relative';
      name.style.display = 'inline-block';
      name.style.marginLeft = (ruleWidthPx + gapPx) + 'px';
      rule.style.position = 'absolute';
      rule.style.left = '0';
    }

    // <iconify-icon> renders its SVG into a shadow root, which cloneNode()
    // never copies (only light-DOM children clone) — so cloned stat icons
    // come through empty. Pull the already-rendered SVG out of each *live*
    // icon's shadow root and drop it into a plain, non-custom element in
    // the clone instead, in the same order the icons appear in both trees.
    function inlineIcons(liveRoot, cloneRoot) {
      var liveIcons = liveRoot.querySelectorAll('iconify-icon');
      var cloneIcons = cloneRoot.querySelectorAll('iconify-icon');
      for (var i = 0; i < cloneIcons.length; i++) {
        var liveIcon = liveIcons[i];
        var cloneIcon = cloneIcons[i];
        var size = (cloneIcon.getAttribute('width') || '18') + 'px';
        var span = document.createElement('span');
        span.className = cloneIcon.className;
        span.style.display = 'inline-flex';
        span.style.width = size;
        span.style.height = size;
        if (liveIcon && liveIcon.shadowRoot) {
          span.innerHTML = liveIcon.shadowRoot.innerHTML;
        }
        cloneIcon.replaceWith(span);
      }
    }

    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      if (typeof window.html2canvas !== 'function') return;

      btn.disabled = true;
      icon.setAttribute('icon', SPINNER_ICON);

      var capture = document.createElement('div');
      capture.className = stage.className;
      capture.style.position = 'fixed';
      capture.style.top = '0';
      capture.style.left = '-10000px';
      capture.style.width = EXPORT_SIZE + 'px';
      capture.style.height = EXPORT_SIZE + 'px';
      capture.style.display = 'flex';
      capture.style.flexDirection = 'column';
      capture.style.backgroundImage = stage.style.backgroundImage;
      capture.style.backgroundSize = stage.style.backgroundSize;
      capture.style.backgroundPosition = stage.style.backgroundPosition;

      // Built by hand instead of cloning brandEl: html2canvas's text layout
      // kept wrapping the accent-colored "." onto its own line whenever it
      // sat nested inside the name span with a different color — a known
      // class of html2canvas bugs with mixed-color inline runs. Two plain
      // sibling spans (no nesting, no color change mid-element) render
      // reliably as a single line instead.
      var brandWrap = document.createElement('div');
      brandWrap.style.padding = '56px 0 0';
      brandWrap.style.textAlign = 'center';
      brandWrap.style.whiteSpace = 'nowrap';

      var brandNameEl = document.createElement('span');
      brandNameEl.className = 'font-display text-xl text-accent-500 sm:text-2xl';
      brandNameEl.style.display = 'inline-block';
      brandNameEl.textContent = 'YouQuoteIt';

      var brandDotEl = document.createElement('span');
      brandDotEl.className = 'font-display text-xl text-ink sm:text-2xl';
      brandDotEl.style.display = 'inline-block';
      brandDotEl.textContent = '.';

      brandWrap.appendChild(brandNameEl);
      brandWrap.appendChild(brandDotEl);

      var contentWrap = document.createElement('div');
      contentWrap.style.flex = '1';
      contentWrap.style.display = 'flex';
      contentWrap.style.alignItems = 'center';
      contentWrap.style.justifyContent = 'center';
      contentWrap.style.padding = '0 80px';

      var contentClone = contentEl.cloneNode(true);
      // The live nodes may be mid-animation (still fading in, or the
      // caret blinking) when this fires — force a clean, fully-visible,
      // caret-free snapshot regardless of what's on screen right now.
      contentClone.style.opacity = '1';
      var authorClone = contentClone.querySelector('#quote-author-row');
      var statsClone = contentClone.querySelector('#quote-stats');
      var textClone = contentClone.querySelector('#quote-text');
      if (authorClone) authorClone.style.opacity = '1';
      if (statsClone) statsClone.style.opacity = '1';
      if (textClone) {
        textClone.classList.remove('is-typing', 'is-done');
        textClone.style.fontSize = EXPORT_QUOTE_FONT_SIZE;
        // The live min-height was reserved for the larger, viewport-relative
        // size — clear it so the box doesn't leave a stale gap below the
        // now-smaller text. The author row above stays exactly where the
        // flex column's own centering puts it, so it's still centered over
        // its own row regardless of how tall the quote block ends up.
        textClone.style.minHeight = '';
      }
      // The clone otherwise carries whatever's live in the DOM — which, if
      // the typewriter is still mid-animation, is only a partial string
      // (or the meta hidden mid-transition). Overwrite with the full quote
      // from data so the export is never a half-typed sentence.
      var exportQuote = quotes[parseInt(stage.dataset.quoteIndex, 10)] || quotes[0];
      if (exportQuote) {
        if (textClone) textClone.textContent = exportQuote.text;
        var authorTextClone = contentClone.querySelector('#quote-author');
        if (authorTextClone) authorTextClone.textContent = exportQuote.author || '';
        var viewsClone = contentClone.querySelector('#quote-views');
        var likesClone = contentClone.querySelector('#quote-likes');
        var commentsClone = contentClone.querySelector('#quote-comments');
        var screenshotsClone = contentClone.querySelector('#quote-screenshots');
        if (viewsClone) viewsClone.textContent = formatCompact(exportQuote.views);
        if (likesClone) likesClone.textContent = formatCompact(exportQuote.likes);
        if (commentsClone) commentsClone.textContent = formatCompact(exportQuote.comments);
        if (screenshotsClone) screenshotsClone.textContent = formatCompact(exportQuote.screenshots);
      }
      inlineIcons(contentEl, contentClone);
      // Author row: measured from the live rule/row rather than hardcoded,
      // so this keeps working if the rule's width or the row's gap ever
      // change in the markup/CSS.
      if (authorClone) {
        var liveRule = authorRowEl.children[0];
        var ruleWidthPx = liveRule ? liveRule.getBoundingClientRect().width : 120;
        var rowGapPx = parseFloat(window.getComputedStyle(authorRowEl).columnGap) || 16;
        centerAuthorRow(authorClone, ruleWidthPx, rowGapPx);
      }
      // Each stat's icon+number pair first (6px gap), then the row of
      // stats itself (16px gap) — inner before outer, so the outer
      // pass's inline-block override on each <button> lands last.
      if (statsClone) {
        Array.prototype.forEach.call(statsClone.querySelectorAll('button'), function (button) {
          centerRowChildren(button, 6);
        });
        centerRowChildren(statsClone, 16);
      }
      contentWrap.appendChild(contentClone);

      var timestamp = document.createElement('div');
      timestamp.className = 'text-ink-soft';
      timestamp.style.textAlign = 'center';
      timestamp.style.fontSize = '0.85rem';
      timestamp.style.padding = '0 0 40px';
      timestamp.textContent = new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date());

      capture.appendChild(brandWrap);
      capture.appendChild(contentWrap);
      capture.appendChild(timestamp);
      document.body.appendChild(capture);

      // Only measurable once actually attached (getBoundingClientRect is
      // zeroed before that) — pin the rule's top, in real pixels, to the
      // exact vertical center of the name text's own rendered box. No
      // computed-row-height heuristic left for html2canvas to get wrong;
      // it just replays this same absolute pixel position.
      if (authorClone) {
        var ruleEl = authorClone.children[0];
        var nameEl = authorClone.children[1];
        if (ruleEl && nameEl) {
          var nameRect = nameEl.getBoundingClientRect();
          var rowRect = authorClone.getBoundingClientRect();
          var ruleRect = ruleEl.getBoundingClientRect();
          ruleEl.style.top = ((nameRect.top - rowRect.top) + nameRect.height / 2 - ruleRect.height / 2) + 'px';
        }
      }

      window.html2canvas(capture, {
        width: EXPORT_SIZE,
        height: EXPORT_SIZE,
        scale: 1,
        backgroundColor: null,
        useCORS: true
      })
        .then(function (canvas) {
          var link = document.createElement('a');
          link.download = 'youquoteit-quote.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        })
        .catch(function (err) {
          console.error('Screenshot failed:', err);
        })
        .finally(function () {
          document.body.removeChild(capture);
          icon.setAttribute('icon', CAMERA_ICON);
          btn.disabled = false;
        });
    });
  }

  function initFullscreenButton() {
    var btn = document.getElementById('fullscreen-btn');
    var icon = document.getElementById('fullscreen-icon');
    var stage = document.getElementById('quote-stage');
    if (!btn || !icon || !stage) return;

    var MAXIMIZE_ICON = 'mynaui:maximize';
    var MINIMIZE_ICON = 'mynaui:minimize';
    var ZEN_CLASS = 'is-zen';

    // The real Fullscreen API is what drives zen mode whenever it's
    // available, but it's silently rejected in plenty of real contexts
    // (embedded/iframe previews without the fullscreen permission, some
    // in-app browsers) — a bare "requestFullscreen().catch(() => {})"
    // leaves the button doing nothing with no visible feedback there.
    // The `is-zen` class is the actual source of truth for the CSS: it's
    // applied optimistically on click and left in place even when the
    // browser API call fails, so the page-level zen layout always kicks
    // in. When the API *does* succeed, fullscreenchange below just keeps
    // this class in sync with it.
    function isZen() {
      return stage.classList.contains(ZEN_CLASS);
    }

    function syncState() {
      var active = isZen();
      icon.setAttribute('icon', active ? MINIMIZE_ICON : MAXIMIZE_ICON);
      btn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    // Only reacts to genuine fullscreen transitions (Esc, browser chrome,
    // this button's own successful request) — never fires for the
    // CSS-only fallback, so that path is untouched by this listener.
    document.addEventListener('fullscreenchange', function () {
      stage.classList.toggle(ZEN_CLASS, document.fullscreenElement === stage);
      syncState();
    });

    function exitZen() {
      stage.classList.remove(ZEN_CLASS);
      if (document.fullscreenElement === stage && document.exitFullscreen) {
        document.exitFullscreen();
      }
      syncState();
    }

    btn.addEventListener('click', function () {
      if (isZen()) {
        exitZen();
      } else {
        stage.classList.add(ZEN_CLASS);
        syncState();
        if (stage.requestFullscreen) {
          stage.requestFullscreen().catch(function () {});
        }
      }
    });

    // Real fullscreen's own Esc handling only fires fullscreenchange when
    // requestFullscreen actually succeeded — in the CSS-only fallback
    // (zen mode's own footer button included, since it's hidden along
    // with the rest of #quote-footer) there is otherwise no way back out.
    // This is the only exit path for that case, so it's handled here
    // regardless of which mode is active.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isZen()) exitZen();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initThemeSwitcher();
    initQuoteDeck();
    initScreenshotButton();
    initFullscreenButton();
  });
})();
