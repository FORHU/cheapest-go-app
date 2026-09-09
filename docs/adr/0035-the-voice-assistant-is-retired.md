# The voice assistant is retired

`/api/voice` and `VoiceAssistant.tsx` are deleted, along with the mount in the main layout. The site no longer has a spoken travel assistant, and the `AI_*` environment variables go with it: support translation reads a single `TRANSLATION_BASE_URL` ([ADR-0034](0034-translation-goes-through-chatwonder.md)), and nothing else in the codebase calls a language model.

It goes for the same reason as the support assistant ([ADR-0031](0031-support-is-answered-only-by-people.md)): it answered customers in CheapestGo's voice about bookings and prices with no way to establish that it was right. If anything the case is stronger here — its tool loop could search hotels, read stored preferences and act on a signed-in customer's behalf, and a wrong action costs more than a wrong sentence.

Two things made it the easy half of the decision. It shared `AI_BASE_URL` with the support assistant, so the moment support stopped speaking the OpenAI wire format the two consumers needed different services and the shared configuration turned from a safeguard into a hazard — the adapter's own comment had justified sharing on the grounds that two places "can disagree". And it was the last holder of the loopback debt in [ADR-0012](0012-internal-routes-are-called-in-process.md): its tools called this application's own HTTP routes through a configurable base URL instead of the in-process functions behind them. Deleting the route retires that debt rather than paying it.

## Considered Options

**Give voice its own provider variables and keep it.** Rejected. It is a real feature and losing it is a real cost, but keeping it means keeping an OpenAI account, a key, a bill and a tool loop for a surface whose answer quality nobody had checked — and paying down the ADR-0012 violation first.

**Keep the interface, route it to a person.** Rejected as incoherent. The whole value of the voice assistant was answering instantly; a voice box that puts you in a queue is a worse Support Widget with a microphone.

## Consequences

- **The `AI_*` variables leave `.env` entirely.** The misconfiguration that began this work — a base URL pasted into `AI_API_KEY`, silently falling back to OpenAI defaults — is not so much fixed as made impossible. One translation variable remains and it holds a URL.
- **ADR-0012's outstanding violation is closed by deletion, not by repair.** Anyone auditing that decision should know the debt was removed rather than paid, and that the pattern would return with any future in-app agent.
- **`/api/google/geocode` loses what may have been its only caller.** Confirm before assuming it is still reachable.
- **A spoken assistant would be a new feature, not a revert.** It would need its own provider, its own configuration, and tools calling in-process functions as ADR-0012 requires.
