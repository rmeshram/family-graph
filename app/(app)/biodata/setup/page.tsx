"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { motion, AnimatePresence } from "framer-motion"
import {
  Camera, ArrowRight, ArrowLeft, Loader2, AlertCircle,
  TreePine, CheckCircle, Sparkles, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ─────────────────────────── constants ── */

const EDUCATION_LEVELS = [
  { value: "below_10th", label: "Below 10th" },
  { value: "10th_pass", label: "10th Pass" },
  { value: "12th_pass", label: "12th Pass" },
  { value: "diploma", label: "Diploma" },
  { value: "graduate", label: "Graduate" },
  { value: "post_graduate", label: "Post Graduate" },
  { value: "doctorate", label: "Doctorate / PhD" },
]

const OCCUPATION_CATEGORIES = [
  { value: "government", label: "Government / PSU" },
  { value: "private", label: "Private Sector" },
  { value: "business", label: "Business / Self-employed" },
  { value: "professional", label: "Doctor / Lawyer / CA" },
  { value: "student", label: "Student" },
  { value: "homemaker", label: "Homemaker" },
  { value: "not_working", label: "Not working currently" },
]

const INCOME_RANGES = [
  { value: "below_2lakh", label: "Below ₹2 LPA" },
  { value: "2_to_5lakh", label: "₹2–5 LPA" },
  { value: "5_to_10lakh", label: "₹5–10 LPA" },
  { value: "10_to_15lakh", label: "₹10–15 LPA" },
  { value: "15_to_25lakh", label: "₹15–25 LPA" },
  { value: "25_to_50lakh", label: "₹25–50 LPA" },
  { value: "50lakh_plus", label: "₹50 LPA+" },
]

const FAMILY_INCOME_RANGES = [
  { value: "below_5lakh", label: "Below ₹5 LPA" },
  { value: "5_to_10lakh", label: "₹5–10 LPA" },
  { value: "10_to_20lakh", label: "₹10–20 LPA" },
  { value: "20_to_50lakh", label: "₹20–50 LPA" },
  { value: "50lakh_plus", label: "₹50 LPA+" },
]

const MARITAL_STATUSES = [
  { value: "never_married", label: "Never married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "separated", label: "Separated" },
]

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]

/* ─────────────────────────── animation ── */
type Dir = 1 | -1
function slideVariants(dir: Dir) {
  return {
    enter: { x: dir * 48, opacity: 0 },
    center: { x: 0, opacity: 1, transition: { duration: 0.28, ease: "easeOut" as const } },
    exit: { x: dir * -48, opacity: 0, transition: { duration: 0.2, ease: "easeIn" as const } },
  }
}

/* ─────────────────────────── reusable field components ── */

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-[13px] font-semibold text-slate-700">{label}</label>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function SelectField({
  label, hint, value, onChange, options, placeholder,
}: {
  label: string; hint?: string
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <div>
      <FieldLabel label={label} hint={hint} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] transition-all",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          value ? "text-slate-900" : "text-slate-400"
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function ChipGroup<T extends string>({
  label, hint, options, value, onChange,
}: {
  label: string; hint?: string
  options: { value: T; label: string }[]
  value: T | ""
  onChange: (v: T) => void
}) {
  return (
    <div>
      <FieldLabel label={label} hint={hint} />
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-all",
              value === o.value
                ? "border-blue-700 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-slate-600 hover:border-gray-300"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────── progress bar ── */
function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <motion.div
          className="h-full bg-blue-700 rounded-full"
          initial={false}
          animate={{ width: `${((step + 1) / total) * 100}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <span className="text-[11px] font-medium text-slate-400 shrink-0">{step + 1} / {total}</span>
    </div>
  )
}

/* ─────────────────────────── page ── */
export default function BiodataSetupPage() {
  return (
    <Suspense>
      <BiodataSetupContent />
    </Suspense>
  )
}

function BiodataSetupContent() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const [memberId, setMemberId] = useState<string | null>((profile as any)?.member_id ?? null)

  /* Resolve the user's own member node. Prefer profile.member_id; if the account
     isn't linked there, fall back to the node they've claimed. Without this,
     handleSave silently no-ops for unlinked accounts (the "button does nothing" bug). */
  useEffect(() => {
    const pid = (profile as any)?.member_id as string | null
    if (pid) { setMemberId(pid); return }
    if (!user) return
    createClient()
      .from("family_members")
      .select("id")
      .eq("claimed_by_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setMemberId((data as any).id) })
  }, [profile, user])

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<Dir>(1)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* photo */
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  /* step 1 — personal */
  const [birthYear, setBirthYear] = useState("")
  const [heightCm, setHeightCm] = useState("")
  const [maritalStatus, setMaritalStatus] = useState("")
  const [bloodGroup, setBloodGroup] = useState("")

  /* step 2 — education & career */
  const [educationLevel, setEducationLevel] = useState("")
  const [educationField, setEducationField] = useState("")
  const [occupationCategory, setOccupationCategory] = useState("")
  const [annualIncomeRange, setAnnualIncomeRange] = useState("")

  /* step 3 — family & preferences */
  const [familyType, setFamilyType] = useState<"joint" | "nuclear" | "">("")
  const [brothers, setBrothers] = useState("0")
  const [sisters, setSisters] = useState("0")
  const [familyIncomeRange, setFamilyIncomeRange] = useState("")
  const [partnerAgeMin, setPartnerAgeMin] = useState("")
  const [partnerAgeMax, setPartnerAgeMax] = useState("")
  const [partnerExpectations, setPartnerExpectations] = useState("")

  /* pre-fill from existing member data */
  useEffect(() => {
    if (!memberId) return
    const supabase = createClient()
    supabase.from("family_members")
      .select("birth_year,height_cm,marital_status,blood_group,education_level,education_field,occupation_category,annual_income_range,family_type,number_of_brothers,number_of_sisters,family_income_range,preferred_age_min,preferred_age_max,partner_expectations,biodata_photo_url")
      .eq("id", memberId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const d = data as any
        if (d.birth_year) setBirthYear(String(d.birth_year))
        if (d.height_cm) setHeightCm(String(d.height_cm))
        if (d.marital_status) setMaritalStatus(d.marital_status)
        if (d.blood_group) setBloodGroup(d.blood_group)
        if (d.education_level) setEducationLevel(d.education_level)
        if (d.education_field) setEducationField(d.education_field)
        if (d.occupation_category) setOccupationCategory(d.occupation_category)
        if (d.annual_income_range) setAnnualIncomeRange(d.annual_income_range)
        if (d.family_type) setFamilyType(d.family_type)
        if (d.number_of_brothers != null) setBrothers(String(d.number_of_brothers))
        if (d.number_of_sisters != null) setSisters(String(d.number_of_sisters))
        if (d.family_income_range) setFamilyIncomeRange(d.family_income_range)
        if (d.preferred_age_min) setPartnerAgeMin(String(d.preferred_age_min))
        if (d.preferred_age_max) setPartnerAgeMax(String(d.preferred_age_max))
        if (d.partner_expectations) setPartnerExpectations(d.partner_expectations)
        if (d.biodata_photo_url) setPhotoPreview(d.biodata_photo_url)
      })
  }, [memberId])

  function nav(to: Dir) { setDir(to); setStep(s => s + to) }

  /* ft + in helper */
  function cmToFtIn(cm: number) {
    const totalIn = Math.round(cm / 2.54)
    return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`
  }

  /* ── save ── */
  async function handleSave() {
    if (!user) return
    if (!memberId) {
      setError("Your account isn't linked to a family member yet. Add yourself on the family tree, then return here.")
      return
    }
    const yr = parseInt(birthYear)
    if (!birthYear || isNaN(yr) || yr < 1940 || yr > new Date().getFullYear() - 18) {
      setError("Please enter a valid birth year (you must be 18+). It's required so your biodata can be matched.")
      setStep(1)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()

      /* upload photo if new file selected */
      let biodataPhotoUrl: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split(".").pop()
        const path = `${user.id}/biodata.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from("avatars")
          .upload(path, photoFile, { upsert: true })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path)
          biodataPhotoUrl = urlData.publicUrl
        }
      }

      const patch: Record<string, unknown> = {
        birth_year: yr,
        marital_status: maritalStatus || null,
        blood_group: bloodGroup || null,
        height_cm: heightCm ? parseInt(heightCm) : null,
        education_level: educationLevel || null,
        education_field: educationField.trim() || null,
        occupation_category: occupationCategory || null,
        annual_income_range: annualIncomeRange || null,
        family_type: familyType || null,
        number_of_brothers: parseInt(brothers) || 0,
        number_of_sisters: parseInt(sisters) || 0,
        family_income_range: familyIncomeRange || null,
        preferred_age_min: partnerAgeMin ? parseInt(partnerAgeMin) : null,
        preferred_age_max: partnerAgeMax ? parseInt(partnerAgeMax) : null,
        partner_expectations: partnerExpectations.trim() || null,
        is_biodata_visible: true,
        biodata_last_updated_at: new Date().toISOString(),
      }
      if (biodataPhotoUrl) patch.biodata_photo_url = biodataPhotoUrl

      const { error: updateErr } = await supabase
        .from("family_members")
        .update(patch as any)
        .eq("id", memberId)

      if (updateErr) throw updateErr

      setDone(true)
      setTimeout(() => router.push("/biodata"), 1800)
    } catch (e: unknown) {
      setSaving(false)
      setError(e instanceof Error ? e.message : "Save failed. Please try again.")
    }
  }

  /* ── success screen ── */
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#F8F9FA" }}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50 border-2 border-green-200 mb-4"
          >
            <CheckCircle className="h-8 w-8 text-green-700" />
          </motion.div>
          <h2 className="text-[22px] font-bold text-slate-900">Biodata ready!</h2>
          <p className="text-[14px] text-slate-500 mt-2">Taking you to your biodata page…</p>
        </motion.div>
      </div>
    )
  }

  const TOTAL_STEPS = 4

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#F8F9FA" }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-700">
            <TreePine className="h-4 w-4 text-white" />
          </div>
          <span className="text-[15px] font-bold text-slate-900">Create your biodata</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Progress */}
          <div className="px-6 pt-6 pb-4">
            <ProgressBar step={step} total={TOTAL_STEPS} />
          </div>

          {/* Steps */}
          <div className="relative overflow-hidden" style={{ minHeight: 380 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                variants={slideVariants(dir)}
                initial="enter"
                animate="center"
                exit="exit"
                className="px-6 pb-6 space-y-5"
              >

                {/* ── Step 0 — Photo ─────────────────────── */}
                {step === 0 && (
                  <>
                    <div>
                      <h2 className="text-[20px] font-bold text-slate-900">Add your biodata photo</h2>
                      <p className="text-[13px] text-slate-500 mt-1">A clear, recent photo makes your biodata stand out.</p>
                    </div>

                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        if (f.size > 8 * 1024 * 1024) { setError("Photo must be under 8 MB."); return }
                        setPhotoFile(f)
                        setPhotoPreview(URL.createObjectURL(f))
                        setError(null)
                      }}
                    />

                    {/* Photo upload area */}
                    <button
                      type="button"
                      onClick={() => photoRef.current?.click()}
                      className={cn(
                        "w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-10 gap-3 transition-all",
                        photoPreview
                          ? "border-blue-200 bg-blue-50"
                          : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50"
                      )}
                    >
                      {photoPreview ? (
                        <>
                          <img
                            src={photoPreview}
                            alt="Biodata photo"
                            className="h-32 w-32 rounded-xl object-cover border-2 border-white shadow-md"
                          />
                          <span className="text-[13px] font-medium text-blue-700">Tap to change photo</span>
                        </>
                      ) : (
                        <>
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-200">
                            <Camera className="h-7 w-7 text-slate-400" />
                          </div>
                          <div className="text-center">
                            <p className="text-[14px] font-semibold text-slate-700">Upload photo</p>
                            <p className="text-[12px] text-slate-400 mt-0.5">JPEG, PNG, WebP · Max 8 MB</p>
                          </div>
                        </>
                      )}
                    </button>

                    <p className="text-[12px] text-slate-400 text-center">
                      Photo is only shared with families you choose to connect with.
                    </p>

                    <button
                      type="button"
                      onClick={() => nav(1)}
                      className="w-full rounded-xl bg-blue-700 py-3.5 text-[14px] font-semibold text-white hover:bg-blue-800 transition-colors flex items-center justify-center gap-2"
                    >
                      {photoPreview ? "Continue" : "Skip for now"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </>
                )}

                {/* ── Step 1 — Personal ─────────────────── */}
                {step === 1 && (
                  <>
                    <div>
                      <h2 className="text-[20px] font-bold text-slate-900">Personal details</h2>
                      <p className="text-[13px] text-slate-500 mt-1">Basic details shown on your biodata card.</p>
                    </div>

                    {/* Birth year — required for matching & eligibility */}
                    <div>
                      <FieldLabel label="Birth year" />
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="e.g. 1996"
                        min={1940}
                        max={new Date().getFullYear() - 18}
                        value={birthYear}
                        onChange={e => setBirthYear(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                      {birthYear && /^\d{4}$/.test(birthYear) && (
                        <p className="text-[12px] text-slate-500 mt-1">Age {new Date().getFullYear() - parseInt(birthYear)}</p>
                      )}
                    </div>

                    {/* Height */}
                    <div>
                      <FieldLabel label="Height" />
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            placeholder="e.g. 168"
                            min={120}
                            max={220}
                            value={heightCm}
                            onChange={e => setHeightCm(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>
                        <span className="text-[13px] text-slate-400 font-medium shrink-0">cm</span>
                        {heightCm && parseInt(heightCm) > 100 && (
                          <span className="text-[13px] text-slate-500 shrink-0">
                            {cmToFtIn(parseInt(heightCm))}
                          </span>
                        )}
                      </div>
                    </div>

                    <ChipGroup
                      label="Marital status"
                      options={MARITAL_STATUSES}
                      value={maritalStatus as any}
                      onChange={setMaritalStatus}
                    />

                    <ChipGroup
                      label="Blood group"
                      hint="Optional — useful for family health records"
                      options={BLOOD_GROUPS.map(v => ({ value: v, label: v }))}
                      value={bloodGroup as any}
                      onChange={setBloodGroup}
                    />

                    {error && (
                      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        <p className="text-[13px] text-red-700">{error}</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => nav(-1)} className="flex items-center gap-1 rounded-xl border border-gray-200 px-4 py-3 text-[13px] font-semibold text-slate-600 hover:bg-gray-50 transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setError(null); nav(1) }}
                        className="flex-1 rounded-xl bg-blue-700 py-3 text-[14px] font-semibold text-white hover:bg-blue-800 transition-colors flex items-center justify-center gap-2"
                      >
                        Continue <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}

                {/* ── Step 2 — Education & Career ─────────── */}
                {step === 2 && (
                  <>
                    <div>
                      <h2 className="text-[20px] font-bold text-slate-900">Education &amp; career</h2>
                      <p className="text-[13px] text-slate-500 mt-1">Parents ask about this first. Be accurate.</p>
                    </div>

                    <SelectField
                      label="Highest education"
                      value={educationLevel}
                      onChange={setEducationLevel}
                      options={EDUCATION_LEVELS}
                      placeholder="Select education level"
                    />

                    <div>
                      <FieldLabel label="Field of study" hint="e.g. Computer Science, MBA, MBBS" />
                      <input
                        type="text"
                        placeholder="e.g. Computer Science"
                        value={educationField}
                        onChange={e => setEducationField(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <SelectField
                      label="Occupation"
                      value={occupationCategory}
                      onChange={setOccupationCategory}
                      options={OCCUPATION_CATEGORIES}
                      placeholder="Select occupation type"
                    />

                    <SelectField
                      label="Annual income"
                      value={annualIncomeRange}
                      onChange={setAnnualIncomeRange}
                      options={INCOME_RANGES}
                      placeholder="Select income range"
                    />

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => nav(-1)} className="flex items-center gap-1 rounded-xl border border-gray-200 px-4 py-3 text-[13px] font-semibold text-slate-600 hover:bg-gray-50 transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => nav(1)}
                        className="flex-1 rounded-xl bg-blue-700 py-3 text-[14px] font-semibold text-white hover:bg-blue-800 transition-colors flex items-center justify-center gap-2"
                      >
                        Continue <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}

                {/* ── Step 3 — Family & Preferences ─────── */}
                {step === 3 && (
                  <>
                    <div>
                      <h2 className="text-[20px] font-bold text-slate-900">Family &amp; preferences</h2>
                      <p className="text-[13px] text-slate-500 mt-1">Last step — what matters most to you.</p>
                    </div>

                    {/* Family type */}
                    <div>
                      <FieldLabel label="Family type" />
                      <div className="grid grid-cols-2 gap-2">
                        {(["joint", "nuclear"] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setFamilyType(t)}
                            className={cn(
                              "rounded-xl border py-3 text-[13px] font-semibold capitalize transition-all",
                              familyType === t
                                ? "border-blue-700 bg-blue-50 text-blue-700"
                                : "border-gray-200 bg-white text-slate-600 hover:border-gray-300"
                            )}
                          >
                            {t === "joint" ? "Joint family" : "Nuclear family"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Siblings */}
                    <div>
                      <FieldLabel label="Siblings" />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] text-slate-500 mb-1">Brothers</p>
                          <input
                            type="number" min={0} max={10}
                            value={brothers}
                            onChange={e => setBrothers(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500 mb-1">Sisters</p>
                          <input
                            type="number" min={0} max={10}
                            value={sisters}
                            onChange={e => setSisters(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <SelectField
                      label="Family annual income"
                      value={familyIncomeRange}
                      onChange={setFamilyIncomeRange}
                      options={FAMILY_INCOME_RANGES}
                      placeholder="Select family income"
                    />

                    {/* Partner age range */}
                    <div>
                      <FieldLabel label="Preferred partner age range" />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] text-slate-500 mb-1">Minimum age</p>
                          <input
                            type="number" min={18} max={60} placeholder="e.g. 24"
                            value={partnerAgeMin}
                            onChange={e => setPartnerAgeMin(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500 mb-1">Maximum age</p>
                          <input
                            type="number" min={18} max={60} placeholder="e.g. 32"
                            value={partnerAgeMax}
                            onChange={e => setPartnerAgeMax(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Expectations */}
                    <div>
                      <FieldLabel label="About the partner you're looking for" hint="Optional — shown on your biodata card" />
                      <textarea
                        rows={3}
                        placeholder="e.g. Looking for a kind, family-oriented person. Open to relocation. Values education and career."
                        value={partnerExpectations}
                        onChange={e => setPartnerExpectations(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                      />
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        <p className="text-[13px] text-red-700">{error}</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => nav(-1)} className="flex items-center gap-1 rounded-xl border border-gray-200 px-4 py-3 text-[13px] font-semibold text-slate-600 hover:bg-gray-50 transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 rounded-xl bg-blue-700 py-3 text-[14px] font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                      >
                        {saving
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                          : <>Complete biodata <Sparkles className="h-4 w-4" /></>
                        }
                      </motion.button>
                    </div>
                  </>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Skip link */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => router.push("/biodata")}
            className="text-[12px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 mx-auto"
          >
            Skip setup — go to my biodata
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

      </div>
    </div>
  )
}
