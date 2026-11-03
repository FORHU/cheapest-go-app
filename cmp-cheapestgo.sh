#!/usr/bin/env bash
# Read-only. Compares the cheapestgo database on the OLD shared RDS vs the NEW one.
set -u
R=ap-southeast-1
secret_url() {
  aws secretsmanager get-secret-value --region $R --secret-id "$1" --query SecretString --output text \
  | python3 -c "
import sys,json,urllib.parse as u
d=json.load(sys.stdin)
h=d.get('host') or d.get('hostname'); p=d.get('port',5432)
usr=d.get('username') or d.get('user'); pw=u.quote(d.get('password',''),safe='')
print(f'postgresql://{usr}:{pw}@{h}:{p}/cheapestgo')"
}
NEW=$(secret_url cheapestgo/production/db/postgres)
OLD=$(secret_url forhu/staging/style-os-mirror/postgres)
for label in NEW OLD; do
  eval "U=\$$label"
  echo "################  $label  ################"
  docker run --rm postgres:16 psql "$U" \
    -c "SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;" \
    -c "SELECT count(*) AS public_tables FROM information_schema.tables WHERE table_schema='public';" \
    -c "SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE n_live_tup > 0 ORDER BY relname;" 2>&1
done
