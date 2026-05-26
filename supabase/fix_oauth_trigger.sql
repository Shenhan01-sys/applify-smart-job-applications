-- ============================================
-- 1. LIHAT SEMUA TRIGGER DI auth.users
-- ============================================
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  proname AS function_name,
  tgtype,
  CASE 
    WHEN tgtype & 2 > 0 THEN 'BEFORE'
    WHEN tgtype & 64 > 0 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS timing,
  CASE 
    WHEN tgtype & 4 > 0 THEN 'INSERT'
    WHEN tgtype & 8 > 0 THEN 'DELETE'
    WHEN tgtype & 16 > 0 THEN 'UPDATE'
    ELSE 'UNKNOWN'
  END AS event
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'auth.users'::regclass
  AND NOT tgisinternal;

-- ============================================
-- 2. LIHAT SOURCE CODE FUNCTION TRIGGER
-- ============================================
-- Ganti nama_function dengan nama function yang muncul di query #1
-- Contoh: SELECT pg_get_functiondef('public.handle_new_user'::regproc);
-- Atau jalankan ini untuk lihat semua function di schema public:
SELECT 
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_source
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    SELECT proname 
    FROM pg_trigger t 
    JOIN pg_proc p ON t.tgfoid = p.oid 
    WHERE tgrelid = 'auth.users'::regclass
  );

-- ============================================
-- 3. CEK TABEL profiles ADA ATAU TIDAK
-- ============================================
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- ============================================
-- 4. CEK RLS (ROW LEVEL SECURITY) DI profiles
-- ============================================
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'profiles';

-- Cek RLS policies
SELECT 
  polname AS policy_name,
  polcmd AS command,
  polpermissive AS permissive,
  polroles::regtype[] AS roles,
  polqual::text AS using_expression,
  polwithcheck::text AS with_check_expression
FROM pg_policy
WHERE polrelid = 'public.profiles'::regclass;

-- ============================================
-- 5. SOLUSI: DROP TRIGGER YANG ERROR (JIKA PERLU)
-- ============================================
-- Uncomment baris di bawah ini kalau mau hapus trigger:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();

-- ============================================
-- 6. SOLUSI: BUAT TRIGGER BARU YANG BENAR
-- ============================================
-- Uncomment dan jalankan ini kalau mau buat ulang trigger:
/*
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, created_at)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NOW()
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error tapi jangan block auth
  RAISE LOG 'Error creating profile: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
*/

-- ============================================
-- 7. SOLUSI ALTERNATIF: DISABLE RLS SEMENTARA
-- ============================================
-- Kalau RLS yang ngeblock, uncomment ini:
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
