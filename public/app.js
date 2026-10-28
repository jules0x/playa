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
    stats: {},
    decades: [],
    genres: [],
    albums: [],
    tracks: [],
    artists: [],
    playlists: [],
    pendingAddToPlaylist: null // holds { type: 'track'|'album', data: ... }
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
  const playerTitle = document.getElementById('player-title');
  const playerArtist = document.getElementById('player-artist');
  const currentTimeEl = document.getElementById('current-time');
  const totalTimeEl = document.getElementById('total-time');
  const scrubberBar = document.getElementById('scrubber-bar');
  const scrubberFill = document.getElementById('scrubber-fill');
  const scrubberHandle = document.getElementById('scrubber-handle');
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
        grad.addColorStop(0, '#00f2fe');
        grad.addColorStop(1, '#7f00ff');

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
      miniCtx.fillStyle = `rgba(0, 242, 254, ${(avg / 255) * 0.35})`;
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

    // 2. Update Decade chips with live counts
    if (dynamicDecades) {
      const countsMap = {};
      dynamicDecades.forEach(d => { countsMap[d.decade] = d.track_count; });
      decadesContainer.querySelectorAll('.decade-chip').forEach(chip => {
        const decName = chip.dataset.decade;
        const count = countsMap[decName] || 0;
        const subcountEl = chip.querySelector('.subcount');
        if (subcountEl) subcountEl.textContent = count;
        chip.classList.toggle('zero-count', count === 0);
      });
    }

    // 3. Update Genre badges with live counts
    if (dynamicGenres) {
      const genreCountsMap = {};
      dynamicGenres.forEach(g => { genreCountsMap[g.genre] = g.track_count; });
      genresContainer.querySelectorAll('.genre-badge').forEach(badge => {
        const gName = badge.dataset.genre;
        const count = genreCountsMap[gName] || 0;
        const subcountEl = badge.querySelector('.subcount-genre');
        if (subcountEl) subcountEl.textContent = `(${count})`;
        badge.classList.toggle('zero-count', count === 0);
      });
    }
  }

  // Render Decades in Sidebar (with data attributes)
  function renderDecades() {
    decadesContainer.innerHTML = '';
    state.decades.forEach(d => {
      const chip = document.createElement('div');
      chip.className = `decade-chip ${state.filters.decade === d.decade ? 'active' : ''}`;
      chip.dataset.decade = d.decade;
      chip.innerHTML = `
        <span>${state.filters.decade === d.decade ? '● ' : ''}${d.decade}</span>
        <span class="subcount">${d.track_count}</span>
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
      const badge = document.createElement('div');
      badge.className = `genre-badge ${state.filters.genre === g.genre ? 'active' : ''}`;
      badge.dataset.genre = g.genre;
      badge.innerHTML = `
        <span>${state.filters.genre === g.genre ? '✓ ' : ''}${g.genre}</span>
        <span class="subcount-genre" style="opacity:0.7; font-size:0.7rem;">(${g.track_count})</span>
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

  // Clear All Filters Helper
  function clearAllFilters() {
    state.filters.decade = null;
    state.filters.genre = null;
    state.filters.artist = null;
    state.filters.album = null;
    state.filters.search = '';
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    renderDecades();
    renderGenres();
    updateActiveFilterPills();
    reloadActiveView();
    showToast('Filters cleared');
  }

  // Active Filter Pills & In-View Filter Alert Banner
  function updateActiveFilterPills() {
    activeFiltersContainer.innerHTML = '';
    const { decade, genre, artist, album, search } = state.filters;
    const filterBanner = document.getElementById('active-filter-banner');
    const filterBannerDesc = document.getElementById('active-filter-banner-description');
    const btnClearAllBanner = document.getElementById('btn-clear-all-banner');

    const activeList = [];

    if (artist) {
      activeList.push({ label: `Artist: ${artist}`, icon: '👤', key: 'artist' });
      addPill('👤', `Artist: ${artist}`, () => {
        state.filters.artist = null;
        updateActiveFilterPills();
        reloadActiveView();
      });
    }
    if (album) {
      activeList.push({ label: `Album: ${album}`, icon: '💿', key: 'album' });
      addPill('💿', `Album: ${album}`, () => {
        state.filters.album = null;
        updateActiveFilterPills();
        reloadActiveView();
      });
    }
    if (decade) {
      activeList.push({ label: `Decade: ${decade}`, icon: '📅', key: 'decade' });
      addPill('📅', `Decade: ${decade}`, () => {
        state.filters.decade = null;
        renderDecades();
        updateActiveFilterPills();
        reloadActiveView();
      });
    }
    if (genre) {
      activeList.push({ label: `Genre: ${genre}`, icon: '⚡', key: 'genre' });
      addPill('⚡', `Genre: ${genre}`, () => {
        state.filters.genre = null;
        renderGenres();
        updateActiveFilterPills();
        reloadActiveView();
      });
    }
    if (search) {
      activeList.push({ label: `Search: "${search}"`, icon: '🔍', key: 'search' });
      addPill('🔍', `Search: "${search}"`, () => {
        state.filters.search = '';
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        updateActiveFilterPills();
        reloadActiveView();
      });
    }

    if (activeList.length > 0) {
      // Add 'Clear All' pill in top bar
      const clearAllPill = document.createElement('button');
      clearAllPill.className = 'clear-all-pill-btn';
      clearAllPill.textContent = 'Clear All';
      clearAllPill.onclick = clearAllFilters;
      activeFiltersContainer.appendChild(clearAllPill);
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
    if (state.filters.artist) params.set('artist', state.filters.artist);
    if (state.filters.album) params.set('album', state.filters.album);
    if (state.filters.search) params.set('search', state.filters.search);

    params.set('sortBy', state.sort.sortBy);
    params.set('sortOrder', state.sort.sortOrder);

    try {
      // 1. Asynchronously update dynamic faceted counts for buttons
      updateFacetedCounts(params);

      // 2. Fetch view data
      if (state.activeView === 'albums') {
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
          <img src="${coverUrl}" alt="${alb.album}" loading="lazy">
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
          setQueue(tracksData.tracks, 0);
        }
      };

      // Add album to playlist
      const addPlBtn = card.querySelector('.album-add-playlist-btn');
      addPlBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal({ type: 'album', album: alb });
      };

      // Card click opens album tracklist
      card.onclick = () => {
        state.filters.album = alb.album;
        state.filters.artist = alb.artist;
        // Clear conflicting filters
        state.filters.decade = null;
        state.filters.genre = null;
        renderDecades();
        renderGenres();
        switchView('tracks');
        updateActiveFilterPills();
        reloadActiveView();
      };

      albumsGrid.appendChild(card);
    });
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
          <img src="${coverUrl}" class="track-thumb" alt="cover">
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
        setQueue(state.tracks, idx);
      };

      // Add to playlist
      const addBtn = tr.querySelector('.btn-add-track-playlist');
      addBtn.onclick = (e) => {
        e.stopPropagation();
        openAddToPlaylistModal({ type: 'track', track });
      };

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
        <img src="${coverUrl}" class="artist-avatar" alt="${art.artist}">
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
    th.addEventListener('click', () => {
      const sortField = th.dataset.sort;
      if (!sortField) return;

      if (state.sort.sortBy === sortField) {
        state.sort.sortOrder = state.sort.sortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        state.sort.sortBy = sortField;
        state.sort.sortOrder = 'ASC';
      }

      reloadActiveView();
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
          <img src="${coverUrl}" class="track-thumb" alt="cover">
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

  function updatePlayerUI() {
    if (state.currentTrack) {
      playerTitle.textContent = state.currentTrack.title;
      playerArtist.textContent = `${state.currentTrack.artist} — ${state.currentTrack.album}`;
      playerCover.src = `/api/cover/${state.currentTrack.cover_hash || 'default'}`;
    }

    if (state.isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
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

    if (state.queue.length === 0) {
      queueList.innerHTML = `<div class="empty-queue-msg">Queue is empty. Select a track or album!</div>`;
      return;
    }

    state.queue.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = `queue-item ${i === state.queueIndex ? 'active' : ''}`;
      const coverUrl = `/api/cover/${track.cover_hash || 'default'}`;

      item.innerHTML = `
        <img src="${coverUrl}" class="queue-item-thumb" alt="cover">
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
  function switchView(viewName) {
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
      reloadActiveView();
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

  // Scrubber Seeking
  scrubberBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = scrubberBar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  });

  // Volume Slider
  volumeSlider.addEventListener('click', (e) => {
    const rect = volumeSlider.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.volume = ratio;
    volumeFill.style.width = `${ratio * 100}%`;
    updateVolumeIcon(ratio);
  });

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
      btnRepeat.classList.add('active');
      btnRepeat.style.color = '#00f2fe';
    } else {
      state.repeatMode = 'none';
      btnRepeat.classList.remove('active');
      btnRepeat.style.color = '';
    }
  });

  // Navigation Links
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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

  // Queue Drawer Toggle
  toggleQueueBtn.addEventListener('click', () => {
    queueDrawer.classList.toggle('open');
  });
  closeQueueBtn.addEventListener('click', () => {
    queueDrawer.classList.remove('open');
  });

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

  // Boot Application
  loadLibrary();
})();
