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