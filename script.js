// =============================================
// DATA
// =============================================

const OBJECTS = [
  { name: "PLATE",    emoji: "🍽️",  baseHp: 8,   reward: 3   },
  { name: "BOTTLE",   emoji: "🍾",  baseHp: 20,  reward: 8   },
  { name: "VASE",     emoji: "🏺",  baseHp: 50,  reward: 20  },
  { name: "TV",       emoji: "📺",  baseHp: 120, reward: 55  },
  { name: "TOILET",   emoji: "🚽",  baseHp: 300, reward: 130 },
];

// Breaks of current object type before advancing to the next tier.
const BREAKS_TO_ADVANCE = 5;

// HP grows by this multiplier each time the same object type respawns.
const HP_SCALE_PER_BREAK = 1.15;

// Reward grows by this multiplier each time the same object type respawns.
const REWARD_SCALE_PER_BREAK = 1.08;

// Combo: window in ms during which consecutive hits keep the combo alive.
const COMBO_WINDOW_MS = 1200;

// Crit: damage multiplier when a crit lands.
const CRIT_MULTIPLIER = 3;

const UPGRADES = [
  {
    id:        "stronger_hit",
    name:      "STRONGER HIT",
    desc:      "+2 damage per swing",
    cost:      15,
    costScale: 1.55,
    maxLevel:  Infinity,
    effect: (state) => { state.damage += 2; },
  },
  {
    id:        "better_bat",
    name:      "BETTER BAT",
    desc:      "x2 damage multiplier (one time)",
    cost:      150,
    costScale: 999,
    maxLevel:  1,
    effect: (state) => { state.damageMultiplier *= 2; },
  },
  {
    id:        "crit_chance",
    name:      "CRITICAL HIT",
    desc:      "+10% chance to deal 3x damage",
    cost:      40,
    costScale: 2.0,
    maxLevel:  5,
    effect: (state) => { state.critChance = (state.critChance || 0) + 0.10; },
  },
  {
    id:        "rage_combo",
    name:      "RAGE COMBO",
    desc:      "Consecutive hits build combo up to x2 damage",
    cost:      80,
    costScale: 999,
    maxLevel:  1,
    effect: (state) => { state.comboEnabled = true; },
  },
  {
    id:        "auto_hitter",
    name:      "HIRED MUSCLE",
    desc:      "+0.5 auto-hits/sec — adds an angry worker",
    cost:      60,
    costScale: 1.9,
    maxLevel:  Infinity,
    effect: (state) => { state.autoHitsPerSecond += 0.5; },
  },
  {
    id:        "better_gloves",
    name:      "BETTER GLOVES",
    desc:      "-10% upgrade costs per level",
    cost:      100,
    costScale: 2.2,
    maxLevel:  5,
    effect: (state) => { state.costDiscount = (state.costDiscount || 0) + 0.10; },
  },
];


// =============================================
// SAVE / LOAD
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
    critChance:        0,
    comboEnabled:      false,
    costDiscount:      0,
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
  } catch (e) { /* silent fail */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return buildDefaultState();
    const saved = JSON.parse(raw);
    const base  = buildDefaultState();
    return {
      ...base, ...saved,
      upgradeLevels: { ...base.upgradeLevels, ...(saved.upgradeLevels || {}) },
      upgradeCosts:  { ...base.upgradeCosts,  ...(saved.upgradeCosts  || {}) },
    };
  } catch (e) {
    return buildDefaultState();
  }
}


// =============================================
// GAME STATE
// =============================================
const gameState = loadGame();

// Runtime-only state — not persisted
let comboCount    = 1;      // current combo multiplier tier (1 = no bonus)
let comboTimer    = null;   // timeout handle for combo reset
let lastAutoSwing = false;  // tracks angry guy swing direction


// =============================================
// DOM REFERENCES
// =============================================
const dom = {
  money:        document.getElementById("money-amount"),
  damage:       document.getElementById("stat-damage"),
  speed:        document.getElementById("stat-speed"),
  comboChip:    document.getElementById("combo-chip"),
  comboVal:     document.getElementById("stat-combo"),
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
  angryGuy:     document.getElementById("angry-guy"),
};


