<script lang="ts">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
  import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
  import { onMount } from 'svelte';
  import { editor } from './editor.svelte';
  import { renderToCanvas } from './export';
  import { DISC, geometry, type Doc } from './model';
  import { download, slugify } from './storage';

  // Dimensions en mm. Un boîtier DVD est un peu plus grand que sa jaquette.
  const CASE_MARGIN_W = 5.5;
  const CASE_MARGIN_H = 7;
  const TEXTURE_DPI = 150;

  let host: HTMLDivElement;
  let autoRotate = $state(true);
  let showDisc = $state(true);
  let loading = $state(true);

  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let caseGroup = new THREE.Group();
  let discGroup = new THREE.Group();
  let disposables: { dispose(): void }[] = [];

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-200, 300, 400);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));

    camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
    camera.position.set(170, 60, 470);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.6;
    controls.minDistance = 200;
    controls.maxDistance = 1200;
    controls.addEventListener('start', () => (autoRotate = false));

    scene.add(caseGroup, discGroup);

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fitCamera();
    });
    ro.observe(host);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      clearModels();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  });

  $effect(() => {
    if (controls) controls.autoRotate = autoRotate;
  });

  $effect(() => {
    discGroup.visible = showDisc;
    layout();
    fitCamera();
  });

  /** Recule la caméra pour que tout tienne à l'écran, quelle que soit la forme de la zone. */
  function fitCamera() {
    if (!camera || !controls) return;
    const width = showDisc ? 290 : 160;
    const height = 200;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(height / 2 / tan, width / 2 / (tan * camera.aspect)) * 1.12;
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    controls.maxDistance = Math.max(1200, dist * 2);
    controls.update();
  }

  // Reconstruit les textures quand la jaquette change (avec un petit délai).
  $effect(() => {
    const doc = $state.snapshot(editor.doc) as Doc;
    void editor.renderVersion;
    const t = setTimeout(() => build(doc), 350);
    return () => clearTimeout(t);
  });

  function clearModels() {
    for (const d of disposables) d.dispose();
    disposables = [];
    caseGroup.clear();
    discGroup.clear();
  }

  function track<T extends { dispose(): void }>(x: T): T {
    disposables.push(x);
    return x;
  }

  function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const t = track(new THREE.CanvasTexture(canvas));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  /** Découpe un panneau (dos, tranche ou face) dans le rendu à plat de la jaquette. */
  function crop(src: HTMLCanvasElement, x: number, y: number, w: number, h: number, k: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d')!.drawImage(src, x * k, y * k, w * k, h * k, 0, 0, c.width, c.height);
    return c;
  }

  async function build(doc: Doc) {
    if (!renderer) return;
    loading = true;
    try {
      const geo = geometry(doc);
      const k = TEXTURE_DPI / 25.4;
      const b = geo.bleed;
      const flat = await renderToCanvas(doc, editor.assets, TEXTURE_DPI, 'case');
      const discFlat = doc.disc.layers.length ? await renderToCanvas(doc, editor.assets, TEXTURE_DPI, 'disc') : null;

      clearModels();
      const pw = geo.panels.front.w;
      const s = geo.panels.spine.w;
      const H = geo.H;
      const bw = pw + CASE_MARGIN_W;
      const bh = H + CASE_MARGIN_H;
      const W2 = bw / 2;

      // Corps du boîtier en plastique noir.
      const body = new THREE.Mesh(
        track(new RoundedBoxGeometry(bw, bh, s, 4, Math.min(2, s / 2 - 0.1))),
        track(new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.55, metalness: 0.1 })),
      );
      caseGroup.add(body);

      // Jaquette sous le film transparent : un vernis brillant.
      const coverMaterial = (canvas: HTMLCanvasElement) =>
        track(
          new THREE.MeshPhysicalMaterial({
            map: texture(canvas),
            roughness: 0.45,
            clearcoat: 1,
            clearcoatRoughness: 0.12,
          }),
        );
      const plane = (w: number, h: number) => track(new THREE.PlaneGeometry(w, h));
      const coverX = -W2 + pw / 2 + 0.6;

      const front = new THREE.Mesh(plane(pw, H), coverMaterial(crop(flat, b + geo.panels.front.x, b, pw, H, k)));
      front.position.set(coverX, 0, s / 2 + 0.06);

      const back = new THREE.Mesh(plane(pw, H), coverMaterial(crop(flat, b, b, pw, H, k)));
      back.position.set(coverX, 0, -s / 2 - 0.06);
      back.rotation.y = Math.PI;

      const spine = new THREE.Mesh(plane(s, H), coverMaterial(crop(flat, b + geo.panels.spine.x, b, s, H, k)));
      spine.position.set(-W2 - 0.06, 0, 0);
      spine.rotation.y = -Math.PI / 2;

      caseGroup.add(front, back, spine);

      // Disque : dessous argenté et irisé, dessus imprimé.
      const R = DISC.size / 2;
      const hole = DISC.hole / 2;
      const silver = track(
        new THREE.MeshPhysicalMaterial({
          color: 0xdfe3ea,
          metalness: 1,
          roughness: 0.16,
          iridescence: 1,
          iridescenceIOR: 1.8,
          side: THREE.DoubleSide,
        }),
      );
      const ring = track(new THREE.RingGeometry(hole, R, 160, 1));
      const base = new THREE.Mesh(ring, silver);
      const edge = new THREE.Mesh(track(new THREE.CylinderGeometry(R, R, 1.2, 160, 1, true)), silver);
      edge.rotation.x = Math.PI / 2;
      edge.position.z = -0.6;
      base.position.z = -1.2;
      discGroup.add(base, edge);
      // Le dessus : argent, puis la rondelle imprimée par-dessus (transparente hors zone imprimable).
      const top = new THREE.Mesh(ring, silver);
      discGroup.add(top);
      if (discFlat) {
        const print = new THREE.Mesh(
          ring,
          track(new THREE.MeshPhysicalMaterial({ map: texture(discFlat), transparent: true, roughness: 0.5, clearcoat: 0.3 })),
        );
        print.position.z = 0.05;
        discGroup.add(print);
      }
      layout();
    } finally {
      loading = false;
    }
  }

  /** Disque posé à côté du boîtier, légèrement tourné vers la caméra. */
  function layout() {
    const doc = editor.doc;
    const bw = geometry(doc).panels.front.w + CASE_MARGIN_W;
    if (showDisc) {
      caseGroup.position.set(-60, 0, 0);
      discGroup.position.set(-60 + bw / 2 + 70, -30, 20);
      discGroup.rotation.set(-0.15, -0.35, 0);
    } else {
      caseGroup.position.set(0, 0, 0);
    }
  }

  function view(face: 'front' | 'back' | 'spine' | 'three') {
    autoRotate = false;
    const d = camera.position.distanceTo(controls.target);
    const dirs = {
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      spine: new THREE.Vector3(-1, 0, 0),
      three: new THREE.Vector3(0.35, 0.12, 1).normalize(),
    };
    camera.position.copy(controls.target).addScaledVector(dirs[face], d);
    controls.update();
  }

  function savePng() {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
      if (blob) download(blob, `${slugify(editor.doc.title)}-apercu-3d.png`);
    }, 'image/png');
  }
