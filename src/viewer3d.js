import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { MODELS } from './models.js'

// One renderer for every 3D project, created on first use and reused,
// since browsers only allow a handful of WebGL contexts.

let renderer, labels, scene, camera, controls, timer

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.domElement.className = 'stage-layer'

  labels = new CSS2DRenderer()
  labels.domElement.className = 'stage-layer'
  labels.domElement.style.pointerEvents = 'none'

  scene = new THREE.Scene()
  // soft studio reflections, this is what makes the metal read as metal
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.55

  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200)

  const key = new THREE.DirectionalLight(0xfff4e6, 2.6)
  key.position.set(6, 10, 5)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = key.shadow.camera.bottom = -12
  key.shadow.camera.right = key.shadow.camera.top = 12
  key.shadow.bias = -0.0004
  scene.add(key)

  const rim = new THREE.DirectionalLight(0xe0b04a, 1.8)
  rim.position.set(-7, 5, -6)
  scene.add(rim)

  scene.add(new THREE.HemisphereLight(0xf0f0ff, 0x16161d, 0.35))

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.38 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.6
  controls.enablePan = false
  controls.minDistance = 3
  controls.maxDistance = 30
  controls.maxPolarAngle = Math.PI / 2 - 0.04 // never dip under the floor
  // stop the slow spin once someone grabs it, like they'd expect
  controls.addEventListener('start', () => (controls.autoRotate = false))

  timer = new THREE.Timer()
}

export function mount3d(stage, id, ui) {
  if (!renderer) init()
  stage.append(renderer.domElement, labels.domElement)

  const model = MODELS[id](ui, { camera, dom: renderer.domElement })
  model.object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  scene.add(model.object)
  camera.position.set(...model.camera)
  controls.target.set(...model.target)
  controls.autoRotate = true
  controls.update()
  const baseDistance = camera.position.distanceTo(controls.target)
  let touched = false
  const onStart = () => (touched = true)
  controls.addEventListener('start', onStart)

  let raf = 0
  timer.reset()

  function frame() {
    raf = requestAnimationFrame(frame)
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.05)
    model.update?.(timer.getElapsed(), dt)
    controls.update()
    renderer.render(scene, camera)
    labels.render(scene, camera)
  }

  frame()

  return {
    resize() {
      // client sizes ignore the window's open animation, which scales everything for a moment
      const width = stage.clientWidth
      const height = stage.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      labels.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      // a tall phone window sees less across, so back off until the model fits again
      if (!touched) {
        const offset = camera.position.clone().sub(controls.target)
        offset.setLength(baseDistance * Math.max(1, (1.3 / camera.aspect) ** 0.8))
        camera.position.copy(controls.target).add(offset)
      }
    },
    pause() {
      cancelAnimationFrame(raf)
    },
    resume() {
      cancelAnimationFrame(raf)
      timer.reset()
      frame()
    },
    destroy() {
      controls.removeEventListener('start', onStart)
      model.dispose?.()
      cancelAnimationFrame(raf)
      scene.remove(model.object)
      // labels only clean up when removed directly, not with their parent group
      model.object.traverse((o) => o.isCSS2DObject && o.element.remove())
      dispose(model.object)
      renderer.domElement.remove()
      labels.domElement.remove()
    },
  }
}

function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) {
      m.map?.dispose()
      m.dispose()
    }
  })
}
