import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listFutureCallAppointments, bookCallAppointment } from "./service"; // Adjust if path differs
import { validatePhone } from "../account/validators";

let mockDbData: any = null;
let mockDbError: any = null;

const mockChain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gt: vi.fn().mockReturnThis(),
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

// Mock the phone validator module so we can control validation results easily
vi.mock("../account/validators", () => ({
  validatePhone: vi.fn(),
}));

describe("Call Appointments Service", () => {
  const mockAccountId = "acc_uuid_99";

  const mockAppointmentRow = {
    id: "appt_01",
    scheduled_at: "2026-07-14T12:00:00.000Z",
    phone: "+12345678901",
    reason: "Billing inquiry ", // trailing space to test trim logic
    status: "scheduled",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbData = null;
    mockDbError = null;

    // Freeze system time at a reliable moment in 2026
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
  });

  afterEach(() => {
    // Restore normal system time behavior
    vi.useRealTimers();
  });

  // ==========================================
  // TESTS: listFutureCallAppointments
  // ==========================================
  describe("listFutureCallAppointments", () => {
    it("successfully fetches and maps future appointments", async () => {
      mockDbData = [mockAppointmentRow];
      mockDbError = null;

      const result = await listFutureCallAppointments(mockAccountId);

      // Verify returned maps match interface expectations (camelCase conversion)
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "appt_01",
        scheduledAt: "2026-07-14T12:00:00.000Z",
        phone: "+12345678901",
        reason: "Billing inquiry ",
        status: "scheduled",
      });

      // Assert queries targeted correct filters
      expect(mockChain.eq).toHaveBeenCalledWith(
        "account_holder_id",
        mockAccountId,
      );
      expect(mockChain.eq).toHaveBeenCalledWith("status", "scheduled");
      expect(mockChain.gt).toHaveBeenCalledWith(
        "scheduled_at",
        "2026-07-14T10:00:00.000Z",
      );
    });

    it("throws custom error if database call fails", async () => {
      mockDbData = null;
      mockDbError = { message: "Network Timeout" };

      await expect(listFutureCallAppointments(mockAccountId)).rejects.toThrow(
        "Failed to list future appointments: Network Timeout",
      );
    });
  });

  describe("bookCallAppointment", () => {
    it("throws validation error if phone format is invalid", async () => {
      // Mock validation failure
      vi.mocked(validatePhone).mockReturnValueOnce(false);

      const payload = {
        scheduledAt: "2026-07-14T12:00:00.000Z",
        phone: "invalid-phone",
      };

      await expect(bookCallAppointment(mockAccountId, payload)).rejects.toThrow(
        "Phone must start with '+' followed by 10 to 15 digits.",
      );
    });

    it("throws error if date format is invalid", async () => {
      vi.mocked(validatePhone).mockReturnValueOnce(true);

      const payload = {
        scheduledAt: "this-is-not-a-date",
        phone: "+12345678901",
      };

      await expect(bookCallAppointment(mockAccountId, payload)).rejects.toThrow(
        "Invalid date format. Please provide a valid date and time.",
      );
    });

    it("throws error if date is in the past", async () => {
      vi.mocked(validatePhone).mockReturnValueOnce(true);

      const payload = {
        // One hour in the past relative to frozen time: 10:00:00
        scheduledAt: "2026-07-14T09:00:00.000Z",
        phone: "+12345678901",
      };

      await expect(bookCallAppointment(mockAccountId, payload)).rejects.toThrow(
        "Cannot book a call in the past. Please select a future date and time.",
      );
    });

    it("throws error if database insert fails", async () => {
      vi.mocked(validatePhone).mockReturnValueOnce(true);
      mockDbData = null;
      mockDbError = { message: "Unique constraint violation" };

      const payload = {
        scheduledAt: "2026-07-14T12:00:00.000Z",
        phone: "+12345678901",
      };

      await expect(bookCallAppointment(mockAccountId, payload)).rejects.toThrow(
        "Failed to book call appointment: Unique constraint violation",
      );
    });

    it("successfully books and returns mapped appointment (with trimmed reason)", async () => {
      vi.mocked(validatePhone).mockReturnValueOnce(true);

      // Simulate successful database return
      mockDbData = {
        ...mockAppointmentRow,
        reason: "Billing inquiry", // Trimming gets applied by service logic before sending
      };
      mockDbError = null;

      const payload = {
        scheduledAt: "2026-07-14T12:00:00.000Z",
        phone: "+12345678901",
        reason: "  Billing inquiry   ", // Payload with raw whitespaces
      };

      const result = await bookCallAppointment(mockAccountId, payload);

      // Verify return object uses correct TypeScript shape (camelCase)
      expect(result).toEqual({
        id: "appt_01",
        scheduledAt: "2026-07-14T12:00:00.000Z",
        phone: "+12345678901",
        reason: "Billing inquiry",
        status: "scheduled",
      });

      // Verify the insert payload trimmed the whitespace and resolved properties cleanly
      expect(mockChain.insert).toHaveBeenCalledWith({
        account_holder_id: mockAccountId,
        scheduled_at: "2026-07-14T12:00:00.000Z",
        phone: "+12345678901",
        reason: "Billing inquiry",
        status: "scheduled",
      });
    });
  });
});
