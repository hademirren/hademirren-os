// A PDF shown inside the window instead of a new tab, which pop-up blockers and phones
// kept stopping. Pages are drawn with pdf.js; links in the PDF stay clickable.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export async function mountPdf(stage, url) {
  const scroller = document.createElement('div')
  scroller.className = 'pdf'
  stage.append(scroller)

  const loading = getDocument({ url })
  const doc = await loading.promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const sheet = document.createElement('div')
    sheet.className = 'pdf-page'
    const canvas = document.createElement('canvas')
    sheet.append(canvas)
    scroller.append(sheet)
    const links = (await page.getAnnotations()).filter((a) => a.subtype === 'Link' && a.url)
    pages.push({ page, sheet, canvas, links, task: null })
  }

  let drawnWidth = 0
  let timer = 0

  function draw() {
    const width = Math.min(scroller.clientWidth - 24, 900)
    if (width <= 0 || Math.abs(width - drawnWidth) < 2) return
    drawnWidth = width
    // small screens get extra detail so pinch zooming the page stays sharp
    const dpr = Math.min((window.devicePixelRatio || 1) * (width < 600 ? 2 : 1), 4)
    for (const p of pages) {
      p.task?.cancel()
      const base = p.page.getViewport({ scale: 1 })
      const viewport = p.page.getViewport({ scale: width / base.width })
      p.canvas.width = Math.floor(viewport.width * dpr)
      p.canvas.height = Math.floor(viewport.height * dpr)
      p.sheet.style.width = `${viewport.width}px`
      p.sheet.style.height = `${viewport.height}px`
      p.task = p.page.render({
        canvas: p.canvas,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      })
      p.task.promise.catch(() => {}) // cancelled by a newer draw
      // the PDF's own links, laid over the picture of the page
      p.sheet.querySelectorAll('a').forEach((a) => a.remove())
      for (const link of p.links) {
        const [x1, y1] = viewport.convertToViewportPoint(link.rect[0], link.rect[1])
        const [x2, y2] = viewport.convertToViewportPoint(link.rect[2], link.rect[3])
        const a = document.createElement('a')
        a.href = link.url
        a.target = '_blank'
        a.rel = 'noopener'
        Object.assign(a.style, {
          left: `${Math.min(x1, x2)}px`,
          top: `${Math.min(y1, y2)}px`,
          width: `${Math.abs(x2 - x1)}px`,
          height: `${Math.abs(y2 - y1)}px`,
        })
        p.sheet.append(a)
      }
    }
  }

  return {
    // resizing fires a lot while a window is dragged or zoomed; draw once it settles
    resize() {
      clearTimeout(timer)
      timer = setTimeout(draw, drawnWidth ? 120 : 0)
    },
    pause() {},
    resume() {},
    destroy() {
      clearTimeout(timer)
      pages.forEach((p) => p.task?.cancel())
      loading.destroy()
    },
  }
}
