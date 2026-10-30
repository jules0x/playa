// Playa — Interactive Cursor Ambient Background Glow
// Renders an atmospheric, zone-chromatic glow that follows mouse position,
// shifts dynamically during movement, and stabilizes when the mouse slows or stops.
(function () {
  const canvas = document.getElementById('ambient-glow-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;

  // Track coordinates (default to center)
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let curX = targetX;
  let curY = targetY;

  // Secondary delayed aura for depth
  let secX = targetX;
  let secY = targetY;

  // Velocity tracking
  let smoothSpeed = 0;
  let currentHue = 245;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // Downscale canvas resolution by 0.5x for performance and ultra-soft bilinear blur
    width = Math.floor(window.innerWidth * 0.5);
    height = Math.floor(window.innerHeight * 0.5);
    canvas.width = width;
    canvas.height = height;
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  window.addEventListener('pointermove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
  }, { passive: true });

  // Zone Hue interpolation
  // Top-Left: Indigo (238) | Top-Right: Violet (282)
  // Bottom-Left: Ocean (215) | Bottom-Right: Cyan (175)
  function getZoneHue(x, y) {
    const nx = Math.max(0, Math.min(1, x / window.innerWidth));
    const ny = Math.max(0, Math.min(1, y / window.innerHeight));
    const topHue = 238 + (282 - 238) * nx;
    const bottomHue = 215 + (175 - 215) * nx;
    return topHue + (bottomHue - topHue) * ny;
  }

  function render(time) {
    requestAnimationFrame(render);

    const skin = document.documentElement.dataset.skin || 'aurora';
    // Active on aurora skin
    if (skin !== 'aurora') {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    // Smooth lerp to mouse position
    const dx = targetX - curX;
    const dy = targetY - curY;
    curX += dx * 0.075;
    curY += dy * 0.075;

    // Secondary companion aura with slower lag
    secX += (curX - secX) * 0.04;
    secY += (curY - secY) * 0.04;

    // Calculate instantaneous speed and smoothed velocity
    const speed = Math.hypot(dx, dy);
    smoothSpeed += (speed - smoothSpeed) * 0.09;

    // Screen zone color
    const zoneHue = getZoneHue(curX, curY);

    // Dynamic motion chromatic shift: shifts hue as it moves, stabilizes when slowing/stopped
    const motionShift = Math.min(smoothSpeed * 0.55, 38);
    const targetHue = zoneHue + motionShift;
    currentHue += (targetHue - currentHue) * 0.08;

    // Organic breathing pulsation when stationary
    const breath = Math.sin(time * 0.0018) * 15;
    const baseRadius = 260;
    const dynamicRadius = baseRadius + Math.min(smoothSpeed * 2.8, 140) + breath;

    // Map screen coordinates to downscaled canvas coordinate space
    const cx = (curX / window.innerWidth) * width;
    const cy = (curY / window.innerHeight) * height;
    const sx = (secX / window.innerWidth) * width;
    const sy = (secY / window.innerHeight) * height;

    const r = (dynamicRadius / window.innerWidth) * width;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    // 1. Broad atmospheric ambient aura (soft diffuse layer)
    const broadGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.8);
    broadGrad.addColorStop(0, `hsla(${currentHue}, 80%, 65%, 0.28)`);
    broadGrad.addColorStop(0.45, `hsla(${currentHue + 25}, 75%, 55%, 0.12)`);
    broadGrad.addColorStop(1, 'rgba(11, 15, 25, 0)');
    ctx.fillStyle = broadGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Focused vibrant radiant core (becomes denser and calmer when stationary)
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.85);
    const coreAlpha = 0.38 - Math.min(smoothSpeed * 0.001, 0.12); // slightly calmer when stopping
    coreGrad.addColorStop(0, `hsla(${currentHue}, 85%, 72%, ${coreAlpha})`);
    coreGrad.addColorStop(0.5, `hsla(${currentHue + 15}, 80%, 60%, ${coreAlpha * 0.5})`);
    coreGrad.addColorStop(1, 'rgba(11, 15, 25, 0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. Companion trailing beam for chromatic dispersion behind frosted glass panels
    const compHue = (currentHue + 55) % 360;
    const compGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.1);
    compGrad.addColorStop(0, `hsla(${compHue}, 75%, 68%, 0.18)`);
    compGrad.addColorStop(1, 'rgba(11, 15, 25, 0)');
    ctx.fillStyle = compGrad;
    ctx.fillRect(0, 0, width, height);
  }

  requestAnimationFrame(render);
})();
