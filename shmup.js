// === Shmup Dev — Condensed Baseline ===
// Keeps core features; code slimmed with minor comments for structure.
// Hotkeys: 1/2/3 diff, SPACE hold to fire, R restart. Per-sprite scaling; no camera zoom.

// --- SPRITE PACK (unchanged sizes & anim ranges from your latest baseline) ---
const SPRITE_PACK = {
  ship:  { sheet:'ship.png', frameWidth:16, frameHeight:16, default:'ship-idle',
          anims:{
            'ship-left': { frames:[0], frameRate:0, repeat:-1 },
            'ship-idle': { frames:[1], frameRate:0, repeat:-1 },
            'ship-right':{ frames:[2], frameRate:0, repeat:-1 }
          }
        },
  drone: { sheet:'drone.png', frameWidth:16, frameHeight:16, default:'drone-idle',
          anims:{
            'drone-left': { frames:[0], frameRate:0, repeat:-1 },
            'drone-idle': { frames:[1], frameRate:0, repeat:-1 },
            'drone-right':{ frames:[2], frameRate:0, repeat:-1 }
          }
        },
  power: { sheet:'power.png',frameWidth:16, frameHeight:16, default:'power-spin',  anims:{ 'power-spin':{start:0,end:2,frameRate:10,repeat:-1} } },

  enemyA:{ sheet:'enemyA.png',frameWidth:16, frameHeight:16, default:'enemyA-fly', anims:{ 'enemyA-fly':{start:0,end:3,frameRate:12,repeat:-1} } },
  enemyB:{ sheet:'enemyB.png',frameWidth:16, frameHeight:16, default:'enemyB-fly', anims:{ 'enemyB-fly':{start:0,end:3,frameRate:12,repeat:-1} } },
  enemyC:{ sheet:'enemyC.png',frameWidth:16, frameHeight:16, default:'enemyC-fly', anims:{ 'enemyC-fly':{start:0,end:3,frameRate:12,repeat:-1} } },
  boss:{ sheet:'bossA.png', frameWidth:96, frameHeight:48, default:'boss-fly', anims:{ 'boss-fly':{start:0,end:23,frameRate:10,repeat:-1} } },
  enemyBullet:{ sheet:'enemyBullet.png', frameWidth:16, frameHeight:16, default:'enemyBullet-spin', anims:{ 'enemyBullet-spin':{start:0,end:3,frameRate:20,repeat:-1} } } ,
  bullet_anim:{ sheet:'bullet_anim.png', frameWidth:16, frameHeight:16, default:'bullet-flight',     anims:{ 'bullet-flight':{start:0,end:0,frameRate:12,repeat:-1} } },
  explosion:{ sheet:'explosion.png', frameWidth:16, frameHeight:16, anims:{ 'explosion-twinkle':{start:0,end:4,frameRate:12,repeat:-1} } },

  star1:{ image:'star1.png' }, star2:{ image:'star2.png' }, star3:{ image:'star3.png' },
};

class ShmupScene extends Phaser.Scene {
  constructor(){ super('shmup'); }

  // ------------------------------- Preload ----------------------------------
  preload(){
    const base = 'assets/';
    for (const key in SPRITE_PACK){
      const c = SPRITE_PACK[key]; if (!c) continue;
      if (c.sheet) this.load.spritesheet(key, base+c.sheet, { frameWidth:c.frameWidth, frameHeight:c.frameHeight });
      else if (c.image) this.load.image(key, base+c.image);
    }
  }

  createAnims(){
    const gen = (k,d)=> d.frames ? d.frames.map(function(f){ return {key:k,frame:f}; }) : this.anims.generateFrameNumbers(k,{start:(d.start||0),end:((typeof d.end!=='undefined')?d.end:(d.start||0))});
    for (const k in SPRITE_PACK){
      const c=SPRITE_PACK[k]; if (!c||!c.anims) continue;
      for (const a in c.anims){ if (!this.anims.exists(a)){ const d=c.anims[a]; this.anims.create({ key:a, frames:gen(k,d), frameRate:(d.frameRate||12), repeat:(typeof d.repeat==='number'?d.repeat:0) }); } }
    }
  }

  play(sprite, list){ if (!sprite||!sprite.anims) return; for (var i=0;i<list.length;i++){ var k=list[i]; if (k && this.anims.exists(k)) { sprite.play(k,true); return; } } }

  scaleFor(key){ var S=this.SPRITE_SCALE; if (key==='boss') return S; if (key==='drone') return S*0.5; return S; }

