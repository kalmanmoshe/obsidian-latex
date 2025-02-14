//git fetch origin
//git reset --hard #Undo all changes
//git fetch --all #Don't use unless necessity. It will overwrite all local changes
//git branch #Check current branch
//git remote set-url origin https://github.com/kalmanmoshe/Doing-it-myself.git #Change remote url
//git pull --all#Pull all branches
//git push --all#Push all branches

import {Plugin,addIcon ,Notice,loadMathJax,} from "obsidian";


import {LatexSuitePluginSettings, DEFAULT_SETTINGS, LatexSuiteCMSettings, processLatexSuiteSettings} from "./settings/settings";
import { LatexSuiteSettingTab } from "./settings/settings_tab";

import {Extension, Prec } from "@codemirror/state";


import { onFileCreate, onFileChange, onFileDelete, getSnippetsFromFiles, getFileSets, } from "./settings/file_watch";
import { ICONS } from "./settings/ui/icons";

import { getEditorCommands } from "./obsidian/editor_commands";
import {  parseSnippets } from "./snippets/parse";
import { tabstopsStateField } from "./snippets/codemirror/tabstops_state_field";
import { snippetQueueStateField } from "./snippets/codemirror/snippet_queue_state_field";
import { snippetInvertedEffects } from "./snippets/codemirror/history";

import { EditorView, tooltips, } from "@codemirror/view";
import { rtlForcePlugin } from "./editor_extensions/editorDecorations";

import { getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { snippetExtensions } from "./snippets/codemirror/extensions";
import { colorPairedBracketsPlugin, highlightCursorBracketsPlugin } from "./editor_extensions/highlight_brackets";
import { mkConcealPlugin } from "./editor_extensions/conceal";
import { cursorTooltipBaseTheme, cursorTooltipField,  } from "./editor_extensions/math_tooltip";
import { onKeydown,onTransaction } from "./inputMonitors";
import { SwiftlatexRender } from "./latexRender/main";
import { processMathBlock } from "./mathParser/iNeedToFindABetorPlace";
import { Suggestor } from "./suggestor";
import { readAndParseSVG } from "./latexRender/svg2latex/temp";

/**
 * Assignments:
 * - Create code that will auto-insert metadata into files. You can use this:
 *   const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
 *   if (file instanceof TFile) {
 *     const metadata = this.plugin.app.metadataCache.getFileCache(file);
 *     console.log(metadata);
 *   }
 * - Create a parser that makes LaTeX error messages more sensible.
 * - CodeBlock specific snippets.
 */



export default class Moshe extends Plugin {
  settings: LatexSuitePluginSettings;
	CMSettings: LatexSuiteCMSettings;
  swiftlatexRender: SwiftlatexRender
  editorExtensions: Extension[]=[];

  async onload() {
    console.log("Loading Moshe math plugin")
    //readAndParseSVG().then((res: any)=>console.log(res))
    await this.loadSettings();
    await loadMathJax();
    await this.loadPreamble();
		this.loadIcons();
		this.addSettingTab(new LatexSuiteSettingTab(this.app, this));
		this.watchFiles();
    this.addEditorCommands();
    this.registerEditorSuggest(new Suggestor(this));
    this.app.workspace.onLayoutReady(() => {
      //if(1===2*3)
      this.loadSwiftLatexRender().then(() => {
        this.addSyntaxHighlighting();
        this.setCodeblocks();
      })
    });
    
  }
  async onunload() {
    this.removeSyntaxHighlighting();
    this.swiftlatexRender.onunload();
  }
  

  private setCodeblocks(){
    this.registerMarkdownCodeBlockProcessor("math", processMathBlock.bind(this));
    this.registerMarkdownCodeBlockProcessor("tikz", this.swiftlatexRender.universalCodeBlockProcessor.bind(this.swiftlatexRender));
		this.registerMarkdownCodeBlockProcessor("latex", this.swiftlatexRender.universalCodeBlockProcessor.bind(this.swiftlatexRender));
  }
  private async loadSwiftLatexRender(){
    this.swiftlatexRender=new SwiftlatexRender()
    await this.swiftlatexRender.onload(this)
    while (this.editorExtensions.length) this.editorExtensions.pop();
  }

  private addSyntaxHighlighting(){
    //@ts-ignore
    window.CodeMirror.modeInfo.push({name: "latexsvg", mime: "text/x-latex", mode: "stex"});
    //@ts-ignore
    window.CodeMirror.modeInfo.push({name: "Tikz", mime: "text/x-latex", mode: "stex"});
  }
  private removeSyntaxHighlighting(){
    //@ts-ignore
    window.CodeMirror.modeInfo = window.CodeMirror.modeInfo.filter(el => el.name != "Tikz");
  }

  private setEditorExtensions() {
		while (this.editorExtensions.length) this.editorExtensions.pop();
		
		this.editorExtensions.push([
			getLatexSuiteConfigExtension(this.CMSettings),
			Prec.highest(EditorView.domEventHandlers({ "keydown": onKeydown })),
      Prec.lowest([colorPairedBracketsPlugin.extension, rtlForcePlugin.extension,]),
      //On transaction causes a lot of a lot of problems and significant.and significantly slows down the computer The more processes are in it
      EditorView.updateListener.of(onTransaction),
			snippetExtensions,

			highlightCursorBracketsPlugin.extension,
			cursorTooltipField.extension,
			cursorTooltipBaseTheme,

      tabstopsStateField.extension,
			snippetQueueStateField.extension,
			snippetInvertedEffects,
			tooltips({ position: "absolute" }),
		]);

		if (this.CMSettings.concealEnabled) {
			const timeout = this.CMSettings.concealRevealTimeout;
			this.editorExtensions.push(mkConcealPlugin(timeout).extension);
		}

		this.registerEditorExtension(this.editorExtensions.flat());
	}

  private addEditorCommands() {
		for (const command of getEditorCommands(this)) {
			this.addCommand(command);
		}
	}
  

  private async getSettingsSnippets() {
    try {
			return await parseSnippets(this.settings.snippets);
		} catch (e) {
			new Notice(`Failed to load snippets from settings: ${e}`);
      console.error(`Failed to load snippets from settings: ${e}`);
			return [];
		}
	}


  private loadIcons() {
    for (const [iconId, svgContent] of Object.entries(ICONS)) {
      addIcon(iconId, svgContent);
    }
  }
  getApp() { return this.app }
  
  private async loadSettings() {
    let data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);


    if (this.settings.loadSnippetsFromFile) {
      const tempSnippets = await this.getSettingsSnippets();

      this.CMSettings = processLatexSuiteSettings(tempSnippets, this.settings);

      // Use onLayoutReady so that we don't try to read the snippets file too early
      this.app.workspace.onLayoutReady(() => {
        this.processSettings();
      });
    }
    else {
      await this.processSettings();
    }
  }

  async loadPreamble() {
    let preamble = ''
    try {
      preamble=await this.app.vault.adapter.read(this.settings.preambleFileLocation);
    }
    catch (e) {
      console.warn(`Failed to read preamble file: ${e}`);
    }
    const MJ: any = MathJax;
    if (MJ.tex2chtml === undefined) {
      MJ.startup.ready = () => {
        MJ.startup.defaultReady();
        MJ.tex2chtml(preamble);
      };
    } else {
      MJ.tex2chtml(preamble);
    }
  }
  

  async saveSettings(didFileLocationChange = false) {
		await this.saveData(this.settings);
		this.processSettings(didFileLocationChange);
	}
  async saveSettingsWithoutProcessing(){await this.saveData(this.settings);}

  async processSettings(becauseFileLocationUpdated = false, becauseFileUpdated = false) {
		this.CMSettings = processLatexSuiteSettings(await this.getSnippets(becauseFileLocationUpdated, becauseFileUpdated), this.settings);
    this.setEditorExtensions();
		this.app.workspace.updateOptions();
	}
  
  private async getSnippets(becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean) {
		// Get files in snippet/variable folders.
		// If either is set to be loaded from settings the set will just be empty.
		const files = getFileSets(this);


		// This must be done in either case, because it also updates the set of snippet files
		const snippets =
			this.settings.loadSnippetsFromFile
				? await getSnippetsFromFiles(this, files)
				: await this.getSettingsSnippets();
		this.showSnippetsLoadedNotice(snippets.length,  becauseFileLocationUpdated, becauseFileUpdated);

		return snippets;
	}
  
  private showSnippetsLoadedNotice(nSnippets: number, becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean) {
		if (!(becauseFileLocationUpdated || becauseFileUpdated))
			return;

		const prefix = becauseFileLocationUpdated ? "Loaded " : "Successfully reloaded ";
		const body = [];

		if (this.settings.loadSnippetsFromFile)
			body.push(`${nSnippets} snippets`);

		const suffix = " from files.";
		new Notice(prefix + body.join(" and ") + suffix, 5000);
	}

  private watchFiles() {
    // Only begin watching files once the layout is ready.
    this.app.workspace.onLayoutReady(() => {
      // Set up a Chokidar watcher for .sty files
      const vaultEvents = {
        "modify": onFileChange,
        "delete": onFileDelete,
        "create": onFileCreate
      };

      for (const [eventName, callback] of Object.entries(vaultEvents)) {
        // @ts-expect-error
        this.registerEvent(this.app.vault.on(eventName, (file: TAbstractFile) => callback(this, file)));
      }
    });
  }
}
