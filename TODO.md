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
- [ ] Implement `listRelatedPeople(accountId)`
- [ ] Implement `addRelatedPerson(accountId, data)`
- [ ] Implement `updateRelatedPerson(accountId, personId, fields)`
- [ ] Implement `removeRelatedPerson(accountId, personId)`
- [ ] Implement `findRelatedPersonByName(accountId, name)`

### 1.6 Promises Service (`src/lib/promises/service.ts`)
- [ ] Implement `listPromisesToPay(accountId)`
- [ ] Implement `createPromiseToPay(accountId, data)` with future-date enforcement

### 1.7 Payments Service (`src/lib/payments/service.ts`)
- [ ] Implement `listTransactions(accountId)`
- [ ] Implement `makePayment(accountId, amountCents)` with atomic balance reductions

### 1.8 Appointments Service (`src/lib/appointments/service.ts`)
- [ ] Implement `listFutureCallAppointments(accountId)`
- [ ] Implement `bookCallAppointment(accountId, data)` with future-date enforcement

### 1.9 Service Layer Testing
- [ ] Write Vitest unit tests covering happy paths and failure conditions for all services
- [ ] Run `pnpm test` and ensure all tests are green

---

## PHASE 2 — Day 2: The Chat Brain & Integration

### 2.1 Dependencies
- [ ] Run `pnpm add zod pdfkit resend openai` and `pnpm add -D @types/pdfkit`

### 2.2 Intent Parser (`src/lib/chat/intent-parser.ts`)
- [ ] Build `parseIntent()` using structured JSON engine from LLM provider
- [ ] Inject chat window history to handle multi-turn conversational updates
- [ ] Implement fallback parsing catch to prevent system crashes

### 2.3 Input Validation (`src/lib/chat/validators.ts`)
- [ ] Build Zod schema validators mapping back to service-layer rules

### 2.4 State Management (`src/lib/chat/conversation-store.ts`)
- [ ] Build in-memory message history container using a JavaScript `Map`

### 2.5 Core Routing Engine (`src/lib/chat/action-router.ts`)
- [ ] Create `handleChatMessage()` central routing workflow
- [ ] Sequence pipeline: Store → Parse → Clarify Check → Validate → DB Write → Notify → Respond

### 2.6 Edge API Hook (`src/app/api/chat/route.ts`)
- [ ] Replace route stub with live `handleChatMessage()` call
- [ ] Build global server try/catch wrapper returning error status 500

### 2.7 Notification Architecture
- [ ] Implement password-encrypted PDF generator via `pdfkit` (`src/lib/notifications/pdf.ts`)
- [ ] Implement `sendAccountChangeNotification()` using Resend SDK (`src/lib/notifications/account-change-notification.ts`)
- [ ] Fall back to console logs if `RESEND_API_KEY` is missing, writing to `notification_attempts`

### 2.8 Component Wiring
- [ ] Hook `action-router.ts` write triggers up to notification system pipeline
- [ ] Verify local log entry matches database states upon changes

### 2.9 Chat Tests
- [ ] Un-skip and configure all assertions inside `src/lib/chat/chat-contracts.test.ts`
- [ ] Write targeted tests for missing payloads, ambiguous inputs, and timeline rejections

### 2.10 UI Data Hydration
- [ ] Swap static fixture in `src/app/page.tsx` for real database `getAccount()` fetch
- [ ] Configure `debtor-portal.tsx` to refresh dataset states after chat mutations

### 2.11 End-to-End Evaluation
- [ ] Manually test all 9 scenarios in `docs/scenarios.md` inside local UI sandbox

---

## PHASE 3 — Day 3: Hardening, Deployment & Submission

### 3.1 Edge Case Pass
- [ ] Verify system handles garbage/unsupported conversational input smoothly
- [ ] Test text-to-integer conversion tolerances on payments
- [ ] Verify logic forks cleanly when parsing matching duplicate names

### 3.2 Security Scrub
- [ ] Review `git diff` carefully to guarantee zero keys or tokens are staged
- [ ] Audit workspace for accidental tracking of `.env.local` histories

### 3.3 Remote Verification
- [ ] Check Vercel project environment arrays match local settings
- [ ] Push to main branch and re-verify all 9 manual scenarios against production build URL

### 3.4 Architecture Layout
- [ ] Map pipeline out inside `architecture-diagram.md` utilizing Mermaid format

### 3.5 Documentation Finalization
- [ ] Populate main `README.md` with targeted design notes sourced from `DECISIONS.md`
- [ ] Surface production Vercel URL explicitly at top of `README.md`

### 3.6 Evaluation Compliance Audit
- [ ] Check persistence durability (data survives browser refresh)
- [ ] Verify test arrays execute completely clean via `pnpm test`
- [ ] Confirm no third-party payment gateways are hooked up
- [ ] Confirm no text-exposed sensitive values escape via notification emails
- [ ] Check `notification_attempts` logs entries for every structural mutation

### 3.7 Delivery Submission
- [ ] Confirm access rights remain valid for `wardch` and `alinayevstropova`
- [ ] Fill out and dispatch Google Submission Form