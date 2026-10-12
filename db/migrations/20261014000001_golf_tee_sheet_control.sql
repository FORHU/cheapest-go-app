-- migrate:up
-- Tee-sheet control for the course portal (CONTEXT.md, "Course Staff", "Block"): a course closes
-- days or times itself, and every change it makes is recorded. A block is a date or date range
-- with optional weekdays and an optional first and last tee time, all on the course's own clock.

CREATE TABLE IF NOT EXISTS public.golf_course_blocks (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id  uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    starts_on  date NOT NULL,
    ends_on    date NOT NULL,
    -- 0 = Sunday … 6 = Saturday; NULL means every day in the range.
    weekdays   smallint[],
    -- First and last tee time to close, inclusive; both NULL means the whole day.
    from_time  time,
    to_time    time,
    note       text NOT NULL DEFAULT '',
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_course_blocks_range_check CHECK (ends_on >= starts_on AND ends_on - starts_on <= 366),
    CONSTRAINT golf_course_blocks_window_check CHECK (
        (from_time IS NULL AND to_time IS NULL) OR (from_time IS NOT NULL AND to_time IS NOT NULL AND to_time >= from_time)),
    CONSTRAINT golf_course_blocks_weekdays_check CHECK (
        weekdays IS NULL OR (cardinality(weekdays) > 0 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[])),
    CONSTRAINT golf_course_blocks_note_check CHECK (char_length(note) <= 300)
);
CREATE INDEX IF NOT EXISTS idx_golf_course_blocks_course ON public.golf_course_blocks (course_id, starts_on);

-- Which block closed this tee time, so removing the block reopens exactly these. A tee time
-- closed because its schedule was deleted has no block and never reopens.
ALTER TABLE public.golf_tee_times
    ADD COLUMN IF NOT EXISTS closed_by_block_id uuid REFERENCES public.golf_course_blocks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_golf_tee_times_block ON public.golf_tee_times (closed_by_block_id)
    WHERE closed_by_block_id IS NOT NULL;

-- What a course (or the team) changed on its tee sheet, newest first.
CREATE TABLE IF NOT EXISTS public.golf_course_changes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id  uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    user_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
    kind       text NOT NULL,
    summary    text NOT NULL,
    details    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_golf_course_changes_course ON public.golf_course_changes (course_id, created_at DESC);

-- migrate:down
DROP TABLE IF EXISTS public.golf_course_changes;
DROP INDEX IF EXISTS public.idx_golf_tee_times_block;
ALTER TABLE public.golf_tee_times DROP COLUMN IF EXISTS closed_by_block_id;
DROP TABLE IF EXISTS public.golf_course_blocks;
