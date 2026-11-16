import { makeButton } from './ui.js'

// One macOS-style window: red closes, yellow minimizes to a dock at the bottom,
// green zooms to fill the screen. Drag it by the title bar, double-click to zoom.
// Content is anything with mount(stage, ui) returning { resize, pause, resume, destroy }.

const MARGIN = 8

// onShow and onHide fire whenever the window starts or stops covering the screen
export function createWindow({ onClose, onShow, onHide } = {}) {
  const win = document.querySelector('#window')
  const titlebar = win.querySelector('.titlebar')
  const titleEl = document.querySelector('#win-title')
  const captionEl = document.querySelector('#win-caption')
  const stage = document.querySelector('#stage')
  const dock = document.querySelector('#dock')

  let current = null // { content, controller }
  let token = 0 // guards against a slow mount finishing after a newer open
  let zoomed = false
  let saved = null // the rect to go back to after zooming out
  let closeTimer = null

  const ui = {
    // text, or nodes when the caption needs a link in it
    setCaption: (...parts) => captionEl.replaceChildren(...parts),
  }

  function place({ left, top, width, height }) {
    Object.assign(win.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` })
  }

  function defaultRect() {
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (vw < 700) return { left: MARGIN, top: MARGIN, width: vw - MARGIN * 2, height: vh - MARGIN * 2 }
    const width = Math.min(1000, vw - 64)
    const height = Math.min(660, vh - 96)
    return { left: (vw - width) / 2, top: Math.max(24, (vh - height) / 2 - 16), width, height }
  }

  function fullRect() {
    return { left: MARGIN, top: MARGIN, width: window.innerWidth - MARGIN * 2, height: window.innerHeight - MARGIN * 2 }
  }

  async function open(content) {
    const mine = ++token
    dock.hidden = true
    dock.replaceChildren()
    if (closeTimer) {
      // reopened while the close animation was still running
      clearTimeout(closeTimer)
      closeTimer = null
      win.classList.remove('opening')
    }

    if (win.hidden) {
      zoomed = false
      win.classList.remove('zoomed', 'minimizing')
      place(defaultRect())
      win.classList.add('opening')
      win.hidden = false
      requestAnimationFrame(() => win.classList.remove('opening'))
      onShow?.()
    } else if (win.classList.contains('minimizing')) {
      restore()
    }

    titleEl.textContent = content.title
    ui.setCaption(content.caption ?? '')
    captionEl.hidden = !content.caption

    if (current) {
      current.controller?.destroy()
      current = null
    }
    stage.replaceChildren()

    const controller = await content.mount(stage, ui)
    if (mine !== token) {
      controller.destroy()
      return
    }
    current = { content, controller }
    controller.resize()
  }

  function close() {
    if (win.hidden) return
    token++
    win.classList.add('opening')
    closeTimer = setTimeout(() => {
      closeTimer = null
      win.hidden = true
      win.classList.remove('opening')
      current?.controller.destroy()
      current = null
      stage.replaceChildren()
    }, 200)
    dock.hidden = true
    onHide?.()
    onClose?.()
  }

  function minimize() {
    if (!current) return
    const r = win.getBoundingClientRect()
    // fly toward where the dock will be: bottom centre, or top centre on phones where
    // the bottom is the terminal's command row
    const dockY = window.matchMedia('(max-width: 700px)').matches ? 34 : window.innerHeight - 30
    win.style.setProperty('--dock-dx', `${window.innerWidth / 2 - (r.left + r.width / 2)}px`)
    win.style.setProperty('--dock-dy', `${dockY - (r.top + r.height / 2)}px`)
    win.classList.add('minimizing')
    current.controller.pause()
    onHide?.()
    dock.replaceChildren(makeButton(current.content.title, restore))
    setTimeout(() => {
      if (win.classList.contains('minimizing')) dock.hidden = false
    }, 300)
  }

  function restore() {
    dock.hidden = true
    win.classList.remove('minimizing')
    current?.controller.resume()
    onShow?.()
  }

  function toggleZoom() {
    if (zoomed) {
      place(saved ?? defaultRect())
      win.classList.remove('zoomed')
    } else {
      const r = win.getBoundingClientRect()
      saved = { left: r.left, top: r.top, width: r.width, height: r.height }
      place(fullRect())
      win.classList.add('zoomed')
    }
    zoomed = !zoomed
  }

  win.querySelector('.close').addEventListener('click', close)
  win.querySelector('.min').addEventListener('click', minimize)
  win.querySelector('.zoom').addEventListener('click', toggleZoom)
  titlebar.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.lights')) toggleZoom()
  })

  // dragging by the title bar
  titlebar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.lights')) return
    const r = win.getBoundingClientRect()
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    titlebar.setPointerCapture(e.pointerId)
    win.classList.add('dragging')

    const move = (ev) => {
      // keep the title bar reachable so the window can always be dragged back
      const left = Math.min(window.innerWidth - 80, Math.max(80 - r.width, ev.clientX - dx))
      const top = Math.min(window.innerHeight - 40, Math.max(0, ev.clientY - dy))
      win.style.left = `${left}px`
      win.style.top = `${top}px`
      if (zoomed) {
        zoomed = false
        win.classList.remove('zoomed')
      }
    }
    const up = () => {
      win.classList.remove('dragging')
      titlebar.removeEventListener('pointermove', move)
      titlebar.removeEventListener('pointerup', up)
      titlebar.removeEventListener('pointercancel', up)
    }
    titlebar.addEventListener('pointermove', move)
    titlebar.addEventListener('pointerup', up)
    titlebar.addEventListener('pointercancel', up)
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !win.hidden && !win.classList.contains('minimizing')) close()
  })

  window.addEventListener('resize', () => {
    if (win.hidden) return
    if (zoomed || window.innerWidth < 700) place(fullRect())
  })

  new ResizeObserver(() => current?.controller.resize()).observe(stage)

  return { open, close }
}
