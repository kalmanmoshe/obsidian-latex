//git fetch origin
//git reset --hard #Undo all changes
//git fetch --all #Don't use unless necessity. It will overwrite all local changes
//git branch #Check current branch
//git remote set-url origin https://github.com/kalmanmoshe/Doing-it-myself.git #Change remote url
//git pull --all#Pull all branches
//git push --all#Push all branches

import { Plugin, Notice, FileSystemAdapter, MarkdownView, loadMathJax } from 'obsidian';

import {
	LatexRenderPluginSettings,
	DEFAULT_SETTINGS,
} from './settings/settings';
import { LatexRenderSettingTab } from './settings/settings_tab';

import { getEditorCommands } from './obsidian/editor_commands';
import { SwiftlatexRender } from './latexRender/swiftlatexRender';
import { MathJaxAbstractSyntaxTree } from './ast/mathJaxAbstractSyntaxTree';
import {
	getFileSets,
	getPreambleFromFiles,
	onFileChange,
	onFileCreate,
	onFileDelete,
	PreambleFile,
} from './obsidian/file_watch';
import { SvgContextMenuDecider } from './latexRender/contextMenu/svgContextMenuDecider';
import { MathjaxVFS } from './latexRender/MathjaxVFS';

/**
 * Assignments:
 * - Create code that will auto-insert metadata into files. You can use this:
 *   const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
 *   if (file instanceof TFile) {
 *     const metadata = app.metadataCache.getFileCache(file);
 *     console.log(metadata);
 *   }
 * - Create qna for better Searching finding and styling
 */

/**
 * - `\include{}` → Creates `.aux` files and includes the content, which **does** affect compile time.
- `\input{}` → Directly injects the content **without** creating separate `.aux` files, still affecting compile time.
- External files via `\externaldocument{}` (for `xr` or `xr-hyper`) → Adds lookup time for cross-references.
 */
/**
 * With Corprieambol whatever is loaded is loaded if explicit. I have to make sure that.only the files is specified are loaded To the engine.
 */

export default class LatexRender extends Plugin {
	settings: LatexRenderPluginSettings;
	swiftlatexRender: SwiftlatexRender = new SwiftlatexRender();
	menuDecider: SvgContextMenuDecider;
	mathJaxVFS: MathjaxVFS;
	
	async onload() {
		const startTime = performance.now();
		this.menuDecider = new SvgContextMenuDecider(this);
		this.mathJaxVFS = new MathjaxVFS();
		console.log('Loading Moshe math plugin');
		await this.loadSettings();
		console.log('loaded settings', this.settings)

		this.addEditorCommands();
		this.addSyntaxHighlighting();
		app.workspace.onLayoutReady(async () => {
			const onStart = performance.now();
			await this.loadLayoutReadyDependencies();
			console.warn(
				'Moshe Math Plugin layout ready in ' +
				(performance.now() - onStart) +
				'ms',
			);
		});
		this.addSettingTab(new LatexRenderSettingTab(this));
		console.warn(
			'Moshe Math Plugin loaded in ' +
			(performance.now() - startTime) +
			'ms',
		);
		//this.registerEditorSuggest()
	}

	async onunload() {
		this.removeSyntaxHighlighting();
		this.swiftlatexRender.onunload();
	}

	private async loadLayoutReadyDependencies() {
		console.log('Processing LaTeX preambles...');
		this.processLatexPreambles(true);
		console.log('Processed LaTeX preambles');
		this.loadMathJax();
		// we need to use await here because the codeBlock processor
		// needs to be loaded before the codeBlocks are processed
		await this.swiftlatexRender.onload(this);
		// processing of the code blocks have layout dependencies
		try {
			this.setCodeblocks();
		} catch (e) {
			console.error('Error setting code blocks:', e);
			new Notice(
				'Error setting code blocks. Please check the console for more details.',
			);
		}
		this.watchFiles();
	}

