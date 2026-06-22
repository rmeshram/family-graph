-- ══════════════════════════════════════════════════════════════════════════════
-- SEED: Matrimony UI Test Data
-- 12 biodata profiles across 3 families + inbox test cases (likes + requests)
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query → paste → Run
--
-- INBOX TEST CASES (Part 4):
--   Replace YOUR_NODE_ID with your own family_members.id before running.
--   Find yours: SELECT id, name FROM family_members WHERE claimed_by_user_id = auth.uid();
-- ══════════════════════════════════════════════════════════════════════════════

-- ── safe to re-run: delete old seed data first ───────────────────────────────
DELETE FROM matrimony_interests
  WHERE from_node_id IN (
    SELECT id FROM family_members
    WHERE family_id IN (
      'bbbb0000-0000-0000-0000-000000000001',
      'cccc0000-0000-0000-0000-000000000001',
      'dddd0000-0000-0000-0000-000000000001'
    )
  );

DELETE FROM family_members
  WHERE family_id IN (
    'bbbb0000-0000-0000-0000-000000000001',
    'cccc0000-0000-0000-0000-000000000001',
    'dddd0000-0000-0000-0000-000000000001'
  );

DELETE FROM families
  WHERE id IN (
    'bbbb0000-0000-0000-0000-000000000001',
    'cccc0000-0000-0000-0000-000000000001',
    'dddd0000-0000-0000-0000-000000000001'
  );

