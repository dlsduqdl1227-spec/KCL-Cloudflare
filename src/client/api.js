export function rpc(fn, args) {
  if (window.kclRpc && window.kclRpc.call) return window.kclRpc.call(fn, args || []);
  return fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fn, args: args || [] })
  }).then((res) => res.json());
}
