CREATE INDEX IF NOT EXISTS idx_village_centroids_lat_lng
  ON public.village_centroids (latitude, longitude);