  // ------------------------------- Create -----------------------------------
  create(){
    const W=this.scale.width, H=this.scale.height;
    this.SPRITE_SCALE = 3; // visual size control (no camera zoom)
    this.createAnims();

    // State
    this.isGameOver=false; this.hitCooldownMs=1200; this.nextHitAllowedAt=0;

    // Background
    this.bgs=[['star1',0.12],['star2',0.20],['star3',0.30]].map(c=>this.add.tileSprite(0,0,W,H,c[0]).setOrigin(0).setAlpha(c[1]).setScrollFactor(0));
    this.scrollSpeed=2.8;

    // HUD
    this.score=0; this.lives=3; this.drones=[]; this.DRONE_CAP=4;
    this.scoreText=this.add.text(16,16,'Score: 0',{fontSize:'24px',color:'#e6ecff'}).setScrollFactor(0).setDepth(2000);
    this.livesText=this.add.text(16,46,'',{fontSize:'18px',color:'#b9c3e6'}).setScrollFactor(0).setDepth(2000);
    this.droneText=this.add.text(16,70,'Drones: 0/4',{fontSize:'16px',color:'#9ad1ff'}).setScrollFactor(0).setDepth(2000);
    this.updateLivesText = ()=>{ this.livesText.setText('Lives: '+this.lives); }; this.updateLivesText();

    // Player
    this.player=this.physics.add.sprite(W/2,H-120,'ship').setCollideWorldBounds(true).setScale(this.SPRITE_SCALE);
    // 2x2 player core
    if(this.player.body&&this.player.body.setSize){this.player.body.setSize(2,2);var fw=this.player.width||16,fh=this.player.height||16;this.player.body.setOffset(Math.round(fw*0.5-1),Math.round(fh*0.5-1));}
    this.play(this.player,[SPRITE_PACK.ship&&SPRITE_PACK.ship.default,'ship-idle']); this.shipAnim='ship-idle';

    // Input
    this.cursors=this.input.keyboard.createCursorKeys(); this.keys=this.input.keyboard.addKeys('W,A,S,D,SPACE,R,ONE,TWO,THREE');

    // Groups
    this.bullets=this.physics.add.group({classType:Phaser.Physics.Arcade.Sprite,maxSize:360});
    this.enemies=this.physics.add.group({classType:Phaser.Physics.Arcade.Sprite,maxSize:220});
    this.powerups=this.physics.add.group({classType:Phaser.Physics.Arcade.Sprite,maxSize:8});
    this.enemyBullets=this.physics.add.group({classType:Phaser.Physics.Arcade.Sprite,maxSize:360});

    // VFX helpers
    const cam=this.cameras.main; this.damageVignette=this.add.rectangle(cam.worldView.x,cam.worldView.y,cam.width,cam.height,0x000000,0).setOrigin(0).setScrollFactor(0).setDepth(9999);
    this.applyShake=(d,i)=>{this.cameras.main.shake(d||150,i||0.008)}; this.flashVignette=()=>{this.damageVignette.setAlpha(0.25);this.tweens.add({targets:this.damageVignette,alpha:0,duration:250,ease:'Quad.Out'});}    

    // Fire controls
    this.baseFireRate=500; this.fireRate=this.baseFireRate; this.shootHeld=false; this.shootTimer=null;
    this.input.keyboard.on('keydown-SPACE',()=>{ if(this.shootHeld||this.isGameOver) return; this.shootHeld=true; this.fire(); this.shootTimer=this.time.addEvent({delay:this.fireRate,loop:true,callback:this.fire,callbackScope:this}); });
    this.input.keyboard.on('keyup-SPACE',()=>{ this.shootHeld=false; if(this.shootTimer){this.shootTimer.remove(); this.shootTimer=null;} });
    this.setFireRate=(ms)=>{ms=Math.max(60,Math.min(1000,Math.floor(ms)));this.fireRate=ms;if(this.shootHeld){if(this.shootTimer){this.shootTimer.remove();this.shootTimer=null;} this.shootTimer=this.time.addEvent({delay:this.fireRate,loop:true,callback:this.fire,callbackScope:this});}};
    this.modFireRate=(d)=>this.setFireRate((this.fireRate||this.baseFireRate||500)+d); this.resetFireRate=()=>this.setFireRate(this.baseFireRate||500);
    this.input.keyboard.on('keydown-R',()=>{ if(this.isGameOver) this.scene.restart(); });

    // Difficulty
    this.difficulty={ easy:{lives:5,iFrames:1500,enemySpawn:1900,clusterSpawn:9000,enemySpd:0.8,aimedSpd:0.75,bossHp:200,volley:[2000,2600],sweep:5200}, normal:{lives:3,iFrames:1200,enemySpawn:1500,clusterSpawn:7000,enemySpd:1.0,aimedSpd:1.0,bossHp:260,volley:[1600,2200],sweep:4200}, hard:{lives:2,iFrames:1000,enemySpawn:1200,clusterSpawn:5600,enemySpd:1.15,aimedSpd:1.2,bossHp:320,volley:[1300,1800],sweep:3600} };
    this.applyDifficulty=(name)=>{const p=this.difficulty[name]||this.difficulty.normal; this.diffName=name; if(this.lives<p.lives) this.lives=p.lives; this.updateLivesText(); this.hitCooldownMs=p.iFrames; this.enemyBulletSpeedMul=1.5; this.aimedBulletSpeedMul=p.aimedSpd; if(this.enemyTimer) this.enemyTimer.delay=p.enemySpawn; if(this.clusterTimer) this.clusterTimer.delay=p.clusterSpawn; this.bossDefaults={hp:p.bossHp, volleyMin:p.volley[0], volleyMax:p.volley[1], sweepDelay:p.sweep};};
    this.input.keyboard.on('keydown-ONE',()=>this.applyDifficulty('easy')); this.input.keyboard.on('keydown-TWO',()=>this.applyDifficulty('normal')); this.input.keyboard.on('keydown-THREE',()=>this.applyDifficulty('hard')); this.applyDifficulty('normal');

    // Overlaps
    const addOv=(a,b,fn)=>this.physics.add.overlap(a,b,fn,null,this);
    addOv(this.player,this.enemies,this.onPlayerHit); addOv(this.player,this.enemyBullets,this.onPlayerHit);
    addOv(this.bullets,this.enemies,this.onBulletHitEnemy); addOv(this.player,this.powerups,this.onCollectPower);

    // Spawners
    const p=this.difficulty[this.diffName];
    this.enemyTimer=this.time.addEvent({delay:p.enemySpawn,loop:true,callback:()=>this.spawnEnemy()});
    this.powerTimer=this.time.addEvent({delay:15000,loop:true,callback:()=>this.spawnPower()});
    this.setupClusters(); this.boss=null; this.bossHp=0; this.bossHpMax=0; this.bossPhase=0; this.bBossTrail=null; this.bossSweepActive=false; this.bossBarBg=this.bossBarFg=null; this.time.delayedCall(45000,()=>this.spawnBoss());
  }

