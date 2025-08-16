// boot.js — Phaser 3.60
// A tiny BootScene that (1) tries to load your assets and (2) autogenerates
// clean placeholders if files are missing, then starts ShmupScene.

/* global Phaser */

class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    // If you have real assets, put them in ./assets and these will load.
    this.load.setPath('assets');
    this.load.image('player', 'player.png');
    this.load.image('bullet', 'bullet.png');
    this.load.image('enemyA', 'enemyA.png');
    this.load.image('enemyB', 'enemyB.png');
    this.load.image('enemyC', 'enemyC.png');
    this.load.image('power',  'power.png');
    this.load.image('stars0', 'stars0.png');
    this.load.image('stars1', 'stars1.png');
    this.load.image('stars2', 'stars2.png');
    // Particles: our shmup uses a single-key texture named 'spark'. An image is fine.
    this.load.image('spark',  'spark.png');
  }

  create() {
    // Ensure required textures exist; if any failed to load, make nice placeholders.
    const need = ['player','bullet','enemyA','enemyB','enemyC','power','stars0','stars1','stars2','spark'];
    for (const key of need) {
      if (!this.textures.exists(key)) this._makePlaceholder(key);
    }

    // Done => start the real game scene
    this.scene.start('ShmupScene');
  }

  _makePlaceholder(key) {
    // Utility to create simple but readable dev art
    const g = this.add.graphics();

    const makeRect = (w,h, color, stroke=0x000000) => {
      g.clear();
      g.fillStyle(color, 1);
      g.fillRect(0,0,w,h);
      g.lineStyle(2, stroke, 1);
      g.strokeRect(0,0,w,h);
      this.textures.remove(key);
      g.generateTexture(key, w, h);
    };

    const makeCircle = (r, color) => {
      g.clear();
      g.fillStyle(color, 1);
      g.fillCircle(r, r, r);
      this.textures.remove(key);
      g.generateTexture(key, r*2, r*2);
    };

    const makeStars = (tile=256, density=140) => {
      g.clear();
      g.fillStyle(0x000015, 1);
      g.fillRect(0,0,tile,tile);
      for (let i=0;i<density;i++) {
        const x = Math.random()*tile;
        const y = Math.random()*tile;
        const a = 0.6 + Math.random()*0.4;
        const c = 0xffffff;
        g.fillStyle(c, a);
        g.fillRect(x, y, 1, 1);
      }
      this.textures.remove(key);
      g.generateTexture(key, tile, tile);
    };

    switch (key) {
      case 'player': makeRect(22, 18, 0x66ccff); break;
      case 'bullet': makeRect(4, 8, 0x66ccff); break;
      case 'enemyA': makeRect(20, 16, 0xff4444); break;
      case 'enemyB': makeRect(20, 16, 0x44ff66); break;
      case 'enemyC': makeRect(34, 22, 0x3399ff); break;
      case 'power':  makeCircle(8, 0xffe066); break;
      case 'spark':  makeCircle(3, 0xffffff); break;
      case 'stars0': makeStars(256, 80); break;
      case 'stars1': makeStars(256, 120); break;
      case 'stars2': makeStars(256, 160); break;
      default: makeRect(16, 16, 0xff00ff);
    }

    g.destroy();
  }
}

// --- Game config / entry point ---
// Include this script after phaser.js and your shmup.js in index.html, or bundle via your build.
// Example index.html order:
// <script src="phaser.min.js"></script>
// <script src="boot.js"></script>
// <script src="shmup.js"></script>
// <script>new Phaser.Game(gameConfig);</script>

const gameConfig = {
  type: Phaser.AUTO,
  width: 480,
  height: 720,
  backgroundColor: '#000000',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [BootScene, ShmupScene]
};

// Only create once
if (!window.__shmupGame__) {
  window.__shmupGame__ = new Phaser.Game(gameConfig);
}

// Export for modules if needed
if (typeof module !== 'undefined') {
  module.exports = { BootScene, gameConfig };
} else {
  window.BootScene = BootScene;
  window.gameConfig = gameConfig;
}
