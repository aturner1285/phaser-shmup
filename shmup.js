// shmup.js — Phaser 3.60
// Fixed & tidied version focusing on:
// 1) Remove duplicate player-hit overlaps (single i-frame aware handler)
// 2) Particle perf: one particle manager per color; emitters per bullet, cleaned on recycle
// 3) Standardize drone loss via loseAllDrones() and call it from hitPlayer()
// 4) Remove redundant per-frame zeroing of velocity; keep inertia logic clean
// 5) Power-up timer callback signature cleanup

/* eslint-disable no-undef */

class ShmupScene extends Phaser.Scene {
  constructor() {
    super('ShmupScene');

    // --- Tunables / knobs ---
    this.spawnDelay = 1200;              // Enemy spawn every X ms
    this.fireRate = 220;                 // Player fire cooldown (ms)
    this.enemyBaseFireMin = 1000;        // Minimum enemy fire rate guard
    this.weights = { A: 0.5, B: 0.3, C: 0.2 }; // Spawn mix

    // Player / run state
    this.score = 0;
    this.lives = 3;
    this.isGameOver = false;
    this.iframesMs = 1200; // player invulnerability after a hit

    // Drones
    this.maxDrones = 4;
    this.droneCount = 0;
    this.drones = [];
  }

  preload() {
    // Expect assets preloaded elsewhere in a boot scene.
    // If you need placeholders, uncomment these lines:
    // this.load.image('player', 'assets/player.png');
    // this.load.image('bullet', 'assets/bullet.png');
    // this.load.image('enemyA', 'assets/enemyA.png');
    // this.load.image('enemyB', 'assets/enemyB.png');
    // this.load.image('enemyC', 'assets/enemyC.png');
    // this.load.image('power',  'assets/power.png');
    // this.load.atlas('spark', 'assets/spark.png', 'assets/spark.json');
  }

