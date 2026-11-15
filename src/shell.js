import { PROJECTS, projectById } from './projects.js'
import { makeButton } from './ui.js'

// A small terminal that answers the way bash, cmd and PowerShell do.
// The site's own commands (about, projects, open...) work in every shell;
// the shell you're in only decides how the output looks.

const VERSION = '1.0.2611'
const LINKEDIN = 'https://www.linkedin.com/in/hammadmh/'
const GITHUB = 'https://github.com/hademirren'
const RESUMES = {
  software: { file: '/Hassan_Resume_SW.pdf', label: 'software' },
  computer: { file: '/Hassan_Resume_CE.pdf', label: 'computer' },
}
const RESUME_NAMES = {
  software: 'software',
  sw: 'software',
  swe: 'software',
  'software.pdf': 'software',
  computer: 'computer',
  comp: 'computer',
  compeng: 'computer',
  ce: 'computer',
  'computer.pdf': 'computer',
}

// words people might type instead of a command; matched anywhere in what they wrote
const PROJECT_WORDS = {
  solipsium: ['solipsium', 'solipsis', 'codemap', 'audio'],
  rover: ['rover', 'ros', 'ros2', 'robot', 'lidar'],
  uav: ['uav', 'drone', 'drones', 'romaeris'],
  rasterizer: ['rasterizer', 'rasteriser', 'renderer', 'raster'],
  uart: ['uart', 'driver', 'embedded', 'cortex'],
}
const TOPIC_WORDS = {
  about: ['about', 'who', 'bio', 'hammad', 'hassan'],
  projects: ['projects', 'project', 'work', 'portfolio'],
  resume: ['resume', 'resumes', 'cv'],
  contact: ['contact', 'email', 'reach', 'hire', 'connect'],
  help: ['help', 'commands', 'menu'],
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]
}

const LOADED = new Date()
const SCHOOL = 'The University of Western Ontario'

