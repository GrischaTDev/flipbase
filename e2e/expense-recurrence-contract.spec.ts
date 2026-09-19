import { randomUUID } from 'node:crypto';
import { expect, test } from './support/fixtures';

test('erzeugt eine Wiederholungsfälligkeit über PostgREST nur einmal @pr-smoke', async ({
  workspace,
}) => {
  const { data: userData, error: userError } = await workspace.client.auth.getUser();
  expect(userError, userError?.message).toBeNull();
  expect(userData.user).not.toBeNull();

  const { data: categories, error: categoriesError } = await workspace.client
    .from('expense_categories')
    .select('id')
    .eq('workspace_id', workspace.id)
    .limit(1);
  expect(categoriesError, categoriesError?.message).toBeNull();
  const category = categories?.[0];
  expect(category).not.toBeNull();

  const { data: rule, error: ruleError } = await workspace.client
    .from('expense_recurring_rules')
    .insert({
      workspace_id: workspace.id,
      category_id: category!.id,
      title: 'E2E Server',
      quantity: 1,
      gross_amount: 29.9,
      vat_rate: 19,
      frequency: 'monthly',
      start_date: '2026-09-01',
      is_active: true,
      created_by: userData.user!.id,
    })
    .select('id')
    .single();
  expect(ruleError, ruleError?.message).toBeNull();
  expect(rule).not.toBeNull();

  const occurrenceDate = '2026-09-01';
  const firstOccurrence = {
    id: randomUUID(),
    workspace_id: workspace.id,
    category_id: category!.id,
    recurring_rule_id: rule!.id,
    occurrence_date: occurrenceDate,
    title: 'E2E Server',
    quantity: 1,
    gross_amount: 29.9,
    vat_rate: 19,
    expense_date: occurrenceDate,
    due_date: occurrenceDate,
    status: 'open',
    created_by: userData.user!.id,
  };

  const firstInsert = await workspace.client.from('expenses').upsert([firstOccurrence], {
    onConflict: 'workspace_id,recurring_rule_id,occurrence_date',
    ignoreDuplicates: true,
  });
  expect(firstInsert.error, firstInsert.error?.message).toBeNull();

  const repeatInsert = await workspace.client
    .from('expenses')
    .upsert([{ ...firstOccurrence, id: randomUUID(), gross_amount: 99 }], {
      onConflict: 'workspace_id,recurring_rule_id,occurrence_date',
      ignoreDuplicates: true,
    });
  expect(repeatInsert.error, repeatInsert.error?.message).toBeNull();

  const { data: occurrences, error: occurrencesError } = await workspace.client
    .from('expenses')
    .select('id, gross_amount')
    .eq('workspace_id', workspace.id)
    .eq('recurring_rule_id', rule!.id)
    .eq('occurrence_date', occurrenceDate);
  expect(occurrencesError, occurrencesError?.message).toBeNull();
  expect(occurrences).toHaveLength(1);
  expect(occurrences?.[0]).toMatchObject({ id: firstOccurrence.id, gross_amount: 29.9 });
});