// =============================================
// INIT
// =============================================
function init() {
  if (gameState.currentHp <= 0) {
    spawnObject(false);
  } else {
    renderObjectDisplay(false);
  }

  buildUpgradePanel();
  buildProgressionBar();
  bindEvents();
  startAutoHitter();
  updateMoneyDisplay();
  updateHpDisplay();
  updateProgressionBar();
  updateAngryGuy();
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
  dom.crackOverlay.className   = "";

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

// Returns { damage, isCrit } — applies crit chance and combo multiplier.
function resolveHit(isManual) {
  let dmg = getEffectiveDamage();

  // Crit
  const isCrit = gameState.critChance > 0 && Math.random() < gameState.critChance;
  if (isCrit) dmg = Math.floor(dmg * CRIT_MULTIPLIER);

  // Combo — only applies to manual clicks
  if (isManual && gameState.comboEnabled && comboCount > 1) {
    // comboCount goes 1→2→3→4 max, mapped to 1x→1.25x→1.5x→2x
    const comboBonus = 1 + ((comboCount - 1) / 3) * 1.0;
    dmg = Math.floor(dmg * Math.min(comboBonus, 2));
  }

  return { damage: Math.max(dmg, 1), isCrit };
}

function applyHit(damage, isCrit, sourceX, sourceY) {
  gameState.currentHp -= damage;

  if (gameState.currentHp <= 0) {
    gameState.currentHp = 0;
    updateHpDisplay();
    updateCracks();
    handleBreak(sourceX, sourceY);
    return;
  }

  playHitEffects(damage, isCrit, sourceX, sourceY);
  updateHpDisplay();
  updateCracks();
}

function handleBreak(sourceX, sourceY) {
  const obj    = OBJECTS[gameState.objectIndex];
  const reward = Math.floor(obj.reward * Math.pow(REWARD_SCALE_PER_BREAK, gameState.objectBreakCount));

  gameState.money += reward;

  triggerBreakFlash();
  spawnRewardFloat(reward, sourceX, sourceY);
  resetCombo();

  advanceObject();
  spawnObject(true);
  updateMoneyDisplay();
  updateUpgradeButtons();
  saveGame(gameState);
}


// =============================================
// COMBO
// =============================================
function tickCombo() {
  if (!gameState.comboEnabled) return;

  // Max combo tier is 4
  comboCount = Math.min(comboCount + 1, 4);
  updateComboDisplay();

  // Reset the decay timer on every hit
  clearTimeout(comboTimer);
  comboTimer = setTimeout(resetCombo, COMBO_WINDOW_MS);
}

function resetCombo() {
  comboCount = 1;
  clearTimeout(comboTimer);
  updateComboDisplay();
}

function updateComboDisplay() {
  if (!gameState.comboEnabled) {
    dom.comboChip.style.display = "none";
    return;
  }

  dom.comboChip.style.display = "flex";

  const labels = ["x1", "x1.25", "x1.5", "x2"];
  dom.comboVal.textContent = labels[comboCount - 1] || "x2";

  // Intensity glow scales with combo tier
  const glows = [
    "none",
    "0 0 8px rgba(255,204,0,0.3)",
    "0 0 14px rgba(255,204,0,0.55)",
    "0 0 22px rgba(255,204,0,0.8)",
  ];
  dom.comboChip.style.boxShadow = glows[comboCount - 1] || glows[3];
}


// =============================================
// VISUAL FEEDBACK
// =============================================
function playHitEffects(damage, isCrit, x, y) {
  const sprite = dom.objectSprite;

  // Sprite squish — harder on crit
  sprite.classList.remove("hit", "crit");
  void sprite.offsetWidth;
  sprite.classList.add(isCrit ? "crit" : "hit");
  setTimeout(() => sprite.classList.remove("hit", "crit"), isCrit ? 160 : 100);

  // Arena shake — only on crit or manual hit
  if (isCrit || (x !== undefined)) {
    dom.arena.classList.remove("shake");
    void dom.arena.offsetWidth;
    dom.arena.classList.add("shake");
    setTimeout(() => dom.arena.classList.remove("shake"), 180);
  }

  // Floating number — manual clicks only
  if (x !== undefined && y !== undefined) {
    const label = isCrit ? `💥${damage}` : `-${damage}`;
    spawnFloatingNumber(label, x, y, "float-num");
  }
}

function triggerBreakFlash() {
  dom.breakFlash.classList.add("active");
  setTimeout(() => dom.breakFlash.classList.remove("active"), 80);
  dom.objectSprite.style.filter = "brightness(4)";
  setTimeout(() => { dom.objectSprite.style.filter = ""; }, 80);
}

function updateCracks() {
  const pct     = gameState.currentHp / gameState.currentMaxHp;
  const overlay = dom.crackOverlay;
  overlay.classList.remove("crack-stage-1", "crack-stage-2", "crack-stage-3");
  if      (pct <= 0.15) overlay.classList.add("crack-stage-3");
  else if (pct <= 0.33) overlay.classList.add("crack-stage-2");
  else if (pct <= 0.66) overlay.classList.add("crack-stage-1");
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
  const rx = (x !== undefined) ? x + 20 : window.innerWidth / 2;
  const ry = (y !== undefined) ? y - 10  : window.innerHeight / 2;
  spawnFloatingNumber(`+$${reward}`, rx, ry, "float-reward");
}


// =============================================
// ANGRY GUY
// Shown as soon as auto_hitter level >= 1.
// Swings in sync with auto-hit ticks.
// =============================================
function updateAngryGuy() {
  const active = gameState.upgradeLevels["auto_hitter"] > 0;
  dom.angryGuy.style.display = active ? "flex" : "none";
}

function triggerAngrySwing() {
  dom.angryGuy.classList.toggle("swing");
}


// =============================================
// DISPLAY UPDATES
// =============================================
function updateHpDisplay() {
  const pct = gameState.currentHp / gameState.currentMaxHp;
  dom.hpBar.style.width  = `${Math.max(pct * 100, 0)}%`;
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
    const cost  = getDiscountedCost(u.id);
    const card  = btn ? btn.closest(".upgrade-card") : null;

    if (!btn || !card) return;

    const maxed     = level >= u.maxLevel;
    const canAfford = gameState.money >= cost;

    btn.disabled    = maxed || !canAfford;
    btn.textContent = maxed ? "MAXED" : `$${cost}`;

    // Dim card if can't afford and not maxed
    card.classList.toggle("locked", !maxed && !canAfford);

    // Update level badge
    let badge = card.querySelector(".upgrade-level");
    if (u.maxLevel !== 1 && u.maxLevel !== Infinity) {
      // Capped repeatable — show X/MAX
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "upgrade-level";
        card.querySelector(".upgrade-name").appendChild(badge);
      }
      badge.textContent = maxed ? "MAX" : `${level}/${u.maxLevel}`;
    } else if (u.maxLevel === Infinity && level > 0) {
      // Unlimited — show current level
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "upgrade-level";
        card.querySelector(".upgrade-name").appendChild(badge);
      }
      badge.textContent = `Lv${level}`;
    }
  });
}

