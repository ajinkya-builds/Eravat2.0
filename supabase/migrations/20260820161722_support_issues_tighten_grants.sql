-- Default privileges grant ALL to anon/authenticated on new public tables.
-- Narrow support_issues to insert-only for anon and no DELETE.

REVOKE ALL ON public.support_issues FROM anon;
REVOKE ALL ON public.support_issues FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_issues TO authenticated;
GRANT INSERT ON public.support_issues TO anon;
