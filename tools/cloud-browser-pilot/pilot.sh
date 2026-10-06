#!/usr/bin/env bash
set -euo pipefail
directory=/opt/flipbase-marketplace/cloud-browser-pilot
container=flipbase-cloud-browser-pilot
network=flipbase-cloud-browser-pilot
bridge=br-fb-pilot
network_id=iproyal-pilot-a
label=de.flipbase.cloud-browser-pilot
image=flipbase-cloud-browser-pilot:manual-v1
[[ $EUID == 0 && "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" == "$directory" ]] || exit 1
cd "$directory"

owned_container() {
  [[ "$(docker container inspect --format '{{index .Config.Labels "de.flipbase.cloud-browser-pilot"}}' "$container")" == v1 ]]
}
free_ip() {
  docker exec -u 1000:1000 flipbase-marketplace-worker node dist/register-marketplace-cloud-ip.js --list |
    python3 -c 'import json,sys; rows=json.load(sys.stdin); assert sum(r["networkId"]=="iproyal-pilot-a" and r["state"]=="free" for r in rows)==1'
}
stop_pilot() {
  if docker container inspect "$container" >/dev/null 2>&1; then
    owned_container
    docker stop --time 15 "$container" >/dev/null
  fi
}

case "${1:-status}" in
  build)
    docker build --tag "$image" "$directory"
    ;;
  start|debug)
    free_ip
    if docker container inspect "$container" >/dev/null 2>&1; then
      owned_container
      [[ "$(docker container inspect --format '{{.State.Running}}' "$container")" == false ]]
      [[ "$(docker container inspect --format '{{.State.Status}} {{.State.OOMKilled}} {{.State.ExitCode}}' "$container")" == 'exited false 0' ]]
      docker rm "$container" >/dev/null
    fi
    [[ -f /opt/flipbase-marketplace/chromium-seccomp.json ]]
    install -d -m 0700 "$directory/profile" "$directory/private"
    chown 1000:1000 "$directory/profile"
    # Nur der ausgewählte Proxy gelangt in den Pilot; keine weiteren Zugangsdaten.
    python3 - "$directory/private/networks.json" <<'PY'
import json,os,sys
with open('/opt/flipbase-marketplace/chromium/cloud-networks.json') as source:
    rows=[row for row in json.load(source)['networkProfiles'] if row['id']=='iproyal-pilot-a']
assert len(rows)==1 and rows[0]['kind']=='proxy'
path=sys.argv[1]
assert not os.path.islink(path)
descriptor=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
with os.fdopen(descriptor,'w') as target: json.dump({'networkProfiles':rows},target)
os.chmod(path,0o600)
os.chown(path,1000,1000)
PY
    read -r proxy_host proxy_port < <(python3 - "$directory/private/networks.json" <<'PY'
import ipaddress,json,sys,urllib.parse
with open(sys.argv[1]) as source: proxy=urllib.parse.urlparse(json.load(source)['networkProfiles'][0]['server'])
assert proxy.scheme=='http' and ipaddress.ip_address(proxy.hostname).is_global and proxy.port
print(proxy.hostname,proxy.port)
PY
    )
    if ! docker network inspect "$network" >/dev/null 2>&1; then
      docker network ls --quiet | xargs -r docker network inspect | python3 -c '
import ipaddress,json,sys
target=ipaddress.ip_network("172.30.89.0/24")
for network in json.load(sys.stdin):
  for entry in network.get("IPAM",{}).get("Config") or []:
    subnet=entry.get("Subnet")
    if subnet and ipaddress.ip_network(subnet).version==4: assert not target.overlaps(ipaddress.ip_network(subnet))'
      docker network create --subnet=172.30.89.0/24 --opt=com.docker.network.bridge.name="$bridge" \
        --label="$label=v1" "$network" >/dev/null
    fi
    docker network inspect "$network" | python3 -c '
