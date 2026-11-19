# Feature plans

> **Status (2026-11-19): all four are built**, one commit each on `feat/booking-lifecycle`. Where the build differs from the plan:
> - My Bookings filters with `?view=upcoming|past|cancelled` (not `?status=`), so it can't be confused with a booking's status.
> - No partial index on active bookings: the existing `bookings_user_id_idx` is enough at this size.
> - The optional `notify_bookings` preference was left out.
> - The admin's status change and history share one *Manage* dialog instead of a dropdown plus a popover.
>
> Of "Also worth doing", the guest-count limit is done. Card-size images and the two missing production images are still open.

Plans for the next four product features, written 2026-11-18 against the code at that date. Each plan lists:
- what happens today;
- the proposed change across the database, API and frontend;
- the edge cases;
- the tests to add;
- a rough size.

They are ordered so that each builds on the one before. All four share one idea: a booking has a **lifecycle** (`pending → confirmed → completed`, with `cancelled`, `no_show` and `refunded` as side exits) instead of being deleted.

| # | Feature | Depends on | Size | Status |
|---|---|---|---|---|
| 1 | Keep cancelled bookings as history | – | M (1–1.5 days) | Done |
| 2 | Admin booking status changes | 1 | M (1 day) | Done |
| 3 | Booking confirmation e-mails | 1, 2 (for the status e-mails) | S–M (0.5–1 day) | Done |
| 4 | Reviews only after a completed trip | 2 | S (0.5 day) | Done |

---

## 1. Keep cancelled bookings as history

**Today.**
- `DELETE /api/booking/:id` (`cancelBooking` in `backend/src/controllers/booking.controller.ts`) gives the seats back and **deletes** the row.
- The `bookings.status` enum already has `cancelled`, but nothing ever sets it.
- Customers lose their booking history, and admins can't see cancellations or analyse them.

**Database.**
- Migration `…-add-booking-cancellation-fields`, additive and idempotent:
  - `cancelled_at timestamptz NULL`;
  - `cancelled_by integer NULL REFERENCES users(user_id) ON DELETE SET NULL`;
  - `cancellation_reason varchar(255) NULL`.
- Backfill: nothing. Bookings cancelled in the past are already gone.
- Partial index `bookings(user_id) WHERE status <> 'cancelled'` for the "active bookings" queries.

**API.**
- Cancellation becomes `PATCH /api/booking/:id/cancel`. Keep `DELETE` as an alias for one release so an old frontend tab still works.
  - In the existing transaction, set `status='cancelled'`, `cancelled_at`, `cancelled_by` and the optional `reason` instead of `destroy()`.
  - Seats are still released with `tour.increment`.
  - The 3-day rule for customers stays; admins can still cancel at any time.
- Idempotent: cancelling an already-cancelled booking answers 409 and does **not** release the seats a second time. This is the main correctness risk; a test covers it.
- `GET /booking/my` gets `?status=active|past|cancelled`, defaulting to active, so "My Bookings" doesn't fill up with cancellations.
- `GET /booking` (admin) gets a `status` filter.
- Stats: `Total Bookings` counts non-cancelled bookings only. Add a `Cancelled (30 days)` metric.
- Demo clean-up (`lib/demo.ts`) keeps deleting the demo customer's rows, because those are throw-away data.

**Frontend.**
- `BookingsPage` gets tabs: Upcoming / Past / Cancelled.
- A cancelled booking card shows a "Cancelled on …" badge and has no actions.
- Admin bookings page: a status filter, and cancelled rows shown dimmed with who cancelled and why.
- The confirm dialog gets an optional "Reason" field.

**Tests.**
- API:
  - cancel → the row is kept with status `cancelled` and the seats are back;
  - a second cancel returns 409 and the seats are unchanged;
  - customers can't cancel inside 3 days, admins can;
  - `/booking/my` filters work.
- Frontend: the tabs render the right list, and a cancelled card has no actions.
- E2E: update `booking.spec.ts`. After cancelling, the booking appears under *Cancelled*, not gone.

**Rollout.** Run the migration first (additive), then deploy the API, then the frontend.

---

## 2. Admin booking status changes

**Today.**
- Admins can only *confirm* a pending booking (`PATCH /booking/:id/confirm`) or delete it.
- Nothing ever sets `completed`, `no_show` or `refunded`.
- The dashboard's **Total Revenue** sums `completed` bookings only (`stats.controller.ts`), so in production it always shows $0.00.

**Allowed transitions** (enforced in one place, `backend/src/lib/bookingStatus.ts`):

```
pending   → confirmed | cancelled
confirmed → completed | no_show | cancelled
completed → refunded
cancelled, no_show, refunded → (final)
```

**Database.**
- New table `booking_status_history`: `id`, `booking_id` FK `ON DELETE CASCADE`, `from_status`, `to_status`, `changed_by` FK `ON DELETE SET NULL`, `note`, `changed_at`.
- The table is an audit trail and costs one insert per change.

**API.**
- `PATCH /api/booking/:id/status { status, note? }`, admin only.
  - It validates the transition and returns 409 with the allowed next states.
  - It writes the history row in the same transaction.
  - Moving to `cancelled` releases the seats, sharing code with feature 1.