  // Helpers & effects
  telegraph(x1,y1,x2,y2,d,c,w){var g=this.add.graphics().setDepth(12);g.lineStyle(w||2,(typeof c!=='undefined'?c:0xffee88),1).beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.strokePath();this.tweens.add({targets:g,alpha:{from:1,to:0},duration:(d||180),onComplete:()=>g.destroy()});return g;}
  flash(t,d,m){var L=Array.isArray(t)?t:[t],mul=(typeof m==='number'?m:1.06),dur=(d||160);for(var i=0;i<L.length;i++){var s=L[i];if(!s||!s.active)continue;var sx=(s.getData&&s.getData('baseSX'))||s.scaleX,sy=(s.getData&&s.getData('baseSY'))||s.scaleY;if(s.setData){s.setData('baseSX',sx);s.setData('baseSY',sy);} this.tweens.killTweensOf(s,['scaleX','scaleY']);s.setScale(sx,sy);s.setTint(0xffee88);this.tweens.add({targets:s,scaleX:sx*mul,scaleY:sy*mul,yoyo:true,duration:dur,ease:'Quad.Out',onComplete:()=>{if(s&&s.active){s.setScale(sx,sy);s.clearTint();}}});}}
  centerCircleBody(sp,ratio,biasY,biasX){if(!sp||!sp.body||!sp.body.setCircle)return;var fw=sp.width||16,fh=sp.height||16,r=Math.max(3,Math.floor(Math.min(fw,fh)*(typeof ratio==='number'?ratio:0.30))),bx=(typeof biasX==='number'?biasX:0),by=(typeof biasY==='number'?biasY:0),ox=Math.round(fw*0.5-r+bx),oy=Math.round(fh*0.5-r+by);sp.body.setCircle(r,ox,oy);}  
  spawnHitSpark(x,y){var s=this.add.sprite(x,y,'explosion').setDepth(50).setScale(this.SPRITE_SCALE*0.9);if(this.anims.exists('explosion-twinkle'))s.play('explosion-twinkle');this.tweens.add({targets:s,alpha:{from:1,to:0},duration:120,onComplete:()=>s.destroy()});this.time.delayedCall(240,()=>{if(s&&s.active)s.destroy();});}
  aimedAngle(a,b){return (!a||!b)?-Math.PI/2:Math.atan2((b.y-a.y),(b.x-a.x));}

