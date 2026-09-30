-- migrate:up
-- Golf courses CheapestGo can arrange play at (CONTEXT.md, "Golf Course"). Curated by the
-- team in the admin; there is no supplier behind this table. `green_fee_from` is an
-- indicative "from" price for the listing, never a quote.
CREATE TABLE IF NOT EXISTS public.golf_courses (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text NOT NULL,
    name            text NOT NULL,
    country         text NOT NULL,
    city            text NOT NULL,
    address         text,
    description     text NOT NULL DEFAULT '',
    holes           integer NOT NULL,
    par             integer,
    green_fee_from  numeric(10,2),
    currency        char(3) NOT NULL DEFAULT 'USD',
    image_urls      text[] NOT NULL DEFAULT '{}',
    amenities       text[] NOT NULL DEFAULT '{}',
    -- Open vocabulary (CONTEXT.md, "Enum field"): a CHECK swap is cheaper than a native enum.
    status          text NOT NULL DEFAULT 'draft',
    created_at      timestamp with time zone NOT NULL DEFAULT now(),
    updated_at      timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_courses_slug_key UNIQUE (slug),
    CONSTRAINT golf_courses_slug_format_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT golf_courses_holes_check CHECK (holes IN (9, 18, 27, 36)),
    CONSTRAINT golf_courses_par_check CHECK (par IS NULL OR par BETWEEN 27 AND 144),
    CONSTRAINT golf_courses_green_fee_check CHECK (green_fee_from IS NULL OR green_fee_from >= 0),
    CONSTRAINT golf_courses_status_check CHECK (status IN ('draft', 'published'))
);

CREATE INDEX IF NOT EXISTS idx_golf_courses_status_country
    ON public.golf_courses (status, country);

-- migrate:down
DROP TABLE IF EXISTS public.golf_courses;
