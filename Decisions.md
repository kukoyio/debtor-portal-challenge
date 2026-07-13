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
JSON output  compared to OpenAI, so the intent parser needed a bit more defensive 
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