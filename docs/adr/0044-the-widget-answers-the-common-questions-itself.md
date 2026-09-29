# ADR-0044: The widget answers the common questions itself

## Status

Accepted. Amends ADR-0043, which stands except where noted.

## Context

ADR-0043 let the widget *suggest* a **Help Page** article while the customer typed, below the
composer, never in the transcript. It was the cautious first step past ADR-0031, whose argument
was that a language model's answer could be wrong in CheapestGo's voice about someone's money.

In use it asks too much of the customer. They have to compose a question before anything is
offered, and the offer arrives as a card under the box they are still typing in — so the common
case, a customer who wants one known answer and wants it now, still types a message, still waits
for the queue, and out of hours still waits until the next morning. The widget header says as
much: "Back Thursday 9:00 AM".

Every OTA a customer has used — Booking, Agoda, Expedia — opens support with tappable common
questions, answers them in the chat window immediately, and keeps a visible way to a person.
Measured against that, a card that appears after twelve characters of typing reads as a worse
version of a familiar thing.

## Decision

**The widget answers the common questions itself, in the chat window, from text a person wrote.**

- An empty Support Chat opens with **tappable questions** — the Help Page articles, in the
  customer's language. No typing.
- Tapping one shows that answer **as a message in the conversation area**, labelled
  **automated** and attributed to the Help Centre, never to an **Agent**.
- Under the answer: **"That answered it"** — which ends it with no chat in the queue — and
  **"Talk to a person"**, which sends that question as the customer's own message and starts an
  ordinary Support Chat: **Waiting**, **Unassigned**, doorbell.
- Typing still works exactly as ADR-0043 described: matching articles are offered as cards.
- **The topics only a person handles are never answered automatically** — a double charge,
  suspected fraud, a chargeback, anything naming a lawyer. Those chips go straight to the queue.
- **An automated answer is shown, not stored.** The messages table keeps what people wrote to
  each other; what the widget displayed is recorded as a suggestion event, and the inbox shows
  the Agent which articles the customer was given.

## Considered Options

**Leave ADR-0043 as it is.** Rejected. It protects the customer from a wrong answer by making
the right answer hard to reach, and the evidence it asked for — do customers deflect? — cannot
be gathered from an interaction most customers never trigger.

**A model answering from the Help Page.** Rejected again, for ADR-0031's reason unchanged: the
words would be generated rather than written, and wrong in the company's voice is the failure
that matters. Nothing here generates anything; the tap chooses which stored paragraph to show.

**Store the automated answer as a message in the transcript.** Rejected. A Support Chat's
transcript is what the customer and the Agent said to each other, and "who said this?" must have
an answer for every row in it. Storing machine text there also means a customer who only ever
read an article now has a chat in the queue, a reference, and a doorbell ring — the cost this
ADR exists to remove. The Agent still sees what was shown, through the suggestion events.

**A "was this helpful?" thumbs rating.** Rejected as noise. "That answered it" and "Talk to a
person" already say the same thing and both do something useful; a rating asks the customer to
do work for us with nothing in it for them.

## Consequences

- **ADR-0031 still holds where it matters.** Nothing writes into a Support Chat but a person.
  What changed is that the widget may now *display* an answer a person wrote, clearly labelled,
  before a chat exists at all.
- **ADR-0043's "never in the transcript" is narrowed** to "never stored, never attributed". The
  answer now appears in the conversation area, which is where a customer looks.
- **Out of hours stops meaning unanswered** for the five questions that are already written
  down. Everything else still waits for the morning, and is still told when that is.
- **A wrong chip label is now more expensive.** A misleading chip is tapped, not merely offered,
  so the counts per article — shown, opened, solved, sent anyway — are the thing to watch; a
  chip with a high "talk to a person" rate is a chip promising an answer it does not contain.
- **The Help Page and the widget are one corpus still.** Editing an article changes both, which
  is the property that keeps them from contradicting each other.
