/*
  main.js
  - Moved the original script.js game logic here as an ES module for clearer organization.
  - This file contains the full game logic and runs automatically when imported.
*/

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// basic game start state
let gameStarted = false;
let spawnInterval = null;

 // --- Ship images ---
const shipImage = new Image();
shipImage.src = "Main Ship - Base - Full health.png";
shipImage.crossOrigin = "anonymous"; // harmless default in this environment

const damagedShipImage = new Image();
damagedShipImage.src = "Main Ship - Base - Slight damage.png";
damagedShipImage.crossOrigin = "anonymous";

const heavilyDamagedShipImage = new Image();
heavilyDamagedShipImage.src = "Main Ship - Base - Damaged.png";
heavilyDamagedShipImage.crossOrigin = "anonymous";

const veryDamagedShipImage = new Image();
veryDamagedShipImage.src = "Main Ship - Base - Very damaged.png";
veryDamagedShipImage.crossOrigin = "anonymous";

// helper to pick correct ship sprite based on current health
function currentShipImage() {
  // >79 -> full; 50-79 -> slight damage; 21-49 -> damaged; <=20 -> very damaged
  if (player.health <= 20) return veryDamagedShipImage;
  if (player.health <= 50) return heavilyDamagedShipImage;
  if (player.health < 80) return damagedShipImage;
  return shipImage;
}

 // --- Bullet image (transparent PNG) ---
 const bulletImage = new Image();
 // use the trimmed transparent asset to avoid any gray background
 bulletImage.src = "asset.png";
 bulletImage.crossOrigin = "anonymous";
 // render the bullet a bit smaller for visibility
 const BULLET_W = 12;
 const BULLET_H = 12;

 // --- Rocket sprite for fired rockets (use provided art)
 const rocketImg = new Image();
 rocketImg.src = "rocket upgrade.png";
 rocketImg.crossOrigin = "anonymous";

 // --- Player Setup ---
 const player = {
  x: canvas.width / 2,
  y: canvas.height - 96,
  width: 70,
  height: 70,
  // an explicit collision radius (smaller than the sprite) gives tighter, more accurate collisions
  radius: 28,
  speed: 8,
  bullets: [],
  maxHealth: 100,
  health: 100,
  flashing: false,
  // rotation in radians (0 = facing up). positive rotates clockwise
  angle: 0,
  // how fast the ship rotates when holding Q/E (radians per frame)
  rotationSpeed: Math.PI / 180 * 2.5, // ~2.5 degrees per frame
};

 // --- Ammo & Reload ---
 // clipSize = bullets per clip; clipAmmo = current clip; reserveAmmo = spare ammo you pick up.
 const clipSize = 30;
 let clipAmmo = clipSize;     // starts full
 let reserveAmmo = 30;        // starts with 30 spare (so initial state is 30/30)
 let reloading = false;
 const reloadTime = 2000; // milliseconds
 let reloadEndsAt = 0;
let reloadTimer = null;

 // startReload now moves all reserve into the clip (resulting in clipSize / 0 when reserve >= clipSize)
 function startReload(force = false) {
  // only start reload if we actually have spare ammo and the clip is not already full,
  // unless 'force' is true (manual top-up reload)
  if (reloading) return;
  if (reserveAmmo <= 0) return; // nothing to load
  if (!force && clipAmmo >= clipSize) return; // clip already full for auto reloads

  // If forced and clip already full, don't start (no-op)
  if (force && clipAmmo >= clipSize) return;

  reloading = true;
  reloadEndsAt = performance.now() + reloadTime;

  // clear any prior timer and create a new one that performs the ammo transfer when it fires
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  reloadTimer = setTimeout(() => {
    // perform the actual ammo transfer when reload finishes
    const needed = Math.max(0, clipSize - clipAmmo);
    const take = Math.min(needed, reserveAmmo);
    clipAmmo = clipAmmo + take;
    reserveAmmo = Math.max(0, reserveAmmo - take);

    // finalize reload state
    reloading = false;
    reloadEndsAt = 0;
    reloadTimer = null;
  }, reloadTime);
}

// --- Asteroids ---
let asteroids = [];

// --- Enemy AI (uses provided Nairan sprites + enemy bullet) ---
// enemies appear after reaching scoreThreshold; spawn two every spawnIntervalMs
const scoutSprite = new Image();
scoutSprite.src = "Nairan - Scout - Base.png";
scoutSprite.crossOrigin = "anonymous";

const enemyBulletImg = new Image();
enemyBulletImg.src = "bullet enemy.png";
enemyBulletImg.crossOrigin = "anonymous";

let enemies = [];
 // per-type kill counters
 let killCounts = { scout: 0, fighter: 0, healer: 0, frigate: 0 };
/* track how many asteroids player has destroyed (for Pew Pew achievement) */
let asteroidsDestroyed = 0;

  // Achievements registry
 let achievements = {
   ps1: {
     id: "ps1",
     name: "PS1",
     desc: "Reach 500 Points to unlock. Reward: 2 SC.",
     // detailed description shown in the achievements panel / toast
     description: "phew you got out of the boring phase get ready for some ENEMIES !!",
     unlocked: false, // becomes true when condition met (auto-unlock on reach)
     claimed: false,  // becomes true when player claims reward
     rewardSC: 2,
     unlockThreshold: 500,
   },
   ps2: {
     id: "ps2",
     name: "PS2",
     desc: "Reach 1000 Points to unlock. Reward: 5 SC.",
     description: "So I may have underestimated you BUT dont get slacking.",
     unlocked: false,
     claimed: false,
     rewardSC: 5,
     unlockThreshold: 1000,
   },
   ps3: {
     id: "ps3",
     name: "PS3",
     desc: "Reach 2500 Points to unlock. Reward: 15 SC.",
     description: "wow you might be actually good  well let me throw something even harder.",
     unlocked: false,
     claimed: false,
     rewardSC: 15,
     unlockThreshold: 2500,
   },
   // first scout kill achievement (unlocks when you kill your first scout)
   scout_kill: {
     id: "scout_kill",
     name: "First Scout Kill",
     desc: "Kill your first Scout enemy. Reward: 3 SC.",
     description: "Nice! You took down a Scout — welcome to combat.",
     unlocked: false,
     claimed: false,
     rewardSC: 3,
     // marker: unlocked by killCounts.scout >= 1 (no numeric score threshold)
   },
   // first fighter kill achievement (unlocks when you kill your first fighter)
   fighter_kill: {
     id: "fighter_kill",
     name: "First Fighter Kill",
     desc: "Kill your first Fighter enemy. Reward: 3 SC.",
     description: "Great shot — you destroyed a Fighter. Keep it up!",
     unlocked: false,
     claimed: false,
     rewardSC: 3,
     // marker: unlocked by killCounts.fighter >= 1
   },

   // first support/healer kill achievement (unlocks when you kill your first healer/support enemy)
   support_kill: {
     id: "support_kill",
     name: "First Support Kill",
     desc: "Kill your first Support (Healer) enemy. Reward: 4 SC.",
     description: "You took out a Support ship — awkward, but effective. Hope you feel okay about it.",
     unlocked: false,
     claimed: false,
     rewardSC: 4,
     // marker: unlocked by killCounts.healer >= 1
   },

   // First Frigate Kill achievement (new)
   frigate_kill: {
     id: "frigate_kill",
     name: "First Frigate Kill",
     desc: "Kill your first Frigate enemy. Reward: 50 SC.",
     description: "Oh no — their Frigate is down. That felt... dramatic.",
     unlocked: false,
     claimed: false,
     rewardSC: 50,
     // marker: unlocked by killCounts.frigate >= 1
   },

   // Terminator: kill 10 frigates to unlock
   terminator: {
     id: "terminator",
     name: "Terminator",
     desc: "Kill 10 Frigates. Reward: 120 SC.",
     description: "Ten frigates? That's intense — you really made an impact.",
     unlocked: false,
     claimed: false,
     rewardSC: 120,
     // marker: unlocked by killCounts.frigate >= 10
   },

   ps4: {
     id: "ps4",
     name: "PS4",
     desc: "Reach 5000 Points to unlock. Reward: 30 SC.",
     description: "WOAH your an pro! i got to up my game.",
     unlocked: false,
     claimed: false,
     rewardSC: 30,
     unlockThreshold: 5000,
   },
   ps5: {
     id: "ps5",
     name: "PS5",
     desc: "Reach 8000 Points to unlock. Reward: 50 SC.",
     description: "WHY JUST LOSE BRO GIVE UP YOU WILL NEVER HIT THE END !!",
     unlocked: false,
     claimed: false,
     rewardSC: 50,
     unlockThreshold: 8000,
   },
   ps6: {
     id: "ps6",
     name: "PS6",
     desc: "Reach 10000 Points to unlock. Reward: +55 Points when claimed.",
     description: "TURN BACK NOW !",
     unlocked: false,
     claimed: false,
     rewardPoints: 55,
     unlockThreshold: 10000,
   },

   // Pew Pew: shoot down your first asteroid
   pew_pew: {
     id: "pew_pew",
     name: "Pew Pew",
     desc: "Shoot down your first Asteroid. Reward: 1 SC.",
     description: "Nice — your first asteroid destroyed. Many more adventures ahead.",
     unlocked: false,
     claimed: false,
     rewardSC: 1,
     // unlocked by asteroidsDestroyed >= 1
   },
   hunter_killer: {
     id: "hunter_killer",
     name: "Hunter Killer",
     desc: "Kill 30 Scouts and 30 Fighters. Reward: 40 SC.",
     description: "STOP KILLING MY SHIPS STOP!",
     unlocked: false,
     claimed: false,
     rewardSC: 40,
     // unlocked by kill counts: scouts >= 30 and fighters >= 30
   },
   no_mercy: {
     id: "no_mercy",
     name: "No Mercy for Healers",
     desc: "Kill 30 Support (Healer) enemies. Reward: 30 SC.",
     description: "WHYYY YOU JUST BROKE THE COSMIC CONVENTIONS",
     unlocked: false,
     claimed: false,
     rewardSC: 30,
     // unlocked by killCounts.healer >= 30
   },

   // Upgraded Firepower: unlocks when player buys their first rocket
   upgraded_firepower: {
     id: "upgraded_firepower",
     name: "Upgraded Firepower",
     desc: "Buy your first Rocket. Reward: 6 SC.",
     description: "oooooo i see you getting stronger guns eh",
     unlocked: false,
     claimed: false,
     rewardSC: 6,
     // unlocked by rocketUpgrade.count >= 1
   },

   // Upgraded — First Upgrade: unlocks when player purchases any upgrade for the first time
   up_first: {
     id: "up_first",
     name: "Upgraded — First Upgrade",
     desc: "Buy your first permanent upgrade or consumable. Reward: 2 SC.",
     description: "well i see your ship is stronger",
     unlocked: false,
     claimed: false,
     rewardSC: 2,
     // unlocked by a purchase happening (first time any purchase pushes to playerInventory)
   },
 };
 // container for bullets fired by enemies (declare once to avoid ReferenceError)
 let enemyBullets = [];

 // Add missing achievement entry for Hull Reinforcement 2 so it appears in the achievements registry and can be unlocked/claimed.
 // This keeps achievement state consistent with UI claim handlers and unlock checks elsewhere in the code.
 try {
   if (typeof achievements === "object" && achievements && !achievements.hull_reinforcement_2) {
     achievements.hull_reinforcement_2 = {
       id: "hull_reinforcement_2",
       name: "Hull Reinforcement II",
       desc: "Buy Hull Reinforcement 2. Reward: 60 SC.",
       description: "woah dont upgrade the hull to much, how will i destroy you",
       unlocked: false,
       claimed: false,
       rewardSC: 60,
       // unlocked when hullUpgrade2.purchased === true (checked elsewhere)
     };
   }
 } catch (e) {
   // non-fatal; if achievements object isn't available skip gracefuly
   console.warn("Could not register hull_reinforcement_2 achievement:", e);
 }
const enemySpawnScoreThreshold = 500;
let enemySpawnerStarted = false;
let enemySpawnInterval = null;
const enemySpawnIntervalMs = 15000; // spawn cycle every 15s (faster cycles)
const enemiesPerCycle = 2;

// frigate spawn threshold and spawner controls
const frigateSpawnScoreThreshold = 1000;
let frigateSpawnerStarted = false;
let frigateSpawnInterval = null;

 // --- Fighter enemy (stronger type) ---
 const fighterSprite = new Image();
 fighterSprite.src = "Nairan - Fighter - Base.png";
 fighterSprite.crossOrigin = "anonymous";

 // healer/support sprite (uses the support ship asset) and the ray asset for the heal beam
 const healerSprite = new Image();
 healerSprite.src = "Nairan - Support Ship - Base.png";
 healerSprite.crossOrigin = "anonymous";

 const rayImage = new Image();
 rayImage.src = "ray laser.png";
 rayImage.crossOrigin = "anonymous";

 // frigate (new heavy enemy) sprite + its shield (preprocessed like player shield)
 const frigateSprite = new Image();
 frigateSprite.src = "Nairan - Frigate - Base.png";
 frigateSprite.crossOrigin = "anonymous";

 const frigateShieldImage = new Image();
 frigateShieldImage.src = "Nairan - Frigate - Shield.png";
 frigateShieldImage.crossOrigin = "anonymous";

 // preprocess the frigate shield into an offscreen canvas (remove black background)
 const frigateShieldCanvas = document.createElement("canvas");
 const frigateShieldCtx = frigateShieldCanvas.getContext("2d");
 let frigateShieldReady = false;
 frigateShieldImage.addEventListener("load", () => {
   try {
     const w = Math.max(32, frigateShieldImage.naturalWidth);
     const h = Math.max(32, frigateShieldImage.naturalHeight);
     frigateShieldCanvas.width = w;
     frigateShieldCanvas.height = h;
     frigateShieldCtx.clearRect(0, 0, w, h);
     frigateShieldCtx.drawImage(frigateShieldImage, 0, 0, w, h);
     try {
       const imgd = frigateShieldCtx.getImageData(0, 0, w, h);
       const data = imgd.data;
       for (let i = 0; i < data.length; i += 4) {
         const r = data[i], g = data[i + 1], b = data[i + 2];
         if (r <= 16 && g <= 16 && b <= 16) data[i + 3] = 0;
       }
       frigateShieldCtx.putImageData(imgd, 0, 0);
     } catch (e) {
       console.warn("Frigate shield preprocessing failed (pixel access). Using raw image.", e);
     }
     frigateShieldReady = true;
   } catch (e) {
     frigateShieldReady = false;
     console.warn("Frigate shield canvas setup failed:", e);
   }
 });

 const shieldImage = new Image();
 shieldImage.src = "shield 1.png";
 shieldImage.crossOrigin = "anonymous";

 // Create an offscreen canvas to hold a preprocessed (black-background removed) shield sprite.
 // We'll draw the original image into this canvas once loaded, convert pure-black pixels to transparent,
 // and then use the offscreen canvas directly for in-game rendering (so it can be rotated and scaled cleanly).
 const shieldCanvas = document.createElement("canvas");
 const shieldCanvasCtx = shieldCanvas.getContext("2d");
 let shieldCanvasReady = false;

 shieldImage.addEventListener("load", () => {
   try {
     // use a working size based on the loaded image to preserve pixel-art fidelity
     const w = Math.max(32, shieldImage.naturalWidth);
     const h = Math.max(32, shieldImage.naturalHeight);
     shieldCanvas.width = w;
     shieldCanvas.height = h;
     // draw original image into offscreen canvas
     shieldCanvasCtx.clearRect(0, 0, w, h);
     shieldCanvasCtx.drawImage(shieldImage, 0, 0, w, h);

     // read pixels and turn near-black/black pixels fully transparent
     try {
       const imgd = shieldCanvasCtx.getImageData(0, 0, w, h);
       const data = imgd.data;
       for (let i = 0; i < data.length; i += 4) {
         const r = data[i], g = data[i + 1], b = data[i + 2];
         // treat near-black as background (tolerance to preserve anti-aliased edges)
         if (r <= 16 && g <= 16 && b <= 16) {
           data[i + 3] = 0; // alpha = 0
         }
       }
       shieldCanvasCtx.putImageData(imgd, 0, 0);
     } catch (e) {
       // some environments may restrict getImageData cross-origin; in that case we still fallback to using the original image
       console.warn("Shield preprocessing failed (pixel access). Falling back to raw image.", e);
     }

     shieldCanvasReady = true;
   } catch (e) {
     console.warn("Shield canvas setup failed:", e);
     shieldCanvasReady = false;
   }
 });

const fighterSpawnScoreThreshold = 600;
let fighterSpawnerStarted = false;
let fighterSpawnInterval = null;

// Healer/support spawn threshold and control: appears after 650 points, only one healer at a time,
// always comes paired with exactly one other enemy (spawned nearby and synced).
const healerSpawnScoreThreshold = 650;
let healerSpawnerStarted = false;
let healerSpawnInterval = null;
let healerActive = false; // ensure only one healer present at a time
// spawn once per 15..30 seconds -- we'll schedule an interval that randomizes each cycle

function spawnFighter() {
  const fx = 60 + Math.random() * (canvas.width - 120);
  const fy = -80;
  const entryVy = 1.6 + Math.random() * 1.2;
  enemies.push({
    x: fx,
    y: fy,
    width: 72,
    height: 72,
    radius: 26,
    vy: entryVy,
    vx: (Math.random() - 0.5) * 1.6,
    state: "entering",
    health: 150, // fighter HP as requested
    maxHealth: 150,
    damage: 20,  // deals 20 damage on ram / hit
    shootTimer: 800 + Math.random() * 1200,
    lastShotAt: performance.now(),
    shootInterval: 700 + Math.random() * 900,
    shootRange: 1100,
    type: "fighter",
    // path variation properties to avoid all fighters taking identical pursuit paths
    pathSeed: Math.random() * Math.PI * 2,
    zigAmplitude: 0.6 + Math.random() * 1.4, // lateral offset magnitude (px-ish when scaled)
    zigFreq: 1.2 + Math.random() * 1.6, // frequency in Hz for lateral oscillation
  });
}

// schedule fighters reliably every 30 seconds (spawn two each cycle)
function startFighterSpawner() {
  if (fighterSpawnerStarted) return;
  fighterSpawnerStarted = true;
  // immediate spawn once threshold reached: spawn two fighters to match cycle behavior
  spawnFighter();
  spawnFighter();
  // set an interval that spawns two fighters each cycle (sped up)
  if (fighterSpawnInterval) clearInterval(fighterSpawnInterval);
  fighterSpawnInterval = setInterval(() => {
    if (!gameOver && gameStarted) {
      spawnFighter();
      spawnFighter();
    }
  }, 15000);
}

// --- Frigate spawner & behavior (heavy enemy) ---
function spawnFrigate() {
  const fx = 80 + Math.random() * (canvas.width - 160);
  const fy = -120;
  enemies.push({
    x: fx,
    y: fy,
    width: 120,
    height: 120,
    radius: 42,
    vy: 0.9 + Math.random() * 0.6,
    vx: (Math.random() - 0.5) * 0.8,
    state: "entering",
    health: 180,
    maxHealth: 180,
    damage: 30,
    type: "frigate",
    shootTimer: 2000,
    lastShotAt: performance.now(),
    shootInterval: 1800 + Math.random() * 1200,
    // fire ray more often (shorter interval)
    rayInterval: 6000, // fire ray every ~6s
    // start the ray timer offset so the frigate may fire its first beam immediately after entering
    lastRayAt: performance.now() - 6000,
    // removed rocket firing for frigate — frigate only uses the ray now
    shield: {
      hp: 180,
      maxHp: 180,
      active: true,
      rechargeDelayMs: 4000,
      rechargeRatePerSec: 8,
      lastHitAt: 0,
      rechargeTickAt: performance.now(),
    },
    // beam damage per shot (used for interactions with player and asteroids)
    beamDamage: 30,
    // improved pathfinding seeds
    pathSeed: Math.random() * Math.PI * 2,
    zigAmplitude: 1.4 + Math.random() * 1.6,
    zigFreq: 1.8 + Math.random() * 2.0,
    pursuitAggression: 1.6 + Math.random() * 1.2,
  });
}

function startFrigateSpawner() {
  if (frigateSpawnerStarted) return;
  frigateSpawnerStarted = true;
  // immediate spawn one frigate when threshold reached
  spawnFrigate();
  if (frigateSpawnInterval) clearInterval(frigateSpawnInterval);
  // spawn one frigate every 45s (sped up rare heavy event)
  frigateSpawnInterval = setInterval(() => {
    if (!gameOver && gameStarted) {
      spawnFrigate();
    }
  }, 45000);
}

function stopFrigateSpawner() {
  frigateSpawnerStarted = false;
  if (frigateSpawnInterval) {
    clearInterval(frigateSpawnInterval);
    frigateSpawnInterval = null;
  }
}

function stopFighterSpawner() {
  fighterSpawnerStarted = false;
  if (fighterSpawnInterval) {
    clearInterval(fighterSpawnInterval);
    fighterSpawnInterval = null;
  }
}

// --- Healer (support) spawner ---
// spawn a single healer that always comes paired with another enemy (scout or fighter).
function spawnHealerPair() {
  if (!gameStarted || gameOver || healerActive) return;
  healerActive = true;

  // choose companion type (prefer scout; sometimes fighter)
  const companionType = Math.random() < 0.6 ? "scout" : "fighter";

  // spawn positions near each other
  const baseX = 80 + Math.random() * (canvas.width - 160);
  const healerX = Math.max(60, Math.min(canvas.width - 60, baseX + (Math.random() - 0.5) * 80));
  const companionX = Math.max(60, Math.min(canvas.width - 60, healerX + (Math.random() < 0.5 ? -60 : 60)));
  const startY = -80;

  // healer entry (supports burst: 5 beams then 1s reload)
  enemies.push({
    x: healerX,
    y: startY,
    width: 80,
    height: 80,
    radius: 30,
    vy: 1.2,
    vx: (Math.random() - 0.5) * 0.6,
    state: "entering",
    health: 120,
    maxHealth: 120,
    damage: 5, // low ram damage; its role is support
    type: "healer",
    // healing behavior: increased frequency and potency — more beams per burst, faster spacing and shorter reload
    healInterval: 1000, // milliseconds between individual beams (reduced from 2000 to heal more often)
    lastHealAt: performance.now(),
    healAmount: 30,      // larger heal per beam (was 20)
    beamsRemaining: 6,   // beams left in the current burst (slightly larger burst)
    burstSize: 6,        // how many beams per burst (was 5)
    burstReloadMs: 800,  // shorter reload between bursts (ms; was 1000)
    burstReloadUntil: 0, // timestamp until which healer is reloading
    companionId: null, // will try to find companion by proximity after spawn
    paired: true,
  });

  // companion entry
  if (companionType === "fighter") {
    const fx = companionX;
    const fy = startY - 24;
    const entryVy = 1.6 + Math.random() * 1.2;
    enemies.push({
      x: fx,
      y: fy,
      width: 72,
      height: 72,
      radius: 26,
      vy: entryVy,
      vx: (Math.random() - 0.5) * 1.6,
      state: "entering",
      health: 150,
      maxHealth: 150,
      damage: 20,
      shootTimer: 800 + Math.random() * 1200,
      lastShotAt: performance.now(),
      shootInterval: 700 + Math.random() * 900,
      shootRange: 1100,
      type: "fighter",
      pathSeed: Math.random() * Math.PI * 2,
      zigAmplitude: 0.6 + Math.random() * 1.4,
      zigFreq: 1.2 + Math.random() * 1.6,
      pairedWithHealer: true,
    });
  } else {
    // scout companion
    const sx = companionX;
    const sy = startY - 24;
    enemies.push({
      x: sx,
      y: sy,
      width: 64,
      height: 64,
      radius: 20,
      vy: 2 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 2.0,
      state: "entering",
      health: 100,
      maxHealth: 100,
      damage: 10,
      shootTimer: 1000 + Math.random() * 2000,
      lastShotAt: performance.now(),
      shootInterval: 900 + Math.random() * 1200,
      shootRange: 900 + Math.random() * 200,
      type: "scout",
      pairedWithHealer: true,
    });
  }
}

function startHealerSpawner() {
  if (healerSpawnerStarted) return;
  healerSpawnerStarted = true;
  // immediate spawn once threshold reached
  spawnHealerPair();
  // schedule further single healer pairs every 35-50s
  if (healerSpawnInterval) clearInterval(healerSpawnInterval);
  // shorter intervals and smaller random jitter so support encounters happen more often
  healerSpawnInterval = setInterval(() => {
    if (!gameOver && gameStarted && !healerActive) {
      spawnHealerPair();
    }
  }, 18000 + Math.random() * 8000);
}

function stopHealerSpawner() {
  healerSpawnerStarted = false;
  if (healerSpawnInterval) {
    clearInterval(healerSpawnInterval);
    healerSpawnInterval = null;
  }
}

// spawn single enemy: enters from top with initial drop animation then becomes active
function spawnEnemy() {
  // spawn x across the playfield with some margin
  const ex = 60 + Math.random() * (canvas.width - 120);
  const ey = -60; // start offscreen above
  const entryVy = 2 + Math.random() * 1.5; // entry speed
  enemies.push({
    x: ex,
    y: ey,
    width: 64,
    height: 64,
    radius: 20,
    vy: entryVy,
    vx: (Math.random() - 0.5) * 2.0,
    state: "entering", // entering -> active
    health: 1, // scout HP now 1 so a single bullet/rocket will destroy it
    maxHealth: 1,
    damage: 10,  // scout deals 10 damage on ram / hit
    shootTimer: 1000 + Math.random() * 2000, // time until next shot (ms)
    lastShotAt: performance.now(),
    // shorter base interval and allow variability (more aggressive shooting)
    shootInterval: 900 + Math.random() * 1200, // ms between shots while active
    // allow enemies to shoot from farther away (effective range in px)
    shootRange: 900 + Math.random() * 200,
    type: "scout",
  });
}

// start periodic enemy spawner (two per cycle)
function startEnemySpawner() {
  if (enemySpawnerStarted) return;
  enemySpawnerStarted = true;
  // immediate spawn once threshold reached
  for (let i = 0; i < enemiesPerCycle; i++) spawnEnemy();
  enemySpawnInterval = setInterval(() => {
    for (let i = 0; i < enemiesPerCycle; i++) spawnEnemy();
  }, enemySpawnIntervalMs);
}

function stopEnemySpawner() {
  enemySpawnerStarted = false;
  if (enemySpawnInterval) {
    clearInterval(enemySpawnInterval);
    enemySpawnInterval = null;
  }
}
let score = 0;
let highScore = 0;
let gameOver = false;

 // SC (space coins) balance
 let scBalance = 0;

 // --- Front Shield (original) state ---
 // frontal-only shield that protects on front hits
 let frontShield = {
   unlocked: false,
   equipped: false,
   active: false,
   hp: 50,
   maxHp: 50,
   rechargeDelayMs: 2000,
   rechargeRatePerSec: 5,
   lastHitAt: 0,
   rechargeTickAt: 0,
 };

 // --- Full-Body Shield (new / separate) ---
 let shieldUpgrade = {
   unlocked: false,
   equipped: false,
   active: false,
   hp: 100,
   maxHp: 100,
   // when shield reaches 0 it goes offline and starts recharge after this delay
   rechargeDelayMs: 2000,
   // how many HP per second regained while recharging (automatic regen rate)
   rechargeRatePerSec: 5,
   // timestamp when shield was last hit to track recharge start
   lastHitAt: 0,
   // timestamp of last applied recharge tick (used to compute fractional regen)
   rechargeTickAt: 0,
   // visual size multiplier (full-body)
   sizeMultiplier: 1.6,
 };

/* --- Persistence: persist SC, HighScore and compact achievement state so claimed/unlocked flags remain across reloads.
     Score is treated as the current run value and will start at 0 on load. */
