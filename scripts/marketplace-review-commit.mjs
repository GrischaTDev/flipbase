// Bereitet ausschließlich einen prüfbaren Git-Commit vor. Kein Branch-Push,
// keine Ref-Änderung und kein Zugriff auf produktive Datenbanken.
import { readFile, writeFile, readdir } from 'node:fs/promises';
const schema = './schemas/250_marketplace_accounts.sql';
const configPath = 'supabase/config.toml';
const mode = process.argv[2];
if (mode === 'register') {
  const config = await readFile(configPath, 'utf8');
  if (!config.includes(schema)) {
    if (!/^schema_paths = \[.*\]$/m.test(config)) throw new Error('Schemaregistrierung nicht eindeutig.');
    await writeFile(configPath, config.replace(/^schema_paths = \[(.*)\]$/m, `schema_paths = [$1, "${schema}"]`));
  }
} else if (mode === 'prepare') {
  const repo = process.env.GITHUB_REPOSITORY;
  const base = process.env.GITHUB_SHA;
  const token = process.env.GITHUB_TOKEN;
  if (repo !== 'GrischaTDev/flipbase' || process.env.GITHUB_REF !== 'refs/heads/juna/vinted-marketplace-foundation' || !base || !token) throw new Error('Unzulässiger Vorbereitungskontext.');
  async function api(path, body) {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return response.json();
  }
  const previous = await api(`git/commits/${base}`);
  const files = ['supabase/config.toml', 'src/app/core/models/supabase.types.ts', 'scripts/marketplace-migration-permissions.mjs', 'scripts/marketplace-migration-permissions.test.mjs', 'scripts/marketplace-review-commit.mjs'];
  for (const file of await readdir('supabase/migrations')) if (/^\d+_marketplace_accounts\.sql$/.test(file)) files.push(`supabase/migrations/${file}`);
  const changelogPath = 'docs/AI-CHANGELOG.md';
  const changelog = await readFile(changelogPath, 'utf8');
  const heading = '## 2026-09-26 – Juna – Integrierte Marktplatzkonten begonnen';
  if (!changelog.includes(heading)) {
    const marker = changelog.indexOf('\n');
    const entry = `\n\n${heading}\n\n**Auftrag:** Auf dem bestehenden Vinted-Branch die native Kontoverwaltung fortsetzen.\n\n**Änderung:** Kontobezogene Datenverträge und Servervalidierung, persistente\nVerbindungsmetadaten und geschützte Lesekopien. Inhaber/Admins verwalten die\nVerbindungen; einfache Mitglieder erhalten keine privaten Kontodaten. Der\nDatenbankabgleich läuft ausschließlich auf einem wegwerfbaren CI-Runner.\n\n**Prüfung:** Neue Datenbanktests einschließlich Fremdkonto, Pausenstatus und\n61 Aktivitäten bestanden vor Vorbereitung dieses Commits. Weitere Prüfungen\nund Frontend-Arbeitsstand stehen im featurebezogenen Prüfprotokoll. Kein\nVinted-Konto verwendet, kein Merge und kein produktives Deployment.\n`;
    await writeFile(changelogPath, changelog.slice(0, marker) + entry + changelog.slice(marker));
    files.push(changelogPath);
  }
  const tree = [];
  for (const path of files) {
    const content = await readFile(path, 'utf8');
    const blob = await api('git/blobs', { content, encoding: 'utf-8' });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const result = await api('git/trees', { base_tree: previous.tree.sha, tree });
  const author = { name: previous.author.name, email: previous.author.email };
  const commit = await api('git/commits', {
    message: 'feat(core): prepare verified marketplace database migration\n\nGenerate migration and database types after passing disposable database tests.\nPrepare this commit for review without moving any branch or deploying.',
    tree: result.sha, parents: [base], author, committer: author,
  });
  const review = { base, sha: commit.sha, tree: result.sha, files };
  await writeFile('/tmp/marketplace-database/review-commit.json', JSON.stringify(review, null, 2));
  // Nur Commit-Metadaten, keine Schlüssel oder Sitzungsausgaben.
  console.info('MARKETPLACE_REVIEW_COMMIT', JSON.stringify(review));
} else throw new Error('Unbekannter Modus.');
