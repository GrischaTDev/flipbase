"""Temporäre Prüfung ausschließlich gegen den lokalen Supabase-Testcontainer."""
import pathlib
import re
import subprocess

root = pathlib.Path.cwd()
statements = []
paths = ['50_sniper.sql', '106_sniper_watchlists.sql', '107_sniper_feed_brands.sql', '360_beta_business_access.sql']
for name in paths:
    text = (root / 'supabase/schemas' / name).read_text()
    blocks = re.findall(r'^create(?: or replace)? function public\..*?^\$(?:function)?\$\s*;', text, re.M | re.S | re.I)
    for block in blocks:
        if not any(f"interval '{days} days'" in block for days in [7, 14, 30]):
            continue
        signature = re.match(r'^create(?: or replace)? function public\.(\w+)', block, re.I)
        assert signature and signature[1].startswith('sniper_'), name
        statements.append(block.replace("interval '30 days'", "interval '7 days'").replace("interval '14 days'", "interval '7 days'"))
    for comment in re.findall(r"^comment on function public\.sniper_[^;]+;", text, re.M | re.I):
        if any(word in comment for word in ['14-Tage', '14 Tage', '30 Tagen', '7-Tage', '7 Tage', '7 Tagen']):
            statements.append(comment.replace('14-Tage', '7-Tage').replace('14 Tage', '7 Tage').replace('30 Tagen', '7 Tagen'))
assert sum(statement.lower().startswith('create') for statement in statements) == 12
for name in ['400_sniper_favorites.sql', '401_sniper_feed_search.sql']:
    statements.append((root / 'supabase/schemas' / name).read_text())
subprocess.run(['docker', 'exec', '-i', 'supabase_db_flipbase-supabase', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input='\n'.join(statements), text=True, check=True)
print('Die vorgesehenen Feed- und Favoritenänderungen sind in der Wegwerf-Datenbank angewendet.')
