// Playa — Skin Manager
// Registry of available skins, persistence, and the header skin picker.
// To add a skin: create /skins/<id>.css scoped to html[data-skin="<id>"],
// link it in index.html, and add an entry to SKINS below.
(function () {
  const STORAGE_KEY = 'playa-skin';
  const DEFAULT_SKIN = 'classic';

  const SKINS = [
    { id: 'classic', name: 'Classic Neon', desc: 'Original cyan & violet', swatch: 'linear-gradient(135deg, #00f2fe, #7f00ff)' },
    { id: 'aurora', name: 'Aurora Glass', desc: 'Frosted glass, indigo aurora', swatch: 'linear-gradient(135deg, #818cf8, #c4b5fd 50%, #f0abfc)' },
    { id: 'hifi', name: 'Vintage Hi-Fi', desc: '1970s brushed silver & walnut receiver', swatch: 'linear-gradient(135deg, #f7f3ea 0%, #d5cec0 40%, #ffb834 60%, #3e2415 100%)' }
  ];

  function getSkin() {
    return document.documentElement.dataset.skin || DEFAULT_SKIN;
  }

  function applySkin(id) {
    if (!SKINS.some(s => s.id === id)) id = DEFAULT_SKIN;
    document.documentElement.dataset.skin = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* storage unavailable */ }
    renderMenu();
    window.dispatchEvent(new CustomEvent('playa:skinchange', { detail: { skin: id } }));
  }

  // --- Picker UI ---
  const toggleBtn = document.getElementById('skin-picker-btn');
  const menu = document.getElementById('skin-picker-menu');

  function renderMenu() {
    if (!menu) return;
    const current = getSkin();
    menu.innerHTML = '<div class="skin-menu-label">SKIN</div>' + SKINS.map(s => `
      <button class="skin-option${s.id === current ? ' active' : ''}" data-skin-id="${s.id}" id="skin-option-${s.id}" role="menuitemradio" aria-checked="${s.id === current}">
        <span class="skin-swatch" style="background:${s.swatch}"></span>
        <span class="skin-option-text">
          <span class="skin-option-name">${s.name}</span>
          <span class="skin-option-desc">${s.desc}</span>
        </span>
        <span class="skin-check">✓</span>
      </button>`).join('');
  }

  function setOpen(open) {
    if (!menu || !toggleBtn) return;
    menu.classList.toggle('open', open);
    toggleBtn.setAttribute('aria-expanded', String(open));
  }

  if (toggleBtn && menu) {
    renderMenu();
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!menu.classList.contains('open'));
    });
    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('.skin-option');
      if (!opt) return;
      e.stopPropagation();
      applySkin(opt.dataset.skinId);
    });
    document.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }

  // Ensure attribute is set even if the inline head bootstrap was skipped
  if (!document.documentElement.dataset.skin) document.documentElement.dataset.skin = DEFAULT_SKIN;

  window.PlayaSkins = { list: SKINS, get: getSkin, apply: applySkin };
})();
