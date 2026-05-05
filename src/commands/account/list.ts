import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Container, getKeybindings, Key, matchesKey, Spacer, Text } from "@mariozechner/pi-tui";
import { reloadAfterOAuthSwitch } from "../../accounts/credentials.js";
import { promptForAccountModel } from "../../accounts/models.js";
import { CONFIG_PATH } from "../../storage/paths.js";
import { normalizeProviderWithCustom } from "../../providers/catalog.js";
import { formatError } from "../../shared/errors.js";
import { getAccountModelProvider, type AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import type { AccountConfig } from "../../domain/types.js";
import type { AccountSwitcherContext, AccountSwitcherUi } from "../../shared/ui.js";

export function registerAccountListCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("accounts", {
		description: "List configured accounts and activate the selected account",
		handler: async (_args, ctx) => handleAccountsCommand(runtime, ctx),
	});

	pi.registerCommand("account-current", {
		description: "Show the active account for the current provider",
		handler: async (_args, ctx) => handleAccountCurrentCommand(runtime, ctx),
	});
}

async function handleAccountsCommand(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	await runtime.reloadConfig();
	if (runtime.accountCount === 0) {
		ctx.ui.notify(`No accounts configured. Create ${CONFIG_PATH}.`, "info");
		return;
	}

	const account = await promptForGroupedAccount(ctx.ui, buildGroupedAccountItems(runtime, ctx));
	if (!account) return;
	try {
		const provider = normalizeProviderWithCustom(account.provider, runtime.providers);
		const modelProvider = getAccountModelProvider(account, provider);
		const model = await promptForAccountModel(account, modelProvider, runtime.providers, ctx);
		if (model === null) return;
		const accountToActivate = model === undefined ? account : { ...account, model };
		const applied = await runtime.activateAccount(accountToActivate, provider, ctx);
		ctx.ui.notify(`Switched ${provider} to ${account.label} (${applied}).`, "info");
		if (await reloadAfterOAuthSwitch(account, ctx)) return;
	} catch (error) {
		ctx.ui.notify(`Failed to switch account: ${formatError(error)}`, "error");
	}
}

async function handleAccountCurrentCommand(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	const provider = runtime.getProviderForContext(ctx);
	const account = runtime.getActiveAccount(provider);
	ctx.ui.notify(account ? `Current ${provider} account: ${account.label} (${account.id})` : "No active account selected.", "info");
}

type GroupedAccountItem =
	| { type: "header"; provider: string }
	| { type: "account"; account: AccountConfig; provider: string; active: boolean; current: boolean };

function buildGroupedAccountItems(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): GroupedAccountItem[] {
	const currentProvider = runtime.getProviderForContext(ctx);
	const accounts = [...runtime.accounts].sort((a, b) => {
		const aProvider = getAccountModelProvider(a, normalizeProviderWithCustom(a.provider, runtime.providers));
		const bProvider = getAccountModelProvider(b, normalizeProviderWithCustom(b.provider, runtime.providers));
		return aProvider.localeCompare(bProvider) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
	});
	const items: GroupedAccountItem[] = [];
	let previousProvider: string | undefined;
	for (const account of accounts) {
		const provider = getAccountModelProvider(account, normalizeProviderWithCustom(account.provider, runtime.providers));
		if (previousProvider !== provider) {
			items.push({ type: "header", provider });
			previousProvider = provider;
		}
		const active = runtime.getActiveAccount(provider)?.id === account.id;
		items.push({ type: "account", account, provider, active, current: active && provider === currentProvider });
	}
	return items;
}

async function promptForGroupedAccount(ui: AccountSwitcherUi, items: GroupedAccountItem[]): Promise<AccountConfig | undefined> {
	if (!ui.custom) return promptForGroupedAccountWithSelect(ui, items);
	return ui.custom<AccountConfig | undefined>((tui: any, theme: any, _keybindings: any, done: (value: AccountConfig | undefined) => void) => {
		const component = new GroupedAccountPickerComponent(items, theme, done);
		return {
			render: (width: number) => component.render(width),
			invalidate: () => component.invalidate(),
			handleInput: (data: string) => {
				component.handleInput(data);
				tui.requestRender();
			},
			get focused() {
				return component.focused;
			},
			set focused(value: boolean) {
				component.focused = value;
			},
		};
	});
}

async function promptForGroupedAccountWithSelect(ui: AccountSwitcherUi, items: GroupedAccountItem[]): Promise<AccountConfig | undefined> {
	const labels: string[] = [];
	const accounts: Array<AccountConfig | undefined> = [];
	for (const item of items) {
		if (item.type === "header") {
			labels.push(`─ ${item.provider}`);
			accounts.push(undefined);
			continue;
		}
		labels.push(formatAccountRow(item));
		accounts.push(item.account);
	}
	let account: AccountConfig | undefined;
	while (!account) {
		const selected = await ui.select("Pick account to activate", labels);
		if (!selected) return undefined;
		account = accounts[labels.indexOf(selected)];
	}
	return account;
}

class GroupedAccountPickerComponent extends Container {
	private readonly listContainer = new Container();
	private selectedIndex = 0;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
	}

	constructor(
		private readonly items: GroupedAccountItem[],
		private readonly theme: any,
		private readonly done: (value: AccountConfig | undefined) => void,
	) {
		super();
		this.selectedIndex = this.nextAccountIndex(-1, 1);
		this.addChild(new Text(theme.fg("accent", theme.bold("Pick account to activate")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", "↑↓ navigate  enter select  escape/ctrl+c cancel"), 0, 0));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		for (let index = 0; index < this.items.length; index++) {
			const item = this.items[index];
			if (item.type === "header") {
				this.listContainer.addChild(new Text(this.theme.fg("muted", `─ ${item.provider}`), 0, 0));
				continue;
			}
			const selected = index === this.selectedIndex;
			const prefix = selected ? this.theme.fg("accent", "→ ") : "  ";
			const text = selected ? this.theme.fg("accent", formatAccountRow(item)) : formatAccountRow(item);
			this.listContainer.addChild(new Text(`${prefix}${text}`, 0, 0));
		}
	}

	handleInput(data: string): void {
		const kb = getKeybindings();
		if (kb.matches(data, "tui.select.up")) {
			this.selectedIndex = this.nextAccountIndex(this.selectedIndex, -1);
			this.updateList();
			return;
		}
		if (kb.matches(data, "tui.select.down")) {
			this.selectedIndex = this.nextAccountIndex(this.selectedIndex, 1);
			this.updateList();
			return;
		}
		if (kb.matches(data, "tui.select.confirm")) {
			const item = this.items[this.selectedIndex];
			this.done(item?.type === "account" ? item.account : undefined);
			return;
		}
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) this.done(undefined);
	}

	private nextAccountIndex(from: number, direction: 1 | -1): number {
		if (this.items.length === 0) return 0;
		let index = from;
		for (let count = 0; count < this.items.length; count++) {
			index = (index + direction + this.items.length) % this.items.length;
			if (this.items[index]?.type === "account") return index;
		}
		return 0;
	}
}

function formatAccountRow(item: Extract<GroupedAccountItem, { type: "account" }>): string {
	const marker = item.active ? (item.current ? "✓" : "●") : " ";
	const model = item.account.model ? ` · model ${item.account.model}` : "";
	return `${marker} ${item.account.label} (${item.account.id})${model}`;
}
