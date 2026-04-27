import { supabase } from '@/lib/supabase'

// ④ イベント作成
export const createEvent = async (
  name: string,
  eventType: string,
  dates: string[]
) => {
  const { data: event, error } = await supabase
    .from('events')
    .insert({
      name,
      event_type: eventType,
      host_token: crypto.randomUUID(),
    })
    .select()
    .single()

  if (error) throw error

  const { error: datesError } = await supabase.from('event_dates').insert(
    dates.map((d, i) => ({
      event_id: event.id,
      label: d,
      sort_order: i,
    }))
  )

  if (datesError) throw datesError

  return event.id as string
}

// ⑤ 参加者回答
export const submitResponse = async ({
  eventId,
  name,
  availability,
  genres,
  areas,
}: {
  eventId: string
  name: string
  availability: Record<string, 'yes' | 'maybe' | 'no'>
  genres: string[]
  areas: string[]
}) => {
  const { error } = await supabase.from('responses').insert({
    event_id: eventId,
    participant_name: name,
    date_answers: availability,
    genres,
    areas,
  })

  if (error) throw error
}

// ⑥ データ取得
export const loadEventData = async (eventId: string) => {
  const { data: dates, error: datesError } = await supabase
    .from('event_dates')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (datesError) throw datesError

  const { data: responses, error: responsesError } = await supabase
    .from('responses')
    .select('*')
    .eq('event_id', eventId)

  if (responsesError) throw responsesError

  return { dates, responses }
}

// ⑦ 決定保存
export const saveDecision = async ({
  eventId,
  selectedDateId,
  selectedStoreId,
  organizerConditions,
  storeName,
  storeUrl,
  storeArea,
  storeMemo,
}: {
  eventId: string
  selectedDateId: string
  selectedStoreId?: string | null
  organizerConditions: string[]
  storeName?: string
  storeUrl?: string
  storeArea?: string
  storeMemo?: string
}) => {
  const payload: Record<string, unknown> = {
    event_id: eventId,
    selected_date_id: selectedDateId,
    organizer_conditions: organizerConditions,
    updated_at: new Date().toISOString(),
  }

  if (selectedStoreId !== undefined) payload.selected_store_id = selectedStoreId
  if (storeName   !== undefined)    payload.store_name  = storeName
  if (storeUrl    !== undefined)    payload.store_url   = storeUrl
  if (storeArea   !== undefined)    payload.store_area  = storeArea
  if (storeMemo   !== undefined)    payload.store_memo  = storeMemo

  const { data, error } = await supabase
    .from('decisions')
    .upsert(payload)
    .select()
    .single()

  if (error) throw error

  return data
}

export const loadDecision = async (eventId: string) => {
  const { data: decision, error: decisionError } = await supabase
    .from('decisions')
    .select('*')
    .eq('event_id', eventId)
    .single()

  if (decisionError) throw decisionError

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single()

  if (eventError) throw eventError

  const { data: dates, error: datesError } = await supabase
    .from('event_dates')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (datesError) throw datesError

  return { decision, event, dates }
}