#!/bin/sh
# Der Leseschlüssel darf nur einen unveränderlichen Tagesstand übertragen.
set -eu
umask 077
exec 9</var/backups/flipbase-snapshot/snapshot.lock
flock -s -w 600 9
exec /usr/bin/rrsync -ro /var/backups/flipbase-snapshot/current
