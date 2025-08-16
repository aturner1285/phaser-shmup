// boot.js — Phaser 3.60
// Simple boot / preload scene to ensure assets are loaded before ShmupScene runs

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Load all required art here
    this.load.image('player', 'assets/player.png');
    this.load.image('bullet', 'assets/bullet.png');
    this.load.image('enemyA', 'assets/enemyA.png');
    this.load.image('enemyB', 'assets/enemyB.png');
    this.load.image('enemyC', 'assets/enemyC.png');
    this.load.image('power',  'assets/power.png');
    this.load.image('stars0', 'assets/stars0.png');
    this.load.image('stars1', 'assets/stars1.png');
    this.load.image('stars2', 'assets/stars2.png');
    this.load.atlas('spark', 'assets/spark.png', 'assets/spark.json');

    // optional: loading text
    const { width, height } = this.scale;
    this.add.text(width/2, height/2, 'Loading...', {
      fontFamily: 'monospace', fontSize: '16px', color: '#fff'
    }).setOrigin(0.5);
  }

  create() {
    this.scene.start('ShmupScene');
  }
}

// Export for module loaders or attach to window
if (typeof module !== 'undefined') {
  module.exports = { BootScene };
} else {
  window.BootScene = BootScene;
}
