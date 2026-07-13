import { AccountHolder } from "./types";

export function validateEmail(email: string): boolean {
    // basic shape check (something@something.something), reject if empty or malformed.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateName(name: string): boolean {
    // Reject if empty or only whitespace
    return name.trim().length > 0;
}

export function validatePhone(phone: string): boolean {
    // Must start with '+' followed by 10-15 digits
    return /^\+[0-9]{10,15}$/.test(phone);
}

export function validateAddress(address: Partial<AccountHolder['address']>): boolean {
    // Line 1, City, Postal Code, and Country are mandatory non-empty strings
    return !!(
        address.line1?.trim() &&
        address.city?.trim() &&
        address.postalCode?.trim() &&
        address.country?.trim()
    );
}