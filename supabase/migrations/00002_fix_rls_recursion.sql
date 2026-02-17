-- ============================================================================
-- Fix: current_tenant_id() recursive RLS call
--
-- Problem: current_tenant_id() reads profiles table → profiles has RLS →
-- RLS calls current_tenant_id() → infinite recursion.
--
-- Fix: SECURITY DEFINER makes the function run as the DB owner (postgres),
-- bypassing RLS when reading the profiles table internally.
-- SET search_path = public prevents search_path hijacking.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;
