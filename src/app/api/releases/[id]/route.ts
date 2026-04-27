import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = createClient()
  const [relRes, tracksRes] = await Promise.all([
    db.from('releases').select('*').eq('id', id).single(),
    db.from('tracks').select('*').eq('release_id', id).order('track_number'),
  ])
  if (relRes.error) return NextResponse.json({ error: relRes.error.message }, { status: 404 })
  return NextResponse.json({ ...relRes.data, tracks: tracksRes.data ?? [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = createClient()
  const body = await request.json()
  const { data, error } = await db.from('releases').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
