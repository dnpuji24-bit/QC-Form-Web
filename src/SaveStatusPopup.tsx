import { useEffect, useRef, useState } from 'react'

type PopupKind = 'success' | 'queued' | 'error'
type PopupAction = 'draft' | 'save' | 'upload'
type FormName = 'Spraying' | 'Fertilizer'
type PopupState = { kind: PopupKind; action: PopupAction; form: FormName; message: string; edited?: boolean }

const SAVE_BUTTON = /(simpan|draft|siapkan\s*upload|siap\s*upload|perbarui)/i
const UPLOAD_BUTTON = /^upload(?:\s|$)/i
const SPRAY_HEADING = /spray|spraying/i
const FERT_HEADING = /fertiliz|fertiliser|pupuk/i
const EDIT_HEADING = /edit|koreksi/i

function formFromText(text: string): FormName | null {
  if (SPRAY_HEADING.test(text)) return 'Spraying'
  if (FERT_HEADING.test(text)) return 'Fertilizer'
  return null
}

function getTargetSection(): { section: HTMLElement; form: FormName } | null {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('main.content section'))
  for (const section of sections) {
    const heading = section.querySelector('h2')?.textContent || ''
    const form = formFromText(heading)
    if (form) return { section, form }
  }
  return null
}

function directAlertText(section: HTMLElement): string {
  const alert = Array.from(section.children).find(
    child => child instanceof HTMLElement && child.classList.contains('alert'),
  ) as HTMLElement | undefined
  return alert?.textContent?.trim() || ''
}

function globalAlertText(): string {
  const main = document.querySelector<HTMLElement>('main.content')
  if (!main) return ''
  const alert = Array.from(main.children).find(
    child => child instanceof HTMLElement && child.classList.contains('alert'),
  ) as HTMLElement | undefined
  return alert?.textContent?.trim() || ''
}

function classify(message: string): PopupKind | null {
  if (!message) return null
  if (/gagal|wajib|lengkapi|tidak\s+valid|harus|minimal|salah|ditolak|error|tidak\s+dapat/i.test(message)) return 'error'
  if (/menunggu\s+(jaringan|sinkronisasi)|masuk\s+antrean|antrean|offline|aman\s+di\s+perangkat/i.test(message)) return 'queued'
  if (/tersimpan|berhasil|siap\s+untuk\s+upload|berhasil\s+disinkronkan|diproses|di-upload/i.test(message)) return 'success'
  return null
}

function popupTitle(action: PopupAction, kind: PopupKind, edited = false): string {
  if (edited) {
    if (action === 'draft') {
      if (kind === 'success') return 'Perubahan Draft Berhasil Disimpan'
      if (kind === 'queued') return 'Perubahan Draft Aman, Menunggu Sinkronisasi'
      return 'Perubahan Draft Gagal Disimpan'
    }
    if (action === 'save') {
      if (kind === 'success') return 'Hasil Edit Berhasil Disimpan'
      if (kind === 'queued') return 'Hasil Edit Aman, Menunggu Sinkronisasi'
      return 'Hasil Edit Gagal Disimpan'
    }
  }
  if (action === 'draft') {
    if (kind === 'success') return 'Draft Berhasil Disimpan'
    if (kind === 'queued') return 'Draft Aman, Menunggu Sinkronisasi'
    return 'Draft Gagal Disimpan'
  }
  if (action === 'upload') {
    if (kind === 'success') return 'Upload Berhasil'
    if (kind === 'queued') return 'Upload Masuk Antrean'
    return 'Upload Gagal'
  }
  if (kind === 'success') return 'Data Berhasil Tersimpan'
  if (kind === 'queued') return 'Data Aman, Menunggu Sinkronisasi'
  return 'Data Gagal Tersimpan'
}

function popupLabel(action: PopupAction, form: FormName, edited = false): string {
  if (edited && action === 'draft') return `FORM ${form.toUpperCase()} • EDIT • SIMPAN DRAFT`
  if (edited && action === 'save') return `FORM ${form.toUpperCase()} • SIMPAN HASIL EDIT`
  if (action === 'draft') return `FORM ${form.toUpperCase()} • SIMPAN DRAFT`
  if (action === 'upload') return `DATA QC • UPLOAD ${form.toUpperCase()}`
  return `FORM ${form.toUpperCase()} • SIMPAN DATA QC`
}

function inferredEditMessage(action: PopupAction, form: FormName, queued: boolean): string {
  if (action === 'draft') {
    return queued
      ? `Perubahan Draft ${form} aman di perangkat dan menunggu sinkronisasi.`
      : `Perubahan Draft ${form} berhasil disimpan.`
  }
  return queued
    ? `Hasil edit ${form} aman di perangkat dan menunggu sinkronisasi.`
    : `Hasil edit ${form} berhasil disimpan.`
}

