// Playa — Cyberdeck 20XX Lo-Fi Terminal & Neon Room Controller
// All interactive elements map 1:1 to the painted artwork hotspots.
(function () {
  let isInitialized = false;
  let rainAnimId = null;
  let steamAnimId = null;

  function $(id) { return document.getElementById(id); }

  let loadedTracks = [];
  let dialValues = {
    vol: 0.85,
    bass: 0,
    treb: 0
  };

  function getActiveSkin() {
    return document.documentElement.dataset.skin || 'classic';
  }

  function init() {
    if (isInitialized) return;
    const container = $('cyberdeck-container');
    if (!container) return;

    attachEventListeners();
    initRainCanvas();
    initSteamCanvas();
    isInitialized = true;

    window.addEventListener('playa:skinchange', (e) => {
      if (e.detail && e.detail.skin === 'cyberdeck') {
        syncAll();
      }
    });

    window.addEventListener('playa:playerupdate', syncAll);

    // Initial sync
    syncAll();
  }

  // --------------------------------------------------------------------------
  // Synchronize Player State with In-Scene Hotspots
  // --------------------------------------------------------------------------
  function syncAll() {
    if (getActiveSkin() !== 'cyberdeck') return;

    const audio = $('native-audio');
    const P = window.PlayaPlayer;
    const track = P ? P.state.currentTrack : null;
    const isPlaying = audio ? !audio.paused : false;

    // 1. CRT Screen Live Now Playing Title
    const titleEl = $('cd-marquee-title');
    if (titleEl) {
      if (track) {
        titleEl.textContent = `${track.title} // ${track.artist || 'UNKNOWN'}`;
      } else {
        titleEl.textContent = 'SYSTEM READY // SELECT TRACK FROM VAULT';
      }
    }

    const drawerNow = $('cd-drawer-now-playing');
    if (drawerNow) {
      drawerNow.textContent = track ? `${track.title} - ${track.artist || 'Unknown'}` : 'NOTHING';
    }

    // 2. Cassette Spools Spinning State
    const spoolLeft = $('cd-spool-left');
    const spoolRight = $('cd-spool-right');
    if (spoolLeft) spoolLeft.classList.toggle('spinning', isPlaying);
    if (spoolRight) spoolRight.classList.toggle('spinning', isPlaying);

    // 3. Repeat Button Hotspot State
    if (P) {
      const loopBtn = $('cd-btn-loop');
      if (loopBtn) loopBtn.classList.toggle('active', P.state.repeatMode !== 'none');
    }

    // 4. Populate Tracklist
    if (loadedTracks.length === 0) {
      fetchTracks();
    } else {
      updateActiveTrackHighlight();
    }
  }

  // --------------------------------------------------------------------------
  // Vault Tracks & Drawer
  // --------------------------------------------------------------------------
  async function fetchTracks() {
    try {
      const res = await fetch('/api/tracks');
      if (!res.ok) return;
      const data = await res.json();
      loadedTracks = Array.isArray(data) ? data : (data.tracks || []);
      const countEl = $('cd-drawer-count');
      if (countEl) countEl.textContent = `${loadedTracks.length} TRACKS`;
      renderTracklist();
    } catch (e) {
      console.warn("Cyberdeck fetch tracks error:", e);
    }
  }

  function renderTracklist() {
    const list = $('cd-playlist-scroll');
    if (!list) return;

    const P = window.PlayaPlayer;
    const currentId = P && P.state.currentTrack ? P.state.currentTrack.id : null;

    list.innerHTML = loadedTracks.map((t, i) => {
      const isActive = currentId && String(currentId) === String(t.id);
      const m = Math.floor((t.duration || 0) / 60);
      const s = Math.floor((t.duration || 0) % 60);
      const dur = `${m}:${s < 10 ? '0' : ''}${s}`;
      return `
        <div class="cd-track-row${isActive ? ' active' : ''}" data-index="${i}" data-id="${t.id}" title="${escapeHtml(t.artist)} - ${escapeHtml(t.title)}">
          <span class="cd-track-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="cd-track-name">${escapeHtml(t.title)}</span>
          <span class="cd-track-dur">${dur}</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.cd-track-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.index, 10);
        const P = window.PlayaPlayer;
        if (P) {
          P.setQueue(loadedTracks, idx);
        }
      });
    });
  }

  function updateActiveTrackHighlight() {
    const P = window.PlayaPlayer;
    const currentId = P && P.state.currentTrack ? P.state.currentTrack.id : null;
    document.querySelectorAll('.cd-track-row').forEach(row => {
      const active = String(row.dataset.id) === String(currentId);
      row.classList.toggle('active', active);
    });
  }

  function setDrawerOpen(open) {
    const drawer = $('cd-vault-drawer');
    if (drawer) {
      drawer.classList.toggle('open', open);
    }
  }

  // --------------------------------------------------------------------------
  // Attach Event Listeners for In-Scene Hotspots
  // --------------------------------------------------------------------------
  function attachEventListeners() {
    const audio = $('native-audio');

    // 1. CRT Screen Transport Buttons (PLAY, PAUSE, STOP, NEXT, PREV, LOOP)
    const btnPlay = $('cd-btn-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        const P = window.PlayaPlayer;
        if (P && !P.state.isPlaying) P.togglePlay();
      });
    }

    const btnPause = $('cd-btn-pause');
    if (btnPause) {
      btnPause.addEventListener('click', (e) => {
        e.stopPropagation();
        const P = window.PlayaPlayer;
        if (P && P.state.isPlaying) P.togglePlay();
      });
    }

    const btnStop = $('cd-btn-stop');
    if (btnStop) {
      btnStop.addEventListener('click', (e) => {
        e.stopPropagation();
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
    }

    const btnNext = $('cd-btn-next');
    if (btnNext) {
      btnNext.addEventListener('click', (e) => {
        e.stopPropagation();
        const P = window.PlayaPlayer;
        if (P) P.playNext();
      });
    }

    const btnPrev = $('cd-btn-prev');
    if (btnPrev) {
      btnPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        const P = window.PlayaPlayer;
        if (P) P.playPrev();
      });
    }

    const btnLoop = $('cd-btn-loop');
    if (btnLoop) {
      btnLoop.addEventListener('click', (e) => {
        e.stopPropagation();
        const mainRepeat = $('btn-repeat');
        if (mainRepeat) mainRepeat.click();
      });
    }

    // 2. Cassette Deck Click: Play / Pause
    const cassette = $('cd-cassette-trigger');
    if (cassette) {
      cassette.addEventListener('click', () => {
        const P = window.PlayaPlayer;
        if (P) P.togglePlay();
      });
    }

    // 3. Power Switch on Deck: Play / Pause / Standby
    const powerBtn = $('cd-btn-power');
    if (powerBtn) {
      powerBtn.addEventListener('click', () => {
        const P = window.PlayaPlayer;
        if (P) P.togglePlay();
      });
    }

    // 4. CRT Screen Click: Toggle Vault Terminal Drawer
    const crtGlass = $('cd-crt-glass-trigger');
    if (crtGlass) {
      crtGlass.addEventListener('click', () => {
        const drawer = $('cd-vault-drawer');
        const isOpen = drawer && drawer.classList.contains('open');
        setDrawerOpen(!isOpen);
      });
    }

    // 5. Vault Toggle Tab & Close Button
    const vaultTab = $('cd-btn-vault-toggle');
    if (vaultTab) {
      vaultTab.addEventListener('click', () => {
        setDrawerOpen(true);
      });
    }

    const closeBtn = $('cd-vault-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        setDrawerOpen(false);
      });
    }

    // 6. Skin Switcher Button
    const skinBtn = $('cd-btn-skin');
    if (skinBtn) {
      skinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.PlayaSkins) {
          const list = window.PlayaSkins.list;
          const cur = window.PlayaSkins.get();
          const idx = list.findIndex(s => s.id === cur);
          const next = list[(idx + 1) % list.length];
          window.PlayaSkins.apply(next.id);
        }
      });
    }

    // 7. Coffee Mug Easter Egg Click
    const mug = $('cd-coffee-mug-zone');
    if (mug) {
      mug.addEventListener('click', () => {
        spawnSteamBurst();
      });
    }

    // 8. Rotary Knobs (Volume, Bass, Treble)
    setupKnob('cd-dial-vol', 'cd-hud-vol', (val) => {
      dialValues.vol = val;
      if (audio) audio.volume = val;
      const volFill = $('volume-fill');
      if (volFill) volFill.style.width = `${val * 100}%`;
      return `VOL: ${Math.round(val * 100)}%`;
    }, 0.85);

    setupKnob('cd-dial-bass', 'cd-hud-bass', (val) => {
      dialValues.bass = (val - 0.5) * 12;
      const sign = dialValues.bass > 0 ? '+' : '';
      return `BASS: ${sign}${dialValues.bass.toFixed(1)}dB`;
    }, 0.5);

    setupKnob('cd-dial-treb', 'cd-hud-treb', (val) => {
      dialValues.treb = (val - 0.5) * 12;
      const sign = dialValues.treb > 0 ? '+' : '';
      return `TREB: ${sign}${dialValues.treb.toFixed(1)}dB`;
    }, 0.5);

    // Keyboard Shortcuts while in Cyberdeck
    window.addEventListener('keydown', (e) => {
      if (getActiveSkin() !== 'cyberdeck') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        const P = window.PlayaPlayer;
        if (P) P.togglePlay();
      } else if (e.code === 'ArrowRight') {
        const P = window.PlayaPlayer;
        if (P) P.playNext();
      } else if (e.code === 'ArrowLeft') {
        const P = window.PlayaPlayer;
        if (P) P.playPrev();
      } else if (e.key === 'Escape') {
        setDrawerOpen(false);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Rotary Knob Controller
  // --------------------------------------------------------------------------
  function setupKnob(id, hudId, onValChange, initialNorm = 0.5) {
    const el = $(id);
    const hud = $(hudId);
    if (!el) return;

    let isDragging = false;
    let startY = 0;
    let currentVal = initialNorm;

    function applyVal(v) {
      currentVal = Math.max(0, Math.min(1, v));
      if (onValChange && hud) {
        hud.textContent = onValChange(currentVal);
      }
    }

    applyVal(currentVal);

    el.addEventListener('pointerdown', (e) => {
      isDragging = true;
      startY = e.clientY;
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaY = startY - e.clientY;
      startY = e.clientY;
      applyVal(currentVal + deltaY * 0.008);
    });

    el.addEventListener('pointerup', (e) => {
      isDragging = false;
      el.classList.remove('dragging');
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      applyVal(currentVal + delta);
    }, { passive: false });
  }

  // --------------------------------------------------------------------------
  // Wavering Coffee Mug Steam Animation (Directly from Kowloon cup opening)
  // --------------------------------------------------------------------------
  let steamParticles = [];

  class SteamParticle {
    constructor(w, h, startY = null) {
      this.w = w;
      this.h = h;
      this.reset(startY);
    }

    reset(customY = null) {
      // Cup rim opening is centered at x=30 in 60px canvas
      this.baseX = this.w * 0.5 + (Math.random() - 0.5) * 12;
      this.x = this.baseX;
      this.y = customY !== null ? customY : this.h - 6 - Math.random() * 6;
      this.vy = -(0.38 + Math.random() * 0.35);
      this.vx = 0.05 + (Math.random() - 0.5) * 0.12; // slight drift right matching drawn steam
      this.radius = 1.6 + Math.random() * 1.5;
      this.maxRadius = 8 + Math.random() * 6;
      this.growth = 0.05 + Math.random() * 0.04;
      this.life = 0;
      this.maxLife = 180 + Math.random() * 100;
      this.maxOpacity = 0.18 + Math.random() * 0.14;
      this.opacity = 0;
      this.phase = Math.random() * Math.PI * 2;
      this.swaySpeed = 0.024 + Math.random() * 0.015;
      this.swayAmp = 4 + Math.random() * 5;
    }

    update() {
      this.life++;
      if (this.life >= this.maxLife) {
        this.reset();
        return;
      }
      const progress = this.life / this.maxLife;

      // Organic sinusoidal drift right along the hand-drawn steam
      this.baseX += this.vx;
      this.x = this.baseX + Math.sin(this.phase + this.life * this.swaySpeed) * this.swayAmp * progress;
      this.y += this.vy;
      this.radius = Math.min(this.maxRadius, this.radius + this.growth);

      if (progress < 0.2) {
        this.opacity = (progress / 0.2) * this.maxOpacity;
      } else if (progress > 0.6) {
        this.opacity = ((1 - progress) / 0.4) * this.maxOpacity;
      } else {
        this.opacity = this.maxOpacity;
      }
    }

    draw(ctx) {
      if (this.opacity <= 0.005) return;
      ctx.save();
      const grad = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.radius
      );
      grad.addColorStop(0, `rgba(235, 230, 255, ${this.opacity})`);
      grad.addColorStop(0.5, `rgba(190, 175, 230, ${this.opacity * 0.5})`);
      grad.addColorStop(1, 'rgba(150, 130, 190, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function initSteamCanvas() {
    const canvas = $('cd-steam-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const w = canvas.width;
    const h = canvas.height;

    steamParticles = [];
    const count = 22;
    for (let i = 0; i < count; i++) {
      const initialY = h - (i / count) * (h * 0.85);
      steamParticles.push(new SteamParticle(w, h, initialY));
    }

    function renderSteam() {
      steamAnimId = requestAnimationFrame(renderSteam);
      if (getActiveSkin() !== 'cyberdeck') return;

      ctx.clearRect(0, 0, w, h);
      for (const p of steamParticles) {
        p.update();
        p.draw(ctx);
      }
    }

    renderSteam();
  }

  function spawnSteamBurst() {
    const canvas = $('cd-steam-canvas');
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    for (let i = 0; i < 10; i++) {
      const p = new SteamParticle(w, h, h - 8);
      p.vy *= 1.6;
      p.maxOpacity = 0.32;
      steamParticles.push(p);
    }
    if (steamParticles.length > 40) {
      steamParticles.splice(0, steamParticles.length - 40);
    }
  }

  // --------------------------------------------------------------------------
  // Rainy Window Pixel Animation (Strictly within the glass window pane)
  // --------------------------------------------------------------------------
  function initRainCanvas() {
    const canvas = $('cd-rain-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = canvas.clientWidth || 325;
      canvas.height = canvas.clientHeight || 472;
    }
    resize();
    window.addEventListener('resize', resize);

    const drops = [];
    const numDrops = 30;
    for (let i = 0; i < numDrops; i++) {
      drops.push({
        x: Math.random() * (canvas.width || 325),
        y: Math.random() * (canvas.height || 472),
        len: 8 + Math.random() * 12,
        speed: 3.2 + Math.random() * 3.8,
        opacity: 0.2 + Math.random() * 0.35
      });
    }

    function renderRain() {
      rainAnimId = requestAnimationFrame(renderRain);
      if (getActiveSkin() !== 'cyberdeck') return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#a5b4fc';
      ctx.lineWidth = 1.1;

      for (const d of drops) {
        ctx.beginPath();
        ctx.globalAlpha = d.opacity;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 0.8, d.y + d.len);
        ctx.stroke();

        d.y += d.speed;
        d.x -= 0.35;
        if (d.y > canvas.height) {
          d.y = -15;
          d.x = Math.random() * canvas.width;
        }
      }
      ctx.globalAlpha = 1.0;
    }

    renderRain();
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PlayaCyberdeck = { init, syncAll, spawnSteamBurst, setDrawerOpen };
})();
