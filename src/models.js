import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy'

// Every model returns { object, update(t, dt), camera, target } and may add dispose().
// They all share the rasterizer's look: dark flat-shaded faces with gold edges,
// a grid floor, cherry for whatever is signal (scans, intruders, bits).

const GOLD = 0xd9a83f
const CHERRY = 0xd61a3c
const IVORY = 0xdcdce3
const FONT = "'JetBrains Mono', ui-monospace, monospace"
const UP = new THREE.Vector3(0, 1, 0)

// ---------------------------------------------------------------- shared pieces

function materials() {
  return {
    gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.28 }),
    epoxy: new THREE.MeshStandardMaterial({ color: 0x111116, metalness: 0.05, roughness: 0.62 }),
    cherry: new THREE.MeshStandardMaterial({ color: CHERRY, metalness: 0.25, roughness: 0.3 }),
  }
}

function hull(color = 0x2b2b34, metalness = 0.55, roughness = 0.38) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true })
}

function edgeLines(geometry, color = GOLD, opacity = 0.55) {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 20),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  )
}

// a flat-shaded solid with its hard edges drawn on top
function part(geometry, { color, edge = GOLD, edgeOpacity = 0.55, metal, rough } = {}) {
  const mesh = new THREE.Mesh(geometry, hull(color, metal, rough))
  mesh.add(edgeLines(geometry, edge, edgeOpacity))
  return mesh
}

function at(obj, x, y, z) {
  obj.position.set(x, y, z)
  return obj
}

function rbox(w, h, d, mat, r = 0.04) {
  const radius = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mat)
}

function tag(text, cls = '') {
  const el = document.createElement('div')
  el.className = `label3d ${cls}`.trim()
  el.textContent = text
  return new CSS2DObject(el)
}

function grid(size, divisions) {
  return new THREE.GridHelper(size, divisions, 0x45454f, 0x26262f)
}

// ROS frame axes, mapped to three's y-up world: x forward, y left (-z), z up (+y)
function axes(size) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, size, 0, 0, 0, 0, 0, 0, 0, -size, 0, 0, 0, 0, size, 0], 3))
  const c = (hex) => new THREE.Color(hex).toArray()
  geo.setAttribute('color', new THREE.Float32BufferAttribute([...c(CHERRY), ...c(CHERRY), ...c(GOLD), ...c(GOLD), ...c(IVORY), ...c(IVORY)], 3))
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }))
}

function track(points, color, opacity = 0.5) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  )
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

// ---------------------------------------------------------------- rasterizer

function rasterizer() {
  const m = materials()
  const g = new THREE.Group()

  const geo = new THREE.TorusKnotGeometry(1.05, 0.34, 140, 14).toNonIndexed()
  geo.computeVertexNormals()
  const knot = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x2b2b34, metalness: 0.55, roughness: 0.38, flatShading: true }),
  )
  knot.position.y = 2.3
  g.add(knot)
  // every triangle edge, the thing a rasterizer actually draws
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35 }),
  )
  knot.add(wire)

  const lens = new THREE.PerspectiveCamera(32, 1.5, 1.4, 6.5)
  lens.position.set(-5.2, 3.3, 3.6)
  lens.lookAt(0, 2.3, 0)
  lens.updateMatrixWorld()
  const helper = new THREE.CameraHelper(lens)
  helper.setColors(
    new THREE.Color(0xe0b04a),
    new THREE.Color(0xff1f4b),
    new THREE.Color(0xe0b04a),
    new THREE.Color(0xff1f4b),
    new THREE.Color(0x55555f),
  )
  g.add(lens, helper)

  const body = new THREE.Group()
  body.position.copy(lens.position)
  body.quaternion.copy(lens.quaternion)
  body.add(rbox(0.55, 0.38, 0.42, m.epoxy, 0.05))
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.3, 28), m.gold)
  barrel.rotation.x = Math.PI / 2
  barrel.position.z = -0.32
  body.add(barrel)
  const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.11, 28), m.cherry)
  glassDisc.position.z = -0.475
  glassDisc.rotation.y = Math.PI
  body.add(glassDisc)
  g.add(body)

  // the near plane drawn as a framebuffer, just a pixel grid
  const pixels = canvasTexture(256, 170, (c, w, h) => {
    c.fillStyle = 'rgba(224,176,74,0.06)'
    c.fillRect(0, 0, w, h)
    c.strokeStyle = 'rgba(224,176,74,0.35)'
    c.lineWidth = 1
    for (let x = 0; x <= w; x += 16) {
      c.beginPath()
      c.moveTo(x + 0.5, 0)
      c.lineTo(x + 0.5, h)
      c.stroke()
    }
    for (let y = 0; y <= h; y += 16) {
      c.beginPath()
      c.moveTo(0, y + 0.5)
      c.lineTo(w, y + 0.5)
      c.stroke()
    }
  })
  const nearH = 2 * lens.near * Math.tan(THREE.MathUtils.degToRad(lens.fov / 2))
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(nearH * lens.aspect, nearH),
    new THREE.MeshBasicMaterial({ map: pixels, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  )
  screen.position.copy(lens.position)
  screen.quaternion.copy(lens.quaternion)
  screen.translateZ(-lens.near)
  g.add(screen)

  g.add(grid(12, 24))

  return {
    object: g,
    camera: [5.5, 4.8, 9.5],
    target: [-1.6, 2.1, 0],
    update(t, dt) {
      knot.rotation.y += dt * 0.5
      knot.rotation.x = 0.3 * Math.sin(t * 0.4)
    },
  }
}

