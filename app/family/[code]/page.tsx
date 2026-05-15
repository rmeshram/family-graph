import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { Users, TreePine, QrCode } from 'lucide-react'

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function FamilyPublicPage({ params }: PageProps) {
  const { code } = await params
  const supabase = await createClient()

  // Fetch family by invite code
  const { data: family, error } = await supabase
    .from('families')
    .select('id, name, invite_code, created_at')
    .eq('invite_code', code)
    .single()

  if (error || !family) notFound()

  const isClosed = false

  // Count members (only if not closed)
  let memberCount = 0
  if (!isClosed) {
    const { count } = await supabase
      .from('family_members')
      .select('id', { count: 'exact', head: true })
      .eq('family_id', family.id)
      .eq('is_alive', true)
    memberCount = count ?? 0
  }

  const hdrs = await headers()
  const host = hdrs.get('host') ?? ''
  const proto = hdrs.get('x-forwarded-proto') ?? 'https'
  const joinUrl = `${proto}://${host}/join/${code}`
  const familyName = family.name ?? 'Family'
  const createdYear = new Date(family.created_at).getFullYear()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-4 py-12">
      {/* Card */}
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="bg-gradient-to-r from-indigo-600/60 to-violet-600/60 px-6 py-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/20 mb-4">
            <TreePine className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{familyName}</h1>
          <p className="mt-1 text-xs text-white/50">Family since {createdYear}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">
          {isClosed ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400">
                This family tree is private. Contact a family member to get an invite.
              </p>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 py-4">
                <Users className="h-5 w-5 text-indigo-300" />
                <span className="text-xl font-bold text-white">{memberCount}</span>
                <span className="text-sm text-slate-400">members connected</span>
              </div>

              {/* CTA */}
              <a
                href={joinUrl}
                className="block w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-400 hover:to-violet-400 transition-all"
              >
                Join the Family Tree →
              </a>

              <p className="text-center text-xs text-slate-500">
                Scan the QR below or share this link to invite others.
              </p>

              {/* QR placeholder — shows the URL text; a real QR lib can be added later */}
              <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
                <QrCode className="h-8 w-8 text-slate-400" />
                <p className="text-[10px] text-slate-500 break-all text-center">{joinUrl}</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 text-center">
          <p className="text-[10px] text-slate-600">
            Powered by{' '}
            <Link href="/" className="text-indigo-400 hover:text-indigo-300">
              Family Graph
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: PageProps) {
  const { code } = await params
  const supabase = await createClient()
  const { data: family } = await supabase
    .from('families')
    .select('name')
    .eq('invite_code', code)
    .single()
  return {
    title: family?.name ? `${family.name} — Family Graph` : 'Family Graph',
    description: 'Join our family tree on Family Graph.',
  }
}
