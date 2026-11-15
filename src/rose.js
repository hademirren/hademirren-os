// A rose in ASCII, traced from a painting of one.
//
// Every frame the picture is drawn, swaying a little, onto a small hidden canvas. Each
// character cell then looks at what's under it: where an edge crosses, it gets the glyph
// that runs the same way (/ | \ _ -), so petals and leaves come out as line work; inside
// a shape it gets a quiet fill. Colour comes from what the cell is: petal, stem or leaf.
import roseUrl from './rose.png'

const LINE_HEIGHT = 1.1
const SX = 4 // raster samples per cell across
const SY = 8 // and down, since a cell is about twice as tall as it is wide
const PIVOT = [160, 452] // bottom of the stem in the picture, where the sway turns from
const SWAY = 1.1 * (Math.PI / 180)
const MARGIN = 14 // picture px kept clear on each side so the sway never clips

const EDGE = 36 // how sharp a change has to be to draw a line, in (gamma'd) brightness
const LEAF_EDGE = 52 // leaves are shaded in soft patches; only their outlines and veins count
const BRIGHT = 150

// petals are pure red, the stem is orange (some green, its shaded side less), leaves are olive
function region(r, g, b) {
  if (Math.max(r, g, b) < 14) return 0
  if (g < r * 0.1) return 1
  if (g < r * 0.58) return 2
  return 3
}

// dark leaves sit close to black, so brightness is lifted before looking for edges
const LIFT = new Float32Array(256).map((_, i) => Math.sqrt(i) * 16)

