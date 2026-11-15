import './style.css'
import { createRose } from './rose.js'
import { createShell } from './shell.js'
import { createWindow } from './window.js'
import { projectById } from './projects.js'

const input = document.querySelector('#cmd')
// phones: no keyboard popping up on its own, tap targets do the work
const touch = window.matchMedia('(hover: none)').matches

const art = createRose(document.querySelector('#art'))
art.start()
new ResizeObserver(() => art.resize()).observe(document.querySelector('#hero'))

// the rose rests while a project window covers it, so the 3D view gets the frames
const win = createWindow({
  onShow: () => art.stop(),
  onHide: () => art.start(),
  onClose: () => !touch && input.focus(),
})

function openProject(id) {
  const project = projectById(id)
  win.open({
    title: project.title,
    caption: project.tech,
    mount: async (stage, ui) => {
      const { mount3d } = await import('./viewer3d.js')
      return mount3d(stage, id, ui)
    },
  })
}

const shell = createShell({
  output: document.querySelector('#output'),
  input,
  label: document.querySelector('#prompt-label'),
  form: document.querySelector('#prompt'),
  chips: document.querySelector('#chips'),
  onOpenProject: openProject,
  onReboot: () => {
    win.close()
    shell.start()
  },
  touch,
})

// clicking the terminal puts the cursor back, unless text is being selected
if (!touch) {
  document.querySelector('#term').addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return
    if (!window.getSelection().toString()) input.focus()
  })
}

shell.start()
