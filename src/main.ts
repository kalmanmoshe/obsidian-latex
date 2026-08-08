import { Plugin, Notice } from 'obsidian';
import { LatexCompilerPluginSettings, DEFAULT_SETTINGS } from './settings/settings';
import { LatexCompilerSettingTab } from './settings/settingsTab';
import { getEditorCommands } from './obsidian/editorCommands';
import { LatexRenderer } from './latexRender/latexRenderer';
import {
	getFilesWithin,
	getPreambleFromFiles,
	onFileChange,
	onFileCreate,
	onFileDelete,
} from './obsidian/fileWatch';
import { LatexContextMenuDecider } from './latexRender/contextMenu/latexContextMenuDecider';
import { LatexRenderMode } from './latexRender/task/latexTask';

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
		void this.processLatexPreambles(true);
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
		this.registerMarkdownCodeBlockProcessor(
			'tikz',
			(s, e, c) => this.latexRenderer.codeBlockProcessor(s, e, c, LatexRenderMode.SVG),
		);
		this.registerMarkdownCodeBlockProcessor(
			'latex',
			(s, e, c) => this.latexRenderer.codeBlockProcessor(s, e, c, LatexRenderMode.PDF),
		);
	}

	private addSyntaxHighlighting() {
		const codeMirror = (activeWindow as WindowWithCodeMirror).CodeMirror;
		if (!codeMirror) return;

		const codeMirrorCodeBlocksSyntaxHighlighting = codeMirror.modeInfo;
		if (!codeMirrorCodeBlocksSyntaxHighlighting.some(el => el.name === 'latexsvg')) {
			codeMirrorCodeBlocksSyntaxHighlighting.push({
				name: 'latexsvg',
				mime: 'text/x-latex',
				mode: 'stex',
			});
		}
		if (!codeMirrorCodeBlocksSyntaxHighlighting.some(el => el.name === 'Tikz')) {
			codeMirrorCodeBlocksSyntaxHighlighting.push({
				name: 'Tikz',
				mime: 'text/x-latex',
				mode: 'stex',
			});
		}
	}

	private removeSyntaxHighlighting() {
		const codeMirror = (activeWindow as WindowWithCodeMirror).CodeMirror;
		if (!codeMirror) return;
		codeMirror.modeInfo = codeMirror.modeInfo.filter(
			el => el.name != 'Tikz' && el.name != 'latexsvg',
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
		await this.latexRenderer.vfs?.setEnabled(this.settings.compilerVfsEnabled);

		if (didLatexFileLocationChange && this.settings.compilerVfsEnabled) {
			this.app.workspace.onLayoutReady(async () => {
				await this.processLatexPreambles(didLatexFileLocationChange);
			});
		}
	}

	async processLatexPreambles(becauseFileLocationUpdated = false, becauseFileUpdated = false) {
		const coorPreambles = await this.getlatexPreambleFiles(
			becauseFileLocationUpdated,
			becauseFileUpdated,
		);
		if (becauseFileLocationUpdated) {
			await this.latexRenderer.vfs.removeAutoUseFiles();
		}
		await this.latexRenderer.vfs.addOrReplaceFiles(coorPreambles);
		const filePaths = new Set(coorPreambles.map((file) => file.path));
		this.latexRenderer.vfs.setCoorVirtualFiles(filePaths);
	}

	private async getlatexPreambleFiles(
		becauseFileLocationUpdated: boolean,
		becauseFileUpdated: boolean,
	) {
		const files = getFilesWithin(this.app.vault, this.settings.autoloadedVfsFilesDir);
		const coorFiles = await getPreambleFromFiles(files, this.app);
		this.showPreambleLoadedNotice(
			coorFiles.length,
			becauseFileLocationUpdated,
			becauseFileUpdated,
		);
		return coorFiles;
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
		this.registerEvent(this.app.vault.on("modify", (file) => onFileChange(this, file)));
		this.registerEvent(this.app.vault.on("delete", (file) => onFileDelete(this, file)));
		this.registerEvent(this.app.vault.on("create", (file) => onFileCreate(this, file)));
	}

	getDefaultCacheDir(): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/cache`;
	}
}