import json,sys
network=json.load(sys.stdin)[0]
assert network["Labels"].get("de.flipbase.cloud-browser-pilot")=="v1"
assert network["IPAM"]["Config"][0]["Subnet"]=="172.30.89.0/24"
assert network["Options"].get("com.docker.network.bridge.name")=="br-fb-pilot"
assert not network["EnableIPv6"]'
    # Eigene Regeln: ausschließlich der gekaufte Proxy, kein direkter Internetzugang.
    iptables -w -N FLIPBASE-CLOUD-PILOT 2>/dev/null || true
    iptables -w -F FLIPBASE-CLOUD-PILOT
    iptables -w -A FLIPBASE-CLOUD-PILOT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -w -A FLIPBASE-CLOUD-PILOT -i "$bridge" -d "$proxy_host/32" -p tcp --dport "$proxy_port" -j ACCEPT
    iptables -w -A FLIPBASE-CLOUD-PILOT -j DROP
    for direction in -i -o; do
      iptables -w -C DOCKER-USER "$direction" "$bridge" -j FLIPBASE-CLOUD-PILOT 2>/dev/null ||
        iptables -w -I DOCKER-USER 1 "$direction" "$bridge" -j FLIPBASE-CLOUD-PILOT
    done
    iptables -w -N FLIPBASE-CLOUD-PILOT-HOST 2>/dev/null || true
    iptables -w -F FLIPBASE-CLOUD-PILOT-HOST
    iptables -w -A FLIPBASE-CLOUD-PILOT-HOST -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    iptables -w -A FLIPBASE-CLOUD-PILOT-HOST -j DROP
    iptables -w -C INPUT -i "$bridge" -j FLIPBASE-CLOUD-PILOT-HOST 2>/dev/null ||
      iptables -w -I INPUT 1 -i "$bridge" -j FLIPBASE-CLOUD-PILOT-HOST
    debug=0
    [[ $1 != debug ]] || debug=1
    docker run -d --name "$container" --hostname=fb-cloud-pilot --label="$label=v1" \
      --network="$network" --dns=127.0.0.1 --init --user=1000:1000 --read-only \
      --cap-drop=ALL --security-opt=no-new-privileges:true \
      --security-opt=seccomp=/opt/flipbase-marketplace/chromium-seccomp.json \
      --memory=1500m --memory-swap=1500m --pids-limit=512 --shm-size=256m \
      --tmpfs=/tmp:rw,nosuid,nodev,size=512m,mode=1777 \
      --mount="type=bind,src=$directory/profile,dst=/profile" \
      --mount="type=bind,src=$directory/private/networks.json,dst=/run/pilot/networks.json,readonly" \
      --env="PILOT_NETWORK_ID=$network_id" --env="PILOT_DEBUG=$debug" \
      --publish=127.0.0.1:6088:6080 --log-opt=max-size=1m --log-opt=max-file=2 "$image" >/dev/null
    trap stop_pilot ERR
    if ! free_ip; then stop_pilot; exit 1; fi
    if systemctl cat flipbase-cloud-pilot-watch.timer >/dev/null 2>&1; then
      systemctl show flipbase-cloud-pilot-watch.service --property=ExecStart --value |
        grep -F "$directory/pilot.sh guard" >/dev/null
      systemctl restart flipbase-cloud-pilot-watch.timer
    else
      systemd-run --quiet --unit=flipbase-cloud-pilot-watch --on-active=15s --on-unit-active=15s \
        "$directory/pilot.sh" guard
    fi
    docker container inspect --format '{{.State.Status}} {{.HostConfig.PortBindings}}' "$container"
    trap - ERR
    ;;
  stop)
    stop_pilot
    systemctl stop flipbase-cloud-pilot-watch.timer 2>/dev/null || true
    ;;
  guard)
    owned_container
    if ! free_ip || ! iptables -w -C DOCKER-USER -i "$bridge" -j FLIPBASE-CLOUD-PILOT ||
       ! iptables -w -C FLIPBASE-CLOUD-PILOT -j DROP ||
       ! iptables -w -C INPUT -i "$bridge" -j FLIPBASE-CLOUD-PILOT-HOST; then
      stop_pilot
    fi
    ;;
  status)
    owned_container
    docker container inspect --format '{{.State.Status}} {{.State.ExitCode}}' "$container"
    docker logs --tail 6 "$container"
    ;;
  *) exit 1 ;;
esac
