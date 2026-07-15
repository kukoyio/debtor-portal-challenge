import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AccountContext,
  AccountHolder,
  PromiseToPay,
} from "../account/types";
import { handleChatMessage } from "./action-router";
import { parseIntent } from "./intent-parser";
import {
  getAccount,
  getInternalAccountId,
  updateAccountHolder,
} from "../account/service";
import { addRelatedPerson } from "../related-people/service";
import { createPromiseToPay } from "../promises/service";
import { listTransactions, makePayment } from "../payments/service";
import { bookCallAppointment } from "../appointments/service";
import { sendAccountChangeNotification } from "../notifications/account-change-notification";
import { getRecentMessages } from "./conversation-store";

vi.mock("./intent-parser", () => ({
  parseIntent: vi.fn(),
}));

vi.mock("../account/service", () => ({
  getAccount: vi.fn(),
  getInternalAccountId: vi.fn(),
  updateAccountHolder: vi.fn(),
  updatePreferredContactMethod: vi.fn(),
}));

vi.mock("../related-people/service", () => ({
  listRelatedPeople: vi.fn(),
  addRelatedPerson: vi.fn(),
  updateRelatedPerson: vi.fn(),
  removeRelatedPerson: vi.fn(),
  findRelatedPersonByName: vi.fn(),
}));

vi.mock("../promises/service", () => ({
  listPromisesToPay: vi.fn(),
  createPromiseToPay: vi.fn(),
}));

vi.mock("../payments/service", () => ({
  listTransactions: vi.fn(),
  makePayment: vi.fn(),
}));

vi.mock("../appointments/service", () => ({
  listFutureCallAppointments: vi.fn(),
  bookCallAppointment: vi.fn(),
}));

vi.mock("../notifications/account-change-notification", () => ({
  sendAccountChangeNotification: vi.fn(),
}));

const mockParseIntent = vi.mocked(parseIntent);
const mockGetInternalAccountId = vi.mocked(getInternalAccountId);
const mockGetAccount = vi.mocked(getAccount);
const mockUpdateAccountHolder = vi.mocked(updateAccountHolder);
const mockAddRelatedPerson = vi.mocked(addRelatedPerson);
const mockCreatePromiseToPay = vi.mocked(createPromiseToPay);
const mockListTransactions = vi.mocked(listTransactions);
const mockMakePayment = vi.mocked(makePayment);
const mockBookCallAppointment = vi.mocked(bookCallAppointment);
const mockSendAccountChangeNotification = vi.mocked(
  sendAccountChangeNotification,
);

function buildAccountSnapshot(): AccountContext {
  return {
    account: {
      accountId: "acct-001",
      accountHolderFirstName: "Person",
      accountHolderLastName: "Example",
      status: "active",
      balanceCents: 100000,
      currency: "EUR",
      preferredContactMethod: "sms",
      phone: "+353871112222",
      email: "person@example.test",
      address: {
        line1: "1 Main Street",
        city: "Dublin",
        postalCode: "D01",
        country: "Ireland",
      },
      reference: "REF-001",
      creditorName: "Example Creditor",
      daysPastDue: 0,
      minimumPaymentCents: 1000,
      lastPaymentDate: null,
      lastPaymentAmountCents: 0,
    },
    billing: {
      currentAmountCents: 100000,
      lastStatementAmountCents: 100000,
      dueDate: "2026-07-15",
    },
    paymentOptions: {
      payNowEnabled: true,
      promiseToPayEnabled: true,
      mockPaymentsEnabled: true,
      arrangementEnabled: false,
      eligibleArrangementOptions: [],
    },
    support: {
      humanSupportAvailable: true,
      supportPhone: "+35318000000",
      supportEmail: "support@example.test",
    },
    relatedPeople: [],
    promisesToPay: [],
    transactions: [],
    callAppointments: [],
    notificationRules: {
      sendEmailOnDataChange: true,
      pdfPasswordSource: "account_phone_last4",
    },
  };
}

