<script lang="ts">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
  import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
  import { onMount } from 'svelte';
  import { editor } from './editor.svelte';
  import { renderToCanvas } from './export';
  import { CART, DISC, geometry, usesCartridge, type Doc } from './model';
  import { download, slugify } from './storage';

  // Dimensions en mm. Un boîtier DVD (135 × 190) est un peu plus grand que sa jaquette :
  // le plastique noir dépasse côté ouverture et en haut et en bas.
  const CASE_MARGIN_W = 5.5;
  const CASE_MARGIN_H = 7;
  /** Arrondi des arêtes du boîtier (autour de la tranche notamment). */
  const EDGE_R = 1.8;
  /** Arrondi des coins vus de face. */
  const CORNER_R = 3.2;
  const TEXTURE_DPI = 200;
  /** Encoche pour le doigt sur le côté ouverture, à cheval sur la rainure (mm). */
  const NOTCH = { width: 26, depth: 2.6 };
  /** Épaisseur du plastique (fond et parois des deux moitiés). */
  const WALL = 1.6;
  /** Ouverture : couvercle entrouvert à 135°, comme un boîtier posé ouvert sur une étagère. */
  const OPEN_ANGLE = Math.PI * 0.75;

  let host: HTMLDivElement;
  let autoRotate = $state(true);
  let showDisc = $state(true);

  /** Couleur du plastique du boîtier (« auto » : celle des boîtes du commerce pour ce format). */
  type CaseColor = 'auto' | 'noir' | 'transparent' | 'rouge' | 'bleu' | 'vert' | 'blanc';
  const CASE_COLORS: { id: CaseColor; label: string }[] = [
    { id: 'auto', label: 'Boîtier : selon le format' },
    { id: 'noir', label: 'Noir' },
    { id: 'transparent', label: 'Transparent' },
    { id: 'rouge', label: 'Rouge (Switch)' },
    { id: 'bleu', label: 'Bleu (Blu-ray)' },
    { id: 'vert', label: 'Vert (Xbox 360)' },
    { id: 'blanc', label: 'Blanc (Wii)' },
  ];
  let caseColor = $state<CaseColor>('auto');

  function defaultCaseColor(doc: Doc): Exclude<CaseColor, 'auto'> {
    if (usesCartridge(doc)) return 'transparent';
    if (doc.template === 'bluray') return 'bleu';
    return 'noir';
  }

  function caseMaterial(color: Exclude<CaseColor, 'auto' | 'noir'>): THREE.MeshPhysicalMaterial {
    if (color === 'transparent')
      // Plastique dépoli : on voit à travers, flou, avec un léger voile blanc.
      return new THREE.MeshPhysicalMaterial({ color: 0xf3f5f8, transmission: 0.92, roughness: 0.32, thickness: 1.2, ior: 1.49, clearcoat: 0.3, clearcoatRoughness: 0.2 });
    const tint = { rouge: 0xc8102e, bleu: 0x2a63c9, vert: 0x2f9e44, blanc: 0xeef0f3 }[color];
    // Le bleu des Blu-ray est translucide ; les autres sont opaques et brillants.
    return new THREE.MeshPhysicalMaterial({
      color: tint,
      roughness: 0.36,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
      ...(color === 'bleu' ? { transmission: 0.55, thickness: 1.5 } : {}),
    });
  }
  let opened = $state(false);
  /** Présentation : le boîtier s'ouvre et se referme en boucle, la caméra se balance. */
  let demo = $state(false);
  let recording = $state(false);
  let demoTime = 0;
  let loading = $state(true);

  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let caseGroup = new THREE.Group();
  let discGroup = new THREE.Group();
  /** Couvercle : tourne autour de la charnière, côté tranche. */
  let lid = new THREE.Group();
  /** Le disque rangé dans le boîtier, visible à l'ouverture. */
  let trayDisc = new THREE.Group();
  // Ouverture du couvercle (0 fermé, 1 ouvert) et sa vitesse : un ressort amorti.
  let lidAngle = 0;
  let lidSpeed = 0;
  const clock = new THREE.Clock();
  /** Durée d'un cycle de présentation (s) : fermé, s'ouvre, reste ouvert, se referme. */
  const CYCLE = 7;
  let caseW = 135;
  let caseH = 190;
  /** Faux pour un boîtier trop étroit pour un disque (cartouche à la place). */
  let hasDisc = $state(true);
  let baseX = 0;
  let disposables: { dispose(): void }[] = [];

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    // Rendu neutre : garde les couleurs de la jaquette telles qu'elles seront imprimées.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;

    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(-200, 300, 400);
    // Lumière rasante de l'autre côté : fait briller le film plastique et les arêtes.
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
    rim.position.set(300, 120, -150);
    scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.2));

    camera = new THREE.PerspectiveCamera(32, 1, 20, 4000);
    camera.position.set(-300, 70, 400);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.6;
    controls.minDistance = 200;
    controls.maxDistance = 1200;
    controls.addEventListener('start', () => {
      autoRotate = false;
      if (!recording) demo = false;
    });

    scene.add(caseGroup, discGroup);
    // En développement seulement : accès à la caméra depuis la console pour régler les vues.
    if (import.meta.env.DEV) (window as unknown as { __preview3d: unknown }).__preview3d = { camera, controls, view, state: () => ({ demoTime, lidAngle, demo }) };

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
      const dt = Math.min(0.05, clock.getDelta());
      animateOpening(dt);
      if (demo) swayCamera();
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

  /** Le boîtier est (ou va être) ouvert : il prend deux fois plus de place. */
  const wide = $derived(opened || demo);

  $effect(() => {
    void wide;
    discGroup.visible = showDisc && !wide;
    layout();
    fitCamera();
  });

  $effect(() => {
    if (!demo) return;
    demoTime = 0;
    autoRotate = false;
  });

  /** En présentation : fermé, s'ouvre, reste ouvert, se referme. */
  function demoTarget(t: number) {
    const c = t % CYCLE;
    return c > 1.1 && c < 4.6 ? 1 : 0;
  }

  /**
   * Fait pivoter le couvercle comme une vraie charnière : il part vite, dépasse un peu
   * et se pose ; à la fermeture il claque et rebondit légèrement.
   */
  function animateOpening(dt: number) {
    if (demo) demoTime += dt;
    const target = demo ? demoTarget(demoTime) : opened ? 1 : 0;
    const stiffness = 32;
    const damping = 8;
    lidSpeed += (stiffness * (target - lidAngle) - damping * lidSpeed) * dt;
    lidAngle += lidSpeed * dt;
    if (lidAngle < 0) {
      // Le couvercle bute sur le bac : petit rebond.
      lidAngle = 0;
      lidSpeed = -lidSpeed * 0.25;
    }
    lid.rotation.y = -lidAngle * OPEN_ANGLE;
    // Ouvert, le boîtier prend plus de place : on le recentre.
    const e = Math.min(1, lidAngle);
    caseGroup.position.x = baseX + (caseW / 2) * e * ((1 - Math.cos(OPEN_ANGLE)) / 2);
  }

  /** Balancement lent de la caméra autour de la vue de trois-quarts. */
  function swayCamera() {
    const t = controls.target;
    const dist = camera.position.distanceTo(t);
    const az = -0.55 + 0.35 * Math.sin((demoTime / CYCLE) * Math.PI * 2);
    const el = 0.16;
    camera.position.set(
      t.x + dist * Math.sin(az) * Math.cos(el),
      t.y + dist * Math.sin(el),
      t.z + dist * Math.cos(az) * Math.cos(el),
    );
    camera.lookAt(t);
  }

  /** Enregistre un cycle de présentation en vidéo (MP4 si le navigateur sait le faire, sinon WebM). */
  async function recordVideo() {
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = typeof MediaRecorder === 'undefined' ? undefined : types.find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) {
      alert("Ton navigateur ne sait pas enregistrer de vidéo. Essaie avec Chrome ou Firefox.");
      return;
    }
    recording = true;
    demo = true;
    controls.enabled = false;
    // Fond plein : une vidéo n'a pas de transparence.
    scene.background = new THREE.Color(0x0d1018);
    await new Promise((r) => setTimeout(r, 120));
    demoTime = 0;
    lidAngle = 0;
    lidSpeed = 0;
    const rec = new MediaRecorder(renderer.domElement.captureStream(60), { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    await new Promise((r) => setTimeout(r, CYCLE * 1000));
    rec.stop();
    await stopped;
    scene.background = null;
    controls.enabled = true;
    recording = false;
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    download(new Blob(chunks, { type: type.split(';')[0] }), `${slugify(editor.doc.title)}-animation.${ext}`);
  }

  /** Recule la caméra pour que tout tienne à l'écran, quelle que soit la forme de la zone. */
  function fitCamera() {
    if (!camera || !controls) return;
    const width = wide ? 2 * caseW + 30 : showDisc ? 290 : caseW + 25;
    const height = caseH + 10;
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
    void caseColor;
    const t = setTimeout(() => build(doc), 350);
    return () => clearTimeout(t);
  });

  function clearModels() {
    for (const d of disposables) d.dispose();
    disposables = [];
    lid.clear();
    trayDisc.clear();
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
      const x0 = -bw / 2; // côté tranche
      const r = Math.min(EDGE_R, s / 8); // boîtier fin : arrondis plus petits pour garder la place du disque

      caseW = bw;
      caseH = bh;
      // Comme un vrai boîtier : deux moitiés creuses de même profondeur,
      // la rainure de fermeture passe au milieu de l'épaisseur.
      const hingeX = x0 + r;
      const half = s / 2;
      const ft = Math.min(WALL, s * 0.12); // épaisseur du fond
      const black = track(
        new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
      );
      // Plastique du boîtier : couleur choisie, ou celle des boîtes du commerce pour ce format.
      const color = caseColor === 'auto' ? defaultCaseColor(doc) : caseColor;
      const shell = color === 'noir' ? black : track(caseMaterial(color));
      // Boîtier transparent : le fond du bac est du même plastique (pas de fond noir).
      const innerMat = color === 'transparent' ? shell : track(new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.75 }));
      const seam = Math.min(0.45, half / 4);
      // Le fond garde l'arrondi extérieur des arêtes : il est donc au moins aussi épais que deux arrondis.
      const slabD = Math.max(ft + r, 2 * r + 0.05);

      // Le bac (dos) : fond aux arêtes arrondies + parois jusqu'à mi-épaisseur.
      caseGroup.add(
        new THREE.Mesh(roundedSlab(bw, bh, slabD, r, -half), shell),
        new THREE.Mesh(wallRing(bw, bh, WALL, half - ft, seam, -half + ft), shell),
      );

      // Intérieur du bac : fond mat, anneau autour du disque, plot central, et le disque rangé.
      const trayX = (hingeX + x0 + bw) / 2;
      const floorZ = -half + slabD;
      const inner = new THREE.Mesh(track(new THREE.ShapeGeometry(roundedRect(bw - r - 2 * WALL - 1, bh - 2 * WALL - 1, 2.5), 8)), innerMat);
      inner.position.set(trayX, 0, floorZ + 0.02);
      caseGroup.add(inner);
      // Un disque de 120 mm ne tient pas dans un boîtier étroit (Switch) : on y range une cartouche.
      hasDisc = bw - r - 2 * WALL >= DISC.size + 3 && bh - 2 * WALL >= DISC.size + 3;
      if (hasDisc) {
        const holder = new THREE.Mesh(track(new THREE.TorusGeometry(DISC.size / 2 + 1.2, 0.7, 10, 120)), black);
        holder.position.set(trayX, 0, floorZ + 0.5);
        const hub = new THREE.Mesh(
          track(new THREE.CylinderGeometry(7.3, 8, 1.4, 48)),
          track(new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.45 })),
        );
        hub.rotation.x = Math.PI / 2;
        hub.position.set(trayX, 0, floorZ + 0.7);
        trayDisc.position.set(trayX, 0, floorZ + 1.45);
        caseGroup.add(holder, hub, trayDisc);
      } else {
        // Boîte Switch : logement de la cartouche centré dans la largeur du bac, en bas,
        // et deux attaches pour la notice côté tranche.
        const trayW = bw - r - 2 * WALL;
        const slotW = CART.body.width + 4;
        const slotH = CART.body.height + 4;
        const sx = trayX;
        const sy = -bh / 2 + 11 + slotH / 2;
        const slotRim = roundedRect(slotW + 3, slotH + 3, 2.5);
        slotRim.holes.push(roundedRect(slotW, slotH, 2));
        const rim = new THREE.Mesh(track(new THREE.ExtrudeGeometry(slotRim, { depth: 1.6, bevelEnabled: false })), shell);
        rim.position.set(sx, sy, floorZ);
        const slot = new THREE.Mesh(track(new THREE.ShapeGeometry(roundedRect(slotW, slotH, 2), 4)), innerMat);
        slot.position.set(sx, sy, floorZ + 0.05);
        const inTray = makeCart(discFlat, doc.template === 'switch2');
        inTray.position.set(sx, sy, floorZ + 1.75);
        caseGroup.add(rim, slot, inTray);
        // Attaches mesurées sur une vraie boîte : environ 20 × 15 mm, au tiers haut et au milieu.
        for (const y of [bh * 0.3, -bh * 0.05]) {
          const clip = roundedRect(20, 15, 2);
          clip.holes.push(roundedRect(15, 10, 1.5));
          const m = new THREE.Mesh(track(new THREE.ExtrudeGeometry(clip, { depth: 1.8, bevelEnabled: false })), shell);
          m.position.set(trayX - trayW / 2 + 14, y, floorZ);
          caseGroup.add(m);
        }
      }

      // Le couvercle (la face) : même contour que le bac, retourné. La rainure fait ainsi le tour
      // complet du boîtier. La charnière est sur la tranche, à la jonction des deux moitiés :
      // en s'ouvrant, le couvercle reste attaché au bac, comme sur un vrai boîtier.
      lid.position.set(x0, 0, 0);
      const lidBody = new THREE.Group();
      lidBody.position.set(hingeX - x0, 0, half);
      lid.add(lidBody);
      const lidW = bw;
      const lidTop = new THREE.Mesh(roundedSlab(lidW, bh, slabD, r, -slabD), shell);
      const lidWalls = new THREE.Mesh(wallRing(lidW, bh, WALL, half - ft, seam, -half), shell);
      const lidInner = new THREE.Mesh(track(new THREE.ShapeGeometry(roundedRect(lidW - 2 * WALL - 1, bh - 2 * WALL - 1, 2.5), 8)), innerMat);
      lidInner.rotation.y = Math.PI;
      lidInner.position.z = -slabD - 0.02;
      for (const m of [lidTop, lidWalls, lidInner]) m.position.x += x0 + bw / 2 - hingeX;
      lidBody.add(lidTop, lidWalls, lidInner);
      caseGroup.add(lid);

      // La jaquette : une seule feuille qui s'enroule autour de la tranche, comme en vrai.
      // Elle est coupée à la charnière : la face suit le couvercle.
      const coverMat = track(
        new THREE.MeshPhysicalMaterial({
          map: texture(crop(flat, b, b, geo.W, H, k)),
          roughness: 0.6,
          metalness: 0,
          // Papier mat : il reflète peu la pièce, c'est le film qui brille.
          envMapIntensity: 0.35,
        }),
      );
      // Le film transparent qui tient la jaquette : il couvre tout le boîtier et donne les reflets.
      const filmMat = track(
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0.03,
          transmission: 1,
          thickness: 0.2,
          ior: 1.5,
          envMapIntensity: 0.9,
        }),
      );
      const sheet = { x0, s, r, height: H, side: pw, lift: 0.12, texture: true };
      const film = { x0, s, r, height: bh - 2 * CORNER_R + 1, side: bw - CORNER_R, lift: 0.35, texture: false };
      const toLid = (g: THREE.BufferGeometry) => g.translate(-x0, 0, 0);
      caseGroup.add(
        new THREE.Mesh(track(wrapGeometry({ ...sheet, part: 'base' })), coverMat),
        new THREE.Mesh(track(wrapGeometry({ ...film, part: 'base' })), filmMat),
      );
      lid.add(
        new THREE.Mesh(track(toLid(wrapGeometry({ ...sheet, part: 'lid' }))), coverMat),
        new THREE.Mesh(track(toLid(wrapGeometry({ ...film, part: 'lid' }))), filmMat),
      );

      if (usesCartridge(doc)) {
        // Jeu Switch : la cartouche, posée à côté du boîtier.
        discGroup.add(makeCart(discFlat, doc.template === 'switch2'));
      } else {
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
            track(
              new THREE.MeshPhysicalMaterial({
                map: texture(discFlat),
                transparent: true,
                roughness: 0.5,
                envMapIntensity: 0.4,
                clearcoat: 0.3,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
              }),
            ),
          );
          print.position.z = 0.2;
          discGroup.add(print);
        }
        // Même disque (mêmes matériaux) rangé dans le boîtier.
        for (const m of discGroup.children) trayDisc.add(m.clone());
      }
      layout();
    } finally {
      loading = false;
    }
  }

  /** Plaque de plastique aux coins et arêtes arrondis, de z0 à z0 + épaisseur. */
  function roundedSlab(w: number, h: number, depth: number, edge: number, z0: number): THREE.BufferGeometry {
    const shape = roundedRect(w - 2 * edge, h - 2 * edge, Math.max(0.4, CORNER_R - edge));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.05, depth - 2 * edge),
      bevelEnabled: true,
      bevelThickness: edge,
      bevelSize: edge,
      bevelSegments: 6,
      curveSegments: 14,
    });
    g.translate(0, 0, z0 + edge);
    const smooth = toCreasedNormals(g, Math.PI / 5);
    g.dispose();
    return track(smooth);
  }

  /** Parois d'une moitié de boîtier : un cadre creux, de z0 à z0 + hauteur, bord arrondi (la rainure). */
  function wallRing(w: number, h: number, wall: number, height: number, edge: number, z0: number): THREE.BufferGeometry {
    // L'intérieur suit le creux de l'encoche : la paroi garde partout la même épaisseur.
    const outer = roundedRect(w - 2 * edge, h - 2 * edge, Math.max(0.4, CORNER_R - edge), NOTCH);
    outer.holes.push(roundedRect(w - 2 * wall, h - 2 * wall, Math.max(0.4, CORNER_R - wall), NOTCH));
    const g = new THREE.ExtrudeGeometry(outer, {
      depth: Math.max(0.05, height - 2 * edge),
      bevelEnabled: true,
      bevelThickness: edge,
      bevelSize: edge,
      bevelSegments: 3,
      curveSegments: 14,
    });
    g.translate(0, 0, z0 + edge);
    const smooth = toCreasedNormals(g, Math.PI / 5);
    g.dispose();
    return track(smooth);
  }

  /** Rectangle aux coins arrondis, centré. */
  function roundedRect(w: number, h: number, rad: number, notch?: { width: number; depth: number }): THREE.Shape {
    const x = -w / 2;
    const y = -h / 2;
    rad = Math.min(rad, w / 2, h / 2);
    const sh = new THREE.Shape();
    sh.moveTo(x + rad, y);
    sh.lineTo(x + w - rad, y);
    sh.quadraticCurveTo(x + w, y, x + w, y + rad);
    if (notch) {
      // Encoche pour le doigt, au milieu du côté ouverture : un creux arrondi.
      const n = notch.width / 2;
      const d = notch.depth * 1.33;
      sh.lineTo(x + w, -n);
      sh.bezierCurveTo(x + w - d, -n * 0.55, x + w - d, n * 0.55, x + w, n);
    }
    sh.lineTo(x + w, y + h - rad);
    sh.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    sh.lineTo(x + rad, y + h);
    sh.quadraticCurveTo(x, y + h, x, y + h - rad);
    sh.lineTo(x, y + rad);
    sh.quadraticCurveTo(x, y, x + rad, y);
    return sh;
  }

  /**
   * Feuille qui part du bord du dos, contourne la tranche (arêtes arrondies) et finit au bord de la face.
   * Les coordonnées de texture suivent la jaquette à plat : dos | tranche | face.
   */
  function wrapGeometry(o: {
    x0: number;
    s: number;
    r: number;
    height: number;
    side: number;
    lift: number;
    texture: boolean;
    /** « base » : dos et moitié de la tranche ; « lid » : l'autre moitié et la face. */
    part: 'base' | 'lid';
  }) {
    const { x0, s, r, height, side, lift } = o;
    const R = r + lift;
    const zb = -s / 2 - lift;
    const zf = s / 2 + lift;
    const total = 2 * side + s;
    const pts: { x: number; z: number; nx: number; nz: number; u: number }[] = [];
    const arc = 10;
    // Dos (de l'ouverture vers la tranche).
    pts.push({ x: x0 + side, z: zb, nx: 0, nz: -1, u: 0 });
    for (let i = 0; i <= arc; i++) {
      const a = (i / arc) * (Math.PI / 2);
      const nx = -Math.sin(a);
      const nz = -Math.cos(a);
      pts.push({ x: x0 + r + R * nx, z: -s / 2 + r + R * nz, nx, nz, u: side - r + (i / arc) * 2 * r });
    }
    // Milieu de la tranche : c'est là que la feuille se plie quand le boîtier s'ouvre.
    const fold = pts.length;
    pts.push({ x: x0 - lift, z: 0, nx: -1, nz: 0, u: side + s / 2 });
    for (let i = 0; i <= arc; i++) {
      const a = (i / arc) * (Math.PI / 2);
      const nx = -Math.cos(a);
      const nz = Math.sin(a);
      pts.push({ x: x0 + r + R * nx, z: s / 2 - r + R * nz, nx, nz, u: side + s - r + (i / arc) * 2 * r });
    }
    pts.push({ x: x0 + side, z: zf, nx: 0, nz: 1, u: total });
    const used = o.part === 'base' ? pts.slice(0, fold + 1) : pts.slice(fold);

    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    used.forEach((p, i) => {
      for (const v of [0, 1]) {
        pos.push(p.x, (v - 0.5) * height, p.z);
        nor.push(p.nx, 0, p.nz);
        uv.push(p.u / total, v);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        const c = i * 2;
        idx.push(a, c, a + 1, c, c + 1, a + 1);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (o.texture) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  /**
   * Cartouche Switch (21 × 31 × 3,3 mm) : coque gris foncé, crans en haut,
   * étiquette imprimée sur la partie basse de la face.
   */
  function makeCart(labelFlat: HTMLCanvasElement | null, switch2: boolean): THREE.Group {
    const g = new THREE.Group();
    const { width: w, height: h } = CART.body;
    // Coque gris anthracite (Switch) ou rouge (Switch 2), comme les cartouches du commerce.
    const plastic = track(new THREE.MeshPhysicalMaterial({ color: switch2 ? 0xd7141f : 0x45474d, roughness: 0.48, clearcoat: 0.2 }));
    const extrude = (shape: THREE.Shape, depth: number) =>
      track(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2, curveSegments: 6 }));
    const body = new THREE.Mesh(extrude(roundedRect(w, h, 1.6), 3.3), plastic);
    body.position.z = -1.65;
    g.add(body);
    // Cran en haut et flèche en bas (sens d'insertion).
    const tab = new THREE.Mesh(track(new THREE.BoxGeometry(6, 0.6, 0.5)), plastic);
    tab.position.set(0, h / 2 - 0.9, 1.9);
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(-1.6, 0);
    arrowShape.lineTo(1.6, 0);
    arrowShape.lineTo(0, -1.2);
    arrowShape.closePath();
    const arrow = new THREE.Mesh(track(new THREE.ShapeGeometry(arrowShape)), track(new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.7 })));
    arrow.position.set(0, -h / 2 + 2, 1.93);
    g.add(tab, arrow);
    const k = TEXTURE_DPI / 25.4;
    const labelMat = labelFlat
      ? track(new THREE.MeshPhysicalMaterial({ map: texture(crop(labelFlat, CART.bleed, CART.bleed, CART.width, CART.height, k)), roughness: 0.45, clearcoat: 0.25 }))
      : track(new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.6 }));
    const label = new THREE.Mesh(track(new THREE.PlaneGeometry(CART.width, CART.height)), labelMat);
    label.position.set(0, 0.6, 1.92);
    g.add(label);
    return g;
  }

  /** Disque posé à côté du boîtier, légèrement tourné vers la caméra. */
  function layout() {
    const doc = editor.doc;
    const bw = geometry(doc).panels.front.w + CASE_MARGIN_W;
    if (showDisc && !wide) {
      baseX = -60;
      caseGroup.position.set(-60, 0, 0);
      if (usesCartridge(doc)) {
        // Une cartouche est petite : posée tout près, à taille réelle.
        discGroup.position.set(-60 + bw / 2 + 35, -45, 15);
        discGroup.rotation.set(-0.1, -0.3, 0);
      } else {
        discGroup.position.set(-60 + bw / 2 + 70, -30, 20);
        discGroup.rotation.set(-0.15, -0.35, 0);
      }
    } else {
      baseX = 0;
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
      three: new THREE.Vector3(-0.75, 0.16, 1).normalize(),
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
  <div class="options">
    <select bind:value={caseColor} aria-label="Couleur du boîtier" title="Couleur du plastique du boîtier">
      {#each CASE_COLORS as c}<option value={c.id}>{c.label}</option>{/each}
    </select>
    <label class="check"><input type="checkbox" bind:checked={showDisc} />{usesCartridge(editor.doc) ? 'Cartouche' : 'Disque'}</label>
  </div>
  <div class="toolbar">
    <div class="seg">
      <button onclick={() => view('three')} title="Vue de trois-quarts">¾</button>
      <button onclick={() => view('front')}>Face</button>
      <button onclick={() => view('spine')}>Tranche</button>
      <button onclick={() => view('back')}>Dos</button>
    </div>
    <button class:on={opened} disabled={demo} onclick={() => (opened = !opened)}>{opened ? 'Fermer le boîtier' : 'Ouvrir le boîtier'}</button>
    <button class:on={demo} disabled={recording} onclick={() => (demo = !demo)} title="Le boîtier s'ouvre et se referme en boucle">Présentation</button>
    <button disabled={recording} onclick={recordVideo} title="Enregistre {CYCLE} secondes d'animation">{recording ? 'Enregistrement…' : 'Vidéo'}</button>
    <label class="check"><input type="checkbox" bind:checked={autoRotate} />Rotation</label>
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
    background: radial-gradient(circle at 50% 40%, var(--stage-1) 0%, var(--stage-2) 75%);
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
    left: 0;
    right: 0;
    bottom: 34px;
    width: fit-content;
    margin-inline: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    background: var(--overlay);
    border: 1px solid var(--line);
    border-radius: 10px;
    white-space: nowrap;
    flex-wrap: wrap;
    justify-content: center;
    max-width: calc(100% - 24px);
  }
  .toolbar button.on {
    border-color: var(--accent);
    color: var(--accent-text);
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
  /* Réglages d'apparence, en haut à gauche pour garder la barre du bas sur une ligne. */
  .options {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    background: var(--overlay);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 12px;
  }
  .options select {
    font-size: 12px;
    padding: 3px 6px;
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
