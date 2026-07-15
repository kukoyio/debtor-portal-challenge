# Debtor Portal Chatbot — Build Plan

## PHASE 0 — Setup & Infrastructure

### 0.1 Accounts and Keys
- [x] Create LLM account (Gemini/OpenAI/Groq) and generate API key
- [x] Create Supabase account and note URL, anon key, and service_role key
- [x] Create Resend account and note test domain and API key

### 0.2 Repository Setup
- [x] Create private repository from the challenge template
- [x] Set repository visibility to Private
- [x] Invite `wardch` and `alinayevstropova` as collaborators
- [x] Clone repository locally
- [x] Run `pnpm i` and `pnpm dev` to verify localhost loads the fixture UI
- [x] Run `pnpm lint`, `pnpm typecheck`, and baseline tests

### 0.3 Vercel Deployment
- [x] Create Vercel account
- [x] Import GitHub repository to Vercel and deploy
- [x] Verify live deployment URL loads correctly

### 0.4 Environment Variables
- [x] Copy `.env.local.example` to `.env.local`
- [x] Populate `.env.local` with Supabase, Resend, and LLM keys
- [x] Add identical environment variables to Vercel Project Settings
- [x] Confirm `.env.local` is active in `.gitignore`

### 0.5 Documentation
- [x] Create `DECISIONS.md` at root for Architecture Decision Records (ADRs)

---

## PHASE 1 — Day 1: Database & Service Layer

### 1.1 Database Initializer
- [x] Execute `supabase/migrations/` schema inside Supabase SQL editor
- [x] Verify core tables created properly in Supabase Table Editor

### 1.2 Database Client Setup
- [x] Create server-only Supabase client using service_role key (`src/lib/supabase/server.ts`)
- [x] Test client connectivity with a throwaway script and delete/comment out

### 1.3 Schema Review
- [x] Finalize schema choices against `account-context.md`
- [x] Document schema decisions or migrations in `DECISIONS.md`

### 1.4 Account Service (`src/lib/account/service.ts`)
- [x] Implement `getAccount(accountId)`
- [x] Implement `updateAccountHolder(accountId, fields)`
- [x] Implement `updatePreferredContactMethod(accountId, method)`
- [x] Add email format validation
- [x] Add name non-empty validation
- [x] Add phone format validation and write corresponding ADR
- [x] Add address field structural validation

### 1.5 Related People Service (`src/lib/related-people/service.ts`)
- [x] Implement `listRelatedPeople(accountId)`
- [x] Implement `addRelatedPerson(accountId, data)`
- [x] Implement `updateRelatedPerson(accountId, personId, fields)`
- [x] Implement `removeRelatedPerson(accountId, personId)`
- [x] Implement `findRelatedPersonByName(accountId, name)`

### 1.6 Promises Service (`src/lib/promises/service.ts`)
- [x] Implement `listPromisesToPay(accountId)`
- [x] Implement `createPromiseToPay(accountId, data)` with future-date enforcement

### 1.7 Payments Service (`src/lib/payments/service.ts`)
- [x] Implement `listTransactions(accountId)`
- [x] Implement `makePayment(accountId, amountCents)` with atomic balance reductions

### 1.8 Appointments Service (`src/lib/appointments/service.ts`)
- [x] Implement `listFutureCallAppointments(accountId)`
- [x] Implement `bookCallAppointment(accountId, data)` with future-date enforcement

### 1.9 Service Layer Testing
- [x] Write Vitest unit tests covering happy paths and failure conditions for all services
- [x] Run `pnpm test` and ensure all tests are green

---

## PHASE 2 — Day 2: The Chat Brain & Integration

### 2.1 Dependencies
- [x] Run `pnpm add zod pdfkit resend openai` and `pnpm add -D @types/pdfkit`

### 2.2 Intent Parser (`src/lib/chat/intent-parser.ts`)
- [x] Build `parseIntent()` using structured JSON engine from LLM provider
- [x] Inject chat window history to handle multi-turn conversational updates
- [x] Implement fallback parsing catch to prevent system crashes

### 2.3 Input Validation (`src/lib/chat/validators.ts`)
- [x] Build Zod schema validators mapping back to service-layer rules

### 2.4 State Management (`src/lib/chat/conversation-store.ts`)
- [x] Build in-memory message history container using a JavaScript `Map`

### 2.5 Core Routing Engine (`src/lib/chat/action-router.ts`)
- [x] Create `handleChatMessage()` central routing workflow
- [x] Sequence pipeline: Store → Parse → Clarify Check → Validate → DB Write → Notify → Respond

### 2.6 Edge API Hook (`src/app/api/chat/route.ts`)
- [x] Replace route stub with live `handleChatMessage()` call
- [x] Build global server try/catch wrapper returning error status 500

### 2.7 Notification Architecture
- [x] Implement password-encrypted PDF generator via `pdfkit` (`src/lib/notifications/pdf.ts`)
- [x] Implement `sendAccountChangeNotification()` using Resend SDK (`src/lib/notifications/account-change-notification.ts`)
- [x] Fall back to console logs if `RESEND_API_KEY` is missing, writing to `notification_attempts`

### 2.8 Component Wiring
- [x] Hook `action-router.ts` write triggers up to notification system pipeline
- [x] Verify local log entry matches database states upon changes

### 2.9 Chat Tests
- [x] Un-skip and configure all assertions inside `src/lib/chat/chat-contracts.test.ts`
- [x] Write targeted tests for missing payloads, ambiguous inputs, and timeline rejections

### 2.10 UI Data Hydration
- [x] Swap static fixture in `src/app/page.tsx` for real database `getAccount()` fetch
- [x] Configure `debtor-portal.tsx` to refresh dataset states after chat mutations

### 2.11 End-to-End Evaluation
- [x] Manually test all 9 scenarios in `docs/scenarios.md` inside local UI sandbox

---

## PHASE 3 — Day 3: Hardening, Deployment & Submission

### 3.1 Edge Case Pass
- [x] Verify system handles garbage/unsupported conversational input smoothly
- [x] Test text-to-integer conversion tolerances on payments
- [x] Verify logic forks cleanly when parsing matching duplicate names

### 3.2 Security Scrub
- [x] Review `git diff` carefully to guarantee zero keys or tokens are staged
- [x] Audit workspace for accidental tracking of `.env.local` histories

### 3.3 Remote Verification
- [x] Check Vercel project environment arrays match local settings
- [x] Push to main branch and re-verify all 9 manual scenarios against production build URL

### 3.4 Architecture Layout
- [x] Map pipeline out inside `architecture-diagram.md` utilizing Mermaid format

### 3.5 Documentation Finalization
- [x] Populate main `README.md` with targeted design notes sourced from `DECISIONS.md`
- [x] Surface production Vercel URL explicitly at top of `README.md`

### 3.6 Evaluation Compliance Audit
- [x] Check persistence durability (data survives browser refresh)
- [x] Verify test arrays execute completely clean via `pnpm test`
- [x] Confirm no third-party payment gateways are hooked up
- [x] Confirm no text-exposed sensitive values escape via notification emails
- [x] Check `notification_attempts` logs entries for every structural mutation

### 3.7 Delivery Submission
- [x] Confirm access rights remain valid for `wardch` and `alinayevstropova`
- [x] Fill out and dispatch Google Submission Form