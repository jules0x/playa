// Playa — Cyberdeck 20XX Lo-Fi Terminal & Neon Room Controller
// All interactive elements map 1:1 to the painted artwork.
(function () {
  let isInitialized = false;
  let vizAnimId = null;
  let rainAnimId = null;
  let steamAnimId = null;

  function $(id) { return document.getElementById(id); }

  let loadedTracks = [];
  let loadedAlbums = [];
  let activeVaultTab = 'tracks'; // 'tracks' | 'albums'
  let isAlbumMode = false;
  let volumeVal = 0.85;

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
    startVizLoop();
    isInitialized = true;

    const audio = $('native-audio');
    if (audio) {
      audio.addEventListener('play', syncAll);
      audio.addEventListener('pause', syncAll);
      audio.addEventListener('volumechange', () => {
        updateScreenVolumeMeter();
      });
    }

    window.addEventListener('playa:skinchange', (e) => {
      if (e.detail && e.detail.skin === 'cyberdeck') {
        if (loadedTracks.length > 0) {
          startRandomTrack();
        }
        syncAll();
      }
    });

    window.addEventListener('playa:playerupdate', syncAll);

    // Initial sync & data fetch
    fetchTracks();
    fetchAlbums();
    syncAll();
  }

  // --------------------------------------------------------------------------
  // Synchronize Player State with In-Scene Hotspots & CRT Screen
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
        titleEl.textContent = `${track.title.toUpperCase()} - "${(track.artist || 'UNKNOWN').toUpperCase()}"`;
      } else {
        titleEl.textContent = 'SYSTEM READY // SELECT TRACK FROM VAULT';
      }
    }

    const drawerNow = $('cd-drawer-now-playing');
    if (drawerNow) {
      drawerNow.textContent = track ? `${track.title} - ${track.artist || 'Unknown'}` : 'NOTHING';
    }

    // 2. CRT Screen Live Upcoming Playlist (6 slots)
    updateScreenPlaylist();

    // 3. CRT Screen Live Segmented Volume Meter
    updateScreenVolumeMeter();

    // 4. CRT Shuffle (Loop Button) Active State
    if (P) {
      const loopBtn = $('cd-btn-loop');
      if (loopBtn) loopBtn.classList.toggle('active', !!P.state.isShuffle);
    }

    // 5. Populate Content in Vault Drawer
    renderVaultContent();
  }

  // --------------------------------------------------------------------------
  // Random Track Starting Point (Different each time skin is loaded/selected)
  // --------------------------------------------------------------------------
  function startRandomTrack() {
    const P = window.PlayaPlayer;
    if (!P || loadedTracks.length === 0) return;
    isAlbumMode = false;
    const randIdx = Math.floor(Math.random() * loadedTracks.length);
    P.setQueue(loadedTracks, randIdx);
  }

  // --------------------------------------------------------------------------
  // CRT Screen Live Mini-Playlist (6 Slots)
  // --------------------------------------------------------------------------
  function updateScreenPlaylist() {
    const container = $('cd-crt-pl-items');
    if (!container) return;

    const P = window.PlayaPlayer;
    const queue = (P && P.state.queue && P.state.queue.length > 0) ? P.state.queue : loadedTracks;
    const curIdx = P ? P.state.queueIndex : 0;

    let itemsHtml = '';
    for (let slot = 0; slot < 6; slot++) {
      const trackIdx = (curIdx + 1 + slot) % (queue.length || 1);
      const t = queue && queue[trackIdx] ? queue[trackIdx] : (loadedTracks[slot] || null);
      if (t) {
        itemsHtml += `<div class="cd-crt-pl-item" data-id="${t.id}" data-idx="${trackIdx}" title="${escapeHtml(t.artist)} - ${escapeHtml(t.title)}">0${slot + 1}: ${escapeHtml(t.title)}</div>`;
      } else {
        itemsHtml += `<div class="cd-crt-pl-item">0${slot + 1}: --</div>`;
      }
    }
    container.innerHTML = itemsHtml;

    container.querySelectorAll('.cd-crt-pl-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        const P = window.PlayaPlayer;
        if (id && P) {
          const currentQ = P.state.queue;
          const qIdx = currentQ.findIndex(tr => String(tr.id) === String(id));
          if (qIdx !== -1) {
            P.setQueue(currentQ, qIdx);
          } else {
            const lIdx = loadedTracks.findIndex(tr => String(tr.id) === String(id));
            if (lIdx !== -1) P.setQueue(loadedTracks, lIdx);
          }
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // CRT Screen Live Volume Meter (Segmented Bars: ||||||||||||||||)
  // --------------------------------------------------------------------------
  function updateScreenVolumeMeter() {
    const barsEl = $('cd-crt-vol-bars');
    const audio = $('native-audio');
    const vol = audio ? audio.volume : volumeVal;
    if (barsEl) {
      const totalBars = 16;
      const activeBars = Math.max(0, Math.min(totalBars, Math.round(vol * totalBars)));
      barsEl.textContent = '|'.repeat(activeBars) + '.'.repeat(totalBars - activeBars);
    }
    const hudVol = $('cd-hud-vol');
    if (hudVol) {
      hudVol.textContent = `VOL: ${Math.round(vol * 100)}%`;
    }
  }

  // --------------------------------------------------------------------------
  // Vault Tracks, Albums & Drawer
  // --------------------------------------------------------------------------
  async function fetchTracks() {
    try {
      const res = await fetch('/api/tracks');
      if (!res.ok) return;
      const data = await res.json();
      loadedTracks = Array.isArray(data) ? data : (data.tracks || []);

      if (getActiveSkin() === 'cyberdeck') {
        const P = window.PlayaPlayer;
        if (P && !P.state.currentTrack) {
          startRandomTrack();
        }
      }

      renderVaultContent();
      updateScreenPlaylist();
    } catch (e) {
      console.warn("Cyberdeck fetch tracks error:", e);
    }
  }

  async function fetchAlbums() {
    try {
      const res = await fetch('/api/albums');
      if (!res.ok) return;
      const data = await res.json();
      loadedAlbums = Array.isArray(data) ? data : (data.albums || []);
      if (activeVaultTab === 'albums') {
        renderVaultContent();
      }
    } catch (e) {
      console.warn("Cyberdeck fetch albums error:", e);
    }
  }

  function renderVaultContent() {
    const countEl = $('cd-drawer-count');
    if (activeVaultTab === 'tracks') {
      if (countEl) countEl.textContent = `${loadedTracks.length} TRACKS`;
      renderTracklist();
    } else {
      if (countEl) countEl.textContent = `${loadedAlbums.length} ALBUMS`;
      renderAlbumlist();
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
          isAlbumMode = false;
          P.setQueue(loadedTracks, idx);
        }
      });
    });
  }

  function renderAlbumlist() {
    const list = $('cd-playlist-scroll');
    if (!list) return;

    list.innerHTML = loadedAlbums.map(a => `
      <div class="cd-album-row" data-album-name="${escapeHtml(a.album)}">
        <div class="cd-album-thumb" style="background-image: url('/api/cover/${a.cover_hash || 'default'}')"></div>
        <div class="cd-album-info">
          <div class="cd-album-title">${escapeHtml(a.album)}</div>
          <div class="cd-album-meta">${escapeHtml(a.artist || 'Unknown')}${a.track_count ? ' • ' + a.track_count + ' tracks' : ''}${a.year ? ' • ' + a.year : ''}</div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.cd-album-row').forEach(row => {
      row.addEventListener('click', async () => {
        const albumName = row.dataset.albumName;
        try {
          const res = await fetch(`/api/tracks?album=${encodeURIComponent(albumName)}`);
          if (!res.ok) return;
          const data = await res.json();
          const albumTracks = Array.isArray(data) ? data : (data.tracks || []);
          if (albumTracks.length > 0) {
            isAlbumMode = true;
            const P = window.PlayaPlayer;
            if (P) {
              P.state.isShuffle = false;
              const mainShuffle = $('btn-shuffle');
              if (mainShuffle) mainShuffle.classList.remove('active');
              P.setQueue(albumTracks, 0);
            }
            setDrawerOpen(false);
            syncAll();
          }
        } catch (err) {
          console.warn("Error playing album:", err);
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

    // 1. CRT Screen Transport Buttons (PLAY, PAUSE, STOP, NEXT, PREV, LOOP/SHUFFLE)
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

    // Loop Button acts as Shuffle Toggle (Shuffles from all tracks; exits album mode if in album)
    const btnLoop = $('cd-btn-loop');
    if (btnLoop) {
      btnLoop.addEventListener('click', (e) => {
        e.stopPropagation();
        const P = window.PlayaPlayer;
        if (!P) return;

        const mainShuffle = $('btn-shuffle');

        if (isAlbumMode) {
          // Playing an album: clicking shuffle exits album mode and goes back to all tracks shuffled
          isAlbumMode = false;
          P.state.isShuffle = true;
          if (mainShuffle) mainShuffle.classList.add('active');
          if (loadedTracks.length > 0) {
            const shuffled = [...loadedTracks].sort(() => Math.random() - 0.5);
            P.setQueue(shuffled, 0);
          }
        } else {
          // General track mode: toggle shuffle
          P.state.isShuffle = !P.state.isShuffle;
          if (mainShuffle) mainShuffle.classList.toggle('active', P.state.isShuffle);

          if (P.state.isShuffle) {
            if (loadedTracks.length > 0) {
              const shuffled = [...loadedTracks].sort(() => Math.random() - 0.5);
              P.setQueue(shuffled, 0);
            }
          }
        }
        syncAll();
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

    // 4. CRT Playlist Area Click: Toggle Vault Terminal Drawer
    const plBay = $('cd-crt-playlist-bay');
    if (plBay) {
      plBay.addEventListener('click', (e) => {
        // If clicked on an item, it plays that item. If on background, opens drawer
        if (!e.target.classList.contains('cd-crt-pl-item')) {
          setDrawerOpen(true);
        }
      });
    }

    // 5. Vault Toggle Tab, Tabs & Close Button
    const vaultTab = $('cd-btn-vault-toggle');
    if (vaultTab) {
      vaultTab.addEventListener('click', () => {
        setDrawerOpen(true);
      });
    }

    const tabTracks = $('cd-vtab-tracks');
    const tabAlbums = $('cd-vtab-albums');

    if (tabTracks) {
      tabTracks.addEventListener('click', () => {
        activeVaultTab = 'tracks';
        tabTracks.classList.add('active');
        if (tabAlbums) tabAlbums.classList.remove('active');
        renderVaultContent();
      });
    }

    if (tabAlbums) {
      tabAlbums.addEventListener('click', () => {
        activeVaultTab = 'albums';
        tabAlbums.classList.add('active');
        if (tabTracks) tabTracks.classList.remove('active');
        if (loadedAlbums.length === 0) {
          fetchAlbums();
        } else {
          renderVaultContent();
        }
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

    // 8. Rotary VOLUME Knob (Front Panel)
    setupKnob('cd-dial-vol', 'cd-hud-vol', (val) => {
      volumeVal = val;
      if (audio) audio.volume = val;
      const volFill = $('volume-fill');
      if (volFill) volFill.style.width = `${val * 100}%`;
      updateScreenVolumeMeter();
      return `VOL: ${Math.round(val * 100)}%`;
    }, 0.85);

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
  // Rotary Knob Controller (Volume Only)
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
      this.baseX = this.w * 0.5 + (Math.random() - 0.5) * 12;
      this.x = this.baseX;
      this.y = customY !== null ? customY : this.h - 6 - Math.random() * 6;
      this.vy = -(0.38 + Math.random() * 0.35);
      this.vx = 0.05 + (Math.random() - 0.5) * 0.12;
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
  // Real-Time 16-Bit Rainbow Spectrum & Oscilloscope on CRT Monitor Glass
  // --------------------------------------------------------------------------
  function startVizLoop() {
    const canvas = $('cd-viz-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const freqData = new Uint8Array(64);
    const numBars = 22;
    const barWidth = 8;
    const barGap = 3;
    const blockH = 4;
    const blockGap = 2;

    function draw() {
      vizAnimId = requestAnimationFrame(draw);
      if (getActiveSkin() !== 'cyberdeck') return;

      const w = canvas.width;
      const h = canvas.height;
      
      // 1. Fill solid screen background to cleanly mask the static artwork
      ctx.fillStyle = '#080414';
      ctx.fillRect(0, 0, w, h);

      const P = window.PlayaPlayer;
      const analyser = P ? P.analyser : null;
      const audio = $('native-audio');
      const isPlaying = audio && !audio.paused;

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(freqData);
      } else {
        // Idle gentle wave
        for (let i = 0; i < 64; i++) {
          freqData[i] = Math.max(0, Math.sin(Date.now() * 0.003 + i * 0.28) * 14);
        }
      }

      // 2. Rainbow Pixel Spectrum Blocks
      const totalWidth = numBars * (barWidth + barGap) - barGap;
      const startX = Math.floor((w - totalWidth) / 2);

      for (let i = 0; i < numBars; i++) {
        const val = freqData[i] || 0;
        const norm = val / 255;
        const numBlocks = Math.floor(norm * ((h - 22) / (blockH + blockGap)));
        const x = startX + i * (barWidth + barGap);

        for (let b = 0; b < numBlocks; b++) {
          const y = (h - 20) - (b + 1) * (blockH + blockGap);
          const ratio = b / 16;

          // Authentic cyberpunk rainbow tiering
          if (ratio < 0.28) ctx.fillStyle = '#22c55e'; // Green
          else if (ratio < 0.52) ctx.fillStyle = '#facc15'; // Yellow
          else if (ratio < 0.72) ctx.fillStyle = '#ec4899'; // Pink
          else if (ratio < 0.88) ctx.fillStyle = '#a855f7'; // Purple
          else ctx.fillStyle = '#06b6d4'; // Cyan Peak

          ctx.fillRect(x, y, barWidth, blockH);
        }
      }

      // 3. Oscilloscope Wave Line across Spectrum
      ctx.beginPath();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 5;

      const midY = h * 0.75;
      for (let x = 0; x < w; x += 3) {
        const sampleIdx = Math.floor((x / w) * 32);
        const waveOffset = isPlaying
          ? (freqData[sampleIdx] - 128) * 0.16 * Math.sin(x * 0.08 + Date.now() * 0.01)
          : Math.sin(x * 0.06 + Date.now() * 0.004) * 2;
        const y = midY + waveOffset;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 4. Retro Technical Sub-Labels
      ctx.font = '8px "VT323", monospace';
      ctx.fillStyle = 'rgba(167, 139, 250, 0.55)';
      ctx.fillText('SYPEC.UANL1COR', 12, h - 5);
      ctx.fillText('TR8SK 2NFO', w - 62, h - 5);
    }

    draw();
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
