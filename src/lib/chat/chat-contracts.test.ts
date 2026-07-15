import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatMessage } from "./action-router";
import { parseIntent } from "./intent-parser";
import {
  getAccount,
  getInternalAccountId,
  updateAccountHolder,
} from "../account/service";
import { addRelatedPerson } from "../related-people/service";
import { createPromiseToPay } from "../promises/service";
import { makePayment } from "../payments/service";
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
const mockMakePayment = vi.mocked(makePayment);
const mockBookCallAppointment = vi.mocked(bookCallAppointment);
const mockSendAccountChangeNotification = vi.mocked(
  sendAccountChangeNotification,
);

function buildAccountSnapshot() {
  return {
    account: {
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
    vi.clearAllMocks();
    mockGetInternalAccountId.mockResolvedValue("internal-account-1");
    mockGetAccount.mockResolvedValue(buildAccountSnapshot() as any);
    mockSendAccountChangeNotification.mockResolvedValue({
      notificationId: "notif-001",
      sent: true,
      redactedRecipient: "j***@example.test",
    } as any);
  });

  it("updates the account holder phone number and queues a redacted notification", async () => {
    const accountId = "acct-001";
    const conversationId = "conv-update-account";
    const message = "Update my phone number to +353871112222";

    mockParseIntent.mockResolvedValue({
      action: "update_account_holder",
      fields: { phone: "+353871112222" },
      missingFields: [],
    } as any);
    mockUpdateAccountHolder.mockResolvedValue({
      id: "holder-1",
      phone: "+353871112222",
    } as any);

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
      .results[0].value) as any;
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
    } as any);
    mockAddRelatedPerson.mockResolvedValue({
      id: "rel-1",
      name: "Jamie Doe",
      email: "jamie@example.test",
      phone: "+353871112222",
      authorizedToAct: true,
      relationship: "friend",
    } as any);

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
      .value) as any;
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
    } as any);
    mockCreatePromiseToPay.mockResolvedValue({
      id: "promise-1",
      amountCents: 50000,
      currency: "EUR",
      dueDate: futureDueDate,
      status: "pending",
    } as any);

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
    } as any);
    mockMakePayment.mockResolvedValue({
      transaction: {
        id: "txn-1",
        amountCents: 15000,
        currency: "EUR",
      },
      newBalanceCents: 85000,
    } as any);

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
    } as any);
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
    } as any);
    mockBookCallAppointment.mockResolvedValue({
      id: "appt-1",
      scheduledAt: futureScheduledAt,
      phone: "+353871112222",
      reason: "General Account Discussion",
      status: "scheduled",
    } as any);

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
    } as any);
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
    } as any);

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
    } as any);

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
});
