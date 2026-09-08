// Alerta sonora con Web Audio API (sin librerías).
// Los navegadores exigen un gesto del usuario antes de reproducir audio:
// el botón "Activar alertas de sonido" llama a unlockAudio().

let audioContext = null

export function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioContext
}

// Ejecutar dentro de un click del usuario (AudioContext.resume())
export async function unlockAudio() {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
  return ctx.state === 'running'
}

// Dos tonos ascendentes de aviso (se usa cuando el pedido pasa a "preparado")
export function playAlertSound() {
  const ctx = getAudioContext()
  if (ctx.state !== 'running') return // audio bloqueado: no interrumpir silenciosamente

  const t0 = ctx.currentTime
  const notes = [
    { freq: 880, start: 0 },
    { freq: 1174.66, start: 0.22 },
  ]

  for (const { freq, start } of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq

    gain.gain.setValueAtTime(0.0001, t0 + start)
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + start + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.3)

    osc.start(t0 + start)
    osc.stop(t0 + start + 0.35)
  }
}