export function createShell({ output, input, label, form, chips, onOpenProject, onReboot, touch = false }) {
  const shells = ['bash'] // a stack, so exit drops back to the shell you came from
  let cwd = []
  const history = []
  let historyIndex = 0

  const shell = () => shells[shells.length - 1]
  const isWin = () => shell() !== 'bash'

  // ---------- files ----------

  const fs = dir({
    'about.txt': file(aboutText().join('\n').length, printAbout),
    'contact.txt': file(LINKEDIN.length + GITHUB.length + 24, printContact),
    projects: dir(
      Object.fromEntries(
        PROJECTS.map((p) => [
          p.id,
          dir({ 'README.md': file(p.blurb.length + p.tech.length + 1, () => (line(p.blurb), line(p.tech, 'dim'))) }, p.id),
        ]),
      ),
    ),
    resume: dir({
      'software.pdf': file(129566, () => printPdf('software'), 'software'),
      'computer.pdf': file(134685, () => printPdf('computer'), 'computer'),
    }),
  })

  function dir(children, project) {
    return { type: 'dir', children, project }
  }

  function file(size, read, resume) {
    return { type: 'file', size, read, resume }
  }

  function resolve(path = '') {
    let segs = [...cwd]
    let rest = path.trim().replace(/\\/g, '/')
    // accept the absolute forms of home from either side
    rest = rest.replace(/^(c:)?\/users\/guest/i, '~').replace(/^\/home\/guest/, '~')
    if (rest.startsWith('~')) {
      segs = []
      rest = rest.slice(1)
    } else if (rest.startsWith('/')) {
      segs = []
    }
    for (const part of rest.split('/')) {
      if (!part || part === '.') continue
      if (part === '..') segs.pop()
      else segs.push(part)
    }
    let node = fs
    const real = []
    for (const seg of segs) {
      if (node.type !== 'dir') return null
      const key = Object.keys(node.children).find((k) => k.toLowerCase() === seg.toLowerCase())
      if (!key) return null
      node = node.children[key]
      real.push(key)
    }
    return { node, segs: real }
  }

  const unixPath = (segs) => (segs.length ? `~/${segs.join('/')}` : '~')
  const fullUnix = (segs) => ['/home/guest', ...segs].join('/')
  const winPath = (segs) => ['C:\\Users\\guest', ...segs].join('\\')
  const shownPath = (segs) => (isWin() ? winPath(segs) : unixPath(segs))

  // ---------- output ----------

  function line(text = '', cls = '') {
    const el = document.createElement('div')
    el.className = `line ${cls}`.trim()
    // textContent, not innerHTML, so typed input can never inject HTML
    el.textContent = text
    output.append(el)
    return el
  }

  function parts(...pieces) {
    const el = document.createElement('div')
    el.className = 'line'
    for (const [text, cls] of pieces) {
      const span = document.createElement('span')
      if (cls) span.className = cls
      span.textContent = text
      el.append(span)
    }
    output.append(el)
    return el
  }

  // something you can click that runs a command, so nobody has to type
  function commandLink(text, command) {
    const button = makeButton(text, () => {
      run(command)
      if (!touch) input.focus()
    }, 'link')
    return button
  }

  function urlLink(href) {
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    return a
  }

  // two columns: something clickable, then a dim note on what it is
  function row(left, note) {
    const el = document.createElement('div')
    el.className = 'line row'
    const span = document.createElement('span')
    span.className = 'dim'
    if (typeof note === 'string') span.textContent = note
    else span.append(note)
    el.append(left, span)
    output.append(el)
    return el
  }

  function err(bashText, cmdText, pwshText) {
    if (shell() === 'bash') line(bashText)
    else if (shell() === 'cmd') line(cmdText)
    else line(pwshText, 'err-pwsh')
  }

  function promptPieces() {
    if (shell() === 'bash') {
      return [
        ['guest', 'user'],
        ['@', ''],
        ['hademirrenOS', 'host'],
        [`:${unixPath(cwd)}$`, ''],
      ]
    }
    return [[`${shell() === 'pwsh' ? 'PS ' : ''}${winPath(cwd)}>`, '']]
  }

  function renderPrompt() {
    label.replaceChildren(
      ...promptPieces().map(([text, cls]) => {
        const span = document.createElement('span')
        if (cls) span.className = cls
        span.textContent = text
        return span
      }),
    )
  }

  // ---------- the site's own commands ----------

  function aboutText() {
    return [
      'Hammad Hassan',
      `Bachelor of Engineering Science at ${SCHOOL}`,
      'Specialization in Software Engineering, with ECE and Physical AI coursework',
      '',
      'Robotics Systems Engineer Intern at Romaeris',
      'Previously Software Engineering Intern at KeyStone Financial, Elluströs',
    ]
  }

  function printAbout() {
    const [name, , focus, gap, now, before] = aboutText()
    line(name, 'name')
    parts(['Bachelor of Engineering Science at ', ''], [SCHOOL, 'western'])
    line(focus, 'degree-sub')
    line(gap)
    line(now)
    line(before)
  }

  function printContact() {
    for (const [name, href] of [
      ['linkedin', LINKEDIN],
      ['github', GITHUB],
    ]) {
      const label = document.createElement('span')
      label.textContent = name
      const r = row(label, urlLink(href))
      r.lastChild.className = ''
    }
  }

  function clickable() {
    const span = document.createElement('span')
    span.className = 'clk'
    span.textContent = 'Clickable ->'
    return span
  }

  function printProjects() {
    const list = document.createElement('div')
    list.className = 'line listed'
    PROJECTS.forEach((p, i) => {
      // the label sits once, beside the first name; the other rows keep the column
      const lead = i === 0 ? clickable() : document.createElement('span')
      if (i) lead.className = 'clk-pad'
      const note = document.createElement('span')
      note.className = 'dim'
      note.textContent = p.blurb
      list.append(lead, commandLink(p.id, `open ${p.id}`), note)
    })
    output.append(list)
  }

  function printResume() {
    const el = document.createElement('div')
    el.className = 'line files'
    el.append(clickable(), commandLink('software.pdf', 'open software'), commandLink('computer.pdf', 'open computer'))
    output.append(el)
  }

  function printPdf(which) {
    line('%PDF-1.5\n%\u00e2\u00e3\u00cf\u00d3\n1 0 obj << /Type /Catalog /Pages 2 0 R >> ...')
    line(`that's a PDF. try: open ${which}`, 'dim')
  }

  function openResume(which) {
    const r = RESUMES[which]
    line(`opening ${r.file.slice(1)}`, 'dim')
    window.open(r.file, '_blank', 'noopener')
  }

  function openTarget(arg) {
    const name = (arg ?? '').toLowerCase().replace(/[/\\]+$/, '')
    if (!name) {
      line('usage: open <project | software | computer>')
      return
    }
    if (projectById(name)) return onOpenProject(name)
    if (RESUME_NAMES[name]) return openResume(RESUME_NAMES[name])
    if (name === 'projects') return printProjects()
    if (name === 'resume') return printResume()
    if (name === 'linkedin') return window.open(LINKEDIN, '_blank', 'noopener')
    if (name === 'github') return window.open(GITHUB, '_blank', 'noopener')

    const found = resolve(arg)
    if (found?.node.project) return onOpenProject(found.node.project)
    if (found?.node.resume) return openResume(found.node.resume)
    if (found?.node.type === 'file') return found.node.read()
    if (found?.node.type === 'dir') return list(arg)

    err(
      `The file ${fullUnix([...cwd, arg])} does not exist.`,
      `The system cannot find the file ${arg}.`,
      `Start-Process: This command cannot be run due to the error: The system cannot find the file specified.`,
    )
  }

  // ---------- shell builtins ----------

  const HELP = [
    ['about', 'who I am'],
    ['projects', "what I've built"],
    ['resume', 'software or computer'],
    ['contact', 'linkedin, github'],
  ]

  function help() {
    for (const [name, desc] of HELP) row(commandLink(name, name), desc)
    line('open <name>, ls, cd, cat, clear, cmd and powershell work too', 'dim')
  }

  const stamp = {
    win: LOADED.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    time: LOADED.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    unix: `${LOADED.toLocaleDateString('en-US', { month: 'short' })} ${String(LOADED.getDate()).padStart(2)} ${LOADED.toTimeString().slice(0, 5)}`,
  }

  function entries(node) {
    return Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b))
  }

  function list(arg = '') {
    const flags = arg.split(/\s+/).filter((a) => a.startsWith('-'))
    const target = arg.split(/\s+/).filter((a) => a && !a.startsWith('-')).join(' ')
    const found = resolve(target)

    if (!found) {
      err(
        `ls: cannot access '${target}': No such file or directory`,
        'File Not Found',
        `Get-ChildItem: Cannot find path '${winPath([...cwd, target])}' because it does not exist.`,
      )
      return
    }

    const { node, segs } = found
    if (node.type === 'file') {
      line(segs[segs.length - 1])
      return
    }

    if (shell() === 'cmd') return dirCmd(node, segs)
    if (shell() === 'pwsh') return dirPwsh(node, segs)

    const long = flags.some((f) => f.includes('l'))
    const all = flags.some((f) => f.includes('a'))
    const items = entries(node)
    if (long) {
      const row = (perm, links, size) => `${perm} ${links} guest guest ${String(size).padStart(4)} ${stamp.unix} `
      line(`total ${items.length * 4}`)
      if (all) {
        parts([row('drwxr-xr-x', items.length + 2, 4096), ''], ['.', 'dir'])
        parts([row('drwxr-xr-x', 3, 4096), ''], ['..', 'dir'])
      }
      for (const [name, child] of items) {
        const isDir = child.type === 'dir'
        const head = isDir
          ? row('drwxr-xr-x', Object.keys(child.children).length + 2, 4096)
          : row('-rw-r--r--', 1, child.size)
        parts([head, ''], [name, isDir ? 'dir' : ''])
      }
      return
    }
    const names = [...(all ? [['.', { type: 'dir' }], ['..', { type: 'dir' }]] : []), ...items]
    const el = document.createElement('div')
    el.className = 'line'
    names.forEach(([name, child], i) => {
      const span = document.createElement('span')
      if (child.type === 'dir') span.className = 'dir'
      span.textContent = name
      el.append(span, i < names.length - 1 ? '  ' : '')
    })
    output.append(el)
  }

  function dirCmd(node, segs) {
    const items = entries(node)
    const files = items.filter(([, c]) => c.type === 'file')
    const bytes = files.reduce((s, [, c]) => s + c.size, 0)
    line(' Volume in drive C has no label.')
    line(' Volume Serial Number is 2611-0F0C')
    line()
    line(` Directory of ${winPath(segs)}`)
    line()
    const row = (name, child) =>
      `${stamp.win}  ${stamp.time}    ${child ? (child.type === 'dir' ? '<DIR>          ' : String(child.size.toLocaleString('en-US')).padStart(14) + ' ') : '<DIR>          '}${name}`
    line(row('.', null))
    line(row('..', null))
    for (const [name, child] of items) line(row(name, child))
    line(`${String(files.length).padStart(16)} File(s) ${bytes.toLocaleString('en-US').padStart(14)} bytes`)
    line(`${String(items.length - files.length + 2).padStart(16)} Dir(s)  48,213,409,792 bytes free`)
  }

  function dirPwsh(node, segs) {
    line(`\n    Directory: ${winPath(segs)}\n`)
    line('Mode                 LastWriteTime         Length Name')
    line('----                 -------------         ------ ----')
    for (const [name, child] of entries(node)) {
      const isDir = child.type === 'dir'
      const head = `${isDir ? 'd----' : '-a---'}          ${stamp.win} ${stamp.time.padStart(8)}${isDir ? ''.padStart(15) : String(child.size).padStart(15)} `
      parts([head, ''], [name, isDir ? 'dir' : ''])
    }
    line()
  }

  function changeDir(arg) {
    if (!arg) {
      if (shell() === 'cmd') line(winPath(cwd))
      else cwd = []
      return
    }
    const found = resolve(arg)
    if (!found || found.node.type !== 'dir') {
      if (found && shell() === 'bash') line(`bash: cd: ${arg}: Not a directory`)
      else
        err(
          `bash: cd: ${arg}: No such file or directory`,
          found ? 'The directory name is invalid.' : 'The system cannot find the path specified.',
          `Set-Location: Cannot find path '${winPath([...cwd, arg])}' because it does not exist.`,
        )
      return
    }
    cwd = found.segs
  }

  function printWorkingDir() {
    if (shell() === 'pwsh') {
      line('\nPath\n----')
      line(`${winPath(cwd)}\n`)
    } else line(isWin() ? winPath(cwd) : fullUnix(cwd))
  }

  function read(arg) {
    if (!arg) return
    const found = resolve(arg)
    if (!found) {
      err(
        `cat: ${arg}: No such file or directory`,
        'The system cannot find the file specified.',
        `Get-Content: Cannot find path '${winPath([...cwd, arg])}' because it does not exist.`,
      )
      return
    }
    if (found.node.type === 'dir') {
      err(
        `cat: ${arg}: Is a directory`,
        'Access is denied.',
        `Get-Content: Unable to get content because it is a directory: '${winPath(found.segs)}'. Please use 'Get-ChildItem' instead.`,
      )
      return
    }
    found.node.read()
  }

  function date() {
    if (shell() === 'cmd') {
      line(`The current date is: ${LOADED.toLocaleDateString('en-US', { weekday: 'short' })} ${stamp.win}`)
    } else if (shell() === 'pwsh') {
      line(`\n${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' }).replace(' at ', ' ')}\n`)
    } else {
      const now = new Date()
      const zone = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()
      line(`${now.toDateString().slice(0, 10)} ${now.toTimeString().slice(0, 8)} ${zone} ${now.getFullYear()}`)
    }
  }

  function enter(next) {
    shells.push(next)
    if (next === 'cmd') line(`hademirrenOS [Version ${VERSION}]\n(c) Hammad Hassan. All rights reserved.\n`)
    if (next === 'pwsh') line('PowerShell 7.5.4\n')
  }

  function exit() {
    if (shells.length > 1) {
      shells.pop()
      return
    }
    line('logout')
    input.disabled = true
    setTimeout(onReboot, 700)
  }

  // every name maps to one handler; windows and unix spellings share them
  const COMMANDS = {
    help: help,
    '?': help,
    about: printAbout,
    projects: printProjects,
    resume: (arg) => (RESUME_NAMES[arg] ? openResume(RESUME_NAMES[arg]) : printResume()),
    contact: printContact,
    open: openTarget,
    start: openTarget,
    'xdg-open': openTarget,
    'start-process': openTarget,
    'invoke-item': openTarget,
    ii: openTarget,
    ls: list,
    dir: list,
    gci: list,
    'get-childitem': list,
    cd: changeDir,
    chdir: changeDir,
    'set-location': changeDir,
    sl: changeDir,
    pwd: printWorkingDir,
    'get-location': printWorkingDir,
    cat: read,
    type: read,
    gc: read,
    'get-content': read,
    clear: () => output.replaceChildren(),
    cls: () => output.replaceChildren(),
    'clear-host': () => output.replaceChildren(),
    whoami: () => line(isWin() ? 'hademirrenos\\guest' : 'guest'),
    echo: (arg = '') => line(arg.replace(/^["']|["']$/g, '')),
    'write-output': (arg = '') => line(arg.replace(/^["']|["']$/g, '')),
    date: date,
    'get-date': date,
    history: () => history.forEach((h, i) => line(`${String(i + 1).padStart(5)}  ${h}`)),
    ver: () => line(`\nhademirrenOS [Version ${VERSION}]\n`),
    uname: (arg) => line(arg?.includes('a') ? `hademirrenOS hademirren ${VERSION} #1 SMP x86_64 GNU/Linux` : 'hademirrenOS'),
    sudo: () => line('guest is not in the sudoers file.  This incident will be reported.'),
    man: (arg) => line(arg ? `No manual entry for ${arg}` : 'What manual page do you want?'),
    rm: (arg = '') =>
      arg.includes('/') && arg.includes('-')
        ? line("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe")
        : line(`rm: cannot remove '${arg}': Permission denied`),
    bash: () => enter('bash'),
    wsl: () => enter('bash'),
    cmd: () => enter('cmd'),
    'cmd.exe': () => enter('cmd'),
    powershell: () => enter('pwsh'),
    'powershell.exe': () => enter('pwsh'),
    pwsh: () => enter('pwsh'),
    exit: exit,
    logout: exit,
    reboot: () => {
      input.disabled = true
      setTimeout(onReboot, 300)
    },
  }

  // not everyone knows terminals: a project name on its own opens it, and so does
  // something like "show me the drone" or "your resume please"
  function understand(text) {
    const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    for (const [id, list] of Object.entries(PROJECT_WORDS)) {
      if (words.some((w) => list.includes(w))) {
        onOpenProject(id)
        return true
      }
    }
    for (const w of words) {
      if (RESUME_NAMES[w]) {
        openResume(RESUME_NAMES[w])
        return true
      }
      if (w === 'linkedin' || w === 'github') {
        window.open(w === 'linkedin' ? LINKEDIN : GITHUB, '_blank', 'noopener')
        return true
      }
    }
    for (const [cmd, list] of Object.entries(TOPIC_WORDS)) {
      if (words.some((w) => list.includes(w))) {
        COMMANDS[cmd]()
        return true
      }
    }
    return false
  }

  // after the shell's own error, a nudge in plain words
  function suggest(name) {
    const word = name.toLowerCase()
    const known = [...PROJECTS.map((p) => p.id), 'about', 'projects', 'resume', 'contact', 'help', 'software', 'computer']
    const close = known
      .map((k) => [k, distance(word, k)])
      .filter(([k, d]) => d <= (k.length > 5 ? 2 : 1))
      .sort((a, b) => a[1] - b[1])[0]
    const el = document.createElement('div')
    el.className = 'line dim'
    if (close) el.append('did you mean ', commandLink(close[0], close[0]), '?')
    else {
      el.append('try ')
      ;['about', 'projects', 'resume', 'contact'].forEach((c, i, all) => {
        el.append(commandLink(c, c), i < all.length - 2 ? ', ' : i === all.length - 2 ? ' or ' : '')
      })
    }
    output.append(el)
  }

  function notFound(name) {
    err(
      `bash: ${name}: command not found`,
      `'${name}' is not recognized as an internal or external command,\noperable program or batch file.`,
      `${name}: The term '${name}' is not recognized as a name of a cmdlet, function, script file, or executable program.\nCheck the spelling of the name, or if a path was included, verify that the path is correct and try again.`,
    )
  }

  function echoCommand(text) {
    const el = document.createElement('div')
    el.className = 'line'
    for (const [t, cls] of promptPieces()) {
      const span = document.createElement('span')
      if (cls) span.className = cls
      span.textContent = t
      el.append(span)
    }
    el.append(` ${text}`)
    output.append(el)
  }

  function run(raw) {
    const text = raw.trim()
    echoCommand(text)
    if (text) {
      history.push(text)
      historyIndex = history.length
      const [name, ...rest] = text.split(/\s+/)
      const arg = rest.join(' ') || undefined
      const handler = COMMANDS[name.toLowerCase()]
      if (handler) handler(arg)
      else if (/\.(pdf|txt|md)$/i.test(name) && resolve(name)) openTarget(name)
      else if (!understand(text)) {
        notFound(name)
        suggest(name)
      }
    }
    renderPrompt()
    output.scrollTop = output.scrollHeight
  }

  // ---------- keyboard ----------

  function complete() {
    const value = input.value
    const words = value.split(/\s+/)
    if (words.length <= 1) {
      const names = [...Object.keys(COMMANDS), ...PROJECTS.map((p) => p.id)]
      return finish(value, names.filter((n) => /^[a-z]/.test(n)), '')
    }
    const [cmd, ...rest] = words
    const partial = rest.join(' ')
    const slash = Math.max(partial.lastIndexOf('/'), partial.lastIndexOf('\\'))
    const base = slash >= 0 ? partial.slice(0, slash + 1) : ''
    const folder = resolve(base || '.')
    let options = folder?.node.type === 'dir' ? entries(folder.node).map(([n, c]) => n + (c.type === 'dir' ? '/' : '')) : []
    if (!base && ['open', 'start', 'resume'].includes(cmd.toLowerCase())) {
      options = [...PROJECTS.map((p) => p.id), 'software', 'computer', ...options]
    }
    finish(partial.slice(base.length), options, `${cmd} ${base}`)
  }

  function finish(typed, options, prefix) {
    const matches = [...new Set(options)].filter((o) => o.toLowerCase().startsWith(typed.toLowerCase()))
    if (matches.length === 1) input.value = prefix + matches[0]
    else if (matches.length > 1) {
      echoCommand(input.value)
      line(matches.join('  '))
      output.scrollTop = output.scrollHeight
      // fill in what all matches share, like a real shell does
      let common = matches[0]
      for (const m of matches) while (!m.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1)
      if (common.length > typed.length) input.value = prefix + common
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && historyIndex > 0) {
      e.preventDefault()
      input.value = history[--historyIndex]
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      historyIndex = Math.min(historyIndex + 1, history.length)
      input.value = history[historyIndex] ?? ''
    } else if (e.key === 'Tab') {
      e.preventDefault() // otherwise Tab moves focus off the input
      complete()
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      output.replaceChildren()
    } else if (e.key === 'c' && e.ctrlKey && !window.getSelection().toString()) {
      e.preventDefault()
      echoCommand(`${input.value}^C`)
      input.value = ''
    }
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault() // forms reload the page by default
    run(input.value)
    input.value = ''
  })

  // ---------- start ----------

  // progress over time, with the stalls a real loading bar has
  const SCHEDULE = [
    [0, 0],
    [0.45, 0.38],
    [0.7, 0.38],
    [1.15, 0.8],
    [1.3, 0.8],
    [1.6, 1],
  ]
  const BAR = 22

  function progressAt(t) {
    for (let i = 1; i < SCHEDULE.length; i++) {
      const [t1, p1] = SCHEDULE[i]
      const [t0, p0] = SCHEDULE[i - 1]
      if (t <= t1) {
        const x = (t - t0) / (t1 - t0)
        return p0 + (p1 - p0) * x * x * (3 - 2 * x)
      }
    }
    return 1
  }

  let skip = null

  function initialize() {
    const el = parts(['initializing ', ''], ['', 'bar-done'], ['', 'bar-left'], ['', 'dim'])
    const [, done, left, pct] = el.children
    return new Promise((resolve) => {
      let start = null
      let skipped = false
      skip = () => (skipped = true)
      function frame(now) {
        start ??= now
        const p = skipped ? 1 : progressAt((now - start) / 1000)
        const k = Math.round(p * BAR)
        done.textContent = '━'.repeat(k)
        left.textContent = '━'.repeat(BAR - k)
        pct.textContent = ` ${String(Math.round(p * 100)).padStart(3)}%`
        if (p < 1) requestAnimationFrame(frame)
        else {
          skip = null
          resolve()
        }
      }
      requestAnimationFrame(frame)
    })
  }

  // any key or tap finishes the bar right away
  window.addEventListener('keydown', () => skip?.())
  window.addEventListener('pointerdown', () => skip?.())

  async function start() {
    shells.length = 1
    cwd = []
    output.replaceChildren()
    form.hidden = true
    chips.hidden = true
    input.disabled = false
    input.value = ''

    await initialize()
    line(`welcome to hademirrenOS. ${touch ? 'tap below' : 'type help'} to start.`)
    renderPrompt()
    form.hidden = false

    if (!chips.childElementCount) {
      const label = document.createElement('span')
      label.className = 'chips-label'
      label.textContent = 'Clickable ->'
      chips.append(label)
      for (const name of ['about', 'projects', 'resume', 'contact']) {
        chips.append(
          makeButton(name, () => {
            run(name)
            if (!touch) input.focus()
          }),
        )
      }
    }
    chips.hidden = false
    output.scrollTop = output.scrollHeight
    if (!touch) input.focus()
  }

  return { start, run }
}
