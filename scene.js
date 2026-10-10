import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// The photograph is a local visual reference. These units are intentionally
// not exposed as surveyed distances or geographical coordinates.
const MAP_SIZE = 120;
const MAP_URL = new URL('./assets/aerial-top.png', import.meta.url).href;
const LOGO_URL = new URL('./assets/logo.png', import.meta.url).href;
const RED = 0xff342e;
const POI_UV = { camp: [.478, .488], parking: [.12, .16] };
const pointFromUV = ([u, v], height = 0) => new THREE.Vector3((u - .5) * MAP_SIZE, height, (v - .5) * MAP_SIZE);

function stoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const image = context.createImageData(128, 128);
  let seed = 913;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = 36 + random() * 30;
    image.data[i] = n; image.data[i + 1] = n + 2; image.data[i + 2] = n + 3; image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.strokeStyle = 'rgba(118,125,126,.20)';
  context.lineWidth = .7;
  for (let i = 0; i < 28; i++) {
    context.beginPath(); context.moveTo(random() * 128, random() * 128);
    context.lineTo(random() * 128, random() * 128); context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 3);
  return texture;
}

function tentGeometry(width = 1.8, depth = 2.1, height = 1.42) {
  const x = width / 2, z = depth / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -x, 0, -z, 0, height, -z, -x, 0, z,
    -x, 0, z, 0, height, -z, 0, height, z,
    0, height, -z, x, 0, -z, 0, height, z,
    0, height, z, x, 0, -z, x, 0, z,
    -x, 0, -z, x, 0, -z, 0, height, -z,
    x, 0, z, -x, 0, z, 0, height, z,
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
}

function ease(t) { return t * t * (3 - 2 * t); }

function canopyGeometry(width, depth, height) {
  const x = width / 2, z = depth / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -x, 0, -z, x, 0, -z, 0, height, 0,
    x, 0, -z, x, 0, z, 0, height, 0,
    x, 0, z, -x, 0, z, 0, height, 0,
    -x, 0, z, -x, 0, -z, 0, height, 0,
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
}

function stallSign(text, accent) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e7d8bb'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.strokeRect(9, 9, 494, 110);
  ctx.fillStyle = '#363128'; ctx.font = '600 51px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 67);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
}