// ---------------------------------------------------------------- ros2 rover

function rover() {
  const g = new THREE.Group()
  g.add(grid(14, 28))

  // the custom gazebo world: a few boxes and posts around a figure-eight drive
  const obstacles = []
  const block = (geo, x, y, z) => {
    const mesh = at(part(geo, { color: 0x1e1e26, edgeOpacity: 0.7, metal: 0.2, rough: 0.85 }), x, y, z)
    g.add(mesh)
    obstacles.push(mesh)
  }
  block(new THREE.BoxGeometry(2.2, 0.9, 0.8), 0, 0.45, 3.4)
  block(new THREE.BoxGeometry(1.2, 1.2, 1.2), 0.4, 0.6, -3.5)
  block(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 20), -5, 0.6, 0.3)
  block(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), 5, 0.5, -0.6)
  block(new THREE.BoxGeometry(1, 0.7, 1.6), -3.6, 0.35, -3.4)
  block(new THREE.BoxGeometry(1.4, 0.8, 0.8), 3.7, 0.4, 3.3)
  block(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 16), 2.45, 0.45, 0)
  block(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 16), -2.45, 0.45, 0)

  const bot = new THREE.Group()
  g.add(bot)
  bot.add(at(part(new THREE.BoxGeometry(1.2, 0.3, 0.8)), 0, 0.42, 0))
  bot.add(at(part(new THREE.BoxGeometry(0.85, 0.05, 0.66)), -0.05, 0.6, 0))

  const wheels = []
  for (const z of [-0.5, 0.5]) {
    const wheel = at(new THREE.Group(), 0.15, 0.3, z)
    const tire = part(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 24), { color: 0x15151b })
    tire.rotation.x = Math.PI / 2
    wheel.add(tire)
    // spokes, otherwise a spinning cylinder looks still
    const spokes = []
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3
      for (const side of [-0.065, 0.065]) {
        spokes.push(new THREE.Vector3(Math.cos(a) * 0.28, Math.sin(a) * 0.28, side))
        spokes.push(new THREE.Vector3(-Math.cos(a) * 0.28, -Math.sin(a) * 0.28, side))
      }
    }
    wheel.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), new THREE.LineBasicMaterial({ color: GOLD })))
    bot.add(wheel)
    wheels.push(wheel)
  }
  bot.add(at(part(new THREE.IcosahedronGeometry(0.1, 1)), -0.45, 0.1, 0))

  bot.add(at(part(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8)), 0.3, 0.71, 0))
  const lidar = at(part(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 20)), 0.3, 0.86, 0)
  bot.add(lidar)
  const beam = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.24, 0, 0)]),
    new THREE.LineBasicMaterial({ color: CHERRY }),
  )
  lidar.add(beam)

  const baseFrame = at(axes(0.6), 0, 0.02, 0)
  baseFrame.add(at(tag('base_link'), 0, -0.05, 0.35))
  bot.add(baseFrame)
  bot.add(at(axes(0.32), 0.3, 0.94, 0))
  const odom = axes(0.9)
  odom.add(at(tag('odom'), 0, -0.05, 0.4))
  g.add(odom)

  // LaserScan, drawn as points the way RViz shows it, refreshed at 10 Hz
  const RAYS = 360
  const hits = new Float32Array(RAYS * 3)
  const hitOk = new Uint8Array(RAYS)
  const scanPos = new Float32Array(RAYS * 6)
  const scanGeo = new THREE.BufferGeometry()
  scanGeo.setAttribute('position', new THREE.BufferAttribute(scanPos, 3))
  scanGeo.setDrawRange(0, 0)
  const scan = new THREE.LineSegments(scanGeo, new THREE.LineBasicMaterial({ color: CHERRY }))
  scan.frustumCulled = false
  g.add(scan)

  // the odometry path behind it
  const TRAIL = 420
  const trailPos = new Float32Array(TRAIL * 3)
  const trailGeo = new THREE.BufferGeometry()
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3))
  trailGeo.setDrawRange(0, 0)
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.45 }))
  trail.frustumCulled = false
  g.add(trail)

  const raycaster = new THREE.Raycaster()
  raycaster.far = 6
  const origin = new THREE.Vector3()
  const dir = new THREE.Vector3()
  let scanClock = 1
  let trailClock = 0
  let trailCount = 0

  const A = 3.4
  const B = 3.6
  const RATE = 0.2

  return {
    object: g,
    camera: [5.4, 4.6, 6.2],
    target: [0, 0.3, 0],
    update(t, dt) {
      // a figure eight between the obstacles, like a teleop lap
      const u = t * RATE
      const vx = A * Math.cos(u)
      const vz = B * Math.cos(2 * u)
      bot.position.set(A * Math.sin(u), 0, (B / 2) * Math.sin(2 * u))
      bot.rotation.y = Math.atan2(-vz, vx)
      const speed = Math.hypot(vx, vz) * RATE
      for (const wheel of wheels) wheel.rotation.z -= (speed * dt) / 0.3
      lidar.rotation.y += dt * 12

      scanClock += dt
      if (scanClock >= 0.1) {
        scanClock = 0
        bot.updateMatrixWorld(true)
        lidar.getWorldPosition(origin)
        for (let i = 0; i < RAYS; i++) {
          const a = (i / RAYS) * Math.PI * 2
          dir.set(Math.cos(a), 0, Math.sin(a))
          raycaster.set(origin, dir)
          const hit = raycaster.intersectObjects(obstacles, false)[0]
          hitOk[i] = hit ? 1 : 0
          if (hit) hits.set([hit.point.x, hit.point.y, hit.point.z], i * 3)
        }
        // join neighbouring hits on the same surface; a big jump means a different obstacle
        let n = 0
        for (let i = 0; i < RAYS; i++) {
          const j = (i + 1) % RAYS
          if (!hitOk[i] || !hitOk[j]) continue
          const dx = hits[i * 3] - hits[j * 3]
          const dz = hits[i * 3 + 2] - hits[j * 3 + 2]
          if (dx * dx + dz * dz > 0.09) continue
          scanPos.set(hits.subarray(i * 3, i * 3 + 3), n * 6)
          scanPos.set(hits.subarray(j * 3, j * 3 + 3), n * 6 + 3)
          n++
        }
        scanGeo.setDrawRange(0, n * 2)
        scanGeo.attributes.position.needsUpdate = true
      }

      trailClock += dt
      if (trailClock >= 0.05) {
        trailClock = 0
        if (trailCount === TRAIL) trailPos.copyWithin(0, 3)
        else trailCount++
        trailPos.set([bot.position.x, 0.02, bot.position.z], (trailCount - 1) * 3)
        trailGeo.setDrawRange(0, trailCount)
        trailGeo.attributes.position.needsUpdate = true
      }
    },
  }
}

