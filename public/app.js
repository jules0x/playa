// Playa - Modern Personal Audio Library Client
(function () {
  // Application State
  const state = {
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    isShuffle: false,
    repeatMode: 'none', // 'none' | 'all' | 'one'
    activeView: 'albums', // 'albums' | 'tracks' | 'artists' | 'playlist'
    activePlaylistId: null,
    activePlaylistData: null,
    sort: {
      sortBy: 'artist',
      sortOrder: 'ASC'
    },
    filters: {
      decade: null,
      genre: null,
      artist: null,
      album: null,
      search: ''
    },
    activeAlbumScope: null,
    playbackContext: null,
    isTracksShuffled: false,
    isAlbumsShuffled: false,
    isArtistsShuffled: false,
    navHistory: [],
    activeArtist: null,
    activeAlbumDetail: null,
    stats: {},
    decades: [],
    genres: [],
    albums: [],
    tracks: [],
    artists: [],
    playlists: [],
    pendingAddToPlaylist: null, // holds { type: 'track'|'album', data: ... }
    albumSort: localStorage.getItem('playa:albums-sort') || 'year_desc',
    albumGridCols: localStorage.getItem('playa:albums-grid-cols') || 'auto'
  };

  // DOM Elements
  const audio = document.getElementById('native-audio');
  const btnPlay = document.getElementById('btn-play');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnShuffle = document.getElementById('btn-shuffle');
  const btnRepeat = document.getElementById('btn-repeat');
  const btnMute = document.getElementById('btn-mute');
  const volHighIcon = document.getElementById('vol-high-icon');
  const volMuteIcon = document.getElementById('vol-mute-icon');

  const playerCover = document.getElementById('player-cover');
  const playerCoverBox = document.getElementById('player-cover-box');
  const playerTitle = document.getElementById('player-title');
  const playerFormatBadge = document.getElementById('player-format-badge');
  const playerArtist = document.getElementById('player-artist');
  const currentTimeEl = document.getElementById('current-time');
  const totalTimeEl = document.getElementById('total-time');
  const scrubberBar = document.getElementById('scrubber-bar');
  const scrubberFill = document.getElementById('scrubber-fill');
  const scrubberHandle = document.getElementById('scrubber-handle');
  const scrubberTooltip = document.getElementById('scrubber-tooltip');
  const playerQueueBtn = document.getElementById('player-queue-btn');
  const playerQueueCount = document.getElementById('player-queue-count');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeFill = document.getElementById('volume-fill');

  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear');
  const activeFiltersContainer = document.getElementById('active-filters');
  const rescanBtn = document.getElementById('rescan-btn');

  const countAlbumsEl = document.getElementById('count-albums');
  const countTracksEl = document.getElementById('count-tracks');
  const countArtistsEl = document.getElementById('count-artists');
  const storageStatusEl = document.getElementById('storage-meta-text');

  const decadesContainer = document.getElementById('decades-container');
  const genresContainer = document.getElementById('genres-container');
  const playlistsContainer = document.getElementById('playlists-container');
  const newPlaylistTriggerBtn = document.getElementById('new-playlist-trigger-btn');
  const contentBody = document.getElementById('content-body');

  const albumsGrid = document.getElementById('albums-grid');
  const albumsSortSelect = document.getElementById('albums-sort-select');
  const albumsGridDensity = document.getElementById('albums-grid-density');
  const tracksList = document.getElementById('tracks-list');
  const artistsGrid = document.getElementById('artists-grid');

  const artistAlbumsList = document.getElementById('artist-albums-list');
  const albumDetailContent = document.getElementById('album-detail-content');
  const btnAlbumsShuffle = document.getElementById('btn-albums-shuffle');
  const btnArtistsShuffle = document.getElementById('btn-artists-shuffle');
  const btnBackArtistDetail = document.getElementById('btn-back-artist-detail');
  const btnBackAlbumDetail = document.getElementById('btn-back-album-detail');
  const btnArtistActiveShuffle = document.getElementById('btn-artist-active-shuffle');
  const btnAlbumDetailShuffle = document.getElementById('btn-album-detail-shuffle');

  const toggleQueueBtn = document.getElementById('toggle-queue-btn');
  const queueDrawer = document.getElementById('queue-drawer');
  const closeQueueBtn = document.getElementById('close-queue-btn');
  const queueList = document.getElementById('queue-list');
  const queueCountBadge = document.getElementById('queue-count');

  // Playlist view elements
  const playlistViewCover = document.getElementById('playlist-view-cover');
  const playlistViewTitle = document.getElementById('playlist-view-title');
  const playlistViewDesc = document.getElementById('playlist-view-desc');
  const playlistViewMeta = document.getElementById('playlist-view-meta');
  const playlistTracksList = document.getElementById('playlist-tracks-list');
  const btnPlayPlaylist = document.getElementById('btn-play-playlist');
  const btnDeletePlaylist = document.getElementById('btn-delete-playlist');

  // Modal elements
  const playlistModal = document.getElementById('playlist-modal');
  const closePlaylistModalBtn = document.getElementById('close-playlist-modal');
  const modalTargetTitle = document.getElementById('modal-target-title');
  const modalPlaylistsList = document.getElementById('modal-playlists-list');
  const newPlaylistNameInput = document.getElementById('new-playlist-name');
  const btnCreatePlaylistSubmit = document.getElementById('btn-create-playlist-submit');
  const toastNotify = document.getElementById('toast-notify');

  // Vault Lock Elements
  const vaultLockModal = document.getElementById('vault-lock-modal');
  const vaultLoginForm = document.getElementById('vault-login-form');
  const vaultPasswordInput = document.getElementById('vault-password-input');
  const toggleVaultPwBtn = document.getElementById('toggle-vault-pw');
  const lockErrorMsg = document.getElementById('lock-error-msg');
  const btnVaultLock = document.getElementById('btn-vault-lock');

  // Toast Helper
  let toastTimer = null;
  function showToast(message) {
    if (!toastNotify) return;
    toastNotify.textContent = message;
    toastNotify.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastNotify.classList.remove('show');
    }, 2800);
  }

  // Web Audio Visualizer Context
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  const waveformCanvas = document.getElementById('waveform-visualizer');
  const waveformCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;
  const miniCanvas = document.getElementById('mini-visualizer');
  const miniCtx = miniCanvas ? miniCanvas.getContext('2d') : null;

  // Visualizer colours come from the active skin's CSS tokens
  const vizColors = { a: '#00f2fe', b: '#7f00ff', accentRgb: '0, 242, 254' };
  function refreshVizColors() {
    const cs = getComputedStyle(document.documentElement);
    vizColors.a = cs.getPropertyValue('--viz-a').trim() || vizColors.a;
    vizColors.b = cs.getPropertyValue('--viz-b').trim() || vizColors.b;
    vizColors.accentRgb = cs.getPropertyValue('--accent-rgb').trim() || vizColors.accentRgb;
  }
  refreshVizColors();
  window.addEventListener('playa:skinchange', refreshVizColors);

  function initAudioContext() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      sourceNode = audioCtx.createMediaElementSource(audio);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
      renderVisualizer();
    } catch (e) {
      console.warn("Web Audio API not supported or blocked:", e);
    }
  }

  // Vintage Hi-Fi Dual VU Meter ballistics tracking
  const vuState = {
    needleL: -2.35,
    needleR: -2.35,
    peakL: 0,
    peakR: 0
  };

  function drawAnalogVuMeter(ctx, x, y, w, h, angle, label, isPeak) {
    ctx.save();
    // Meter Face Backlight
    const faceGrad = ctx.createRadialGradient(x + w / 2, y + h * 0.7, 4, x + w / 2, y + h * 0.7, w * 0.75);
    faceGrad.addColorStop(0, '#fff4cc');
    faceGrad.addColorStop(0.55, '#f7df99');
    faceGrad.addColorStop(1, '#caa352');
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();

    // Dark inset bezel
    ctx.strokeStyle = '#4a341a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pivot & Radius
    const cx = x + w / 2;
    const cy = y + h + 8;
    const radius = h * 0.95;

    // Normal scale arc (-20 to 0 dB: dark bronze)
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -2.35, -1.35);
    ctx.strokeStyle = '#2b1c0e';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Overload scale arc (0 to +3 dB: red)
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -1.35, -1.05);
    ctx.strokeStyle = '#d62000';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Calibration tick marks
    const ticks = [
      { a: -2.35, text: '-20', major: true },
      { a: -2.05, text: '-10', major: true },
      { a: -1.75, text: '-5', major: true },
      { a: -1.55, text: '-3', major: false },
      { a: -1.35, text: '0', major: true, red: true },
      { a: -1.15, text: '+2', major: false, red: true },
      { a: -1.05, text: '+3', major: true, red: true }
    ];

    ticks.forEach(t => {
      const cos = Math.cos(t.a);
      const sin = Math.sin(t.a);
      const inner = radius - (t.major ? 6 : 4);
      ctx.beginPath();
      ctx.moveTo(cx + inner * cos, cy + inner * sin);
      ctx.lineTo(cx + radius * cos, cy + radius * sin);
      ctx.strokeStyle = t.red ? '#d62000' : '#2b1c0e';
      ctx.lineWidth = t.major ? 1.5 : 1;
      ctx.stroke();

      if (t.major && w > 75) {
        ctx.fillStyle = t.red ? '#b31500' : '#3d2814';
        ctx.font = '7px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.text, cx + (radius - 10) * cos, cy + (radius - 10) * sin);
      }
    });

    // VU & Channel label
    ctx.fillStyle = '#593e22';
    ctx.font = 'bold 8px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VU', cx, y + 12);
    ctx.font = '6px "Share Tech Mono", monospace';
    ctx.fillText(label, cx, y + 20);

    // Peak LED Indicator
    ctx.beginPath();
    ctx.arc(x + w - 8, y + 8, 2.8, 0, Math.PI * 2);
    if (isPeak) {
      ctx.fillStyle = '#ff2200';
      ctx.fill();
      ctx.shadowColor = '#ff2200';
      ctx.shadowBlur = 6;
    } else {
      ctx.fillStyle = '#4a150f';
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Needle drop-shadow
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy);
    const nLen = radius + 2;
    const nx = cx + nLen * Math.cos(angle);
    const ny = cy + nLen * Math.sin(angle);
    ctx.lineTo(nx + 1.5, ny + 1.5);
    ctx.strokeStyle = 'rgba(60, 35, 10, 0.28)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Mechanical Needle
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#1a0e05';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Red needle tip
    ctx.beginPath();
    ctx.moveTo(cx + (nLen - 6) * Math.cos(angle), cy + (nLen - 6) * Math.sin(angle));
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#d62000';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Pivot Dome
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#24170d';
    ctx.fill();
    ctx.strokeStyle = '#9e8055';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Glass glare reflection
    const glareGrad = ctx.createLinearGradient(x, y, x, y + h * 0.45);
    glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glareGrad;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, w - 2, h * 0.45, [2, 2, 0, 0]);
    ctx.fill();

    ctx.restore();
  }

  function renderVisualizer() {
    requestAnimationFrame(renderVisualizer);
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const skin = document.documentElement.dataset.skin || 'aurora';

    // Draw main waveform / VU meter in bottom player
    if (waveformCtx && waveformCanvas) {
      const w = waveformCanvas.width;
      const h = waveformCanvas.height;
      waveformCtx.clearRect(0, 0, w, h);

      if (skin === 'hifi') {
        // --- Vintage Hi-Fi Dual Analog VU Meter Rendering ---
        const half = Math.floor(bufferLength / 2);
        let sumL = 0;
        for (let i = 0; i < half; i++) sumL += dataArray[i];
        const nrgL = state.isPlaying ? sumL / (half * 255) : 0;

        let sumR = 0;
        for (let i = Math.floor(half / 2); i < bufferLength; i++) sumR += dataArray[i];
        const nrgR = state.isPlaying ? sumR / ((bufferLength - Math.floor(half / 2)) * 255) : 0;

        const minAngle = -2.35;
        const maxAngle = -1.05;

        const targetAngleL = minAngle + (maxAngle - minAngle) * Math.min(1, Math.pow(nrgL, 0.75) * 1.4);
        const targetAngleR = minAngle + (maxAngle - minAngle) * Math.min(1, Math.pow(nrgR, 0.75) * 1.4);

        // Realistic ballistic inertia: fast attack, damped spring decay
        vuState.needleL += (targetAngleL - vuState.needleL) * (targetAngleL > vuState.needleL ? 0.35 : 0.12);
        vuState.needleR += (targetAngleR - vuState.needleR) * (targetAngleR > vuState.needleR ? 0.35 : 0.12);

        if (nrgL > 0.82) vuState.peakL = 10;
        else if (vuState.peakL > 0) vuState.peakL--;

        if (nrgR > 0.82) vuState.peakR = 10;
        else if (vuState.peakR > 0) vuState.peakR--;

        const gap = 6;
        const meterW = Math.floor((w - gap - 6) / 2);
        const meterH = h - 6;

        drawAnalogVuMeter(waveformCtx, 3, 3, meterW, meterH, vuState.needleL, 'CH-LEFT', vuState.peakL > 0);
        drawAnalogVuMeter(waveformCtx, 3 + meterW + gap, 3, meterW, meterH, vuState.needleR, 'CH-RIGHT', vuState.peakR > 0);
      } else {
        // --- Classic & Aurora Waveform Spectrum Bars ---
        const barWidth = (w / bufferLength) * 1.6;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * h;
          const grad = waveformCtx.createLinearGradient(0, h, 0, 0);
          grad.addColorStop(0, vizColors.a);
          grad.addColorStop(1, vizColors.b);

          waveformCtx.fillStyle = grad;
          waveformCtx.fillRect(x, h - barHeight, barWidth - 2, barHeight);
          x += barWidth;
        }
      }
    }

    // Draw mini glowing visualizer overlay on album cover
    if (miniCtx && miniCanvas && state.isPlaying) {
      const mw = miniCanvas.width;
      const mh = miniCanvas.height;
      miniCtx.clearRect(0, 0, mw, mh);
      const avg = dataArray.reduce((acc, v) => acc + v, 0) / bufferLength;

      if (skin === 'hifi') {
        // Warm tube / pilot lamp filament glow
        const radius = 8 + (avg / 255) * 18;
        const grad = miniCtx.createRadialGradient(mw / 2, mh / 2, 2, mw / 2, mh / 2, radius);
        grad.addColorStop(0, 'rgba(255, 220, 130, 0.9)');
        grad.addColorStop(0.4, 'rgba(255, 140, 20, 0.5)');
        grad.addColorStop(1, 'rgba(255, 60, 0, 0)');
        miniCtx.fillStyle = grad;
        miniCtx.beginPath();
        miniCtx.arc(mw / 2, mh / 2, radius, 0, Math.PI * 2);
        miniCtx.fill();
      } else {
        const radius = 6 + (avg / 255) * 16;
        miniCtx.beginPath();
        miniCtx.arc(mw / 2, mh / 2, radius, 0, Math.PI * 2);
        miniCtx.fillStyle = `rgba(${vizColors.accentRgb}, ${(avg / 255) * 0.35})`;
        miniCtx.fill();
      }
    } else if (miniCtx && miniCanvas) {
      miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    }
  }

  // Format Seconds to MM:SS
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Fetch API Helper
  async function api(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, options);
      if (res.status === 401) {
        showLockScreen();
        return null;
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      return null;
    }
  }

  // Load Library Data
  async function loadLibrary() {
    const [stats, decades, genres, playlists] = await Promise.all([
      api('/api/stats'),
      api('/api/decades'),
      api('/api/genres'),
      api('/api/playlists')
    ]);

    if (stats) {
      state.stats = stats;
      countAlbumsEl.textContent = stats.total_albums || 0;
      countTracksEl.textContent = stats.total_tracks || 0;
      countArtistsEl.textContent = stats.total_artists || 0;
      storageStatusEl.textContent = `${stats.total_tracks || 0} Tracks Indexed`;
    }

    if (decades) {
      state.decades = decades;
      renderDecades();
    }

    if (genres) {
      state.genres = genres;
      renderGenres();
    }

    if (playlists) {
      state.playlists = playlists;
      renderPlaylists();
    }

    await reloadActiveView();
  }

  // Dynamic Faceted Counts Update
  async function updateFacetedCounts(params) {
    const [stats, dynamicDecades, dynamicGenres] = await Promise.all([
      api(`/api/stats?${params.toString()}`),
      api(`/api/decades?${params.toString()}`),
      api(`/api/genres?${params.toString()}`)
    ]);

    // 1. Update Views navigation button counters
    if (stats) {
      state.stats = stats;
      countAlbumsEl.textContent = stats.total_albums || 0;
      countTracksEl.textContent = stats.total_tracks || 0;
      countArtistsEl.textContent = stats.total_artists || 0;
    }

    // Helper to get count corresponding to the currently active view
    function getPillCount(item) {
      if (!item) return 0;
      if (state.activeView === 'albums') return item.album_count ?? 0;
      if (state.activeView === 'artists') return item.artist_count ?? 0;
      return item.track_count ?? 0;
    }

    // 2. Update Decade chips with live counts reflecting the active view
    if (dynamicDecades) {
      state.decades = dynamicDecades;
      const countsMap = {};
      dynamicDecades.forEach(d => { countsMap[d.decade] = getPillCount(d); });
      decadesContainer.querySelectorAll('.decade-chip').forEach(chip => {
        const decName = chip.dataset.decade;
        const count = countsMap[decName] ?? 0;
        const subcountEl = chip.querySelector('.subcount');
        if (subcountEl) subcountEl.textContent = count;
        chip.classList.toggle('zero-count', count === 0);
      });
    }

    // 3. Update Genre badges with live counts reflecting the active view
    if (dynamicGenres) {
      state.genres = dynamicGenres;
      const genreCountsMap = {};
      dynamicGenres.forEach(g => { genreCountsMap[g.genre] = getPillCount(g); });
      genresContainer.querySelectorAll('.genre-badge').forEach(badge => {
        const gName = badge.dataset.genre;
        const count = genreCountsMap[gName] ?? 0;
        const subcountEl = badge.querySelector('.subcount-genre');
        if (subcountEl) subcountEl.textContent = `(${count})`;
        badge.classList.toggle('zero-count', count === 0);
      });
    }
  }

  // Helper to get count corresponding to the currently active view
  function getPillCount(item) {
    if (!item) return 0;
    if (state.activeView === 'albums') return item.album_count ?? 0;
    if (state.activeView === 'artists') return item.artist_count ?? 0;
    return item.track_count ?? 0;
  }

  // Render Decades in Sidebar (with data attributes)
  function renderDecades() {
    decadesContainer.innerHTML = '';
    state.decades.forEach(d => {
      const count = getPillCount(d);
      const chip = document.createElement('div');
      chip.className = `decade-chip ${state.filters.decade === d.decade ? 'active' : ''} ${count === 0 ? 'zero-count' : ''}`;
      chip.dataset.decade = d.decade;
      chip.innerHTML = `
        <span>${state.filters.decade === d.decade ? '● ' : ''}${d.decade}</span>
        <span class="subcount">${count}</span>
      `;
      chip.onclick = () => {
        if (state.filters.decade === d.decade) {
          state.filters.decade = null;
        } else {
          state.filters.decade = d.decade;
          state.filters.artist = null;
          state.filters.album = null;
        }
        renderDecades();
        renderGenres();
        updateActiveFilterPills();
        reloadActiveView();
      };
      decadesContainer.appendChild(chip);
    });
  }

  // Handle Genre Selection across the entire application
  function handleGenreSelection(genreName) {
    if (!genreName || genreName === 'N/A' || genreName === 'Other') return;

    if (state.filters.genre === genreName) {
      state.filters.genre = null;
    } else {
      state.filters.genre = genreName;
      state.filters.artist = null;
      state.filters.album = null;
    }
    renderGenres();
    renderDecades();
    updateActiveFilterPills();

    // When clicking a genre while looking at an album, viewport moves to artist view with filter.
    // If already on albums or tracks, keep current view and filter it.
    if (state.activeView === 'album-detail' || state.activeView === 'artist-detail') {
      state.navHistory = [];
      state.activeArtist = null;
      state.activeAlbumDetail = null;
      switchView('artists');
    } else if (state.activeView === 'albums') {
      reloadActiveView();
    } else if (state.activeView === 'tracks') {
      reloadActiveView();
    } else if (state.activeView === 'artists') {
      reloadActiveView();
    } else {
      switchView('artists');
    }
  }

  // Render Genres in Sidebar (with data attributes)
  function renderGenres() {
    genresContainer.innerHTML = '';
    state.genres.forEach(g => {
      const count = getPillCount(g);
      const badge = document.createElement('div');
      badge.className = `genre-badge ${state.filters.genre === g.genre ? 'active' : ''} ${count === 0 ? 'zero-count' : ''}`;
      badge.dataset.genre = g.genre;
      badge.innerHTML = `
        <span>${state.filters.genre === g.genre ? '✓ ' : ''}${g.genre}</span>
        <span class="subcount-genre" style="opacity:0.7; font-size:0.7rem;">(${count})</span>
      `;
      badge.onclick = () => {
        handleGenreSelection(g.genre);
      };
      genresContainer.appendChild(badge);
    });
  }

  // Render Playlists in Sidebar
  function renderPlaylists() {
    if (!playlistsContainer) return;
    playlistsContainer.innerHTML = "";
    if (!state.playlists || state.playlists.length === 0) {
      playlistsContainer.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted, #71717a); padding:6px 10px;">No playlists yet</div>';
      return;
    }
    state.playlists.forEach((pl) => {
      const item = document.createElement("div");
      item.className = "nav-item" + (state.activeView === "playlist" && state.activePlaylistId === pl.id ? " active" : "");
      item.style.cursor = "pointer";
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.justifyContent = "space-between";
      item.style.padding = "6px 12px";
      item.style.fontSize = "0.85rem";
      item.style.borderRadius = "6px";
      item.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${pl.name}">🎧 ${pl.name}</span>
        <span style="font-size:0.7rem; opacity:0.6; margin-left:6px;">${pl.track_count || 0}</span>
      `;
      item.onclick = () => openPlaylistView(pl.id);
      playlistsContainer.appendChild(item);
    });
  }

  // Clear All Filters Helper
  function clearAllFilters() {
    state.filters.decade = null;
    state.filters.genre = null;
    state.filters.artist = null;
    state.filters.album = null;
    state.filters.search = '';
    state.activeAlbumScope = null;
    const titleEl = document.getElementById('tracks-view-title');
    if (titleEl) titleEl.textContent = 'Tracks';
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    renderDecades();
    renderGenres();
    updateActiveFilterPills();
    reloadActiveView();
    showToast('Filters cleared');
  }

  // Active Filter Pills: Decades, Genres, and Search only (Artist and Album are not treated as filter pills)
  function updateActiveFilterPills() {
    activeFiltersContainer.innerHTML = '';
    const { decade, genre, search } = state.filters;

    const hasActiveFilters = Boolean(decade || genre || search);

    if (hasActiveFilters) {
      // Add 'Clear All' pill on the LEFT so it never gets pushed away by other pills
      const clearAllPill = document.createElement('button');
      clearAllPill.className = 'clear-all-pill-btn';
      clearAllPill.textContent = 'Clear All';
      clearAllPill.onclick = clearAllFilters;
      activeFiltersContainer.appendChild(clearAllPill);
    }

    if (decade) {
      addPill('📅', `Decade: ${decade}`, () => {
        state.filters.decade = null;
        renderDecades();
        updateActiveFilterPills();
        reloadActiveView();
      });
    }
    if (genre) {
      addPill('⚡', `Genre: ${genre}`, () => {
        state.filters.genre = null;
        renderGenres();
        updateActiveFilterPills();
        reloadActiveView();
      });
    }
    if (search) {
      addPill('🔍', `Search: "${search}"`, () => {
        state.filters.search = '';
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        updateActiveFilterPills();
        reloadActiveView();
      });
    }
  }

  function addPill(icon, text, onRemove) {
    const pill = document.createElement('div');
    pill.className = 'active-pill';
    pill.innerHTML = `
      <span class="pill-icon">${icon}</span>
      <span>${text}</span>
      <span class="remove-pill" title="Remove filter">&times;</span>
    `;
    pill.querySelector('.remove-pill').onclick = onRemove;
    activeFiltersContainer.appendChild(pill);
  }

  // Reload current view with smooth transition, faceted counts, and sort parameters
  async function reloadActiveView() {
    contentBody.classList.add('filtering');

    const params = new URLSearchParams();
    if (state.filters.decade) params.set('decade', state.filters.decade);
    if (state.filters.genre) params.set('genre', state.filters.genre);
    if (state.filters.artist && !state.activeAlbumScope) params.set('artist', state.filters.artist);
    if (state.filters.search) params.set('search', state.filters.search);

    // If scoped to a specific album, query album tracks directly without global filter pills
    if (state.activeAlbumScope && state.activeView === 'tracks') {
      params.set('album', state.activeAlbumScope.album);
      params.set('artist', state.activeAlbumScope.artist);
    }

    params.set('sortBy', state.sort.sortBy);
    params.set('sortOrder', state.sort.sortOrder);

    try {
      // 1. Asynchronously update dynamic faceted counts for buttons
      updateFacetedCounts(params);

      // 2. Fetch view data
      if (state.activeView === 'albums') {
        params.set('sort', state.albumSort || 'year_desc');
        const albums = await api(`/api/albums?${params.toString()}`);
        state.albums = albums || [];
        renderAlbums();
      } else if (state.activeView === 'tracks') {
        const data = await api(`/api/tracks?${params.toString()}`);
        state.tracks = data ? data.tracks : [];
        renderTracks();
      } else if (state.activeView === 'artists') {
        const artists = await api(`/api/artists?${params.toString()}`);
        state.artists = artists || [];
        renderArtists();
      } else if (state.activeView === 'playlist' && state.activePlaylistId) {
        await loadPlaylistData(state.activePlaylistId);
      }

      updateActiveFilterPills();
    } finally {
      setTimeout(() => {
        contentBody.classList.remove('filtering');
      }, 150);
    }
  }

  // Albums Sorting Logic
  function sortAlbumsList(albums, sortKey) {
    const list = [...albums];
    switch (sortKey) {
      case 'year_asc':
        return list.sort((a, b) => {
          const ya = a.year != null ? a.year : 9999;
          const yb = b.year != null ? b.year : 9999;
          if (ya !== yb) return ya - yb;
          return (a.album || '').localeCompare(b.album || '');
        });
      case 'year_desc':
        return list.sort((a, b) => {
          const ya = a.year != null ? a.year : -1;
          const yb = b.year != null ? b.year : -1;
          if (ya !== yb) return yb - ya;
          return (a.album || '').localeCompare(b.album || '');
        });
      case 'album_asc':
        return list.sort((a, b) => (a.album || '').localeCompare(b.album || ''));
      case 'album_desc':
        return list.sort((a, b) => (b.album || '').localeCompare(a.album || ''));
      case 'artist_asc':
        return list.sort((a, b) => (a.artist || '').localeCompare(b.artist || '') || (a.album || '').localeCompare(b.album || ''));
      case 'artist_desc':
        return list.sort((a, b) => (b.artist || '').localeCompare(a.artist || '') || (a.album || '').localeCompare(b.album || ''));
      case 'tracks_desc':
        return list.sort((a, b) => (b.track_count || 0) - (a.track_count || 0) || (a.album || '').localeCompare(b.album || ''));
      default:
        return list;
    }
  }

  // Albums Grid Density / Column Layout Control
  function setAlbumsGridCols(cols) {
    state.albumGridCols = cols;
    try { localStorage.setItem('playa:albums-grid-cols', cols); } catch (e) {}
    if (albumsGrid) {
      albumsGrid.dataset.grid = cols;
    }
    document.querySelectorAll('#albums-grid-density .grid-col-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cols === cols);
    });
  }

  function initAlbumControls() {
    setAlbumsGridCols(state.albumGridCols);

    if (albumsGridDensity) {
      albumsGridDensity.addEventListener('click', (e) => {
        const btn = e.target.closest('.grid-col-btn');
        if (!btn || !btn.dataset.cols) return;
        setAlbumsGridCols(btn.dataset.cols);
      });
    }

    if (albumsSortSelect) {
      albumsSortSelect.value = state.albumSort;
      albumsSortSelect.addEventListener('change', () => {
        state.albumSort = albumsSortSelect.value;
        try { localStorage.setItem('playa:albums-sort', state.albumSort); } catch (e) {}
        state.isAlbumsShuffled = false;
        if (btnAlbumsShuffle) btnAlbumsShuffle.classList.remove('active');
        state.albums = sortAlbumsList(state.albums, state.albumSort);
        renderAlbums();
      });
    }
  }

  // Render Albums Grid
  function renderAlbums() {
    albumsGrid.innerHTML = '';
    const metaEl = document.getElementById('albums-header-meta');
    metaEl.textContent = `Showing ${state.albums.length} album${state.albums.length === 1 ? '' : 's'}`;

    if (state.albums.length === 0) {
      albumsGrid.innerHTML = `<div class="empty-queue-msg">No albums found matching active filters.</div>`;
      return;
    }

    state.albums.forEach(alb => {
      const card = document.createElement('div');
      card.className = 'album-card';
      const coverUrl = `/api/cover/${alb.cover_hash || 'default'}`;

      card.innerHTML = `
        <div class="album-art-wrap">
          <img src="${coverUrl}" alt="${alb.album}" class="img-lazy" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.src='/api/cover/default'; this.classList.add('loaded');">
          <button class="album-add-playlist-btn" title="Add Album to Playlist">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <div class="play-album-overlay" title="Play Album">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </div>
        </div>
        <div class="album-card-title" title="${alb.album}">${alb.album}</div>
        <div class="album-card-artist" title="${alb.artist}">${alb.artist}</div>
        <div class="album-card-badges">
          <span class="badge-decade">${alb.year || alb.decade || 'N/A'}</span>
          <span class="badge-genre">${alb.genre || 'Underground'}</span>
        </div>
      `;

      // Play whole album
      const playBtn = card.querySelector('.play-album-overlay');
      playBtn.onclick = async (e) => {
        e.stopPropagation();
        const tracksData = await api(`/api/tracks?album=${encodeURIComponent(alb.album)}&artist=${encodeURIComponent(alb.artist)}`);
        if (tracksData && tracksData.tracks.length > 0) {
          state.playbackContext = { type: 'album', album: alb.album, artist: alb.artist };
          setQueue(tracksData.tracks, 0);
        }
      };

      // Add album to playlist
      const addPlBtn = card.querySelector('.album-add-playlist-btn');
      if (addPlBtn) {
        addPlBtn.onclick = (e) => {
          e.stopPropagation();
          openAddToPlaylistModal({ type: 'album', album: alb });
        };
      }

      // Card click opens album detail with cover on left and tracks on right
      card.onclick = () => {
        pushNavHistory({ type: 'albums', selectedAlbum: alb.album, scrollTop: contentBody.scrollTop });
        showAlbumDetail(alb.album, alb.artist);
      };

      albumsGrid.appendChild(card);
    });
  }

  // --- View Navigation History & Selection Helpers ---
  function pushNavHistory(entry) {
    state.navHistory.push(entry);
  }

  function goBack() {
    if (state.navHistory.length === 0) {
      switchView('albums');
      return;
    }
    const prev = state.navHistory.pop();
    if (prev.filtersCleared) {
      state.activeArtist = null;
      state.activeAlbumDetail = null;
      switchView(prev.type || prev.view || 'albums');
      return;
    }
    if (prev.type === 'artists') {
      state.activeArtist = null;
      switchView('artists', true);
      if (prev.selectedArtist) {
        highlightSelectedCard('artist', prev.selectedArtist);
      }
      if (prev.scrollTop != null) {
        setTimeout(() => { contentBody.scrollTop = prev.scrollTop; }, 60);
      }
    } else if (prev.type === 'albums') {
      state.activeAlbumDetail = null;
      switchView('albums', true);
      if (prev.selectedAlbum) {
        highlightSelectedCard('album', prev.selectedAlbum);
      }
      if (prev.scrollTop != null) {
        setTimeout(() => { contentBody.scrollTop = prev.scrollTop; }, 60);
      }
    } else {
      switchView(prev.type || prev.view || 'albums');
    }
  }

  function highlightSelectedCard(type, id) {
    setTimeout(() => {
      document.querySelectorAll('.selected-card').forEach(el => el.classList.remove('selected-card'));
      let target = null;
      const targetStr = String(id || '').trim().toLowerCase();
      if (type === 'artist') {
        document.querySelectorAll('.artist-card').forEach(card => {
          const nameEl = card.querySelector('.artist-name');
          if (nameEl && nameEl.textContent.trim().toLowerCase() === targetStr) {
            target = card;
          }
        });
      } else if (type === 'album') {
        document.querySelectorAll('.album-card').forEach(card => {
          const titleEl = card.querySelector('.album-card-title');
          if (titleEl && titleEl.textContent.trim().toLowerCase() === targetStr) {
            target = card;
          }
        });
      }
      if (target) {
        target.classList.add('selected-card');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  // Sync Shuffle UI across bottom player, detail headers, and album rows
  function syncShuffleUI() {
    const isShuffle = Boolean(state.isShuffle);

    if (btnShuffle) {
      btnShuffle.classList.toggle('active', isShuffle);
      btnShuffle.title = isShuffle ? 'Shuffle is ON (Click to turn off)' : 'Shuffle is OFF (Click to turn on)';
    }

    if (btnAlbumDetailShuffle) {
      btnAlbumDetailShuffle.classList.toggle('active', isShuffle);
      const span = btnAlbumDetailShuffle.querySelector('span');
      if (span) span.textContent = isShuffle ? 'Shuffle: ON' : 'Shuffle Album';
    }

    if (btnArtistActiveShuffle) {
      btnArtistActiveShuffle.classList.toggle('active', isShuffle);
      const span = btnArtistActiveShuffle.querySelector('span');
      if (span) span.textContent = isShuffle ? 'Shuffle: ON' : 'Shuffle Active Album';
    }

    document.querySelectorAll('.album-row-card').forEach(card => {
      const albShuffleBtn = card.querySelector('.btn-album-row-shuffle');
      if (!albShuffleBtn) return;
      const isCardAlbumPlaying = state.playbackContext?.type === 'album' && state.playbackContext?.album === card.dataset.album;
      const shouldBeActive = isShuffle && isCardAlbumPlaying;
      albShuffleBtn.classList.toggle('active', shouldBeActive);
      const span = albShuffleBtn.querySelector('span');
      if (span) span.textContent = shouldBeActive ? 'Shuffle: ON' : 'Shuffle';
    });
    window.dispatchEvent(new CustomEvent('playa:playerupdate'));
  }

  // Reusable Album Row Card Component (Cover on left, track sub-rows on right)
  function createAlbumRowCard(alb, albumTracks, options = {}) {
    const card = document.createElement('div');
    const isCurrentAlbum = state.currentTrack && state.currentTrack.album === alb.album;
    card.className = `album-row-card${isCurrentAlbum ? ' active-album' : ''}`;
    card.dataset.album = alb.album;
    card.dataset.artist = alb.artist;

    const coverUrl = `/api/cover/${alb.cover_hash || 'default'}`;
    const totalDuration = albumTracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const isThisAlbumPlaying = state.playbackContext?.type === 'album' && state.playbackContext?.album === alb.album;
    const isShuffleActive = Boolean(state.isShuffle) && isThisAlbumPlaying;

    card.innerHTML = `
      <div class="album-row-aside">
        <div class="album-row-cover-wrap" title="Play ${alb.album}">
          <img src="${coverUrl}" alt="${alb.album}" class="album-row-cover img-lazy" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.src='/api/cover/default'; this.classList.add('loaded');">
          <div class="album-row-play-overlay">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </div>
        </div>
        <div class="album-row-meta">
          <h3 class="album-row-title" title="${alb.album}">${alb.album}</h3>
          <div class="album-row-artist" title="${alb.artist}">${alb.artist}</div>
          <div class="album-row-tags">
            <span class="badge-decade">${alb.year || alb.decade || 'N/A'}</span>
            <span class="badge-genre">${alb.genre || 'Underground'}</span>
          </div>
          <div class="album-row-stats">${albumTracks.length} Track${albumTracks.length === 1 ? '' : 's'} • ${formatTime(totalDuration)}</div>
          <div class="album-row-actions">
            <button class="btn-album-row-play" title="Play Album (Normal order)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Play</span>
            </button>
            <button class="btn-album-row-shuffle${isShuffleActive ? ' active' : ''}" title="${isShuffleActive ? 'Shuffle is ON (Click to turn off)' : 'Shuffle Album Tracks'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
              <span>${isShuffleActive ? 'Shuffle: ON' : 'Shuffle'}</span>
            </button>
            <button class="btn-album-row-add" title="Add Album to Playlist">+</button>
          </div>
        </div>
      </div>
      <div class="album-row-tracks">
        <table class="subtrack-table">
          <thead>
            <tr>
              <th style="width:44px; text-align:center;">#</th>
              <th>TITLE</th>
              <th style="width:70px; text-align:right;">TIME</th>
              <th style="width:44px; text-align:center;">ADD</th>
            </tr>
          </thead>
          <tbody>
            ${albumTracks.map((t, idx) => {
              const isCurrentTrack = state.currentTrack && state.currentTrack.id === t.id;
              const featText = t.artist && t.artist !== alb.artist ? `<span class="feat-artist">• ${t.artist}</span>` : '';
              return `
                <tr class="subtrack-row${isCurrentTrack ? ' active-track' : ''}" data-track-id="${t.id}" data-index="${idx}">
                  <td class="subtrack-no">
                    <span class="num">${t.track_no != null && t.track_no > 0 ? t.track_no : idx + 1}</span>
                    <span class="play-icon">▶</span>
                    <div class="subtrack-eq"><span></span><span></span><span></span></div>
                  </td>
                  <td class="subtrack-title">
                    <span>${t.title}</span>${featText}
                  </td>
                  <td class="subtrack-duration">${formatTime(t.duration)}</td>
                  <td class="subtrack-actions">
                    <button class="btn-add-track-playlist" title="Add to Playlist">+</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Click Artist name in album row to navigate to that artist
    const artistNameEl = card.querySelector('.album-row-artist');
    if (artistNameEl && options.allowArtistClick) {
      artistNameEl.addEventListener('click', (e) => {
        e.stopPropagation();
        pushNavHistory({ type: 'albums', selectedAlbum: alb.album, scrollTop: contentBody.scrollTop });
        showArtistDetail(alb.artist);
      });
    }

    // Play album handler (clicking cover or Play button)
    const playAlbum = () => {
      if (albumTracks.length > 0) {
        state.playbackContext = { type: 'album', album: alb.album, artist: alb.artist };
        state.isShuffle = false;
        setQueue(albumTracks, 0);
        updatePlayerUI();
        highlightActiveTrack();
        syncShuffleUI();
        showToast(`Playing "${alb.album}" (Normal order)`);
      }
    };

    const coverWrap = card.querySelector('.album-row-cover-wrap');
    if (coverWrap) coverWrap.addEventListener('click', playAlbum);

    const playBtn = card.querySelector('.btn-album-row-play');
    if (playBtn) playBtn.addEventListener('click', playAlbum);

    // Shuffle album handler
    const shuffleBtn = card.querySelector('.btn-album-row-shuffle');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (albumTracks.length === 0) return;

        const isCurrentlyPlayingThisAlbum = state.playbackContext?.type === 'album' && state.playbackContext?.album === alb.album;

        if (isCurrentlyPlayingThisAlbum) {
          state.isShuffle = !state.isShuffle;
          syncShuffleUI();
          showToast(state.isShuffle ? `Shuffle: ON ("${alb.album}")` : `Shuffle: OFF (Normal track order)`);
        } else {
          state.playbackContext = { type: 'album', album: alb.album, artist: alb.artist };
          state.isShuffle = true;
          const randIdx = Math.floor(Math.random() * albumTracks.length);
          setQueue(albumTracks, randIdx);
          updatePlayerUI();
          highlightActiveTrack();
          syncShuffleUI();
          showToast(`Shuffle: ON ("${alb.album}")`);
        }
      });
    }

    // Add album to playlist
    const addAlbumBtn = card.querySelector('.btn-album-row-add');
    if (addAlbumBtn) {
      addAlbumBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddToPlaylistModal({ type: 'album', album: alb });
      });
    }

    // Subtrack row clicks
    card.querySelectorAll('.subtrack-row').forEach(row => {
      const trackIdx = parseInt(row.dataset.index, 10);
      const trackObj = albumTracks[trackIdx];

      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-add-track-playlist')) return;
        state.playbackContext = { type: 'album', album: alb.album, artist: alb.artist };
        setQueue(albumTracks, trackIdx);
        updatePlayerUI();
        highlightActiveTrack();
      });

      const addBtn = row.querySelector('.btn-add-track-playlist');
      if (addBtn && trackObj) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openAddToPlaylistModal({ type: 'track', track: trackObj });
        });
      }
    });

    return card;
  }

  // --- Artist Detail View (Albums with Track Sub-rows) ---
  async function showArtistDetail(artistName) {
    state.activeArtist = artistName;
    switchView('artist-detail', true);

    const titleEl = document.getElementById('artist-detail-title');
    const metaEl = document.getElementById('artist-detail-meta');
    if (titleEl) titleEl.textContent = artistName;
    if (metaEl) metaEl.textContent = 'Loading albums & tracks...';

    if (artistAlbumsList) {
      artistAlbumsList.innerHTML = '<div class="empty-queue-msg">Loading artist tracks...</div>';
    }

    const tracksData = await api(`/api/tracks?artist=${encodeURIComponent(artistName)}`);
    const tracks = tracksData ? tracksData.tracks : [];

    if (tracks.length === 0) {
      if (metaEl) metaEl.textContent = '0 Albums • 0 Tracks';
      if (artistAlbumsList) artistAlbumsList.innerHTML = `<div class="empty-queue-msg">No tracks found for ${artistName}.</div>`;
      return;
    }

    // Group tracks by album
    const albumGroups = new Map();
    tracks.forEach(t => {
      const albName = t.album || 'Unknown Album';
      if (!albumGroups.has(albName)) {
        albumGroups.set(albName, {
          album: albName,
          artist: artistName,
          year: t.year || null,
          decade: t.decade || null,
          genre: t.genre || null,
          cover_hash: t.cover_hash || null,
          tracks: []
        });
      }
      const grp = albumGroups.get(albName);
      if (!grp.cover_hash && t.cover_hash) grp.cover_hash = t.cover_hash;
      if (!grp.year && t.year) grp.year = t.year;
      grp.tracks.push(t);
    });

    const albumList = Array.from(albumGroups.values());
    if (metaEl) {
      metaEl.textContent = `${albumList.length} Album${albumList.length === 1 ? '' : 's'} • ${tracks.length} Track${tracks.length === 1 ? '' : 's'}`;
    }

    if (artistAlbumsList) {
      artistAlbumsList.innerHTML = '';
      albumList.forEach(alb => {
        alb.tracks.sort((a, b) => (a.track_no || 0) - (b.track_no || 0));
        const card = createAlbumRowCard(alb, alb.tracks, { allowArtistClick: false });
        artistAlbumsList.appendChild(card);
      });
    }

    highlightActiveTrack();
    syncShuffleUI();
  }

  // --- Album Detail View (Single Album with Track Sub-rows) ---
  async function showAlbumDetail(albumName, artistName) {
    state.activeAlbumDetail = { album: albumName, artist: artistName };
    switchView('album-detail', true);

    const titleEl = document.getElementById('album-detail-title');
    const metaEl = document.getElementById('album-detail-meta');
    if (titleEl) titleEl.textContent = albumName;
    if (metaEl) metaEl.textContent = `Album by ${artistName}`;

    if (albumDetailContent) {
      albumDetailContent.innerHTML = '<div class="empty-queue-msg">Loading album tracks...</div>';
    }

    const tracksData = await api(`/api/tracks?album=${encodeURIComponent(albumName)}&artist=${encodeURIComponent(artistName)}`);
    const tracks = tracksData ? tracksData.tracks : [];

    if (tracks.length === 0) {
      if (albumDetailContent) albumDetailContent.innerHTML = `<div class="empty-queue-msg">No tracks found for this album.</div>`;
      return;
    }

    tracks.sort((a, b) => (a.track_no || 0) - (b.track_no || 0));

    const albInfo = {
      album: albumName,
      artist: artistName,
      year: tracks[0].year || null,
      decade: tracks[0].decade || null,
      genre: tracks[0].genre || null,
      cover_hash: tracks.find(t => t.cover_hash)?.cover_hash || null
    };

    if (albumDetailContent) {
      albumDetailContent.innerHTML = '';
      const card = createAlbumRowCard(albInfo, tracks, { allowArtistClick: true });
      albumDetailContent.appendChild(card);
    }

    highlightActiveTrack();
    syncShuffleUI();

    if (state.currentTrack) {
      setTimeout(() => {
        const activeRow = albumDetailContent.querySelector(`.subtrack-row[data-track-id="${state.currentTrack.id}"]`);
        if (activeRow) {
          activeRow.classList.add('active-track');
          activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }

  // Show album tracks in tracks view without creating filter pills
  async function showAlbumTracks(albumName, artistName, selectTrackId = null) {
    state.activeAlbumScope = { album: albumName, artist: artistName };
    switchView('tracks', true);

    const titleEl = document.getElementById('tracks-view-title');
    const metaEl = document.getElementById('tracks-header-meta');
    if (titleEl) titleEl.textContent = albumName;
    if (metaEl) metaEl.textContent = `Album by ${artistName}`;

    // Reset sort indicators and tracks page shuffle
    document.querySelectorAll('.sort-indicator').forEach(el => { el.textContent = ''; });
    const shuffleBtn = document.getElementById('btn-tracks-page-shuffle');
    if (shuffleBtn) shuffleBtn.classList.remove('active');
    state.isTracksShuffled = false;

    const tracksData = await api(`/api/tracks?album=${encodeURIComponent(albumName)}&artist=${encodeURIComponent(artistName)}`);
    state.tracks = tracksData ? tracksData.tracks : [];
    renderTracks();

    const targetId = selectTrackId || (state.currentTrack && state.currentTrack.album === albumName ? state.currentTrack.id : null);
    if (targetId) {
      setTimeout(() => {
        const rows = tracksList.querySelectorAll('tr');
        state.tracks.forEach((t, i) => {
          if (t.id === targetId && rows[i]) {
            rows[i].classList.add('active-track');
            rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      }, 60);
    }
  }

  // Render Tracks Table
  function renderTracks() {
    tracksList.innerHTML = '';
    const metaEl = document.getElementById('tracks-header-meta');
    metaEl.textContent = `Showing ${state.tracks.length} track${state.tracks.length === 1 ? '' : 's'}`;

    updateSortIndicators();

    if (state.tracks.length === 0) {
      tracksList.innerHTML = `<tr><td colspan="8" class="empty-queue-msg">No tracks found matching query.</td></tr>`;
      return;
    }

    state.tracks.forEach((track, idx) => {
      const tr = document.createElement('tr');
      const isCurrent = state.currentTrack && state.currentTrack.id === track.id;
      if (isCurrent) tr.className = 'active-track';

      const coverUrl = `/api/cover/${track.cover_hash || 'default'}`;
      tr.innerHTML = `
        <td class="track-num-cell">${idx + 1}</td>
        <td class="track-title-cell">
          <img src="${coverUrl}" class="track-thumb img-lazy" alt="cover" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.src='/api/cover/default'; this.classList.add('loaded');">
          <span>${track.title}</span>
        </td>
        <td>${track.artist}</td>
        <td>${track.album}</td>
        <td><span class="badge-genre">${track.genre || 'N/A'}</span></td>
        <td><span class="badge-decade">${track.decade || track.year || 'N/A'}</span></td>
        <td class="track-duration-cell">${formatTime(track.duration)}</td>
        <td class="th-actions">
          <button class="btn-add-track-playlist" title="Add to Playlist">+</button>
        </td>
      `;

      // Click row to play
      tr.onclick = (e) => {
        if (e.target.closest('.btn-add-track-playlist')) return;
        if (state.activeAlbumScope) {
          state.playbackContext = { type: 'album', album: state.activeAlbumScope.album, artist: state.activeAlbumScope.artist };
        } else {
          state.playbackContext = { type: 'tracks' };
        }
        setQueue(state.tracks, idx);
      };

      // Add to playlist
      const addBtn = tr.querySelector('.btn-add-track-playlist');
      if (addBtn) {
        addBtn.onclick = (e) => {
          e.stopPropagation();
          openAddToPlaylistModal({ type: 'track', track });
        };
      }

      tracksList.appendChild(tr);
    });
  }

  // Render Artists Grid (Exclusive Artist Filter)
  function renderArtists() {
    artistsGrid.innerHTML = '';
    const metaEl = document.getElementById('artists-header-meta');
    metaEl.textContent = `All Artists (${state.artists.length})`;

    state.artists.forEach(art => {
      const card = document.createElement('div');
      card.className = 'artist-card';
      const coverUrl = `/api/cover/${art.cover_hash || 'default'}`;

      card.innerHTML = `
        <img src="${coverUrl}" class="artist-avatar img-lazy" alt="${art.artist}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.src='/api/cover/default'; this.classList.add('loaded');">
        <div class="artist-name">${art.artist}</div>
        <div class="artist-sub">${art.album_count} Albums • ${art.track_count} Tracks</div>
      `;

      card.onclick = () => {
        pushNavHistory({ type: 'artists', selectedArtist: art.artist, scrollTop: contentBody.scrollTop });
        showArtistDetail(art.artist);
      };

      artistsGrid.appendChild(card);
    });
  }

  // Column Sorting Logic
  function updateSortIndicators() {
    document.querySelectorAll('.sort-indicator').forEach(el => {
      el.textContent = '';
    });
    const activeSortEl = document.getElementById(`sort-${state.sort.sortBy}`);
    if (activeSortEl) {
      activeSortEl.textContent = state.sort.sortOrder === 'ASC' ? '▲' : '▼';
    }
  }

  document.querySelectorAll('.th-sortable').forEach(th => {
    th.addEventListener('click', async () => {
      const sortField = th.dataset.sort;
      if (!sortField) return;

      // Undo tracks page shuffle when sorting by a column
      state.isTracksShuffled = false;
      const shuffleBtn = document.getElementById('btn-tracks-page-shuffle');
      if (shuffleBtn) shuffleBtn.classList.remove('active');

      if (state.sort.sortBy === sortField) {
        state.sort.sortOrder = state.sort.sortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        state.sort.sortBy = sortField;
        state.sort.sortOrder = 'ASC';
      }

      await reloadActiveView();

      // If playing from general tracks (not an album), update queue to match the new sort order!
      if (state.playbackContext && state.playbackContext.type === 'tracks') {
        state.queue = [...state.tracks];
        state.queueIndex = state.queue.findIndex(t => t.id === state.currentTrack?.id);
        updateQueueDrawer();
      }
    });
  });

  // Playlist View Logic
  async function openPlaylistView(playlistId) {
    state.activePlaylistId = playlistId;
    switchView('playlist');
    await loadPlaylistData(playlistId);
  }

  async function loadPlaylistData(playlistId) {
    const pl = await api(`/api/playlists/${playlistId}`);
    if (!pl) return;
    state.activePlaylistData = pl;

    playlistViewTitle.textContent = pl.name;
    playlistViewDesc.textContent = pl.description || 'Custom playlist in your personal Playa vault.';
    playlistViewCover.src = `/api/cover/${pl.cover_hash || 'default'}`;

    const totalSecs = (pl.tracks || []).reduce((acc, t) => acc + (t.duration || 0), 0);
    const mins = Math.round(totalSecs / 60);
    playlistViewMeta.textContent = `${pl.tracks.length} tracks • ~${mins} mins`;

    renderPlaylistTracks(pl.tracks || []);
    renderPlaylists(); // update active state in sidebar
  }

  function renderPlaylistTracks(tracks) {
    playlistTracksList.innerHTML = '';
    if (tracks.length === 0) {
      playlistTracksList.innerHTML = `<tr><td colspan="6" class="empty-queue-msg">This playlist is currently empty. Add tracks using '+' on any track or album!</td></tr>`;
      return;
    }

    tracks.forEach((track, idx) => {
      const tr = document.createElement('tr');
      const isCurrent = state.currentTrack && state.currentTrack.id === track.id;
      if (isCurrent) tr.className = 'active-track';

      const coverUrl = `/api/cover/${track.cover_hash || 'default'}`;
      tr.innerHTML = `
        <td class="track-num-cell">${idx + 1}</td>
        <td class="track-title-cell">
          <img src="${coverUrl}" class="track-thumb img-lazy" alt="cover" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.src='/api/cover/default'; this.classList.add('loaded');">
          <span>${track.title}</span>
        </td>
        <td>${track.artist}</td>
        <td>${track.album}</td>
        <td class="track-duration-cell">${formatTime(track.duration)}</td>
        <td class="th-actions">
          <button class="btn-remove-track" title="Remove from playlist">&times;</button>
        </td>
      `;

      tr.onclick = (e) => {
        if (e.target.closest('.btn-remove-track')) return;
        setQueue(tracks, idx);
      };

      const removeBtn = tr.querySelector('.btn-remove-track');
      removeBtn.onclick = async (e) => {
        e.stopPropagation();
        await api(`/api/playlists/${state.activePlaylistId}/tracks/${track.id}`, { method: 'DELETE' });
        showToast(`Removed "${track.title}" from playlist`);
        await loadPlaylistData(state.activePlaylistId);
        const plList = await api('/api/playlists');
        if (plList) {
          state.playlists = plList;
          renderPlaylists();
        }
      };

      playlistTracksList.appendChild(tr);
    });
  }

  // Play All Playlist
  btnPlayPlaylist.addEventListener('click', () => {
    if (state.activePlaylistData && state.activePlaylistData.tracks && state.activePlaylistData.tracks.length > 0) {
      setQueue(state.activePlaylistData.tracks, 0);
    } else {
      showToast('Playlist is empty.');
    }
  });

  // Delete Playlist
  btnDeletePlaylist.addEventListener('click', async () => {
    if (!state.activePlaylistId) return;
    const confirmDelete = confirm(`Are you sure you want to delete playlist "${state.activePlaylistData?.name}"?`);
    if (!confirmDelete) return;

    await api(`/api/playlists/${state.activePlaylistId}`, { method: 'DELETE' });
    showToast('Playlist deleted');
    state.activePlaylistId = null;
    const plList = await api('/api/playlists');
    if (plList) {
      state.playlists = plList;
      renderPlaylists();
    }
    switchView('albums');
  });

  // Add to Playlist Modal Logic
  function openAddToPlaylistModal(target) {
    state.pendingAddToPlaylist = target;
    if (target.type === 'track') {
      modalTargetTitle.textContent = `Add "${target.track.title}" to Playlist`;
    } else if (target.type === 'album') {
      modalTargetTitle.textContent = `Add Album "${target.album.album}" to Playlist`;
    }

    renderModalPlaylists();
    newPlaylistNameInput.value = '';
    playlistModal.style.display = 'flex';
  }

  function renderModalPlaylists() {
    modalPlaylistsList.innerHTML = '';
    if (state.playlists.length === 0) {
      modalPlaylistsList.innerHTML = `<div style="color:var(--text-dim); font-size:0.8rem; padding:8px 0;">No existing playlists yet. Create one above!</div>`;
      return;
    }

    state.playlists.forEach(pl => {
      const item = document.createElement('div');
      item.className = 'playlist-modal-item';
      item.innerHTML = `
        <span style="font-weight:600;">${pl.name}</span>
        <span class="modal-pl-count">${pl.track_count} tracks</span>
      `;
      item.onclick = () => executeAddToPlaylist(pl.id, pl.name);
      modalPlaylistsList.appendChild(item);
    });
  }

  async function executeAddToPlaylist(playlistId, playlistName) {
    const target = state.pendingAddToPlaylist;
    if (!target) return;

    let payload = {};
    if (target.type === 'track') {
      payload = { trackId: target.track.id };
    } else if (target.type === 'album') {
      // Fetch all track IDs for the album
      const albumTracks = await api(`/api/tracks?album=${encodeURIComponent(target.album.album)}&artist=${encodeURIComponent(target.album.artist)}`);
      if (albumTracks && albumTracks.tracks) {
        payload = { trackIds: albumTracks.tracks.map(t => t.id) };
      }
    }

    const res = await api(`/api/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res && res.success) {
      showToast(`Added to "${playlistName}"!`);
      playlistModal.style.display = 'none';
      state.pendingAddToPlaylist = null;
      // Refresh playlists
      const plList = await api('/api/playlists');
      if (plList) {
        state.playlists = plList;
        renderPlaylists();
      }
      if (state.activeView === 'playlist' && state.activePlaylistId === playlistId) {
        loadPlaylistData(playlistId);
      }
    } else {
      showToast('Failed to add to playlist.');
    }
  }

  // Create New Playlist from modal or sidebar
  btnCreatePlaylistSubmit.addEventListener('click', async () => {
    const name = newPlaylistNameInput.value.trim();
    if (!name) return;

    const res = await api('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (res && res.id) {
      showToast(`Created playlist "${name}"`);
      const plList = await api('/api/playlists');
      if (plList) {
        state.playlists = plList;
        renderPlaylists();
      }

      if (state.pendingAddToPlaylist) {
        await executeAddToPlaylist(res.id, name);
      } else {
        playlistModal.style.display = 'none';
        openPlaylistView(res.id);
      }
    } else {
      showToast('Playlist name already exists or invalid.');
    }
  });

  newPlaylistTriggerBtn.addEventListener('click', () => {
    state.pendingAddToPlaylist = null;
    modalTargetTitle.textContent = 'Create New Playlist';
    newPlaylistNameInput.value = '';
    renderModalPlaylists();
    playlistModal.style.display = 'flex';
    newPlaylistNameInput.focus();
  });

  closePlaylistModalBtn.addEventListener('click', () => {
    playlistModal.style.display = 'none';
    state.pendingAddToPlaylist = null;
  });

  playlistModal.addEventListener('click', (e) => {
    if (e.target === playlistModal) {
      playlistModal.style.display = 'none';
      state.pendingAddToPlaylist = null;
    }
  });

  // Queue & Playback Functions
  function applyShuffleQueue(enableShuffle) {
    if (enableShuffle) {
      if (!state.unshuffledQueue || state.unshuffledQueue.length === 0) {
        state.unshuffledQueue = [...state.queue];
      }
      const currentTrack = state.currentTrack || state.queue[state.queueIndex];
      const otherTracks = state.queue.filter(t => !currentTrack || String(t.id) !== String(currentTrack.id));
      for (let i = otherTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
      }
      state.queue = currentTrack ? [currentTrack, ...otherTracks] : otherTracks;
      state.queueIndex = 0;
    } else {
      if (state.unshuffledQueue && state.unshuffledQueue.length > 0) {
        const currentTrack = state.currentTrack || state.queue[state.queueIndex];
        state.queue = [...state.unshuffledQueue];
        if (currentTrack) {
          const found = state.queue.findIndex(t => String(t.id) === String(currentTrack.id));
          state.queueIndex = found !== -1 ? found : 0;
        }
        state.unshuffledQueue = null;
      }
    }
    updateQueueDrawer();
    window.dispatchEvent(new CustomEvent('playa:playerupdate'));
  }

  function setQueue(tracks, startIndex = 0) {
    state.unshuffledQueue = [...tracks];
    if (state.isShuffle) {
      const selectedTrack = tracks[startIndex] || tracks[0];
      const otherTracks = tracks.filter((_, idx) => idx !== startIndex);
      for (let i = otherTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
      }
      state.queue = selectedTrack ? [selectedTrack, ...otherTracks] : otherTracks;
      state.queueIndex = 0;
    } else {
      state.queue = [...tracks];
      state.queueIndex = startIndex;
    }
    updateQueueDrawer();
    playTrack(state.queue[state.queueIndex]);
  }

  function playTrack(track) {
    if (!track) return;
    state.currentTrack = track;
    updatePlayerUI();
    highlightActiveTrack();

    initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    audio.src = `/api/stream/${track.id}`;
    audio.play().then(() => {
      state.isPlaying = true;
      updatePlayerUI();
    }).catch(err => {
      console.warn("Autoplay notice:", err.message);
      state.isPlaying = false;
      updatePlayerUI();
    });
  }

  function togglePlay() {
    if (!state.currentTrack) {
      if (state.queue.length > 0) {
        setQueue(state.queue, 0);
      } else if (state.tracks.length > 0) {
        setQueue(state.tracks, 0);
      }
      return;
    }

    initAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    if (audio.paused) {
      audio.play().then(() => {
        state.isPlaying = true;
        updatePlayerUI();
      }).catch(console.warn);
    } else {
      audio.pause();
      state.isPlaying = false;
      updatePlayerUI();
    }
  }

  function playNext() {
    if (state.queue.length === 0) return;
    state.queueIndex = (state.queueIndex + 1) % state.queue.length;
    playTrack(state.queue[state.queueIndex]);
    updateQueueDrawer();
  }

  function playPrev() {
    if (state.queue.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
    playTrack(state.queue[state.queueIndex]);
    updateQueueDrawer();
  }

  // Public player API used by full-scene skins (Hi-Fi stack, Cyberdeck)
  window.PlayaPlayer = {
    setQueue,
    playTrack,
    playNext,
    playPrev,
    togglePlay,
    applyShuffleQueue,
    get state() { return state; },
    get analyser() { return analyser; },
    ensureAudio() {
      initAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    }
  };

  function getTrackAudioFormat(track) {
    if (!track) return '';
    const fp = (track.filepath || '').toLowerCase();
    if (fp.endsWith('.flac')) return 'FLAC';
    if (fp.endsWith('.wav')) return 'WAV';
    if (fp.endsWith('.aiff') || fp.endsWith('.aif')) return 'AIFF';
    if (fp.endsWith('.m4a') || fp.endsWith('.aac')) return 'AAC';
    if (fp.endsWith('.ogg')) return 'OGG';
    if (fp.endsWith('.mp3')) return 'MP3';
    return 'HI-FI';
  }

  function updatePlayerUI() {
    if (state.currentTrack) {
      playerTitle.textContent = state.currentTrack.title;
      playerArtist.textContent = `${state.currentTrack.artist} — ${state.currentTrack.album}`;
      playerCover.src = `/api/cover/${state.currentTrack.cover_hash || 'default'}`;
      if (playerFormatBadge) {
        playerFormatBadge.textContent = getTrackAudioFormat(state.currentTrack);
        playerFormatBadge.style.display = 'inline-block';
      }
    } else {
      if (playerFormatBadge) playerFormatBadge.style.display = 'none';
    }

    if (state.isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
      btnPlay.classList.add('playing');
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
      btnPlay.classList.remove('playing');
    }

    if (window.PlayaHifiStack && typeof window.PlayaHifiStack.syncAll === 'function') {
      window.PlayaHifiStack.syncAll();
    }
    window.dispatchEvent(new CustomEvent('playa:playerupdate'));
  }

  function highlightActiveTrack() {
    document.querySelectorAll('.tracks-table tr, .subtrack-row').forEach(tr => tr.classList.remove('active-track'));
    document.querySelectorAll('.album-row-card').forEach(card => card.classList.remove('active-album'));
    if (!state.currentTrack) return;

    if (tracksList) {
      const rows = tracksList.querySelectorAll('tr');
      state.tracks.forEach((t, i) => {
        if (t.id === state.currentTrack.id && rows[i]) {
          rows[i].classList.add('active-track');
        }
      });
    }

    // Highlight in subtrack rows and album row cards
    document.querySelectorAll(`.subtrack-row[data-track-id="${state.currentTrack.id}"]`).forEach(r => {
      r.classList.add('active-track');
      const card = r.closest('.album-row-card');
      if (card) card.classList.add('active-album');
    });
  }

  function updateQueueDrawer() {
    queueList.innerHTML = '';
    queueCountBadge.textContent = state.queue.length;
    if (playerQueueCount) playerQueueCount.textContent = state.queue.length;

    if (state.queue.length === 0) {
      queueList.innerHTML = `<div class="empty-queue-msg">Queue is empty. Select a track or album!</div>`;
      return;
    }

    state.queue.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = `queue-item ${i === state.queueIndex ? 'active' : ''}`;
      const coverUrl = `/api/cover/${track.cover_hash || 'default'}`;

      item.innerHTML = `
        <img src="${coverUrl}" class="queue-item-thumb img-lazy" alt="cover" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="this.src='/api/cover/default'; this.classList.add('loaded');">
        <div class="queue-item-info">
          <div class="queue-item-title">${track.title}</div>
          <div class="queue-item-artist">${track.artist}</div>
        </div>
      `;

      item.onclick = () => {
        state.queueIndex = i;
        playTrack(state.queue[state.queueIndex]);
        updateQueueDrawer();
      };

      queueList.appendChild(item);
    });
  }

  // View Switching
  function switchView(viewName, skipReload = false) {
    state.activeView = viewName;
    const parentNavView = viewName === 'artist-detail' ? 'artists' : (viewName === 'album-detail' ? 'albums' : viewName);
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === parentNavView);
    });
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });
    if (viewName !== 'playlist') {
      state.activePlaylistId = null;
      renderPlaylists();
      if (!skipReload) {
        reloadActiveView();
      }
    }
  }

  // Audio Event Listeners
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const current = audio.currentTime;
    const duration = audio.duration;
    currentTimeEl.textContent = formatTime(current);
    totalTimeEl.textContent = formatTime(duration);
    const pct = (current / duration) * 100;
    scrubberFill.style.width = `${pct}%`;
    scrubberHandle.style.left = `${pct}%`;
  });

  audio.addEventListener('ended', () => {
    if (state.repeatMode === 'one') {
      audio.currentTime = 0;
      audio.play();
    } else {
      playNext();
    }
  });

  audio.addEventListener('error', () => {
    state.isPlaying = false;
    updatePlayerUI();
    showToast('⚠️ Track audio file not found. Add your DigitalOcean Spaces env vars to stream audio.');
  });

  // Scrubber Seeking
  scrubberBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = scrubberBar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  });

  // Scrubber Hover Preview Tooltip
  scrubberBar.addEventListener('mousemove', (e) => {
    if (!audio.duration || !scrubberTooltip) return;
    const rect = scrubberBar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = ratio * audio.duration;
    scrubberTooltip.textContent = formatTime(hoverTime);
    scrubberTooltip.style.left = `${ratio * 100}%`;
    scrubberTooltip.classList.add('visible');
  });

  scrubberBar.addEventListener('mouseleave', () => {
    if (scrubberTooltip) scrubberTooltip.classList.remove('visible');
  });

  // Volume Slider & Mouse Wheel Control
  volumeSlider.addEventListener('click', (e) => {
    const rect = volumeSlider.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.volume = ratio;
    volumeFill.style.width = `${ratio * 100}%`;
    updateVolumeIcon(ratio);
  });

  const volumeContainer = document.querySelector('.volume-container');
  if (volumeContainer) {
    volumeContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      const newVol = Math.max(0, Math.min(1, parseFloat((audio.volume + delta).toFixed(2))));
      audio.volume = newVol;
      volumeFill.style.width = `${newVol * 100}%`;
      updateVolumeIcon(newVol);
    }, { passive: false });
  }

  function updateVolumeIcon(vol) {
    if (vol === 0) {
      volHighIcon.style.display = 'none';
      volMuteIcon.style.display = 'block';
    } else {
      volHighIcon.style.display = 'block';
      volMuteIcon.style.display = 'none';
    }
  }

  btnMute.addEventListener('click', () => {
    if (audio.volume > 0) {
      audio.dataset.prevVol = audio.volume;
      audio.volume = 0;
      volumeFill.style.width = '0%';
      updateVolumeIcon(0);
    } else {
      const prev = parseFloat(audio.dataset.prevVol || 0.85);
      audio.volume = prev;
      volumeFill.style.width = `${prev * 100}%`;
      updateVolumeIcon(prev);
    }
  });

  // Controls Listeners
  btnPlay.addEventListener('click', togglePlay);
  btnNext.addEventListener('click', playNext);
  btnPrev.addEventListener('click', playPrev);

  btnShuffle.addEventListener('click', () => {
    state.isShuffle = !state.isShuffle;
    syncShuffleUI();
    showToast(state.isShuffle ? 'Shuffle: ON' : 'Shuffle: OFF (Normal track order)');
  });

  btnRepeat.addEventListener('click', () => {
    if (state.repeatMode === 'none') {
      state.repeatMode = 'all';
      btnRepeat.classList.add('active');
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      btnRepeat.classList.add('active', 'repeat-one');
    } else {
      state.repeatMode = 'none';
      btnRepeat.classList.remove('active', 'repeat-one');
    }
  });

  // Navigation Links
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.navHistory = [];
      state.activeArtist = null;
      state.activeAlbumDetail = null;
      if (btn.dataset.view === 'tracks') {
        state.activeAlbumScope = null;
        const titleEl = document.getElementById('tracks-view-title');
        if (titleEl) titleEl.textContent = 'Tracks';
      } else if (btn.dataset.view === 'albums') {
        state.filters.artist = null;
      }
      switchView(btn.dataset.view);
    });
  });

  // Clear filters
  document.getElementById('clear-decade-btn').onclick = () => {
    state.filters.decade = null;
    renderDecades();
    updateActiveFilterPills();
    reloadActiveView();
  };
  document.getElementById('clear-genre-btn').onclick = () => {
    state.filters.genre = null;
    renderGenres();
    updateActiveFilterPills();
    reloadActiveView();
  };

  // Search Input with Debounce
  let searchTimer = null;
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    searchClearBtn.style.display = val ? 'block' : 'none';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.search = val;
      reloadActiveView();
    }, 250);
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    state.filters.search = '';
    reloadActiveView();
  });

  // Queue Drawer Toggle & Sync
  function toggleQueueDrawer() {
    queueDrawer.classList.toggle('open');
    const isOpen = queueDrawer.classList.contains('open');
    if (playerQueueBtn) playerQueueBtn.classList.toggle('active', isOpen);
    if (toggleQueueBtn) toggleQueueBtn.classList.toggle('active', isOpen);
  }

  toggleQueueBtn.addEventListener('click', toggleQueueDrawer);
  if (playerQueueBtn) playerQueueBtn.addEventListener('click', toggleQueueDrawer);
  closeQueueBtn.addEventListener('click', () => {
    queueDrawer.classList.remove('open');
    if (playerQueueBtn) playerQueueBtn.classList.remove('active');
    if (toggleQueueBtn) toggleQueueBtn.classList.remove('active');
  });

  // Collapsible Sidebar Sections
  function initCollapsibleSidebar() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem('playa:collapsed-sections') || '{}');
    } catch (e) {
      saved = {};
    }

    document.querySelectorAll('.sidebar-section.collapsible').forEach(section => {
      const sectionKey = section.dataset.section;
      if (sectionKey && saved[sectionKey]) {
        section.classList.add('collapsed');
      }

      const titleWrap = section.querySelector('.section-title-wrap');
      if (titleWrap) {
        titleWrap.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          section.classList.toggle('collapsed');
          const isCollapsed = section.classList.contains('collapsed');
          if (sectionKey) {
            saved[sectionKey] = isCollapsed;
            localStorage.setItem('playa:collapsed-sections', JSON.stringify(saved));
          }
        });
      }
    });
  }

  // Rescan Trigger
  rescanBtn.addEventListener('click', async () => {
    rescanBtn.textContent = 'Scanning...';
    await fetch('/api/scan', { method: 'POST' });
    setTimeout(async () => {
      await loadLibrary();
      rescanBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        Rescan
      `;
    }, 1500);
  });

  // 1. If playing an album or track, clicking the player cover brings the user to that album with filters cleared
  if (playerCoverBox) {
    playerCoverBox.title = "Go to Album";
    playerCoverBox.addEventListener('click', () => {
      if (!state.currentTrack) return;
      if (!state.currentTrack.album) {
        showToast('No album information for this track');
        return;
      }

      // Clear all active filters and search
      state.filters.decade = null;
      state.filters.genre = null;
      state.filters.search = '';
      state.filters.artist = null;
      state.filters.album = null;
      state.activeAlbumScope = null;
      const titleEl = document.getElementById('tracks-view-title');
      if (titleEl) titleEl.textContent = 'Tracks';
      if (searchInput) searchInput.value = '';
      if (searchClearBtn) searchClearBtn.style.display = 'none';
      document.querySelectorAll('.selected-card').forEach(el => el.classList.remove('selected-card'));
      renderDecades();
      renderGenres();
      updateActiveFilterPills();

      pushNavHistory({ type: state.activeView, scrollTop: contentBody.scrollTop, filtersCleared: true });
      showAlbumDetail(state.currentTrack.album, state.currentTrack.artist);
    });
  }

  // Click delegation for genre badges anywhere in cards, tables, or album rows
  document.addEventListener('click', (e) => {
    const badge = e.target.closest('.badge-genre');
    if (badge) {
      e.stopPropagation();
      const genre = badge.textContent.trim();
      handleGenreSelection(genre);
    }
  });

  // 2. If playing a song, clicking the song details shows the tracks window without filter and the current song selected
  const playerDetails = document.querySelector('.player-details');
  if (playerDetails) {
    playerDetails.title = "Show in tracks library";
    playerDetails.addEventListener('click', async () => {
      if (!state.currentTrack) return;
      // Clear filters
      state.filters.decade = null;
      state.filters.genre = null;
      state.filters.search = '';
      state.filters.artist = null;
      state.filters.album = null;
      state.activeAlbumScope = null;
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      renderDecades();
      renderGenres();
      updateActiveFilterPills();

      const titleEl = document.getElementById('tracks-view-title');
      if (titleEl) titleEl.textContent = 'Tracks';

      switchView('tracks');
      await reloadActiveView();

      setTimeout(() => {
        const rows = tracksList.querySelectorAll('tr');
        state.tracks.forEach((t, i) => {
          if (t.id === state.currentTrack.id && rows[i]) {
            rows[i].classList.add('active-track');
            rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      }, 100);
    });
  }

  // 3. Shuffle on the tracks page retaining any active filters (undone when clicking a column header)
  const btnTracksPageShuffle = document.getElementById('btn-tracks-page-shuffle');
  if (btnTracksPageShuffle) {
    btnTracksPageShuffle.addEventListener('click', () => {
      if (!state.tracks || state.tracks.length === 0) return;

      // Fisher-Yates shuffle retaining filters
      for (let i = state.tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.tracks[i], state.tracks[j]] = [state.tracks[j], state.tracks[i]];
      }

      state.isTracksShuffled = true;
      btnTracksPageShuffle.classList.add('active');

      // Clear column sort indicators since order is now shuffled
      document.querySelectorAll('.sort-indicator').forEach(el => {
        el.textContent = '';
      });

      renderTracks();

      // If playing from tracks window, update queue to match shuffled order
      if (state.playbackContext && state.playbackContext.type === 'tracks') {
        state.queue = [...state.tracks];
        state.queueIndex = state.queue.findIndex(t => t.id === state.currentTrack?.id);
        updateQueueDrawer();
      }

      showToast(`Shuffled ${state.tracks.length} tracks`);
    });
  }

  // 4. Shuffle on the Albums grid
  if (btnAlbumsShuffle) {
    btnAlbumsShuffle.addEventListener('click', () => {
      if (!state.albums || state.albums.length === 0) return;
      for (let i = state.albums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.albums[i], state.albums[j]] = [state.albums[j], state.albums[i]];
      }
      state.isAlbumsShuffled = true;
      btnAlbumsShuffle.classList.add('active');
      renderAlbums();
      showToast(`Shuffled ${state.albums.length} albums`);
    });
  }

  // 5. Shuffle on the Artists grid
  if (btnArtistsShuffle) {
    btnArtistsShuffle.addEventListener('click', () => {
      if (!state.artists || state.artists.length === 0) return;
      for (let i = state.artists.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.artists[i], state.artists[j]] = [state.artists[j], state.artists[i]];
      }
      state.isArtistsShuffled = true;
      btnArtistsShuffle.classList.add('active');
      renderArtists();
      showToast(`Shuffled ${state.artists.length} artists`);
    });
  }

  // 6. Navigation Back buttons
  if (btnBackArtistDetail) {
    btnBackArtistDetail.addEventListener('click', () => goBack());
  }

  if (btnBackAlbumDetail) {
    btnBackAlbumDetail.addEventListener('click', () => goBack());
  }

  // 7. Shuffle active album inside Artist detail view
  if (btnArtistActiveShuffle) {
    btnArtistActiveShuffle.addEventListener('click', () => {
      if (!artistAlbumsList) return;
      let activeCard = artistAlbumsList.querySelector('.album-row-card.active-album') || artistAlbumsList.querySelector('.album-row-card');
      if (!activeCard) {
        showToast('No album available to shuffle');
        return;
      }
      const albShuffleBtn = activeCard.querySelector('.btn-album-row-shuffle');
      if (albShuffleBtn) albShuffleBtn.click();
    });
  }

  // 8. Shuffle inside Album detail view
  if (btnAlbumDetailShuffle) {
    btnAlbumDetailShuffle.addEventListener('click', () => {
      if (!albumDetailContent) return;
      const albShuffleBtn = albumDetailContent.querySelector('.btn-album-row-shuffle');
      if (albShuffleBtn) albShuffleBtn.click();
    });
  }

  // Vault Authentication Handlers
  async function checkAuthAndBoot() {
    try {
      const status = await fetch('/api/auth/status').then(r => r.json()).catch(() => ({ authRequired: false, authenticated: true }));
      if (status.authRequired) {
        if (!status.authenticated) {
          showLockScreen();
          return;
        } else {
          if (btnVaultLock) btnVaultLock.style.display = 'flex';
        }
      }
      hideLockScreen();
      await loadLibrary();
    } catch (err) {
      console.error('Auth check error:', err);
      await loadLibrary();
    }
  }

  function showLockScreen() {
    if (!vaultLockModal) return;
    vaultLockModal.style.display = 'flex';
    if (lockErrorMsg) lockErrorMsg.style.display = 'none';
    if (vaultPasswordInput) {
      vaultPasswordInput.value = '';
      setTimeout(() => vaultPasswordInput.focus(), 100);
    }
  }

  function hideLockScreen() {
    if (vaultLockModal) vaultLockModal.style.display = 'none';
  }

  async function handleVaultLogin() {
    const password = vaultPasswordInput ? vaultPasswordInput.value.trim() : '';
    if (!password) return;

    if (lockErrorMsg) lockErrorMsg.style.display = 'none';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (lockErrorMsg) {
          lockErrorMsg.textContent = data.error || 'Invalid password';
          lockErrorMsg.style.display = 'block';
        }
        const card = vaultLockModal ? vaultLockModal.querySelector('.lock-card') : null;
        if (card) {
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
        }
        return;
      }

      hideLockScreen();
      if (btnVaultLock) btnVaultLock.style.display = 'flex';
      showToast('🔓 Vault Unlocked');
      await loadLibrary();
    } catch (err) {
      if (lockErrorMsg) {
        lockErrorMsg.textContent = 'Connection error. Please try again.';
        lockErrorMsg.style.display = 'block';
      }
    }
  }

  async function handleVaultLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    if (btnVaultLock) btnVaultLock.style.display = 'none';
    showToast('🔒 Vault Locked');
    showLockScreen();
  }

  if (vaultLoginForm) {
    vaultLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleVaultLogin();
    });
  }

  if (toggleVaultPwBtn && vaultPasswordInput) {
    toggleVaultPwBtn.addEventListener('click', () => {
      vaultPasswordInput.type = vaultPasswordInput.type === 'password' ? 'text' : 'password';
    });
  }

  if (btnVaultLock) {
    btnVaultLock.addEventListener('click', handleVaultLogout);
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
    } else if (e.code === 'ArrowLeft') {
      if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - 5);
    }
  });

  // Mobile Floating Controls Pane (Collapsible Sidebar Drawer)
  function initMobileControls() {
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const sidebarEl = document.querySelector('.sidebar');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const sidebarMobileClose = document.getElementById('sidebar-mobile-close');

    function openMobileSidebar() {
      if (sidebarEl) sidebarEl.classList.add('mobile-open');
      if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
      if (btnMobileMenu) btnMobileMenu.setAttribute('aria-expanded', 'true');
    }

    function closeMobileSidebar() {
      if (sidebarEl) sidebarEl.classList.remove('mobile-open');
      if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
      if (btnMobileMenu) btnMobileMenu.setAttribute('aria-expanded', 'false');
    }

    function toggleMobileSidebar() {
      if (sidebarEl && sidebarEl.classList.contains('mobile-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    }

    if (btnMobileMenu) {
      btnMobileMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileSidebar();
      });
    }

    if (sidebarMobileClose) {
      sidebarMobileClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMobileSidebar();
      });
    }

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', () => {
        closeMobileSidebar();
      });
    }

    // Auto-close on selection: when tapping any selectable item in the controls drawer
    if (sidebarEl) {
      sidebarEl.addEventListener('click', (e) => {
        const selectable = e.target.closest(
          '.nav-btn, .nav-item, .decade-chip, .clear-btn, .genre-badge, .rescan-btn, .new-playlist-btn'
        );
        if (selectable) {
          closeMobileSidebar();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileSidebar();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        closeMobileSidebar();
      }
    });

    // Provide globally so view changes can safely close the drawer
    window.PlayaCloseMobileSidebar = closeMobileSidebar;
  }

  // Initialize Collapsible Sidebar Filters, Mobile Controls & Album View Controls
  initCollapsibleSidebar();
  initMobileControls();
  initAlbumControls();

  // Boot Application with Vault Authentication
  checkAuthAndBoot();
})();
