import { supabaseServer } from '@/lib/supabase/server';
import { RelatedPerson } from '@/lib/account/types';
import { validateName, validateEmail, validatePhone } from '@/lib/account/validators';

// Converts a raw Supabase row into the app's RelatedPerson shape.
function mapRelatedPersonRow(row: any): RelatedPerson {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        relationship: row.relationship ?? undefined,
        authorizedToAct: row.authorized_to_act,
    };
}

export async function listRelatedPeople(internalAccountId: string): Promise<RelatedPerson[]> {
    const { data, error } = await supabaseServer
        .from('related_people')
        .select('*')
        .eq('account_holder_id', internalAccountId);

    if (error) {
        throw new Error(`Failed to list related people: ${error.message}`);
    }

    return (data || []).map(mapRelatedPersonRow);
}

export async function addRelatedPerson(
    internalAccountId: string,
    payload: {
        name: string;
        email: string;
        phone: string;
        relationship?: string;
        authorizedToAct: boolean;
    }
): Promise<RelatedPerson> {
    if (!validateName(payload.name)) throw new Error("Name cannot be empty.");
    if (!validateEmail(payload.email)) throw new Error("Invalid email format.");
    if (!validatePhone(payload.phone)) throw new Error("Phone must start with '+' followed by 10 to 15 digits.");

    const { data, error } = await supabaseServer
        .from('related_people')
        .insert({
            account_holder_id: internalAccountId,
            name: payload.name.trim(),
            email: payload.email.trim(),
            phone: payload.phone,
            relationship: payload.relationship?.trim() || null,
            authorized_to_act: payload.authorizedToAct,
        })
        .select()
        .single();

    if (error || !data) {
        throw new Error(`Failed to add related person: ${error?.message}`);
    }

    return mapRelatedPersonRow(data);
}

export async function updateRelatedPerson(
    internalAccountId: string,
    personId: string,
    fields: Partial<{
        name: string;
        email: string;
        phone: string;
        relationship: string;
        authorizedToAct: boolean;
    }>
): Promise<RelatedPerson> {
    const updatePayload: Record<string, any> = {};

    if (fields.name !== undefined) {
        if (!validateName(fields.name)) throw new Error("Name cannot be empty.");
        updatePayload.name = fields.name.trim();
    }

    if (fields.email !== undefined) {
        if (!validateEmail(fields.email)) throw new Error("Invalid email format.");
        updatePayload.email = fields.email.trim();
    }

    if (fields.phone !== undefined) {
        if (!validatePhone(fields.phone)) throw new Error("Phone must start with '+' followed by 10 to 15 digits.");
        updatePayload.phone = fields.phone;
    }

    if (fields.relationship !== undefined)
        updatePayload.relationship = fields.relationship.trim() || null;

    if (fields.authorizedToAct !== undefined)
        updatePayload.authorized_to_act = fields.authorizedToAct;

    if (Object.keys(updatePayload).length === 0)
        throw new Error("No fields provided to update.");

    const { data, error } = await supabaseServer
        .from('related_people')
        .update(updatePayload)
        .eq('id', personId)
        .eq('account_holder_id', internalAccountId) // Scopes the update to this account only: Ensure person belongs to this account
        .select()
        .single();

    if (error || !data) {
        throw new Error(`Failed to update related person. They may not exist or belong to this account.`);
    }

    return mapRelatedPersonRow(data);
}

export async function removeRelatedPerson(internalAccountId: string, personId: string): Promise<void> {
    const { data, error } = await supabaseServer
        .from('related_people')
        .delete()
        .eq('id', personId)
        .eq('account_holder_id', internalAccountId) // Scopes the update to this account only
        .select();

    if (error) {
        throw new Error(`Failed to remove related person: ${error.message}`);
    }
    if (!data || data.length === 0) {
        throw new Error(`Related person not found on this account.`);
    }
}

// Case-insensitive, partial match. Intentionally returns an array, the caller
// is responsible for deciding what to do with 0, 1, or several matches
export async function findRelatedPersonByName(internalAccountId: string, name: string): Promise<RelatedPerson[]> {

    const { data, error } = await supabaseServer
        .from('related_people')
        .select('*')
        .eq('account_holder_id', internalAccountId)
        .ilike('name', `%${name.trim()}%`); // Case-insensitive, partial match

    if (error) {
        throw new Error(`Failed to search related people: ${error.message}`);
    }

    return (data || []).map(mapRelatedPersonRow);
}