// ---------------------------------------------------------------- uav encounter

function copterModel() {
  const c = new THREE.Group()
  c.rotation.order = 'YXZ' // yaw first, then roll and pitch are about the body axes
  c.add(part(new THREE.BoxGeometry(0.42, 0.12, 0.42)))
  c.add(at(part(new THREE.BoxGeometry(0.26, 0.06, 0.26)), 0, 0.09, 0))
  const blades = []
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const arm = at(part(new THREE.BoxGeometry(0.62, 0.04, 0.06)), dx * 0.34, 0, dz * 0.34)
    arm.rotation.y = -a
    c.add(arm)
    c.add(at(part(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12)), dx * 0.64, 0.04, dz * 0.64))
    // prop disc outline, what you'd see at speed
    const ring = []
    for (let i = 0; i <= 32; i++) ring.push(new THREE.Vector3(Math.cos((i / 32) * Math.PI * 2) * 0.26, 0, Math.sin((i / 32) * Math.PI * 2) * 0.26))
    c.add(at(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.45 })), dx * 0.64, 0.1, dz * 0.64))
    const blade = at(part(new THREE.BoxGeometry(0.48, 0.008, 0.035), { color: 0x15151b, edgeOpacity: 0.35 }), dx * 0.64, 0.1, dz * 0.64)
    blade.userData.spin = k % 2 ? 1 : -1
    c.add(blade)
    blades.push(blade)
  }
  for (const z of [-0.15, 0.15]) c.add(at(part(new THREE.BoxGeometry(0.5, 0.015, 0.015)), 0, -0.17, z))
  for (const x of [-0.12, 0.12]) for (const z of [-0.15, 0.15]) c.add(at(part(new THREE.BoxGeometry(0.015, 0.11, 0.015)), x, -0.11, z))
  c.add(at(part(new THREE.BoxGeometry(0.08, 0.08, 0.1)), 0.24, -0.04, 0))
  return { copter: c, blades }
}

