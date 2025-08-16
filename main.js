const config = {
  type: Phaser.AUTO,
  width: 540,
  height: 960,
  backgroundColor: '#060912',
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scene: [ShmupScene],
};
new Phaser.Game(config);