export function createRose(pre, { font = '"JetBrains Mono", monospace', rows: rowTarget = 44 } = {}) {
  const img = new Image()
  img.src = roseUrl
  let aspect = 0.6 / LINE_HEIGHT
  let cols = 0
  let rows = 0
  let W = 0
  let H = 0
  let canvas = null
  let ctx = null
  let cellW = 1
  let cellH = 1
  let scale = 1 // raster px per picture px, across; down is scale * ky
  let ky = 1
  let ox = 0
  let oy = 0
  let raf = 0
  let running = false
  let L, R, grid, cls

  function size() {
    const host = pre.parentElement
    const pad = getComputedStyle(host)
    const w = host.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight)
    const h = host.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom)
    if (!w || !h || !img.naturalWidth) return false
    const iw = img.naturalWidth + 2 * MARGIN
    const ih = img.naturalHeight
    const fit = Math.min(w / iw, h / ih) // screen px per picture px
    const fs = Math.max(4.5, Math.min(12, (fit * ih) / (LINE_HEIGHT * rowTarget)))
    cellW = fs * aspect * LINE_HEIGHT
    cellH = fs * LINE_HEIGHT
    pre.style.fontSize = `${fs}px`
    const nextCols = Math.max(8, Math.floor((fit * iw) / cellW))
    const nextRows = Math.max(8, Math.floor((fit * ih) / cellH))
    if (nextCols === cols && nextRows === rows) return true
    cols = nextCols
    rows = nextRows
    W = cols * SX
    H = rows * SY
    canvas ??= document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    ctx = canvas.getContext('2d', { willReadFrequently: true })
    L = new Float32Array(W * H)
    R = new Uint8Array(W * H)
    grid = new Array(cols * rows)
    cls = new Array(cols * rows)
    // keep the picture's proportions on screen even though cells aren't square
    const s = Math.min((cols * cellW) / iw, (rows * cellH) / ih)
    scale = (s * SX) / cellW
    ky = (s * SY) / cellH / scale
    ox = W / 2 - (img.naturalWidth / 2) * scale
    oy = H / 2 - (ih / 2) * scale * ky
    return true
  }

  function render(t) {
    if (!ctx && !size()) return
    // two slow sways that don't line up, so it never looks like a metronome
    const angle = SWAY * (Math.sin(t * 0.7) * 0.8 + Math.sin(t * 0.31 + 1) * 0.2)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.setTransform(scale, 0, 0, scale * ky, ox, oy)
    ctx.translate(PIVOT[0], PIVOT[1])
    // rotate in picture space, then undo the squash so the stem bends, not shears
    ctx.scale(1, 1 / ky)
    ctx.rotate(angle)
    ctx.scale(1, ky)
    ctx.translate(-PIVOT[0], -PIVOT[1])
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, W, H).data
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      const r = px[j]
      const g = px[j + 1]
      const b = px[j + 2]
      L[i] = LIFT[Math.max(r, g, b)]
      R[i] = region(r, g, b)
    }

    // gradients are measured per raster px; these turn them into screen px
    const ax = SX / cellW
    const ay = SY / cellH
    const area = (cellW / SX) * (cellH / SY)
    const counts = [0, 0, 0, 0]
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let sxx = 0
        let syy = 0
        let sxy = 0
        let mag = 0
        let my = 0
        let lum = 0
        counts.fill(0)
        for (let y = row * SY; y < row * SY + SY; y++) {
          for (let x = col * SX; x < col * SX + SX; x++) {
            const i = y * W + x
            counts[R[i]]++
            lum += L[i]
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue
            const gx = (L[i + 1] - L[i - 1]) * 0.5 * ax
            const gy = (L[i + W] - L[i - W]) * 0.5 * ay
            const m = Math.hypot(gx, gy)
            sxx += gx * gx
            syy += gy * gy
            sxy += gx * gy
            mag += m
            my += m * ((y - row * SY + 0.5) / SY)
          }
        }
        const k = row * cols + col
        const inside = SX * SY - counts[0]
        let kind = 0
        for (let c = 1; c < 4; c++) if (counts[c] > (kind ? counts[kind] : 0)) kind = c
        if (!inside || !kind) {
          grid[k] = ' '
          cls[k] = ''
          continue
        }
        // the edge runs across the strongest gradient
        const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy) + Math.PI / 2
        const dx = Math.abs(Math.cos(theta))
        const dy = Math.abs(Math.sin(theta))
        const strength = (mag * area) / (cellW * dx + cellH * dy)
        const bright = lum / inside > BRIGHT
        if (strength > (kind === 3 ? LEAF_EDGE : EDGE)) {
          let a = ((theta * 180) / Math.PI) % 180
          if (a < 0) a += 180
          let ch
          if (a < 22.5 || a >= 157.5) ch = my / mag > 0.62 ? '_' : '-'
          else if (a < 67.5) ch = '\\'
          else if (a < 112.5) ch = '|'
          else ch = '/'
          grid[k] = ch
          cls[k] = kind === 1 ? (bright ? 'h' : 'r') : kind === 2 ? 's' : 'l'
        } else if (inside > SX * SY * 0.3) {
          grid[k] = '.'
          cls[k] = kind === 1 ? (bright ? 'p' : 'q') : kind === 2 ? 's' : 'o'
        } else {
          grid[k] = ' '
          cls[k] = ''
        }
      }
    }

    let out = ''
    for (let r = 0; r < rows; r++) {
      let cur = ''
      let run = ''
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const ch = grid[i]
        const k = ch === ' ' ? cur : cls[i]
        if (k !== cur) {
          if (run) out += cur ? `<span class="${cur}">${run}</span>` : run
          run = ''
          cur = k
        }
        run += ch
      }
      if (run) out += cur ? `<span class="${cur}">${run}</span>` : run
      out += '\n'
    }
    pre.innerHTML = out
  }

  // the sway is slow, so 20 frames a second is plenty and leaves the CPU alone
  let last = 0
  function frame(now) {
    raf = requestAnimationFrame(frame)
    if (now - last < 50) return
    last = now
    render(now / 1000)
  }

  async function init() {
    await Promise.all([img.decode().catch(() => {}), document.fonts?.load(`16px ${font}`).catch(() => {})])
    const c = document.createElement('canvas').getContext('2d')
    c.font = `100px ${font}`
    aspect = c.measureText('M').width / (100 * LINE_HEIGHT)
  }

  const ready = init()
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let wanted = false
  return {
    ready,
    async start() {
      wanted = true
      await ready
      if (!wanted || running) return
      size()
      if (still) return render(0)
      running = true
      raf = requestAnimationFrame(frame)
    },
    stop() {
      wanted = false
      running = false
      cancelAnimationFrame(raf)
    },
    resize() {
      if (size() && !running) render(0)
    },
    renderAt(t) {
      size()
      render(t)
    },
  }
}