function saveState() {
  try {
    // Serialize only necessary achievement flags to keep stored object compact/stable
    const achState = {};
    try {
      for (const k in achievements) {
        if (!Object.prototype.hasOwnProperty.call(achievements, k)) continue;
        const a = achievements[k];
        if (!a) continue;
        achState[k] = {
          unlocked: !!a.unlocked,
          claimed: !!a.claimed,
        };
      }
    } catch (e) {
      // if achievements are not serializable for any reason, fallback to empty
    }

    // Collect persistent upgrade / inventory state so purchases survive reloads.
    // We persist global upgrade objects and the per-ship roster ownership/upgrades as a compact map.
    const persistedShips = {};
    try {
      if (Array.isArray(shipRoster)) {
        shipRoster.forEach((s) => {
          if (!s || !s.id) return;
          persistedShips[s.id] = {
            owned: !!s.owned,
            upgrades: s.upgrades ? { ...s.upgrades } : {},
            price: s.price || 0,
            name: s.name || s.id,
          };
        });
      }
    } catch (e) {
      // ignore ship serialization errors
    }

    const st = {
      scBalance: Math.max(0, Math.floor(scBalance)),
      highScore: Math.max(0, Math.floor(highScore)),
      achievements: achState,
      // include persistent upgrade objects and inventory so purchases stick
      rocketUpgrade: (typeof rocketUpgrade !== "undefined") ? { ...rocketUpgrade } : null,
      hullUpgrade: (typeof hullUpgrade !== "undefined") ? { ...hullUpgrade } : null,
      hullUpgrade2: (typeof hullUpgrade2 !== "undefined") ? { ...hullUpgrade2 } : null,
      speedUpgrade: (typeof speedUpgrade !== "undefined") ? { ...speedUpgrade } : null,
      frontShield: (typeof frontShield !== "undefined") ? { unlocked: !!frontShield.unlocked, equipped: !!frontShield.equipped, hp: frontShield.hp } : null,
      shieldUpgrade: (typeof shieldUpgrade !== "undefined") ? { unlocked: !!shieldUpgrade.unlocked, equipped: !!shieldUpgrade.equipped, hp: shieldUpgrade.hp } : null,
      playerInventory: Array.isArray(playerInventory) ? playerInventory.slice() : [],
      // persist per-ship ownership & per-ship upgrades
      ships: persistedShips,
      // persist killCounts so encyclopedia / achievements remain meaningful
      killCounts: (typeof killCounts !== "undefined") ? { ...killCounts } : {},
      savedAt: Date.now(),
    };
    localStorage.setItem("asteroid_shooter_state_v1", JSON.stringify(st));
  } catch (e) {
    // ignore storage errors
  }
}
function loadState() {
  try {
    const raw = localStorage.getItem("asteroid_shooter_state_v1");
    if (!raw) return;
    const st = JSON.parse(raw);
    // Do NOT load a stored runtime Score here to avoid double-counting when updating versions/reloading.
    // Only restore SC, high score totals and achievement claimed/unlocked flags.
    if (typeof st.scBalance === "number") scBalance = st.scBalance;
    if (typeof st.highScore === "number") highScore = st.highScore;

    // restore compact achievement flags if present
    if (st.achievements && typeof st.achievements === "object") {
      try {
        for (const k in st.achievements) {
          if (!Object.prototype.hasOwnProperty.call(st.achievements, k)) continue;
          const saved = st.achievements[k];
          if (!saved) continue;
          if (!achievements[k]) {
            // preserve unknown/extra achievements by copying minimal shape
            achievements[k] = {
              id: k,
              name: k,
              desc: "",
              description: "",
              unlocked: !!saved.unlocked,
              claimed: !!saved.claimed,
            };
          } else {
            achievements[k].unlocked = !!saved.unlocked;
            achievements[k].claimed = !!saved.claimed;
          }
        }
      } catch (e) {
        // ignore per-achievement restore errors
      }
    }

    // Restore persisted upgrade and inventory state if present (to keep purchases)
    try {
      if (st.rocketUpgrade && typeof st.rocketUpgrade === "object") {
        rocketUpgrade = { ...rocketUpgrade, ...st.rocketUpgrade };
      }
      if (st.hullUpgrade && typeof st.hullUpgrade === "object") {
        hullUpgrade = { ...hullUpgrade, ...st.hullUpgrade };
      }
      if (st.hullUpgrade2 && typeof st.hullUpgrade2 === "object") {
        hullUpgrade2 = { ...hullUpgrade2, ...st.hullUpgrade2 };
      }
      if (st.speedUpgrade && typeof st.speedUpgrade === "object") {
        speedUpgrade = { ...speedUpgrade, ...st.speedUpgrade };
      }
      if (st.frontShield && typeof st.frontShield === "object") {
        frontShield = { ...frontShield, ...st.frontShield };
      }
      if (st.shieldUpgrade && typeof st.shieldUpgrade === "object") {
        shieldUpgrade = { ...shieldUpgrade, ...st.shieldUpgrade };
      }
      if (Array.isArray(st.playerInventory)) {
        playerInventory.length = 0;
        st.playerInventory.forEach(it => playerInventory.push(it));
      }
      if (st.killCounts && typeof st.killCounts === "object") {
        killCounts = { ...(killCounts || {}), ...st.killCounts };
      }

      // restore per-ship ownership/upgrades into shipRoster (merge carefully)
      if (st.ships && typeof st.ships === "object" && Array.isArray(shipRoster)) {
        for (const sid in st.ships) {
          try {
            const data = st.ships[sid];
            if (!data) continue;
            // find roster entry or create a synthetic one (so UI still shows owned ships)
            let entry = shipRoster.find(s => s.id === sid);
            if (!entry) {
              entry = {
                id: sid,
                name: data.name || sid,
                img: "Main Ship - Base - Full health.png",
                hp: 100,
                speed: 8,
                price: data.price || 0,
                owned: !!data.owned,
                upgrades: data.upgrades ? { ...data.upgrades } : {},
                description: data.name || sid,
              };
              shipRoster.push(entry);
            } else {
              entry.owned = !!data.owned;
              entry.upgrades = data.upgrades ? { ...data.upgrades } : (entry.upgrades || {});
            }
            // If the restored ship is currently selected, apply its runtime stats now
            if (window.currentShipId === sid) {
              try {
                if (entry.hp) player.maxHealth = entry.hp;
                if (entry.speed) player.speed = entry.speed;
                if (entry.upgrades) {
                  if (entry.upgrades.hull) player.maxHealth = Math.max(player.maxHealth || 100, (entry.hp || player.maxHealth) + (hullUpgrade ? hullUpgrade.hpBonus : 20));
                  if (entry.upgrades.speed) player.speed = (player.speed || 8) + (speedUpgrade ? speedUpgrade.speedBonus : 3);
                  if (typeof entry.upgrades.rockets === "number") rocketUpgrade.count = entry.upgrades.rockets;
                }
              } catch (e) {}
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      // ignore upgrade restore errors
      console.warn("Failed to restore upgrade/inventory state:", e);
    }
  } catch (e) {
    // ignore parse errors
  }
}

/*
  Named save system:
  - saveToNamed(name): save under a friendly name (string)
  - loadFromNamed(name): load a named save
  - listNamedSaves(): returns array of saved names
  - deleteNamedSave(name): remove a named save
  Legacy slot-based saveToSlot/loadFromSlot are preserved for compatibility but will call the named system.
*/

// core serializer used by both slot and named saves
function buildSavePayload() {
  return {
    // include an app-visible version string when available so loads can detect incompatible saves
    version: (typeof APP_VERSION !== "undefined" ? APP_VERSION : "unknown"),
    score,
    highScore,
    scBalance,
    player: {
      maxHealth: player.maxHealth,
      health: player.health,
      x: player.x,
      y: player.y,
      speed: player.speed,
    },
    clipAmmo,
    reserveAmmo,
    rocketUpgrade,
    hullUpgrade,
    speedUpgrade,
    frontShield,
    shieldUpgrade,
    playerInventory,
    achievements,
    killCounts,
    counts: {
      asteroids: asteroids.length,
      enemies: enemies.length,
    },
    savedAt: Date.now(),
  };
}

function saveToNamed(name) {
  try {
    if (!name || typeof name !== "string") return false;
    const key = "asteroid_shooter_named_" + name;
    const payload = buildSavePayload();
    // persist locally
    localStorage.setItem(key, JSON.stringify(payload));

    // attempt a best-effort cloud upload (non-blocking). Store returned URL if upload succeeds.
    (async () => {
      try {
        if (window.websim && typeof window.websim.upload === "function") {
          const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          // provide a filename derived from the save name
          const file = new File([blob], `asteroid_shooter_${name.replace(/[^a-z0-9_\-]/gi, "_")}.json`, { type: "application/json" });
          const url = await window.websim.upload(file);
          try {
            // store cloud URL alongside local save for later lookup
            const meta = {
              savedAt: Date.now(),
              cloudUrl: url,
            };
            localStorage.setItem(key + "_meta", JSON.stringify(meta));
            if (convertHint) convertHint.textContent = `Saved locally and uploaded to cloud.`;
          } catch (e) {
            // if meta save fails, ignore but still proceed
            console.warn("Saving cloud metadata failed:", e);
          }
        }
      } catch (e) {
        // cloud upload failure is non-fatal; keep local save
        console.warn("Cloud upload failed (non-fatal):", e);
      }
    })();

    // update HUD and hint
    const menuSCEl = document.getElementById("menuSC");
    if (menuSCEl) menuSCEl.textContent = scBalance;
    if (convertHint) convertHint.textContent = `Saved to "${name}".`;
    return true;
  } catch (e) {
    console.warn("Named save failed:", e);
    return false;
  }
}

function loadFromNamed(name) {
  try {
    if (!name || typeof name !== "string") return false;
    const key = "asteroid_shooter_named_" + name;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;

    // if the saved payload carries a version string and it doesn't match the running APP_VERSION,
    // avoid restoring runtime/player state from an older version to prevent incompatible loads.
    const sameVersion = (typeof APP_VERSION !== "undefined" && data.version) ? (String(data.version) === String(APP_VERSION)) : true;

    // Always restore persistent totals (safe across versions)
    if (typeof data.score === "number") score = data.score;
    if (typeof data.highScore === "number") highScore = data.highScore;
    if (typeof data.scBalance === "number") scBalance = data.scBalance;

    // Only restore detailed runtime/player state if the saved version matches the current app version.
    if (sameVersion) {
      try {
        if (data.player) {
          player.maxHealth = data.player.maxHealth || player.maxHealth;
          player.health = Math.min(player.maxHealth, data.player.health || player.maxHealth);
          player.x = typeof data.player.x === "number" ? data.player.x : player.x;
          player.y = typeof data.player.y === "number" ? data.player.y : player.y;
          player.speed = typeof data.player.speed === "number" ? data.player.speed : player.speed;
        }
      } catch (e) {}
    } else {
      // If versions differ, indicate in the console and skip restoring transient runtime fields.
      console.info("Loaded save from different version; restoring only persistent totals (SC/highScore).");
    }

    if (typeof data.clipAmmo === "number") clipAmmo = data.clipAmmo;
    if (typeof data.reserveAmmo === "number") reserveAmmo = data.reserveAmmo;
    if (data.rocketUpgrade && typeof data.rocketUpgrade === "object") rocketUpgrade = { ...rocketUpgrade, ...data.rocketUpgrade };
    if (data.hullUpgrade && typeof data.hullUpgrade === "object") hullUpgrade = { ...hullUpgrade, ...data.hullUpgrade };
    if (data.speedUpgrade && typeof data.speedUpgrade === "object") speedUpgrade = { ...speedUpgrade, ...data.speedUpgrade };
    if (data.frontShield && typeof data.frontShield === "object") frontShield = { ...frontShield, ...data.frontShield };
    if (data.shieldUpgrade && typeof data.shieldUpgrade === "object") shieldUpgrade = { ...shieldUpgrade, ...data.shieldUpgrade };
    if (Array.isArray(data.playerInventory)) {
      playerInventory.length = 0;
      data.playerInventory.forEach(it => playerInventory.push(it));
    }
    if (data.achievements && typeof data.achievements === "object") {
      for (const k in data.achievements) {
        if (Object.prototype.hasOwnProperty.call(achievements, k) && data.achievements[k]) {
          achievements[k].unlocked = !!data.achievements[k].unlocked;
          achievements[k].claimed = !!data.achievements[k].claimed;
        } else {
          achievements[k] = data.achievements[k];
        }
      }
    }
    if (data.killCounts && typeof data.killCounts === "object") {
      killCounts = { ...(killCounts || {}), ...data.killCounts };
    }

    const menuSCEl = document.getElementById("menuSC");
    const menuScoreEl = document.getElementById("menuScore");
    if (menuSCEl) menuSCEl.textContent = scBalance;
    if (menuScoreEl) menuScoreEl.textContent = score;
    updateAchievementsUI();
    if (convertHint) convertHint.textContent = `Loaded "${name}".`;
    return true;
  } catch (e) {
    console.warn("Named load failed:", e);
    if (convertHint) convertHint.textContent = "Load failed (see console).";
    return false;
  }
}

function listNamedSaves() {
  const names = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (typeof k === "string" && k.startsWith("asteroid_shooter_named_")) {
        names.push(k.replace("asteroid_shooter_named_", ""));
      }
    }
  } catch (e) {}
  // sort alphabetically for nicer listing
  return names.sort((a,b) => a.localeCompare(b));
}

function deleteNamedSave(name) {
  try {
    if (!name) return false;
    const key = "asteroid_shooter_named_" + name;
    localStorage.removeItem(key);
    if (convertHint) convertHint.textContent = `Deleted "${name}".`;
    return true;
  } catch (e) {
    console.warn("Delete named save failed:", e);
    return false;
  }
}

// Backwards-compatible slot functions that map to the named system
function saveToSlot(slot = 1) {
  try {
    slot = Math.max(1, Math.min(5, Math.floor(Number(slot) || 1)));
    return saveToNamed("slot" + slot);
  } catch (e) { return false; }
}

function loadFromSlot(slot = 1) {
  try {
    slot = Math.max(1, Math.min(5, Math.floor(Number(slot) || 1)));
    const raw = localStorage.getItem("asteroid_shooter_save_slot_" + slot);
    if (!raw) {
      if (convertHint) convertHint.textContent = `No save found in slot ${slot}.`;
      return false;
    }
    const data = JSON.parse(raw);
    // Basic validation
    if (!data || typeof data !== "object") return false;

    // restore core persisted values
    if (typeof data.score === "number") score = data.score;
    if (typeof data.highScore === "number") highScore = data.highScore;
    if (typeof data.scBalance === "number") scBalance = data.scBalance;

    // restore player minimal state (do not start a run automatically)
    try {
      if (data.player) {
        player.maxHealth = data.player.maxHealth || player.maxHealth;
        player.health = Math.min(player.maxHealth, data.player.health || player.maxHealth);
        player.x = typeof data.player.x === "number" ? data.player.x : player.x;
        player.y = typeof data.player.y === "number" ? data.player.y : player.y;
        player.speed = typeof data.player.speed === "number" ? data.player.speed : player.speed;
      }
    } catch (e) {}

    // restore ammo, rockets and upgrades
    if (typeof data.clipAmmo === "number") clipAmmo = data.clipAmmo;
    if (typeof data.reserveAmmo === "number") reserveAmmo = data.reserveAmmo;
    if (data.rocketUpgrade && typeof data.rocketUpgrade === "object") rocketUpgrade = { ...rocketUpgrade, ...data.rocketUpgrade };
    if (data.hullUpgrade && typeof data.hullUpgrade === "object") hullUpgrade = { ...hullUpgrade, ...data.hullUpgrade };
    if (data.speedUpgrade && typeof data.speedUpgrade === "object") speedUpgrade = { ...speedUpgrade, ...data.speedUpgrade };
    if (data.frontShield && typeof data.frontShield === "object") frontShield = { ...frontShield, ...data.frontShield };
    if (data.shieldUpgrade && typeof data.shieldUpgrade === "object") shieldUpgrade = { ...shieldUpgrade, ...data.shieldUpgrade };
    if (Array.isArray(data.playerInventory)) {
      playerInventory.length = 0;
      data.playerInventory.forEach(it => playerInventory.push(it));
    }
    // achievements and killCounts
    if (data.achievements && typeof data.achievements === "object") {
      for (const k in data.achievements) {
        if (Object.prototype.hasOwnProperty.call(achievements, k) && data.achievements[k]) {
          achievements[k].unlocked = !!data.achievements[k].unlocked;
          achievements[k].claimed = !!data.achievements[k].claimed;
        } else {
          // store unknown achievements as well to preserve user state
          achievements[k] = data.achievements[k];
        }
      }
    }
    if (data.killCounts && typeof data.killCounts === "object") {
      killCounts = { ...(killCounts || {}), ...data.killCounts };
    }

    // update menu HUD
    const menuSCEl = document.getElementById("menuSC");
    const menuScoreEl = document.getElementById("menuScore");
    if (menuSCEl) menuSCEl.textContent = scBalance;
    if (menuScoreEl) menuScoreEl.textContent = score;
    updateAchievementsUI();
    if (convertHint) convertHint.textContent = `Loaded slot ${slot}.`;
    return true;
  } catch (e) {
    console.warn("Load failed:", e);
    if (convertHint) convertHint.textContent = "Load failed (see console).";
    return false;
  }
}
/*
  Expose a runtime alias "points" while keeping the existing `score` variable used throughout the codebase.
  This keeps all logic intact while allowing UI and new code to refer to "points".
*/
score = 0;
// Expose global alias "points" that directly proxies the internal `score` variable.
// Remove the local `points` variable so references to `points` in the UI refer to this property.
Object.defineProperty(window, "points", {
  get() {
    return score;
  },
  set(v) {
    score = v;
  },
  configurable: true,
});
/* loadState deferred until shipRoster is defined later so per-ship ownership (shipRoster) can be merged correctly */

// Application versioning: automatically persist player progress when a new game version is detected.
// Bump APP_VERSION when you release a new version to trigger a save/merge of persistent state.
const APP_VERSION = "0.4.2.2";

try {
  const storedVerKey = "asteroid_shooter_app_version";
  const storedVer = localStorage.getItem(storedVerKey);
  // If there's no stored version or it differs from the running version, save current persistent state
  // and update the stored version so that progress is recorded at version upgrades.
  if (storedVer !== APP_VERSION) {
    try {
      // Save current persisted values (scBalance, highScore) to ensure they're recorded for the new version.
      saveState();
      localStorage.setItem(storedVerKey, APP_VERSION);
      // Optional: also update a human-readable note for debugging
      console.info(`Asteroid Shooter: migrated saved state to version ${APP_VERSION}`);
    } catch (e) {
      console.warn("Version-migration save failed:", e);
    }
  }
} catch (e) {
  console.warn("Version check failed:", e);
}

// centralized player damage handler: deduct HP, flash, handle death & cleanup
function handlePlayerDamage(damage) {
  // defensively ensure numeric damage
  const d = Number(damage) || 0;
  if (d <= 0) return;

  // apply damage and visual feedback
  player.health = Math.max(0, player.health - d);
  player.flashing = true;
  setTimeout(() => (player.flashing = false), 500);

  // if still alive, just return
  if (player.health > 0) return;

  // Player died: finalize high score, stop sounds, stop spawners and spawning loops
  if (score > highScore) {
    highScore = score;
    saveState();
  }

  // stop and clean up any playing bullet sounds
  player.bullets.forEach((b) => {
    if (b.sound) stopAndCleanSound(b.sound);
  });

  // mark game over and stop the run
  gameOver = true;
  gameStarted = false;

  if (spawnInterval) {
    clearInterval(spawnInterval);
    spawnInterval = null;
  }

  // stop spawners / timers
  stopCrateSpawner();
  stopHealSpawner();
  if (typeof stopEnemySpawner === "function") stopEnemySpawner();
  if (typeof stopFighterSpawner === "function") stopFighterSpawner();
  // also ensure the frigate spawner is stopped on game over so it can be restarted cleanly later
  if (typeof stopFrigateSpawner === "function") stopFrigateSpawner();

  // clear dynamic entities to leave a clean game-over canvas (bullets handled above)
  player.bullets = [];
  enemies = [];
  enemyBullets = [];
  asteroids = [];
  crates = [];
  heals = [];

  // ensure any reload timer is cleared
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
    reloading = false;
    reloadEndsAt = 0;
  }
}

 // Save-by-adding: merge only the net gains since the last saved state to avoid double-counting across reloads
 function saveStateAdditive() {
   try {
     const raw = localStorage.getItem("asteroid_shooter_state_v1");
     let existing = raw ? JSON.parse(raw) : {};
     // existing stored totals (defaults)
     const existingScore = typeof existing.score === "number" ? existing.score : 0;
     const existingSc = typeof existing.scBalance === "number" ? existing.scBalance : 0;
     const existingHigh = typeof existing.highScore === "number" ? existing.highScore : 0;

     // compute deltas: only persist the amount that is new since the last saved values
     // It's important to avoid adding the entire current runtime value if that already included stored totals.
     const deltaScore = Math.max(0, Math.floor(score - existingScore));
     const deltaSc = Math.max(0, Math.floor(scBalance - existingSc));

     const st = {
       // add only the new amounts to the stored totals
       score: existingScore + deltaScore,
       scBalance: existingSc + deltaSc,
       // high score should be the max between stored high and current high
       highScore: Math.max(existingHigh, Math.max(0, Math.floor(highScore))),
     };
     localStorage.setItem("asteroid_shooter_state_v1", JSON.stringify(st));
   } catch (e) {
     // ignore storage errors
   }
 }

 // --- Controls ---
 let keys = {};
 // Only track relevant control keys to avoid "stuck" movement when unrelated keys or modifiers are pressed.
 const trackedKeys = new Set([
   "w","a","s","d","W","A","S","D",
   "ArrowUp","ArrowDown","ArrowLeft","ArrowRight",
   "q","e","Q","E"
 ]);

 document.addEventListener("keydown", (e) => {
   try {
     if (trackedKeys.has(e.key)) keys[e.key] = true;
   } catch (err) {}
 });

// Clear movement keys when Tab is pressed to avoid getting stuck if focus/active element changes
document.addEventListener("keydown", (e) => {
  try {
    if (e.key === "Tab") {
      // prevent default so the app doesn't unexpectedly change focus in the iframe environment
      e.preventDefault();
      keys = {};
    }
  } catch (err) {}
});

// Clear movement keys if the page becomes hidden (e.g., switching tabs or losing visibility)
document.addEventListener("visibilitychange", () => {
  try {
    if (document.hidden) keys = {};
  } catch (err) {}
});

 document.addEventListener("keyup", (e) => {
   try {
     if (trackedKeys.has(e.key)) keys[e.key] = false;
   } catch (err) {}
 });

 // Clear all keys when the window loses focus to prevent stuck inputs
 window.addEventListener("blur", () => {
   keys = {};
 });

 // Prevent "stuck" movement when clicking UI controls: clear movement/rotation keys
 // if the user clicks any interactive UI element (button, input, select, textarea, or elements with role="button").
 // This handles cases where a mouse/touch interaction steals focus and keyup isn't fired.
 document.addEventListener("pointerdown", (e) => {
   try {
     const el = (e && e.target && e.target.nodeType === 1) ? /** @type {HTMLElement} */ (e.target) : null;
     if (!el) return;
     // If the pointerdown originated on the canvas itself, do not clear keys (so gameplay clicks remain unaffected)
     if (el.id === "gameCanvas" || el.closest && el.closest("#gameCanvas")) return;

     // Interactive elements that should clear movement to avoid stuck inputs
     const interactiveSelector = "button, input, select, textarea, [role='button'], .btn, .modal, .modal-card";
     if (el.closest && el.closest(interactiveSelector)) {
       // Only clear movement-related tracked keys, keep unrelated keys untouched
       const toClear = ["w","a","s","d","W","A","S","D","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","q","e","Q","E"];
       toClear.forEach(k => { if (keys[k]) keys[k] = false; });
     }
   } catch (err) {
     // ignore errors to avoid breaking game loop
   }
 });

/* --- Audio setup using Web Audio for instant-shot playback --- */
const baseShootSrc = "freesound_community-space-laser-38082 (1).mp3";
const baseVolume = 0.25;

// create AudioContext and preload buffer
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let shotBuffer = null;
let audioReady = false;

async function loadShotBuffer() {
  try {
    const resp = await fetch(baseShootSrc);
    if (!resp.ok) throw new Error("Shot audio not found");
    const ab = await resp.arrayBuffer();
    shotBuffer = await audioCtx.decodeAudioData(ab);
    audioReady = true;
  } catch (e) {
    // don't create any audio fallback that could produce unexpected sounds
    console.warn("Failed to load shot sound, shot SFX will be silent:", e);
    shotBuffer = null;
    audioReady = false;
  }
}
// attempt to load the shot buffer but don't create any fallback audio proactively
loadShotBuffer();

 // Menu music: play a small playlist sequentially (new track then old track) instead of looping a single audio.
 // playlist order: newly added track first, then the older menu track; tracks advance automatically on end.
 const menuPlaylist = [
   "emmraan-a-victims-254113.mp3",
   "the_mountain-sci-fi-512284.mp3"
 ];
 let menuIndex = 0;
 // single Audio element used for the menu playlist
 let menuAudio = new Audio();
 menuAudio.preload = "auto";
 // allow autoplay by default so music starts when menu is shown (subject to browser autoplay policies)
 menuAudio.autoplay = true;
 // do not loop - we handle sequence advancement in 'onended'
 menuAudio.loop = false;

 // Gameplay music: in-play playlist that alternates between two tracks (kaazoom + psychronic)
 // playlist advances automatically when a track ends; tracks do not self-loop so the other plays next.
 const gameplayPlaylist = [
   "kaazoom-crazy-bad-full-version-electronic-414774.mp3",
   "psychronic-cosmic-starfighter-314414.mp3"
 ];
 let gameplayIndex = 0;
 // single HTMLAudio element reused for gameplay playlist
 const gameplayAudio = new Audio();
 gameplayAudio.preload = "auto";
 // allow autoplay by default so gameplay music will try to start when a run begins (subject to browser autoplay policies)
 gameplayAudio.autoplay = true;
 gameplayAudio.loop = false; // we handle sequencing manually

 // clamp volume between 0..1; apply same saved volume to both menu and gameplay music
 function setMenuMusicVolume(v) {
   const vol = Math.max(0, Math.min(1, Number(v) || 0));
   try {
     menuAudio.volume = vol;
   } catch (e) {}
   try {
     // keep gameplay music quieter so SFX (bullets) remain clearly audible
     // apply to gameplayAudio instead of old gameplayMusic
     gameplayAudio.volume = Math.max(0, Math.min(1, vol * 0.45));
   } catch (e) {}
   try {
     localStorage.setItem("asteroid_shooter_music_vol_v1", String(Math.round(vol * 100)));
   } catch (e) {}
 }
 // load saved volume if available
 try {
   const rawVol = localStorage.getItem("asteroid_shooter_music_vol_v1");
   if (rawVol !== null) {
     const parsed = Number(rawVol);
     if (!Number.isNaN(parsed)) {
       setMenuMusicVolume(parsed / 100);
     } else {
       setMenuMusicVolume(0.4);
     }
   } else {
     setMenuMusicVolume(0.4);
   }
 } catch (e) {
   setMenuMusicVolume(0.4);
 }

 // helper to advance and play the next menu track in the playlist
 function playNextMenuTrack() {
   try {
     // pick current track by index (wrap)
     menuIndex = menuIndex % menuPlaylist.length;
     menuAudio.src = menuPlaylist[menuIndex];
     // when track ends, advance index and play next (if menu still visible)
     menuAudio.onended = () => {
       // advance to next track
       menuIndex = (menuIndex + 1) % menuPlaylist.length;
       // attempt to play next track; ignore errors (autoplay restrictions)
       try {
         menuAudio.src = menuPlaylist[menuIndex];
         // call play but it may be blocked until user gesture
         menuAudio.play().catch(() => {});
       } catch (e) {}
     };
     // start playing (may be blocked until user gesture)
     menuAudio.play().catch(() => {});
   } catch (e) {
     // ignore playback errors
   }
 }

 // helper to attempt playing menu music (may be blocked until user gesture)
 async function tryPlayMenuMusic() {
   try {
     // If the audio already has a src loaded and is paused, resume it; otherwise start the playlist at current index.
     if (!menuAudio.src) {
       playNextMenuTrack();
       return;
     }
     await menuAudio.play();
   } catch (e) {
     // ignore
   }
 }
 // pause and reset the playlist audio (stop playback and rewind to start of current track)
 async function tryPauseMenuMusic() {
   try {
     menuAudio.pause();
     try { menuAudio.currentTime = 0; } catch (e) {}
   } catch (e) {}
 }

 // helper to advance and play the next gameplay track in the gameplay playlist
 function playNextGameplayTrack() {
   try {
     gameplayIndex = gameplayIndex % gameplayPlaylist.length;
     gameplayAudio.src = gameplayPlaylist[gameplayIndex];
     // when the current gameplay track ends, advance to the next one and play it (if a run is still active)
     gameplayAudio.onended = () => {
       gameplayIndex = (gameplayIndex + 1) % gameplayPlaylist.length;
       // attempt to play next track; may be blocked until user gesture
       try {
         // only continue sequencing if the game is active (menu hidden)
         if (gameStarted && !gameOver) {
           gameplayAudio.src = gameplayPlaylist[gameplayIndex];
           gameplayAudio.play().catch(() => {});
         }
       } catch (e) {}
     };
     gameplayAudio.play().catch(() => {});
   } catch (e) {
     // ignore playback errors
   }
 }

 // helper to attempt playing gameplay music (may be blocked until user gesture)
 async function tryPlayGameplayMusic() {
   try {
     // if no src loaded, start at current gameplayIndex
     if (!gameplayAudio.src) {
       playNextGameplayTrack();
       return;
     }
     await gameplayAudio.play();
   } catch (e) {
     // ignore
   }
 }
 // pause and reset the gameplay audio (stop playback and rewind to start)
 async function tryPauseGameplayMusic() {
   try {
     gameplayAudio.pause();
     try { gameplayAudio.currentTime = 0; } catch (e) {}
   } catch (e) {}
 }

// helper to play a shot instantly using a BufferSource
let sfxEnabled = true; // global SFX toggle (default ON)

function createAndPlayShot() {
  // if sfx disabled, return a dummy object so callers can stop/clean safely
  if (!sfxEnabled) return { stop: () => {} };

  // resume context if suspended (required by some browsers on first interaction)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  // If we have a decoded buffer, play it via AudioBufferSourceNode for low latency
  if (shotBuffer) {
    const source = audioCtx.createBufferSource();
    source.buffer = shotBuffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = baseVolume;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    try {
      source.start(0);
    } catch (e) {
      // ignore if start fails
    }
    // return an object that can be stopped/cleaned similarly to previous code
    return {
      source,
      gainNode,
      stop: function () {
        try {
          if (this.source) this.source.stop(0);
        } catch (e) {}
      },
    };
  }

  // Fallback: if buffer not yet loaded, use an HTMLAudio element so shots still audible
  try {
    const audioEl = new Audio(baseShootSrc);
    audioEl.volume = Math.max(0, Math.min(1, baseVolume));
    audioEl.preload = "auto";
    // play may be blocked until user gesture; ignore play() rejection
    audioEl.play().catch(() => {});
    return {
      audioEl,
      stop: function () {
        try {
          if (this.audioEl) {
            this.audioEl.pause();
            try { this.audioEl.currentTime = 0; } catch (e) {}
            // remove src to help GC in some browsers
            try { this.audioEl.src = ""; } catch (e) {}
          }
        } catch (e) {}
      },
    };
  } catch (e) {
    // final fallback: silent stub
    return { stop: () => {} };
  }
}

function stopAndCleanSound(s) {
  if (!s) return;
  try {
    if (s.stop) s.stop();
    // disconnect nodes if present
    try {
      if (s.source) s.source.disconnect();
      if (s.gainNode) s.gainNode.disconnect();
    } catch (e) {}
  } catch (e) {}
}

// --- Shooting ---
function tryShoot() {
  if (gameOver || !gameStarted) return;
  if (reloading) return;
  // if no bullets in clip, start reload
  if (clipAmmo <= 0) {
    startReload();
    return;
  }

  clipAmmo--;

  // create sound and attach to bullet immediately, so audio is synced to the spawn
  const s = createAndPlayShot();

  // shoot direction based on player.angle (0 = up). bullets inherit ship rotation
  const speed = 6;
  const angle = player.angle - Math.PI / 2; // player.angle defined so 0 faces up; adjust to canvas coordinates
  const dx = Math.cos(angle) * speed;
  const dy = Math.sin(angle) * speed;

  player.bullets.push({
    x: player.x + player.width / 2,
    y: player.y + player.height / 2,
    vx: dx,
    vy: dy,
    sound: s,
  });

  // if clip now empty, auto-reload
  if (clipAmmo <= 0) startReload();
}



document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    tryShoot();
  }
  // Fire rocket with F
  if (e.code === "KeyF") {
    useRocket();
  }
  // manual reload with R (desktop): always attempt a top-up reload when possible
  if (e.code === "KeyR") {
    // force a manual reload (top-up) even if clipAmmo > 0, as long as we have reserve ammo and not currently reloading
    if (!reloading) {
      startReload(true);
    }
  }
});

 // --- Spawn Asteroids ---
function spawnAsteroid() {
  if (!gameOver && gameStarted) {
    const radius = 20 + Math.random() * 20;
    const isBig = radius > 32; // threshold for "big"

    // give each asteroid a small horizontal velocity so collisions can redirect them
    // base downward speed preserved but now represented as vy; vx is horizontal
    let baseVy;
    if (isBig) {
      // increase big asteroids speed by 20%
      baseVy = (1.5 + Math.random() * 2.0) * 1.20; // ~1.8 - 4.2
    } else {
      // make small asteroids moderately fast but not extreme; reduce prior aggressive multiplier
      // base range ~2..6, scaled by a mild global factor so gameplay feels fair
      baseVy = (1.8 + Math.random() * 3.2) * 1.10; // ~1.98 - 5.5
      // occasional slightly faster smalls for variety (rare)
      if (Math.random() < 0.06) baseVy += (0.8 + Math.random() * 1.6) * 1.10;
    }

    // small horizontal drift, can be left or right (slightly scaled so fast smalls still drift)
    const vx = (Math.random() - 0.5) * 1.6; // -0.8 .. 0.8
    const vy = baseVy;

    // defensive fallbacks: asteroidColors or generateAsteroidShape may not be defined yet
    const colors = (typeof asteroidColors !== "undefined" && Array.isArray(asteroidColors))
      ? asteroidColors
      : ["#6e6e6e", "#7a5f49", "#4d4d4d", "#8b7d7b"];

    const shape = (typeof generateAsteroidShape === "function")
      ? generateAsteroidShape()
      : (function () {
          // lightweight fallback shape generator (8-point roughly circular)
          let points = 8;
          let s = [];
          for (let i = 0; i < points; i++) {
            let angle = (i / points) * Math.PI * 2;
            let radiusFactor = 0.85 + (Math.random() - 0.5) * 0.3;
            s.push({ angle, radiusFactor });
          }
          return s;
        })();

    asteroids.push({
      x: Math.random() * (canvas.width - 40),
      y: -40,
      radius: radius,
      vx: vx,
      vy: vy,
      health: isBig ? 3 : 1,
      // updated scoring: small = 20 pts, big = 60 pts
      points: isBig ? 60 : 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shape,
    });
  }
}

  // --- Ammo crates (appear occasionally) ---
 let crates = [];

 // crate image (use provided ammo asset)
 const crateImage = new Image();
 crateImage.src = "ammo-pistol 32px.png";
 crateImage.crossOrigin = "anonymous";

 // --- First-aid / Heal pickups (appear occasionally) ---
 // will use the provided health-green asset
 let heals = [];
 const healImage = new Image();
 healImage.src = "health-green 32px.png";
 healImage.crossOrigin = "anonymous";

 function spawnCrate() {
   if (!gameOver && gameStarted) {
     crates.push({
       // account for larger sprite so it spawns fully onscreen horizontally
       x: Math.random() * (canvas.width - 60) + 30,
       y: -40,
       // larger radius to match 60x60 sprite (radius = 30)
       radius: 30,
       vy: 2.2 + Math.random() * 1.6, // moderate fall speed
       vx: (Math.random() - 0.5) * 0.8,
       // gives 30 reserve ammo
       give: 30,
       color: "#67ff9a",
       img: crateImage,
     });
   }
 }

 // helper to spawn crates roughly once every 10-20 seconds (randomized)
 let crateSpawnTimer = null;
 function startCrateSpawner() {
   // clear any existing timer
   if (crateSpawnTimer) clearTimeout(crateSpawnTimer);

   // recursive scheduler with 10-20s random delay
   function scheduleNext() {
     const delay = 10000 + Math.random() * 10000; // 10000..20000 ms
     crateSpawnTimer = setTimeout(() => {
       if (!gameOver && gameStarted) {
         spawnCrate();
       }
       // schedule again only if game still running
       if (!gameOver && gameStarted) scheduleNext();
     }, delay);
   }

   scheduleNext();
 }
 function stopCrateSpawner() {
   if (crateSpawnTimer) {
     clearTimeout(crateSpawnTimer);
     crateSpawnTimer = null;
   }
 }

 // --- Heal spawner (spawns two first-aid pickups per cycle every 15..100s) ---
 let healSpawnTimer = null;
 function spawnHeal() {
   if (!gameOver && gameStarted) {
     heals.push({
       x: Math.random() * (canvas.width - 60) + 30,
       y: -30,
       radius: 18,
       vy: 1.8 + Math.random() * 1.8,
       vx: (Math.random() - 0.5) * 0.8,
       give: 10,
       img: healImage,
     });
   }
 }
 function startHealSpawner() {
   if (healSpawnTimer) clearTimeout(healSpawnTimer);

   function scheduleNext() {
     const delay = 15000 + Math.random() * 85000; // 15000..100000 ms
     healSpawnTimer = setTimeout(() => {
       if (!gameOver && gameStarted) {
         // spawn twice per cycle (two pickups)
         spawnHeal();
         spawnHeal();
       }
       if (!gameOver && gameStarted) scheduleNext();
     }, delay);
   }

   scheduleNext();
 }
 function stopHealSpawner() {
   if (healSpawnTimer) {
     clearTimeout(healSpawnTimer);
     healSpawnTimer = null;
   }
 }

 // --- Reset Helpers ---
 function resetAsteroids() {
   asteroids = [];
   crates = [];
   heals = [];
 }
 function resetInput() {
   keys = {};
 }

// --- Start / Restart Game ---
// show a brief welcome toast when a run begins
function showWelcomePopup() {
  try {
    // avoid duplicates
    if (document.getElementById("welcome-toast")) return;
    const toast = document.createElement("div");
    toast.id = "welcome-toast";
    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.top = "12%";
    toast.style.transform = "translateX(-50%)";
    toast.style.zIndex = "2200";
    toast.style.padding = "12px 18px";
    toast.style.borderRadius = "10px";
    toast.style.background = "linear-gradient(180deg,#fffef8, #f2edda)";
    toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.45)";
    toast.style.color = "#2b2b2b";
    toast.style.fontWeight = "700";
    toast.style.fontSize = "16px";
    toast.innerText = "Welcome aboard — have fun flying and learning the ropes!";
    document.body.appendChild(toast);
    // auto-hide after 3s
    setTimeout(() => {
      try {
        toast.style.transition = "opacity 300ms ease, transform 300ms ease";
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-8px)";
        setTimeout(() => { try { toast.remove(); } catch (e) {} }, 320);
      } catch (e) {}
    }, 3000);
  } catch (e) {
    console.warn("Welcome popup failed:", e);
  }
}

function startGame() {
  // hide menu
  const menu = document.getElementById("menu");
  if (menu) menu.style.display = "none";

  // reset state and begin spawning asteroids and crates
  restartGame();
  gameStarted = true;
  // show a brief welcome toast when a player starts a run
  // (moved to run once on initial page load before entering the main menu)
  if (spawnInterval) clearInterval(spawnInterval);
  spawnInterval = setInterval(spawnAsteroid, 900);
  startCrateSpawner();
  startHealSpawner();

  // Ensure audio context is resumed and gameplay music starts immediately when a run begins.
  // Some browsers require an explicit resume on user gesture; try to resume and then play gameplay music.
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  tryPauseMenuMusic();
  tryPlayGameplayMusic();
}

function restartGame() {
  // stop any playing bullet sounds immediately and clean up
  player.bullets.forEach((b) => {
    if (b.sound) stopAndCleanSound(b.sound);
  });

  // NOTE: Do NOT reset `score` here — keep persistent Score/SC across runs so saved values are additive.
  player.health = player.maxHealth;
  player.x = canvas.width / 2;
  player.y = canvas.height - 96;
  player.bullets = [];
  resetAsteroids();
  resetInput();
  gameOver = false;

  // Ensure base speed is consistent on restart
  player.speed = 8;

  // If a permanent Engine Tuning upgrade is unlocked, apply its speed bonus immediately
  if (typeof speedUpgrade !== "undefined" && speedUpgrade && speedUpgrade.unlocked && typeof speedUpgrade.speedBonus === "number") {
    player.speed = (player.speed || 7) + (speedUpgrade.speedBonus || 0);
  }

  // Recompute maxHealth from the currently selected ship and apply any purchased hull upgrades.
  try {
    const viewed = getShipById(window.currentShipId || "basic");
    // base HP comes from the viewed ship definition when available
    const baseHp = (viewed && typeof viewed.hp === "number") ? viewed.hp : (player.maxHealth || 100);
    let totalBonus = 0;
    // apply primary hull upgrade bonus if purchased/unlocked
    if (hullUpgrade && hullUpgrade.unlocked && (hullUpgrade.purchased || (viewed && viewed.upgrades && viewed.upgrades.hull))) {
      totalBonus += hullUpgrade.hpBonus || 20;
    }
    // apply hull reinforcement 2 bonus if present on the ship
    if (hullUpgrade2 && ((hullUpgrade2.purchased) || (viewed && viewed.upgrades && viewed.upgrades.hull2))) {
      totalBonus += hullUpgrade2.hpBonus || 40;
    }
    player.maxHealth = Math.max(1, baseHp + totalBonus);
    // ensure current health is not above new max; preserve current percentage when possible
    player.health = Math.min(player.maxHealth, player.health || player.maxHealth);
  } catch (e) {
    // fallback: leave player.maxHealth unchanged on error
    console.warn("Failed to apply hull upgrades on restart:", e);
  }

  // If the front shield is owned & equipped, only activate it on restart if it still has HP.
  // Do not auto-equip ownership here — only respect the equipped flag.
  if (frontShield && frontShield.unlocked && frontShield.equipped) {
    // Only activate the shield if it has remaining HP; a depleted shield remains inactive so it
    // doesn't get "refilled" implicitly by restarting the run.
    frontShield.active = !!(frontShield.hp > 0);
    // ensure recharge timers are sane so it doesn't immediately try to regen mid-run
    frontShield.rechargeTickAt = performance.now();
    // keep lastHitAt as-is to preserve recharge timing semantics (do not force-reset to 0)
  } else if (frontShield) {
    frontShield.active = false;
  }

  // reset clip/reserve/reload
  clipAmmo = clipSize;
  reserveAmmo = 30;
  reloading = false;
  reloadEndsAt = 0;
  // clear any lingering reload timeout from a previous run
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  // ensure heal spawner state is clean when restarting
  stopHealSpawner();
}

// --- Asteroid Drawing Helpers ---
const asteroidColors = ["#6e6e6e", "#7a5f49", "#4d4d4d", "#8b7d7b"];

function generateAsteroidShape() {
  let points = 8 + Math.floor(Math.random() * 4);
  let shape = [];
  for (let i = 0; i < points; i++) {
    let angle = (i / points) * Math.PI * 2;
    let radiusFactor = 0.7 + Math.random() * 0.3;
    shape.push({ angle, radiusFactor });
  }
  return shape;
}

