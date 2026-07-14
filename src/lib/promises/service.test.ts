import { describe, it, expect, vi, beforeEach } from "vitest";
import { listPromisesToPay, createPromiseToPay } from "./service";

// MOCKING SUPABASE
let mockDbData: any = null;
let mockDbError: any = null;

let mockCurrencyData: any = { currency: "EUR" };
let mockCurrencyError: any = null;
let currentTable: string | null = null;

const mockChain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockImplementation(() => {
    if (currentTable === "account_holders") {
      return Promise.resolve({
        data: mockCurrencyData,
        error: mockCurrencyError,
      });
    }
    return Promise.resolve({ data: mockDbData, error: mockDbError });
  }),
  then: vi.fn().mockImplementation((resolve) => {
    if (currentTable === "account_holders") {
      return resolve({ data: mockCurrencyData, error: mockCurrencyError });
    }
    return resolve({ data: mockDbData, error: mockDbError });
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: {
    from: vi.fn((table: string) => {
      currentTable = table;
      return mockChain;
    }),
  },
}));

// TEST DATA & HELPERS
const validPromiseRow = {
  id: "promise_uuid_01",
  account_holder_id: "acc_uuid_01",
  amount_cents: 25000,
  currency: "EUR",
  due_date: "2026-08-15",
  status: "active",
  created_at: "2026-07-01T10:00:00Z",
};

function formatDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const getFutureDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return formatDateOnly(d);
};

const getPastDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 5);
  return formatDateOnly(d);
};

const getTodayDateString = () => formatDateOnly(new Date());

describe("Promises to Pay Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbData = [validPromiseRow];
    mockDbError = null;

    mockCurrencyData = { currency: "EUR" };
    mockCurrencyError = null;
    currentTable = null;
  });

  // listPromisesToPay
  describe("listPromisesToPay", () => {
    it("returns an array of mapped promises to pay", async () => {
      const result = await listPromisesToPay("acc_uuid_01");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("promise_uuid_01");
      expect(result[0].amountCents).toBe(25000);
      expect(result[0].status).toBe("active");
      expect(mockChain.eq).toHaveBeenCalledWith(
        "account_holder_id",
        "acc_uuid_01",
      );
    });

    it("throws an error if database retrieval fails", async () => {
      mockDbData = null;
      mockDbError = { message: "Database offline" };

      await expect(listPromisesToPay("acc_uuid_01")).rejects.toThrow(
        "Failed to list Promises to pay: Database offline",
      );
    });
  });

  // createPromiseToPay
  describe("createPromiseToPay", () => {
    beforeEach(() => {
      mockDbData = validPromiseRow;
    });

    describe("Valid Inputs", () => {
      it("successfully creates and maps a valid promise to pay", async () => {
        const futureDate = getFutureDateString();
        const result = await createPromiseToPay("acc_uuid_01", {
          amountCents: 15000,
          dueDate: futureDate,
        });

        expect(mockChain.insert).toHaveBeenCalledWith({
          account_holder_id: "acc_uuid_01",
          amount_cents: 15000,
          due_date: futureDate,
          status: "active",
          currency: "EUR",
        });
        expect(result.id).toBe("promise_uuid_01");
      });
    });

    describe("Invalid Inputs (Validation Errors)", () => {
      it("rejects an amount of zero or less", async () => {
        await expect(
          createPromiseToPay("acc_uuid_01", {
            amountCents: 0,
            dueDate: getFutureDateString(),
          }),
        ).rejects.toThrow("Promise to pay amount must be greater than zero.");

        await expect(
          createPromiseToPay("acc_uuid_01", {
            amountCents: -500,
            dueDate: getFutureDateString(),
          }),
        ).rejects.toThrow("Promise to pay amount must be greater than zero.");
      });

      it("rejects an invalid date string format", async () => {
        await expect(
          createPromiseToPay("acc_uuid_01", {
            amountCents: 1000,
            dueDate: "not-a-real-date",
          }),
        ).rejects.toThrow(
          "Invalid due date format. Please provide a valid date.",
        );
      });

      it("rejects a past due date", async () => {
        await expect(
          createPromiseToPay("acc_uuid_01", {
            amountCents: 1000,
            dueDate: getPastDateString(),
          }),
        ).rejects.toThrow("Due date must be a future date.");
      });

      it("rejects due date set to today", async () => {
        await expect(
          createPromiseToPay("acc_uuid_01", {
            amountCents: 1000,
            dueDate: getTodayDateString(),
          }),
        ).rejects.toThrow("Due date must be a future date.");
      });
    });

    describe("Database Errors", () => {
      it("throws an error if database insertion fails", async () => {
        mockDbData = null;
        mockDbError = { message: "Insert constraint failed" };

        mockCurrencyData = { currency: "EUR" };
        mockCurrencyError = null;
        
        await expect(
          createPromiseToPay("acc_uuid_01", {
            amountCents: 5000,
            dueDate: getFutureDateString(),
          }),
        ).rejects.toThrow(
          "Failed to create promise to pay: Insert constraint failed",
        );
      });
    });
  });
});
