import { Notice, PluginSettingTab, Setting, setIcon } from 'obsidian';
import LatexRenderPlugin from '../main';
import { CompilerType, DEFAULT_SETTINGS, OverflowStrategy } from './settings';
import {
	addDropdownSetting,
	addToggleSetting,
	setPluginInstance,
	addButtonSetting,
	addFileSearchSetting,
} from 'obsidian-dev-utils';

const FILE_SEARCH_DEBOUNCE_MS = 5000;

export class LatexCompilerSettingTab extends PluginSettingTab {
	plugin: LatexRenderPlugin;

	constructor(plugin: LatexRenderPlugin) {
		super(plugin.app, plugin);
		this.plugin = plugin;
		setPluginInstance(plugin);
	}

	addHeading(containerEl: HTMLElement, name: string, icon = 'math') {
		const heading = new Setting(containerEl).setName(name).setHeading();
		const parentEl = heading.settingEl;
		const iconEl = parentEl.createDiv();
		setIcon(iconEl, icon);
		iconEl.addClass('latex-compiler-math-settings-icon');
		parentEl.prepend(iconEl);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.displayGraphSettings();
		this.displayCachedSettings();
		this.displayPreambleSettings();
	}

	private displayGraphSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, 'graph', 'ballpen');
		addToggleSetting(
			containerEl,
			(value: boolean) => {
				this.plugin.settings.invertColorsInDarkMode = value;
				void this.plugin.saveSettings()
			},
			{
				name: 'Invert colors in dark mode',
				description:
					'Invert colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.',
				defValue: this.plugin.settings.invertColorsInDarkMode,
			},
		);
		addDropdownSetting(
			containerEl,
			(value: string) => {
				this.plugin.settings.overflowStrategy = value as OverflowStrategy;
				void this.plugin.saveSettings();
			},
			{
				name: 'Overflow strategy',
				description:
					"What to do when the content overflows the container. 'downscale' - downscale the content, 'scroll' - add a scrollbar, 'hidden' - do nothing, content will overflow.",
				dropDownOptions: {
					downscale: 'Downscale',
					scroll: 'Scroll',
					hidden: 'Hidden',
				},
				defValue: this.plugin.settings.overflowStrategy,
			},
		);
		
		addDropdownSetting(
			containerEl,
			async (value: string) => {
				this.plugin.settings.compiler = value as CompilerType;
				await this.plugin.saveSettings();
				void this.plugin.latexRenderer.switchCompiler();
			},
			{
				name: 'Compiler',
				description:
					"Choose the LaTeX compiler for rendering diagrams. 'PdfTeX' is the classic engine, while 'XeTeX' offers better Unicode and modern font support. Changing this may affect compatibility and output.",
				dropDownOptions: {
					[CompilerType.PdfTeX]: 'PdfTeX',
					[CompilerType.XeTeX]: 'XeTeX',
				},
				defValue: this.plugin.settings.compiler,
			},
		);

		addToggleSetting(
			containerEl,
			(value: boolean) => {
				this.plugin.settings.saveLogs = value;
				void this.plugin.saveSettings();
			},
			{
				name: 'Save latex logs',
				description: 'Whether to save the latex render logs (memory only not physical)',
				defValue: this.plugin.settings.saveLogs,
			},
		);
	}
	private displayCachedSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, 'cache', 'database');

		addToggleSetting(
			containerEl,
			async (value: boolean) => {
				this.plugin.settings.physicalCache = value;
				await this.plugin.saveSettings();
				await this.plugin.latexRenderer.cache.resultFileCache.togglePhysicalCache();
				physicalCacheLocationSetting.settingEl.toggleClass('hidden', !value);
			},
			{
				name: 'Physical cache enabled',
				description:
					'Whether to use a physical cache for rendered diagrams. If enabled, rendered diagrams are stored on disk, improving performance for subsequent loads. When disabled, diagrams are cached in memory only, which may lead to slower performance on startup but reduces disk usage.',
				defValue: this.plugin.settings.physicalCache,
			},
		);

		const physicalCacheLocationSetting = addFileSearchSetting(
			containerEl,
			async (value: string) => {
				this.plugin.settings.physicalCacheLocation = value;
				await this.plugin.saveSettings();
				await this.plugin.latexRenderer.cache.resultFileCache.changeCacheDirectory();
			},
			{
				name: 'Physical cache location',
				description:
					'The directory where rendered diagrams are stored. Empty for default, "/" for the vault root, or a specific path.',
				placeholder: DEFAULT_SETTINGS.physicalCacheLocation,
				defValue: this.plugin.settings.physicalCacheLocation,
				debounce: { timeout: FILE_SEARCH_DEBOUNCE_MS, resetTimer: true },
			},
		);
		physicalCacheLocationSetting.settingEl.toggleClass(
			'hidden',
			!this.plugin.settings.physicalCache,
		);
		addButtonSetting(
			containerEl,
			async () => {
				await this.plugin.latexRenderer.cache.resultFileCache.removeAllCached();
				new Notice('Cleared cached svgs');
			},
			{
				name: 'Clear cached result files',
				description:
					"Result files (pdf, svg) rendered with the plugin are cached, so latex don't have to be re-rendered from scratch every time you open a page. Use this to clear the cache and force all latex to be re-rendered.",
				elText: 'Clear cached result files',
				icon: 'trash',
				tooltip: 'Clear cached result files',
			},
		);
	}

	private displayPreambleSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, 'Preamble', 'pencil');

		const virtualFilesDescription = activeDocument.createDocumentFragment();

		const description = activeDocument.createElement('span');
		description.textContent =
			'Allows the LaTeX engine to load external files into its virtual filesystem. ' +
			'Enabling this lets you use commands such as \\include{} to reference external files. ' +
			'When disabled, all LaTeX commands must rely solely on content provided directly in the code block.';

		virtualFilesDescription.appendChild(description);
		addToggleSetting(
			containerEl,
			(value: boolean) => {
				this.plugin.settings.compilerVfsEnabled = value;
				virtualFilesFromCodeBlocks.settingEl.toggleClass('hidden', !value);
				autoloadedVfsFilesDir.settingEl.toggleClass('hidden', !value);
			},
			{
				name: 'Enable virtual files',
				description: virtualFilesDescription,
				defValue: this.plugin.settings.compilerVfsEnabled,
				passToSave: { didFileLocationChange: true },
			},
		);
		const descriptionFragment = activeDocument.createDocumentFragment();
		const descriptionDetails = activeDocument.createElement('span');
		descriptionDetails.textContent =
			"When enabled, code blocks with a header specifying a name (e.g., 'name: someAwesomeCode') " +
			'can be included directly in your LaTeX code using commands like \\include{}. ' +
			'The name provided in the header identifies the code block as a virtual file. ' +
			'If disabled, this functionality is unavailable. ' +
			"Note: the default file extension is '.tex', unless explicitly specified.";
		descriptionFragment.appendChild(descriptionDetails);

		const virtualFilesFromCodeBlocks = addToggleSetting(
			containerEl,
			(value: boolean) => {
				this.plugin.settings.virtualFilesFromCodeBlocks = value;
			},
			{
				name: 'Enable virtual files from code blocks',
				description: descriptionFragment,
				defValue: this.plugin.settings.virtualFilesFromCodeBlocks,
				passToSave: { didFileLocationChange: true },
			},
		);
		virtualFilesFromCodeBlocks.settingEl.toggleClass(
			'hidden',
			!this.plugin.settings.compilerVfsEnabled,
		);
		const autoloadedVfsFilesDir = addFileSearchSetting(
			containerEl,
			async (value: string) => {
				this.plugin.settings.autoloadedVfsFilesDir = value;
				await this.plugin.saveSettings(true);
			},
			{
				name: 'Autoloaded virtual files',
				description:
					'Specify a directory containing virtual files to automatically include in every LaTeX render. ',
				placeholder: DEFAULT_SETTINGS.autoloadedVfsFilesDir,
				defValue: this.plugin.settings.autoloadedVfsFilesDir,
				debounce: { timeout: FILE_SEARCH_DEBOUNCE_MS, resetTimer: true },
			},
		);
		autoloadedVfsFilesDir.settingEl.toggleClass(
			'hidden',
			!this.plugin.settings.compilerVfsEnabled,
		);
	}
}