function planeModel() {
  const p = new THREE.Group()
  p.rotation.order = 'YXZ'
  const red = { edge: CHERRY, edgeOpacity: 0.75 }
  const fuselage = part(new THREE.CylinderGeometry(0.07, 0.045, 1.1, 8), red)
  fuselage.rotation.z = Math.PI / 2
  p.add(fuselage)
  const nose = at(part(new THREE.ConeGeometry(0.07, 0.18, 8), red), 0.64, 0, 0)
  nose.rotation.z = -Math.PI / 2
  p.add(nose)
  p.add(at(part(new THREE.BoxGeometry(0.24, 0.025, 1.5), red), 0.08, 0.02, 0))
  p.add(at(part(new THREE.BoxGeometry(0.13, 0.02, 0.48), red), -0.5, 0.02, 0))
  p.add(at(part(new THREE.BoxGeometry(0.14, 0.22, 0.02), red), -0.5, 0.12, 0))
  return p
}

function uav() {
  const g = new THREE.Group()
  g.add(grid(26, 26))

  const A = new THREE.Vector3(-12, 3, 4.6)
  const B = new THREE.Vector3(12, 3, -2.8)
  const station = new THREE.Vector3(0, 2.4, 0)
  const FLY = 8 // seconds from A to B
  const PERIOD = 9.5

  const { copter, blades } = copterModel()
  copter.scale.setScalar(1.8)
  g.add(copter)

  // the copter faces where the intruder comes from, so its camera sees it early
  const toA = new THREE.Vector3().subVectors(A, station).setY(0).normalize()
  copter.rotation.y = Math.atan2(-toA.z, toA.x)
  const right = new THREE.Vector3().crossVectors(toA, UP)
  const avoid = station.clone().addScaledVector(right, 2.4).addScaledVector(UP, 0.9)

  const lens = new THREE.PerspectiveCamera(48, 1.4, 0.2, 2.2)
  lens.position.set(0.28, -0.04, 0)
  lens.rotation.order = 'YXZ'
  lens.rotation.set(-0.1, -Math.PI / 2, 0)
  copter.add(lens)
  const frustum = new THREE.CameraHelper(lens)
  frustum.setColors(
    new THREE.Color(0xe0b04a),
    new THREE.Color(0xff1f4b),
    new THREE.Color(0xe0b04a),
    new THREE.Color(0xff1f4b),
    new THREE.Color(0x55555f),
  )
  // the helper follows the lens by hand, three won't move it on its own
  frustum.matrixWorldAutoUpdate = false
  g.add(frustum)

  const plane = planeModel()
  plane.scale.setScalar(1.5)
  plane.add(at(tag('intruder', 'cherry'), 0, 0.4, 0))
  g.add(plane)

  g.add(track([A, B], CHERRY, 0.45))
  g.add(track([station, avoid], GOLD, 0.5))

  const sepGeo = new THREE.BufferGeometry().setFromPoints([station, A])
  const sepMat = new THREE.LineBasicMaterial({ color: IVORY, transparent: true, opacity: 0.45 })
  const sepLine = new THREE.Line(sepGeo, sepMat)
  sepLine.frustumCulled = false
  g.add(sepLine)

  // closest approach along the track decides when the scripted sidestep starts
  const ab = new THREE.Vector3().subVectors(B, A)
  const sClosest = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(station, A).dot(ab) / ab.lengthSq(), 0, 1)
  const tClosest = sClosest * FLY
  const heading = Math.atan2(-ab.z, ab.x)

  let lastOffset = 0

  return {
    object: g,
    camera: [5.4, 4, 6.6],
    target: [0, 2.4, 0],
    update(t, dt) {
      const local = t % PERIOD
      const s = local / FLY
      plane.visible = s <= 1
      plane.position.lerpVectors(A, B, Math.min(s, 1))
      plane.rotation.y = heading

      // GUIDED-mode script: step right and up before the pass, hold, come back after
      const out = ease((local - (tClosest - 2.4)) / 1.6)
      const back = ease((local - (tClosest + 1.4)) / 2)
      const offset = out * (1 - back)
      copter.position.lerpVectors(station, avoid, offset)
      copter.position.y += 0.04 * Math.sin(t * 2.1)
      const lateral = (offset - lastOffset) / Math.max(dt, 1e-3)
      lastOffset = offset
      copter.rotation.x = THREE.MathUtils.lerp(copter.rotation.x, -lateral * 0.25, 0.1) // bank into the sidestep
      for (const b of blades) b.rotation.y += b.userData.spin * dt * 30

      copter.updateMatrixWorld(true)
      frustum.matrixWorld.copy(lens.matrixWorld)

      const sep = copter.position.distanceTo(plane.position)
      sepLine.visible = plane.visible
      sepGeo.setFromPoints([copter.position, plane.position])
      sepMat.color.set(sep < 3.5 ? 0xff1f4b : IVORY)
    },
  }
}