  // Spawners
  spawnPlayerBullet(x,y,vy){var b=this.bullets.get();if(!b)return null;b.setTexture('bullet_anim');b.enableBody(true,x,y,true,true);b.body.setAllowGravity(false);if(b.body&&b.body.setSize)b.body.setSize(Math.max(4,Math.floor(4.5*this.SPRITE_SCALE)),Math.max(6,Math.floor(10*this.SPRITE_SCALE)),true);b.setVelocity(0,vy);b.setScale(this.SPRITE_SCALE).setBlendMode(Phaser.BlendModes.ADD);b.setData('despawnAt',this.time.now+2200);if(b.anims&&this.anims.exists('bullet-flight'))b.anims.play('bullet-flight');return b;}
  spawnEnemyBullet(o){o=o||{};var x=o.x||0,y=o.y||0,a=(typeof o.angle==='number'?o.angle:Math.PI/2),sp=(typeof o.speed==='number'?o.speed:260)*(this.enemyBulletSpeedMul||1);var b=this.enemyBullets.get(x,y,'enemyBullet');if(!b)return null;b.setTexture('enemyBullet');b.enableBody(true,x,y,true,true);b.body.setAllowGravity(false);if(b.body&&b.body.setSize)b.body.setSize(6,6,true);b.setVelocity(Math.cos(a)*sp,Math.sin(a)*sp);b.setAngle(Phaser.Math.RadToDeg(a));b.setScale(this.SPRITE_SCALE).setDepth(5);b.setData('despawnAt',this.time.now+5000);if(b.anims&&this.anims.exists('enemyBullet-spin'))b.anims.play('enemyBullet-spin');return b;}
  spawnEnemy(){if(this.isGameOver)return;var W=this.scale.width,x=Phaser.Math.Between(32,W-32),y=-28,r=Math.random(),key=(r<0.45?'enemyA':(r<0.9?'enemyB':'enemyC'));var e=this.enemies.get(x,y,key);if(!e)return null;e.setTexture(key).clearTint().setScale(this.SPRITE_SCALE).setDepth(1).setAlpha(1).setAngle(0);e.enableBody(true,x,y,true,true);e.body.setAllowGravity(false);e.setVelocity(0,Phaser.Math.Between(90,140));e.setData('sinA',Math.random()*Math.PI*2).setData('sinAmp',Phaser.Math.Between(8,18)).setData('sinFreq',0.003+Math.random()*0.003);e.setData('type',key==='enemyC'?'C':(key==='enemyB'?'B':'A')).setData('hp',1).setData('clusterId',null).setData('isBoss',false);this.centerCircleBody(e,0.34,-10,0);this.play(e,[SPRITE_PACK[key]&&SPRITE_PACK[key].default,key+'-fly',key+'-idle']);e.fireEvent=this.time.addEvent({delay:Phaser.Math.Between(1400,2200),loop:true,callback:()=>{if(!e||!e.active||this.isGameOver)return;var ang=this.aimedAngle(e,this.player||{x:e.x,y:e.y+100});this.spawnEnemyBullet({x:e.x,y:e.y+6,angle:ang,speed:220*(this.aimedBulletSpeedMul||1)});}});return e;}
  spawnPower(){var W=this.scale.width,x=Phaser.Math.Between(24,W-24),p=this.powerups.get(x,-24,'power');if(!p)return null;p.setTexture('power').setScale(this.SPRITE_SCALE).setDepth(1).setAlpha(1);p.enableBody(true,x,-24,true,true);p.body.setAllowGravity(false);p.setVelocity(0,120);if(p.anims&&this.anims.exists('power-spin'))p.anims.play('power-spin');return p;}
  onCollectPower(pl,p){if(p&&p.disableBody)p.disableBody(true,true);this.addScore(50);if(this.drones.length<this.DRONE_CAP)this.addDrone();}
  addDrone(){var i=this.drones.length,sp=24,pair=Math.floor(i/2)+1,side=(i%2===0?-1:1),ox=side*sp*pair,oy=-30,s=this.physics.add.sprite(this.player.x,this.player.y,'drone').setScale(this.scaleFor('drone')).setDepth(2);s.body.setAllowGravity(false);this.play(s,['drone-idle']);this.drones.push({sprite:s,offsetX:ox,offsetY:oy,anim:'drone-idle'});this.droneText.setText('Drones: '+this.drones.length+'/'+this.DRONE_CAP);}  
  loseAllDrones(){for(var i=0;i<this.drones.length;i++){var d=this.drones[i];if(d&&d.sprite&&d.sprite.destroy)d.sprite.destroy();}this.drones.length=0;this.droneText.setText('Drones: 0/'+this.DRONE_CAP);}  

