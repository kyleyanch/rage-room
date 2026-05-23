// =============================================
// DATA — add new objects and upgrades here
// =============================================

const OBJECTS = [
  { name: "PLATE",    emoji: "🍽️",  baseHp: 10,  reward: 5   },
  { name: "BOTTLE",   emoji: "🍾",  baseHp: 30,  reward: 15  },
  { name: "VASE",     emoji: "🏺",  baseHp: 80,  reward: 40  },
  { name: "TV",       emoji: "📺",  baseHp: 200, reward: 100 },
  { name: "TOILET",   emoji: "🚽",  baseHp: 500, reward: 250 },
];

// Breaks of current object type before advancing to next tier.
const BREAKS_TO_ADVANCE = 3;

// HP grows by this multiplier each time the same object type respawns.
const HP_SCALE_PER_BREAK = 1.2;

// Reward grows by this multiplier each time the same object type respawns.
const REWARD_SCALE_PER_BREAK = 1.1;

const UPGRADES = [
  {
    id:        "stronger_hit",
    name:      "STRONGER HIT",
    desc:      "+2 damage per swing",
    cost:      20,
    costScale: 1.6,
    maxLevel:  Infinity,
    effect: (state) => { state.damage += 2; },
  },
  {
    id:        "faster_swing",
    name:      "FASTER SWING",
    desc:      "+0.5 auto-hits per second",
    cost:      50,
    costScale: 1.8,
    maxLevel:  Infinity,
    effect: (state) => { state.autoHitsPerSecond += 0.5; },
  },
  {
    id:        "better_bat",
    name:      "BETTER BAT",
    desc:      "x2 damage multiplier (one time)",
    cost:      200,
    costScale: 999,
    maxLevel:  1,
    effect: (state) => { state.damageMultiplier *= 2; },
  },
];


// =============================================
// SAVE / LOAD
// Keys stored in localStorage under SAVE_KEY.
// Only plain serialisable values — functions are
// re-attached from UPGRADES[] on load.
// =============================================
const SAVE_KEY = "rageroom_save_v1";

function buildDefaultState() {
  const levels = {};
  const costs  = {};
  UPGRADES.forEach(u => {
    levels[u.id] = 0;
    costs[u.id]  = u.cost;
  });

  return {
    money:             0,
    damage:            1,
    damageMultiplier:  1,
    autoHitsPerSecond: 0,
    objectIndex:       0,
    objectBreakCount:  0,
    currentHp:         0,
    currentMaxHp:      0,
    upgradeLevels:     levels,
    upgradeCosts:      costs,
  };
}

function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // localStorage unavailable — silent fail, game still works
  }
}

// Returns a fully valid state object — either from storage or default.
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return buildDefaultState();

    const saved = JSON.parse(raw);

    // Merge with default to handle missing keys from older saves
    const base = buildDefaultState();
    return { ...base, ...saved,
      upgradeLevels: { ...base.upgradeLevels, ...(saved.upgradeLevels || {}) },
      upgradeCosts:  { ...base.upgradeCosts,  ...(saved.upgradeCosts  || {}) },
    };
  } catch (e) {
    return buildDefaultState();
  }
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}


// =============================================
// GAME STATE
// =============================================
const gameState = loadGame();


// =============================================
// DOM REFERENCES
// =============================================
const dom = {
  money:        document.getElementById("money-amount"),
  damage:       document.getElementById("stat-damage"),
  speed:        document.getElementById("stat-speed"),
  objectName:   document.getElementById("object-name"),
  objectSprite: document.getElementById("object-sprite"),
  crackOverlay: document.getElementById("crack-overlay"),
  hpBar:        document.getElementById("hp-bar"),
  hpText:       document.getElementById("hp-text"),
  hitBtn:       document.getElementById("hit-btn"),
  upgradeList:  document.getElementById("upgrade-list"),
  arena:        document.getElementById("arena"),
  breakFlash:   document.getElementById("break-flash"),
  progTrack:    document.getElementById("progression-track"),
};


// =============================================
// INIT
// =============================================
function init() {
  // If loading a save, HP may be 0 (just broke) — respawn cleanly
  if (gameState.currentHp <= 0) {
    spawnObject(false);
  } else {
    // Restore display from saved state without spawn animation
    renderObjectDisplay(false);
  }

  buildUpgradePanel();
  buildProgressionBar();
  bindEvents();
  startAutoHitter();
  updateMoneyDisplay();
  updateHpDisplay();
  updateProgressionBar();
}


