-- Device push tokens for Expo push notifications
create table if not exists device_push_tokens (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid references auth.users(id) on delete cascade,
    expo_push_token text not null,
    platform        text check (platform in ('ios', 'android', 'web')) default 'ios',
    app_version     text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- One token per device (upsert on token)
create unique index if not exists device_push_tokens_token_idx on device_push_tokens(expo_push_token);
create index if not exists device_push_tokens_user_idx on device_push_tokens(user_id);

-- RLS: only service role can read/write
alter table device_push_tokens enable row level security;

create policy "service role only" on device_push_tokens
    using (false)
    with check (false);

-- Seed mobile app version config into admin_settings
insert into admin_settings (key, value) values
    ('mobile_min_version',     '"1.0.0"'),
    ('mobile_latest_version',  '"1.0.0"'),
    ('mobile_force_update',    'false'),
    ('mobile_update_message',  '"A new version of CheapestGo is available. Please update to continue."')
on conflict (key) do nothing;