  // Clusters
  setupClusters(){this.clusters=new Map();this.clusterSeq=1;this.pickPattern=()=>{var bag=[['swirl',3],['v',2],['snake',2],['burst',1],['columns',2]],t=0;for(var i=0;i<bag.length;i++)t+=bag[i][1];var r=Math.random()*t;for(var j=0;j<bag.length;j++){var n=bag[j][0],w=bag[j][1];r-=w;if(r<=0)return n;}return 'swirl';}; var self=this; this.spawnCluster=function(o){o=o||{};if(self.isGameOver)return;var pat=(typeof o.pattern!=='undefined'?o.pattern:self.pickPattern()),typ=(typeof o.type!=='undefined'?o.type:(Math.random()<0.4?'B':'A')),sz=(typeof o.size!=='undefined'?o.size:({swirl:Phaser.Math.Between(6,10),v:Phaser.Math.Between(5,9),snake:Phaser.Math.Between(6,10),burst:Phaser.Math.Between(7,11),columns:Phaser.Math.Between(6,10)}[pat])),W=self.scale.width,anch={id:self.clusterSeq++,x:Phaser.Math.Between(80,W-80),y:-80,t:0,vy:Phaser.Math.Between(100,150),pattern:pat,radius:Phaser.Math.Between(46,74),members:[],fireEvent:null}; for(var i=0;i<sz;i++){var k=(typ==='B'?'enemyB':'enemyA'),e=self.enemies.get(anch.x,anch.y,k);if(!e)continue;e.setTexture(k).clearTint().setScale(self.scaleFor(k)).setAlpha(1).setAngle(0).setDepth(1);e.enableBody(true,anch.x,anch.y,true,true);e.body.setAllowGravity(false);e.setVelocity(0,anch.vy);e.setData('type',typ).setData('hp',1).setData('clusterId',anch.id).setData('isBoss',false).setData('idx',i).setData('angle0',(i/sz)*Math.PI*2).setData('row',Math.floor(i/2)).setData('side',i%2?1:-1);self.centerCircleBody(e,0.34,-10,0);self.play(e,[SPRITE_PACK[k]&&SPRITE_PACK[k].default,k+'-fly',k+'-idle']);anch.members.push(e);} var base=Phaser.Math.Between(1800,2600);anch.fireEvent=self.time.addEvent({delay:base,loop:true,callback:function(){self.fireClusterVolley(anch);}});self.clusters.set(anch.id,anch);}; this.fireClusterVolley=function(cl){if(!cl||self.isGameOver)return;cl.members=cl.members.filter(m=>m&&m.active);if(!cl.members.length)return;var P=self.player; var swirl=()=>{self.flash(cl.members,200);self.time.delayedCall(200,()=>{for(var i=0;i<cl.members.length;i++){var e=cl.members[i],a=Math.atan2(e.y-cl.y,e.x-cl.x);self.spawnEnemyBullet({x:e.x,y:e.y,angle:a,speed:280});}});}; var vshape=()=>{var L=cl.members.filter(e=>(e.getData('side')||-1)<0&&e.active),R=cl.members.filter(e=>(e.getData('side')||1)>0&&e.active),vol=(arr)=>{for(var i=0;i<arr.length;i++)self.telegraph(arr[i].x,arr[i].y,P.x,P.y,180);self.flash(arr,180);self.time.delayedCall(180,()=>{for(var i=0;i<arr.length;i++){var e=arr[i];if(e.active){var ang=self.aimedAngle(e,P);self.spawnEnemyBullet({x:e.x,y:e.y,angle:ang,speed:220*(self.aimedBulletSpeedMul||1)});}}});}; vol(L);self.time.delayedCall(220,()=>vol(R));}; var snake=()=>{var seq=cl.members.filter(e=>e.active).sort((a,b)=>(a.getData('idx')||0)-(b.getData('idx')||0));seq.forEach((e,i)=>{var d=i*100;self.time.delayedCall(d,()=>{if(!e.active)return;self.telegraph(e.x,e.y,P.x,P.y,120);self.flash(e,120);self.time.delayedCall(120,()=>{if(e.active){var ang=self.aimedAngle(e,P);self.spawnEnemyBullet({x:e.x,y:e.y,angle:ang,speed:220*(self.aimedBulletSpeedMul||1)});}});});});}; var burst=()=>{var g=self.add.graphics().setDepth(10);g.lineStyle(2,0xffee88,1).strokeCircle(cl.x,cl.y,Math.max(22,cl.radius*0.8));self.tweens.add({targets:g,alpha:{from:1,to:0},duration:220,onComplete:()=>g.destroy()});var seq=cl.members.filter(e=>e.active);self.flash(seq,200);self.time.delayedCall(200,()=>{for(var i=0;i<seq.length;i++){var e=seq[i],ang=(-Math.PI/2)-0.6+(i*(1.2/Math.max(1,seq.length-1)));self.spawnEnemyBullet({x:e.x,y:e.y+2,angle:ang,speed:280});}});}; var columns=()=>{var seq=cl.members.filter(e=>e.active);for(var i=0;i<seq.length;i++){var e=seq[i];self.telegraph(e.x,e.y,e.x,e.y+60,140);self.flash(e,140);self.time.delayedCall(140,((ex)=>()=>self.spawnEnemyBullet({x:ex.x,y:ex.y+10,angle:Math.PI/2,speed:280}))(e));}}; ({swirl, v:vshape, snake, burst, columns}[cl.pattern])();}; this.updateClusters=function(time,delta){if(!self.clusters.size)return;var H=self.scale.height,toDel=[];self.clusters.forEach(function(cl,id){cl.t+=delta;cl.y+=(cl.vy||120)*(delta/1000);var keep=[],N=cl.members.length;for(var i=0;i<N;i++){var e=cl.members[i];if(!e||!e.active)continue;var tx=cl.x,ty=cl.y,idx=e.getData('idx')||i;switch(cl.pattern){case 'v':{var row=Math.floor(idx/2),side=(idx%2)?1:-1,colX=18,rowSpace=18,sway=Math.sin((cl.t*0.004)+side*row*0.004+side*1.2)*8;tx+=side*colX+sway;ty+=row*rowSpace;break;}case 'columns':{var side2=(idx%2)?1:-1,colX2=40,row2=Math.floor(idx/2),rowSpace2=20,sway2=Math.sin((cl.t*0.004)+side2*row2*0.004+side2*1.2);tx+=side2*colX2+sway2;ty+=row2*rowSpace2;break;}case 'snake':{var side3=(idx%2)?1:-1,row3=Math.floor(idx/2),rowSpace3=14,colX3=42,sway3=Math.sin((cl.t*0.006)+row3*0.004+side3*1.2);tx+=side3*colX3+sway3;ty+=row3*rowSpace3;break;}default:{var a0=e.getData('angle0')||((i/N)*Math.PI*2),a=a0+cl.t*0.0012;tx+=Math.cos(a)*cl.radius;ty+=Math.sin(a)*cl.radius;}} e.x=Phaser.Math.Linear(e.x,tx,0.10); e.y=Phaser.Math.Linear(e.y,ty,0.10); if(e.y>H+50){if(e.fireEvent)e.fireEvent.remove();e.disableBody(true,true);}else keep.push(e);} cl.members=keep; if(cl.y>H+90||cl.members.length===0){if(cl.fireEvent)cl.fireEvent.remove();toDel.push(id);} }); for(var i=0;i<toDel.length;i++) self.clusters.delete(toDel[i]);}; var p2=this.difficulty[this.diffName]||this.difficulty.normal; if(this.clusterTimer) this.clusterTimer.remove(); this.clusterTimer=this.time.addEvent({delay:p2.clusterSpawn,loop:true,callback:()=>this.spawnCluster()}); }

