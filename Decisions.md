# build an account self-service chatbot for a customer with an overdue account.

## ADR-001: The AI only reads messages — it never touches the database
The AI's one job is to turn a sentence like "pay 150 euro now" into a 
simple structured note: what the user wants, and what details they gave. 
Plain code (not AI) then checks if that's valid and makes the actual 
database change. This way, every action is checked and testable, and 
the AI is never the thing "in charge."

## ADR-002: LLM provider = Gemini 1.5 Flash
Chose Gemini because it has a free tier which matters since this is a short, 
low-budget project. It's also fast, which keeps the chat feeling responsive 
rather than laggy.  Trade-off: less battle-tested for forcing strict structured 
JSON output compared to OpenAI, so the intent parser needed a bit more defensive 
handling in case the model's output doesn't match the expected shape.

## ADR-003: PDF library = pdfkit, not pdf-lib
pdf-lib was the obvious first choice but can't password-protect PDFs. 
pdfkit can, and doesn't need any extra software installed on the 
server, so it works fine on Vercel.

## ADR-004: Supabase — using the cloud version, not running it locally
Skipping local Supabase (which needs Docker) to keep the setup simple. 
The live version on Vercel needs a cloud database anyway, so building 
against the cloud one from day one avoids maintaining two setups.

## ADR-005: No "are you sure?" confirmation step before payments
This is a mocked payment — no real money moves, so there's no real risk 
being protected against. If this became a real payment system later, 
the payment step itself would already ask for confirmation (entering 
card details, clicking pay), so adding a second confirmation in the 
chat would be doing the same job twice. Instead, the safety net is the 
email that goes out right after any payment — the user finds out 
immediately if something happened that they didn't expect.

## ADR-006: Chat history kept in memory, not saved to the database
According to the brief, only account data (the actual balance, payments,
related people, etc.) needs to survive a refresh. Chat message history 
is kept in a simple in-memory store per conversation, which is enough 
for a single working session. Trade-off: history is lost if the server 
restarts. Would upgrade to a real table if this became a long-running product.

## ADR-007: Payment amount above balance is rejected, not silently capped
The database itself won't allow a negative balance. Rather than quietly 
reducing the payment to whatever's owed, the app tells the user the 
amount is too high and asks for a smaller one which is clearer than guessing 
what they meant.

## ADR-008: extended schema with due_date/support_phone/support_email columns, missing from starter migration but required as read-only fields per account-context.md

## ADR-009: Phone Number validation strategy
When figuring out how to handle phone number validation for the MVP, I realized 
that defining a "valid" number globally is unnecessarily complex and would bloat 
the app with a massive library like google-libphonenumber, but I also knew that 
writing an overly strict custom regex would inevitably end up blocking legitimate 
international users. I decided the best middle ground is to just enforce a basic 
subset of the E.164 standard using a super simple regex: ^\+[0-9]{10,15}$. Basically, 
the number just has to start with a literal + followed by 10 to 15 digits.

## ADR-010: Test mocks don't fully enforce Supabase's real query rules
The mock Supabase client used in tests (`mockChain`) doesn't distinguish 
between `.single()` calls (expects exactly one row) and plain awaited 
calls (returns an array). Both just return whatever `mockDbData` is 
currently set to, whatever shape it's in. This means a test could keep 
passing even if the actual code path being exercised silently changed 
(e.g. someone added `.single()` to a function that didn't have it 
before). The tests still correctly verify behaviour under normal use, 
but they trust the developer to set `mockDbData` in the right shape for 
whichever chain the real code calls — they don't independently catch a 
mismatch between the test setup and the real query shape. Accepted as a 
reasonable trade-off for a 3-day project; a stricter mock or integration 
tests against a real Supabase instance would close this gap.

## ADR-011: Notification PDFs are a full snapshot, not a diff
The PDF attached to every account-change notification is always the
account's full current summary — it does not describe what specifically
changed. This keeps generation simple (no before/after tracking needed)
and also acts as a security reassurance: if a change wasn't made by the
account holder, seeing the entire current state of the account is more
useful than a single changed line. The changeSummary passed to the
email is a separate, generic one-line description (see ADR-014).

## ADR-012: PDF owner and user passwords are the same value
pdfkit supports separate userPassword (opens the file) and
ownerPassword (controls permissions like printing/copying). Both are
set to the same value — the last 4 digits of the account phone number —
rather than introducing a second, permissions-only password.

## ADR-013: Notification email redacts the recipient in return values only
sendAccountChangeNotification's return value redacts the recipient
email (e.g. j***@example.test) as defense-in-depth against a full email
address ending up in application logs or an error tracker. This does
not affect the actual send — Resend still receives the real, full
address as the delivery target.

## ADR-014: internalAccountId is resolved once per request, in the router
Rather than each service function independently looking up the
internal account UUID from the public accountId, the router resolves
it once at the start of handleChatMessage and passes internalAccountId
down to whichever service function it calls. This avoids redundant
database round-trips per chat action.

## ADR-015: account/service.ts and the other service files use different ID conventions
account/service.ts functions (getAccount, updateAccountHolder,
updatePreferredContactMethod) accept the public accountId and resolve
the row internally via the account_id column. The related-people,
promises, payments, and appointments service files instead accept the
already-resolved internalAccountId directly, since their tables are
foreign-keyed to account_holders.id rather than the public accountId.
The router calls each service with whichever id shape it actually
expects. Not unified into one convention for time reasons — a future
pass could standardize all service functions to accept internalAccountId
for consistency and to avoid the extra getInternalAccountId lookup
account/service.ts's functions do internally on every call.

## ADR-016: changedBy is always "account_holder"
The chat has no identity/auth layer distinguishing the account holder
from an authorized related person — every message is treated as coming
from the account holder. changedBy is therefore hardcoded to
"account_holder" in notifyAfterChange; the type still supports
"authorized_representative" for when a real identity layer exists.