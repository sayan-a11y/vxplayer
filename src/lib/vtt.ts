// Subtitle utilities: demo cue generation + minimal SRT/VTT parsing

export type SubCue = {
  start: number // seconds
  end: number
  text: string
}

/** Generate a demo subtitle track for a video (used when no external subtitle file exists). */
export function generateDemoCues(durationSec: number, title: string): SubCue[] {
  const lines = [
    `[VX Player] Now playing: ${title}`,
    'Did you know? VX plays everything — offline.',
    'Swipe left or right on the video to seek.',
    'Swipe the left edge to change brightness.',
    'Swipe the right edge to change volume.',
    'Double-tap left or right to skip 10 seconds.',
    'Tap the lock icon to prevent accidental touches.',
    'Change playback speed from the speed menu.',
    'Subtitles, audio tracks and zoom — all built in.',
    'VX Player — Play Everything. Anywhere. Offline.',
  ]
  const cues: SubCue[] = []
  const step = Math.min(14, Math.max(8, Math.floor(durationSec / (lines.length + 4))))
  let t = 2
  let i = 0
  while (t < Math.min(durationSec, 600) && i < lines.length) {
    cues.push({ start: t, end: t + 4.5, text: lines[i] })
    t += step
    i += 1
  }
  return cues
}

function parseTimestamp(raw: string): number {
  const m = raw.trim().replace(',', '.').match(/(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)/)
  if (!m) return 0
  const h = Number(m[1] ?? 0)
  const min = Number(m[2] ?? 0)
  const s = Number(m[3] ?? 0)
  return h * 3600 + min * 60 + s
}

/** Parse SRT or WebVTT subtitle text into cues. */
export function parseSubtitles(raw: string): SubCue[] {
  const clean = raw.replace(/\r/g, '')
  const blocks = clean.split(/\n\n+/)
  const cues: SubCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    if (lines.length === 0) continue
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'))
    if (timeLineIdx === -1) continue
    const [startRaw, endRaw] = lines[timeLineIdx].split('-->')
    const text = lines
      .slice(timeLineIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!text) continue
    cues.push({
      start: parseTimestamp(startRaw),
      end: parseTimestamp(endRaw ?? ''),
      text,
    })
  }
  return cues
}

export function cueAt(cues: SubCue[], time: number, delaySec: number): SubCue | null {
  const t = time + delaySec
  return cues.find((c) => t >= c.start && t <= c.end) ?? null
}
