-- Add INSERT policy for flight_results_cache
-- Since search_flights is called from the server, but using the user's session 
-- (or lack thereof), we need to allow inserts.

CREATE POLICY "Anyone can insert search results"
    ON public.flight_results_cache FOR INSERT
    WITH CHECK (true);
