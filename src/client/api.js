export function rpc(fn, args) {
  if (window.kclRpc && window.kclRpc.call) return window.kclRpc.call(fn, args || []);
  return fetch("/api/gas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: fn, fn, args: args || [], payload: { args: args || [] } })
  }).then((res) => res.json());
}
