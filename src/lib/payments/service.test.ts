import { describe, it, expect, vi, beforeEach } from "vitest";
import { listTransactions, makePayment } from "./service";

// Variables to control what the mock database returns in each test
let mockDbData: any = null;
let mockDbError: any = null;

// The chainable mock object
const mockChain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve({ data: mockDbData, error: mockDbError }),
    ),
  then: vi
    .fn()
    .mockImplementation((resolve) =>
      resolve({ data: mockDbData, error: mockDbError }),
    ),
};

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: {
    from: vi.fn(() => mockChain),
  },
}));

const mockTransactionRow = {
  id: "transaction_uuid_01",
  type: "payment",
  status: "completed",
  amount_cents: 1000,
  currency: "EUR",
  description: "Mocked chat payment",
  created_at: "2026-07-14T08:00:00Z",
};

describe("Transaction Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbData = null;
    mockDbError = null;
  });

  describe("listTransactions", () => {
    it("returns an array of mapped transactions", async () => {
      mockDbData = [mockTransactionRow];
      mockDbError = null;

      const result = await listTransactions("acc_uuid_01");

      expect(result).toHaveLength(1);
      expect(result[0].amountCents).toBe(1000);
      expect(mockChain.eq).toHaveBeenCalledWith(
        "account_holder_id",
        "acc_uuid_01",
      );
    });

    it("throws an error if database retrieval fails", async () => {
      mockDbData = null;
      mockDbError = { message: "Database down" };

      await expect(listTransactions("acc_uuid_01")).rejects.toThrow(
        "Failed to list transactions: Database down",
      );
    });
  });

  describe("makePayment", () => {
    it("rejects an amount of zero or less", async () => {
      await expect(makePayment("acc_uuid_01", 0)).rejects.toThrow(
        "Payment amount must be greater than zero.",
      );
      await expect(makePayment("acc_uuid_01", -500)).rejects.toThrow(
        "Payment amount must be greater than zero.",
      );
    });

    it("throws an error if account fetch fails", async () => {
      mockDbError = { message: "Account not found" };
      await expect(makePayment("acc_uuid_01", 1000)).rejects.toThrow(
        "Failed to fetch account balance: Account not found",
      );
    });

    it("rejects payment if amount exceeds current balance", async () => {
      mockDbData = { balance_cents: 500, currency: "EUR" };
      await expect(makePayment("acc_uuid_01", 1000)).rejects.toThrow(
        "Payment amount exceeds current balance.",
      );
    });

    it("throws an error if inserting the transaction fails", async () => {
      mockChain.single.mockResolvedValueOnce({
        data: { balance_cents: 5000, currency: "EUR" },
        error: null,
      });
      mockChain.single.mockResolvedValueOnce({
        data: null,
        error: { message: "Insert failed" },
      });
      await expect(makePayment("acc_uuid_01", 1000)).rejects.toThrow(
        "Failed to record payment transaction: Insert failed",
      );
    });

    it("throws an error if updating the account balance fails", async () => {
      mockChain.single.mockResolvedValueOnce({
        data: { balance_cents: 5000 },
        error: null,
      });
      mockChain.single.mockResolvedValueOnce({
        data: mockTransactionRow,
        error: null,
      });
      mockChain.then.mockImplementationOnce((resolve: any) =>
        resolve({ data: null, error: { message: "Update failed" } }),
      );
      await expect(makePayment("acc_uuid_01", 1000)).rejects.toThrow(
        "Payment recorded but failed to update account balance: Update failed",
      );
    });

    it("successfully processes a valid payment", async () => {
      mockChain.single.mockResolvedValueOnce({
        data: { balance_cents: 5000 },
        error: null,
      });
      mockChain.single.mockResolvedValueOnce({
        data: mockTransactionRow,
        error: null,
      });
      mockChain.then.mockImplementationOnce((resolve: any) =>
        resolve({ data: null, error: null }),
      );
      const result = await makePayment("acc_uuid_01", 1000);
      expect(result.newBalanceCents).toBe(4000);
      expect(result.transaction.amountCents).toBe(1000);
      expect(mockChain.update).toHaveBeenCalledWith({ balance_cents: 4000 });
      expect(mockChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ transaction_date: expect.any(String) }),
      );
    });
  });
});
