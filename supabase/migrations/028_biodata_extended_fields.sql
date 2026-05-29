-- Migration 028: Extended biodata fields for matrimony
-- Adds essential fields for comprehensive Indian biodata without payment/kundli features
-- Focus: Free tier with complete biodata information

-- Physical & Personal Details
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS height_cm INTEGER,
  ADD COLUMN IF NOT EXISTS weight_kg INTEGER,
  ADD COLUMN IF NOT EXISTS complexion TEXT CHECK (complexion IN ('fair', 'wheatish', 'dusky', 'dark')),
  ADD COLUMN IF NOT EXISTS blood_group TEXT CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  ADD COLUMN IF NOT EXISTS disability TEXT,
  ADD COLUMN IF NOT EXISTS marital_status TEXT DEFAULT 'never_married' CHECK (marital_status IN ('never_married', 'divorced', 'widowed', 'separated'));

COMMENT ON COLUMN family_members.height_cm IS 'Height in centimeters for biodata display';
COMMENT ON COLUMN family_members.weight_kg IS 'Weight in kilograms';
COMMENT ON COLUMN family_members.complexion IS 'Skin complexion - common in Indian biodata';
COMMENT ON COLUMN family_members.blood_group IS 'Blood group for medical compatibility';
COMMENT ON COLUMN family_members.disability IS 'Any physical disability - full disclosure for matrimony';
COMMENT ON COLUMN family_members.marital_status IS 'Marital status - critical for matrimony eligibility';

-- Astrological (Basic - no API integration needed)
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS time_of_birth TIME,
  ADD COLUMN IF NOT EXISTS place_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS manglik BOOLEAN,
  ADD COLUMN IF NOT EXISTS rashi TEXT,
  ADD COLUMN IF NOT EXISTS nakshatra TEXT;

COMMENT ON COLUMN family_members.time_of_birth IS 'Birth time for kundli - user can enter manually';
COMMENT ON COLUMN family_members.place_of_birth IS 'Birth place for kundli - user can enter manually';
COMMENT ON COLUMN family_members.manglik IS 'Manglik dosha status - user can enter from their kundli';
COMMENT ON COLUMN family_members.rashi IS 'Zodiac sign (Indian astrology) - user can enter manually';
COMMENT ON COLUMN family_members.nakshatra IS 'Birth star - user can enter manually';

-- Education & Career (Extended)
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS education_level TEXT CHECK (education_level IN ('below_10th', '10th_pass', '12th_pass', 'diploma', 'graduate', 'post_graduate', 'doctorate')),
  ADD COLUMN IF NOT EXISTS education_field TEXT,
  ADD COLUMN IF NOT EXISTS occupation_category TEXT CHECK (occupation_category IN ('government', 'private', 'business', 'professional', 'student', 'homemaker', 'retired', 'not_working')),
  ADD COLUMN IF NOT EXISTS annual_income_range TEXT CHECK (annual_income_range IN ('below_2lakh', '2_to_5lakh', '5_to_10lakh', '10_to_15lakh', '15_to_25lakh', '25_to_50lakh', '50lakh_plus'));

COMMENT ON COLUMN family_members.education_level IS 'Highest education level achieved';
COMMENT ON COLUMN family_members.education_field IS 'Field of study (e.g., Engineering, Medicine, Commerce)';
COMMENT ON COLUMN family_members.occupation_category IS 'Employment category';
COMMENT ON COLUMN family_members.annual_income_range IS 'Annual income bracket - optional but common in biodata';

-- Family Details (Extended)
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS father_occupation TEXT,
  ADD COLUMN IF NOT EXISTS mother_occupation TEXT,
  ADD COLUMN IF NOT EXISTS family_income_range TEXT CHECK (family_income_range IN ('below_5lakh', '5_to_10lakh', '10_to_20lakh', '20_to_50lakh', '50lakh_plus')),
  ADD COLUMN IF NOT EXISTS family_type TEXT DEFAULT 'joint' CHECK (family_type IN ('joint', 'nuclear')),
  ADD COLUMN IF NOT EXISTS number_of_brothers INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS number_of_sisters INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brothers_married INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sisters_married INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ancestral_property TEXT;