function drawAsteroid(a) {
  ctx.fillStyle = a.color;
  ctx.beginPath();
  a.shape.forEach((p, i) => {
    let x = a.x + Math.cos(p.angle) * a.radius * p.radiusFactor;
    let y = a.y + Math.sin(p.angle) * a.radius * p.radiusFactor;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

// --- Update Loop ---
function update() {
  try {
    // defensive guards: ensure core objects exist before proceeding to avoid "Cannot read properties of undefined"
    if (typeof canvas === "undefined" || !canvas || !ctx) return;
    if (!player || typeof player !== "object") return;
    if (!Array.isArray(asteroids)) asteroids = [];
    if (!Array.isArray(enemies)) enemies = [];
    if (!Array.isArray(player.bullets)) player.bullets = [];
    if (!Array.isArray(enemyBullets)) enemyBullets = [];
    if (!Array.isArray(crates)) crates = [];
    if (!Array.isArray(heals)) heals = [];

    if (gameOver || !gameStarted || (typeof gamePaused !== "undefined" && gamePaused)) return;
  } catch (err) {
    // fail-safe: log and skip this update tick
    console.error("Update guard error:", err);
    return;
  }

  // Wrap the main runtime update logic in a try/catch to prevent uncaught errors from stopping the game loop.
  try {
    // Movement (WASD / arrows) — unchanged behavior
    if (keys["w"] || keys["W"] || keys["ArrowUp"]) player.y -= player.speed;
    if (keys["s"] || keys["S"] || keys["ArrowDown"]) player.y += player.speed;
    if (keys["a"] || keys["A"] || keys["ArrowLeft"]) player.x -= player.speed;
    if (keys["d"] || keys["D"] || keys["ArrowRight"]) player.x += player.speed;

    // Rotation: Q = rotate left (counter-clockwise), E = rotate right (clockwise)
    if (keys["q"] || keys["Q"]) {
      player.angle -= player.rotationSpeed;
    }
    if (keys["e"] || keys["E"]) {
      player.angle += player.rotationSpeed;
    }
    // keep angle within -PI..PI for numerical stability
    if (player.angle > Math.PI) player.angle -= Math.PI * 2;
    if (player.angle < -Math.PI) player.angle += Math.PI * 2;

    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));

    // Bullets
    for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
      let b = player.bullets[bi];
      // support both current vx/vy and legacy dx/dy properties
      const vx = (typeof b.vx !== "undefined") ? b.vx : (typeof b.dx !== "undefined" ? b.dx : 0);
      const vy = (typeof b.vy !== "undefined") ? b.vy : (typeof b.dy !== "undefined" ? b.dy : 0);

      b.x += vx;
      b.y += vy;

      // remove off-screen bullets (allow small margin)
      if (b.y < -40 || b.x < -40 || b.x > canvas.width + 40 || b.y > canvas.height + 40) {
        if (b.sound) {
          stopAndCleanSound(b.sound);
        }
        player.bullets.splice(bi, 1);
        continue;
      }

      for (let ai = asteroids.length - 1; ai >= 0; ai--) {
        let a = asteroids[ai];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < a.radius) {
          // stop and clean up bullet sound if present.
          if (b.sound) {
            stopAndCleanSound(b.sound);
          }
          player.bullets.splice(bi, 1);
          a.health--;
          if (a.health <= 0) {
            asteroids.splice(ai, 1);
            score += a.points || 10;
            // record asteroid kill for achievements
            try { asteroidsDestroyed = (asteroidsDestroyed || 0) + 1; } catch (e) {}
            saveState();
          }
          break;
        }
      }
    }

    // player rockets movement & collision handling
    if (playerRockets && playerRockets.length) {
      for (let ri = playerRockets.length - 1; ri >= 0; ri--) {
        const r = playerRockets[ri];
        r.x += r.vx;
        r.y += r.vy;
        // remove off-screen rockets
        if (r.x < -40 || r.x > canvas.width + 40 || r.y < -40 || r.y > canvas.height + 40) {
          playerRockets.splice(ri, 1);
          continue;
        }

        // rocket vs asteroid collision (rockets instantly destroy asteroids)
        if (asteroids && asteroids.length) {
          for (let ai = asteroids.length - 1; ai >= 0; ai--) {
            const a = asteroids[ai];
            const dxA = r.x - a.x;
            const dyA = r.y - a.y;
            if (dxA * dxA + dyA * dyA < (r.radius + a.radius) * (r.radius + a.radius)) {
              // rockets one-shot asteroids: force destruction
              a.health = 0;
              // award points and remove asteroid
              if (a.health <= 0) {
                score += a.points || 10;
                saveState();
                asteroids.splice(ai, 1);
              }
              // remove the rocket on impact
              playerRockets.splice(ri, 1);
              break;
            }
          }
          if (!playerRockets[ri]) continue; // rocket already removed by asteroid hit
        }

        // rocket vs enemy collision
        for (let ei = enemies.length - 1; ei >= 0; ei--) {
          const en = enemies[ei];
          const dx = r.x - en.x;
          const dy = r.y - en.y;
          if (dx * dx + dy * dy < (r.radius + (en.radius || 20)) * (r.radius + (en.radius || 20))) {
            // Rockets now hit shields first (if the enemy has a shield with HP > 0).
            const rocketDmgHull = (rocketUpgrade && typeof rocketUpgrade.damageHull === "number") ? rocketUpgrade.damageHull : 35;
            const rocketDmgShield = (rocketUpgrade && typeof rocketUpgrade.damageShield === "number") ? rocketUpgrade.damageShield : 25;
            let consumedByShield = false;

            // Frigate has a dedicated shield object; other enemy types might also have `shield`
            if (en.type === "frigate" && en.shield && typeof en.shield.hp === "number" && en.shield.hp > 0) {
              en.shield.hp = Math.max(0, en.shield.hp - rocketDmgShield);
              en.shield.lastHitAt = performance.now();
              if (en.shield.hp <= 0) en.shield.active = false;
              consumedByShield = true;
            } else if (en.shield && typeof en.shield.hp === "number" && en.shield.hp > 0) {
              // generic shield handling for potential future enemy shields
              en.shield.hp = Math.max(0, en.shield.hp - rocketDmgShield);
              if (en.shield.hp <= 0 && typeof en.shield.active !== "undefined") en.shield.active = false;
              consumedByShield = true;
            }

            if (!consumedByShield) {
              // apply rocket hull damage when no shield absorbed it
              en.health = (typeof en.health === "undefined") ? 0 : en.health - rocketDmgHull;
            }

            // award and cleanup if enemy died
            if (en.health <= 0) {
              const award = en.type === "fighter" ? 100 : (en.type === "frigate" ? 300 : 50);
              score += award;
              try { if (typeof en.type === "string") killCounts[en.type] = (killCounts[en.type] || 0) + 1; } catch (e) {}
              saveState();
              enemies.splice(ei, 1);
            }

            // remove the rocket on impact in all cases
            playerRockets.splice(ri, 1);
            break;
          }
        }
      }
    }

    // Crates: bullets pass through crates (player must ram), so only update crate positions here
    for (let ci = crates.length - 1; ci >= 0; ci--) {
      let c = crates[ci];
      c.x += c.vx;
      c.y += c.vy;
      // keep crates inside horizontal bounds by reflecting vx
      if (c.x - c.radius < 0) {
        c.x = c.radius;
        c.vx = Math.abs(c.vx);
      } else if (c.x + c.radius > canvas.width) {
        c.x = canvas.width - c.radius;
        c.vx = -Math.abs(c.vx);
      }
      // remove off-screen crates
      if (c.y - c.radius > canvas.height + 40) {
        crates.splice(ci, 1);
      }
    }

    // Heals: similar motion to crates (player rams to pick up)
    for (let hi = heals.length - 1; hi >= 0; hi--) {
      let h = heals[hi];
      h.x += h.vx;
      h.y += h.vy;
      if (h.x - h.radius < 0) {
        h.x = h.radius;
        h.vx = Math.abs(h.vx);
      } else if (h.x + h.radius > canvas.width) {
        h.x = canvas.width - h.radius;
        h.vx = -Math.abs(h.vx);
      }
      // remove off-screen heals
      if (h.y - h.radius > canvas.height + 40) {
        heals.splice(hi, 1);
      }
    }

    // --- Enemy updates ---
    // start enemy spawner once score threshold reached and only during an active run
    if (!enemySpawnerStarted && gameStarted && score >= enemySpawnScoreThreshold) {
      startEnemySpawner();
    }
    // start fighter spawner once score threshold reached and only during an active run
    if (!fighterSpawnerStarted && gameStarted && score >= fighterSpawnScoreThreshold) {
      startFighterSpawner();
    }
    // start frigate spawner (heavy enemy) at higher threshold
    if (!frigateSpawnerStarted && gameStarted && score >= frigateSpawnScoreThreshold) {
      startFrigateSpawner();
    }
    // start healer/support spawner once score threshold reached and only during an active run
    if (!healerSpawnerStarted && gameStarted && score >= healerSpawnScoreThreshold) {
      startHealerSpawner();
    }

    // update enemies (movement, shooting)
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const en = enemies[ei];

      // entering animation: descend until fully onscreen, then become active
      if (en.state === "entering") {
        en.y += en.vy;
        en.x += en.vx;
        // slow down horizontal while entering
        en.vx *= 0.98;
        if (en.y > 60) {
          en.state = "active";
          // once active, give small base speed; we'll steer toward player each frame
          en.vy = 0.8 + Math.random() * 0.8;
          en.vx = (Math.random() - 0.5) * 0.8;
          en.lastShotAt = performance.now() + (Math.random() * 400);
        }
      } else {
        // ACTIVE: steer toward player position (pursuit behavior) with simple asteroid avoidance
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const dx = px - en.x;
        const dy = py - en.y;
        const dist = Math.hypot(dx, dy) || 1;

        // desired velocity toward player
        const desiredSpeed = 1.6 + Math.min(1.6, dist / 200); // range ~1.6..3.2 depending on distance
        let desiredVx = (dx / dist) * desiredSpeed;
        let desiredVy = (dy / dist) * desiredSpeed;

        // give fighters a lateral "zig" so they don't all follow the exact same line to the player
        if (en.type === "fighter") {
          try {
            const nowSec = performance.now() / 1000;
            // perpendicular vector (normalized)
            const perpX = -dy / dist;
            const perpY = dx / dist;
            // add a sinusoidal lateral component scaled by fighter-specific amplitude/frequency
            const lateral = Math.sin(nowSec * (en.zigFreq || 1.8) + (en.pathSeed || 0)) * (en.zigAmplitude || 1.0);
            // scale lateral relative to desiredSpeed so it affects path, not pure speed
            desiredVx += perpX * lateral;
            desiredVy += perpY * lateral;
          } catch (e) {
            // ignore any numerical edge cases for robust runtime
          }
        }

        // Obstacle avoidance: apply a repulsion vector from nearby asteroids so enemies steer around them.
        // This is a lightweight "avoidance" rather than full A* pathfinding.
        const avoidRadius = 120; // how far enemies "sense" asteroids
        let avoidVx = 0;
        let avoidVy = 0;
        if (asteroids && asteroids.length) {
          for (let ai = 0; ai < asteroids.length; ai++) {
            const a = asteroids[ai];
            const adx = en.x - a.x;
            const ady = en.y - a.y;
            const adist = Math.hypot(adx, ady) || 0.0001;
            if (adist < avoidRadius && adist > 0) {
              // stronger push when closer; scale by inverse distance
              const strength = (avoidRadius - adist) / avoidRadius;
              avoidVx += (adx / adist) * strength * 2.4; // multiplier tunes avoidance force
              avoidVy += (ady / adist) * strength * 2.4;
            }
          }
        }

        // Combine desired pursuit vector and avoidance vector (avoidance offsets the desired direction)
        desiredVx += avoidVx;
        desiredVy += avoidVy;

        // normalize desired to the intended desiredSpeed magnitude (avoid excessive speed from avoidance)
        const desiredMag = Math.hypot(desiredVx, desiredVy) || 1;
        desiredVx = (desiredVx / desiredMag) * desiredSpeed;
        desiredVy = (desiredVy / desiredMag) * desiredSpeed;

        // smooth steering: interpolate current velocity toward desired velocity
        const steerFactor = 0.08; // lower = smoother/laggier; higher = more responsive
        en.vx += (desiredVx - en.vx) * steerFactor;
        en.vy += (desiredVy - en.vy) * steerFactor;

        // clamp max velocities to avoid runaway speeds
        const maxSpeed = 3.6;
        const spd = Math.hypot(en.vx, en.vy);
        if (spd > maxSpeed) {
          en.vx = (en.vx / spd) * maxSpeed;
          en.vy = (en.vy / spd) * maxSpeed;
        }

        // apply movement
        en.x += en.vx;
        en.y += en.vy;

        // keep enemies inside horizontal bounds by reflecting gently
        if (en.x - en.radius < 0) {
          en.x = en.radius;
          en.vx = Math.abs(en.vx) * 0.6;
        } else if (en.x + en.radius > canvas.width) {
          en.x = canvas.width - en.radius;
          en.vx = -Math.abs(en.vx) * 0.6;
        }

        // small random jitter so movement isn't perfectly deterministic
        if (Math.random() < 0.008) {
          en.vx += (Math.random() - 0.5) * 0.6;
          en.vy += (Math.random() - 0.5) * 0.6;
        }

        // shooting logic (time-based) - aim at player's current center
        const now = performance.now();
        // FRIGATE: special firing patterns (rockets + ray) and shield handling
        if (en.type === "frigate") {
          // rockets: fire small rocket projectiles toward player occasionally
          // removed rocket firing: frigate now uses only the ray/beam attack

          // ray: instant-hit beam, now fired more often based on en.rayInterval (configured in spawnFrigate)
          if (now - (en.lastRayAt || 0) > (en.rayInterval || 6000)) {
            en.lastRayAt = now;
            // record a short-lived draw marker so the beam can be rendered for a fraction of a second
            en.lastRayDraw = { sx: en.x, sy: en.y + 6, tx: px, ty: py, at: now };

            // instant-hit: apply beam damage to the player (use shield-aware handler and pass player coordinates).
            // Use configured beamDamage (fallback 30).
            const beamDmg = (typeof en.beamDamage === "number") ? en.beamDamage : 30;
            try {
              shieldAwareDamage(beamDmg, px, py);
            } catch (e) {
              try { _origHandlePlayerDamage(beamDmg); } catch (e2) {}
            }

            // destroy any of the player's rockets along the straight line to the player.
            try {
              if (playerRockets && playerRockets.length) {
                const x1 = en.x;
                const y1 = en.y + 6;
                const x2 = px;
                const y2 = py;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const segLenSq = dx * dx + dy * dy || 1;
                for (let ri = playerRockets.length - 1; ri >= 0; ri--) {
                  const r = playerRockets[ri];
                  const t = Math.max(0, Math.min(1, ((r.x - x1) * dx + (r.y - y1) * dy) / segLenSq));
                  const projX = x1 + t * dx;
                  const projY = y1 + t * dy;
                  const distSq = (r.x - projX) * (r.x - projX) + (r.y - projY) * (r.y - projY);
                  const threshold = (r.radius || 8) + 6;
                  if (distSq <= threshold * threshold) {
                    try { playerRockets.splice(ri, 1); } catch (e) {}
                  }
                }
              }
            } catch (e) {}

            // Beam <-> Asteroid interaction:
            // When the beam intersects an asteroid, the beam will try to damage the frigate's shield first.
            // Only if the frigate's shield is already depleted will the beam directly reduce asteroid hull.
            try {
              if (Array.isArray(asteroids) && asteroids.length) {
                const x1 = en.x;
                const y1 = en.y + 6;
                const x2 = px;
                const y2 = py;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const segLenSq = dx * dx + dy * dy || 1;

                for (let ai = asteroids.length - 1; ai >= 0; ai--) {
                  const a = asteroids[ai];
                  // project asteroid center onto beam segment
                  const t = Math.max(0, Math.min(1, ((a.x - x1) * dx + (a.y - y1) * dy) / segLenSq));
                  const projX = x1 + t * dx;
                  const projY = y1 + t * dy;
                  const distSq = (a.x - projX) * (a.x - projX) + (a.y - projY) * (a.y - projY);
                  // intersection threshold based on asteroid radius and a small beam width
                  const threshold = (a.radius || 18) + 8;
                  if (distSq <= threshold * threshold) {
                    // If frigate has a shield with hp, absorb beam damage into the frigate shield
                    if (en.shield && typeof en.shield.hp === "number" && en.shield.hp > 0) {
                      // subtract from frigate shield (do not damage asteroid hull)
                      en.shield.hp = Math.max(0, en.shield.hp - beamDmg);
                      en.shield.lastHitAt = now;
                      if (en.shield.hp <= 0) en.shield.active = false;
                      // do not damage asteroid hull while shield exists
                      continue;
                    } else {
                      // shield is gone: apply beam damage to asteroid hull
                      a.health = (typeof a.health === "undefined") ? 0 : a.health - beamDmg;
                      if (a.health <= 0) {
                        // award player points for destroyed asteroid (use asteroid.points if present)
                        score += a.points || 10;
                        try { asteroidsDestroyed = (asteroidsDestroyed || 0) + 1; } catch (e) {}
                        saveState();
                        asteroids.splice(ai, 1);
                      }
                      // continue checking other asteroids
                    }
                  }
                }
              }
            } catch (e) {
              // non-fatal
            }
          }
        } else {
          if (now - en.lastShotAt > en.shootInterval) {
            // only fire if player is within shootRange (makes "farther" configurable)
            const distanceToPlayer = dist; // previously computed above for steering
            if (distanceToPlayer < (en.shootRange || 900)) {
              en.lastShotAt = now;
              // spawn enemy bullet aimed at player
              const bx = en.x;
              const by = en.y + 14;
              const bdx = px - bx;
              const bdy = py - by;
              const bdist = Math.hypot(bdx, bdy) || 1;
              // increase bullet speed so shots reach/cover longer distances faster
              const bSpeed = 6.5;
              const bvx = (bdx / bdist) * bSpeed;
              const bvy = (bdy / bdist) * bSpeed;
              (enemyBullets || (enemyBullets = [])).push({
                x: bx,
                y: by,
                vx: bvx,
                vy: bvy,
                radius: 8,
                img: enemyBulletImg,
                from: "enemy",
                damage: typeof en.damage === "number" ? en.damage : 10, // carry the shooter's damage value
              });
            } else {
              // if out of range, keep lastShotAt unchanged so the shot timer will try again soon
              // (this avoids starving the timer when out of range)
              en.lastShotAt = now - (en.shootInterval * 0.5);
            }
          }
        }
      }

      // Remove enemies that fall below screen
      if (en.y - en.radius > canvas.height + 40) {
        enemies.splice(ei, 1);
        continue;
      }

      // collision with player bullets
      for (let bi = player.bullets.length - 1; bi >= 0; bi--) {
        const b = player.bullets[bi];
        const dx = b.x - en.x;
        const dy = b.y - en.y;
        if (dx * dx + dy * dy < (en.radius + 6) * (en.radius + 6)) {
          // hit by player bullet: stop sound, remove bullet, apply damage
          if (b.sound) stopAndCleanSound(b.sound);
          player.bullets.splice(bi, 1);
          // player bullets deal 20 HP per hit; for frigates apply damage to the frigate shield first (if present)
          const bulletDamage = 20;
          if (en.type === "frigate" && en.shield && typeof en.shield.hp === "number" && en.shield.hp > 0) {
            // shield absorbs first; deduct from shield hp
            en.shield.hp = Math.max(0, en.shield.hp - bulletDamage);
            en.shield.lastHitAt = performance.now();
            // if shield depleted, mark inactive so subsequent hits go to hull
            if (en.shield.hp <= 0) en.shield.active = false;
            // visual/audio reactions could be placed here (omitted for brevity)
            // bullet consumed; do not apply hull damage
          } else {
            en.health -= bulletDamage;
            if (en.health <= 0) {
              // kill enemy: award bonus score and remove
              // award different score depending on enemy type (fighter worth more)
              const award = en.type === "fighter" ? 100 : (en.type === "frigate" ? 300 : 50);
              score += award;
              // increment kill counter for this enemy type
              try { if (typeof en.type === "string") killCounts[en.type] = (killCounts[en.type] || 0) + 1; } catch (e) {}
              saveState();
              enemies.splice(ei, 1);
              break;
            }
          }
        }
      }

      // collision with player (ram)
      const shipCx = player.x + player.width / 2;
      const shipCy = player.y + player.height / 2;
      const dxp = en.x - shipCx;
      const dyp = en.y - shipCy;
      const minDist = en.radius + (player.radius || Math.min(player.width, player.height) / 2);
      if (dxp * dxp + dyp * dyp < minDist * minDist) {
        // Frigate ramming: Cosmic Striker (cosmic2) rams instantly kill frigates, otherwise player takes light damage.
        if (en.type === "frigate") {
          try {
            if (window.currentShipId === "cosmic2") {
              // Cosmic Striker special: insta-kill frigate on ram.
              const award = 300;
              score += award;
              try { killCounts.frigate = (killCounts.frigate || 0) + 1; } catch (e) {}
              saveState();
              enemies.splice(ei, 1);
              // continue to next enemy (frigate removed)
              continue;
            } else {
              // default behavior: ramming a frigate damages the player for a small amount
              shieldAwareDamage(5, en.x, en.y);
              continue;
            }
          } catch (e) {
            // fallback: apply regular ram damage if anything goes wrong
            shieldAwareDamage(5, en.x, en.y);
            continue;
          }
        }

        // Other enemy types: apply shield-aware damage and remove the enemy (count as a kill)
        const dmg = typeof en.damage === "number" ? en.damage : 10;
        shieldAwareDamage(dmg, en.x, en.y);
        try { if (typeof en.type === "string") killCounts[en.type] = (killCounts[en.type] || 0) + 1; } catch (e) {}
        enemies.splice(ei, 1);
        continue;
      }
    }

    // Healer support behavior: heal a nearby allied enemy by beam every healInterval when active.
    // This block runs before enemy-enemy collision handling so healed targets are updated for subsequent physics.
    try {
      if (enemies && enemies.length) {
        const now = performance.now();
        for (let hi = 0; hi < enemies.length; hi++) {
          const he = enemies[hi];
          if (!he || he.type !== "healer") continue;

          // If healer was removed/died previously, skip.
          if (he.health <= 0) continue;

          // Find the most damaged allied target (prioritize lowest health percentage) within range,
          // preferring the paired companion if one exists. This makes the healer prioritize the ally
          // that benefits most from a heal instead of merely the closest.
          let nearest = null;
          let nearestDist = 1e9;
          let lowestPct = 2.0;
          // first try to find a paired companion (if marked), then fallback to most-damaged in range
          for (let ai = 0; ai < enemies.length; ai++) {
            const candidate = enemies[ai];
            if (!candidate || candidate === he) continue;
            if (candidate.type === "healer") continue;
            if (candidate.health <= 0) continue;
            // prefer explicitly paired companion
            if (candidate.pairedWithHealer) {
              nearest = candidate;
              nearestDist = Math.hypot(candidate.x - he.x, candidate.y - he.y) || 0.0001;
              lowestPct = (candidate.health || 0) / Math.max(1, candidate.maxHealth || 100);
              break;
            }
          }
          if (!nearest) {
            for (let ai = 0; ai < enemies.length; ai++) {
              const candidate = enemies[ai];
              if (!candidate || candidate === he) continue;
              if (candidate.type === "healer") continue;
              if (candidate.health <= 0) continue;
              const dx = candidate.x - he.x;
              const dy = candidate.y - he.y;
              const d = Math.hypot(dx, dy) || 0.0001;
              const pct = (candidate.health || 0) / Math.max(1, candidate.maxHealth || 100);
              // prefer lower pct (more damaged), tiebreaker = closer
              if (pct < lowestPct - 1e-6 || (Math.abs(pct - lowestPct) < 1e-6 && d < nearestDist)) {
                lowestPct = pct;
                nearestDist = d;
                nearest = candidate;
              }
            }
          }

          // If healer has a paired flag, attempt to re-associate to a paired companion (keeps them synced)
          if (!nearest) {
            // nothing to heal
            continue;
          }

          // burst reload handling: if currently reloading from an exhausted burst, check reload expiry
          if (he.burstReloadUntil && now < he.burstReloadUntil) {
            // still reloading; skip healing attempts
            continue;
          } else if (he.burstReloadUntil && now >= he.burstReloadUntil) {
            // reload finished: reset beamsRemaining for next burst
            he.beamsRemaining = he.burstSize || 5;
            he.burstReloadUntil = 0;
          }

          // Only heal within a reasonable range (e.g., 300px) and respect beamsRemaining and heal interval.
          if (
            nearest &&
            nearestDist <= 600 &&
            (now - (he.lastHealAt || 0) > (he.healInterval || 1600)) &&
            (typeof he.beamsRemaining === "undefined" || he.beamsRemaining > 0)
          ) {
            // perform the heal: restore up to healAmount but not beyond target's maxHealth
            const healAmount = he.healAmount || 20;
            const prevHp = Math.max(0, nearest.health || 0);
            const maxHp = Math.max(1, nearest.maxHealth || 100);
            // only heal if target isn't already at full HP
            if (prevHp < maxHp) {
              nearest.health = Math.min(maxHp, prevHp + healAmount);
              he.lastHealAt = now;
              he.lastHealDraw = { tx: nearest.x, ty: nearest.y, at: now }; // store draw info for beam visual

              // consume one beam from the burst
              if (typeof he.beamsRemaining === "undefined") he.beamsRemaining = he.burstSize || 5;
              he.beamsRemaining = Math.max(0, he.beamsRemaining - 1);

              // if we've exhausted the burst, set reload timer
              if (he.beamsRemaining <= 0) {
                he.burstReloadUntil = now + (he.burstReloadMs || 1000);
              }
            }
          }

          // Healer movement: seek and hover near its paired companion when available, otherwise gentle hover.
          // This makes the healer actively move to support allies instead of being purely stationary.
          try {
            if (typeof he._seed === "undefined") he._seed = Math.random() * Math.PI * 2;
            const t = performance.now() / 1000;

            // Determine companion target: prioritize explicitly paired companion then nearest allied ship
            let companion = null;
            for (let ci = 0; ci < enemies.length; ci++) {
              const cand = enemies[ci];
              if (!cand || cand === he) continue;
              if (cand.pairedWithHealer || cand.paired === true) {
                companion = cand;
                break;
              }
            }
            // fallback: nearest non-healer ally
            if (!companion) {
              let nearestD = Infinity;
              for (let ci = 0; ci < enemies.length; ci++) {
                const cand = enemies[ci];
                if (!cand || cand === he || cand.type === "healer") continue;
                const d = Math.hypot(cand.x - he.x, cand.y - he.y) || 0.0001;
                if (d < nearestD) { nearestD = d; companion = cand; }
              }
            }

            if (companion) {
              // smoothly steer toward a point slightly above the companion so the beam can originate from a stable offset
              const targetX = companion.x - (companion.vx || 0) * 6;
              const targetY = companion.y - 36; // hover slightly above the ally
              const dx = targetX - he.x;
              const dy = targetY - he.y;
              const dist = Math.hypot(dx, dy) || 1;
              // desired speed scales with distance but remains gentle
              const desiredSpeed = Math.min(1.8, 0.8 + dist / 180);
              let desiredVx = (dx / dist) * desiredSpeed;
              let desiredVy = (dy / dist) * desiredSpeed;
              // smooth steering
              he.vx += (desiredVx - he.vx) * 0.08;
              he.vy += (desiredVy - he.vy) * 0.08;
            } else {
              // no companion found: gentle sinusoidal hover to remain dynamic
              he.vx = Math.sin(t * 0.9 + he._seed) * 0.45;
              he.vy = 0.6 + Math.cos(t * 0.6 + he._seed) * 0.12;
            }

            // clamp speeds to reasonable bounds for stability and prevent teleport-style jumps
            const sp = Math.hypot(he.vx || 0, he.vy || 0) || 1;
            const maxHSpeed = 2.2;
            if (sp > maxHSpeed) {
              he.vx = (he.vx / sp) * maxHSpeed;
              he.vy = (he.vy / sp) * maxHSpeed;
            }

            // Additionally clamp per-frame position change to avoid sudden large displacements
            // (in case external code nudges position or a large velocity spike occurs)
            const maxDelta = 12; // maximum allowed pixels movement in one update for the healer
            // compute the intended next position
            const intendedDX = he.vx;
            const intendedDY = he.vy;
            const intendedDist = Math.hypot(intendedDX, intendedDY) || 0;
            if (intendedDist > maxDelta) {
              // scale down the velocity so movement does not exceed maxDelta this frame
              const scale = maxDelta / intendedDist;
              he.vx = intendedDX * scale;
              he.vy = intendedDY * scale;
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      // non-fatal
    }

    // enemy-enemy collisions: make enemies solid (separate overlapping ships and apply an elastic-ish impulse)
    if (enemies && enemies.length > 1) {
      for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
          const a = enemies[i];
          const b = enemies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const ra = a.radius || 20;
          const rb = b.radius || 20;
          const minDist = ra + rb;
          if (dist < minDist) {
            // separate them half the overlap each
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;

            // approximate elastic collision impulse (mass ~ area ~ r^2)
            const ma = ra * ra;
            const mb = rb * rb;

            // relative velocity along normal
            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const relAlongNormal = rvx * nx + rvy * ny;

            // only apply impulse if they're moving toward each other
            if (relAlongNormal < 0) {
              const restitution = 0.6; // bounciness
              const impulse = -(1 + restitution) * relAlongNormal / (1 / ma + 1 / mb);
              const ix = impulse * nx;
              const iy = impulse * ny;

              a.vx -= ix / ma;
              a.vy -= iy / ma;
              b.vx += ix / mb;
              b.vy += iy / mb;

              // small damping to stabilize motion
              a.vx *= 0.98;
              a.vy *= 0.98;
              b.vx *= 0.98;
              b.vy *= 0.98;
            } else {
              // if velocities are separating but overlap occurred due to placement, nudge tiny random to avoid sticking
              a.vx += (Math.random() - 0.5) * 0.02;
              a.vy += (Math.random() - 0.5) * 0.02;
              b.vx += (Math.random() - 0.5) * 0.02;
              b.vy += (Math.random() - 0.5) * 0.02;
            }
          }
        }
      }
    }

    // update enemy bullets (movement + collisions)
    if (!enemyBullets) enemyBullets = [];
    for (let eb = enemyBullets.length - 1; eb >= 0; eb--) {
      const b = enemyBullets[eb];
      b.x += b.vx;
      b.y += b.vy;
      // remove off-screen
      if (b.x < -40 || b.x > canvas.width + 40 || b.y < -40 || b.y > canvas.height + 40) {
        enemyBullets.splice(eb, 1);
        continue;
      }

      // collision with asteroids (enemy bullets can damage/destroy asteroids)
      if (asteroids && asteroids.length) {
        let hitAsteroid = false;
        for (let ai = asteroids.length - 1; ai >= 0; ai--) {
          const a = asteroids[ai];
          const dxA = b.x - a.x;
          const dyA = b.y - a.y;
          if (dxA * dxA + dyA * dyA < (b.radius + a.radius) * (b.radius + a.radius)) {
            // enemy bullet hits asteroid: damage asteroid and remove bullet
            a.health = (typeof a.health === "undefined") ? 1 : a.health - 1;
            hitAsteroid = true;
            // remove bullet
            enemyBullets.splice(eb, 1);

            // if asteroid destroyed, award points and remove it
            if (a.health <= 0) {
              score += a.points || 10;
              saveState();
              asteroids.splice(ai, 1);
            }
            break;
          }
        }
        if (hitAsteroid) continue; // skip further collision checks for this bullet
      }

      // collision with player
      const shipCx = player.x + player.width / 2;
      const shipCy = player.y + player.height / 2;
      const dx = b.x - shipCx;
      const dy = b.y - shipCy;
      if (dx * dx + dy * dy < (b.radius + (player.radius || 20)) * (b.radius + (player.radius || 20))) {
        // hit player: use bullet's damage (falls back to 10 if missing)
        const bulletDamage = typeof b.damage === "number" ? b.damage : 10;
        // allow shield to intercept enemy bullets if they strike the front
        shieldAwareDamage(bulletDamage, b.x, b.y);
        enemyBullets.splice(eb, 1);
      }
    }

    // Asteroids movement + collision with player and asteroid-vs-asteroid collisions
    // First update positions using vx/vy (fallback to speed for older entries)
    for (let ai = 0; ai < asteroids.length; ai++) {
      let a = asteroids[ai];
      // provide compatibility: older asteroids may have 'speed' only
      if (typeof a.vy === "undefined") {
        a.vx = 0;
        a.vy = a.speed || 2;
      }
      a.x += a.vx;
      a.y += a.vy;

      // keep asteroids inside horizontal bounds by reflecting vx
      if (a.x - a.radius < 0) {
        a.x = a.radius;
        a.vx = Math.abs(a.vx) * 0.9;
      } else if (a.x + a.radius > canvas.width) {
        a.x = canvas.width - a.radius;
        a.vx = -Math.abs(a.vx) * 0.9;
      }
    }

    // Simple pairwise collision response (elastic-ish) between asteroids
    // O(n^2) but asteroids counts are modest; swap from end-to-start to allow safe removal later
    for (let i = 0; i < asteroids.length; i++) {
      for (let j = i + 1; j < asteroids.length; j++) {
        const a = asteroids[i];
        const b = asteroids[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.radius + b.radius;
        if (dist < minDist) {
          // push them apart proportionally to overlap
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          // approximate elastic collision for two circles with mass ~ area (r^2)
          const ma = a.radius * a.radius;
          const mb = b.radius * b.radius;

          // relative velocity along normal
          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const relVelAlongNormal = rvx * nx + rvy * ny;

          // if they are moving apart, skip impulse
          if (relVelAlongNormal > 0) continue;

          // restitution (bounciness) slightly <1 to avoid perpetual fast bouncing
          const restitution = 0.75;

          // impulse scalar
          const jImpulse = -(1 + restitution) * relVelAlongNormal / (1 / ma + 1 / mb);

          // apply impulse to velocities
          const impulseX = jImpulse * nx;
          const impulseY = jImpulse * ny;

          a.vx -= (impulseX) / ma;
          a.vy -= (impulseY) / ma;
          b.vx += (impulseX) / mb;
          b.vy += (impulseY) / mb;

          // slight damping to both to stabilize simulation
          a.vx *= 0.995;
          a.vy *= 0.995;
          b.vx *= 0.995;
          b.vy *= 0.995;

          // small random rotation-ish kick so similar-size clumps separate more naturally
          const kick = (Math.random() - 0.5) * 0.2;
          a.vx += -ny * kick;
          a.vy += nx * kick;
          b.vx += ny * kick;
          b.vy += -nx * kick;
        }
      }
    }

    // Now process bottom/out-of-bounds, player collisions and removal
    // Also handle asteroid <-> enemy collisions: both take damage on contact.
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      let a = asteroids[ai];

      // asteroid vs enemy collisions: if an enemy overlaps an asteroid, both take 1 damage,
      // and enemy may be destroyed (award score) or asteroid removed.
      if (enemies && enemies.length) {
        for (let ei = enemies.length - 1; ei >= 0; ei--) {
          const en = enemies[ei];
          const dx = a.x - en.x;
          const dy = a.y - en.y;
          const distAE = Math.hypot(dx, dy) || 1;
          const minDistAE = a.radius + (en.radius || 20);
          if (distAE < minDistAE) {
            // apply damage to asteroid
            a.health = (typeof a.health === "undefined") ? 1 : a.health - 1;

            // NOTE: frigates are large/heavy and should not take (or be heavily damaged) by asteroid glancing collisions.
            // Reduce enemy health by 50% (round up) for normal enemies but skip/avoid halving for frigates.
            if (en.type !== "frigate") {
              en.health = (typeof en.health === "undefined") ? 1 : Math.max(0, Math.ceil(en.health * 0.5));
            } else {
              // For frigate, apply a small nudge/knockback instead of heavy damage to preserve intended toughness.
              // Optionally we could slightly reduce frigate shield if extremely close; keep it intact here.
              try {
                const pushStrength = 6;
                const nx = dx / (distAE || 1);
                const ny = dy / (distAE || 1);
                en.x -= nx * pushStrength;
                en.y -= ny * pushStrength;
              } catch (e) {}
            }

            // slight bounce to separate them a bit
            const overlap = (minDistAE - distAE) / 2;
            const nx = dx / distAE;
            const ny = dy / distAE;
            a.x += nx * overlap;
            a.y += ny * overlap;
            en.x -= nx * overlap;
            en.y -= ny * overlap;

            // If asteroid destroyed by the collision, award its points and remove it.
            if (a.health <= 0) {
              score += a.points || 10;
              try { asteroidsDestroyed = (asteroidsDestroyed || 0) + 1; } catch (e) {}
              asteroids.splice(ai, 1);
              // asteroid removed; continue to next asteroid (break enemy loop for this asteroid)
              break;
            }

            // If enemy dropped to zero or below health after halving, remove enemy and award player
            if (en.health !== undefined && en.health <= 0) {
              // Award points depending on enemy type (frigate -> 300, fighter -> 100, scout/other -> 50)
              const award = en.type === "fighter" ? 100 : (en.type === "frigate" ? 300 : 50);
              score += award;
              try { if (typeof en.type === "string") killCounts[en.type] = (killCounts[en.type] || 0) + 1; } catch (e) {}
              saveState();
              enemies.splice(ei, 1);
              continue;
            }
          }
        }
      }

      // If an asteroid reaches the bottom of the canvas, penalize score and remove it.
      if (a.y - a.radius > canvas.height) {
        // determine big/small by health (big have health > 1)
        const isBig = a.health > 1;
        // updated penalties for missed asteroids: small = -10, big = -50
        score -= isBig ? 50 : 10;
        if (score < 0) score = 0;
        saveState();
        asteroids.splice(ai, 1);
        continue;
      }

      // collision with player (circle-vs-circle using a tighter ship radius)
      // compute ship center
      const shipCx = player.x + player.width / 2;
      const shipCy = player.y + player.height / 2;
      const shipRadius = player.radius || Math.min(player.width, player.height) / 2;
      const dxp = a.x - shipCx;
      const dyp = a.y - shipCy;
      const minDist = a.radius + shipRadius;
      if (dxp * dxp + dyp * dyp < minDist * minDist) {
        // Apply hull damage based on asteroid size (small = 5, big = 10) using shield-aware handler.
        try {
          const isBigHit = (a.health > 1); // big asteroids have health > 1
          const asteroidDamage = isBigHit ? 10 : 5;
          // use shield-aware damage with asteroid contact point so frontal shields can block frontal hits
          try {
            shieldAwareDamage(asteroidDamage, a.x, a.y);
          } catch (e) {
            // fallback to original handler if shield-aware wrapper is unavailable
            try { _origHandlePlayerDamage(asteroidDamage); } catch (e2) {}
          }
        } catch (e) {
          // non-fatal: continue to give feedback even if damage call fails
          console.warn("Asteroid damage application failed:", e);
        }

        // remove asteroid and provide visual feedback / knockback
        asteroids.splice(ai, 1);
        player.flashing = true;
        setTimeout(() => (player.flashing = false), 300);
        try {
          // small knockback away from impact (clamped inside canvas)
          const dist = Math.hypot(dxp, dyp) || 1;
          const nx = dxp / dist;
          const ny = dyp / dist;
          player.x = Math.max(0, Math.min(canvas.width - player.width, player.x + nx * 12));
          player.y = Math.max(0, Math.min(canvas.height - player.height, player.y + ny * 12));
        } catch (e) {
          // ignore knockback errors
        }

        // If damage killed the player, handle game over cleanup (same as before)
        if (player.health <= 0) {
          if (score > highScore) {
            highScore = score;
            saveState();
          }
          // stop and clean up any bullet sounds so they don't keep playing after game over
          player.bullets.forEach((b) => {
            if (b.sound) stopAndCleanSound(b.sound);
          });
          // show in-canvas game over UI; keep the overlay menu hidden
          gameOver = true;
          gameStarted = false;
          if (spawnInterval) {
            clearInterval(spawnInterval);
            spawnInterval = null;
          }
          stopCrateSpawner();
          stopHealSpawner();
        }
        break;
      }
    }

    // Player ramming crates: check crates collision using circle-vs-circle (tighter ship radius)
    for (let ci = crates.length - 1; ci >= 0; ci--) {
      let c = crates[ci];
      const shipCx = player.x + player.width / 2;
      const shipCy = player.y + player.height / 2;
      const shipRadius = player.radius || Math.min(player.width, player.height) / 2;
      const dx = c.x - shipCx;
      const dy = c.y - shipCy;
      const minDist = c.radius + shipRadius;
      if (dx * dx + dy * dy < minDist * minDist) {
        // pick up crate: add to reserve ammo
        reserveAmmo += c.give;
        // optional cap to prevent huge hoarding (e.g., cap at 120)
        reserveAmmo = Math.min(120, reserveAmmo);
        crates.splice(ci, 1);

        // If the clip is empty when picking up ammo, automatically start reload
        // (but only if not already reloading and we actually have reserve ammo).
        // This avoids the 0/0 stuck state where pickup doesn't trigger a reload.
        if (clipAmmo <= 0 && reserveAmmo > 0 && !reloading) {
          // Start an automatic reload (not forced) so it behaves like normal auto-reload.
          startReload(false);
        }
      }
    }

    // Player ramming heals: grant HP on contact
    for (let hi = heals.length - 1; hi >= 0; hi--) {
      let h = heals[hi];
      const shipCx = player.x + player.width / 2;
      const shipCy = player.y + player.height / 2;
      const shipRadius = player.radius || Math.min(player.width, player.height) / 2;
      const dx = h.x - shipCx;
      const dy = h.y - shipCy;
      const minDist = h.radius + shipRadius;
      if (dx * dx + dy * dy < minDist * minDist) {
        // heal the player
        player.health = Math.min(player.maxHealth, player.health + (h.give || 10));
        heals.splice(hi, 1);
      }
    }

    // (Reload completion is now handled by the timeout created in startReload so no transfer runs here.)

    // --- Shield regeneration handling ---
    // Regenerate both front and full-body shields when unlocked, not active, and past their recharge delays.
    try {
      const now = performance.now();

      // helper to process a shield object (frontShield or shieldUpgrade)
      // NOTE: allow regeneration when a shield has less than max HP after its recharge delay,
      // regardless of the "active" flag, because a shield may remain equipped but offline while recharging.
      function processRegen(sh) {
        if (!sh || !sh.unlocked) return;
        if (!sh.rechargeTickAt) sh.rechargeTickAt = now;

        // Only regenerate when shield HP is below its maximum.
        if (sh.hp < sh.maxHp) {
          const timeSinceHit = now - (sh.lastHitAt || 0);
          // Wait until the configured recharge delay has elapsed since last hit
          if (timeSinceHit >= (sh.rechargeDelayMs || 0)) {
            const dtSec = Math.max(0, (now - (sh.rechargeTickAt || now)) / 1000);
            if (dtSec > 0) {
              const regen = (sh.rechargeRatePerSec || 0) * dtSec;
              sh.hp = Math.min(sh.maxHp, sh.hp + regen);
              sh.rechargeTickAt = now;
              if (sh.hp >= sh.maxHp) {
                sh.hp = sh.maxHp;
                sh.lastHitAt = 0;
              }
            }
          } else {
            // schedule the expected recharge start time if not already set
            const expectedStart = (sh.lastHitAt || now) + (sh.rechargeDelayMs || 0);
            if (expectedStart > sh.rechargeTickAt) sh.rechargeTickAt = expectedStart;
          }
        } else {
          sh.rechargeTickAt = sh.rechargeTickAt || now;
        }
      }

      processRegen(frontShield);
      processRegen(shieldUpgrade);
    } catch (e) {
      // non-fatal; don't break main update loop
      console.warn("Shield regen error:", e);
    }

    // keep healerActive flag in sync: if no healer instances remain, allow future spawns
    try {
      healerActive = !!(enemies && enemies.some((ent) => ent && ent.type === "healer"));
    } catch (e) {
      healerActive = false;
    }

  } catch (err) {
    // Catch any runtime error during update so the animation loop continues.
    console.error("Update runtime error:", err);
  }
}