// ---------------------------------------------------------------- bare-metal uart

function uart() {
  const g = new THREE.Group()
  g.add(grid(14, 28))

  const chipX = -3.2
  g.add(at(part(new THREE.BoxGeometry(2.4, 0.08, 2), { color: 0x15151b, edgeOpacity: 0.4, metal: 0.1, rough: 0.9 }), chipX, 0.04, 0.1))
  const chip = at(part(new THREE.BoxGeometry(1.3, 0.2, 1.3), { color: 0x202028, metal: 0.2, rough: 0.8 }), chipX, 0.18, 0.1)
  chip.add(at(tag('cortex-m4'), 0, 0.3, 0))
  g.add(chip)
  const pinGeo = new THREE.BoxGeometry(0.05, 0.03, 0.16)
  const pins = new THREE.InstancedMesh(pinGeo, materials().gold, 40)
  const dummy = new THREE.Object3D()
  let k = 0
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 10; i++) {
      const along = (i - 4.5) * 0.12
      dummy.position.set(along, 0.11, 0.73).applyAxisAngle(UP, (side * Math.PI) / 2).add(new THREE.Vector3(chipX, 0, 0.1))
      dummy.rotation.set(0, (side * Math.PI) / 2, 0)
      dummy.updateMatrix()
      pins.setMatrixAt(k++, dummy.matrix)
    }
  }
  g.add(pins)

  // the wire: TX out to the right, a U-turn, and back into RX (the loopback test)
  const txZ = 0.55
  const rxZ = 0.15
  const x0 = chipX + 0.75
  const x1 = 4.4
  const turn = (txZ - rxZ) / 2
  const pathPoints = []
  const N = 900
  const straight = x1 - x0
  const total = straight * 2 + Math.PI * turn
  for (let i = 0; i < N; i++) {
    const s = (i / (N - 1)) * total
    let x, z
    if (s < straight) {
      x = x0 + s
      z = txZ
    } else if (s < straight + Math.PI * turn) {
      const a = (s - straight) / turn
      x = x1 + Math.sin(a) * turn
      z = rxZ + turn + Math.cos(a) * turn
    } else {
      x = x1 - (s - straight - Math.PI * turn)
      z = rxZ
    }
    pathPoints.push([x, z, s])
  }
  const wirePos = new Float32Array(N * 3)
  const wireGeo = new THREE.BufferGeometry()
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3))
  const wire = new THREE.Line(wireGeo, new THREE.LineBasicMaterial({ color: CHERRY }))
  wire.frustumCulled = false
  g.add(wire)
  g.add(at(tag('TX', 'cherry'), x0 + 0.5, 0.5, txZ + 0.35))
  g.add(at(tag('RX'), x0 + 0.5, 0.35, rxZ - 0.4))

  // the TX ring buffer the driver fills from main() and the ISR drains
  const SLOTS = 16
  const center = new THREE.Vector3(0.7, 0.08, -1.75)
  const R = 1.15
  const slotGeo = new THREE.BoxGeometry(0.36, 0.14, 0.36)
  const emptyMat = hull(0x1a1a21)
  const fullMat = new THREE.MeshStandardMaterial({ color: 0x6b5016, emissive: 0x4a3206, emissiveIntensity: 0.6, flatShading: true })
  const slots = []
  for (let i = 0; i < SLOTS; i++) {
    const a = (i / SLOTS) * Math.PI * 2 - Math.PI / 2
    const mesh = new THREE.Mesh(slotGeo, emptyMat)
    mesh.add(edgeLines(slotGeo, GOLD, 0.5))
    mesh.position.set(center.x + Math.cos(a) * R, center.y, center.z + Math.sin(a) * R)
    mesh.rotation.y = -a
    const char = at(tag(''), 0, 0.22, 0)
    char.visible = false
    mesh.add(char)
    g.add(mesh)
    slots.push({ mesh, char, angle: a })
  }

  function pointer(color, text, cls, reach) {
    const p = new THREE.Group()
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 12), new THREE.MeshStandardMaterial({ color, flatShading: true }))
    cone.rotation.z = Math.PI / 2 // points along -x, toward the ring
    p.add(cone)
    p.add(at(tag(text, cls), -0.1, 0.25, 0))
    g.add(p)
    return { group: p, angle: -Math.PI / 2, reach }
  }
  // different distances from the ring so the two never sit on top of each other when the buffer is empty
  const headPtr = pointer(CHERRY, 'head', 'cherry', 0.9)
  const tailPtr = pointer(GOLD, 'tail', '', 0.45)

  const place = (ptr, index, dt) => {
    const target = (index / SLOTS) * Math.PI * 2 - Math.PI / 2
    // slide the short way round, never backwards past the wrap
    let delta = target - ptr.angle
    while (delta < -Math.PI) delta += Math.PI * 2
    while (delta > Math.PI) delta -= Math.PI * 2
    ptr.angle += delta * Math.min(1, dt * 12)
    const r = R + ptr.reach
    ptr.group.position.set(center.x + Math.cos(ptr.angle) * r, center.y + 0.05, center.z + Math.sin(ptr.angle) * r)
    ptr.group.rotation.y = -ptr.angle
  }

  const MESSAGE = 'hello, world\n'
  const BIT = 0.06 // seconds per bit on screen, slowed way down from 115200
  const SPEED = 2.4 // how fast bits travel along the wire
  const buffer = new Array(SLOTS).fill(null)
  let head = 0
  let tail = 0
  let count = 0
  let lineFreeAt = 0
  let nextBurst = 0.5
  let burstIndex = MESSAGE.length
  let nextWrite = 0
  const frames = [] // bytes already sent, { start, byte }

  function levelAt(time) {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i]
      if (time >= f.start) {
        const bit = Math.floor((time - f.start) / BIT)
        if (bit === 0) return 0 // start bit
        if (bit >= 1 && bit <= 8) return (f.byte >> (bit - 1)) & 1 // LSB first
        return 1 // stop bit, then idle high
      }
    }
    return 1
  }

  const show = (c) => (c === '\n' ? '\\n' : c === ' ' ? '␣' : c)

  return {
    object: g,
    camera: [4.6, 6, 7.6],
    target: [0.6, 0, -0.4],
    update(t, dt) {
      // main(): a burst of writes every few seconds
      if (t >= nextBurst) {
        burstIndex = 0
        nextWrite = t
        nextBurst = t + 9
      }
      if (burstIndex < MESSAGE.length && t >= nextWrite && count < SLOTS) {
        const c = MESSAGE[burstIndex++]
        buffer[head] = c
        slots[head].mesh.material = fullMat
        slots[head].char.element.textContent = show(c)
        slots[head].char.visible = true
        head = (head + 1) % SLOTS
        count++
        nextWrite = t + 0.08
      }

      // TXE interrupt: line is free, send the byte at tail
      if (t >= lineFreeAt && count > 0) {
        const c = buffer[tail]
        buffer[tail] = null
        slots[tail].mesh.material = emptyMat
        slots[tail].char.visible = false
        tail = (tail + 1) % SLOTS
        count--
        frames.push({ start: t, byte: c.charCodeAt(0) })
        lineFreeAt = t + BIT * 10 + 0.02
      }
      while (frames.length > 40) frames.shift()

      for (let i = 0; i < N; i++) {
        const [x, z, s] = pathPoints[i]
        const level = levelAt(t - s / SPEED)
        wirePos.set([x, 0.08 + level * 0.3, z], i * 3)
      }
      wireGeo.attributes.position.needsUpdate = true

      place(headPtr, head, dt)
      place(tailPtr, tail, dt)
    },
  }
}