COMMENT ON COLUMN family_members.father_occupation IS 'Father''s occupation for biodata';
COMMENT ON COLUMN family_members.mother_occupation IS 'Mother''s occupation for biodata';
COMMENT ON COLUMN family_members.family_income_range IS 'Combined family income range';
COMMENT ON COLUMN family_members.family_type IS 'Joint family or nuclear family';
COMMENT ON COLUMN family_members.number_of_brothers IS 'Total number of brothers';
COMMENT ON COLUMN family_members.number_of_sisters IS 'Total number of sisters';
COMMENT ON COLUMN family_members.brothers_married IS 'Number of brothers married';
COMMENT ON COLUMN family_members.sisters_married IS 'Number of sisters married';
COMMENT ON COLUMN family_members.ancestral_property IS 'Details about ancestral property - optional but often asked';

-- Partner Expectations (Free text for now)
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS partner_expectations TEXT,
  ADD COLUMN IF NOT EXISTS preferred_locations TEXT[], -- Array of cities/countries
  ADD COLUMN IF NOT EXISTS preferred_age_min INTEGER,
  ADD COLUMN IF NOT EXISTS preferred_age_max INTEGER,
  ADD COLUMN IF NOT EXISTS preferred_height_min_cm INTEGER,
  ADD COLUMN IF NOT EXISTS preferred_height_max_cm INTEGER;

COMMENT ON COLUMN family_members.partner_expectations IS 'Free text partner expectations for biodata';
COMMENT ON COLUMN family_members.preferred_locations IS 'Preferred cities/countries for relocation';
COMMENT ON COLUMN family_members.preferred_age_min IS 'Minimum preferred partner age';
COMMENT ON COLUMN family_members.preferred_age_max IS 'Maximum preferred partner age';
COMMENT ON COLUMN family_members.preferred_height_min_cm IS 'Minimum preferred partner height in cm';
COMMENT ON COLUMN family_members.preferred_height_max_cm IS 'Maximum preferred partner height in cm';

-- Residency & Relocation
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS residency_status TEXT DEFAULT 'indian_citizen' CHECK (residency_status IN ('indian_citizen', 'nri', 'green_card', 'work_visa', 'citizen_other', 'student_visa')),
  ADD COLUMN IF NOT EXISTS current_country TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS willing_to_relocate BOOLEAN DEFAULT true;

COMMENT ON COLUMN family_members.residency_status IS 'Current residency/citizenship status';
COMMENT ON COLUMN family_members.current_country IS 'Country currently residing in';
COMMENT ON COLUMN family_members.willing_to_relocate IS 'Open to relocating for marriage';

-- Biodata Photo (separate from profile photo)
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS biodata_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS full_length_photo_url TEXT;

COMMENT ON COLUMN family_members.biodata_photo_url IS 'Professional passport-style photo for biodata';
COMMENT ON COLUMN family_members.full_length_photo_url IS 'Full-length photo for biodata (optional)';

-- Biodata Analytics (track engagement - no payment needed)
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS biodata_views_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS biodata_pdf_downloads INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS biodata_whatsapp_shares INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS biodata_last_updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN family_members.biodata_views_count IS 'Number of times biodata was viewed';
COMMENT ON COLUMN family_members.biodata_pdf_downloads IS 'Number of PDF downloads';
COMMENT ON COLUMN family_members.biodata_whatsapp_shares IS 'Number of WhatsApp shares';
COMMENT ON COLUMN family_members.biodata_last_updated_at IS 'Last time biodata was generated/updated';

-- Indexes for biodata search (when we add search feature)
CREATE INDEX IF NOT EXISTS idx_fm_biodata_search 
  ON family_members(is_biodata_visible, gender, birth_year, religion, caste, gotra)
  WHERE is_biodata_visible = true AND is_alive = true;

CREATE INDEX IF NOT EXISTS idx_fm_biodata_location
  ON family_members(current_country, current_place)
  WHERE is_biodata_visible = true;

CREATE INDEX IF NOT EXISTS idx_fm_biodata_education
  ON family_members(education_level)
  WHERE is_biodata_visible = true;

-- RLS: Same permissions as other family_members fields
-- (Already covered by existing RLS policies - users can update their own or admin can update any)

-- Note: No payment/kundli API integration in this migration
-- Users can enter kundli details manually if they have them
-- Future migrations can add paid features like automated kundli generation
