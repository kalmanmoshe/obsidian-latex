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
} from './obsidian/file_watch';
import { SvgContextMenuDecider } from './latexRender/contextMenu/svgContextMenuDecider';

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
	
	async onload() {
		const startTime = performance.now();
		this.menuDecider = new SvgContextMenuDecider(this);
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
		this.processLatexPreambles(true);
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
		await loadMathJax();
		const preamble = this.settings.mathjaxPreambleEnabled
			? await this.getMathjaxPreamble()
			: '';
		const MJ = (window as any).MathJax;

		// nothing to do
		if (!MJ) {
			console.warn('MathJax not found');
			this.refreshAllWindows();
			return;
		}

		// v3 branch
		if (MJ?.startup?.promise && typeof MJ.tex2chtml === 'function') {
			await MJ.startup.promise; // wait until v3 is fully ready

			if (!MJ.__patchedTex2Chtml) {
				const original = MJ.tex2chtml.bind(MJ);

				MJ.tex2chtml = (
					input: string,
					options: { display: boolean },
				): any => {
					const processed = this.processMathJax(input);
					// prepend preamble on every call (no $$ or \(...\) in preamble!)
					const withPreamble = preamble
						? `${preamble}\n${processed}`
						: processed;
					return original(withPreamble, options);
				};

				MJ.__patchedTex2Chtml = true;
			}

			// do NOT call texReset(); it will erase definitions mid-session
			// If you previously seeded with tex2chtml(preamble), you can remove that too.
			this.refreshAllWindows();

			return;
		}

		//  v2 branch
		// Obsidian **usually** ships v3, but if someone has v2 injected, support it.
		if (MJ?.Hub?.Queue) {
			// Hook TeX translator to inject the preamble text
			MJ.Hub.Register.StartupHook('TeX Jax Ready', () => {
				const TeX = (MJ as any).InputJax.TeX;
				if (!TeX.__patchedTranslate) {
					const orig = TeX.Translate;
					TeX.Translate = function (script: any, state: any) {
						if (preamble && typeof script?.text === 'string') {
							// Important: preamble must be macro defs only (no math delimiters)
							script.text = `${preamble}\n${script.text}`;
						}
						return orig.call(this, script, state);
					};
					TeX.__patchedTranslate = true;
				}
			});

			// retrigger typesetting if needed
			MJ.Hub.Queue(['Typeset', MJ.Hub]);
			this.refreshAllWindows();
			return;
		}

		// unknown MathJax flavor
		this.refreshAllWindows();
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

	private async getMathjaxPreamble(): Promise<string> {
		const mathjaxPreambleFiles = getFileSets(this).mathjaxPreambleFiles;

		const preambles = await getPreambleFromFiles(
			this,
			mathjaxPreambleFiles,
		);
		return preambles.map((preamble) => preamble.content).join('\n');
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
