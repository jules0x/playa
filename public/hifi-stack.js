// Playa — 1970s Silverface & Walnut Tower Stack (Option 1A)
// Dedicated hardware component stack controller for the 'hifi' skin.
(function () {
  let isInitialized = false;
  let animFrameId = null;

  // Ballistic needle state
  const vu = {
    l: -2.35,
    r: -2.35,
    peakL: 0,
    peakR: 0
  };

  // Playback queue & tracking
  let loadedTracks = [];
  let currentTrackId = null;

  // EQ Band Frequencies
  const EQ_FREQS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
  const eqValues = [2, 4, 3, 0, -2, 1, 3, 5, 4, 2]; // Default Hi-Fi loudness curve

  // Available Atmospheric Listening Room Backdrop Scenes
  const SCENES = [
    { id: 'den', name: 'Vinyl Den', file: '/assets/scenes/hifi-den.jpg', label: 'ROOM: DEN' },
    { id: 'kissa', name: 'Tokyo Kissa', file: '/assets/scenes/hifi-kissa.jpg', label: 'ROOM: KISSA' },
    { id: 'lounge', name: 'Audiophile Lounge', file: '/assets/scenes/hifi-lounge.jpg', label: 'ROOM: LOUNGE' },
    { id: 'dark', name: 'Dark Minimal', file: '', label: 'ROOM: DARK' }
  ];

  function getStoredScene() {
    return localStorage.getItem('playa-hifi-scene') || 'den';
  }

  function applyScene(sceneId) {
    const scene = SCENES.find(s => s.id === sceneId) || SCENES[0];
    localStorage.setItem('playa-hifi-scene', scene.id);

    const bgEl = $('hifi-scene-bg');
    if (bgEl) {
      if (scene.file) {
        bgEl.style.backgroundImage = `url("${scene.file}")`;
        bgEl.style.opacity = '1';
      } else {
        bgEl.style.backgroundImage = 'none';
        bgEl.style.opacity = '0';
      }
    }

    const btnLabel = $('hifi-scene-btn-label');
    if (btnLabel) {
      btnLabel.textContent = scene.label;
    }

    const container = $('hifi-stack-container');
    if (container) {
      container.dataset.scene = scene.id;
    }
  }

  function cycleScene() {
    const cur = getStoredScene();
    const idx = SCENES.findIndex(s => s.id === cur);
    const next = SCENES[(idx + 1) % SCENES.length];
    applyScene(next.id);
  }

  function $(id) { return document.getElementById(id); }

  function getActiveSkin() {
    return document.documentElement.dataset.skin || 'aurora';
  }

  function init() {
    if (isInitialized) return;

    const stackContainer = $('hifi-stack-container');
    if (!stackContainer) return;

    buildEqSliders();
    attachEventListeners();
    isInitialized = true;

    // Start render loop
    startAnimLoop();

    // Listen to skin change to sync state
    window.addEventListener('playa:skinchange', (e) => {
      if (e.detail && e.detail.skin === 'hifi') {
        syncAll();
      }
    });

    // Initial sync and restore scene
    applyScene(getStoredScene());
    syncAll();
  }

  // --- Build 10-Band EQ Sliders ---
  function buildEqSliders() {
    const container = $('hifi-eq-sliders');
    if (!container) return;

    container.innerHTML = EQ_FREQS.map((freq, i) => `
      <div class="hifi-fader-col" data-index="${i}">
        <span class="hifi-fader-scale">+12</span>
        <div class="hifi-fader-track">
          <div class="hifi-fader-handle" style="bottom: ${((eqValues[i] + 12) / 24) * 100}%">
            <span class="hifi-fader-led"></span>
          </div>
        </div>
        <span class="hifi-fader-scale">-12</span>
        <span class="hifi-fader-label">${freq}</span>
      </div>
    `).join('');

    // Make sliders draggable/clickable
    container.addEventListener('pointerdown', (e) => {
      const col = e.target.closest('.hifi-fader-col');
      if (!col) return;
      const idx = parseInt(col.dataset.index, 10);
      const track = col.querySelector('.hifi-fader-track');
      const handle = col.querySelector('.hifi-fader-handle');

      function onPointerMove(moveEvent) {
        const rect = track.getBoundingClientRect();
        const norm = Math.max(0, Math.min(1, (rect.bottom - moveEvent.clientY) / rect.height));
        eqValues[idx] = Math.round((norm * 24) - 12);
        handle.style.bottom = `${norm * 100}%`;
      }

      function onPointerUp() {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      onPointerMove(e);
    });
  }

  // --- Attach Event Listeners ---
  function attachEventListeners() {
    const audio = $('native-audio');

    // Transport Piano Keys
    const btnPlay = $('hifi-btn-play');
    const btnStop = $('hifi-btn-stop');
    const btnPause = $('hifi-btn-pause');
    const btnRew = $('hifi-btn-rew');
    const btnFf = $('hifi-btn-ff');
    const btnEject = $('hifi-btn-eject');
    const btnCrate = $('hifi-crate-btn');
    const btnCrateClose = $('hifi-crate-close');

    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        if (!audio) return;
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      });
    }

    if (btnPause) {
      btnPause.addEventListener('click', () => {
        if (!audio) return;
        audio.pause();
      });
    }

    if (btnStop) {
      btnStop.addEventListener('click', () => {
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
      });
    }

    function skipTrack(delta) {
      const P = window.PlayaPlayer;
      if (P && P.state.queue.length > 0) {
        delta > 0 ? P.playNext() : P.playPrev();
        return;
      }
      if (!loadedTracks || loadedTracks.length === 0) return;
      let idx = loadedTracks.findIndex(t => String(t.id) === String(currentTrackId));
      idx = idx === -1 ? 0 : (idx + delta + loadedTracks.length) % loadedTracks.length;
      playTrackDirect(loadedTracks[idx]);
    }

    if (btnRew) {
      btnRew.addEventListener('click', () => {
        if (audio && audio.currentTime > 3) {
          audio.currentTime = 0;
        } else {
          skipTrack(-1);
        }
      });
    }

    if (btnFf) {
      btnFf.addEventListener('click', () => {
        skipTrack(1);
      });
    }

    function toggleCrate(open) {
      const drawer = $('hifi-crate-drawer');
      if (!drawer) return;
      drawer.classList.toggle('open', open);
      if (open) renderCrateAlbums();
    }

    if (btnEject) btnEject.addEventListener('click', () => toggleCrate(true));
    if (btnCrate) btnCrate.addEventListener('click', () => toggleCrate(true));
    if (btnCrateClose) btnCrateClose.addEventListener('click', () => toggleCrate(false));

    // Listening Room Scene Switcher Button
    const sceneToggleBtn = $('hifi-scene-toggle-btn');
    if (sceneToggleBtn) {
      sceneToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleScene();
      });
    }

    // Skin Picker Button on Hi-Fi Deck: cycles skins smoothly
    const skinToggleBtn = $('hifi-skin-toggle-btn');
    if (skinToggleBtn) {
      skinToggleBtn.addEventListener('click', (e) => {
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

    // Toggles
    const togglePower = $('hifi-toggle-power');
    if (togglePower) {
      togglePower.addEventListener('click', () => {
        togglePower.classList.toggle('active');
        if (!togglePower.classList.contains('active') && audio && !audio.paused) {
          audio.pause();
        }
      });
    }

    const toggleMute = $('hifi-toggle-mute');
    if (toggleMute) {
      toggleMute.addEventListener('click', () => {
        toggleMute.classList.toggle('active');
        if (audio) audio.muted = toggleMute.classList.contains('active');
      });
    }

    const toggleShuffle = $('hifi-toggle-shuffle');
    if (toggleShuffle) {
      toggleShuffle.addEventListener('click', () => {
        const mainShuffle = $('btn-shuffle');
        if (mainShuffle) mainShuffle.click();
        toggleShuffle.classList.toggle('active');
      });
    }

    // Tuning Glass Scrubber
    const tunerDialBay = $('hifi-tuner-dial-bay');
    if (tunerDialBay) {
      tunerDialBay.addEventListener('click', (e) => {
        if (!audio || isNaN(audio.duration) || audio.duration <= 0) return;
        const rect = tunerDialBay.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = pct * audio.duration;
      });
    }

    // Track search input
    const trackSearchInput = $('hifi-track-search');
    if (trackSearchInput) {
      trackSearchInput.addEventListener('input', () => {
        renderCurrentTracklist(trackSearchInput.value.trim().toLowerCase());
      });
    }

    // Audio timeupdate to drive tape counter & tuner needle
    if (audio) {
      audio.addEventListener('timeupdate', updatePlaybackMetrics);
      audio.addEventListener('play', () => updatePlayState(true));
      audio.addEventListener('pause', () => updatePlayState(false));
      // End-of-track advance is handled by the core player queue (app.js)
      audio.addEventListener('ended', () => updatePlayState(false));
    }
  }

  // --- Update Playback Indicators (Needle, Counter, Reels) ---
  function updatePlaybackMetrics() {
    const audio = $('native-audio');
    if (!audio) return;

    // Counter
    const counterEl = $('hifi-tape-counter');
    if (counterEl) {
      const cur = Math.floor(audio.currentTime || 0);
      const m = Math.floor(cur / 60);
      const s = cur % 60;
      counterEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // Tuner Cursor Needle
    const needle = $('hifi-tuner-needle');
    if (needle && audio.duration) {
      const pct = (audio.currentTime / audio.duration) * 100;
      needle.style.left = `${Math.min(99, Math.max(1, pct))}%`;
    }
  }

  function updatePlayState(isPlaying) {
    const playLed = $('hifi-play-led');
    const stereoLamp = $('hifi-stereo-lamp');
    const reelLeft = $('hifi-reel-left');
    const reelRight = $('hifi-reel-right');

    if (playLed) playLed.classList.toggle('active', isPlaying);
    if (stereoLamp) stereoLamp.classList.toggle('active', isPlaying);

    if (reelLeft) reelLeft.classList.toggle('spinning', isPlaying);
    if (reelRight) reelRight.classList.toggle('spinning', isPlaying);
  }

  // --- Sync State from Playa Core ---
  function syncAll() {
    updateMetadata();
    renderCurrentTracklist();
    const audio = $('native-audio');
    if (audio) {
      updatePlayState(!audio.paused);
      updatePlaybackMetrics();
    }
  }

  function updateMetadata() {
    // Read from main player info
    const titleEl = $('player-title');
    const artistEl = $('player-artist');
    const coverEl = $('player-cover');

    const title = titleEl ? titleEl.textContent : 'Nothing Playing';
    const artist = artistEl ? artistEl.textContent : 'Select Cassette to Tune';
    const coverSrc = coverEl ? coverEl.src : '/api/cover/default';

    const readoutTitle = $('hifi-readout-title');
    const readoutArtist = $('hifi-readout-artist');
    const tapeAlbum = $('hifi-tape-album');
    const tapeArtist = $('hifi-tape-artist');
    const tapeThumb = $('hifi-tape-thumb');

    if (readoutTitle && title !== 'Nothing Playing') readoutTitle.textContent = title;
    if (readoutArtist && artist !== 'Select a track from the library') readoutArtist.textContent = artist;
    if (tapeAlbum && title !== 'Nothing Playing') tapeAlbum.textContent = title;
    if (tapeArtist && artist !== 'Select a track from the library') tapeArtist.textContent = artist;
    if (tapeThumb && coverSrc) tapeThumb.style.backgroundImage = `url("${coverSrc}")`;
  }

  // --- Render Cassette Tracklist ---
  async function renderCurrentTracklist(filter = '') {
    const listContainer = $('hifi-tracks-list');
    if (!listContainer) return;

    // Fetch active tracks from API
    try {
      const res = await fetch('/api/tracks');
      if (!res.ok) return;
      const data = await res.json();
      let tracks = Array.isArray(data) ? data : (data.tracks || []);
      loadedTracks = tracks;

      if (filter) {
        tracks = tracks.filter(t => 
          (t.title && t.title.toLowerCase().includes(filter)) ||
          (t.artist && t.artist.toLowerCase().includes(filter)) ||
          (t.album && t.album.toLowerCase().includes(filter))
        );
      }

      if (tracks.length === 0) {
        listContainer.innerHTML = '<div class="hifi-track-empty">NO TRACKS FOUND IN VAULT</div>';
        return;
      }

      const activeTitle = $('player-title')?.textContent || '';

      listContainer.innerHTML = tracks.map((t, i) => {
        const isActive = t.title === activeTitle;
        const dur = formatSeconds(t.duration);
        return `
          <div class="hifi-track-item${isActive ? ' active' : ''}" data-track-id="${t.id}">
            <span class="hifi-track-num">${isActive ? '▶' : String(i + 1).padStart(2, '0')}</span>
            <div class="hifi-track-meta">
              <span class="hifi-track-title">${escapeHtml(t.title)}</span>
              <span class="hifi-track-artist">${escapeHtml(t.artist || 'Unknown Artist')}</span>
            </div>
            <span class="hifi-track-dur">${dur}</span>
          </div>
        `;
      }).join('');

      // Click to play
      listContainer.querySelectorAll('.hifi-track-item').forEach(el => {
        el.addEventListener('click', async () => {
          const trackId = el.dataset.trackId;
          const track = tracks.find(t => String(t.id) === String(trackId));
          if (track) {
            playTrackDirect(track);
          }
        });
      });
    } catch (err) {
      console.warn("HiFi tracklist load error:", err);
    }
  }

  // Play track helper
  function playTrackDirect(track) {
    const audio = $('native-audio');
    if (!audio) return;
    currentTrackId = track.id;

    // Prefer the shared player queue so next/prev/shuffle/auto-advance all work
    const P = window.PlayaPlayer;
    if (P && loadedTracks.length) {
      const idx = loadedTracks.findIndex(t => String(t.id) === String(track.id));
      P.setQueue(loadedTracks, Math.max(0, idx));
      setTimeout(renderCurrentTracklist, 50);
      return;
    }

    if ($('player-title')) $('player-title').textContent = track.title;
    if ($('player-artist')) $('player-artist').textContent = `${track.artist || ''} — ${track.album || ''}`;
    if ($('player-cover')) $('player-cover').src = `/api/cover/${track.cover_hash || 'default'}`;

    const readoutTitle = $('hifi-readout-title');
    const readoutArtist = $('hifi-readout-artist');
    const tapeAlbum = $('hifi-tape-album');
    const tapeArtist = $('hifi-tape-artist');
    const tapeThumb = $('hifi-tape-thumb');

    if (readoutTitle) readoutTitle.textContent = track.title;
    if (readoutArtist) readoutArtist.textContent = `${track.artist || ''} • ${track.album || ''}`;
    if (tapeAlbum) tapeAlbum.textContent = track.album || track.title;
    if (tapeArtist) tapeArtist.textContent = track.artist || '';
    if (tapeThumb) tapeThumb.style.backgroundImage = `url("/api/cover/${track.cover_hash || 'default'}")`;

    audio.src = `/api/stream/${track.id}`;
    audio.play().then(() => {
      updatePlayState(true);
      renderCurrentTracklist();
    }).catch(e => console.error("Play error:", e));
  }

  // --- Render Cassette Crate Drawer ---
  async function renderCrateAlbums() {
    const crateGrid = $('hifi-crate-grid');
    if (!crateGrid) return;

    try {
      const res = await fetch('/api/albums');
      if (!res.ok) return;
      const data = await res.json();
      const albums = Array.isArray(data) ? data : (data.albums || []);

      crateGrid.innerHTML = albums.map((a, i) => `
        <div class="hifi-crate-tape" data-album-name="${escapeHtml(a.album)}">
          <div class="hifi-tape-spine">
            <span class="spine-num">VOL.${String(i + 1).padStart(2, '0')}</span>
            <span class="spine-artist">${escapeHtml(a.artist || 'VAULT')}</span>
            <span class="spine-title">${escapeHtml(a.album)}</span>
            <span class="spine-year">${a.year || ''}</span>
          </div>
          <div class="hifi-tape-thumb" style="background-image: url('/api/cover/${a.cover_hash || 'default'}')"></div>
        </div>
      `).join('');

      crateGrid.querySelectorAll('.hifi-crate-tape').forEach(el => {
        el.addEventListener('click', async () => {
          const albumName = el.dataset.albumName;
          const tracksRes = await fetch(`/api/tracks?album=${encodeURIComponent(albumName)}`);
          if (tracksRes.ok) {
            const data = await tracksRes.json();
            const albumTracks = Array.isArray(data) ? data : (data.tracks || []);
            if (albumTracks.length > 0) {
              playTrackDirect(albumTracks[0]);
              $('hifi-crate-drawer').classList.remove('open');
            }
          }
        });
      });
    } catch (e) {
      console.error("Crate load error:", e);
    }
  }

  // --- Canvas Animation Loop (Dual VU Meters & EQ Curve) ---
  function startAnimLoop() {
    const vuCanvas = $('hifi-vu-canvas');
    const vuCtx = vuCanvas ? vuCanvas.getContext('2d') : null;

    const eqCanvas = $('hifi-eq-canvas');
    const eqCtx = eqCanvas ? eqCanvas.getContext('2d') : null;

    function loop() {
      animFrameId = requestAnimationFrame(loop);

      if (getActiveSkin() !== 'hifi') return;

      const audio = $('native-audio');
      const isPlaying = audio && !audio.paused;

      // Draw Dual VU Meters
      if (vuCtx && vuCanvas) {
        drawVuMeters(vuCtx, vuCanvas.width, vuCanvas.height, isPlaying);
      }

      // Draw EQ Frequency Curve & Spectrum
      if (eqCtx && eqCanvas) {
        drawEqCurve(eqCtx, eqCanvas.width, eqCanvas.height, isPlaying);
      }
    }

    loop();
  }

  // --- Draw Dual VU Meters ---
  function drawVuMeters(ctx, w, h, isPlaying) {
    ctx.clearRect(0, 0, w, h);

    const minAngle = -2.35;
    const maxAngle = -1.05;

    // Simulate ballistic energy or hook to real energy
    let nrgL = 0;
    let nrgR = 0;

    if (isPlaying) {
      const t = performance.now() * 0.006;
      nrgL = 0.35 + Math.sin(t * 1.5) * 0.25 + Math.sin(t * 3.7) * 0.2;
      nrgR = 0.35 + Math.cos(t * 1.6) * 0.25 + Math.sin(t * 4.1) * 0.2;
      nrgL = Math.max(0, Math.min(1, nrgL));
      nrgR = Math.max(0, Math.min(1, nrgR));
    }

    const targetL = minAngle + (maxAngle - minAngle) * nrgL;
    const targetR = minAngle + (maxAngle - minAngle) * nrgR;

    vu.l += (targetL - vu.l) * (targetL > vu.l ? 0.38 : 0.12);
    vu.r += (targetR - vu.r) * (targetR > vu.r ? 0.38 : 0.12);

    if (nrgL > 0.8) vu.peakL = 8; else if (vu.peakL > 0) vu.peakL--;
    if (nrgR > 0.8) vu.peakR = 8; else if (vu.peakR > 0) vu.peakR--;

    const gap = 8;
    const meterW = Math.floor((w - gap - 6) / 2);
    const meterH = h - 6;

    drawSingleVu(ctx, 3, 3, meterW, meterH, vu.l, 'LEFT', vu.peakL > 0);
    drawSingleVu(ctx, 3 + meterW + gap, 3, meterW, meterH, vu.r, 'RIGHT', vu.peakR > 0);
  }

  function drawSingleVu(ctx, x, y, w, h, angle, label, isPeak) {
    ctx.save();

    // Backlit Warm Tungsten Face
    const face = ctx.createRadialGradient(x + w / 2, y + h * 0.65, 4, x + w / 2, y + h * 0.65, w * 0.7);
    face.addColorStop(0, '#fff6db');
    face.addColorStop(0.5, '#f5e0a0');
    face.addColorStop(1, '#caa352');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 2);
    ctx.fill();

    // Inset Bezel
    ctx.strokeStyle = '#3e2a14';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const cx = x + w / 2;
    const cy = y + h + 10;
    const radius = h * 0.96;

    // Normal Arc (-20 to 0 dB)
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -2.35, -1.35);
    ctx.strokeStyle = '#2b1c0e';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Red Overload Arc (0 to +5 dB)
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -1.35, -1.05);
    ctx.strokeStyle = '#d62000';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Scale ticks
    const ticks = [
      { a: -2.35, t: '-20', major: true },
      { a: -2.05, t: '-10', major: true },
      { a: -1.75, t: '-5', major: true },
      { a: -1.35, t: '0', major: true, red: true },
      { a: -1.18, t: '+3', major: false, red: true },
      { a: -1.05, t: '+5', major: true, red: true }
    ];

    ticks.forEach(item => {
      const cos = Math.cos(item.a);
      const sin = Math.sin(item.a);
      const inR = radius - (item.major ? 6 : 4);
      ctx.beginPath();
      ctx.moveTo(cx + inR * cos, cy + inR * sin);
      ctx.lineTo(cx + radius * cos, cy + radius * sin);
      ctx.strokeStyle = item.red ? '#d62000' : '#2b1c0e';
      ctx.lineWidth = item.major ? 1.4 : 1;
      ctx.stroke();

      if (item.major) {
        ctx.fillStyle = item.red ? '#b31500' : '#3d2814';
        ctx.font = '7px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.t, cx + (radius - 10) * cos, cy + (radius - 10) * sin);
      }
    });

    // Labels
    ctx.fillStyle = '#593e22';
    ctx.font = 'bold 8px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VU', cx, y + 13);
    ctx.font = '6px "Share Tech Mono", monospace';
    ctx.fillText(label, cx, y + 21);

    // Peak LED
    ctx.beginPath();
    ctx.arc(x + w - 7, y + 7, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = isPeak ? '#ff2200' : '#45150f';
    ctx.fill();

    // Needle Shadow
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy);
    const nLen = radius + 2;
    const nx = cx + nLen * Math.cos(angle);
    const ny = cy + nLen * Math.sin(angle);
    ctx.lineTo(nx + 1.5, ny + 1.5);
    ctx.strokeStyle = 'rgba(60, 35, 10, 0.25)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Actual Needle
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#1a0e05';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Red Needle Tip
    ctx.beginPath();
    ctx.moveTo(cx + (nLen - 6) * Math.cos(angle), cy + (nLen - 6) * Math.sin(angle));
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#d62000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pivot cap
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#24170d';
    ctx.fill();

    // Glass glare
    const glare = ctx.createLinearGradient(x, y, x, y + h * 0.4);
    glare.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glare;
    ctx.fillRect(x + 1, y + 1, w - 2, h * 0.4);

    ctx.restore();
  }

  // --- Draw EQ Frequency Curve & Live Spectrum ---
  function drawEqCurve(ctx, w, h, isPlaying) {
    ctx.clearRect(0, 0, w, h);

    // Dark Display Glass with Fine Amber Grid
    ctx.fillStyle = '#0f0a06';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 184, 52, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 20; x < w; x += 35) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 16; y < h; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Zero dB reference line
    const zeroY = h / 2;
    ctx.strokeStyle = 'rgba(255, 184, 52, 0.28)';
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();

    // Dynamic wave modulation if playing
    const t = performance.now() * 0.004;

    const points = [];
    const step = w / (eqValues.length - 1);

    for (let i = 0; i < eqValues.length; i++) {
      const val = eqValues[i];
      const dyn = isPlaying ? Math.sin(t * 1.8 + i * 0.9) * 2.5 : 0;
      const normY = zeroY - ((val / 12) * (h * 0.35)) + dyn;
      points.push({ x: i * step, y: Math.max(6, Math.min(h - 6, normY)) });
    }

    // Draw Smooth Gold Response Curve
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

    ctx.strokeStyle = '#ffb834';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#ff9800';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Draw Illuminated Amber Node Points
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff4cc';
      ctx.fill();
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    ctx.restore();

    // Glass glare
    const glare = ctx.createLinearGradient(0, 0, 0, h * 0.5);
    glare.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, w, h * 0.5);
  }

  // --- Helper Functions ---
  function formatSeconds(sec) {
    if (isNaN(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Bootstrap when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PlayaHifiStack = {
    init,
    syncAll,
    applyScene,
    cycleScene,
    scenes: SCENES
  };
})();