</script>

<div class="preview" bind:this={host}>
  <div class="toolbar">
    <div class="seg">
      <button onclick={() => view('three')} title="Vue de trois-quarts">¾</button>
      <button onclick={() => view('front')}>Face</button>
      <button onclick={() => view('spine')}>Tranche</button>
      <button onclick={() => view('back')}>Dos</button>
    </div>
    <label class="check"><input type="checkbox" bind:checked={autoRotate} />Rotation</label>
    <label class="check"><input type="checkbox" bind:checked={showDisc} />Disque</label>
    <button onclick={savePng}>Enregistrer l'image</button>
  </div>
  {#if loading}<div class="loading">Préparation du rendu 3D…</div>{/if}
  <p class="help">Glisser pour tourner · molette pour zoomer · clic droit pour déplacer</p>
</div>

<style>
  .preview {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: radial-gradient(circle at 50% 40%, #2a2d34 0%, #15161a 75%);
    overflow: hidden;
  }
  .preview :global(canvas) {
    display: block;
    cursor: grab;
  }
  .preview :global(canvas:active) {
    cursor: grabbing;
  }
  .toolbar {
    position: absolute;
    left: 50%;
    bottom: 34px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    background: #1d1f24e6;
    border: 1px solid var(--line);
    border-radius: 10px;
    white-space: nowrap;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
  }
  .loading {
    position: absolute;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 12px;
    color: var(--muted);
  }
  .help {
    position: absolute;
    bottom: 10px;
    width: 100%;
    margin: 0;
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    pointer-events: none;
  }
</style>
