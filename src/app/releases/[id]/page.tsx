'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/contexts/SettingsContext'
import strings from '@/lib/strings'
import { createClient } from '@/lib/supabase'
import type { Release, Track, Task, Submission, ReleaseStatus, ProjectType } from '@/lib/types'

// ── constants ─────────────────────────────────────────────────────────────────

const FALLBACK_ASSETS: { title: string; desc: string }[] = [
  { title: 'עטיפת סינגל (3000x3000px)',            desc: 'תמונה ריבועית, RGB, JPG/PNG' },
  { title: 'עטיפת אלבום/EP',                        desc: 'גרסה נפרדת אם שונה מהסינגל' },
  { title: 'מילות שיר — עברית',                     desc: 'קובץ Word או PDF' },
  { title: 'מילות שיר — אנגלית',                    desc: 'תרגום מאושר' },
  { title: 'מסמך קרדיטים (פרודיוסר, נגנים, טכנאי)', desc: 'שמות: פרודיוסר, נגנים, מיקס, מאסטרינג, אולפן' },
  { title: 'קובץ שמע — WAV מאסטר',                  desc: 'מאסטר סופי, 44.1kHz/16bit לפחות' },
  { title: 'קובץ שמע — MP3',                        desc: '320kbps, לתצוגה מקדימה' },
  { title: 'קוד ISRC',                              desc: 'מספר זיהוי בינלאומי לשיר' },
  { title: 'קוד UPC/EAN',                           desc: 'ברקוד לאלבום/סינגל' },
  { title: 'לינק קליפ / יוטיוב',                   desc: 'URL סופי לאחר העלאה' },
]

const TASK_SUGGESTIONS = [
  'שליחה להפצה (DistroKid/ONErpm)',
  'הגשה לספוטיפיי Editorial Playlist',
  'פרסום ב-Instagram + Reels',
  'עדכון ביוגרפיה בפלטפורמות',
  'תיאום עם יוטיוב — העלאת קליפ',
  'שליחה לבלוגרים ומשפיענים',
  'עדכון אתר / Linktree',
  'יצירת תוכן TikTok לפרומושן',
  'שליחה לרדיו — הגשה דיגיטלית',
  'צילומי תוכן לסושיאל מדיה',
]

const DEFAULT_STATIONS = [
  'גלגלצ', 'כאן 88', 'כאן גימל', 'גלי צה"ל', 'רדיוס 100',
  'FM 103', 'כאן 11', 'ספוטיפיי Editorial', "אפל מיוזיק פיץ'",
]

const SUB_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  not_sent:   { bg: '#f3f4f6', color: '#6b7280' },
  submitted:  { bg: '#dbeafe', color: '#1e40af' },
  waiting:    { bg: '#fef3c7', color: '#92400e' },
  playlisted: { bg: '#dcfce7', color: '#166534' },
  rejected:   { bg: '#fee2e2', color: '#991b1b' },
}

const SUB_BORDER: Record<string, string> = {
  not_sent:   '#9ca3af',
  submitted:  '#3b82f6',
  waiting:    '#f59e0b',
  playlisted: '#10b981',
  rejected:   '#ef4444',
}

// ── badge helpers ─────────────────────────────────────────────────────────────

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

function Pill({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{ backgroundColor: bg, color, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
      {children}
    </span>
  )
}

// ── background decoration ─────────────────────────────────────────────────────

function BgDecor() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -200, right: -200, width: 600, height: 600, background: 'radial-gradient(circle, rgba(79,70,229,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', bottom: -100, left: -100, width: 500, height: 500, background: 'radial-gradient(circle, rgba(239,68,68,0.04) 0%, transparent 70%)', borderRadius: '50%' }} />
    </div>
  )
}

// ── types ─────────────────────────────────────────────────────────────────────

type Tab = 'assets' | 'tasks' | 'submissions'