// =============================================
// OBJECT SPAWNING
// =============================================
function computeHp(objectDef, breakCount) {
  return Math.floor(objectDef.baseHp * Math.pow(HP_SCALE_PER_BREAK, breakCount));
}

function spawnObject(animate = true) {
  const obj = OBJECTS[gameState.objectIndex];
  const hp  = computeHp(obj, gameState.objectBreakCount);

  gameState.currentHp    = hp;
  gameState.currentMaxHp = hp;

  renderObjectDisplay(animate);
  saveGame(gameState);
}

function renderObjectDisplay(animate) {
  const obj = OBJECTS[gameState.objectIndex];

  dom.objectName.textContent   = obj.name;
  dom.objectSprite.textContent = obj.emoji;

  // Reset cracks
  dom.crackOverlay.className = "";

  if (animate) {
    dom.objectSprite.classList.remove("spawn");
    void dom.objectSprite.offsetWidth;
    dom.objectSprite.classList.add("spawn");
    setTimeout(() => dom.objectSprite.classList.remove("spawn"), 300);
  }

  updateHpDisplay();
  updateProgressionBar();
}

function advanceObject() {
  gameState.objectBreakCount++;

  if (
    gameState.objectBreakCount % BREAKS_TO_ADVANCE === 0 &&
    gameState.objectIndex < OBJECTS.length - 1
  ) {
    gameState.objectIndex++;
    gameState.objectBreakCount = 0;
  }
}


// =============================================
// HIT LOGIC
// =============================================
function getEffectiveDamage() {
  return Math.floor(gameState.damage * gameState.damageMultiplier);
}

function applyHit(damage, sourceX, sourceY) {
  gameState.currentHp -= damage;

  if (gameState.currentHp <= 0) {
    gameState.currentHp = 0;
    updateHpDisplay();
    updateCracks();
    handleBreak(sourceX, sourceY);
    return;
  }

  playHitEffects(damage, sourceX, sourceY);
  updateHpDisplay();
  updateCracks();
}

function handleBreak(sourceX, sourceY) {
  const obj    = OBJECTS[gameState.objectIndex];
  const reward = Math.floor(obj.reward * Math.pow(REWARD_SCALE_PER_BREAK, gameState.objectBreakCount));

  gameState.money += reward;

  triggerBreakFlash();
  spawnRewardFloat(reward, sourceX, sourceY);

  advanceObject();
  spawnObject(true);
  updateMoneyDisplay();
  updateUpgradeButtons();
  saveGame(gameState);
}


// =============================================
// VISUAL FEEDBACK
// =============================================
function playHitEffects(damage, x, y) {
  // Sprite squish
  dom.objectSprite.classList.remove("hit");
  void dom.objectSprite.offsetWidth;
  dom.objectSprite.classList.add("hit");
  setTimeout(() => dom.objectSprite.classList.remove("hit"), 100);

  // Arena shake
  dom.arena.classList.remove("shake");
  void dom.arena.offsetWidth;
  dom.arena.classList.add("shake");
  setTimeout(() => dom.arena.classList.remove("shake"), 180);

  // Floating damage number — only on manual click (x/y defined)
  if (x !== undefined && y !== undefined) {
    spawnFloatingNumber(`-${damage}`, x, y, "float-num");
  }
}

function triggerBreakFlash() {
  dom.breakFlash.classList.add("active");
  setTimeout(() => dom.breakFlash.classList.remove("active"), 80);

  // Extra brief bright flash on sprite before it disappears
  dom.objectSprite.style.filter = "brightness(4)";
  setTimeout(() => { dom.objectSprite.style.filter = ""; }, 80);
}

// Crack stage is derived from HP percentage thresholds.
function updateCracks() {
  const pct = gameState.currentHp / gameState.currentMaxHp;
  const overlay = dom.crackOverlay;

  overlay.classList.remove("crack-stage-1", "crack-stage-2", "crack-stage-3");

  if (pct <= 0.15) {
    overlay.classList.add("crack-stage-3");
  } else if (pct <= 0.33) {
    overlay.classList.add("crack-stage-2");
  } else if (pct <= 0.66) {
    overlay.classList.add("crack-stage-1");
  }
}