	private addTestCodeBlocks() {
		this.registerMarkdownCodeBlockProcessor(
			'test',
			this.swiftlatexRender.testCodeBlockProcessor.bind(
				this.swiftlatexRender,
			),
		);
		this.registerMarkdownCodeBlockProcessor(
			'testVfs',
			this.swiftlatexRender.testVfsCodeBlockProcessor.bind(
				this.swiftlatexRender,
			),
		)
	}

	private setCodeblocks() {
		this.addTestCodeBlocks()
		this.registerMarkdownCodeBlockProcessor(
			'tikz',
			this.swiftlatexRender.codeBlockProcessor.bind(
				this.swiftlatexRender,
			),
		);
		this.registerMarkdownCodeBlockProcessor(
			'latex',
			this.swiftlatexRender.codeBlockProcessor.bind(
				this.swiftlatexRender,
			),
		);
	}

	private addSyntaxHighlighting() {
		if (!window.CodeMirror) return;

		// @ts-ignore
		const codeMirrorCodeBlocksSyntaxHighlighting = //@ts-ignore
			window.CodeMirror.modeInfo;
		if (
			!codeMirrorCodeBlocksSyntaxHighlighting.some(
				(el: any) => el.name === 'latexsvg',
			)
		) {
			codeMirrorCodeBlocksSyntaxHighlighting.push({
				name: 'latexsvg',
				mime: 'text/x-latex',
				mode: 'stex',
			});
		}
		if (
			!codeMirrorCodeBlocksSyntaxHighlighting.some(
				(el: any) => el.name === 'Tikz',
			)
		) {
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
			(el: { name: string }) =>
				el.name != 'Tikz' && el.name != 'latexsvg',
		);
	}

	private addEditorCommands() {
		const editorCommands = getEditorCommands(this).filter(
			(command) => command !== undefined,
		);
		for (const command of editorCommands) {
			this.addCommand(command);
		}
	}

	async loadMathJax(): Promise<void> {
		console.warn('Loading MathJax...');
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

			const preambles = await Promise.all(paths.map((path) => this.mathJaxVFS.getFileWithInlinedDependencies(path)));
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
					console.log()
				}
			}
		});
	}

	private async updateMathjaxVFS(): Promise<void> {
		const mathjaxPreambleFiles = getFileSets(this).mathjaxPreambleFiles;
		
		const preambles = await getPreambleFromFiles(
			this,
			mathjaxPreambleFiles,
		);
		
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
		await this.swiftlatexRender.vfs.setEnabled(
			this.settings.compilerVfsEnabled,
		);
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

	async processLatexPreambles(
		becauseFileLocationUpdated = false,
		becauseFileUpdated = false,
	) {
		const coorPreambles = await this.getlatexPreambleFiles(
			becauseFileLocationUpdated,
			becauseFileUpdated,
		);
		if (becauseFileLocationUpdated) {
			this.swiftlatexRender.vfs.removeAutoUseFiles();
		}
		await this.swiftlatexRender.vfs.addOrReplaceFiles(coorPreambles);
		const filePaths = new Set(coorPreambles.map((file) => file.path));
		this.swiftlatexRender.vfs.setCoorVirtualFiles(filePaths);
	}

	private async getlatexPreambleFiles(
		becauseFileLocationUpdated: boolean,
		becauseFileUpdated: boolean,
	) {
		const files = getFileSets(this);
		const coorFiles = await getPreambleFromFiles(
			this,
			files.latexVirtualFiles,
		);
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
		const prefix = becauseFileLocationUpdated
			? 'Loaded '
			: 'Successfully reloaded ';
		const body = [];
		body.push(`${nExplicitPreambleFiles} preamble files`);
		const suffix = '.';
		new Notice(prefix + body.join(' and ') + suffix, 5000);
	}

	getVaultPath() {
		if (app.vault.adapter instanceof FileSystemAdapter) {
			return app.vault.adapter.getBasePath();
		} else {
			throw new Error('Moshe: Could not get vault path.');
		}
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
					app.vault.on(eventName, (file: TAbstractFile) =>
						callback(this, file),
					),
				);
			}
		});
	}
}