// ---------------------------------------------------------------- solipsium code map

// Solipsium's repo as a chip: one block per part of the code, standing on the die.
// Footprint and height both grow with the square root of the file count, so a block's
// volume follows how much code is in it, and tests don't swallow the whole die.
const BLOCKS = [
  { id: 'core', files: 181, about: 'The audio engine and the web server.' },
  { id: 'web', files: 116, about: 'The website and the editor that runs in the browser.' },
  { id: 'tests', files: 516, about: 'Tests that run on every push.' },
  { id: 'eval', files: 201, about: 'Checks how much each repair helps.' },
  { id: 'scripts', files: 157, about: 'Helper scripts for setup and backups.' },
  { id: 'prism', files: 44, about: 'Where I train my own models.' },
  { id: 'research', files: 38, about: 'Early tries at training a model from scratch.' },
  { id: 'shorts', files: 28, about: 'Turns an idea into a YouTube Short.' },
  { id: 'desktop', files: 28, about: 'A Windows app that cleans up audio as it plays.' },
  { id: 'chrome', files: 12, about: 'A Chrome extension that cleans up audio in a tab.' },
  { id: 'infra', files: 25, about: 'The setup for running it on Modal.' },
]

// Got the real logo as an image? Put it in public/ and name it here, e.g. '/solipsium-logo.png'.
// Until then the wordmark is drawn: SOLIPSIUM in a thin gold box, AUDIO ENGINE in a smaller one.
const LOGO_FILE = null

