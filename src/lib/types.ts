export type ProjectType = 'single' | 'ep' | 'album'
export type ReleaseStatus = 'draft' | 'scheduled' | 'released'
export type TaskCategory = 'asset' | 'task'

export interface Release {
  id: string
  title_he: string
  title_en: string | null
  release_date: string | null
  status: ReleaseStatus
  project_type: ProjectType
  cover_url: string | null
  isrc: string | null
  upc: string | null
  lyrics_he: string | null
  lyrics_en: string | null
  created_at: string
}

export interface Track {
  id: string
  release_id: string
  title_he: string
  title_en: string | null
  track_number: number
  created_at: string
}

export interface Credit {
  id: string
  release_id: string
  role: string
  name: string
}

export interface Task {
  id: string
  release_id: string
  track_id: string | null
  title: string
  due_date: string | null
  is_completed: boolean
  category: TaskCategory
  link_url: string | null
}

export interface Submission {
  id: string
  release_id: string
  track_id: string | null
  outlet_name: string
  outlet_type: string
  status: string
  notes: string | null
  submitted_at: string | null
}

export interface AssetStats {
  total: number
  completed: number
}