// --- Draw Loop ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (gameStarted && !gameOver) {
    // draw ship image (choose sprite by health; fallback rectangle if not loaded)
    const img = currentShipImage();
    if (img && img.complete && img.naturalWidth !== 0) {
      // draw rotated ship centered on player.x,y (player.x/y represent top-left)
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      const cx = player.x + player.width / 2;
      const cy = player.y + player.height / 2;

      // rotate around center by player.angle (0 faces up visually)
      ctx.translate(cx, cy);
      ctx.rotate(player.angle);
      ctx.drawImage(img, -player.width / 2, -player.height / 2, player.width, player.height);

      // flash effect: tint the already-drawn ship with a semi-transparent red overlay
      if (player.flashing) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "red";
        ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
      }

      ctx.restore();
    } else {
      // fallback rectangle when image is missing; draw rotated rectangle
      ctx.save();
      const cx = player.x + player.width / 2;
      const cy = player.y + player.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(player.angle);
      ctx.fillStyle = player.flashing ? "rgba(255,80,80,0.8)" : "cyan";
      ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
      ctx.restore();
    }

    // bullets (draw using sprite if available)
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    player.bullets.forEach((b) => {
      if (bulletImage.complete && bulletImage.naturalWidth !== 0) {
        // draw centered on bullet x (ensure the PNG transparency is preserved)
        ctx.drawImage(bulletImage, b.x - (BULLET_W / 2), b.y - (BULLET_H / 2), BULLET_W, BULLET_H);
      } else {
        // non-image fallback: small translucent circle instead of a black rectangle
        ctx.fillStyle = "rgba(255, 230, 100, 0.9)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();

    asteroids.forEach((a) => drawAsteroid(a));

    // draw crates (use sprite when available)
    crates.forEach((c) => {
      if (c.img && c.img.complete && c.img.naturalWidth !== 0) {
        // draw centered on crate position using a larger 60x60 sprite
        const w = 60;
        const h = 60;
        ctx.drawImage(c.img, c.x - w / 2, c.y - h / 2, w, h);
      } else {
        // fallback: draw a green circle with the crate's radius
        ctx.fillStyle = c.color || "#67ff9a";
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // draw heals (first-aid pickups)
    heals.forEach((h) => {
      if (h.img && h.img.complete && h.img.naturalWidth !== 0) {
        const w = 36;
        const hh = 36;
        ctx.drawImage(h.img, h.x - w / 2, h.y - hh / 2, w, hh);
      } else {
        ctx.fillStyle = "#66ff88";
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // draw enemies (use scout, fighter, frigate or healer sprite depending on type)
    enemies.forEach((en) => {
      // choose sprite by type: fighter, frigate, healer (support ship), otherwise scout
      let spriteToUse = scoutSprite;
      if (en.type === "fighter") spriteToUse = fighterSprite;
      else if (en.type === "healer") spriteToUse = healerSprite;
      else if (en.type === "frigate") spriteToUse = frigateSprite;

      if (spriteToUse && spriteToUse.complete && spriteToUse.naturalWidth !== 0) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(spriteToUse, en.x - en.width/2, en.y - en.height/2, en.width, en.height);
        ctx.restore();
      } else {
        ctx.fillStyle = "#88e1ff";
        ctx.beginPath();
        ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // FRIGATE: draw a simple blue shield HP bar under the enemy's health bar when present & active.
      if (en.type === "frigate" && en.shield && typeof en.shield.hp === "number" && en.shield.active) {
        try {
          const hpRatio = Math.max(0, Math.min(1, en.shield.hp / (en.shield.maxHp || 1)));
          // position the shield bar directly under the enemy's health bar (which is drawn above the ship)
          const barW = 48;
          const barH = 6;
          const barX = en.x - barW / 2;
          const barY = en.y - en.height / 2 - 4; // slightly below the enemy's own health bar
          // background
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
          // filled portion (blue)
          ctx.fillStyle = "#66bfff";
          ctx.fillRect(barX, barY, barW * hpRatio, barH);
          // outline
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.strokeRect(barX, barY, barW, barH);
        } catch (e) {}
      }

      // small health indicator above enemy (scaled to enemy's maxHealth)
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const barW = 36;
      const barH = 6;
      const barX = en.x - barW / 2;
      const barY = en.y - en.height / 2 - 12;
      ctx.fillRect(barX, barY, barW, barH);

      // choose color tiers based on current HP percentage of maxHealth
      let hp = Math.max(0, typeof en.health === "undefined" ? 0 : en.health);
      const maxHp = Math.max(1, typeof en.maxHealth === "undefined" ? 100 : en.maxHealth);
      const pct = Math.max(0, Math.min(1, hp / maxHp));

      // color by percentage: green (>=80%), light green (50-80%), yellow (20-50%), red (<20%)
      let fillColor = "#66ff88";
      if (pct < 0.2) fillColor = "#ff6b6b";
      else if (pct < 0.5) fillColor = "#ffd86b";
      else if (pct < 0.8) fillColor = "#9fffbf";
      else fillColor = "#66ff88";

      ctx.fillStyle = fillColor;
      ctx.fillRect(barX, barY, barW * pct, barH);
    });

    // draw healer beams (ray) for recent heals and frigate beams so players can visually see support ships healing allies and frigate beam attacks
    try {
      if (enemies && enemies.length) {
        enemies.forEach((he) => {
          // Healer beams (unchanged)
          if (he && he.type === "healer") {
            if (he.lastHealDraw && typeof he.lastHealDraw.at === "number" && (performance.now() - he.lastHealDraw.at) < 900) {
              const tx = he.lastHealDraw.tx;
              const ty = he.lastHealDraw.ty;
              if (tx != null && ty != null && rayImage && rayImage.complete && rayImage.naturalWidth !== 0) {
                const sx = he.x;
                const sy = he.y;
                const dx = tx - sx;
                const dy = ty - sy;
                const dist = Math.hypot(dx, dy) || 1;
                const angle = Math.atan2(dy, dx);
                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(angle);
                ctx.imageSmoothingEnabled = false;
                const beamH = 12;
                ctx.globalAlpha = 0.95;
                ctx.drawImage(rayImage, 0, -beamH / 2, dist, beamH);
                ctx.restore();
              } else {
                const sx = he.x;
                const sy = he.y;
                const tx = he.lastHealDraw.tx;
                const ty = he.lastHealDraw.ty;
                ctx.save();
                ctx.strokeStyle = "rgba(120,220,255,0.95)";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(tx, ty);
                ctx.stroke();
                ctx.restore();
              }
            }
          }

          // Frigate instantaneous beam visual: render recent beam from frigate to its target
          if (he && he.type === "frigate" && he.lastRayDraw && typeof he.lastRayDraw.at === "number" && (performance.now() - he.lastRayDraw.at) < 600) {
            const rd = he.lastRayDraw;
            const sx = rd.sx;
            const sy = rd.sy;
            const tx = rd.tx;
            const ty = rd.ty;
            // draw using rayImage when available; use a more intense color/width for frigate beam
            try {
              if (rayImage && rayImage.complete && rayImage.naturalWidth !== 0) {
                const dx = tx - sx;
                const dy = ty - sy;
                const dist = Math.hypot(dx, dy) || 1;
                const angle = Math.atan2(dy, dx);
                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(angle);
                ctx.imageSmoothingEnabled = false;
                // frigate beam slightly thicker and brighter (now red)
                const beamH = 18;
                ctx.globalAlpha = 0.98;
                ctx.drawImage(rayImage, 0, -beamH / 2, dist, beamH);
                // add a thin bright red line on top for emphasis
                ctx.globalAlpha = 1.0;
                ctx.strokeStyle = "rgba(255,120,120,0.98)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(dist, 0);
                ctx.stroke();
                ctx.restore();
              } else {
                ctx.save();
                // fallback bright red beam if rayImage isn't available
                ctx.strokeStyle = "rgba(255,120,120,0.98)";
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(tx, ty);
                ctx.stroke();
                ctx.restore();
              }
            } catch (e) {
              // fallback bright line
              ctx.save();
              ctx.strokeStyle = "rgba(180,230,255,0.98)";
              ctx.lineWidth = 6;
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.lineTo(tx, ty);
              ctx.stroke();
              ctx.restore();
            }
          }
        });
      }
    } catch (e) {}

    // draw enemy bullets
    if (enemyBullets && enemyBullets.length) {
      enemyBullets.forEach((b) => {
        if (b.img && b.img.complete && b.img.naturalWidth !== 0) {
          ctx.drawImage(b.img, b.x - 10, b.y - 10, 20, 20);
        } else {
          ctx.fillStyle = "orange";
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // draw player rockets (consumable projectiles) - use provided rocket sprite when available
    if (playerRockets && playerRockets.length) {
      playerRockets.forEach((r) => {
        try {
          if (rocketImg && rocketImg.complete && rocketImg.naturalWidth !== 0) {
            // draw rocket sprite centered on r.x/r.y (scale to ~20x28 for pixel-art look)
            const w = 20;
            const h = 28;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(rocketImg, r.x - w / 2, r.y - h / 2, w, h);
          } else {
            ctx.save();
            ctx.fillStyle = "#ff8a4d";
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } catch (e) {
          // fallback circle if drawing fails
          ctx.save();
          ctx.fillStyle = "#ff8a4d";
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
    }

    // draw frontal and full-body shield visuals when active and equipped
    // FRONT SHIELD (nose-mounted icon only — attached to the ship's nose and oriented to face forward)
    if (frontShield && frontShield.unlocked && frontShield.active && frontShield.hp > 0 && frontShield.equipped) {
      const cx = player.x + player.width / 2;
      const cy = player.y + player.height / 2;
      const hpRatio = Math.max(0, Math.min(1, frontShield.hp / frontShield.maxHp));

      // Prefer the preprocessed offscreen canvas (transparent background) when available,
      // draw it rotated so the shield always faces the ship's nose, and make it slightly larger.
      try {
        // compute forward vector from the ship's angle (player.angle: 0 = facing up)
        const forwardOffset = Math.max(player.width, player.height) * 0.45;
        const forwardX = Math.cos(player.angle - Math.PI / 2);
        const forwardY = Math.sin(player.angle - Math.PI / 2);

        // position the icon at the ship's nose (center + forward vector * offset)
        const noseX = cx + forwardX * forwardOffset;
        const noseY = cy + forwardY * forwardOffset;

        // size: base size scaled up a bit so the shield appears slightly larger
        const baseSize = 30;
        const sizeByHp = 0.9 + 0.6 * hpRatio; // scale with HP ratio
        const imgW = Math.round(baseSize * 1.25 * sizeByHp);
        const imgH = imgW;

        // If the preprocessed shield canvas is ready use it; otherwise fallback to the raw image.
        if (typeof shieldCanvasReady !== "undefined" && shieldCanvasReady) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          // move to nose, rotate so the sprite aligns with ship angle, then draw centered
          ctx.translate(noseX, noseY);
          ctx.rotate(player.angle);
          ctx.drawImage(shieldCanvas, -imgW / 2, -imgH / 2, imgW, imgH);
          ctx.restore();
        } else if (shieldImage && shieldImage.complete && shieldImage.naturalWidth !== 0) {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.translate(noseX, noseY);
          ctx.rotate(player.angle);
          ctx.drawImage(shieldImage, -imgW / 2, -imgH / 2, imgW, imgH);
          ctx.restore();
        }
      } catch (e) {
        // ignore drawing failures
      }
    }

    // FULL-BODY SHIELD (yellow circular cover) - unchanged behavior but kept here for ordering
    if (shieldUpgrade.unlocked && shieldUpgrade.active && shieldUpgrade.hp > 0 && shieldUpgrade.equipped) {
      const cx = player.x + player.width / 2;
      const cy = player.y + player.height / 2;
      // size scales with maxHp and optional multiplier
      const hpRatio = Math.max(0, Math.min(1, shieldUpgrade.hp / shieldUpgrade.maxHp));
      const baseR = Math.max(player.width, player.height) * 0.6 * (shieldUpgrade.sizeMultiplier || 1);
      const r = baseR * (0.8 + 0.4 * hpRatio);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      // subtle pulsing alpha based on hp ratio
      ctx.globalAlpha = 0.28 + 0.4 * hpRatio;
      ctx.fillStyle = "#ffd86b"; // warm yellow cover
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // outline to make it clearer
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#ffda91";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Determine if the menu is visible; if so, hide the top-left/right HUD elements
  const menuEl = document.getElementById("menu");
  const menuVisible = menuEl && menuEl.style.display !== "none";

  if (!menuVisible) {
    // Health bar (top-left)
    const barX = 10;
    const barY = 6;
    const barW = 160;
    const barH = 14;
    const healthRatio = Math.max(0, player.health) / player.maxHealth;
    // background
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    // fill based on health
    // Health gradient: left = red (low), right = green (full) — swapped so colors read red→green from left to right
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0.0, "#ff6b6b"); // red at the left (low)
    grad.addColorStop(1.0, "#66ff88"); // green at the right (full)
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW * healthRatio, barH);
    // border and text
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.fillText("Hull Health: " + Math.max(0, Math.round(player.health)), barX, barY + barH + 14);

    // Points display (renamed from "Score")
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.fillText("Points: " + points, 10, 70);

    // SC balance (top-left, bold) — only show while the menu is visible (hide in-game)
    if (menuVisible) {
      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "#ffd86b";
      ctx.fillText("SC: " + scBalance, 10, 40);
      ctx.font = "16px Arial";
      ctx.fillStyle = "white";
    } else {
      // keep default font/color for other HUD elements when in-game
      ctx.font = "16px Arial";
      ctx.fillStyle = "white";
    }

    // draw high score on its own right-aligned line so it doesn't overlap the ammo display
    ctx.textAlign = "right";
    ctx.fillText("High Score: " + highScore, canvas.width - 10, 60);
    ctx.textAlign = "left";

    // Ammo display top-right (show clip / reserve)
    ctx.textAlign = "right";
    ctx.font = "16px Arial";
    if (reloading) {
      // compute remaining seconds (clamp to 0)
      let remaining = Math.max(0, (reloadEndsAt ? (reloadEndsAt - performance.now()) : reloadTime) / 1000);
      ctx.fillStyle = "orange";
      ctx.fillText("Reloading... " + remaining.toFixed(1) + "s", canvas.width - 10, 20);
    } else {
      // show clip / reserve
      ctx.fillStyle = clipAmmo > 0 ? "lightgreen" : "red";
      ctx.fillText("Ammo: " + clipAmmo + " / " + reserveAmmo, canvas.width - 10, 20);

      // Rockets count shown below Ammo (in-game quick glance)
      const rocketsOwned = (rocketUpgrade && typeof rocketUpgrade.count === "number") ? rocketUpgrade.count : 0;
      ctx.fillStyle = rocketsOwned > 0 ? "#ffd86b" : "#cfcfcf";
      ctx.font = "14px Arial";
      ctx.fillText("Rockets: " + rocketsOwned, canvas.width - 10, 40);
      // restore default font for subsequent HUD
      ctx.font = "16px Arial";
    }

    // Shield HUDs: render only the equipped shield's HP bar (do not show other purchased shields)
    // Lay the single shield bar out on the top-right so it doesn't overlap other HUD elements.
    const sbarW = 140; // make slightly wider when only one bar is shown
    const sbarH = 12;
    const paddingRight = 12;
    // moved shield bar slightly lower to avoid overlapping High Score text
    const sbarY = 84;

    // Determine which shield (if any) is both unlocked AND equipped; front shield takes visual priority if both somehow equipped.
    const shieldBars = [];
    if (frontShield && frontShield.unlocked && frontShield.equipped) {
      shieldBars.push({
        id: "front",
        ratio: Math.max(0, Math.min(1, (frontShield.hp || 0) / (frontShield.maxHp || 1))),
        stops: [
          { pos: 0.0, color: "#ff9b9b" },
          { pos: 1.0, color: "#ffd86b" },
        ],
        label: "Front Shield",
        active: !!frontShield.active,
      });
    } else if (shieldUpgrade && shieldUpgrade.unlocked && shieldUpgrade.equipped) {
      shieldBars.push({
        id: "full",
        ratio: Math.max(0, Math.min(1, (shieldUpgrade.hp || 0) / (shieldUpgrade.maxHp || 1))),
        stops: [
          { pos: 0.0, color: "#66d9ff" },
          { pos: 1.0, color: "#2fd1ff" },
        ],
        label: "Full Shield",
        active: !!shieldUpgrade.active,
      });
    }

    // draw the single bar (if present) aligned to the top-right
    let curX = canvas.width - paddingRight - sbarW;
    function drawShieldBar(x, y, w, h, ratio, gradientStops, label, active) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      gradientStops.forEach((s) => g.addColorStop(s.pos, s.color));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w * ratio, h);

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = active ? "#66ff88" : "#eef6ff";
      ctx.font = "12px Arial";
      ctx.textAlign = "right";
      ctx.fillText(label + ": " + Math.round(ratio * 100) + "%", x + w, y + h + 14);
      ctx.textAlign = "left";
    }

    if (shieldBars.length) {
      const b = shieldBars[0];
      drawShieldBar(curX, sbarY, sbarW, sbarH, b.ratio, b.stops, b.label, b.active);
    }

    ctx.textAlign = "left";
  }

  if (gameOver) {
    ctx.fillStyle = "white";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = "24px Arial";
    ctx.fillText("Score: " + score, canvas.width / 2, canvas.height / 2);
    ctx.fillText("High Score: " + highScore, canvas.width / 2, canvas.height / 2 + 40);

    // Restart button
    const restartW = 120;
    const restartH = 40;
    const restartX = canvas.width / 2 - restartW / 2;
    const restartY = canvas.height / 2 + 80;

    ctx.fillStyle = "red";
    ctx.fillRect(restartX, restartY, restartW, restartH);
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText("Restart", canvas.width / 2, restartY + 28);

    // Main Menu button (below restart)
    const menuW = 160;
    const menuH = 40;
    const menuX = canvas.width / 2 - menuW / 2;
    const menuY = restartY + restartH + 20;

    ctx.fillStyle = "#2fd1ff";
    ctx.fillRect(menuX, menuY, menuW, menuH);
    ctx.fillStyle = "#022032";
    ctx.font = "18px Arial";
    ctx.fillText("Return to Main Menu", canvas.width / 2, menuY + 26);

    ctx.textAlign = "left";
  }
}

// --- Game Loop ---
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}
gameLoop();

/* --- Menu helpers & UI wiring --- */
const menuEl = document.getElementById("menu");
const menuHighScoreEl = document.getElementById("menuHighScore");

function showMenu() {
  if (menuEl) {
    menuEl.style.display = "flex";
    if (menuHighScoreEl) menuHighScoreEl.textContent = "High Score: " + highScore;
    // also populate the small HUD inside the menu card to avoid overlap with other menu content
    const menuScoreEl = document.getElementById("menuScore");
    const menuSCEl = document.getElementById("menuSC");
    if (menuScoreEl) menuScoreEl.textContent = points;
    if (menuSCEl) menuSCEl.textContent = scBalance;

    // attempt to play the menu music when menu is visible (may be blocked until user gesture)
    tryPlayMenuMusic();
    // ensure gameplay music is paused when menu is shown
    tryPauseGameplayMusic();
  }
}
function hideMenu() {
  if (menuEl) menuEl.style.display = "none";
  // pause menu music when menu hidden (stop background loop)
  tryPauseMenuMusic();
  // start gameplay music if a run is active
  if (gameStarted && !gameOver) {
    tryPlayGameplayMusic();
  }
}

 // --- Pause menu logic ---
 let gamePaused = false;
 const pauseMenuEl = document.getElementById("pauseMenu");
 const pauseHowBtn = document.getElementById("pauseHowBtn");
 const pauseQuitBtn = document.getElementById("pauseQuitBtn");
 const pauseResumeBtn = document.getElementById("pauseResumeBtn");
 
 // track whether a modal was opened while the pause overlay was visible so we can restore paused state on close
 let modalOpenedFromPause = false;

function openPauseMenu() {
  // only allow when playing
  if (!gameStarted || gameOver) return;
  gamePaused = true;
  if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "false");
  // Keep the pause overlay separate from the main menu: do NOT call showMenu()
  // gamePaused will make the game update/draw skip input; HUD will still render unless you prefer to hide it.
}

function closePauseMenu() {
  gamePaused = false;
  if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "true");
  // hide overlay if the main menu isn't supposed to be visible
  if (gameStarted && !gameOver) hideMenu();
  else showMenu();
}

// wire pause buttons if present
if (pauseHowBtn) {
  pauseHowBtn.addEventListener("click", (e) => {
    // open the How modal from the pause overlay without switching to the main menu
    openHowModal();
  });
}
if (pauseQuitBtn) {
  pauseQuitBtn.addEventListener("click", (e) => {
    // merge current run into stored totals before returning to menu
    saveStateAdditive();

    // Immediately return to the main menu from the pause overlay (stop the run)
    if (spawnInterval) {
      clearInterval(spawnInterval);
      spawnInterval = null;
    }
    // stop the game run and reset state
    gameStarted = false;
    gameOver = false;
    gamePaused = false;

    // stop sounds and clear entities
    player.bullets.forEach((b) => {
      if (b.sound) stopAndCleanSound(b.sound);
    });
    player.bullets = [];
    resetAsteroids();

    // close pause overlay and show the main menu
    if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "true");
    showMenu();
  });
}

// Cancel quit: hide confirmation and return to pause UI
const cancelQuitBtn = document.getElementById("cancelQuitBtn");
if (cancelQuitBtn) {
  cancelQuitBtn.addEventListener("click", () => {
    const confirmEl = document.getElementById("pauseConfirm");
    const bodyEl = document.getElementById("pauseBody");
    const rowEl = document.getElementById("pauseRow");
    if (confirmEl && bodyEl && rowEl) {
      confirmEl.style.display = "none";
      bodyEl.style.display = "flex";
      rowEl.style.display = "flex";
    }
  });
}

// Confirm quit: stop the run but keep an in-pause "stopped" menu (do NOT show the main menu)
const confirmQuitBtn = document.getElementById("confirmQuitBtn");
if (confirmQuitBtn) {
  confirmQuitBtn.addEventListener("click", () => {
    // merge current run into stored totals before stopping the run
    saveStateAdditive();

    if (spawnInterval) {
      clearInterval(spawnInterval);
      spawnInterval = null;
    }
    // stop the game run but retain the pause-overlay as an in-pause menu
    gameStarted = false;
    gameOver = false;
    gamePaused = true;

    // stop sounds and reset entities
    player.bullets.forEach((b) => {
      if (b.sound) stopAndCleanSound(b.sound);
    });
    player.bullets = [];
    resetAsteroids();

    // swap panels: hide confirm, show stopped menu
    const confirmEl = document.getElementById("pauseConfirm");
    const stoppedEl = document.getElementById("pauseStoppedMenu");
    const bodyEl = document.getElementById("pauseBody");
    const rowEl = document.getElementById("pauseRow");
    if (confirmEl && stoppedEl && bodyEl && rowEl) {
      confirmEl.style.display = "none";
      bodyEl.style.display = "none";
      rowEl.style.display = "none";
      stoppedEl.style.display = "block";
    }
  });
}

// Actions in the stopped-in-pause menu
const stoppedRestartBtn = document.getElementById("stoppedRestartBtn");
if (stoppedRestartBtn) {
  stoppedRestartBtn.addEventListener("click", () => {
    // restart the run immediately from here
    const menu = document.getElementById("menu");
    if (menu) menu.style.display = "none";
    // clear any existing intervals just in case and start a fresh run
    if (spawnInterval) {
      clearInterval(spawnInterval);
      spawnInterval = null;
    }
    restartGame();
    gameStarted = true;
    gamePaused = false;
    spawnInterval = setInterval(spawnAsteroid, 700);
    // close the pause overlay
    if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "true");
    hideMenu();
  });
}

const stoppedBackToPauseBtn = document.getElementById("stoppedBackToPauseBtn");
if (stoppedBackToPauseBtn) {
  stoppedBackToPauseBtn.addEventListener("click", () => {
    // return from the stopped menu back to the paused controls (still not resuming the run)
    const confirmEl = document.getElementById("pauseConfirm");
    const stoppedEl = document.getElementById("pauseStoppedMenu");
    const bodyEl = document.getElementById("pauseBody");
    const rowEl = document.getElementById("pauseRow");
    if (confirmEl && stoppedEl && bodyEl && rowEl) {
      confirmEl.style.display = "none";
      stoppedEl.style.display = "none";
      bodyEl.style.display = "flex";
      rowEl.style.display = "flex";
      // keep gamePaused true to indicate the UI is a paused overlay
      gamePaused = true;
      if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "false");
      // ensure HUD overlay behavior: showMenu keeps overlay visible while paused
      showMenu();
    }
  });
}

// Resume button: close pause menu and return to gameplay
if (pauseResumeBtn) {
  pauseResumeBtn.addEventListener("click", (e) => {
    closePauseMenu();
  });
}

 // ensure menu is visible at load and shows current highscore
 try {
  // Tutorial prompt flow: ask once per browser (persist choice)
  const tutorialPromptModal = document.getElementById("tutorialPromptModal");
  const tutorialModal = document.getElementById("tutorialModal");
  const startTutorialBtn = document.getElementById("startTutorialBtn");
  const skipTutorialBtn = document.getElementById("skipTutorialBtn");
  const tutorialBody = document.getElementById("tutorialBody");
  const tutorialPrev = document.getElementById("tutorialPrev");
  const tutorialNext = document.getElementById("tutorialNext");
  const tutorialClose = document.getElementById("tutorialClose");

  // Tutorial pages - rewritten to be a concise, step-by-step in-game tutorial with actionable tips.
  const tutorialPages = [
    {
      title: "Basic Controls",
      text: [
        "Move: W / A / S / D or Arrow keys — keep your ship centered and dodge falling asteroids.",
        "Rotate: Q / E — aim your nose to steer bullets and rockets where you want them to go.",
        "Shoot: Space — primary weapon uses the clip. Press R to manually reload or wait for auto-reload when empty.",
        "Rocket: F — fires a consumable rocket that one-shots asteroids and deals heavy damage to enemies."
      ]
    },
    {
      title: "Health & Shields",
      text: [
        "Hull HP is your life. Collisions and enemy fire reduce it — if it reaches 0, the run ends.",
        "Front Shield: nose-only protection (50 HP). It blocks frontal impacts when equipped — toggle with '1'.",
        "Full-Body Shield: omnidirectional (100 HP). Equip to block hits from any direction — also toggled with '1'.",
        "Shields deplete, then recharge after a short delay — manage shield usage and retreat when low."
      ]
    },
    {
      title: "Asteroids & Scoring",
      text: [
        "Small asteroid = +20 Points. Big asteroid = +60 Points.",
        "If asteroids reach the bottom you lose points: small = -10, big = -50.",
        "Use rockets to clear dangerous clusters quickly and save your hull.",
        "First asteroid destroyed unlocks the 'Pew Pew' achievement — try it early!"
      ]
    },
    {
      title: "Enemies & Priority",
      text: [
        "Scouts: Fast, low HP — avoid their rams and pick them off with bullets.",
        "Fighters: Bigger and tougher — focus fire to avoid being overwhelmed.",
        "Healers (Support): They beam-heal allies — eliminate them first to stop enemy sustain.",
        "Frigates: Heavy enemies with shields and a powerful beam — destroy shields before damaging hull."
      ]
    },
    {
      title: "Upgrades & Currency",
      text: [
        "Convert Points → SC at 100 Points = 1 SC in the Upgrades menu; reverse conversion is available too.",
        "Spend SC on Front Shield, Full-Body Shield, Hull Reinforcement (+20), Engine Tuning (+3 speed), and Rockets.",
        "Buying your first permanent upgrade unlocks an achievement — try buying a rocket or hull upgrade.",
        "Hull Reinforcement unlocks Hull Reinforcement 2 when purchased."
      ]
    },
    {
      title: "Achievements — What They Do",
      text: [
        "Open Achievements from the main menu (Achievements button) to see unlocked and locked milestones.",
        "Unlocked achievements can be claimed for SC or Points — press Claim on an unlocked row to collect rewards.",
        "Some achievements unlock automatically (score thresholds or kill counts); others require purchases or actions.",
        "Achievement toasts show briefly in the corner when you unlock something — use the panel to claim rewards and track progress."
      ]
    },
    {
      title: "Shop & Ships — Where to Buy",
      text: [
        "Open Ship from the bottom quick actions to view available craft in the roster.",
        "If a ship shows a price (e.g., Cosmic Striker: 180 SC), press Buy to purchase it (requires enough SC).",
        "Once owned, Select applies that ship immediately — it changes HP, speed and available per-ship upgrades.",
        "Purchased ships appear as owned in the roster; some upgrades are universal while others are per-ship."
      ]
    },
    {
      title: "Buttons Explained (Main Menu)",
      text: [
        "Start — begins a run (hides the menu and spawns asteroids).",
        "How to Play — reopens this tutorial and control reference.",
        "Settings — toggle SFX and adjust menu music volume.",
        "Upgrades — convert Points ↔ SC and buy shields, hull, speed and rockets for selected ship.",
        "Save / Load — create named saves or load them; Save stores your SC, high score and purchases.",
        "Achievements — open the achievements panel to claim rewards and view unlock conditions.",
        "Ship — open the Ship modal to Buy/Select craft; Buy costs SC, Select equips it immediately."
      ]
    },
    {
      title: "Survival Tips",
      text: [
        "Stay mobile: keep moving and avoid corners where asteroids stack.",
        "Use rotation to aim while strafing — Q/E helps you line up shots without changing movement direction.",
        "When shields are low, back off and let them recharge — reckless aggression ends runs early.",
        "Collect crates for ammo and health pickups to stay in the fight longer."
      ]
    },
    {
      title: "Ready to Fly",
      text: [
        "You can skip this tutorial now or open it again from How to Play.",
        "Press Next to continue through steps or Finish to close and return to the menu.",
        "Good luck, pilot — keep an eye on your shields and aim true!"
      ]
    }
  ];

  let tutorialIndex = 0;

  function renderTutorialPage(i) {
    tutorialIndex = Math.max(0, Math.min(tutorialPages.length - 1, i));
    const p = tutorialPages[tutorialIndex];
    if (!tutorialBody) return;

    // Build a game-style step layout with white text for high contrast and quick readability
    const linesHTML = Array.isArray(p.text)
      ? p.text.map(line => `<li style="margin-bottom:8px;font-size:15px;color:#ffffff;line-height:1.35;">${line}</li>`).join("")
      : `<li style="font-size:15px;color:#ffffff;line-height:1.35;">${p.text}</li>`;

    tutorialBody.innerHTML = `
      <h3 style="margin-top:0;color:#ffffff;font-size:18px;">${p.title}</h3>
      <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;">
        <ul style="margin:6px 0 0 18px;padding:0 6px 0 0;list-style: disc;">
          ${linesHTML}
        </ul>
      </div>
      <div style="margin-top:12px;color:#dfe6ff;font-size:13px;">Step ${tutorialIndex + 1} of ${tutorialPages.length}</div>
    `;

    // Prev/Next/Close visibility
    if (tutorialPrev) tutorialPrev.style.display = tutorialIndex > 0 ? "inline-block" : "none";
    if (tutorialNext) tutorialNext.textContent = tutorialIndex < tutorialPages.length - 1 ? "Next" : "Finish";
    if (tutorialClose) tutorialClose.style.display = tutorialIndex === tutorialPages.length - 1 ? "inline-block" : "none";
  }

  function openTutorialPrompt() {
    // Always show the tutorial prompt on load so players are asked each session.
    // (Previously a saved "skip" choice prevented the prompt from appearing.)
    if (tutorialPromptModal) {
      tutorialPromptModal.setAttribute("aria-hidden", "false");
      tutorialPromptModal.style.zIndex = "1600";
    } else {
      try { showWelcomePopup(); } catch (e) {}
      showMenu();
      tryPlayMenuMusic().catch(() => {});
    }
  }

  function closeTutorialPrompt() {
    if (tutorialPromptModal) {
      tutorialPromptModal.setAttribute("aria-hidden", "true");
      tutorialPromptModal.style.zIndex = "";
    }
  }

  function openTutorial() {
    if (tutorialModal) {
      tutorialModal.setAttribute("aria-hidden", "false");
      tutorialModal.style.zIndex = "1605";
    }
    renderTutorialPage(0);
    // pause game input if a run is active
    if (gameStarted && !gameOver) gamePaused = true;
  }

  function closeTutorial() {
    if (tutorialModal) {
      tutorialModal.setAttribute("aria-hidden", "true");
      tutorialModal.style.zIndex = "";
    }
    // mark as seen (do not prompt again by default)
    try { localStorage.setItem("asteroid_shooter_seen_tutorial_v1", "skip"); } catch (e) {}
    // restore menu/game state
    try { showWelcomePopup(); } catch (e) {}
    showMenu();
    tryPlayMenuMusic().catch(() => {});
  }

  // Wire prompt buttons
  if (startTutorialBtn) startTutorialBtn.addEventListener("click", (e) => {
    e.preventDefault();
    closeTutorialPrompt();
    openTutorial();
  });
  if (skipTutorialBtn) skipTutorialBtn.addEventListener("click", (e) => {
    e.preventDefault();
    try { localStorage.setItem("asteroid_shooter_seen_tutorial_v1", "skip"); } catch (err) {}
    closeTutorialPrompt();
    try { showWelcomePopup(); } catch (e) {}
    showMenu();
    tryPlayMenuMusic().catch(() => {});
  });

  // Wire tutorial navigation
  if (tutorialNext) {
    tutorialNext.addEventListener("click", (e) => {
      e.preventDefault();
      if (tutorialIndex < tutorialPages.length - 1) {
        renderTutorialPage(tutorialIndex + 1);
      } else {
        // finished
        closeTutorial();
      }
    });
  }
  if (tutorialPrev) {
    tutorialPrev.addEventListener("click", (e) => {
      e.preventDefault();
      renderTutorialPage(tutorialIndex - 1);
    });
  }
  if (tutorialClose) {
    tutorialClose.addEventListener("click", (e) => {
      e.preventDefault();
      closeTutorial();
    });
  }
  // top-right X close for the tutorial (always available)
  const tutorialTopClose = document.getElementById("tutorialTopClose");
  if (tutorialTopClose) {
    tutorialTopClose.addEventListener("click", (e) => {
      e.preventDefault();
      closeTutorial();
    });
  }

  // clicking outside modals closes them (mirror other modal behaviour)
  if (tutorialPromptModal) {
    tutorialPromptModal.addEventListener("click", (e) => {
      if (e.target === tutorialPromptModal) {
        // treat as skip
        try { localStorage.setItem("asteroid_shooter_seen_tutorial_v1", "skip"); } catch (err) {}
        closeTutorialPrompt();
        try { showWelcomePopup(); } catch (e) {}
        showMenu();
        tryPlayMenuMusic().catch(() => {});
      }
    });
  }
  if (tutorialModal) {
    tutorialModal.addEventListener("click", (e) => {
      if (e.target === tutorialModal) {
        closeTutorial();
      }
    });
  }

  // Show the prompt on initial load
  openTutorialPrompt();
} catch (e) {
  // fallback: show welcome & menu
  try { showWelcomePopup(); } catch (e2) {}
  showMenu();
}
// Attempt to start menu music immediately (may be blocked until user gesture in some browsers)
tryPlayMenuMusic().catch(() => {});

 // --- Achievements button/modal wiring ---
 const achievementsBtn = document.getElementById("achievementsBtn");
 const achievementsModal = document.getElementById("achievementsModal");
 const closeAchievements = document.getElementById("closeAchievements");

 if (achievementsBtn) {
   achievementsBtn.addEventListener("click", (e) => {
     e.preventDefault();
     if (!achievementsModal) return;
     // record if opened from pause so closing restores pause appropriately
     modalOpenedFromPause = !!(pauseMenuEl && pauseMenuEl.getAttribute("aria-hidden") === "false");
     achievementsModal.setAttribute("aria-hidden", "false");
     achievementsModal.style.zIndex = "1320";
     // ensure the achievement status UI is up to date
     updateAchievementsUI();
     // pause the game if running
     if (gameStarted && !gameOver) gamePaused = true;
   });
 }

 if (closeAchievements) {
   closeAchievements.addEventListener("click", () => {
     if (!achievementsModal) return;
     achievementsModal.setAttribute("aria-hidden", "true");
     achievementsModal.style.zIndex = "";
     // if opened from pause, restore pause overlay
     if (modalOpenedFromPause) {
       gamePaused = true;
       if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "false");
       modalOpenedFromPause = false;
       return;
     }
     if (gameStarted && !gameOver) {
       gamePaused = false;
       hideMenu();
     } else {
       showMenu();
     }
   });
 }

 // Achievements category buttons (filtering) wiring
 (function wireAchievementCategories() {
   const btnAll = document.getElementById("achCatAll");
   const btnPoints = document.getElementById("achCatPoints");
   const btnUpgrades = document.getElementById("achCatUpgrades");
   const btnEnemies = document.getElementById("achCatEnemies");
   const buttons = [btnAll, btnPoints, btnUpgrades, btnEnemies];

   function setActiveButton(activeBtn) {
     buttons.forEach((b) => {
       if (!b) return;
       if (b === activeBtn) {
         b.style.boxShadow = "0 8px 30px rgba(0,0,0,0.12)";
         b.style.transform = "translateY(-2px)";
         b.setAttribute("aria-pressed", "true");
       } else {
         b.style.boxShadow = "";
         b.style.transform = "";
         b.setAttribute("aria-pressed", "false");
       }
     });
   }

   function selectCategory(cat) {
     window.currentAchCategory = cat || "all";
     updateAchievementsUI();

     // Apply filtering: show only rows that belong to the selected category
     // map achievement IDs to our DOM row ids
     const rowMap = {
       ps1: "ach-ps1",
       ps2: "ach-ps2",
       ps3: "ach-ps3",
       ps4: "ach-ps4",
       ps5: "ach-ps5",
       ps6: "ach-ps6",
       scout_kill: "ach-scout",
       fighter_kill: "ach-fighter",
       support_kill: "ach-support",
       hunter_killer: "ach-hunter",
       no_mercy: "ach-no-mercy",
       upgraded_firepower: "ach-upgraded-firepower",
       up_first: "ach-up-first",
       hull_reinforcement_2: "ach-hull2"
     };

     const achCategoryMap = {
       // Points achievements (score thresholds)
       ps1: "points", ps2: "points", ps3: "points", ps4: "points", ps5: "points", ps6: "points",
       // Upgrades / shop purchases
       upgraded_firepower: "upgrades", up_first: "upgrades", hull_reinforcement_2: "upgrades",
       // Enemy / kill achievements
       scout_kill: "enemies", fighter_kill: "enemies", support_kill: "enemies",
       hunter_killer: "enemies", no_mercy: "enemies"
     };

     // default behavior: when 'all', show every known row; otherwise hide rows whose mapped category doesn't match
     const active = (window.currentAchCategory || "all").toLowerCase();
     Object.keys(rowMap).forEach((achId) => {
       const rowId = rowMap[achId];
       const rowEl = document.getElementById(rowId);
       if (!rowEl) return;
       if (active === "all") {
         rowEl.style.display = "";
         return;
       }
       const mapped = achCategoryMap[achId] || "all";
       rowEl.style.display = (mapped === active) ? "" : "none";
     });

     // update button visuals
     if (cat === "points") setActiveButton(btnPoints);
     else if (cat === "upgrades") setActiveButton(btnUpgrades);
     else if (cat === "enemies") setActiveButton(btnEnemies);
     else setActiveButton(btnAll);
   }

   if (btnAll) btnAll.addEventListener("click", (e) => { e.preventDefault(); selectCategory("all"); });
   if (btnPoints) btnPoints.addEventListener("click", (e) => { e.preventDefault(); selectCategory("points"); });
   if (btnUpgrades) btnUpgrades.addEventListener("click", (e) => { e.preventDefault(); selectCategory("upgrades"); });
   if (btnEnemies) btnEnemies.addEventListener("click", (e) => { e.preventDefault(); selectCategory("enemies"); });

   // initialize visual state to match default category
   selectCategory(window.currentAchCategory || "all");
 })();

 // close achievements when clicking outside the card
 if (achievementsModal) {
   achievementsModal.addEventListener("click", (e) => {
     if (e.target === achievementsModal) {
       achievementsModal.setAttribute("aria-hidden", "true");
       achievementsModal.style.zIndex = "";
       if (modalOpenedFromPause) {
         gamePaused = true;
         if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "false");
         modalOpenedFromPause = false;
         return;
       }
       if (gameStarted && !gameOver) {
         gamePaused = false;
         hideMenu();
       } else {
         showMenu();
       }
     }
   });
 }

 // --- Achievement UI helpers: update panel, toast, and claim handling ---
 // Current achievements category filter: 'all' | 'points' | 'upgrades' | 'enemies'
 window.currentAchCategory = window.currentAchCategory || "all";

 function updateAchievementsUI() {
   try {
     // determine active category (global can be toggled by UI)
     const activeCat = (window.currentAchCategory || "all").toLowerCase();
     // mapping of achievement ids to categories
     const achCategoryMap = {
       // Points achievements (score thresholds)
       ps1: "points", ps2: "points", ps3: "points", ps4: "points", ps5: "points", ps6: "points",
       // Upgrades / shop purchases
       upgraded_firepower: "upgrades", up_first: "upgrades", hull_reinforcement_2: "upgrades",
       // purchase-related upgrades (hull, shields, engine, rockets)
       // treat these as upgrades if present in registry
       // Enemy / kill achievements
       scout_kill: "enemies", fighter_kill: "enemies", support_kill: "enemies",
       hunter_killer: "enemies", no_mercy: "enemies"
     };

     // helper to show/hide a DOM achievement row based on id and active category
     function setRowVisibility(rowId, achId) {
       const row = document.getElementById(rowId);
       if (!row) return;
       if (!activeCat || activeCat === "all") {
         row.style.display = "";
         return;
       }
       const mapped = achCategoryMap[achId] || "all";
       row.style.display = (mapped === activeCat) ? "" : "none";
     }
     // PS1
     const status1 = document.getElementById("ach-ps1-status");
     const claim1 = document.getElementById("claimPS1Btn");
     const a1 = achievements.ps1;
     if (status1 && claim1 && a1) {
       if (!a1.unlocked) {
         status1.textContent = "Locked";
         status1.style.color = "#076a2f";
         claim1.style.display = "none";
       } else if (!a1.claimed) {
         status1.textContent = "Unlocked";
         status1.style.color = "#076a2f";
         claim1.style.display = "inline-block";
       } else {
         status1.textContent = "Claimed";
         status1.style.color = "#fff";
         status1.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         status1.style.padding = "6px 10px";
         status1.style.borderRadius = "8px";
         status1.style.fontWeight = "800";
         claim1.style.display = "none";
       }
     }

     // PS2
     const status2 = document.getElementById("ach-ps2-status");
     const claim2 = document.getElementById("claimPS2Btn");
     const a2 = achievements.ps2;
     if (status2 && claim2 && a2) {
       if (!a2.unlocked) {
         status2.textContent = "Locked";
         status2.style.color = "#076a2f";
         claim2.style.display = "none";
       } else if (!a2.claimed) {
         status2.textContent = "Unlocked";
         status2.style.color = "#076a2f";
         claim2.style.display = "inline-block";
       } else {
         status2.textContent = "Claimed";
         status2.style.color = "#fff";
         status2.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         status2.style.padding = "6px 10px";
         status2.style.borderRadius = "8px";
         status2.style.fontWeight = "800";
         claim2.style.display = "none";
       }
     }

     // PS3
     const status3 = document.getElementById("ach-ps3-status");
     const claim3 = document.getElementById("claimPS3Btn");
     const a3 = achievements.ps3;
     if (status3 && claim3 && a3) {
       if (!a3.unlocked) {
         status3.textContent = "Locked";
         status3.style.color = "#076a2f";
         claim3.style.display = "none";
       } else if (!a3.claimed) {
         status3.textContent = "Unlocked";
         status3.style.color = "#076a2f";
         claim3.style.display = "inline-block";
       } else {
         status3.textContent = "Claimed";
         status3.style.color = "#fff";
         status3.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         status3.style.padding = "6px 10px";
         status3.style.borderRadius = "8px";
         status3.style.fontWeight = "800";
         claim3.style.display = "none";
       }
     }

     // PS4
     const status4 = document.getElementById("ach-ps4-status");
     const claim4 = document.getElementById("claimPS4Btn");
     const a4 = achievements.ps4;
     if (status4 && claim4 && a4) {
       if (!a4.unlocked) {
         status4.textContent = "Locked";
         status4.style.color = "#076a2f";
         claim4.style.display = "none";
       } else if (!a4.claimed) {
         status4.textContent = "Unlocked";
         status4.style.color = "#076a2f";
         claim4.style.display = "inline-block";
       } else {
         status4.textContent = "Claimed";
         status4.style.color = "#fff";
         status4.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         status4.style.padding = "6px 10px";
         status4.style.borderRadius = "8px";
         status4.style.fontWeight = "800";
         claim4.style.display = "none";
       }
     }

     // PS5
     const status5 = document.getElementById("ach-ps5-status");
     const claim5 = document.getElementById("claimPS5Btn");
     const a5 = achievements.ps5;
     if (status5 && claim5 && a5) {
       if (!a5.unlocked) {
         status5.textContent = "Locked";
         status5.style.color = "#076a2f";
         claim5.style.display = "none";
       } else if (!a5.claimed) {
         status5.textContent = "Unlocked";
         status5.style.color = "#076a2f";
         claim5.style.display = "inline-block";
       } else {
         status5.textContent = "Claimed";
         status5.style.color = "#fff";
         status5.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         status5.style.padding = "6px 10px";
         status5.style.borderRadius = "8px";
         status5.style.fontWeight = "800";
         claim5.style.display = "none";
       }
     }

     // PS6 (new)
     const status6 = document.getElementById("ach-ps6-status");
     const claim6 = document.getElementById("claimPS6Btn");
     const a6 = achievements.ps6;
     if (status6 && claim6 && a6) {
       if (!a6.unlocked) {
         status6.textContent = "Locked";
         status6.style.color = "#076a2f";
         claim6.style.display = "none";
       } else if (!a6.claimed) {
         status6.textContent = "Unlocked";
         status6.style.color = "#076a2f";
         claim6.style.display = "inline-block";
       } else {
         status6.textContent = "Claimed";
         status6.style.color = "#fff";
         status6.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         status6.style.padding = "6px 10px";
         status6.style.borderRadius = "8px";
         status6.style.fontWeight = "800";
         claim6.style.display = "none";
       }
     }

     // Hull Reinforcement II (new) — ensure the achievements panel reflects unlocked/claimed state and shows claim button
     try {
       const statusHull2 = document.getElementById("ach-hull2-status");
       const claimHull2 = document.getElementById("claimHull2Btn");
       const aHull2 = achievements.hull_reinforcement_2 || achievements.hull_reinforcement2 || null;
       if (statusHull2 && claimHull2 && aHull2) {
         if (!aHull2.unlocked) {
           statusHull2.textContent = "Locked";
           statusHull2.style.color = "#076a2f";
           claimHull2.style.display = "none";
         } else if (!aHull2.claimed) {
           statusHull2.textContent = "Unlocked";
           statusHull2.style.color = "#076a2f";
           claimHull2.style.display = "inline-block";
         } else {
           statusHull2.textContent = "Claimed";
           // use the claimed pill style consistent with CSS (.status-pill.claimed)
           statusHull2.classList.add("claimed");
           claimHull2.style.display = "none";
         }
       }
     } catch (e) {
       // non-fatal: keep updating other achievements
     }

     // Hunter Killer
     const statusHunter = document.getElementById("ach-hunter-status");
     const claimHunter = document.getElementById("claimHunterBtn");
     const aHunter = achievements.hunter_killer;
     if (statusHunter && claimHunter && aHunter) {
       if (!aHunter.unlocked) {
         statusHunter.textContent = "Locked";
         statusHunter.style.color = "#076a2f";
         claimHunter.style.display = "none";
       } else if (!aHunter.claimed) {
         statusHunter.textContent = "Unlocked";
         statusHunter.style.color = "#076a2f";
         claimHunter.style.display = "inline-block";
       } else {
         statusHunter.textContent = "Claimed";
         statusHunter.style.color = "#fff";
         statusHunter.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         statusHunter.style.padding = "6px 10px";
         statusHunter.style.borderRadius = "8px";
         statusHunter.style.fontWeight = "800";
         claimHunter.style.display = "none";
       }
     }

     // No Mercy for Healers
     const statusNoMercy = document.getElementById("ach-no-mercy-status");
     const claimNoMercy = document.getElementById("claimNoMercyBtn");
     const aNoMercy = achievements.no_mercy;
     if (statusNoMercy && claimNoMercy && aNoMercy) {
       if (!aNoMercy.unlocked) {
         statusNoMercy.textContent = "Locked";
         statusNoMercy.style.color = "#076a2f";
         claimNoMercy.style.display = "none";
       } else if (!aNoMercy.claimed) {
         statusNoMercy.textContent = "Unlocked";
         statusNoMercy.style.color = "#076a2f";
         claimNoMercy.style.display = "inline-block";
       } else {
         statusNoMercy.textContent = "Claimed";
         statusNoMercy.style.color = "#fff";
         statusNoMercy.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         statusNoMercy.style.padding = "6px 10px";
         statusNoMercy.style.borderRadius = "8px";
         statusNoMercy.style.fontWeight = "800";
         claimNoMercy.style.display = "none";
       }
     }

     // First Scout Kill achievement UI
     const statusScout = document.getElementById("ach-scout-status");
     const claimScout = document.getElementById("claimScoutBtn");
     const aScout = achievements.scout_kill;
     if (statusScout && claimScout && aScout) {
       if (!aScout.unlocked) {
         statusScout.textContent = "Locked";
         statusScout.style.color = "#076a2f";
         claimScout.style.display = "none";
       } else if (!aScout.claimed) {
         statusScout.textContent = "Unlocked";
         statusScout.style.color = "#076a2f";
         claimScout.style.display = "inline-block";
       } else {
         statusScout.textContent = "Claimed";
         statusScout.style.color = "#fff";
         statusScout.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         statusScout.style.padding = "6px 10px";
         statusScout.style.borderRadius = "8px";
         statusScout.style.fontWeight = "800";
         claimScout.style.display = "none";
       }
     }

     // First Fighter Kill achievement UI
     const statusFighter = document.getElementById("ach-fighter-status");
     const claimFighter = document.getElementById("claimFighterBtn");
     const aFighter = achievements.fighter_kill;
     if (statusFighter && claimFighter && aFighter) {
       if (!aFighter.unlocked) {
         statusFighter.textContent = "Locked";
         statusFighter.style.color = "#076a2f";
         claimFighter.style.display = "none";
       } else if (!aFighter.claimed) {
         statusFighter.textContent = "Unlocked";
         statusFighter.style.color = "#076a2f";
         claimFighter.style.display = "inline-block";
       } else {
         statusFighter.textContent = "Claimed";
         statusFighter.style.color = "#fff";
         statusFighter.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         statusFighter.style.padding = "6px 10px";
         statusFighter.style.borderRadius = "8px";
         statusFighter.style.fontWeight = "800";
         claimFighter.style.display = "none";
       }
     }

     // First Frigate Kill achievement UI (new)
     try {
       const statusFrigate = document.getElementById("ach-frigate-status");
       const claimFrigate = document.getElementById("claimFrigateBtn");
       const aFrigate = achievements.frigate_kill;
       if (statusFrigate && claimFrigate && aFrigate) {
         if (!aFrigate.unlocked) {
           statusFrigate.textContent = "Locked";
           statusFrigate.style.color = "#076a2f";
           claimFrigate.style.display = "none";
         } else if (!aFrigate.claimed) {
           statusFrigate.textContent = "Unlocked";
           statusFrigate.style.color = "#076a2f";
           claimFrigate.style.display = "inline-block";
         } else {
           statusFrigate.textContent = "Claimed";
           statusFrigate.style.color = "#fff";
           statusFrigate.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
           statusFrigate.style.padding = "6px 10px";
           statusFrigate.style.borderRadius = "8px";
           statusFrigate.style.fontWeight = "800";
           claimFrigate.style.display = "none";
         }
       }
     } catch (e) {}

     // Terminator achievement UI (new)
     try {
       const statusTerm = document.getElementById("ach-terminator-status");
       const claimTerm = document.getElementById("claimTerminatorBtn");
       const aTerm = achievements.terminator;
       if (statusTerm && claimTerm && aTerm) {
         if (!aTerm.unlocked) {
           statusTerm.textContent = "Locked";
           statusTerm.style.color = "#076a2f";
           claimTerm.style.display = "none";
         } else if (!aTerm.claimed) {
           statusTerm.textContent = "Unlocked";
           statusTerm.style.color = "#076a2f";
           claimTerm.style.display = "inline-block";
         } else {
           statusTerm.textContent = "Claimed";
           statusTerm.style.color = "#fff";
           statusTerm.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
           statusTerm.style.padding = "6px 10px";
           statusTerm.style.borderRadius = "8px";
           statusTerm.style.fontWeight = "800";
           claimTerm.style.display = "none";
         }
       }
     } catch (e) {}

     // First Support (Healer) Kill achievement UI
     const statusSupport = document.getElementById("ach-support-status");
     const claimSupport = document.getElementById("claimSupportBtn");
     const aSupport = achievements.support_kill;
     if (statusSupport && claimSupport && aSupport) {
       if (!aSupport.unlocked) {
         statusSupport.textContent = "Locked";
         statusSupport.style.color = "#076a2f";
         claimSupport.style.display = "none";
       } else if (!aSupport.claimed) {
         statusSupport.textContent = "Unlocked";
         statusSupport.style.color = "#076a2f";
         claimSupport.style.display = "inline-block";
       } else {
         statusSupport.textContent = "Claimed";
         statusSupport.style.color = "#fff";
         statusSupport.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         statusSupport.style.padding = "6px 10px";
         statusSupport.style.borderRadius = "8px";
         statusSupport.style.fontWeight = "800";
         claimSupport.style.display = "none";
       }
     }

     // Pew Pew achievement UI (shoot down your first asteroid)
     try {
       const statusPew = document.getElementById("ach-pew-status");
       const claimPew = document.getElementById("claimPewBtn");
       const aPew = achievements.pew_pew;
       if (statusPew && claimPew && aPew) {
         if (!aPew.unlocked) {
           statusPew.textContent = "Locked";
           statusPew.style.color = "#076a2f";
           claimPew.style.display = "none";
         } else if (!aPew.claimed) {
           statusPew.textContent = "Unlocked";
           statusPew.style.color = "#076a2f";
           claimPew.style.display = "inline-block";
         } else {
           statusPew.textContent = "Claimed";
           statusPew.style.color = "#fff";
           statusPew.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
           statusPew.style.padding = "6px 10px";
           statusPew.style.borderRadius = "8px";
           statusPew.style.fontWeight = "800";
           claimPew.style.display = "none";
         }
       }
     } catch (e) {}

     // Upgraded Firepower (buy-first-rocket) UI — create row dynamically if modal doesn't contain it
     try {
       let statusUpg = document.getElementById("ach-upgraded-firepower-status");
       let claimUpg = document.getElementById("claimUpgradedFirepowerBtn");
       let rowUpg = document.getElementById("ach-upgraded-firepower");
       // If the achievements modal doesn't contain the DOM entry, insert a minimal row so the UI can show status/claim.
       if (!rowUpg) {
         const achList = document.getElementById("achList");
         if (achList) {
           const wrapper = document.createElement("div");
           wrapper.id = "ach-upgraded-firepower";
           wrapper.style.cssText = "display:flex;align-items:center;gap:12px;padding:8px;border-radius:8px;background:rgba(0,0,0,0.03);";
           wrapper.innerHTML = `
             <img id="ach-upgraded-firepower-img" src="rocket upgrade.png" alt="Upgraded Firepower" style="width:56px;height:56px;image-rendering:pixelated;border-radius:6px;border:1px solid rgba(0,0,0,0.06);cursor:pointer;" />
             <div style="flex:1;">
               <div style="font-weight:700;color:#2b2b2b;">Upgraded Firepower</div>
               <div id="ach-upgraded-firepower-short" style="font-size:13px;color:#333;">Buy your first Rocket. Reward: 6 SC.</div>
               <div id="ach-upgraded-firepower-desc" style="display:none;margin-top:6px;font-size:13px;color:#111;background:rgba(255,255,255,0.85);padding:8px;border-radius:6px;">
                 oooooo i see you getting stronger guns eh
               </div>
             </div>
             <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
               <div id="ach-upgraded-firepower-status" class="status-pill" style="display:inline-block;background:rgba(0,0,0,0);color:#076a2f;padding:6px 8px;border-radius:8px;font-weight:700;font-size:12px;">Locked</div>
               <button id="claimUpgradedFirepowerBtn" class="btn" style="min-width:96px;padding:6px 10px;border-radius:8px;background:linear-gradient(180deg,#ffd86b 0%,#ffc107 100%);color:#2b1900;font-weight:700;display:none;">Claim</button>
             </div>
           `;
           achList.appendChild(wrapper);
           // wire the dynamic description toggling (click on icon)
           const img = wrapper.querySelector("#ach-upgraded-firepower-img");
           if (img) {
             img.addEventListener("click", () => {
               const dEl = document.getElementById("ach-upgraded-firepower-desc");
               if (!dEl) return;
               dEl.style.display = dEl.style.display === "none" || dEl.style.display === "" ? "block" : "none";
             });
           }
           statusUpg = document.getElementById("ach-upgraded-firepower-status");
           claimUpg = document.getElementById("claimUpgradedFirepowerBtn");
         }
       }

       const aUpg = achievements.upgraded_firepower;
       if (statusUpg && claimUpg && aUpg) {
         if (!aUpg.unlocked) {
           statusUpg.textContent = "Locked";
           statusUpg.style.color = "#076a2f";
           claimUpg.style.display = "none";
         } else if (!aUpg.claimed) {
           statusUpg.textContent = "Unlocked";
           statusUpg.style.color = "#076a2f";
           claimUpg.style.display = "inline-block";
         } else {
           statusUpg.textContent = "Claimed";
           statusUpg.style.color = "#fff";
           statusUpg.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
           statusUpg.style.padding = "6px 10px";
           statusUpg.style.borderRadius = "8px";
           statusUpg.style.fontWeight = "800";
           claimUpg.style.display = "none";
         }
       }

       // Upgraded — First Upgrade UI (static row included in HTML) - update its status/claim visibility
       try {
         const statusUpFirst = document.getElementById("ach-up-first-status");
         const claimUpFirst = document.getElementById("claimUpFirstBtn");
         const aUpFirst = achievements.up_first;
         if (statusUpFirst && claimUpFirst && aUpFirst) {
           if (!aUpFirst.unlocked) {
             statusUpFirst.textContent = "Locked";
             statusUpFirst.style.color = "#076a2f";
             claimUpFirst.style.display = "none";
           } else if (!aUpFirst.claimed) {
             statusUpFirst.textContent = "Unlocked";
             statusUpFirst.style.color = "#076a2f";
             claimUpFirst.style.display = "inline-block";
           } else {
             statusUpFirst.textContent = "Claimed";
             statusUpFirst.style.color = "#fff";
             statusUpFirst.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
             statusUpFirst.style.padding = "6px 10px";
             statusUpFirst.style.borderRadius = "8px";
             statusUpFirst.style.fontWeight = "800";
             claimUpFirst.style.display = "none";
           }
         }
       } catch (e) {}
     } catch (e) {}

   } catch (e) {}
 }

 // create a temporary bottom-right toast similar to Steam achievements
 function showAchievementToast(ach) {
   try {
     if (!ach || !ach.id) return;
     // avoid duplicate toasts
     const existing = document.getElementById("ach-toast-" + ach.id);
     if (existing) return;

     const toast = document.createElement("div");
     toast.id = "ach-toast-" + ach.id;

     // Inline styles to ensure the toast is always visible above overlays
     toast.style.position = "fixed";
     toast.style.right = "18px";
     toast.style.bottom = "18px";
     // very high z-index to guarantee it's above modals/menus
     toast.style.zIndex = "100000";
     toast.style.display = "flex";
     toast.style.alignItems = "center";
     toast.style.gap = "12px";
     toast.style.padding = "12px 14px";
     toast.style.borderRadius = "10px";
     toast.style.background = "linear-gradient(180deg,#fffef8, #f2edda)";
     toast.style.boxShadow = "0 12px 36px rgba(0,0,0,0.55)";
     toast.style.color = "#2b2b2b";
     toast.style.pointerEvents = "auto"; // allow the toast to be interactive if needed
     toast.style.opacity = "0";
     toast.style.transform = "translateY(8px)";
     toast.style.transition = "transform 260ms cubic-bezier(.2,.9,.2,1), opacity 260ms ease";

     const img = document.createElement("img");
     // pick a reasonable icon for the achievement (fallback to a simple PS icon)
     const map = {
       ps2: "ps 2.png",
       ps3: "ps 3.png",
       ps4: "ps 4.png",
       ps5: "ps 5 .png",
       ps6: "ps 6 .png",
       hunter_killer: "hunter killer achievment.png",
       no_mercy: "no mercy for healers achievment.png",
       upgraded_firepower: "rocket upgrade.png",
       up_first: "up 1 .png",
       hull_reinforcement_2: "Hull reinforcment 2.png",
       scout_kill: "Nairan - Scout - Base.png",
       fighter_kill: "Nairan - Fighter - Base.png",
       support_kill: "Nairan - Support Ship - Base.png",
       // new frigate achievement icon (use the frigate ship sprite)
       frigate_kill: "Nairan - Frigate - Base.png",
       // Terminator uses the first frigate kill icon per request
       terminator: "first frigate kill.png",
       // pew pew icon uses the provided asset (player bullet / asteroid-kill icon)
       pew_pew: "asset.png",
     };
     img.src = map[ach.id] || "ps 1 .png";
     img.style.width = "56px";
     img.style.height = "56px";
     img.style.imageRendering = "pixelated";
     img.style.borderRadius = "6px";
     img.style.border = "1px solid rgba(0,0,0,0.06)";
     img.alt = ach.name || "Achievement";

     const textWrap = document.createElement("div");
     textWrap.style.display = "flex";
     textWrap.style.flexDirection = "column";
     textWrap.style.gap = "6px";
     textWrap.style.fontWeight = "700";

     const title = document.createElement("div");
     title.innerText = "Achievement Unlocked: " + (ach.name || "Unknown");
     title.style.fontSize = "14px";
     title.style.color = "#2b2b2b";

     const desc = document.createElement("div");
     desc.innerText = ach.description || ach.desc || "";
     desc.style.fontSize = "12px";
     desc.style.fontWeight = "600";
     desc.style.color = "#4a4a4a";
     desc.style.maxWidth = "320px";
     desc.style.lineHeight = "1.2";

     textWrap.appendChild(title);
     if (desc.innerText) textWrap.appendChild(desc);

     toast.appendChild(img);
     toast.appendChild(textWrap);

     // Insert toast at the end of body so it's rendered above most UI
     document.body.appendChild(toast);

     // Force reflow then animate in
     // eslint-disable-next-line no-unused-expressions
     toast.offsetHeight;
     toast.style.opacity = "1";
     toast.style.transform = "translateY(0)";

     // Auto-hide after 3.5s with a smooth fade & slide
     const hideAfter = 3500;
     setTimeout(() => {
       try {
         toast.style.transition = "transform 360ms ease, opacity 360ms ease";
         toast.style.transform = "translateY(10px)";
         toast.style.opacity = "0";
         setTimeout(() => {
           try { toast.remove(); } catch (e) {}
         }, 380);
       } catch (e) {
         try { toast.remove(); } catch (e) {}
       }
     }, hideAfter);
   } catch (e) {
     console.warn("Failed to show achievement toast:", e);
   }
 }

 // Claim button wiring (listen globally since the modal content may be re-rendered)
 document.addEventListener("click", (e) => {
   const target = e.target;
   if (!target) return;

   // Click on achievement icon (or any element inside it): toggle its extended description.
   // This is a resilient handler that looks up the nearest ancestor id ending with "-img"
   // and toggles the corresponding "-desc" element (replace suffix).
   try {
     // find the nearest ancestor (or self) whose id ends with "-img"
     let el = target;
     while (el && el !== document) {
       if (el.id && typeof el.id === "string" && el.id.endsWith("-img")) break;
       el = el.parentElement;
     }
     if (el && el.id && el.id.endsWith("-img")) {
       const descId = el.id.replace(/-img$/, "-desc");
       const desc = document.getElementById(descId);
       if (desc) {
         desc.style.display = (desc.style.display === "none" || desc.style.display === "") ? "block" : "none";
       } else {
         // fallback mapping for any nonstandard ids (e.g., up_first)
         const fallbackMap = {
           "ach-up-first-img": "ach-up-first-desc",
           "ach-upgraded-firepower-img": "ach-upgraded-firepower-desc"
         };
         const fb = fallbackMap[el.id];
         if (fb) {
           const d = document.getElementById(fb);
           if (d) d.style.display = (d.style.display === "none" || d.style.display === "") ? "block" : "none";
         }
       }
       return;
     }
   } catch (err) {}

   // Claim PS1
   if (target.id === "claimPS1Btn") {
     const a = achievements.ps1;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 0)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 0) + " SC for " + a.name + "!";
       // persist claimed state immediately so it cannot be claimed again after reload
       try { saveState(); } catch (e) {}
     }
   }

   // Claim PS2
   if (target.id === "claimPS2Btn") {
     const a = achievements.ps2;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 0)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 0) + " SC for " + a.name + "!";
       // persist claimed state immediately
       try { saveState(); } catch (e) {}
     }
   }

   // Claim PS3
   if (target.id === "claimPS3Btn") {
     const a = achievements.ps3;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 0)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 0) + " SC for " + a.name + "!";
       saveState();
     }
   }

   // Claim PS4
   if (target.id === "claimPS4Btn") {
     const a = achievements.ps4;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 0)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 0) + " SC for " + a.name + "!";
       saveState();
     }
   }

   // Claim PS5
   if (target.id === "claimPS5Btn") {
     const a = achievements.ps5;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 0)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 0) + " SC for " + a.name + "!";
       saveState();
     }
   }

   // Claim PS6 (new): adds points (Score) rather than SC
   if (target.id === "claimPS6Btn") {
     const a = achievements.ps6;
     if (a && a.unlocked && !a.claimed) {
       // award configured points (fallback 55)
       const pts = typeof a.rewardPoints === "number" ? a.rewardPoints : 55;
       score = Math.max(0, Math.floor(score + pts));
       a.claimed = true;
       updateAchievementsUI();
       const menuScoreEl = document.getElementById("menuScore");
       if (menuScoreEl) menuScoreEl.textContent = score;
       if (convertHint) convertHint.textContent = "Claimed " + pts + " Points for " + a.name + "!";
       // persist additive totals (so claimed points do not vanish on reload)
       saveState();
     }
   }

   // Claim Hunter Killer: awards SC
   if (target.id === "claimHunterBtn") {
     const a = achievements.hunter_killer;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 40)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 40) + " SC for " + a.name + "!";
       // persist claimed state immediately
       try { saveState(); } catch (e) {}
     }
   }

   // Claim No Mercy for Healers: awards SC
   if (target.id === "claimNoMercyBtn") {
     const a = achievements.no_mercy;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 30)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 30) + " SC for " + a.name + "!";
       // persist claimed state immediately
       try { saveState(); } catch (e) {}
     }
   }

   // Claim First Scout Kill
   if (target.id === "claimScoutBtn") {
     const a = achievements.scout_kill;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 0)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 0) + " SC for " + a.name + "!";
       saveState();
     }
   }

   // Claim First Fighter Kill
   if (target.id === "claimFighterBtn") {
     const a = achievements.fighter_kill;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 0)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 0) + " SC for " + a.name + "!";
       saveState();
     }
   }

   // Claim First Frigate Kill (new)
   if (target.id === "claimFrigateBtn") {
     const a = achievements.frigate_kill;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 50)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 50) + " SC for " + a.name + "!";
       // persist immediately so it cannot be claimed again after reload
       try { saveState(); } catch (e) {}
     }
   }

   // Claim Terminator (new)
   if (target.id === "claimTerminatorBtn") {
     const a = achievements.terminator;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 120)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 120) + " SC for " + a.name + "!";
       // persist immediately
       try { saveState(); } catch (e) {}
     }
   }

   // Claim First Support (Healer) Kill
   if (target.id === "claimSupportBtn") {
     const a = achievements.support_kill;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 0)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 0) + " SC for " + a.name + "!";
       saveState();
     }
   }

   // Claim Pew Pew (shoot first asteroid)
   if (target.id === "claimPewBtn") {
     const a = achievements.pew_pew;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 1)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 1) + " SC for " + a.name + "!";
       // persist immediately
       try { saveState(); } catch (e) {}
     }
   }

   // Claim Upgraded Firepower (buy-first-rocket): awards 6 SC
   if (target.id === "claimUpgradedFirepowerBtn") {
     const a = achievements.upgraded_firepower;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 6)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 6) + " SC for " + a.name + "!";
       // persist claimed state immediately
       try { saveState(); } catch (e) {}
     }
   }
 
   // Claim Hull Reinforcement II: awards 60 SC
   if (target.id === "claimHull2Btn") {
     const a = achievements.hull_reinforcement_2;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 60)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 60) + " SC for " + a.name + "!";
       // persist claimed state immediately
       try { saveState(); } catch (e) {}
     }
   }

   // Claim Upgraded — First Upgrade: awards 2 SC
   if (target.id === "claimUpFirstBtn") {
     const a = achievements.up_first;
     if (a && a.unlocked && !a.claimed) {
       scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 2)));
       a.claimed = true;
       updateAchievementsUI();
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = "Claimed " + (a.rewardSC || 2) + " SC for " + a.name + "!";
       // persist claimed state immediately
       try { saveState(); } catch (e) {}
     }
   }
 });

 // Achievement check: call from update() to auto-unlock on threshold
 function checkAchievements() {
   try {
     for (const k in achievements) {
       if (!Object.prototype.hasOwnProperty.call(achievements, k)) continue;
       const a = achievements[k];
       if (!a) continue;
       if (!a.unlocked && typeof a.unlockThreshold === "number" && score >= a.unlockThreshold) {
         a.unlocked = true;
         showAchievementToast(a);
         updateAchievementsUI();
       }
     }

     // Unlock by kill counts for the new kill-based achievements
     try {
       // first scout kill
       if (achievements.scout_kill && !achievements.scout_kill.unlocked && (killCounts && typeof killCounts.scout === "number" && killCounts.scout >= 1)) {
         achievements.scout_kill.unlocked = true;
         showAchievementToast(achievements.scout_kill);
         updateAchievementsUI();
       }
       // first fighter kill
       if (achievements.fighter_kill && !achievements.fighter_kill.unlocked && (killCounts && typeof killCounts.fighter === "number" && killCounts.fighter >= 1)) {
         achievements.fighter_kill.unlocked = true;
         showAchievementToast(achievements.fighter_kill);
         updateAchievementsUI();
       }
       // first support (healer) kill
       if (achievements.support_kill && !achievements.support_kill.unlocked && (killCounts && typeof killCounts.healer === "number" && killCounts.healer >= 1)) {
         achievements.support_kill.unlocked = true;
         showAchievementToast(achievements.support_kill);
         updateAchievementsUI();
       }

       // first frigate kill (new)
       if (achievements.frigate_kill && !achievements.frigate_kill.unlocked && (killCounts && typeof killCounts.frigate === "number" && killCounts.frigate >= 1)) {
         achievements.frigate_kill.unlocked = true;
         showAchievementToast(achievements.frigate_kill);
         updateAchievementsUI();
       }

       // Terminator: unlock when 10 frigates killed
       if (achievements.terminator && !achievements.terminator.unlocked && (killCounts && typeof killCounts.frigate === "number" && killCounts.frigate >= 10)) {
         achievements.terminator.unlocked = true;
         showAchievementToast(achievements.terminator);
         updateAchievementsUI();
       }

       // Hunter Killer: unlock when both 30+ scouts and 30+ fighters killed
       if (achievements.hunter_killer && !achievements.hunter_killer.unlocked) {
         const scouts = (killCounts && typeof killCounts.scout === "number") ? killCounts.scout : 0;
         const fighters = (killCounts && typeof killCounts.fighter === "number") ? killCounts.fighter : 0;
         if (scouts >= 30 && fighters >= 30) {
           achievements.hunter_killer.unlocked = true;
           showAchievementToast(achievements.hunter_killer);
           updateAchievementsUI();
         }
       }

       // No Mercy for Healers: unlock when 30+ healers killed
       if (achievements.no_mercy && !achievements.no_mercy.unlocked) {
         const healers = (killCounts && typeof killCounts.healer === "number") ? killCounts.healer : 0;
         if (healers >= 30) {
           achievements.no_mercy.unlocked = true;
           showAchievementToast(achievements.no_mercy);
           updateAchievementsUI();
         }
       }

       // Upgraded Firepower: unlock when player gains at least one rocket (first purchase)
       try {
         if (achievements.upgraded_firepower && !achievements.upgraded_firepower.unlocked) {
           const rocketsOwned = (rocketUpgrade && typeof rocketUpgrade.count === "number") ? rocketUpgrade.count : 0;
           if (rocketsOwned >= 1) {
             achievements.upgraded_firepower.unlocked = true;
             showAchievementToast(achievements.upgraded_firepower);
             updateAchievementsUI();
           }
         }

         // Pew Pew: unlock when player destroys at least one asteroid
         try {
           if (achievements.pew_pew && !achievements.pew_pew.unlocked) {
             const destroyed = (typeof asteroidsDestroyed === "number") ? asteroidsDestroyed : (asteroidsDestroyed || 0);
             if (destroyed >= 1) {
               achievements.pew_pew.unlocked = true;
               showAchievementToast(achievements.pew_pew);
               updateAchievementsUI();
             }
           }
         } catch (e) {}

         // Hull Reinforcement II: unlock when hullUpgrade2 purchased
         if (achievements.hull_reinforcement_2 && !achievements.hull_reinforcement_2.unlocked) {
           if (typeof hullUpgrade2 === "object" && !!hullUpgrade2.purchased) {
             achievements.hull_reinforcement_2.unlocked = true;
             showAchievementToast(achievements.hull_reinforcement_2);
             updateAchievementsUI();
           }
         }
       } catch (e) {}
     } catch (e) {}
   } catch (e) {}
 }

 // ensure checkAchievements is invoked each update tick by injecting a small call into update()
 const _origUpdate = update;
 update = function () {
   try {
     checkAchievements();
   } catch (e) {}
   return _origUpdate();
 };

 // --- Encyclopedia (book-style) modal logic ---