  create() {
    // --- Starfield parallax ---
    const { width, height } = this.scale;
    this.stars = [
      this.add.tileSprite(0, 0, width, height, 'stars0').setOrigin(0),
      this.add.tileSprite(0, 0, width, height, 'stars1').setOrigin(0).setAlpha(0.8),
      this.add.tileSprite(0, 0, width, height, 'stars2').setOrigin(0).setAlpha(0.6)
    ];

    // --- Player ---
    this.player = this.physics.add.sprite(width/2, height-60, 'player');
    this.player.setDamping(true).setDrag(0.002).setMaxVelocity(260, 260);
    this.player.setCollideWorldBounds(true);
    this.player.setData('canFireAt', 0);
    this.player.setData('iframes', false);

    // Input
    this.keys = this.input.keyboard.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      w: 'W', a: 'A', s: 'S', d: 'D',
      space: 'SPACE',
      restart: 'R',
      pause: 'P'
    });

    // --- Pools ---
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 200, runChildUpdate: false });
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 200, runChildUpdate: false });
    this.enemies = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 64, runChildUpdate: false });
    this.powerups = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 12, runChildUpdate: false });

    // Immovable enemies for non-push overlap
    this.enemies.children.iterate(e => e?.body?.setImmovable(true));

    // --- Particle managers (FIX #2) ---
    // Create exactly ONE particle manager per color; later we create cheap emitters per bullet
    this.fxBlueMgr = this.add.particles(0, 0, 'spark', {});
    this.fxRedMgr  = this.add.particles(0, 0, 'spark', {});

    // --- Timers ---
    this.enemyTimer = this.time.addEvent({ delay: this.spawnDelay, loop: true, callback: () => this.spawnEnemy() });

    // Power-up timer (FIX #5: clean signature, pause at cap via updatePowerUpClock)
    this.powerTimer = this.time.addEvent({ delay: 15000, loop: true, callback: () => this.spawnPowerUp() });
    this.updatePowerUpClock();

    // --- HUD ---
    this.hud = this.add.text(8, 8, '', { fontFamily: 'monospace', fontSize: '14px', color: '#fff' })
      .setScrollFactor(0).setDepth(1000);
    this.high = Number(localStorage.getItem('highScore') || 0);
    this.updateHud();

    // --- Collisions / Overlaps ---
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this);
    // FIX #1: only use a single consolidated player-hit overlap that respects i-frames
    this.enablePlayerHitOverlap();
    this.physics.add.overlap(this.player, this.powerups, this.onCollectPower, null, this);

    // Camera
    this.cameras.main.startFollow(this.player, false, 0.08, 0.08);

    // Restart handler
    this.input.keyboard.on('keydown-R', () => this.tryRestart());
  }

  // --- HUD helpers ---
  updateHud() {
    this.hud.setText(
      `Score: ${this.score}\nHigh: ${this.high}\nLives: ${this.lives}  Drones: ${this.droneCount}/${this.maxDrones}`
    );
  }

  // --- Player hit handling (single path) ---
  enablePlayerHitOverlap() {
    // One set of overlaps that routes to hitPlayer() which respects i-frames
    this.physics.add.overlap(this.player, this.enemies, (p, e) => this.hitPlayer(e), null, this);
    this.physics.add.overlap(this.player, this.enemyBullets, (p, b) => this.hitPlayer(b), null, this);
  }

  hitPlayer(source) {
    if (this.isGameOver) return;
    if (this.player.getData('iframes')) return; // i-frames gate

    // Consume the source if it's a bullet
    if (source && source.active && source.texture && source.texture.key !== 'player') {
      this.recycleBullet(source);
    }

    // Visual feedback
    this.cameras.main.shake(100, 0.006);
    this.flashSprite(this.player);

    // Apply damage
    this.lives -= 1;
    this.updateHud();

    // FIX #3: unify drone loss path
    this.loseAllDrones();

    // I-frames flicker
    this.player.setData('iframes', true);
    this.tweens.add({ targets: this.player, alpha: 0.2, duration: 100, yoyo: true, repeat: Math.floor(this.iframesMs/200) });
    this.time.delayedCall(this.iframesMs, () => this.player.setData('iframes', false));

    if (this.lives <= 0) {
      this.gameOver();
    }
  }

  flashSprite(s) {
    s.setTintFill(0xffffff);
    this.time.delayedCall(60, () => s.clearTint());
  }

  // --- Game over / restart ---
  gameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.physics.world.pause();
    if (this.score > this.high) {
      this.high = this.score;
      localStorage.setItem('highScore', String(this.high));
    }
    const { width, height } = this.scale;
    this.add.text(width/2, height/2, 'GAME OVER\nPress R to Restart', { fontFamily: 'monospace', fontSize: '20px', color: '#fff', align: 'center' })
      .setOrigin(0.5).setDepth(2000);
  }

  tryRestart() {
    if (!this.isGameOver) return;
    this.scene.restart();
  }

  // --- Power-ups & drones ---
  spawnPowerUp() {
    if (this.isGameOver) return;
    if (this.droneCount >= this.maxDrones) return; // also guarded by paused timer

    const x = Phaser.Math.Between(24, this.scale.width - 24);
    const y = -20;
    const p = this.powerups.get(x, y, 'power');
    if (!p) return;
    p.setActive(true).setVisible(true);
    this.physics.world.enable(p);
    p.body.setVelocity(0, 80);
  }

  updatePowerUpClock() {
    if (!this.powerTimer) return;
    this.powerTimer.paused = (this.droneCount >= this.maxDrones);
  }

  onCollectPower(player, p) {
    if (!p.active) return;
    p.disableBody(true, true);
    this.addDrone();
    this.updateHud();
    this.updatePowerUpClock();
  }

  addDrone() {
    if (this.droneCount >= this.maxDrones) return;
    const idx = this.droneCount;
    const angle = (-30 + idx * 20) * (Math.PI/180);
    const d = this.physics.add.sprite(this.player.x + Math.cos(angle)*24, this.player.y + Math.sin(angle)*24, 'player');
    d.setScale(0.6).setAlpha(0.8);
    d.setDepth(this.player.depth - 1);
    d.setData('offsetAngle', angle);
    this.drones.push(d);
    this.droneCount += 1;
  }

  loseAllDrones() {
    // Standardized drone cleanup (FIX #3)
    this.drones.forEach(d => d.destroy());
    this.drones.length = 0;
    this.droneCount = 0;
    this.updatePowerUpClock(); // resumes the timer automatically
    this.updateHud();
  }

  // --- Enemies ---
  spawnEnemy() {
    if (this.isGameOver) return;

    const r = Math.random();
    let type = 'A';
    if (r < this.weights.A) type = 'A';
    else if (r < this.weights.A + this.weights.B) type = 'B';
    else type = 'C';

    const x = Phaser.Math.Between(24, this.scale.width - 24);
    const y = -40;

    const key = type === 'A' ? 'enemyA' : type === 'B' ? 'enemyB' : 'enemyC';
    const e = this.enemies.get(x, y, key);
    if (!e) return;

    e.setActive(true).setVisible(true);
    this.physics.world.enable(e);
    e.body.setImmovable(true);
    e.type = type;
    e.hpMax = (type === 'C') ? 5 : 1;  // Heavy HP (as spec)
    e.hp = e.hpMax;

    // Movement
    const vy = (type === 'C') ? 40 : 80; // C slower
    e.body.setVelocity(Phaser.Math.Between(-20, 20), vy);

    // HP bar for C
    if (type === 'C') this.attachHpBar(e);

    // Per-enemy fire timer
    const baseDelay = Math.max(this.fireRate * 2, this.enemyBaseFireMin);
    const delay = (type === 'B') ? Math.max(baseDelay, this.enemyBaseFireMin) : baseDelay;
    const fireCb = () => {
      if (!e.active || this.isGameOver) return;
      if (type === 'B') this.fireEnemyAimedBullet(e);
      else this.fireEnemyBullet(e);
    };
    const t = this.time.addEvent({ delay, loop: true, callback: fireCb });
    e.setData('fireTimer', t);
  }

  attachHpBar(e) {
    const width = 26, height = 3;
    const bg = this.add.rectangle(e.x, e.y - 18, width, height, 0x000000).setDepth(10);
    const fg = this.add.rectangle(e.x, e.y - 18, width, height, 0x00aaff).setDepth(11);
    e.setData('hpBarBg', bg);
    e.setData('hpBarFg', fg);
  }

  updateHpBar(e) {
    if (e.type !== 'C') return;
    const bg = e.getData('hpBarBg');
    const fg = e.getData('hpBarFg');
    if (!bg || !fg) return;
    const pct = Phaser.Math.Clamp(e.hp / e.hpMax, 0, 1);
    bg.setPosition(e.x, e.y - 18);
    fg.setPosition(e.x - (26*(1-pct))/2, e.y - 18).setSize(26*pct, 3);
  }

  clearHpBar(e) {
    const bg = e.getData('hpBarBg');
    const fg = e.getData('hpBarFg');
    if (bg) bg.destroy();
    if (fg) fg.destroy();
    e.setData('hpBarBg', null);
    e.setData('hpBarFg', null);
  }

  onBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    this.recycleBullet(bullet);

    enemy.hp -= 1;
    this.flashSprite(enemy);
    this.cameras.main.shake(50, 0.002);

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
      this.score += 10;
      this.updateHud();
    } else {
      this.updateHpBar(enemy);
    }
  }

  killEnemy(e) {
    const t = e.getData('fireTimer');
    if (t) t.remove(false);
    this.clearHpBar(e);
    e.disableBody(true, true);
  }

  // --- Bullets ---
  tryFirePlayer() {
    const now = this.time.now;
    if (now < this.player.getData('canFireAt')) return;
    this.player.setData('canFireAt', now + this.fireRate);

    // Player bullet from ship
    this.spawnBullet(this.player.x, this.player.y - 18, 0, -420, 0x66ccff);

    // Mirror fire from drones
    for (const d of this.drones) {
      this.spawnBullet(d.x, d.y - 12, 0, -420, 0x66ccff);
    }
  }

  spawnBullet(x, y, vx, vy, tint) {
    const b = this.bullets.get(x, y, 'bullet');
    if (!b) return null;
    b.setActive(true).setVisible(true);
    b.setDepth(5);
    this.physics.world.enable(b);
    b.body.setVelocity(vx, vy);

    // Particle emitter (FIX #2)
    const em = this.fxBlueMgr.createEmitter({
      speed: 0, lifespan: 240, alpha: { start: 0.7, end: 0 }, scale: { start: 0.45, end: 0.1 }, quantity: 1, frequency: 28,
      tint: tint ?? 0x66ccff, blendMode: 'ADD'
    });
    em.startFollow(b);
    b.setData('emitter', em);

    // Lifespan safety
    this.time.delayedCall(2000, () => this.recycleBullet(b));
    return b;
  }

  fireEnemyBullet(e) {
    const b = this.enemyBullets.get(e.x, e.y + 14, 'bullet');
    if (!b) return;
    b.setTint(0xff4444);
    b.setActive(true).setVisible(true);
    this.physics.world.enable(b);
    b.body.setVelocity(0, 220);

    const em = this.fxRedMgr.createEmitter({
      speed: 0, lifespan: 220, alpha: { start: 0.8, end: 0 }, scale: { start: 1.0, end: 0.1 }, quantity: 1, frequency: 30,
      tint: 0xff4444, blendMode: 'ADD'
    });
    em.startFollow(b);
    b.setData('emitter', em);

    this.time.delayedCall(4000, () => this.recycleBullet(b));
  }

  fireEnemyAimedBullet(e) {
    const b = this.enemyBullets.get(e.x, e.y + 14, 'bullet');
    if (!b) return;
    b.setTint(0xff7777);
    b.setActive(true).setVisible(true);
    this.physics.world.enable(b);

    // Aim
    const angle = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
    const speed = 240;
    b.body.setVelocity(Math.cos(angle)*speed, Math.sin(angle)*speed);

    const em = this.fxRedMgr.createEmitter({
      speed: 0, lifespan: 220, alpha: { start: 0.8, end: 0 }, scale: { start: 1.0, end: 0.1 }, quantity: 1, frequency: 30,
      tint: 0xff4444, blendMode: 'ADD'
    });
    em.startFollow(b);
    b.setData('emitter', em);

    this.time.delayedCall(4000, () => this.recycleBullet(b));
  }

  recycleBullet(go) {
    if (!go || !go.active) return;
    const em = go.getData ? go.getData('emitter') : null;
    if (em) { em.stop(); em.killAll(); em.remove(); go.setData('emitter', null); }
    go.disableBody(true, true);
  }

  // --- Update loop ---
  update(_, dt) {
    if (this.isGameOver) return;

    // Parallax scroll
    this.stars[0].tilePositionY += 0.3 * (dt/16.6667);
    this.stars[1].tilePositionY += 0.6 * (dt/16.6667);
    this.stars[2].tilePositionY += 1.0 * (dt/16.6667);

    // Movement (FIX #4: no redundant zeroing; apply intent -> inertia does the rest)
    const intent = new Phaser.Math.Vector2(0, 0);
    if (this.keys.left.isDown || this.keys.a.isDown) intent.x -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) intent.x += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) intent.y -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) intent.y += 1;

    if (intent.lengthSq() > 0) {
      intent.normalize().scale(380);
      this.player.body.velocity.x += (intent.x - this.player.body.velocity.x) * 0.18;
      this.player.body.velocity.y += (intent.y - this.player.body.velocity.y) * 0.18;
    }

    // Fire
    if (this.keys.space.isDown) this.tryFirePlayer();

    // Enemies housekeeping (hp bars + offscreen cleanup)
    this.enemies.children.iterate(e => {
      if (!e || !e.active) return;
      this.updateHpBar(e);
      if (e.y > this.scale.height + 40 || e.x < -40 || e.x > this.scale.width + 40) {
        const t = e.getData('fireTimer');
        if (t) t.remove(false);
        this.clearHpBar(e);
        e.disableBody(true, true);
      }
    });

    // Drone follow (stick to offsets near player)
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      const base = (-30 + i * 20) * (Math.PI/180);
      const tx = this.player.x + Math.cos(base)*24;
      const ty = this.player.y + Math.sin(base)*18;
      d.x += (tx - d.x) * 0.25;
      d.y += (ty - d.y) * 0.25;
    }

    // Recycle player bullets offscreen
    this.bullets.children.iterate(b => {
      if (b && b.active && (b.y < -20 || b.x < -20 || b.x > this.scale.width + 20)) this.recycleBullet(b);
    });
    this.enemyBullets.children.iterate(b => {
      if (b && b.active && (b.y > this.scale.height + 20 || b.x < -20 || b.x > this.scale.width + 20)) this.recycleBullet(b);
    });
  }
}

// Export for module loaders or attach to window
if (typeof module !== 'undefined') {
  module.exports = { ShmupScene };
} else {
  window.ShmupScene = ShmupScene;
}