  // Boss
  spawnBoss(){if(this.isGameOver||this.boss)return;this.enemyTimer.paused=true;this.clusterTimer.paused=true;var W=this.scale.width;var b=this.enemies.get(W/2,-120,'boss');if(!b)return;b.setTexture('boss');b.enableBody(true,W/2,96,true,true);b.setOrigin(0.5,0.5).setAngle(180);b.setScale(this.scaleFor('boss')).clearTint();b.setVelocity(0,0);b.body.setAllowGravity(false).setImmovable(true);this.centerCircleBody(b,0.40,-26,0);b.setData('isBoss',true).setData('clusterId',null);this.play(b,[SPRITE_PACK.boss&&SPRITE_PACK.boss.default,'boss-fly']);this.boss=b;this.bossHpMax=this.difficulty[this.diffName].bossHp;this.bossHp=this.bossHpMax;var w=Math.max(220,this.scale.width*0.6),h=10,x0=(this.scale.width-w)/2,y0=20;if(this.bossBarBg)this.bossBarBg.destroy();if(this.bossBarFg)this.bossBarFg.destroy();this.bossBarBg=this.add.rectangle(x0,y0,w,h,0x000000,0.6).setOrigin(0,0).setDepth(3000).setScrollFactor(0);this.bossBarFg=this.add.rectangle(x0,y0,w,h,0xff5e5e,1).setOrigin(0,0).setDepth(3001).setScrollFactor(0);this.bossPhase=0;this.bossEnterX=b.x;this.bossEnterT=0;var cfg=this.difficulty[this.diffName];this.bossFireEvent=this.time.addEvent({delay:Phaser.Math.Between(cfg.volley[0],cfg.volley[1]),startAt:Phaser.Math.Between(0,400),loop:true,callback:()=>this.fireBossVolley()});this.bossMoveEvent=this.time.addEvent({delay:cfg.sweep,loop:true,callback:()=>this.bossSwoop()});this.bossRoamEvent=this.time.addEvent({delay:2400,loop:true,callback:()=>this.bossRoam()});this.bossRoamTween=null;}
  fireBossVolley(){if(!this.boss||!this.boss.active||this.isGameOver)return;var P=this.player,B=this.boss,ph=this.bossPhase++%4;switch(ph){case 0:{var base=this.aimedAngle(B,P),sp=Phaser.Math.DegToRad(10),spds=[280,300,280],offs=[-sp,0,sp];this.telegraph(B.x,B.y,P.x,P.y,220,0xffee88,3);this.flash(B,220);this.time.delayedCall(220,()=>{if(!B.active)return;for(var i=0;i<offs.length;i++)this.spawnEnemyBullet({x:B.x,y:B.y,angle:base+offs[i],speed:spds[i]});});break;}case 1:{var c=12;for(var i=0;i<c;i++){var a=(i/c)*Math.PI*2;this.spawnEnemyBullet({x:B.x,y:B.y+6,angle:a,speed:260});}break;}case 2:{this.telegraph(B.x,B.y,P.x,P.y,180,0xffaa88,3);this.flash(B,180);for(var k=0;k<3;k++)this.time.delayedCall(k*80,()=>{var a2=this.aimedAngle(B,P);this.spawnEnemyBullet({x:B.x,y:B.y+8,angle:a2,speed:320});});break;}default:{this.bossSwoop();break;}}}
  bossSwoop(){if(!this.boss||!this.boss.active||this.bossSweepActive)return;this.bossSweepActive=true;var W=this.scale.width,H=this.scale.height,halfBW=((this.boss.displayWidth||(this.boss.width*(this.boss.scaleX||1)))*0.5),halfBH=((this.boss.displayHeight||(this.boss.height*(this.boss.scaleY||1)))*0.5),margin=Math.max(40,halfBW+16);var px=(this.player?this.player.x:W*0.5),aimX=Phaser.Math.Clamp(px+Phaser.Math.Between(-40,40),margin,W-margin),sx=this.boss.x,sy=this.boss.y,tx=aimX,ty=Phaser.Math.Clamp(Math.floor(H*0.7)+Phaser.Math.Between(-10,30),120+halfBH,H-110),lat=Phaser.Math.Between(70,120)*(Math.random()<0.5?-1:1),cx=Phaser.Math.Clamp((sx+tx)/2+lat,margin,W-margin),cy=sy+(ty-sy)*0.65;var Curve=Phaser.Curves.QuadraticBezier,V2=Phaser.Math.Vector2;var dive=new Curve(new V2(sx,sy),new V2(cx,cy),new V2(tx,ty));var g=this.add.graphics().setDepth(12);g.lineStyle(2,0xffaa66,1).beginPath();for(var i=0;i<=24;i++){var p=dive.getPoint(i/24);if(i===0)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);}g.strokePath();this.tweens.add({targets:g,alpha:{from:1,to:0},duration:300,onComplete:()=>g.destroy()});if(this.bossRoamTween){this.bossRoamTween.stop();this.bossRoamTween=null;}var diveDur=Phaser.Math.Between(950,1200);if(this.bBossTrail) this.bBossTrail.remove();this.bBossTrail=this.time.addEvent({delay:90,repeat:Math.floor(diveDur/90),callback:()=>{if(this.boss&&this.boss.active)this.spawnEnemyBullet({x:this.boss.x,y:this.boss.y+10,angle:Math.PI/2,speed:300});}});var t1={t:0};this.bossSweepTween=this.tweens.add({targets:t1,t:1,duration:diveDur,ease:'Sine.InOut',onUpdate:()=>{var p=dive.getPoint(t1.t);if(this.boss&&this.boss.active)this.boss.setPosition(p.x,p.y);},onComplete:()=>{if(this.bBossTrail){this.bBossTrail.remove();this.bBossTrail=null;}var rx=Phaser.Math.Between(margin,W-margin),minY=Math.max(90,90+halfBH),maxY=Math.min(H*0.4,H-140),ry=Phaser.Math.Between(minY,maxY),c2x=Phaser.Math.Clamp((tx+rx)/2+Phaser.Math.Between(-80,80),margin,W-margin),c2y=ty-Math.abs(ty-ry)*0.6,asc=new Curve(new V2(tx,ty),new V2(c2x,c2y),new V2(rx,ry)),t2={t:0};this.bossSweepTween=this.tweens.add({targets:t2,t:1,duration:Phaser.Math.Between(900,1200),ease:'Sine.InOut',onUpdate:()=>{var q=asc.getPoint(t2.t);if(this.boss&&this.boss.active)this.boss.setPosition(q.x,q.y);},onComplete:()=>{this.bossSweepTween=null;this.bossSweepActive=false;this.bossEnterX=this.boss.x;if(this.boss&&this.boss.active&&!this.isGameOver){var delay=Phaser.Math.Between(800,1500);this.time.delayedCall(delay,()=>{if(this.boss&&this.boss.active&&!this.isGameOver)this.bossSwoop();});}}});}});}
  bossRoam(){if(!this.boss||!this.boss.active||this.bossSweepActive)return;if(this.bossRoamTween&&this.bossRoamTween.isPlaying())return;var W=this.scale.width,H=this.scale.height,halfBW=((this.boss.displayWidth||(this.boss.width*(this.boss.scaleX||1)))*0.5),halfBH=((this.boss.displayHeight||(this.boss.height*(this.boss.scaleY||1)))*0.5),mx=Math.max(40,halfBW+16),minY=Math.max(80,80+halfBH),maxY=Math.min(H*0.45,H-120-halfBH),tx=Phaser.Math.Between(mx,W-mx),ty=Phaser.Math.Between(minY,maxY),dist=Phaser.Math.Distance.Between(this.boss.x,this.boss.y,tx,ty),dur=Phaser.Math.Clamp(dist*2.2,400,1200);this.bossRoamTween=this.tweens.add({targets:this.boss,x:tx,y:ty,duration:dur,ease:'Sine.InOut'});}  
  onBulletHitBoss(b,bo){var bx=b.x,by=b.y;this.recycleBullet(b);if(!bo||!bo.active||this.isBossDying)return;this.spawnHitSpark(bx,by);this.flash(bo,120,1.06);this.bossHp=Math.max(0,(this.bossHp||bo.getData('hp')||0)-1);if(this.bossBarFg&&this.bossBarBg&&this.bossHpMax>0){var w=this.bossBarBg.width;this.bossBarFg.width=Phaser.Math.Clamp((this.bossHp/this.bossHpMax)*w,0,w);}if(this.bossHp<=0)this.defeatBoss();}
  defeatBoss(){if(this.isBossDying)return;this.isBossDying=true;if(this.bossFireEvent)this.bossFireEvent.remove();if(this.bossMoveEvent)this.bossMoveEvent.remove();if(this.bossRoamEvent)this.bossRoamEvent.remove();if(this.bBossTrail)this.bBossTrail.remove();if(this.bossSweepTween)this.bossSweepTween.stop();if(this.bossRoamTween)this.bossRoamTween.stop();var b=this.boss;if(b&&b.active){this.applyShake(220,0.01);this.flash(b,220);}this.time.delayedCall(180,()=>{if(b&&b.setData)b.setData('isBoss',false);if(b&&b.active&&b.disableBody)b.disableBody(true,true);this.boss=null;if(this.bossBarBg)this.bossBarBg.destroy();if(this.bossBarFg)this.bossBarFg.destroy();this.bossBarBg=this.bossBarFg=null;this.addScore(1500);this.enemyTimer.paused=false;this.clusterTimer.paused=false;this.isBossDying=false;});}

  // Player fire
  fire(){if(this.isGameOver)return;this.spawnPlayerBullet(this.player.x,this.player.y-28,-720);for(var i=0;i<this.drones.length;i++){var d=this.drones[i];this.spawnPlayerBullet(d.sprite.x,d.sprite.y-18,-700);}}

  // Collisions
  onBulletHitEnemy(b,e){var bx=b.x,by=b.y;if(e===this.boss){this.onBulletHitBoss(b,e);return;}this.recycleBullet(b);this.spawnHitSpark(bx,by);var hp=(e.getData&&e.getData('hp'))||1;hp-=1;if(e.setData)e.setData('hp',hp);if(hp<=0){if(e.fireEvent)e.fireEvent.remove();e.disableBody(true,true);var t=(e.getData&&e.getData('type'))||'A';this.addScore(t==='C'?300:100);}else{this.flash(e,100,1.06);} }
  addScore(v){this.score+=v;this.scoreText.setText('Score: '+this.score);}  
  recycleBullet(go){if(go&&go.disableBody)go.disableBody(true,true);else if(go){go.setActive(false).setVisible(false);} }

  // Update
  update(time,delta){if(this.isGameOver)return;var H=this.scale.height;if(this.bgs){var sp=[0.6,1.2,2.0];for(var i=0;i<this.bgs.length;i++)this.bgs[i].tilePositionY-=this.scrollSpeed*sp[i];}var speed=360,vx=0,vy=0; if((this.cursors.left&&this.cursors.left.isDown)||(this.keys.A&&this.keys.A.isDown))vx-=speed; if((this.cursors.right&&this.cursors.right.isDown)||(this.keys.D&&this.keys.D.isDown))vx+=speed; if((this.cursors.up&&this.cursors.up.isDown)||(this.keys.W&&this.keys.W.isDown))vy-=speed; if((this.cursors.down&&this.cursors.down.isDown)||(this.keys.S&&this.keys.S.isDown))vy+=speed; if(this.player&&this.player.body){this.player.body.velocity.x=Phaser.Math.Linear(this.player.body.velocity.x,vx,0.60);this.player.body.velocity.y=Phaser.Math.Linear(this.player.body.velocity.y,vy,0.60);} var targ=(vx<-10)?'ship-left':(vx>10)?'ship-right':'ship-idle'; if(this.shipAnim!==targ){this.play(this.player,[targ]);this.shipAnim=targ;} for(var i=0;i<this.drones.length;i++){var d=this.drones[i],tx=this.player.x+d.offsetX,ty=this.player.y+d.offsetY;d.sprite.x=Phaser.Math.Linear(d.sprite.x,tx,0.22);d.sprite.y=Phaser.Math.Linear(d.sprite.y,ty,0.22);var dx=tx-d.sprite.x,da=(dx<-2)?'drone-left':(dx>2)?'drone-right':'drone-idle';if(d.anim!==da){this.play(d.sprite,[da]);d.anim=da;}}
    this.enemies.children.iterate((e)=>{if(!e||!e.active||(e.getData&&(e.getData('isBoss')||e.getData('clusterId'))))return;var a=((e.getData&&e.getData('sinA'))||0)+(((e.getData&&e.getData('sinFreq'))||0)*delta);if(e.setData)e.setData('sinA',a);e.x+=Math.sin(a)*(((e.getData&&e.getData('sinAmp'))||0)*0.1);if(e.y>H+40){if(e.fireEvent)e.fireEvent.remove();e.disableBody(true,true);}});
    this.powerups.children.iterate((p)=>{if(p&&p.active&&p.y>H+40)p.disableBody(true,true);});
    var m=16;if(this.player){this.player.x=Phaser.Math.Clamp(this.player.x,this.cameras.main.worldView.x+m,this.cameras.main.worldView.x+this.cameras.main.width-m);this.player.y=Phaser.Math.Clamp(this.player.y,this.cameras.main.worldView.y+m,this.cameras.main.worldView.y+this.cameras.main.height-m);} 
    this.updateClusters(time,delta); this.updateBoss(time,delta);
    this.bullets.children.iterate((b)=>{if(!b||!b.active)return;var vy=(b.body&&b.body.velocity)?b.body.velocity.y:0;if(b.y<-40||b.y>H+40||(b.getData&&b.getData('despawnAt')&&time>(b.getData('despawnAt')))||Math.abs(vy)<40)this.recycleBullet(b);});
    this.enemyBullets.children.iterate((b)=>{if(!b||!b.active)return;if(b.y>H+40||(b.getData&&b.getData('despawnAt')&&time>(b.getData('despawnAt'))))this.recycleBullet(b);});}

  // Boss update & game over
  updateBoss(time,delta){if(!this.boss||!this.boss.active)return;this.bossEnterT+=delta;if(this.bossSweepActive&&this.bossSweepTween&&!this.bossSweepTween.isPlaying()){this.bossSweepActive=false;this.bossSweepTween=null;} if(this.bossBarFg&&this.bossHpMax>0&&this.bossBarBg){var w=this.bossBarBg.width;this.bossBarFg.width=Math.max(0,Math.min(w,(this.bossHp/this.bossHpMax)*w));}}
  onPlayerHit(pl,hz){if(this.isGameOver)return;var now=this.time.now;if(now<this.nextHitAllowedAt)return;this.nextHitAllowedAt=now+this.hitCooldownMs;this.applyShake();this.flashVignette();pl.setTint(0xffaaaa);this.time.delayedCall(150,()=>pl.clearTint());this.lives=Math.max(0,this.lives-1);this.updateLivesText();this.loseAllDrones();if(hz&&hz.active&&hz.disableBody)hz.disableBody(true,true);if(this.lives<=0)this.gameOver();}
  gameOver(){if(this.isGameOver)return; if(this.bossFireEvent)this.bossFireEvent.remove();if(this.bossMoveEvent)this.bossMoveEvent.remove();if(this.bossRoamEvent)this.bossRoamEvent.remove();if(this.bBossTrail)this.bBossTrail.remove();if(this.bossSweepTween)this.bossSweepTween.stop();if(this.bossRoamTween)this.bossRoamTween.stop();if(this.boss&&this.boss.active)this.boss.disableBody(true,true);this.boss=null;if(this.bossBarBg)this.bossBarBg.destroy();if(this.bossBarFg)this.bossBarFg.destroy();this.bossBarBg=this.bossBarFg=null;this.isGameOver=true;this.physics.world.pause();this.add.text(this.scale.width/2,this.scale.height/2,['GAME OVER','Press R to Restart'],{fontSize:'26px',color:'#e6ecff',align:'center'}).setOrigin(0.5).setScrollFactor(0).setDepth(2000).setVisible(true);} 
}

// Expose to global
if(typeof window!=='undefined'){ window.ShmupScene=ShmupScene; }
