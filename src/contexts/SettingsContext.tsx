'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { Lang } from '@/lib/strings'

interface SettingsContextType {
  lang: Lang
  toggleLang: () => void
}

const SettingsContext = createContext<SettingsContextType>({
  lang: 'he',
  toggleLang: () => {},
})

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('he')

  useEffect(() => {
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  function toggleLang() {
    setLang((l) => (l === 'he' ? 'en' : 'he'))
  }

  return (
    <SettingsContext.Provider value={{ lang, toggleLang }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