- `confirm` becomes a thin wrapper around this endpoint.
- **Automatic completion:** a booking whose tour has ended is `completed`.
  - Implement this as a daily job, or lazily when bookings are listed, with an `UPDATE … WHERE status='confirmed' AND tour.end_date < now()`.
  - Render's free plan has no cron, so prefer the lazy update. An optional GitHub Actions call to an admin-token endpoint would also work.
- Stats: revenue = `completed` + `confirmed` (paid-but-not-yet-travelled), shown as two numbers, so the dashboard stops showing $0.00.
- Demo admin: the endpoint is a write, so `verifyToken` already blocks it. Nothing to add.

**Frontend.**
- Admin bookings page: a status dropdown with only the allowed next states, an optional note, and a small history popover per booking.
- Customer booking card: a coloured status badge.

**Tests.**
- A unit test of the transition table.
- API:
  - every allowed transition succeeds; a disallowed one returns 409;
  - a history row is written;
  - cancelling via status releases seats exactly once;
  - lazy completion marks past confirmed bookings;
  - revenue sums the right statuses.
- Frontend: the dropdown offers only the valid next states.

---

## 3. Booking confirmation e-mails

**Today.**
- E-mail sending already exists: `utils/sendEmail.ts` (nodemailer), templates in `backend/src/emails/`, Mailpit locally, and an in-memory `sentEmails` list in tests.
- Bookings send no e-mail.

**E-mails.**
- **Booking received** (on create): tour, dates, guests, total, booking reference, cancellation rule, and a link to *My Bookings*.
- **Booking confirmed / cancelled / completed** (on status change, feature 2): a short note. For cancellations, it says who cancelled and the reason.
- All templates escape user-supplied text, as `contactMessageEmail.ts` already does, and link to `APP_URL`.

**Design.**
- Send **after** the database transaction commits. A mail failure must never roll back or fail the booking: log it and move on.
  - This differs from password reset, which reports a 502, because there the e-mail *is* the feature.
- Fire-and-forget inside the request (`void sendBookingEmail(...).catch(log)`). Nodemailer is fast enough, and a job queue isn't justified at this scale.
- Respect demo accounts: no e-mail to `@example.com` addresses. That domain is reserved and would bounce anyway.
- Optional: a `users.notify_bookings boolean default true` preference in Account Settings.

**Tests.**
- API, using `sentEmails`:
  - creating a booking sends one e-mail to the customer with the reference and total;
  - a confirm/cancel status change sends the matching e-mail;
  - an SMTP failure still returns 201;
  - HTML in names or notes is escaped;
  - demo addresses get nothing.
- E2E: book a tour, then read the e-mail from Mailpit (helper `e2e/support/mailpit.ts` already exists).

---

## 4. Reviews only after a completed trip

**Today.**
- `createReview` (`review.controller.ts`) only checks that the tour exists and that the user hasn't reviewed it yet. Anyone signed in can review any tour, including ones they never took.
- The tour page shows the review form to every signed-in user.

**Rule.** A customer may review a tour if they have a booking for it with status `completed`, or `confirmed` whose tour has ended. The second case covers trips before automatic completion has run. Admins keep moderation rights (delete) but don't write reviews.

**API.**
- `createReview` checks for an eligible booking. If there is none, it returns 403 "You can review a tour after you have travelled on it."
- New `GET /api/review/eligibility/:tour_id` → `{ canReview, reason }`. The UI uses it to decide what to show.
- Existing reviews stay: no retroactive deletion.

**Frontend.**
- On the tour page, show the form only when `canReview`. Otherwise show a short explanation ("Reviews open after your trip", or "You've already reviewed this tour").
- This also removes the current quirk where a signed-out user can type a whole review before being sent to sign in.
- *My Bookings* → past trip card: a "Write a review" link.

**Tests.**
- API:
  - no booking → 403;
  - a future confirmed booking → 403;
  - a completed booking → 201;
  - a cancelled booking → 403;
  - a second review → 409 (unchanged);
  - eligibility endpoint answers for each case.
- Frontend: the form is hidden or explained for each eligibility answer.
- E2E: an admin marks a booking `completed` (feature 2), then the customer reviews the tour.

---

## Also worth doing (found along the way)

- **Smaller images for cards.** *Done:* every upload also stores an 800 px card copy (about 50–70 KiB instead of 250–400 KiB), used by all cards, search results and gallery thumbnails. `npm run images:cards -w backend` creates the copies for images uploaded earlier. Until it has run, cards fall back to the full image.
- **Guest count above available seats.** *Done:* the limit now shows next to the Guests field and *Book* stays disabled until the count fits.
- **Missing production images.** *Done:* the Italy destination image and the "Family Fun in Gold Coast" photos were re-uploaded.
- **A finished trip for the demo customer.** *Done:* each demo sign-in adds a completed booking on the most recently ended tour (`npm run db:demo-trip` adds an ended copy of a tour when none exists). Ended tours are hidden from the catalogue and search, and demo reviews are visible only to the demo account.
