// plain text button, styled like the rest of the terminal
export function makeButton(label, onClick, className = 'chip') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}
