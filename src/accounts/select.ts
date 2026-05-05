import { formatAccountItem } from "./format.js";
import type { AccountConfig } from "../domain/types.js";
import type { AccountSwitcherUi } from "../shared/ui.js";

export async function selectAccount(
	ui: Pick<AccountSwitcherUi, "select">,
	title: string,
	accounts: AccountConfig[],
	activeAccountId?: string,
): Promise<AccountConfig | undefined> {
	const items = accounts.map((account) => formatAccountItem(account, activeAccountId === account.id));
	const selected = await ui.select(title, items);
	if (!selected) return undefined;
	return accounts[items.indexOf(selected)];
}