// pages: 0 = contents/Scout page (we'll show Scout on page 1 and Fighter on page 2)
const encyclopediaBtn = document.getElementById("encyclopediaBtn");
const encyclopediaModal = document.getElementById("encyclopediaModal");
const closeEncy = document.getElementById("closeEncy");
const encyPrev = document.getElementById("encyPrev");
const encyNext = document.getElementById("encyNext");
const encyRight = document.getElementById("encyPageRight");
const encyIndicator = document.getElementById("encyPageIndicator");

 // --- Ship modal wiring (quick stats modal similar style to encyclopedia) ---
 const shipBtn = document.getElementById("shipBtn");
 const shipModal = document.getElementById("shipModal");
 const closeShip = document.getElementById("closeShip");
 const shipHpEl = document.getElementById("shipHp");
 const shipSpeedEl = document.getElementById("shipSpeed");
 const shipArmorEl = document.getElementById("shipArmor");
 const shipIconEl = document.getElementById("shipIcon");
 
 // New: ship roster (pages) including the newly provided ship sprite
 const shipRoster = [
   {
     id: "basic",
     // starter ship (default)
     name: "Starter Ship",
     img: "Main Ship - Base - Full health.png",
     hp: 100,
     damage: 10,
     price: 0,
     owned: true,
     // per-ship upgrades state (separate from global upgrades)
     upgrades: {
       frontShield: false,
       fullShield: false,
       hull: false,
       hull2: false,
       speed: false,
       rockets: 0,
     },
     // updated description
     description: "an upgraded ship with more durability and speed for more advanced pilots.",
   },
   {
     id: "cosmic2",
     name: "Cosmic Striker",
     img: "ship 2 cosmic shooters.png",
     hp: 180,
     speed: 10,
     damage: 30,
     price: 180,
     owned: false,
     upgrades: {
       frontShield: false,
       fullShield: false,
       hull: false,
       hull2: false,
       speed: false,
       rockets: 0,
     },
     description: "an advanced ship for more advanced pilots",
   }
 ];
 // load persisted state now that shipRoster is defined (so per-ship ownership is merged into the roster)
 loadState();
 // currently viewed ship page index in the Ship modal
 let shipPageIndex = 0;
 // currently selected ship id (the one player chooses to use)
 window.currentShipId = window.currentShipId || "basic";
 
 // helper to get roster entry by id
 function getShipById(id) {
   return shipRoster.find(s => s.id === id) || shipRoster[0];
 }

 // data for pages (1-based indexing for human-friendly display)
 const encyclopediaPages = [
   // Page 1: Scout details
   {
     title: "Scout",
     subtitle: "Nairan Scout",
     imgSrc: "Nairan - Scout - Base.png",
     stats: {
       HP: 100,
       Shield: 0,
       Damage: 10,
       Points: 50,
       SpawnAt: `${enemySpawnScoreThreshold} Score`,
       Description: "Light, agile attacker that pursues the player. Fast but fragile; will ram or shoot. (Kills award 50 points)"
     }
   },
   // Page 2: Fighter details
   {
     title: "Fighter",
     subtitle: "Nairan Fighter",
     imgSrc: "Nairan - Fighter - Base.png",
     stats: {
       HP: 150,
       Shield: 0,
       Damage: 20,
       Points: 100,
       SpawnAt: `${fighterSpawnScoreThreshold} Score`,
       Description: "Heavily armed fighter with more health and stronger rams, spawns less frequently but is tougher. (Kills award 100 points)"
     }
   },

   // Page 3: Support Healer (new)
   {
     title: "Support Healer",
     subtitle: "Nairan Support Ship",
     imgSrc: "Nairan - Support Ship - Base.png",
     stats: {
       HP: 120,
       Shield: 0,
       Damage: 5,
       Points: 50,
       SpawnAt: `${healerSpawnScoreThreshold} Score`,
       Description: "A support ship that accompanies another enemy and beams healing to nearby allied ships (+30 HP per heal). Fires in bursts of 6 beams then a short reload; prioritize it to prevent allied ships being restored."
     }
   },

   // NEW: Frigate (heavy enemy) — inserted after Support Healer
   {
     title: "Frigate",
     subtitle: "Nairan Frigate (Heavy)",
     imgSrc: "Nairan - Frigate - Base.png",
     stats: {
       HP: 180,
       Shield: 180,
       Damage: 30,
       Points: 300,
       SpawnAt: `${frigateSpawnScoreThreshold} Score`,
       Description: "Large, durable frigate that uses a 180-HP energy shield and advanced pursuit pathfinding; fires rockets and a powerful ray every 10s — take shields down first."
     }
   },

   // Page 4: Engine Tuning (speed upgrade)
   {
     title: "Engine Tuning",
     subtitle: "Permanent Speed Upgrade",
     imgSrc: "Main Ship - Base - Full health.png",
     stats: {
       HP: "—",
       Shield: 0,
       Damage: "—",
       Description: "Engine Tuning permanently increases your ship's base speed by +3. Costs 10 SC and applies immediately to current and future runs to make maneuvering and dodging easier."
     }
   },
   // Page 4: Upgrades overview (book contents entry)
   {
     title: "Upgrades",
     subtitle: "Shields & Hull Reinforcement",
     imgSrc: "shield 1.png",
     stats: {
       Shield: 0,
       FrontShield: {
         Price: "10 SC",
         HP: 50,
         Description: "Overview: Shields and hull upgrades increase survivability. See individual entries for details."
       }
     }
   },

   // Page 5: Front Shield (detailed entry)
   {
     title: "Front Shield",
     subtitle: "Nose-Mounted Frontal Shield",
     imgSrc: "shield 1.png",
     stats: {
       HP: 50,
       Shield: 0,
       Damage: 0,
       Description: "A nose-mounted shield that only absorbs frontal impacts. Provides 50 shield HP; must be purchased in Upgrades and equipped, then toggled with '1' during a run. Depletes when hit and will recharge after a short delay."
     }
   },

   // Page 6: Full-Body Shield (detailed entry)
   {
     title: "Full-Body Shield",
     subtitle: "Omnidirectional Shield",
     imgSrc: "shield 1.png",
     stats: {
       HP: 100,
       Shield: 0,
       Damage: 0,
       Description: "A full-body energy shield that protects the ship from all directions. Provides 100 shield HP when active; depletes on damage and begins recharging after a longer delay. Purchased and equipped in Upgrades, toggle with '1' during a run."
     }
   },

   // Page 7: Hull Reinforcement (detailed entry)
   {
     title: "Hull Reinforcement",
     subtitle: "Permanent Hull Upgrade",
     imgSrc: "Main Ship - Base - Full health.png",
     stats: {
       HP: "+20 max",
       Shield: 0,
       Damage: 0,
       Description: "A permanent upgrade to the ship's hull that increases maximum hull HP by +20. This raises both max and current HP when purchased and persists across runs. Costs 20 SC. Purchasing this unlocks Hull Reinforcement 2 (adds +40 max HP) which will become available for 35 SC."
     }
   },

   // Page 9: Rocket Upgrade (consumable)
   {
     title: "Rocket Upgrade",
     subtitle: "Consumable Rocket Charge",
     imgSrc: "rocket upgrade.png",
     stats: {
       HP: "—",
       Shield: 0,
       Damage: "25 to shields, 20 to hull",
       Points: "—",
       SpawnAt: "Available in Upgrades shop",
       Description: "A consumable rocket charge that deals 25 damage to shields and 20 damage to hull when used; stackable up to 100. Purchase in Upgrades for 2 SC per charge and carry them into runs."
     }
   },

   // Page 10: Hull Reinforcement 2 (locked until Hull Reinforcement is purchased)
   {
     title: "Hull Reinforcement 2",
     subtitle: "Advanced Hull Upgrade",
     imgSrc: "Main Ship - Base - Full health.png",
     stats: {
       HP: "+40 max",
       Shield: 0,
       Damage: 0,
       Price: "35 SC",
       Requirements: "Requires Hull Reinforcement (Page 7) to be purchased first.",
       Description: "A powerful hull reinforcement that permanently increases maximum hull HP by +40. This upgrade becomes available after purchasing Hull Reinforcement and costs 35 SC."
     }
   }
 ];

