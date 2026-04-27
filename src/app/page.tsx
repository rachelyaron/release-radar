// SETUP: Create a Supabase Storage bucket named 'covers' (public: true)
// Run SQL: create policy "allow all" on storage.objects for all using (bucket_id = 'covers') with check (bucket_id = 'covers');

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/contexts/SettingsContext'
import strings from '@/lib/strings'
import { createClient } from '@/lib/supabase'
import type { Release, AssetStats, ProjectType, ReleaseStatus } from '@/lib/types'

// ── constants ─────────────────────────────────────────────────────────────────

const DEFAULT_ASSET_TASKS = [
  'עטיפת סינגל (3000x3000px)',
  'עטיפת אלבום/EP',
  'מילות שיר — עברית',
  'מילות שיר — אנגלית',
  'מסמך קרדיטים (פרודיוסר, נגנים, טכנאי)',
  'קובץ שמע — WAV מאסטר',
  'קובץ שמע — MP3',
  'קוד ISRC',
  'קוד UPC/EAN',
  'לינק קליפ / יוטיוב',
]

const STATUS_BADGE: Record<ReleaseStatus, { bg: string; color: string }> = {
  draft:     { bg: '#f3f4f6', color: '#6b7280' },
  scheduled: { bg: '#dbeafe', color: '#1e40af' },
  released:  { bg: '#dcfce7', color: '#166534' },
}

const TYPE_BADGE: Record<ProjectType, { bg: string; color: string }> = {
  single: { bg: '#f3e8ff', color: '#7e22ce' },
  ep:     { bg: '#fce7f3', color: '#9d174d' },
  album:  { bg: '#e0f2fe', color: '#075985' },
}

const TYPE_GRADIENTS: Record<ProjectType, string> = {
  single: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  ep:     'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  album:  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
}

// ── helpers ───────────────────────────────────────────────────────────────────

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{
      backgroundColor: bg, color,
      fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.04em',
      padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function BgDecor() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -200, right: -200, width: 600, height: 600, background: 'radial-gradient(circle, rgba(79,70,229,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', bottom: -100, left: -100, width: 500, height: 500, background: 'radial-gradient(circle, rgba(239,68,68,0.04) 0%, transparent 70%)', borderRadius: '50%' }} />
    </div>
  )
}

function VinylSVG() {
  return (
    <svg viewBox="0 0 100 100" fill="white" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)', width: '60%', height: '60%' }}>
      <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="white" strokeWidth="0.5" opacity="0.2" />
      <circle cx="50" cy="50" r="28" fill="none" stroke="white" strokeWidth="0.5" opacity="0.2" />
      <circle cx="50" cy="50" r="18" fill="none" stroke="white" strokeWidth="0.5" opacity="0.2" />
      <circle cx="50" cy="50" r="5" fill="white" opacity="0.4" />
    </svg>
  )
}

// ── cover upload helper (shared between card and modal) ───────────────────────

async function uploadCover(releaseId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `${releaseId}/cover.${ext}`

  const supabase = createClient()

  const { error: uploadError } = await supabase.storage
    .from('covers')
    .upload(path, file, { upsert: true })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    return null
  }

  const { data: urlData } = supabase.storage
    .from('covers')
    .getPublicUrl(path)

  const publicUrl = urlData.publicUrl

  const { error: updateError } = await supabase
    .from('releases')
    .update({ cover_url: publicUrl })
    .eq('id', releaseId)

  if (updateError) {
    console.error('Update error:', updateError)
    return null
  }

  return `${publicUrl}?t=${Date.now()}`
}

