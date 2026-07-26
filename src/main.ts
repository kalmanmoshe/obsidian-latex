import { Plugin, Notice, MarkdownView, loadMathJax } from 'obsidian';
import { LatexCompilerPluginSettings, DEFAULT_SETTINGS } from './settings/settings';
import { LatexCompilerSettingTab } from './settings/settings_tab';

import { getEditorCommands } from './obsidian/editor_commands';
import { LatexRenderer } from './latexRender/LatexRenderer';
import { MathJaxAbstractSyntaxTree } from './ast/mathJaxAbstractSyntaxTree';
import {
	getFileSets,
	getPreambleFromFiles,
	onFileChange,
	onFileCreate,
	onFileDelete,
} from './obsidian/file_watch';
import { SvgContextMenuDecider } from './latexRender/contextMenu/svgContextMenuDecider';
import { MathjaxVFS } from './latexRender/MathjaxVFS';

export default class LatexCompilerPlugin extends Plugin {
	settings: LatexCompilerPluginSettings;
	latexRenderer: LatexRenderer = new LatexRenderer();
	menuDecider: SvgContextMenuDecider;
	mathJaxVFS: MathjaxVFS;

	async onload() {
		const startTime = performance.now();
		console.log('Loading Latex Compiler plugin');
		this.menuDecider = new SvgContextMenuDecider(this);
		this.mathJaxVFS = new MathjaxVFS();

		await this.loadSettings();

		this.addEditorCommands();
		this.addSyntaxHighlighting();
		app.workspace.onLayoutReady(async () => {
			const onStart = performance.now();
			await this.loadLayoutReadyDependencies();
			console.warn(
				'Latex Compiler Plugin layout ready in ' + (performance.now() - onStart) + 'ms',
			);
		});
		this.addSettingTab(new LatexCompilerSettingTab(this));
		console.warn('Latex Compiler Plugin loaded in ' + (performance.now() - startTime) + 'ms');
	}

	async onunload() {
		this.removeSyntaxHighlighting();
		this.latexRenderer.onunload();
	}

	private async loadLayoutReadyDependencies() {
		this.processLatexPreambles(true);
		this.loadMathJax();
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
		this.registerMarkdownCodeBlockProcessor(
			'tikz',
			this.latexRenderer.codeBlockProcessor.bind(this.latexRenderer),
		);
		this.registerMarkdownCodeBlockProcessor(
			'latex',
			this.latexRenderer.codeBlockProcessor.bind(this.latexRenderer),
		);
	}

	private addSyntaxHighlighting() {
		if (!window.CodeMirror) return;

		// @ts-ignore
		const codeMirrorCodeBlocksSyntaxHighlighting = window.CodeMirror.modeInfo; //@ts-ignore
		if (!codeMirrorCodeBlocksSyntaxHighlighting.some((el: any) => el.name === 'latexsvg')) {
			codeMirrorCodeBlocksSyntaxHighlighting.push({
				name: 'latexsvg',
				mime: 'text/x-latex',
				mode: 'stex',
			});
		}
		if (!codeMirrorCodeBlocksSyntaxHighlighting.some((el: any) => el.name === 'Tikz')) {
			codeMirrorCodeBlocksSyntaxHighlighting.push({
				name: 'Tikz',
				mime: 'text/x-latex',
				mode: 'stex',
			});
		}
	}

	private removeSyntaxHighlighting() {
		//@ts-ignore
		window.CodeMirror.modeInfo = window.CodeMirror.modeInfo.filter(
			(el: { name: string }) => el.name != 'Tikz' && el.name != 'latexsvg',
		);
	}

	private addEditorCommands() {
		const editorCommands = getEditorCommands(this).filter((command) => command !== undefined);
		for (const command of editorCommands) {
			this.addCommand(command);
		}
	}

	async loadMathJax(): Promise<void> {
		await loadMathJax();

		await this.updateMathjaxVFS();

		const MJ = (window as any).MathJax;
		if (!MJ?.startup?.promise) {
			this.refreshAllWindows();
			return;
		}

		await MJ.startup.promise;

		let preamble = '';
		if (this.settings.mathjaxPreambleEnabled) {
			const paths = this.mathJaxVFS.getRootFilePaths();

			const preambles = await Promise.all(
				paths.map((path) => this.mathJaxVFS.getFileWithInlinedDependencies(path)),
			);
			preamble = preambles.join('\n');
		}

		if (preamble.trim()) {
			this.seedMathJaxPreamble(MJ, preamble);
		}

		this.patchMathJaxRender(MJ);
		this.refreshAllWindows();
	}