let encyIndex = 0; // 0 = contents-left with page1 on right; encyIndex represents current right-page (0..pages.length-1)

 // helper to render right page content
 function renderEncyPage(idx) {
   const p = encyclopediaPages[idx];
   if (!p) {
     encyRight.innerHTML = "<p style='color:#333;'>No entry.</p>";
     encyIndicator.textContent = `Page ${idx+1} / ${encyclopediaPages.length}`;
     return;
   }

   // determine kill count for this entry (map human-friendly titles to internal killCounts keys)
   const titleKey = (p.title || "").toLowerCase();
   // map common encyclopedia titles to internal killCounts keys
   const titleToKey = {
     "scout": "scout",
     "nairan scout": "scout",
     "fighter": "fighter",
     "nairan fighter": "fighter",
     "support healer": "healer",
     "nairan support ship": "healer",
     "support": "healer",
     "support ship": "healer"
   };
   const mappedKey = titleToKey[titleKey] || titleKey.replace(/\s+/g, "");
   const killed = (killCounts && typeof killCounts[mappedKey] === "number") ? killCounts[mappedKey] : 0;

   encyRight.innerHTML = `
     <div style="position:relative;min-height:160px;">
       <div style="display:flex;gap:12px;align-items:flex-start;">
         <div style="width:120px;flex-shrink:0;">
           <img src="${p.imgSrc}" alt="${p.title}" style="width:120px;height:120px;image-rendering:pixelated;display:block;border-radius:6px;border:1px solid rgba(0,0,0,0.06);" />
         </div>
         <div style="flex:1;">
           <h3 style="margin:0 0 6px 0;color:#2b2b2b;">${p.title}</h3>
           <div style="color:#333;font-size:14px;margin-bottom:8px;">${p.subtitle}</div>
           <div style="background:rgba(0,0,0,0.03);padding:8px;border-radius:6px;">
             <div style="color:#222;margin-bottom:6px;"><strong>HP:</strong> ${p.stats.HP}</div>
             ${typeof p.stats.Shield !== "undefined" ? `<div style="color:#222;margin-bottom:6px;"><strong>Shield:</strong> ${p.stats.Shield}</div>` : ""}
             <div style="color:#222;margin-bottom:6px;"><strong>Damage:</strong> ${p.stats.Damage}</div>
             ${typeof p.stats.Points !== "undefined" ? `<div style="color:#222;margin-bottom:6px;"><strong>Points:</strong> ${p.stats.Points}</div>` : ""}
             ${typeof p.stats.SpawnAt !== "undefined" ? `<div style="color:#222;margin-bottom:6px;"><strong>Appears At:</strong> ${p.stats.SpawnAt}</div>` : ""}
             <div style="color:#222;margin-bottom:6px;"><strong>Killed:</strong> ${killed}</div>
             <div style="color:#222;margin-top:6px;"><strong>Description:</strong> ${p.stats.Description}</div>
           </div>
         </div>
       </div>
     </div>
   `;
   // keep the bottom page indicator in sync as well
   encyIndicator.textContent = `Page ${idx+1} / ${encyclopediaPages.length}`;
 }

// open encyclopedia modal
function openEncyclopedia() {
  if (!encyclopediaModal) return;
  // record whether we opened from the pause overlay so close can restore pause
  modalOpenedFromPause = !!(pauseMenuEl && pauseMenuEl.getAttribute("aria-hidden") === "false");
  encyclopediaModal.setAttribute("aria-hidden", "false");
  encyclopediaModal.style.zIndex = "1300";
  // pause the game input if playing
  if (gameStarted && !gameOver) gamePaused = true;
  // default to first entry (Scout)
  encyIndex = 0;
  renderEncyPage(encyIndex);
}

 // open ship modal (reads current player stats and shows icon)
 function openShipModal() {
   if (!shipModal) return;
   // remember if we opened from pause so close restores pause overlay
   modalOpenedFromPause = !!(pauseMenuEl && pauseMenuEl.getAttribute("aria-hidden") === "false");
   // populate with live stats
   try {
     shipHpEl.textContent = Math.round(player.maxHealth || 100);
     shipSpeedEl.textContent = player.speed || 0;
     shipArmorEl.textContent = 0; // basic ship has zero armor
     // ensure icon uses the current full-health ship image (or fallback)
     if (currentShipImage && currentShipImage()) {
       shipIconEl.src = currentShipImage().src || "Main Ship - Base - Full health.png";
     }

     // Update upgrades list visuals in the ship modal to reflect owned/unlocked state
     const elFront = document.getElementById("shipUpgradeFront");
     const elFull = document.getElementById("shipUpgradeFull");
     const elHull = document.getElementById("shipUpgradeHull");
     const elHull2 = document.getElementById("shipUpgradeHull2");
     const elSpeed = document.getElementById("shipUpgradeSpeed");
     const elRocket = document.getElementById("shipUpgradeRocket");
     // reflect if currently selected ship has no upgrades (informational)
     if (shipPageIndex != null) {
       const viewed = shipRoster[shipPageIndex];
       if (viewed && !viewed.owned) {
         // If the player is viewing a ship they don't own, indicate upgrades must be purchased after buying
         if (convertHint) convertHint.textContent = `${viewed.name} starts with no upgrades; buy the ship first (then purchases apply to that ship).`;
       }
     }

     // Use per-ship upgrades (viewed.upgrades) to display ownership separately per ship
    try {
      const ups = viewed.upgrades || {};
      if (elFront) {
        if (ups.frontShield) {
          elFront.classList.add("owned");
          elFront.textContent = "Front Shield — Owned (50 HP)";
        } else {
          elFront.classList.remove("owned");
          elFront.textContent = "Front Shield — Nose-mounted (50 HP)";
        }
      }
      if (elFull) {
        if (ups.fullShield) {
          elFull.classList.add("owned");
          elFull.textContent = "Full-Body Shield — Owned (100 HP)";
        } else {
          elFull.classList.remove("owned");
          elFull.textContent = "Full-Body Shield — Omnidirectional (100 HP)";
        }
      }
      if (elHull) {
        if (ups.hull) {
          elHull.classList.add("owned");
          elHull.textContent = "Hull Reinforcement — Owned (+20 max HP)";
        } else {
          elHull.classList.remove("owned");
          elHull.textContent = "Hull Reinforcement — +20 max HP";
        }
      }
      // Hull Reinforcement 2 display (per-ship)
      const elHull2El = document.getElementById("shipUpgradeHull2");
      if (elHull2El) {
        if (ups.hull2) {
          elHull2El.classList.add("owned");
          elHull2El.textContent = "Hull Reinforcement 2 — Owned (+40 max HP)";
        } else if (ups.hull) {
          elHull2El.classList.remove("owned");
          elHull2El.textContent = "Hull Reinforcement 2 — Available for " + (hullUpgrade2.price || 35) + " SC";
        } else {
          elHull2El.classList.remove("owned");
          elHull2El.textContent = "Hull Reinforcement 2 — Locked (requires Hull Reinforcement)";
        }
      }
      if (elSpeed) {
        if (ups.speed) {
          elSpeed.classList.add("owned");
          elSpeed.textContent = "Engine Tuning — Owned (+3 Speed)";
        } else {
          elSpeed.classList.remove("owned");
          elSpeed.textContent = "Engine Tuning — +3 Speed";
        }
      }
      if (elRocket) {
        const rcount = ups.rockets || 0;
        elRocket.textContent = "Rocket Upgrade — x" + rcount + " owned";
        if (rcount > 0) elRocket.classList.add("owned");
        else elRocket.classList.remove("owned");
      }
    } catch (e) {
      console.warn("renderShipPage upgrades sync failed:", e);
    }
   } catch (e) {}
   shipModal.setAttribute("aria-hidden", "false");
   shipModal.style.zIndex = "1300";
   if (gameStarted && !gameOver) gamePaused = true;
 }

// close encyclopedia modal
function closeEncyclopedia() {
  if (!encyclopediaModal) return;
  encyclopediaModal.setAttribute("aria-hidden", "true");
  encyclopediaModal.style.zIndex = "";
  // If this modal was opened from pause, restore the paused overlay and keep the game paused
  if (modalOpenedFromPause) {
    gamePaused = true;
    if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "false");
    modalOpenedFromPause = false;
    return;
  }
  // restore paused state appropriately
  if (gameStarted && !gameOver) {
    gamePaused = false;
    hideMenu();
  } else {
    showMenu();
  }
}

 // wiring
if (encyclopediaBtn) {
  encyclopediaBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openEncyclopedia();
  });
}
if (closeEncy) {
  closeEncy.addEventListener("click", (e) => {
    e.preventDefault();
    closeEncyclopedia();
  });
}
if (encyclopediaModal) {
  // clicking outside the card closes it
  encyclopediaModal.addEventListener("click", (e) => {
    if (e.target === encyclopediaModal) closeEncyclopedia();
  });
}

// Ship modal wiring
if (shipBtn) {
  shipBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openShipModal();
  });
}
if (closeShip) {
  closeShip.addEventListener("click", (e) => {
    e.preventDefault();
    if (!shipModal) return;
    shipModal.setAttribute("aria-hidden", "true");
    shipModal.style.zIndex = "";
    // If this modal was opened from the pause overlay, restore the pause UI and keep paused
    if (modalOpenedFromPause) {
      gamePaused = true;
      if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "false");
      modalOpenedFromPause = false;
      return;
    }
    if (gameStarted && !gameOver) {
      gamePaused = false;
      hideMenu();
    } else {
      showMenu();
    }
  });
}
if (shipModal) {
  shipModal.addEventListener("click", (e) => {
    if (e.target === shipModal) {
      shipModal.setAttribute("aria-hidden", "true");
      shipModal.style.zIndex = "";
      if (gameStarted && !gameOver) {
        gamePaused = false;
        hideMenu();
      } else {
        showMenu();
      }
    }
  });
}
// prev / next buttons
if (encyPrev) {
  encyPrev.addEventListener("click", (e) => {
    e.preventDefault();
    if (encyIndex > 0) {
      encyIndex--;
      renderEncyPage(encyIndex);
    }
  });
}
if (encyNext) {
  encyNext.addEventListener("click", (e) => {
    e.preventDefault();
    if (encyIndex < encyclopediaPages.length - 1) {
      encyIndex++;
      renderEncyPage(encyIndex);
    }
  });
}

const startBtn = document.getElementById("startBtn");
if (startBtn) {
  startBtn.addEventListener("click", () => {
    hideMenu();
    startGame();
    // ensure audio context is resumed on user gesture
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  });
}

/* --- Ship modal page rendering + Prev/Next/Select/Buy wiring --- */
// helper to render current ship page (reads shipPageIndex and updates modal UI)
function renderShipPage(index) {
  shipPageIndex = Math.max(0, Math.min(shipRoster.length - 1, Number(index) || 0));
  const viewed = shipRoster[shipPageIndex];

  // update icon, stats and textual fields
  try {
    const titleEl = document.querySelector("#shipModal h3") || null;
    if (shipIconEl) shipIconEl.src = viewed.img || "Main Ship - Base - Full health.png";
    const header = document.getElementById("shipTitle");
    if (header) header.textContent = viewed.name || "Ship";
    const hpEl = document.getElementById("shipHp");
    const speedEl = document.getElementById("shipSpeed");
    const armorEl = document.getElementById("shipArmor");
    const descEl = document.getElementById("shipDesc"); // explicit element now present in HTML
    if (hpEl) hpEl.textContent = viewed.hp;
    if (speedEl) speedEl.textContent = viewed.speed || 7;
    if (armorEl) armorEl.textContent = viewed.armor || 0;
    // set contextual description for the currently viewed ship (falls back to starter text)
    if (descEl) descEl.textContent = viewed.description || "Starter craft — balanced handling for new pilots.";
    // Update buy/select button visibility and labels
    const buyBtn = document.getElementById("buyShipBtn");
    const selectBtn = document.getElementById("selectShipBtn");
    if (viewed.owned) {
      if (buyBtn) buyBtn.style.display = "none";
      if (selectBtn) selectBtn.textContent = (window.currentShipId === viewed.id) ? "Selected" : "Select";
      if (selectBtn) selectBtn.disabled = (window.currentShipId === viewed.id);
    } else {
      // Starter ship (index 0) must not show Buy button per request
      if (shipPageIndex === 0) {
        if (buyBtn) buyBtn.style.display = "none";
      } else {
        if (buyBtn) {
          buyBtn.style.display = "inline-block";
          buyBtn.textContent = "Buy (" + (viewed.price || 0) + " SC)";
        }
      }
      if (selectBtn) {
        // cannot select an unowned ship
        selectBtn.textContent = "Select";
        selectBtn.disabled = !viewed.owned;
      }
    }

    // update brief upgrades text inside the modal (if present)
    const upgradeListHint = document.getElementById("shipUpgradeRocket");
    if (upgradeListHint) {
      upgradeListHint.textContent = "Rocket Upgrade — x" + (rocketUpgrade.count || 0) + " owned";
    }
  } catch (e) {
    console.warn("renderShipPage error:", e);
  }
}

// Prev / Next handlers
const shipPrevBtn = document.getElementById("shipPrevBtn");
const shipNextBtn = document.getElementById("shipNextBtn");
const selectShipBtn = document.getElementById("selectShipBtn");
const buyShipBtn = document.getElementById("buyShipBtn");

if (shipPrevBtn) {
  shipPrevBtn.addEventListener("click", (e) => {
    e.preventDefault();
    shipPageIndex = Math.max(0, (shipPageIndex || 0) - 1);
    renderShipPage(shipPageIndex);
  });
}
if (shipNextBtn) {
  shipNextBtn.addEventListener("click", (e) => {
    e.preventDefault();
    shipPageIndex = Math.min((shipRoster.length - 1), (shipPageIndex || 0) + 1);
    renderShipPage(shipPageIndex);
  });
}

// Select: set currentShipId to the viewed ship if owned and apply its stats/sprite immediately
if (selectShipBtn) {
  selectShipBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const viewed = shipRoster[shipPageIndex];
    if (!viewed) return;
    if (!viewed.owned) {
      if (convertHint) convertHint.textContent = "You do not have craft";
      return;
    }
    if (window.currentShipId === viewed.id) {
      // already selected
      if (convertHint) convertHint.textContent = "Selected";
      // ensure UI reflects selected state
      renderShipPage(shipPageIndex);
      return;
    }

    // set the current ship id
    window.currentShipId = viewed.id;

    // Apply ship stats to player immediately so selection takes effect in-game
    try {
      // apply max HP if provided (also adjust current health to not exceed new max)
      if (typeof viewed.hp === "number") {
        // preserve proportion of current health where reasonable, but set to full for newly selected ship
        player.maxHealth = viewed.hp;
        player.health = Math.min(player.maxHealth, viewed.hp);
      }

      // apply speed if provided
      if (typeof viewed.speed === "number") {
        player.speed = viewed.speed;
      } else {
        // fallback to default baseline if not specified
        player.speed = player.speed || 8;
      }

      // update the ship sprite used for drawing
      if (viewed.img) {
        try {
          shipImage.src = viewed.img;
          // also update the modal's icon element if present so selection is reflected immediately
          const shipIconElLocal = document.getElementById("shipIcon");
          if (shipIconElLocal) shipIconElLocal.src = viewed.img;
        } catch (e) {
          console.warn("Failed to apply ship image:", e);
        }
      }

      // If the selected ship has per-ship hull upgrades already purchased, apply their bonuses too
      if (viewed.upgrades) {
        if (viewed.upgrades.hull) {
          const bonus = hullUpgrade && hullUpgrade.hpBonus ? hullUpgrade.hpBonus : 20;
          player.maxHealth = Math.max(player.maxHealth || 0, (viewed.hp || player.maxHealth) + bonus);
          player.health = Math.min(player.health, player.maxHealth);
        }
        if (viewed.upgrades.hull2) {
          const bonus2 = hullUpgrade2 && hullUpgrade2.hpBonus ? hullUpgrade2.hpBonus : 40;
          player.maxHealth = Math.max(player.maxHealth || 0, (viewed.hp || player.maxHealth) + ( (viewed.upgrades.hull ? (hullUpgrade.hpBonus||20) : 0) + bonus2 ));
          player.health = Math.min(player.health, player.maxHealth);
        }
        if (viewed.upgrades.speed) {
          const bonusSpeed = (speedUpgrade && speedUpgrade.speedBonus) ? speedUpgrade.speedBonus : 3;
          player.speed = (player.speed || 8) + bonusSpeed;
        }
        // sync rocket counts if per-ship rockets exist
        if (typeof viewed.upgrades.rockets === "number") {
          rocketUpgrade.count = viewed.upgrades.rockets;
        }
        // sync shield ownership/equip to runtime global shield objects for immediate effect
        if (viewed.upgrades.frontShield) {
          frontShield.unlocked = true;
          frontShield.equipped = !!viewed.upgrades.frontShieldEquipped;
          frontShield.hp = frontShield.hp || frontShield.maxHp || 50;
          frontShield.active = frontShield.equipped && frontShield.hp > 0;
        }
        if (viewed.upgrades.fullShield) {
          shieldUpgrade.unlocked = true;
          shieldUpgrade.equipped = !!viewed.upgrades.fullShieldEquipped;
          shieldUpgrade.hp = shieldUpgrade.hp || shieldUpgrade.maxHp || 100;
          shieldUpgrade.active = shieldUpgrade.equipped && shieldUpgrade.hp > 0;
        }
      }
    } catch (e) {
      console.warn("Applying selected ship stats failed:", e);
    }

    // update Select button state across modal and ensure UI reflects selection
    renderShipPage(shipPageIndex);
    if (convertHint) convertHint.textContent = viewed.name + " selected and applied.";
  });
}

// Buy: purchase the currently viewed ship (if not starter and not already owned)
if (buyShipBtn) {
  buyShipBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const viewed = shipRoster[shipPageIndex];
    if (!viewed) return;
    // do not show buy for starter (index 0) - extra check
    if (shipPageIndex === 0) {
      if (convertHint) convertHint.textContent = "Starter ship cannot be purchased.";
      return;
    }
    const cost = Number(viewed.price || 0);
    if (scBalance < cost) {
      // Show a clear user-facing message and briefly change the Buy button to indicate failure, then restore.
      if (convertHint) convertHint.textContent = "Not enough funds to buy " + viewed.name + ".";
      // temporarily change buy button label for immediate feedback and make the text red
      const prevLabel = buyShipBtn.textContent;
      const prevColor = buyShipBtn.style.color || "";
      buyShipBtn.textContent = "Not enough funds";
      buyShipBtn.style.color = "red";
      buyShipBtn.disabled = true;
      setTimeout(() => {
        buyShipBtn.textContent = prevLabel;
        buyShipBtn.style.color = prevColor;
        buyShipBtn.disabled = false;
        // do not clear the convertHint immediately so the user can see the message
      }, 1800);
      return;
    }
    // deduct and mark owned
    scBalance = Math.max(0, Math.floor(scBalance - cost));
    viewed.owned = true;
    // persist inventory entry
    playerInventory.push({
      id: "ship_" + viewed.id,
      name: viewed.name,
      price: cost,
      ownedAt: Date.now(),
    });
    // after buy, force re-render and allow selection
    renderShipPage(shipPageIndex);
    const menuSCEl = document.getElementById("menuSC");
    if (menuSCEl) menuSCEl.textContent = scBalance;
    if (convertHint) convertHint.textContent = `Purchased ${viewed.name}! Select it from this modal to use it.`;
  });
}

// ensure ship modal shows the correct page when opened
// override openShipModal to call renderShipPage for the current index
const _origOpenShipModal = openShipModal;
openShipModal = function () {
  try {
    // keep existing behaviour
    _origOpenShipModal();
    // render current page (default to 0)
    if (typeof shipPageIndex === "undefined" || shipPageIndex === null) shipPageIndex = 0;
    renderShipPage(shipPageIndex);
  } catch (e) {
    console.warn("openShipModal wrapper error:", e);
  }
};

// Save / Load button wiring (prompt for slot 1..5)
const saveBtn = document.getElementById("saveBtn");
if (saveBtn) {
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openNamedSavesModal("create");
  });
}

// create/open named saves modal and wire its actions (single-time setup)
function openNamedSavesModal(mode = "create") {
  let modal = document.getElementById("namedSavesModal");
  if (!modal) return;
  const listEl = document.getElementById("namedSavesList");
  const nameInput = document.getElementById("newSaveName");
  const hint = document.getElementById("namedSavesHint");
  modal.setAttribute("aria-hidden", "false");
  modal.style.zIndex = "1400";
  // populate list
  function renderList() {
    listEl.innerHTML = "";
    const names = listNamedSaves();
    if (!names || names.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "#cfe6ff";
      empty.style.padding = "8px";
      empty.textContent = "No named saves found.";
      listEl.appendChild(empty);
      return;
    }
    names.forEach((n) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "8px";
      row.style.padding = "8px";
      row.style.borderRadius = "8px";
      row.style.background = "rgba(255,255,255,0.02)";
      row.style.color = "#eef6ff";
      // left: name + timestamp preview if available
      const metaRaw = localStorage.getItem("asteroid_shooter_named_" + n);
      let label = n;
      try {
        if (metaRaw) {
          const parsed = JSON.parse(metaRaw);
          if (parsed && parsed.savedAt) {
            const d = new Date(parsed.savedAt);
            label = `${n} — ${d.toLocaleString()}`;
          }
        }
      } catch (e) {}
      const left = document.createElement("div");
      left.style.flex = "1";
      left.style.minWidth = "0";
      left.title = n;
      left.textContent = label;
      // right: Load and Delete buttons
      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      const loadBtnLocal = document.createElement("button");
      loadBtnLocal.className = "btn";
      loadBtnLocal.style.minWidth = "72px";
      loadBtnLocal.textContent = "Load";
      loadBtnLocal.addEventListener("click", () => {
        if (loadFromNamed(n)) {
          // close modal and refresh UI
          closeNamedSavesModal();
          alert(`Loaded "${n}".`);
        } else {
          alert("Load failed.");
        }
      });
      const deleteBtnLocal = document.createElement("button");
      deleteBtnLocal.className = "btn";
      deleteBtnLocal.style.minWidth = "72px";
      deleteBtnLocal.style.background = "linear-gradient(180deg,#ff6b6b 0%,#e04b4b 100%)";
      deleteBtnLocal.style.color = "#fff";
      deleteBtnLocal.textContent = "Delete";
      deleteBtnLocal.addEventListener("click", () => {
        if (!confirm(`Delete save "${n}"? This cannot be undone.`)) return;
        if (deleteNamedSave(n)) {
          renderList();
        } else {
          alert("Delete failed.");
        }
      });
      right.appendChild(loadBtnLocal);
      right.appendChild(deleteBtnLocal);
      row.appendChild(left);
      row.appendChild(right);
      listEl.appendChild(row);
    });
  }

  // wire create button
  const createBtn = document.getElementById("createSaveBtn");
  if (createBtn) {
    createBtn.onclick = () => {
      const raw = (nameInput && String(nameInput.value || "").trim()) || "";
      if (!raw) {
        hint.textContent = "Enter a name for the save.";
        return;
      }
      const safeName = raw.replace(/[^a-zA-Z0-9 _-]/g, "_").slice(0, 48);
      if (!safeName) { hint.textContent = "Invalid save name."; return; }
      if (saveToNamed(safeName)) {
        hint.textContent = `Saved to "${safeName}".`;
        nameInput.value = "";
        renderList();
      } else {
        hint.textContent = "Save failed.";
      }
    };
  }

  // wire close
  const closeBtn = document.getElementById("closeNamedSaves");
  if (closeBtn) {
    closeBtn.onclick = closeNamedSavesModal;
  }

  // show and render
  renderList();
  // focus input for convenience
  if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

