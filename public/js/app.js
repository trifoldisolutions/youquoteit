(function () {
  'use strict';

  var THEME_KEY = 'yqi-theme';
  // Same order as src/themes.json (and the [data-theme] blocks in
  // src/input.css) — both the (not yet wired up) .theme-dot menu and the
  // double-click cycler below step through this order.
  var THEMES = ['default', 'dark_default', 'buttercup', 'royal', 'dazzle', 'blackn', 'aqua', 'watermelon'];
  var root = document.documentElement;

  function setActiveDots(theme) {
    document.querySelectorAll('.theme-dot').forEach(function (dot) {
      dot.setAttribute('aria-pressed', dot.dataset.theme === theme ? 'true' : 'false');
    });
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    setActiveDots(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function initThemeSwitcher() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved) root.setAttribute('data-theme', saved);
    setActiveDots(root.getAttribute('data-theme') || 'default');

    document.querySelectorAll('.theme-dot').forEach(function (dot) {
      dot.addEventListener('click', function () {
        applyTheme(dot.dataset.theme);
      });
    });
  }

  // Double-clicking the stage cycles themes: the left half steps back to
  // the previous theme, the right half steps forward to the next one,
  // wrapping around THEMES. Ignores double-clicks on buttons/links so the
  // header, footer, and author-row controls keep their own behavior.
  // Disabled entirely while the current quote has a background photo
  // (the .on-bg-image class applyBackground toggles on this same element)
  // — that mode already forces white text for contrast against the photo
  // regardless of theme, so cycling theme wouldn't change how it reads;
  // switching only makes sense for the flat, theme-colored background.
  function initThemeCycler() {
    var stage = document.getElementById('quote-stage');
    if (!stage) return;

    stage.addEventListener('dblclick', function (e) {
      if (stage.classList.contains('on-bg-image')) return;
      if (e.target.closest('button, a, [role="button"], #comments-backdrop')) return;
      var rect = stage.getBoundingClientRect();
      var xRatio = (e.clientX - rect.left) / rect.width;
      // The middle 40% is where the quote itself lives — only the outer
      // 30% on each edge cycles the theme, so double-clicking the content
      // to interact with it can't accidentally change it.
      if (xRatio > 0.3 && xRatio < 0.7) return;
      var goingBack = xRatio <= 0.3;
      var current = THEMES.indexOf(root.getAttribute('data-theme'));
      if (current === -1) current = 0;
      var next = goingBack
        ? (current - 1 + THEMES.length) % THEMES.length
        : (current + 1) % THEMES.length;
      applyTheme(THEMES[next]);
    });
  }

  // Pinned categories (Tag names the reader picked in the header's
  // Categories popup — initCategoriesPopup, further down) drive quote
  // recommendations (initQuoteDeck's refreshRecommendations, below) as well
  // as backing that popup's own badges. Client-side only, like THEME_KEY
  // above — no account-level persistence exists for this yet.
  var PINNED_TAGS_KEY = 'yqi_pinned_tags';

  function loadPinnedTags() {
    try {
      var parsed = JSON.parse(localStorage.getItem(PINNED_TAGS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function savePinnedTags(tags) {
    try { localStorage.setItem(PINNED_TAGS_KEY, JSON.stringify(tags)); } catch (e) {}
  }

  // Toast notifications: a small bottom-center ribbon (#toast-container in
  // the view) for one-off confirmations (Saved, Reported, etc). Newest
  // toast is appended last, so with the container's plain flex-col it
  // naturally lands closest to the bottom anchor while older ones get
  // pushed upward above it.
  var TOAST_DURATION = 8000;

  function showToast(message, opts) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    opts = opts || {};
    var duration = opts.duration || TOAST_DURATION;
    // 'error' reuses the same text-red-600 this app already uses for the
    // username-taken hint and comment-limit counter — not a new color.
    var isError = opts.tone === 'error';
    var iconName = opts.icon || (isError ? 'mynaui:danger-circle-solid' : null);

    var toast = document.createElement('div');
    toast.className = 'toast pointer-events-auto relative flex w-full max-w-sm items-center ' +
      'gap-3 overflow-hidden rounded-xl border border-ink-10 bg-surface-70 py-3 pl-4 pr-3 text-sm ' +
      'text-ink opacity-0 shadow-lg backdrop-blur transition translate-y-2';
    toast.setAttribute('role', 'status');

    if (iconName) {
      // 20px rather than the close button's 14px: at 18px and under, this
      // icon's fine detail (the "!" cut out of danger-circle-solid, etc)
      // anti-aliases into an indistinct blob instead of a readable glyph.
      var iconEl = document.createElement('iconify-icon');
      iconEl.setAttribute('icon', iconName);
      iconEl.setAttribute('width', '20');
      iconEl.className = 'shrink-0' + (isError ? ' text-red-600' : '');
      toast.appendChild(iconEl);
    }

    var messageEl = document.createElement('span');
    messageEl.className = 'flex-1 select-none cursor-default' + (isError ? ' text-red-600' : '');
    messageEl.textContent = message;
    toast.appendChild(messageEl);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full ' +
      'text-ink transition hover:bg-ink-15';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.innerHTML = '<iconify-icon icon="mynaui:x" width="14"></iconify-icon>';
    toast.appendChild(closeBtn);

    var progress = document.createElement('span');
    progress.className = 'toast-progress pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left';
    progress.style.animationDuration = duration + 'ms';
    progress.setAttribute('aria-hidden', 'true');
    toast.appendChild(progress);

    container.appendChild(toast);

    var dismissed = false;
    var timer = null;
    var remaining = duration;
    var startedAt = 0;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }

    function armTimer(ms) {
      startedAt = Date.now();
      timer = setTimeout(dismiss, ms);
    }

    // Hovering freezes the countdown: the visual bar pauses on its own via
    // the `.toast:hover` CSS rule, and this keeps the real dismiss timer in
    // lockstep by re-arming it with only the time that was left.
    toast.addEventListener('mouseenter', function () {
      if (dismissed) return;
      clearTimeout(timer);
      remaining -= Date.now() - startedAt;
    });
    toast.addEventListener('mouseleave', function () {
      if (dismissed) return;
      armTimer(Math.max(remaining, 0));
    });

    closeBtn.addEventListener('click', dismiss);

    // Force a reflow so the enter transition (opacity/translate) actually
    // runs instead of the toast appearing already in its final state.
    void toast.offsetWidth;
    toast.classList.remove('opacity-0', 'translate-y-2');

    armTimer(duration);

    return { dismiss: dismiss };
  }

  // Rough QWERTY adjacency, used to fabricate a plausible "fat-finger" typo
  // instead of a random unrelated letter.
  var QWERTY_NEIGHBORS = {
    a: 'sqz', b: 'vghn', c: 'xdfv', d: 'serfcx', e: 'wsdr', f: 'drtgvc',
    g: 'ftyhbv', h: 'gyujnb', i: 'ujko', j: 'huikmn', k: 'jiolm', l: 'kop',
    m: 'njk', n: 'bhjm', o: 'iklp', p: 'ol', q: 'wa', r: 'edft', s: 'awedxz',
    t: 'rfgy', u: 'yhji', v: 'cfgb', w: 'qase', x: 'zsdc', y: 'tghu', z: 'asx'
  };

  function randomTypoChar(ch) {
    var lower = ch.toLowerCase();
    var neighbors = QWERTY_NEIGHBORS[lower];
    var pick = neighbors
      ? neighbors.charAt(Math.floor(Math.random() * neighbors.length))
      : 'aeiou'.charAt(Math.floor(Math.random() * 5));
    return ch === lower ? pick : pick.toUpperCase();
  }

  // The quote is split into pre-measured *lines* — found by letting the
  // browser wrap the complete text once and reading back, per character,
  // which line it landed on (via Range.getClientRects()) — joined by real
  // <br> elements. Each line is then typed by growing its own text node,
  // exactly like a plain textContent typewriter, so text-align:center
  // still grows that line outward from its middle as it's typed. Because
  // a line's wrap point was already decided from its complete text before
  // typing began, a growing partial line can never itself need to wrap
  // further — so no word ever jumps to a different line mid-type, while
  // the from-center growth per line is preserved. The caret is a real
  // element, walked to sit right after whichever line is currently active.
  function Typewriter(el, opts) {
    this.el = el;
    this.speed = (opts && opts.speed) || 32;
    this.jitter = (opts && opts.jitter) || 16;
    // Per-quote odds of throwing in one thinking-pause and/or a fat-finger
    // typo that gets noticed, backspaced, and corrected — so most quotes
    // type cleanly but every so often one feels a little more human.
    // typoChance is also re-rolled for a 2nd and 3rd typo on the same quote
    // (see MAX_TYPOS in type()), so it doubles as "how likely is one more".
    this.pauseChance = (opts && opts.pauseChance != null) ? opts.pauseChance : 0.35;
    this.typoChance = (opts && opts.typoChance != null) ? opts.typoChance : 0.25;
    this.timer = null;
    this.erasing = false;

    this.caretEl = document.createElement('span');
    this.caretEl.className = 'typewriter-caret';
    this.caretEl.setAttribute('aria-hidden', 'true');

    this.fullText = '';
    this.lines = [];       // full text of each pre-measured line
    this.lineNodes = [];   // one growable text node per line
    this.brNodes = [];     // separators between lines (length = lines.length - 1)
    this.lineIndex = 0;    // which line is currently being typed/erased
    this.charIndex = 0;    // how many characters of that line are revealed
    this.revealed = 0;     // total revealed characters across all lines
    // A single substituted character mid-typo: { lineIndex, offset, char }.
    // Kept separate from `lines` (the real text) so clearing it snaps the
    // display straight back to correct without re-deriving anything.
    this.override = null;

    // Bookkeeping behind pause()/resume(): _sched() records whichever
    // callback+delay it was last asked to run so pause() can freeze it
    // mid-wait (by delay remaining, not just "cancelled") and resume()
    // can put it back exactly where it was instead of restarting it.
    this._pendingFn = null;
    this._dueAt = 0;
    this._paused = false;
    this._pausedRemaining = null;
  }

  // Clearing a finished quote is a brisk wipe, not a careful backspace —
  // noticeably quicker than typing, with a little variance so it doesn't
  // read as a flat, mechanical sprint.
  Typewriter.prototype.eraseDelay = function () {
    return this.speed * 0.35 + Math.random() * this.jitter * 0.3;
  };

  // Backspacing to a typo isn't the same brisk clear-the-line erase —
  // it's a deliberate one-character-at-a-time correction, so it runs
  // slower than typing pace instead of eraseDelay()'s quicker rate.
  Typewriter.prototype.typoEraseDelay = function () {
    return this.speed * 1.5 + (Math.random() * this.jitter - this.jitter / 2);
  };

  // The character right after a typo's fixed is typed noticeably slower
  // than normal — settling back into a rhythm — instead of snapping right
  // back to full speed, which read as the animation rushing to catch up.
  Typewriter.prototype.resumeAfterFixDelay = function () {
    return this.speed * 1.8 + Math.random() * this.jitter;
  };

  // Renders `text` into the (already in-page) element and reads back which
  // line each character landed on, via the position of its own 1-char
  // Range — i.e. whatever the browser's normal wrapping would do anyway.
  Typewriter.prototype._measureLines = function (text) {
    this.el.textContent = text;
    var node = this.el.firstChild;
    var lines = [''];
    if (node) {
      var range = document.createRange();
      var lastTop = null;
      for (var idx = 0; idx < text.length; idx++) {
        range.setStart(node, idx);
        range.setEnd(node, idx + 1);
        var rects = range.getClientRects();
        var top = rects.length ? Math.round(rects[0].top) : lastTop;
        if (lastTop !== null && top !== null && Math.abs(top - lastTop) > 1) lines.push('');
        if (top !== null) lastTop = top;
        lines[lines.length - 1] += text.charAt(idx);
      }
    }
    this.el.textContent = '';
    return lines;
  };

  // Rebuilds the line/<br> structure for a new quote and resets all
  // reveal state back to blank.
  Typewriter.prototype._setText = function (text) {
    this.fullText = text;
    this.lines = this._measureLines(text);
    this.lineNodes = [];
    this.brNodes = [];
    this.el.textContent = '';
    for (var idx = 0; idx < this.lines.length; idx++) {
      var node = document.createTextNode('');
      this.lineNodes.push(node);
      this.el.appendChild(node);
      if (idx < this.lines.length - 1) {
        var br = document.createElement('br');
        this.brNodes.push(br);
        this.el.appendChild(br);
      }
    }
    this.el.appendChild(this.caretEl);
    this.lineIndex = 0;
    this.charIndex = 0;
    this.revealed = 0;
    this.override = null;
    this._positionCaret();
  };

  // Moves the caret to sit right after the currently-active line.
  Typewriter.prototype._positionCaret = function () {
    this.el.insertBefore(this.caretEl, this.brNodes[this.lineIndex] || null);
  };

  // Writes the current line's node value from its real text plus, if one
  // is still pending, the substituted typo character.
  Typewriter.prototype._renderLine = function () {
    var line = this.lines[this.lineIndex];
    var text = line.slice(0, this.charIndex);
    var o = this.override;
    if (o && o.lineIndex === this.lineIndex && o.offset < this.charIndex) {
      text = text.slice(0, o.offset) + o.char + text.slice(o.offset + 1);
    }
    this.lineNodes[this.lineIndex].nodeValue = text;
  };

  // Advances the reveal by exactly one character, rolling onto the next
  // line once the current one is complete. `overrideChar`, if given,
  // substitutes for the real character at this one position until
  // `override` is cleared (see the typo flow in type()).
  Typewriter.prototype._revealNext = function (overrideChar) {
    if (overrideChar != null) this.override = { lineIndex: this.lineIndex, offset: this.charIndex, char: overrideChar };
    this.charIndex += 1;
    this.revealed += 1;
    this._renderLine();
    if (this.charIndex >= this.lines[this.lineIndex].length && this.lineIndex < this.lines.length - 1) {
      this.lineIndex += 1;
      this.charIndex = 0;
      this._positionCaret();
    }
  };

  // Erases exactly one character, rolling back onto the end of the
  // previous line once the current one is empty.
  Typewriter.prototype._hidePrev = function () {
    if (this.revealed <= 0) return;
    if (this.charIndex === 0) {
      this.lineIndex -= 1;
      this.charIndex = this.lines[this.lineIndex].length;
      this._positionCaret();
    }
    this.charIndex -= 1;
    this.revealed -= 1;
    this._renderLine();
  };

  // Whether nothing (or nothing anymore) is showing — true both before the
  // very first quote ever loads and after erase() has fully cleared one.
  Typewriter.prototype.isBlank = function () {
    return this.revealed === 0;
  };

  // Whether `text` is both what's currently loaded and fully revealed.
  Typewriter.prototype.isFullyTyped = function (text) {
    return this.fullText === text && this.revealed === this.fullText.length;
  };

  Typewriter.prototype.type = function (text, onDone) {
    var self = this;
    clearTimeout(this.timer);
    this.erasing = false;
    this._paused = false;
    this._pausedRemaining = null;
    this._setText(text);
    this.el.classList.remove('is-done');
    this.el.classList.add('is-typing');

    // Roll once per quote for where (if anywhere) a pause or typo lands,
    // rather than checking odds on every single keystroke.
    function pickSpot() {
      return 2 + Math.floor(Math.random() * (text.length - 3));
    }

    // A quote can carry more than one typo, but each additional one only
    // gets rolled if the previous one landed — so most quotes stay clean,
    // occasionally one slips through, and two or three is rare (typoChance
    // to the power of how many have already happened). Spots are kept far
    // enough apart (MIN_GAP) that each reads as its own distinct mistake
    // rather than a stutter, and are found in strictly increasing order so
    // they never overlap.
    var MAX_TYPOS = 3;
    var MIN_GAP = 6;
    var typos = []; // [{ pos, noticePos, phase }] ascending by pos; phase: 1 pending, 2 fixed
    var cursor = 2;
    for (var t = 0; t < MAX_TYPOS && text.length > 6; t++) {
      if (Math.random() >= self.typoChance) break;
      if (text.length - 3 - cursor < MIN_GAP) break; // not enough text left to sell another one
      var pos = cursor + Math.floor(Math.random() * (text.length - 3 - cursor));
      // The typo isn't caught the instant it's typed — a few more (correct)
      // characters go down first, same as a real typo, before it's noticed.
      var notice = Math.min(pos + 2 + Math.floor(Math.random() * 4), text.length - 1);
      if (notice <= pos) break;
      typos.push({ pos: pos, noticePos: notice, phase: 1 });
      cursor = notice + MIN_GAP;
    }
    var typoIdx = 0; // index into typos[] of the next (or currently active) typo

    var pauseAt = (text.length > 6 && Math.random() < self.pauseChance) ? pickSpot() : -1;
    // Don't let the thinking-pause land inside any typo's unnoticed stretch.
    for (var pIdx = 0; pIdx < typos.length; pIdx++) {
      if (pauseAt >= typos[pIdx].pos && pauseAt <= typos[pIdx].noticePos) { pauseAt = -1; break; }
    }

    var i = 0;
    function step() {
      i += 1;
      var current = typos[typoIdx];

      if (current && current.phase === 1 && i === current.pos) {
        var wrongChar = randomTypoChar(self.lines[self.lineIndex].charAt(self.charIndex));
        self._revealNext(wrongChar);
        self.timer = self._sched(step, self.speed + Math.random() * self.jitter);
        return;
      }

      if (current && current.phase === 1 && i > current.pos) {
        self._revealNext();
        if (i === current.noticePos) {
          // Beat of "hm, that's wrong" before backspacing to the mistake.
          self.timer = self._sched(function () { eraseToTypo(current); }, 2000);
          return;
        }
        self.timer = self._sched(step, self.speed + (Math.random() * self.jitter - self.jitter / 2));
        return;
      }

      self._revealNext();
      if (i < text.length) {
        var delay = self.speed + (Math.random() * self.jitter - self.jitter / 2);
        if (i === pauseAt) delay += 2000;
        self.timer = self._sched(step, delay);
      } else {
        self.timer = null;
        self.el.classList.remove('is-typing');
        self.el.classList.add('is-done');
        if (onDone) onDone();
      }
    }

    // Backspaces from the notice point all the way back to (and including)
    // the wrong character, restores the real character underneath it, then
    // hands off to step() to retype it and continue on from there —
    // catching back up to where it had actually gotten to.
    function eraseToTypo(typo) {
      function eraseStep() {
        self._hidePrev();
        if (self.revealed > typo.pos - 1) {
          self.timer = self._sched(eraseStep, self.typoEraseDelay());
        } else {
          self.override = null;
          i = typo.pos - 1;
          typo.phase = 2;
          typoIdx += 1;
          self.timer = self._sched(step, self.resumeAfterFixDelay());
        }
      }
      self.timer = self._sched(eraseStep, self.typoEraseDelay());
    }

    self.timer = self._sched(step, 120);
  };

  Typewriter.prototype.erase = function (onDone) {
    var self = this;
    clearTimeout(this.timer);
    this._paused = false;
    this._pausedRemaining = null;

    if (this.isBlank()) {
      this.timer = null;
      this.erasing = false;
      if (onDone) onDone();
      return;
    }

    this.erasing = true;
    this.el.classList.add('is-typing');
    this.el.classList.remove('is-done');

    function step() {
      self._hidePrev();
      if (self.revealed > 0) {
        self.timer = self._sched(step, self.eraseDelay());
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
    self.timer = self._sched(step, self.eraseDelay());
  };

  // Reverses an in-flight erase: stops erasing further and reveals the
  // remaining tail back in instead, restoring the text it was erasing
  // from — used so Stop never has to run an erase down to a blank block
  // just to retype the same thing from scratch afterward.
  Typewriter.prototype.reverseErase = function (onDone) {
    if (!this.erasing) return false;
    clearTimeout(this.timer);
    this.erasing = false;
    this._paused = false;
    this._pausedRemaining = null;

    var self = this;
    function step() {
      self._revealNext();
      if (self.revealed < self.fullText.length) {
        var delay = self.speed + (Math.random() * self.jitter - self.jitter / 2);
        self.timer = self._sched(step, delay);
      } else {
        self.timer = null;
        self.el.classList.remove('is-typing');
        self.el.classList.add('is-done');
        if (onDone) onDone();
      }
    }
    self.timer = self._sched(step, self.speed);
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
    this._paused = false;
    this._pendingFn = null;
    this._pausedRemaining = null;
  };

  // Every internal setTimeout goes through here instead of straight to the
  // global one, so pause() always knows which callback was waiting and how
  // long was left on it.
  Typewriter.prototype._sched = function (fn, delay) {
    this._pendingFn = fn;
    this._dueAt = Date.now() + delay;
    return setTimeout(fn, delay);
  };

  // Freezes whatever's mid-flight (typing, erasing, a typo's noticing-pause
  // or backspace-and-refix) without losing its place — used when the tab
  // goes into the background so a reader never comes back to a quote that
  // finished typing itself out, or several quotes deep, while unseen.
  Typewriter.prototype.pause = function () {
    if (this._paused) return;
    this._paused = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this._pausedRemaining = Math.max(0, this._dueAt - Date.now());
    } else {
      this._pausedRemaining = null;
    }
  };

  // Puts a paused timer back exactly where pause() froze it, waiting out
  // only whatever delay was left rather than restarting it.
  Typewriter.prototype.resume = function () {
    if (!this._paused) return;
    this._paused = false;
    if (this._pausedRemaining != null) {
      this.timer = this._sched(this._pendingFn, this._pausedRemaining);
    }
    this._pausedRemaining = null;
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
    var authorMetaEl = document.getElementById('quote-author-meta');
    var likesEl = document.getElementById('quote-likes');
    var commentsEl = document.getElementById('quote-comments');
    var commentsPanelCountEl = document.getElementById('comments-panel-count');
    var debugTagsEl = document.getElementById('quote-debug-tags');
    var likeBtn = document.getElementById('quote-like-btn');
    var dislikeBtn = document.getElementById('quote-dislike-btn');
    var likeIcon = document.getElementById('quote-like-icon');
    var dislikeIcon = document.getElementById('quote-dislike-icon');
    var bgCreditEl = document.getElementById('quote-bg-credit');
    var bgCreditAuthorEl = document.getElementById('quote-bg-credit-author');
    var dataScript = document.getElementById('quotes-data');
    if (!stage || !textEl || !dataScript) return;

    var quotes = [];
    try { quotes = JSON.parse(dataScript.textContent) || []; } catch (e) {}
    if (!quotes.length) return;

    // The ever-growing pool of every quote loaded so far (this initial
    // sample, plus anything refreshRecommendations fetches later). `quotes`
    // itself becomes the active *playback* queue — the whole pool with no
    // pins, or just the matches once any category is pinned — see
    // buildActiveQueue/refreshRecommendations further down.
    var allQuotes = quotes.slice();

    // Personalizes the initial queue using whatever's already pinned from a
    // previous visit — refreshRecommendations (below, kicked off once the
    // deck starts) is what pulls in fresh matches from the server; this is
    // just the instant, synchronous part so first paint never waits on a
    // network round trip.
    quotes = buildActiveQueue(loadPinnedTags().map(function (t) { return t.name; }), quotes[0]);

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var typewriter = new Typewriter(textEl, { speed: 65, jitter: 25 });
    // reduceMotion sets textEl.textContent directly and never touches the
    // typewriter's own char/reveal state, so these two checks have to read
    // whichever one actually reflects what's on screen.
    function isTextBlank() {
      return reduceMotion ? !textEl.textContent : typewriter.isBlank();
    }
    function isTextFullyTyped(text) {
      return reduceMotion ? textEl.textContent === text : typewriter.isFullyTyped(text);
    }
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
    // Mirrors whichever of advanceTimer/betweenTimer is currently the real
    // pending one (only ever one at a time) — set by scheduleAdvance/
    // scheduleBetween below and read by the tab-visibility pause so a
    // hide/show flicker can freeze *and resume* a hold or blank-gap wait
    // by however much delay is actually left, instead of either letting it
    // run invisibly in the background or restarting it from scratch every
    // single time (which, under frequent flickering, could reset a wait
    // forever and never let it fire — see clearDeckTimers()).
    var deckPendingFn = null;
    var deckPendingDueAt = 0;

    function scheduleAdvance(fn, delay) {
      deckPendingFn = fn;
      deckPendingDueAt = Date.now() + delay;
      advanceTimer = setTimeout(fn, delay);
    }

    function scheduleBetween(fn, delay) {
      deckPendingFn = fn;
      deckPendingDueAt = Date.now() + delay;
      betweenTimer = setTimeout(fn, delay);
    }

    // Every place that cancels the hold/blank-gap wait outright (as opposed
    // to pausing it) also has to invalidate deckPendingFn — otherwise a
    // stale, already-cancelled entry could still look "pending" later.
    function clearDeckTimers() {
      clearTimeout(advanceTimer);
      clearTimeout(betweenTimer);
      deckPendingFn = null;
    }

    // While the comments drawer is open, autoplay holds on the current
    // quote instead of erasing it out from under the reader — advancePending
    // records that the hold timer already elapsed so closing the drawer can
    // advance right away instead of waiting out a whole new HOLD_MS.
    var commentsOpen = false;
    var advancePending = false;
    // Stop only cancels scheduling of the *next* step — an in-flight
    // type/erase animation is never interrupted mid-character, it always
    // finishes on its own first.
    var isPlaying = true;
    // Set by initPlayToggle(): called once a Stop click's in-flight
    // animation actually finishes and the deck has genuinely settled.
    var onSettled = null;
    // Like/dislike are local-only (no backend to persist a vote yet) and
    // reset on every quote change — likeBase is that quote's real count
    // from the data, and the shown count is likeBase+1 while liked, never
    // otherwise adjusted.
    var likeBase = 0;
    var voteState = 'none';

    function applyBackground(quote) {
      if (quote.bgImage) {
        stage.style.backgroundImage =
          'linear-gradient(180deg, rgba(0,0,0,.45), rgba(0,0,0,.65)), url("' + quote.bgImage + '")';
        stage.style.backgroundSize = 'cover';
        stage.style.backgroundPosition = quote.bgPosition || 'center';
        stage.classList.remove('quote-stage--fallback');
        stage.classList.add('on-bg-image');
      } else {
        stage.style.backgroundImage = '';
        stage.style.backgroundSize = '';
        stage.style.backgroundPosition = '';
        stage.classList.add('quote-stage--fallback');
        stage.classList.remove('on-bg-image');
      }
      // Unsplash's API guidelines require this credit to stay visible
      // wherever the photo is shown — only quotes backed by an Unsplash
      // photo carry bgCredit, so a locally uploaded background never shows it.
      if (quote.bgCredit) {
        bgCreditAuthorEl.href = quote.bgCredit.link;
        bgCreditAuthorEl.textContent = quote.bgCredit.name;
        bgCreditEl.classList.remove('hidden');
        bgCreditEl.classList.add('flex');
      } else {
        bgCreditEl.classList.add('hidden');
        bgCreditEl.classList.remove('flex');
      }
    }

    // The light-glass treatment on #create-quote-btn (src/input.css,
    // .on-bg-image #create-quote-btn) assumes the photo behind that corner
    // is dark — usually true, since applyBackground()'s own gradient
    // overlay darkens the bottom of the image most. But a bright patch of
    // photo (snow, sky) can still land there and wash the white-on-white
    // glass out, recreating the exact problem it was meant to fix. This
    // samples the actual composited pixels behind the button — the photo
    // as drawn, with that same overlay applied — and flips to a dark-glass
    // tint (.is-over-light-bg, in the CSS) when that corner reads light.
    var createBtn = document.getElementById('create-quote-btn');
    var LIGHT_BG_LUMA_THRESHOLD = 90;
    var bgSampleToken = 0;

    function updateCreateBtnContrast(quote) {
      var token = ++bgSampleToken;
      if (!createBtn) return;
      if (!quote || !quote.bgImage) {
        createBtn.classList.remove('is-over-light-bg');
        return;
      }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        // A newer quote or a resize started a fresher sample — let that one
        // win instead of applying this now-stale result on top of it.
        if (token !== bgSampleToken) return;
        try {
          var rect = createBtn.getBoundingClientRect();
          var cw = stage.clientWidth;
          var ch = stage.clientHeight;
          if (!cw || !ch || !rect.width || !rect.height) return;

          // Sampled at a fraction of real size — an average over a coarser
          // grid is both cheaper and smoother than reading every real pixel.
          var sampleScale = 240 / cw;
          var sw = Math.max(1, Math.round(cw * sampleScale));
          var sh = Math.max(1, Math.round(ch * sampleScale));

          var canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          var ctx = canvas.getContext('2d');

          // Reproduces CSS `background-size: cover` + `background-position`
          // at the sample canvas's scale, so the region read below lines up
          // with what's actually rendered behind the button on screen.
          var coverScale = Math.max(sw / img.naturalWidth, sh / img.naturalHeight);
          var dw = img.naturalWidth * coverScale;
          var dh = img.naturalHeight * coverScale;
          var pos = String(quote.bgPosition || '50% 50%').split(' ');
          var posX = parseFloat(pos[0]);
          var posY = parseFloat(pos[1]);
          if (isNaN(posX)) posX = 50;
          if (isNaN(posY)) posY = 50;
          var dx = (sw - dw) * (posX / 100);
          var dy = (sh - dh) * (posY / 100);
          ctx.drawImage(img, dx, dy, dw, dh);

          var sx = Math.max(0, Math.round(rect.left * sampleScale));
          var sy = Math.max(0, Math.round(rect.top * sampleScale));
          if (sx >= sw || sy >= sh) return;
          var srw = Math.min(Math.max(1, Math.round(rect.width * sampleScale)), sw - sx);
          var srh = Math.min(Math.max(1, Math.round(rect.height * sampleScale)), sh - sy);

          var data = ctx.getImageData(sx, sy, srw, srh).data;
          var total = 0;
          var count = 0;
          for (var i = 0; i < data.length; i += 4) {
            total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            count++;
          }
          var rawLuma = count ? total / count : 0;

          // applyBackground() paints a linear-gradient(.45 -> .65, top to
          // bottom) black overlay over the photo — folded in here so the
          // sample reflects what's actually visible, not the raw photo.
          var yFraction = Math.min(1, Math.max(0, (rect.top + rect.height / 2) / ch));
          var overlayAlpha = 0.45 + 0.2 * yFraction;
          var effectiveLuma = rawLuma * (1 - overlayAlpha);

          createBtn.classList.toggle('is-over-light-bg', effectiveLuma > LIGHT_BG_LUMA_THRESHOLD);
        } catch (err) {
          // Most likely a tainted canvas — a hotlinked photo whose host
          // doesn't send permissive CORS headers for the crossOrigin
          // request above. Fall back to the safe default rather than guess.
          createBtn.classList.remove('is-over-light-bg');
        }
      };
      img.onerror = function () {
        if (token === bgSampleToken) createBtn.classList.remove('is-over-light-bg');
      };
      img.src = quote.bgImage;
    }

    // The button's position relative to the photo only changes with the
    // quote (new photo) or the viewport (cover-fit reflows) — never on its
    // own, so a debounced resize listener is enough; no need to re-sample
    // on any tighter cadence than that.
    var contrastResizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(contrastResizeTimer);
      contrastResizeTimer = setTimeout(function () {
        var quote = quotes[parseInt(stage.dataset.quoteIndex, 10)] || quotes[0];
        updateCreateBtnContrast(quote);
      }, 200);
    });

    function updateVoteUI() {
      var liked = voteState === 'liked';
      var disliked = voteState === 'disliked';
      likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
      dislikeBtn.setAttribute('aria-pressed', disliked ? 'true' : 'false');
      likeBtn.classList.toggle('text-accent', liked);
      likeIcon.setAttribute('icon', liked ? 'mynaui:like-solid' : 'mynaui:like');
      dislikeIcon.setAttribute('icon', disliked ? 'mynaui:dislike-solid' : 'mynaui:dislike');
      likesEl.textContent = formatCompact(likeBase + (liked ? 1 : 0));
    }

    function renderMeta(quote) {
      authorEl.textContent = quote.author || '';
      authorMetaEl.textContent = formatCompact(quote.authorQuoteCount) + ' quotes • ' +
        formatCompact(quote.authorAppreciations) + ' appreciations';
      commentsEl.textContent = formatCompact(quote.comments);
      if (commentsPanelCountEl) commentsPanelCountEl.textContent = formatCompact(quote.comments);
      likeBase = quote.likes;
      voteState = 'none';
      updateVoteUI();
      // Debug-only readout of this quote's hashtags — see #quote-debug-tags
      // in views/app/index.ejs.
      if (debugTagsEl) {
        debugTagsEl.textContent = (quote.hashtags && quote.hashtags.length)
          ? quote.hashtags.map(function (t) { return '#' + t; }).join(' ')
          : '(no tags)';
      }
    }

    likeBtn.addEventListener('click', function () {
      voteState = voteState === 'liked' ? 'none' : 'liked';
      updateVoteUI();
    });
    dislikeBtn.addEventListener('click', function () {
      voteState = voteState === 'disliked' ? 'none' : 'disliked';
      updateVoteUI();
    });

    // Author row (above the quote) and stats row (below it) show/hide
    // together — they're two separate blocks now that they sit on
    // opposite sides of the quote text.
    function setMetaVisible(visible) {
      var opacity = visible ? 1 : 0;
      authorRowEl.style.opacity = opacity;
      statsEl.style.opacity = opacity;
    }

    function doAdvance() {
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
    }

    function scheduleNext() {
      clearTimeout(advanceTimer);
      if (!isPlaying) {
        if (onSettled) onSettled();
        return;
      }
      scheduleAdvance(function () {
        // Reader's attention is on the comments drawer — hold here instead
        // of erasing the quote underneath it. setCommentsOpen(false) picks
        // this back up once they close it.
        if (commentsOpen) {
          advancePending = true;
          return;
        }
        doAdvance();
      }, HOLD_MS);
    }

    // isRepeat: same quote retyping (part of its REPEAT_COUNT cycle) vs.
    // actually advancing to a different quote. The author/meta block only
    // hides and reappears for a real quote change — it stays put across
    // repeats of the same quote.
    function showQuote(nextIndex, isRepeat) {
      var quote = quotes[nextIndex];
      // Read by the screenshot export so it can source the *full* quote
      // text from data instead of whatever's live in the DOM — which, if
      // the typewriter hasn't finished, is only a partial string.
      stage.dataset.quoteIndex = nextIndex;

      function typeIn() {
        // Held off until the old quote is fully erased and its meta hidden
        // (for a real quote switch) so the background never changes out
        // from under text/stats that are still on screen.
        applyBackground(quote);
        updateCreateBtnContrast(quote);
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

      if (reduceMotion || isTextBlank()) {
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
        scheduleBetween(typeIn, BETWEEN_QUOTES_MS);
      });
    }

    initPlayToggle();
    initNavButtons();
    initLoopButton();
    initTabVisibilityPause();
    showQuote(index);

    // Background enrichment: pulls in server-side matches for pinned tags
    // the initial ~50-quote sample under-represents or misses entirely
    // (see GET /app/quotes/recommended in routes/app.js). Never touches
    // what's already typing on screen — showQuote isn't called again here,
    // only quotes/index are updated for whatever plays next.
    refreshRecommendations();

    // Repeat-one toggle: the solid icon variant, an accent color and a
    // small corner dot together mark the active state.
    function initLoopButton() {
      var btn = document.getElementById('loop-btn');
      var icon = document.getElementById('loop-icon');
      var dot = document.getElementById('loop-dot');
      if (!btn) return;

      var LOOP_ICON = 'mynaui:repeat';
      var LOOP_ICON_ACTIVE = 'mynaui:repeat-solid';

      btn.addEventListener('click', function () {
        loopCurrent = !loopCurrent;
        btn.setAttribute('aria-pressed', loopCurrent ? 'true' : 'false');
        btn.setAttribute('aria-label', loopCurrent ? 'Stop repeating this quote' : 'Repeat this quote');
        btn.classList.toggle('text-accent', loopCurrent);
        btn.classList.toggle('text-ink', !loopCurrent);
        if (icon) icon.setAttribute('icon', loopCurrent ? LOOP_ICON_ACTIVE : LOOP_ICON);
        if (dot) dot.classList.toggle('opacity-0', !loopCurrent);
      });
    }

    // Freezes the whole deck — mid-character typing/erasing, or a hold/
    // blank-gap wait — the instant the tab is backgrounded, and picks up
    // exactly where it left off on return, so a reader who tabs away never
    // comes back to find it finished typing itself out (or moved on
    // several quotes) unseen. Only engages while actually playing: a deck
    // the reader stopped themselves via the Stop button stays stopped
    // regardless of tab switches.
    //
    // The hold/gap wait is frozen by *remaining delay*, the same way the
    // typewriter's own pause() works, rather than just cancelled outright —
    // a first version did the latter and just called scheduleNext() fresh
    // on return, which reset the whole HOLD_MS wait from scratch on every
    // single show event. That's fine for one hide/show, but Chrome also
    // marks a tab hidden when a *different application window* gets focus,
    // not just an in-browser tab switch — so a reader alt-tabbing back and
    // forth to their editor more often than the wait is long enough for
    // could reset it forever and the deck would look permanently stuck on
    // one quote, never actually erroring, just never getting a clear run
    // at its countdown.
    function initTabVisibilityPause() {
      var typewriterWasActive = false;
      var pausedForHidden = false;
      var pausedDeckFn = null;
      var pausedDeckRemaining = null;

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (!isPlaying || pausedForHidden) return;
          pausedForHidden = true;

          typewriterWasActive = typewriter.isActive();
          typewriter.pause();

          if (deckPendingFn && deckPendingDueAt > Date.now()) {
            pausedDeckFn = deckPendingFn;
            pausedDeckRemaining = Math.max(0, deckPendingDueAt - Date.now());
          } else {
            pausedDeckFn = null;
            pausedDeckRemaining = null;
          }
          clearTimeout(advanceTimer);
          clearTimeout(betweenTimer);
          deckPendingFn = null;
        } else if (pausedForHidden) {
          pausedForHidden = false;
          if (typewriterWasActive) {
            typewriter.resume();
          }
          if (pausedDeckFn) {
            var fn = pausedDeckFn;
            var delay = pausedDeckRemaining;
            pausedDeckFn = null;
            pausedDeckRemaining = null;
            deckPendingFn = fn;
            deckPendingDueAt = Date.now() + delay;
            // Whichever of the two this belongs to, both are always
            // cleared together everywhere else (clearDeckTimers) — so
            // pointing both vars at the same id is harmless and avoids
            // having to track which one it originally was.
            advanceTimer = setTimeout(fn, delay);
            betweenTimer = advanceTimer;
          }
          // Neither set: nothing was actually mid-flight (e.g. the
          // comments drawer was holding it via advancePending) — leave
          // that to its own resume path instead of forcing anything.
        }
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
        clearDeckTimers();

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
        } else if (isTextBlank()) {
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
        if (isTextFullyTyped(quote.text)) {
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
        clearDeckTimers();
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

    // --- Recommendations: once any category is pinned, the deck plays
    // ONLY quotes matching a pinned tag — looping through just those until
    // the reader confirms a different pin set, rather than falling through
    // to unrelated quotes once it runs out of matches. Clearing every pin
    // restores the full, unfiltered pool. `allQuotes` (above) is the
    // ever-growing pool everything loaded so far lands in; `quotes` is the
    // active playback queue derived from it — every other piece of deck
    // logic (index, autoplay, prev/next) only ever reads `quotes` and has
    // no idea a filter is even in play. ---

    function scoreForPins(quote, pinnedNames) {
      if (!pinnedNames.length || !quote.hashtags || !quote.hashtags.length) return 0;
      var score = 0;
      for (var i = 0; i < quote.hashtags.length; i++) {
        if (pinnedNames.indexOf(quote.hashtags[i]) !== -1) score++;
      }
      return score;
    }

    // No pins: the whole pool, untouched. Pins: just the matches, ranked
    // by how many pinned tags each one hits (ties keep pool order) —
    // everything else is left out entirely rather than appended after, so
    // there's nothing non-matching left to wrap around into. `currentQuote`
    // is always kept at position 0 regardless, matching or not, so nothing
    // already typing on screen ever gets pulled out from under the reader.
    function buildActiveQueue(pinnedNames, currentQuote) {
      if (!pinnedNames.length) return allQuotes.slice();
      var matches = allQuotes
        .filter(function (q) { return q !== currentQuote && scoreForPins(q, pinnedNames) > 0; })
        .map(function (q, i) { return { quote: q, score: scoreForPins(q, pinnedNames), i: i }; })
        .sort(function (a, b) { return b.score - a.score || a.i - b.i; })
        .map(function (entry) { return entry.quote; });
      return currentQuote ? [currentQuote].concat(matches) : matches;
    }

    // Bumped on every call so a slow, superseded request (the reader
    // confirmed a second pin set before the first fetch landed) can't
    // clobber a newer result — same guard shape as the debounced search
    // fetches elsewhere in this file.
    var recommendSeq = 0;

    // Called once at boot (after the first quote is already on screen) and
    // again whenever the Categories popup confirms a pin set
    // (initCategoriesPopup holds the quoteDeck reference this returns).
    function refreshRecommendations() {
      var pinnedNames = loadPinnedTags().map(function (t) { return t.name; });
      var seq = ++recommendSeq;
      var currentQuote = quotes[index];

      function apply(pool) {
        if (seq !== recommendSeq) return;
        allQuotes = pool;
        quotes = buildActiveQueue(pinnedNames, currentQuote);
        index = 0;
      }

      // No pins: restore the full pool instead of leaving the reader stuck
      // looping whatever narrower match set was playing before they
      // cleared their pins.
      if (!pinnedNames.length) {
        apply(allQuotes);
        return;
      }

      var existingIds = allQuotes.map(function (q) { return q.id; }).filter(Boolean).join(',');
      fetch('/app/quotes/recommended?tags=' + encodeURIComponent(pinnedNames.join(',')) +
        '&exclude=' + encodeURIComponent(existingIds))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (seq !== recommendSeq) return;
          var fresh = (data.quotes || []).filter(function (fetched) {
            return allQuotes.every(function (existing) { return existing.id !== fetched.id; });
          });
          apply(allQuotes.concat(fresh));
        })
        .catch(function () {
          if (seq !== recommendSeq) return;
          apply(allQuotes);
        });
    }

    return {
      // Called by initCommentsPanel so the drawer being open/closed can
      // pause and resume autoplay without the two modules otherwise
      // knowing anything about each other.
      setCommentsOpen: function (open) {
        commentsOpen = open;
        if (!open && advancePending) {
          advancePending = false;
          // Only follow through if still playing — the Stop button may
          // have been pressed while the drawer was open.
          if (isPlaying) doAdvance();
        }
      },
      // Called by initCreateQuoteModal on publish: appends the new quote
      // (no backend to persist it, same local-only spirit as comments) and
      // jumps straight to it so the author sees it land, same erase/type
      // transition the nav buttons use.
      addQuote: function (quote) {
        // Into both: allQuotes so it survives the next refreshRecommendations
        // rebuild (which otherwise reads only from that pool), and quotes so
        // it's visible right away regardless of any active pin filter —
        // jumping straight to your own just-published quote is a deliberate
        // override of that filter, not something it should hide.
        allQuotes.push(quote);
        quotes.push(quote);
        index = quotes.length - 1;
        repeatsLeft = REPEAT_COUNT;
        clearDeckTimers();
        typewriter.cancel();
        showQuote(index, false);
      },
      // Called by initCategoriesPopup once Confirm persists a new pin set.
      refreshRecommendations: refreshRecommendations
    };
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

    var CAMERA_ICON = 'mynaui:camera';
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
      // kept wrapping the accent-colored "Quote" onto its own line whenever
      // it sat nested inside the name span with a different color — a known
      // class of html2canvas bugs with mixed-color inline runs. Plain
      // sibling spans (no nesting, no color change mid-element) render
      // reliably as a single line instead.
      var brandWrap = document.createElement('div');
      brandWrap.style.padding = '56px 0 0';
      brandWrap.style.textAlign = 'center';
      brandWrap.style.whiteSpace = 'nowrap';

      // blackn's accent is too low-contrast for "Quote" to read against it,
      // so its brand name is muted to match the other secondary text —
      // same scoped override as the live view's [data-theme="blackn"] rule.
      var isBlackn = root.getAttribute('data-theme') === 'blackn';
      var inkClass = isBlackn ? 'text-ink-60' : 'text-ink';
      var accentClass = isBlackn ? 'text-ink-60' : 'text-accent';

      var brandYouEl = document.createElement('span');
      brandYouEl.className = 'font-display text-xl sm:text-2xl ' + inkClass;
      brandYouEl.style.display = 'inline-block';
      brandYouEl.textContent = 'You';

      var brandQuoteEl = document.createElement('span');
      brandQuoteEl.className = 'font-display text-xl sm:text-2xl ' + accentClass;
      brandQuoteEl.style.display = 'inline-block';
      brandQuoteEl.textContent = 'Quote';

      var brandItEl = document.createElement('span');
      brandItEl.className = 'font-display text-xl sm:text-2xl ' + inkClass;
      brandItEl.style.display = 'inline-block';
      brandItEl.textContent = 'It.';

      brandWrap.appendChild(brandYouEl);
      brandWrap.appendChild(brandQuoteEl);
      brandWrap.appendChild(brandItEl);

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
        var authorMetaClone = contentClone.querySelector('#quote-author-meta');
        if (authorMetaClone) {
          authorMetaClone.textContent = formatCompact(exportQuote.authorQuoteCount) + ' quotes • ' +
            formatCompact(exportQuote.authorAppreciations) + ' appreciations';
        }
        // Likes is deliberately left alone here (unlike comments): it's
        // interactive now, and the live DOM already reflects the viewer's
        // own local like/dislike choice (icon + count together) — recompute
        // it from raw data and the two would visibly disagree.
        var commentsClone = contentClone.querySelector('#quote-comments');
        if (commentsClone) commentsClone.textContent = formatCompact(exportQuote.comments);
      }
      inlineIcons(contentEl, contentClone);
      if (statsClone) {
        // Both of these are UI affordances, not shareable card content —
        // strip them only now that inlineIcons is done matching live/clone
        // icons by position; removing them earlier (quote-vote sits before
        // quote-menu-wrap) would shift every icon after it out of sync.
        var voteClone = statsClone.querySelector('#quote-vote');
        if (voteClone) {
          var likeBtnClone = voteClone.querySelector('#quote-like-btn');
          var plainLike = document.createElement('div');
          plainLike.className = 'flex items-center gap-1.5';
          if (likeBtnClone) {
            // The liked/accent-color state lives on the button being
            // discarded here — carry it to the plain div replacing it.
            if (likeBtnClone.classList.contains('text-accent')) plainLike.classList.add('text-accent');
            while (likeBtnClone.firstChild) plainLike.appendChild(likeBtnClone.firstChild);
          }
          voteClone.replaceWith(plainLike);
        }
        var menuWrapClone = statsClone.querySelector('#quote-menu-wrap');
        if (menuWrapClone) menuWrapClone.remove();
      }
      // Author row: avatar circle next to the name/meta stack — same
      // inline-block + vertical-align:middle centering as the stats row,
      // since html2canvas's flexbox cross-axis centering can't be trusted.
      if (authorClone) {
        var rowGapPx = parseFloat(window.getComputedStyle(authorRowEl).columnGap) || 12;
        centerRowChildren(authorClone, rowGapPx);
      }
      // Each stat's icon+number pair first (6px gap), then the row of
      // stats itself (16px gap) — inner before outer, so the outer
      // pass's inline-block override on each stat lands last.
      if (statsClone) {
        Array.prototype.forEach.call(statsClone.children, function (stat) {
          centerRowChildren(stat, 6);
        });
        centerRowChildren(statsClone, 16);
      }
      contentWrap.appendChild(contentClone);

      var timestamp = document.createElement('div');
      timestamp.className = 'text-ink-60';
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

  // Per-quote "more options" menu (Share / Save / Flag / Not interested).
  // Share is real (Web Share API, or a clipboard-copy fallback with its own
  // brief confirmation). The other three aren't wired to a backend yet —
  // no saved-quotes store, no report storage, no recommendation signal to
  // feed — so selecting any of them just closes the menu for now; the real
  // effects land when those systems exist.
  function initQuoteMenu() {
    var trigger = document.getElementById('quote-menu-btn');
    var menu = document.getElementById('quote-menu');
    if (!trigger || !menu) return;

    var stage = document.getElementById('quote-stage');
    var dataScript = document.getElementById('quotes-data');
    var quotes = [];
    try { quotes = (dataScript && JSON.parse(dataScript.textContent)) || []; } catch (e) {}

    var shareBtn = document.getElementById('quote-share-btn');
    var shareIcon = document.getElementById('quote-share-icon');
    var shareLabel = document.getElementById('quote-share-label');
    var saveBtn = document.getElementById('quote-save-btn');
    var flagBtn = document.getElementById('quote-flag-btn');
    var notInterestedBtn = document.getElementById('quote-not-interested-btn');

    var textEl = document.getElementById('quote-text');
    var footerEl = document.getElementById('quote-footer');

    function isOpen() {
      return trigger.getAttribute('aria-expanded') === 'true';
    }

    // Quote length (so the text's own height) and viewport height both vary
    // a lot, so a fixed open-up-or-down direction reliably collides with
    // something on one side or the other for some quote/viewport
    // combination. Open toward whichever side actually has more room, and
    // cap the menu to that room (scrolling internally past that) so it can
    // never overlap the quote text or the footer, even when both gaps are
    // tight at once.
    function pickDirection() {
      var triggerRect = trigger.getBoundingClientRect();
      var spaceAbove = textEl ? triggerRect.top - textEl.getBoundingClientRect().bottom : triggerRect.top;
      var spaceBelow = footerEl ? footerEl.getBoundingClientRect().top - triggerRect.bottom : window.innerHeight - triggerRect.bottom;
      var openUp = spaceAbove > spaceBelow;

      menu.classList.toggle('bottom-full', openUp);
      menu.classList.toggle('mb-2', openUp);
      menu.classList.toggle('origin-bottom-right', openUp);
      menu.classList.toggle('top-full', !openUp);
      menu.classList.toggle('mt-2', !openUp);
      menu.classList.toggle('origin-top-right', !openUp);

      var GAP = 8;
      var MARGIN = 8;
      var available = (openUp ? spaceAbove : spaceBelow) - GAP - MARGIN;
      // No minimum floor here on purpose: a floor big enough to look decent
      // (say, one full menu item) would itself overlap the quote text or
      // footer whenever the real gap is smaller than that — and avoiding
      // that overlap is the whole point. Worst case on a very short
      // viewport is a barely-there, scrollable sliver, never an overlap.
      menu.style.maxHeight = Math.max(available, 0) + 'px';
    }

    function setOpen(open) {
      if (open) pickDirection();
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('opacity-100', open);
      menu.classList.toggle('scale-100', open);
      menu.classList.toggle('pointer-events-auto', open);
      menu.classList.toggle('opacity-0', !open);
      menu.classList.toggle('scale-95', !open);
      menu.classList.toggle('pointer-events-none', !open);
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    function shareQuote() {
      var quote = quotes[parseInt(stage && stage.dataset.quoteIndex, 10)] || quotes[0];
      if (!quote || !shareBtn) return;
      var shareText = '"' + quote.text + '" — ' + (quote.author || 'Unknown');

      // The native share sheet is its own modal UI, so our menu can close
      // right away; the clipboard fallback has no such UI of its own, so it
      // shows "Copied" in place for a beat before closing instead.
      if (navigator.share) {
        setOpen(false);
        navigator.share({ text: shareText }).catch(function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(function () {
          shareIcon.setAttribute('icon', 'mynaui:check');
          shareLabel.textContent = 'Copied';
          setTimeout(function () {
            shareIcon.setAttribute('icon', 'mynaui:share');
            shareLabel.textContent = 'Share';
            setOpen(false);
          }, 1200);
        }).catch(function () { setOpen(false); });
        return;
      }
      setOpen(false);
    }

    if (shareBtn) shareBtn.addEventListener('click', shareQuote);

    // None of these three have a real store/backend behind them yet (see
    // the journal), so the toast is the only confirmation the click did
    // anything.
    if (saveBtn) saveBtn.addEventListener('click', function () {
      setOpen(false);
      showToast('Saved.', { icon: 'mynaui:bookmark-solid' });
    });
    if (flagBtn) flagBtn.addEventListener('click', function () {
      setOpen(false);
      showToast('Thanks for the report. We’ll take a look.', { icon: 'mynaui:check-circle-solid' });
    });
    if (notInterestedBtn) notInterestedBtn.addEventListener('click', function () {
      setOpen(false);
      showToast('Got it, we’ll show you less like this.', { icon: 'mynaui:check-circle-solid' });
    });

    document.addEventListener('click', function (e) {
      if (isOpen() && e.target !== trigger && !menu.contains(e.target)) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) setOpen(false);
    });
  }

  // Comments panel: a slide-in drawer with a composer and a comment list.
  // There's no real backend behind any of this yet — MOCK_COMMENTS just
  // seeds a plausible-looking thread, and posting only ever mutates this
  // in-memory array, so the "thread" resets on every page load.
  var MOCK_COMMENTS = [
    {
      author: 'Elena M.', time: '2h', text: 'This hit different today. Needed to read exactly this.',
      replies: [
        { author: 'jordan_writes', time: '1h', text: 'Right? Same energy for me today.' },
        { author: 'Priya K.', time: '45m', text: 'Sending this to my group chat lol' }
      ]
    },
    { author: 'jordan_writes', time: '5h', text: 'Saving this one for later, so good.' },
    {
      author: 'Priya K.', time: '1d', text: 'Who else came here after a rough week?',
      replies: [
        { author: 'Marcus T.', time: '20h', text: 'Every single week honestly.' }
      ]
    },
    { author: 'Marcus T.', time: '2d', text: 'The way this is worded is just perfect.' }
  ];

  var REPLIES_PAGE_SIZE = 4;
  var nextReplyId = 0;

  // Shared textarea+button composer used both for replying to a top-level
  // comment and for replying to a reply — only the placeholder name, the
  // DOM id (so Reply-click can find and focus it), and what happens on
  // submit differ between the two call sites.
  function buildInlineReplyBox(inputId, placeholderName, onSubmit) {
    var box = document.createElement('div');
    box.className = 'mt-3 flex flex-col overflow-hidden rounded-lg border border-ink-10 transition focus-within:ring-1 focus-within:ring-ink-10';

    var textarea = document.createElement('textarea');
    textarea.id = inputId;
    textarea.rows = 2;
    textarea.maxLength = 280;
    textarea.placeholder = 'Reply to ' + placeholderName + '…';
    textarea.className = 'comment-input-field resize-none border-0 bg-transparent px-3 py-2 text-sm text-ink focus:outline-none';

    var footer = document.createElement('div');
    footer.className = 'flex items-center justify-end px-2 py-1.5';

    var postBtn = document.createElement('button');
    postBtn.type = 'button';
    postBtn.disabled = true;
    postBtn.textContent = 'Reply';
    postBtn.className = 'cursor-pointer rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-surface transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40';

    textarea.addEventListener('input', function () {
      postBtn.disabled = textarea.value.trim().length === 0;
    });
    postBtn.addEventListener('click', function () {
      var text = textarea.value.trim();
      if (!text) return;
      onSubmit(text);
    });

    footer.appendChild(postBtn);
    box.appendChild(textarea);
    box.appendChild(footer);
    return box;
  }

  // A reply to a top-level comment. It gets its own Reply/Report, but
  // "replying" to a reply just appends a flat entry to the *parent
  // comment's* replies array (prefaced by who it's aimed at via the
  // placeholder) rather than starting a second level of nesting.
  function buildReplyEl(reply, parentComment, handlers) {
    var outer = document.createElement('div');
    outer.className = 'flex flex-col gap-2';

    var wrap = document.createElement('div');
    wrap.className = 'flex items-start gap-2';

    var avatar = document.createElement('span');
    avatar.className = 'grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-ink-60 ring-1 ring-ink-10';
    var avatarIcon = document.createElement('iconify-icon');
    avatarIcon.setAttribute('icon', 'mynaui:user');
    avatarIcon.setAttribute('width', '14');
    avatar.appendChild(avatarIcon);

    var body = document.createElement('div');
    body.className = 'flex min-w-0 flex-1 flex-col gap-0.5 text-left';

    var head = document.createElement('div');
    head.className = 'flex items-baseline gap-2';
    var nameEl = document.createElement('span');
    nameEl.className = 'text-sm font-semibold text-ink';
    nameEl.textContent = reply.author;
    var timeEl = document.createElement('span');
    timeEl.className = 'text-xs text-ink-60';
    timeEl.textContent = reply.time;
    head.appendChild(nameEl);
    head.appendChild(timeEl);

    var textEl = document.createElement('p');
    textEl.className = 'text-sm text-ink';
    textEl.textContent = reply.text;

    var actions = document.createElement('div');
    actions.className = 'mt-1.5 flex items-center gap-4';

    var replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'flex cursor-pointer items-center gap-1 text-xs text-ink-60 transition hover:text-ink';
    var replyIcon = document.createElement('iconify-icon');
    replyIcon.setAttribute('icon', 'mynaui:corner-up-left');
    replyIcon.setAttribute('width', '14');
    var replyLabel = document.createTextNode(reply._replyOpen ? 'Cancel' : 'Reply');
    replyBtn.appendChild(replyIcon);
    replyBtn.appendChild(replyLabel);
    replyBtn.addEventListener('click', function () {
      reply._replyOpen = !reply._replyOpen;
      if (handlers && handlers.rerender) handlers.rerender();
      if (reply._replyOpen) {
        var replyInputEl = document.getElementById('reply-input-reply-' + reply.id);
        if (replyInputEl) replyInputEl.focus();
      }
    });

    var reportBtn = document.createElement('button');
    reportBtn.type = 'button';
    reportBtn.className = 'flex items-center gap-1 text-xs text-ink-60 transition hover:text-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-60';
    var reportIcon = document.createElement('iconify-icon');
    reportIcon.setAttribute('width', '14');
    var reportLabel = document.createTextNode('');
    reportBtn.appendChild(reportIcon);
    reportBtn.appendChild(reportLabel);

    function syncReportUI() {
      reportBtn.disabled = !!reply.reported;
      reportIcon.setAttribute('icon', reply.reported ? 'mynaui:flag-solid' : 'mynaui:flag');
      reportLabel.textContent = reply.reported ? 'Reported' : 'Report';
    }
    syncReportUI();
    reportBtn.addEventListener('click', function () {
      reply.reported = true;
      syncReportUI();
    });

    actions.appendChild(replyBtn);
    actions.appendChild(reportBtn);

    body.appendChild(head);
    body.appendChild(textEl);
    body.appendChild(actions);
    wrap.appendChild(avatar);
    wrap.appendChild(body);
    outer.appendChild(wrap);

    if (reply._replyOpen) {
      outer.appendChild(buildInlineReplyBox('reply-input-reply-' + reply.id, reply.author, function (text) {
        parentComment.replies = parentComment.replies || [];
        parentComment.replies.push({ id: 'r' + (nextReplyId++), author: 'You', time: 'Just now', text: text });
        reply._replyOpen = false;
        parentComment._repliesExpanded = true;
        parentComment._visibleReplyCount = Math.max(
          parentComment._visibleReplyCount || REPLIES_PAGE_SIZE,
          parentComment.replies.length
        );
        if (handlers && handlers.rerender) handlers.rerender();
      }));
    }

    return outer;
  }

  function buildCommentEl(comment, handlers) {
    var wrap = document.createElement('div');
    wrap.className = 'flex items-start gap-3';

    var avatar = document.createElement('span');
    avatar.className = 'grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-ink-60 ring-1 ring-ink-10';
    var avatarIcon = document.createElement('iconify-icon');
    avatarIcon.setAttribute('icon', 'mynaui:user');
    avatarIcon.setAttribute('width', '18');
    avatar.appendChild(avatarIcon);

    var body = document.createElement('div');
    body.className = 'flex min-w-0 flex-1 flex-col gap-0.5 text-left';

    var head = document.createElement('div');
    head.className = 'flex items-baseline gap-2';
    var nameEl = document.createElement('span');
    nameEl.className = 'text-sm font-semibold text-ink';
    nameEl.textContent = comment.author;
    var timeEl = document.createElement('span');
    timeEl.className = 'text-xs text-ink-60';
    timeEl.textContent = comment.time;
    head.appendChild(nameEl);
    head.appendChild(timeEl);

    var textEl = document.createElement('p');
    textEl.className = 'text-sm text-ink';
    textEl.textContent = comment.text;

    var actions = document.createElement('div');
    actions.className = 'mt-1.5 flex items-center gap-4';

    var replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'flex cursor-pointer items-center gap-1 text-xs text-ink-60 transition hover:text-ink';
    var replyIcon = document.createElement('iconify-icon');
    replyIcon.setAttribute('icon', 'mynaui:corner-up-left');
    replyIcon.setAttribute('width', '14');
    var replyLabel = document.createTextNode(comment._replyOpen ? 'Cancel' : 'Reply');
    replyBtn.appendChild(replyIcon);
    replyBtn.appendChild(replyLabel);
    replyBtn.addEventListener('click', function () {
      comment._replyOpen = !comment._replyOpen;
      if (handlers && handlers.rerender) handlers.rerender();
      if (comment._replyOpen) {
        var replyInputEl = document.getElementById('reply-input-' + comment.id);
        if (replyInputEl) replyInputEl.focus();
      }
    });

    // "Reported" persists on the comment object itself (not just this
    // button's DOM state) so it survives renderComments() rebuilding the
    // whole list from `comments` — e.g. after posting a new comment.
    var reportBtn = document.createElement('button');
    reportBtn.type = 'button';
    reportBtn.className = 'flex items-center gap-1 text-xs text-ink-60 transition hover:text-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-60';
    var reportIcon = document.createElement('iconify-icon');
    reportIcon.setAttribute('width', '14');
    var reportLabel = document.createTextNode('');
    reportBtn.appendChild(reportIcon);
    reportBtn.appendChild(reportLabel);

    function syncReportUI() {
      reportBtn.disabled = !!comment.reported;
      reportIcon.setAttribute('icon', comment.reported ? 'mynaui:flag-solid' : 'mynaui:flag');
      reportLabel.textContent = comment.reported ? 'Reported' : 'Report';
    }
    syncReportUI();
    reportBtn.addEventListener('click', function () {
      comment.reported = true;
      syncReportUI();
    });

    actions.appendChild(replyBtn);
    actions.appendChild(reportBtn);

    body.appendChild(head);
    body.appendChild(textEl);
    body.appendChild(actions);

    if (comment.replies && comment.replies.length) {
      var total = comment.replies.length;
      var repliesSection = document.createElement('div');
      repliesSection.className = 'mt-3';

      // Collapsed by default — replies only render once the user opts in,
      // and even then only REPLIES_PAGE_SIZE at a time via "Show more".
      var toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'flex cursor-pointer items-center gap-1 text-xs font-medium text-ink-60 transition hover:text-ink';
      var toggleIcon = document.createElement('iconify-icon');
      toggleIcon.setAttribute('width', '12');
      var toggleLabel = document.createTextNode('');
      toggleBtn.appendChild(toggleIcon);
      toggleBtn.appendChild(toggleLabel);

      function syncToggle() {
        toggleIcon.setAttribute('icon', comment._repliesExpanded ? 'mynaui:chevron-up' : 'mynaui:chevron-down');
        toggleLabel.textContent = (comment._repliesExpanded ? 'Hide ' : 'View ') + total + (total === 1 ? ' reply' : ' replies');
      }
      syncToggle();
      toggleBtn.addEventListener('click', function () {
        comment._repliesExpanded = !comment._repliesExpanded;
        if (comment._repliesExpanded && !comment._visibleReplyCount) {
          comment._visibleReplyCount = REPLIES_PAGE_SIZE;
        }
        if (handlers && handlers.rerender) handlers.rerender();
      });
      repliesSection.appendChild(toggleBtn);

      if (comment._repliesExpanded) {
        var visibleCount = Math.min(comment._visibleReplyCount || REPLIES_PAGE_SIZE, total);
        var repliesWrap = document.createElement('div');
        repliesWrap.className = 'mt-2 flex flex-col gap-3 border-l border-ink-10 pl-3';
        comment.replies.slice(0, visibleCount).forEach(function (reply) {
          repliesWrap.appendChild(buildReplyEl(reply, comment, handlers));
        });
        repliesSection.appendChild(repliesWrap);

        if (visibleCount < total) {
          var remaining = total - visibleCount;
          var moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'ml-3 mt-2 cursor-pointer text-xs font-medium text-ink-60 transition hover:text-ink';
          moreBtn.textContent = 'Show ' + Math.min(REPLIES_PAGE_SIZE, remaining) + ' more ' + (Math.min(REPLIES_PAGE_SIZE, remaining) === 1 ? 'reply' : 'replies');
          moreBtn.addEventListener('click', function () {
            comment._visibleReplyCount = visibleCount + REPLIES_PAGE_SIZE;
            if (handlers && handlers.rerender) handlers.rerender();
          });
          repliesSection.appendChild(moreBtn);
        }
      }

      body.appendChild(repliesSection);
    }

    if (comment._replyOpen) {
      body.appendChild(buildInlineReplyBox('reply-input-' + comment.id, comment.author, function (text) {
        comment.replies = comment.replies || [];
        comment.replies.push({ id: 'r' + (nextReplyId++), author: 'You', time: 'Just now', text: text });
        comment._replyOpen = false;
        comment._repliesExpanded = true;
        comment._visibleReplyCount = Math.max(comment._visibleReplyCount || REPLIES_PAGE_SIZE, comment.replies.length);
        if (handlers && handlers.rerender) handlers.rerender();
      }));
    }

    wrap.appendChild(avatar);
    wrap.appendChild(body);
    return wrap;
  }

  function initCommentsPanel(quoteDeck) {
    var trigger = document.getElementById('quote-comment-btn');
    var backdrop = document.getElementById('comments-backdrop');
    var panel = document.getElementById('comments-panel');
    var closeBtn = document.getElementById('comments-close-btn');
    var input = document.getElementById('comment-input');
    var submitBtn = document.getElementById('comment-submit-btn');
    var charCountEl = document.getElementById('comment-char-count');
    var listEl = document.getElementById('comments-list');
    var emptyStateEl = document.getElementById('comments-empty-state');
    if (!trigger || !backdrop || !panel) return;

    var nextCommentId = 0;
    // Each comment's replies array is copied fresh (not shared with
    // MOCK_COMMENTS) so pushing a new reply here never mutates the seed data.
    var comments = MOCK_COMMENTS.map(function (comment) {
      return Object.assign({ id: 'c' + (nextCommentId++) }, comment, {
        replies: (comment.replies || []).map(function (reply) {
          return Object.assign({ id: 'r' + (nextReplyId++) }, reply);
        })
      });
    });

    function renderComments() {
      if (!listEl || !emptyStateEl) return;
      listEl.innerHTML = '';
      comments.forEach(function (comment) {
        listEl.appendChild(buildCommentEl(comment, { rerender: renderComments }));
      });
      var hasComments = comments.length > 0;
      listEl.classList.toggle('flex', hasComments);
      listEl.classList.toggle('hidden', !hasComments);
      emptyStateEl.classList.toggle('flex', !hasComments);
      emptyStateEl.classList.toggle('hidden', hasComments);
    }

    renderComments();

    var COMMENT_MAX_LEN = 280;
    // Same amber/red "approaching the limit" scale regardless of theme —
    // these are universal status colors, not part of the per-theme palette.
    var COUNT_COLOR_CLASSES = ['text-ink-60', 'text-amber-600', 'text-red-600'];

    function updateCharCount() {
      if (!charCountEl) return;
      var len = input.value.length;
      charCountEl.textContent = len + '/' + COMMENT_MAX_LEN;
      var colorClass = COUNT_COLOR_CLASSES[0];
      if (len >= COMMENT_MAX_LEN - 10) colorClass = COUNT_COLOR_CLASSES[2];
      else if (len >= COMMENT_MAX_LEN - 60) colorClass = COUNT_COLOR_CLASSES[1];
      charCountEl.classList.remove.apply(charCountEl.classList, COUNT_COLOR_CLASSES);
      charCountEl.classList.add(colorClass);
    }

    if (input && submitBtn) {
      input.addEventListener('input', function () {
        submitBtn.disabled = input.value.trim().length === 0;
        updateCharCount();
      });
      submitBtn.addEventListener('click', function () {
        var text = input.value.trim();
        if (text.length === 0) return;
        comments.unshift({ id: 'c' + (nextCommentId++), author: 'You', time: 'Just now', text: text });
        renderComments();
        input.value = '';
        submitBtn.disabled = true;
        updateCharCount();
        input.focus();
      });
    }

    function isOpen() {
      return backdrop.classList.contains('opacity-100');
    }

    function setOpen(open) {
      backdrop.classList.toggle('opacity-100', open);
      backdrop.classList.toggle('pointer-events-auto', open);
      backdrop.classList.toggle('opacity-0', !open);
      backdrop.classList.toggle('pointer-events-none', !open);
      panel.classList.toggle('is-open', open);
      if (quoteDeck) quoteDeck.setCommentsOpen(open);
    }

    trigger.addEventListener('click', function () { setOpen(true); });
    if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) setOpen(false);
    });
  }

  // Auth modal (sign up / log in): gates the create-quote FAB. Login/signup
  // are real server calls backed by a signed session cookie (routes/app.js,
  // middleware/currentUser.js) — this localStorage copy is just a client-
  // side cache of that session so the UI doesn't need a round-trip on every
  // render. syncUserFromServer (called once at boot, below) reconciles it
  // against the #current-user-data the server rendered this page with, so a
  // cookie that expired/was cleared elsewhere doesn't leave this stale.
  // openAuthModal is filled in by initAuthModal below; it stays a no-op if
  // that modal's markup isn't present, matching this file's usual
  // "if (!x) return" degrade.
  var USER_KEY = 'yqi_user';
  var openAuthModal = function () {};

  function getUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function isLoggedIn() {
    return !!getUser();
  }

  function setUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('yqi:auth-change'));
  }

  function clearUser() {
    try { localStorage.removeItem(USER_KEY); } catch (e) {}
    document.dispatchEvent(new CustomEvent('yqi:auth-change'));
  }

  // Reconciles the localStorage cache above against the session the server
  // actually rendered this page with (routes/app.js's GET '/' reads the
  // signed cookie and embeds the result as #current-user-data) — called
  // once at boot so a session that expired/was cleared elsewhere, or a
  // login that happened in another tab, doesn't leave this page's cached
  // copy wrong.
  function syncUserFromServer() {
    var dataScript = document.getElementById('current-user-data');
    if (!dataScript) return;
    var serverUser = null;
    try { serverUser = JSON.parse(dataScript.textContent); } catch (e) {}
    if (JSON.stringify(serverUser) === JSON.stringify(getUser())) return;
    if (serverUser) {
      setUser(serverUser);
    } else {
      clearUser();
    }
  }

  function initAuthModal() {
    var trigger = document.getElementById('create-quote-btn');
    var backdrop = document.getElementById('auth-backdrop');
    var modal = document.getElementById('auth-modal');
    var closeBtn = document.getElementById('auth-close-btn');
    var tabSignup = document.getElementById('auth-tab-signup');
    var tabLogin = document.getElementById('auth-tab-login');
    var form = document.getElementById('auth-form');
    var signupFields = document.getElementById('auth-signup-fields');
    var usernameInput = document.getElementById('auth-username');
    var authorNameInput = document.getElementById('auth-author-name');
    var emailInput = document.getElementById('auth-email');
    var passwordInput = document.getElementById('auth-password');
    var passwordToggleBtn = document.getElementById('auth-password-toggle');
    var passwordToggleIcon = document.getElementById('auth-password-toggle-icon');
    var forgotBtn = document.getElementById('auth-forgot-btn');
    var usernameHint = document.getElementById('auth-username-hint');
    var usernameHintIcon = document.getElementById('auth-username-hint-icon');
    var usernameHintText = document.getElementById('auth-username-hint-text');
    var passwordRequirementsEl = document.getElementById('auth-password-requirements');
    var reqLengthEl = document.getElementById('auth-req-length');
    var reqLowerEl = document.getElementById('auth-req-lower');
    var reqUpperEl = document.getElementById('auth-req-upper');
    var reqDigitEl = document.getElementById('auth-req-digit');
    var reqSpecialEl = document.getElementById('auth-req-special');
    var termsRow = document.getElementById('auth-terms-row');
    var termsCheckbox = document.getElementById('auth-terms');
    var termsIcon = document.getElementById('auth-terms-icon');
    var submitBtn = document.getElementById('auth-submit-btn');
    var googleBtn = document.getElementById('auth-google-btn');
    if (!trigger || !backdrop || !modal || !form) return;

    // Mirrors routes/app.js's PASSWORD_RE — kept in sync by hand, same as
    // that file's own comment notes.
    var PASSWORD_PATTERN = '^(?=(?:.*[a-z]){2,})(?=(?:.*[A-Z]){2,})(?=(?:.*[0-9]){2,})(?=(?:.*[^A-Za-z0-9]){2,}).{8,}$';
    var PASSWORD_TITLE = 'At least 8 characters, with 2+ lowercase, 2+ uppercase, 2+ digits, and 2+ special characters.';

    function isOpen() {
      return backdrop.classList.contains('opacity-100');
    }

    function setOpen(open) {
      backdrop.classList.toggle('opacity-100', open);
      backdrop.classList.toggle('pointer-events-auto', open);
      backdrop.classList.toggle('opacity-0', !open);
      backdrop.classList.toggle('pointer-events-none', !open);
      modal.classList.toggle('scale-100', open);
      modal.classList.toggle('scale-95', !open);
      if (open) {
        form.reset();
        setPasswordVisible(false);
        checkUsernameAvailability();
        updatePasswordRequirements();
        syncTermsIcon();
      }
    }

    function setPasswordVisible(visible) {
      passwordInput.type = visible ? 'text' : 'password';
      passwordToggleIcon.setAttribute('icon', visible ? 'mynaui:eye-off' : 'mynaui:eye');
      passwordToggleBtn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      passwordToggleBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }

    function updateSubmitState() {
      submitBtn.disabled = !form.checkValidity();
    }

    // Native checkbox kept for real form validity (required/checkValidity)
    // but visually hidden (sr-only) in favor of this icon swap — form.reset()
    // doesn't fire 'change', so this also has to be called by hand wherever
    // the checkbox's value is reset out from under it.
    function syncTermsIcon() {
      var checked = termsCheckbox.checked;
      termsIcon.setAttribute('icon', checked ? 'mynaui:check-square-solid' : 'mynaui:square');
      termsRow.classList.toggle('text-ink', checked);
      termsRow.classList.toggle('text-ink-60', !checked);
    }

    function setRequirementMet(el, met) {
      if (!el) return;
      var icon = el.querySelector('iconify-icon');
      if (icon) icon.setAttribute('icon', met ? 'mynaui:check' : 'mynaui:x');
      el.classList.toggle('text-ink', met);
      el.classList.toggle('text-ink-60', !met);
    }

    // Live readout of the same composition rule PASSWORD_PATTERN enforces —
    // counts are what actually flip the pattern from invalid to valid, so
    // they're recomputed the same way here rather than re-deriving pass/fail
    // from the regex itself.
    function updatePasswordRequirements() {
      var value = passwordInput.value;
      var lower = (value.match(/[a-z]/g) || []).length;
      var upper = (value.match(/[A-Z]/g) || []).length;
      var digit = (value.match(/[0-9]/g) || []).length;
      var special = (value.match(/[^A-Za-z0-9]/g) || []).length;

      setRequirementMet(reqLengthEl, value.length >= 8);
      setRequirementMet(reqLowerEl, lower >= 2);
      setRequirementMet(reqUpperEl, upper >= 2);
      setRequirementMet(reqDigitEl, digit >= 2);
      setRequirementMet(reqSpecialEl, special >= 2);
    }

    // state: 'checking' (still in flight), 'ok' (available, or a non-blocking
    // hiccup we're not treating as a hard failure), or 'error' (taken /
    // rejected). Drives both the icon and the ink/red color together so
    // they never disagree.
    var USERNAME_HINT_ICONS = {
      checking: 'svg-spinners:6-dots-scale-middle',
      ok: 'mynaui:check-circle',
      warning: 'mynaui:info-circle',
      error: 'mynaui:x-circle'
    };

    function setUsernameHint(message, state) {
      if (!usernameHint || !usernameHintIcon || !usernameHintText) return;
      var hasMessage = !!message;
      usernameHint.classList.toggle('hidden', !hasMessage);
      usernameHint.classList.toggle('flex', hasMessage);
      usernameHintText.textContent = message || '';
      if (!hasMessage) return;
      var ok = state !== 'error';
      usernameHint.classList.toggle('text-ink-60', ok);
      usernameHint.classList.toggle('text-red-600', !ok);
      usernameHintIcon.setAttribute('icon', USERNAME_HINT_ICONS[state] || USERNAME_HINT_ICONS.ok);
    }

    var USERNAME_CHECK_DEBOUNCE_MS = 400;
    var usernameCheckTimer = null;
    var usernameCheckSeq = 0;

    // Live "is this taken" check against the DB (GET /app/username-available)
    // while the user types, debounced. The result is fed back through
    // setCustomValidity so it plugs into the same form.checkValidity() that
    // already gates the submit button — "unknown/still checking" is treated
    // as invalid so the button can't go enabled on an unconfirmed username.
    function checkUsernameAvailability() {
      clearTimeout(usernameCheckTimer);
      usernameInput.setCustomValidity('');

      if (!usernameInput.required || !usernameInput.checkValidity()) {
        setUsernameHint('');
        updateSubmitState();
        return;
      }

      var value = usernameInput.value;
      usernameInput.setCustomValidity('Checking username availability.');
      setUsernameHint('Checking availability…', 'checking');
      updateSubmitState();

      var seq = ++usernameCheckSeq;
      usernameCheckTimer = setTimeout(function () {
        fetch('/app/username-available?username=' + encodeURIComponent(value))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (seq !== usernameCheckSeq) return; // superseded by a newer keystroke
            usernameInput.setCustomValidity(data.available ? '' : 'Username is taken.');
            setUsernameHint(data.available ? 'Username is available' : 'Username is already taken', data.available ? 'ok' : 'error');
            updateSubmitState();
          })
          .catch(function () {
            if (seq !== usernameCheckSeq) return;
            // Don't permanently block signup on a network hiccup — the
            // server re-validates uniqueness again on actual submit anyway.
            usernameInput.setCustomValidity('');
            setUsernameHint('Could not check availability — will re-check on submit', 'warning');
            updateSubmitState();
          });
      }, USERNAME_CHECK_DEBOUNCE_MS);
    }

    function setMode(signup) {
      signupFields.classList.toggle('hidden', !signup);
      // Toggled directly rather than relying on the hidden container to bar
      // constraint validation — Chromium still validates a required field
      // whose only display:none comes from an ancestor.
      usernameInput.required = signup;
      authorNameInput.required = signup;
      // The password field is shared between both tabs — the composition
      // rule only applies when creating an account, not when logging into
      // an existing one, so it's toggled here rather than living in markup.
      if (signup) {
        passwordInput.setAttribute('pattern', PASSWORD_PATTERN);
        passwordInput.setAttribute('minlength', '8');
        passwordInput.setAttribute('title', PASSWORD_TITLE);
      } else {
        passwordInput.removeAttribute('pattern');
        passwordInput.removeAttribute('minlength');
        passwordInput.removeAttribute('title');
      }
      passwordRequirementsEl.classList.toggle('hidden', !signup);
      termsRow.classList.toggle('hidden', !signup);
      termsCheckbox.required = signup;
      forgotBtn.classList.toggle('hidden', signup);
      tabSignup.classList.toggle('bg-ink-15', signup);
      tabSignup.classList.toggle('text-ink', signup);
      tabSignup.classList.toggle('text-ink-60', !signup);
      tabLogin.classList.toggle('bg-ink-15', !signup);
      tabLogin.classList.toggle('text-ink', !signup);
      tabLogin.classList.toggle('text-ink-60', signup);
      tabSignup.setAttribute('aria-pressed', signup ? 'true' : 'false');
      tabLogin.setAttribute('aria-pressed', signup ? 'false' : 'true');
      passwordInput.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
      submitBtn.textContent = signup ? 'Create Account' : 'Log In';
      checkUsernameAvailability();
      updatePasswordRequirements();
    }

    // Lets initProfilePopup's guest CTAs open this same modal on the right tab.
    openAuthModal = function (signup) {
      setMode(signup);
      setOpen(true);
    };

    setMode(true);
    tabSignup.addEventListener('click', function () { setMode(true); });
    tabLogin.addEventListener('click', function () { setMode(false); });
    usernameInput.addEventListener('input', checkUsernameAvailability);
    passwordInput.addEventListener('input', updatePasswordRequirements);
    termsCheckbox.addEventListener('change', syncTermsIcon);
    syncTermsIcon();
    form.addEventListener('input', updateSubmitState);

    trigger.addEventListener('click', function () {
      if (isLoggedIn()) return;
      setOpen(true);
    });

    if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });

    if (passwordToggleBtn) {
      passwordToggleBtn.addEventListener('click', function () {
        setPasswordVisible(passwordInput.type === 'password');
        passwordInput.focus();
      });
    }

    // No Google OAuth wired up yet — same "shell only" honesty as the
    // comments panel's "coming soon" placeholder, rather than faking success.
    if (googleBtn) {
      googleBtn.addEventListener('click', function () {
        showError("Google sign-in isn't set up yet.");
      });
    }

    if (forgotBtn) {
      forgotBtn.addEventListener('click', function () {
        showError('Password reset isn\'t set up yet.');
      });
    }

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) setOpen(false);
    });

    function showError(message) {
      showToast(message, { tone: 'error' });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // Mainly a defensive fallback — the submit button is disabled
      // whenever the form is invalid, so this normally isn't reachable.
      if (!form.checkValidity()) {
        showError(tabSignup.getAttribute('aria-pressed') === 'true'
          ? 'Fill in a username, author\'s name, valid email, and a password meeting all the requirements.'
          : 'Enter a valid email and password.');
        return;
      }

      var signup = tabSignup.getAttribute('aria-pressed') === 'true';
      var endpoint = signup ? '/app/signup' : '/app/login';
      var body = signup
        ? {
            username: usernameInput.value,
            authorName: authorNameInput.value,
            email: emailInput.value,
            password: passwordInput.value,
          }
        : { email: emailInput.value, password: passwordInput.value };

      submitBtn.disabled = true;
      var previousLabel = submitBtn.textContent;
      submitBtn.textContent = signup ? 'Creating…' : 'Logging in…';

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (result) {
          if (!result.ok) {
            if (result.data.field === 'username') {
              usernameInput.setCustomValidity(result.data.error || 'Username is taken.');
              setUsernameHint(result.data.error || 'Username is already taken', 'error');
            }
            showError(result.data.error || 'Something went wrong. Try again.');
            submitBtn.textContent = previousLabel;
            updateSubmitState();
            return;
          }
          // Signup's response is just {ok: true} — the fields we already
          // hold in the form are the same ones just written to the DB, so
          // there's nothing to gain by round-tripping them back down. Login
          // has no such form data to fall back on, so it uses what the
          // server actually found for this account.
          setUser(signup
            ? { username: usernameInput.value, authorName: authorNameInput.value, email: emailInput.value }
            : { username: result.data.username, authorName: result.data.authorName, email: result.data.email });
          setOpen(false);
          showToast(signup ? 'Your account was created successfully' : 'Logged in',
            { icon: signup ? 'mynaui:check-circle-solid' : 'mynaui:login-solid' });
        })
        .catch(function () {
          showError('Could not reach the server. Try again.');
          submitBtn.textContent = previousLabel;
          updateSubmitState();
        });
    });
  }

  // Create/edit-quote modal: a two-pane popup opened by the FAB (only for a
  // logged-in user — initAuthModal's own listener on the same button covers
  // the guest case). Left pane is a live square preview mirroring the
  // screenshot export's 1080x1080 shape; right pane is the actual form.
  // Publishing POSTs to /app/quotes (routes/app.js) and pushes the server's
  // saved copy — not the locally-built draft — into the quote deck, since
  // that's the one with a real id and a permanent bgImage URL.
  var MAX_HASHTAGS = 5;
  var HASHTAG_RE = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;
  var HASHTAG_SEARCH_DEBOUNCE_MS = 200;

  function initCreateQuoteModal(quoteDeck) {
    var fabBtn = document.getElementById('create-quote-btn');
    var backdrop = document.getElementById('create-quote-backdrop');
    var modal = document.getElementById('create-quote-modal');
    var cancelBtn = document.getElementById('cq-cancel-btn');
    var publishBtn = document.getElementById('cq-publish-btn');

    var textEl = document.getElementById('cq-text');
    var charCountEl = document.getElementById('cq-char-count');

    var uploadTabBtn = document.getElementById('cq-bg-tab-upload');
    var unsplashTabBtn = document.getElementById('cq-bg-tab-unsplash');
    var uploadPanelEl = document.getElementById('cq-bg-panel-upload');
    var unsplashPanelEl = document.getElementById('cq-bg-panel-unsplash');
    var bgFileInput = document.getElementById('cq-bg-file');
    var bgDropzoneEl = document.getElementById('cq-bg-dropzone');
    var bgPreviewRow = document.getElementById('cq-bg-preview-row');
    var bgPreviewThumb = document.getElementById('cq-bg-preview-thumb');
    var bgFilenameEl = document.getElementById('cq-bg-filename');
    var bgRemoveBtn = document.getElementById('cq-bg-remove-btn');
    var unsplashSearchInput = document.getElementById('cq-unsplash-search');
    var unsplashSearchBtn = document.getElementById('cq-unsplash-search-btn');
    var unsplashStatusEl = document.getElementById('cq-unsplash-status');
    var unsplashResultsEl = document.getElementById('cq-unsplash-results');
    var unsplashLoadMoreBtn = document.getElementById('cq-unsplash-load-more');

    var hashtagInput = document.getElementById('cq-hashtag-input');
    var hashtagSuggestionsEl = document.getElementById('cq-hashtag-suggestions');
    var hashtagChipsEl = document.getElementById('cq-hashtag-chips');

    var appreciationsToggle = document.getElementById('cq-pref-appreciations');
    var disapprovalsToggle = document.getElementById('cq-pref-disapprovals');
    var commentsToggle = document.getElementById('cq-pref-comments');
    var snapshotsToggle = document.getElementById('cq-pref-snapshots');
    var matureToggle = document.getElementById('cq-pref-mature');

    var previewTextEl = document.getElementById('cq-preview-text');
    var previewEl = document.getElementById('cq-preview');
    var previewContentEl = document.getElementById('cq-preview-content');
    var repositionBtn = document.getElementById('cq-reposition-btn');
    var repositionIconEl = document.getElementById('cq-reposition-icon');
    var previewStatsEl = document.getElementById('cq-preview-stats');
    var previewVotesEl = document.getElementById('cq-preview-vote');
    var previewLikeEl = document.getElementById('cq-preview-like');
    var previewVoteDividerEl = document.getElementById('cq-preview-vote-divider');
    var previewDislikeEl = document.getElementById('cq-preview-dislike');
    var previewCommentsEl = document.getElementById('cq-preview-comments');
    var previewAuthorEl = document.getElementById('cq-preview-author');
    var previewCreditEl = document.getElementById('cq-preview-bg-credit');
    var previewCreditAuthorEl = document.getElementById('cq-preview-bg-credit-author');

    if (!fabBtn || !backdrop || !modal || !textEl || !publishBtn) return;

    var hashtags = [];
    var prefAppreciations = true;
    var prefDisapprovals = true;
    var prefComments = true;
    var prefSnapshots = true;
    var prefMature = false;
    // The object URL backing a chosen device image. Revoked when the user
    // removes/replaces it or discards the whole modal — but NOT on publish,
    // where ownership transfers to the quote object living on in the deck.
    var bgObjectUrl = null;
    // The Unsplash photo chosen as a background, if any — { id, full,
    // downloadLocation, author }. Mutually exclusive with bgObjectUrl: only
    // one background slot exists, so picking one clears the other.
    var unsplashSelection = null;
    var unsplashResults = [];
    // How many of unsplashResults are currently shown in the grid — Unsplash
    // hands back 20 photos per request, but they're revealed to the user 9
    // at a time via "Load more", only reaching back to the API for another
    // page once every already-fetched photo has been shown.
    var UNSPLASH_DISPLAY_CHUNK = 9;
    var unsplashVisibleCount = 0;
    var unsplashQuery = '';
    var unsplashPage = 1;
    var unsplashTotalPages = 1;
    // Bumped on every new search so a slow, stale request can't clobber the
    // results of a newer one that already resolved.
    var unsplashRequestToken = 0;

    // Background reposition ("drag to reposition") state. Position is kept
    // as a background-position percentage pair — the same units CSS itself
    // uses — rather than pixels, so the value stays meaningful if it's later
    // applied to a differently-sized element (the full quote stage in
    // applyBackground(), further up this file, once the quote is published).
    var bgPositionX = 50;
    var bgPositionY = 50;
    // Natural pixel size of the current background image, fetched async once
    // it loads — needed to convert a drag's pixel distance into how far that
    // drag should move the position percentage (computeMaxDragOffsets()).
    var bgNaturalSize = null;
    var repositionActive = false;
    var dragState = null;

    function isOpen() {
      return backdrop.classList.contains('opacity-100');
    }

    function normalizeHashtag(raw) {
      return raw.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }

    function renderHashtagChips() {
      hashtagChipsEl.innerHTML = '';
      hashtags.forEach(function (tag) {
        var chip = document.createElement('span');
        chip.className = 'flex items-center gap-1.5 rounded-full border border-ink-10 bg-ink-15 px-3 py-1 text-xs';
        var label = document.createElement('span');
        label.textContent = '#' + tag;
        chip.appendChild(label);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'grid h-4 w-4 cursor-pointer place-items-center rounded-full text-ink-60 transition hover:text-ink';
        removeBtn.setAttribute('aria-label', 'Remove #' + tag);
        removeBtn.innerHTML = '<iconify-icon icon="mynaui:x" width="12"></iconify-icon>';
        removeBtn.addEventListener('click', function () {
          hashtags = hashtags.filter(function (t) { return t !== tag; });
          renderHashtagChips();
        });
        chip.appendChild(removeBtn);
        hashtagChipsEl.appendChild(chip);
      });
    }

    function addHashtag(raw) {
      var tag = normalizeHashtag(raw);
      if (!tag || !HASHTAG_RE.test(tag) || hashtags.indexOf(tag) !== -1) return;
      if (hashtags.length >= MAX_HASHTAGS) {
        showToast('You can add up to ' + MAX_HASHTAGS + ' hashtags.', { tone: 'error' });
        return;
      }
      hashtags.push(tag);
      renderHashtagChips();
    }

    function setSuggestionsOpen(open) {
      hashtagSuggestionsEl.classList.toggle('opacity-100', open);
      hashtagSuggestionsEl.classList.toggle('scale-100', open);
      hashtagSuggestionsEl.classList.toggle('pointer-events-auto', open);
      hashtagSuggestionsEl.classList.toggle('opacity-0', !open);
      hashtagSuggestionsEl.classList.toggle('scale-95', !open);
      hashtagSuggestionsEl.classList.toggle('pointer-events-none', !open);
    }

    function renderSuggestionMatches(matches) {
      hashtagSuggestionsEl.innerHTML = '';
      if (!matches.length) { setSuggestionsOpen(false); return; }
      matches.forEach(function (match) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-ink-15';
        var label = document.createElement('span');
        label.textContent = '#' + match.name;
        btn.appendChild(label);
        if (match.quoteCount > 0) {
          var count = document.createElement('span');
          count.className = 'text-xs text-ink-60';
          count.textContent = match.quoteCount;
          btn.appendChild(count);
        }
        btn.addEventListener('click', function () {
          addHashtag(match.name);
          hashtagInput.value = '';
          setSuggestionsOpen(false);
          hashtagInput.focus();
        });
        hashtagSuggestionsEl.appendChild(btn);
      });
      setSuggestionsOpen(true);
    }

    var hashtagSearchTimer = null;
    var hashtagSearchSeq = 0;

    // Debounced DB lookup against the Tag collection (GET
    // /app/hashtags/search) — mirrors checkUsernameAvailability's
    // debounce-timer + sequence-number guard above, so a slow, stale
    // request can't clobber suggestions for a query the user has since
    // moved past. This is a read on every debounced keystroke, but never a
    // write — writes only happen once per publish, in the
    // /app/hashtags/register call further down.
    function renderSuggestions() {
      clearTimeout(hashtagSearchTimer);
      var query = hashtagInput.value.trim().toLowerCase();
      if (!query) { hashtagSuggestionsEl.innerHTML = ''; setSuggestionsOpen(false); return; }

      var seq = ++hashtagSearchSeq;
      hashtagSearchTimer = setTimeout(function () {
        fetch('/app/hashtags/search?q=' + encodeURIComponent(query))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (seq !== hashtagSearchSeq) return; // superseded by a newer keystroke
            var matches = (data.tags || []).filter(function (t) {
              return hashtags.indexOf(t.name) === -1;
            });
            renderSuggestionMatches(matches);
          })
          .catch(function () {
            if (seq !== hashtagSearchSeq) return;
            setSuggestionsOpen(false);
          });
      }, HASHTAG_SEARCH_DEBOUNCE_MS);
    }

    hashtagInput.addEventListener('input', renderSuggestions);
    hashtagInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addHashtag(hashtagInput.value);
      hashtagInput.value = '';
      setSuggestionsOpen(false);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#cq-hashtag-input, #cq-hashtag-suggestions')) setSuggestionsOpen(false);
    });

    // Same flat, separator-divided look (and active-state treatment) as
    // the profile popup's Quotes/Saved/About tabs — text weight/color
    // instead of a sliding pill background.
    function setBgTab(tab) {
      var isUpload = tab === 'upload';
      uploadTabBtn.setAttribute('aria-pressed', isUpload ? 'true' : 'false');
      unsplashTabBtn.setAttribute('aria-pressed', isUpload ? 'false' : 'true');
      uploadTabBtn.classList.toggle('text-ink', isUpload);
      uploadTabBtn.classList.toggle('font-semibold', isUpload);
      uploadTabBtn.classList.toggle('text-ink-60', !isUpload);
      uploadTabBtn.classList.toggle('font-medium', !isUpload);
      unsplashTabBtn.classList.toggle('text-ink', !isUpload);
      unsplashTabBtn.classList.toggle('font-semibold', !isUpload);
      unsplashTabBtn.classList.toggle('text-ink-60', isUpload);
      unsplashTabBtn.classList.toggle('font-medium', isUpload);
      uploadPanelEl.classList.toggle('hidden', !isUpload);
      uploadPanelEl.classList.toggle('flex', isUpload);
      unsplashPanelEl.classList.toggle('hidden', isUpload);
      unsplashPanelEl.classList.toggle('flex', !isUpload);
    }
    uploadTabBtn.addEventListener('click', function () { setBgTab('upload'); });
    unsplashTabBtn.addEventListener('click', function () { setBgTab('unsplash'); });

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    // A strict "cover" fit only ever leaves slack in *one* axis: whichever
    // axis the image's aspect ratio overflows on. The other axis lands
    // exactly on the container's edge, with nowhere to drag — by
    // construction, not a bug (scale = max(cw/iw, ch/ih) always makes one of
    // the two ratios the exact fit). Rendering the background this much
    // larger than that strict fit guarantees headroom on both axes
    // regardless of the image's aspect ratio, so the crosshair drag always
    // has room to move in two dimensions.
    var PAN_ZOOM = 1.2;

    // Fetches the chosen background's real pixel size — needed to convert a
    // reposition drag's pixel distance into a position-percentage delta, and
    // to render it at the oversized PAN_ZOOM scale. Async and best-effort:
    // computeCoverRenderSize()/applyBgSize() just no-op on an unresolved
    // bgNaturalSize until it lands, leaving the plain 'cover' size in place.
    function loadBgNaturalSize(url) {
      bgNaturalSize = null;
      if (!url) return;
      var img = new Image();
      img.onload = function () {
        // The background may have already moved on to a different image by
        // the time this resolves — don't stamp a stale size in behind it.
        if (previewEl.style.backgroundImage.indexOf(url) === -1) return;
        bgNaturalSize = { w: img.naturalWidth, h: img.naturalHeight };
        applyBgSize();
        applyBgPosition();
      };
      img.src = url;
    }

    // The image's rendered box size at the PAN_ZOOM-scaled "cover" fit,
    // alongside the container rect that scale was computed against — shared
    // by applyBgSize() (what's actually painted) and computeMaxDragOffsets()
    // (how far a drag is allowed to move it), so the two can never disagree.
    function computeCoverRenderSize() {
      var rect = previewEl.getBoundingClientRect();
      var scale = Math.max(rect.width / bgNaturalSize.w, rect.height / bgNaturalSize.h) * PAN_ZOOM;
      return { w: bgNaturalSize.w * scale, h: bgNaturalSize.h * scale, rect: rect };
    }

    // Explicit pixel background-size, standing in for the 'cover' keyword —
    // needed because 'cover' always picks the strict minimal-fit scale, and
    // we want PAN_ZOOM's deliberate overshoot instead. The trade-off is that
    // it no longer re-adjusts itself on a container resize for free, hence
    // the window resize listener further down.
    function applyBgSize() {
      if (!bgNaturalSize) return;
      var size = computeCoverRenderSize();
      previewEl.style.backgroundSize = Math.round(size.w) + 'px ' + Math.round(size.h) + 'px';
    }

    function applyBgPosition() {
      previewEl.style.backgroundPosition = bgPositionX + '% ' + bgPositionY + '%';
    }

    // Toggled by cq-reposition-btn: strips the preview down to just the
    // background image so the user can drag it around underneath, the same
    // idea as the live stage's zen mode but scoped to this one control.
    function setRepositionMode(on) {
      if (on === repositionActive) return;
      repositionActive = on;
      previewContentEl.style.display = on ? 'none' : '';
      previewCreditEl.style.display = on ? 'none' : '';
      repositionBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      repositionBtn.setAttribute('aria-label', on ? 'Done repositioning' : 'Reposition background image');
      repositionIconEl.setAttribute('icon', on ? 'mynaui:check' : 'mynaui:move');
      previewEl.classList.toggle('cursor-grab', on);
      previewEl.style.touchAction = on ? 'none' : '';
      if (!on) {
        previewEl.classList.remove('cursor-grabbing');
        dragState = null;
      }
    }

    // How far (in px) the image can slide in each axis before its edge would
    // pull away from the preview's own edge and expose empty space — the
    // valid range for the PAN_ZOOM-scaled background's offset.
    function computeMaxDragOffsets() {
      if (!bgNaturalSize) return { x: 0, y: 0 };
      var size = computeCoverRenderSize();
      return {
        x: Math.max(0, size.w - size.rect.width),
        y: Math.max(0, size.h - size.rect.height),
      };
    }

    repositionBtn.addEventListener('click', function () {
      setRepositionMode(!repositionActive);
    });

    // The 'cover' fallback set in applyPreviewBackground (below) holds while
    // bgNaturalSize is still loading — once it's in, size stays correct on
    // its own except across a container resize (the modal reflowing at a
    // different breakpoint, or the window itself resizing while it's open).
    window.addEventListener('resize', function () {
      if (!isOpen() || !bgNaturalSize) return;
      applyBgSize();
    });

    previewEl.addEventListener('pointerdown', function (e) {
      if (!repositionActive || e.target.closest('#cq-reposition-btn')) return;
      var offsets = computeMaxDragOffsets();
      dragState = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startPctX: bgPositionX,
        startPctY: bgPositionY,
        maxOffsetX: offsets.x,
        maxOffsetY: offsets.y,
      };
      previewEl.setPointerCapture(e.pointerId);
      previewEl.classList.remove('cursor-grab');
      previewEl.classList.add('cursor-grabbing');
    });
    previewEl.addEventListener('pointermove', function (e) {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      var dx = e.clientX - dragState.startX;
      var dy = e.clientY - dragState.startY;
      // Moving the pointer right/down should drag the image right/down
      // (revealing more of its left/top edge) — the inverse of how a
      // background-position percentage itself moves the image.
      if (dragState.maxOffsetX > 0) {
        bgPositionX = clamp(dragState.startPctX - (dx / dragState.maxOffsetX) * 100, 0, 100);
      }
      if (dragState.maxOffsetY > 0) {
        bgPositionY = clamp(dragState.startPctY - (dy / dragState.maxOffsetY) * 100, 0, 100);
      }
      applyBgPosition();
    });
    function endDrag(e) {
      if (!dragState || (e && dragState.pointerId !== e.pointerId)) return;
      dragState = null;
      if (repositionActive) {
        previewEl.classList.remove('cursor-grabbing');
        previewEl.classList.add('cursor-grab');
      }
    }
    previewEl.addEventListener('pointerup', endDrag);
    previewEl.addEventListener('pointercancel', endDrag);

    // Same dark-overlay treatment as the live quote-stage's own
    // applyBackground — kept identical rather than inventing a second look
    // for what's meant to preview that exact rendering.
    function applyPreviewBackground(url, credit) {
      if (url) {
        bgPositionX = 50;
        bgPositionY = 50;
        previewEl.style.backgroundImage =
          'linear-gradient(180deg, rgba(0,0,0,.45), rgba(0,0,0,.65)), url("' + url + '")';
        // Fallback size/position until loadBgNaturalSize's onload lands and
        // upgrades this to the PAN_ZOOM-scaled explicit pixel size.
        previewEl.style.backgroundSize = 'cover';
        applyBgPosition();
        previewEl.classList.remove('quote-stage--fallback');
        previewEl.classList.add('on-bg-image');
        repositionBtn.classList.remove('hidden');
        repositionBtn.classList.add('grid');
        loadBgNaturalSize(url);
      } else {
        bgNaturalSize = null;
        bgPositionX = 50;
        bgPositionY = 50;
        setRepositionMode(false);
        previewEl.style.backgroundImage = '';
        previewEl.style.backgroundSize = '';
        previewEl.style.backgroundPosition = '';
        previewEl.classList.add('quote-stage--fallback');
        previewEl.classList.remove('on-bg-image');
        repositionBtn.classList.add('hidden');
        repositionBtn.classList.remove('grid');
      }
      // Unsplash's API guidelines require this credit to stay visible
      // wherever the photo is shown — a locally uploaded image has no
      // credit object, so callers for that path just omit it.
      if (credit) {
        previewCreditAuthorEl.href = credit.link;
        previewCreditAuthorEl.textContent = credit.name;
        previewCreditEl.classList.remove('hidden');
        previewCreditEl.classList.add('flex');
      } else {
        previewCreditEl.classList.add('hidden');
        previewCreditEl.classList.remove('flex');
      }
    }

    function showBgPreview(url, filename) {
      if (url) {
        bgPreviewThumb.src = url;
        bgFilenameEl.textContent = filename || '';
        bgPreviewRow.classList.remove('hidden');
        bgPreviewRow.classList.add('flex');
        bgDropzoneEl.classList.add('hidden');
      } else {
        bgPreviewThumb.src = '';
        bgPreviewRow.classList.add('hidden');
        bgPreviewRow.classList.remove('flex');
        bgDropzoneEl.classList.remove('hidden');
      }
      applyPreviewBackground(url);
    }

    bgDropzoneEl.addEventListener('click', function () { bgFileInput.click(); });
    bgFileInput.addEventListener('change', function () {
      var file = bgFileInput.files && bgFileInput.files[0];
      if (!file) return;
      if (!file.type || file.type.indexOf('image/') !== 0) {
        showToast('Please choose an image file.', { tone: 'error' });
        bgFileInput.value = '';
        return;
      }
      var MAX_BYTES = 10 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        showToast('Images must be under 10MB.', { tone: 'error' });
        bgFileInput.value = '';
        return;
      }
      if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
      bgObjectUrl = URL.createObjectURL(file);
      showBgPreview(bgObjectUrl, file.name);
      // Uploading a device image and picking an Unsplash photo share the
      // same single background slot — the upload just taken wins.
      if (unsplashSelection) {
        unsplashSelection = null;
        renderUnsplashResults();
      }
    });
    bgRemoveBtn.addEventListener('click', function () {
      if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
      bgObjectUrl = null;
      bgFileInput.value = '';
      showBgPreview(null);
    });

    function setUnsplashStatus(message, icon) {
      unsplashResultsEl.classList.add('hidden');
      unsplashResultsEl.classList.remove('grid');
      unsplashLoadMoreBtn.classList.add('hidden');
      if (!message) {
        unsplashStatusEl.classList.add('hidden');
        return;
      }
      unsplashStatusEl.classList.remove('hidden');
      unsplashStatusEl.innerHTML = '';
      if (icon) {
        var iconEl = document.createElement('iconify-icon');
        iconEl.setAttribute('icon', icon);
        iconEl.setAttribute('width', '24');
        unsplashStatusEl.appendChild(iconEl);
      }
      var span = document.createElement('span');
      span.textContent = message;
      unsplashStatusEl.appendChild(span);
    }

    // Selecting an Unsplash photo and selecting a device upload are
    // mutually exclusive — there's only one background slot, so whichever
    // is chosen last wins and clears the other's preview/state.
    function selectUnsplashPhoto(photo) {
      if (bgObjectUrl) {
        URL.revokeObjectURL(bgObjectUrl);
        bgObjectUrl = null;
        bgFileInput.value = '';
        showBgPreview(null);
      }
      unsplashSelection = (unsplashSelection && unsplashSelection.id === photo.id) ? null : photo;
      renderUnsplashResults();
      applyPreviewBackground(unsplashSelection ? unsplashSelection.full : null, unsplashSelection ? unsplashSelection.author : null);
    }

    function renderUnsplashResults() {
      unsplashResultsEl.innerHTML = '';
      unsplashResultsEl.classList.remove('hidden');
      unsplashResultsEl.classList.add('grid');
      // Neither aspect-ratio nor a padding-percent spacer reliably forces a
      // square here: nested inside this modal's chain of flex-1/overflow-y-auto
      // panes plus a scale-100 transform, Firefox's grid-auto-rows: auto
      // squashes every row to divide up max-h-72's height evenly instead of
      // sizing from content — confirmed only inside that real ancestor chain,
      // not in isolation, and not in Chromium/WebKit. An explicit pixel size
      // sidesteps the whole cross-engine auto-sizing question.
      var GAP_PX = 8;
      var itemSize = Math.floor((unsplashResultsEl.clientWidth - GAP_PX * 2) / 3);

      unsplashResults.slice(0, unsplashVisibleCount).forEach(function (photo) {
        var isSelected = !!unsplashSelection && unsplashSelection.id === photo.id;

        var item = document.createElement('div');
        // A real border, not a ring (box-shadow): a box-shadow ring's curve
        // at rounded corners is computed separately from the image's own
        // overflow-hidden clip curve, which can visibly mismatch. A border
        // shares the exact same corner geometry as the clip, so it can't.
        item.className = 'group relative cursor-pointer overflow-hidden rounded-lg border-2 transition ' +
          (isSelected ? 'border-ink' : 'border-transparent hover:border-ink-10');
        item.style.width = itemSize + 'px';
        item.style.height = itemSize + 'px';
        item.addEventListener('click', function (e) {
          if (e.target.closest('a')) return;
          selectUnsplashPhoto(photo);
        });

        var img = document.createElement('img');
        img.src = photo.thumb;
        img.alt = photo.description;
        img.className = 'h-full w-full object-cover';
        item.appendChild(img);

        if (isSelected) {
          var check = document.createElement('div');
          check.className = 'absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink text-surface';
          check.innerHTML = '<iconify-icon icon="mynaui:check" width="12"></iconify-icon>';
          item.appendChild(check);
        }

        // Unsplash's API guidelines require attributing the photographer
        // and Unsplash itself wherever a photo is shown, so this stays even
        // though it's the one non-selectable interactive bit in the grid.
        var attribution = document.createElement('div');
        attribution.className = 'pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t ' +
          'from-black/80 px-1.5 py-1 text-[9px] leading-tight text-white transition group-hover:translate-y-0';
        var authorLink = document.createElement('a');
        authorLink.href = photo.author.link;
        authorLink.target = '_blank';
        authorLink.rel = 'noopener noreferrer';
        authorLink.className = 'pointer-events-auto hover:underline';
        authorLink.textContent = photo.author.name;
        attribution.appendChild(authorLink);
        attribution.appendChild(document.createTextNode(' on Unsplash'));
        item.appendChild(attribution);

        unsplashResultsEl.appendChild(item);
      });
      unsplashStatusEl.classList.add('hidden');
      // More to show once either an already-fetched photo is still hidden,
      // or the API has another page we haven't fetched yet.
      var hasMoreToShow = unsplashVisibleCount < unsplashResults.length || unsplashPage < unsplashTotalPages;
      unsplashLoadMoreBtn.classList.toggle('hidden', !hasMoreToShow);
    }

    function runUnsplashSearch(query, page) {
      var token = ++unsplashRequestToken;
      unsplashQuery = query;
      unsplashPage = page;
      if (page === 1) {
        unsplashResults = [];
        unsplashVisibleCount = 0;
        setUnsplashStatus('Searching…', 'svg-spinners:6-dots-scale-middle');
      } else {
        unsplashLoadMoreBtn.disabled = true;
        unsplashLoadMoreBtn.textContent = 'Loading…';
      }

      fetch('/app/unsplash/search?query=' + encodeURIComponent(query) + '&page=' + page)
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          if (token !== unsplashRequestToken) return;
          if (!result.ok) {
            setUnsplashStatus(result.body.error || 'Something went wrong. Try again.', 'mynaui:danger-circle-solid');
            return;
          }
          unsplashTotalPages = result.body.totalPages || 1;
          unsplashResults = page === 1 ? result.body.results : unsplashResults.concat(result.body.results);
          if (!unsplashResults.length) {
            setUnsplashStatus('No photos found for “' + query + '”.', 'mynaui:info-circle');
            return;
          }
          unsplashVisibleCount = Math.min(unsplashVisibleCount + UNSPLASH_DISPLAY_CHUNK, unsplashResults.length);
          renderUnsplashResults();
        })
        .catch(function () {
          if (token !== unsplashRequestToken) return;
          setUnsplashStatus('Something went wrong. Try again.', 'mynaui:danger-circle-solid');
        })
        .then(function () {
          if (token !== unsplashRequestToken) return;
          unsplashLoadMoreBtn.disabled = false;
          unsplashLoadMoreBtn.textContent = 'Load more';
        });
    }

    function submitUnsplashSearch() {
      var query = unsplashSearchInput.value.trim();
      if (!query) return;
      runUnsplashSearch(query, 1);
    }

    if (unsplashSearchBtn) {
      unsplashSearchBtn.addEventListener('click', submitUnsplashSearch);
    }
    if (unsplashSearchInput) {
      unsplashSearchInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        submitUnsplashSearch();
      });
    }
    if (unsplashLoadMoreBtn) {
      unsplashLoadMoreBtn.addEventListener('click', function () {
        // Reveal more of what's already fetched before hitting the API
        // again for a fresh page of 20.
        if (unsplashVisibleCount < unsplashResults.length) {
          unsplashVisibleCount = Math.min(unsplashVisibleCount + UNSPLASH_DISPLAY_CHUNK, unsplashResults.length);
          renderUnsplashResults();
          return;
        }
        if (unsplashPage >= unsplashTotalPages) return;
        runUnsplashSearch(unsplashQuery, unsplashPage + 1);
      });
    }

    function setToggle(btn, on) {
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.classList.toggle('bg-ink', on);
      btn.classList.toggle('bg-ink-15', !on);
      var thumb = btn.querySelector('.cq-toggle-thumb');
      if (thumb) {
        thumb.classList.toggle('translate-x-5', on);
        thumb.classList.toggle('translate-x-0', !on);
      }
    }

    function updatePreviewStats() {
      previewLikeEl.classList.toggle('hidden', !prefAppreciations);
      previewDislikeEl.classList.toggle('hidden', !prefDisapprovals);
      previewVoteDividerEl.classList.toggle('hidden', !(prefAppreciations && prefDisapprovals));
      previewVotesEl.classList.toggle('hidden', !prefAppreciations && !prefDisapprovals);
      previewCommentsEl.classList.toggle('hidden', !prefComments);
      previewStatsEl.classList.toggle('hidden', !prefAppreciations && !prefDisapprovals && !prefComments);
    }

    appreciationsToggle.addEventListener('click', function () {
      prefAppreciations = !prefAppreciations;
      setToggle(appreciationsToggle, prefAppreciations);
      updatePreviewStats();
    });
    disapprovalsToggle.addEventListener('click', function () {
      prefDisapprovals = !prefDisapprovals;
      setToggle(disapprovalsToggle, prefDisapprovals);
      updatePreviewStats();
    });
    commentsToggle.addEventListener('click', function () {
      prefComments = !prefComments;
      setToggle(commentsToggle, prefComments);
      updatePreviewStats();
    });
    snapshotsToggle.addEventListener('click', function () {
      prefSnapshots = !prefSnapshots;
      setToggle(snapshotsToggle, prefSnapshots);
    });
    matureToggle.addEventListener('click', function () {
      prefMature = !prefMature;
      setToggle(matureToggle, prefMature);
    });

    // Spaces don't count toward the limit — only non-whitespace characters
    // do. There's no native maxlength for that, so the limit is enforced by
    // hand: truncate once the non-space count would exceed it, walking the
    // string instead of just slicing to MAX_QUOTE_CHARS raw characters so
    // whitespace already typed doesn't get counted against the writer.
    var MAX_QUOTE_CHARS = 110;

    function countChars(value) {
      return value.replace(/\s/g, '').length;
    }

    function enforceCharLimit() {
      var value = textEl.value;
      if (countChars(value) <= MAX_QUOTE_CHARS) return;
      var nonSpace = 0;
      for (var i = 0; i < value.length; i++) {
        if (!/\s/.test(value.charAt(i))) nonSpace++;
        if (nonSpace > MAX_QUOTE_CHARS) {
          textEl.value = value.slice(0, i);
          return;
        }
      }
    }

    function updateCharCount() {
      var len = countChars(textEl.value);
      charCountEl.textContent = len + '/' + MAX_QUOTE_CHARS;
      // Proportional, not fixed offsets, so the last-10%/last-3% warning
      // bands stay meaningful whatever MAX_QUOTE_CHARS is set to.
      var colorClass = len >= MAX_QUOTE_CHARS * 0.97 ? 'text-red-600' : len >= MAX_QUOTE_CHARS * 0.8 ? 'text-amber-600' : 'text-ink-60';
      charCountEl.classList.remove('text-ink-60', 'text-amber-600', 'text-red-600');
      charCountEl.classList.add(colorClass);
    }

    function updatePreviewText() {
      var value = textEl.value;
      previewTextEl.textContent = value || 'Your quote will appear here';
      previewTextEl.classList.toggle('text-ink-60', !value);
      previewTextEl.classList.toggle('text-ink', !!value);
      var len = value.length;
      previewTextEl.style.fontSize = len <= 60 ? '1.75rem' : len <= 120 ? '1.4rem' : len <= 200 ? '1.15rem' : '0.95rem';
    }

    function updatePreviewAuthor() {
      var user = getUser();
      previewAuthorEl.textContent = user ? (user.authorName || user.username || '') : '';
    }

    function updatePublishState() {
      publishBtn.disabled = textEl.value.trim().length === 0;
    }

    textEl.addEventListener('input', function () {
      enforceCharLimit();
      updateCharCount();
      updatePreviewText();
      updatePublishState();
    });

    function resetForm() {
      textEl.value = '';
      updateCharCount();
      updatePreviewText();
      bgFileInput.value = '';
      showBgPreview(null);
      setBgTab('upload');
      unsplashSelection = null;
      unsplashResults = [];
      unsplashVisibleCount = 0;
      unsplashQuery = '';
      unsplashPage = 1;
      unsplashTotalPages = 1;
      unsplashRequestToken++;
      unsplashSearchInput.value = '';
      setUnsplashStatus('Search for a photo to use as your background', 'mynaui:sparkles');
      hashtags = [];
      renderHashtagChips();
      hashtagInput.value = '';
      setSuggestionsOpen(false);
      prefAppreciations = true; setToggle(appreciationsToggle, true);
      prefDisapprovals = true; setToggle(disapprovalsToggle, true);
      prefComments = true; setToggle(commentsToggle, true);
      prefSnapshots = true; setToggle(snapshotsToggle, true);
      prefMature = false; setToggle(matureToggle, false);
      updatePreviewStats();
      updatePreviewAuthor();
      updatePublishState();
    }

    function setOpen(open) {
      backdrop.classList.toggle('opacity-100', open);
      backdrop.classList.toggle('pointer-events-auto', open);
      backdrop.classList.toggle('opacity-0', !open);
      backdrop.classList.toggle('pointer-events-none', !open);
      modal.classList.toggle('scale-100', open);
      modal.classList.toggle('scale-95', !open);
      if (open) {
        resetForm();
        textEl.focus();
      }
    }

    // Closing without publishing discards whatever local image was picked —
    // publish() clears bgObjectUrl itself first so that path never reaches
    // here with a URL that's actually still in use.
    function closeAndDiscard() {
      if (bgObjectUrl) {
        URL.revokeObjectURL(bgObjectUrl);
        bgObjectUrl = null;
      }
      setOpen(false);
    }

    fabBtn.addEventListener('click', function () {
      if (!isLoggedIn()) return;
      setOpen(true);
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeAndDiscard);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeAndDiscard();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) closeAndDiscard();
    });

    publishBtn.addEventListener('click', function () {
      var text = textEl.value.trim();
      if (!text) return;

      var formData = new FormData();
      formData.append('text', text);
      formData.append('hashtags', JSON.stringify(hashtags.slice()));
      formData.append('bgPosition', bgPositionX + '% ' + bgPositionY + '%');
      formData.append('showAppreciations', String(prefAppreciations));
      formData.append('showDisapprovals', String(prefDisapprovals));
      formData.append('allowComments', String(prefComments));
      formData.append('allowSnapshots', String(prefSnapshots));
      formData.append('matureAudience', String(prefMature));

      var bgFile = bgFileInput.files && bgFileInput.files[0];
      if (bgFile) {
        formData.append('bgSource', 'upload');
        formData.append('bgFile', bgFile);
      } else if (unsplashSelection) {
        formData.append('bgSource', 'unsplash');
        formData.append('bgImage', unsplashSelection.full);
        formData.append('bgCreditName', unsplashSelection.author.name);
        formData.append('bgCreditLink', unsplashSelection.author.link);
      } else {
        formData.append('bgSource', 'none');
      }

      publishBtn.disabled = true;
      var previousLabel = publishBtn.textContent;
      publishBtn.textContent = 'Publishing…';

      // Unsplash requires this ping the moment a photo is actually put to
      // use, not just shown in search results — fire-and-forget, since a
      // failed tracking call shouldn't block publishing the quote.
      if (unsplashSelection) {
        fetch('/app/unsplash/track-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ downloadLocation: unsplashSelection.downloadLocation }),
        }).catch(function () {});
      }
      // Records the hashtags against the Tag collection so their quoteCount
      // (shown in the search-while-typing suggestions above) reflects real
      // usage — fire-and-forget, same reasoning as the Unsplash ping above.
      if (hashtags.length) {
        fetch('/app/hashtags/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hashtags: hashtags.slice() }),
        }).catch(function () {});
      }

      // No explicit Content-Type here — the browser sets the multipart
      // boundary itself based on the FormData body.
      fetch('/app/quotes', { method: 'POST', body: formData })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (result) {
          if (!result.ok) {
            showToast(result.data.error || 'Could not publish your quote. Try again.', { tone: 'error' });
            publishBtn.disabled = false;
            publishBtn.textContent = previousLabel;
            return;
          }
          // Ownership of the object URL transfers away now that the quote
          // living in the deck points at the real, permanently-hosted
          // image the server just saved — closeAndDiscard must never
          // revoke it after this point.
          bgObjectUrl = null;
          if (quoteDeck && quoteDeck.addQuote) quoteDeck.addQuote(result.data.quote);
          showToast('Your quote was published', { icon: 'mynaui:check-circle-solid' });
          publishBtn.textContent = previousLabel;
          setOpen(false);
        })
        .catch(function () {
          showToast('Could not reach the server. Try again.', { tone: 'error' });
          publishBtn.disabled = false;
          publishBtn.textContent = previousLabel;
        });
    });
  }

  // Header profile control: a centered modal, same backdrop/scale pattern
  // (and z-40 layer) as the signup/login modal below rather than a
  // corner-anchored dropdown — the two are mutually exclusive (this one
  // only ever opens for a signed-in user, the other only for a guest) so
  // sharing that treatment doesn't risk them stacking on each other.
  // Guests get a login/signup prompt; signed-in users (per the
  // localStorage-backed state above — there's no real session to read yet)
  // get their identity and a Log Out action. Logged-out clicks skip this
  // popup entirely and go straight to the auth modal — there's nothing
  // this would tell a guest that the modal itself doesn't.
  function initProfilePopup() {
    var trigger = document.getElementById('profile-btn');
    var backdrop = document.getElementById('profile-backdrop');
    var modal = document.getElementById('profile-modal');
    var closeBtn = document.getElementById('profile-close-btn');
    var logoutBtn = document.getElementById('profile-logout-btn');
    var nameEl = document.getElementById('profile-menu-name');
    var handleEl = document.getElementById('profile-menu-handle');
    var quotesStatEl = document.getElementById('profile-stat-quotes');
    var appreciationsStatEl = document.getElementById('profile-stat-appreciations');
    var disapprovalsStatEl = document.getElementById('profile-stat-disapprovals');
    var tabs = modal ? modal.querySelectorAll('.profile-tab') : [];
    var tabPanels = {
      quotes: document.getElementById('profile-panel-quotes'),
      saved: document.getElementById('profile-panel-saved'),
      about: document.getElementById('profile-panel-about'),
    };
    if (!trigger || !backdrop || !modal) return;

    function isOpen() {
      return backdrop.classList.contains('opacity-100');
    }

    function render() {
      var user = getUser();
      if (!user || !nameEl || !handleEl) return;
      // Signup gives us a username to show as a handle; the login tab is
      // still a stub with only an email, which the name line already
      // covers, so there's no second line for it.
      nameEl.textContent = user.authorName || user.username || user.email || 'Your account';
      var handle = user.username ? '@' + user.username : '';
      handleEl.textContent = handle;
      handleEl.classList.toggle('hidden', !handle);
      // No backend field for any of these yet, so every account reads zero
      // across the board — accurate for a brand-new signup, same shell-only
      // honesty as the tab panels below.
      if (quotesStatEl) quotesStatEl.textContent = formatCompact(user.quoteCount);
      if (appreciationsStatEl) appreciationsStatEl.textContent = formatCompact(user.appreciations);
      if (disapprovalsStatEl) disapprovalsStatEl.textContent = formatCompact(user.disapprovals);
    }

    // Saved/About stay shell panels only (same "coming soon" honesty as the
    // comments panel) — no saved-quotes store or about content exists yet.
    // Quotes is real: GET /app/me/quotes backs it, loaded fresh every time
    // the popup opens (see setOpen below) rather than cached, so a quote
    // published earlier this session already shows up without extra wiring.
    var quotesLoadToken = 0;
    // Tracks the close() of whichever quote card's "more" menu is
    // currently open (see renderQuotesList below) — at most one at a
    // time, so opening a second closes the first. Declared once here
    // (not inside renderQuotesList) so the outside-click/Escape handlers
    // near the bottom of this function can stay registered once too,
    // instead of piling up a new listener on every quotes reload.
    var openCardMenuClose = null;

    // The empty-state and populated-list layouts need different alignment
    // on the same panel element (centered icon+message vs. a left-aligned,
    // scrollable stack of rows) — swapped by toggling this fixed pair of
    // classes rather than fighting the base flex/flex-col that
    // setActiveTab's visibility toggle already owns.
    var QUOTES_PANEL_EMPTY_CLASSES = ['items-center', 'text-center', 'py-6'];
    var QUOTES_PANEL_LIST_CLASSES = ['items-stretch'];

    function renderQuotesEmpty(message, icon) {
      var panel = tabPanels.quotes;
      if (!panel) return;
      openCardMenuClose = null;
      panel.classList.remove.apply(panel.classList, QUOTES_PANEL_LIST_CLASSES);
      panel.classList.add.apply(panel.classList, QUOTES_PANEL_EMPTY_CLASSES);
      panel.innerHTML = '';
      var iconEl = document.createElement('iconify-icon');
      iconEl.setAttribute('icon', icon);
      iconEl.setAttribute('width', '28');
      panel.appendChild(iconEl);
      var span = document.createElement('span');
      span.textContent = message;
      panel.appendChild(span);
    }

    function renderQuotesList(quotes) {
      var panel = tabPanels.quotes;
      if (!panel) return;
      openCardMenuClose = null;
      panel.classList.remove.apply(panel.classList, QUOTES_PANEL_EMPTY_CLASSES);
      panel.classList.add.apply(panel.classList, QUOTES_PANEL_LIST_CLASSES);
      panel.innerHTML = '';

      var grid = document.createElement('div');
      grid.className = 'grid w-full grid-cols-1 gap-3 sm:grid-cols-3';

      quotes.forEach(function (quote) {
        var card = document.createElement('div');
        card.className = 'relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-ink-10 p-3 text-center';

        // Mirrors applyBackground() on the main stage: the photo (if any)
        // this quote was actually published with, not a generic card fill —
        // same dark gradient overlay so the text stays legible, same
        // fallback-to-theme-surface when the quote has no bgImage.
        var textColorClass;
        if (quote.bgImage) {
          card.style.backgroundImage =
            'linear-gradient(180deg, rgba(0,0,0,.45), rgba(0,0,0,.65)), url("' + quote.bgImage + '")';
          card.style.backgroundSize = 'cover';
          card.style.backgroundPosition = quote.bgPosition || '50% 50%';
          card.style.textShadow = '0 1px 3px rgba(0,0,0,.8), 0 1px 10px rgba(0,0,0,.5)';
          textColorClass = 'text-white';
        } else {
          card.classList.add('quote-stage--fallback');
          textColorClass = 'text-ink';
        }

        var text = document.createElement('p');
        text.className = 'line-clamp-4 font-display text-xs ' + textColorClass;
        text.textContent = quote.text;
        card.appendChild(text);

        var stats = document.createElement('div');
        stats.className = 'flex flex-col items-center gap-1 text-[10px] ' +
          (quote.bgImage ? 'text-white' : 'text-ink-60');

        function buildStatRow(pairs) {
          var row = document.createElement('div');
          row.className = 'flex items-center justify-center gap-3';
          pairs.forEach(function (pair) {
            var stat = document.createElement('span');
            stat.className = 'flex items-center gap-1';
            var statIcon = document.createElement('iconify-icon');
            statIcon.setAttribute('icon', pair[0]);
            statIcon.setAttribute('width', '11');
            stat.appendChild(statIcon);
            stat.appendChild(document.createTextNode(formatCompact(pair[1])));
            row.appendChild(stat);
          });
          return row;
        }

        stats.appendChild(buildStatRow([
          ['mynaui:like', quote.likes],
          ['mynaui:dislike', quote.dislikes],
          ['mynaui:message-dots', quote.comments],
        ]));
        stats.appendChild(buildStatRow([
          ['mynaui:eye', quote.views],
          ['mynaui:camera', quote.screenshots],
        ]));
        card.appendChild(stats);

        var menuWrap = document.createElement('div');
        menuWrap.className = 'absolute right-2 top-2 z-20';

        var menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'grid cursor-pointer place-items-center rounded-full bg-surface-70 p-1.5 backdrop-blur transition hover:opacity-70';
        menuBtn.setAttribute('aria-label', 'More options');
        menuBtn.setAttribute('aria-haspopup', 'true');
        menuBtn.setAttribute('aria-expanded', 'false');
        var menuBtnIcon = document.createElement('iconify-icon');
        menuBtnIcon.setAttribute('icon', 'mynaui:dots-solid');
        menuBtnIcon.setAttribute('width', '14');
        menuBtn.appendChild(menuBtnIcon);

        var menu = document.createElement('div');
        menu.className = 'pointer-events-none absolute right-0 top-full z-10 mt-2 w-36 origin-top-right scale-95 rounded-xl border border-ink-10 bg-surface-70 p-1 text-left opacity-0 shadow-lg backdrop-blur transition';

        function closeThisMenu() { setMenuOpen(false); }

        function setMenuOpen(open) {
          if (open) {
            if (openCardMenuClose && openCardMenuClose !== closeThisMenu) openCardMenuClose();
            openCardMenuClose = closeThisMenu;
          } else if (openCardMenuClose === closeThisMenu) {
            openCardMenuClose = null;
          }
          menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
          menu.classList.toggle('opacity-100', open);
          menu.classList.toggle('scale-100', open);
          menu.classList.toggle('pointer-events-auto', open);
          menu.classList.toggle('opacity-0', !open);
          menu.classList.toggle('scale-95', !open);
          menu.classList.toggle('pointer-events-none', !open);
        }

        menuBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          setMenuOpen(menuBtn.getAttribute('aria-expanded') !== 'true');
        });

        function buildMenuItem(icon, label, onClick) {
          var itemBtn = document.createElement('button');
          itemBtn.type = 'button';
          itemBtn.className = 'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink transition hover:bg-ink-15';
          var itemIcon = document.createElement('iconify-icon');
          itemIcon.setAttribute('icon', icon);
          itemIcon.setAttribute('width', '15');
          itemBtn.appendChild(itemIcon);
          var itemLabel = document.createElement('span');
          itemLabel.textContent = label;
          itemBtn.appendChild(itemLabel);
          itemBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setMenuOpen(false);
            onClick();
          });
          return itemBtn;
        }

        // This panel only ever lists the signed-in user's own quotes (GET
        // /app/me/quotes already filters by authorUser server-side), so
        // Report never actually shows here — kept conditional so this same
        // card markup still does the right thing if it's ever reused on a
        // page showing someone else's quotes.
        var isAuthor = true;

        menu.appendChild(buildMenuItem('mynaui:edit-one', 'Edit', function () {
          showToast('Editing quotes is coming soon.', { icon: 'mynaui:check-circle-solid' });
        }));
        menu.appendChild(buildMenuItem('mynaui:share', 'Share', function () {
          var shareText = '"' + quote.text + '" — ' + (quote.author || 'Unknown');
          if (navigator.share) {
            navigator.share({ text: shareText }).catch(function () {});
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareText).then(function () {
              showToast('Copied to clipboard.', { icon: 'mynaui:check-circle-solid' });
            }).catch(function () {});
          }
        }));
        if (!isAuthor) {
          menu.appendChild(buildMenuItem('mynaui:flag', 'Report', function () {
            showToast('Thanks for the report. We’ll take a look.', { icon: 'mynaui:check-circle-solid' });
          }));
        }
        menu.appendChild(buildMenuItem('mynaui:trash', 'Delete', function () {
          showToast('Deleting quotes is coming soon.', { icon: 'mynaui:check-circle-solid' });
        }));

        menuWrap.appendChild(menuBtn);
        menuWrap.appendChild(menu);
        card.appendChild(menuWrap);

        grid.appendChild(card);
      });

      panel.appendChild(grid);
    }

    function loadQuotes() {
      var token = ++quotesLoadToken;
      fetch('/app/me/quotes')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (token !== quotesLoadToken) return; // superseded by a newer open/close
          var quotes = data.quotes || [];
          if (quotes.length) {
            renderQuotesList(quotes);
          } else {
            renderQuotesEmpty('Quotes you create will show up here.', 'boxicons:quote-right-alt');
          }
        })
        .catch(function () {
          if (token !== quotesLoadToken) return;
          renderQuotesEmpty("Couldn't load your quotes.", 'mynaui:exclamation-triangle');
        });
    }

    function setActiveTab(name) {
      tabs.forEach(function (tab) {
        var active = tab.dataset.tab === name;
        tab.setAttribute('aria-pressed', active ? 'true' : 'false');
        tab.classList.toggle('text-ink', active);
        tab.classList.toggle('font-semibold', active);
        tab.classList.toggle('text-ink-60', !active);
        tab.classList.toggle('font-medium', !active);
        var icon = tab.querySelector('iconify-icon');
        if (icon) icon.setAttribute('icon', active ? icon.dataset.iconSolid : icon.dataset.icon);
      });
      Object.keys(tabPanels).forEach(function (key) {
        var panel = tabPanels[key];
        if (!panel) return;
        panel.classList.toggle('hidden', key !== name);
        panel.classList.toggle('flex', key === name);
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { setActiveTab(tab.dataset.tab); });
    });

    function setOpen(open) {
      if (open) {
        render();
        setActiveTab('quotes');
        loadQuotes();
      }
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      backdrop.classList.toggle('opacity-100', open);
      backdrop.classList.toggle('pointer-events-auto', open);
      backdrop.classList.toggle('opacity-0', !open);
      backdrop.classList.toggle('pointer-events-none', !open);
      modal.classList.toggle('scale-100', open);
      modal.classList.toggle('scale-95', !open);
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!isLoggedIn()) {
        openAuthModal(false);
        return;
      }
      setOpen(!isOpen());
    });

    if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        fetch('/app/logout', { method: 'POST' }).catch(function () {});
        clearUser();
        setOpen(false);
        showToast('Logged out', { icon: 'mynaui:logout-solid' });
      });
    }

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) setOpen(false);
    });

    // A quote card's own "more" menu (built in renderQuotesList above) has
    // no ids to bind per-instance listeners to, so it's closed from here
    // instead: one shared outside-click/Escape handler for however many
    // cards are currently rendered, rather than one pair per card that
    // would pile up across every quotes reload.
    document.addEventListener('click', function () {
      if (openCardMenuClose) openCardMenuClose();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (openCardMenuClose) { openCardMenuClose(); return; }
      if (isOpen()) setOpen(false);
    });

    // Keeps the popup's own content correct if auth state changes without
    // a page reload (e.g. logging in from the auth modal while this menu
    // happens to still be open behind it).
    document.addEventListener('yqi:auth-change', function () {
      if (isOpen()) render();
    });
  }

  // Header "menu" control: search/browse categories (Tag docs, the same
  // collection the create-quote hashtag composer writes to) and pin up to
  // MAX_PINNED_TAGS as badges. Confirming feeds quoteDeck.refreshRecommendations
  // (initQuoteDeck, above) so the deck actually re-ranks/pulls in matching
  // quotes — see PINNED_TAGS_KEY/loadPinnedTags near the top of this file.
  // Same centered backdrop/scale modal as the profile popup above, open to
  // guests too (no auth gate — unlike that one).
  // No header/close-x — Confirm/Cancel in the footer are the only exits,
  // so pin/unpin edits stay a draft (`pinned`) against the last-saved
  // snapshot (`pinnedSnapshot`) until Confirm; Cancel, the backdrop, and
  // Escape all discard the draft instead of saving it.
  var MAX_PINNED_TAGS = 5;
  var CATEGORY_SEARCH_DEBOUNCE_MS = 200;
  var DISCOVER_LIMIT = 12;

  function initCategoriesPopup(quoteDeck) {
    var trigger = document.getElementById('menu-btn');
    var backdrop = document.getElementById('categories-backdrop');
    var modal = document.getElementById('categories-modal');
    var cancelBtn = document.getElementById('categories-cancel-btn');
    var confirmBtn = document.getElementById('categories-confirm-btn');
    var searchInput = document.getElementById('categories-search-input');
    var searchSuggestionsEl = document.getElementById('categories-search-suggestions');
    var pinnedListEl = document.getElementById('categories-pinned-list');
    var pinnedEmptyEl = document.getElementById('categories-pinned-empty');
    var pinnedCountEl = document.getElementById('categories-pinned-count');
    var discoverListEl = document.getElementById('categories-discover-list');
    var discoverEmptyEl = document.getElementById('categories-discover-empty');
    var discoverRefreshBtn = document.getElementById('categories-discover-refresh-btn');
    if (!trigger || !backdrop || !modal) return;

    // `pinned` is the in-session draft the badges/Discover grid render from;
    // `pinnedSnapshot` is the last-confirmed set on disk. Only Confirm
    // copies the draft into the snapshot and persists it — Cancel, the
    // backdrop, and Escape all just restore the draft from the snapshot.
    var pinnedSnapshot = loadPinnedTags();
    var pinned = pinnedSnapshot.slice();
    // The last batch fetched by loadDiscover(), re-filtered against `pinned`
    // on every pin/unpin so removing a pin can bring it back into view
    // without a fresh request.
    var discoverResults = [];

    function isOpen() {
      return backdrop.classList.contains('opacity-100');
    }

    function isPinned(name) {
      return pinned.some(function (t) { return t.name === name; });
    }

    function renderPinned() {
      pinnedListEl.innerHTML = '';
      pinned.forEach(function (tag) {
        var badge = document.createElement('span');
        badge.className = 'flex items-center gap-1.5 rounded-full border border-ink-10 bg-ink-15 px-3 py-1.5 text-xs';

        var name = document.createElement('span');
        name.className = 'font-medium';
        name.textContent = tag.name;
        badge.appendChild(name);

        var count = document.createElement('span');
        count.className = 'text-ink-60';
        count.textContent = formatCompact(tag.quoteCount);
        badge.appendChild(count);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'grid h-4 w-4 cursor-pointer place-items-center rounded-full text-ink-60 transition hover:text-ink';
        removeBtn.setAttribute('aria-label', 'Unpin ' + tag.name);
        removeBtn.innerHTML = '<iconify-icon icon="mynaui:x" width="12"></iconify-icon>';
        removeBtn.addEventListener('click', function () { removePin(tag.name); });
        badge.appendChild(removeBtn);

        pinnedListEl.appendChild(badge);
      });
      pinnedEmptyEl.classList.toggle('hidden', pinned.length > 0);
      pinnedCountEl.textContent = pinned.length + '/' + MAX_PINNED_TAGS + ' pinned';
    }

    function addPin(tag) {
      if (isPinned(tag.name)) return;
      if (pinned.length >= MAX_PINNED_TAGS) {
        showToast('You can pin up to ' + MAX_PINNED_TAGS + ' categories.', { tone: 'error' });
        return;
      }
      pinned.push({ name: tag.name, quoteCount: tag.quoteCount || 0 });
      renderPinned();
      renderDiscoverMatches(discoverResults);
    }

    function removePin(name) {
      pinned = pinned.filter(function (t) { return t.name !== name; });
      renderPinned();
      renderDiscoverMatches(discoverResults);
    }

    // --- Search: debounced lookup against GET /app/hashtags/search (the
    // same Tag-backed endpoint the create-quote hashtag composer uses) ---

    function setSearchSuggestionsOpen(open) {
      searchSuggestionsEl.classList.toggle('opacity-100', open);
      searchSuggestionsEl.classList.toggle('scale-100', open);
      searchSuggestionsEl.classList.toggle('pointer-events-auto', open);
      searchSuggestionsEl.classList.toggle('opacity-0', !open);
      searchSuggestionsEl.classList.toggle('scale-95', !open);
      searchSuggestionsEl.classList.toggle('pointer-events-none', !open);
    }

    function renderSearchMatches(matches) {
      searchSuggestionsEl.innerHTML = '';
      if (!matches.length) { setSearchSuggestionsOpen(false); return; }
      matches.forEach(function (match) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-ink-15';
        var label = document.createElement('span');
        label.textContent = match.name;
        btn.appendChild(label);
        var count = document.createElement('span');
        count.className = 'text-xs text-ink-60';
        count.textContent = formatCompact(match.quoteCount);
        btn.appendChild(count);
        btn.addEventListener('click', function () {
          addPin(match);
          searchInput.value = '';
          setSearchSuggestionsOpen(false);
          searchInput.focus();
        });
        searchSuggestionsEl.appendChild(btn);
      });
      setSearchSuggestionsOpen(true);
    }

    var searchTimer = null;
    var searchSeq = 0;

    function renderSearchSuggestions() {
      clearTimeout(searchTimer);
      var query = searchInput.value.trim().toLowerCase();
      if (!query) { searchSuggestionsEl.innerHTML = ''; setSearchSuggestionsOpen(false); return; }

      var seq = ++searchSeq;
      searchTimer = setTimeout(function () {
        fetch('/app/hashtags/search?q=' + encodeURIComponent(query))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (seq !== searchSeq) return; // superseded by a newer keystroke
            var matches = (data.tags || []).filter(function (t) { return !isPinned(t.name); });
            renderSearchMatches(matches);
          })
          .catch(function () {
            if (seq !== searchSeq) return;
            setSearchSuggestionsOpen(false);
          });
      }, CATEGORY_SEARCH_DEBOUNCE_MS);
    }

    searchInput.addEventListener('input', renderSearchSuggestions);
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#categories-search-input, #categories-search-suggestions')) setSearchSuggestionsOpen(false);
    });

    // --- Discover: a random sample from GET /app/tags/suggestions today;
    // that route is the seam for a later popularity-ranked version ---

    var discoverSeq = 0;

    function renderDiscoverMatches(tags) {
      discoverResults = tags;
      discoverListEl.innerHTML = '';
      var visible = tags.filter(function (t) { return !isPinned(t.name); });
      discoverEmptyEl.classList.toggle('hidden', visible.length > 0);
      visible.forEach(function (tag) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'flex cursor-pointer items-center gap-1.5 rounded-full border border-ink-10 px-3 py-1.5 text-xs transition hover:bg-ink-15';
        chip.innerHTML = '<iconify-icon icon="mynaui:plus" width="12"></iconify-icon>';
        var name = document.createElement('span');
        name.className = 'font-medium';
        name.textContent = tag.name;
        chip.appendChild(name);
        var count = document.createElement('span');
        count.className = 'text-ink-60';
        count.textContent = formatCompact(tag.quoteCount);
        chip.appendChild(count);
        chip.addEventListener('click', function () { addPin(tag); });
        discoverListEl.appendChild(chip);
      });
    }

    function loadDiscover() {
      var seq = ++discoverSeq;
      var exclude = pinned.map(function (t) { return t.name; }).join(',');
      fetch('/app/tags/suggestions?limit=' + DISCOVER_LIMIT + '&exclude=' + encodeURIComponent(exclude))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (seq !== discoverSeq) return; // superseded by a newer request
          renderDiscoverMatches(data.tags || []);
        })
        .catch(function () {
          if (seq !== discoverSeq) return;
          renderDiscoverMatches([]);
        });
    }

    if (discoverRefreshBtn) discoverRefreshBtn.addEventListener('click', loadDiscover);

    // --- Open/close: no close-x here (see the file comment above
    // initCategoriesPopup) — setOpen itself never persists or discards
    // anything; that's cancel()/confirm() below, the only two paths that
    // call it. ---

    function setOpen(open) {
      if (open) {
        pinned = pinnedSnapshot.slice();
        renderPinned();
        loadDiscover();
        searchInput.value = '';
        setSearchSuggestionsOpen(false);
      }
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      backdrop.classList.toggle('opacity-100', open);
      backdrop.classList.toggle('pointer-events-auto', open);
      backdrop.classList.toggle('opacity-0', !open);
      backdrop.classList.toggle('pointer-events-none', !open);
      modal.classList.toggle('scale-100', open);
      modal.classList.toggle('scale-95', !open);
    }

    // Discards the in-session draft (any pins/unpins since open) back to
    // the last-confirmed snapshot.
    function cancel() {
      pinned = pinnedSnapshot.slice();
      setOpen(false);
    }

    // Commits the draft as the new snapshot and persists it.
    function confirm() {
      pinnedSnapshot = pinned.slice();
      savePinnedTags(pinnedSnapshot);
      setOpen(false);
      if (quoteDeck && quoteDeck.refreshRecommendations) quoteDeck.refreshRecommendations();
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    if (cancelBtn) cancelBtn.addEventListener('click', cancel);
    if (confirmBtn) confirmBtn.addEventListener('click', confirm);

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) cancel();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) cancel();
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

    // Screen Wake Lock: zen mode is meant to be watched/left on display,
    // so the screen shouldn't dim or sleep while it's active. The lock is
    // requested/released purely off the `is-zen` class so it stays in sync
    // no matter which path (button, Esc, browser chrome, CSS-only
    // fallback) changed it. Unsupported browsers just no-op.
    var wakeLock = null;

    function requestWakeLock() {
      if (!('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
      }).catch(function () {});
    }

    function releaseWakeLock() {
      if (!wakeLock) return;
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }

    function syncWakeLock() {
      if (isZen()) {
        requestWakeLock();
      } else {
        releaseWakeLock();
      }
    }

    // The wake lock is automatically released by the browser whenever the
    // tab is hidden (switched away, minimized) — re-request it once zen
    // mode is back in view so playback left running in the background
    // keeps the screen awake again.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && isZen()) {
        requestWakeLock();
      }
    });

    // Only reacts to genuine fullscreen transitions (Esc, browser chrome,
    // this button's own successful request) — never fires for the
    // CSS-only fallback, so that path is untouched by this listener.
    document.addEventListener('fullscreenchange', function () {
      stage.classList.toggle(ZEN_CLASS, document.fullscreenElement === stage);
      syncState();
      syncWakeLock();
    });

    function exitZen() {
      stage.classList.remove(ZEN_CLASS);
      if (document.fullscreenElement === stage && document.exitFullscreen) {
        document.exitFullscreen();
      }
      syncState();
      syncWakeLock();
    }

    btn.addEventListener('click', function () {
      if (isZen()) {
        exitZen();
      } else {
        stage.classList.add(ZEN_CLASS);
        syncState();
        syncWakeLock();
        if (stage.requestFullscreen) {
          stage.requestFullscreen().catch(function () {});
        }
      }
    });

    // Real fullscreen's own Esc handling only fires fullscreenchange when
    // requestFullscreen actually succeeded — in the CSS-only fallback
    // there's no browser-driven Esc behavior at all, so this button click
    // aside, Esc would otherwise do nothing. Handled here regardless of
    // which mode is active, as a keyboard-only backup to the button.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isZen()) exitZen();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncUserFromServer();
    initThemeSwitcher();
    initThemeCycler();
    var quoteDeck = initQuoteDeck();
    initQuoteMenu();
    initCommentsPanel(quoteDeck);
    initAuthModal();
    initCreateQuoteModal(quoteDeck);
    initProfilePopup();
    initCategoriesPopup(quoteDeck);
    initScreenshotButton();
    initFullscreenButton();
  });
})();