// ── home page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter()
  const { lang } = useSettings()
  const t = strings[lang]

  const [releases, setReleases] = useState<Release[]>([])
  const [trackCounts, setTrackCounts] = useState<Record<string, number>>({})
  const [assetStats, setAssetStats] = useState<Record<string, AssetStats>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  async function load() {
    setLoading(true)
    const db = createClient()
    const [relRes, trRes, taskRes] = await Promise.all([
      db.from('releases').select('*').order('created_at', { ascending: false }),
      db.from('tracks').select('release_id'),
      db.from('tasks').select('release_id, is_completed').eq('category', 'asset'),
    ])

    const tc: Record<string, number> = {}
    trRes.data?.forEach((r) => { tc[r.release_id] = (tc[r.release_id] ?? 0) + 1 })

    const as: Record<string, AssetStats> = {}
    taskRes.data?.forEach((r) => {
      if (!as[r.release_id]) as[r.release_id] = { total: 0, completed: 0 }
      as[r.release_id].total++
      if (r.is_completed) as[r.release_id].completed++
    })

    setReleases(relRes.data ?? [])
    setTrackCounts(tc)
    setAssetStats(as)
    setLoading(false)
  }

  async function handleCoverUpload(releaseId: string, file: File) {
    const publicUrl = await uploadCover(releaseId, file)
    if (publicUrl) {
      setReleases((prev) => prev.map((r) =>
        r.id === releaseId ? { ...r, cover_url: publicUrl } : r
      ))
    }
  }

  useEffect(() => { load() }, [])

  return (
    <>
      <BgDecor />

      {/* Sticky shelf header */}
      <div style={{
        position: 'sticky', top: 56, zIndex: 30,
        backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '20px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>{t.page.title}</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            backgroundColor: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 600,
            padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(79,70,229,0.3)', transition: 'background-color 0.15s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4338ca')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4f46e5')}
        >
          {t.buttons.newRelease}
        </button>
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: 32 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af' }}>{t.loading}</div>
        ) : releases.length === 0 ? (
          <EmptyState t={t} onNew={() => setShowModal(true)} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 24 }}>
            {releases.map((r) => (
              <RecordCard
                key={r.id}
                release={r}
                stats={assetStats[r.id] ?? { total: 0, completed: 0 }}
                lang={lang}
                t={t}
                onClick={() => router.push(`/releases/${r.id}`)}
                onCoverUpload={handleCoverUpload}
                onDeleted={(id) => setReleases((prev) => prev.filter((r) => r.id !== id))}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <NewProjectModal t={t} onClose={() => setShowModal(false)} onCreated={load} />
      )}
    </>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState({ t, onNew }: { t: typeof strings['he']; onNew: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 64, lineHeight: 1 }}>🎵</div>
      <p style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>המדף ריק</p>
      <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>הוסיפי את הפרויקט הראשון שלך</p>
      <button
        onClick={onNew}
        style={{
          marginTop: 8, backgroundColor: '#4f46e5', color: '#fff',
          fontSize: 14, fontWeight: 600, padding: '10px 24px',
          borderRadius: 10, border: 'none', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4338ca')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4f46e5')}
      >
        {t.buttons.newRelease}
      </button>
    </div>
  )
}

// ── record card ───────────────────────────────────────────────────────────────

function RecordCard({ release, stats, lang, t, onClick, onCoverUpload, onDeleted }: {
  release: Release
  stats: AssetStats
  lang: 'he' | 'en'
  t: typeof strings['he']
  onClick: () => void
  onCoverUpload: (releaseId: string, file: File) => Promise<void>
  onDeleted: (id: string) => void
}) {
  const [hov, setHov]             = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const fileInputRef              = useRef<HTMLInputElement>(null)
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!window.confirm('למחוק את הפרויקט? פעולה זו אינה הפיכה')) return
    setDeleting(true)
    const db = createClient()
    await db.from('tasks').delete().eq('release_id', release.id)
    await db.from('tracks').delete().eq('release_id', release.id)
    await db.from('releases').delete().eq('id', release.id)
    onDeleted(release.id)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    await onCoverUpload(release.id, file)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: hov
          ? '0 12px 40px rgba(0,0,0,0.3), 4px 4px 0 rgba(0,0,0,0.12)'
          : '0 4px 20px rgba(0,0,0,0.15), 2px 2px 0 rgba(0,0,0,0.08)',
        transform: hov ? 'scale(1.04) translateY(-4px)' : 'scale(1) translateY(0)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Background */}
      {release.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={release.cover_url}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: TYPE_GRADIENTS[release.project_type] }}>
          <VinylSVG />
        </div>
      )}

      {/* Bottom title strip — only when no cover */}
      {!release.cover_url && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '28px 12px 12px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
          pointerEvents: 'none',
        }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {release.title_he}
          </p>
          {release.title_en && (
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '2px 0 0' }}>{release.title_en}</p>
          )}
        </div>
      )}

      {/* Hover overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.72)',
        opacity: hov ? 1 : 0,
        transition: 'opacity 0.2s ease',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 16, gap: 8,
        pointerEvents: hov ? 'auto' : 'none',
      }}>
        <Badge {...TYPE_BADGE[release.project_type]}>{t.projectType[release.project_type]}</Badge>

        <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', margin: 0, lineHeight: 1.3 }}>
          {release.title_he}
        </p>

        {release.release_date && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
            📅 {new Date(release.release_date).toLocaleDateString(
              lang === 'he' ? 'he-IL' : 'en-US',
              { year: 'numeric', month: 'short', day: 'numeric' }
            )}
          </p>
        )}

        {stats.total > 0 && (
          <div style={{ width: '100%', marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              {stats.completed}/{stats.total} נכסים
            </span>
            <div style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 99, marginTop: 4 }}>
              <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#fff', borderRadius: 99, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onClick() }}
          style={{
            marginTop: 4, color: '#fff',
            border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6,
            padding: '6px 14px', fontSize: 13,
            backgroundColor: 'transparent', cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          פתח פרויקט ←
        </button>
      </div>

      {/* Delete button — top-left */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        style={{
          position: 'absolute', top: 8, left: 8,
          width: 32, height: 32, borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.2)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.35)',
          cursor: deleting ? 'default' : 'pointer', fontSize: 14, zIndex: 10,
          opacity: hov && !deleting ? 1 : deleting ? 0.6 : 0,
          transition: 'opacity 0.2s ease',
        }}
        title="מחק פרויקט"
      >
        {deleting ? '⏳' : '🗑'}
      </button>

      {/* Camera upload button — bottom-right */}
      {uploading ? (
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          width: 32, height: 32, borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, zIndex: 10,
        }}>
          ⏳
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); fileInputRef.current?.click() }}
          style={{
            position: 'absolute', bottom: 8, right: 8,
            width: 32, height: 32, borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.35)',
            cursor: 'pointer', fontSize: 14, zIndex: 10,
            opacity: hov ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
          title="העלי תמונת שער"
        >
          📷
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onChange={handleFileChange}
      />
    </div>
  )
}

