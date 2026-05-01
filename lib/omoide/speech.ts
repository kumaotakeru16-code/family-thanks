export function speak(text: string, lang: 'en' | 'ja' = 'en'): void {
  if (typeof window === 'undefined') return
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang === 'en' ? 'en-US' : 'ja-JP'
  utterance.rate = lang === 'en' ? 0.82 : 0.92
  utterance.pitch = 1.05
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined') return false
  if (!('speechSynthesis' in window)) return false
  return window.speechSynthesis.speaking
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}
