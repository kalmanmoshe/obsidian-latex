import { Plugin, Notice } from 'obsidian';
import { LatexCompilerPluginSettings, DEFAULT_SETTINGS } from './settings/settings';
import { LatexCompilerSettingTab } from './settings/settingsTab';
import { getEditorCommands } from './obsidian/editorCommands';
import { LatexRenderer } from './latexRender/latexRenderer';
import {
	getAutoUseFilePaths,
	onFileCreate,
	onFileDelete,
} from './obsidian/fileWatch';
import { LatexContextMenuDecider } from './latexRender/contextMenu/latexContextMenuDecider';
import { LATEX_CODE_BLOCKS } from './latexRender/codeBlockTypes';

type WindowWithCodeMirror = Window & {
	CodeMirror?: {
		modeInfo: {
			name: string;
			mime: string;
			mode: string;
		}[];
	};
};
export default class LatexCompilerPlugin extends Plugin {
	settings: LatexCompilerPluginSettings;
	latexRenderer: LatexRenderer = new LatexRenderer();
	menuDecider: LatexContextMenuDecider;

	async onload() {
		const startTime = performance.now();
		console.log('Loading Latex Compiler plugin');
		this.menuDecider = new LatexContextMenuDecider(this);

		await this.loadSettings();

		this.addEditorCommands();
		this.addSyntaxHighlighting();
		this.app.workspace.onLayoutReady(async () => {
			const onStart = performance.now();
			await this.loadLayoutReadyDependencies();
			console.warn(
				'Latex Compiler Plugin layout ready in ' + (performance.now() - onStart) + 'ms',
			);
		});
		this.addSettingTab(new LatexCompilerSettingTab(this));
		console.warn('Latex Compiler Plugin loaded in ' + (performance.now() - startTime) + 'ms');
	}

	onunload() {
		this.removeSyntaxHighlighting();
		void this.latexRenderer.onunload();
	}

	private async loadLayoutReadyDependencies() {
		void this.refreshAutoUseFiles(true);
		// we need to use await here because the codeBlock processor
		// needs to be loaded before the codeBlocks are processed
		await this.latexRenderer.onload(this);
		// processing of the code blocks have layout dependencies
		try {
			this.setCodeblocks();
		} catch (e) {
			console.error('Error setting code blocks:', e);
			new Notice('Error setting code blocks. Please check the console for more details.');
		}
		this.watchFiles();
	}

	private setCodeblocks() {
		//each one refreshes so for each new processor, the block would be rendered multiple times. 
		// (that only hapens once on load, and the queue takes care of most of it)
		for (const [language, definition] of Object.entries(LATEX_CODE_BLOCKS)) {
			this.registerMarkdownCodeBlockProcessor(
				language,
				(source, el, ctx) =>
					this.latexRenderer.codeBlockProcessor(
						source,
						el,
						ctx,
						definition,
					),
			);
		}
	}

	private addSyntaxHighlighting() {
		const codeMirror = (activeWindow as WindowWithCodeMirror).CodeMirror;
		if (!codeMirror) return;

		for (const language of Object.keys(LATEX_CODE_BLOCKS)) {
			if (language === 'latex') continue;

			if (!codeMirror.modeInfo.some(
				info => info.name.toLowerCase() === language.toLowerCase()
			)) {
				codeMirror.modeInfo.push({
					name: language,
					mime: 'text/x-latex',
					mode: 'stex',
				});
			}
		}
	}

	private removeSyntaxHighlighting() {
		const codeMirror = (activeWindow as WindowWithCodeMirror).CodeMirror;
		if (!codeMirror) return;

		const customLanguages = new Set(
			Object.keys(LATEX_CODE_BLOCKS)
				.filter(language => language !== 'latex')
				.map(language => language.toLowerCase()),
		);

		codeMirror.modeInfo = codeMirror.modeInfo.filter(
			info => !customLanguages.has(info.name.toLowerCase()),
		);
	}

	private addEditorCommands() {
		const editorCommands = getEditorCommands(this).filter((command) => command !== undefined);
		for (const command of editorCommands) {
			this.addCommand(command);
		}
	}

	private async loadSettings() {
		let data: unknown = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		await this.saveSettings();
	}

	async saveSettings(didLatexFileLocationChange = false) {
		await this.saveData(this.settings);

		if (didLatexFileLocationChange) {
			this.app.workspace.onLayoutReady(() => {
				this.refreshAutoUseFiles(didLatexFileLocationChange);
			});
		}
	}

	refreshAutoUseFiles(
		becauseFileLocationUpdated = false,
		becauseFileUpdated = false,
	) {
		const autoUsePaths = getAutoUseFilePaths(
			this.app.vault,
			this.settings.autoloadedVfsFilesDir,
		);
		
		this.latexRenderer.vfs.setAutoUseFilePaths(autoUsePaths);

		this.showPreambleLoadedNotice(
			autoUsePaths.size,
			becauseFileLocationUpdated,
			becauseFileUpdated,
		);
	}

	private showPreambleLoadedNotice(
		nExplicitPreambleFiles: number,
		becauseFileLocationUpdated: boolean,
		becauseFileUpdated: boolean,
	) {
		if (!(becauseFileLocationUpdated || becauseFileUpdated)) return;
		const prefix = becauseFileLocationUpdated ? 'Loaded ' : 'Successfully reloaded ';
		const body = [];
		body.push(`${nExplicitPreambleFiles} preamble files`);
		const suffix = '.';
		new Notice(prefix + body.join(' and ') + suffix, 5000);
	}

	private watchFiles() {
		this.registerEvent(this.app.vault.on("rename", () => this.refreshAutoUseFiles(false, true)));
		this.registerEvent(this.app.vault.on("delete", (file) => onFileDelete(this, file)));
		this.registerEvent(this.app.vault.on("create", (file) => onFileCreate(this, file)));
	}

	getDefaultCacheDir(): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/cache`;
	}
}
