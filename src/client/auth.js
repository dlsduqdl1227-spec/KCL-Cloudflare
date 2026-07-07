import { rpc } from "./api.js";

export function login(name, phone) {
  return rpc("judgeLogin", [name, phone]);
}