DELETE FROM auth.users
  WHERE id IN (
    'seed0001-0000-0000-0000-000000000001',
    'seed0002-0000-0000-0000-000000000002',
    'seed0003-0000-0000-0000-000000000003',
    'seed0004-0000-0000-0000-000000000004',
    'seed0005-0000-0000-0000-000000000005'
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 1: Fake auth users (for inbox sender FKs in matrimony_interests)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  aud, role, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES
  ('seed0001-0000-0000-0000-000000000001', 'priya.test@outverse.in',
   crypt('Outverse@123', gen_salt('bf')), now(),
   'authenticated', 'authenticated', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),

  ('seed0002-0000-0000-0000-000000000002', 'arjun.test@outverse.in',
   crypt('Outverse@123', gen_salt('bf')), now(),
   'authenticated', 'authenticated', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),

  ('seed0003-0000-0000-0000-000000000003', 'kavya.test@outverse.in',
   crypt('Outverse@123', gen_salt('bf')), now(),
   'authenticated', 'authenticated', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),

  ('seed0004-0000-0000-0000-000000000004', 'vikram.test@outverse.in',
   crypt('Outverse@123', gen_salt('bf')), now(),
   'authenticated', 'authenticated', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),

  ('seed0005-0000-0000-0000-000000000005', 'neha.test@outverse.in',
   crypt('Outverse@123', gen_salt('bf')), now(),
   'authenticated', 'authenticated', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 2: Test families (3 families, all different from your family)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO families (id, name, invite_code, created_at, updated_at) VALUES
  ('bbbb0000-0000-0000-0000-000000000001', 'Sharma Khandaan',   'SEED-SHARMA-B1',  now(), now()),
  ('cccc0000-0000-0000-0000-000000000001', 'Patel Parivar',     'SEED-PATEL-C1',   now(), now()),
  ('dddd0000-0000-0000-0000-000000000001', 'Kapoor Parivaar',   'SEED-KAPOOR-D1',  now(), now());


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 3: 12 biodata profiles  (6 female · 6 male · mix of gotras + NRI)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO family_members (
  id, family_id, name, gender, birth_year, is_alive,
  gotra, religion, caste, occupation, current_place, current_country,
  -- biodata fields (migration 028)
  height_cm, marital_status, blood_group,
  education_level, education_field,
  occupation_category, annual_income_range,
  family_type, number_of_brothers, number_of_sisters,
  family_income_range, partner_expectations,
  residency_status, willing_to_relocate,
  manglik, biodata_photo_url,
  is_biodata_visible, biodata_last_updated_at,
  -- claim (so inbox FK works)
  is_claimed, claimed_by_user_id, claim_status,
  added_at, updated_at
) VALUES

-- ── FEMALE PROFILES ──────────────────────────────────────────────────────────

-- 1. Priya Sharma · Software Engineer · Bangalore
(
  'fm-seed01-0000-0000-0000-000000000001',
  'bbbb0000-0000-0000-0000-000000000001',
  'Priya Sharma', 'female', 1998, true,
  'Kashyap', 'Hindu', 'Brahmin', 'Senior Software Engineer', 'Bangalore', 'India',
  163, 'never_married', 'B+',
  'post_graduate', 'Computer Science',
  'private', '10_to_15lakh',
  'nuclear', 1, 0,
  '10_to_20lakh', 'Looking for a well-educated, family-oriented partner. Love books and travel.',
  'indian_citizen', true,
  false, null,
  true, now(),
  true, 'seed0001-0000-0000-0000-000000000001', 'claimed',
  now(), now()
),

-- 2. Anjali Reddy · Doctor · Hyderabad
(
  'fm-seed02-0000-0000-0000-000000000002',
  'bbbb0000-0000-0000-0000-000000000001',
  'Anjali Reddy', 'female', 1996, true,
  'Gowda', 'Hindu', 'Reddy', 'MBBS Doctor', 'Hyderabad', 'India',
  158, 'never_married', 'O+',
  'post_graduate', 'Medicine',
  'private', '15_to_25lakh',
  'joint', 0, 1,
  '20_to_50lakh', 'Prefer someone in a stable profession. Open to living in any metro city.',
  'indian_citizen', true,
  null, null,
  true, now(),
  false, null, 'unclaimed',
  now(), now()
),

-- 3. Kavya Nair · Marketing Manager · Mumbai
(
  'fm-seed03-0000-0000-0000-000000000003',
  'cccc0000-0000-0000-0000-000000000001',
  'Kavya Nair', 'female', 1999, true,
  null, 'Christian', 'Syrian Christian', 'Marketing Manager', 'Mumbai', 'India',
  161, 'never_married', 'A+',
  'post_graduate', 'Business Administration',
  'private', '10_to_15lakh',
  'nuclear', 1, 1,
  '10_to_20lakh', 'Looking for someone kind, ambitious and family-loving.',
  'indian_citizen', true,
  null, null,
  true, now(),
  true, 'seed0003-0000-0000-0000-000000000003', 'claimed',
  now(), now()
),

-- 4. Meera Patel · CA · Ahmedabad
(
  'fm-seed04-0000-0000-0000-000000000004',
  'cccc0000-0000-0000-0000-000000000001',
  'Meera Patel', 'female', 1997, true,
  'Audich', 'Hindu', 'Audich Brahmin', 'Chartered Accountant', 'Ahmedabad', 'India',
  155, 'never_married', 'AB+',
  'post_graduate', 'Commerce & Finance',
  'private', '10_to_15lakh',
  'joint', 2, 1,
  '20_to_50lakh', 'Hoping to find a grounded, value-driven partner from a good family.',
  'indian_citizen', false,
  false, null,
  true, now(),
  false, null, 'unclaimed',
  now(), now()
),

-- 5. Neha Singh · Data Scientist · USA (NRI)
(
  'fm-seed05-0000-0000-0000-000000000005',
  'dddd0000-0000-0000-0000-000000000001',
  'Neha Singh', 'female', 2000, true,
  'Kaushik', 'Hindu', 'Rajput', 'Data Scientist', 'New Jersey', 'USA',
  166, 'never_married', 'B-',
  'post_graduate', 'Data Science & Statistics',
  'private', '25_to_50lakh',
  'nuclear', 1, 0,
  '20_to_50lakh', 'NRI looking to settle down. Open to India or abroad. Family values are important.',
  'nri', true,
  null, null,
  true, now(),
  true, 'seed0005-0000-0000-0000-000000000005', 'claimed',
  now(), now()
),

-- 6. Shreya Kapoor · Architect · Delhi
(
  'fm-seed06-0000-0000-0000-000000000006',
  'dddd0000-0000-0000-0000-000000000001',
  'Shreya Kapoor', 'female', 1995, true,
  'Vashisht', 'Hindu', 'Punjabi Khatri', 'Architect', 'Delhi', 'India',
  168, 'never_married', 'O-',
  'post_graduate', 'Architecture',
  'private', '10_to_15lakh',
  'joint', 0, 1,
  '20_to_50lakh', 'Creative, independent. Looking for someone emotionally mature and supportive.',
  'indian_citizen', true,
  false, null,
  true, now(),
  false, null, 'unclaimed',
  now(), now()
),

-- ── MALE PROFILES ─────────────────────────────────────────────────────────────

-- 7. Arjun Sharma · IIT Engineer · Bangalore
(
  'fm-seed07-0000-0000-0000-000000000007',
  'bbbb0000-0000-0000-0000-000000000001',
  'Arjun Sharma', 'male', 1994, true,
  'Bharadwaj', 'Hindu', 'Brahmin', 'Senior Engineer (Google)', 'Bangalore', 'India',
  178, 'never_married', 'A+',
  'post_graduate', 'Computer Science (IIT)',
  'private', '25_to_50lakh',
  'nuclear', 1, 1,
  '20_to_50lakh', 'IIT grad, loves trekking and cooking. Looking for an educated, independent partner.',
  'indian_citizen', true,
  false, null,
  true, now(),
  true, 'seed0002-0000-0000-0000-000000000002', 'claimed',
  now(), now()
),

-- 8. Rahul Patel · CA · Ahmedabad
(
  'fm-seed08-0000-0000-0000-000000000008',
  'cccc0000-0000-0000-0000-000000000001',
  'Rahul Patel', 'male', 1993, true,
  'Audich', 'Hindu', 'Audich Brahmin', 'Chartered Accountant', 'Ahmedabad', 'India',
  172, 'never_married', 'B+',
  'post_graduate', 'Commerce & Law',
  'private', '15_to_25lakh',
  'joint', 1, 2,
  '20_to_50lakh', 'Family-oriented, settled career. Want a life partner who values traditions.',
  'indian_citizen', false,
  null, null,
  true, now(),
  false, null, 'unclaimed',
  now(), now()
),

-- 9. Kiran Kumar · Doctor · Hyderabad
(
  'fm-seed09-0000-0000-0000-000000000009',
  'cccc0000-0000-0000-0000-000000000001',
  'Kiran Kumar', 'male', 1995, true,
  'Lingayat', 'Hindu', 'Lingayat', 'MD Doctor', 'Hyderabad', 'India',
  175, 'never_married', 'O+',
  'post_graduate', 'Medicine (MD)',
  'private', '15_to_25lakh',
  'joint', 0, 1,
  '10_to_20lakh', 'Calm, caring. Prefer someone understanding of a doctor''s schedule.',
  'indian_citizen', true,
  false, null,
  true, now(),
  false, null, 'unclaimed',
  now(), now()
),

-- 10. Vikram Kapoor · Entrepreneur · Delhi
(
  'fm-seed10-0000-0000-0000-000000000010',
  'dddd0000-0000-0000-0000-000000000001',
  'Vikram Kapoor', 'male', 1991, true,
  'Parashar', 'Hindu', 'Punjabi Khatri', 'Startup Founder', 'Delhi', 'India',
  182, 'never_married', 'A-',
  'post_graduate', 'Business (IIM)',
  'business', '50lakh_plus',
  'nuclear', 1, 1,
  '50lakh_plus', 'Entrepreneur, passionate about building things. Seeking a driven, ambitious partner.',
  'indian_citizen', true,
  false, null,
  true, now(),
  true, 'seed0004-0000-0000-0000-000000000004', 'claimed',
  now(), now()
),

-- 11. Dev Malhotra · Software Architect · UK (NRI)
(
  'fm-seed11-0000-0000-0000-000000000011',
  'dddd0000-0000-0000-0000-000000000001',
  'Dev Malhotra', 'male', 1992, true,
  'Atri', 'Hindu', 'Punjabi Brahmin', 'Principal Engineer', 'London', 'UK',
  180, 'never_married', 'B+',
  'post_graduate', 'Computer Science',
  'private', '50lakh_plus',
  'nuclear', 1, 0,
  '50lakh_plus', 'Based in UK, visit India twice a year. Open to settling in India or UK.',
  'nri', true,
  false, null,
  true, now(),
  false, null, 'unclaimed',
  now(), now()
),

-- 12. Rohan Joshi · IAS Officer · Pune
(
  'fm-seed12-0000-0000-0000-000000000012',
  'bbbb0000-0000-0000-0000-000000000001',
  'Rohan Joshi', 'male', 1993, true,
  'Sandilya', 'Hindu', 'Maharashtrian Brahmin', 'IAS Officer', 'Pune', 'India',
  174, 'never_married', 'AB-',
  'post_graduate', 'Public Administration (UPSC)',
  'government', '10_to_15lakh',
  'joint', 0, 2,
  '10_to_20lakh', 'IAS officer, simple living. Looking for an understanding, grounded partner.',
  'indian_citizen', false,
  false, null,
  true, now(),
  false, null, 'unclaimed',
  now(), now()
);


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 4: Inbox test data — likes & connect_requests aimed at YOUR profile
--
-- ▶ BEFORE RUNNING THIS SECTION:
--   1. Find your node ID:
--      SELECT id, name FROM family_members WHERE claimed_by_user_id = auth.uid();
--   2. Replace every occurrence of 'YOUR_NODE_ID_HERE' below with that UUID.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  my_node  UUID := 'YOUR_NODE_ID_HERE';  -- ← REPLACE THIS
BEGIN
  -- abort if placeholder not replaced
  IF my_node = 'YOUR_NODE_ID_HERE'::uuid THEN
    RAISE EXCEPTION 'Replace YOUR_NODE_ID_HERE with your actual family_members.id before running Part 4.';
  END IF;

  -- delete previous test interests for this node (safe re-run)
  DELETE FROM matrimony_interests WHERE to_node_id = my_node
    AND from_node_id IN (
      'fm-seed01-0000-0000-0000-000000000001',
      'fm-seed03-0000-0000-0000-000000000003',
      'fm-seed07-0000-0000-0000-000000000007',
      'fm-seed10-0000-0000-0000-000000000010',
      'fm-seed05-0000-0000-0000-000000000005'
    );

  INSERT INTO matrimony_interests
    (from_user_id, from_node_id, to_node_id, action, message, status, created_at)
  VALUES

  -- LIKE 1: Priya liked you (no message, pending)
  ('seed0001-0000-0000-0000-000000000001',
   'fm-seed01-0000-0000-0000-000000000001',
   my_node, 'like', null, 'pending', now() - interval '2 days'),

  -- LIKE 2 (Mutual): Kavya liked you AND you'll like her back in Part 5
  ('seed0003-0000-0000-0000-000000000003',
   'fm-seed03-0000-0000-0000-000000000003',
   my_node, 'like', null, 'pending', now() - interval '1 day'),

  -- CONNECT REQUEST 1: Arjun sent you an introduction (pending)
  ('seed0002-0000-0000-0000-000000000002',
   'fm-seed07-0000-0000-0000-000000000007',
   my_node, 'connect_request',
   'Hi! I came across your profile on Outverse and would love to connect. I''m a software engineer in Bangalore, family-oriented and love trekking. Would be great to know more about you.',
   'pending', now() - interval '3 hours'),

  -- CONNECT REQUEST 2: Vikram sent request (already accepted — shows accepted state)
  ('seed0004-0000-0000-0000-000000000004',
   'fm-seed10-0000-0000-0000-000000000010',
   my_node, 'connect_request',
   'Hello! Vikram here from Delhi. Running a startup and always looking to connect with like-minded people. Your profile stood out — would love to have a chat.',
   'accepted', now() - interval '1 week'),

  -- CONNECT REQUEST 3: Neha sent request (declined — shows declined state)
  ('seed0005-0000-0000-0000-000000000005',
   'fm-seed05-0000-0000-0000-000000000005',
   my_node, 'connect_request',
   'Hi, I''m Neha — NRI based in New Jersey. Your profile seemed really genuine. Happy to connect if there''s mutual interest.',
   'declined', now() - interval '5 days');

  RAISE NOTICE 'Inbox test data inserted successfully for node: %', my_node;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 5: Mutual like — YOU liked Kavya back (creates a mutual match)
-- Run this after Part 4. Also replace YOUR_NODE_ID_HERE and YOUR_USER_ID_HERE.
-- YOUR_USER_ID_HERE = SELECT id FROM auth.users WHERE email = '<your login email>';
-- ══════════════════════════════════════════════════════════════════════════════

-- INSERT INTO matrimony_interests
--   (from_user_id, from_node_id, to_node_id, action, status)
-- VALUES
--   ('YOUR_USER_ID_HERE',
--    'YOUR_NODE_ID_HERE',
--    'fm-seed03-0000-0000-0000-000000000003',
--    'like', 'pending');


-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFY: Check everything was created
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
  fm.name,
  fm.gender,
  2026 - fm.birth_year AS age,
  fm.gotra,
  fm.occupation,
  fm.current_place,
  fm.current_country,
  f.name AS family,
  fm.residency_status,
  CASE WHEN fm.is_biodata_visible THEN '✓' ELSE '✗' END AS biodata_visible
FROM family_members fm
JOIN families f ON f.id = fm.family_id
WHERE fm.family_id IN (
  'bbbb0000-0000-0000-0000-000000000001',
  'cccc0000-0000-0000-0000-000000000001',
  'dddd0000-0000-0000-0000-000000000001'
)
ORDER BY fm.gender, fm.birth_year DESC;
