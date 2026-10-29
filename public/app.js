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

  function renderVisualizer() {
    requestAnimationFrame(renderVisualizer);
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Draw main waveform in bottom player
    if (waveformCtx && waveformCanvas) {
      const w = waveformCanvas.width;
      const h = waveformCanvas.height;
      waveformCtx.clearRect(0, 0, w, h);

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

    // Draw mini glowing visualizer overlay on album cover
    if (miniCtx && miniCanvas && state.isPlaying) {
      const mw = miniCanvas.width;
      const mh = miniCanvas.height;
      miniCtx.clearRect(0, 0, mw, mh);
      const avg = dataArray.reduce((acc, v) => acc + v, 0) / bufferLength;
      const radius = 6 + (avg / 255) * 16;
      miniCtx.beginPath();
      miniCtx.arc(mw / 2, mh / 2, radius, 0, Math.PI * 2);
      miniCtx.fillStyle = `rgba(${vizColors.accentRgb}, ${(avg / 255) * 0.35})`;
      miniCtx.fill();
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
        if (state.filters.genre === g.genre) {
          state.filters.genre = null;
        } else {
          state.filters.genre = g.genre;
          state.filters.artist = null;
          state.filters.album = null;
        }
        renderGenres();
        renderDecades();
        updateActiveFilterPills();
        reloadActiveView();
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

      // Card click opens album tracklist without creating filter pills
      card.onclick = () => {
        showAlbumTracks(alb.album, alb.artist);
      };

      albumsGrid.appendChild(card);
    });
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
        // EXCLUSIVE: Selecting artist clears decade, genre, and album!
        state.filters.artist = art.artist;
        state.filters.decade = null;
        state.filters.genre = null;
        state.filters.album = null;
        renderDecades();
        renderGenres();
        switchView('albums');
        updateActiveFilterPills();
        reloadActiveView();
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
  function setQueue(tracks, startIndex = 0) {
    state.queue = [...tracks];
    state.queueIndex = startIndex;
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

    if (state.isShuffle) {
      state.queueIndex = Math.floor(Math.random() * state.queue.length);
    } else {
      state.queueIndex = (state.queueIndex + 1) % state.queue.length;
    }

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
  }

  function highlightActiveTrack() {
    document.querySelectorAll('.tracks-table tr').forEach(tr => tr.classList.remove('active-track'));
    if (!state.currentTrack) return;

    const rows = tracksList.querySelectorAll('tr');
    state.tracks.forEach((t, i) => {
      if (t.id === state.currentTrack.id && rows[i]) {
        rows[i].classList.add('active-track');
      }
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
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
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
    btnShuffle.classList.toggle('active', state.isShuffle);
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

  // 1. If playing an album, clicking the thumbnail shows that album's tracks
  if (playerCoverBox) {
    playerCoverBox.title = "View album tracks";
    playerCoverBox.addEventListener('click', () => {
      if (state.currentTrack && state.currentTrack.album) {
        showAlbumTracks(state.currentTrack.album, state.currentTrack.artist, state.currentTrack.id);
      }
    });
  }

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

  // Initialize Collapsible Sidebar Filters & Album View Controls
  initCollapsibleSidebar();
  initAlbumControls();

  // Boot Application with Vault Authentication
  checkAuthAndBoot();
})();
