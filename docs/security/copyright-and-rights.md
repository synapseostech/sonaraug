# Copyright, retransmission and platform rights

This is an engineering checklist, not legal advice. A media platform that streams
Ugandan radio and hosts creators' work sits on several rights at once.

## Rights involved

| Right | Whose | Why it matters |
|---|---|---|
| Broadcast retransmission | The station / broadcaster | Listing a station in our directory is a retransmission of their signal |
| Musical works (performance) | Composers/publishers via UPRS and similar | A station's licence does **not** automatically extend to a third-party platform |
| Sound recordings | Labels / artists | Separate from the musical work |
| Creator content licence | The creator | We need a documented licence to host, transcode, deliver and (later) monetise |
| Advertiser creative | The advertiser/agency | We must be licensed to display and measure it |
| Personality/likeness | Presenters | Photos and bios need consent |

## Engineering controls in place today

1. `rights_records` stores holder, licence type, territories, validity window and
   the supporting document asset.
2. The `stations_publish_gate` trigger refuses to publish a station without a
   rights record that is in force **today** and covers **UG**. Tested in
   `supabase/tests/rls/03_publish_gate.sql`.
3. `verification_requests` holds the broadcaster's licence documents; only
   admins can review them, and the review is audited.
4. Every moderation and rights change writes an `audit_logs` row.
5. We never inject advertising into a third-party live stream (no proxying).

## Before public launch — required

- [ ] Retain and review the reported written broadcaster retransmission permission for each station, including territory, term and scope
- [ ] Confirmation of whether the platform needs its own UCC authorisation
- [ ] UPRS (or equivalent) position on retransmitted musical works and sound recordings
- [ ] Creator terms: licence grant, territory, term, takedown, monetisation split
- [ ] Advertiser insertion order template including measurement and refund terms
- [ ] Takedown workflow with response SLA and a named contact
- [ ] Record retention policy for rights documents (minimum 3 years after expiry)

The project owner reports having written station retransmission permission for the
six stations in the Sonara stream registry. The permission documents have not
been reviewed or stored in this repository. Underlying music rights remain
unconfirmed; the web player therefore keeps public playback disabled until both
rights layers are cleared.

## Deliberate product constraints that reduce risk

- No catch-up or recording — avoids on-demand retransmission rights entirely.
- No audio ad insertion into live radio — avoids modifying a licensed signal.
- Downloads only where the episode explicitly permits it (`download_allowed`).
- Videos require an uploaded master we control, rather than embedding third-party
  players that would carry their terms into our product.
