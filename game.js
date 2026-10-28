(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const ui = {
    hud: $("hud"), start: $("startOverlay"), pause: $("pauseOverlay"), result: $("resultOverlay"),
    upgrade: $("upgradeOverlay"), dock: $("controlDock"), pauseBtn: $("pauseBtn"),
    score: $("scoreValue"), wave: $("waveValue"), best: $("bestValue"),
    healthFill: $("healthFill"), health: $("healthValue"), multiplier: $("multiplier"),
    bossWrap: $("bossBarWrap"), bossFill: $("bossHealthFill"), bossText: $("bossHealthText"),
    finalScore: $("finalScore"), resultTitle: $("resultTitle"), resultEyebrow: $("resultEyebrow"),
    resultMessage: $("resultMessage"), toast: $("toast"), install: $("installBtn"), sound: $("soundBtn")
  };

  const TAU = Math.PI * 2;
  const BEST_KEY = "orbit_defender_best_v1";
  let W = 0, H = 0, dpr = 1, lastTime = 0, raf = 0;
  let mode = "menu", soundOn = false, audioCtx = null, deferredInstall = null;
  let stars = [], particles = [], bullets = [], enemyBullets = [], enemies = [], pickups = [];
  let player, boss, score = 0, best = loadBest(), wave = 1, waveTimer = 0, spawnTimer = 0;
  let combo = 0, comboTimer = 0, multiplier = 1, screenShake = 0, elapsed = 0, upgradesTaken = 0;
  const keys = { left: false, right: false };
  const upgrades = [
    { id: "rapid", icon: "ϟ", name: "RAPID FIRE", desc: "Fire your weapons 18% faster.", apply: () => player.fireRate = Math.max(0.095, player.fireRate * 0.82) },
    { id: "damage", icon: "✦", name: "PLASMA CORE", desc: "Increase weapon damage by 1.", apply: () => player.damage += 1 },
    { id: "hull", icon: "♥", name: "REPAIR HULL", desc: "Restore 35 hull integrity.", apply: () => player.hp = Math.min(player.maxHp, player.hp + 35) },
    { id: "shield", icon: "◉", name: "ENERGY SHIELD", desc: "Block the next two hits.", apply: () => player.shield = Math.min(5, player.shield + 2) },
    { id: "orbit", icon: "⟳", name: "ORBITAL DRIVE", desc: "Rotate 15% faster to evade.", apply: () => player.turnSpeed *= 1.15 },
    { id: "multi", icon: "⋈", name: "TWIN CANNONS", desc: "Add another shot to each volley.", apply: () => player.extraShots = Math.min(4, player.extraShots + 1) }
  ];

  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { return 0; }
  }
  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (_) {}
    }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, rect.width); H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeStars();
    if (player) player.radius = Math.min(W, H) * 0.31;
  }
  function makeStars() {
    const count = Math.floor((W * H) / 3800);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.35 + 0.2,
      alpha: Math.random() * 0.6 + 0.15, phase: Math.random() * TAU, speed: Math.random() * 1.5 + 0.3
    }));
  }
  function resetGame() {
    score = 0; wave = 1; waveTimer = 0; spawnTimer = 0.5; combo = 0; comboTimer = 0;
    multiplier = 1; elapsed = 0; screenShake = 0; upgradesTaken = 0;
    particles = []; bullets = []; enemyBullets = []; enemies = []; pickups = []; boss = null;
    player = {
      angle: -Math.PI / 2, radius: Math.min(W, H) * 0.31, turnSpeed: 3.15,
      hp: 100, maxHp: 100, fireRate: 0.34, fireTimer: 0.1, damage: 1,
      extraShots: 0, shield: 0, invulnerable: 0
    };
    updateHud();
  }
  function startGame() {
    resetGame();
    mode = "playing";
    ui.start.hidden = true; ui.result.hidden = true; ui.pause.hidden = true; ui.upgrade.hidden = true;
    ui.hud.hidden = false; ui.dock.hidden = false; ui.pauseBtn.hidden = false;
    ui.best.textContent = best.toLocaleString();
    showToast("MISSION STARTED");
    playSound(520, 0.08, "sine");
    lastTime = performance.now();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function pauseGame() {
    if (mode !== "playing") return;
    mode = "paused"; ui.pause.hidden = false; ui.pauseBtn.textContent = "▶";
    keys.left = keys.right = false;
  }
  function resumeGame() {
    if (mode !== "paused") return;
    mode = "playing"; ui.pause.hidden = true; ui.pauseBtn.textContent = "Ⅱ";
    lastTime = performance.now();
  }
  function endGame() {
    mode = "gameover"; saveBest();
    ui.best.textContent = best.toLocaleString();
    ui.finalScore.textContent = Math.floor(score).toLocaleString();
    ui.resultTitle.textContent = boss ? "CORE BREACHED" : "SHIP DESTROYED";
    ui.resultEyebrow.textContent = "MISSION ENDED // WAVE " + wave;
    ui.resultMessage.textContent = score >= best && score > 0 ? "New high score! The galaxy remembers your name." : "The orbit will need you again, pilot.";
    ui.result.hidden = false; ui.pauseBtn.hidden = true; ui.dock.hidden = true;
    ui.hud.hidden = true; ui.bossWrap.hidden = true;
    playSound(120, 0.45, "sawtooth");
  }
  function updateHud() {
    if (!player) return;
    ui.score.textContent = Math.floor(score).toLocaleString();
    ui.wave.textContent = wave;
    ui.best.textContent = best.toLocaleString();
    const hp = Math.max(0, player.hp / player.maxHp * 100);
    ui.healthFill.style.width = hp + "%";
    ui.healthValue.textContent = Math.ceil(hp) + "%";
    ui.healthFill.style.background = hp < 30 ? "linear-gradient(90deg,#ff386d,#ff8a9e)" : "";
    ui.multiplier.textContent = "×" + multiplier.toFixed(1) + " COMBO";
    if (boss) {
      ui.bossWrap.hidden = false;
      const pct = Math.max(0, boss.hp / boss.maxHp * 100);
      ui.bossFill.style.width = pct + "%";
      ui.bossText.textContent = Math.ceil(pct) + "%";
    } else ui.bossWrap.hidden = true;
  }
  function showToast(text) {
    ui.toast.textContent = text; ui.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => ui.toast.classList.remove("show"), 1300);
  }
  function playSound(freq, duration = 0.08, type = "sine") {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.045, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }
  function center() { return { x: W / 2, y: H / 2 }; }
  function playerPos(angle = player.angle, radius = player.radius) {
    const c = center(); return { x: c.x + Math.cos(angle) * radius, y: c.y + Math.sin(angle) * radius };
  }
  function spawnEnemy() {
    const angle = Math.random() * TAU;
    const c = center(), edge = Math.max(W, H) * 0.58;
    const types = ["scout", "scout", "scout", "brute"];
    const type = types[Math.floor(Math.random() * Math.min(types.length, 2 + Math.floor(wave / 3)))];
    const hp = type === "brute" ? 3 + Math.floor(wave / 4) : 1 + Math.floor(wave / 6);
    enemies.push({
      x: c.x + Math.cos(angle) * edge, y: c.y + Math.sin(angle) * edge,
      type, hp, maxHp: hp, speed: (type === "brute" ? 18 : 27) + wave * 1.8 + Math.random() * 10,
      r: type === "brute" ? 14 : 9, phase: Math.random() * TAU, shootTimer: 2 + Math.random() * 2,
      color: type === "brute" ? "#ff7b9b" : "#b39aff"
    });
  }
  function spawnBoss() {
    const c = center();
    boss = { x: c.x, y: -70, hp: 75 + wave * 18, maxHp: 75 + wave * 18, r: 28 + Math.min(wave, 10), phase: 0, shootTimer: 1.2, moveDir: 1 };
    showToast("WARNING: BOSS INBOUND");
    playSound(180, 0.35, "sawtooth");
  }
  function spawnPickup(x, y, type) {
    pickups.push({ x, y, type: type || (Math.random() < 0.5 ? "health" : "rapid"), r: 8, life: 10, phase: Math.random() * TAU });
  }
  function addParticles(x, y, color, count = 8, force = 100) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = Math.random() * force;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.55, maxLife: 0.8, r: Math.random() * 2.5 + 0.6, color });
    }
  }
  function firePlayer() {
    const p = playerPos();
    const count = 1 + player.extraShots;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.105;
      const a = player.angle + spread;
      bullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, r: 3, life: 1.3, damage: player.damage });
    }
    addParticles(p.x, p.y, "#55f6ff", 2, 35);
    playSound(700 + Math.random() * 100, 0.035, "square");
  }
  function damagePlayer(amount) {
    if (player.invulnerable > 0) return;
    if (player.shield > 0) {
      player.shield--; player.invulnerable = 0.45; showToast("SHIELD ABSORBED HIT"); playSound(430, 0.1, "triangle");
      addParticles(...Object.values(playerPos()), "#55f6ff", 12, 110); return;
    }
    player.hp -= amount; player.invulnerable = 0.7; screenShake = 7;
    const p = playerPos(); addParticles(p.x, p.y, "#ff658b", 14, 140); playSound(160, 0.13, "sawtooth");
    if (player.hp <= 0) { player.hp = 0; updateHud(); endGame(); }
  }
  function killEnemy(enemy, index) {
    addParticles(enemy.x, enemy.y, enemy.color, enemy.type === "brute" ? 17 : 9, 125);
    enemies.splice(index, 1);
    combo++; comboTimer = 3.2; multiplier = Math.min(5, 1 + Math.floor(combo / 4) * 0.5);
    score += Math.round((enemy.type === "brute" ? 35 : 15) * multiplier);
    if (Math.random() < 0.15) spawnPickup(enemy.x, enemy.y);
    playSound(300 + Math.random() * 250, 0.07, "triangle");
  }
  function killBoss() {
    const b = boss; boss = null;
    addParticles(b.x, b.y, "#ff648f", 50, 260);
    score += 500 * multiplier; combo += 4; multiplier = Math.min(5, multiplier + 0.5);
    spawnPickup(W / 2, H / 2, "health"); showToast("BOSS ELIMINATED +500");
    playSound(620, 0.5, "triangle");
  }
  function update(dt) {
    if (mode !== "playing") return;
    elapsed += dt;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (keys.left) player.angle -= player.turnSpeed * dt;
    if (keys.right) player.angle += player.turnSpeed * dt;
    player.angle = (player.angle % TAU + TAU) % TAU;
    player.fireTimer -= dt;
    if (player.fireTimer <= 0) { firePlayer(); player.fireTimer = player.fireRate; }
    if (comboTimer > 0) comboTimer -= dt; else { combo = 0; multiplier = Math.max(1, multiplier - dt * 0.4); }
    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 20);

    waveTimer += dt; spawnTimer -= dt;
    const bossWave = wave % 5 === 0;
    if (spawnTimer <= 0 && (!bossWave || !boss)) {
      if (!bossWave || waveTimer < 1.4) spawnEnemy();
      spawnTimer = Math.max(0.32, 1.25 - wave * 0.055) * (0.7 + Math.random() * 0.65);
    }
    if (bossWave && !boss && waveTimer > 2.3) spawnBoss();
    if (waveTimer > 21 + wave * 1.5 && !boss) {
      wave++; waveTimer = 0; spawnTimer = 0.6;
      if (wave % 5 === 0) showToast("BOSS WAVE " + wave);
      else showToast("WAVE " + wave + " INCOMING");
      if (wave > 1) offerUpgrade();
    }

    const c = center(), p = playerPos();
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) { bullets.splice(i, 1); continue; }
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
          e.hp -= b.damage; addParticles(b.x, b.y, "#55f6ff", 3, 50); bullets.splice(i, 1); hit = true;
          if (e.hp <= 0) killEnemy(e, j);
          break;
        }
      }
      if (hit) continue;
      if (boss && Math.hypot(b.x - boss.x, b.y - boss.y) < b.r + boss.r) {
        boss.hp -= b.damage; bullets.splice(i, 1);
        addParticles(b.x, b.y, "#ff7b9b", 2, 45);
        if (boss.hp <= 0) killBoss();
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const dx = c.x - e.x, dy = c.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt;
      e.phase += dt * 2; e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < Math.max(W, H) * 0.58) {
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * (105 + wave * 3), vy: Math.sin(a) * (105 + wave * 3), r: 4, life: 3 });
        e.shootTimer = Math.max(0.85, 2.6 - wave * 0.06) + Math.random();
      }
      if (d < player.radius + e.r + 2) {
        damagePlayer(e.type === "brute" ? 24 : 15);
        addParticles(e.x, e.y, e.color, 12, 100); enemies.splice(i, 1); continue;
      }
      if (d < 16) { enemies.splice(i, 1); }
    }

    if (boss) {
      boss.phase += dt; boss.y += (Math.min(H * 0.25, 90) - boss.y) * Math.min(1, dt * 1.4);
      boss.x += Math.sin(boss.phase * 0.8) * 55 * dt;
      boss.x = Math.max(boss.r + 10, Math.min(W - boss.r - 10, boss.x));
      boss.shootTimer -= dt;
      if (boss.shootTimer <= 0) {
        const aim = Math.atan2(p.y - boss.y, p.x - boss.x);
        for (let k = -1; k <= 1; k++) {
          const a = aim + k * 0.22;
          enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.65, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 5, life: 4, boss: true });
        }
        boss.shootTimer = 1.1;
      }
      if (Math.hypot(p.x - boss.x, p.y - boss.y) < boss.r + 10) damagePlayer(28);
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { enemyBullets.splice(i, 1); continue; }
      if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + 8) {
        enemyBullets.splice(i, 1); damagePlayer(b.boss ? 17 : 12); continue;
      }
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
      const q = pickups[i]; q.life -= dt; q.phase += dt * 2;
      if (q.life <= 0) { pickups.splice(i, 1); continue; }
      if (Math.hypot(q.x - p.x, q.y - p.y) < q.r + 12) {
        if (q.type === "health") { player.hp = Math.min(player.maxHp, player.hp + 25); showToast("HULL REPAIRED +25"); }
        else if (q.type === "rapid") { player.fireRate = Math.max(0.09, player.fireRate * 0.78); showToast("RAPID FIRE ONLINE"); }
        else { player.shield = Math.min(5, player.shield + 1); showToast("SHIELD CHARGED"); }
        addParticles(q.x, q.y, "#00e6a0", 12, 100); pickups.splice(i, 1); playSound(800, 0.12, "sine");
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const a = particles[i]; a.x += a.vx * dt; a.y += a.vy * dt; a.vx *= Math.pow(0.03, dt); a.vy *= Math.pow(0.03, dt); a.life -= dt;
      if (a.life <= 0) particles.splice(i, 1);
    }
    for (const s of stars) s.phase += dt * s.speed;
    updateHud();
  }

  function draw() {
    ctx.save();
    if (screenShake > 0) ctx.translate((Math.random() - .5) * screenShake, (Math.random() - .5) * screenShake);
    ctx.clearRect(-20, -20, W + 40, H + 40);
    const bg = ctx.createRadialGradient(W * .5, H * .48, 5, W * .5, H * .48, Math.max(W, H) * .72);
    bg.addColorStop(0, "#101a35"); bg.addColorStop(.55, "#080e20"); bg.addColorStop(1, "#040713");
    ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);
    for (const s of stars) {
      ctx.globalAlpha = s.alpha * (.6 + Math.sin(s.phase) * .4); ctx.fillStyle = "#c8e6ff";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const c = center(), orbit = player ? player.radius : Math.min(W, H) * .31;
    // Orbit tracks
    ctx.strokeStyle = "#70baff15"; ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
    ctx.beginPath(); ctx.arc(c.x, c.y, orbit, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "#a78bfa16"; ctx.beginPath(); ctx.arc(c.x, c.y, orbit * .72, 0, TAU); ctx.stroke();
    // Planet core
    const pr = Math.min(W, H) * .095;
    const pg = ctx.createRadialGradient(c.x - pr * .3, c.y - pr * .4, 1, c.x, c.y, pr * 1.8);
    pg.addColorStop(0, "#8da7ff"); pg.addColorStop(.25, "#414b9b"); pg.addColorStop(.65, "#1a2352"); pg.addColorStop(1, "#090f26");
    ctx.save(); ctx.shadowColor = "#7285ff"; ctx.shadowBlur = 22;
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(c.x, c.y, pr, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = "#8ea5ff88"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(c.x, c.y, pr * 1.6, pr * .52, -.28, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "#55f6ff2c"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(c.x, c.y, pr * 1.3, 0, TAU); ctx.stroke();
    // Core shine
    ctx.fillStyle = "#c6d6ff"; ctx.globalAlpha = .5; ctx.beginPath(); ctx.arc(c.x - pr * .28, c.y - pr * .35, pr * .18, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;

    for (const q of pickups) {
      const pulse = 1 + Math.sin(q.phase * 3) * .12;
      ctx.save(); ctx.translate(q.x, q.y); ctx.scale(pulse, pulse); ctx.shadowColor = "#00e6a0"; ctx.shadowBlur = 15;
      ctx.strokeStyle = "#00e6a0"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, q.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#baffeb"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(q.type === "health" ? "+" : "ϟ", 0, 1); ctx.restore();
    }
    for (const e of enemies) drawEnemy(e);
    if (boss) drawBoss(boss);
    for (const b of bullets) {
      ctx.save(); ctx.strokeStyle = "#55f6ff"; ctx.lineWidth = 2.5; ctx.shadowColor = "#55f6ff"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * .025, b.y - b.vy * .025); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
    }
    for (const b of enemyBullets) {
      ctx.save(); ctx.fillStyle = b.boss ? "#ff638f" : "#c3a1ff"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.restore();
    }
    for (const a of particles) {
      ctx.globalAlpha = Math.max(0, a.life / a.maxLife); ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (player) drawPlayer();
    ctx.restore();
  }
  function drawEnemy(e) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.phase);
    ctx.shadowColor = e.color; ctx.shadowBlur = 14; ctx.strokeStyle = e.color; ctx.fillStyle = "#12152d"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (e.type === "brute") { for (let i = 0; i < 8; i++) { const a = i * TAU / 8, r = i % 2 ? e.r * .78 : e.r; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
    else { ctx.moveTo(0, -e.r); ctx.lineTo(e.r, e.r * .7); ctx.lineTo(0, e.r * .35); ctx.lineTo(-e.r, e.r * .7); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    if (e.hp < e.maxHp) {
      ctx.fillStyle = "#293149"; ctx.fillRect(e.x - e.r, e.y - e.r - 6, e.r * 2, 2);
      ctx.fillStyle = e.color; ctx.fillRect(e.x - e.r, e.y - e.r - 6, e.r * 2 * Math.max(0, e.hp / e.maxHp), 2);
    }
  }
  function drawBoss(b) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.sin(b.phase * .5) * .08); ctx.shadowColor = "#ff386d"; ctx.shadowBlur = 25;
    ctx.strokeStyle = "#ff648f"; ctx.fillStyle = "#32142c"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12, r = i % 2 ? b.r * .75 : b.r * 1.15; if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(-b.phase * .4); ctx.strokeStyle = "#ff9db4"; ctx.beginPath(); ctx.arc(0, 0, b.r * .58, 0, TAU); ctx.stroke();
    ctx.fillStyle = "#ffb4c5"; ctx.beginPath(); ctx.arc(0, 0, b.r * .2, 0, TAU); ctx.fill(); ctx.restore();
  }
  function drawPlayer() {
    if (player.invulnerable > 0 && Math.floor(elapsed * 18) % 2 === 0) return;
    const p = playerPos(); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(player.angle + Math.PI / 2);
    ctx.shadowColor = "#55f6ff"; ctx.shadowBlur = 20;
    ctx.fillStyle = "#c8fbff"; ctx.strokeStyle = "#55f6ff"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 9); ctx.lineTo(0, 5); ctx.lineTo(-9, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#55f6ff"; ctx.beginPath(); ctx.moveTo(-3, 7); ctx.lineTo(0, 15 + Math.random() * 5); ctx.lineTo(3, 7); ctx.fill();
    ctx.restore();
    if (player.shield > 0) {
      ctx.save(); ctx.strokeStyle = "#55f6ff8a"; ctx.lineWidth = 1.5; ctx.shadowColor = "#55f6ff"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, TAU); ctx.stroke(); ctx.restore();
    }
  }
  function offerUpgrade() {
    if (mode !== "playing") return;
    mode = "upgrade"; keys.left = keys.right = false;
    ui.upgrade.hidden = false;
    const host = $("upgradeOptions"); host.innerHTML = "";
    const chosen = [...upgrades].sort(() => Math.random() - .5).slice(0, 3);
    chosen.forEach(u => {
      const btn = document.createElement("button"); btn.className = "upgrade-card";
      btn.innerHTML = `<span class="upgrade-icon">${u.icon}</span><strong>${u.name}</strong><small>${u.desc}</small>`;
      btn.addEventListener("click", () => {
        u.apply(); upgradesTaken++; ui.upgrade.hidden = true; mode = "playing";
        showToast(u.name + " INSTALLED"); playSound(650, .12, "sine"); updateHud();
      });
      host.appendChild(btn);
    });
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min((now - (lastTime || now)) / 1000, 0.033); lastTime = now;
    if (mode === "playing") update(dt);
    draw();
  }

  function bindHold(button, key) {
    const el = $(button);
    const on = (e) => { e.preventDefault(); keys[key] = true; el.classList.add("active"); };
    const off = (e) => { if (e) e.preventDefault(); keys[key] = false; el.classList.remove("active"); };
    el.addEventListener("pointerdown", on);
    ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach(ev => el.addEventListener(ev, off));
  }
  $("startBtn").addEventListener("click", startGame);
  $("restartBtn").addEventListener("click", startGame);
  $("pauseBtn").addEventListener("click", () => mode === "playing" ? pauseGame() : resumeGame());
  $("resumeBtn").addEventListener("click", resumeGame);
  bindHold("leftBtn", "left"); bindHold("rightBtn", "right");
  window.addEventListener("keydown", e => {
    if (["ArrowLeft", "ArrowRight", "a", "d", "A", "D", " "].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.left = true;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.right = true;
    if ((e.key === "Escape" || e.key.toLowerCase() === "p") && mode === "playing") pauseGame();
    else if ((e.key === "Escape" || e.key.toLowerCase() === "p") && mode === "paused") resumeGame();
    if (e.key === " " && (mode === "menu" || mode === "gameover")) startGame();
  });
  window.addEventListener("keyup", e => {
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keys.left = false;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keys.right = false;
  });
  window.addEventListener("blur", () => { keys.left = keys.right = false; if (mode === "playing") pauseGame(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "playing") pauseGame(); });
  ui.sound.addEventListener("click", () => {
    soundOn = !soundOn; ui.sound.textContent = soundOn ? "♫" : "♩"; ui.sound.style.color = soundOn ? "#55f6ff" : "#8795b3";
    if (soundOn) playSound(500, .08);
    showToast(soundOn ? "SOUND ENABLED" : "SOUND MUTED");
  });
  window.addEventListener("resize", resize);
  $("year").textContent = new Date().getFullYear();
  ui.best.textContent = best.toLocaleString();
  resize(); resetGame();
  mode = "menu";
  raf = requestAnimationFrame(loop);

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); deferredInstall = e; ui.install.hidden = false;
  });
  ui.install.addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null; ui.install.hidden = true;
  });
  window.addEventListener("appinstalled", () => { ui.install.hidden = true; showToast("APP INSTALLED"); });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();