function logoTexture() {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 640
  const ctx = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const serif = '"EB Garamond", Georgia, "Times New Roman", serif'

  // letter-spaced capitals, centred on x
  function spaced(text, size, spacing, x, y) {
    ctx.font = `500 ${size}px ${serif}`
    const widths = [...text].map((ch) => ctx.measureText(ch).width)
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1)
    let cx = x - total / 2
    ;[...text].forEach((ch, i) => {
      ctx.fillText(ch, cx, y)
      cx += widths[i] + spacing
    })
    return total
  }

  function draw(img) {
    ctx.clearRect(0, 0, c.width, c.height)
    if (img) {
      const k = Math.min(c.width / img.width, c.height / img.height)
      ctx.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k)
    } else {
      ctx.fillStyle = ctx.strokeStyle = '#e0b04a'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 5
      const big = spaced('SOLIPSIUM', 230, 34, c.width / 2, 250)
      ctx.strokeRect(c.width / 2 - big / 2 - 70, 110, big + 140, 270)
      const small = spaced('AUDIO ENGINE', 76, 30, c.width / 2, 492)
      ctx.lineWidth = 4
      ctx.strokeRect(c.width / 2 - small / 2 - 48, 438, small + 96, 108)
    }
    tex.needsUpdate = true
  }

  draw()
  // redraw once the serif has loaded, it's usually not there yet the first time
  document.fonts?.load(`500 230px "EB Garamond"`).then(() => draw(), () => {})
  if (LOGO_FILE) {
    const img = new Image()
    img.onload = () => draw(img)
    img.src = LOGO_FILE
  }
  return tex
}

