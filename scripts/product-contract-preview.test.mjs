import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/product-contract-preview.yml', import.meta.url);

test('isolates product contract generation to the approved same-repository PR', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /pull_request:/u);
  assert.match(workflow, /github\.head_ref == 'codex\/product-core-validation'/u);
  assert.match(
    workflow,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/u,
  );
  assert.match(workflow, /runs-on: ubuntu-latest/u);
  assert.match(workflow, /contents: read/u);
  assert.doesNotMatch(
    workflow,
    /pull_request_target|secrets\.|contents: write|db push|--linked|--db-url|supabase link|ssh /u,
  );
});

test('generates migration and types in the runner and preserves the normal CI gate', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /supabase db diff -f product_contract_preview/u);
  assert.match(workflow, /supabase migration up --local/u);
  assert.match(
    workflow,
    /supabase gen types typescript --local > product-contract-preview\/supabase\.types\.ts/u,
  );
  assert.match(workflow, /npm run test:db/u);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/u);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/u);
  assert.match(workflow, /retention-days: 7/u);
  assert.doesNotMatch(workflow, /continue-on-error|git commit|git push|gh pr merge/u);
});
