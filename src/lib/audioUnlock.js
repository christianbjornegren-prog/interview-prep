// ── Ljud som överlever Safaris och iPhones autoplay-spärr ─────────────────
//
// WebKit – ALLA webbläsare på iPhone/iPad samt Safari på Mac – nekar
// audio.play() som inte startas av ett tryck:
//   NotAllowedError: "The request is not allowed by the user agent or the
//   platform in the current context, possibly because the user denied permission."
// Intervjun startar automatiskt och hämtar rösten över nätet först. När ljudet
// väl ska spelas finns inget tryck kvar att luta sig mot, och uppspelningen
// nekas. Det var det vanligaste felet i Driftöversikten.
//
// Spärren sitter PER LJUDELEMENT och släpper för gott när elementet en gång
// har startats av ett tryck. Därför: ETT delat <audio>-element för hela appen.
// Det låses upp i klicket på startknappen (unlockAudio) och återanvänds sedan
// för varje replik – även de som kommer långt efter senaste trycket.

let sharedAudio = null
let silentUrl = null
let unlocked = false

/** En tiondels sekund tystnad som WAV (8 kHz, 8 bitar, mono). Ren – testbar. */
export function buildSilentWav(samples = 800) {
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)   // fmt-blockets längd
  view.setUint16(20, 1, true)    // PCM
  view.setUint16(22, 1, true)    // mono
  view.setUint32(24, 8000, true) // samplingsfrekvens
  view.setUint32(28, 8000, true) // byte per sekund
  view.setUint16(32, 1, true)    // blockstorlek
  view.setUint16(34, 8, true)    // bitar per sampel
  ascii(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44)            // 128 = tystnad i 8-bitars PCM
  return bytes
}

/** Appens enda ljudelement. Skapas först när det behövs. */
export function getSharedAudio() {
  if (!sharedAudio) sharedAudio = new Audio()
  return sharedAudio
}

export function isAudioUnlocked() {
  return unlocked
}

/** Anropas när en uppspelning som startats av ett tryck faktiskt kom igång. */
export function markAudioUnlocked() {
  unlocked = true
}

/**
 * Låser upp ljudelementet. MÅSTE anropas SYNKRONT i en klickhanterare – före
 * första `await` – annars räknas det inte som användarens tryck.
 * Kastar aldrig och gör ingenting om ljud redan spelas.
 */
export function unlockAudio() {
  if (unlocked) return
  try {
    const audio = getSharedAudio()
    if (!audio.paused) return
    if (!silentUrl) {
      silentUrl = URL.createObjectURL(new Blob([buildSilentWav()], { type: 'audio/wav' }))
    }
    audio.src = silentUrl
    const started = audio.play()
    if (started?.then) {
      started
        .then(() => {
          unlocked = true
          // Pausa bara om tystnaden fortfarande är det som spelas – en riktig
          // replik kan i teorin ha hunnit ta över elementet.
          if (audio.src === silentUrl) audio.pause()
        })
        .catch(() => { /* nekad även här – intervjun visar då en tryck-knapp */ })
    }
  } catch { /* får aldrig stoppa klicket */ }
}
