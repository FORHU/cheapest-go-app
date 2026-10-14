-- migrate:up
-- Photos a course uploads for its own page (CONTEXT.md, "Course Staff"; ADR-0050). The bytes live
-- in the private bucket under golf/; this row is how the app finds them and how it knows whose
-- they are. `golf_courses.image_urls` stays the one ordered list customers see: an uploaded photo
-- appears in it as /golf-photos/<id>, next to any https:// links.

CREATE TABLE IF NOT EXISTS public.golf_course_photos (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id    uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    -- Always golf/<course id>/<id>.<ext>; never sent to a browser.
    storage_key  text NOT NULL UNIQUE,
    content_type text NOT NULL,
    size_bytes   integer NOT NULL CHECK (size_bytes > 0),
    created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at   timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_course_photos_type_check CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp'))
);
CREATE INDEX IF NOT EXISTS idx_golf_course_photos_course ON public.golf_course_photos (course_id, created_at);

-- migrate:down
DROP TABLE IF EXISTS public.golf_course_photos;
