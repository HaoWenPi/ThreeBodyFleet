/* 自然选择号 · 深空航行模拟
 * 纯 Three.js + 原生 JS，无外部资源依赖（three.min.js 已放本地 vendor/）
 * 坐标约定：旗舰永远位于世界原点，舰体局部 -Z 为前进方向；宇宙相对飞船流动。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  window.addEventListener('error', function (ev) {
    var box = document.getElementById('error-box');
    if (box && box.classList.contains('hidden')) {
      box.classList.remove('hidden');
      box.textContent = '运行错误：' + (ev.message || '未知错误') + ' @ ' + (ev.filename || '') + ':' + (ev.lineno || 0);
    }
  });
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var deg = function (r) { return r * 180 / Math.PI; };
  var PI2 = Math.PI * 2;
  var C_KMS = 299792.458;               // 光速 km/s
  /* 档位梯度：每档严格 +0.025 c（游戏化设定，非原著数据）。
     旧值 0.002/0.010/0.030 是指数式，前三档挤在一起、第四档突然爆开。 */
  var AHEAD = [
    { label: '停车',   en: 'ALL STOP',      c: 0 },
    { label: '前进一', en: 'AHEAD ONE',     c: 0.025 },
    { label: '前进二', en: 'AHEAD TWO',     c: 0.050 },
    { label: '前进三', en: 'AHEAD THREE',   c: 0.075 },
    { label: '前进四', en: 'WARP · 0.10 c', c: 0.100 }
  ];

  if (typeof THREE === 'undefined') {
    $('error-box').classList.remove('hidden');
    $('error-box').textContent = 'Three.js 未能加载：请确认 vendor/three.min.js 与本页面在同一目录。';
    return;
  }

  /* ================= 渲染器 / 场景 ================= */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    $('error-box').classList.remove('hidden');
    $('error-box').textContent = '当前浏览器无法创建 WebGL 上下文，请更换支持 WebGL 的浏览器或开启硬件加速。';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x01040b, 1);
  if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  $('viewport').appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 32000);

  // 硬表面光照：压低环境光、加强主光与轮廓光，让装甲板折面之间有明确明暗分界
  scene.add(new THREE.AmbientLight(0x48688a, 0.58));
  var keyLight = new THREE.DirectionalLight(0xe4f4ff, 2.15);
  keyLight.position.set(-40, 55, -70); scene.add(keyLight);
  var fillLight = new THREE.DirectionalLight(0x4f86ff, 0.55);
  fillLight.position.set(60, -20, 40); scene.add(fillLight);
  // 双色引擎补光：上方两具蓝色喷口 / 下方两具红色喷口，灯位贴合舰尾端面
  var engineLight = new THREE.PointLight(0x66ddff, 2.4, 220);
  engineLight.position.set(0, 3.35, 38.5); scene.add(engineLight);
  var engineLightWarm = new THREE.PointLight(0xff7040, 1.5, 220);
  engineLightWarm.position.set(0, -0.95, 38.5); scene.add(engineLightWarm);

  /* 程序化环境反射：金属 PBR 舰体在纯深空里没有环境光照会近乎全黑。
     用 equirect 深空/恒星光斑贴图生成 PMREM，给整个场景补一层柔和反射。 */
  try {
    var envCanvas = document.createElement('canvas');
    envCanvas.width = 512; envCanvas.height = 256;
    var ex = envCanvas.getContext('2d');
    var eg = ex.createLinearGradient(0, 0, 0, 256);
    eg.addColorStop(0, '#12263d'); eg.addColorStop(0.42, '#24405e');
    eg.addColorStop(0.62, '#0d1b2e'); eg.addColorStop(1, '#04070e');
    ex.fillStyle = eg; ex.fillRect(0, 0, 512, 256);
    var eSpots = [
      [88, 54, 120, 'rgba(190,225,255,0.95)'],
      [296, 74, 92, 'rgba(255,206,155,0.72)'],
      [430, 132, 130, 'rgba(96,158,255,0.52)'],
      [196, 196, 96, 'rgba(126,205,255,0.38)']
    ];
    eSpots.forEach(function (sp) {
      var rg = ex.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], sp[2]);
      rg.addColorStop(0, sp[3]); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ex.fillStyle = rg; ex.beginPath(); ex.arc(sp[0], sp[1], sp[2], 0, PI2); ex.fill();
    });
    var envSrc = new THREE.CanvasTexture(envCanvas);
    envSrc.mapping = THREE.EquirectangularReflectionMapping;
    if (THREE.SRGBColorSpace) envSrc.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding) envSrc.encoding = THREE.sRGBEncoding;
    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(envSrc).texture;
    envSrc.dispose(); pmrem.dispose();
    var rimLight = new THREE.DirectionalLight(0xffc79a, 0.52);
    rimLight.position.set(70, 18, 95); scene.add(rimLight);
  } catch (e) {
    // 软件渲染 / 老显卡不支持 PMREM 时退化为直接光，功能不受影响
  }

  /* ================= 程序化纹理 ================= */
  function texFromCanvas(canvas) {
    var t = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
    return t;
  }

  function makeNebulaTexture() {
    var c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
    var x = c.getContext('2d');
    x.fillStyle = '#01040c'; x.fillRect(0, 0, 2048, 1024);
    x.globalCompositeOperation = 'lighter';
    var palette = [
      [40, 105, 210], [28, 150, 185], [95, 60, 175], [150, 55, 130], [30, 80, 160]
    ];
    // 斜贯天幕的银河带
    for (var i = 0; i < 120; i++) {
      var px = Math.random() * 2048;
      var py = 512 + Math.sin(px / 2048 * Math.PI * 2.2 + 0.6) * 130 + (Math.random() - 0.5) * 300;
      var r = 90 + Math.random() * 260;
      var col = palette[i % palette.length];
      var a = 0.018 + Math.random() * 0.035;
      var g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(' + col.join(',') + ',' + a + ')');
      g.addColorStop(0.45, 'rgba(' + col.join(',') + ',' + (a * 0.45) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, PI2); x.fill();
    }
    // 大块星云
    for (var j = 0; j < 26; j++) {
      var nx = Math.random() * 2048, ny = Math.random() * 1024;
      var nr = 180 + Math.random() * 420;
      var nc = palette[Math.floor(Math.random() * palette.length)];
      var na = 0.025 + Math.random() * 0.05;
      var ng = x.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, 'rgba(' + nc.join(',') + ',' + na + ')');
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = ng; x.beginPath(); x.arc(nx, ny, nr, 0, PI2); x.fill();
    }
    // 远景星尘
    for (var k = 0; k < 900; k++) {
      var sx = Math.random() * 2048, sy = Math.random() * 1024;
      var sa = 0.12 + Math.random() * 0.5;
      x.fillStyle = 'rgba(210,232,255,' + sa + ')';
      x.fillRect(sx, sy, Math.random() < 0.08 ? 2 : 1.2, 1.2);
    }
    // 4 倍降采样：把大面积低透明度渐变产生的有序抖动点阵平均掉，
    // 避免贴到天球后出现细密正交网格；512x256 纹理也更省显存。
    var small = document.createElement('canvas');
    small.width = 512; small.height = 256;
    var sx2 = small.getContext('2d');
    sx2.imageSmoothingEnabled = true;
    sx2.imageSmoothingQuality = 'high';
    sx2.drawImage(c, 0, 0, 512, 256);
    return texFromCanvas(small);
  }

  function makeGlowTexture() {
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(225,245,255,.92)');
    g.addColorStop(0.32, 'rgba(130,205,255,.42)');
    g.addColorStop(0.65, 'rgba(60,130,230,.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return texFromCanvas(c);
  }

  function makeShipNameTexture() {
    var c = document.createElement('canvas'); c.width = 640; c.height = 160;
    var x = c.getContext('2d');
    x.clearRect(0, 0, 640, 160);
    x.textAlign = 'center';
    x.shadowColor = '#54d8ff'; x.shadowBlur = 20;
    x.fillStyle = '#e8fbff';
    x.font = 'bold 62px "Microsoft YaHei","PingFang SC",sans-serif';
    x.fillText('自然选择号', 320, 74);
    x.shadowBlur = 6; x.fillStyle = '#86c6dd';
    x.font = '25px Consolas,monospace';
    x.fillText('NATURAL SELECTION  ·  NS-01', 320, 120);
    return texFromCanvas(c);
  }

  function makePlanetTexture() {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 512);
    var bands = ['#0b2340', '#1c4a70', '#3a7f9d', '#7ab6bd', '#2b5f85', '#123a61', '#0a1e38'];
    for (var i = 0; i < bands.length; i++) g.addColorStop(i / (bands.length - 1), bands[i]);
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    for (var j = 0; j < 90; j++) {
      var y = Math.random() * 512, h = 2 + Math.random() * 16;
      x.fillStyle = 'rgba(' + (Math.random() < .5 ? '190,225,235' : '8,25,50') + ',' + (0.03 + Math.random() * 0.11) + ')';
      x.fillRect(0, y, 1024, h);
    }
    // 风暴斑
    for (var k = 0; k < 5; k++) {
      var px = Math.random() * 1024, py = 120 + Math.random() * 280, pr = 20 + Math.random() * 55;
      var rg = x.createRadialGradient(px, py, 0, px, py, pr);
      rg.addColorStop(0, 'rgba(220,240,235,.32)'); rg.addColorStop(1, 'rgba(220,240,235,0)');
      x.fillStyle = rg; x.beginPath(); x.ellipse(px, py, pr, pr * .55, 0, 0, PI2); x.fill();
    }
    return texFromCanvas(c);
  }

  function makeFinTexture() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 128;
    var x = c.getContext('2d');
    x.fillStyle = '#162634'; x.fillRect(0, 0, 256, 128);
    for (var i = 0; i < 18; i++) {
      x.fillStyle = 'rgba(150,195,220,' + (0.09 + (i % 3) * 0.035) + ')';
      x.fillRect(i * 14 + 4, 6, 2, 116);
    }
    for (var j = 0; j < 7; j++) {
      x.fillStyle = 'rgba(120,165,195,.16)'; x.fillRect(0, j * 18 + 4, 256, 1.5);
    }
    var g = x.createLinearGradient(0, 0, 100, 0);
    g.addColorStop(0, 'rgba(255,125,58,.50)');
    g.addColorStop(1, 'rgba(255,125,58,0)');
    x.fillStyle = g; x.fillRect(0, 0, 100, 128);
    return texFromCanvas(c);
  }
  var glowTex = makeGlowTexture();
  var finTex = makeFinTexture();
  var sky = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 48, 32),
    new THREE.MeshBasicMaterial({ map: makeNebulaTexture(), side: THREE.BackSide, depthWrite: false, fog: false })
  );
  sky.renderOrder = -10; scene.add(sky);

  /* ================= 星场（相对流动 + 循环包裹） ================= */
  var FIELD = 4200, HALF = FIELD / 2;
  var STAR_N = 5200;
  var starPos = new Float32Array(STAR_N * 3);
  var starSize = new Float32Array(STAR_N);
  var starCol = new Float32Array(STAR_N * 3);
  var starSeed = new Float32Array(STAR_N);
  var starPalette = [
    [0.78, 0.88, 1.0], [1.0, 1.0, 1.0], [0.62, 0.78, 1.0],
    [1.0, 0.88, 0.70], [1.0, 0.72, 0.55], [0.88, 0.76, 1.0]
  ];
  for (var si = 0; si < STAR_N; si++) {
    starPos[si * 3] = (Math.random() - 0.5) * FIELD;
    starPos[si * 3 + 1] = (Math.random() - 0.5) * FIELD;
    starPos[si * 3 + 2] = (Math.random() - 0.5) * FIELD;
    starSize[si] = 0.7 + Math.pow(Math.random(), 3) * 3.4;
    starSeed[si] = Math.random();
    var sc = starPalette[Math.floor(Math.random() * starPalette.length)];
    var bright = 0.55 + Math.random() * 0.45;
    starCol[si * 3] = sc[0] * bright;
    starCol[si * 3 + 1] = sc[1] * bright;
    starCol[si * 3 + 2] = sc[2] * bright;
  }
  var starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3).setUsage(THREE.DynamicDrawUsage));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(starCol, 3));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 1));
  var starMat = new THREE.ShaderMaterial({
    uniforms: {
      uRatio: { value: renderer.getPixelRatio() },
      uWarp: { value: 0 }, uTime: { value: 0 }
    },
    vertexShader: [
      'attribute float aSize; attribute vec3 aColor; attribute float aSeed;',
      'uniform float uRatio; uniform float uWarp; uniform float uTime;',
      'varying vec3 vColor; varying float vBright;',
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  float tw = 0.85 + 0.15 * sin(uTime * 1.7 + aSeed * 42.0);',
      '  gl_PointSize = clamp(aSize * uRatio * (900.0 / max(-mv.z, 1.0)) * tw * (1.0 + uWarp * 0.55), 0.6, 10.0);',
      '  vColor = aColor; vBright = tw;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uWarp;',
      'varying vec3 vColor; varying float vBright;',
      'void main(){',
      '  float d = length(gl_PointCoord - vec2(0.5));',
      '  float core = smoothstep(0.5, 0.02, d);',
      '  float halo = smoothstep(0.5, 0.2, d) * 0.2;',
      '  vec3 c = mix(vColor, vec3(0.55, 0.82, 1.0), uWarp * 0.7);',
      '  float a = (core * core * 0.9 + halo) * vBright * (1.0 - uWarp * 0.55);',
      '  gl_FragColor = vec4(c, a);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  var stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false; scene.add(stars);

  /* ================= 跃迁速度线 ================= */
  var LINE_N = 1150;
  var lineBase = new Float32Array(LINE_N * 3);
  var lineLen = new Float32Array(LINE_N);
  var lineCol = new Float32Array(LINE_N * 6);
  var linePos = new Float32Array(LINE_N * 6);
  var lineT = new Float32Array(LINE_N * 2);
  for (var li = 0; li < LINE_N; li++) {
    lineBase[li * 3] = (Math.random() - 0.5) * FIELD;
    lineBase[li * 3 + 1] = (Math.random() - 0.5) * FIELD;
    lineBase[li * 3 + 2] = (Math.random() - 0.5) * FIELD;
    lineLen[li] = 0.35 + Math.random() * 1.0;
    lineT[li * 2] = 0; lineT[li * 2 + 1] = 1;
    var warm = Math.random();
    var lc = warm < 0.75 ? [0.55, 0.82, 1.0] : [0.85, 0.92, 1.0];
    for (var e = 0; e < 2; e++) {
      lineCol[li * 6 + e * 3] = lc[0];
      lineCol[li * 6 + e * 3 + 1] = lc[1];
      lineCol[li * 6 + e * 3 + 2] = lc[2];
    }
  }
  var lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeo.setAttribute('aT', new THREE.BufferAttribute(lineT, 1));
  lineGeo.setAttribute('aColor', new THREE.BufferAttribute(lineCol, 3));
  var lineMat = new THREE.ShaderMaterial({
    uniforms: { uWarp: { value: 0 } },
    vertexShader: [
      'attribute float aT; attribute vec3 aColor;',
      'varying float vT; varying vec3 vColor;',
      'void main(){',
      '  vT = aT; vColor = aColor;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uWarp;',
      'varying float vT; varying vec3 vColor;',
      'void main(){',
      '  float a = pow(1.0 - vT, 1.5) * uWarp * 0.92;',
      '  vec3 c = mix(vColor, vec3(0.72, 0.90, 1.0), uWarp * 0.35);',
      '  gl_FragColor = vec4(c, a);',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  var speedLines = new THREE.LineSegments(lineGeo, lineMat);
  speedLines.frustumCulled = false; scene.add(speedLines);

  /* ================= 远处恒星 / 行星（视觉锚点） ================= */
  var beacons = [];
  function addBeacon(x, y, z, size, color, opacity) {
    var m = new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var s = new THREE.Sprite(m);
    s.position.set(x, y, z); s.scale.setScalar(size);
    scene.add(s); beacons.push(s);
    var core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffffff, transparent: true, opacity: Math.min(1, opacity * 1.3),
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    core.position.copy(s.position); core.scale.setScalar(size * 0.22);
    scene.add(core); beacons.push(core);
  }
  addBeacon(-2100, 900, -4300, 620, 0x9fd4ff, 0.75);
  addBeacon(3200, -760, -5400, 460, 0xffc48a, 0.6);
  addBeacon(900, 1500, -6200, 330, 0xd8e8ff, 0.5);
  addBeacon(-4200, -1200, 1800, 380, 0xa98bff, 0.45);

  var planetGroup = new THREE.Group();
  var planet = new THREE.Mesh(
    new THREE.SphereGeometry(250, 48, 32),
    new THREE.MeshStandardMaterial({ map: makePlanetTexture(), metalness: 0.05, roughness: 0.95 })
  );
  planetGroup.add(planet);
  var ring = new THREE.Mesh(
    new THREE.RingGeometry(310, 430, 96),
    new THREE.MeshBasicMaterial({ color: 0x7fb9d8, side: THREE.DoubleSide, transparent: true, opacity: 0.16, depthWrite: false })
  );
  ring.rotation.x = 1.18; ring.rotation.y = 0.25; planetGroup.add(ring);
  var planetGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x4f9fd0, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  planetGlow.scale.setScalar(760); planetGroup.add(planetGlow);
  planetGroup.position.set(-1500, 260, -3400);
  scene.add(planetGroup);

  /* ================= 舰船建模 ================= */
  function mat(color, metal, rough, emissive, ei) {
    return new THREE.MeshStandardMaterial({
      color: color, metalness: metal, roughness: rough,
      emissive: emissive || 0x000000, emissiveIntensity: ei || 0
    });
  }
  var MAT = {
    hull: mat(0xb8c8d6, 0.82, 0.33),
    hullLight: mat(0xdae6ee, 0.78, 0.28),
    hullDark: mat(0x3b4c5c, 0.85, 0.44),
    panel: mat(0x718697, 0.8, 0.38),
    ring: mat(0x9fb4c2, 0.9, 0.25),
    gold: mat(0x9c8a63, 0.85, 0.35),
    glass: mat(0x0b2a42, 0.4, 0.16, 0x0d4a6b, 0.9),
    lamp: new THREE.MeshBasicMaterial({ color: 0x9df3ff }),
    lampWarm: new THREE.MeshBasicMaterial({ color: 0xffd8a0 }),
    nozzle: new THREE.MeshBasicMaterial({ color: 0x54a8cf })
  };
  // 僚舰舰体明暗/色温差异，避免整支舰队一个模子
  var HULL_VARIANTS = [
    mat(0x9fb2c2, 0.8, 0.4), mat(0xc6d4de, 0.78, 0.34),
    mat(0x8298aa, 0.85, 0.42), mat(0xaebfcc, 0.8, 0.38)
  ];
  // 尾焰沿轴向渐隐：根部亮、尖端柔和消散，避免硬边三角形
  function makeFlameMaterial(color, opacity) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity }
      },
      vertexShader: [
        'attribute float aLen;',
        'varying float vLen;',
        'void main(){',
        '  vLen = aLen;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uOpacity;',
        'varying float vLen;',
        'void main(){',
        '  float fade = pow(1.0 - vLen, 1.8);',
        '  float root = smoothstep(0.0, 0.06, vLen);',
        '  gl_FragColor = vec4(uColor, uOpacity * fade * root);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.FrontSide
    });
  }
  var flameMat = makeFlameMaterial(0xff9a48, 0.4);
  var flameOuterMat = makeFlameMaterial(0x5fb6ff, 0.12);
  var trailMat = makeFlameMaterial(0x66c8ff, 0);
  var wingTrailMat = makeFlameMaterial(0x66c8ff, 0);
  // 旗舰四喷口专属：上方两具蓝色引擎、下方两具红色引擎。僚舰仍共用 flameMat / flameOuterMat。
  // 上排青白蓝（与模型自带深蓝晶体推进束区分）、下排饱和红
  var flameBlue = makeFlameMaterial(0x9be6ff, 0.4);
  var flameBlueOuter = makeFlameMaterial(0x2f86ff, 0.12);
  var flameRed = makeFlameMaterial(0xff7438, 0.4);
  var flameRedOuter = makeFlameMaterial(0xff2a1a, 0.12);
  var NS_FLAME_MATS = [flameBlue, flameBlueOuter, flameRed, flameRedOuter];
  var NS_FLAME_BASE = [0x9be6ff, 0x2f86ff, 0xff7438, 0xff2a1a];
  var NS_WHITE = new THREE.Color(0xffffff);

  function addCyl(g, rt, rb, h, z, m, seg) {
    var mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 24), m);
    mesh.rotation.x = Math.PI / 2; mesh.position.z = z; g.add(mesh); return mesh;
  }
  function addRing(g, r, tube, z, m) {
    var mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 40), m);
    mesh.position.z = z; g.add(mesh); return mesh;
  }
  function addBox(g, w, h, d, x, y, z, m) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); g.add(mesh); return mesh;
  }
  function addFlame(g, radius, height, x, y, z, material) {
    var geo = new THREE.ConeGeometry(radius, height, 16, 1, true);
    geo.translate(0, height / 2, 0);           // 底面固定在原点，拉长时尾根不动
    var pos = geo.attributes.position;
    var fade = new Float32Array(pos.count);
    for (var fi = 0; fi < pos.count; fi++) fade[fi] = clamp(pos.getY(fi) / height, 0, 1);
    geo.setAttribute('aLen', new THREE.BufferAttribute(fade, 1));
    var mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = Math.PI / 2;             // 局部 +Y → 世界 +Z（舰尾方向）
    mesh.position.set(x, y, z);
    g.add(mesh); return mesh;
  }
  function addGlow(g, x, y, z, size, color, opacity) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.position.set(x, y, z); s.scale.setScalar(size); g.add(s); return s;
  }

  // 通用引擎组：4 喷口（旗舰）/ 2 喷口（僚舰）
  function addEngines(g, positions, radius, flameH, outerH, out) {
    positions.forEach(function (p) {
      var nozzle = addCyl(g, radius * 1.18, radius * 1.18, 1.2, 30.2, MAT.hullDark, 16);
      nozzle.position.x = p[0]; nozzle.position.y = p[1];
      var disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.85, 20), MAT.nozzle);
      disc.position.set(p[0], p[1], 30.85); g.add(disc);
      addGlow(g, p[0], p[1], 31.2, radius * 4.6, 0x7fd8ff, 0.3);
      var f = addFlame(g, radius * 0.92, flameH, p[0], p[1], 30.9, flameMat);
      var fo = addFlame(g, radius * 1.7, outerH, p[0], p[1], 30.9, flameOuterMat);
      out.flames.push(f); out.outers.push(fo);
    });
  }

  // 程序化舰体保留为降级方案（ship-model.js 未加载时使用）
  function buildFlagshipProcedural() {
    var g = new THREE.Group();
    var out = { group: g, flames: [], outers: [], trail: null, glows: [] };

    // 雪茄形主舰体：加长前锥段 + 尖舰首，恒星级战舰的长径比
    addCyl(g, 4.2, 4.2, 40, 0, MAT.hull, 32);
    addCyl(g, 4.2, 2.7, 15, -27.5, MAT.hullLight, 32);
    var nose = new THREE.Mesh(new THREE.ConeGeometry(2.7, 11, 32), MAT.hullLight);
    nose.rotation.x = -Math.PI / 2; nose.position.z = -40.5; g.add(nose);
    var sensor = new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 14), MAT.glass);
    sensor.position.z = -46; g.add(sensor);
    addGlow(g, 0, 0, -46.5, 8, 0x7fe8ff, 0.5);
    // 舰首观测环与支撑桁架
    addRing(g, 2.85, 0.16, -35.4, MAT.ring);
    addRing(g, 2.2, 0.12, -43.5, MAT.gold);
    for (var si = 0; si < 4; si++) {
      var sa = si / 4 * PI2;
      var strut = addBox(g, 0.22, 0.22, 9, Math.cos(sa) * 2.2, Math.sin(sa) * 2.2, -39, MAT.panel);
      strut.rotation.z = sa;
    }

    // 引擎舱与舰尾
    addCyl(g, 5.0, 5.0, 8, 25, MAT.hullDark, 32);
    addCyl(g, 4.7, 5.0, 2, 30, MAT.panel, 32);
    addRing(g, 5.02, 0.28, 21.5, MAT.ring);
    addRing(g, 5.02, 0.28, 28.5, MAT.ring);
    addBox(g, 1.0, 10.5, 0.8, 0, 0, 30.4, MAT.panel);
    addBox(g, 10.5, 1.0, 0.8, 0, 0, 30.4, MAT.panel);
    [-19, -6, 8, 18].forEach(function (z) { addRing(g, 4.28, 0.3, z, MAT.ring); });

    // 纵向装甲脊
    for (var a = 0; a < 4; a++) {
      var ang = a * Math.PI / 2;
      var rib = addBox(g, 1.0, 0.42, 38, Math.cos(ang) * 4.3, Math.sin(ang) * 4.3, 0, MAT.panel);
      rib.rotation.z = ang;
    }

    // 舰桥 / 指挥塔
    addBox(g, 5.2, 2.6, 11, 0, 4.7, -14, MAT.hullDark);
    addBox(g, 4.4, 1.0, 0.35, 0, 5.1, -19.4, MAT.glass);
    addBox(g, 3.2, 1.3, 6, 0, 6.3, -12, MAT.panel);
    addBox(g, 0.16, 3.2, 0.16, 0, 8.2, -12, MAT.lamp);
    addGlow(g, 0, 9.8, -12, 4, 0xff8f6b, 0.7);

    // 原著恒星级战舰的标志：四片巨型散热鳍翼（辐射聚变堆废热）
    var finPlate = new THREE.MeshBasicMaterial({
      map: finTex, transparent: true, opacity: 0.92,
      side: THREE.DoubleSide, depthWrite: false
    });
    [-1, 1].forEach(function (sgn) {
      [0, 1].forEach(function (k) {
        var fin = new THREE.Group();
        fin.position.set(sgn * 15.5, k === 0 ? 3.8 : -3.8, 1 + k * 12);
        fin.rotation.y = sgn * 0.17;
        fin.rotation.z = sgn * 0.045;
        fin.add(new THREE.Mesh(new THREE.BoxGeometry(24, 0.3, 8.6), MAT.hullDark));
        var face = new THREE.Mesh(new THREE.PlaneGeometry(23.4, 8.2), finPlate);
        face.rotation.x = -Math.PI / 2; face.position.y = 0.17; fin.add(face);
        var back = face.clone(); back.position.y = -0.17; back.rotation.x = Math.PI / 2; fin.add(back);
        var beam = new THREE.Mesh(new THREE.BoxGeometry(5, 1.1, 2.4), MAT.panel);
        beam.position.x = -sgn * 10.5; fin.add(beam);
        var edge = new THREE.Mesh(new THREE.BoxGeometry(23.4, 0.1, 0.18), MAT.lamp);
        edge.position.set(0, 0.24, 4.2); fin.add(edge);
        g.add(fin);
      });
    });

    // 武器环与电磁炮阵列
    addRing(g, 5.5, 0.2, -9, MAT.gold);
    for (var wi = 0; wi < 8; wi++) {
      var wa = wi / 8 * PI2;
      var turret = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), MAT.panel);
      turret.position.set(Math.cos(wa) * 5.5, Math.sin(wa) * 5.5, -9); g.add(turret);
      var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.6, 8), MAT.hullLight);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(Math.cos(wa) * 5.5, Math.sin(wa) * 5.5, -10.6); g.add(barrel);
    }

    // 舷窗灯带
    for (var z = -19; z <= 20; z += 2.8) {
      [-1, 1].forEach(function (sgn) {
        addBox(g, 0.2, 0.4, 1.15, sgn * 4.24, 0.75, z, MAT.lamp);
      });
      addBox(g, 0.4, 0.18, 1.15, 0, 4.22, z, MAT.lampWarm);
    }
    // 舰名铭牌
    var nameMat = new THREE.MeshBasicMaterial({
      map: makeShipNameTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    var plate = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), nameMat);
    plate.position.set(4.34, -0.6, -6); plate.rotation.y = Math.PI / 2; g.add(plate);
    var plate2 = plate.clone();
    plate2.position.set(-4.34, -0.6, -6); plate2.rotation.y = -Math.PI / 2; plate2.scale.x = -1; g.add(plate2);

    // 四联无工质聚变引擎
    addEngines(g, [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]], 1.85, 10, 24, out);
    out.trail = addFlame(g, 3.2, 190, 0, 0, 30, trailMat);
    g.scale.setScalar(1.42);                 // 旗舰明显大于全部僚舰
    return out;
  }

  // 僚舰四种舰型：巡洋 / 护卫 / 侦察 / 补给，尺寸与轮廓各不相同
  function buildWing(kind, scale, seed) {
    var g = new THREE.Group();
    var out = { group: g, flames: [], outers: [], trail: null, kind: kind };
    var hull = HULL_VARIANTS[seed % HULL_VARIANTS.length];
    var engines, zEnd, bodyR;

    function noseCone(r, h, z) {
      var n = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), MAT.hullLight);
      n.rotation.x = -Math.PI / 2; n.position.z = z; g.add(n);
    }
    function lightStrip(x, y, z, len) { addBox(g, 0.16, 0.28, len, x, y, z, MAT.lamp); }

    if (kind === 'cruiser') {
      addCyl(g, 2.2, 2.2, 22, 0, hull, 18);
      addCyl(g, 2.2, 1.4, 7, -14.5, MAT.hullLight, 18);
      noseCone(1.4, 5, -20.5);
      addCyl(g, 2.6, 2.6, 3.5, 12.5, MAT.hullDark, 18);
      addRing(g, 2.25, 0.16, -7, MAT.ring);
      addRing(g, 2.25, 0.16, 6, MAT.ring);
      addBox(g, 11, 0.5, 3.6, 0, 0, 4, MAT.hullDark);
      engines = [[-1.3, 0], [1.3, 0]]; zEnd = 14.4; bodyR = 2.2;
      for (var zc = -8; zc <= 8; zc += 4) { lightStrip(2.2, 0.6, zc, 1.1); lightStrip(-2.2, 0.6, zc, 1.1); }
    } else if (kind === 'frigate') {
      addBox(g, 9, 2.1, 18, 0, 0, 0, hull);
      addBox(g, 3.2, 1.7, 10, -3.5, 0, -13, MAT.panel);
      addBox(g, 3.2, 1.7, 10, 3.5, 0, -13, MAT.panel);
      noseCone(1.1, 4, -19.5);
      addBox(g, 10.5, 0.4, 5, 0, 1.3, 4, MAT.hullDark);
      addBox(g, 4.6, 1.6, 3, 0, 0, 9.5, MAT.hullDark);
      engines = [[-2.7, 0], [2.7, 0], [0, 1.5]]; zEnd = 11.2; bodyR = 2.8;
      lightStrip(4.6, 0.2, -2, 6); lightStrip(-4.6, 0.2, -2, 6);
    } else if (kind === 'scout') {
      addCyl(g, 1.3, 1.3, 30, 0, hull, 12);
      addCyl(g, 1.3, 0.5, 9, -19.5, MAT.hullLight, 12);
      addCyl(g, 1.45, 1.45, 2.5, 16, MAT.hullDark, 12);
      addRing(g, 1.35, 0.1, -6, MAT.ring);
      addRing(g, 1.35, 0.1, 7, MAT.ring);
      addBox(g, 5.5, 0.28, 2.2, 0, 0, 3, MAT.hullDark);   // 短侧翼，远景也能读出轮廓
      addBox(g, 0.12, 5.5, 0.12, 0, 3.2, -4, MAT.lamp);
      addGlow(g, 0, 6.1, -4, 2.6, 0xff9f7a, 0.55);
      engines = [[0, 0]]; zEnd = 17.4; bodyR = 1.35;
      lightStrip(1.3, 0.4, -2, 1.2); lightStrip(-1.3, 0.4, -2, 1.2);
    } else {
      addBox(g, 8, 6, 16, 0, 0, 0, hull);
      [-1, 1].forEach(function (sy) {
        [-1, 1].forEach(function (sz) {
          addBox(g, 3.3, 2.2, 6, 0, sy * 3.5, sz * 4.6, MAT.panel);
        });
      });
      addBox(g, 3, 1.2, 0.2, 0, 0, -8.2, MAT.lamp);
      addCyl(g, 2.5, 2.5, 2, 9, MAT.hullDark, 14);
      engines = [[-1.6, 0], [1.6, 0]]; zEnd = 10.2; bodyR = 2.9;
      lightStrip(4.1, 0, 0, 8); lightStrip(-4.1, 0, 0, 8);
    }

    engines.forEach(function (p) {
      var disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.42, bodyR * 0.4), 16), MAT.nozzle);
      disc.position.set(p[0], p[1], zEnd + 0.1); g.add(disc);
      addGlow(g, p[0], p[1], zEnd + 0.4, bodyR * 2.2, 0x7fd8ff, 0.3);
      out.flames.push(addFlame(g, bodyR * 0.44, 7, p[0], p[1], zEnd + 0.1, flameMat));
      out.outers.push(addFlame(g, bodyR * 0.75, 17, p[0], p[1], zEnd + 0.1, flameOuterMat));
    });
    out.trail = addFlame(g, bodyR * 0.95, 150, 0, 0, zEnd, wingTrailMat);
    g.scale.setScalar(scale);
    return out;
  }


  /* ===== 真实 3D 模型：tools/build_ship_model.py 生成的内联 glTF 数据 ===== */
  function decodeB64(s) {
    var bin = atob(s), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function buildNSModel() {
    var S = window.NS_SHIP;
    if (!S || !S.pos || !S.nrm || !S.uv || !S.idx || !S.baseColor) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(decodeB64(S.pos)), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(decodeB64(S.nrm)), 3, true));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(decodeB64(S.uv)), 2, true));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(decodeB64(S.idx)), 1));
    geo.computeBoundingSphere();
    var aniso = renderer.capabilities.getMaxAnisotropy
      ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    function tex(uri, srgb) {
      var t = new THREE.TextureLoader().load(uri);
      t.flipY = false;                       // glTF UV 原点在左上
      t.anisotropy = aniso;
      if (srgb) {
        if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
      }
      return t;
    }
    var base = tex(S.baseColor, true);
    // 源模型的 4K 法线贴图布满高频磨损细节，配合金属反射会把舰体读成
    // "一堆碎玻璃"。默认关闭以保留连续大平面与锐利折角；?normal=1 可恢复对照。
    var useNormal = new URLSearchParams(window.location.search).get('normal') === '1';
    var norm = useNormal ? tex(S.normal, false) : null;
    var mr = tex(S.mr, false);              // glTF: G=roughness, B=metalness
    var material = new THREE.MeshStandardMaterial({
      color: 0xffffff,                 // 涂装已在生成阶段净化，无需再压暗
      map: base, normalMap: norm, normalScale: new THREE.Vector2(0.20, 0.20),
      metalnessMap: mr, roughnessMap: mr,
      metalness: 0.26, roughness: 0.92,
      side: THREE.DoubleSide, envMapIntensity: 0.16
    });
    var mesh = new THREE.Mesh(geo, material);
    mesh.name = 'NS-01 Natural Selection';
    window.__NS_MODEL_OK__ = {
      verts: S.vCount, tris: (S.meta && S.meta.tris) || 0,
      tex: (S.meta && S.meta.texSize) || 0,
      maps: [!!S.baseColor, !!S.normal, !!S.mr]
    };
    return mesh;
  }


  /* ===== 结构化 STL 舰体（游戏默认）：分部位 PBR 贴图；?hull=glb 回退上一代 GLB ===== */
  function buildStructuredModel() {
    var S = window.NS_STRUCTURED;
    if (!S || !S.parts || !S.textures) return null;
    var g = new THREE.Group();
    g.name = 'NS-01 Natural Selection (structured)';
    var aniso = renderer.capabilities.getMaxAnisotropy
      ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    function tx(uri, srgb) {
      var t = new THREE.TextureLoader().load(uri);
      t.flipY = false;                       // glTF UV 原点在左上
      t.anisotropy = aniso;
      if (srgb) {
        if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
      }
      return t;
    }
    var T = {
      base: tx(S.textures.basecolor, true),
      nrm:  tx(S.textures.normal, false),
      mr:   tx(S.textures.mr, false),
      emi:  tx(S.textures.emissive, true)
    };
    var tris = 0;
    S.parts.forEach(function (p) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(decodeB64(p.pos)), 3));
      geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(decodeB64(p.nrm)), 3));
      geo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(decodeB64(p.uv)), 2));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(decodeB64(p.idx)), 1));
      geo.computeBoundingSphere();
      var m = new THREE.MeshStandardMaterial({
        map: T.base, normalMap: T.nrm, normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: T.mr, metalnessMap: T.mr,
        roughness: p.material.roughness, metalness: p.material.metalness,
        emissiveMap: T.emi,
        emissive: new THREE.Color(0, p.material.emissive * 0.6, p.material.emissive),
        emissiveIntensity: p.material.emissive > 0 ? 1.8 : 0,
        side: THREE.DoubleSide, envMapIntensity: 0.16
      });
      var mesh = new THREE.Mesh(geo, m);
      mesh.name = p.id;
      g.add(mesh);
      tris += p.tris;
    });
    window.__NS_MODEL_OK__ = {
      verts: tris * 3, tris: tris, tex: S.atlas.size,
      maps: [true, true, true, true], structured: true, parts: S.parts.length,
      yawFlip: false
    };
    window.__NS_HULL_STRUCTURED__ = true;
    return g;
  }

  /* 从结构化模型的真实几何求 4 个尾部喷口：取 aft_booms（尾部双叉推进杆）
     末端 z 最大的端面顶点，按左右 / 上下聚成 4 簇，返回各簇中心与半尺寸。
     这样火焰坐标不是手工估计，而是随模型数据走；模型改了火焰会自动跟着走。 */
  function detectNozzles(S) {
    if (!S || !S.parts) return null;
    var boom = null;
    for (var i = 0; i < S.parts.length; i++) {
      if (S.parts[i].id === 'aft_booms') { boom = S.parts[i]; break; }
    }
    if (!boom || !boom.pos) return null;
    var a;
    try { a = new Float32Array(decodeB64(boom.pos)); } catch (e) { return null; }
    var zMax = -Infinity, yMin = Infinity, yMax = -Infinity, k;
    for (k = 2; k < a.length; k += 3) if (a[k] > zMax) zMax = a[k];
    var tip = [];
    for (k = 0; k < a.length; k += 3) {
      if (a[k + 2] >= zMax - 0.05) {
        tip.push([a[k], a[k + 1], a[k + 2]]);
        if (a[k + 1] < yMin) yMin = a[k + 1];
        if (a[k + 1] > yMax) yMax = a[k + 1];
      }
    }
    if (tip.length < 40) return null;
    var yMid = (yMin + yMax) * 0.5;
    var groups = [[], [], [], []];        // 0 左上 / 1 右上 / 2 左下 / 3 右下
    for (k = 0; k < tip.length; k++) {
      var v = tip[k];
      groups[(v[1] > yMid ? 0 : 2) + (v[0] < 0 ? 0 : 1)].push(v);
    }
    /* 上排蓝色「引擎」不只是 z=zMax 那圈扁槽端面：从侧视看它是双叉后段
       一整段方形舱体。取 z∈[zMax-4, zMax] 且位于上半部的顶点，按左右两簇
       统计引擎舱真实竖直半高。用户按截图标注要求蓝色火焰占满整个引擎
       （参照下方红色引擎填满金色框的效果），所以上排不再按扁槽压扁：
       flat=1.0，ry 用舱体半高，fill 标记供渲染层放大光核。
       发光中心另按舱体半高下移，抵消侧视透视把长锥亮区抬到喷口上方的偏差。 */
    var fyMin = [Infinity, Infinity], fyMax = [-Infinity, -Infinity], fyN = [0, 0];
    for (k = 0; k < a.length; k += 3) {
      if (a[k + 2] >= zMax - 4 && a[k + 1] > yMid) {
        var side = a[k] < 0 ? 0 : 1, yy = a[k + 1];
        if (yy < fyMin[side]) fyMin[side] = yy;
        if (yy > fyMax[side]) fyMax[side] = yy;
        fyN[side]++;
      }
    }
    var out = [];
    for (k = 0; k < 4; k++) {
      var q = groups[k];
      if (q.length < 10) return null;
      var sx = 0, sy = 0, sz = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (var m = 0; m < q.length; m++) {
        var w = q[m];
        sx += w[0]; sy += w[1]; sz += w[2];
        if (w[0] < x0) x0 = w[0]; if (w[0] > x1) x1 = w[0];
        if (w[1] < y0) y0 = w[1]; if (w[1] > y1) y1 = w[1];
      }
      var rx = (x1 - x0) * 0.5, ry = (y1 - y0) * 0.5;
      var upper = k < 2, side2 = k % 2;      // 0 左上 / 1 右上 / 2 左下 / 3 右下
      var fill = upper && fyN[side2] > 100;
      var hy = fill ? (fyMax[side2] - fyMin[side2]) * 0.5 : ry;
      var cy = fill ? (fyMin[side2] + fyMax[side2]) * 0.5 : sy / q.length;
      // 侧视透视会把沿 +Z 拉长的火焰亮区抬到喷口上方；按几何导出的舱体
      // 半高下移发光中心，使光带与蓝色方形喷口对齐（不写死任何坐标）。
      var fy = fill ? cy - hy * 1.47 : sy / q.length;
      out.push({
        x: sx / q.length, y: sy / q.length, z: sz / q.length,
        rx: rx, ry: hy,
        upper: upper, fill: fill,
        // 引擎舱竖直中心 cy / 实际发光中心 fy（诊断钩子会一并导出）
        cy: cy, fy: fy,
        // 上排占满：不压扁，让圆锥底面圆覆盖整个方形引擎舱截面
        flat: fill ? 1.0 : clamp((ry / Math.max(rx, 0.001)) * 1.8, 0.30, 0.62)
      });
    }
    return out;
  }

  /* 舰体下方两具红色引擎：位于 ring_outer（环形外圈）下缘后部的两个金色 U 形框。
     这两个框不属于 aft_booms 端面，位置在圆环下缘两侧、比双叉末端更靠前更低。
     规则完全由模型包围盒的相对阈值驱动：取「下缘 24% + 后部 22%」的顶点，
     按 x 符号聚成左右两簇；框中心 = 簇 x 均值 / 竖直范围中点 / 后端面内侧 0.5。
     这样模型改了火焰会自动跟着走，不硬编码 ±9.4 / -5.9 / 28.4。 */
  function detectLowerPods(S) {
    if (!S || !S.parts) return null;
    var ring = null;
    for (var i = 0; i < S.parts.length; i++) {
      if (S.parts[i].id === 'ring_outer') { ring = S.parts[i]; break; }
    }
    if (!ring || !ring.pos) return null;
    var a;
    try { a = new Float32Array(decodeB64(ring.pos)); } catch (e) { return null; }
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity,
        z0 = Infinity, z1 = -Infinity, k;
    for (k = 0; k < a.length; k += 3) {
      var x = a[k], y = a[k + 1], z = a[k + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    var yTh = y0 + (y1 - y0) * 0.24;   // 下缘
    var zTh = z0 + (z1 - z0) * 0.78;   // 舰尾一侧
    var cl = [[], []];
    for (k = 0; k < a.length; k += 3) {
      if (a[k + 1] < yTh && a[k + 2] > zTh) cl[a[k] < 0 ? 0 : 1].push([a[k], a[k + 1], a[k + 2]]);
    }
    if (cl[0].length < 100 || cl[1].length < 100) return null;
    return cl.map(function (q) {
      var sx = 0, xmin = Infinity, xmax = -Infinity,
          ymin = Infinity, ymax = -Infinity, zmax = -Infinity;
      for (var j = 0; j < q.length; j++) {
        var v = q[j];
        sx += v[0];
        if (v[0] < xmin) xmin = v[0]; if (v[0] > xmax) xmax = v[0];
        if (v[1] < ymin) ymin = v[1]; if (v[1] > ymax) ymax = v[1];
        if (v[2] > zmax) zmax = v[2];
      }
      return {
        x: sx / q.length, y: (ymin + ymax) * 0.5, z: zmax - 0.5,
        rx: (xmax - xmin) * 0.5, ry: (ymax - ymin) * 0.5,
        upper: false, flat: 1.0, pod: true, color: 'red'
      };
    });
  }

  function buildFlagship() {
    var g = new THREE.Group();
    var out = { group: g, flames: [], outers: [], trail: null, glows: [] };
    var structured = !!window.NS_STRUCTURED;
    var model = null;
    try { model = structured ? buildStructuredModel() : buildNSModel(); }
    catch (e) {
      console.warn('[NS] 舰体模型加载失败：', e);
      // 结构化舰体异常时先回退上一代 GLB（若已加载），最后才退到程序化舰体
      window.__NS_HULL_STRUCTURED__ = false;
      window.__NS_MODEL_OK__ = null;
      structured = false;
      try { model = buildNSModel(); } catch (e2) { model = null; }
    }
    if (!model) return buildFlagshipProcedural();

    var hull = new THREE.Group();
    g.add(hull);
    hull.add(model);

    // 原模型导出朝向与工程「-Z 为前进方向」相反，默认绕 Y 轴旋转 180° 掉头。
    // 只旋转模型本体：尾焰、拖尾、航行灯属于「飞行方向」特效，必须留在 +Z 船尾，
    // 否则整组翻转会出现火焰从船头喷出的错误。
    // ?yaw=0 可回到原始导出朝向用于对比核对；?yaw=1 保持等价（向后兼容）。
    var nsFlip = new URLSearchParams(window.location.search).get('yaw') !== '0';
    // 结构化 STL 在构建阶段已把舰首对齐 -Z，无需再掉头
    if (nsFlip && !structured) model.rotation.y = Math.PI;
    window.__NS_YAW_FLIP__ = structured ? false : nsFlip;
    if (window.__NS_MODEL_OK__) window.__NS_MODEL_OK__.yawFlip = structured ? false : nsFlip;

    // 舰尾恒在 +Z≈38。4 个喷口坐标从模型末端端面几何实时导出（左右 × 上下 2×2），
    // 不再用手工估计的 ±3 / ±2；上方两具蓝色、下方两具红色，与模型发动机一一对应。
    var Z_END = (structured || nsFlip) ? 38.0 : 33.0;  // 结构化舰体舰尾恒在 +Z≈38，不受 yaw 参数影响
    var nozzles = structured ? detectNozzles(window.NS_STRUCTURED) : null;
    var nozzleSource = nozzles ? 'geometry' : 'fallback';
    if (!nozzles) {
      // GLB / 程序化舰体没有 aft_booms 端面数据，沿用上一代的经验坐标
      nozzles = [
        { x: -3, y:  2, z: Z_END, rx: 1.5, ry: 1.5, upper: true,  flat: 1 },
        { x:  3, y:  2, z: Z_END, rx: 1.5, ry: 1.5, upper: true,  flat: 1 },
        { x: -3, y: -2, z: Z_END, rx: 1.5, ry: 1.5, upper: false, flat: 1 },
        { x:  3, y: -2, z: Z_END, rx: 1.5, ry: 1.5, upper: false, flat: 1 }
      ];
    }
    // 下排红色喷口改挂到圆环下缘两个金色框（用户按图标注的位置）；
    // 上排蓝色仍留在 aft_booms 双叉末端。GLB / 程序化回退不参与。
    var lowerPods = structured ? detectLowerPods(window.NS_STRUCTURED) : null;
    if (lowerPods && nozzleSource === 'geometry' && nozzles.length === 4) {
      nozzles[2] = lowerPods[0];
      nozzles[3] = lowerPods[1];
    }
    var fx = [];
    nozzles.forEach(function (n, idx) {
      // 端面是扁槽（半宽 ~1.57 / 半高 ~0.37），火焰半径与压扁比都按端面尺寸取
      var core = n.upper ? flameBlue : flameRed;
      var halo = n.upper ? flameBlueOuter : flameRedOuter;
      // 占满模式：发光中心取几何导出的 fy（按舱体半高下移，抵消侧视透视抬升），
      // 火焰锥底面按舱体截面放大，使整个蓝色方形引擎被青白光充满
      // （参照下排红色填满金色框）。
      var fy = n.fy != null ? n.fy : n.y;
      var rCore = n.fill ? Math.min(1.50, n.rx * 0.88) : Math.min(1.25, n.rx * 0.72);
      var rOuter = n.fill ? Math.min(2.30, n.rx * 1.35) : Math.min(1.95, n.rx * 1.15);
      var gl = addGlow(hull, n.x, fy, n.z + 0.55, 2.6,
                       n.fill ? 0xdaf5ff : (n.upper ? 0xc4f2ff : 0xff9c58),
                       n.fill ? 0.58 : 0.38);
      gl.userData.flat = n.flat;
      gl.userData.fill = n.fill ? 1.32 : 1;   // 光核放大，蓝色引擎被整片照亮
      out.glows.push(gl);
      var f = addFlame(hull, rCore, 9, n.x, fy, n.z + 0.08, core);
      var fo = addFlame(hull, rOuter, 14, n.x, fy, n.z + 0.08, halo);
      f.userData.flat = n.flat; fo.userData.flat = n.flat;
      f.userData.fillGain = !!n.fill; fo.userData.fillGain = !!n.fill;
      f.userData.nozzle = idx; fo.userData.nozzle = idx;
      out.flames.push(f); out.outers.push(fo);
      fx.push({ flame: f, outer: fo, glow: gl });
    });
    window.__NS_NOZZLES__ = {
      source: nozzleSource, zEnd: Z_END, lowerPods: !!lowerPods,
      list: nozzles.map(function (n) {
        return { x: +n.x.toFixed(3), y: +n.y.toFixed(3), z: +n.z.toFixed(3),
                 rx: +n.rx.toFixed(3), ry: +n.ry.toFixed(3), flat: +n.flat.toFixed(3),
                 cy: n.cy != null ? +n.cy.toFixed(3) : null,
                 fy: n.fy != null ? +n.fy.toFixed(3) : null,
                 glowY: +(n.fy != null ? n.fy : n.y).toFixed(3),
                 upper: n.upper, fill: !!n.fill, color: n.upper ? 'blue' : 'red' };
      })
    };
    window.__NS_NOZZLE_FX__ = fx;      // 供验证脚本读取真实 mesh 的位置与材质
    // 引擎补光跟着真实喷口排走：上排蓝在双叉末端，下排红在圆环下缘两个金色框
    if (nozzles.length === 4) {
      engineLight.position.set(0, (nozzles[0].y + nozzles[1].y) * 0.5,
                               (nozzles[0].z + nozzles[1].z) * 0.5 + 0.5);
      engineLightWarm.position.set(0, (nozzles[2].y + nozzles[3].y) * 0.5,
                                   (nozzles[2].z + nozzles[3].z) * 0.5 + 0.5);
    }
    out.trail = addFlame(hull, 3.0, 175, 0, 0, Z_END, trailMat);

    // 舷侧导航灯，贴近真实轮廓且不遮挡贴图细节
    [-1, 1].forEach(function (sgn) {
      addGlow(hull, sgn * (structured ? 17.0 : 10.6), 1.0, -10, 1.8,
              sgn > 0 ? 0x66ff9f : 0xff6b6b, 0.4);
    });

    g.scale.setScalar(2.0);            // 旗舰明显大于全部僚舰
    return out;
  }

  var flagship = buildFlagship();
  // 让 HUD 明确显示舰体数据来源，避免模型加载失败时静默降级却不易察觉
  (function () {
    var el = $('v-model');
    if (!el) return;
    var mi = window.__NS_MODEL_OK__;
    if (window.__NS_HULL_STRUCTURED__) el.textContent = 'STL · ' + (mi.tris / 10000).toFixed(1) + ' 万面 / ' + mi.parts + ' 部位';
    else if (mi) el.textContent = 'GLB · ' + (mi.tris / 10000).toFixed(1) + ' 万面';
    else { el.textContent = '程序化舰体'; el.classList.remove('ok'); }
  })();
  var ship = flagship.group;                 // 旗舰姿态即全舰队基准
  scene.add(ship);

  // 5 套阵型，坐标基于放大后的旗舰尺度（旗舰半展宽约 38，全长约 112）
  var FORMATIONS = [
    { name: '楔形前锋', en: 'WEDGE', pts: [
      [-52, 0, -56], [52, 0, -56],
      [-82, 0, -100], [82, 0, -100],
      [-52, -24, -104], [52, -24, -104],
      [0, 30, -118],
      [-125, 0, -152], [125, 0, -152],
      [-66, 26, -178], [66, 26, -178]
    ]},
    { name: '环形护卫', en: 'RING GUARD', pts: [
      [-62, 0, -30], [62, 0, -30],
      [-88, 38, -80], [88, 38, -80],
      [-88, -38, -80], [88, -38, -80],
      [0, 62, -96], [0, -62, -96],
      [-58, 0, 28], [58, 0, 28],
      [0, 0, -150]
    ]},
    { name: '双列巡航', en: 'COLUMN', pts: [
      [-56, 0, -30], [56, 0, -30],
      [-56, 0, -78], [56, 0, -78],
      [-56, 0, -126], [56, 0, -126],
      [-56, 0, -174], [56, 0, -174],
      [-56, 24, -54], [56, 24, -54],
      [0, 40, -110]
    ]},
    { name: '战列横队', en: 'LINE ABREAST', pts: [
      [-135, 0, -110], [-108, 0, -110], [-81, 0, -110], [-54, 0, -110], [-27, 0, -110],
      [27, 0, -110], [54, 0, -110], [81, 0, -110], [108, 0, -110], [135, 0, -110],
      [0, 34, -150]
    ]},
    { name: '松散巡航', en: 'FREE SCATTER', pts: [
      [-110, 26, -46], [86, -32, -72], [-62, -46, -128], [130, 18, -160],
      [-150, -20, -170], [32, 56, -100], [-30, -58, -190], [108, -42, -38],
      [-92, 44, -205], [14, 16, -220], [60, -18, -140]
    ]}
  ];

  // 11 艘僚舰：4 种舰型、大小与响应特性各异，全部小于旗舰
  var WING_SPEC = [
    { k: 'cruiser', s: 1.35 }, { k: 'cruiser', s: 1.16 },
    { k: 'frigate', s: 1.12 }, { k: 'frigate', s: 0.96 },
    { k: 'scout', s: 1.57 }, { k: 'scout', s: 1.29 },
    { k: 'hauler', s: 1.09 }, { k: 'hauler', s: 0.92 },
    { k: 'cruiser', s: 0.99 }, { k: 'frigate', s: 0.83 },
    { k: 'scout', s: 1.19 }
  ];
  var wings = WING_SPEC.map(function (spec, i) {
    var w = buildWing(spec.k, spec.s, i);
    w.pos = new THREE.Vector3();
    w.vel = new THREE.Vector3();
    w.phase = (i * 2.399963 + 0.7) % PI2;
    w.seed = (i * 0.6180339887) % 1;
    w.stiff = 7.5 + (i % 5) * 1.8;            // 归位刚度：各舰不同
    w.damp = 5.2 + (i % 4) * 0.8;             // 阻尼
    w.turn = 0.85 + (i % 6) * 0.50;           // 姿态跟随速率：滚转时错落更明显
    w.wobble = 0.55 + ((i * 7) % 9) * 0.13;  // 扰动幅度
    var p = FORMATIONS[0].pts[i];
    w.pos.set(p[0], p[1], p[2]);
    w.group.position.copy(w.pos);
    w.group.quaternion.copy(ship.quaternion);
    scene.add(w.group);
    return w;
  });
  /* v1.2.2 损毁火光：每艘僚舰挂一个独立材质的光核，受损后按完整度脉动、
     越接近殉爆越红越亮。MAT.* 是全舰队共享材质，直接改 emissive 会一起点亮。 */
  var WING_DMG_GEO = new THREE.SphereGeometry(1, 10, 8);
  wings.forEach(function (w) {
    var fx = new THREE.Mesh(WING_DMG_GEO, new THREE.MeshBasicMaterial({
      color: 0xff6a34, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }));
    fx.visible = false;
    fx.position.set(0, 0, -2);
    w.group.add(fx);
    w.dmgFx = fx;
    w.dmgHit = 0;
  });

  /* 编队航向：僚舰不共用旗舰的瞬时姿态。qFleet 以低速惯性跟随，旗舰改航向时
     各舰沿自己的航向继续走一段再弧线归位，而不是整队被一个旋转矩阵刚性搬走。
     巡航越快，编队转向越迟钝（大舰队机动需要时间）。 */
  var qFleet = new THREE.Quaternion().copy(ship.quaternion);
  var qFleetDelta = new THREE.Quaternion();
  var FLEET_HOOK = window.__NS_FLEET__ = {
    lagDeg: 0, driveNorm: 0, wx: 0, wy: 0, wz: 0
  };

  /* 大舰操纵惯性（v1.1.3）：指令角速率不再直接驱动舰体，先经角速度低通。
     起转有迟滞、松手有余转，才像一艘有质量的巨舰。常数只作用于姿态层，
     不碰 orbitBy / 相机层 / 手势 / AHEAD / 推进视觉量。 */
  var ATTITUDE = { spinUp: 0.42, coast: 1.10, yaw: 0, pitch: 0, roll: 0,
                   cmdYaw: 0, cmdPitch: 0, cmdRoll: 0 };
  window.__NS_ATTITUDE__ = {
    spinUp: ATTITUDE.spinUp, coast: ATTITUDE.coast,
    yaw: 0, pitch: 0, roll: 0, cmdYaw: 0, cmdPitch: 0, cmdRoll: 0
  };

  /* ================= 状态 ================= */
  var state = {
    gear: 0, targetC: 0, speedC: 0, warp: 0,
    distanceKm: 0, paused: false, muted: false,
    camIndex: 0, helpOpen: false, bannerShown: false,
    mouseNX: 0, mouseNY: 0, locked: false,
    formation: 0, formationBlend: 1, agility: 0,
    // 视角手势：zoom = 相机跟随距离倍率（越小画面越大，显示时取倒数换算成放大率）
    // orbitYaw/Pitch = 以旗舰为中心的环绕角（弧度），与拖动距离线性相关
    zoom: 1, zoomTarget: 1,
    orbitYaw: 0, orbitPitch: 0, orbitYawTarget: 0, orbitPitchTarget: 0,
    compact: false
  };
  var ZOOM_MIN = 0.52, ZOOM_MAX = 2.35;
  var ORBIT_PITCH_MAX = 1.25;              // ±71.6°，避免镜头方向与 up 轴平行
  var CAMS = [
    { x: 18, y: 26, z: 132, fov: 58, name: '第三人称 · 标准跟随', en: 'CHASE CAM 01' },
    { x: 30, y: 48, z: 235, fov: 52, name: '第三人称 · 舰队全景', en: 'FLEET VIEW 02' },
    { x: 8, y: 12, z: 78, fov: 66, name: '第三人称 · 近距', en: 'CLOSE CHASE 03' }
  ];
  var keys = {};
  var AXIS_X = new THREE.Vector3(1, 0, 0);
  var AXIS_Y = new THREE.Vector3(0, 1, 0);
  var AXIS_Z = new THREE.Vector3(0, 0, 1);
  var qYaw = new THREE.Quaternion(), qPitch = new THREE.Quaternion(), qRoll = new THREE.Quaternion();
  var forward = new THREE.Vector3(0, 0, -1);
  var upVec = new THREE.Vector3(0, 1, 0);
  var deltaVec = new THREE.Vector3();
  var desiredPos = new THREE.Vector3();
  var lookTarget = new THREE.Vector3();
  // 必须是 Camera 实例：普通 Object3D.lookAt 让 +Z 指向目标，会让镜头整体反转 180°
  var camHelper = new THREE.Camera();
  var tmpVec = new THREE.Vector3();
  var tmpV2 = new THREE.Vector3();
  var qOrbitYaw = new THREE.Quaternion();
  var qOrbitPitch = new THREE.Quaternion();
  var qPrev = new THREE.Quaternion();
  var qTarget = new THREE.Quaternion();
  var qWobble = new THREE.Quaternion();
  var qInv = new THREE.Quaternion();
  var tmpEuler = new THREE.Euler();

  /* ================= HUD ================= */
  var el = {
    fxLines: $('fx-lines'), fxGlow: $('fx-glow'), flash: $('flash'),
    gearName: $('gear-name'), gearEn: $('gear-en'), speedBig: $('speed-big'),
    speedFill: $('speed-fill'), engineDot: $('engine-dot'), engineText: $('engine-text'),
    heading: $('v-heading'), pitch: $('v-pitch'), roll: $('v-roll'), dist: $('v-dist'),
    speed: $('v-speed'), kms: $('v-kms'), thrust: $('v-thrust'), fleet: $('fleet-status'),
    formation: $('v-formation'), radarLabel: $('radar-label'),
    toast: $('toast'), toastMain: $('toast-main'), toastSub: $('toast-sub'),
    banner: $('warp-banner'), radar: $('radar'),
    pausedTag: $('paused-tag'), helpPanel: $('help-panel'), start: $('startscreen'),
    btnMute: $('btn-mute'), btnLock: $('btn-lock')
  };
  var radarCtx = el.radar.getContext('2d');
  var gearButtons = Array.prototype.slice.call(document.querySelectorAll('.gearbtn'));

  function formatDistance(km) {
    var au = km / 1.495978707e8;
    if (au >= 0.01) return au.toFixed(3) + ' AU';
    if (km >= 1e8) return (km / 1e8).toFixed(2) + ' 亿 km';
    if (km >= 1e4) return (km / 1e4).toFixed(2) + ' 万 km';
    return km.toFixed(0) + ' km';
  }

  function updateGearButtons() {
    gearButtons.forEach(function (b) {
      b.classList.toggle('active', Number(b.dataset.gear) === state.gear);
    });
  }

  var toastTimer = null;
  function showToast(main, sub, isWarp) {
    el.toastMain.textContent = main; el.toastSub.textContent = sub;
    el.toast.classList.toggle('warp-toast', !!isWarp);
    el.toast.classList.remove('show');
    void el.toast.offsetWidth;                  // 重启动画
    el.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 1550);
  }

  function flashScreen() {
    el.flash.style.transition = 'none';
    el.flash.style.opacity = '0.5';
    requestAnimationFrame(function () {
      el.flash.style.transition = 'opacity .9s ease-out';
      el.flash.style.opacity = '0';
    });
  }

  function beep(freq, dur, volume) {
    if (!audio || state.muted) return;
    var o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
    var t0 = audio.ctx.currentTime, d = dur || 0.16;
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 0.72, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 1.18, t0 + d);
    g.gain.setValueAtTime(volume || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(audio.master); o.start(t0); o.stop(t0 + d);
  }

  function setGear(n, silent) {
    n = clamp(n, 0, 4);
    if (combat.active && n === 4) {
      if (combat.warpReady && !combat.warpDone) {
        combat.warpDone = true;
        combatLog('引力波广播完成 · 全舰队前进四跃迁脱离');
        combatFinish(true);
        return;
      }
      showToast('接敌中 · 跃迁锁定', 'WARP LOCKED / COMBAT', false);
      return;
    }
    if (n === state.gear) return;
    state.gear = n;
    state.targetC = AHEAD[n].c;
    updateGearButtons();
    showToast(AHEAD[n].label, AHEAD[n].en, n === 4);
    if (!silent) {
      initAudio();
      beep(n === 4 ? 660 : 420 + n * 70, n === 4 ? 0.35 : 0.14, n === 4 ? 0.12 : 0.07);
    }
    if (n === 4) flashScreen();
  }

  function setFormation(dir) {
    state.formation = (state.formation + dir + FORMATIONS.length) % FORMATIONS.length;
    state.formationBlend = 0;                  // 触发柔和归位，阵型不瞬间跳变
    var f = FORMATIONS[state.formation];
    el.formation.textContent = f.name;
    el.radarLabel.textContent = (state.formation + 1) + '/' + FORMATIONS.length + ' ' + f.name;
    showToast(f.name, f.en + ' / FORMATION', false);
    initAudio();
    beep(560, 0.12, 0.06);
    if (combat.active) {
      combatLog('阵型 → ' + f.name + ' · ' + campaignBonus().tag);
      combatRefreshUI();
      combatHook();
    }
  }

  function updateHUD() {
    var g = AHEAD[state.gear];
    el.gearName.textContent = g.label;
    el.gearEn.textContent = g.en;
    el.speedBig.textContent = state.speedC.toFixed(3);
    el.speedFill.style.width = clamp(state.speedC / 0.1 * 100, 0, 100).toFixed(1) + '%';
    el.speed.textContent = state.speedC.toFixed(3) + ' c';
    el.kms.textContent = Math.round(state.speedC * C_KMS).toLocaleString('en-US');
    el.thrust.textContent = Math.round(clamp(state.speedC / 0.1, 0, 1) * 100) + ' %';
    el.dist.textContent = formatDistance(state.distanceKm);

    forward.set(0, 0, -1).applyQuaternion(ship.quaternion);
    upVec.set(0, 1, 0).applyQuaternion(ship.quaternion);
    var hdg = (deg(Math.atan2(forward.x, -forward.z)) + 360) % 360;
    var pit = deg(Math.asin(clamp(forward.y, -1, 1)));
    var rol = deg(Math.atan2(-upVec.x, upVec.y));
    el.heading.textContent = hdg.toFixed(1).padStart(5, '0') + '°';
    el.pitch.textContent = (pit >= 0 ? '+' : '') + pit.toFixed(1) + '°';
    el.roll.textContent = (rol >= 0 ? '+' : '') + rol.toFixed(1) + '°';

    var warpOn = state.warp > 0.55;
    el.engineDot.className = 'led ' + (state.speedC > 0.0001 ? (warpOn ? 'warp' : 'on') : '');
    el.engineText.textContent = warpOn ? '跃迁引擎 · 全功率'
      : (state.gear === 0 ? '聚变引擎 · 待机' : '聚变引擎 · 巡航输出');
    el.fleet.textContent = ((combat.active ? combatAliveWings() : wings.length) + 1) + ' / ' + (wings.length + 1) + ' 在列';
    el.formation.textContent = FORMATIONS[state.formation].name;
    el.radarLabel.textContent = (state.formation + 1) + '/' + FORMATIONS.length + ' ' + FORMATIONS[state.formation].name;

    if (warpOn !== state.bannerShown) {
      state.bannerShown = warpOn;
      el.banner.classList.toggle('show', warpOn);
    }
  }

  /* v1.2.1：雷达图例原本只列「旗舰 / 僚舰」，战斗中出现红点却无任何说明。
     这里运行时补齐「敌舰 / 锁定」两项（index.html 零改动），并把僚舰图例改成菱形，
     与画布上的青色实心菱形一致；非战斗态隐藏新增项，避免挤窄 212px 面板。 */
  var radarLegendDone = false;
  function radarEnsureLegend() {
    if (radarLegendDone) return;
    var box = document.querySelector('.radar-legend');
    var lab = document.getElementById('radar-label');
    if (!box || !lab) return;
    var wing = box.querySelector('.dot.wing');
    if (wing) wing.classList.add('wing-diamond');
    var mk = function (cls, text) {
      var sp = document.createElement('span');
      sp.className = 'lg-item ' + cls;
      sp.innerHTML = '<i class="dot ' + cls + '"></i>' + text;
      box.insertBefore(sp, lab);
    };
    mk('hostile', '敌舰');
    mk('locked', '锁定');
    radarLegendDone = true;
  }
  /* v1.2.1 诊断钩子：无头验证无需 rAF 即可强制重画一帧并读取画布像素，
     用真实颜色像素数证明「青色僚舰 / 红色敌舰」确实同时出现在雷达上。 */
  window.__NS_RADAR__ = {
    legend: false,
    renderOnce: function (t) {
      radarEnsureLegend();
      drawRadar(t || 0);
      window.__NS_RADAR__.legend = radarLegendDone;
      return window.__NS_RADAR__;
    }
  };
  function drawRadar(t) {
    radarEnsureLegend();
    var x = radarCtx, cx = 90, cy = 90, R = 82;
    x.clearRect(0, 0, 180, 180);
    x.strokeStyle = 'rgba(142,242,255,.16)'; x.lineWidth = 1;
    [R, R * 0.66, R * 0.33].forEach(function (r) {
      x.beginPath(); x.arc(cx, cy, r, 0, PI2); x.stroke();
    });
    x.beginPath(); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R);
    x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.stroke();
    var a = (t * 0.85) % PI2;
    var grad = x.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, 'rgba(120,235,255,.22)'); grad.addColorStop(1, 'rgba(120,235,255,0)');
    x.fillStyle = grad;
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a - 0.5, a); x.closePath(); x.fill();
    // v1.2.1：僚舰统一画青色实心菱形，与敌舰的红色实心圆在「形状 + 颜色」双维度区分。
    // 第三关逃亡舰虽与僚舰外形相似，雷达上仍一眼可辨（见 combatRadar）。
    qInv.copy(ship.quaternion).invert();
    wings.forEach(function (w) {
      tmpV2.copy(w.pos).sub(ship.position).applyQuaternion(qInv);
      var px = cx + clamp(tmpV2.x * 0.34, -R + 5, R - 5);
      var py = cy + clamp(tmpV2.z * 0.34, -R + 5, R - 5);
      var rr = 2.9 + clamp(tmpV2.y / 60, -1, 1) * 0.7;
      x.fillStyle = '#7ce6ff';
      x.strokeStyle = 'rgba(4,20,34,.85)'; x.lineWidth = 0.8;
      x.beginPath();
      x.moveTo(px, py - rr); x.lineTo(px + rr, py);
      x.lineTo(px, py + rr); x.lineTo(px - rr, py);
      x.closePath(); x.fill(); x.stroke();
    });
    x.fillStyle = '#bff6ff'; x.shadowColor = '#8ef2ff'; x.shadowBlur = 10;
    x.beginPath(); x.moveTo(cx, cy - 6); x.lineTo(cx + 5, cy + 5);
    x.lineTo(cx, cy + 2); x.lineTo(cx - 5, cy + 5); x.closePath(); x.fill();
    x.shadowBlur = 0;
    combatRadar(x, cx, cy, R);
  }

  /* ================= 音效：空灵星际气流（WebAudio 程序化生成） =================
     旧版 40 Hz 锯齿波 + 160 Hz 低通是「拖拉机」式低频轰鸣，已整体移除。
     现在：宽带气流噪声 → 带通扫频（LFO 做「咻——」）→ 卷积混响，
           叠加窄带高空气笛颤音与极轻的正弦和声垫；全部参数由线性档位量驱动。 */
  var audio = null;
  function makeImpulse(ctx, seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function initAudio() {
    if (audio) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      var ctx = new AC();
      // 自动播放策略可能让上下文以 suspended 启动；initAudio 总在手势里调用，这里显式唤醒
      if (ctx.state === 'suspended' && ctx.resume) {
        try { var rp = ctx.resume(); if (rp && rp.catch) rp.catch(function () {}); } catch (e) {}
      }
      var master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      var dry = ctx.createGain(); dry.gain.value = 0.85; dry.connect(master);
      var wet = ctx.createGain(); wet.gain.value = 0.45;
      var rev = ctx.createConvolver(); rev.buffer = makeImpulse(ctx, 2.6, 2.4);
      wet.connect(rev); rev.connect(master);

      var buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3), ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
      var noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;

      // 1) 主气流：高通去泥 + 带通扫频 + 慢速音量呼吸 => 空灵的「咻——咻——」
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.9;
      var airGain = ctx.createGain(); airGain.gain.value = 0.10;
      noise.connect(hp); hp.connect(bp); bp.connect(airGain);
      airGain.connect(dry); airGain.connect(wet);
      var sweepLfo = ctx.createOscillator(); sweepLfo.type = 'sine'; sweepLfo.frequency.value = 0.22;
      var sweepDepth = ctx.createGain(); sweepDepth.gain.value = 520;
      sweepLfo.connect(sweepDepth); sweepDepth.connect(bp.frequency);
      var breathLfo = ctx.createOscillator(); breathLfo.type = 'sine'; breathLfo.frequency.value = 0.19;
      var breathDepth = ctx.createGain(); breathDepth.gain.value = 0.055;
      breathLfo.connect(breathDepth); breathDepth.connect(airGain.gain);

      // 2) 高空气笛：窄带噪声 + 颤音，形成连续的「咻咻咻」高频尾音
      var whistle = ctx.createBiquadFilter(); whistle.type = 'bandpass';
      whistle.frequency.value = 3200; whistle.Q.value = 6.5;
      var whistleGain = ctx.createGain(); whistleGain.gain.value = 0;
      noise.connect(whistle); whistle.connect(whistleGain);
      whistleGain.connect(dry); whistleGain.connect(wet);
      var shimmerLfo = ctx.createOscillator(); shimmerLfo.type = 'sine'; shimmerLfo.frequency.value = 2.3;
      var shimmerDepth = ctx.createGain(); shimmerDepth.gain.value = 260;
      shimmerLfo.connect(shimmerDepth); shimmerDepth.connect(whistle.frequency);
      // 2~6 Hz 的音量脉动把气笛切成连续的「咻咻咻」，而不是一条平铺的高频噪音
      var pulseLfo = ctx.createOscillator(); pulseLfo.type = 'sine'; pulseLfo.frequency.value = 2.6;
      var pulseDepth = ctx.createGain(); pulseDepth.gain.value = 0.006;
      pulseLfo.connect(pulseDepth); pulseDepth.connect(whistleGain.gain);

      // 3) 极轻的三音和声垫，只给空间底色，不做低频轰鸣
      var padGain = ctx.createGain(); padGain.gain.value = 0.018;
      padGain.connect(dry); padGain.connect(wet);
      [174.6, 261.6, 392.0].forEach(function (f, i2) {
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        var g = ctx.createGain(); g.gain.value = i2 === 0 ? 0.6 : 0.3;
        o.connect(g); g.connect(padGain); o.start();
      });

      noise.start(); sweepLfo.start(); breathLfo.start(); shimmerLfo.start(); pulseLfo.start();
      audio = { ctx: ctx, master: master, dry: dry, wet: wet, bp: bp,
                airGain: airGain, sweepLfo: sweepLfo, sweepDepth: sweepDepth,
                breathLfo: breathLfo, whistle: whistle, whistleGain: whistleGain,
                shimmerLfo: shimmerLfo, padGain: padGain,
                pulseLfo: pulseLfo, pulseDepth: pulseDepth };
      window.__NS_AUDIO__ = {
        ok: true, graph: 'noise+bandpass-sweep+convolver+shimmer+pad+pulse',
        rumbleOsc: false, convolver: true, lfos: 4, drive: 0, sweepHz: 0.22
      };
    } catch (e) { audio = null; window.__NS_AUDIO__ = { ok: false, error: String(e) }; }
  }
  function updateAudio() {
    if (!audio) return;
    var now = audio.ctx.currentTime;
    var drive = clamp(state.speedC / 0.1, 0, 1);          // 0~1 线性，驱动全部音色参数
    var warp = state.warp;
    audio.master.gain.setTargetAtTime(state.muted ? 0 : (0.06 + drive * 0.26 + warp * 0.08), now, 0.18);
    audio.bp.frequency.setTargetAtTime(760 + drive * 1500 + warp * 500, now, 0.3);
    audio.sweepDepth.gain.setTargetAtTime(340 + drive * 900, now, 0.3);
    audio.sweepLfo.frequency.setTargetAtTime(0.16 + drive * 0.75 + warp * 0.25, now, 0.3);
    audio.breathLfo.frequency.setTargetAtTime(0.14 + drive * 0.60, now, 0.3);
    audio.whistle.frequency.setTargetAtTime(2300 + drive * 3300 + warp * 800, now, 0.3);
    audio.whistleGain.gain.setTargetAtTime(0.012 + drive * 0.055 + warp * 0.02, now, 0.3);
    audio.shimmerLfo.frequency.setTargetAtTime(1.4 + drive * 4.2, now, 0.3);
    audio.pulseLfo.frequency.setTargetAtTime(1.8 + drive * 3.8 + warp * 1.2, now, 0.3);
    audio.pulseDepth.gain.setTargetAtTime(0.004 + drive * 0.014, now, 0.3);
    audio.padGain.gain.setTargetAtTime(0.010 + drive * 0.022, now, 0.4);
    audio.wet.gain.setTargetAtTime(0.45 + warp * 0.25, now, 0.4);
    var A = window.__NS_AUDIO__;
    if (A && A.ok) {
      A.drive = +drive.toFixed(3);
      A.sweepHz = +audio.sweepLfo.frequency.value.toFixed(3);
      A.masterGain = +audio.master.gain.value.toFixed(4);
    }
  }

  /* ================= 小屏面板图标化 / 视角手势 =================
     新 UI 全部由脚本创建：资料库云端 index.html 带 225 个平台节点标注，
     不能整文件覆盖；动态节点 + window 捕获阶段事件委托，也能扛住平台重排 DOM。 */
  var DOCK_DEFS = [
    { id: 'ship-info',   icon: '◈', short: '舰籍', label: '舰籍信息' },
    { id: 'nav-data',    icon: '▤', short: '航行', label: '航行数据' },
    { id: 'radar-panel', icon: '⊙', short: '雷达', label: '编队雷达' },
    { id: 'drive-panel', icon: '▥', short: '推进', label: '推进控制' },
    { id: 'hintbar',     icon: '⌨', short: '键位', label: '键位提示' }
  ];
  var dockEl = null, viewChip = null, chipLast = '', compactOverride = null;

  function ensureDock() {
    var ex = document.getElementById('panel-dock');
    if (ex) { dockEl = ex; return; }              // 平台可能重排过节点，按 id 复用
    dockEl = document.createElement('div');
    dockEl.id = 'panel-dock';
    dockEl.setAttribute('role', 'toolbar');
    dockEl.setAttribute('aria-label', 'HUD 面板快捷图标');
    var h = '';
    DOCK_DEFS.forEach(function (d) {
      h += '<button type="button" class="dock-btn" data-dock="' + d.id + '" title="' + d.label +
           '" aria-label="' + d.label + '"><i>' + d.icon + '</i><small>' + d.short + '</small></button>';
    });
    dockEl.innerHTML = h;
    document.body.appendChild(dockEl);
  }
  function ensureViewChip() {
    var ex = document.getElementById('view-chip');
    if (ex) { viewChip = ex; return; }
    viewChip = document.createElement('button');
    viewChip.type = 'button';
    viewChip.id = 'view-chip';
    viewChip.className = 'hidden';
    viewChip.title = '点击复位视角：画面大小与环绕角度 (R)';
    viewChip.setAttribute('aria-label', '复位视角');
    document.body.appendChild(viewChip);
  }
  function ensureToolbarButtons() {
    var bar = document.getElementById('toolbar');
    if (!bar) return;
    if (!document.getElementById('btn-view-reset')) {
      var a = document.createElement('button');
      a.id = 'btn-view-reset'; a.type = 'button'; a.textContent = '⟲';
      a.title = '复位视角缩放与环绕 (R)';
      a.setAttribute('aria-label', '复位视角缩放与环绕');
      bar.appendChild(a);
    }
    if (!document.getElementById('btn-compact')) {
      var b = document.createElement('button');
      b.id = 'btn-compact'; b.type = 'button'; b.textContent = '▣';
      b.title = '折叠 / 展开 HUD 面板';
      b.setAttribute('aria-label', '折叠或展开 HUD 面板');
      bar.appendChild(b);
    }
    if (!document.getElementById('btn-campaign')) {
      var c = document.createElement('button');
      c.id = 'btn-campaign'; c.type = 'button'; c.textContent = '◈';
      c.title = '舰队战役 · 从任务 01 开始（?campaign=1）';
      c.setAttribute('aria-label', '启动舰队战役战术推演');
      bar.appendChild(c);
    }
    if (!document.getElementById('btn-campaign-select')) {
      var s = document.createElement('button');
      s.id = 'btn-campaign-select'; s.type = 'button'; s.textContent = '▤';
      s.title = '战役任务列表 · 选关 / 查看进度';
      s.setAttribute('aria-label', '打开战役任务列表');
      bar.appendChild(s);
    }
  }
  /* 版本号徽标：运行时追加到舰籍面板，复用 .kv 行样式，
     避免改动托管平台注入过的 index.html（平台标注守恒红线）。 */
  function ensureVersionBadge() {
    if (document.getElementById('hud-version')) return;
    var info = document.getElementById('ship-info');
    if (!info) return;
    var row = document.createElement('div');
    row.id = 'hud-version';
    row.className = 'kv';
    var k = document.createElement('span');
    k.textContent = '程序版本';
    var v = document.createElement('b');
    v.className = 'ok';
    v.textContent = 'v' + APP_VERSION;
    row.appendChild(k); row.appendChild(v);
    info.appendChild(row);
  }
  function injectGestureText() {
    var tbl = document.querySelector('#help-panel table');
    if (tbl && tbl.innerHTML.indexOf('双指捏合') < 0) {
      tbl.insertAdjacentHTML('beforeend',
        '<tr><td>双指捏合 / 张开</td><td>缩放画面（百分比＝画面相对默认大小）</td></tr>' +
        '<tr><td>双指平移 · 间距不变</td><td>以自然选择号为中心环绕观察，不要求两指平齐（左右 360°，上下俯仰）</td></tr>' +
        '<tr><td>Shift + 鼠标拖动</td><td>桌面端同样可环绕观察舰体</td></tr>' +
        '<tr><td>触屏单指滑动</td><td>控制航向与俯仰（离中心越远转得越快）</td></tr>');
    }
    var sk = document.querySelector('.start-keys');
    if (sk && sk.innerHTML.indexOf('双指') < 0) {
      sk.insertAdjacentHTML('beforeend',
        '<div><b>触屏</b> 单指滑动转向 · <b>双指</b> 捏合缩放 / 间距不变平移环绕 · 桌面 <b>Shift+拖动</b></div>');
    }
  }
  function closeDocks() {
    DOCK_DEFS.forEach(function (d) {
      var p = document.getElementById(d.id);
      if (p) p.classList.remove('open');
    });
    if (dockEl) Array.prototype.forEach.call(dockEl.querySelectorAll('.dock-btn'), function (b) {
      b.classList.remove('active');
    });
  }
  function toggleDock(id) {
    var p = document.getElementById(id);
    if (!p) return;
    var willOpen = !p.classList.contains('open');
    closeDocks();                                 // 同时只展开一个，避免小屏互相遮挡
    if (willOpen) {
      p.classList.add('open');
      if (dockEl) {
        var b = dockEl.querySelector('[data-dock="' + id + '"]');
        if (b) b.classList.add('active');
      }
    }
  }
  function compactQuery() {
    var v = new URLSearchParams(location.search).get('compact');
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  }
  function syncCompact(force) {
    ensureDock(); ensureViewChip(); ensureToolbarButtons(); ensureVersionBadge(); injectGestureText();
    var q = compactQuery();
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var auto = window.innerWidth <= 760 || (coarse && window.innerWidth <= 980);
    var c = compactOverride !== null ? compactOverride : (q !== null ? q : auto);
    if (!force && c === state.compact) return;
    state.compact = c;
    document.body.classList.toggle('compact', c);
    document.body.classList.toggle('full-hud', !c);
    closeDocks();
    if (dockEl) dockEl.setAttribute('aria-hidden', c ? 'false' : 'true');
    var cb = document.getElementById('btn-compact');
    if (cb) {
      cb.classList.toggle('active', c);
      // 小屏面板折叠时，版本号仍可从折叠按钮的提示中查看
      cb.title = (c ? '展开 HUD 面板' : '折叠 HUD 面板为图标') + ' · v' + APP_VERSION;
    }
  }
  function resetView() {
    state.zoomTarget = 1;
    // 环绕角归一化到最近一圈，避免转了好几圈后复位时镜头连转好几圈
    var norm = ((state.orbitYaw + Math.PI) % PI2 + PI2) % PI2 - Math.PI;
    state.orbitYaw = norm;
    state.orbitYawTarget = 0; state.orbitPitchTarget = 0;
    updateViewChip();
  }
  function zoomBy(deltaY) {
    var f = Math.exp(clamp(deltaY, -240, 240) * 0.0012);
    state.zoomTarget = clamp(state.zoomTarget * f, ZOOM_MIN, ZOOM_MAX);
    updateViewChip();
  }
  function updateViewChip() {
    if (!viewChip) return;
    // zoom 是「相机距离倍率」；画面放大率 = 1/zoom。旧版直接把距离倍率当百分比显示，
    // 于是把画面缩小反而看到数字变大 —— 这里换算成真正的画面相对大小。
    var mag = 1 / clamp(state.zoomTarget, ZOOM_MIN, ZOOM_MAX);
    var pct = Math.round(mag * 100);
    var yawDeg = Math.round(deg(state.orbitYawTarget) % 360);
    var pitchDeg = Math.round(deg(state.orbitPitchTarget));
    var changed = Math.abs(state.zoomTarget - 1) > 0.01 ||
                  Math.abs(state.orbitYawTarget) > 0.01 || Math.abs(state.orbitPitchTarget) > 0.01;
    var word = pct >= 101 ? '放大至' : (pct <= 99 ? '缩小至' : '标准');
    var txt = '⟲ ' + word + ' ' + pct + '%';
    if (Math.abs(yawDeg) > 2 || Math.abs(pitchDeg) > 2) {
      txt += ' · 环绕 ' + (yawDeg > 0 ? '+' : '') + yawDeg + '°';
    }
    if (txt !== chipLast) {
      viewChip.textContent = txt;
      viewChip.title = '画面为默认大小的 ' + pct + '%（' + word +
                       '）· 环绕 ' + yawDeg + '°；点击复位 (R)';
      chipLast = txt;
    }
    viewChip.classList.toggle('hidden', !changed);
  }

  /* 双指手势：逐帧按两指间距判定意图 —— 间距在变就缩放，间距稳定就以两指中心位移环绕观察。
     不要求两指平齐，也不把整段手势锁死在一个意图里。
     只统计落在 WebGL canvas 上的触点，HUD 按钮上的触摸不会误触发手势。 */
  /* 指针落在可交互 UI 上时暂停「鼠标驾驶」。否则把鼠标移到屏幕边缘的档位 /
     工具按钮准备点击，mouseNX 会被推到 ±1，航向在点击前后持续偏转。 */
  function pointerOnUI(e) {
    var t = e.target;
    if (!t || !t.closest) return false;
    return !!t.closest('button, [data-dock], #toolbar, #panel-dock, #gearbar, ' +
                       '#hintbar, #view-chip, #startscreen, #help-panel, ' +
                       '.start-card, .help-card, #combat-layer, #campaign-select, #radar-panel');
  }

  var gt = { count: 0, mode: '', startDist: 0, startCx: 0, startCy: 0,
             prevDist: 0, prevCx: 0, prevCy: 0, lastGesture: -1e6 };
  window.__NS_GESTURE__ = gt;          // 无头验证：手势意图与两指状态
  var orbitDrag = { active: false, x: 0, y: 0 };
  /* 环绕角与拖动距离严格线性：水平一屏宽 = 360° 且可无限累加（长距离拖动不会
     提前饱和）；垂直一屏高 = 144°，只在 ±71.6° 处夹紧以防镜头与 up 轴平行。 */
  /* 垂直方向与水平独立取号：手指向下拖动时俯仰角减小（用户确认的直觉方向），
     水平方向保持不变；不要为了让深链 ?pitch 的显示好看而改回 +my。 */
  function orbitBy(mx, my) {
    state.orbitYawTarget -= mx * PI2;
    state.orbitPitchTarget = clamp(state.orbitPitchTarget - my * Math.PI * 0.8,
                                   -ORBIT_PITCH_MAX, ORBIT_PITCH_MAX);
    updateViewChip();
  }
  function canvasTouches(e) {
    var out = [], ts = e.touches || [];
    for (var i = 0; i < ts.length; i++) {
      if (ts[i].target === renderer.domElement) out.push(ts[i]);
    }
    return out;
  }
  function gesturePair(pts) {
    var dx = pts[1].clientX - pts[0].clientX, dy = pts[1].clientY - pts[0].clientY;
    return { d: Math.max(Math.sqrt(dx * dx + dy * dy), 1),
             cx: (pts[0].clientX + pts[1].clientX) / 2,
             cy: (pts[0].clientY + pts[1].clientY) / 2 };
  }
  function beginGesture(pts) {
    var g = gesturePair(pts);
    gt.count = 2; gt.mode = '';
    gt.startDist = gt.prevDist = g.d;
    gt.startCx = gt.prevCx = g.cx; gt.startCy = gt.prevCy = g.cy;
    state.mouseNX = 0; state.mouseNY = 0;      // 双指期间不操纵舰体姿态
  }
  function onTouchStart(e) {
    var pts = canvasTouches(e);
    if (pts.length >= 2) beginGesture(pts);
    else gt.count = pts.length;
  }
  function onTouchMove(e) {
    var pts = canvasTouches(e);
    if (pts.length >= 2) {
      if (e.cancelable) e.preventDefault();     // 阻止浏览器自带的页面缩放 / 滚动
      if (gt.count !== 2) { beginGesture(pts); return; }
      var g = gesturePair(pts);
      /* 只要识别到两指、且两指间距保持稳定，就用两指中心的位移环绕观察；
         不要求两指平齐或完全同向，也不把整段手势锁死在一个意图里。
         间距逐帧变化超过 1.5px 才判为捏合缩放；手指重新稳住即可继续旋转。 */
      var dPix = Math.abs(g.d - gt.prevDist);
      gt.mode = dPix > 1.5 ? 'zoom' : 'orbit';
      if (gt.mode === 'zoom') {
        var r = g.d / gt.prevDist;
        if (Math.abs(r - 1) > 0.001) state.zoomTarget = clamp(state.zoomTarget / r, ZOOM_MIN, ZOOM_MAX);
      } else {
        orbitBy((g.cx - gt.prevCx) / Math.max(window.innerWidth, 1),
                (g.cy - gt.prevCy) / Math.max(window.innerHeight, 1));
      }
      gt.prevDist = g.d; gt.prevCx = g.cx; gt.prevCy = g.cy;
      state.mouseNX = 0; state.mouseNY = 0;
      updateViewChip();                          // 手势当下就给反馈，不等下一帧
      return;
    }
    if (gt.count === 2) { gt.count = pts.length; gt.mode = ''; gt.lastGesture = performance.now(); }
    if (pts.length === 1 && !state.locked) {
      var t = pts[0];
      state.mouseNX = clamp((t.clientX / window.innerWidth - 0.5) * 2, -1, 1);
      state.mouseNY = clamp((t.clientY / window.innerHeight - 0.5) * 2, -1, 1);
    }
  }
  function onTouchEnd(e) {
    var pts = canvasTouches(e);
    if (pts.length < 2) {
      if (gt.count === 2) gt.lastGesture = performance.now();
      gt.count = pts.length; gt.mode = '';
      if (!pts.length) { state.mouseNX = 0; state.mouseNY = 0; }
    }
  }
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  // 桌面端：Shift + 左键拖动 = 与双指平移等价的环绕观察
  renderer.domElement.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || !e.shiftKey || e.button !== 0) return;
    orbitDrag.active = true; orbitDrag.x = e.clientX; orbitDrag.y = e.clientY;
    if (e.cancelable) e.preventDefault();
  });
  window.addEventListener('pointermove', function (e) {
    if (!orbitDrag.active) return;
    orbitBy((e.clientX - orbitDrag.x) / Math.max(window.innerWidth, 1),
            (e.clientY - orbitDrag.y) / Math.max(window.innerHeight, 1));
    orbitDrag.x = e.clientX; orbitDrag.y = e.clientY;
  });
  window.addEventListener('pointerup', function () {
    if (!orbitDrag.active) return;
    orbitDrag.active = false;
    gt.lastGesture = performance.now();        // 拖动结束不误触指针锁定
  });
  // iOS Safari 的双指页面缩放不吃 touch-action，显式拦截
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) {
    document.addEventListener(n, function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
  });

  // 统一事件委托：动态节点 / 平台重排后依然可点
  window.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (pointerOnUI(e)) { state.mouseNX = 0; state.mouseNY = 0; }  // 点按钮不改变航向
    var d = t.closest('[data-dock]');
    if (d) { e.preventDefault(); e.stopPropagation(); toggleDock(d.getAttribute('data-dock')); return; }
    if (t.closest('#view-chip') || t.closest('#btn-view-reset')) {
      e.preventDefault(); e.stopPropagation(); resetView(); return;
    }
    if (t.closest('#btn-compact')) {
      e.preventDefault(); e.stopPropagation();
      compactOverride = !state.compact;
      syncCompact(true);
    }
  }, true);

  /* 程序版本：与 changelog.md / git tag vX.Y.Z 保持一致，每次发版必须同步更新。 */
  var APP_VERSION = '1.2.2';
  window.__NS_VERSION__ = APP_VERSION;

  window.__NS_VIEW__ = {
    zoom: 1, zoomTarget: 1, magnification: 1,
    orbitYaw: 0, orbitPitch: 0, orbitYawTarget: 0, orbitPitchTarget: 0,
    compact: false, mode: '', touches: 0, dockOpen: '', mouseNX: 0, mouseNY: 0,
    driveNorm: 0
  };
  window.__NS_VIEW_STATE__ = state;   // 无头验证用的直接状态引用
  syncCompact(true);
  // 托管平台可能异步重排 DOM：低频巡检，节点被移除就重建（按 id 复用，绝不重复追加）
  window.setInterval(function () {
    ensureDock(); ensureViewChip(); ensureToolbarButtons(); ensureVersionBadge(); injectGestureText();
  }, 2500);

  /* 战役 UI：window 捕获阶段事件委托，按钮节点被托管平台替换时仍命中。 */
  window.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var launch = t.closest('#btn-campaign');
    if (launch) { e.preventDefault(); combatStart(1); return; }
    var selBtn = t.closest('#btn-campaign-select');
    if (selBtn) { e.preventDefault(); campaignSelectOpen(); campaignHook(); return; }
    var csAct = t.closest('#campaign-select [data-act]');
    if (csAct) {
      e.preventDefault();
      var ca = csAct.getAttribute('data-act');
      if (ca === 'closeselect') campaignSelectClose();
      else if (ca === 'resetprogress') {
        combat.progress = { cleared: [], best: {}, storage: false };
        campaignSave(); campaignSelectOpen();
      }
      campaignHook();
      return;
    }
    var mi = t.closest('#campaign-select [data-mission]');
    if (mi) {
      e.preventDefault();
      combatStart(parseInt(mi.getAttribute('data-mission'), 10));
      return;
    }
    var rd = t.closest('#radar');
    if (rd && combat.active) { campaignRadarPick(e.clientX, e.clientY); return; }
    var wpn = t.closest('#c-weapons [data-weapon]');
    if (wpn && combat.active) {
      e.preventDefault();
      combatSelectWeapon(parseInt(wpn.getAttribute('data-weapon'), 10));
      return;
    }
    var act = t.closest('#combat-layer [data-act]');
    if (!act || !combat.active) return;
    e.preventDefault();
    var a = act.getAttribute('data-act');
    if (a === 'next') { combatStart(combat.mission + 1); return; }
    else if (a === 'retry') { combatStart(combat.mission); return; }
    else if (a === 'select') { campaignSelectOpen(); campaignHook(); return; }
    else if (a === 'skipstory') { campaignStorySkip(); return; }
    else if (a === 'rules') { combat.rulesOpen = !combat.rulesOpen; combatRefreshUI(); campaignHook(); return; }
    else if (a === 'target') combatCycleTarget();
    else if (a === 'salvo') combatSalvo();
    else if (a === 'tactical') combatToggleTactical();
    else if (a === 'focus' || a === 'evade') combatSetOrder(a);
    else if (a === 'exit') combatExit();
    combatRefreshUI();
    combatHook();
  }, true);

  /* ================= 输入 ================= */
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    keys[k] = true;
    if (combat.active) {
      if (combat.phase === 'result') {
        if (k === 'enter') {
          combatStart(combat.result === 'win' && combat.mission < CAMPAIGN_MISSIONS.length
            ? combat.mission + 1 : combat.mission);
          return;
        }
        if (k === 'escape') { combatExit(); return; }
        return;
      }
      if (k === 'tab') { e.preventDefault(); combatCycleTarget(); combatRefreshUI(); return; }
      if (k === ' ') { e.preventDefault(); combatSalvo(); combatRefreshUI(); return; }
      if (k === 'x') { combatSelectWeapon(combat.weapon + 1); return; }
      if (k === 'z') { combatSelectWeapon(combat.weapon - 1); return; }
      if (k === 'c') { combatToggleTactical(); combatRefreshUI(); return; }
      if (k === 'g') { combatSetOrder('focus'); combatRefreshUI(); return; }
      if (k === 'b') { combatSetOrder('evade'); combatRefreshUI(); return; }
      if (k === 'escape') { combatExit(); return; }
    }
    if (k >= '0' && k <= '4' && k.length === 1) setGear(parseInt(k, 10));
    else if (k === 'v') {
      state.camIndex = (state.camIndex + 1) % CAMS.length;
      showToast(CAMS[state.camIndex].name, CAMS[state.camIndex].en, false);
      beep(520, 0.1, 0.05);
    } else if (k === 'f') {
      setFormation(e.shiftKey ? -1 : 1);
    } else if (k === 'r') {
      ship.quaternion.identity();
      ATTITUDE.yaw = ATTITUDE.pitch = ATTITUDE.roll = 0;
      ATTITUDE.cmdYaw = ATTITUDE.cmdPitch = ATTITUDE.cmdRoll = 0;
      setGear(0, true);
      state.distanceKm = 0;
      resetView();
      showToast('姿态 / 视角复位', 'ATTITUDE / VIEW RESET', false);
    } else if (k === 'h') toggleHelp();
    else if (k === 'm') toggleMute();
    else if (k === 'p') {
      state.paused = !state.paused;
      el.pausedTag.classList.toggle('hidden', !state.paused);
    } else if (k === 'escape') hideHelp();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function () { keys = {}; });

  window.addEventListener('mousemove', function (e) {
    if (combat.active && combat.tactical) { state.mouseNX = 0; state.mouseNY = 0; return; }
    if (orbitDrag.active) return;              // 桌面环绕拖动时不误改舰体姿态
    if (pointerOnUI(e)) {                      // 指针在 UI 上：停止鼠标驾驶
      state.mouseNX = 0; state.mouseNY = 0;
      return;
    }
    if (state.locked) {
      state.mouseNX = clamp(state.mouseNX + e.movementX / 260, -1, 1);
      state.mouseNY = clamp(state.mouseNY + e.movementY / 260, -1, 1);
    } else {
      state.mouseNX = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
      state.mouseNY = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1);
    }
  });
  window.addEventListener('mouseout', function (e) {
    if (!e.relatedTarget) { state.mouseNX = 0; state.mouseNY = 0; }
  });
  // 触摸统一由上方手势模块处理（单指转向 / 双指缩放与平移）
  // 触摸板捏合以 ctrl+wheel 送达：用于缩放视角；普通滚轮仍是换档
  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoomBy(e.deltaY); return; }
    setGear(state.gear + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  renderer.domElement.addEventListener('click', function (e) {
    var s = $('startscreen');
    if (s && !s.classList.contains('hidden')) { enterBridge(); return; }  // 开场层还在时点画面也能进入
    if (combat.active && combat.tactical) { combatTacticalPick(e.clientX, e.clientY); return; }
    if (state.compact) closeDocks();              // 点画面收起临时展开的面板
    if (state.helpOpen) return;
    if (performance.now() - gt.lastGesture < 350) return;  // 双指手势结束不误触指针锁定
    if (renderer.domElement.requestPointerLock && document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    }
  });
  document.addEventListener('pointerlockchange', function () {
    state.locked = document.pointerLockElement === renderer.domElement;
    el.btnLock.style.borderColor = state.locked ? '#8ef2ff' : '';
  });

  gearButtons.forEach(function (b) {
    b.addEventListener('click', function () { initAudio(); setGear(Number(b.dataset.gear)); });
  });

  function toggleHelp() {
    state.helpOpen = !state.helpOpen;
    el.helpPanel.classList.toggle('hidden', !state.helpOpen);
    if (state.helpOpen) { state.mouseNX = 0; state.mouseNY = 0; }
  }
  function hideHelp() { state.helpOpen = false; el.helpPanel.classList.add('hidden'); }
  function toggleMute() {
    state.muted = !state.muted;
    el.btnMute.textContent = state.muted ? '✕' : '♪';
    el.btnMute.style.color = state.muted ? '#ff8f9b' : '';
  }

  $('btn-help').addEventListener('click', toggleHelp);
  $('btn-help-close').addEventListener('click', hideHelp);
  $('btn-mute').addEventListener('click', toggleMute);
  $('btn-formation').addEventListener('click', function () { setFormation(1); });
  $('btn-lock').addEventListener('click', function () {
    if (renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
  });
  /* 进入舰桥：统一入口，由 index.html 的早绑定脚本以事件委托调用。
     按钮节点被托管平台替换、或用户在 9 MB 舰体数据解析完成前点击，都仍然生效。 */
  function enterBridge() {
    var s = $('startscreen') || el.start;      // 实时查找，避免 el 缓存到已被替换的旧节点
    if (!s || s.classList.contains('hidden')) return;
    s.classList.add('hidden');
    try {
      initAudio();
      beep(523, 0.18, 0.08);
      setTimeout(function () { beep(784, 0.24, 0.07); }, 150);
    } catch (e) { console.warn('[NS] 音效初始化失败，舰桥已可用：', e); }
  }
  var B = window.__NS_BRIDGE__ || (window.__NS_BRIDGE__ = { ready: false, pending: false, enter: null });
  B.enter = enterBridge;
  B.ready = true;
  if (B.pending) enterBridge();               // 加载期间已经点过 → 就绪后自动进入

  /* ---------- 开场加载圈 · 混沌平面牛顿三体（v1.0.6）----------
     三颗球 = 三个等质量质点，二维平面内只受彼此的点质量万有引力。
     · 每一对 (i,j) 只算一次力，F_ij 加到 i、F_ji = -F_ij 加到 j
       → 牛顿第三定律；总动量守恒、质心恒在原点（中心光核即质心）。
     · velocity Verlet 辛积分；近距遭遇时按特征时间 r^1.5 把宏观步 DT
       拆成 1~32 个子步（总时间仍严格 DT），避免奇点附近能量发散，
       不引入引力软化，保持严格点质量牛顿引力。
     · 初值离开八字周期解的稳定岛：v3.x += 0.10，v1/v2 各 -= 0.05。
       八字解是线性稳定的周期轨道，小扰动只变准周期，所以上一版
       「轨迹重复 / 速度变化小」是初始条件的物理性质，不是渲染 bug。
     · 真混沌三体几乎必然解体（独立数值实验：本初值约 t=141 抛射），
       故按段播放：每段先静默预推进到不同相位，再显示 75 个物理时间；
       段间 0.55s 插值重投。段内 100% 物理，段间重投是明确的视觉兜底。
       球体跑远 / 能量漂移 / 非有限值也会立即触发重投。
     · 速度可视化：球尺寸、亮度、沿速度方向拉伸随瞬时速率变化，
       让「忽快忽慢」可见；不新增任何小球或尾迹。
     · 播放速率由 LOOP_S 控制（标称一圈 3.0s，v1.0.6 由 2.15s 调慢）：
       只缩放物理时间流速，不改 dt / 初值 / 段长 / 视觉映射，物理内核不变。
     · 渲染只做「整体旋转 45° + 等比缩放」的正交变换，不改动力学。
     · 9 MB 舰体数据解析期由纯 CSS 圆周运动兜底，JS 就绪后平滑接管。
     不改 index.html（云端版含平台标注），也不碰早绑定按钮兜底。 */
  (function initBootRing() {
    var LOOP_S = 3.0;              // 标称「一圈」秒数：越大越慢，v1.0.6 由 2.15 调慢
    var screen = $('startscreen');
    var ring = document.querySelector('#startscreen .start-keys');
    var hook = window.__NS_BOOT__ = {
      ready: false, spheres: 0, spread: 0, glow: 1, duration: LOOP_S, enters: 0,
      physics: false, model: 'planar-newtonian-3body',
      chaos: true, periodic: false, softening: 0,
      G: 1, mass: 1, period: 6.32591398, dt: 0.0025,
      steps: 0, simTime: 0, periods: 0, speedScale: 1,
      segment: 0, resamples: 0, segTime: 0, substeps: 0, maxSub: 1,
      speedMin: 1e9, speedMax: 0, span: 0, maxRadius: 0,
      initialDelta: 0, warmup: 0,
      energy0: 0, energy: 0, drift: 0,
      momentum: [0, 0], com: [0, 0], pairForces: [],
      positions: [], velocities: [], speeds: [], paused: false
    };
    if (!screen || !ring) return;
    var spheres = [].filter.call(ring.children, function (n) {
      return n.tagName === 'DIV' && window.getComputedStyle(n).display !== 'none';
    });
    hook.spheres = spheres.length;
    if (spheres.length < 3) return;   // DOM 被平台重排时保持纯 CSS 兜底

    var G = 1, MASS = 1, DT = 0.0025, T = 6.32591398;  // T 仅作时间标尺，不再是周期
    var BASE_SPEED = T / LOOP_S;
    var CHAOS_DELTA = 0.10;          // 离开八字解稳定岛的初速度扰动
    var SEG_COUNT = 8, SEG_T = 75, WARM = 0.0006;
    var SUB_CAP = 32, SUB_K = 0.006;
    var ROT = Math.PI / 4, CROT = Math.cos(ROT), SROT = Math.sin(ROT);
    var SPEED_LO = 0.40, SPEED_HI = 1.75;
    var P_BASE = [[-0.97000436, 0.24308753], [0.97000436, -0.24308753], [0, 0]];
    var V_BASE = [[0.466203685, 0.43236573], [0.466203685, 0.43236573],
                  [-0.93240737, -0.86473146]];
    var reduce = !!(window.matchMedia &&
                    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var timeFactor = reduce ? 0.35 : 1;

    var p = [], v = [], a = [[0, 0], [0, 0], [0, 0]];
    var accPending = true, lastPair = [];
    var segStart = null;
    var viewSpan = 1, viewScale = 40, ballScale = 1;
    var handoff = null, raf = 0, lastNow = 0, accumulator = 0;

    /* 成对引力：i<j 每对只算一次，F_ij 与 F_ji 严格互为反作用力。
       这是牛顿第三定律在代码里的唯一实现点，勿改成单向累加。
       record=false 供启动期包围盒预积分使用，不污染诊断用的 lastPair。 */
    function accelerations(pos, out, record) {
      var i, j, dx, dy, r2, inv, fx, fy, aix, aiy, ajx, ajy;
      for (i = 0; i < 3; i++) { out[i][0] = 0; out[i][1] = 0; }
      if (record !== false) lastPair.length = 0;
      for (i = 0; i < 3; i++) {
        for (j = i + 1; j < 3; j++) {
          dx = pos[j][0] - pos[i][0];
          dy = pos[j][1] - pos[i][1];
          r2 = dx * dx + dy * dy;
          inv = 1 / (r2 * Math.sqrt(r2));        // F = G·m_i·m_j·(r_j-r_i)/r³
          fx = G * MASS * MASS * inv * dx;
          fy = G * MASS * MASS * inv * dy;
          aix = fx / MASS; aiy = fy / MASS;
          ajx = -fx / MASS; ajy = -fy / MASS;    // F_ji = -F_ij
          out[i][0] += aix; out[i][1] += aiy;
          out[j][0] += ajx; out[j][1] += ajy;
          if (record !== false) lastPair.push([aix, aiy, ajx, ajy]);
        }
      }
    }

    function minSeparationOf(pos) {
      var m = Infinity, i, j, dx, dy, r;
      for (i = 0; i < 3; i++) for (j = i + 1; j < 3; j++) {
        dx = pos[j][0] - pos[i][0]; dy = pos[j][1] - pos[i][1];
        r = Math.sqrt(dx * dx + dy * dy);
        if (r < m) m = r;
      }
      return m > 1e-6 ? m : 1e-6;
    }

    /* 近距遭遇时两体的特征时间 ~ r^1.5，据此把 DT 细分，保持严格点质量引力 */
    function substepsFor(r) {
      var n = Math.ceil(DT / (SUB_K * r * Math.sqrt(r)));
      return Math.max(1, Math.min(SUB_CAP, n || 1));
    }

    function step() {
      var i, k, sub, h;
      if (accPending) { accelerations(p, a); accPending = false; }
      sub = substepsFor(minSeparationOf(p));
      h = DT / sub;
      for (k = 0; k < sub; k++) {
        for (i = 0; i < 3; i++) {                // kick ½ + drift
          v[i][0] += 0.5 * h * a[i][0]; v[i][1] += 0.5 * h * a[i][1];
          p[i][0] += h * v[i][0];       p[i][1] += h * v[i][1];
        }
        accelerations(p, a);                    // 新位置上的加速度
        for (i = 0; i < 3; i++) {               // kick ½
          v[i][0] += 0.5 * h * a[i][0]; v[i][1] += 0.5 * h * a[i][1];
        }
      }
      hook.substeps += sub;
      if (sub > hook.maxSub) hook.maxSub = sub;
      hook.steps++; hook.simTime += DT; hook.segTime += DT;
    }

    function energyOf(pos, vel) {
      var e = 0, i, j, dx, dy;
      for (i = 0; i < 3; i++) e += 0.5 * MASS * (vel[i][0] * vel[i][0] + vel[i][1] * vel[i][1]);
      for (i = 0; i < 3; i++) for (j = i + 1; j < 3; j++) {
        dx = pos[j][0] - pos[i][0]; dy = pos[j][1] - pos[i][1];
        e -= G * MASS * MASS / Math.sqrt(dx * dx + dy * dy);
      }
      return e;
    }

    function measure() {
      var mx = 0, my = 0, cx = 0, cy = 0, i, sp, rx, ry;
      for (i = 0; i < 3; i++) {
        mx += MASS * v[i][0]; my += MASS * v[i][1];
        cx += MASS * p[i][0]; cy += MASS * p[i][1];
      }
      hook.momentum = [mx, my];
      hook.com = [cx / (3 * MASS), cy / (3 * MASS)];
      hook.energy = energyOf(p, v);
      hook.drift = Math.abs(hook.energy - hook.energy0) / Math.abs(hook.energy0);
      hook.positions = p.map(function (r) { return [r[0], r[1]]; });
      hook.velocities = v.map(function (u) { return [u[0], u[1]]; });
      hook.speeds = v.map(function (u) { return Math.sqrt(u[0] * u[0] + u[1] * u[1]); });
      hook.span = 0; hook.maxRadius = 0;
      for (i = 0; i < 3; i++) {
        sp = hook.speeds[i];
        if (sp < hook.speedMin) hook.speedMin = sp;
        if (sp > hook.speedMax) hook.speedMax = sp;
        hook.maxRadius = Math.max(hook.maxRadius,
          Math.sqrt(p[i][0] * p[i][0] + p[i][1] * p[i][1]));
        rx = p[i][0] * CROT - p[i][1] * SROT;
        ry = p[i][0] * SROT + p[i][1] * CROT;
        hook.span = Math.max(hook.span, Math.abs(rx), Math.abs(ry));
      }
      hook.pairForces = lastPair.map(function (f) { return f.slice(); });
      hook.periods = hook.simTime / T;
      hook.duration = LOOP_S / (hook.speedScale * timeFactor);
      return hook;
    }

    /* 每段初值：基础混沌初值 + 千分之几的确定性微扰（总动量恒 0），
       外加不同的静默预推进相位——让每段开场构型就不同，不会像「重新开始」。 */
    function initialFor(seg) {
      var k = ((seg % SEG_COUNT) + SEG_COUNT) % SEG_COUNT;
      var d = CHAOS_DELTA + WARM * Math.sin((k + 1) * 2.39996323);
      var P = P_BASE.map(function (r) { return r.slice(); });
      var V = V_BASE.map(function (u) { return u.slice(); });
      V[2][0] += d; V[0][0] -= d / 2; V[1][0] -= d / 2;
      return { P: P, V: V, offset: 3 + (k * 2.5) % 12, delta: d };
    }

    function recalcScale() {
      viewScale = ((ring.offsetWidth || 104) / 2 - 9) / viewSpan;   // 球半径 7 + 2 余量
    }

    /* 启动期用同一套积分预跑一段，量出旋转后包围盒 → 自动求缩放。
       混沌轨道没有周期，故不再「预跑一个周期」，而是预跑整个段长。 */
    function estimateSpan() {
      var init = initialFor(0);
      var q = init.P.map(function (r) { return r.slice(); });
      var w = init.V.map(function (u) { return u.slice(); });
      var aa = [[0, 0], [0, 0], [0, 0]];
      var n = Math.round(SEG_T / DT), span = 0.0001, s, i, k, sub, h;
      accelerations(q, aa, false);
      for (s = 0; s < n; s++) {
        sub = substepsFor(minSeparationOf(q)); h = DT / sub;
        for (k = 0; k < sub; k++) {
          for (i = 0; i < 3; i++) {
            w[i][0] += 0.5 * h * aa[i][0]; w[i][1] += 0.5 * h * aa[i][1];
            q[i][0] += h * w[i][0];        q[i][1] += h * w[i][1];
          }
          accelerations(q, aa, false);
          for (i = 0; i < 3; i++) {
            w[i][0] += 0.5 * h * aa[i][0]; w[i][1] += 0.5 * h * aa[i][1];
          }
        }
        for (i = 0; i < 3; i++) {
          span = Math.max(span, Math.abs(q[i][0] * CROT - q[i][1] * SROT),
                                Math.abs(q[i][0] * SROT + q[i][1] * CROT));
        }
      }
      viewSpan = span * 1.06;
      recalcScale();
    }

    function proj(i) {
      return [(p[i][0] * CROT - p[i][1] * SROT) * viewScale,
              (p[i][0] * SROT + p[i][1] * CROT) * viewScale];
    }
    function captureRenderPositions() {
      var out = [], i;
      for (i = 0; i < 3; i++) out.push(proj(i));
      return out;
    }

    /* 段内守护：真混沌三体最终会抛射一球，画面不能跟着跑飞 */
    function unstable() {
      var i, e;
      for (i = 0; i < 3; i++) {
        if (!isFinite(p[i][0]) || !isFinite(p[i][1]) ||
            !isFinite(v[i][0]) || !isFinite(v[i][1])) return true;
        if (Math.sqrt(p[i][0] * p[i][0] + p[i][1] * p[i][1]) > 2.0) return true;
      }
      if (minSeparationOf(p) < 0.02) return true;
      e = Math.abs(energyOf(p, v) - hook.energy0) / Math.abs(hook.energy0);
      return !isFinite(e) || e > 0.005;
    }

    function reseed(seg, from) {
      var init = initialFor(seg), k, n;
      p = init.P.map(function (r) { return r.slice(); });
      v = init.V.map(function (u) { return u.slice(); });
      a = [[0, 0], [0, 0], [0, 0]];
      accelerations(p, a); accPending = false;
      hook.energy0 = energyOf(p, v);
      hook.segment = ((seg % SEG_COUNT) + SEG_COUNT) % SEG_COUNT;
      hook.initialDelta = init.delta;
      hook.warmup = init.offset;
      hook.speedMin = 1e9; hook.speedMax = 0;
      hook.steps = 0; hook.simTime = 0; hook.segTime = 0; accumulator = 0;
      n = Math.round(init.offset / DT);
      for (k = 0; k < n; k++) step();            // 静默预推进到不同相位
      segStart = {
        p: p.map(function (r) { return r.slice(); }),
        v: v.map(function (u) { return u.slice(); })
      };
      hook.steps = 0; hook.simTime = 0; hook.segTime = 0;
      hook.speedMin = 1e9; hook.speedMax = 0;
      measure();
      if (from) handoff = { t0: (window.performance || Date).now(), from: from };
      if (hook.ready) hook.resamples++;
    }

    function render(now) {
      var i, rx, ry, vx, vy, x, y, ang, u = 1, sp, q, size, sx, sy, bright;
      if (handoff) {
        var k = (now - handoff.t0) / 550;
        u = k >= 1 ? 1 : (k <= 0 ? 0 : k * k * (3 - 2 * k));
        if (k >= 1) handoff = null;
      }
      measure();
      for (i = 0; i < 3; i++) {
        rx = (p[i][0] * CROT - p[i][1] * SROT) * viewScale;
        ry = (p[i][0] * SROT + p[i][1] * CROT) * viewScale;
        vx = v[i][0] * CROT - v[i][1] * SROT;
        vy = v[i][0] * SROT + v[i][1] * CROT;
        x = rx; y = ry;
        if (u < 1) {                       // 从旧位置平滑过渡到新段
          x = handoff.from[i][0] * (1 - u) + rx * u;
          y = handoff.from[i][1] * (1 - u) + ry * u;
        }
        ang = Math.atan2(vy, vx) * 180 / Math.PI;   // 高光/拉伸朝向 = 瞬时速度方向
        sp = hook.speeds[i];
        q = Math.max(0, Math.min(1, (sp - SPEED_LO) / (SPEED_HI - SPEED_LO)));
        size = (0.68 + 0.72 * q) * ballScale;
        sx = size * (1 + 0.14 * q);
        sy = size * (1 - 0.06 * q);
        bright = (0.72 + 1.05 * q) * hook.glow;
        spheres[i].style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) +
          'px) rotate(' + ang.toFixed(1) + 'deg) scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';
        spheres[i].style.filter = 'brightness(' + bright.toFixed(3) + ')';
      }
    }

    function frame(now) {
      if (hook.paused || screen.classList.contains('hidden')) { raf = 0; return; }
      var dtReal = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      accumulator += dtReal * BASE_SPEED * hook.speedScale * timeFactor;
      var guard = 0, need = false;
      while (accumulator >= DT && guard < 240) {
        step(); accumulator -= DT; guard++;
        if (hook.segTime >= SEG_T || unstable()) { need = true; break; }
      }
      if (need) {
        var from = captureRenderPositions();
        reseed(hook.segment + 1, from);
      }
      if (guard >= 240 || need) accumulator = 0;   // 后台标签页恢复时不要爆算
      render(now);
      raf = window.requestAnimationFrame(frame);
    }

    /* --- 无头验证钩子：确定性推进，不依赖 rAF / 虚拟时间 --- */
    hook.snapshot = function () {
      measure();
      return {
        steps: hook.steps, simTime: hook.simTime, periods: hook.periods,
        momentum: hook.momentum.slice(), com: hook.com.slice(),
        energy: hook.energy, energy0: hook.energy0, drift: hook.drift,
        positions: hook.positions.map(function (r) { return r.slice(); }),
        velocities: hook.velocities.map(function (u) { return u.slice(); }),
        speeds: hook.speeds.slice(),
        pairForces: hook.pairForces.map(function (f) { return f.slice(); }),
        speedScale: hook.speedScale, duration: hook.duration,
        viewScale: viewScale, dt: DT, period: T,
        physics: hook.physics, chaos: hook.chaos, periodic: hook.periodic,
        softening: hook.softening,
        segment: hook.segment, resamples: hook.resamples, segTime: hook.segTime,
        substeps: hook.substeps, maxSub: hook.maxSub,
        speedMin: hook.speedMin, speedMax: hook.speedMax,
        span: hook.span, maxRadius: hook.maxRadius,
        initialDelta: hook.initialDelta, warmup: hook.warmup
      };
    };
    hook.pause = function () { hook.paused = true; };
    hook.resume = function () {
      hook.paused = false; lastNow = (window.performance || Date).now();
      if (!raf) raf = window.requestAnimationFrame(frame);
    };
    hook.reset = function () {
      if (!segStart) return hook.snapshot();
      p = segStart.p.map(function (r) { return r.slice(); });
      v = segStart.v.map(function (u) { return u.slice(); });
      a = [[0, 0], [0, 0], [0, 0]];
      accelerations(p, a); accPending = false;
      hook.steps = 0; hook.simTime = 0; hook.segTime = 0; accumulator = 0;
      hook.speedMin = 1e9; hook.speedMax = 0;
      return hook.snapshot();
    };
    hook.advance = function (simSeconds) {
      var n = Math.min(60000, Math.floor(simSeconds / DT)), k;
      for (k = 0; k < n; k++) step();
      return hook.snapshot();
    };
    hook.renderOnce = function () { render((window.performance || Date).now()); };
    hook.reseed = function (seg) { reseed(seg, null); return hook.snapshot(); };

    function reset() {
      hook.spread = 0; hook.glow = 1; hook.speedScale = 1;
      hook.duration = LOOP_S / timeFactor;
      ballScale = 1;
      ring.style.setProperty('--ns-glow', '1');
    }
    screen.addEventListener('pointermove', function (e) {
      if (screen.classList.contains('hidden')) return;
      var r = ring.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      var near = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / 2.2);
      // 只改时间流速与光晕，不改物理位置：引力轨道不接受外部「推」球
      hook.spread = +(near * 9).toFixed(2);
      hook.glow = +(1 + near * 0.45).toFixed(3);
      hook.speedScale = +(1 + near * 0.6).toFixed(3);
      hook.duration = +(LOOP_S / (hook.speedScale * timeFactor)).toFixed(3);
      ballScale = 1 + hook.spread / 60;
      ring.style.setProperty('--ns-glow', hook.glow);
    }, { passive: true });
    screen.addEventListener('pointerleave', reset);
    ring.addEventListener('click', function (e) {
      e.preventDefault();
      hook.enters++;
      var fn = (window.__NS_BRIDGE__ && window.__NS_BRIDGE__.enter) || enterBridge;
      fn();
    });
    window.addEventListener('resize', recalcScale);

    estimateSpan();
    reset();
    /* 接管：先记下纯 CSS 动画此刻每颗球的实际屏幕位置，再关掉 CSS 公转。
       后续 0.55s 从这些位置插值到引力轨道，首屏不会出现跳变。 */
    var rr = ring.getBoundingClientRect();
    var fromCSS = spheres.slice(0, 3).map(function (d) {
      var b = d.getBoundingClientRect();
      return [b.left + b.width / 2 - (rr.left + rr.width / 2),
              b.top + b.height / 2 - (rr.top + rr.height / 2)];
    });
    ring.classList.add('ns-phys');
    reseed(0, fromCSS);
    hook.physics = true;
    hook.ready = true;
    lastNow = (window.performance || Date).now();
    raf = window.requestAnimationFrame(frame);
  })();

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    starMat.uniforms.uRatio.value = renderer.getPixelRatio();
    syncCompact();                               // 横竖屏 / 窗口变化即时重排 HUD
  });

  /* ================= 舰队战役 · P0 可玩原型（v1.1.2） =================
     战斗空间 combat.root 在「开战瞬间」锚定一次舰体姿态，之后固定在世界坐标：
     敌舰 / 弹丸 / 爆炸都是空间里独立存在的实体，旗舰转向或镜头环绕都不会带着它们转。
     6 座炮塔另挂在 combat.turretRoot 下，每帧跟随舰体，保证炮口与舰体始终贴合；
     两者之间的坐标用 worldToLocal / localToWorld 转换。星场仍按 deltaVec 流动，
     战斗态乘一个随巡航档位变化的视觉系数；档位同时决定接战距离 standoff，
     旗舰加速即主动接敌、减速即脱离。全部资源程序化生成，零新增文件；
     全部 UI 由运行时 DOM 创建，index.html 零改动。
     红线：不动四喷口 / 蓝焰 / AHEAD / orbitBy / 开场三体物理 / 手势 / 早绑定进舰桥。 */
  var combat = {
    active: false, tactical: false, phase: 'idle', mission: 1, time: 0,
    target: null, order: 'focus', salvoCd: 0, wingCd: 1.6,
    kills: 0, losses: 0, hull: 100, shield: 100,
    wave: 0, waveAt: 0, result: null, log: [], hitFlash: 0,
    root: null, turretRoot: null, enemies: [], turrets: [], shots: [], bursts: [], nextId: 1,
    // 档位联动：standoff = 推演设定的接战距离（战场单位），relC = 相对巡航基准的速度差
    standoff: 165, relC: 0, gearSeen: 2,
    // v1.1.3 武器 / 护盾：四种武器各自独立冷却，默认 0 号能量炮，
    // 其行为与 v1.1.2 逐字节等价（已有战斗回归的基线）。
    weapon: 0, weaponCd: [0, 0, 0, 0], beams: [],
    shieldMax: 100, shieldIdle: 0, shieldLock: 0, shieldHit: 0,
    shieldOver: false, shieldState: 'online', shieldMesh: null, shieldMat: null,
    shieldReveal: 0, shieldDir: new THREE.Vector3(0, 0, 1),
    shieldHalfAx: null, shieldCover: null,
    // v1.2.1：规则条展开态 / 护送关僚舰不足提示去重
    rulesOpen: false, escortWarned: false, droplet: null,
    // v1.2.0 战役：关卡配置 / 剧情字幕 / 存档 / 撤离状态
    missionCfg: null, progress: null, storyUntil: 0,
    warpReady: false, warpDone: false, indicators: 0
  };
  var COMBAT_MISSION = { name: '接触 · 智子盲区', en: 'CONTACT / SOPHON BLIND ZONE', limit: 150 };
  var COMBAT_WAVES = [
    { at: 0,  list: [['probe', 3]] },
    { at: 24, list: [['probe', 3], ['raider', 1]] },
    { at: 52, list: [['probe', 2], ['raider', 2]] },
    { at: 82, list: [['raider', 2]] }
  ];
  // 前进二（0.050c）是战斗巡航基准：该档下相对速度 0、接战距离 165、星场系数 0.12，
  // 与 v1.1.1 完全一致；加速 → 主动接敌（距离缩短），减速 → 脱离（距离拉大）。
  // 只读取 state.speedC / AHEAD 标签，绝不改写 AHEAD 常量或 driveNorm 定义。
  var COMBAT_CRUISE_C = 0.05;
  var COMBAT_STANDOFF_K = 1200;
  var COMBAT_STANDOFF_MIN = 105, COMBAT_STANDOFF_MAX = 235;
  var COMBAT_SPEC = {
    probe:  { name: '智子探针', hp: 20, speed: 27, dmg: 4, cd: 2.6 },
    raider: { name: '三体拦截舰', hp: 60, speed: 16, dmg: 9, cd: 3.4 }
  };
  /* 四种武器：能量炮均衡、激光瞬时高射速、鱼雷慢速范围重击、离子炮瘫痪控制。
     DPS 大致相当但适用场景不同，玩家用 X / Z 或点击武器卡切换，空格发射当前武器。 */
  var COMBAT_WEAPONS = [
    { key: 'energy',  name: '能量炮', en: 'ENERGY CANNON', cd: 2.4,  dmg: 9,
      hint: '6 座主炮 · 跟踪弹 · 多目标', color: '#a9f4ff' },
    { key: 'laser',   name: '激光',   en: 'LASER ARRAY',   cd: 1.15, dmg: 4.5,
      hint: '瞬时命中 · 单目标高射速', color: '#8dffd0' },
    { key: 'torpedo', name: '鱼雷',   en: 'TORPEDO',       cd: 4.2,  dmg: 30,
      hint: '慢速重弹 · 范围爆破', color: '#ffc48a' },
    { key: 'ion',     name: '离子炮', en: 'ION CANNON',    cd: 2.9,  dmg: 6,
      hint: '瘫痪武器 · 减速 4 s', color: '#c2a4ff' }
  ];
  /* ================= v1.2.0 战役系统 =================
     四关 = 智子盲区（全歼） / 水滴（护送撤离，水滴不可击毁） / 猜疑链（生存推演） /
     引力波广播（守卫后按 4 跃迁撤离）。第 1 关严格沿用 COMBAT_WAVES / COMBAT_SPEC /
     全歼胜利条件 / 阵型基准（无任何加成），保证 v1.1.3 的战斗回归等价。
     剧情用「舰队战术推演系统」框架，不改写《三体》正史结局；全部资源程序化生成，
     全部 UI 运行时创建，index.html 零改动。 */
  var CAMPAIGN_STORE = 'ns-campaign-v1';
  var CAMPAIGN_WAVES_2 = [
    { at: 0,  list: [['droplet', 1], ['probe', 2]] },
    { at: 26, list: [['probe', 3], ['raider', 1]] },
    { at: 50, list: [['raider', 2], ['probe', 2]] },
    { at: 72, list: [['probe', 2]] }
  ];
  var CAMPAIGN_WAVES_3 = [
    { at: 0,  list: [['mirror', 3]] },
    { at: 22, list: [['mirror', 2], ['probe', 2]] },
    { at: 44, list: [['mirror', 3]] },
    { at: 62, list: [['mirror', 2], ['raider', 1]] }
  ];
  var CAMPAIGN_WAVES_4 = [
    { at: 0,  list: [['lancer', 3]] },
    { at: 20, list: [['lancer', 2], ['raider', 2]] },
    { at: 40, list: [['probe', 3], ['lancer', 2]] },
    { at: 58, list: [['raider', 2], ['lancer', 2]] }
  ];
  /* v1.2.2：水滴不再沿固定轨道绕圈发弹，而是「锁定 → 高速贯穿 → 回环」逐一击穿。
     强相互作用力外壳直接穿透能量护盾，所以撞击只吃阵型减伤，不会被 30 点护盾吃光；
     同一艘僚舰被反复命中直到殉爆才换目标。改平衡只动这一处常量。 */
  var DROPLET_RAM = {
    dmg: 46,            // 单次贯穿削掉的完整度（× 阵型 soak）
    speed: 220,         // 冲刺速度，战场单位/秒
    cd: 4.2,            // 回环后再次追猎的基准间隔（秒）
    recover: 0.80,      // 穿透后的回环时长（秒）
    trail: 0.050,       // 冲刺光轨间隔（秒）
    hitU: 0.93          // 冲刺进度到此即判定贯穿，不依赖帧率
  };
  var CAMPAIGN_SPEC = {
    probe:   COMBAT_SPEC.probe,
    raider:  COMBAT_SPEC.raider,
    droplet: { name: '水滴', hp: 99999, speed: 42, dmg: 14, cd: 2.1, invulnerable: true },
    mirror:  { name: '逃亡舰 · 猜疑链', hp: 78, speed: 20, dmg: 11, cd: 2.9 },
    lancer:  { name: '光粒探针', hp: 48, speed: 24, dmg: 10, cd: 2.4 }
  };
  var CAMPAIGN_MISSIONS = [
    {
      id: 1, name: '接触 · 智子盲区', en: 'CONTACT / SOPHON BLIND ZONE',
      goal: '清除全部敌对信号', win: 'eliminate', limit: 150,
      waves: COMBAT_WAVES, spec: COMBAT_SPEC,
      brief: [
        '舰队战术推演系统 · 任务 01',
        '智子锁死了基础物理实验结果，舰队必须学会在「被观测」的战场上作战。',
        '目标：清除全部模拟敌对信号，验证自然选择号的指挥链路。'
      ],
      rules: {
        win: '清除全部 4 波敌对信号，最后一波清完即胜',
        lose: '舰体归零 / 僚舰全灭 / 超过 150 秒',
        tips: ['Tab 切目标、空格发射，X 与 Z 换武器', 'C 战术俯视可看清全场；G 集火、B 规避']
      }
    },
    {
      id: 2, name: '末日战役 · 水滴', en: 'DOOMSDAY / THE DROPLET',
      goal: '护送僚舰撤离 · 水滴不可击毁', win: 'escort', limit: 110,
      hold: 72, keepWings: 6, waves: CAMPAIGN_WAVES_2, spec: CAMPAIGN_SPEC,
      brief: [
        '舰队战术推演系统 · 任务 02',
        '一枚强相互作用力探测器出现在阵列前方，主炮对它没有任何意义。',
        '原著里两千艘战舰在两小时内被它逐一击穿。推演的胜利条件不是击毁，',
        '它的贯穿无视能量护盾；撑过窗口并保住至少 6 艘僚舰，才算推演成功。'
      ],
      rules: {
        win: '撑过 72 秒撤离窗口，且至少 6 艘僚舰存活（两个条件必须同时满足）',
        lose: '舰体归零 / 僚舰全灭 / 超过 110 秒；72 秒时僚舰不足 6 艘也会失败',
        tips: [
          '水滴不可击毁：锁定它等于浪费火力，优先清除智子探针与袭击舰',
          '水滴锁定同一艘僚舰反复贯穿，每次削 46% 完整度、约 3 次殉爆；F 环形护卫减伤并拖慢追猎',
          '降到前进一可拉开水滴追猎距离；B 规避有概率擦过；HUD 实时显示僚舰是否达标'
        ]
      }
    },
    {
      id: 3, name: '猜疑链 · 黑暗战役', en: 'DARK BATTLE / SUSPICION CHAIN',
      goal: '在猜疑链推演中生存 68 秒', win: 'survive', limit: 100,
      hold: 68, waves: CAMPAIGN_WAVES_3, spec: CAMPAIGN_SPEC,
      brief: [
        '舰队战术推演系统 · 任务 03',
        '逃亡舰队之间无法确认对方是否先开火，猜疑链在真空里没有尽头。',
        '敌舰外形与僚舰如出一辙，但雷达上敌红我青：青色实心菱形是僚舰，红色标记是敌舰。',
        '这是一场不追求歼灭的推演：活到计时结束，就算看穿了这条链。'
      ],
      rules: {
        win: '无需歼灭 —— 生存到 68 秒计时结束即胜',
        lose: '舰体归零 / 僚舰全灭 / 超过 100 秒',
        tips: [
          '雷达图例：青色实心菱形 = 僚舰，红色实心圆 = 敌舰，红色空心菱形 = 逃亡舰，黄环 = 当前锁定',
          '击毁敌舰只是减压手段，不计入胜利；B 规避与 F 松散巡航能降低受压',
          '逃亡舰只是外形像我方，颜色始终标红，看图例即可分辨，不会误判'
        ]
      }
    },
    {
      id: 4, name: '引力波广播 · 守卫', en: 'GRAVITATIONAL WAVE / GUARD',
      goal: '守卫广播阵列 62 秒后跃迁撤离', win: 'guard', limit: 110,
      hold: 62, waves: CAMPAIGN_WAVES_4, spec: CAMPAIGN_SPEC,
      brief: [
        '舰队战术推演系统 · 任务 04',
        '广播阵列充能期间，自然选择号必须钉在这片空间里。',
        '撑过 62 秒，阵列完成发射；随后按 4 让全舰队前进四跃迁脱离。',
        '推演到此结束。真实历史没有被改写，我们只是把指挥刀演练了一遍。'
      ],
      rules: {
        win: '守卫 62 秒至广播完成，随后按 4 前进四跃迁撤离（18 秒后系统自动脱离兜底）',
        lose: '舰体归零 / 僚舰全灭 / 超过 110 秒',
        tips: ['倒计时未结束时按 4 仍是「跃迁锁定」，不会判胜', '光粒探针数量多但血量薄，激光与鱼雷效率最高']
      }
    }
  ];
  /* 阵型战术加成：0 号「楔形前锋」是基准（全 1.0），保证默认手感与 v1.1.3 一致。
     F 键切到其余四套才生效，战列横队只加成能量炮主炮齐射。 */
  var CAMPAIGN_BONUS = [
    { tag: '基准 · 均衡', dmg: 1.00, soak: 1.00, wing: 1.00, evade: 0.00 },
    { tag: '环形护卫 · 拦截 −25% 伤害', dmg: 1.00, soak: 0.75, wing: 1.00, evade: 0.00 },
    { tag: '双列巡航 · 僚舰射速 +20%', dmg: 1.00, soak: 1.00, wing: 0.80, evade: 0.00 },
    { tag: '战列横队 · 主炮伤害 +25%', dmg: 1.25, soak: 1.00, wing: 1.00, evade: 0.00 },
    { tag: '松散巡航 · 规避 +25%', dmg: 1.00, soak: 1.00, wing: 1.00, evade: 0.25 }
  ];
  /* 程序化战斗音效：只在既有 WebAudio 图上临时挂振荡器 + 低通 + 包络，
     连到 audio.master（自动跟随静音与总音量），不改动空灵气流环境音的任何节点。 */
  var COMBAT_SFX = {
    energy:  { wave: 'sawtooth', f0: 460,  f1: 96,   d: 0.20, vol: 0.075, cut: 1800 },
    laser:   { wave: 'sine',     f0: 1500, f1: 3100, d: 0.11, vol: 0.055, cut: 6000 },
    torpedo: { wave: 'triangle', f0: 180,  f1: 44,   d: 0.36, vol: 0.090, cut: 900  },
    ion:     { wave: 'square',   f0: 680,  f1: 220,  d: 0.28, vol: 0.045, cut: 2200 },
    hit:     { wave: 'sawtooth', f0: 260,  f1: 70,   d: 0.13, vol: 0.050, cut: 1400 },
    explode: { wave: 'sawtooth', f0: 150,  f1: 38,   d: 0.42, vol: 0.100, cut: 700  },
    shield:  { wave: 'sine',     f0: 880,  f1: 1340, d: 0.19, vol: 0.050, cut: 5000 },
    wave:    { wave: 'square',   f0: 300,  f1: 520,  d: 0.17, vol: 0.045, cut: 1600 },
    win:     { wave: 'sine',     f0: 520,  f1: 790,  d: 0.52, vol: 0.075, cut: 4000 },
    lose:    { wave: 'sawtooth', f0: 230,  f1: 58,   d: 0.62, vol: 0.080, cut: 900  }
  };
  var combatSfxLog = { count: 0, last: '', kinds: {} };
  function combatSfx(kind) {
    combatSfxLog.count++;
    combatSfxLog.last = kind;
    combatSfxLog.kinds[kind] = (combatSfxLog.kinds[kind] || 0) + 1;
    if (!audio || state.muted || !audio.ctx) return;
    try {
      var S = COMBAT_SFX[kind] || COMBAT_SFX.hit;
      var ctx = audio.ctx, t0 = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = S.wave;
      o.frequency.setValueAtTime(S.f0, t0);
      o.frequency.exponentialRampToValueAtTime(S.f1, t0 + S.d);
      f.type = 'lowpass'; f.frequency.value = S.cut;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(S.vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + S.d);
      o.connect(f); f.connect(g); g.connect(audio.master);
      o.start(t0); o.stop(t0 + S.d + 0.02);
    } catch (e) {}
  }
  /* 存档：localStorage 不可用时静默降级为「本次会话内有效」，绝不抛异常中断战斗。 */
  function campaignLoad() {
    var p = { cleared: [], best: {}, storage: false };
    try {
      var raw = window.localStorage.getItem(CAMPAIGN_STORE);
      p.storage = true;
      if (raw) {
        var o = JSON.parse(raw);
        if (o && Object.prototype.toString.call(o.cleared) === '[object Array]') {
          p.cleared = o.cleared.filter(function (v) {
            return typeof v === 'number' && v >= 1 && v <= CAMPAIGN_MISSIONS.length;
          });
        }
        if (o && o.best && typeof o.best === 'object') p.best = o.best;
      }
    } catch (e) { p.storage = false; }
    return p;
  }
  function campaignSave() {
    if (!combat.progress) return;
    try {
      window.localStorage.setItem(CAMPAIGN_STORE, JSON.stringify({
        v: 1, cleared: combat.progress.cleared, best: combat.progress.best
      }));
      combat.progress.storage = true;
    } catch (e) { combat.progress.storage = false; }
  }
  function campaignUnlocked(n) {
    if (!combat.progress) combat.progress = campaignLoad();
    return n <= 1 || combat.progress.cleared.indexOf(n - 1) >= 0 ||
           combat.progress.cleared.indexOf(n) >= 0;
  }
  function campaignRecord(win) {
    if (!win || !combat.progress) return;
    var id = combat.mission;
    if (combat.progress.cleared.indexOf(id) < 0) combat.progress.cleared.push(id);
    var b = combat.progress.best[id];
    var rec = { time: Math.round(combat.time), kills: combat.kills, hull: Math.round(combat.hull) };
    if (!b || rec.time < b.time) combat.progress.best[id] = rec;
    campaignSave();
  }
  function campaignBonus() { return CAMPAIGN_BONUS[state.formation] || CAMPAIGN_BONUS[0]; }
  function pad2(n) { return (n < 10 ? '0' : '') + String(n); }
  function campaignCheckVictory() {
    var cfg = combat.missionCfg;
    if (!cfg) return false;
    if (cfg.win === 'eliminate')
      return combat.wave >= cfg.waves.length && combatAliveEnemies() === 0;
    if (cfg.win === 'escort')
      return combat.time >= cfg.hold && combatAliveWings() >= cfg.keepWings;
    if (cfg.win === 'survive') return combat.time >= cfg.hold;
    if (cfg.win === 'guard') return combat.warpDone === true;
    return false;
  }
  function campaignTick() {
    var cfg = combat.missionCfg;
    var st = document.getElementById('c-story');
    if (st && combat.storyUntil > 0 && combat.time >= combat.storyUntil) {
      combat.storyUntil = 0;
      st.classList.add('hidden');
    }
    if (cfg && cfg.win === 'guard' && !combat.warpReady && combat.time >= cfg.hold) {
      combat.warpReady = true;
      combatLog('广播阵列充能完毕 · 按 4 跃迁撤离');
      showToast('按 4 跃迁撤离', 'BROADCAST COMPLETE / WARP OUT', false);
      combatSfx('wave');
    }
    if (cfg && cfg.win === 'guard' && combat.warpReady && combat.time >= cfg.hold + 18) {
      combat.warpDone = true;
      combatLog('自动跃迁程序接管 · 舰队脱离');
    }
    /* v1.2.1：护送关原本在僚舰不足 6 艘后仍会一路干等到 110 秒超时才判负，
       玩家完全不知道为何没赢。这里在撤离窗口到点且已不达标时给出一次性明确提示。 */
    if (cfg && cfg.win === 'escort' && !combat.escortWarned &&
        combat.time >= cfg.hold && combatAliveWings() < cfg.keepWings) {
      combat.escortWarned = true;
      combatLog('撤离窗口已到 · 僚舰仅 ' + combatAliveWings() + '/' + cfg.keepWings +
                ' 艘 · 本局已无法达标，Esc 可重来');
      showToast('僚舰不足 · 撤离失败', 'ESCORT OBJECTIVE FAILED', false);
    }
  }
  function campaignObjective() {
    var cfg = combat.missionCfg;
    if (!cfg) return '';
    if (cfg.win === 'eliminate')
      return '信号 ' + combatAliveEnemies() + ' · 波 ' + combat.wave + '/' + cfg.waves.length;
    if (cfg.win === 'escort') {
      var n = combatAliveWings(), okW = n >= cfg.keepWings;
      return '撤离 ' + Math.max(0, Math.ceil(cfg.hold - combat.time)) + 's · 僚舰 ' +
             n + '/' + cfg.keepWings +
             (okW ? ' ✓ 达标' : ' ✗ 不足 · 已无法达成撤离条件');
    }
    if (cfg.win === 'survive')
      return '生存 ' + Math.max(0, Math.ceil(cfg.hold - combat.time)) + 's · 舰体 ' +
             Math.round(combat.hull) + '% · 无需歼灭';
    return combat.warpReady ? '按 4 跃迁撤离 ✓' :
      '守卫 ' + Math.max(0, Math.ceil(cfg.hold - combat.time)) + 's';
  }
  function campaignStoryShow(cfg) {
    var box = document.getElementById('c-story');
    if (!box) {
      // ?campaign=1&mission=N 深链会在 combatRefreshUI 之前走到这里，先确保 UI 已创建。
      combatEnsureUI();
      box = document.getElementById('c-story');
    }
    if (!box) return;
    var eb = document.getElementById('c-story-eyebrow');
    var ti = document.getElementById('c-story-title');
    var ln = document.getElementById('c-story-lines');
    if (eb) eb.textContent = 'TACTICAL SIMULATION / MISSION ' + pad2(cfg.id);
    if (ti) ti.textContent = cfg.name;
    if (ln) ln.innerHTML = cfg.brief.map(function (s) { return '<div>' + s + '</div>'; }).join('');
    var ru = document.getElementById('c-story-rules');
    if (ru && cfg.rules) {
      ru.innerHTML =
        '<div class="sr-row sr-win"><b>胜利</b><span>' + cfg.rules.win + '</span></div>' +
        '<div class="sr-row sr-lose"><b>失败</b><span>' + cfg.rules.lose + '</span></div>' +
        '<div class="st-tips">' + cfg.rules.tips.map(function (s) {
          return '<div>· ' + s + '</div>'; }).join('') + '</div>';
    }
    box.classList.remove('hidden');
    combat.storyUntil = combat.time + 6.0;
  }
  function campaignStorySkip() {
    combat.storyUntil = 0;
    var st = document.getElementById('c-story');
    if (st) st.classList.add('hidden');
    campaignHook();
  }
  function campaignSelectOpen() {
    var box = document.getElementById('campaign-select');
    if (!box) {
      box = document.createElement('div');
      box.id = 'campaign-select';
      document.body.appendChild(box);
    }
    if (!combat.progress) combat.progress = campaignLoad();
    var h = ['<div class="cs-card">',
      '<div class="cs-eyebrow">FLEET CAMPAIGN / 舰队战役 · 战术推演</div>',
      '<div class="cs-title">末日战役 · 四段推演</div>',
      '<div class="cs-sub">剧情采用「舰队战术推演系统」框架，不改写《三体》正史。通关自动解锁下一任务，进度保存在本机浏览器。</div>',
      '<div class="cs-grid">'];
    CAMPAIGN_MISSIONS.forEach(function (m) {
      var un = campaignUnlocked(m.id), cl = combat.progress.cleared.indexOf(m.id) >= 0;
      var b = combat.progress.best[m.id];
      h.push('<button type="button" class="cs-mission' + (un ? '' : ' locked') +
        (cl ? ' cleared' : '') + '" data-mission="' + m.id + '"' + (un ? '' : ' disabled') + '>' +
        '<span class="cs-no">' + pad2(m.id) + '</span>' +
        '<span class="cs-name">' + m.name + '</span>' +
        '<span class="cs-goal">' + m.goal + '</span>' +
        '<span class="cs-rules">胜：' + (m.rules ? m.rules.win : m.goal) + '</span>' +
        '<span class="cs-state">' + (cl ? '✓ 已通关' + (b ? ' · ' + b.time + ' s' : '') :
          un ? '可进入 →' : '未解锁 · 需先通过任务 ' + pad2(m.id - 1)) + '</span></button>');
    });
    h.push('</div><div class="cs-foot">');
    h.push('<button type="button" data-act="closeselect">返回</button>');
    h.push('<button type="button" data-act="resetprogress">清除进度</button>');
    h.push('<span>本机存档：' + (combat.progress.storage ? '可用' : '不可用（会话内有效）') + '</span>');
    h.push('</div></div>');
    box.innerHTML = h.join('');
    box.classList.remove('hidden');
  }
  function campaignSelectClose() {
    var box = document.getElementById('campaign-select');
    if (box) box.classList.add('hidden');
  }
  /* 屏幕边缘方位指示器：把战场空间里的敌舰投影到相机 NDC，
     落在视野外的按边缘方向贴边显示，带距离数字，锁定目标高亮。 */
  function campaignIndicators() {
    var box = document.getElementById('c-offscreen');
    if (!box || !combat.active || !combat.root) return;
    while (box.children.length < 6) {
      var d = document.createElement('div');
      d.className = 'c-oind';
      d.innerHTML = '<i></i><span></span>';
      box.appendChild(d);
    }
    var n = 0;
    for (var i = 0; i < combat.enemies.length && n < 6; i++) {
      var e = combat.enemies[i];
      if (!e.alive) continue;
      cTmpA.copy(e.pos);
      combat.root.localToWorld(cTmpA);
      cTmpA.project(camera);
      var behind = cTmpA.z >= 1;
      var ax = behind ? -cTmpA.x : cTmpA.x, ay = behind ? -cTmpA.y : cTmpA.y;
      var inside = !behind && Math.abs(ax) < 0.90 && Math.abs(ay) < 0.86;
      var node = box.children[n++];
      if (inside) { node.style.display = 'none'; continue; }
      var sc = Math.max(Math.abs(ax) / 0.88, Math.abs(ay) / 0.84, 0.0001);
      var nx = ax / sc, ny = ay / sc;
      node.style.display = 'block';
      node.style.left = ((nx * 0.5 + 0.5) * 100).toFixed(1) + '%';
      node.style.top = ((-ny * 0.5 + 0.5) * 100).toFixed(1) + '%';
      node.style.transform = 'translate(-50%,-50%) rotate(' +
        (Math.atan2(-ny, nx) * 180 / Math.PI + 90).toFixed(0) + 'deg)';
      node.style.opacity = (e === combat.target) ? '1' : '0.70';
      var sp = node.querySelector('span');
      if (sp) sp.textContent = (e.pos.length() / 10).toFixed(0);
    }
    for (; n < 6; n++) box.children[n].style.display = 'none';
    combat.indicators = n;
  }
  /* 雷达点选：把点击位置换回 180×180 canvas 坐标，找最近的敌舰红点。 */
  function campaignRadarPick(cx0, cy0) {
    if (!combat.active || !el.radar) return false;
    var r = el.radar.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var px = (cx0 - r.left) / r.width * 180 - 90;
    var py = (cy0 - r.top) / r.height * 180 - 90;
    var best = null, bd = 17;
    for (var i = 0; i < combat.enemies.length; i++) {
      var e = combat.enemies[i];
      if (!e.alive) continue;
      var ex = clamp(e.pos.x * 0.22, -78, 78), ey = clamp(e.pos.z * 0.22, -78, 78);
      var d = Math.sqrt((ex - px) * (ex - px) + (ey - py) * (ey - py));
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      combat.target = best;
      combatLog('雷达指定目标 · ' + best.name + ' #' + best.id);
      combatSfx('wave');
      combatRefreshUI();
      combatHook();
    }
    return true;
  }
  window.__NS_CAMPAIGN__ = {
    missions: CAMPAIGN_MISSIONS.map(function (m) {
      return { id: m.id, name: m.name, win: m.win, limit: m.limit, hold: m.hold || 0,
               waves: m.waves.length, brief: m.brief.length, goal: m.goal };
    }),
    mission: 0, unlocked: 1, cleared: [], storage: false, story: false,
    bonus: '基准 · 均衡', formation: 0, warpReady: false, warpDone: false,
    objective: '', phase: 'idle', selectsOpen: false, indicators: 0, missionCfg: null,
    rules: null, rulesOpen: false, radarLegend: false,
    start: function (n) { combatStart(n); campaignHook(); return window.__NS_CAMPAIGN__; },
    selectOpen: function () { campaignSelectOpen(); campaignHook(); return window.__NS_CAMPAIGN__; },
    selectClose: function () { campaignSelectClose(); campaignHook(); return window.__NS_CAMPAIGN__; },
    skipStory: function () { campaignStorySkip(); return window.__NS_CAMPAIGN__; },
    resetProgress: function () {
      combat.progress = { cleared: [], best: {}, storage: false };
      campaignSave(); campaignHook();
      return window.__NS_CAMPAIGN__;
    },
    radarPick: function (x, y) { return campaignRadarPick(x, y); },
    snapshot: function () { campaignHook(); return window.__NS_CAMPAIGN__; }
  };
  window.__NS_SFX__ = { log: combatSfxLog, kinds: Object.keys(COMBAT_SFX) };
  function campaignHook() {
    var H = window.__NS_CAMPAIGN__;
    if (!H) return;
    H.mission = combat.mission;
    H.missionCfg = combat.missionCfg ? combat.missionCfg.win : null;
    H.unlocked = CAMPAIGN_MISSIONS.filter(function (m) { return campaignUnlocked(m.id); }).length;
    H.cleared = combat.progress ? combat.progress.cleared.slice() : [];
    H.storage = !!(combat.progress && combat.progress.storage);
    H.story = combat.storyUntil > 0;
    H.bonus = campaignBonus().tag;
    H.formation = state.formation;
    H.warpReady = combat.warpReady;
    H.warpDone = combat.warpDone;
    H.objective = combat.missionCfg ? campaignObjective() : '';
    H.phase = combat.phase;
    H.indicators = combat.indicators;
    H.rules = combat.missionCfg ? combat.missionCfg.rules : null;
    H.rulesOpen = combat.rulesOpen;
    H.radarLegend = radarLegendDone;
    var box = document.getElementById('campaign-select');
    H.selectsOpen = !!box && !box.classList.contains('hidden');
  }
  /* 新敌人几何 / 材质：全部程序化，零新增资源文件。 */
  var cGeoDroplet = new THREE.SphereGeometry(4.6, 22, 16);
  var cMatDroplet = new THREE.MeshStandardMaterial({
    color: 0xe8f9ff, emissive: 0x5f9fc0, emissiveIntensity: 0.4,
    metalness: 1.0, roughness: 0.02
  });
  var cMatMirror = new THREE.MeshStandardMaterial({
    color: 0x9fc4d8, emissive: 0x3a6fa8, emissiveIntensity: 1.0,
    metalness: 0.8, roughness: 0.3
  });

  var COMBAT_UI_HTML = [
    '<div id="c-mission" class="c-card">',
    '  <div class="c-eyebrow" id="c-mission-eyebrow">MISSION 01 · TACTICAL SIMULATION</div>',
    '  <div class="c-title" id="c-mission-title">接触 · 智子盲区</div>',
    '  <div class="c-row"><span>战役目标</span><b id="c-goal">清除全部敌对信号</b></div>',
    '  <div class="c-row"><span>剩余敌舰</span><b id="c-remain">0</b></div>',
    '  <div class="c-row"><span>推演计时</span><b id="c-time">0:00</b></div>',
    '  <div class="c-row"><span>接战距离</span><b id="c-standoff">16.5 千 km</b></div>',
    '  <div class="c-row"><span>任务进度</span><b id="c-progress">01 / 04</b></div>',
    '  <div class="c-sub" id="c-objective">清除全部敌对信号</div>',
    '  <div class="c-rules" id="c-rules"></div>',
    '  <button type="button" class="c-rules-btn" data-act="rules" id="c-rules-btn">▾ 展开打法提示</button>',
    '</div>',
    '<div id="c-target" class="c-card">',
    '  <div class="c-eyebrow">TARGET LOCK / 锁定目标</div>',
    '  <div class="c-title" id="c-tname">未锁定</div>',
    '  <div class="c-bar"><i id="c-tbar"></i></div>',
    '  <div class="c-sub" id="c-tdist">按 Tab 选择目标</div>',
    '</div>',
    '<div id="c-status" class="c-card">',
    '  <div class="c-eyebrow">NS-01 / FLEET STATUS</div>',
    '  <div class="c-row"><span>舰体完整度</span><b id="c-hull">100%</b></div>',
    '  <div class="c-row"><span>护盾</span><b id="c-shield">100%</b></div>',
    '  <div class="c-bar"><i id="c-shieldbar"></i></div>',
    '  <div class="c-sub" id="c-shieldnote">能量护盾 · 在线</div>',
    '  <div class="c-row"><span>战术阵型</span><b id="c-formation">楔形前锋</b></div>',
    '  <div class="c-sub" id="c-formation-note">F 切换 · 基准 · 均衡</div>',
    '  <div class="c-row"><span>舰队指令</span><b id="c-order">集火 FOCUS</b></div>',
    '  <div class="c-bar"><i id="c-salvobar"></i></div>',
    '  <div class="c-sub" id="c-salvo">主炮齐射 · 就绪</div>',
    '</div>',
    '<div id="c-log" class="c-card">',
    '  <div class="c-eyebrow">COMBAT LOG / 战报</div>',
    '  <div id="c-logbody"></div>',
    '</div>',
    '<div id="c-weapons">',
    '  <div class="w-eyebrow">WEAPON BANK / X · Z 切换 · 空格发射</div>',
    '  <div class="w-row">',
    '    <button type="button" class="wpn on" data-weapon="0"><span class="w-key">◆</span><span class="w-name">能量炮</span><span class="w-state">就绪</span><i class="w-cd"></i></button>',
    '    <button type="button" class="wpn" data-weapon="1"><span class="w-key">◆</span><span class="w-name">激光</span><span class="w-state">就绪</span><i class="w-cd"></i></button>',
    '    <button type="button" class="wpn" data-weapon="2"><span class="w-key">◆</span><span class="w-name">鱼雷</span><span class="w-state">就绪</span><i class="w-cd"></i></button>',
    '    <button type="button" class="wpn" data-weapon="3"><span class="w-key">◆</span><span class="w-name">离子炮</span><span class="w-state">就绪</span><i class="w-cd"></i></button>',
    '  </div>',
    '</div>',
    '<div id="c-bar">',
    '  <button type="button" data-act="target">Tab 切目标</button>',
    '  <button type="button" data-act="salvo">空格 发射</button>',
    '  <button type="button" data-act="tactical">C 战术俯视</button>',
    '  <button type="button" data-act="focus">G 集火</button>',
    '  <button type="button" data-act="evade">B 规避</button>',
    '  <button type="button" data-act="exit">Esc 退出</button>',
    '</div>',
    '<div id="c-result" class="c-card hidden">',
    '  <div class="c-eyebrow">SIMULATION RESULT / 推演结算</div>',
    '  <div class="c-big" id="c-result-title">推演完成</div>',
    '  <div class="c-line" id="c-result-body"></div>',
    '  <div class="c-sub" id="c-result-hint">Enter 再来一次 · Esc 返回自由航行</div>',
    '  <div class="c-result-btns">',
    '    <button type="button" data-act="next" id="c-btn-next">下一关 →</button>',
    '    <button type="button" data-act="select">任务列表</button>',
    '    <button type="button" data-act="retry">再来一次</button>',
    '  </div>',
    '</div>',
    '<div id="c-story" class="hidden">',
    '  <div class="st-eyebrow" id="c-story-eyebrow"></div>',
    '  <div class="st-title" id="c-story-title"></div>',
    '  <div class="st-lines" id="c-story-lines"></div>',
    '  <div class="st-rules" id="c-story-rules"></div>',
    '  <button type="button" data-act="skipstory">跳过字幕 →</button>',
    '</div>',
    '<div id="c-offscreen"></div>',
    '<div id="c-hit"></div>'
  ].join('\n');

  var cTmpA = new THREE.Vector3(), cTmpB = new THREE.Vector3();
  var cTmpC = new THREE.Vector3(), cTmpD = new THREE.Vector3();
  var cGeoProbe = new THREE.OctahedronGeometry(3.4, 0);
  var cGeoRaider = new THREE.ConeGeometry(3.6, 13, 5);
  var cMatProbe = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2ba7d8, emissiveIntensity: 1.8, metalness: 0.6, roughness: 0.25 });
  var cMatRaider = new THREE.MeshStandardMaterial({ color: 0x8a3038, emissive: 0xa02a2a, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.35 });
  var cTurretMat = new THREE.MeshStandardMaterial({ color: 0x9db6c6, metalness: 0.85, roughness: 0.3, emissive: 0x0a2b3c, emissiveIntensity: 0.5 });
  var cGeoBase = new THREE.CylinderGeometry(1.7, 2.2, 1.6, 8);
  var cGeoBarrel = new THREE.CylinderGeometry(0.32, 0.44, 5.4, 6);
  var cShotGeo = new THREE.SphereGeometry(0.95, 6, 5);
  var cBurstGeo = new THREE.SphereGeometry(1, 8, 6);
  var cMatShot = new THREE.MeshBasicMaterial({ color: 0xa9f4ff });
  var cMatEnemyShot = new THREE.MeshBasicMaterial({ color: 0xff6b6b });
  var cMatBurst = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  /* v1.1.3 新增视觉资源：全部程序化生成，零新增文件。 */
  var cGeoTorpedo = new THREE.ConeGeometry(1.15, 4.6, 7);
  var cMatTorpedo = new THREE.MeshBasicMaterial({ color: 0xffb066 });
  var cGeoIon = new THREE.IcosahedronGeometry(1.7, 0);
  var cMatIon = new THREE.MeshBasicMaterial({ color: 0xc09cff });
  var cBeamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  var cBeamUp = new THREE.Vector3(0, 1, 0);
  /* v1.2.1 护盾几何：单位超椭球（p=8）。缩放后的半轴只需 AABB 半尺寸的 1.18 倍，
     8 个角点即满足 sum(|x/a|^8) = 3/1.18^8 < 1，整艘舰被完整罩住；
     原来的球壳椭球是 q=1.637 > 1，八个角全露在外面（只看见舰体中部一圈光）。
     顶点 / 解析法线均程序化生成，半轴坐标禁止硬编码。 */
  var SHIELD_P = 8;
  var cShieldGeo = (function () {
    var g = new THREE.SphereGeometry(1, 56, 36);
    var p = g.attributes.position, n = g.attributes.normal;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      var k = Math.pow(Math.pow(Math.abs(x), SHIELD_P) +
                       Math.pow(Math.abs(y), SHIELD_P) +
                       Math.pow(Math.abs(z), SHIELD_P), 1 / SHIELD_P);
      p.setXYZ(i, x / k, y / k, z / k);
      var gx = Math.sign(x) * Math.pow(Math.abs(x), SHIELD_P - 1);
      var gy = Math.sign(y) * Math.pow(Math.abs(y), SHIELD_P - 1);
      var gz = Math.sign(z) * Math.pow(Math.abs(z), SHIELD_P - 1);
      var L = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      n.setXYZ(i, gx / L, gy / L, gz / L);
    }
    p.needsUpdate = true; n.needsUpdate = true;
    g.computeBoundingSphere();
    return g;
  })();
  var cShieldHit = new THREE.Vector3();
  /* 能量护盾：fresnel 边缘辉光 + 程序化六边网格 + 命中涟漪 / 过载红闪。
     挂在 turretRoot 下跟随舰体，不进 combatHullBox()（它只遍历 ship）。 */
  var cShieldMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uPower: { value: 1 }, uHit: { value: 0 },
      uOver: { value: 0 }, uReveal: { value: 0 },
      uHitDir: { value: new THREE.Vector3(0, 0, 1) },
      uColor: { value: new THREE.Color(0x4fd8ff) }
    },
    vertexShader: [
      'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
      'void main(){',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vV = mv.xyz; vN = normalize(normalMatrix * normal); vP = position;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime; uniform float uPower; uniform float uHit; uniform float uOver;',
      'uniform float uReveal; uniform vec3 uHitDir;',
      'uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vP;',
      'void main(){',
      '  vec3 V = normalize(-vV);',
      '  float f = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);',
      '  vec3 p = normalize(vP);',
      '  float g = sin(p.x*16.0+uTime*0.7)*sin(p.y*16.0-uTime*0.5)*sin(p.z*16.0+uTime*0.6);',
      '  float grid = smoothstep(0.88, 1.0, abs(g));',
      '  float hd = max(dot(p, normalize(uHitDir)), 0.0);',
      '  float spot = pow(hd, 4.0);',
      '  float ripple = uHit * (0.5 + 0.5*sin(p.y*26.0 - uTime*11.0));',
      '  float rev = clamp(uReveal, 0.0, 1.0);',
      // GLSL pow(x,2.0) 在 x<0 时未定义，必须用乘积，否则整片 alpha 可能变 NaN。
      '  float rq = (1.0 - rev)*3.0 - (1.0 - hd)*5.0;',
      '  float ring = exp(-rq*rq*2.0);',
      '  float body = 0.20 + f*0.60 + grid*0.34;',
      /* 平时 rev=0 → alpha=0（不可见）；受击时命中方向一片明显亮起 + 扩散涟漪，
         其余区域保留 16% 的淡轮廓，让「护盾包住整舰」的形状可辨。 */
      '  float a = (body*(0.16 + 0.84*spot) + ripple*0.45*spot + ring*0.45*spot)',
      '            * (0.25 + 0.75*uPower) * rev',
      '            + uOver*0.06*(0.5 + 0.5*sin(uTime*14.0))*rev;',
      '  vec3 col = mix(uColor, vec3(1.0,0.32,0.30), clamp(uHit*0.55 + uOver*0.5, 0.0, 1.0));',
      '  gl_FragColor = vec4(col, clamp(a, 0.0, 0.82));',
      '}'
    ].join('\n'),
    transparent: true, blending: THREE.AdditiveBlending,
    /* 不做深度测试且双面渲染：来袭方向可能在镜头背面（敌舰在舰首 -Z、相机在舰尾 +Z），
       只画朝相机的前壳会让「受击侧」完全看不见；双面叠加也更像能量场。 */
    depthWrite: false, depthTest: false, side: THREE.DoubleSide
  });
  var combatUIAccum = 0;

  /* 炮塔硬点：从真实舰体几何包围盒运行时导出，排除尾焰 / 光核等特效网格。
     与 detectNozzles() 同一思路——模型换了，炮塔自动跟着走，不硬编码坐标。 */
  function combatHullBox() {
    var box = new THREE.Box3();
    var skip = [];
    ['flames', 'outers', 'glows'].forEach(function (k) {
      var arr = flagship[k] || [];
      for (var i = 0; i < arr.length; i++) skip.push(arr[i]);
    });
    if (flagship.trail) skip.push(flagship.trail);
    var src = ship;
    src.updateWorldMatrix(true, true);
    // 炮塔挂在 turretRoot（跟随舰体）下，硬点必须是舰体局部坐标；
    // 逐个网格把世界矩阵左乘舰体世界矩阵的逆，避免舰体姿态被算两次。
    var toHull = src.matrixWorld.clone().invert();
    var m = new THREE.Matrix4();
    src.traverse(function (o) {
      if (!o.isMesh || skip.indexOf(o) >= 0) return;
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (o.geometry.boundingBox) {
        m.multiplyMatrices(toHull, o.matrixWorld);
        box.union(o.geometry.boundingBox.clone().applyMatrix4(m));
      }
    });
    if (box.isEmpty()) box.setFromObject(src);
    return box;
  }
  function combatBuildTurrets() {
    var box = combatHullBox();
    var c = box.getCenter(new THREE.Vector3());
    var w = box.max.x - box.min.x, h = box.max.y - box.min.y, d = box.max.z - box.min.z;
    var pts = [
      [-w * 0.20, c.y + h * 0.42, c.z - d * 0.10],
      [ w * 0.20, c.y + h * 0.42, c.z - d * 0.10],
      [-w * 0.40, c.y,            c.z - d * 0.02],
      [ w * 0.40, c.y,            c.z - d * 0.02],
      [-w * 0.20, c.y - h * 0.42, c.z + d * 0.10],
      [ w * 0.20, c.y - h * 0.42, c.z + d * 0.10]
    ];
    pts.forEach(function (p) {
      var g = new THREE.Group();
      g.position.set(p[0], p[1], p[2]);
      var base = new THREE.Mesh(cGeoBase, cTurretMat);
      base.rotation.x = Math.PI / 2;
      g.add(base);
      var b1 = new THREE.Mesh(cGeoBarrel, cTurretMat);
      b1.position.set(-0.9, 0, 3.2); b1.rotation.x = Math.PI / 2; g.add(b1);
      var b2 = new THREE.Mesh(cGeoBarrel, cTurretMat);
      b2.position.set(0.9, 0, 3.2); b2.rotation.x = Math.PI / 2; g.add(b2);
      combat.turretRoot.add(g);
      combat.turrets.push({ group: g });
    });
    window.__NS_TURRETS__ = { count: combat.turrets.length, source: 'hull-bounds', box: [w, h, d].map(function (v) { return +v.toFixed(2); }) };
    /* 护盾穹顶尺寸取自同一份运行时舰体包围盒，模型换了自动跟着走，禁硬编码。 */
    var dome = new THREE.Mesh(cShieldGeo, cShieldMat);
    dome.name = 'flagship-energy-shield';
    /* p=8 时罩住 AABB 八角所需 K >= 3^(1/8)=1.147，取 1.18 留余量。 */
    var K = 1.18;
    var halfAx = [w * 0.5 * K, h * 0.5 * K, d * 0.5 * K];
    dome.scale.set(halfAx[0], halfAx[1], halfAx[2]);
    dome.position.set(c.x, c.y, c.z);
    /* 用真实包围盒 8 角复算超椭球方程，覆盖率进诊断钩子，避免「看着包住了」的假绿。 */
    var xs = [box.min.x - c.x, box.max.x - c.x];
    var ys = [box.min.y - c.y, box.max.y - c.y];
    var zs = [box.min.z - c.z, box.max.z - c.z];
    var qMax = 0, qIn = 0;
    for (var qx = 0; qx < 2; qx++) for (var qy = 0; qy < 2; qy++) for (var qz = 0; qz < 2; qz++) {
      var qv = Math.pow(Math.abs(xs[qx] / halfAx[0]), SHIELD_P) +
               Math.pow(Math.abs(ys[qy] / halfAx[1]), SHIELD_P) +
               Math.pow(Math.abs(zs[qz] / halfAx[2]), SHIELD_P);
      if (qv > qMax) qMax = qv;
      if (qv <= 1) qIn++;
    }
    combat.turretRoot.add(dome);
    combat.shieldMesh = dome;
    combat.shieldMat = cShieldMat;
    combat.shieldHalfAx = halfAx;
    combat.shieldCover = { inside: qIn, total: 8, qMax: +qMax.toFixed(4) };
  }
  function combatInitPools() {
    for (var i = 0; i < 72; i++) {
      var m = new THREE.Mesh(cShotGeo, cMatShot);
      m.visible = false; combat.root.add(m);
      combat.shots.push({ mesh: m, active: false, vel: new THREE.Vector3(), side: 'ally', dmg: 0, target: null, life: 0 });
    }
    for (var j = 0; j < 40; j++) {
      var b = new THREE.Mesh(cBurstGeo, cMatBurst.clone());
      b.visible = false; combat.root.add(b);
      combat.bursts.push({ mesh: b, active: false, life: 0, max: 0.45, size: 1 });
    }
    for (var q = 0; q < 14; q++) {
      var bm = new THREE.Mesh(cBeamGeo, new THREE.MeshBasicMaterial({
        color: 0x9dffd8, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      bm.visible = false; combat.root.add(bm);
      combat.beams.push({ mesh: bm, active: false, life: 0, max: 0.24 });
    }
  }
  function combatTakeShot(side, from, to, speed, dmg, target, opts) {
    var s = null;
    for (var i = 0; i < combat.shots.length; i++) if (!combat.shots[i].active) { s = combat.shots[i]; break; }
    if (!s) return;
    var o = opts || {};
    cTmpD.copy(to).sub(from);
    if (cTmpD.lengthSq() < 0.01) cTmpD.set(0, 0, -1);
    s.active = true; s.side = side; s.dmg = dmg; s.target = target || null;
    s.life = o.life || 4;
    s.kind = o.kind || 'bolt';
    s.aoe = o.aoe || 0;
    s.mesh.visible = true;
    s.mesh.geometry = o.geo || cShotGeo;
    s.mesh.material = o.mat || (side === 'ally' ? cMatShot : cMatEnemyShot);
    s.mesh.scale.setScalar(o.scale || 1);
    s.mesh.position.copy(from);
    s.vel.copy(cTmpD).normalize().multiplyScalar(speed);
  }
  function combatBurst(pos, color, size, life) {
    var b = null;
    for (var i = 0; i < combat.bursts.length; i++) if (!combat.bursts[i].active) { b = combat.bursts[i]; break; }
    if (!b) return;
    b.active = true; b.life = life || 0.45; b.max = life || 0.45; b.size = size || 1;
    b.mesh.visible = true; b.mesh.position.copy(pos);
    b.mesh.material.color.setHex(color);
    b.mesh.material.opacity = 0.9;
    b.mesh.scale.setScalar(size * 1.4);
  }
  function combatBursts(dt) {
    for (var i = 0; i < combat.bursts.length; i++) {
      var b = combat.bursts[i];
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; b.mesh.visible = false; continue; }
      var k = b.life / b.max;
      b.mesh.material.opacity = 0.9 * k;
      b.mesh.scale.setScalar(b.size * (1.4 + (1 - k) * 3.2));
    }
  }
  /* 炮口坐标：turretRoot 跟随舰体，弹丸活在锚定的战场空间，必须世界->战场换算。 */
  function combatMuzzle(i, out) {
    combat.turrets[i].group.getWorldPosition(out);
    combat.root.worldToLocal(out);
    return out;
  }
  function combatBeam(from, to, color, width) {
    var b = null;
    for (var i = 0; i < combat.beams.length; i++) if (!combat.beams[i].active) { b = combat.beams[i]; break; }
    if (!b) return;
    cTmpD.copy(to).sub(from);
    var len = cTmpD.length();
    if (len < 0.01) return;
    b.active = true; b.life = b.max;
    b.mesh.visible = true;
    b.mesh.position.copy(from).addScaledVector(cTmpD, 0.5);
    b.mesh.quaternion.setFromUnitVectors(cBeamUp, cTmpD.multiplyScalar(1 / len));
    b.mesh.scale.set(width, len, width);
    b.mesh.material.color.setHex(color);
    b.mesh.material.opacity = 0.9;
  }
  function combatBeams(dt) {
    for (var i = 0; i < combat.beams.length; i++) {
      var b = combat.beams[i];
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; b.mesh.visible = false; continue; }
      b.mesh.material.opacity = 0.9 * (b.life / b.max);
    }
  }
  /* 能量炮：与 v1.1.2 完全一致（6 座炮塔 / 分散多目标 / 260 速 / 2.4s 冷却）。 */
  function combatFireEnergy(alive, dmg) {
    for (var i = 0; i < combat.turrets.length; i++) {
      var tgt = alive[i % alive.length];
      // 炮塔贴舰体（turretRoot），弹丸在锚定的战场空间（root）里飞：
      // 取炮口世界坐标再转回战场局部，转向时弹道才与画面里的敌舰对齐。
      combat.turrets[i].group.getWorldPosition(cTmpA);
      combat.root.worldToLocal(cTmpA);
      cTmpB.copy(tgt.pos);
      combatTakeShot('ally', cTmpA, cTmpB, 260, dmg, tgt);
      combatBurst(cTmpA, 0xa9f4ff, 1.0);
    }
    combatLog('主炮齐射 · ' + combat.turrets.length + ' 座 → ' + alive.length + ' 个目标');
    beep(240, 0.16, 0.08);
  }
  /* 激光：hitscan，无飞行时间，6 道光束瞬时汇聚到锁定目标。 */
  function combatFireLaser(e) {
    var spec = COMBAT_WEAPONS[1], total = 0;
    for (var i = 0; i < combat.turrets.length; i++) {
      combatMuzzle(i, cTmpA);
      cTmpB.copy(e.pos);
      combatBeam(cTmpA, cTmpB, 0x8dffd0, 0.42);
      total += spec.dmg;
    }
    cTmpC.copy(e.pos);
    combatBurst(cTmpC, 0x8dffd0, 2.2);
    combatDamageEnemy(e, total);
    combatLog('激光阵列 · 瞬时命中 ' + e.name + ' −' + Math.round(total));
    beep(980, 0.09, 0.055);
  }
  /* 鱼雷：2 具侧舷发射管，慢速重弹，命中后对 34 单位内敌舰溅射半伤。 */
  function combatFireTorpedo(e) {
    var spec = COMBAT_WEAPONS[2], tubes = [2, 3];
    for (var i = 0; i < tubes.length; i++) {
      combatMuzzle(tubes[i], cTmpA);
      cTmpB.copy(e.pos);
      combatTakeShot('ally', cTmpA, cTmpB, 95, spec.dmg, e,
                     { kind: 'torpedo', geo: cGeoTorpedo, mat: cMatTorpedo,
                       aoe: 34, life: 7, scale: 1.4 });
      combatBurst(cTmpA, 0xffb066, 1.6);
    }
    combatLog('鱼雷发射 · 2 枚 → ' + e.name + ' #' + e.id);
    beep(160, 0.22, 0.075);
  }
  /* 离子炮：紫色干扰弹，命中让目标武器冷却翻倍、机动减半 4 秒。 */
  function combatFireIon(e) {
    var spec = COMBAT_WEAPONS[3];
    for (var i = 0; i < combat.turrets.length; i++) {
      combatMuzzle(i, cTmpA);
      cTmpB.copy(e.pos);
      combatTakeShot('ally', cTmpA, cTmpB, 175, spec.dmg, e,
                     { kind: 'ion', geo: cGeoIon, mat: cMatIon, life: 5, scale: 1.2 });
      combatBurst(cTmpA, 0xc09cff, 1.0);
    }
    combatLog('离子炮齐射 · 干扰弹 → ' + e.name + ' #' + e.id);
    beep(420, 0.14, 0.06);
  }
  function combatSelectWeapon(i) {
    if (!combat.active) return false;
    var n = ((i % COMBAT_WEAPONS.length) + COMBAT_WEAPONS.length) % COMBAT_WEAPONS.length;
    combat.weapon = n;
    combat.salvoCd = combat.weaponCd[n];
    var w = COMBAT_WEAPONS[n];
    combatLog('武器切换 · ' + w.name + ' / ' + w.en);
    showToast(w.name, w.en, false);
    beep(560 + n * 90, 0.08, 0.045);
    combatRefreshUI();
    combatHook();
    return true;
  }
  /* 旗舰能量护盾：吸收 → 脱战 3s 回充 → 归零 4s 过载锁定。 */
  function combatShieldAbsorb(dmg, hitMesh) {
    var absorbed = Math.min(combat.shield, dmg);
    combat.shield -= absorbed;
    var leak = (dmg - absorbed) * 0.8;
    if (leak > 0) combat.hull = Math.max(0, combat.hull - leak);
    combat.shieldIdle = 0;
    combat.shieldHit = 1;
    combat.shieldReveal = 1;
    if (hitMesh && combat.shieldMesh) {
      hitMesh.getWorldPosition(cShieldHit);
      combat.shieldMesh.updateWorldMatrix(true, false);
      combat.shieldMesh.worldToLocal(cShieldHit);
      if (cShieldHit.lengthSq() > 1e-8) combat.shieldDir.copy(cShieldHit).normalize();
    }
    combat.hitFlash = 0.6;
    if (combat.shield <= 0 && !combat.shieldOver) {
      combat.shieldOver = true;
      combat.shieldLock = 4.0;
      combatLog('护盾过载 · 冷却 4 s');
    }
    combatLog('旗舰护盾 −' + Math.round(absorbed));
    combatSfx('shield');
    if (combat.hull <= 0) combatFinish(false);
  }
  function combatShield(dt) {
    combat.shieldIdle += dt;
    combat.shieldHit = Math.max(0, combat.shieldHit - dt * 2.0);
    combat.shieldReveal = Math.max(0, combat.shieldReveal - dt * 1.35);
    if (combat.shieldLock > 0) {
      combat.shieldLock = Math.max(0, combat.shieldLock - dt);
      combat.shieldState = 'overload';
      if (combat.shieldLock === 0) {
        combat.shieldOver = false;
        combatLog('护盾重新上线 · 开始充能');
      }
      return;
    }
    if (combat.shield < combat.shieldMax && combat.shieldIdle >= 3.0) {
      combat.shield = Math.min(combat.shieldMax, combat.shield + 5.5 * dt);
      combat.shieldState = 'regen';
    } else {
      combat.shieldState = combat.shield <= 0 ? 'offline' : 'online';
    }
  }
  function combatSpawn(kind, idx, total) {
    var spec = combat.missionCfg.spec[kind] || COMBAT_SPEC[kind] || COMBAT_SPEC.probe;
    var geo = kind === 'probe' ? cGeoProbe : kind === 'droplet' ? cGeoDroplet : cGeoRaider;
    var base = kind === 'probe' ? cMatProbe : kind === 'droplet' ? cMatDroplet
             : kind === 'mirror' ? cMatMirror : cMatRaider;
    var mesh = new THREE.Mesh(geo, base.clone());
    var ang = (idx / Math.max(total, 1)) * PI2 + Math.random() * 0.6;
    var pos = new THREE.Vector3(
      Math.cos(ang) * (70 + Math.random() * 90),
      (Math.random() - 0.5) * 70,
      -240 - Math.random() * 150
    );
    mesh.position.copy(pos);
    combat.root.add(mesh);
    var e = {
      id: combat.nextId++, kind: kind, name: spec.name, hp: spec.hp, maxHp: spec.hp,
      pos: pos, mesh: mesh, alive: true, cd: 0.6 + Math.random() * 1.2,
      seed: Math.random() * 10, orbit: ang, ion: 0, spec: spec,
      invulnerable: !!spec.invulnerable,
      baseEmissive: kind === 'probe' ? 0x2ba7d8 : kind === 'droplet' ? 0x5f9fc0
                  : kind === 'mirror' ? 0x3a6fa8 : 0xa02a2a
    };
    if (kind === 'droplet') {
      e.ram = {
        phase: 'lurk', target: null, t: 0, cd: DROPLET_RAM.cd * 1.4,
        from: pos.clone(), aim: new THREE.Vector3(), through: new THREE.Vector3(),
        hitDone: false, trailT: 0, cycles: 0, last: ''
      };
    }
    combat.enemies.push(e);
    return e;
  }
  function combatAliveEnemies() {
    var n = 0;
    for (var i = 0; i < combat.enemies.length; i++) if (combat.enemies[i].alive) n++;
    return n;
  }
  function combatAliveWings() {
    var n = 0;
    for (var i = 0; i < wings.length; i++) if (wings[i].combatHp > 0) n++;
    return n;
  }
  function combatPickTarget() {
    var best = null, bestScore = -1;
    for (var i = 0; i < combat.enemies.length; i++) {
      var e = combat.enemies[i];
      if (!e.alive) continue;
      var s = 1000 / (e.pos.length() + 60) + (e.maxHp - e.hp) * 0.01;
      if (s > bestScore) { bestScore = s; best = e; }
    }
    return best;
  }
  function combatCycleTarget() {
    var alive = [];
    for (var i = 0; i < combat.enemies.length; i++) if (combat.enemies[i].alive) alive.push(combat.enemies[i]);
    if (!alive.length) { combat.target = null; return; }
    var idx = alive.indexOf(combat.target);
    combat.target = alive[(idx + 1) % alive.length];
    combatLog('锁定 ' + combat.target.name + ' #' + combat.target.id);
    beep(620, 0.08, 0.05);
  }
  function combatDamageEnemy(e, dmg) {
    if (!e || !e.alive) return;
    if (e.invulnerable) {
      combatBurst(e.pos, 0xdff6ff, 2.0);
      combatLog('强相互作用力外壳 · 攻击被完全反射');
      combatSfx('shield');
      return;
    }
    e.hp -= dmg;
    combatSfx('hit');
    combatBurst(e.pos, 0xa9f4ff, 1.4);
    if (e.hp <= 0) {
      e.alive = false; e.mesh.visible = false;
      combat.kills++;
      combatBurst(e.pos, 0xffd9a0, 4.4);
      combatLog('击毁 ' + e.name + ' · 累计 ' + combat.kills);
      if (combat.target === e) combat.target = combatPickTarget();
      beep(760, 0.09, 0.05);
      combatSfx('explode');
    }
  }
  function combatDamageFleet(dmg, hitMesh) {
    dmg *= campaignBonus().soak;
    if (combat.order === 'evade' && Math.random() < 0.40 + campaignBonus().evade) {
      combatLog('规避成功 · 敌弹未命中');
      return;
    }
    var alive = [];
    for (var i = 0; i < wings.length; i++) if (wings[i].combatHp > 0) alive.push(wings[i]);
    if (alive.length && Math.random() < 0.45) {
      var w = alive[Math.floor(Math.random() * alive.length)];
      var soak = Math.min(w.shield, dmg * 1.6);
      w.shield -= soak;
      w.combatHp -= dmg * 1.6 - soak;
      cTmpA.copy(w.pos);
      combat.root.worldToLocal(cTmpA);
      combatBurst(cTmpA, soak > 0 ? 0x7fe7ff : 0xff8b6b, 2.2);
      if (w.combatHp <= 0) {
        combatWingDestroy(w, '敌弹命中', false);
        combatLog('僚舰失联 · 舰队 −1');
      }
      else combatLog(soak > 0 ? '僚舰护盾 −' + Math.round(soak)
                              : '僚舰受击 · 完整度 ' + Math.round(w.combatHp) + '%');
    } else {
      combatShieldAbsorb(dmg, hitMesh);
    }
    combat.hitFlash = 0.6;
    if (combat.hull <= 0) combatFinish(false);
  }
  function combatSalvo() {
    if (!combat.active || combat.phase !== 'fight' || combat.weaponCd[combat.weapon] > 0) return false;
    var e = combat.target && combat.target.alive ? combat.target : combatPickTarget();
    if (!e) return false;
    combat.target = e;
    var spec = COMBAT_WEAPONS[combat.weapon];
    combat.weaponCd[combat.weapon] = spec.cd;
    combat.salvoCd = spec.cd;
    var alive = [];
    for (var k = 0; k < combat.enemies.length; k++) if (combat.enemies[k].alive) alive.push(combat.enemies[k]);
    var first = alive.indexOf(e);
    if (first > 0) { alive.splice(first, 1); alive.unshift(e); }
    if (spec.key === 'energy') combatFireEnergy(alive, (combat.order === 'focus' ? 12 : 9) * campaignBonus().dmg);
    else if (spec.key === 'laser') combatFireLaser(e);
    else if (spec.key === 'torpedo') combatFireTorpedo(e);
    else combatFireIon(e);
    initAudio();
    combatSfx(spec.key);
    combatRefreshUI();
    combatHook();
    return true;
  }
  function combatEnemyFire(e, spec) {
    cTmpA.copy(e.pos);
    cTmpB.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, 0);
    combatTakeShot('enemy', cTmpA, cTmpB, 150, spec.dmg, null);
  }
  function combatWingFire(dt) {
    combat.wingCd -= dt;
    if (combat.wingCd > 0 || !combat.target || !combat.target.alive) return;
    combat.wingCd = (combat.order === 'focus' ? 1.3 : 2.1) * campaignBonus().wing;
    var alive = [];
    for (var i = 0; i < wings.length; i++) if (wings[i].combatHp > 0) alive.push(wings[i]);
    if (!alive.length) return;
    var w = alive[Math.floor(Math.random() * alive.length)];
    cTmpA.copy(w.pos);
    combat.root.worldToLocal(cTmpA);
    cTmpB.copy(combat.target.pos);
    combatTakeShot('ally', cTmpA, cTmpB, 240, 4, combat.target);
  }
  /* ================= v1.2.2 水滴贯穿 / 僚舰损毁殉爆 =================
     战场是开战锚定的局部坐标，僚舰 pos 是场景世界坐标，逐帧换算后再做接触判定。
     专用临时向量，避免与 cTmpA~D（弹丸 / 炮塔 / 僚舰射击）互相踩踏。 */
  var cRamA = new THREE.Vector3(), cRamB = new THREE.Vector3(), cRamD = new THREE.Vector3();
  function combatWingLocal(w, out) {
    out.copy(w.pos);
    combat.root.worldToLocal(out);
    return out;
  }
  function combatWingAliveList() {
    var a = [];
    for (var i = 0; i < wings.length; i++) if (wings[i].combatHp > 0) a.push(wings[i]);
    return a;
  }
  function combatWingPickRam(prev) {
    var a = combatWingAliveList();
    if (!a.length) return null;
    if (prev && prev.combatHp > 0) return prev;          // 追猎同一艘，直到打爆
    var best = a[0];
    for (var i = 1; i < a.length; i++) if (a[i].combatHp < best.combatHp) best = a[i];
    return best;
  }
  function combatWingDestroy(w, cause, loud) {
    if (!w || w.combatHp > 0) return false;
    var no = pad2(wings.indexOf(w) + 1);
    w.combatHp = 0;
    w.group.visible = false;
    if (w.dmgFx) w.dmgFx.visible = false;
    combat.losses++;
    var p = combatWingLocal(w, cRamD);
    combatBurst(p, 0xffe9a8, 1.8, 0.55); // 白热核心
    combatBurst(p, 0xff9a4a, 4.6, 0.75); // 橙红火球
    combatBurst(p, 0xff4a1e, 7.0, 1.05); // 外扩冲击（停留更久才看得清殉爆）
    combatLog('僚舰-' + no + ' 殉爆 · ' + cause + ' · 舰队 ' + combatAliveWings() + '/11');
    combatSfx('explode');
    beep(150, 0.28, 0.08);
    if (loud) showToast('僚舰殉爆', 'WING DESTROYED / DROPLET RAM', false);
    if (combat.droplet) combat.droplet.last = '殉爆 僚舰-' + no;
    return true;
  }
  function combatWingRamDamage(w, dmg, cause) {
    if (!w || w.combatHp <= 0) return;
    // 强相互作用力直接贯穿护盾：只吃阵型减伤，不会被僚舰护盾全额吸收。
    var real = dmg * campaignBonus().soak;
    w.combatHp = Math.max(0, w.combatHp - real);
    w.dmgHit = 0.9;
    var no = pad2(wings.indexOf(w) + 1);
    var p = combatWingLocal(w, cRamD);
    combatBurst(p, 0xeafcff, 1.5);
    combatBurst(p, 0xff8b52, 2.8);
    combatSfx('hit');
    if (combat.droplet) {
      combat.droplet.hits++;
      combat.droplet.last = '贯穿 僚舰-' + no + ' → ' + Math.round(w.combatHp) + '%';
    }
    if (w.combatHp <= 0) {
      if (combat.droplet) combat.droplet.kills++;
      combatWingDestroy(w, cause, true);
      return;
    }
    combatLog('水滴贯穿 僚舰-' + no + ' · 完整度 ' + Math.round(w.combatHp) + '%');
  }
  function combatDropletRam(e, dt, t) {
    var ram = e.ram;
    if (!ram) return;
    var so = combat.standoff;
    var lurk = cRamA.set(Math.sin(t * 0.6 + e.seed) * 26,
                         20 + Math.sin(t * 0.9) * 8, -(so + 150));
    if (ram.phase === 'lurk') {
      e.pos.lerp(lurk, Math.min(1, dt * 2.2));
      ram.cd -= dt;
      if (ram.cd <= 0) {
        var target = combatWingPickRam(ram.target);
        if (!target) { ram.cd = 1.2; return; }
        ram.target = target;
        ram.from.copy(e.pos);
        combatWingLocal(target, ram.aim);
        ram.t = 0; ram.hitDone = false; ram.trailT = 0; ram.cycles++;
        ram.phase = 'charge';
        ram.last = '锁定 僚舰-' + pad2(wings.indexOf(target) + 1);
        combatLog('水滴锁定 僚舰-' + pad2(wings.indexOf(target) + 1) + ' · 高速贯穿');
        combatSfx('wave');
      }
      return;
    }
    if (ram.phase === 'charge') {
      if (ram.target && ram.target.combatHp > 0) combatWingLocal(ram.target, ram.aim);
      var dir = cRamB.copy(ram.aim).sub(ram.from);
      var len = dir.length();
      if (len < 1) len = 1;
      var dur = Math.max(0.62, len / DROPLET_RAM.speed);
      ram.t += dt;
      var u = Math.min(1, ram.t / dur);
      var k = u * u * (3 - 2 * u);                 // smoothstep：起步慢、末端极快
      e.pos.copy(ram.from).addScaledVector(dir, k);
      ram.trailT -= dt;
      if (ram.trailT <= 0) {
        ram.trailT = DROPLET_RAM.trail;
        combatBurst(e.pos, 0xcdefff, 0.55);        // 冲刺光轨
      }
      if (!ram.hitDone && u >= DROPLET_RAM.hitU) {
        ram.hitDone = true;
        var w = ram.target;
        if (w && w.combatHp > 0) {
          if (combat.order === 'evade' && Math.random() < 0.30 + campaignBonus().evade) {
            combatLog('规避成功 · 水滴擦过 僚舰-' + pad2(wings.indexOf(w) + 1));
            combatBurst(combatWingLocal(w, cRamD), 0xbfe9ff, 1.6);
          } else {
            combatWingRamDamage(w, DROPLET_RAM.dmg, '水滴贯穿');
          }
        }
      }
      if (u >= 1) {
        ram.through.copy(e.pos).addScaledVector(dir.normalize(), 46);
        ram.t = 0; ram.phase = 'recover';
      }
      return;
    }
    // recover：从穿透点飞回待机位。冷却随接战距离联动（降档拉远 → 追猎变慢），
    // 环形护卫额外拖慢水滴重新锁定的节奏。
    ram.t += dt;
    var q = Math.min(1, ram.t / DROPLET_RAM.recover);
    e.pos.copy(ram.through).lerp(lurk, q);
    if (q >= 1) {
      ram.phase = 'lurk';
      ram.cd = (DROPLET_RAM.cd + Math.max(0, so - 165) * 0.018) *
               (1 + (1 - campaignBonus().soak) * 0.8);
      if (ram.target && ram.target.combatHp <= 0) ram.target = null;
    }
  }
  function combatWingFx(dt, t) {
    for (var i = 0; i < wings.length; i++) {
      var w = wings[i], fx = w.dmgFx;
      if (!fx) continue;
      if (!combat.active || w.combatHp <= 0 || w.combatHp >= 100) {
        fx.visible = false; w.dmgHit = 0; continue;
      }
      var k = 1 - w.combatHp / 100;
      w.dmgHit = Math.max(0, w.dmgHit - dt);
      var pulse = 0.5 + 0.5 * Math.sin(t * 9 + w.phase);
      fx.visible = true;
      fx.material.color.setHex(k > 0.66 ? 0xff3b22 : 0xff8a3c);
      fx.material.opacity = Math.min(0.94,
        0.30 + 0.45 * k + 0.12 * pulse + w.dmgHit * 0.35);
      var s = (1.15 + 2.7 * k) * (0.92 + 0.10 * pulse) + w.dmgHit * 0.8;
      fx.scale.set(s * 0.9, s * 0.9, s * 1.8);
      fx.position.z = -2 - 3 * k;
      // 破口持续冒火花：跟随僚舰当前位置，比一次性的命中爆点更像「带伤在烧」。
      w.dmgSparkT = (w.dmgSparkT || 0) - dt;
      if (w.dmgSparkT <= 0) {
        w.dmgSparkT = 0.16 + 0.12 * (1 - k);
        var sp = combatWingLocal(w, cRamD);
        sp.x += (Math.random() - 0.5) * 4 * k;
        sp.y += (Math.random() - 0.5) * 4 * k;
        combatBurst(sp, k > 0.66 ? 0xff4a22 : 0xffa851, 0.8 + 1.4 * k, 0.5);
      }
    }
  }
  function combatEnemies(dt, t) {
    for (var i = 0; i < combat.enemies.length; i++) {
      var e = combat.enemies[i];
      if (!e.alive) continue;
      var spec = e.spec || combat.missionCfg.spec[e.kind] || COMBAT_SPEC[e.kind];
      if (e.kind === 'droplet') {
        /* v1.2.2：水滴不进入常规轨道、也不发普通弹 —— 它只做贯穿撞击。
           离子炮仍能让它的冲刺/回环减速（ion 只在这里递减，不改变不可击毁）。 */
        if (e.ion > 0) e.ion = Math.max(0, e.ion - dt);
        combatDropletRam(e, dt * (e.ion > 0 ? 0.45 : 1), t);
        e.mesh.position.copy(e.pos);
        e.mesh.rotation.y += dt * 2.6;
        e.mesh.rotation.x += dt * 0.6;
        e.mesh.material.emissive.setHex(e.ion > 0 ? 0x8a5cff : 0xa6dcff);
        continue;
      }
      var dist = e.pos.length();
      // 轨道半径随接战距离联动：换档后敌阵整体逼近 / 退开，而不是永远钉在 165。
      var so = combat.standoff;
      if (e.ion > 0) e.ion = Math.max(0, e.ion - dt);
      var ionSlow = e.ion > 0 ? 0.45 : 1;
      if (dist > so) {
        e.pos.addScaledVector(e.pos, -spec.speed * ionSlow * dt / dist);
      } else {
        e.orbit += dt * (e.kind === 'probe' ? 0.55 : 0.32) * ionSlow;
        var rr = so + Math.sin(t * 0.7 + e.seed) * 22;
        e.pos.set(Math.cos(e.orbit) * rr * 0.72,
                  Math.sin(t * 0.5 + e.seed) * 26,
                  -Math.abs(Math.sin(e.orbit)) * rr - so * 0.36);
      }
      e.mesh.position.copy(e.pos);
      e.mesh.rotation.y += dt * 1.2;
      e.mesh.rotation.x += dt * 0.5;
      e.mesh.material.emissive.setHex(e.ion > 0 ? 0x8a5cff : e.baseEmissive);
      e.cd -= dt;
      if (combat.time < combat.storyUntil) e.cd = Math.max(e.cd, 0.4);
      if (e.cd <= 0) {
        e.cd = spec.cd * (e.ion > 0 ? 1.8 : 1) * (0.8 + Math.random() * 0.4);
        combatEnemyFire(e, spec);
      }
    }
  }
  function combatAimTurrets() {
    if (!combat.target || !combat.target.alive) return;
    cTmpB.copy(combat.target.pos);
    combat.root.localToWorld(cTmpB);
    for (var i = 0; i < combat.turrets.length; i++) combat.turrets[i].group.lookAt(cTmpB);
  }
  function combatShots(dt) {
    for (var i = 0; i < combat.shots.length; i++) {
      var s = combat.shots[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) { s.active = false; s.mesh.visible = false; continue; }
      // 非能量炮弹丸在目标被击毁后重新锁定，不会白飞一场。
      if (s.side === 'ally' && s.kind !== 'bolt' && s.target && !s.target.alive) {
        s.target = combatPickTarget();
      }
      if (s.side === 'ally' && s.target && s.target.alive) {
        cTmpA.copy(s.target.pos).sub(s.mesh.position);
        var d = cTmpA.length();
        if (d < (s.kind === 'torpedo' ? 20 : 16)) {
          if (s.kind === 'torpedo') {
            combatDamageEnemy(s.target, s.dmg);
            for (var a = 0; a < combat.enemies.length; a++) {
              var o = combat.enemies[a];
              if (o.alive && o !== s.target && o.pos.distanceTo(s.mesh.position) < s.aoe) {
                combatDamageEnemy(o, s.dmg * 0.5);
              }
            }
            combatBurst(s.mesh.position, 0xffb066, 5.0);
          } else if (s.kind === 'ion') {
            s.target.ion = 4.0;
            combatDamageEnemy(s.target, s.dmg);
            combatBurst(s.mesh.position, 0xc09cff, 2.4);
            combatLog('离子干扰 · ' + s.target.name + ' 武器与机动受抑 4 s');
          } else {
            combatDamageEnemy(s.target, s.dmg);
            combatBurst(s.mesh.position, 0xa9f4ff, 1.6);
          }
          s.active = false; s.mesh.visible = false;
          continue;
        }
        cTmpA.multiplyScalar(1 / d).multiplyScalar(s.vel.length());
        s.vel.lerp(cTmpA, Math.min(1, dt * (s.kind === 'torpedo' ? 1.5 : 2.2)));
      } else if (s.side === 'enemy' && s.mesh.position.lengthSq() < 900) {
        combatDamageFleet(s.dmg, s.mesh);
        combatBurst(s.mesh.position, 0xff8b6b, 2.0);
        s.active = false; s.mesh.visible = false;
        continue;
      }
      if (s.kind !== 'bolt') {
        s.mesh.quaternion.setFromUnitVectors(cBeamUp, cTmpD.copy(s.vel).normalize());
      }
      s.mesh.position.addScaledVector(s.vel, dt);
    }
  }
  function combatWaves() {
    var waves = combat.missionCfg.waves;
    while (combat.wave < waves.length &&
           (combat.time >= waves[combat.wave].at ||
            (combat.wave > 0 && combatAliveEnemies() === 0 && combat.time - combat.waveAt >= 5))) {
      if (combatAliveEnemies() >= 7) break;
      var wv = waves[combat.wave];
      var spawned = 0;
      for (var i = 0; i < wv.list.length; i++) {
        for (var j = 0; j < wv.list[i][1]; j++) {
          combatSpawn(wv.list[i][0], j, wv.list[i][1]);
          spawned++;
        }
      }
      combat.wave++;
      combat.waveAt = combat.time;
      combatLog('第 ' + combat.wave + ' 波接敌 · ' + spawned + ' 个信号');
      showToast('第 ' + combat.wave + ' 波接敌', 'HOSTILES INBOUND', false);
      beep(330, 0.22, 0.07);
      combatSfx('wave');
      if (!combat.target) combat.target = combatPickTarget();
    }
  }
  function combatLog(text) {
    combat.log.unshift(text);
    if (combat.log.length > 6) combat.log.length = 6;
  }
  function combatFinish(win) {
    if (combat.phase === 'result') return;
    combat.phase = 'result';
    combat.result = win ? 'win' : 'lose';
    combatLog(win ? '推演完成 · 任务 ' + pad2(combat.mission) + ' 达成' : '推演失败 · 舰队失去战斗力');
    campaignRecord(win);
    showToast(win ? '推演完成' : '推演失败', win ? 'MISSION COMPLETE' : 'MISSION FAILED', false);
    initAudio();
    beep(win ? 880 : 180, 0.35, 0.09);
    combatSfx(win ? 'win' : 'lose');
    combatRefreshUI();
    combatHook();
    campaignHook();
  }
  function combatEnsureUI() {
    var L = document.getElementById('combat-layer');
    if (L) { L.classList.remove('hidden'); return L; }
    L = document.createElement('div');
    L.id = 'combat-layer';
    L.innerHTML = COMBAT_UI_HTML;
    document.body.appendChild(L);
    return L;
  }
  function combatRefreshUI() {
    if (!combat.active) return;
    combatEnsureUI();
    document.body.classList.add('combat-on');
    function set(id, text) { var e = document.getElementById(id); if (e) e.textContent = text; }
    var mm = Math.floor(combat.time / 60), ss = Math.floor(combat.time % 60);
    set('c-remain', String(combatAliveEnemies()));
    set('c-time', mm + ':' + (ss < 10 ? '0' : '') + ss);
    set('c-tname', combat.target && combat.target.alive
      ? combat.target.name + ' #' + combat.target.id : '未锁定');
    set('c-tdist', combat.target && combat.target.alive
      ? (combat.target.invulnerable ? '⚠ 不可击毁 · 请勿浪费火力 · ' : '') +
        '距离 ' + (combat.target.pos.length() / 10).toFixed(1) + ' 千 km · 相对 ' +
        (combat.relC >= 0 ? '+' : '') + combat.relC.toFixed(3) + ' c · HP ' +
        Math.max(0, Math.round(combat.target.hp)) + '/' + combat.target.maxHp
      : '按 Tab 选择目标');
    set('c-standoff', (combat.standoff / 10).toFixed(1) + ' 千 km');
    var cfg = combat.missionCfg || CAMPAIGN_MISSIONS[0];
    set('c-mission-eyebrow', 'MISSION ' + pad2(cfg.id) + ' · ' + cfg.en);
    set('c-mission-title', cfg.name);
    set('c-goal', cfg.goal);
    set('c-progress', pad2(cfg.id) + '/04 · ' +
        (combat.progress ? combat.progress.cleared.length : 0) + '✓');
    set('c-objective', campaignObjective());
    /* v1.2.1：胜利 / 失败条件常驻 HUD，字幕消失后仍可随时查；打法提示默认折叠。 */
    var ru = document.getElementById('c-rules');
    if (ru && cfg.rules) {
      ru.innerHTML =
        '<div class="cr-row cr-win"><b>胜利</b><span>' + cfg.rules.win + '</span></div>' +
        '<div class="cr-row cr-lose"><b>失败</b><span>' + cfg.rules.lose + '</span></div>' +
        '<div class="cr-tips' + (combat.rulesOpen ? '' : ' hidden') + '">' +
        cfg.rules.tips.map(function (s) { return '<div>· ' + s + '</div>'; }).join('') + '</div>';
    }
    var rb = document.getElementById('c-rules-btn');
    if (rb) rb.textContent = combat.rulesOpen ? '▴ 收起打法提示'
      : '▾ 展开打法提示（' + (cfg.rules ? cfg.rules.tips.length : 0) + ' 条）';
    var bn = campaignBonus();
    set('c-formation', FORMATIONS[state.formation].name);
    set('c-formation-note', 'F 切换 · ' + bn.tag);
    set('c-hull', Math.round(combat.hull) + '%');
    set('c-shield', Math.round(combat.shield) + '%');
    var shBar = document.getElementById('c-shieldbar');
    if (shBar) shBar.style.width = (clamp(combat.shield / combat.shieldMax * 100, 0, 100)).toFixed(0) + '%';
    var shNote = document.getElementById('c-shieldnote');
    var shLabel = combat.shieldState === 'overload' ? '过载 · 重新充能'
      : combat.shieldState === 'regen' ? '充能中 · +5.5%/s'
      : combat.shield <= 0 ? '离线' : '在线 · 吸收伤害';
    if (shNote) shNote.textContent = '能量护盾 · ' + shLabel;
    var wSpec = COMBAT_WEAPONS[combat.weapon];
    set('c-order', combat.order === 'focus' ? '集火 FOCUS' : '规避 EVADE');
    set('c-salvo', combat.salvoCd > 0.05
      ? wSpec.name + '充能 ' + combat.salvoCd.toFixed(1) + ' s · ' + wSpec.hint
      : wSpec.name + ' · 就绪（空格）· ' + wSpec.hint);
    var tb = document.getElementById('c-tbar');
    if (tb) tb.style.width = (combat.target && combat.target.alive
      ? clamp(combat.target.hp / combat.target.maxHp * 100, 0, 100) : 0).toFixed(0) + '%';
    var sb = document.getElementById('c-salvobar');
    if (sb) sb.style.width = clamp((1 - combat.salvoCd / wSpec.cd) * 100, 0, 100).toFixed(0) + '%';
    var hit = document.getElementById('c-hit');
    if (hit) hit.style.opacity = combat.hitFlash > 0 ? String(clamp(combat.hitFlash, 0, 0.6)) : '0';
    var lg = document.getElementById('c-logbody');
    if (lg) lg.innerHTML = combat.log.map(function (s) { return '<div>· ' + s + '</div>'; }).join('');
    var pairs = [['tactical', combat.tactical], ['focus', combat.order === 'focus'], ['evade', combat.order === 'evade']];
    pairs.forEach(function (p) {
      var b = document.querySelector('#c-bar [data-act="' + p[0] + '"]');
      if (b) b.classList.toggle('on', !!p[1]);
    });
    for (var wi = 0; wi < COMBAT_WEAPONS.length; wi++) {
      var wb = document.querySelector('#c-weapons [data-weapon="' + wi + '"]');
      if (!wb) continue;
      wb.classList.toggle('on', wi === combat.weapon);
      var wcd = wb.querySelector('.w-cd');
      if (wcd) wcd.style.width = clamp((1 - combat.weaponCd[wi] / COMBAT_WEAPONS[wi].cd) * 100, 0, 100).toFixed(0) + '%';
      var wst = wb.querySelector('.w-state');
      if (wst) wst.textContent = combat.weaponCd[wi] > 0.05 ? combat.weaponCd[wi].toFixed(1) + 's' : '就绪';
    }
    var R = document.getElementById('c-result');
    if (R) {
      if (combat.phase === 'result') {
        R.classList.remove('hidden');
        set('c-result-title', combat.result === 'win' ? '推演完成' : '推演失败');
        set('c-result-body', '击毁 ' + combat.kills + ' · 僚舰损失 ' + combat.losses +
          ' · 舰队 ' + (combatAliveWings() + 1) + '/12 · 用时 ' + Math.round(combat.time) + ' s');
      } else R.classList.add('hidden');
    }
    var nb = document.getElementById('c-btn-next');
    if (nb) nb.style.display = (combat.phase === 'result' && combat.result === 'win' &&
      combat.mission < CAMPAIGN_MISSIONS.length) ? '' : 'none';
    set('c-result-hint', combat.result === 'win'
      ? (combat.mission < CAMPAIGN_MISSIONS.length
          ? 'Enter 进入下一关 · 或点「任务列表」'
          : '四段推演全部完成 · Enter 再来一次')
      : 'Enter 重试本关 · Esc 返回自由航行');
    campaignIndicators();
  }
  function combatStart(m) {
    if (combat.active) combatExit();
    var mid = clamp(parseInt(m, 10) || 1, 1, CAMPAIGN_MISSIONS.length);
    var cfg = CAMPAIGN_MISSIONS[mid - 1];
    if (!combat.progress) combat.progress = campaignLoad();
    combat.active = true; combat.phase = 'fight'; combat.mission = mid;
    combat.missionCfg = cfg;
    combat.storyUntil = 0; combat.warpReady = false; combat.warpDone = false;
    combat.rulesOpen = false; combat.escortWarned = false;
    combat.time = 0; combat.wave = 0; combat.waveAt = 0; combat.kills = 0; combat.losses = 0;
    combat.droplet = { hits: 0, kills: 0, last: '' };
    combat.hull = 100; combat.shield = 100; combat.salvoCd = 0; combat.wingCd = 1.6;
    combat.order = 'focus'; combat.target = null; combat.result = null;
    combat.tactical = false; combat.log = []; combat.hitFlash = 0;
    combat.nextId = 1; combatUIAccum = 0;
    combat.weapon = 0; combat.weaponCd = [0, 0, 0, 0]; combat.salvoCd = 0;
    combat.shield = combat.shieldMax; combat.shieldIdle = 0; combat.shieldLock = 0;
    combat.shieldHit = 0; combat.shieldOver = false; combat.shieldState = 'online';
    combat.shieldReveal = 0; combat.shieldDir.set(0, 0, 1);
    ATTITUDE.yaw = ATTITUDE.pitch = ATTITUDE.roll = 0;
    ATTITUDE.cmdYaw = ATTITUDE.cmdPitch = ATTITUDE.cmdRoll = 0;
    for (var i = 0; i < combat.enemies.length; i++) combat.root && combat.root.remove(combat.enemies[i].mesh);
    combat.enemies.length = 0;
    if (!combat.root) {
      combat.root = new THREE.Group();
      combat.root.name = 'combat-world-space';
      scene.add(combat.root);
      combat.turretRoot = new THREE.Group();
      combat.turretRoot.name = 'combat-turret-mount';
      scene.add(combat.turretRoot);
      combatInitPools();
      combatBuildTurrets();
    }
    // 开战瞬间锚定一次：敌舰从此在空间里独立存在，转视角只会看到它们相对滑动。
    combat.root.position.copy(ship.position);
    combat.root.quaternion.copy(ship.quaternion);
    combat.root.updateWorldMatrix(true, true);
    combat.turretRoot.position.copy(ship.position);
    combat.turretRoot.quaternion.copy(ship.quaternion);
    combat.turretRoot.updateWorldMatrix(true, true);
    combat.root.visible = true;
    combat.turretRoot.visible = true;
    for (var s = 0; s < combat.shots.length; s++) { combat.shots[s].active = false; combat.shots[s].mesh.visible = false; }
    for (var b = 0; b < combat.bursts.length; b++) { combat.bursts[b].active = false; combat.bursts[b].mesh.visible = false; }
    for (var bm = 0; bm < combat.beams.length; bm++) { combat.beams[bm].active = false; combat.beams[bm].mesh.visible = false; }
    wings.forEach(function (w) {
      w.combatHp = 100; w.shield = 30; w.group.visible = true;
      w.dmgHit = 0; w.dmgSparkT = 0;
      if (w.dmgFx) w.dmgFx.visible = false;
    });
    var st = $('startscreen'); if (st) st.classList.add('hidden');
    setGear(2, true);
    state.targetC = 0.05; state.speedC = 0.05; state.warp = 0;
    state.mouseNX = 0; state.mouseNY = 0;
    combat.standoff = 165; combat.relC = 0; combat.gearSeen = 2;
    combatLog('任务 ' + pad2(mid) + ' · ' + cfg.name + ' · 战术推演启动');
    combatLog('Tab 切目标 / 空格发射 / X Z 换武器 / C 俯视 / F 阵型 / G 集火 / B 规避');
    showToast('战术推演 · 接敌', cfg.en, false);
    initAudio();
    beep(520, 0.16, 0.07);
    combatSfx('wave');
    var st = document.getElementById('c-story'); if (st) st.classList.add('hidden');
    campaignSelectClose();
    if (mid > 1 && cfg.brief) campaignStoryShow(cfg);
    // 开战瞬间就把第 1 波放进战场：不依赖首次 rAF，首帧即有敌舰与锁定目标。
    combatWaves();
    combatRefreshUI();
    combatHook();
    campaignHook();
  }
  function combatExit() {
    if (!combat.active) return;
    combat.active = false; combat.phase = 'idle'; combat.tactical = false;
    for (var i = 0; i < combat.enemies.length; i++) combat.root.remove(combat.enemies[i].mesh);
    combat.enemies.length = 0;
    for (var s = 0; s < combat.shots.length; s++) { combat.shots[s].active = false; combat.shots[s].mesh.visible = false; }
    for (var b = 0; b < combat.bursts.length; b++) { combat.bursts[b].active = false; combat.bursts[b].mesh.visible = false; }
    for (var bm = 0; bm < combat.beams.length; bm++) { combat.beams[bm].active = false; combat.beams[bm].mesh.visible = false; }
    if (combat.root) combat.root.visible = false;
    if (combat.turretRoot) combat.turretRoot.visible = false;
    wings.forEach(function (w) {
      w.combatHp = 100; w.shield = 30; w.group.visible = true;
      w.dmgHit = 0; w.dmgSparkT = 0;
      if (w.dmgFx) w.dmgFx.visible = false;
    });
    document.body.classList.remove('combat-on');
    var L = document.getElementById('combat-layer'); if (L) L.classList.add('hidden');
    var st = document.getElementById('c-story'); if (st) st.classList.add('hidden');
    campaignSelectClose();
    combat.target = null;
    combat.droplet = null;
    combat.storyUntil = 0;
    showToast('返回自由航行', 'FREE FLIGHT RESTORED', false);
    combatHook();
  }
  function combatToggleTactical() {
    combat.tactical = !combat.tactical;
    state.mouseNX = 0; state.mouseNY = 0;
    combatLog(combat.tactical ? '切换战术俯视 · 鼠标改为点选目标' : '返回第三人称跟随');
    showToast(combat.tactical ? '战术俯视' : '第三人称跟随',
              combat.tactical ? 'TACTICAL VIEW' : 'CHASE CAM', false);
    beep(combat.tactical ? 680 : 480, 0.1, 0.05);
  }
  function combatSetOrder(o) {
    combat.order = o === 'evade' ? 'evade' : 'focus';
    combatLog('舰队指令 · ' + (combat.order === 'focus' ? '集火 FOCUS' : '规避 EVADE'));
    showToast(combat.order === 'focus' ? '集火 FOCUS' : '规避 EVADE', 'FLEET ORDER', false);
    beep(combat.order === 'focus' ? 700 : 440, 0.1, 0.05);
  }
  function combatTacticalPick(clientX, clientY) {
    if (!combat.active || !combat.tactical) return false;
    var nx = (clientX / window.innerWidth) * 2 - 1;
    var ny = -(clientY / window.innerHeight) * 2 + 1;
    var best = null, bestD = 0.18;
    for (var i = 0; i < combat.enemies.length; i++) {
      var e = combat.enemies[i];
      if (!e.alive) continue;
      cTmpA.copy(e.pos);
      combat.root.localToWorld(cTmpA);
      cTmpA.project(camera);
      if (cTmpA.z >= 1) continue;
      var d = Math.sqrt((cTmpA.x - nx) * (cTmpA.x - nx) + (cTmpA.y - ny) * (cTmpA.y - ny));
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      combat.target = best;
      combatLog('手动锁定 ' + best.name + ' #' + best.id);
      beep(620, 0.08, 0.05);
    }
    return true;
  }
  function combatRadar(x, cx, cy, R) {
    if (!combat.active) return;
    for (var i = 0; i < combat.enemies.length; i++) {
      var e = combat.enemies[i];
      if (!e.alive) continue;
      var px = cx + clamp(e.pos.x * 0.22, -R + 4, R - 4);
      var py = cy + clamp(e.pos.z * 0.22, -R + 4, R - 4);
      var locked = e === combat.target;
      var col = locked ? '#ffe08a' : '#ff5d70';
      /* v1.2.1：第三关「逃亡舰」外形刻意做成己方舰影的镜像，雷达上改用红色空心菱形，
         既保留猜疑链氛围，又与青色实心菱形僚舰在颜色 / 填充上明确分属敌我。
         其余敌舰统一红色实心圆，锁定目标额外套黄环；点选坐标换算完全不变。 */
      if (e.kind === 'mirror') {
        var mr = locked ? 4.4 : 3.8;
        x.beginPath();
        x.moveTo(px, py - mr); x.lineTo(px + mr, py);
        x.lineTo(px, py + mr); x.lineTo(px - mr, py); x.closePath();
        x.fillStyle = locked ? 'rgba(255,224,138,.32)' : 'rgba(255,93,112,.20)';
        x.fill();
        x.strokeStyle = col; x.lineWidth = locked ? 1.6 : 1.2; x.stroke();
      } else {
        x.fillStyle = col;
        x.beginPath(); x.arc(px, py, locked ? 3.6 : 3.0, 0, PI2); x.fill();
        x.strokeStyle = 'rgba(4,20,34,.8)'; x.lineWidth = 0.8; x.stroke();
      }
      if (locked) {
        x.strokeStyle = '#ffe08a'; x.lineWidth = 1.2;
        x.beginPath(); x.arc(px, py, 7.2, 0, PI2); x.stroke();
      }
    }
  }
  function combatCameraOverride(dt) {
    if (!combat.active || !combat.tactical) return;
    // 战术俯视机位同样锚定战场空间，切视角时镜头不会把敌舰一起带着转。
    var bq = combat.root.quaternion, bp = combat.root.position;
    desiredPos.set(0, 185, 128).multiplyScalar(state.zoom)
      .applyQuaternion(bq).add(bp);
    lookTarget.set(0, 0, -70).applyQuaternion(bq).add(bp);
    camera.position.lerp(desiredPos, 1 - Math.exp(-5 * dt));
    upVec.set(0, 1, 0).applyQuaternion(bq);
    camHelper.position.copy(camera.position);
    camHelper.up.copy(upVec);
    camHelper.lookAt(lookTarget);
    camera.quaternion.slerp(camHelper.quaternion, 1 - Math.exp(-7 * dt));
    camera.fov += (60 - camera.fov) * (1 - Math.exp(-3 * dt));
    camera.updateProjectionMatrix();
  }
  function combatUpdate(dt, t) {
    if (!combat.active) { combatHook(); return; }
    if (dt <= 0) { combatHook(); return; }
    combat.root.visible = true;
    // 战场空间是开战时锚定的世界坐标，绝不随舰体姿态 / 镜头环绕更新。
    // 只有炮塔挂载点跟随舰体；两者用 worldToLocal / localToWorld 对齐。
    combat.turretRoot.position.copy(ship.position);
    combat.turretRoot.quaternion.copy(ship.quaternion);
    combat.turretRoot.updateWorldMatrix(true, true);
    combat.root.updateWorldMatrix(true, true);
    combat.time += dt;
    for (var wi2 = 0; wi2 < combat.weaponCd.length; wi2++) {
      combat.weaponCd[wi2] = Math.max(0, combat.weaponCd[wi2] - dt);
    }
    combat.salvoCd = combat.weaponCd[combat.weapon];
    combatShield(dt);
    /* 档位 → 相对速度 → 接战距离：state.speedC 由 setGear 平滑，这里再过渡一层，
       换档时敌阵不会瞬移。加速主动接敌（距离缩短 / 星流变急），减速脱离。 */
    var relTarget = state.speedC - COMBAT_CRUISE_C;
    combat.relC += (relTarget - combat.relC) * (1 - Math.exp(-2.6 * dt));
    var soTarget = clamp(165 - combat.relC * COMBAT_STANDOFF_K,
                         COMBAT_STANDOFF_MIN, COMBAT_STANDOFF_MAX);
    combat.standoff += (soTarget - combat.standoff) * (1 - Math.exp(-1.5 * dt));
    if (combat.gearSeen !== state.gear) {
      combat.gearSeen = state.gear;
      combatLog('推进档位 → ' + AHEAD[state.gear].label + ' · 接战距离 ' +
                (soTarget / 10).toFixed(1) + ' 千 km');
    }
    if (combat.phase === 'fight') {
      combatWaves();
      combatEnemies(dt, t);
      combatAimTurrets();
      combatWingFire(dt);
      combat.hitFlash = Math.max(0, combat.hitFlash - dt);
      campaignTick();
      if (campaignCheckVictory()) combatFinish(true);
      else if (combat.hull <= 0) combatFinish(false);
      else if (combatAliveWings() === 0) combatFinish(false);
      else if (combat.time > combat.missionCfg.limit) combatFinish(false);
    } else {
    }
    combatShots(dt);
    combatBursts(dt);
    combatWingFx(dt, t);
    combatBeams(dt);
    if (combat.shieldMat) {
      var su = combat.shieldMat.uniforms;
      su.uTime.value = t;
      su.uPower.value = clamp(combat.shield / combat.shieldMax, 0, 1);
      su.uHit.value = combat.shieldHit;
      su.uOver.value = combat.shieldOver ? 1 : 0;
      su.uReveal.value = combat.shieldReveal;
      su.uHitDir.value.copy(combat.shieldDir);
    }
    combatUIAccum += dt;
    if (combatUIAccum > 0.1) { combatUIAccum = 0; combatRefreshUI(); }
    combatHook();
  }
  function combatHook() {
    var H = window.__NS_COMBAT__;
    H.active = combat.active; H.phase = combat.phase; H.tactical = combat.tactical;
    H.mission = combat.mission; H.time = +combat.time.toFixed(2); H.wave = combat.wave;
    H.kills = combat.kills; H.losses = combat.losses;
    H.hull = +combat.hull.toFixed(1); H.shield = +combat.shield.toFixed(1);
    H.order = combat.order; H.salvoCd = +combat.salvoCd.toFixed(2);
    H.target = combat.target && combat.target.alive ? combat.target.name + '#' + combat.target.id : null;
    H.enemies = combatAliveEnemies(); H.turrets = combat.turrets.length;
    H.result = combat.result; H.wings = combatAliveWings();
    H.standoff = +combat.standoff.toFixed(2);
    H.relC = +combat.relC.toFixed(4);
    H.gear = state.gear;
    H.weapon = combat.weapon;
    H.weaponKey = COMBAT_WEAPONS[combat.weapon].key;
    H.weaponCd = combat.weaponCd.map(function (v) { return +v.toFixed(2); });
    H.beams = combat.beams.filter(function (b) { return b.active; }).length;
    H.shieldState = combat.shieldState;
    var SH = window.__NS_SHIELD__;
    SH.power = +clamp(combat.shield / combat.shieldMax, 0, 1).toFixed(3);
    SH.state = combat.shieldState;
    SH.idle = +combat.shieldIdle.toFixed(2);
    SH.lock = +combat.shieldLock.toFixed(2);
    SH.hit = +combat.shieldHit.toFixed(2);
    SH.overload = combat.shieldOver;
    SH.mesh = !!combat.shieldMesh && combat.shieldMesh.visible;
    SH.reveal = +combat.shieldReveal.toFixed(3);
    SH.dir = [+combat.shieldDir.x.toFixed(3), +combat.shieldDir.y.toFixed(3),
              +combat.shieldDir.z.toFixed(3)];
    SH.halfAx = combat.shieldHalfAx ? combat.shieldHalfAx.map(function (v) { return +v.toFixed(2); }) : [];
    SH.cover = combat.shieldCover;
    H.missionCfg = combat.missionCfg ? combat.missionCfg.win : null;
    H.hold = combat.missionCfg && combat.missionCfg.hold ? combat.missionCfg.hold : 0;
    H.warpReady = combat.warpReady;
    H.warpDone = combat.warpDone;
    dropletHook();
    campaignHook();
  }
  /* v1.2.2 诊断钩子：把水滴相位、贯穿次数、殉爆数与 11 艘僚舰完整度同步出来，
     验证脚本据此断言「撞击 → 扣血 → 损毁 → 殉爆」整条链路，不靠源码字符串。 */
  window.__NS_DROPLET__ = {
    active: false, phase: 'idle', target: 0, hits: 0, kills: 0, cycles: 0,
    dmg: DROPLET_RAM.dmg, wingsHp: [], damaged: 0, lost: 0, fx: 0, last: '',
    snapshot: function () { dropletHook(); return window.__NS_DROPLET__; }
  };
  function dropletHook() {
    var D = window.__NS_DROPLET__, dr = null;
    if (combat.active) {
      for (var i = 0; i < combat.enemies.length; i++) {
        var e = combat.enemies[i];
        if (e.alive && e.kind === 'droplet') { dr = e; break; }
      }
    }
    D.active = !!dr;
    D.phase = dr && dr.ram ? dr.ram.phase : 'idle';
    D.target = dr && dr.ram && dr.ram.target ? wings.indexOf(dr.ram.target) + 1 : 0;
    D.cycles = dr && dr.ram ? dr.ram.cycles : 0;
    D.hits = combat.droplet ? combat.droplet.hits : 0;
    D.kills = combat.droplet ? combat.droplet.kills : 0;
    D.last = combat.droplet ? combat.droplet.last : '';
    D.wingsHp = wings.map(function (w) { return +w.combatHp.toFixed(1); });
    D.damaged = wings.filter(function (w) { return w.combatHp > 0 && w.combatHp < 100; }).length;
    D.lost = wings.filter(function (w) { return w.combatHp <= 0; }).length;
    D.fx = wings.filter(function (w) { return w.dmgFx && w.dmgFx.visible; }).length;
  }
  window.__NS_COMBAT__ = {
    active: false, phase: 'idle', tactical: false, mission: 0, time: 0, wave: 0,
    kills: 0, losses: 0, hull: 100, shield: 100, order: 'focus', salvoCd: 0,
    target: null, enemies: 0, turrets: 0, wings: 11, result: null,
    standoff: 165, relC: 0, gear: 0,
    weapon: 0, weaponKey: 'energy', weaponCd: [0, 0, 0, 0], beams: 0,
    shieldState: 'online', missionCfg: null, hold: 0, warpReady: false, warpDone: false,
    start: function (m) { combatStart(m || 1); },
    salvo: function () { var r = combatSalvo(); combatHook(); return r; },
    cycle: function () { combatCycleTarget(); combatHook(); },
    toggleView: function () { combatToggleTactical(); combatHook(); },
    setOrder: function (o) { combatSetOrder(o); combatHook(); },
    selectWeapon: function (i) { var r = combatSelectWeapon(i); combatHook(); return r; },
    weapons: COMBAT_WEAPONS.map(function (w) { return w.key; }),
    exit: function () { combatExit(); },
    advance: function (dt, n) {
      var k = n || 1, d = dt || 0.016, acc = combat.time;
      for (var i = 0; i < k; i++) { acc += d; combatUpdate(d, acc); }
      return window.__NS_COMBAT__;
    }
  };
  window.__NS_SHIELD__ = { power: 1, state: 'online', idle: 0, lock: 0,
                           hit: 0, overload: false, mesh: false, regen: 5.5,
                           reveal: 0, dir: [0, 0, 1], halfAx: [], cover: null };
  window.__NS_TURRETS__ = { count: 0, source: 'pending', box: [] };

  /* ================= 主更新 ================= */
  function wrap(v, half, field) {
    if (v > half) return v - field;
    if (v < -half) return v + field;
    return v;
  }

  function update(dt, t) {
    qPrev.copy(ship.quaternion);
    /* 手势目标值平滑过渡，避免捏合 / 环绕时镜头跳变 */
    var gs = 1 - Math.exp(-9 * dt);
    state.zoom += (state.zoomTarget - state.zoom) * gs;
    state.orbitYaw += (state.orbitYawTarget - state.orbitYaw) * gs;
    state.orbitPitch += (state.orbitPitchTarget - state.orbitPitch) * gs;
    var driveNorm = clamp(state.speedC / 0.1, 0, 1);   // 线性档位量：0.25 / 0.50 / 0.75 / 1.00
    /* 姿态控制：A/D/W/S/Q/E 与鼠标先给出「指令角速率」，再由角动量低通驱动舰体。
       起转时间常数 0.42s（推力建立），松手余转 1.10s（惯性滑行）——松手后舰体
       继续转一小段再停，而不是瞬间定住。暂停 / 帮助打开时整层冻结，不偷偷漂移。 */
    var attitudeActive = !state.helpOpen && !state.paused;
    if (attitudeActive) {
      var yaw = 0, pit = 0, rol = 0;
      if (keys['a'] || keys['arrowleft']) yaw += 0.54;
      if (keys['d'] || keys['arrowright']) yaw -= 0.54;
      if (keys['w'] || keys['arrowup']) pit -= 0.40;
      if (keys['s'] || keys['arrowdown']) pit += 0.40;
      if (keys['q']) rol += 0.62;
      if (keys['e']) rol -= 0.62;
      if (autoRoll) rol += 0.6;          // ?roll=1 用于演示滚转时的编队甩动
      var dead = 0.07;
      var mx = Math.abs(state.mouseNX) > dead
        ? Math.sign(state.mouseNX) * (Math.abs(state.mouseNX) - dead) / (1 - dead) : 0;
      var my = Math.abs(state.mouseNY) > dead
        ? Math.sign(state.mouseNY) * (Math.abs(state.mouseNY) - dead) / (1 - dead) : 0;
      yaw += -mx * 0.58;
      pit += -my * 0.42;
      if (state.locked) {
        state.mouseNX *= Math.exp(-3.2 * dt);
        state.mouseNY *= Math.exp(-3.2 * dt);
      }
      var authority = 1 - state.warp * 0.52;   // 高速时机动性下降
      ATTITUDE.cmdYaw = yaw * authority;
      ATTITUDE.cmdPitch = pit * authority;
      ATTITUDE.cmdRoll = rol * authority;
      var kUp = 1 - Math.exp(-dt / ATTITUDE.spinUp);
      var kDown = 1 - Math.exp(-dt / ATTITUDE.coast);
      ATTITUDE.yaw += (ATTITUDE.cmdYaw - ATTITUDE.yaw) *
        (Math.abs(ATTITUDE.cmdYaw) > Math.abs(ATTITUDE.yaw) ? kUp : kDown);
      ATTITUDE.pitch += (ATTITUDE.cmdPitch - ATTITUDE.pitch) *
        (Math.abs(ATTITUDE.cmdPitch) > Math.abs(ATTITUDE.pitch) ? kUp : kDown);
      ATTITUDE.roll += (ATTITUDE.cmdRoll - ATTITUDE.roll) *
        (Math.abs(ATTITUDE.cmdRoll) > Math.abs(ATTITUDE.roll) ? kUp : kDown);
      qYaw.setFromAxisAngle(AXIS_Y, ATTITUDE.yaw * dt);
      qPitch.setFromAxisAngle(AXIS_X, ATTITUDE.pitch * dt);
      qRoll.setFromAxisAngle(AXIS_Z, ATTITUDE.roll * dt);
      ship.quaternion.multiply(qYaw).multiply(qPitch).multiply(qRoll).normalize();
      var AH = window.__NS_ATTITUDE__;
      AH.yaw = +ATTITUDE.yaw.toFixed(5); AH.pitch = +ATTITUDE.pitch.toFixed(5);
      AH.roll = +ATTITUDE.roll.toFixed(5);
      AH.cmdYaw = +ATTITUDE.cmdYaw.toFixed(5); AH.cmdPitch = +ATTITUDE.cmdPitch.toFixed(5);
      AH.cmdRoll = +ATTITUDE.cmdRoll.toFixed(5);
    }

    // 旗舰角速度 → 机动强度，驱动编队扰动与姿态滞后
    var dotQ = clamp(Math.abs(qPrev.dot(ship.quaternion)), 0, 1);
    var turnRate = Math.acos(dotQ) * 2 / Math.max(dt, 0.001);
    state.agility += (clamp(turnRate / 0.55, 0, 1) - state.agility) * (1 - Math.exp(-6 * dt));

    /* 速度 / 跃迁强度平滑 */
    var accel = state.gear === 4 ? 0.75 : 1.7;
    state.speedC += (state.targetC - state.speedC) * (1 - Math.exp(-accel * dt));
    if (Math.abs(state.speedC - state.targetC) < 0.00002) state.speedC = state.targetC;
    state.warp += ((state.gear === 4 ? 1 : 0) - state.warp) * (1 - Math.exp(-1.45 * dt));
    state.warp = clamp(state.warp, 0, 1);
    state.distanceKm += state.speedC * C_KMS * dt;

    forward.set(0, 0, -1).applyQuaternion(ship.quaternion);
    var visualSpeed = 6 + driveNorm * 240 + state.warp * 90;
    deltaVec.copy(forward).multiplyScalar(visualSpeed * dt);

    // 战斗态星流随巡航档位线性变化：前进二仍是 0.12（与 v1.1.1 一致），
    // 加速时星流更急、减速更缓，推进与接敌距离同步可感。
    // 必须声明在 if (dt > 0) 之外：首帧 dt=0 时 __NS_DRIVE__ 也会读取 cFlow，
    // 放在守卫内会让 cFlow 为 undefined 并在 .toFixed() 处抛异常（页面黑屏）。
    var cFlow = combat.active
      ? (state.gear === 4 ? 0 : clamp(0.12 + (driveNorm - 0.5) * 0.50, 0.02, 0.42))
      : 1;

    /* 星场：相对位移 + 循环包裹 */
    if (dt > 0) {
      var dx = deltaVec.x * cFlow, dy = deltaVec.y * cFlow, dz = deltaVec.z * cFlow;
      for (var i = 0; i < STAR_N; i++) {
        var j = i * 3;
        starPos[j] = wrap(starPos[j] - dx, HALF, FIELD);
        starPos[j + 1] = wrap(starPos[j + 1] - dy, HALF, FIELD);
        starPos[j + 2] = wrap(starPos[j + 2] - dz, HALF, FIELD);
      }
      starGeo.attributes.position.needsUpdate = true;
      starMat.uniforms.uTime.value = t;
      starMat.uniforms.uWarp.value = state.warp;

      var tail = -1 * (18 + driveNorm * 170 + state.warp * 110);
      for (var l = 0; l < LINE_N; l++) {
        var k = l * 3, q = l * 6;
        var bx = lineBase[k] = wrap(lineBase[k] - dx, HALF, FIELD);
        var by = lineBase[k + 1] = wrap(lineBase[k + 1] - dy, HALF, FIELD);
        var bz = lineBase[k + 2] = wrap(lineBase[k + 2] - dz, HALF, FIELD);
        var len = tail * (0.45 + lineLen[l] * 0.85);
        linePos[q] = bx; linePos[q + 1] = by; linePos[q + 2] = bz;
        linePos[q + 3] = bx + forward.x * len;
        linePos[q + 4] = by + forward.y * len;
        linePos[q + 5] = bz + forward.z * len;
      }
      lineGeo.attributes.position.needsUpdate = true;
      lineMat.uniforms.uWarp.value = clamp(state.warp + driveNorm * 0.5, 0, 1);

      // 远景恒星与行星随星场一起流动
      for (var b = 0; b < beacons.length; b++) {
        var s = beacons[b];
        s.position.x = wrap(s.position.x - dx, 6500, 13000);
        s.position.y = wrap(s.position.y - dy, 6500, 13000);
        s.position.z = wrap(s.position.z - dz, 6500, 13000);
      }
      planetGroup.position.x = wrap(planetGroup.position.x - dx, 6500, 13000);
      planetGroup.position.y = wrap(planetGroup.position.y - dy, 6500, 13000);
      planetGroup.position.z = wrap(planetGroup.position.z - dz, 6500, 13000);
      planet.rotation.y += dt * 0.02;
      sky.rotation.y += dt * (0.0006 + state.warp * 0.018);
    }
    sky.position.copy(camera.position);

    /* 引擎尾焰：档位量 driveNorm 线性 0.25 / 0.50 / 0.75 / 1.00，直接决定长度、
       粗细与亮度，各档增量基本一致；跃迁档只再叠加一小层。旧版用 0.55 次幂压缩
       再乘 3.9 倍跃迁系数，造成「前三档挤在一起、第四档突然爆开」的非线性台阶。*/
    var thrust = driveNorm;
    var flameScale = 0.38 + thrust * 2.30 + state.warp * 1.15;
    var flameWidth = 0.95 + thrust * 1.60 + state.warp * 0.30;
    flameMat.uniforms.uColor.value.setRGB(
      lerp(1.0, 0.48, state.warp), lerp(0.78, 0.88, state.warp), lerp(0.48, 1.0, state.warp)
    );
    flameMat.uniforms.uOpacity.value = 0.42 + thrust * 0.28 + state.warp * 0.12;
    flameOuterMat.uniforms.uOpacity.value = 0.08 + thrust * 0.22 + state.warp * 0.08;
    trailMat.uniforms.uOpacity.value = thrust * 0.035 + state.warp * 0.030;
    wingTrailMat.uniforms.uOpacity.value = thrust * 0.022 + state.warp * 0.025;
    // 四喷口双色材质：上方蓝、下方红；跃迁时略向白提亮，档位仍线性驱动亮度
    var coreOp = 0.42 + thrust * 0.28 + state.warp * 0.12;
    var haloOp = 0.08 + thrust * 0.22 + state.warp * 0.08;
    NS_FLAME_MATS.forEach(function (m, mi) {
      // 蓝色喷口叠在深蓝晶体上，略提亮度才不会被模型涂装吃掉
      m.uniforms.uOpacity.value = (mi % 2 ? haloOp : coreOp * (mi < 2 ? 1.30 - state.warp * 0.40 : 1));
      m.uniforms.uColor.value.setHex(NS_FLAME_BASE[mi]);
      if (state.warp > 0.001) m.uniforms.uColor.value.lerp(NS_WHITE, state.warp * (mi < 2 ? 0.15 : 0.28));
    });
    // scale.z 对应世界 Y：按喷口扁槽比例压扁，避免上下两排火焰糊成一片。
    // 占满引擎的蓝色喷口在跃迁档收敛增强量，防止加法混合叠成纯白过曝。
    var fillGain = 1 - state.warp * 0.30;
    flagship.flames.forEach(function (f) {
      var w = flameWidth * (f.userData.fillGain ? fillGain : 1);
      f.scale.set(w, flameScale, w * (f.userData.flat || 1));
    });
    flagship.outers.forEach(function (f) {
      var w = flameWidth * 0.92 * (f.userData.fillGain ? fillGain : 1);
      f.scale.set(w, flameScale * 0.85, w * (f.userData.flat || 1));
    });
    // 喷口炽光随档位线性放大；占满光核的额外倍率在跃迁时退回 1
    flagship.glows.forEach(function (sp) {
      var boost = sp.userData.fill || 1;
      var core = (2.2 + thrust * 3.0 + state.warp * 0.8) *
                 (1 + (boost - 1) * (1 - state.warp * 0.8));
      sp.scale.set(core, core * (sp.userData.flat || 1), 1);
    });
    flagship.trail.scale.y = 0.6 + thrust * 1.2 + state.warp * 0.8;
    wings.forEach(function (w) {
      w.flames.forEach(function (f) { f.scale.set(flameWidth, flameScale * 0.8, flameWidth); });
      w.outers.forEach(function (f) {
        f.scale.set(flameWidth * 0.9, flameScale * 0.7, flameWidth * 0.9);
      });
      w.trail.scale.y = 0.5 + thrust * 1.0 + state.warp * 0.7;
    });
    window.__NS_FLAME__ = {
      gear: state.gear, thrust: +thrust.toFixed(4),
      scale: +flameScale.toFixed(4), width: +flameWidth.toFixed(4),
      nozzleSource: window.__NS_NOZZLES__ ? window.__NS_NOZZLES__.source : 'none',
      nozzleCount: flagship.flames.length
    };
    engineLight.intensity = 1.2 + thrust * 2.0 + state.warp * 1.3;
    engineLightWarm.intensity = 0.9 + thrust * 1.7 + state.warp * 1.1;

    /* 旗舰轻微引擎震颤 */
    ship.position.set(
      Math.sin(t * 43) * 0.035 * state.warp,
      Math.cos(t * 37) * 0.028 * state.warp,
      0
    );

    /* 舰队编队：弹性归位 + 各舰不同的滞后/阻尼 + 机动扰动，不再刚性焊死 */
    state.formationBlend = Math.min(1, state.formationBlend + dt / 1.6);
    var fpts = FORMATIONS[state.formation].pts;
    var wobbleGain = 0.8 + state.agility * 6.5 + state.warp * 3.0;
    // 高机动时编队整体向外松散，机动结束再收拢，队形不会永远笔直完美
    var spread = 1 + state.agility * 0.22 + state.warp * 0.10;
    // 编队航向滞后：qFleet 慢跟随 ship.quaternion，高速时更迟钝；差值转成
    // 确定性的转弯离心侧偏，整队向外甩出、转完由弹性收回（不是随机抖动）。
    var fleetTurn = 0.95 / (1 + driveNorm * 1.5);
    qFleet.slerp(ship.quaternion, 1 - Math.exp(-fleetTurn * dt));
    qFleetDelta.copy(qFleet).invert().multiply(ship.quaternion);
    tmpEuler.setFromQuaternion(qFleetDelta);
    var fleetSlide = clamp(tmpEuler.y, -0.5, 0.5) * 16;
    wings.forEach(function (w, idx) {
      var p = fpts[idx];
      tmpVec.set(
        p[0] * spread + fleetSlide + Math.sin(t * (0.42 + w.seed * 0.5) + w.phase) * w.wobble * wobbleGain,
        p[1] * spread + Math.sin(t * (0.35 + w.seed * 0.6) + w.phase * 1.7) * w.wobble * wobbleGain * 0.75,
        p[2] * spread * (1 + state.warp * 0.22) + Math.cos(t * (0.3 + w.seed * 0.45) + w.phase) * w.wobble * wobbleGain
      ).applyQuaternion(qFleet).add(ship.position);

      // 切阵型与剧烈滚转时刚度下降，编队先被甩开、再逐渐收拢
      var stiff = w.stiff * (0.22 + 0.78 * state.formationBlend) * (1 - state.agility * 0.60);
      w.vel.x += ((tmpVec.x - w.pos.x) * stiff - w.vel.x * w.damp) * dt;
      w.vel.y += ((tmpVec.y - w.pos.y) * stiff - w.vel.y * w.damp) * dt;
      w.vel.z += ((tmpVec.z - w.pos.z) * stiff - w.vel.z * w.damp) * dt;
      w.pos.x += w.vel.x * dt;
      w.pos.y += w.vel.y * dt;
      w.pos.z += w.vel.z * dt;
      w.group.position.copy(w.pos);

      // 姿态独立跟随：滚转时各舰先后不一，另有小幅自主摇摆
      qTarget.copy(qFleet);
      var wob = (0.012 + state.agility * 0.11 + state.warp * 0.025) * w.wobble;
      qWobble.setFromEuler(tmpEuler.set(
        Math.sin(t * 0.7 + w.phase) * wob,
        Math.sin(t * 0.5 + w.phase * 1.3) * wob,
        Math.sin(t * 0.9 + w.phase * 0.7) * wob * 2.8
      ));
      qTarget.multiply(qWobble);
      w.group.quaternion.slerp(qTarget, 1 - Math.exp(-w.turn * dt));
    });
    FLEET_HOOK.lagDeg = +(2 * Math.acos(clamp(Math.abs(qFleet.dot(ship.quaternion)), 0, 1))
                          * 180 / Math.PI).toFixed(3);
    FLEET_HOOK.driveNorm = +driveNorm.toFixed(4);
    FLEET_HOOK.wx = +wings[0].pos.x.toFixed(3);
    FLEET_HOOK.wy = +wings[0].pos.y.toFixed(3);
    FLEET_HOOK.wz = +wings[0].pos.z.toFixed(3);

    /* 第三人称跟随相机：zoom 改变跟随距离；orbitYaw/Pitch 让机位绕旗舰本体旋转。
       默认仍看向舰首前方；一旦开始环绕，注视点平滑收到舰体中心，方便观察整舰。 */
    var view = CAMS[state.camIndex];
    var zf = state.zoom;
    qOrbitPitch.setFromAxisAngle(AXIS_X, state.orbitPitch);
    qOrbitYaw.setFromAxisAngle(AXIS_Y, state.orbitYaw);
    desiredPos.set((view.x || 0) * zf, (view.y + Math.sin(t * 0.6) * 0.35) * zf, view.z * zf)
      .applyQuaternion(qOrbitPitch).applyQuaternion(qOrbitYaw)
      .applyQuaternion(ship.quaternion).add(ship.position);
    // up 轴跟着环绕一起转，镜头走到舰顶 / 舰腹时 lookAt 不会退化
    upVec.set(0, 1, 0).applyQuaternion(qOrbitPitch).applyQuaternion(qOrbitYaw)
      .applyQuaternion(ship.quaternion);
    var orbitWeight = clamp(Math.max(Math.abs(state.orbitYaw) / 0.9,
                                     Math.abs(state.orbitPitch) / 0.55), 0, 1);
    lookTarget.set(0, 0, -140 * (1 - orbitWeight))
      .applyQuaternion(ship.quaternion).add(ship.position);
    camera.position.lerp(desiredPos, 1 - Math.exp(-6.5 * dt));
    if (dt > 0 && state.warp > 0.05) {
      camera.position.x += (Math.random() - 0.5) * state.warp * 0.32;
      camera.position.y += (Math.random() - 0.5) * state.warp * 0.32;
    }
    camHelper.position.copy(camera.position);
    camHelper.up.copy(upVec);
    camHelper.lookAt(lookTarget);
    camera.quaternion.slerp(camHelper.quaternion, 1 - Math.exp(-7 * dt));
    var targetFov = view.fov + driveNorm * 12 + state.warp * 8;
    camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-3 * dt));
    camera.updateProjectionMatrix();
    combatCameraOverride(dt);
    window.__NS_CAM__ = {
      x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2),
      z: +camera.position.z.toFixed(2), upY: +upVec.y.toFixed(3),
      lookX: +lookTarget.x.toFixed(2), lookY: +lookTarget.y.toFixed(2),
      lookZ: +lookTarget.z.toFixed(2)
    };

    /* CSS 视觉层 */
    var fxAmt = clamp(state.warp * 0.42 + driveNorm * 0.10, 0, 1);
    el.fxLines.style.opacity = (fxAmt * 0.5).toFixed(3);
    el.fxLines.style.visibility = fxAmt > 0.02 ? 'visible' : 'hidden';
    el.fxGlow.style.opacity = (state.warp * 0.70 + driveNorm * 0.12).toFixed(3);
    el.fxLines.style.transform = 'rotate(' + (t * (4 + state.warp * 26)).toFixed(2) + 'deg) scale(' + (1 + state.warp * 0.35).toFixed(3) + ')';

    updateAudio();
    drawRadar(t);
    combatUpdate(dt, t);
    hudAccum += dt;
    if (hudAccum > 0.1) { hudAccum = 0; updateHUD(); }

    updateViewChip();
    var V = window.__NS_VIEW__;
    V.zoom = +state.zoom.toFixed(4); V.zoomTarget = +state.zoomTarget.toFixed(4);
    V.magnification = +(1 / state.zoomTarget).toFixed(4);
    V.orbitYaw = +state.orbitYaw.toFixed(4); V.orbitPitch = +state.orbitPitch.toFixed(4);
    V.orbitYawTarget = +state.orbitYawTarget.toFixed(4);
    V.orbitPitchTarget = +state.orbitPitchTarget.toFixed(4);
    V.compact = state.compact; V.mode = gt.mode; V.touches = gt.count;
    V.mouseNX = +state.mouseNX.toFixed(4); V.mouseNY = +state.mouseNY.toFixed(4);
    V.driveNorm = +driveNorm.toFixed(4);
    window.__NS_DRIVE__ = { gear: state.gear, c: +state.speedC.toFixed(4),
                            norm: +driveNorm.toFixed(4), visualSpeed: +visualSpeed.toFixed(2),
                            fov: +targetFov.toFixed(2), thrust: +thrust.toFixed(4),
                            flow: +cFlow.toFixed(4) };
    var op = document.querySelector('.panel.open, .hintbar.open');
    V.dockOpen = op ? op.id : '';
  }

  /* ================= 循环 ================= */
  var last = performance.now(), clock = 0, hudAccum = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var raw = (now - last) / 1000;
    last = now;
    var dt = state.paused ? 0 : clamp(raw, 0, 0.05);
    clock += dt;
    update(dt, clock);
    renderer.render(scene, camera);
  }
  // 支持 ?autostart=1&gear=4 直接进入指定档位（便于演示 / 自动验证）
  var qs = new URLSearchParams(window.location.search);
  var autoRoll = qs.get('roll') === '1';
  if (qs.get('autostart') === '1') {
    el.start.classList.add('hidden');
    setGear(clamp(parseInt(qs.get('gear') || '2', 10) || 0, 0, 4), true);
    if (qs.get('instant') === '1') {
      state.speedC = state.targetC;
      state.warp = state.gear === 4 ? 1 : 0;
    }
  }
  if (qs.get('campaign') === '1') {
    el.start.classList.add('hidden');
    combatStart(clamp(parseInt(qs.get('mission') || '1', 10) || 1, 1, CAMPAIGN_MISSIONS.length));
  }
  if (qs.has('formation')) {
    state.formation = clamp(parseInt(qs.get('formation'), 10) || 0, 0, FORMATIONS.length - 1);
    var fp = FORMATIONS[state.formation].pts;
    wings.forEach(function (w, i) {
      w.pos.set(fp[i][0], fp[i][1], fp[i][2]);
      w.group.position.copy(w.pos);
      w.vel.set(0, 0, 0);
    });
    el.formation.textContent = FORMATIONS[state.formation].name;
    el.radarLabel.textContent = (state.formation + 1) + '/' + FORMATIONS.length + ' ' + FORMATIONS[state.formation].name;
  }
  // ?orbit=<deg>&pitch=<deg>：直接以环绕观察角度开场（方便看舰，也便于分享定格视角）
  var demoOrbit = parseFloat(qs.get('orbit'));
  if (isFinite(demoOrbit)) {
    state.orbitYaw = state.orbitYawTarget = clamp(demoOrbit * Math.PI / 180, -PI2 * 2, PI2 * 2);
    var demoPitch = parseFloat(qs.get('pitch'));
    state.orbitPitch = state.orbitPitchTarget = isFinite(demoPitch)
      ? clamp(demoPitch * Math.PI / 180, -ORBIT_PITCH_MAX, ORBIT_PITCH_MAX) : 0;
  }
  camera.position.set(CAMS[0].x, CAMS[0].y, CAMS[0].z);
  if (state.orbitYaw || state.orbitPitch) {
    qOrbitPitch.setFromAxisAngle(AXIS_X, state.orbitPitch);
    qOrbitYaw.setFromAxisAngle(AXIS_Y, state.orbitYaw);
    camera.position.applyQuaternion(qOrbitPitch).applyQuaternion(qOrbitYaw);
    camera.lookAt(0, 0, 0);                    // 环绕开场时直接对准舰体中心
  } else {
    camera.lookAt(0, 0, -140);
  }
  updateGearButtons();
  updateHUD();
  drawRadar(0);
  requestAnimationFrame(loop);
})();
