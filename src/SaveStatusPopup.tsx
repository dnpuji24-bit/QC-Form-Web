import { useEffect, useRef, useState } from 'react'

type PopupKind = 'success' | 'queued' | 'error'
type PopupState = { kind: PopupKind; form: 'Spraying' | 'Fertilizer'; message: string }

const SAVE_BUTTON = /(simpan|draft|siapkan\s*upload|siap\s*upload|perbarui)/i
const SPRAY_HEADING = /spray|spraying/i
const FERT_HEADING = /fertiliz|fertiliser|pupuk/i

function getTargetSection(): { section: HTMLElement; form: 'Spraying' | 'Fertilizer' } | null {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('main.content section'))
  for (const section of sections) {
    const heading = section.querySelector('h2')?.textContent || ''
    if (SPRAY_HEADING.test(heading)) return { section, form: 'Spraying' }
    if (FERT_HEADING.test(heading)) return { section, form: 'Fertilizer' }
  }
  return null
}

function directAlertText(section: HTMLElement): string {
  const alert = Array.from(section.children).find(
    child => child instanceof HTMLElement && child.classList.contains('alert'),
  ) as HTMLElement | undefined
  return alert?.textContent?.trim() || ''
}

function classify(message: string): PopupKind | null {
  if (!message) return null
  if (/menunggu\s+(jaringan|sinkronisasi)|masuk\s+antrean|antrean|offline|aman\s+di\s+perangkat/i.test(message)) return 'queued'
  if (/gagal|wajib|lengkapi|tidak\s+valid|harus|minimal|salah|ditolak|error|tidak\s+dapat/i.test(message)) return 'error'
  if (/tersimpan|berhasil|siap\s+untuk\s+upload|berhasil\s+disinkronkan|diproses/i.test(message)) return 'success'
  return null
}

export default function SaveStatusPopup() {
  const [popup, setPopup] = useState<PopupState | null>(null)
  const armed = useRef(false)
  const baseline = useRef('')
  const sawClear = useRef(false)
  const formRef = useRef<'Spraying' | 'Fertilizer'>('Spraying')
  const errorRepeatTimer = useRef<number | null>(null)

  useEffect(() => {
    const capture = () => {
      if (!armed.current) return
      const target = getTargetSection()
      if (!target) return
      const message = directAlertText(target.section)
      if (!message) {
        sawClear.current = true
        return
      }
      if (message === baseline.current && !sawClear.current) return
      const kind = classify(message)
      if (!kind) return
      armed.current = false
      if (errorRepeatTimer.current) window.clearTimeout(errorRepeatTimer.current)
      setPopup({ kind, form: formRef.current, message })
    }

    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null
      const button = element?.closest('button') as HTMLButtonElement | null
      if (!button || button.disabled) return
      const section = button.closest('section') as HTMLElement | null
      if (!section) return
      const heading = section.querySelector('h2')?.textContent || ''
      const form = SPRAY_HEADING.test(heading) ? 'Spraying' : FERT_HEADING.test(heading) ? 'Fertilizer' : null
      if (!form) return
      const buttonText = `${button.textContent || ''} ${button.value || ''}`.trim()
      if (!SAVE_BUTTON.test(buttonText)) return

      armed.current = true
      formRef.current = form
      baseline.current = directAlertText(section)
      sawClear.current = false
      setPopup(null)

      if (errorRepeatTimer.current) window.clearTimeout(errorRepeatTimer.current)
      errorRepeatTimer.current = window.setTimeout(() => {
        if (!armed.current || sawClear.current) return
        const target = getTargetSection()
        if (!target) return
        const message = directAlertText(target.section)
        if (!message || message !== baseline.current || classify(message) !== 'error') return
        armed.current = false
        setPopup({ kind: 'error', form, message })
      }, 350)

      window.setTimeout(capture, 0)
      window.setTimeout(capture, 120)
      window.setTimeout(capture, 500)
      window.setTimeout(capture, 1200)
      window.setTimeout(capture, 3000)
      window.setTimeout(capture, 6000)
    }

    const observer = new MutationObserver(capture)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    document.addEventListener('click', onClick, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
      if (errorRepeatTimer.current) window.clearTimeout(errorRepeatTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!popup) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopup(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popup])

  if (!popup) return null

  const title = popup.kind === 'success'
    ? 'Data Berhasil Tersimpan'
    : popup.kind === 'queued'
      ? 'Data Aman, Menunggu Sinkronisasi'
      : 'Data Gagal Tersimpan'
  const icon = popup.kind === 'success' ? '✓' : popup.kind === 'queued' ? '↻' : '!'

  return (
    <div className="save-popup-backdrop" role="presentation">
      <section className={`save-popup save-popup-${popup.kind}`} role="dialog" aria-modal="true" aria-labelledby="save-popup-title">
        <div className="save-popup-icon" aria-hidden="true">{icon}</div>
        <div className="save-popup-form">FORM {popup.form.toUpperCase()}</div>
        <h2 id="save-popup-title">{title}</h2>
        <p>{popup.message}</p>
        <button className="primary save-popup-ok" type="button" autoFocus onClick={() => setPopup(null)}>OK, Mengerti</button>
      </section>
    </div>
  )
}
