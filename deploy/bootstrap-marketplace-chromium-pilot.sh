#!/usr/bin/env bash
set -euo pipefail
# Quelle des seccomp-Profils: microsoft/playwright, Apache-2.0,
# ae935a43d9e376e4759548f6b3c6905c7b282333/utils/docker/seccomp_profile.json.
# Lokale Ergänzung: chroot für Chromiums Usernamespace-Sandbox ohne Container-Capabilities.
# Ausschließlich auf dem ausgewählten Pilothost als root ausführen.
# setup installiert den 30-Sekunden-Timer; Starts verlangen eine Prüfung <90 Sekunden.
mode="${1:-verify}"
[[ "$mode" == setup || "$mode" == verify ]] || exit 2
[[ "$(id -u)" == 0 ]] || { echo 'Root für die Host-Firewall erforderlich!' >&2; exit 1; }
docker() { command docker --host=unix:///var/run/docker.sock "$@"; }
trap 'status=$?; if (( status != 0 )); then rm -f /run/flipbase/chromium-firewall-status.json; fi' EXIT
if [[ "$mode" == setup ]]; then
  for directory in /opt/flipbase-marketplace/chromium /opt/flipbase-marketplace/chromium/profiles /opt/flipbase-marketplace/chromium/registry; do
    if [[ -e "$directory" ]]; then
      [[ -d "$directory" && ! -L "$directory" && "$(stat -c %u "$directory")" == 1000 ]] || exit 1
      chmod 0700 "$directory"
    else
      install -d -m 0700 "$directory"
      chown 1000:1000 "$directory"
    fi
  done
fi
network=flipbase-browser
subnet=172.30.88.0/24
controller=172.30.88.2
broker=172.30.88.3
bridge=br-flipbase
chain=FLIPBASE_CHROMIUM
host_chain=FLIPBASE_CHROMIUM_HOST
blocked=(0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4)
iptables -w -S DOCKER-USER >/dev/null
if [[ "$mode" == setup ]]; then
  modprobe br_netfilter
  sysctl -w net.bridge.bridge-nf-call-iptables=1 net.bridge.bridge-nf-call-ip6tables=1 >/dev/null
fi
for bridge_setting in bridge-nf-call-iptables bridge-nf-call-ip6tables; do
  setting_path="/proc/sys/net/bridge/$bridge_setting"
  [[ -r "$setting_path" && "$(cat "$setting_path")" == 1 ]] || { echo "Bridge-Firewall ist nicht aktiv: $bridge_setting!" >&2; exit 1; }
done
if ! docker network inspect "$network" >/dev/null 2>&1; then
  [[ "$mode" == setup ]] || exit 1
  # Keine fremden Netzwerke oder überlappenden Subnetze verändern.
  docker network inspect $(docker network ls --quiet) | python3 -c '
import ipaddress,json,sys
target=ipaddress.ip_network("172.30.88.0/24")
for network in json.load(sys.stdin):
 for config in (network.get("IPAM") or {}).get("Config") or []:
  cidr=config.get("Subnet")
  if cidr and ipaddress.ip_network(cidr).version==4 and target.overlaps(ipaddress.ip_network(cidr)): sys.exit(1)
'
  docker network create --driver bridge --subnet "$subnet" --gateway 172.30.88.1 --ip-range 172.30.88.128/25 \
    --opt com.docker.network.bridge.name="$bridge" \
    --label de.flipbase.chromium.network-policy=v1 "$network" >/dev/null
fi
docker network inspect "$network" | python3 -c '
import json,sys
n=json.load(sys.stdin)[0]
assert n["Driver"]=="bridge" and not n["EnableIPv6"]
assert n.get("Labels",{}).get("de.flipbase.chromium.network-policy")=="v1"
assert n.get("Options",{}).get("com.docker.network.bridge.name")=="br-flipbase"
assert n["IPAM"]["Config"][0]["Subnet"]=="172.30.88.0/24"
assert n["IPAM"]["Config"][0]["IPRange"]=="172.30.88.128/25"
'
ensure_rule() {
  local table_chain="$1"; shift
  if ! iptables -w -C "$table_chain" "$@" 2>/dev/null; then
    [[ "$mode" == setup ]] || exit 1
    iptables -w -A "$table_chain" "$@"
  fi
}
for own_chain in "$chain" "$host_chain"; do
  if ! iptables -w -S "$own_chain" >/dev/null 2>&1; then
    [[ "$mode" == setup ]] || exit 1
    iptables -w -N "$own_chain"
  fi
done
ensure_rule "$chain" -s "$controller/32" -d "$subnet" -p tcp --dport 9222 -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT
ensure_rule "$chain" -s "$subnet" -d "$controller/32" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Vor die vorhandenen DROP-Regeln setzen, auch beim Upgrade eines v1-Hosts.
for direction in forward reverse; do
  if [[ "$direction" == forward ]]; then
    rule=(-s "$broker/32" -d "$subnet" -p tcp --dport 9222 -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT)
  else
    rule=(-s "$subnet" -d "$broker/32" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT)
  fi
  if ! iptables -w -C "$chain" "${rule[@]}" 2>/dev/null; then
    [[ "$mode" == setup ]] || exit 1
    iptables -w -I "$chain" 1 "${rule[@]}"
  fi
done
for destination in "${blocked[@]}"; do ensure_rule "$chain" -s "$subnet" -d "$destination" -j DROP; done
ensure_rule "$chain" -j RETURN
ensure_rule "$host_chain" -s "$controller/32" -j RETURN
ensure_rule "$host_chain" -j DROP
# Die Sprünge müssen vor allgemeinen ACCEPT-Regeln stehen.
for spec in "DOCKER-USER:$chain" "INPUT:$host_chain"; do
  parent="${spec%%:*}"; child="${spec#*:}"
  if ! iptables -w -C "$parent" -s "$subnet" -j "$child" 2>/dev/null; then
    [[ "$mode" == setup ]] || exit 1
    iptables -w -I "$parent" 1 -s "$subnet" -j "$child"
  fi
  [[ "$(iptables -w -S "$parent" | sed -n '2p')" == "-A $parent -s $subnet -j $child" ]] || exit 1
done
# IPv6 darf weder andere Container noch Hostdienste erreichen.
for parent in FORWARD INPUT; do
  if ! ip6tables -w -C "$parent" -i "$bridge" -j DROP 2>/dev/null; then
    [[ "$mode" == setup ]] || exit 1
    ip6tables -w -I "$parent" 1 -i "$bridge" -j DROP
  fi
  [[ "$(ip6tables -w -S "$parent" | sed -n '2p')" == "-A $parent -i $bridge -j DROP" ]] || exit 1
done
# Alle geprüften Regeln sind geordnet; zusätzliche frühere Regeln verhindern Freigabe.
[[ "$(iptables -w -S "$chain" | wc -l)" == 16 ]] || exit 1
[[ "$(iptables -w -S "$host_chain" | wc -l)" == 3 ]] || exit 1
[[ "$(iptables -w -S "$chain" | tail -n 1)" == "-A $chain -j RETURN" ]] || exit 1
[[ "$(iptables -w -S "$host_chain" | tail -n 1)" == "-A $host_chain -j DROP" ]] || exit 1
if [[ "$mode" == setup ]]; then
  script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
  install_owned() {
    local source="$1" target="$2" permissions="$3"
    if [[ -e "$target" || -L "$target" ]]; then
      [[ -f "$target" && ! -L "$target" && "$(stat -c %u "$target")" == 0 ]] || exit 1
      cmp --silent "$source" "$target" || { echo "Bestehende Datei weicht ab: $target!" >&2; exit 1; }
    else
      install -o root -g root -m "$permissions" "$source" "$target"
    fi
    chmod "$permissions" "$target"
  }
  install_owned "$script_directory/bootstrap-marketplace-chromium-pilot.sh" /opt/flipbase-marketplace/bootstrap-marketplace-chromium-pilot.sh 0700
  install_owned "$script_directory/chromium-seccomp.json" /opt/flipbase-marketplace/chromium-seccomp.json 0644
  install_owned "$script_directory/chromium-seccomp.LICENSE" /opt/flipbase-marketplace/chromium-seccomp.LICENSE 0644
  install_owned "$script_directory/flipbase-chromium-firewall.service" /etc/systemd/system/flipbase-chromium-firewall.service 0644
  install_owned "$script_directory/flipbase-chromium-firewall.timer" /etc/systemd/system/flipbase-chromium-firewall.timer 0644
  install_owned "$script_directory/flipbase-chromium-modules.conf" /etc/modules-load.d/flipbase-chromium.conf 0644
  install_owned "$script_directory/flipbase-chromium-sysctl.conf" /etc/sysctl.d/90-flipbase-chromium.conf 0644
  systemctl daemon-reload
  systemctl enable --now flipbase-chromium-firewall.timer
fi
install -d -m 0755 /run/flipbase
proof="$(mktemp /run/flipbase/chromium-firewall-status.XXXXXX)"
trap 'status=$?; rm -f "$proof"; if (( status != 0 )); then rm -f /run/flipbase/chromium-firewall-status.json; fi' EXIT
python3 -c 'import json,time;print(json.dumps({"bootId":open("/proc/sys/kernel/random/boot_id").read().strip(),"network":"flipbase-browser","policy":"v2","checkedAt":int(time.time()*1000)}))' > "$proof"
chmod 0644 "$proof"
mv "$proof" /run/flipbase/chromium-firewall-status.json
echo 'Chromium-Pilotnetz und Host-Firewall geprüft.'