type SubRow = {
  _key: string
  id: string | null
  outlet_name: string
  status: string
  notes: string
  dirty: boolean
  saving: boolean
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { lang } = useSettings()
  const t = strings[lang]

  const [release, setRelease] = useState<Release | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<Tab>('assets')
  const [loading, setLoading]         = useState(true)
  const [showEdit, setShowEdit]       = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [coverHov, setCoverHov]       = useState(false)
  const coverInputRef                 = useRef<HTMLInputElement>(null)

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    const db = createClient()
    const ext = file.name.split('.').pop()
    const path = `${id}/cover.${ext}`
    const { error: uploadError } = await db.storage.from('covers').upload(path, file, { upsert: true })
    if (uploadError) { console.error('Cover upload error:', uploadError); setUploadingCover(false); return }
    const { data: urlData } = db.storage.from('covers').getPublicUrl(path)
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`
    await db.from('releases').update({ cover_url: publicUrl }).eq('id', id)
    setRelease((prev) => prev ? { ...prev, cover_url: publicUrl } : prev)
    setUploadingCover(false)
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  async function load() {
    const db = createClient()
    const [relRes, trRes, taskRes, subRes] = await Promise.all([
      db.from('releases').select('*').eq('id', id).single(),
      db.from('tracks').select('*').eq('release_id', id).order('track_number'),
      db.from('tasks').select('*').eq('release_id', id),
      db.from('submissions').select('*').eq('release_id', id),
    ])
    setRelease(relRes.data)
    const tr = trRes.data ?? []
    setTracks(tr)
    setSelectedTrackId(tr[0]?.id ?? null)
    setTasks(taskRes.data ?? [])
    setSubmissions(subRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: '#9ca3af' }}>{t.loading}</div>
  if (!release) return <div style={{ textAlign: 'center', padding: 80, color: '#ef4444' }}>Not found</div>

  const isMultiTrack = release.project_type !== 'single'
  const assetTasks   = tasks.filter((tk) => tk.category === 'asset' && tk.track_id === selectedTrackId)
  const regularTasks = tasks.filter((tk) => tk.category === 'task')
  const typeColors   = TYPE_BADGE[release.project_type]

  return (
    <>
      <BgDecor />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', padding: 32 }}>

        {/* Back */}
        <button
          onClick={() => router.push('/')}
          style={{ fontSize: 13, color: '#6b7280', marginBottom: 24, cursor: 'pointer', background: 'none', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'color 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#4f46e5')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          {t.buttons.back}
        </button>

        {/* Header card */}
        <div style={{ backgroundColor: '#fff', borderRadius: 20, padding: 28, boxShadow: 'var(--shadow-sm)', border: '1px solid #e5e7eb', marginBottom: 20 }}>
          {/* Top row: badges + edit */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Pill {...TYPE_BADGE[release.project_type]}>{t.projectType[release.project_type]}</Pill>
              <Pill {...STATUS_BADGE[release.status]}>{t.status[release.status]}</Pill>
            </div>
            <button
              onClick={() => setShowEdit(true)}
              style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none', transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#4f46e5')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              ✏️ עריכה
            </button>
          </div>

          {/* Main row */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Clickable cover image / placeholder */}
            <div
              style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', width: 80, height: 80 }}
              onMouseEnter={() => setCoverHov(true)}
              onMouseLeave={() => setCoverHov(false)}
              onClick={() => coverInputRef.current?.click()}
            >
              {release.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={release.cover_url} alt="" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: 12, backgroundColor: typeColors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: typeColors.color, fontSize: 32, fontWeight: 700 }}>{release.title_he.charAt(0)}</span>
                </div>
              )}
              {/* Camera overlay */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 12,
                backgroundColor: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: uploadingCover ? 1 : coverHov ? 1 : 0,
                transition: 'opacity 0.15s',
                fontSize: 20,
              }}>
                {uploadingCover ? '⏳' : '📷'}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onClick={(e) => e.stopPropagation()}
                onChange={handleCoverUpload}
              />
            </div>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', margin: 0 }}>{release.title_he}</h1>
              {release.title_en && <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>{release.title_en}</p>}
              {release.release_date && (
                <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>📅</span>
                  {new Date(release.release_date).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Track selector */}
        {isMultiTrack && tracks.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
            {tracks.map((tr) => {
              const sel = selectedTrackId === tr.id
              return (
                <button
                  key={tr.id}
                  onClick={() => setSelectedTrackId(tr.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
                    border: `1px solid ${sel ? '#4f46e5' : '#e5e7eb'}`,
                    backgroundColor: sel ? '#eef2ff' : '#fff',
                    color: sel ? '#4f46e5' : '#6b7280',
                    fontSize: 13, fontWeight: sel ? 600 : 400,
                    cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: sel ? '0 0 0 2px rgba(79,70,229,0.15)' : 'none',
                  }}
                >
                  {tr.track_number}. {tr.title_he}
                </button>
              )
            })}
          </div>
        )}

        {/* Tabs */}
        <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 6, boxShadow: 'var(--shadow-sm)', border: '1px solid #e5e7eb', display: 'inline-flex', gap: 4, marginBottom: 24 }}>
          {(['assets', 'tasks', 'submissions'] as Tab[]).map((tab) => {
            const active = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 20px', borderRadius: 10,
                  fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  border: 'none', transition: 'all 0.15s',
                  backgroundColor: active ? '#4f46e5' : 'transparent',
                  color: active ? '#fff' : '#6b7280',
                  boxShadow: active ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = '#f3f4f6' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {t.tabs[tab]}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'assets' && (
          <AssetsTab
            tasks={assetTasks}
            releaseId={id}
            trackId={selectedTrackId}
            t={t}
            onToggle={async (task) => {
              const db = createClient()
              await db.from('tasks').update({ is_completed: !task.is_completed }).eq('id', task.id)
              setTasks((prev) => prev.map((tk) => tk.id === task.id ? { ...tk, is_completed: !tk.is_completed } : tk))
            }}
            onSaveLink={async (task, url) => {
              const db = createClient()
              await db.from('tasks').update({ link_url: url }).eq('id', task.id)
              setTasks((prev) => prev.map((tk) => tk.id === task.id ? { ...tk, link_url: url } : tk))
            }}
            onTaskInserted={(task) => setTasks((prev) => [...prev, task])}
          />
        )}

        {activeTab === 'tasks' && (
          <TasksTab
            releaseId={id}
            tasks={regularTasks}
            t={t}
            onUpdate={(updatedTasks) => setTasks((prev) => [
              ...prev.filter((tk) => tk.category !== 'task'),
              ...updatedTasks,
            ])}
          />
        )}

        {activeTab === 'submissions' && (
          <SubmissionsTab
            releaseId={id}
            submissions={submissions}
            t={t}
            onUpdate={setSubmissions}
          />
        )}
      </div>

      {showEdit && release && (
        <EditReleaseModal
          release={release}
          t={t}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => { setRelease(updated); setShowEdit(false) }}
        />
      )}
    </>
  )
}

// ── edit release modal ────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ status: ReleaseStatus; label: string; emoji: string }> = [
  { status: 'draft',     label: 'טיוטה',   emoji: '📝' },
  { status: 'scheduled', label: 'מתוכנן',  emoji: '📅' },
  { status: 'released',  label: 'יצא',     emoji: '🎉' },
]

function EditReleaseModal({ release, t, onClose, onSaved }: {
  release: Release
  t: typeof strings['he']
  onClose: () => void
  onSaved: (updated: Release) => void
}) {
  const [titleHe, setTitleHe]         = useState(release.title_he)
  const [titleEn, setTitleEn]         = useState(release.title_en ?? '')
  const [releaseDate, setReleaseDate] = useState(release.release_date ?? '')
  const [status, setStatus]           = useState<ReleaseStatus>(release.status)
  const [saving, setSaving]           = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const db = createClient()
    const { data, error } = await db
      .from('releases')
      .update({ title_he: titleHe, title_en: titleEn || null, release_date: releaseDate || null, status })
      .eq('id', release.id)
      .select()
      .single()
    if (error) { console.error('Edit error:', error); setSaving(false); return }
    onSaved(data)
    setSaving(false)
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
      <div style={{ backgroundColor: '#fff', borderRadius: 24, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.12)', padding: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 24px' }}>עריכת פרויקט</h2>

        <form onSubmit={handleSubmit}>
          {/* Status selector */}
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
            {t.labels.status}
          </label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {STATUS_OPTIONS.map(({ status: s, label, emoji }) => {
              const sel = status === s
              return (
                <button
                  key={s} type="button" onClick={() => setStatus(s)}
                  style={{
                    flex: 1, padding: '14px 8px', borderRadius: 14, textAlign: 'center', cursor: 'pointer',
                    border: `2px solid ${sel ? '#4f46e5' : '#e5e7eb'}`,
                    backgroundColor: sel ? '#eef2ff' : '#fff',
                    boxShadow: sel ? '0 0 0 3px rgba(79,70,229,0.1)' : 'none',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!sel) { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.backgroundColor = '#f5f3ff' } }}
                  onMouseLeave={(e) => { if (!sel) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.backgroundColor = '#fff' } }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: sel ? '#4f46e5' : '#374151' }}>{label}</div>
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

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>{t.labels.releaseDate}</label>
            <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} style={inp} onFocus={focus} onBlur={blur} />
          </div>

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

// ── assets tab ────────────────────────────────────────────────────────────────

function AssetsTab({ tasks, releaseId, trackId, t, onToggle, onSaveLink, onTaskInserted }: {
  tasks: Task[]
  releaseId: string
  trackId: string | null
  t: typeof strings['he']
  onToggle: (task: Task) => Promise<void>
  onSaveLink: (task: Task, url: string) => Promise<void>
  onTaskInserted: (task: Task) => void
}) {
  const merged = FALLBACK_ASSETS.map((item) => ({ item, task: tasks.find((tk) => tk.title === item.title) ?? null }))
  const hasVirtual     = merged.some((m) => m.task === null)
  const completedCount = merged.filter((m) => m.task?.is_completed).length
  const totalCount     = FALLBACK_ASSETS.length
  const pct            = Math.round((completedCount / totalCount) * 100)

  return (
    <div>
      {/* Progress card */}
      <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: '16px 20px', border: '1px solid #e5e7eb', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#4f46e5' }}>{pct}% {t.detail.assetsProgress}</span>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{completedCount} {t.detail.assetsOf} {totalCount} {t.detail.assetsReady}</span>
        </div>
        <div style={{ height: 6, backgroundColor: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #4f46e5, #818cf8)', borderRadius: 99, transition: 'width 0.4s' }} />
        </div>
      </div>

      {hasVirtual && (
        <div style={{ backgroundColor: '#eef2ff', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#4f46e5' }}>
          לחצי על ✓ כדי לסמן כמוכן — הפריטים יישמרו אוטומטית
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {merged.map(({ item, task }) =>
          task ? (
            <AssetRow key={task.id} task={task} item={item} t={t} onToggle={onToggle} onSaveLink={onSaveLink} />
          ) : (
            <VirtualAssetRow key={item.title} item={item} releaseId={releaseId} trackId={trackId} onInserted={onTaskInserted} />
          )
        )}
      </div>
    </div>
  )
}

function AssetRow({ task, item, t, onToggle, onSaveLink }: {
  task: Task
  item: { title: string; desc: string }
  t: typeof strings['he']
  onToggle: (task: Task) => Promise<void>
  onSaveLink: (task: Task, url: string) => Promise<void>
}) {
  const [showLink, setShowLink]     = useState(false)
  const [linkVal, setLinkVal]       = useState(task.link_url ?? '')
  const [savingLink, setSavingLink] = useState(false)
  const [toggling, setToggling]     = useState(false)

  async function handleToggle() { setToggling(true); await onToggle(task); setToggling(false) }
  async function handleSaveLink() { setSavingLink(true); await onSaveLink(task, linkVal); setSavingLink(false); setShowLink(false) }

  return (
    <div style={{
      backgroundColor: task.is_completed ? '#f0fdf4' : '#fff',
      borderRadius: 12, padding: '14px 16px', marginBottom: 8,
      border: `1px solid ${task.is_completed ? '#bbf7d0' : '#e5e7eb'}`,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleToggle} disabled={toggling}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
            border: `2px solid ${task.is_completed ? '#10b981' : '#d1d5db'}`,
            backgroundColor: task.is_completed ? '#10b981' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
        >
          {task.is_completed && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
        </button>

        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, color: task.is_completed ? '#9ca3af' : '#111827', textDecoration: task.is_completed ? 'line-through' : 'none' }}>
            {task.title}
          </span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}> — {item.desc}</span>
        </div>

        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, flexShrink: 0, backgroundColor: task.is_completed ? '#dcfce7' : '#f3f4f6', color: task.is_completed ? '#166534' : '#9ca3af' }}>
          {task.is_completed ? '✓ מוכן' : 'חסר'}
        </span>

        {task.link_url ? (
          <a href={task.link_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#4f46e5', flexShrink: 0 }}>🔗</a>
        ) : (
          <button onClick={() => setShowLink(!showLink)} style={{ fontSize: 12, color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none', flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#4f46e5')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
          >
            {t.buttons.addLink}
          </button>
        )}
      </div>

      {showLink && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            placeholder={t.detail.linkPlaceholder} value={linkVal} onChange={(e) => setLinkVal(e.target.value)}
            style={{ flex: 1, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: '#111827', outline: 'none' }}
          />
          <button onClick={handleSaveLink} disabled={savingLink}
            style={{ padding: '6px 14px', borderRadius: 8, backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none' }}
          >
            {savingLink ? '...' : t.buttons.save}
          </button>
        </div>
      )}

      {task.link_url && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <a href={task.link_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4f46e5', textDecoration: 'underline', wordBreak: 'break-all' }}>{task.link_url}</a>
          <button onClick={() => { setLinkVal(task.link_url ?? ''); setShowLink(true) }} style={{ fontSize: 11, color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none' }}>✏️</button>
        </div>
      )}
    </div>
  )
}

function VirtualAssetRow({ item, releaseId, trackId, onInserted }: {
  item: { title: string; desc: string }
  releaseId: string
  trackId: string | null
  onInserted: (task: Task) => void
}) {
  const [inserting, setInserting] = useState(false)

  async function handleCheck() {
    if (inserting) return
    setInserting(true)
    const db = createClient()
    const { data, error } = await db
      .from('tasks')
      .insert({ release_id: releaseId, track_id: trackId, title: item.title, category: 'asset', is_completed: true, link_url: null })
      .select().single()
    if (error) { console.error('[ReleaseRadar] Virtual asset insert error:', error); setInserting(false); return }
    onInserted(data)
  }

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 8, border: '1px solid #e5e7eb', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleCheck} disabled={inserting}
          style={{ width: 20, height: 20, borderRadius: 6, border: '2px solid #d1d5db', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: inserting ? 'default' : 'pointer', flexShrink: 0, opacity: inserting ? 0.5 : 1, transition: 'all 0.15s' }}
        />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 14, color: '#111827' }}>{item.title}</span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}> — {item.desc}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, backgroundColor: '#f3f4f6', color: '#9ca3af' }}>חסר</span>
      </div>
    </div>
  )
}

// ── task row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, today, onToggle, onDelete, t }: {
  task: Task; today: string
  onToggle: () => void; onDelete: () => void
  t: typeof strings['he']
}) {
  const [hov, setHov] = useState(false)
  const overdue = !!(task.due_date && task.due_date < today && !task.is_completed)

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, backgroundColor: '#fff', border: '1px solid #e5e7eb', marginBottom: 6, boxShadow: 'var(--shadow-sm)' }}
    >
      <button onClick={onToggle}
        style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${task.is_completed ? '#10b981' : '#d1d5db'}`, backgroundColor: task.is_completed ? '#10b981' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
      >
        {task.is_completed && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
      </button>
      <span style={{ flex: 1, fontSize: 14, color: task.is_completed ? '#9ca3af' : '#111827', textDecoration: task.is_completed ? 'line-through' : 'none' }}>
        {task.title}
      </span>
      {task.due_date && (
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 500, whiteSpace: 'nowrap', backgroundColor: overdue ? '#fee2e2' : '#f3f4f6', color: overdue ? '#ef4444' : '#6b7280' }}>
          {overdue ? `⚠ ${t.detail.overdue}` : task.due_date}
        </span>
      )}
      {hov && (
        <button onClick={onDelete} style={{ fontSize: 15, color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none', transition: 'color 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
        >×</button>
      )}
    </div>
  )
}

// ── tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({ releaseId, tasks, t, onUpdate }: {
  releaseId: string; tasks: Task[]
  t: typeof strings['he']; onUpdate: (tasks: Task[]) => void
}) {
  const [newTitle, setNewTitle]               = useState('')
  const [newDue, setNewDue]                   = useState('')
  const [adding, setAdding]                   = useState(false)
  const [showCompleted, setShowCompleted]     = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)

  const active    = tasks.filter((tk) => !tk.is_completed)
  const completed = tasks.filter((tk) => tk.is_completed)
  const today     = new Date().toISOString().split('T')[0]

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setAdding(true)
    const db = createClient()
    const { data } = await db.from('tasks').insert({
      release_id: releaseId, track_id: null, title: newTitle.trim(),
      due_date: newDue || null, is_completed: false, category: 'task', link_url: null,
    }).select().single()
    if (data) onUpdate([...tasks, data])
    setNewTitle(''); setNewDue(''); setAdding(false)
  }

  async function addSuggestion(title: string) {
    const db = createClient()
    const { data } = await db.from('tasks').insert({
      release_id: releaseId, track_id: null, title,
      due_date: null, is_completed: false, category: 'task', link_url: null,
    }).select().single()
    if (data) onUpdate([...tasks, data])
  }

  async function toggleTask(task: Task) {
    const db = createClient()
    await db.from('tasks').update({ is_completed: !task.is_completed }).eq('id', task.id)
    onUpdate(tasks.map((tk) => tk.id === task.id ? { ...tk, is_completed: !tk.is_completed } : tk))
  }

  async function deleteTask(task: Task) {
    const db = createClient()
    await db.from('tasks').delete().eq('id', task.id)
    onUpdate(tasks.filter((tk) => tk.id !== task.id))
  }

  return (
    <div>
      {/* Suggestions */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowSuggestions(!showSuggestions)}
          style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', cursor: 'pointer', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 4, marginBottom: showSuggestions ? 10 : 0 }}
        >
          {showSuggestions ? '▾' : '▸'} הוסיפי בקליק:
        </button>
        {showSuggestions && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TASK_SUGGESTIONS.map((s) => {
              const added = tasks.some((tk) => tk.title === s)
              return (
                <button key={s} onClick={() => !added && addSuggestion(s)}
                  style={{
                    backgroundColor: added ? '#f3f4f6' : '#eef2ff',
                    color: added ? '#9ca3af' : '#4f46e5',
                    borderRadius: 99, padding: '4px 12px', fontSize: 12, fontWeight: 500,
                    cursor: added ? 'default' : 'pointer', border: 'none',
                    textDecoration: added ? 'line-through' : 'none', transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!added) { e.currentTarget.style.backgroundColor = '#4f46e5'; e.currentTarget.style.color = '#fff' } }}
                  onMouseLeave={(e) => { if (!added) { e.currentTarget.style.backgroundColor = '#eef2ff'; e.currentTarget.style.color = '#4f46e5' } }}
                >
                  {added ? `✓ ${s}` : `+ ${s}`}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Add form */}
      <form onSubmit={addTask} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, border: '1px solid #e5e7eb', marginBottom: 16, display: 'flex', gap: 8 }}>
        <input
          placeholder={t.labels.taskTitle} value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
          style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: 14, color: '#111827', outline: 'none', backgroundColor: '#f9fafb' }}
        />
        <input
          type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
          style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 10px', fontSize: 13, color: '#6b7280', outline: 'none', backgroundColor: '#f9fafb' }}
        />
        <button type="submit" disabled={adding}
          style={{ padding: '9px 18px', borderRadius: 8, backgroundColor: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', border: 'none' }}
        >
          {t.buttons.addTask}
        </button>
      </form>

      {/* Active tasks */}
      <div>
        {active.length === 0 && completed.length === 0 && (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 14 }}>{t.detail.noTasks}</p>
        )}
        {active.map((task) => (
          <TaskRow key={task.id} task={task} today={today} t={t}
            onToggle={() => toggleTask(task)} onDelete={() => deleteTask(task)} />
        ))}
      </div>

      {/* Completed */}
      {completed.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => setShowCompleted(!showCompleted)}
            style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none' }}
          >
            {showCompleted ? '▾' : '▸'} {t.detail.completedSection} ({completed.length})
          </button>
          {showCompleted && completed.map((task) => (
            <TaskRow key={task.id} task={task} today={today} t={t}
              onToggle={() => toggleTask(task)} onDelete={() => deleteTask(task)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── submissions tab ───────────────────────────────────────────────────────────

function SubmissionsTab({ releaseId, submissions, t, onUpdate }: {
  releaseId: string; submissions: Submission[]
  t: typeof strings['he']; onUpdate: (subs: Submission[]) => void
}) {
  function buildRows(subs: Submission[]): SubRow[] {
    const rows: SubRow[] = DEFAULT_STATIONS.map((station) => {
      const found = subs.find((s) => s.outlet_name === station)
      return { _key: station, id: found?.id ?? null, outlet_name: station, status: found?.status ?? 'not_sent', notes: found?.notes ?? '', dirty: false, saving: false }
    })
    subs.filter((s) => !DEFAULT_STATIONS.includes(s.outlet_name)).forEach((s) => {
      rows.push({ _key: s.id, id: s.id, outlet_name: s.outlet_name, status: s.status, notes: s.notes ?? '', dirty: false, saving: false })
    })
    return rows
  }

  const [rows, setRows] = useState<SubRow[]>(() => buildRows(submissions))

  function update(key: string, patch: Partial<SubRow>) {
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, ...patch, dirty: true } : r))
  }

  async function saveRow(key: string) {
    const row = rows.find((r) => r._key === key)
    if (!row) return
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, saving: true } : r))
    const db = createClient()
    if (row.id) {
      await db.from('submissions').update({ status: row.status, notes: row.notes }).eq('id', row.id)
    } else {
      const { data } = await db.from('submissions').insert({ release_id: releaseId, outlet_name: row.outlet_name, outlet_type: 'radio', status: row.status, notes: row.notes }).select().single()
      if (data) setRows((prev) => prev.map((r) => r._key === key ? { ...r, id: data.id } : r))
    }
    setRows((prev) => prev.map((r) => r._key === key ? { ...r, dirty: false, saving: false } : r))
  }

  function addCustomRow() {
    const key = `custom-${Date.now()}`
    setRows((prev) => [...prev, { _key: key, id: null, outlet_name: '', status: 'not_sent', notes: '', dirty: true, saving: false }])
  }

  const statusKeys = Object.keys(SUB_STATUS_COLORS)

  return (
    <div>
      {rows.map((row) => {
        const sc = SUB_STATUS_COLORS[row.status] ?? SUB_STATUS_COLORS.not_sent
        const bl = SUB_BORDER[row.status] ?? '#9ca3af'
        return (
          <div key={row._key} style={{
            backgroundColor: '#fff',
            borderRadius: 12, marginBottom: 8,
            borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 3,
            borderStyle: 'solid',
            borderTopColor: '#e5e7eb', borderRightColor: '#e5e7eb', borderBottomColor: '#e5e7eb',
            borderLeftColor: bl,
            padding: '14px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', minWidth: 130 }}>
              {row.outlet_name || (
                <input placeholder="שם הגוף" value={row.outlet_name}
                  onChange={(e) => update(row._key, { outlet_name: e.target.value })}
                  style={{ fontSize: 14, border: 'none', outline: 'none', color: '#111827', width: 130 }}
                />
              )}
            </span>

            <select value={row.status} onChange={(e) => update(row._key, { status: e.target.value })}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, backgroundColor: sc.bg, color: sc.color, cursor: 'pointer', outline: 'none' }}
            >
              {statusKeys.map((k) => (
                <option key={k} value={k}>{t.submissionStatus[k as keyof typeof t.submissionStatus]}</option>
              ))}
            </select>

            <input placeholder={t.labels.notes} value={row.notes}
              onChange={(e) => update(row._key, { notes: e.target.value })}
              style={{ flex: 1, minWidth: 120, fontSize: 13, border: 'none', backgroundColor: 'transparent', color: '#6b7280', outline: 'none' }}
            />

            {row.dirty && (
              <button onClick={() => saveRow(row._key)} disabled={row.saving}
                style={{ padding: '4px 12px', borderRadius: 8, backgroundColor: row.saving ? '#e5e7eb' : '#eef2ff', color: row.saving ? '#9ca3af' : '#4f46e5', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { if (!row.saving) { e.currentTarget.style.backgroundColor = '#4f46e5'; e.currentTarget.style.color = '#fff' } }}
                onMouseLeave={(e) => { if (!row.saving) { e.currentTarget.style.backgroundColor = '#eef2ff'; e.currentTarget.style.color = '#4f46e5' } }}
              >
                {row.saving ? '...' : t.buttons.save}
              </button>
            )}
          </div>
        )
      })}

      <button onClick={addCustomRow}
        style={{ marginTop: 12, fontSize: 13, color: '#4f46e5', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none' }}
      >
        {t.buttons.addMedia}
      </button>
    </div>
  )
}
