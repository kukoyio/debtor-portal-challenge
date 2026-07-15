# Architecture Diagram

```mermaid
flowchart LR
  User["Account holder"] --> UI["Next.js portal UI"]
  UI --> ChatAPI["POST /api/chat"]
  ChatAPI --> Router["Action router<br/>(handleChatMessage)"]

  Router --> Store["Conversation store<br/>(in-memory per conversation)"]
  Router --> Parser["Intent parser<br/>(LLM + prompt context)"]
  Router --> Validator["Zod validators<br/>(account, related people, promises, payments, appointments)"]

  Router --> Services["Business services<br/>Account / Related People / Promises / Payments / Appointments"]
  Services --> DB[("Supabase DB")]

  Router --> Notification["Notification service"]
  Notification --> Email["Resend email<br/>(generic account-change body)"]
  Notification --> PDF["Encrypted PDF attachment"]
  PDF --> Password["PDF password<br/>phone last 4 digits"]

  DB --> Router
  Router --> UI
``` 

This flow reflects the implemented chat experience in the project: the UI sends a message to the chat API, the router parses the intent, validates the extracted fields, executes the relevant service, writes to Supabase where needed, and optionally queues a notification containing an encrypted PDF summary.