function solipsium(ui, view) {
  const g = new THREE.Group()
  g.add(grid(18, 36))

  const DIE_W = 7.4
  const DIE_D = 6.4
  const LOGO_D = 1.45 // strip along the front edge of the die where the logo is printed
  const base = 0.16
  // matte, like the rover's obstacles: the gold is for edges, not surfaces
  const matte = { metal: 0.1, rough: 0.9 }
  g.add(at(part(new THREE.BoxGeometry(DIE_W + 1.3, base, DIE_D + 1.3), { color: 0x131318, edgeOpacity: 0.25, ...matte }), 0, base / 2, 0))
  const dieT = 0.12
  g.add(at(part(new THREE.BoxGeometry(DIE_W, dieT, DIE_D), { color: 0x1c1c24, edgeOpacity: 0.55, ...matte }), 0, base + dieT / 2, 0))
  const top = base + dieT

  const PAD = 0.22
  const root = hierarchy({ children: BLOCKS })
    .sum((d) => (d.files ? Math.sqrt(d.files) : 0))
    .sort((a, b) => b.value - a.value)
  treemap()
    .size([DIE_W - PAD * 2, DIE_D - LOGO_D - PAD * 2])
    .tile(treemapSquarify.ratio(1.2))
    .paddingInner(0.16)(root)

  const most = Math.max(...BLOCKS.map((b) => b.files))
  // the logo, printed on the die like a maker's mark
  const logoW = 4.6
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(logoW, (logoW * 640) / 2048),
    new THREE.MeshBasicMaterial({ map: logoTexture(), transparent: true, depthWrite: false }),
  )
  logo.rotation.x = -Math.PI / 2
  logo.position.set(0, top + 0.003, DIE_D / 2 - LOGO_D / 2 - 0.05)
  g.add(logo)

  const blocks = root.leaves().map((leaf, i) => {
    const b = leaf.data
    const w = leaf.x1 - leaf.x0
    const d = leaf.y1 - leaf.y0
    const height = 0.12 + 1.5 * Math.sqrt(b.files / most)
    const geo = new THREE.BoxGeometry(w, 1, d)
    geo.translate(0, 0.5, 0) // so scaling y grows it up off the die
    const mesh = part(geo, { color: 0x2b2b34, edgeOpacity: 0.5, metal: 0.2, rough: 0.78 })
    mesh.position.set(-DIE_W / 2 + PAD + leaf.x0 + w / 2, top, -DIE_D / 2 + PAD + leaf.y0 + d / 2)
    mesh.scale.y = 0.001
    g.add(mesh)

    const el = document.createElement('div')
    el.className = 'label3d'
    const name = document.createElement('div')
    name.textContent = b.id
    const sub = document.createElement('div')
    sub.className = 'sub'
    const count = document.createElement('div')
    count.className = 'count'
    count.textContent = `${b.files} files`
    sub.append(count, b.about)
    sub.hidden = true
    el.append(name, sub)
    const label = new CSS2DObject(el)
    label.position.set(mesh.position.x, top, mesh.position.z)
    g.add(label)

    return { mesh, label, sub, edges: mesh.children[0].material, height, delay: 0.08 * i }
  })

  // hover (or tap, on a phone) a block to read what it is
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let active = null
  function setActive(block) {
    if (block === active) return
    if (active) {
      active.sub.hidden = true
      active.edges.opacity = 0.5
      active.label.element.classList.remove('on')
    }
    active = block
    if (active) {
      active.sub.hidden = false
      active.edges.opacity = 1
      active.label.element.classList.add('on')
    }
  }
  function pick(e) {
    const r = view.dom.getBoundingClientRect()
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(pointer, view.camera)
    const hit = raycaster.intersectObjects(
      blocks.map((b) => b.mesh),
      false,
    )[0]
    return blocks.find((b) => b.mesh === hit?.object) ?? null
  }
  const onMove = (e) => e.pointerType === 'mouse' && setActive(pick(e))
  const onDown = (e) => {
    if (e.pointerType === 'mouse') return
    const block = pick(e)
    setActive(block === active ? null : block)
  }
  // touch screens report the finger leaving right after every tap, so only a mouse clears it
  const onLeave = (e) => e.pointerType === 'mouse' && setActive(null)
  view.dom.addEventListener('pointermove', onMove)
  view.dom.addEventListener('pointerdown', onDown)
  view.dom.addEventListener('pointerleave', onLeave)

  return {
    object: g,
    camera: [6.2, 7.4, 9],
    target: [0, 0.4, 0.4],
    update(t) {
      // blocks rise off the die when the window opens, biggest first
      for (const b of blocks) {
        const grown = b.height * ease((t - b.delay) / 0.9)
        b.mesh.scale.y = Math.max(0.001, grown)
        b.label.position.y = top + grown + 0.12
      }
    },
    dispose() {
      view.dom.removeEventListener('pointermove', onMove)
      view.dom.removeEventListener('pointerdown', onDown)
      view.dom.removeEventListener('pointerleave', onLeave)
    },
  }
}

export const MODELS = { solipsium, rover, uav, rasterizer, uart }
