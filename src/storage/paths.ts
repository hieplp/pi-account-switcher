import { homedir } from "node:os";
import { join } from "node:path";

export const APP_DIR = join(homedir(), ".pi", "account-switcher");
export const CONFIG_PATH = join(APP_DIR, "accounts.json");
export const PROVIDERS_PATH = join(APP_DIR, "providers.json");
export const STATE_PATH = join(APP_DIR, "state.json");
export { PI_AUTH_PATH } from "../constants/paths";