// Returns cost after applying the costDiscount stat.
function getDiscountedCost(upgradeId) {
  const raw      = gameState.upgradeCosts[upgradeId];
  const discount = Math.min(gameState.costDiscount || 0, 0.5); // cap at 50% off
  return Math.max(Math.ceil(raw * (1 - discount)), 1);
}


// =============================================
// PROGRESSION BAR
// =============================================
function buildProgressionBar() {
  dom.progTrack.innerHTML = "";

  OBJECTS.forEach((obj, i) => {
    const node = document.createElement("div");
    node.className = "prog-node";
    node.id        = `prog-node-${i}`;
    node.innerHTML = `
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
      const badge = node.querySelector(".prog-node-badge");
      if (badge) badge.remove();
    } else if (i === gameState.objectIndex) {
      node.classList.add("active");
      let badge = node.querySelector(".prog-node-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "prog-node-badge";
        node.querySelector(".prog-node-icon").appendChild(badge);
      }
      badge.textContent = gameState.objectBreakCount;
    } else {
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
  const cost  = getDiscountedCost(u.id);
  const level = gameState.upgradeLevels[u.id];

  if (gameState.money < cost) return;
  if (level >= u.maxLevel)    return;

  gameState.money -= cost;
  gameState.upgradeLevels[u.id]++;
  // Store raw cost for next level, discount is applied at display/purchase time
  gameState.upgradeCosts[u.id] = Math.ceil(gameState.upgradeCosts[u.id] * u.costScale);

  u.effect(gameState);

  // Special side-effects on purchase
  if (u.id === "auto_hitter") updateAngryGuy();
  if (u.id === "rage_combo")  updateComboDisplay();

  updateMoneyDisplay();
  updateUpgradeButtons();
  saveGame(gameState);
}


// =============================================
// AUTO HITTER
// =============================================
let lastAutoTick     = performance.now();
// Accumulator for partial swing timing so angry guy animation rate
// matches actual auto-hit rate regardless of rAF timing.
let swingAccumulator = 0;

function startAutoHitter() {
  function tick(now) {
    const delta = (now - lastAutoTick) / 1000;
    lastAutoTick = now;

    if (gameState.autoHitsPerSecond > 0) {
      const rawDamage = getEffectiveDamage() * gameState.autoHitsPerSecond * delta;
      const floored   = Math.floor(rawDamage);

      if (floored > 0) {
        const { damage, isCrit } = resolveHit(false);
        // Scale resolved damage to match the accumulated delta amount
        const scaledDamage = Math.floor(damage * gameState.autoHitsPerSecond * delta);
        if (scaledDamage > 0) {
          applyHit(scaledDamage, isCrit);
        }
      }

      // Drive angry guy swing at a rate proportional to autoHitsPerSecond
      swingAccumulator += gameState.autoHitsPerSecond * delta;
      if (swingAccumulator >= 1) {
        swingAccumulator -= 1;
        triggerAngrySwing();
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
    const { damage, isCrit } = resolveHit(true);
    tickCombo();
    applyHit(damage, isCrit, e.clientX, e.clientY);
    updateMoneyDisplay();
  });
}


// =============================================
// START
// =============================================
init();