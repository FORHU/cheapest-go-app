# ADR-0040: A support attachment is private and is reached only through the app

## Status

Accepted

## Context

Support Chat was text only. The thing customers actually need to send is a picture: the
booking confirmation an airline disputes, the passport page a supplier has queried, a photo
of a room that was not what was sold. Without a way to attach one, the evidence a
conversation is about arrives by email — outside the transcript that Agents read and that a
chargeback is answered from.

The obvious implementations are both wrong for this data.

A **public bucket** — objects served straight from S3 or fronted by a CDN — makes every
attachment readable by anyone holding the URL, forever. URLs escape: into browser history,
into a screen share, into a support ticket pasted somewhere else. For avatars that is a
tolerable trade. These are passports and boarding passes.

A **stored presigned URL** is the same object with an expiry, which converts the problem
from "readable forever" into "a link in the transcript that silently stops working". A
customer reopening a month-old conversation would find their own evidence gone.

## Decision

The bucket is private. Nothing is ever served from it directly.

An attachment is named by a database id. The bytes are reached through a route in this app
which re-checks, per request, that the caller is entitled to that attachment, and only then
mints a signed URL valid for five minutes and redirects to it. There is no stored URL and no
public object.

Three consequences follow, and are the point:

- **The storage key never leaves the server.** `SupportMessage.attachments` carries a view
  shape with no `storageKey` field, because a message is serialised into an HTTP response,
  an SSE frame and the admin inbox — none of which need to name an object in a bucket.
- **Authorisation is re-evaluated on every fetch**, not baked into a link at send time. A
  conversation that is later reassigned, or a guest token that is later rotated, changes
  what can be fetched immediately.
- **A link in an old transcript always works**, because it is a link to us, not to S3.

Credentials for the bucket come from the instance role via the SDK's default provider
chain. No access key is stored in GitHub Secrets, in the deploy's env file, or in this
repository — see `lib/server/storage/s3.ts`.

Uploaded files are identified by their **signature, not their declared Content-Type**. What
a browser sends in a multipart part is derived from the file extension and is settable
outright by anything that is not a browser; storing it would mean an executable served back
as `image/png`. The allowlist is images plus PDF, deliberately short: every addition is a
file type an Agent is being asked to open on a work machine.

Downloads are served `Content-Disposition: attachment`, never `inline`, so nothing fetched
from the bucket can execute in the app's origin.

## Consequences

Bytes cross the app process on their way to S3 rather than going browser-to-bucket over a
presigned PUT. That costs memory per upload and is why `MAX_ATTACHMENT_BYTES` is 10 MB. It
buys the thing a presigned PUT cannot have: the server sees the file and can identify it
before it is stored. For a bucket that will hold identity documents, that is the right way
round.

Every download is a request to this app before it is a request to S3. At support volumes
that is nothing; it would not be the design for a media-heavy product.

**Retention is solved, 2026-09-10.** The bytes of an attachment are deleted 90 days after
its conversation is Resolved; the row stays, marked with `bytes_deleted_at`.

The two halves of the question have different answers, which is why it needed deciding
rather than defaulting. A transcript is a business record — a chargeback is answered from
it, and Visa's dispute window runs to about 540 days, so a short retention destroys our own
evidence. A passport page is not that: it proved one thing once, and after the question it
settled it is only liability, something a breach can cost us that is no longer doing any
work. The Data Privacy Act's storage-limitation principle says the same in fewer words. So
the document expires long before the conversation does.

The row survives deliberately. Deleting it with the object would make the transcript
misrepresent itself: an Agent thanking someone for a passport, against a message carrying
nothing, with no way to tell "never sent" from "sent and since expired". A tombstone keeps
the name, the size and the date, which is what an Agent needs when a customer asks whether
their document arrived.

It is a **job rather than a bucket lifecycle rule**, and that is the part worth remembering:
the clock does not start when the object is written. It starts when the conversation is
resolved, and it restarts if the customer writes again — a chat still being argued about has
not finished with its evidence. S3 cannot know either of those things, so a lifecycle policy
keyed on object age would delete evidence from a live dispute. See
`/api/cron/purge-support-attachments`, daily at 04:00.

An expired download answers **410, not 404**, on both the customer and the Agent side. The
difference is real: this file existed, it was sent, and it is not coming back.