function closeNamedSavesModal() {
  const modal = document.getElementById("namedSavesModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.style.zIndex = "";
  // restore menu/game state quietly
  if (gameStarted && !gameOver) {
    gamePaused = false;
    hideMenu();
  } else {
    showMenu();
  }
}

const loadBtn = document.getElementById("loadBtn");
if (loadBtn) {
  loadBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openNamedSavesModal("load");
  });
}

// Reset All Progress wiring
const resetBtn = document.getElementById("resetBtn");
const resetModal = document.getElementById("resetModal");
const confirmResetBtn = document.getElementById("confirmResetBtn");
const cancelResetBtn = document.getElementById("cancelResetBtn");

if (resetBtn) {
  resetBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!resetModal) return;
    // show confirmation modal above other overlays
    resetModal.style.zIndex = "1200";
    resetModal.setAttribute("aria-hidden", "false");
    // pause game if running
    if (gameStarted && !gameOver) {
      gamePaused = true;
    }
  });
}

if (cancelResetBtn) {
  cancelResetBtn.addEventListener("click", () => {
    if (!resetModal) return;
    resetModal.setAttribute("aria-hidden", "true");
    resetModal.style.zIndex = "";
    // restore paused state / menu appropriately
    if (gameStarted && !gameOver) {
      gamePaused = false;
      hideMenu();
    } else {
      showMenu();
    }
  });
}

if (confirmResetBtn) {
  confirmResetBtn.addEventListener("click", () => {
    // perform reset of runtime totals while preserving permanent claimed achievements and owned upgrades
    try {
      // intentionally DO NOT remove "asteroid_shooter_state_v1" so claimed achievements and persistent upgrades remain.
      // Remove only the music volume key to respect the user's explicit "Reset All Progress" intent for audio prefs.
      localStorage.removeItem("asteroid_shooter_music_vol_v1");
    } catch (e) {}

    // stop any running intervals/timeout and audio
    if (spawnInterval) {
      clearInterval(spawnInterval);
      spawnInterval = null;
    }
    stopCrateSpawner();
    stopHealSpawner();
    stopEnemySpawner();
    stopFighterSpawner();
    try { if (typeof stopFrigateSpawner === "function") stopFrigateSpawner(); } catch (e) {}
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
      reloading = false;
      reloadEndsAt = 0;
    }

    // stop sounds and pause music
    try {
      player.bullets.forEach((b) => { if (b.sound) stopAndCleanSound(b.sound); });
    } catch (e) {}
    tryPauseGameplayMusic();
    tryPauseMenuMusic();

    // Reset runtime-only values (score, session SC, player position, entities, etc.)
    score = 0;
    highScore = 0;
    scBalance = 0;

    // keep permanent playerInventory entries (purchases) intact by clearing only transient session inventory
    // (playerInventory contains historical purchase entries; we keep them to preserve owned items)
    // do not clear playerInventory here so that owned upgrades remain recognized

    // reset player, shields (but preserve unlocked/purchased flags if present in the achievements/state)
    player.health = player.maxHealth;
    player.x = canvas.width / 2;
    player.y = canvas.height - 96;
    player.bullets = [];
    clipAmmo = clipSize;
    reserveAmmo = 30;
    reloading = false;
    reloadEndsAt = 0;
    if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }

    // If shields were persisted as owned/unlocked in saved state, keep their unlocked flags.
    // Reset active/equipped runtime flags but preserve unlocked/purchased state.
    if (frontShield) {
      frontShield.active = false;
      frontShield.equipped = !!frontShield.equipped; // keep equip flag as-is so UI shows ownership, but deactivate
      frontShield.hp = frontShield.maxHp || 50;
    } else {
      frontShield = {
        unlocked: false,
        equipped: false,
        active: false,
        hp: 50,
        maxHp: 50,
        rechargeDelayMs: 2000,
        rechargeRatePerSec: 5,
        lastHitAt: 0,
        rechargeTickAt: 0,
      };
    }

    if (shieldUpgrade) {
      shieldUpgrade.active = false;
      // keep unlocked/equipped flags intact; reset hp to full max
      shieldUpgrade.hp = shieldUpgrade.maxHp || 100;
    } else {
      shieldUpgrade = {
        unlocked: false,
        equipped: false,
        active: false,
        hp: 100,
        maxHp: 100,
        rechargeDelayMs: 2000,
        rechargeRatePerSec: 5,
        lastHitAt: 0,
        rechargeTickAt: 0,
        sizeMultiplier: 1.6,
      };
    }

    // Keep purchased hull/speed/rocket upgrades state if present (do not overwrite)
    hullUpgrade = hullUpgrade || { unlocked: false, hpBonus: 20 };
    speedUpgrade = speedUpgrade || { unlocked: false, speedBonus: 3 };
    hullUpgrade2 = hullUpgrade2 || { unlocked: false, hpBonus: 40, price: 35 };
    rocketUpgrade = rocketUpgrade || { unlocked: false, count: 0, maxCount: 100, price: 5, damageShield: 25, damageHull: 35 };

    // reset baseline player speed but reapply any permanent speedBonus if previously unlocked
    player.speed = 8;
    if (speedUpgrade && speedUpgrade.unlocked && typeof speedUpgrade.speedBonus === "number") {
      player.speed += speedUpgrade.speedBonus;
    }

    // clear runtime entities but keep persistent purchase history and achievements intact
    player.bullets = [];
    enemies = [];
    enemyBullets = [];
    asteroids = [];
    crates = [];
    heals = [];

    // close modal and return to main menu (fresh state)
    if (resetModal) {
      resetModal.setAttribute("aria-hidden", "true");
      resetModal.style.zIndex = "";
    }
    gameStarted = false;
    gameOver = false;
    gamePaused = false;

    // update visible menu HUD values
    const menuSCEl = document.getElementById("menuSC");
    const menuScoreEl = document.getElementById("menuScore");
    if (menuSCEl) menuSCEl.textContent = scBalance;
    if (menuScoreEl) menuScoreEl.textContent = score;
    // Persist current persistent state (keeps claimed achievements / purchases saved)
    try { saveState(); } catch (e) {}
    showMenu();
  });
}

const howBtn = document.getElementById("howBtn");
const howModal = document.getElementById("howModal");
const closeHow = document.getElementById("closeHow");

function openHowModal() {
  if (!howModal) return;
  // record whether we opened this modal from the pause overlay so we can restore pause on close
  modalOpenedFromPause = !!(pauseMenuEl && pauseMenuEl.getAttribute("aria-hidden") === "false");
  // ensure the How modal appears above any pause overlay when opened in-game
  howModal.style.zIndex = "1100";
  // show the How-to-Play modal without forcing the main menu overlay
  howModal.setAttribute("aria-hidden", "false");
  // if the game was running, pause input so the modal acts like an in-game overlay
  if (gameStarted && !gameOver) {
    gamePaused = true;
    // keep the pause overlay visible behind the modal but ensure it stays under the modal
    if (pauseMenuEl) pauseMenuEl.style.zIndex = "1000";
  }
}

function closeHowModal() {
  if (!howModal) return;
  howModal.setAttribute("aria-hidden", "true");
  // remove any z-index override we added when opening the modal
  howModal.style.zIndex = "";
  if (pauseMenuEl) pauseMenuEl.style.zIndex = "";
  // If this modal was opened while pause overlay was visible, restore paused overlay instead of unpausing
  if (modalOpenedFromPause) {
    // keep game paused and ensure pause overlay remains visible
    gamePaused = true;
    if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "false");
    modalOpenedFromPause = false;
    return;
  }
  // restore the HUD/menu state: if the game was running, unpause; otherwise ensure main menu is visible
  if (gameStarted && !gameOver) {
    gamePaused = false;
    hideMenu();
  } else {
    showMenu();
  }
}

if (howBtn) {
  howBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openHowModal();
  });
}

// Close button inside modal
if (closeHow) {
  closeHow.addEventListener("click", () => {
    closeHowModal();
  });
}

// Clicking outside the modal-card closes it
if (howModal) {
  howModal.addEventListener("click", (e) => {
    if (e.target === howModal) closeHowModal();
  });
}

 // Settings modal wiring
 const settingsModal = document.getElementById("settingsModal");
 const menuSettingsBtn = document.getElementById("menuSettingsBtn");
 const closeSettings = document.getElementById("closeSettings");
 const pauseSettingsBtn = document.getElementById("pauseSettingsBtn");
 const sfxToggle = document.getElementById("sfxToggle");

 // Upgrades modal wiring
 const upgradesModal = document.getElementById("upgradesModal");
 const upgradesBtn = document.getElementById("upgradesBtn");
 const closeUpgrades = document.getElementById("closeUpgrades");
 const convertBtn = document.getElementById("convertBtn");
 const convertAmount = document.getElementById("convertAmount");
 const convertHint = document.getElementById("convertHint");

// initialize toggle from sfxEnabled
if (sfxToggle) {
  sfxToggle.checked = !!sfxEnabled;
  sfxToggle.addEventListener("change", (e) => {
    sfxEnabled = !!e.target.checked;
  });
}

// Background theme (light/dark) persistence and wiring
/* Theme controls removed; force dark theme for consistent UI */
try {
  // Ensure body uses dark defaults by removing any light-theme marker.
  document.body.removeAttribute("data-theme");
} catch (e) {}

// music volume slider wiring (if present)
const musicVolumeEl = document.getElementById("musicVolume");
const musicVolumeLabel = document.getElementById("musicVolumeLabel");
if (musicVolumeEl) {
  // initialize slider from saved value (fallback to current menuAudio.volume * 100)
  try {
    const raw = localStorage.getItem("asteroid_shooter_music_vol_v1");
    // use the actual menu audio element (menuAudio) when deriving a sensible default volume
    let startVal = Math.round((menuAudio && typeof menuAudio.volume === "number" ? menuAudio.volume : 0.4) * 100);
    if (raw !== null && !Number.isNaN(Number(raw))) startVal = Math.max(0, Math.min(100, Number(raw)));
    musicVolumeEl.value = startVal;
    if (musicVolumeLabel) musicVolumeLabel.textContent = String(startVal);
    setMenuMusicVolume(startVal / 100);
  } catch (e) {
    musicVolumeEl.value = 40;
    if (musicVolumeLabel) musicVolumeLabel.textContent = "40";
    setMenuMusicVolume(0.4);
  }

  musicVolumeEl.addEventListener("input", (ev) => {
    const v = Number(ev.target.value || 0);
    if (musicVolumeLabel) musicVolumeLabel.textContent = String(v);
    setMenuMusicVolume(v / 100);
  });
}

 // Open settings (from main menu)
 if (menuSettingsBtn) {
   menuSettingsBtn.addEventListener("click", (e) => {
     e.preventDefault();
     if (!settingsModal) return;
     // record if opened from pause overlay so we can restore paused state on close
     modalOpenedFromPause = !!(pauseMenuEl && pauseMenuEl.getAttribute("aria-hidden") === "false");
     settingsModal.style.zIndex = "1100";
     settingsModal.setAttribute("aria-hidden", "false");
   });
 }

 // Upgrades modal per-ship target: default to starter ('basic')
 window.upgradesTargetShipId = window.upgradesTargetShipId || "basic";

 // duplicate getShipById removed (single shared definition exists earlier)

 // helper to compute per-ship price modifiers
 function computePrice(base, upgradeKey, shipId) {
   // cosmic2 is more expensive by +5 for general upgrades, rockets +2
   const ship = getShipById(shipId || window.upgradesTargetShipId);
   const isCosmic = ship && ship.id === "cosmic2";
   if (upgradeKey === "rocket") return base + (isCosmic ? 2 : 0);
   return base + (isCosmic ? 5 : 0);
 }

 // when opening upgrades modal, initialize per-ship tab buttons and hint text
 if (upgradesBtn) {
   upgradesBtn.addEventListener("click", (e) => {
     e.preventDefault();
     if (!upgradesModal) return;
     modalOpenedFromPause = !!(pauseMenuEl && pauseMenuEl.getAttribute("aria-hidden") === "false");
     upgradesModal.style.zIndex = "1110";
     upgradesModal.setAttribute("aria-hidden", "false");
     if (gameStarted && !gameOver) gamePaused = true;
     if (convertHint) convertHint.textContent = "Enter how many Points you want to convert (must be multiple of 100). You have " + points + " Points.";

     // set default target to starter when opening
     window.upgradesTargetShipId = window.upgradesTargetShipId || "basic";
     updateUpgradesTargetUI();

     // update shield UI state when opening upgrades (use per-ship ownership/equip state rather than the global shieldUpgrade)
     const shieldIconBtn = document.getElementById("shieldIconBtn");
     const shieldDescEl = document.getElementById("shieldDesc");
     const shieldPriceEl = document.getElementById("shieldPrice");
     const shieldEquipBtn = document.getElementById("shieldEquipBtn");
     if (shieldIconBtn) {
       try {
         const targetIdLocal = window.upgradesTargetShipId || "basic";
         const targetLocal = getShipById(targetIdLocal);
         const owned = !!(targetLocal && targetLocal.upgrades && targetLocal.upgrades.fullShield);
         const equipped = !!(targetLocal && targetLocal.upgrades && targetLocal.upgrades.fullShieldEquipped);

         if (owned) {
           shieldIconBtn.style.opacity = "0.65";
           shieldPriceEl.textContent = "Owned";
           shieldPriceEl.style.color = "#9fffbf";
           if (shieldEquipBtn) {
             shieldEquipBtn.style.display = "inline-block";
             shieldEquipBtn.textContent = equipped ? "Unequip" : "Equip";
           }
         } else {
           shieldIconBtn.style.opacity = "1";
           shieldPriceEl.textContent = computePrice(30, "shield", targetIdLocal) + " SC";
           shieldPriceEl.style.color = "#ffd86b";
           if (shieldEquipBtn) shieldEquipBtn.style.display = "none";
         }
       } catch (e) {
         // fallback to global behavior if something goes wrong
         if (shieldUpgrade.unlocked) {
           shieldIconBtn.style.opacity = "0.65";
           shieldPriceEl.textContent = "Owned";
           shieldPriceEl.style.color = "#9fffbf";
           if (shieldEquipBtn) {
             shieldEquipBtn.style.display = "inline-block";
             shieldEquipBtn.textContent = shieldUpgrade.equipped ? "Unequip" : "Equip";
           }
         } else {
           shieldIconBtn.style.opacity = "1";
           shieldPriceEl.textContent = computePrice(30, "shield", window.upgradesTargetShipId) + " SC";
           shieldPriceEl.style.color = "#ffd86b";
           if (shieldEquipBtn) shieldEquipBtn.style.display = "none";
         }
       }
     }
     if (shieldDescEl) shieldDescEl.style.display = "none";
   });
 }

 function updateUpgradesTargetUI() {
   try {
     const t = window.upgradesTargetShipId || "basic";
     const hint = document.getElementById("upgradesTargetHint");
     const starterBtn = document.getElementById("upgTabStarter");
     const cosmicBtn = document.getElementById("upgTabCosmic");
     if (hint) {
       const ship = getShipById(t);
       const displayName = (t === "basic") ? "Starter Ship" : (ship.name || ship.id);
       hint.textContent = `Managing upgrades for: ${displayName}`;
     }
     if (starterBtn) {
       starterBtn.style.boxShadow = t === "basic" ? "0 8px 30px rgba(0,0,0,0.12)" : "";
       starterBtn.style.transform = t === "basic" ? "translateY(-2px)" : "";
     }
     if (cosmicBtn) {
       cosmicBtn.style.boxShadow = t === "cosmic2" ? "0 8px 30px rgba(0,0,0,0.12)" : "";
       cosmicBtn.style.transform = t === "cosmic2" ? "translateY(-2px)" : "";
     }

     const frontPrice = document.getElementById("frontShieldPrice");
     const shieldPrice = document.getElementById("shieldPrice");
     const hullPrice = document.getElementById("hullPrice");
     const hull2Price = document.getElementById("hull2Price");
     const speedPrice = document.getElementById("speedPrice");
     const rocketPrice = document.getElementById("rocketPrice");

     if (frontPrice) {
       const txt = computePrice(10, "shield", t) + " SC";
       frontPrice.dataset._baseText = txt;
       frontPrice.textContent = txt;
     }
     if (shieldPrice) {
       const txt = computePrice(30, "shield", t) + " SC";
       shieldPrice.dataset._baseText = txt;
       shieldPrice.textContent = txt;
     }
     if (hullPrice) {
       const txt = computePrice(20, "hull", t) + " SC";
       hullPrice.dataset._baseText = txt;
       hullPrice.textContent = txt;
     }
     if (hull2Price) {
       const ship = getShipById(t);
       if (ship && ship.upgrades && ship.upgrades.hull) {
         const txt = hullUpgrade2.purchased ? "Owned" : computePrice(hullUpgrade2.price || 35, "hull", t) + " SC";
         hull2Price.dataset._baseText = txt;
         hull2Price.textContent = txt;
       } else {
         hull2Price.dataset._baseText = "Locked";
         hull2Price.textContent = "Locked";
       }
     }
     if (speedPrice) {
       const txt = computePrice(10, "speed", t) + " SC";
       speedPrice.dataset._baseText = txt;
       speedPrice.textContent = txt;
     }
     if (rocketPrice) {
       const txt = computePrice(rocketUpgrade.price || 5, "rocket", t) + " SC / piece";
       rocketPrice.dataset._baseText = txt;
       rocketPrice.textContent = txt;
     }

     const targetShip = getShipById(t);
     const isOwned = !!(targetShip && targetShip.owned);

     const controls = [
       {btn: document.getElementById("frontShieldBuyBtn"), id: "frontShieldBuyBtn"},
       {btn: document.getElementById("frontShieldEquipBtn"), id: "frontShieldEquipBtn"},
       {btn: document.getElementById("shieldBuyBtn"), id: "shieldBuyBtn"},
       {btn: document.getElementById("shieldEquipBtn"), id: "shieldEquipBtn"},
       {btn: document.getElementById("hullBuyBtn"), id: "hullBuyBtn"},
       {btn: document.getElementById("hull2BuyBtn"), id: "hull2BuyBtn"},
       {btn: document.getElementById("speedBuyBtn"), id: "speedBuyBtn"},
       {btn: document.getElementById("rocketBuyBtn"), id: "rocketBuyBtn"},
     ];

     controls.forEach((c) => {
       if (!c || !c.btn) return;
       if (!isOwned) {
         c.btn.disabled = true;
         c.btn.style.opacity = "0.5";
       } else {
         c.btn.disabled = false;
         c.btn.style.opacity = "";
       }
     });

     const priceHintEls = [frontPrice, shieldPrice, hullPrice, hull2Price, speedPrice, rocketPrice];
     if (!isOwned) {
       priceHintEls.forEach((el) => {
         if (!el) return;
         if (!el.dataset._baseText) el.dataset._baseText = el.textContent || "";
         el.textContent = `${el.dataset._baseText.replace(/\s*—.*$/,"").trim()} — Requires ownership`;
         el.style.color = "red";
       });
       if (convertHint) convertHint.textContent = "You must own the selected ship to purchase its upgrades. Switch tabs to the ship you own.";
     } else {
       priceHintEls.forEach((el) => {
         if (!el) return;
         if (el.dataset && el.dataset._baseText) {
           el.textContent = el.dataset._baseText.replace(/\s*—.*$/,"").trim();
           el.style.color = "";
         }
       });
       if (convertHint) convertHint.textContent = `Managing upgrades for: ${targetShip.name || targetShip.id}.`;
     }
   } catch (e) {
     console.warn("updateUpgradesTargetUI failed:", e);
   }
 }

 // wire the two per-ship buttons (they were added to HTML)
 const upgStarterBtn = document.getElementById("upgTabStarter");
 const upgCosmicBtn = document.getElementById("upgTabCosmic");
 if (upgStarterBtn) {
   upgStarterBtn.addEventListener("click", (e) => {
     e.preventDefault();
     window.upgradesTargetShipId = "basic";
     updateUpgradesTargetUI();
   });
 }
 if (upgCosmicBtn) {
   upgCosmicBtn.addEventListener("click", (e) => {
     e.preventDefault();
     window.upgradesTargetShipId = "cosmic2";
     updateUpgradesTargetUI();
   });
 }

 // Front shield UI wiring
 const frontShieldIconBtn = document.getElementById("frontShieldIconBtn");
 const frontShieldDescEl = document.getElementById("frontShieldDesc");
 const frontShieldPriceEl = document.getElementById("frontShieldPrice");
 if (frontShieldIconBtn) {
   frontShieldIconBtn.addEventListener("click", (e) => {
     e.preventDefault();
     if (frontShieldDescEl) {
       frontShieldDescEl.style.display = frontShieldDescEl.style.display === "none" || frontShieldDescEl.style.display === "" ? "block" : "none";
     }
   });
   frontShieldIconBtn.addEventListener("dblclick", (e) => {
     e.preventDefault();
     attemptPurchaseFrontShield();
   });
 }
 const frontShieldBuyBtnEl = document.getElementById("frontShieldBuyBtn");
 if (frontShieldBuyBtnEl) {
   frontShieldBuyBtnEl.addEventListener("click", (ev) => {
     ev.preventDefault();
     attemptPurchaseFrontShield();
   });
 }
 const frontShieldEquipBtnEl = document.getElementById("frontShieldEquipBtn");
 if (frontShieldEquipBtnEl) {
   frontShieldEquipBtnEl.addEventListener("click", (ev) => {
     ev.preventDefault();
     // operate on the currently managed ship's per-ship equip flag
     const targetIdLocal = window.upgradesTargetShipId || "basic";
     const targetLocal = getShipById(targetIdLocal);
     if (!targetLocal) return;

     if (!targetLocal.upgrades) targetLocal.upgrades = {};
     // must own per-ship front shield to equip it
     if (!targetLocal.upgrades.frontShield) {
       if (convertHint) convertHint.textContent = "You must purchase the Front Shield for this ship before equipping it.";
       return;
     }

     // toggle per-ship equip flag
     targetLocal.upgrades.frontShieldEquipped = !targetLocal.upgrades.frontShieldEquipped;
     frontShieldEquipBtnEl.textContent = targetLocal.upgrades.frontShieldEquipped ? "Unequip" : "Equip";

     // Always sync global runtime frontShield state so it's effective immediately in-game.
     frontShield.unlocked = !!targetLocal.upgrades.frontShield;
     frontShield.equipped = !!targetLocal.upgrades.frontShieldEquipped;
     frontShield.hp = frontShield.hp || frontShield.maxHp || 50;
     if (!frontShield.equipped) frontShield.active = false;
   });
 }

 // Full-body shield UI wiring (existing)
 const shieldIconBtn = document.getElementById("shieldIconBtn");
 const shieldDescEl = document.getElementById("shieldDesc");
 const shieldPriceEl = document.getElementById("shieldPrice");
 if (shieldIconBtn) {
   // toggle description when clicking the icon
   shieldIconBtn.addEventListener("click", (e) => {
     e.preventDefault();
     if (shieldDescEl) {
       shieldDescEl.style.display = shieldDescEl.style.display === "none" || shieldDescEl.style.display === "" ? "block" : "none";
     }
   });

   // double-click to purchase (explicit to avoid accidental buys)
   shieldIconBtn.addEventListener("dblclick", (e) => {
     e.preventDefault();
     attemptPurchaseShield();
   });
 }

 // also wire the explicit Buy button for easier single-click purchases
 const shieldBuyBtnEl = document.getElementById("shieldBuyBtn");
 if (shieldBuyBtnEl) {
   shieldBuyBtnEl.addEventListener("click", (ev) => {
     ev.preventDefault();
     attemptPurchaseShield();
   });
 }

 // Equip/Unequip button wiring for full-body
 const shieldEquipBtnEl = document.getElementById("shieldEquipBtn");
 if (shieldEquipBtnEl) {
   shieldEquipBtnEl.addEventListener("click", (ev) => {
     ev.preventDefault();
     // operate on the currently managed ship's per-ship equip flag
     const targetIdLocal = window.upgradesTargetShipId || "basic";
     const targetLocal = getShipById(targetIdLocal);
     if (!targetLocal) return;

     if (!targetLocal.upgrades) targetLocal.upgrades = {};
     if (!targetLocal.upgrades.fullShield) {
       if (convertHint) convertHint.textContent = "You must purchase the Full-Body Shield for this ship before equipping it.";
       return;
     }

     // Toggle per-ship equipped flag
     targetLocal.upgrades.fullShieldEquipped = !targetLocal.upgrades.fullShieldEquipped;
     shieldEquipBtnEl.textContent = targetLocal.upgrades.fullShieldEquipped ? "Unequip" : "Equip";

     // Always sync global runtime shieldUpgrade so equipping takes effect immediately regardless of selected ship.
     shieldUpgrade.unlocked = !!targetLocal.upgrades.fullShield;
     shieldUpgrade.equipped = !!targetLocal.upgrades.fullShieldEquipped;
     shieldUpgrade.maxHp = shieldUpgrade.maxHp || 100;
     shieldUpgrade.hp = Math.min(shieldUpgrade.maxHp, shieldUpgrade.hp || shieldUpgrade.maxHp);
     if (!shieldUpgrade.equipped) shieldUpgrade.active = false;
   });
 }

 // purchase helpers & inventory
 const playerInventory = []; // simple inventory list for purchased items

 // unlock the "Upgraded — First Upgrade" achievement the first time the player purchases any upgrade/consumable.
 // This central helper is called by each purchase routine and will only unlock once.
 function unlockFirstUpgrade() {
   try {
     if (!achievements || !achievements.up_first) return;
     if (achievements.up_first.unlocked) return;
     achievements.up_first.unlocked = true;
     // show toast and update modal UI
     showAchievementToast(achievements.up_first);
     updateAchievementsUI();
     // persist any necessary state (SC/highscore persistence handled elsewhere)
     try { saveState(); } catch (e) {}
   } catch (e) {
     console.warn("unlockFirstUpgrade error:", e);
   }
 }

 function attemptPurchaseFrontShield() {
   const priceEl = document.getElementById("frontShieldPrice");
   const equipBtn = document.getElementById("frontShieldEquipBtn");
   const targetId = window.upgradesTargetShipId || "basic";
   const target = getShipById(targetId);

   // require owning the ship to buy upgrades for it
   if (!target || !target.owned) {
     if (priceEl) { priceEl.textContent = "You must own the ship to buy its upgrades"; priceEl.style.color = "red"; }
     if (convertHint) convertHint.textContent = "Buy the ship first to purchase its upgrades.";
     return;
   }

   if (!target.upgrades) target.upgrades = {};
   if (target.upgrades.frontShield) {
     if (priceEl) { priceEl.textContent = "Already purchased"; priceEl.style.color = "#9fffbf"; }
     return;
   }

   const cost = computePrice(10, "shield", targetId);
   if (typeof scBalance !== "number" || scBalance < cost) {
     if (priceEl) { priceEl.textContent = "Need " + cost + " SC"; priceEl.style.color = "#ffb59e"; }
     return;
   }

   scBalance = Math.max(0, Math.floor(scBalance - cost));

   // mark purchased for this ship and also unlock as a universal/global purchase so all ships get the shield available
   target.upgrades.frontShield = true;
   try {
     // ensure global runtime front shield is flagged available and primed with HP
     frontShield.unlocked = true;
     frontShield.hp = frontShield.hp || frontShield.maxHp || 50;
     frontShield.active = frontShield.active || false;
     frontShield.equipped = frontShield.equipped || false;
   } catch (e) { console.warn("frontShield sync failed:", e); }

   // Also mark the shield as available on all roster entries (universal)
   try {
     if (Array.isArray(shipRoster)) {
       shipRoster.forEach(s => {
         if (!s.upgrades) s.upgrades = {};
         s.upgrades.frontShield = true;
       });
     }
   } catch (e) { console.warn("propagate frontShield to roster failed:", e); }

   playerInventory.push({
     id: `${target.id}_front_shield`,
     name: `${target.name} Front Shield (universal)`,
     description: "Nose-mounted shield (50 HP) unlocked globally for all ships.",
     price: cost,
     ownedAt: Date.now(),
   });

   try { unlockFirstUpgrade(); } catch (e) {}

   if (priceEl) { priceEl.textContent = "Owned (universal)"; priceEl.style.color = "#9fffbf"; }
   if (equipBtn) { equipBtn.style.display = "inline-block"; equipBtn.textContent = frontShield.equipped ? "Unequip" : "Equip"; }
   // update the Buy button to reflect ownership
   try { const buyBtn = document.getElementById("frontShieldBuyBtn"); if (buyBtn) { buyBtn.textContent = "Owned"; buyBtn.disabled = true; buyBtn.style.opacity = "0.6"; } } catch(e){}
   const menuSCEl = document.getElementById("menuSC"); if (menuSCEl) menuSCEl.textContent = scBalance;
   if (convertHint) convertHint.textContent = `${target.name} Front Shield purchased for ${cost} SC and unlocked for all ships! Equip it in Upgrades.`;
 }

 function attemptPurchaseShield() {
   const priceEl = document.getElementById("shieldPrice");
   const equipBtn = document.getElementById("shieldEquipBtn");
   const targetId = window.upgradesTargetShipId || "basic";
   const target = getShipById(targetId);

   if (!target || !target.owned) {
     if (priceEl) { priceEl.textContent = "You must own the ship to buy its upgrades"; priceEl.style.color = "red"; }
     if (convertHint) convertHint.textContent = "Buy the ship first to purchase its upgrades.";
     return;
   }

   if (!target.upgrades) target.upgrades = {};
   if (target.upgrades.fullShield) {
     if (priceEl) { priceEl.textContent = "Already purchased"; priceEl.style.color = "#9fffbf"; }
     return;
   }

   const cost = computePrice(30, "shield", targetId);
   if (typeof scBalance !== "number" || scBalance < cost) {
     if (priceEl) { priceEl.textContent = "Need " + cost + " SC"; priceEl.style.color = "#ffb59e"; }
     return;
   }

   scBalance = Math.max(0, Math.floor(scBalance - cost));

   // set per-ship flag and also make shield universal/global so other ships don't have to be purchased separately
   target.upgrades.fullShield = true;
   try {
     shieldUpgrade.unlocked = true;
     shieldUpgrade.hp = shieldUpgrade.hp || shieldUpgrade.maxHp || 100;
     shieldUpgrade.active = shieldUpgrade.active || false;
     shieldUpgrade.equipped = shieldUpgrade.equipped || false;
   } catch (e) { console.warn("shieldUpgrade sync failed:", e); }

   // propagate to all ships in roster (universal)
   try {
     if (Array.isArray(shipRoster)) {
       shipRoster.forEach(s => {
         if (!s.upgrades) s.upgrades = {};
         s.upgrades.fullShield = true;
       });
     }
   } catch (e) { console.warn("propagate fullShield to roster failed:", e); }

   playerInventory.push({
     id: `${target.id}_full_shield`,
     name: `${target.name} Full-Body Shield (universal)`,
     description: "Full-body shield (100 HP) unlocked globally for all ships.",
     price: cost,
     ownedAt: Date.now(),
   });

   try { unlockFirstUpgrade(); } catch (e) {}
   if (priceEl) { priceEl.textContent = "Owned (universal)"; priceEl.style.color = "#9fffbf"; }
   if (equipBtn) { equipBtn.style.display = "inline-block"; equipBtn.textContent = shieldUpgrade.equipped ? "Unequip" : "Equip"; }
   // reflect ownership on the Buy button
   try { const buyBtn = document.getElementById("shieldBuyBtn"); if (buyBtn) { buyBtn.textContent = "Owned"; buyBtn.disabled = true; buyBtn.style.opacity = "0.6"; } } catch(e){}
   const menuSCEl2 = document.getElementById("menuSC"); if (menuSCEl2) menuSCEl2.textContent = scBalance;
   if (convertHint) convertHint.textContent = `${target.name} Full-Body Shield purchased for ${cost} SC and unlocked for all ships! Equip it in Upgrades.`;
 }

 // --- Hull upgrade: +20 max HP purchase wiring & handler ---
 // persistent hull upgrade ownership flag
 let hullUpgrade = {
   unlocked: false,
   hpBonus: 20,
 };

 // --- Hull Reinforcement 2: locked until hullUpgrade is bought; +40 max HP for 35 SC ---
 let hullUpgrade2 = {
   unlocked: false,
   hpBonus: 40,
   price: 35,
 };

 // --- Engine Tuning (speed upgrade) ---
 // persistent speed upgrade ownership flag (adds +3 speed)
 let speedUpgrade = {
   unlocked: false,
   speedBonus: 3,
 };

 // --- Rocket Upgrade (consumable offensive item) ---
 // rocketUpgrade.count = how many rockets player currently has (max 10)
 // rocketUpgrade.damageShield / damageHull denote effect when used (25 each)
 let rocketUpgrade = {
  unlocked: false,   // ownership isn't required per-se; count tracks possession
  count: 0,
  maxCount: 100,      // increased capacity to 100 rockets
  price: 5,           // each rocket costs 5 SC (updated per-piece price)
  // significantly increased rocket damage to make rockets far more potent
  damageShield: 120,   // shield damage
  damageHull: 120,     // hull damage (both shields and hull now take high damage)
};

 // runtime container for active player-fired rockets (prevents ReferenceError)
 let playerRockets = [];

 // Use a rocket (bound to KeyF and UI); spawns an in-game projectile and decrements inventory.
 // Safe no-op when not in a run or when none are owned.
 function useRocket() {
   try {
     if (gameOver || !gameStarted) return;
     if (!rocketUpgrade || typeof rocketUpgrade.count !== "number" || rocketUpgrade.count <= 0) {
       if (typeof convertHint !== "undefined" && convertHint) convertHint.textContent = "No rockets available.";
       return;
     }
     // spawn rocket at ship nose moving in ship's facing direction
     const angle = player.angle - Math.PI / 2; // align with existing bullet math
     const speed = 7;
     const vx = Math.cos(angle) * speed;
     const vy = Math.sin(angle) * speed;
     const spawnX = player.x + player.width / 2;
     const spawnY = player.y + player.height / 2;

     playerRockets.push({
       x: spawnX,
       y: spawnY,
       vx,
       vy,
       radius: 8,
       createdAt: performance.now(),
     });

     // consume one rocket
     rocketUpgrade.count = Math.max(0, rocketUpgrade.count - 1);

     // update any UI that reflects rocket counts
     const menuSCEl = document.getElementById("menuSC");
     if (menuSCEl) menuSCEl.textContent = scBalance;
     const rocketLabelEl = document.getElementById("shipUpgradeRocket");
     if (rocketLabelEl) rocketLabelEl.textContent = "Rocket Upgrade — x" + rocketUpgrade.count + " owned";
     const rocketPriceEl = document.getElementById("rocketPrice");
     if (rocketPriceEl) rocketPriceEl.textContent = (rocketUpgrade.count > 0) ? (rocketUpgrade.count + " / " + rocketUpgrade.maxCount + " owned") : "0 owned";

     if (typeof convertHint !== "undefined" && convertHint) convertHint.textContent = "Fired rocket! " + rocketUpgrade.count + " remaining.";
   } catch (e) {
     console.warn("useRocket error:", e);
   }
}

 // attempt to buy hull reinforcement
 function attemptPurchaseHull() {
   const hullPriceEl = document.getElementById("hullPrice");
   const hull2PriceEl = document.getElementById("hull2Price");
   const hull2BuyBtnEl = document.getElementById("hull2BuyBtn");
   const targetId = window.upgradesTargetShipId || "basic";
   const target = getShipById(targetId);

   if (!target || !target.owned) {
     if (hullPriceEl) { hullPriceEl.textContent = "You must own the ship to buy its upgrades"; hullPriceEl.style.color = "red"; }
     if (convertHint) convertHint.textContent = "Buy the ship first to purchase its upgrades.";
     return;
   }

   if (!target.upgrades) target.upgrades = {};
   if (target.upgrades.hull) {
     if (hullPriceEl) { hullPriceEl.textContent = "Already purchased"; hullPriceEl.style.color = "#9fffbf"; }
     return;
   }

   const cost = computePrice(20, "hull", targetId);
   if (scBalance < cost) {
     if (hullPriceEl) { hullPriceEl.textContent = "Need " + cost + " SC"; hullPriceEl.style.color = "#ffb59e"; }
     return;
   }

   scBalance = Math.max(0, Math.floor(scBalance - cost));
   target.upgrades.hull = true;

   // Mark global hullUpgrade unlocked and purchased so other owned ships recognize the hull upgrade as available
   try {
     hullUpgrade.unlocked = true;
     hullUpgrade.purchased = true;
     hullUpgrade.hpBonus = hullUpgrade.hpBonus || 20;
   } catch (e) {}

   // Apply hull bonus to owned ships (record per-ship upgrade state) and to the currently selected ship immediately
   try {
     if (Array.isArray(shipRoster)) {
       shipRoster.forEach(s => {
         if (!s || !s.upgrades) s.upgrades = {};
         // mark per-ship hull as purchased
         if (s.owned) {
           s.upgrades.hull = true;
         }
       });
     }
   } catch (e) {}

   // If the purchased hull applies to the currently selected ship, update runtime stats immediately
   try {
     const viewed = getShipById(window.currentShipId || "basic");
     if (viewed && viewed.id === target.id) {
       // increase player maxHealth by the hull bonus and top up current health proportionally (but not exceed new max)
       const bonus = hullUpgrade.hpBonus || 20;
       player.maxHealth = Math.max(player.maxHealth || 100, (viewed.hp || player.maxHealth) + bonus);
       player.health = Math.min(player.maxHealth, player.health + bonus);
     }
   } catch (e) {}



   // apply HP bonus only to that ship if it's the selected ship
   if (window.currentShipId === target.id) {
     player.maxHealth = (player.maxHealth || 100) + (hullUpgrade.hpBonus || 20);
     player.health = Math.min(player.maxHealth, (player.health || player.maxHealth) + (hullUpgrade.hpBonus || 20));
   }

   playerInventory.push({
     id: `${target.id}_hull_reinforcement`,
     name: `${target.name} Hull Reinforcement`,
     description: "Per-ship +20 max HP upgrade (propagated to owned ships).",
     price: cost,
     ownedAt: Date.now(),
   });

   try { unlockFirstUpgrade(); } catch (e) {}
   if (hullPriceEl) { hullPriceEl.textContent = "Owned"; hullPriceEl.style.color = "#9fffbf"; }
   // mark buy button as owned/disabled
   try { const buyBtn = document.getElementById("hullBuyBtn"); if (buyBtn) { buyBtn.textContent = "Owned"; buyBtn.disabled = true; buyBtn.style.opacity = "0.6"; } } catch(e){}
   const menuSCEl3 = document.getElementById("menuSC"); if (menuSCEl3) menuSCEl3.textContent = scBalance;
   if (convertHint) convertHint.textContent = `${target.name} Hull Reinforcement purchased for ${cost} SC!`;

   // Reveal hull2 for owned ships
   if (hull2PriceEl) {
     hull2PriceEl.textContent = computePrice(hullUpgrade2.price || 35, "hull", targetId) + " SC";
     hull2PriceEl.style.color = "#ffd86b";
   }
   if (hull2BuyBtnEl) hull2BuyBtnEl.style.display = "inline-block";
   target.upgrades.hull2Available = true;
 }

 // --- Engine Tuning purchase handler (adds +3 speed permanently) ---
 function attemptPurchaseSpeed() {
   const speedPriceEl = document.getElementById("speedPrice");
   const targetId = window.upgradesTargetShipId || "basic";
   const target = getShipById(targetId);
   const cost = computePrice(10, "speed", targetId);

   if (!target || !target.owned) {
     if (speedPriceEl) { speedPriceEl.textContent = "You must own the ship to buy its upgrades"; speedPriceEl.style.color = "red"; }
     if (convertHint) convertHint.textContent = "Buy the ship first to purchase its upgrades.";
     return;
   }

   if (!target.upgrades) target.upgrades = {};
   if (target.upgrades.speed) {
     if (speedPriceEl) { speedPriceEl.textContent = "Already purchased"; speedPriceEl.style.color = "#9fffbf"; }
     return;
   }

   if (scBalance < cost) {
     if (speedPriceEl) { speedPriceEl.textContent = "Need " + cost + " SC"; speedPriceEl.style.color = "#ffb59e"; }
     return;
   }

   scBalance = Math.max(0, Math.floor(scBalance - cost));
   target.upgrades.speed = true;

   // mark global speedUpgrade unlocked so other owned ships show/benefit from it
   try {
     speedUpgrade.unlocked = true;
     speedUpgrade.speedBonus = speedUpgrade.speedBonus || 3;
   } catch (e) {}



   // apply to current player if selected
   if (window.currentShipId === target.id) {
     player.speed = (player.speed || 7) + (speedUpgrade.speedBonus || 3);
   }

   playerInventory.push({
     id: `${target.id}_engine_tuning`,
     name: `${target.name} Engine Tuning`,
     description: "Per-ship +3 speed upgrade (propagated to owned ships).",
     price: cost,
     ownedAt: Date.now(),
   });

   try { unlockFirstUpgrade(); } catch (e) {}
   if (speedPriceEl) { speedPriceEl.textContent = "Owned"; speedPriceEl.style.color = "#9fffbf"; }
   // update buy button state
   try { const buyBtn = document.getElementById("speedBuyBtn"); if (buyBtn) { buyBtn.textContent = "Owned"; buyBtn.disabled = true; buyBtn.style.opacity = "0.6"; } } catch(e){}
   const menuSCEl = document.getElementById("menuSC"); if (menuSCEl) menuSCEl.textContent = scBalance;
   if (convertHint) convertHint.textContent = `${target.name} Engine Tuning purchased for ${cost} SC!`;
 }

 // --- Hull Reinforcement 2 purchase handler (unlocked after Hull Reinforcement) ---
 function attemptPurchaseHull2() {
   const priceEl = document.getElementById("hull2Price");
   const buyBtn = document.getElementById("hull2BuyBtn");
   const targetId = window.upgradesTargetShipId || "basic";
   const target = getShipById(targetId);
   const cost = computePrice(hullUpgrade2.price || 35, "hull", targetId);

   if (!target || !target.owned) {
     if (priceEl) { priceEl.textContent = "You must own the ship to buy its upgrades"; priceEl.style.color = "red"; }
     if (convertHint) convertHint.textContent = "Buy the ship first to purchase its upgrades.";
     return;
   }

   if (!target.upgrades || !target.upgrades.hull) {
     if (priceEl) { priceEl.textContent = "Requires Hull Reinforcement"; priceEl.style.color = "#ffb59e"; }
     return;
   }

   if (target.upgrades.hull2) {
     if (priceEl) { priceEl.textContent = "Already purchased"; priceEl.style.color = "#9fffbf"; }
     return;
   }

   if (scBalance < cost) {
     if (priceEl) { priceEl.textContent = "Need " + cost + " SC"; priceEl.style.color = "#ffb59e"; }
     return;
   }

   scBalance = Math.max(0, Math.floor(scBalance - cost));
   target.upgrades.hull2 = true;

   // Mark global hullUpgrade2 unlocked so other owned ships can reflect it
   try {
     hullUpgrade2.unlocked = true;
     hullUpgrade2.purchased = true;
   } catch (e) {}

   // apply to current player if selected
   if (window.currentShipId === target.id) {
     player.maxHealth = (player.maxHealth || 100) + hullUpgrade2.hpBonus;
     player.health = Math.min(player.maxHealth, (player.health || player.maxHealth) + hullUpgrade2.hpBonus);
   }



   playerInventory.push({
     id: `${target.id}_hull_reinforcement_2`,
     name: `${target.name} Hull Reinforcement 2`,
     description: "Per-ship +40 max HP upgrade available to owned ships.",
     price: cost,
     ownedAt: Date.now(),
   });

   if (priceEl) { priceEl.textContent = "Owned"; priceEl.style.color = "#9fffbf"; }
   if (buyBtn) {
     buyBtn.style.display = "none";
   }
   // also set the hull2 buy button to Owned/disabled if present (consistency)
   try { const h2btn = document.getElementById("hull2BuyBtn"); if (h2btn) { h2btn.textContent = "Owned"; h2btn.disabled = true; h2btn.style.opacity = "0.6"; } } catch(e){}
   const elHull2 = document.getElementById("shipUpgradeHull2");
   if (elHull2) { elHull2.classList.add("owned"); elHull2.textContent = "Hull Reinforcement 2 — Owned (+40 max HP)"; }
   const menuSCEl = document.getElementById("menuSC"); if (menuSCEl) menuSCEl.textContent = scBalance;

   try {
     if (!achievements) achievements = {};
     if (!achievements.hull_reinforcement_2) {
       achievements.hull_reinforcement_2 = {
         id: "hull_reinforcement_2",
         name: "Hull Reinforcement II",
         desc: "Buy Hull Reinforcement 2. Reward: 60 SC.",
         description: "woah dont upgrade the hull to much, how will i destroy you",
         unlocked: false,
         claimed: false,
         rewardSC: 60,
       };
     }
     achievements.hull_reinforcement_2.unlocked = true;
     try { showAchievementToast(achievements.hull_reinforcement_2); } catch (e) {}
     try { updateAchievementsUI(); } catch (e) {}
     try { saveState(); } catch (e) {}
   } catch (e) {
     console.warn("Could not auto-unlock hull_reinforcement_2 achievement:", e);
   }

   if (convertHint) convertHint.textContent = `${target.name} Hull Reinforcement 2 purchased for ${cost} SC!`;
 }

 // attempt to buy rocket packs (adds up to qty rockets, capped by maxCount; each piece costs rocketUpgrade.price)
 function attemptPurchaseRocket(qty = 1) {
   const rocketPriceEl = document.getElementById("rocketPrice");
   const rocketLabelEl = document.getElementById("shipUpgradeRocket");
   const targetId = window.upgradesTargetShipId || "basic";
   const target = getShipById(targetId);

   if (!target || !target.owned) {
     if (rocketPriceEl) { rocketPriceEl.textContent = "You must own the ship to buy its upgrades"; rocketPriceEl.style.color = "red"; }
     if (convertHint) convertHint.textContent = "Buy the ship first to purchase its upgrades.";
     return;
   }

   if (!target.upgrades) target.upgrades = {};
   if (typeof target.upgrades.rockets !== "number") target.upgrades.rockets = 0;

   const basePer = rocketUpgrade.price || 5;
   const costPer = computePrice(basePer, "rocket", targetId); // rockets cost +2 on cosmic
   let requested = Math.max(1, Math.floor(Number(qty) || 1));

   const spaceLeftForShip = Math.max(0, (rocketUpgrade.maxCount || 100) - (target.upgrades.rockets || 0));
   if (spaceLeftForShip <= 0) {
     if (rocketPriceEl) { rocketPriceEl.textContent = "Inventory Full"; rocketPriceEl.style.color = "#ffb59e"; }
     return;
   }

   const toBuy = Math.min(requested, spaceLeftForShip);
   const totalCost = costPer * toBuy;
   if (scBalance < totalCost) {
     if (rocketPriceEl) { rocketPriceEl.textContent = "Need " + totalCost + " SC"; rocketPriceEl.style.color = "#ffb59e"; }
     return;
   }

   scBalance = Math.max(0, Math.floor(scBalance - totalCost));
   // update per-ship storage
   target.upgrades.rockets = Math.min(rocketUpgrade.maxCount, (target.upgrades.rockets || 0) + toBuy);
   // also update global runtime rocket count so in-game firing and achievement checks work
   rocketUpgrade.count = (rocketUpgrade.count || 0) + toBuy;
   if (rocketUpgrade.count > (rocketUpgrade.maxCount || 100)) rocketUpgrade.count = rocketUpgrade.maxCount || 100;

   // mark rockets globally available/unlocked so other owned ships can fire them (since rocketUpgrade.count is global)
   try {
     rocketUpgrade.unlocked = true;
   } catch (e) {}



   playerInventory.push({
     id: `${target.id}_rocket_pack`,
     name: `${target.name} Rocket Charge x${toBuy}`,
     description: `Purchased ${toBuy} rocket(s) for ${target.name}.`,
     price: totalCost,
     qty: toBuy,
     ownedAt: Date.now(),
   });

   try { unlockFirstUpgrade(); } catch (e) {}

   if (rocketPriceEl) { rocketPriceEl.textContent = target.upgrades.rockets + " / " + rocketUpgrade.maxCount + " owned"; rocketPriceEl.style.color = "#9fffbf"; }
   if (rocketLabelEl) { rocketLabelEl.textContent = "Rocket Upgrade — x" + target.upgrades.rockets + " owned"; if (target.upgrades.rockets > 0) rocketLabelEl.classList.add("owned"); }
   // if we filled at least one rocket, update/hide the buy button to reflect ownership state
   try { const buyBtn = document.getElementById("rocketBuyBtn"); if (buyBtn) { buyBtn.textContent = "Owned"; if ((target.upgrades.rockets||0) >= 1) { buyBtn.disabled = false; /* keep enabled to allow buying more */ } } } catch(e){}

   const menuSCEl = document.getElementById("menuSC"); if (menuSCEl) menuSCEl.textContent = scBalance;
   if (convertHint) convertHint.textContent = `Purchased ${toBuy} Rocket Charge(s) for ${target.name}. You now have ${target.upgrades.rockets} / ${rocketUpgrade.maxCount}.`;

   // Unlock the Upgraded Firepower achievement immediately when the player acquires at least one rocket.
   try {
     if (achievements && achievements.upgraded_firepower && !achievements.upgraded_firepower.unlocked) {
       // detect either global count or per-ship possession
       const ownedRockets = (rocketUpgrade && rocketUpgrade.count) ? rocketUpgrade.count : (target.upgrades.rockets || 0);
       if (ownedRockets >= 1) {
         achievements.upgraded_firepower.unlocked = true;
         showAchievementToast(achievements.upgraded_firepower);
         updateAchievementsUI();
         // persist unlocked state
         try { saveState(); } catch (e) {}
       }
     }
   } catch (e) {}
 }

 // wire hull buy button if present
 const hullBuyBtn = document.getElementById("hullBuyBtn");
 if (hullBuyBtn) {
   hullBuyBtn.addEventListener("click", (ev) => {
     ev.preventDefault();
     attemptPurchaseHull();
   });
 }

 // wire hull2 buy button if present
 const hull2BuyBtn = document.getElementById("hull2BuyBtn");
 if (hull2BuyBtn) {
   hull2BuyBtn.addEventListener("click", (ev) => {
     ev.preventDefault();
     attemptPurchaseHull2();
   });
 }

 // --- Engine Tuning buy wiring (new) ---
 const speedBuyBtn = document.getElementById("speedBuyBtn");
 if (speedBuyBtn) {
   speedBuyBtn.addEventListener("click", (ev) => {
     ev.preventDefault();
     attemptPurchaseSpeed();
   });
 }

 // --- Rocket Upgrade buy wiring ---
 const rocketBuyBtn = document.getElementById("rocketBuyBtn");
 const rocketIconBtn = document.getElementById("rocketIconBtn");
 if (rocketBuyBtn) {
   rocketBuyBtn.addEventListener("click", (ev) => {
     ev.preventDefault();
     // read requested amount from input (fall back to 1 when invalid)
     const amtInput = document.getElementById("rocketAmount");
     const requested = amtInput ? Math.max(1, Math.floor(Number(amtInput.value || 1) || 1)) : 1;
     attemptPurchaseRocket(requested);
   });
 }
 if (rocketIconBtn) {
   // toggle description on click (mirrors other icon behavior)
   rocketIconBtn.addEventListener("click", (e) => {
     e.preventDefault();
     const rocketDescEl = document.getElementById("rocketDesc");
     if (rocketDescEl) {
       rocketDescEl.style.display = rocketDescEl.style.display === "none" || rocketDescEl.style.display === "" ? "block" : "none";
     }
   });
   // double-click quick buy
   rocketIconBtn.addEventListener("dblclick", (e) => {
     e.preventDefault();
     attemptPurchaseRocket();
   });
 }

 // toggle shield with key "1" when unlocked (press toggles whichever shield is equipped)
 document.addEventListener("keydown", (e) => {
   if (e.code === "Digit1") {
     // must be playing
     if (!gameStarted || gameOver) return;

     // Front shield takes precedence if equipped
     if (frontShield.unlocked && frontShield.equipped) {
       if (frontShield.active) {
         frontShield.active = false;
       } else {
         if (frontShield.hp > 0) {
           frontShield.active = true;
         } else {
           if (convertHint) convertHint.textContent = "Front Shield depleted — recharging...";
         }
       }
       return;
     }

     // fallback to full-body shield if equipped
     if (shieldUpgrade.unlocked && shieldUpgrade.equipped) {
       if (shieldUpgrade.active) {
         shieldUpgrade.active = false;
       } else {
         if (shieldUpgrade.hp > 0) {
           shieldUpgrade.active = true;
         } else {
           if (convertHint) convertHint.textContent = "Shield depleted — recharging...";
         }
       }
     }
   }
 });

 // --- Shield update & draw integration ---
 // We'll integrate shield logic into the update() and draw() loops below by:
 //  - consuming damage from frontal impacts
 //  - tracking lastHitAt for recharge timing
 //  - slowly recharging when offline and past delay
 //
 // Insert a small helper to determine whether an incoming hit is from the front of the ship.
 function isFrontHit(objX, objY) {
   // kept for legacy checks but full-body shield ignores direction when equipped
   const cx = player.x + player.width / 2;
   const cy = player.y + player.height / 2;
   const vx = objX - cx;
   const vy = objY - cy;
   const mag = Math.hypot(vx, vy) || 1;
   const nx = vx / mag;
   const ny = vy / mag;
   const forwardX = Math.cos(player.angle - Math.PI / 2);
   const forwardY = Math.sin(player.angle - Math.PI / 2);
   const dot = nx * forwardX + ny * forwardY;
   return dot > 0.1;
 }

 // Integrate shield checks into collision handling by wrapping the player's damage handler:
 // This version supports both frontShield (frontal-only) and full-body shieldUpgrade.
 const _origHandlePlayerDamage = handlePlayerDamage;
 function shieldAwareDamage(damage, sourceX = null, sourceY = null) {
   const d = Number(damage) || 0;
   if (d <= 0) return;

   const now = performance.now();

   // Helper to attempt absorption by a shield object; returns true if absorbed
   function tryAbsorb(sh, isFrontOnly = false) {
     if (!sh || !sh.unlocked || !sh.equipped || !sh.active || sh.hp <= 0) return false;
     if (isFrontOnly) {
       // require source coords to test frontal hit; if not available, be conservative and do not absorb
       if (sourceX === null || sourceY === null) return false;
       if (!isFrontHit(sourceX, sourceY)) return false;
     }
     // absorb damage
     sh.hp = Math.max(0, sh.hp - d);
     sh.lastHitAt = now;
     if (sh.hp <= 0) {
       sh.active = false; // auto-off when depleted
     }
     return true;
   }

   // Front shield has priority for frontal hits
   if (frontShield.unlocked && frontShield.equipped && frontShield.active) {
     if (tryAbsorb(frontShield, true)) return;
   }

   // Full-body shield can absorb from any direction
   if (shieldUpgrade.unlocked && shieldUpgrade.equipped && shieldUpgrade.active) {
     if (tryAbsorb(shieldUpgrade, false)) return;
   }

   // no shield absorbed: apply hull damage
   _origHandlePlayerDamage(d);
 }

 // replace references to handlePlayerDamage in code with shieldAwareDamage where we have source coordinates.
 // For existing collision points below where handlePlayerDamage was called without source coords,
 // we'll keep calls but also update key spots:
 // - enemy ram collision (we can pass enemy position)
 // - enemy bullets hitting player (we can pass bullet position)
 // - asteroid collisions (we can pass asteroid position)
 // For safety, leave original function available as _origHandlePlayerDamage.

 // Close upgrades modal
 if (closeUpgrades) {
   closeUpgrades.addEventListener("click", () => {
     if (!upgradesModal) return;
     upgradesModal.setAttribute("aria-hidden", "true");
     upgradesModal.style.zIndex = "";
     if (gameStarted && !gameOver) {
       gamePaused = false;
       hideMenu();
     } else {
       showMenu();
     }
   });
 }

  // Convert button logic (Score -> SC) and reverse (SC -> Score)
 if (convertBtn && convertAmount) {
  convertBtn.addEventListener("click", () => {
    const raw = Number(convertAmount.value || 0);
    const val = Math.floor(raw); // force integer
    // require positive integer and enough score
    if (!Number.isFinite(val) || val <= 0) {
      if (convertHint) convertHint.textContent = "Enter a positive whole number.";
      return;
    }
    if (val > score) {
      if (convertHint) convertHint.textContent = "You don't have that much Score to convert.";
      return;
    }
    // perform conversion: deduct exactly the entered Score, award SC = floor(val / 100)
    const scGain = Math.floor(val / 100);
    score -= val; // remove exactly the requested Score amount
    // ensure score never negative (defensive)
    if (score < 0) score = 0;
    scBalance += scGain;
    if (convertHint) {
      convertHint.textContent = "Converted " + val + " Score into " + scGain + " SC.";
      if (scGain === 0) convertHint.textContent += " (no full 100s converted)";
    }
    // clear input
    convertAmount.value = "";
  });
}

 // Reverse conversion: SC -> Score (1 SC = 100 Score)
 const convertSCBtn = document.getElementById("convertSCBtn");
 const convertSCAmount = document.getElementById("convertSCAmount");
 const convertSCHint = document.getElementById("convertSCHint");

 if (convertSCBtn && convertSCAmount) {
   convertSCBtn.addEventListener("click", () => {
     const rawSC = Number(convertSCAmount.value || 0);
     const scVal = Math.floor(rawSC);
     if (!Number.isFinite(scVal) || scVal <= 0) {
       if (convertSCHint) convertSCHint.textContent = "Enter a positive whole number of SC to convert.";
       return;
     }
     if (scVal > scBalance) {
       if (convertSCHint) convertSCHint.textContent = "You don't have that many SC.";
       return;
     }
     // perform conversion: subtract SC and add Score
     scBalance -= scVal;
     const scoreGain = scVal * 100;
     score += scoreGain;
     if (convertHint) convertHint.textContent = "Converted " + scVal + " SC into " + scoreGain + " Score.";
     if (convertSCHint) convertSCHint.textContent = "Converted " + scVal + " SC into " + scoreGain + " Score.";
     // clear input
     convertSCAmount.value = "";
   });
 }

 // Open settings (from pause menu) — keep pause overlay under the modal
 if (pauseSettingsBtn) {
   pauseSettingsBtn.addEventListener("click", (e) => {
     e.preventDefault();
     if (!settingsModal) return;
     // mark that settings was opened while pause overlay was visible
     modalOpenedFromPause = !!(pauseMenuEl && pauseMenuEl.getAttribute("aria-hidden") === "false");
     settingsModal.style.zIndex = "1110";
     settingsModal.setAttribute("aria-hidden", "false");
     // ensure pause overlay remains visible but under the modal
     if (pauseMenuEl) pauseMenuEl.style.zIndex = "1000";
     // pause the game if it was running already
     if (gameStarted && !gameOver) {
       gamePaused = true;
     }
   });
 }

 // Close settings
 if (closeSettings) {
   closeSettings.addEventListener("click", () => {
     if (!settingsModal) return;
     settingsModal.setAttribute("aria-hidden", "true");
     settingsModal.style.zIndex = "";
     if (pauseMenuEl) pauseMenuEl.style.zIndex = "";
     // If the settings modal was opened from the pause overlay, restore pause overlay and keep paused
     if (modalOpenedFromPause) {
       gamePaused = true;
       if (pauseMenuEl) pauseMenuEl.setAttribute("aria-hidden", "false");
       modalOpenedFromPause = false;
       return;
     }
     // otherwise restore normal menu/game state
     if (gameStarted && !gameOver) {
       // if the game was running, unpause
       gamePaused = false;
       hideMenu();
     } else {
       showMenu();
     }
   });
 }

