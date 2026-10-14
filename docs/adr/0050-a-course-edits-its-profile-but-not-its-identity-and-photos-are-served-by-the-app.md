# A course edits its profile but not its identity, and its photos are served by the app

Course staff can change how their course is described and what it promises customers from
`/course/profile`: description, photos, amenities, address, facts (par, yardage, year opened,
designer, grass), weather rule, free-cancellation hours and booking window. They cannot change the
course's name, country, city, slug, holes, currency, time zone, *green fee from* or published
status. This records why the line is there and how photos are kept, because both are easy to get
wrong.

**The line is between description and identity.** A description is the course speaking about
itself, and nobody is better placed to. Identity is what the rest of the system keys on: the slug
is in every shared link (ADR-0047's pages and emails), the name and currency are copied into
bookings, emails and search, and the time zone is the clock every tee time was generated on
(`TimezoneLockedError`). Changing any of those from the portal would ripple into bookings already
made. The published status stays with the team for the same reason as before (ADR-0048): a course
must not be able to put itself on, or take itself off, the storefront. *Green fee from* is an
indicative figure that the course never sets anywhere else, so it stays with the team until it is
derived from schedule prices.

**The scope is enforced by the schema, not by the form.** The portal API takes
`courseProfileInputSchema`, a strict object of exactly the editable fields. A request that names a
slug or a time zone is a 400, not an ignored key, and the SQL that writes it (`writeProfile`) names
only those columns. Every field is required, so a missing key is never read as "clear it".

**Changes apply immediately and are recorded**, as for the tee sheet (ADR-0049): who changed
which fields, with the before and after, visible to the course and the team. The team can still
override in admin. There is no approval queue; the history and the override are the control.

**Policy changes look forward.** Weather rule and free-cancellation cutoff are already copied
onto each booking when it is held (`weather_policy`, `free_cancel_until`), so editing them never
rewrites what a customer agreed to. The form says so beside the field.

**Shortening the booking window shows its impact first** and deletes nothing, as ADR-0047 set out:
tee times beyond it stop being sold, bookings on them stay. The count comes from the same code
that applies the change, run in a transaction that is rolled back. Widening it generates the
extra days at once instead of waiting for the next daily run.

## Photos

A course can paste an `https://` link or upload a file. Uploads are JPEG, PNG or WebP, identified
by their bytes (never by what the browser called them), at most 5 MB, at most 30 held per course.
They are stored in the existing private bucket under `golf/<course>/` and served by the app at
`/golf-photos/<id>`, which is the path that goes into the course's image list.

**The bucket stays private.** ADR-0040 keeps the support-attachment bucket private because it holds
identity documents, and its access rule is that nothing is reached except through the app. A
public prefix in that bucket would mean loosening Block Public Access on the one bucket where that
matters most. Serving photos through a route costs the app process a read per first view, which at
golf volumes browsers' immutable caching makes negligible, and keeps one rule for the whole bucket.
The only infrastructure change is adding `golf/*` to the instance role's object permissions
(`s3:PutObject`, `GetObject`, `DeleteObject`).

**An upload is not public until the profile is saved with it.** The row is written when the file
is stored; the photo appears on the storefront only once its path is in the saved list. A saved
list may only name photos that belong to that course, so a course cannot claim another's file.
A photo taken out of the list is deleted at once; one uploaded and never used is swept on the next
save once it is over an hour old, so a second tab's upload in progress is not removed from under it.

## Considered options

- **A separate public bucket (or CDN) for photos.** Cleaner isolation and no app load, but it needs
  a bucket, policy and role provisioned before anything works anywhere. Reasonable later if photo
  traffic ever justifies it; the stored path in `image_urls` is the only thing that would change.
- **A public-read `golf/` prefix in the existing bucket.** Rejected: see above.
- **URL paste only.** Rejected: course staff rarely have a hosted, hot-linkable copy of their photos
  (the demo courses hotlink Wikimedia), and a link can disappear without anyone noticing.
- **Moderation before photos or text go live.** Deferred. The history and team override cover the
  risk today; a queue is worth building when there are enough courses for it to matter.
- **Image resizing on upload.** Deferred: the storefront already renders course images unoptimised,
  and the 5 MB ceiling bounds the cost of a large one.
- **Letting the course edit everything but status.** Rejected for the ripple reasons above.