export async function createCampScene(container, options = {}) {
  const { onSelect = () => {}, onReady = () => {}, onError = () => {}, reducedMotion = false } = options;
  let renderer;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!context) throw new Error('当前浏览器未提供 WebGL 2，请切换到 Safari 或 Chrome，或查看实景照片。');
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
  } catch (error) { onError(error); throw error; }

  const mobile = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:grab';
  renderer.domElement.setAttribute('aria-label', '黑石营地三维航拍地图，可拖动、缩放并点击营地设施');
  renderer.domElement.setAttribute('role', 'img');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18241e);
  const camera = new THREE.PerspectiveCamera(42, 1, .5, 1200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .075;
  controls.screenSpacePanning = false;
  controls.minDistance = 12; controls.maxDistance = 450;
  controls.minPolarAngle = .025; controls.maxPolarAngle = Math.PI * .415;
  controls.rotateSpeed = .55; controls.zoomSpeed = .85; controls.panSpeed = .8;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const hemi = new THREE.HemisphereLight(0xe5f1ff, 0x3f4930, 2.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffedcf, 3.1);
  sun.position.set(-35, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
  sun.shadow.camera.right = sun.shadow.camera.top = 20;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
  scene.add(sun);

  const loaders = new THREE.TextureLoader();
  let aerialTexture, logoTexture;
  try {
    [aerialTexture, logoTexture] = await Promise.all([loaders.loadAsync(MAP_URL), loaders.loadAsync(LOGO_URL)]);
  } catch (error) {
    renderer.dispose(); renderer.domElement.remove();
    const reason = new Error('地图素材未加载成功。请通过网页服务器打开工程，并检查 assets 文件夹。');
    onError(reason); throw reason;
  }
  aerialTexture.colorSpace = logoTexture.colorSpace = THREE.SRGBColorSpace;
  aerialTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  logoTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const mapMaterial = new THREE.MeshBasicMaterial({ map: aerialTexture, toneMapped: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), mapMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const mapBase = new THREE.Mesh(new THREE.BoxGeometry(120, .4, 120), new THREE.MeshStandardMaterial({ color: 0x273c32, roughness: 1 }));
  mapBase.position.y = -.5; scene.add(mapBase);

  const camp = pointFromUV(POI_UV.camp);
  const parking = pointFromUV(POI_UV.parking);
  const forward = parking.clone().sub(camp).setY(0).normalize();
  const yaw = Math.atan2(-forward.x, -forward.z);
  const campFrame = new THREE.Group(); campFrame.position.copy(camp); campFrame.rotation.y = yaw; scene.add(campFrame);
  const layers = {};
  for (const name of ['buildings', 'tents', 'food', 'mirrors', 'stalls', 'lasers', 'route', 'boundary', 'markers']) {
    layers[name] = new THREE.Group();
    if (['buildings', 'tents', 'food', 'mirrors', 'stalls', 'lasers', 'boundary'].includes(name)) campFrame.add(layers[name]);
    else scene.add(layers[name]);
  }
  const setPoi = (object, id) => { object.userData.poi = id; return object; };
  const pickables = [];
  const add = (mesh, group, id) => {
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (id) { setPoi(mesh, id); pickables.push(mesh); }
    group.add(mesh); return mesh;
  };
  const stone = new THREE.MeshStandardMaterial({ color: 0x868d90, map: stoneTexture(), roughness: 1 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x191d20, roughness: .96, metalness: .02 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x343b3d, roughness: .55, metalness: .55 });
  const logoMaterial = new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: .96, side: THREE.DoubleSide });
  const box = (size, at, material, group, id) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at); return add(mesh, group, id);
  };

  // Eight metre proportions are used for the design model only.
  const campFloor = box([8, .14, 8], [0, .09, 0], cloth, layers.buildings, 'camp');
  const campRoof = box([8, .17, 8], [0, 4, 0], cloth, layers.buildings, 'camp');
  box([8, 3.85, .1], [0, 2, 3.96], cloth, layers.buildings, 'camp');
  box([.1, 3.85, 8], [-3.96, 2, 0], cloth, layers.buildings, 'camp');
  box([.1, 3.85, 8], [3.96, 2, 0], cloth, layers.buildings, 'camp');
  box([2.42, 3.85, .1], [-2.79, 2, -3.96], cloth, layers.buildings, 'camp');
  box([2.42, 3.85, .1], [2.79, 2, -3.96], cloth, layers.buildings, 'camp');
  box([3.15, .63, .12], [0, 3.66, -3.96], cloth, layers.buildings, 'camp');
  for (const x of [-3.93, 3.93]) for (const z of [-3.93, 0, 3.93]) box([.07, 3.9, .07], [x, 2, z], steel, layers.buildings, 'camp');
  const roofLogo = new THREE.Mesh(new THREE.PlaneGeometry(4.55, 4.55), logoMaterial);
  roofLogo.rotation.x = -Math.PI / 2; roofLogo.position.y = 4.1; layers.buildings.add(roofLogo);
  const insideLight = new THREE.PointLight(0xff211b, 0, 11, 1.5);
  insideLight.position.set(0, 2.2, -1.3); layers.buildings.add(insideLight);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xff251e, transparent: true, opacity: .08, blending: THREE.AdditiveBlending, depthWrite: false });
  const interior = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7.4), glowMaterial);
  interior.rotation.x = -Math.PI / 2; interior.position.y = .18; layers.buildings.add(interior);
  const doorwayGlow = box([3, .025, .13], [0, .19, -3.92], new THREE.MeshBasicMaterial({ color: 0xff493f, toneMapped: false }), layers.buildings, 'camp');
  doorwayGlow.visible = false;

  const steles = [];
  for (const x of [-2.1, 2.1]) {
    steles.push(box([1.2, 2.5, .35], [x, 1.28, -9], stone, layers.buildings, 'entrance'));
    box([1.45, .12, .75], [x, .06, -9], stone, layers.buildings, 'entrance');
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(.97, .97), logoMaterial);
    glyph.position.set(x, 1.79, -9.181); glyph.rotation.y = Math.PI; layers.buildings.add(glyph);
  }
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.ShadowMaterial({ opacity: .26, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.set(0, .045, 0); shadowPlane.receiveShadow = true; campFrame.add(shadowPlane);

  const tentMaterials = [0xccb99b, 0xa8a497, 0xc7c1b2, 0xb7ad93].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
  const tentShape = tentGeometry();
  const tents = [];
  for (let index = 0; index < 10; index++) {
    const group = new THREE.Group();
    group.position.set(index < 5 ? -10 : -7, .03, -5 + (index % 5) * 3);
    layers.tents.add(group); tents.push(group);
    add(new THREE.Mesh(tentShape, tentMaterials[index % tentMaterials.length]), group, 'tents');
    // A smaller dark triangle produces an entrance without a black contour.
    const openingGeometry = new THREE.BufferGeometry();
    openingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, .03, -1.06, .5, .03, -1.06, 0, .91, -1.06], 3));
    openingGeometry.computeVertexNormals();
    add(new THREE.Mesh(openingGeometry, new THREE.MeshStandardMaterial({ color: 0x46413a, roughness: 1, side: THREE.DoubleSide })), group, 'tents');
  }

  const truck = new THREE.Group(); truck.position.set(7, 0, -8); truck.rotation.y = -.2; layers.food.add(truck);
  const truckBody = new THREE.MeshStandardMaterial({ color: 0xc8b99c, roughness: .8, metalness: .08 });
  box([2.2, 1.85, 3.7], [0, 1.2, 0], truckBody, truck, 'food');
  box([2.05, .16, 3.9], [0, 2.2, 0], cloth, truck, 'food');
  box([.03, .66, 2.35], [-1.12, 1.52, -.12], new THREE.MeshStandardMaterial({ color: 0x293438, roughness: .5 }), truck, 'food');
  box([.66, .09, 2.6], [-1.37, 1.12, -.12], truckBody, truck, 'food');
  for (const x of [-1.05, 1.05]) for (const z of [-1.17, 1.17]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .19, 10), cloth);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .35, z); add(wheel, truck, 'food');
  }

  const stalls = [];
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x5a4936, roughness: .92 });
  const canopyMaterials = {
    henna: new THREE.MeshStandardMaterial({ color: 0xc59466, roughness: 1, side: THREE.DoubleSide }),
    clothes: new THREE.MeshStandardMaterial({ color: 0xbdb09a, roughness: 1, side: THREE.DoubleSide }),
  };
  for (const [id, z] of [['henna', -4], ['clothes', 0]]) {
    const group = new THREE.Group(); group.position.set(9, 0, z); group.userData.poi = id;
    layers.stalls.add(group); stalls.push(group);
    for (const x of [-1.2, 1.2]) for (const depth of [-1.25, 1.25]) box([.075, 2.36, .075], [x, 1.18, depth], postMaterial, group, id);
    const canopy = new THREE.Mesh(canopyGeometry(2.8, 2.9, .53), canopyMaterials[id]);
    canopy.position.y = 2.36; add(canopy, group, id);
    box([2.25, .9, .48], [0, .46, -1.12], canopyMaterials[id], group, id);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.62, .4), stallSign(id === 'henna' ? 'HENNA' : 'HIPPIE', id === 'henna' ? '#9e4a32' : '#517971'));
    sign.position.set(0, 2.14, -1.28); sign.rotation.y = Math.PI; add(sign, group, id);
    if (id === 'henna') {
      box([.57, .55, .53], [-.55, .28, .24], postMaterial, group, id);
      box([.57, .55, .53], [.55, .28, .24], postMaterial, group, id);
      box([.42, .025, .30], [.56, .932, -1.08], new THREE.MeshStandardMaterial({ color: 0x473429, roughness: 1 }), group, id);
    } else {
      for (const x of [-1.0, 1.0]) box([.055, 1.7, .055], [x, .87, .51], steel, group, id);
      box([2.02, .055, .055], [0, 1.72, .51], steel, group, id);
      const garment = new THREE.Shape();
      garment.moveTo(-.18, 0); garment.lineTo(.18, 0); garment.lineTo(.2, .5);
      garment.lineTo(.32, .42); garment.lineTo(.4, .59); garment.lineTo(.2, .77);
      garment.lineTo(.10, .77); garment.lineTo(0, .68); garment.lineTo(-.10, .77);
      garment.lineTo(-.2, .77); garment.lineTo(-.4, .59); garment.lineTo(-.32, .42); garment.lineTo(-.2, .5); garment.closePath();
      const garmentGeometry = new THREE.ExtrudeGeometry(garment, { depth: .025, bevelEnabled: false, steps: 1 });
      for (const [index, color] of [0xb85939, 0x436e61, 0xa39154].entries()) {
        const clothing = new THREE.Mesh(garmentGeometry, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
        clothing.position.set((index - 1) * .68, .84, .50); add(clothing, group, id);
      }
    }
  }

  const mirrorMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: .045, envMapIntensity: 1.18, clearcoat: .2, clearcoatRoughness: .02 });
  const mirrors = [];
  for (const [x, z, angle] of [[6.3, 4.9, 45], [8.8, 5.7, 0], [6.9, 7.9, 60], [9.6, 8.4, -20]]) {
    const mirror = box([.6, 1.8, .1], [x, .94, z], mirrorMaterial, layers.mirrors, 'mirrors');
    mirror.rotation.y = THREE.MathUtils.degToRad(angle); mirrors.push(mirror);
  }

  const laserCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xff211a, transparent: true, opacity: .94, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const laserAuraMaterial = new THREE.MeshBasicMaterial({ color: 0xff291e, transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const makeBeam = (from, to, coreRadius = .022, auraRadius = .09) => {
    const group = new THREE.Group();
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    group.position.copy(start).add(end).multiplyScalar(.5);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const core = new THREE.Mesh(new THREE.CylinderGeometry(coreRadius, coreRadius, direction.length(), 6, 1, true), laserCoreMaterial);
    const aura = new THREE.Mesh(new THREE.CylinderGeometry(auraRadius, auraRadius, direction.length(), 8, 1, true), laserAuraMaterial);
    group.add(aura, core); group.userData.from = start; group.userData.to = end; group.userData.core = core;
    layers.lasers.add(group); return group;
  };
  const roofBeam = makeBeam([0, 4.11, 0], [0, 36.11, 0], .025, .105);
  const mirrorLaserPoints = mirrors.map((mirror, index) => [mirror.position.x, [1.12, 1.38, 1.16, 1.32][index], mirror.position.z]);
  const connectionBeams = [[0, 1], [1, 3], [3, 2], [0, 3]].map(([from, to]) => makeBeam(mirrorLaserPoints[from], mirrorLaserPoints[to], .015, .065));
  layers.lasers.visible = false;

  const mirrorCubeTarget = new THREE.WebGLCubeRenderTarget(mobile ? 128 : 256, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const reflectionCamera = new THREE.CubeCamera(.15, 450, mirrorCubeTarget);
  campFrame.updateMatrixWorld(true);
  reflectionCamera.position.copy(campFrame.localToWorld(new THREE.Vector3(7.9, 1.15, 6.8))); scene.add(reflectionCamera);
  const reflectionSky = new THREE.Mesh(new THREE.SphereGeometry(220, 16, 10), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: {
      zenith: { value: new THREE.Color(0x7198bb) }, horizon: { value: new THREE.Color(0xd5d7cc) },
      earth: { value: new THREE.Color(0x586e45) }, lightDirection: { value: sun.position.clone().normalize() },
      brightness: { value: 1.0 },
    },
    vertexShader: 'varying vec3 direction; void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 direction; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 earth; uniform vec3 lightDirection; uniform float brightness; void main(){vec3 d=normalize(direction);vec3 c=mix(horizon,zenith,smoothstep(0.0,0.85,d.y));c=mix(c,earth,smoothstep(0.0,0.65,-d.y));c+=vec3(0.22)*pow(max(dot(d,lightDirection),0.0),48.0)*brightness;gl_FragColor=vec4(c,1.0);}',
  }));
  reflectionSky.position.copy(reflectionCamera.position); reflectionSky.visible = false; scene.add(reflectionSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let mirrorEnvironment = null, reflectionCaptures = 0, reflectionDirty = true;

  const boundaryMaterial = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: .82, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const boundary = new THREE.Mesh(new THREE.RingGeometry(14.42, 14.53, 160), boundaryMaterial);
  boundary.rotation.x = -Math.PI / 2; boundary.position.set(0, .065, 0); layers.boundary.add(boundary);
  const ringAura = new THREE.Mesh(new THREE.RingGeometry(14.25, 14.73, 160), new THREE.MeshBasicMaterial({ color: RED, opacity: .09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  ringAura.rotation.x = -Math.PI / 2; ringAura.position.set(0, .064, 0); layers.boundary.add(ringAura);

  campFrame.updateMatrixWorld(true);
  const world = (local) => campFrame.localToWorld(new THREE.Vector3(...local));
  const poiLocals = { camp: [0, 4.6, 0], entrance: [0, 2.7, -9], tents: [-8.5, 1.8, 1], food: [7, 2.8, -8], mirrors: [8, 2.3, 6.7], henna: [9, 3.3, -4], clothes: [9, 3.3, 0] };
  const poiLocations = Object.fromEntries(Object.entries(poiLocals).map(([id, local]) => [id, world(local)]));
  poiLocations.parking = parking.clone().setY(1.4);
  const entryGround = world([0, .13, -11.3]);
  const routeCurve = new THREE.CatmullRomCurve3([
    parking.clone().setY(.14), pointFromUV([.222, .205], .14),
    pointFromUV([.279, .285], .14), pointFromUV([.325, .38], .14), entryGround,
  ]);
  const routeMaterial = new THREE.LineDashedMaterial({ color: 0xffdfb7, dashSize: 1.0, gapSize: .6, transparent: true, opacity: .9, toneMapped: false });
  const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(routeCurve.getPoints(100)), routeMaterial);
  route.computeLineDistances(); layers.route.add(route);
  const routeDots = [];
  const routeDotGeometry = new THREE.SphereGeometry(.20, 8, 6);
  const routeDotMaterial = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false });
  for (let i = 0; i < 5; i++) {
    const dot = new THREE.Mesh(routeDotGeometry, routeDotMaterial); layers.route.add(dot); routeDots.push(dot);
  }
  // The route is a visual wayfinding sketch, not turn-by-turn navigation.
  layers.route.visible = false;

  const markerMaterial = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false });
  const markerCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2df, toneMapped: false });
  const markers = {};
  const campMarkers = new THREE.Group(); campFrame.add(campMarkers);
  for (const [id, location] of Object.entries(poiLocations)) {
    const group = new THREE.Group();
    if (id === 'parking') { group.position.copy(location); layers.markers.add(group); }
    else { group.position.set(...poiLocals[id]); campMarkers.add(group); }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.51, .065, 6, 24), markerMaterial);
    halo.rotation.x = -Math.PI / 2; group.add(halo);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.21, 10, 8), markerCoreMaterial); group.add(dot);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    setPoi(hit, id); hit.userData.marker = true; pickables.push(hit); group.add(hit); markers[id] = group;
  }
  const selectedRing = new THREE.Mesh(new THREE.RingGeometry(.8, 1.03, 48), new THREE.MeshBasicMaterial({ color: RED, opacity: .8, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  selectedRing.rotation.x = -Math.PI / 2; selectedRing.visible = false; scene.add(selectedRing);

  // Shared local reflection probe captures the actual neighbouring models and
  // aerial grass texture. It is refreshed on scene changes, never every frame.
  const captureReflections = () => {
    const hidden = [layers.mirrors, layers.markers, campMarkers, layers.lasers, layers.boundary, layers.route, selectedRing];
    const previousVisibility = hidden.map(object => object.visible);
    const previousBackground = scene.background;
    const previousTarget = renderer.getRenderTarget();
    hidden.forEach(object => { object.visible = false; }); reflectionSky.visible = true;
    try {
      reflectionCamera.update(renderer, scene);
      const environment = pmrem.fromCubemap(mirrorCubeTarget.texture);
      const oldEnvironment = mirrorEnvironment;
      mirrorEnvironment = environment; mirrorMaterial.envMap = environment.texture; mirrorMaterial.needsUpdate = true;
      oldEnvironment?.dispose(); reflectionCaptures++; reflectionDirty = false;
    } finally {
      hidden.forEach((object, index) => { object.visible = previousVisibility[index]; });
      reflectionSky.visible = false; scene.background = previousBackground; renderer.setRenderTarget(previousTarget);
    }
  };

  const boundsInCamp = object => {
    campFrame.updateWorldMatrix(true, true);
    const inverseCamp = campFrame.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    object.traverse(child => {
      if (!child.isMesh || !child.geometry) return;
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
      const transform = inverseCamp.clone().multiply(child.matrixWorld);
      bounds.union(child.geometry.boundingBox.clone().applyMatrix4(transform));
    });
    return { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new THREE.Vector3()).toArray() };
  };
  const modelLayout = (object, extra = {}) => {
    const footprint = boundsInCamp(object);
    return { x: object.position.x, z: object.position.z, width: footprint.size[0], depth: footprint.size[2], height: footprint.size[1], rotation: object.rotation.y, footprint, ...extra };
  };
  const worldFootprint = object => {
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    return { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new THREE.Vector3()).toArray() };
  };
  const getLayout = () => ({
    coordinateSystem: 'camp-local',
    campUV: [...POI_UV.camp], anchorWorld: camp.toArray(), overallScale,
    camp: { width: campFloor.geometry.parameters.width, depth: campFloor.geometry.parameters.depth, height: campRoof.position.y },
    entranceCorridor: { minX: -1.5, maxX: 1.5, minZ: -14, maxZ: -4 },
    boundaryRadius: (boundary.geometry.parameters.innerRadius + boundary.geometry.parameters.outerRadius) / 2,
    tents: tents.map(tent => modelLayout(tent)),
    mirrors: mirrors.map(mirror => modelLayout(mirror, {
      width: mirror.geometry.parameters.width, depth: mirror.geometry.parameters.depth, height: mirror.geometry.parameters.height,
      material: { metalness: mirror.material.metalness, roughness: mirror.material.roughness, envMap: Boolean(mirror.material.envMap) },
      worldFootprint: worldFootprint(mirror), displayFootprint: worldFootprint(mirror),
    })),
    stalls: stalls.map(stall => modelLayout(stall, { id: stall.userData.poi })),
    food: modelLayout(truck),
    reflections: { mode: 'cube-camera', captureCount: reflectionCaptures },
  });

  const beamState = beam => ({
    from: beam.userData.from.toArray(), to: beam.userData.to.toArray(),
    worldFrom: world(beam.userData.from.toArray()).toArray(), worldTo: world(beam.userData.to.toArray()).toArray(),
    visible: visibleInTree(beam),
  });
  const getLasers = () => ({
    visible: layers.lasers.visible,
    roofBeam: { ...beamState(roofBeam), origin: roofBeam.userData.from.toArray(), height: roofBeam.userData.core.geometry.parameters.height, worldHeight: roofBeam.userData.core.geometry.parameters.height * overallScale },
    connections: connectionBeams.map(beamState),
  });

  let disposed = false, paused = false, frame = 0, night = false, view = 'overview', selected = null, transition = null;
  let overallScale = .7, lasersEnabled = true;
  let width = 1, height = 1, lastFrame = 0;
  const projected = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let down = null;
  const overviewPosition = () => {
    const distance = Math.max(145, 72 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect)));
    return new THREE.Vector3(.23, .80, .57).normalize().multiplyScalar(distance);
  };
  const transitionTo = (position, target, duration = 950) => {
    if (reducedMotion) { camera.position.copy(position); controls.target.copy(target); controls.update(); transition = null; return; }
    transition = { start: performance.now(), duration, from: camera.position.clone(), to: position, targetFrom: controls.target.clone(), targetTo: target };
  };
  const setView = (name) => {
    if (!['overview', 'camp', 'top'].includes(name)) return;
    view = name;
    if (name === 'overview') transitionTo(overviewPosition(), new THREE.Vector3());
    if (name === 'top') {
      const p = overviewPosition();
      transitionTo(new THREE.Vector3(0, p.length() * .88, .01), new THREE.Vector3());
    }
    if (name === 'camp') {
      const target = camp.clone().setY(1.1 * overallScale);
      const fit = Math.max(1, .86 / camera.aspect);
      transitionTo(target.clone().add(new THREE.Vector3(forward.x * 28, 28, forward.z * 28).multiplyScalar(fit)), target);
    }
  };
  const select = (id, notify = true) => {
    if (!(id in poiLocations)) return;
    selected = id;
    if (id === 'parking') { scene.add(selectedRing); selectedRing.position.copy(poiLocations[id]); }
    else { campFrame.add(selectedRing); selectedRing.position.set(...poiLocals[id]); }
    selectedRing.position.y += .03; selectedRing.visible = true;
    if (id !== 'parking') setView('camp');
    else {
      view = 'overview';
      const target = parking.clone();
      transitionTo(target.clone().add(overviewPosition().multiplyScalar(.52)), target);
    }
    if (notify) onSelect(id);
  };
  const setNight = (value) => {
    night = Boolean(value);
    mapMaterial.color.set(night ? 0x718693 : 0xffffff);
    scene.background.set(night ? 0x091219 : 0x18241e);
    hemi.intensity = night ? .72 : 2.3;
    sun.intensity = night ? .65 : 3.1;
    sun.color.set(night ? 0x9fc4f0 : 0xffedcf);
    insideLight.intensity = night ? 32 : 0;
    glowMaterial.opacity = night ? .48 : .08;
    doorwayGlow.visible = night;
    layers.lasers.visible = night && lasersEnabled;
    boundaryMaterial.opacity = night ? .98 : .82;
    reflectionSky.material.uniforms.zenith.value.set(night ? 0x122539 : 0x7198bb);
    reflectionSky.material.uniforms.horizon.value.set(night ? 0x4b6071 : 0xd5d7cc);
    reflectionSky.material.uniforms.earth.value.set(night ? 0x26372d : 0x586e45);
    reflectionSky.material.uniforms.brightness.value = night ? .2 : 1;
    reflectionDirty = true;
  };
  const setSceneScale = factor => {
    const value = Number(factor);
    if (!Number.isFinite(value) || value < .1 || value > 2) throw new Error('营地展示比例应介于 0.1 与 2 之间。');
    overallScale = value; campFrame.scale.setScalar(value); campFrame.updateMatrixWorld(true);
    for (const [id, local] of Object.entries(poiLocals)) poiLocations[id].copy(world(local));
    routeCurve.points[routeCurve.points.length - 1].copy(world([0, .13, -11.3])); routeCurve.updateArcLengths();
    const oldRouteGeometry = route.geometry;
    route.geometry = new THREE.BufferGeometry().setFromPoints(routeCurve.getPoints(100)); route.computeLineDistances(); oldRouteGeometry.dispose();
    reflectionCamera.position.copy(world([7.9, 1.15, 6.8])); reflectionSky.position.copy(reflectionCamera.position);
    for (const child of reflectionCamera.children) if (child.isCamera) { child.near = Math.max(.02, .15 * value); child.updateProjectionMatrix(); }
    reflectionDirty = true;
    if (view === 'camp') setView('camp');
  };
  const visibleInTree = (object) => {
    for (let current = object; current; current = current.parent) if (!current.visible) return false;
    return true;
  };
  const geometryState = () => Object.fromEntries(Object.entries(layers).map(([name, group]) => {
    let meshCount = 0, triangleCount = 0;
    const countObject = object => {
      if (!object.isMesh || !visibleInTree(object)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.every(material => material.transparent && material.opacity === 0)) return;
      meshCount++;
      triangleCount += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    };
    group.traverse(countObject);
    if (name === 'markers') campMarkers.traverse(countObject);
    return [name, { visible: group.visible, meshCount, triangleCount }];
  }));
  const pick = (event) => {
    const rectangle = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rectangle.left) / rectangle.width * 2 - 1, -((event.clientY - rectangle.top) / rectangle.height * 2 - 1));
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.find(hit => visibleInTree(hit.object))?.object.userData.poi;
  };
  const pointerDown = event => { down = { x: event.clientX, y: event.clientY, at: performance.now() }; transition = null; renderer.domElement.style.cursor = 'grabbing'; };
  const pointerUp = event => {
    renderer.domElement.style.cursor = 'grab';
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 7 && performance.now() - down.at < 550) {
      const id = pick(event); if (id) select(id);
    }
    down = null;
  };
  const pointerMove = event => { if (!down && !mobile) renderer.domElement.style.cursor = pick(event) ? 'pointer' : 'grab'; };
  const pointerCancel = () => { down = null; renderer.domElement.style.cursor = 'grab'; };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointercancel', pointerCancel);
  const controlsStart = () => { transition = null; };
  controls.addEventListener('start', controlsStart);
  const contextLost = event => { event.preventDefault(); onError(new Error('三维画面暂时中断，请刷新页面，或切换到实景照片。')); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);

  const resize = () => {
    width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight);
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  };
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container); window.addEventListener('resize', resize);
  resize(); camera.position.copy(overviewPosition()); controls.target.set(0, 0, 0); controls.update();
  setSceneScale(overallScale);
  captureReflections();
  const animate = time => {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (paused || document.hidden || (mobile && time - lastFrame < 30)) return;
    lastFrame = time;
    if (reflectionDirty && layers.mirrors.visible) captureReflections();
    if (transition) {
      const t = Math.min(1, (time - transition.start) / transition.duration);
      camera.position.lerpVectors(transition.from, transition.to, ease(t));
      controls.target.lerpVectors(transition.targetFrom, transition.targetTo, ease(t));
      if (t >= 1) transition = null;
    }
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -66, 66);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -66, 66);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 6);
    controls.update();
    if (!reducedMotion) {
      const pulse = Math.sin(time * .0017);
      ringAura.material.opacity = .09 + (pulse + 1) * .018;
      for (const group of Object.values(markers)) group.scale.setScalar(1 + pulse * .065);
      selectedRing.scale.setScalar(1 + .06 * Math.sin(time * .002));
    }
    if (layers.route.visible) for (let i = 0; i < routeDots.length; i++) routeDots[i].position.copy(routeCurve.getPointAt((i / routeDots.length + (reducedMotion ? 0 : time * .00004)) % 1));
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(animate);
  onReady({ renderer, scene, camera });

  return {
    setView, setNight, setSceneScale,
    setPaused(value) { paused = Boolean(value); },
    setLayer(name, value) {
      if (name === 'labels') { layers.markers.visible = Boolean(value); campMarkers.visible = Boolean(value); return; }
      if (name in layers) layers[name].visible = Boolean(value);
      if (name === 'markers') campMarkers.visible = Boolean(value);
      if (name === 'lasers') { lasersEnabled = Boolean(value); layers.lasers.visible = night && lasersEnabled; }
      if (name === 'tents') markers.tents.visible = Boolean(value);
      if (name === 'food') markers.food.visible = Boolean(value);
      if (name === 'mirrors') { markers.mirrors.visible = Boolean(value); connectionBeams.forEach(beam => { beam.visible = Boolean(value); }); }
      if (name === 'stalls') { markers.henna.visible = Boolean(value); markers.clothes.visible = Boolean(value); }
      if (name === 'buildings') { markers.camp.visible = Boolean(value); markers.entrance.visible = Boolean(value); }
      if (['buildings', 'tents', 'food', 'mirrors', 'stalls'].includes(name)) reflectionDirty = true;
    },
    select(id) { select(id, false); },
    reset() { selected = null; selectedRing.visible = false; setView('overview'); },
    getState() { return { view, night, selected, paused, overallScale, ready: true, counts: { tents: tents.length, steles: steles.length, mirrors: mirrors.length, stalls: stalls.length }, layout: getLayout(), lasers: getLasers(), geometry: geometryState(), layers: Object.fromEntries(Object.entries(layers).map(([name, group]) => [name, group.visible])) }; },
    projectPoints() {
      return Object.entries(poiLocations).map(([id, location]) => {
        projected.copy(markers[id].getWorldPosition(new THREE.Vector3())).project(camera);
        const associatedLayer = ({ tents: 'tents', food: 'food', mirrors: 'mirrors', henna: 'stalls', clothes: 'stalls', parking: 'markers' })[id] || 'buildings';
        return { id, x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, visible: projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1 && layers[associatedLayer].visible, world: location.toArray() };
      });
    },
    projectPickTargets() {
      scene.updateMatrixWorld(true);
      return Object.keys(poiLocations).map(id => {
        const candidates = pickables.filter(object => object.userData.poi === id && !object.userData.marker);
        let object = candidates[0], area = -1;
        for (const candidate of candidates) {
          if (!candidate.geometry.boundingBox) candidate.geometry.computeBoundingBox();
          const size = candidate.geometry.boundingBox.getSize(new THREE.Vector3());
          if (size.x * size.z > area) { object = candidate; area = size.x * size.z; }
        }
        if (!object) object = pickables.find(candidate => candidate.userData.poi === id);
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        projected.copy(object.geometry.boundingBox.getCenter(new THREE.Vector3())).applyMatrix4(object.matrixWorld).project(camera);
        return { id, x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, visible: visibleInTree(object) && projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 };
      });
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); resizeObserver?.disconnect(); window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointercancel', pointerCancel);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost); controls.removeEventListener('start', controlsStart); controls.dispose();
      const geometries = new Set(), materials = new Set(), textures = new Set([aerialTexture, logoTexture]);
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
      mirrorEnvironment?.dispose(); mirrorCubeTarget.dispose(); pmrem.dispose();
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