function expectConversation(
  conversationId: string,
  expectedUserMessage: string,
  expectedAssistantReply: string,
) {
  const messages = getRecentMessages(conversationId);
  expect(messages).toHaveLength(2);
  expect(messages[0]).toMatchObject({
    role: "account_holder",
    content: expectedUserMessage,
  });
  expect(messages[1]).toMatchObject({
    role: "assistant",
    content: expectedAssistantReply,
  });
}

describe("chat action acceptance contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetInternalAccountId.mockResolvedValue("internal-account-1");
    mockGetAccount.mockResolvedValue(buildAccountSnapshot());
    mockSendAccountChangeNotification.mockResolvedValue({
      notificationId: "notif-001",
      sent: true,
      redactedRecipient: "j***@example.test",
    } as Awaited<ReturnType<typeof sendAccountChangeNotification>>);
  });

  it("retrieves the account phone number when asked (Example 1)", async () => {
    const accountId = "acct-read-account";
    const conversationId = "conv-read-account";
    const message = "What is my phone number?";

    mockParseIntent.mockResolvedValue({
      action: "read_account",
      fields: {},
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);

    const result = await handleChatMessage({
      accountId,
      message,
      conversationId,
    });

    expect(result.success).toBe(true);
    expect(result.reply).toContain("Phone: +353871112222");
    expect(mockGetAccount).toHaveBeenCalledWith(accountId);
    expectConversation(conversationId, message, result.reply);
  });

  it("shows transaction history when requested (Example 7)", async () => {
    const accountId = "acct-transactions";
    const conversationId = "conv-transactions";
    const message = "Show my transaction history";

    mockParseIntent.mockResolvedValue({
      action: "read_transactions",
      fields: {},
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockListTransactions.mockResolvedValue([
      {
        id: "txn-1",
        transactionDate: "2026-07-01",
        type: "payment",
        amountCents: 1200,
        currency: "EUR",
        status: "posted",
      },
      {
        id: "txn-2",
        transactionDate: "2026-06-25",
        type: "charge",
        amountCents: 3000,
        currency: "EUR",
        status: "posted",
      },
    ] as Awaited<ReturnType<typeof listTransactions>>);

    const result = await handleChatMessage({
      accountId,
      message,
      conversationId,
    });

    expect(result.success).toBe(true);
    expect(result.reply).toContain("Here is your transaction history");
    expect(result.reply).toContain("2026-07-01");
    expect(result.reply).toContain("payment");
    expect(mockListTransactions).toHaveBeenCalledWith("internal-account-1");
    expectConversation(conversationId, message, result.reply);
  });

  it("updates the account holder phone number and queues a redacted notification", async () => {
    const accountId = "acct-001";
    const conversationId = "conv-update-account";
    const message = "Update my phone number to +353871112222";

    mockParseIntent.mockResolvedValue({
      action: "update_account_holder",
      fields: { phone: "+353871112222" },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockUpdateAccountHolder.mockResolvedValue({
      accountId: "acct-001",
      accountHolderFirstName: "Person",
      accountHolderLastName: "Example",
      email: "person@example.test",
      phone: "+353871112222",
      address: {
        line1: "1 Main Street",
        city: "Dublin",
        postalCode: "D01",
        country: "Ireland",
      },
      preferredContactMethod: "sms",
      reference: "REF-001",
      creditorName: "Example Creditor",
      currency: "EUR",
      balanceCents: 100000,
      status: "active",
      daysPastDue: 0,
      minimumPaymentCents: 1000,
      lastPaymentDate: null,
      lastPaymentAmountCents: 0,
    } as AccountHolder);

    const result = await handleChatMessage({
      accountId,
      message,
      conversationId,
    });

    expect(result.success).toBe(true);
    expect(result.notificationQueued).toBe(true);
    expect(mockUpdateAccountHolder).toHaveBeenCalledWith(accountId, {
      phone: "+353871112222",
    });
    expect(mockSendAccountChangeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        internalAccountId: "internal-account-1",
        changedBy: "account_holder",
        changeSummary: "Your account details were updated",
      }),
    );

    const notificationResult = (await mockSendAccountChangeNotification.mock
      .results[0].value) as Awaited<
      ReturnType<typeof sendAccountChangeNotification>
    >;
    expect(notificationResult.redactedRecipient).toContain("***");
    expect(notificationResult.redactedRecipient).not.toContain(
      "person@example.test",
    );

    expectConversation(conversationId, message, result.reply);
  });

  it("adds an authorized related person with name, email, and phone", async () => {
    const accountId = "acct-002";
    const conversationId = "conv-add-related";
    const message =
      "Add Jamie Doe, jamie@example.test, +353871112222 and let her act for me";

    mockParseIntent.mockResolvedValue({
      action: "add_related_person",
      fields: {
        name: "Jamie Doe",
        email: "jamie@example.test",
        phone: "+353871112222",
        authorizedToAct: true,
      },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockAddRelatedPerson.mockResolvedValue({
      id: "rel-1",
      name: "Jamie Doe",
      email: "jamie@example.test",
      phone: "+353871112222",
      authorizedToAct: true,
      relationship: "friend",
    } as Awaited<ReturnType<typeof addRelatedPerson>>);

    const result = await handleChatMessage({
      accountId,
      message,
      conversationId,
    });

    expect(result.success).toBe(true);
    expect(mockAddRelatedPerson).toHaveBeenCalledWith(
      "internal-account-1",
      expect.objectContaining({
        name: "Jamie Doe",
        email: "jamie@example.test",
        phone: "+353871112222",
        authorizedToAct: true,
      }),
    );

    const createdPerson = (await mockAddRelatedPerson.mock.results[0]
      .value) as Awaited<ReturnType<typeof addRelatedPerson>>;
    expect(createdPerson).toMatchObject({ authorizedToAct: true });

    expectConversation(conversationId, message, result.reply);
  });

  it("records a one-time promise to pay with amount and future due date", async () => {
    const accountId = "acct-003";
    const conversationId = "conv-promise";
    const message = "Record a promise to pay 500 euro by 2030-01-15";
    const futureDueDate = "2030-01-15";

    mockParseIntent.mockResolvedValue({
      action: "create_promise_to_pay",
      fields: { amountCents: 50000, dueDate: futureDueDate },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockCreatePromiseToPay.mockResolvedValue({
      id: "promise-1",
      amountCents: 50000,
      currency: "EUR",
      dueDate: futureDueDate,
      status: "active",
      createdAt: "2026-07-15T00:00:00.000Z",
    } as PromiseToPay);

    const result = await handleChatMessage({
      accountId,
      message,
      conversationId,
    });

    expect(result.success).toBe(true);
    expect(result.promiseToPay).toMatchObject({
      amountCents: 50000,
      dueDate: futureDueDate,
    });
    expect(mockCreatePromiseToPay).toHaveBeenCalledWith("internal-account-1", {
      amountCents: 50000,
      dueDate: futureDueDate,
    });

    expectConversation(conversationId, message, result.reply);
  });

  it("records a mocked payment transaction and surfaces payment failures", async () => {
    const successAccountId = "acct-004";
    const successConversationId = "conv-payment-success";
    const successMessage = "Pay 150 euro";

    mockParseIntent.mockResolvedValue({
      action: "mock_payment",
      fields: { amountCents: 15000 },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockMakePayment.mockResolvedValue({
      transaction: {
        id: "txn-1",
        amountCents: 15000,
        currency: "EUR",
      },
      newBalanceCents: 85000,
    } as Awaited<ReturnType<typeof makePayment>>);

    const successResult = await handleChatMessage({
      accountId: successAccountId,
      message: successMessage,
      conversationId: successConversationId,
    });

    expect(successResult.success).toBe(true);
    expect(successResult.transaction).toMatchObject({
      id: "txn-1",
      amountCents: 15000,
    });
    expect(successResult.reply).toContain("new balance");
    expect(mockMakePayment).toHaveBeenCalledWith("internal-account-1", 15000);
    expectConversation(
      successConversationId,
      successMessage,
      successResult.reply,
    );

    const failureAccountId = "acct-005";
    const failureConversationId = "conv-payment-failure";
    const failureMessage = "Pay 5000 euro";

    mockSendAccountChangeNotification.mockClear();

    mockParseIntent.mockResolvedValue({
      action: "mock_payment",
      fields: { amountCents: 500000 },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockMakePayment.mockRejectedValueOnce(
      new Error("Payment amount exceeds current balance."),
    );

    const failureResult = await handleChatMessage({
      accountId: failureAccountId,
      message: failureMessage,
      conversationId: failureConversationId,
    });

    expect(failureResult.success).toBe(false);
    expect(failureResult.reply).toBe("Payment amount exceeds current balance.");
    expect(mockSendAccountChangeNotification).not.toHaveBeenCalled();
    expectConversation(
      failureConversationId,
      failureMessage,
      failureResult.reply,
    );
  });

  it("books a future call appointment and rejects dates in the past", async () => {
    const successAccountId = "acct-006";
    const successConversationId = "conv-appointment-success";
    const successMessage =
      "Book a call for 2030-01-15T10:00:00.000Z on +353871112222";
    const futureScheduledAt = "2030-01-15T10:00:00.000Z";

    mockParseIntent.mockResolvedValue({
      action: "book_call_appointment",
      fields: { scheduledAt: futureScheduledAt, phone: "+353871112222" },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockBookCallAppointment.mockResolvedValue({
      id: "appt-1",
      scheduledAt: futureScheduledAt,
      phone: "+353871112222",
      reason: "General Account Discussion",
      status: "scheduled",
    } as Awaited<ReturnType<typeof bookCallAppointment>>);

    const successResult = await handleChatMessage({
      accountId: successAccountId,
      message: successMessage,
      conversationId: successConversationId,
    });

    expect(successResult.success).toBe(true);
    expect(successResult.callAppointment).toMatchObject({
      scheduledAt: futureScheduledAt,
    });
    expect(mockBookCallAppointment).toHaveBeenCalledWith(
      "internal-account-1",
      expect.objectContaining({
        scheduledAt: futureScheduledAt,
        phone: "+353871112222",
      }),
    );
    expectConversation(
      successConversationId,
      successMessage,
      successResult.reply,
    );

    const failureAccountId = "acct-007";
    const failureConversationId = "conv-appointment-failure";
    const failureMessage = "Book a call for yesterday";

    mockSendAccountChangeNotification.mockClear();
    mockBookCallAppointment.mockClear();

    mockParseIntent.mockResolvedValue({
      action: "book_call_appointment",
      fields: {
        scheduledAt: "2020-01-01T10:00:00.000Z",
        phone: "+353871112222",
      },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockBookCallAppointment.mockRejectedValueOnce(
      new Error("Cannot book a call in the past."),
    );

    const failureResult = await handleChatMessage({
      accountId: failureAccountId,
      message: failureMessage,
      conversationId: failureConversationId,
    });

    expect(failureResult.success).toBe(false);
    expect(failureResult.reply).toBe(
      "Appointments can only be booked for a future date and time.",
    );
    expect(mockBookCallAppointment).not.toHaveBeenCalled();
    expect(mockSendAccountChangeNotification).not.toHaveBeenCalled();
    expectConversation(
      failureConversationId,
      failureMessage,
      failureResult.reply,
    );
  });

  it("returns a clarify result without calling any service when fields are missing", async () => {
    mockParseIntent.mockResolvedValue({
      action: "clarify",
      fields: {},
      missingFields: ["scheduledAt", "phone"],
    } as Awaited<ReturnType<typeof parseIntent>>);

    const result = await handleChatMessage({
      accountId: "acct-clarify",
      message: "Can I book a call?",
      conversationId: "conv-clarify",
    });

    expect(result.success).toBe(false);
    expect(result.action).toBe("clarify");
    expect(mockBookCallAppointment).not.toHaveBeenCalled();
    expect(mockSendAccountChangeNotification).not.toHaveBeenCalled();
  });

  it("rejects an invalid email before calling any service", async () => {
    mockParseIntent.mockResolvedValue({
      action: "update_account_holder",
      fields: { email: "not-an-email" },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);

    const result = await handleChatMessage({
      accountId: "acct-invalid",
      message: "Change my email to not-an-email",
      conversationId: "conv-invalid",
    });

    expect(result.success).toBe(false);
    expect(result.reply).toContain("valid email");
    expect(mockUpdateAccountHolder).not.toHaveBeenCalled();
    expect(mockSendAccountChangeNotification).not.toHaveBeenCalled();
  });

  it("completes a booking across two turns after clarify (multi-turn continuation)", async () => {
    const accountId = "acct-multiturn";
    const conversationId = "conv-multiturn";

    mockParseIntent.mockResolvedValueOnce({
      action: "clarify",
      fields: {},
      missingFields: ["scheduledAt"],
    } as Awaited<ReturnType<typeof parseIntent>>);

    const turn1 = await handleChatMessage({
      accountId,
      message: "Can I book a call?",
      conversationId,
    });

    expect(turn1.success).toBe(false);
    expect(turn1.action).toBe("clarify");
    expect(mockBookCallAppointment).not.toHaveBeenCalled();

    mockParseIntent.mockResolvedValueOnce({
      action: "book_call_appointment",
      fields: {
        scheduledAt: "2030-01-15T10:00:00.000Z",
        phone: "+353871112222",
      },
      missingFields: [],
    } as Awaited<ReturnType<typeof parseIntent>>);
    mockBookCallAppointment.mockResolvedValueOnce({
      id: "appt-multiturn",
      scheduledAt: "2030-01-15T10:00:00.000Z",
      phone: "+353871112222",
      status: "scheduled",
    } as Awaited<ReturnType<typeof bookCallAppointment>>);

    const turn2 = await handleChatMessage({
      accountId,
      message: "Next Tuesday at 10am, +353871112222",
      conversationId,
    });
    expect(turn2.success).toBe(true);
    expect(turn2.callAppointment).toMatchObject({
      scheduledAt: "2030-01-15T10:00:00.000Z",
    });
    expect(mockBookCallAppointment).toHaveBeenCalledTimes(1);

    const allMessages = getRecentMessages(conversationId);
    expect(allMessages).toHaveLength(4);
    expect(allMessages[0]).toMatchObject({ content: "Can I book a call?" });
    expect(allMessages[2]).toMatchObject({
      content: "Next Tuesday at 10am, +353871112222",
    });
  });

  it("falls back to unsupported when parseIntent returns an action outside the known enum", async () => {
    mockParseIntent.mockResolvedValueOnce({
      action: "schedule_a_flight", // hallucinated: not a real ChatAction
      fields: {},
      missingFields: [],
    } as any);
    const result = await handleChatMessage({
      accountId: "acct-hallucinated",
      message: "Can you book me a flight?",
      conversationId: "conv-hallucinated",
    });

    expect(result.success).toBe(false);
    expect(result.action).toBe("unsupported");
    expect(mockUpdateAccountHolder).not.toHaveBeenCalled();
    expect(mockSendAccountChangeNotification).not.toHaveBeenCalled();
  });

  it("does not crash when parseIntent returns a garbled fields object", async () => {
    mockParseIntent.mockResolvedValueOnce({
      action: "update_account_holder",
      fields: null, // malformed — validator must handle this without throwing
      missingFields: [],
    } as any);

    const result = await handleChatMessage({
      accountId: "acct-garbled",
      message: "Update my details",
      conversationId: "conv-garbled",
    });

    expect(result.success).toBe(false);
    expect(mockUpdateAccountHolder).not.toHaveBeenCalled();
    expect(mockSendAccountChangeNotification).not.toHaveBeenCalled();
    expect(result.reply).toBeTruthy();
  });
});
