import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
import { SettingsProvider } from '@/contexts/SettingsContext'
import NavBar from '@/components/NavBar'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ReleaseRadar',
  description: 'Release management for independent artists',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className={heebo.className}>
      <body className="min-h-screen">
        <SettingsProvider>
          <NavBar />
          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        </SettingsProvider>
      </body>
    </html>
  )
}
