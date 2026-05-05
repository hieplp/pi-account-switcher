import { Container, fuzzyFilter, getKeybindings, Input, Key, matchesKey, Spacer, Text } from "@mariozechner/pi-tui";
import { providerMatchesWithCustom } from "../providers/catalog.js";
import type { AccountConfig, ProviderConfig } from "../domain/types.js";
import type { AccountSwitcherContext } from "../shared/ui.js";

export async function promptForAccountModel(
	account: AccountConfig,
	provider: string,
	customProviders: ProviderConfig[],
	ctx: AccountSwitcherContext,
): Promise<string | undefined | null> {
	if (ctx.model?.provider && modelProviderMatches(ctx.model.provider, provider, customProviders)) return undefined;

	const models = getModelsForProvider(provider, customProviders, ctx);
	if (models.length === 0) return account.model;

	const selected = await selectModelWithSearch(ctx, `Models for ${account.label}`, models, account.model);
	if (!selected) return null;
	return selected.id;
}

type AccountModelChoice = { id: string; name?: string; provider?: string };

async function selectModelWithSearch(
	ctx: AccountSwitcherContext,
	title: string,
	models: AccountModelChoice[],
	currentModelId?: string,
): Promise<AccountModelChoice | null> {
	if (!ctx.ui.custom) {
		const labels = models.map((model) => `${model.name ?? model.id} [${model.provider ?? "unknown"}]`);
		const selected = await ctx.ui.select(title, labels);
		return selected ? (models[labels.indexOf(selected)] ?? null) : null;
	}
	return ctx.ui.custom<AccountModelChoice | null>((tui: any, theme: any, _keybindings: any, done: (value: AccountModelChoice | null) => void) => {
		const component = new AccountModelPickerComponent(title, models, currentModelId, theme, done);
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

class AccountModelPickerComponent extends Container {
	private readonly listContainer = new Container();
	private readonly searchInput = new Input();
	private filtered: AccountModelChoice[];
	private selectedIndex = 0;
	private readonly maxVisible = 10;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		_title: string,
		private readonly models: AccountModelChoice[],
		currentModelId: string | undefined,
		private readonly theme: any,
		private readonly done: (value: AccountModelChoice | null) => void,
	) {
		super();
		this.filtered = models;
		const currentIndex = currentModelId ? models.findIndex((model) => model.id === currentModelId) : -1;
		if (currentIndex >= 0) this.selectedIndex = currentIndex;
		this.addChild(new Text(theme.fg("muted", "Only showing models from the selected account provider."), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));
		this.addChild(this.listContainer);
		this.updateList();
	}

	refresh(): void {
		const query = this.searchInput.getValue();
		this.filtered = query ? fuzzyFilter(this.models, query, (model) => `${model.id} ${model.name ?? ""} ${model.provider ?? ""}`) : this.models;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		if (this.filtered.length === 0) {
			this.listContainer.addChild(new Text(this.theme.fg("muted", "  No matching models"), 0, 0));
			return;
		}
		const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filtered.length - this.maxVisible));
		const endIndex = Math.min(startIndex + this.maxVisible, this.filtered.length);
		for (let index = startIndex; index < endIndex; index++) {
			const model = this.filtered[index];
			const selected = index === this.selectedIndex;
			const prefix = selected ? this.theme.fg("accent", "→ ") : "  ";
			const modelText = selected ? this.theme.fg("accent", model.id) : model.id;
			const providerText = this.theme.fg("muted", ` [${model.provider ?? "unknown"}]`);
			this.listContainer.addChild(new Text(`${prefix}${modelText}${providerText}`, 0, 0));
		}
		this.listContainer.addChild(new Text(this.theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filtered.length})`), 0, 0));
		const selected = this.filtered[this.selectedIndex];
		if (selected) {
			this.listContainer.addChild(new Spacer(1));
			this.listContainer.addChild(new Text(this.theme.fg("muted", `  Model Name: ${selected.name ?? selected.id}`), 0, 0));
		}
	}

	handleInput(data: string): void {
		const kb = getKeybindings();
		if (kb.matches(data, "tui.select.up")) {
			if (this.filtered.length > 0) this.selectedIndex = this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
			this.updateList();
			return;
		}
		if (kb.matches(data, "tui.select.down")) {
			if (this.filtered.length > 0) this.selectedIndex = this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
			return;
		}
		if (kb.matches(data, "tui.select.confirm")) {
			this.done(this.filtered[this.selectedIndex] ?? null);
			return;
		}
		if (matchesKey(data, Key.escape)) {
			this.done(null);
			return;
		}
		if (matchesKey(data, Key.ctrl("c"))) {
			if (this.searchInput.getValue()) this.searchInput.setValue("");
			else this.done(null);
			this.refresh();
			return;
		}
		this.searchInput.handleInput(data);
		this.refresh();
	}
}

function getModelsForProvider(provider: string, customProviders: ProviderConfig[], ctx: AccountSwitcherContext): Array<{ id: string; name?: string; provider?: string }> {
	const registryModels = [...(ctx.modelRegistry?.getAvailable?.() ?? []), ...(ctx.modelRegistry?.getAll?.() ?? [])]
		.filter((model) => modelProviderMatches(model.provider, provider, customProviders));
	const customProvider = customProviders.find((candidate) => providerMatchesWithCustom(candidate.id, provider, customProviders));
	const customProviderId = customProvider?.id;
	const customModels = (customProvider?.models ?? []).map((model) => ({ id: model.id, name: model.name, provider: customProviderId }));
	const byKey = new Map<string, { id: string; name?: string; provider?: string }>();
	for (const model of [...registryModels, ...customModels]) {
		// Prefer Pi registry metadata over custom provider metadata when the same model is present in both.
		const key = `${model.provider ?? provider}/${model.id}`;
		if (!byKey.has(key)) byKey.set(key, model);
	}
	return [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function modelProviderMatches(modelProvider: string, targetProvider: string, customProviders: ProviderConfig[]): boolean {
	if (customProviders.some((provider) => providerMatchesWithCustom(provider.id, targetProvider, customProviders))) {
		return providerMatchesWithCustom(modelProvider, targetProvider, customProviders);
	}
	return modelProvider === targetProvider;
}
