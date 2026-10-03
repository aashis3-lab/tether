// Alert sound synthesized with WebAudio so there's no audio asset to load
// (and nothing to fail offline). iOS web can't vibrate, so sound is the
// attention-getter. Must be started from a user gesture at least once per
// page load on iOS, callers should invoke unlockAudio() on an early tap.

let ctx: AudioContext | null = null

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export function unlockAudio() {
  const c = audio()
  if (c.state === 'suspended') void c.resume()
}

/** Repeating two-tone chirp. Returns a stop function. */
export function playAlertLoop(): () => void {
  const c = audio()
  let stopped = false

  const chirp = () => {
    if (stopped) return
    const t = c.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16)
      osc.connect(gain).connect(c.destination)
      osc.start(t + i * 0.18)
      osc.stop(t + i * 0.18 + 0.17)
    })
  }

  chirp()
  const id = window.setInterval(chirp, 1200)
  return () => {
    stopped = true
    window.clearInterval(id)
  }
}