// Clicking outside the settings modal-card closes it
if (settingsModal) {
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      if (settingsModal) {
        settingsModal.setAttribute("aria-hidden", "true");
        settingsModal.style.zIndex = "";
      }
      if (pauseMenuEl) pauseMenuEl.style.zIndex = "";
      if (gameStarted && !gameOver) {
        gamePaused = false;
        hideMenu();
      } else {
        showMenu();
      }
    }
  });
}

/* Escape key handling:
   - If How modal open -> close it
   - Else if Pause menu open -> close it
   - Else if playing -> open Pause menu
*/
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (howModal && howModal.getAttribute("aria-hidden") === "false") {
      closeHowModal();
      return;
    }
    if (pauseMenuEl && pauseMenuEl.getAttribute("aria-hidden") === "false") {
      closePauseMenu();
      return;
    }
    // open pause only when game is active
    if (gameStarted && !gameOver) {
      openPauseMenu();
    }
  }
});

  // --- Handle Restart / Menu Clicks on canvas (game-over UI) ---
 canvas.addEventListener("click", function (e) {
   if (!gameOver) return;
 

   // account for CSS scaling of the canvas (map client coords to internal canvas pixels)
   let rect = canvas.getBoundingClientRect();
   const scaleX = canvas.width / rect.width;
   const scaleY = canvas.height / rect.height;
   let mouseX = (e.clientX - rect.left) * scaleX;
   let mouseY = (e.clientY - rect.top) * scaleY;

   // coordinates must match the drawn buttons in draw()
   const restartW = 120;
   const restartH = 40;
   const restartX = canvas.width / 2 - restartW / 2;
   const restartY = canvas.height / 2 + 80;

   const menuW = 160;
   const menuH = 40;
   const menuX = canvas.width / 2 - menuW / 2;
   const menuY = restartY + restartH + 20;

   // Restart button clicked
   if (
     mouseX > restartX &&
     mouseX < restartX + restartW &&
     mouseY > restartY &&
     mouseY < restartY + restartH
   ) {
     // hide menu overlay if it was visible, restart game
     const menu = document.getElementById("menu");
     if (menu) menu.style.display = "none";
     startGame();
     return;
   }

   // Main Menu button clicked
   if (
     mouseX > menuX &&
     mouseX < menuX + menuW &&
     mouseY > menuY &&
     mouseY < menuY + menuH
   ) {
     // merge current run into stored totals before returning to menu
     saveStateAdditive();

     // stop spawning and clear any intervals
     if (spawnInterval) {
       clearInterval(spawnInterval);
       spawnInterval = null;
     }
     // ensure the game is fully stopped and game-over canvas UI is cleared
     gameStarted = false;
     gameOver = false;

     // stop any playing bullet sounds immediately and clear bullets/asteroids
     player.bullets.forEach((b) => {
       if (b.sound) stopAndCleanSound(b.sound);
     });
     player.bullets = [];
     resetAsteroids();

     // show the overlay menu (hide any game-over buttons drawn on the canvas)
     showMenu();
     return;
   }
 });
 
 // --- Devtools: password-protected small panel to grant SC ---
 (function wireDevtools() {
   const devBtn = document.getElementById("devtoolsBtn");
   const devModal = document.getElementById("devtoolsModal");
   const devPassClose = document.getElementById("devPassClose");
   const devPassConfirm = document.getElementById("devPassConfirm");
   const devPassword = document.getElementById("devPassword");
   const devPanel = document.getElementById("devPanel");
   const devGrantSC = document.getElementById("devGrantSC");
   const devGiveSCBtn = document.getElementById("devGiveSCBtn");
   const devLogoutBtn = document.getElementById("devLogoutBtn");
   const devMsg = document.getElementById("devMsg");
   const closeDevtools = document.getElementById("closeDevtools");

   const CORRECT = "whyareyouhere";

   function openModal() {
     if (!devModal) return;
     devModal.setAttribute("aria-hidden", "false");
     devModal.style.zIndex = "1500";
     // show password view by default
     const wrap = document.getElementById("devPassWrap");
     if (wrap) wrap.style.display = "block";
     if (devPanel) devPanel.style.display = "none";
     if (devPassword) {
       devPassword.value = "";
       // focus the password input shortly after opening so typing works reliably
       setTimeout(() => {
         try { devPassword.focus(); } catch (e) {}
       }, 60);
     }
     if (devMsg) devMsg.textContent = "";
   }

   function closeModal() {
     if (!devModal) return;
     devModal.setAttribute("aria-hidden", "true");
     devModal.style.zIndex = "";
   }

   if (devBtn) {
     devBtn.addEventListener("click", (e) => {
       e.preventDefault();
       openModal();
     });
   }
   if (devPassClose) devPassClose.addEventListener("click", closeModal);
   if (closeDevtools) closeDevtools.addEventListener("click", closeModal);

   if (devPassConfirm) {
     devPassConfirm.addEventListener("click", (e) => {
       const val = devPassword ? String(devPassword.value || "") : "";
       if (val === CORRECT) {
         // unlock panel
         const wrap = document.getElementById("devPassWrap");
         if (wrap) wrap.style.display = "none";
         if (devPanel) devPanel.style.display = "block";
         if (devMsg) {
           devMsg.style.color = "#cfe6ff";
           devMsg.textContent = "Unlocked.";
         }
       } else {
         if (devMsg) {
           devMsg.style.color = "#ffb59e";
           devMsg.textContent = "Incorrect password.";
         }
       }
     });
   }

   if (devGiveSCBtn) {
     devGiveSCBtn.addEventListener("click", (e) => {
       e.preventDefault();
       const n = Math.max(0, Math.floor(Number(devGrantSC.value || 0)));
       if (!Number.isFinite(n) || n <= 0) {
         if (devMsg) { devMsg.style.color = "#ffb59e"; devMsg.textContent = "Enter a positive number."; }
         return;
       }
       scBalance = Math.max(0, Math.floor(scBalance + n));
       // update menu UI
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = `Dev: added ${n} SC.`;
       if (devMsg) { devMsg.style.color = "#9fffbf"; devMsg.textContent = `Added ${n} SC.`; }
       try { saveState(); } catch (e) {}
     });
   }

   // Remove SC handler
   const devRemoveSCBtn = document.getElementById("devRemoveSCBtn");
   if (devRemoveSCBtn) {
     devRemoveSCBtn.addEventListener("click", (e) => {
       e.preventDefault();
       const n = Math.max(0, Math.floor(Number(devGrantSC.value || 0)));
       if (!Number.isFinite(n) || n <= 0) {
         if (devMsg) { devMsg.style.color = "#ffb59e"; devMsg.textContent = "Enter a positive number to remove."; }
         return;
       }
       scBalance = Math.max(0, Math.floor(scBalance - n));
       const menuSCEl = document.getElementById("menuSC");
       if (menuSCEl) menuSCEl.textContent = scBalance;
       if (convertHint) convertHint.textContent = `Dev: removed ${n} SC.`;
       if (devMsg) { devMsg.style.color = "#ffd1a8"; devMsg.textContent = `Removed ${n} SC.`; }
       try { saveState(); } catch (e) {}
     });
   }

   // Grant Points (Score) from dev panel
   const devGivePointsBtn = document.getElementById("devGivePointsBtn");
   const devGrantPoints = document.getElementById("devGrantPoints");
   if (devGivePointsBtn) {
     devGivePointsBtn.addEventListener("click", (e) => {
       e.preventDefault();
       const n = Math.max(0, Math.floor(Number(devGrantPoints.value || 0)));
       if (!Number.isFinite(n) || n <= 0) {
         if (devMsg) { devMsg.style.color = "#ffb59e"; devMsg.textContent = "Enter a positive number of Points."; }
         return;
       }
       // add to runtime score (Points)
       score = Math.max(0, Math.floor(score + n));
       // update menu HUD and in-game HUD
       const menuScoreEl = document.getElementById("menuScore");
       const menuSCEl = document.getElementById("menuSC");
       if (menuScoreEl) menuScoreEl.textContent = score;
       // Also update canvas-drawn Points HUD by forcing a quick saveState (UI reads 'score' directly)
       if (convertHint) convertHint.textContent = `Dev: added ${n} Points.`;
       if (devMsg) { devMsg.style.color = "#9fffbf"; devMsg.textContent = `Added ${n} Points.`; }
       try { saveState(); } catch (e) {}
     });
   }

   // Remove Points handler
   const devRemovePointsBtn = document.getElementById("devRemovePointsBtn");
   if (devRemovePointsBtn) {
     devRemovePointsBtn.addEventListener("click", (e) => {
       e.preventDefault();
       const n = Math.max(0, Math.floor(Number(devGrantPoints.value || 0)));
       if (!Number.isFinite(n) || n <= 0) {
         if (devMsg) { devMsg.style.color = "#ffb59e"; devMsg.textContent = "Enter a positive number to remove."; }
         return;
       }
       score = Math.max(0, Math.floor(score - n));
       const menuScoreEl = document.getElementById("menuScore");
       if (menuScoreEl) menuScoreEl.textContent = score;
       if (convertHint) convertHint.textContent = `Dev: removed ${n} Points.`;
       if (devMsg) { devMsg.style.color = "#ffd1a8"; devMsg.textContent = `Removed ${n} Points.`; }
       try { saveState(); } catch (e) {}
     });
   }

   if (devLogoutBtn) {
     devLogoutBtn.addEventListener("click", (e) => {
       e.preventDefault();
       // return to locked state
       const wrap = document.getElementById("devPassWrap");
       if (wrap) wrap.style.display = "block";
       if (devPanel) devPanel.style.display = "none";
       if (devMsg) { devMsg.textContent = ""; }
       if (devPassword) devPassword.value = "";
     });
   }

   // allow Enter key to confirm password
   if (devPassword) {
     devPassword.addEventListener("keydown", (ev) => {
       if (ev.key === "Enter") {
         ev.preventDefault();
         devPassConfirm.click();
       }
     });
   }

   // Close modal when clicking outside card
   if (devModal) {
     devModal.addEventListener("click", (ev) => {
       if (ev.target === devModal) closeModal();
     });
   }
 })();

 // NEW: Cosmic Striker purchase achievement registration, UI row update and claim handling.
 try {
   // register achievement entry if absent
   if (!achievements.cosmic_striker_purchase) {
     achievements.cosmic_striker_purchase = {
       id: "cosmic_striker_purchase",
       name: "Cosmic Striker Purchase",
       desc: "Buy the Cosmic Striker ship. Reward: 100 SC.",
       description: "eyyy where did you get that!!",
       unlocked: false,
       claimed: false,
       rewardSC: 100,
     };
   }

   // Add dynamic wiring to update the new achievement UI row (status + claim button)
   function updateCosmicAchievementUI() {
     try {
       const a = achievements.cosmic_striker_purchase;
       const statusEl = document.getElementById("ach-cosmic-status");
       const claimBtn = document.getElementById("claimCosmicBtn");
       if (!statusEl || !claimBtn || !a) return;
       if (!a.unlocked) {
         statusEl.textContent = "Locked";
         statusEl.style.color = "#076a2f";
         claimBtn.style.display = "none";
       } else if (!a.claimed) {
         statusEl.textContent = "Unlocked";
         statusEl.style.color = "#076a2f";
         claimBtn.style.display = "inline-block";
       } else {
         statusEl.textContent = "Claimed";
         statusEl.style.color = "#fff";
         statusEl.style.background = "linear-gradient(180deg,#2fd1ff 0%,#1bb0e6 100%)";
         statusEl.style.padding = "6px 10px";
         statusEl.style.borderRadius = "8px";
         statusEl.style.fontWeight = "800";
         claimBtn.style.display = "none";
       }
     } catch (e) {
       console.warn("updateCosmicAchievementUI failed:", e);
     }
   }

   // attempt to unlock when the cosmic2 ship is purchased/owned (called every achievements check)
   (function patchCheckAchievementsForCosmic() {
     const orig = checkAchievements;
     checkAchievements = function () {
       try {
         // existing checks
         if (typeof orig === "function") orig();
       } catch (e) {}
       try {
         // unlock when the player owns the 'cosmic2' ship in shipRoster
         try {
           const ownedCosmic = Array.isArray(shipRoster) && shipRoster.some(s => s && s.id === "cosmic2" && !!s.owned);
           if (ownedCosmic && achievements.cosmic_striker_purchase && !achievements.cosmic_striker_purchase.unlocked) {
             achievements.cosmic_striker_purchase.unlocked = true;
             // show toast and update UI
             try { showAchievementToast(achievements.cosmic_striker_purchase); } catch (e) {}
             try { updateCosmicAchievementUI(); } catch (e) {}
           }
         } catch (e) {}
       } catch (e) {}
     };
   })();

   // wire claim button (gives 100 SC)
   (function wireCosmicClaim() {
     // delegate click to the document so the handler works regardless of timing
     document.addEventListener("click", (ev) => {
       try {
         const t = ev.target;
         if (!t || t.id !== "claimCosmicBtn") return;
         const a = achievements.cosmic_striker_purchase;
         if (!a || !a.unlocked || a.claimed) return;
         // award SC
         scBalance = Math.max(0, Math.floor(scBalance + (a.rewardSC || 100)));
         a.claimed = true;
         // update UI and HUD
         updateCosmicAchievementUI();
         const menuSCEl = document.getElementById("menuSC");
         if (menuSCEl) menuSCEl.textContent = scBalance;
         if (convertHint) convertHint.textContent = `Claimed ${a.rewardSC || 100} SC for ${a.name}!`;
         try { saveState(); } catch (e) {}
       } catch (e) {}
     });

     // Also refresh cosmic achievement UI when achievements panel opens/updates
     const origUpdate = updateAchievementsUI;
     updateAchievementsUI = function () {
       try { if (typeof origUpdate === "function") origUpdate(); } catch (e) {}
       try { updateCosmicAchievementUI(); } catch (e) {}
     };
   })();

   // ensure UI is in sync at load
   try { updateCosmicAchievementUI(); } catch (e) {}
 } catch (e) {
   console.warn("Cosmic striker achievement registration failed:", e);
 }