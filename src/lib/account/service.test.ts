import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccount, updateAccountHolder, updatePreferredContactMethod } from './service';

type MockDbRow = Record<string, unknown> | null;
let mockDbData: MockDbRow = null;
let mockDbError: { message: string } | null = null;

const mockChain = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => Promise.resolve({ data: mockDbData, error: mockDbError })),
};

vi.mock('@/lib/supabase/server', () => ({
    supabaseServer: {
        from: vi.fn(() => mockChain),
    },
}));

const validDbRow = {
    account_id: 'acc_123',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane.doe@example.com',
    phone: '+353871234567',
    address_line1: '100 Main Street',
    address_line2: null,
    city: 'Dublin',
    postal_code: 'DO2',
    country: 'Ireland',
    preferred_contact_method: 'email',
    reference: 'REF-001',
    creditor_name: 'Global Bank',
    currency: 'EUR',
    balance_cents: 10000,
    status: 'active',
    days_past_due: 0,
    minimum_payment_cents: 1000,
    last_payment_date: '2026-07-01',
    last_payment_amount_cents: 5000,
};

describe('Account Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbData = validDbRow;
        mockDbError = null;
    });

    describe('getAccount', () => {
        it('returns a mapped account when a valid ID is provided', async () => {
            const account = await getAccount('acc_123');

            expect(account.account.accountId).toBe('acc_123');
            expect(account.account.accountHolderFirstName).toBe('Jane');
            expect(mockChain.eq).toHaveBeenCalledWith('account_id', 'acc_123');
        });

        it('throws an error if the account is not found or DB errors', async () => {
            mockDbData = null;
            mockDbError = { message: 'Row not found' };

            await expect(getAccount('invalid_id')).rejects.toThrow();
        });
    });


    describe('updateAccountHolder', () => {
        describe('Valid Inputs', () => {
            it('successfully updates a single valid field (email)', async () => {
                const result = await updateAccountHolder('acc_123', { email: 'new@example.com' });
                expect(mockChain.update).toHaveBeenCalledWith({ email: 'new@example.com' });
                expect(result.email).toBe('jane.doe@example.com'); // Mock returns validDbRow
            });

            it('successfully updates all valid fields simultaneously', async () => {
                await updateAccountHolder('acc_123', {
                    firstName: 'John',
                    lastName: 'Smith',
                    email: 'john@example.com',
                    phone: '+12345678901',
                    address: {
                        line1: '1 New Way',
                        city: 'Dublin',
                        postalCode: 'D01',
                        country: 'Ireland'
                    }
                });

                expect(mockChain.update).toHaveBeenCalledWith({
                    first_name: 'John',
                    last_name: 'Smith',
                    email: 'john@example.com',
                    phone: '+12345678901',
                    address_line1: '1 New Way',
                    address_line2: null,
                    city: 'Dublin',
                    postal_code: 'D01',
                    country: 'Ireland'
                });
            });
        });


        describe('Invalid Inputs (Validation Errors)', () => {
            it('rejects an empty first name', async () => {
                await expect(updateAccountHolder('acc_123', { firstName: '   ' }))
                    .rejects.toThrow('First name cannot be empty');
            });

            it('rejects an invalid email format', async () => {
                await expect(updateAccountHolder('acc_123', { email: 'not-an-email' }))
                    .rejects.toThrow('Email address is not valid.');
            });

            it('rejects a phone number missing the + prefix', async () => {
                await expect(updateAccountHolder('acc_123', { phone: '0871234567' }))
                    .rejects.toThrow("Phone must start with '+' followed by 10 to 15 digits");
            });

            it('rejects a phone number with too few digits', async () => {
                await expect(updateAccountHolder('acc_123', { phone: '+123' }))
                    .rejects.toThrow("Phone must start with '+'");
            });

            it('rejects an incomplete address', async () => {
                await expect(updateAccountHolder('acc_123', {
                    address: { line1: '100 Main St', city: 'Dublin' } // Missing country/postal
                })).rejects.toThrow('Address is incomplete');
            });

            it('rejects an empty payload', async () => {
                await expect(updateAccountHolder('acc_123', {}))
                    .rejects.toThrow('No fields provided to update');
            });
            it('updates last name into the correct column, not first name', async () => {
                await updateAccountHolder('acc_123', { lastName: 'OnlyLastNameChanged' });
                expect(mockChain.update).toHaveBeenCalledWith({ last_name: 'OnlyLastNameChanged' });
            });
        });

        describe('Database Errors', () => {
            it('throws an error if the database update fails', async () => {
                mockDbData = null;
                mockDbError = { message: 'Permission denied' };

                await expect(updateAccountHolder('acc_123', { firstName: 'Mark' }))
                    .rejects.toThrow('Failed to update account: Permission denied');
            });
        });
    });

    // updatePreferredContactMethod
    describe('updatePreferredContactMethod', () => {
        it('successfully updates to a valid method (sms)', async () => {
            await updatePreferredContactMethod('acc_123', 'sms');

            expect(mockChain.update).toHaveBeenCalledWith({ preferred_contact_method: 'sms' });
            expect(mockChain.eq).toHaveBeenCalledWith('account_id', 'acc_123');
        });

        it('rejects an invalid contact method', async () => {
            // @ts-expect-error - Intentionally testing invalid enum bypass
            await expect(updatePreferredContactMethod('acc_123', 'carrier_pigeon'))
                .rejects.toThrow("Invalid contact method. Must be 'email', 'sms', or 'phone'.");
        });

        it('throws an error if the database update fails', async () => {
            mockDbData = null;
            mockDbError = { message: 'Update restricted' };

            await expect(updatePreferredContactMethod('acc_123', 'email'))
                .rejects.toThrow('Failed to update preferred contact method');
        });
    });
})