function spawnFloatingNumber(text, x, y, className) {
  const el = document.createElement("div");
  el.className   = className;
  el.textContent = text;
  el.style.left  = `${x - 14}px`;
  el.style.top   = `${y - 20}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function spawnRewardFloat(reward, x, y) {
  // Reward float appears slightly above and offset from the damage float
  const rx = (x !== undefined) ? x + 20 : window.innerWidth / 2;
  const ry = (y !== undefined) ? y - 10 : window.innerHeight / 2;
  spawnFloatingNumber(`+$${reward}`, rx, ry, "float-reward");
}


// =============================================
// DISPLAY UPDATES
// =============================================
function updateHpDisplay() {
  const pct = gameState.currentHp / gameState.currentMaxHp;
  dom.hpBar.style.width = `${Math.max(pct * 100, 0)}%`;
  dom.hpText.textContent = `${gameState.currentHp} / ${gameState.currentMaxHp}`;
}

function updateMoneyDisplay() {
  dom.money.textContent  = `$${gameState.money}`;
  dom.damage.textContent = getEffectiveDamage();
  dom.speed.textContent  = gameState.autoHitsPerSecond.toFixed(1);
}

function updateUpgradeButtons() {
  UPGRADES.forEach(u => {
    const btn   = document.getElementById(`upgrade-btn-${u.id}`);
    const level = gameState.upgradeLevels[u.id];
    const cost  = gameState.upgradeCosts[u.id];

    if (!btn) return;

    const maxed     = level >= u.maxLevel;
    const canAfford = gameState.money >= cost;

    btn.disabled    = maxed || !canAfford;
    btn.textContent = maxed ? "MAXED" : `$${cost}`;
  });
}


// =============================================
// PROGRESSION BAR
// =============================================
function buildProgressionBar() {
  dom.progTrack.innerHTML = "";

  OBJECTS.forEach((obj, i) => {
    const node = document.createElement("div");
    node.className  = "prog-node";
    node.id         = `prog-node-${i}`;
    node.innerHTML  = `
      <div class="prog-node-icon">${obj.emoji}</div>
      <div class="prog-node-label">${obj.name}</div>
    `;
    dom.progTrack.appendChild(node);
  });

  updateProgressionBar();
}

function updateProgressionBar() {
  OBJECTS.forEach((_, i) => {
    const node = document.getElementById(`prog-node-${i}`);
    if (!node) return;

    node.classList.remove("done", "active");

    if (i < gameState.objectIndex) {
      node.classList.add("done");
      // Remove any leftover badge
      const badge = node.querySelector(".prog-node-badge");
      if (badge) badge.remove();
    } else if (i === gameState.objectIndex) {
      node.classList.add("active");
      // Show break counter badge
      let badge = node.querySelector(".prog-node-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "prog-node-badge";
        node.querySelector(".prog-node-icon").appendChild(badge);
      }
      badge.textContent = gameState.objectBreakCount;
    } else {
      // Future nodes — remove badge if present
      const badge = node.querySelector(".prog-node-badge");
      if (badge) badge.remove();
    }
  });
}


// =============================================
// UPGRADE PANEL
// =============================================
function buildUpgradePanel() {
  dom.upgradeList.innerHTML = "";

  UPGRADES.forEach(u => {
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-name">${u.name}</div>
        <div class="upgrade-desc">${u.desc}</div>
      </div>
      <button class="upgrade-btn" id="upgrade-btn-${u.id}">$${u.cost}</button>
    `;
    card.querySelector(`#upgrade-btn-${u.id}`)
      .addEventListener("click", () => purchaseUpgrade(u));
    dom.upgradeList.appendChild(card);
  });

  updateUpgradeButtons();
}

function purchaseUpgrade(u) {
  const cost  = gameState.upgradeCosts[u.id];
  const level = gameState.upgradeLevels[u.id];

  if (gameState.money < cost) return;
  if (level >= u.maxLevel)    return;

  gameState.money -= cost;
  gameState.upgradeLevels[u.id]++;
  gameState.upgradeCosts[u.id] = Math.ceil(cost * u.costScale);

  u.effect(gameState);

  updateMoneyDisplay();
  updateUpgradeButtons();
  saveGame(gameState);
}


// =============================================
// AUTO HITTER
// =============================================
let lastAutoTick = performance.now();

function startAutoHitter() {
  function tick(now) {
    const delta = (now - lastAutoTick) / 1000;
    lastAutoTick = now;

    if (gameState.autoHitsPerSecond > 0) {
      const damage = getEffectiveDamage() * gameState.autoHitsPerSecond * delta;
      const floored = Math.floor(damage);
      if (floored > 0) {
        applyHit(floored); // no coords — no floating number for auto hits
      }
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}


// =============================================
// EVENT BINDING
// =============================================
function bindEvents() {
  dom.hitBtn.addEventListener("click", (e) => {
    applyHit(getEffectiveDamage(), e.clientX, e.clientY);
    updateMoneyDisplay();
  });
}


// =============================================
// START
// =============================================
init();