class ShmupScene extends Phaser.Scene {
  constructor(){ super('shmup'); }

  preload(){
    this.load.image('ship','assets/ship.png');
    this.load.image('drone','assets/drone.png');
    this.load.image('power','assets/power.png');
    this.load.image('enemyA','assets/enemyA.png'); // basic straight
    this.load.image('enemyB','assets/enemyB.png'); // basic aimed
    this.load.image('enemyC','assets/enemyC.png'); // heavy 5HP
    this.load.image('enemyBullet','assets/enemyBullet.png');
    this.load.image('spark','assets/spark.png');
    this.load.image('star1','assets/star1.png');
    this.load.image('star2','assets/star2.png');
    this.load.image('star3','assets/star3.png');
    this.load.spritesheet('bullet_anim','assets/bullet_anim.png', { frameWidth: 8, frameHeight: 16 });
  }

  create(){
    const { width, height } = this.scale;

    // Background (transparent layers)
    this.bg1 = this.add.tileSprite(0, 0, width, height, 'star1').setOrigin(0).setAlpha(0.12);
    this.bg2 = this.add.tileSprite(0, 0, width, height, 'star2').setOrigin(0).setAlpha(0.20);
    this.bg3 = this.add.tileSprite(0, 0, width, height, 'star3').setOrigin(0).setAlpha(0.30);
    this.bg1.setScrollFactor(0); this.bg2.setScrollFactor(0); this.bg3.setScrollFactor(0);
    this.scrollSpeed = 1.4;

    // Player
    this.player = this.physics.add.image(width/2, height - 120, 'ship').setCollideWorldBounds(true);
    this.player.setAngle(-90);

    // Controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,R');

    // Groups
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 360 });
    this.enemies = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 220 });
    this.powerups = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 8 });
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 360 });

    //Player I-frames + Hit Flash + Screen Shake

    /** Invulnerability window (ms) after a hit */
    this.iFrameDuration = 800;
    /** Whether the player is currently invulnerable */
    this.playerInvulnerable = false;
    /** Lives label refresh helper (optional: keep if you already have one) */
    this.refreshLivesUI = this.refreshLivesUI || (() => {
      if (this.livesText) this.livesText.setText(`Lives: ${this.lives}`);
    });

    /** Fullscreen damage vignette */
    const cam = this.cameras.main;
    this.damageVignette = this.add
      .rectangle(cam.worldView.x, cam.worldView.y, cam.width, cam.height, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)        // stay glued to camera
      .setDepth(9999);

    /** Ensure the vignette resizes with the camera (in case of resize) */
    this.scale.on('resize', (gameSize) => {
      const { width, height } = gameSize;
      this.damageVignette.setSize(width, height);
    }, this);

    /** Camera shake wrapper */
    this.applyCameraShake = (duration = 120, intensity = 0.006) => {
      this.cameras.main.shake(duration, intensity);
    };

    /** Fade the damage vignette in/out */
    this.flashDamageVignette = () => {
      this.damageVignette.setAlpha(0.25);
      this.tweens.add({
        targets: this.damageVignette,
        alpha: 0,
        duration: 250,
        ease: 'Quad.Out'
      });
    };

    /** Handle player being hit by an enemy or bullet */
    this.hitPlayer = (player, hazard) => {
      // If the hazard is an active Arcade body/bullet, clean it up (or recycle)
      if (hazard && hazard.active && hazard.destroy) {
        // If you pool bullets, replace with your recycle function:
        hazard.destroy();
      }

      if (this.playerInvulnerable) return;

      // Enter i-frames
      this.playerInvulnerable = true;

      // Feedback: tint + shake + vignette + (optional) sound
      player.setTint(0xff7a7a);
      this.applyCameraShake(120, 0.006);
      this.flashDamageVignette();
      // Optional SFX if loaded: this.sound.play('hit', { volume: 0.7 });

      // Apply damage rules
      this.lives = Math.max(0, (this.lives ?? 0) - 1);
      this.refreshLivesUI();

      // Your current rule: losing any life clears all drones
      if (typeof this.clearAllDrones === 'function') this.clearAllDrones();
      if (typeof this.updatePowerupTimer === 'function') this.updatePowerupTimer();

      // Brief invulnerability, then clear tint
      this.time.delayedCall(this.iFrameDuration, () => {
        player.clearTint();
        this.playerInvulnerable = false;
      });

      // If you want an immediate game-over check, you can handle it here:
      if (this.lives <= 0) { this.handleGameOver?.(); }
    };

    /** Wire overlaps for damage (player vs enemies & enemy bullets) */
    this.enablePlayerHitOverlap = () => {
      const overlapOpts = null;
      const ctx = this;

      // Adjust group names if yours differ:
      if (this.enemies) {
        this.physics.add.overlap(this.player, this.enemies, this.hitPlayer, overlapOpts, ctx);
      }
      if (this.enemyBullets) {
        this.physics.add.overlap(this.player, this.enemyBullets, this.hitPlayer, overlapOpts, ctx);
      }
    };

    // Call once to activate overlaps
    this.enablePlayerHitOverlap();

    // Animations
    this.anims.create({
      key: 'bullet-flight',
      frames: this.anims.generateFrameNumbers('bullet_anim', { start: 0, end: 7 }),
      frameRate: 12,
      repeat: -1
    });

    // Collisions
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.player, this.powerups, this.onCollectPower, null, this);
    this.physics.add.overlap(this.player, this.enemyBullets, this.onPlayerHit, null, this);

    // Cleanup on world bounds for both bullet types
    this.physics.world.on('worldbounds', (body) => {
      const go = body && body.gameObject;
      if (!go || !go.active) return;
      const key = go.texture ? go.texture.key : null;
      if (key === 'bullet_anim' || key === 'enemyBullet'){
        this.recycleBullet(go);
      }
    });

    // Spawners
    this.enemyTimer = this.time.addEvent({ delay: 1200, loop: true, callback: this.spawnEnemy, callbackScope: this });
    this.powerTimer = this.time.addEvent({ delay: 15000, loop: true, callback: self => this.spawnPower(), callbackScope: this });

    // HUD
    this.score = 0;
    this.lives = 3;
    this.scoreText = this.add.text(16, 16, 'Score: 0', { fontSize:'24px', color:'#e6ecff' }).setScrollFactor(0);
    this.livesText = this.add.text(16, 46, 'Lives: 3', { fontSize:'18px', color:'#b9c3e6' }).setScrollFactor(0);
    this.droneText = this.add.text(16, 70, 'Drones: 0/4', { fontSize:'16px', color:'#9ad1ff' }).setScrollFactor(0);

    // Game Over
    this.isGameOver = false;
    this.goText = this.add.text(width/2, height/2, 'GAME OVER\\nPress R to Restart', { fontSize:'42px', color:'#e6ecff', align:'center' }).setOrigin(0.5).setScrollFactor(0);
    this.goText.setVisible(false);
    this.input.keyboard.on('keydown-R', ()=>{ if (this.isGameOver) this.scene.restart(); });

    // Firing
    this.fireRate = 120;
    this.shootHeld = false;
    this.shootTimer = null;
    this.input.keyboard.on('keydown-SPACE', ()=>{
      if (this.shootHeld) return;
      this.shootHeld = true;
      this.fire();
      this.shootTimer = this.time.addEvent({ delay: this.fireRate, loop: true, callback: this.fire, callbackScope: this });
    });
    this.input.keyboard.on('keyup-SPACE', ()=>{
      this.shootHeld = false;
      if (this.shootTimer){ this.shootTimer.remove(); this.shootTimer = null; }
    });

    // Drones
    this.drones = [];
    this.DRONE_CAP = 4;
    this.powerTimer.paused = (this.drones.length >= this.DRONE_CAP);
  }

  spawnEnemy(){
    if (this.isGameOver) return;
    const { width } = this.scale;
    const x = Phaser.Math.Between(40, width-40);

    // Weighted type choice
    const r = Math.random();
    let key = 'enemyA', hp = 1, type = 'A';
    if (r < 0.5){ key = 'enemyA'; hp = 1; type = 'A'; }
    else if (r < 0.8){ key = 'enemyB'; hp = 1; type = 'B'; }
    else { key = 'enemyC'; hp = 5; type = 'C'; }

    const enemy = this.enemies.get(x, -30, key);
    if (!enemy) return;

    // Ensure correct texture & reset pooled state
    enemy.setTexture(key);
    enemy.clearTint();
    if (enemy.fireEvent){ enemy.fireEvent.remove(); enemy.fireEvent = null; }

    enemy.enableBody(true, x, -30, true, true);
    const vy = (type === 'C') ? Phaser.Math.Between(90, 150) : Phaser.Math.Between(120, 200);
    enemy.setVelocityY(vy);

    enemy.setData('sinA', Phaser.Math.FloatBetween(0, Math.PI*2));
    enemy.setData('sinAmp', Phaser.Math.Between(12, 36));
    enemy.setData('sinFreq', Phaser.Math.FloatBetween(0.002, 0.005));
    enemy.body.setAllowGravity(false);
    enemy.setImmovable(true);
    if (type === 'C'){ enemy.body.setCircle(22, 0, 0); } else { enemy.body.setCircle(18, 2, 2); }

    enemy.setData('type', type);
    enemy.setData('hp', hp);

    // Clear any leftover HP bars/data from recycled enemies
    const oldBg = enemy.getData('hpBarBg'); const oldFg = enemy.getData('hpBarFg');
    if (oldBg) oldBg.destroy();
    if (oldFg) oldFg.destroy();
    enemy.setData('hpBarBg', null);
    enemy.setData('hpBarFg', null);
    enemy.setData('hpMax', null);

    // HP bar for heavy
    if (type === 'C'){
      const maxHp = hp;
      const barBg = this.add.rectangle(enemy.x, enemy.y - 32, 28, 4, 0x000000, 0.5).setDepth(5);
      const barFg = this.add.rectangle(enemy.x, enemy.y - 32, 28, 4, 0x66a3ff, 1).setDepth(6);
      barFg.setOrigin(0, 0.5);
      barBg.setOrigin(0.5, 0.5);
      enemy.setData('hpMax', maxHp);
      enemy.setData('hpBarBg', barBg);
      enemy.setData('hpBarFg', barFg);
      barFg.x = enemy.x - 14;
    }

    const baseDelay = Math.max(this.fireRate * 2, 1000);
    if (type === 'A' || type === 'C'){
      enemy.fireEvent = this.time.addEvent({
        delay: baseDelay,
        loop: true,
        callback: () => { if (enemy.active) this.fireEnemyBullet(enemy); }
      });
    } else if (type === 'B'){
      enemy.fireEvent = this.time.addEvent({
        delay: Math.max(baseDelay, 1000),
        loop: true,
        callback: () => { if (enemy.active) this.fireEnemyAimedBullet(enemy); }
      });
    }
  }

  spawnPower(){
    if (this.isGameOver) return;
    if (this.drones.length >= this.DRONE_CAP){ this.powerTimer.paused = true; return; }
    const { width } = this.scale;
    const x = Phaser.Math.Between(40, width-40);
    const p = this.powerups.get(x, -20, 'power');
    if (!p) return;
    p.enableBody(true, x, -20, true, true);
    p.setVelocityY(140);
    p.body.setAllowGravity(false);
  }

  onCollectPower(player, power){
    power.disableBody(true, true);
    if (this.drones.length >= this.DRONE_CAP) return;
    this.addDrone();
    if (this.drones.length >= this.DRONE_CAP){ this.powerTimer.paused = true; }
  }

  addDrone(){
    const i = this.drones.length;
    const sprite = this.physics.add.image(this.player.x + ((i%2===0)? -50: 50), this.player.y - 60 - Math.floor(i/2)*30, 'drone');
    sprite.setScale(0.8).setAngle(-90).setDepth(1).setAlpha(0.95);
    sprite.body.setAllowGravity(false);
    const offsetX = ((i%2===0)? -50: 50);
    const offsetY = -60 - Math.floor(i/2)*30;
    const drone = { sprite, offsetX, offsetY };
    this.drones.push(drone);
    this.droneText.setText(`Drones: ${this.drones.length}/${this.DRONE_CAP}`);
    this.tweens.add({ targets: sprite, alpha: { from: 0.2, to: 0.95 }, duration: 200 });
  }

  fireEnemyBullet(enemy){
    const b = this.enemyBullets.get(enemy.x, enemy.y + 18, 'enemyBullet');
    if (!b) return;
    b.enableBody(true, enemy.x, enemy.y + 18, true, true);
    b.body.setAllowGravity(false);
    b.setVelocity(0, 260);
    b.setAngle(90);
    b.setCollideWorldBounds(true);
    b.body.onWorldBounds = true;
    b.setScale(1.6);
    b.setTint(0xff4444);
    b.setBlendMode(Phaser.BlendModes.ADD);
    b.setData('despawnAt', this.time.now + 4000);
    // Red trail (3.60 way)
    const emitter = this.add.particles(0, 0, 'spark', {
      speed: 0,
      lifespan: 220,
      alpha: { start: 0.7, end: 0 },
      scale: { start: 1.0, end: 0.1 },
      quantity: 1,
      frequency: 30,
      tint: 0xff4444,
      blendMode: 'ADD'
    });
    emitter.startFollow(b);
    b.setData('emitter', emitter);
  }

  fireEnemyAimedBullet(enemy){
    const b = this.enemyBullets.get(enemy.x, enemy.y + 18, 'enemyBullet');
    if (!b) return;
    b.enableBody(true, enemy.x, enemy.y + 18, true, true);
    b.body.setAllowGravity(false);
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const speed = 240;
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    b.setAngle(Phaser.Math.RadToDeg(angle));
    b.setCollideWorldBounds(true);
    b.body.onWorldBounds = true;
    b.setScale(1.6);
    b.setTint(0xff4444);
    b.setBlendMode(Phaser.BlendModes.ADD);
    b.setData('despawnAt', this.time.now + 4000);
    const emitter = this.add.particles(0, 0, 'spark', {
      speed: 0,
      lifespan: 220,
      alpha: { start: 0.7, end: 0 },
      scale: { start: 1, end: 0.1 },
      quantity: 1,
      frequency: 30,
      tint: 0xff4444,
      blendMode: 'ADD'
    });
    emitter.startFollow(b);
    b.setData('emitter', emitter);
  }

  onBulletHitEnemy(bullet, enemy){
    this.recycleBullet(bullet);
    let hp = enemy.getData('hp') || 1;
    hp -= 1;
    enemy.setData('hp', hp);

    if (hp <= 0){
      if (enemy.fireEvent){ enemy.fireEvent.remove(); enemy.fireEvent = null; }
      const bg = enemy.getData('hpBarBg'); const fg = enemy.getData('hpBarFg');
      if (bg) bg.destroy(); if (fg) fg.destroy();
      enemy.setData('hpBarBg', null); enemy.setData('hpBarFg', null);
      enemy.disableBody(true, true);
      const type = enemy.getData('type') || 'A';
      this.addScore(type === 'C' ? 300 : 100);
    } else {
      // flash + update HP bar if present
      enemy.setTint(0xffeeee);
      this.time.delayedCall(80, ()=> enemy.clearTint());
      const bg = enemy.getData('hpBarBg'); const fg = enemy.getData('hpBarFg');
      const hpMax = enemy.getData('hpMax') || 1;
      if (fg && bg){
        const ratio = Phaser.Math.Clamp(hp / hpMax, 0, 1);
        fg.width = 28 * ratio;
      }
    }
  }

  onPlayerHit(player, enemyOrBullet){
    if (this.isGameOver) return;
    this.lives -= 1; this.livesText.setText('Lives: ' + this.lives);
    // Lose all drones on ANY life loss
    this.loseAllDrones();
    if (enemyOrBullet.texture && enemyOrBullet.texture.key === 'enemyBullet'){
      this.recycleBullet(enemyOrBullet);
    } else {
      if (enemyOrBullet.fireEvent){ enemyOrBullet.fireEvent.remove(); enemyOrBullet.fireEvent = null; }
      // destroy hp bar if present
      const bg = enemyOrBullet.getData ? enemyOrBullet.getData('hpBarBg') : null;
      const fg = enemyOrBullet.getData ? enemyOrBullet.getData('hpBarFg') : null;
      if (bg) bg.destroy(); if (fg) fg.destroy();
      enemyOrBullet.disableBody(true, true);
    }
    this.tweens.add({ targets: this.player, alpha: 0.3, yoyo: true, repeat: 6, duration: 80, onComplete: ()=> this.player.setAlpha(1) });
    if (this.lives <= 0){ this.gameOver(); }
  }

  addScore(v){ this.score += v; this.scoreText.setText('Score: ' + this.score); }

  fire(){
    if (this.isGameOver) return;
    this.spawnBullet(this.player.x, this.player.y - 28, -720, 0x66ccff);
    for (const d of this.drones){
      this.spawnBullet(d.sprite.x, d.sprite.y - 18, -700, 0x66ccff);
    }
  }

  spawnBullet(x, y, vy, tint){
    const b = this.bullets.get();
    if (!b) return;
    b.setTexture('bullet_anim');
    b.enableBody(true, x, y, true, true);
    if (b.body && b.body.reset){ b.body.reset(x, y); }
    b.body.setAllowGravity(false);
    b.setDrag(0).setDamping(false).setVelocity(0,0);
    b.setVelocityY(vy);
    b.setAngle(0);
    b.setCollideWorldBounds(true);
    b.body.onWorldBounds = true;
    b.body.setSize(8, 16, true);
    b.setBlendMode(Phaser.BlendModes.ADD);
    b.setData('despawnAt', this.time.now + 2200);
    b.anims.play('bullet-flight', true);
    b.anims.timeScale = 1.0;
    // Blue trail (3.60 way)
    const pEmit = this.add.particles(0, 0, 'spark', {
      speed: 0,
      lifespan: 220,
      alpha: { start: 0.6, end: 0 },
      scale: { start: 0.45, end: 0.1 },
      quantity: 1,
      frequency: 28,
      tint: tint || 0x66ccff,
      blendMode: 'ADD'
    });
    pEmit.startFollow(b);
    b.setData('emitter', pEmit);
  }

  recycleBullet(go){
    try {
      const em = go.getData ? go.getData('emitter') : null;
      if (em){ em.stop(); em.destroy(); go.setData('emitter', null); }
    } catch(e){}
    if (go.disableBody){
      go.disableBody(true, true);
    } else {
      go.setActive(false).setVisible(false);
    }
  }

  // Lose all drones helper
  loseAllDrones(){
    if (this.drones && this.drones.length){
      for (const d of this.drones){ if (d && d.sprite){ d.sprite.destroy(); } }
      this.drones.length = 0;
      if (this.droneText) this.droneText.setText('Drones: 0/4');
    }
    if (this.powerTimer) this.powerTimer.paused = false;
  }

  update(time, delta){
    const { width, height } = this.scale;
    if (this.isGameOver) return;
    

    // Background scroll
    this.bg1.tilePositionY -= this.scrollSpeed * 0.6;
    this.bg2.tilePositionY -= this.scrollSpeed * 1.2;
    this.bg3.tilePositionY -= this.scrollSpeed * 2.0;

    // Movement
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const speed = 360;
    this.player.setVelocity(0,0);
    
    //Subtle inertia
{
  const speed = 360;
  let vx = 0, vy = 0;

  if (this.cursors?.left?.isDown || this.keys?.A?.isDown)  vx -= speed;
  if (this.cursors?.right?.isDown || this.keys?.D?.isDown) vx += speed;
  if (this.cursors?.up?.isDown || this.keys?.W?.isDown)    vy -= speed;
  if (this.cursors?.down?.isDown || this.keys?.S?.isDown)  vy += speed;

  if (this.player?.body) {
    this.player.body.velocity.x = Phaser.Math.Linear(this.player.body.velocity.x, vx, 0.60);
    this.player.body.velocity.y = Phaser.Math.Linear(this.player.body.velocity.y, vy, 0.60);
  }
}


    // Drones follow offsets
    for (const d of this.drones){
      const tx = this.player.x + d.offsetX;
      const ty = this.player.y + d.offsetY;
      d.sprite.x = Phaser.Math.Linear(d.sprite.x, tx, 0.22);
      d.sprite.y = Phaser.Math.Linear(d.sprite.y, ty, 0.22);
    }

    // HP bar follow
    this.enemies.children.iterate(e => {
      if (!e || !e.active) return;
      const bg = e.getData('hpBarBg');
      const fg = e.getData('hpBarFg');
      if (bg && fg){
        bg.x = e.x; bg.y = e.y - 32;
        fg.x = e.x - 14; fg.y = e.y - 32;
      }
    });

    // Cleanup player bullets
    this.bullets.children.iterate(b => {
      if (!b || !b.active) return;
      const vy = b.body ? b.body.velocity.y : 0;
      if (b.y < -40 || b.y > height + 40 || (b.getData('despawnAt') && time > b.getData('despawnAt')) || Math.abs(vy) < 40){
        this.recycleBullet(b);
      }
    });

    // Cleanup enemy bullets
    this.enemyBullets.children.iterate(b => {
      if (!b || !b.active) return;
      if (b.y > height + 40 || (b.getData('despawnAt') && time > b.getData('despawnAt'))){
        this.recycleBullet(b);
      }
    });

    // Enemy wobble + cull
    this.enemies.children.iterate(e => {
      if (!e || !e.active) return;
      const a = e.getData('sinA') + e.getData('sinFreq') * delta;
      e.setData('sinA', a);
      e.x += Math.sin(a) * e.getData('sinAmp') * 0.1;
      if (e.y > height + 40){
        if (e.fireEvent){ e.fireEvent.remove(); e.fireEvent = null; }
        const bg = e.getData('hpBarBg'); const fg = e.getData('hpBarFg');
        if (bg) bg.destroy(); if (fg) fg.destroy();
        e.setData('hpBarBg', null); e.setData('hpBarFg', null);
        e.disableBody(true, true);
      }
    });

    // Power-ups cull
    this.powerups.children.iterate(p => {
      if (!p || !p.active) return;
      if (p.y > height + 40) p.disableBody(true, true);
    });
  
   // ====== Player bounds clamp (place at END of update()) ======
{
  const cam = this.cameras.main;
  const margin = 16;
  if (this.player) {
    this.player.x = Phaser.Math.Clamp(
      this.player.x,
      cam.worldView.x + margin,
      cam.worldView.x + cam.width - margin
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y,
      cam.worldView.y + margin,
      cam.worldView.y + cam.height - margin
    );
  }}
  }
  

  gameOver(){
    // Also nuke bars for any remaining enemies
    this.enemies.children.iterate(e => {
      if (!e) return;
      const bg = e.getData && e.getData('hpBarBg'); const fg = e.getData && e.getData('hpBarFg');
      if (bg) bg.destroy(); if (fg) fg.destroy();
      e.setData && e.setData('hpBarBg', null); e.setData && e.setData('hpBarFg', null);
    });
    this.isGameOver = true;
    this.physics.world.pause();
    this.goText.setVisible(true);
  }
  
}