import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    listRelatedPeople,
    addRelatedPerson,
    updateRelatedPerson,
    removeRelatedPerson,
    findRelatedPersonByName
} from './service';


type MockDbRow = unknown | null;
let mockDbData: MockDbRow = null;
let mockDbError: { message: string } | null = null;

const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => Promise.resolve({ data: mockDbData, error: mockDbError })),
    // Handles terminal execution for list/delete operations that do not call .single()
    then: vi.fn().mockImplementation((resolve) => resolve({ data: mockDbData, error: mockDbError })),
};

vi.mock('@/lib/supabase/server', () => ({
    supabaseServer: {
        from: vi.fn(() => mockChain),
    },
}));

// TEST DATA
const validPersonRow = {
    id: 'person_uuid_01',
    account_holder_id: 'acc_uuid_01',
    name: 'John Murphy',
    email: 'john.murphy@example.test',
    phone: '+353831987654',
    relationship: 'spouse',
    authorized_to_act: false,
    created_at: '2026-06-20T10:15:00Z',
};

describe('Related People Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbData = [validPersonRow];
        mockDbError = null;
    });


    // listRelatedPeople
    describe('listRelatedPeople', () => {
        it('returns an array of mapped related people', async () => {
            const result = await listRelatedPeople('acc_uuid_01');

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('person_uuid_01');
            expect(result[0].name).toBe('John Murphy');
            expect(result[0].authorizedToAct).toBe(false);
            expect(mockChain.eq).toHaveBeenCalledWith('account_holder_id', 'acc_uuid_01');
        });

        it('throws an error if database retrieval fails', async () => {
            mockDbData = null;
            mockDbError = { message: 'Connection timeout' };

            await expect(listRelatedPeople('acc_uuid_01')).rejects.toThrow('Failed to list related people: Connection timeout');
        });
    });


    // addRelatedPerson
    describe('addRelatedPerson', () => {
        beforeEach(() => {
            mockDbData = validPersonRow; // single() returns an object for insert/update
        });

        describe('Valid Inputs', () => {
            it('successfully adds and maps a valid related person', async () => {
                const result = await addRelatedPerson('acc_uuid_01', {
                    name: 'Jane Doe',
                    email: 'jane.doe@example.test',
                    phone: '+353871234567',
                    relationship: 'sibling',
                    authorizedToAct: true,
                });

                expect(mockChain.insert).toHaveBeenCalledWith({
                    account_holder_id: 'acc_uuid_01',
                    name: 'Jane Doe',
                    email: 'jane.doe@example.test',
                    phone: '+353871234567',
                    relationship: 'sibling',
                    authorized_to_act: true,
                });
                expect(result.name).toBe('John Murphy'); // Reflected from mock return value
            });
        });

        describe('Invalid Inputs (Validation Errors)', () => {
            it('rejects an empty name', async () => {
                await expect(addRelatedPerson('acc_uuid_01', {
                    name: '   ',
                    email: 'test@example.test',
                    phone: '+353871234567',
                    authorizedToAct: false,
                })).rejects.toThrow('Name cannot be empty.');
            });

            it('rejects an invalid email format', async () => {
                await expect(addRelatedPerson('acc_uuid_01', {
                    name: 'Mark',
                    email: 'bad-email',
                    phone: '+353871234567',
                    authorizedToAct: false,
                })).rejects.toThrow('Invalid email format.');
            });

            it('rejects an invalid phone format', async () => {
                await expect(addRelatedPerson('acc_uuid_01', {
                    name: 'Mark',
                    email: 'mark@example.test',
                    phone: '0871234567', // Missing + prefix
                    authorizedToAct: false,
                })).rejects.toThrow("Phone must start with '+' followed by 10 to 15 digits.");
            });
        });

        describe('Database Errors', () => {
            it('throws an error if database insertion fails', async () => {
                mockDbData = null;
                mockDbError = { message: 'Unique constraint violation' };

                await expect(addRelatedPerson('acc_uuid_01', {
                    name: 'Valid Name',
                    email: 'valid@example.test',
                    phone: '+353871234567',
                    authorizedToAct: false,
                })).rejects.toThrow('Failed to add related person: Unique constraint violation');
            });
        });
    });

    // updateRelatedPerson
    describe('updateRelatedPerson', () => {
        beforeEach(() => {
            mockDbData = validPersonRow;
        });

        describe('Valid Inputs', () => {
            it('successfully updates specified fields', async () => {
                const result = await updateRelatedPerson('acc_uuid_01', 'person_uuid_01', {
                    name: 'Updated Name',
                    authorizedToAct: true,
                });

                expect(mockChain.update).toHaveBeenCalledWith({
                    name: 'Updated Name',
                    authorized_to_act: true,
                });
                expect(result.id).toBe('person_uuid_01');
            });
        });

        describe('Invalid Inputs', () => {
            it('rejects an empty name update', async () => {
                await expect(updateRelatedPerson('acc_uuid_01', 'person_uuid_01', { name: '' }))
                    .rejects.toThrow('Name cannot be empty.');
            });

            it('rejects an invalid email update', async () => {
                await expect(updateRelatedPerson('acc_uuid_01', 'person_uuid_01', { email: 'not-an-email' }))
                    .rejects.toThrow('Invalid email format.');
            });

            it('rejects an empty payload', async () => {
                await expect(updateRelatedPerson('acc_uuid_01', 'person_uuid_01', {}))
                    .rejects.toThrow('No fields provided to update.');
            });
        });

        describe('Database Errors', () => {
            it('throws an error if the record does not exist or security check fails', async () => {
                mockDbData = null;
                mockDbError = { message: 'Not found' };

                await expect(updateRelatedPerson('acc_uuid_01', 'fake_id', { name: 'New Name' }))
                    .rejects.toThrow('Failed to update related person');
            });
        });
    });

    // removeRelatedPerson
    describe('removeRelatedPerson', () => {
        it('successfully deletes a related person', async () => {
            mockDbData = [validPersonRow];
            mockDbError = null;

            await expect(removeRelatedPerson('acc_uuid_01', 'person_uuid_01')).resolves.not.toThrow();
            expect(mockChain.delete).toHaveBeenCalled();
            expect(mockChain.eq).toHaveBeenCalledWith('id', 'person_uuid_01');
            expect(mockChain.eq).toHaveBeenCalledWith('account_holder_id', 'acc_uuid_01');
        });

        it('throws an error if the person does not exist (empty result)', async () => {
            mockDbData = [];
            mockDbError = null;

            await expect(removeRelatedPerson('acc_uuid_01', 'person_uuid_01'))
                .rejects.toThrow('Related person not found on this account.');
        });

        it('throws an error if deletion fails on the database', async () => {
            mockDbData = null;
            mockDbError = { message: 'Foreign key constraint' }

            await expect(removeRelatedPerson('acc_uuid_01', 'person_uuid_01'))
                .rejects.toThrow('Failed to remove related person: Foreign key constraint');
        })
    });

    // findRelatedPersonByName
    describe('findRelatedPersonByName', () => {
        it('returns an array of matched related people', async () => {
            const result = await findRelatedPersonByName('acc_uuid_01', 'John');

            expect(result).toHaveLength(1);
            expect(mockChain.ilike).toHaveBeenCalledWith('name', '%John%');
        });

        it('throws an error if the search query fails', async () => {
            mockDbData = null;
            mockDbError = { message: 'Query error' };

            await expect(findRelatedPersonByName('acc_uuid_01', 'John'))
                .rejects.toThrow('Failed to search related people: Query error');
        });
    });
});