// ── new project modal ─────────────────────────────────────────────────────────

const PROJECT_TYPE_OPTIONS: Array<{ type: ProjectType; emoji: string }> = [
  { type: 'single', emoji: '🎵' },
  { type: 'ep',     emoji: '🎶' },
  { type: 'album',  emoji: '💿' },
]

function NewProjectModal({ t, onClose, onCreated }: {
  t: typeof strings['he']
  onClose: () => void
  onCreated: () => void
}) {
  const [projectType, setProjectType] = useState<ProjectType>('single')
  const [titleHe, setTitleHe]         = useState('')
  const [titleEn, setTitleEn]         = useState('')
  const [releaseDate, setReleaseDate] = useState('')
  const [tracks, setTracks]           = useState<string[]>([''])
  const [coverFile, setCoverFile]     = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [saving, setSaving]           = useState(false)
  const coverInputRef                 = useRef<HTMLInputElement>(null)

  const isMultiTrack = projectType !== 'single'

  function addTrack() { if (tracks.length < 10) setTracks([...tracks, '']) }
  function removeTrack(i: number) { setTracks(tracks.filter((_, idx) => idx !== i)) }
  function updateTrack(i: number, val: string) { setTracks(tracks.map((v, idx) => idx === i ? val : v)) }

  function handleCoverSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const db = createClient()

    const { data: release, error: relErr } = await db
      .from('releases')
      .insert({ title_he: titleHe, title_en: titleEn || null, release_date: releaseDate || null, status: 'draft', project_type: projectType })
      .select().single()

    if (relErr || !release) { console.error(relErr); setSaving(false); return }

    // Upload cover if provided
    if (coverFile) {
      const ext = coverFile.name.split('.').pop()
      const path = `${release.id}/cover.${ext}`
      const { error: uploadError } = await db.storage.from('covers').upload(path, coverFile, { upsert: true })
      if (!uploadError) {
        const { data: urlData } = db.storage.from('covers').getPublicUrl(path)
        await db.from('releases').update({ cover_url: urlData.publicUrl }).eq('id', release.id)
      } else {
        console.error('Cover upload error:', uploadError)
      }
    }

    const trackTitles  = isMultiTrack ? tracks.filter((tk) => tk.trim()) : [titleHe]
    const trackInserts = trackTitles.map((title, idx) => ({ release_id: release.id, title_he: title, track_number: idx + 1 }))

    console.log('[ReleaseRadar] Inserting tracks:', trackInserts)
    const { data: insertedTracks, error: trErr } = await db.from('tracks').insert(trackInserts).select()
    if (trErr) console.error('[ReleaseRadar] Track insert error:', trErr)
    console.log('[ReleaseRadar] Inserted track ids:', insertedTracks?.map((tk) => tk.id))

    if (insertedTracks?.length) {
      const assetRows = insertedTracks.flatMap((track) =>
        DEFAULT_ASSET_TASKS.map((title) => ({ release_id: release.id, track_id: track.id, title, category: 'asset', is_completed: false }))
      )
      console.log('[ReleaseRadar] Inserting', assetRows.length, 'asset tasks for', insertedTracks.length, 'track(s)')
      const { error: assetErr } = await db.from('tasks').insert(assetRows)
      if (assetErr) console.error('[ReleaseRadar] Asset insert error:', assetErr)
    }

    setSaving(false)
    onCreated()
    onClose()
  }

  const inp: React.CSSProperties = {
    border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px',
    fontSize: 14, width: '100%', color: '#111827', backgroundColor: '#fff',
    outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const focus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#4f46e5'
    e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(79,70,229,0.1)'
  }
  const blur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#e5e7eb'
    e.currentTarget.style.boxShadow   = 'none'
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ backgroundColor: '#fff', borderRadius: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', padding: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>{t.modal.newProject}</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>{t.modal.selectType}</p>

        <form onSubmit={handleSubmit}>
          {/* Cover image dropzone */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div
              onClick={() => coverInputRef.current?.click()}
              style={{
                width: 160, height: 160, borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
                border: coverPreview ? 'none' : '2px dashed #e5e7eb',
                backgroundColor: coverPreview ? 'transparent' : '#f9fafb',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                position: 'relative', flexShrink: 0,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { if (!coverPreview) e.currentTarget.style.borderColor = '#4f46e5' }}
              onMouseLeave={(e) => { if (!coverPreview) e.currentTarget.style.borderColor = '#e5e7eb' }}
            >
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="cover preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <>
                  <span style={{ fontSize: 32 }}>📷</span>
                  <span style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '0 12px' }}>תמונת עטיפה</span>
                </>
              )}
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverSelect} />
          </div>

          {/* Project type */}
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
            {t.labels.projectType}
          </label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {PROJECT_TYPE_OPTIONS.map(({ type, emoji }) => {
              const sel = projectType === type
              return (
                <button
                  key={type} type="button" onClick={() => setProjectType(type)}
                  style={{
                    flex: 1, padding: '16px 10px', borderRadius: 14, textAlign: 'center', cursor: 'pointer',
                    border: `2px solid ${sel ? '#4f46e5' : '#e5e7eb'}`,
                    backgroundColor: sel ? '#eef2ff' : '#fff',
                    boxShadow: sel ? '0 0 0 3px rgba(79,70,229,0.1)' : 'none',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!sel) { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.backgroundColor = '#f5f3ff' } }}
                  onMouseLeave={(e) => { if (!sel) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.backgroundColor = '#fff' } }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: sel ? '#4f46e5' : '#374151' }}>{t.projectType[type]}</div>
                </button>
              )
            })}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>{t.labels.titleHe} *</label>
            <input required value={titleHe} onChange={(e) => setTitleHe(e.target.value)} style={inp} onFocus={focus} onBlur={blur} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>{t.labels.titleEn}</label>
            <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} style={inp} onFocus={focus} onBlur={blur} />
          </div>

          <div style={{ marginBottom: isMultiTrack ? 16 : 24 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>{t.labels.releaseDate}</label>
            <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} style={inp} onFocus={focus} onBlur={blur} />
          </div>

          {isMultiTrack && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>{t.labels.tracks}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tracks.map((v, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 18, textAlign: 'center' }}>{i + 1}</span>
                    <input placeholder={t.labels.trackName} value={v} onChange={(e) => updateTrack(i, e.target.value)} style={{ ...inp, flex: 1 }} onFocus={focus} onBlur={blur} />
                    {tracks.length > 1 && (
                      <button type="button" onClick={() => removeTrack(i)} style={{ color: '#9ca3af', fontSize: 16, cursor: 'pointer', background: 'none', border: 'none' }}>×</button>
                    )}
                  </div>
                ))}
              </div>
              {tracks.length < 10 && (
                <button type="button" onClick={addTrack} style={{ marginTop: 10, fontSize: 13, color: '#4f46e5', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none' }}>{t.buttons.addTrack}</button>
              )}
            </div>
          )}

          <button
            type="button" onClick={onClose}
            style={{ width: '100%', backgroundColor: 'transparent', color: '#9ca3af', borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer', marginBottom: 8, transition: 'color 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#6b7280')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
          >
            {t.buttons.cancel}
          </button>
          <button
            type="submit" disabled={saving}
            style={{ width: '100%', backgroundColor: saving ? '#a5b4fc' : '#4f46e5', color: '#fff', borderRadius: 10, padding: 12, fontSize: 15, fontWeight: 600, border: 'none', cursor: saving ? 'default' : 'pointer', boxShadow: '0 2px 8px rgba(79,70,229,0.25)', transition: 'background-color 0.15s' }}
            onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#4338ca')}
            onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = '#4f46e5')}
          >
            {saving ? '...' : t.buttons.save}
          </button>
        </form>
      </div>
    </div>
  )
}