export default function SaveStatusPopup() {
  const [popup, setPopup] = useState<PopupState | null>(null)
  const armed = useRef(false)
  const baseline = useRef('')
  const sawClear = useRef(false)
  const formRef = useRef<FormName>('Spraying')
  const actionRef = useRef<PopupAction>('save')
  const editedRef = useRef(false)
  const sourceSectionRef = useRef<HTMLElement | null>(null)
  const errorRepeatTimer = useRef<number | null>(null)

  useEffect(() => {
    const currentMessage = () => {
      if (actionRef.current === 'upload') return globalAlertText()
      const source = sourceSectionRef.current
      if (source?.isConnected) return directAlertText(source)
      const target = getTargetSection()
      return target ? directAlertText(target.section) : ''
    }

    const finishInferredEdit = () => {
      if (!armed.current || !editedRef.current || actionRef.current === 'upload') return false
      const source = sourceSectionRef.current
      if (!source || source.isConnected) return false
      const queued = !navigator.onLine
      armed.current = false
      if (errorRepeatTimer.current) window.clearTimeout(errorRepeatTimer.current)
      setPopup({
        kind: queued ? 'queued' : 'success',
        action: actionRef.current,
        form: formRef.current,
        edited: true,
        message: inferredEditMessage(actionRef.current, formRef.current, queued),
      })
      return true
    }

    const capture = () => {
      if (!armed.current) return
      const message = currentMessage()
      if (message) {
        if (message === baseline.current && !sawClear.current) {
          finishInferredEdit()
          return
        }
        const kind = classify(message)
        if (kind) {
          armed.current = false
          if (errorRepeatTimer.current) window.clearTimeout(errorRepeatTimer.current)
          setPopup({ kind, action: actionRef.current, form: formRef.current, edited: editedRef.current, message })
          return
        }
      } else {
        sawClear.current = true
      }
      finishInferredEdit()
    }

    const armPopup = (
      action: PopupAction,
      form: FormName,
      initialMessage: string,
      edited = false,
      sourceSection: HTMLElement | null = null,
    ) => {
      armed.current = true
      actionRef.current = action
      formRef.current = form
      editedRef.current = edited
      sourceSectionRef.current = sourceSection
      baseline.current = initialMessage
      sawClear.current = false
      setPopup(null)

      if (errorRepeatTimer.current) window.clearTimeout(errorRepeatTimer.current)
      errorRepeatTimer.current = window.setTimeout(() => {
        if (!armed.current || sawClear.current) return
        const message = currentMessage()
        if (!message || message !== baseline.current || classify(message) !== 'error') return
        armed.current = false
        setPopup({ kind: 'error', action, form, edited, message })
      }, 350)

      window.setTimeout(capture, 0)
      window.setTimeout(capture, 120)
      window.setTimeout(capture, 500)
      window.setTimeout(capture, 1200)
      window.setTimeout(capture, 3000)
      window.setTimeout(capture, 6000)
      window.setTimeout(capture, 10000)
    }

    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null
      const button = element?.closest('button') as HTMLButtonElement | null
      if (!button || button.disabled) return
      const buttonText = `${button.textContent || ''} ${button.value || ''}`.trim()
      const section = button.closest('section') as HTMLElement | null
      if (!section) return
      const heading = section.querySelector('h2')?.textContent || ''

      if (/data\s+qc/i.test(heading) && UPLOAD_BUTTON.test(buttonText)) {
        const rowText = button.closest('tr')?.textContent || ''
        const form = formFromText(rowText)
        if (!form) return
        armPopup('upload', form, globalAlertText())
        return
      }

      const form = formFromText(heading)
      if (!form || !SAVE_BUTTON.test(buttonText)) return
      const action: PopupAction = /draft/i.test(buttonText) || button.value === 'draft' ? 'draft' : 'save'
      const edited = EDIT_HEADING.test(heading)
      armPopup(action, form, directAlertText(section), edited, section)
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

  const title = popupTitle(popup.action, popup.kind, popup.edited)
  const icon = popup.kind === 'success' ? '✓' : popup.kind === 'queued' ? '↻' : '!'

  return (
    <div className="save-popup-backdrop" role="presentation">
      <section className={`save-popup save-popup-${popup.kind}`} role="dialog" aria-modal="true" aria-labelledby="save-popup-title">
        <div className="save-popup-icon" aria-hidden="true">{icon}</div>
        <div className="save-popup-form">{popupLabel(popup.action, popup.form, popup.edited)}</div>
        <h2 id="save-popup-title">{title}</h2>
        <p>{popup.message}</p>
        <button className="primary save-popup-ok" type="button" autoFocus onClick={() => setPopup(null)}>OK, Mengerti</button>
      </section>
    </div>
  )
}