	private seedMathJaxPreamble(MJ: any, preamble: string) {
		// Important: no $$, no \( \), only macro definitions.
		// tex2mml parses it and stores \newcommand definitions globally.
		MJ.tex2mml(preamble);
	}

	private patchMathJaxRender(MJ: any) {
		// On plugin reload, if Obsidian itself doesn't reload, the flag will still be true
		// because the global MathJax object persists through
		if (MJ.__patchedTex2Chtml) return;

		const original = MJ.tex2chtml.bind(MJ);

		MJ.tex2chtml = (input: string, options: { display: boolean }) => {
			const processed = this.processMathJax(input);
			return original(processed, options);
		};

		MJ.__patchedTex2Chtml = true;
	}

	private refreshAllWindows() {
		app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				const editor = leaf.view.editor;
				if (editor) {
					const cursor = editor.getCursor();
					editor.setValue(editor.getValue());
					editor.setCursor(cursor);
				}
			}
		});
	}

	private async updateMathjaxVFS(): Promise<void> {
		const mathjaxPreambleFiles = getFileSets(this).mathjaxPreambleFiles;

		const preambles = await getPreambleFromFiles(mathjaxPreambleFiles);

		this.mathJaxVFS.flush();
		await this.mathJaxVFS.addOrReplaceFiles(preambles);
	}

	private processMathJax(input: string): string {
		//return input
		if (!/[א-ת]/.test(input)) return input;
		const ast = MathJaxAbstractSyntaxTree.parse(input);
		ast.reverseRtl();

		return ast.toString();
	}

	private async loadSettings() {
		let data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		await this.saveSettings();
	}

	async saveSettings(didMathjaxFileLocationChange = false, didLatexFileLocationChange = false) {
		await this.saveData(this.settings);
		await this.latexRenderer.vfs.setEnabled(this.settings.compilerVfsEnabled);
		await this.mathJaxVFS.setEnabled(this.settings.mathjaxPreambleEnabled);

		if (didLatexFileLocationChange && this.settings.compilerVfsEnabled) {
			app.workspace.onLayoutReady(async () => {
				await this.processLatexPreambles(didLatexFileLocationChange);
			});
		}

		if (didMathjaxFileLocationChange && this.settings.mathjaxPreambleEnabled) {
			app.workspace.onLayoutReady(async () => {
				await this.loadMathJax();
			});
		}
	}

	async processLatexPreambles(becauseFileLocationUpdated = false, becauseFileUpdated = false) {
		const coorPreambles = await this.getlatexPreambleFiles(
			becauseFileLocationUpdated,
			becauseFileUpdated,
		);
		if (becauseFileLocationUpdated) {
			this.latexRenderer.vfs.removeAutoUseFiles();
		}
		await this.latexRenderer.vfs.addOrReplaceFiles(coorPreambles);
		const filePaths = new Set(coorPreambles.map((file) => file.path));
		this.latexRenderer.vfs.setCoorVirtualFiles(filePaths);
	}

	private async getlatexPreambleFiles(
		becauseFileLocationUpdated: boolean,
		becauseFileUpdated: boolean,
	) {
		const files = getFileSets(this);
		const coorFiles = await getPreambleFromFiles(files.latexVirtualFiles);
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
		// Only begin watching files once the layout is ready.
		app.workspace.onLayoutReady(() => {
			// Set up a Chokidar watcher for .sty files
			const vaultEvents = {
				modify: onFileChange,
				delete: onFileDelete,
				create: onFileCreate,
			};

			for (const [eventName, callback] of Object.entries(vaultEvents)) {
				this.registerEvent(
					// @ts-expect-error
					app.vault.on(eventName, (file: TAbstractFile) => callback(this, file)),
				);
			}
		});
	}

	getDefaultCacheDir(): string {
		return `${this.app.vault.configDir}/plugins/${this.manifest.id}/cache`;
	}
}
