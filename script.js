// =============================================
// DATA — add new objects and upgrades here
// =============================================
 
// Each object in the progression sequence.
// hpScale: multiplier applied to baseHp each time this object type respawns.
// reward:  base money earned on break (also scales slightly over time).
const OBJECTS = [
  { name: "PLATE",    emoji: "🍽️",  baseHp: 10,  reward: 5  },
  { name: "BOTTLE",   emoji: "🍾",  baseHp: 30,  reward: 15 },
  { name: "VASE",     emoji: "🏺",  baseHp: 80,  reward: 40 },
  { name: "TV",       emoji: "📺",  baseHp: 200, reward: 100 },
  { name: "TOILET",   emoji: "🚽",  baseHp: 500, reward: 250 },
];
 
// Upgrades list.
// effect: function that mutates the gameState directly.
// cost:   starting cost. Each purchase multiplies cost by costScale.
// costScale: how much more expensive the next level is.
// maxLevel: cap on purchases. Set to Infinity for unlimited.
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
    costScale: 999,   // effectively one-time
    maxLevel:  1,
    effect: (state) => { state.damageMultiplier *= 2; },
  },
];
 
 
// =============================================
// GAME STATE — single source of truth
// =============================================
const gameState = {
  money:             0,
  damage:            1,        // base damage per click
  damageMultiplier:  1,        // multiplicative bonus
  autoHitsPerSecond: 0,        // auto-clicker rate
 
  objectIndex:       0,        // which OBJECTS[] entry is active
  objectBreakCount:  0,        // how many times current object type has been broken
  currentHp:         0,        // live hp of the object on screen
  currentMaxHp:      0,        // max hp of current object instance
 
  upgradeLevels: {},           // { upgradeId: currentLevel }
  upgradeCosts:  {},           // { upgradeId: currentCost  }
};
 
 
// =============================================
// DOM REFERENCES
// =============================================
const dom = {
  money:       document.getElementById("money-amount"),
  damage:      document.getElementById("stat-damage"),
  speed:       document.getElementById("stat-speed"),
  objectName:  document.getElementById("object-name"),
  objectSprite:document.getElementById("object-sprite"),
  hpBar:       document.getElementById("hp-bar"),
  hpText:      document.getElementById("hp-text"),
  hitBtn:      document.getElementById("hit-btn"),
  upgradeList: document.getElementById("upgrade-list"),
  arena:       document.getElementById("arena"),
};
 
 
// =============================================
// INIT
// =============================================
function init() {
  // Seed upgrade tracking
  UPGRADES.forEach(u => {
    gameState.upgradeLevels[u.id] = 0;
    gameState.upgradeCosts[u.id]  = u.cost;
  });
 
  spawnObject();
  buildUpgradePanel();
  bindEvents();
  startAutoHitter();
}
 
 
// =============================================
// OBJECT SPAWNING
// =============================================
 
// Computes the HP for a new instance of the current object type.
// HP grows by 20% each time the same object type is broken.
function computeHp(objectDef, breakCount) {
  return Math.floor(objectDef.baseHp * Math.pow(1.2, breakCount));
}
 
function spawnObject() {
  const obj = OBJECTS[gameState.objectIndex];
  const hp  = computeHp(obj, gameState.objectBreakCount);
 
  gameState.currentHp    = hp;
  gameState.currentMaxHp = hp;
 
  dom.objectName.textContent   = obj.name;
  dom.objectSprite.textContent = obj.emoji;
 
  updateHpDisplay();
}
 
// Advance to the next object type. Loops back to the last one once all are unlocked.
function advanceObject() {
  gameState.objectBreakCount++;
 
  // Move to next object type every 3 breaks of the current type
  if (
    gameState.objectBreakCount % 3 === 0 &&
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
 
  playHitEffects(damage, sourceX, sourceY);
 
  if (gameState.currentHp <= 0) {
    gameState.currentHp = 0;
    handleBreak();
  }
 
  updateHpDisplay();
}
 
function handleBreak() {
  const obj    = OBJECTS[gameState.objectIndex];
  // Reward scales slightly with how much the object's HP has grown
  const reward = Math.floor(obj.reward * Math.pow(1.1, gameState.objectBreakCount));
 
  gameState.money += reward;
 
  showBreakFlash();
  advanceObject();
  spawnObject();
  updateMoneyDisplay();
  updateUpgradeButtons();
}
 
 
// =============================================
// VISUAL FEEDBACK
// =============================================
function playHitEffects(damage, x, y) {
  // Sprite squish
  dom.objectSprite.classList.remove("hit");
  void dom.objectSprite.offsetWidth; // force reflow to restart animation
  dom.objectSprite.classList.add("hit");
  setTimeout(() => dom.objectSprite.classList.remove("hit"), 100);
 
  // Arena shake
  dom.arena.classList.remove("shake");
  void dom.arena.offsetWidth;
  dom.arena.classList.add("shake");
  setTimeout(() => dom.arena.classList.remove("shake"), 150);
 
  // Floating damage number
  if (x !== undefined && y !== undefined) {
    spawnFloatingNumber(`-${damage}`, x, y);
  }
}
 
function showBreakFlash() {
  dom.objectSprite.style.filter = "brightness(3)";
  setTimeout(() => { dom.objectSprite.style.filter = ""; }, 120);
}
 
function spawnFloatingNumber(text, x, y) {
  const el = document.createElement("div");
  el.className   = "float-num";
  el.textContent = text;
  el.style.left  = `${x - 10}px`;
  el.style.top   = `${y - 20}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
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
 
    btn.disabled        = maxed || !canAfford;
    btn.textContent     = maxed ? "MAXED" : `$${cost}`;
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
}
 
 
// =============================================
// AUTO HITTER
// =============================================
// Runs on a fixed interval. Deals auto damage based on autoHitsPerSecond.
// Using accumulated delta so fractional rates work correctly.
let lastAutoTick = performance.now();
 
function startAutoHitter() {
  function tick(now) {
    const delta = (now - lastAutoTick) / 1000; // seconds elapsed
    lastAutoTick = now;
 
    if (gameState.autoHitsPerSecond > 0) {
      const damage = getEffectiveDamage() * gameState.autoHitsPerSecond * delta;
      if (damage > 0) {
        applyHit(Math.floor(damage)); // no floating numbers for auto hits
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