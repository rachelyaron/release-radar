'use client'

import { useSettings } from '@/contexts/SettingsContext'
import strings from '@/lib/strings'

export default function NavBar() {
  const { lang, toggleLang } = useSettings()
  const t = strings[lang]

  return (
    <nav
      style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 1px 0 #e5e7eb',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <button
        onClick={toggleLang}
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: '#9ca3af',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 2px',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#4f46e5')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
      >
        {t.buttons.toggleLang}
      </button>

      <span
        style={{
          color: '#4f46e5',
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          userSelect: 'none',
        }}
      >
        RELEASE RADAR
      </span>

      <span style={{ color: 'rgba(79,70,229,0.4)', fontSize: 18, userSelect: 'none' }}>◉</span>
    </nav>
  )
}
