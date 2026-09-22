-- Widen configurable alert radius to 1–1000 km.
-- Soft outer guard stays at max_km <= 1000 on alert_radius_bounds.

UPDATE public.alert_radius_bounds
SET
  min_km = 1,
  max_km = 1000,
  updated_at = now()
WHERE id = 1;

-- Clamp any out-of-window profile values (should be none if previous was 10–200).
UPDATE public.profiles p
SET notification_radius_km = GREATEST(
  (SELECT min_km FROM public.alert_radius_bounds WHERE id = 1),
  LEAST(
    p.notification_radius_km,
    (SELECT max_km FROM public.alert_radius_bounds WHERE id = 1)
  )
);
