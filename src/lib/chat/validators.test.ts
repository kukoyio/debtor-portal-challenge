import { describe, it, expect } from "vitest";
import {
  validateUpdateAccountHolder,
  validateUpdatePreferredContactMethod,
  validateAddRelatedPerson,
  validateUpdateRelatedPerson,
  validateRemoveRelatedPerson,
  validateCreatePromiseToPay,
  validateMockPayment,
  validateBookCallAppointment,
} from "./validators";

describe("Chat Validators", () => {
  describe("validateUpdateAccountHolder", () => {
    it("accepts a single valid field", () => {
      const result = validateUpdateAccountHolder({ email: "jane@example.test" });
      expect(result.valid).toBe(true);
    });

    it("rejects an empty payload with a reason, not a missing field", () => {
      const result = validateUpdateAccountHolder({});
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("at least one field");
      }
    });

    it("rejects an invalid email as a reason (not missingFields)", () => {
      const result = validateUpdateAccountHolder({ email: "not-an-email" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("valid email");
        expect(result.missingFields).toHaveLength(0);
      }
    });
  });

  describe("validateUpdatePreferredContactMethod", () => {
    it("accepts a valid method", () => {
      const result = validateUpdatePreferredContactMethod({ contactMethod: "sms" });
      expect(result.valid).toBe(true);
    });

    it("reports contactMethod as missing when omitted entirely", () => {
      const result = validateUpdatePreferredContactMethod({});
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.missingFields).toContain("contactMethod");
      }
    });

    it("rejects an invalid method as a reason, not missing", () => {
      const result = validateUpdatePreferredContactMethod({ contactMethod: "carrier_pigeon" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.missingFields).not.toContain("contactMethod");
        expect(result.reason).toBeDefined();
      }
    });
  });

  describe("validateAddRelatedPerson", () => {
    const validPerson = {
      name: "Mark Murphy",
      email: "mark@example.test",
      phone: "+353831998877",
    };

    it("accepts a valid person and defaults authorizedToAct to false when omitted", () => {
      const result = validateAddRelatedPerson(validPerson);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.fields.authorizedToAct).toBe(false);
      }
    });

    it("respects an explicit authorizedToAct: true", () => {
      const result = validateAddRelatedPerson({ ...validPerson, authorizedToAct: true });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.fields.authorizedToAct).toBe(true);
      }
    });

    it("reports missing required fields by name", () => {
      const result = validateAddRelatedPerson({ name: "Mark" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.missingFields).toContain("email");
        expect(result.missingFields).toContain("phone");
      }
    });

    it("rejects an invalid phone as a reason, not missingFields", () => {
      const result = validateAddRelatedPerson({ ...validPerson, phone: "0871234567" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.missingFields).not.toContain("phone");
        expect(result.reason).toBeDefined();
      }
    });
  });

  describe("validateUpdateRelatedPerson", () => {
    it("requires personName", () => {
      const result = validateUpdateRelatedPerson({ phone: "+353831998877" });
      expect(result.valid).toBe(false);
    });

    it("rejects a payload with no actual change requested", () => {
      const result = validateUpdateRelatedPerson({ personName: "Mark" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("at least one change");
      }
    });

    it("accepts personName plus one changed field", () => {
      const result = validateUpdateRelatedPerson({ personName: "Mark", phone: "+353831998877" });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateRemoveRelatedPerson", () => {
    it("requires personName", () => {
      const result = validateRemoveRelatedPerson({});
      expect(result.valid).toBe(false);
    });

    it("accepts a valid personName", () => {
      const result = validateRemoveRelatedPerson({ personName: "Mark" });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateCreatePromiseToPay", () => {
    it("accepts a valid amount and date shape", () => {
      const result = validateCreatePromiseToPay({ amountCents: 50000, dueDate: "2026-08-01" });
      expect(result.valid).toBe(true);
    });

    it("rejects a zero or negative amount", () => {
      expect(validateCreatePromiseToPay({ amountCents: 0, dueDate: "2026-08-01" }).valid).toBe(false);
      expect(validateCreatePromiseToPay({ amountCents: -500, dueDate: "2026-08-01" }).valid).toBe(false);
    });

    it("rejects a malformed date string", () => {
      const result = validateCreatePromiseToPay({ amountCents: 5000, dueDate: "1st August" });
      expect(result.valid).toBe(false);
    });

    it("reports missing fields by name when omitted entirely", () => {
      const result = validateCreatePromiseToPay({});
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.missingFields).toContain("amountCents");
        expect(result.missingFields).toContain("dueDate");
      }
    });

    it("does NOT reject a past date — that's the service layer's job, not this schema", () => {
      const result = validateCreatePromiseToPay({ amountCents: 5000, dueDate: "2020-01-01" });
      expect(result.valid).toBe(true);
    });
  });

  describe("validateMockPayment", () => {
    it("accepts a positive amount", () => {
      expect(validateMockPayment({ amountCents: 15000 }).valid).toBe(true);
    });

    it("rejects zero or negative amounts", () => {
      expect(validateMockPayment({ amountCents: 0 }).valid).toBe(false);
      expect(validateMockPayment({ amountCents: -1 }).valid).toBe(false);
    });

    it("reports amountCents as missing when omitted", () => {
      const result = validateMockPayment({});
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.missingFields).toContain("amountCents");
      }
    });
  });

  describe("validateBookCallAppointment", () => {
    it("accepts a valid future datetime and phone", () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const result = validateBookCallAppointment({ scheduledAt: future, phone: "+353831998877" });
      expect(result.valid).toBe(true);
    });

    it("rejects a past datetime", () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = validateBookCallAppointment({ scheduledAt: past, phone: "+353831998877" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("future");
      }
    });

    it("reports missing required fields when omitted entirely", () => {
      const result = validateBookCallAppointment({});
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.missingFields).toContain("scheduledAt");
        expect(result.missingFields).toContain("phone");
      }
    });
  });
});