import { z } from "zod";
import {
  validateEmail,
  validateAddress,
  validateName,
  validatePhone,
} from "../account/validators";

const emailSchema = z.string().refine((val) => validateEmail(val), {
  message: "Please provide a valid email address.",
});

const phoneSchema = z.string().refine((val) => validatePhone(val), {
  message:
    "Phone number must start with '+' followed by 10 to 15 digits (e.g., +353871234567).",
});

const nameSchema = z.string().refine((val) => validateName(val), {
  message: "Name cannot be empty or blank.",
});

const AddressSchema = z
  .object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    postalCode: z.string(),
    country: z.string(),
  })
  .refine((addr) => validateAddress(addr), {
    message:
      "Street address (Line 1), City, Postal Code, and Country are all required.",
  });

const UpdateAccountHolderSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    address: AddressSchema.optional(),
  })
  .refine(
    (data) =>
      data.firstName ||
      data.lastName ||
      data.email ||
      data.phone ||
      data.address,
    {
      message:
        "You must supply at least one field to update (first name, last name, email, phone, or address).",
    },
  );

const UpdatePreferredContactMethodSchema = z.object({
  contactMethod: z.enum(["email", "sms", "phone"], {
    message: "Preferred contact method must be 'email', 'sms', or 'phone'.",
  }),
});

const AddRelatedPersonSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  relationship: z.string().optional(),
  authorizedToAct: z.boolean().default(false),
});

const UpdateRelatedPersonSchema = z
  .object({
    personName: z
      .string()
      .min(1, "We need the name of the related person you wish to update."),
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    relationship: z.string().optional(),
    authorizedToAct: z.coerce.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name ||
      data.email ||
      data.phone ||
      data.relationship ||
      data.authorizedToAct !== undefined,
    {
      message:
        "Please specify at least one change for this related person (name, email, phone, relationship, or authorization status).",
    },
  );

const RemoveRelatedPersonSchema = z.object({
  personName: z
    .string()
    .min(1, "We need the name of the person you want to remove."),
});

// Future-date business rule intentionally lives in promises/service.ts,
const CreatePromiseToPaySchema = z.object({
  amountCents: z.coerce
    .number()
    .int()
    .positive("Amount must be a positive number of cents."),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must match YYYY-MM-DD format."),
});

const MockPaymentSchema = z.object({
  amountCents: z.coerce
    .number()
    .int()
    .positive("Payment amount must be greater than zero."),
});

const BookCallAppointmentSchema = z
  .object({
    scheduledAt: z.string().datetime({
      message: "Invalid date-time format. Must be a valid ISO 8601 string.",
    }),
    phone: phoneSchema.optional(),
    reason: z.string().optional(),
  })
  .refine(
    (data) => {
      const appointmentDate = new Date(data.scheduledAt);
      return appointmentDate > new Date();
    },
    {
      message: "Appointments can only be booked for a future date and time.",
      path: ["scheduledAt"],
    },
  );

export type ValidationResult<T> =
  | { valid: true; fields: T }
  | { valid: false; missingFields: string[]; reason?: string };

// Reads a value at a dot-path (e.g. "address.line1") from the raw input,
// so we can tell "field was missing" apart from "field was invalid" without
// depending on Zod's internal issue metadata (which varies across versions).
function getValueAtPath(input: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    return (acc as Record<PropertyKey, unknown>)[key];
  }, input);
}

function handleValidationError<T>(
  error: z.ZodError,
  input: unknown,
): ValidationResult<T> {
  const missingFields: string[] = [];
  const reasons: string[] = [];

  for (const issue of error.issues) {
    const fieldPath = issue.path.join(".") || "payload";
    const rawValue = getValueAtPath(input, issue.path);

    const isMissing =
      rawValue === undefined || rawValue === null || rawValue === "";

    if (isMissing) {
      missingFields.push(fieldPath);
    } else {
      reasons.push(issue.message);
    }
  }

  return {
    valid: false,
    missingFields,
    reason: reasons.length > 0 ? reasons.join(" ") : undefined,
  };
}

function runValidator<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
): ValidationResult<z.infer<Schema>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { valid: true, fields: result.data };
  }
  return handleValidationError<z.infer<Schema>>(result.error, input);
}

// Individual validation action exports called by action-router.ts
export const validateUpdateAccountHolder = (input: unknown) =>
  runValidator(UpdateAccountHolderSchema, input);
export const validateUpdatePreferredContactMethod = (input: unknown) =>
  runValidator(UpdatePreferredContactMethodSchema, input);
export const validateAddRelatedPerson = (input: unknown) =>
  runValidator(AddRelatedPersonSchema, input);
export const validateUpdateRelatedPerson = (input: unknown) =>
  runValidator(UpdateRelatedPersonSchema, input);
export const validateRemoveRelatedPerson = (input: unknown) =>
  runValidator(RemoveRelatedPersonSchema, input);
export const validateCreatePromiseToPay = (input: unknown) =>
  runValidator(CreatePromiseToPaySchema, input);
export const validateMockPayment = (input: unknown) =>
  runValidator(MockPaymentSchema, input);
export const validateBookCallAppointment = (input: unknown) =>
  runValidator(BookCallAppointmentSchema, input);
