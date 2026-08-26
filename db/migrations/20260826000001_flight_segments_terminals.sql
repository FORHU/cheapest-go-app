-- migrate:up
-- flight_segments: capture the departure/arrival terminal per segment so
-- confirmation/itinerary emails can show it. Both Duffel and Mystifly return
-- terminal per-segment; neither was persisted before this.
ALTER TABLE public.flight_segments
    ADD COLUMN IF NOT EXISTS origin_terminal text,
    ADD COLUMN IF NOT EXISTS destination_terminal text;

-- migrate:down
ALTER TABLE public.flight_segments
    DROP COLUMN IF EXISTS origin_terminal,
    DROP COLUMN IF EXISTS destination_terminal;
