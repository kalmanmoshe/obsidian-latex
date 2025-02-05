//git fetch origin
//git reset --hard #Undo all changes
//git fetch --all #Don't use unless necessity. It will overwrite all local changes
//git branch #Check current branch


import {Plugin, MarkdownRenderer,addIcon, App, Modal, Component, Setting,Notice, WorkspaceWindow,loadMathJax,renderMath, MarkdownView, EditorSuggest, EditorSuggestTriggerInfo, EditorPosition, Editor, TFile, EditorSuggestContext, FileSystemAdapter} from "obsidian";
import nerdamer from "nerdamer";

import {LatexSuitePluginSettings, DEFAULT_SETTINGS, LatexSuiteCMSettings, processLatexSuiteSettings} from "./settings/settings";
import { LatexSuiteSettingTab } from "./settings/settings_tab";

import {Extension, Prec } from "@codemirror/state";


import { onFileCreate, onFileChange, onFileDelete, getSnippetsFromFiles, getFileSets, getVariablesFromFiles, tryGetVariablesFromUnknownFiles } from "./settings/file_watch";
import { ICONS } from "./settings/ui/icons";

import { getEditorCommands } from "./obsidian/editor_commands";
import { SnippetVariables, parseSnippetVariables, parseSnippets } from "./snippets/parse";
import { tabstopsStateField } from "./snippets/codemirror/tabstops_state_field";
import { snippetQueueStateField } from "./snippets/codemirror/snippet_queue_state_field";
import { snippetInvertedEffects } from "./snippets/codemirror/history";

import { EditorView, ViewPlugin, ViewUpdate ,Decoration, tooltips, } from "@codemirror/view";
import { HtmlBackgroundPlugin, rtlForcePlugin } from "./editorDecorations";

import { getLatexSuiteConfig, getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { snippetExtensions } from "./snippets/codemirror/extensions";
import { colorPairedBracketsPlugin, highlightCursorBracketsPlugin } from "./editor_extensions/highlight_brackets";
import { mkConcealPlugin } from "./editor_extensions/conceal";
import { cursorTooltipBaseTheme, cursorTooltipField,  } from "./editor_extensions/math_tooltip";
import { onClick, onKeydown, onMove, onScroll, onTransaction } from "./ inputMonitors";
import { SwiftlatexRender } from "./latexRender/main";
import { processMathBlock } from "./mathParser/iNeedToFindABetorPlace";


/**
 * Assignments:
 * - Create code that will auto-insert metadata into files.
 * - Create a parser that makes LaTeX error messages more sensible.
 * - Improve the hashing system to hash the same string to the same value, excluding comments, spaces, and new lines.
 * - Add an error catch system to avoid reevaluating already proven faulty code.
 * - Don't save files as PDFs save them as SVG as it removes a step in the processing
 * - Make a queue in which each.code block will be processed so you dont have to multiple processes at once.
 * - in said  view remove from queue if new one was added
 * - 
 */



export default class Moshe extends Plugin {
  settings: LatexSuitePluginSettings;
	CMSettings: LatexSuiteCMSettings;
  swiftlatexRender: SwiftlatexRender
  editorExtensions: Extension[]=[];

  async onload() {
    console.log("new lod")
    await this.loadSettings();
    await loadMathJax();
    await this.loadPreamble();
		this.loadIcons();
		this.addSettingTab(new LatexSuiteSettingTab(this.app, this));
		this.watchFiles();
    this.addEditorCommands();
    var eq = nerdamer('a*x^2+b*x=y').evaluate();
    console.log(eq.toString());
    var solutions = eq.solveFor('x').toString();
    console.log(solutions);

    this.app.workspace.onLayoutReady(() => {
      if(1===2*2)
      this.loadSwiftLatexRender().then(()=>{{
        this.addSyntaxHighlighting();
        this.setCodeblocks();
      }})
    });
    
  }
  async onunload() {
    this.removeSyntaxHighlighting();
	}

  private setCodeblocks(){
    this.registerMarkdownCodeBlockProcessor("math", processMathBlock.bind(this));
    this.registerMarkdownCodeBlockProcessor("tikz", this.swiftlatexRender.universalCodeBlockProcessor.bind(this.swiftlatexRender));
		this.registerMarkdownCodeBlockProcessor("latex", this.swiftlatexRender.universalCodeBlockProcessor.bind(this.swiftlatexRender));
		this.registerMarkdownCodeBlockProcessor("latexsvg", this.swiftlatexRender.universalCodeBlockProcessor.bind(this.swiftlatexRender));
  }
  private async loadSwiftLatexRender(){
    this.swiftlatexRender=new SwiftlatexRender()
    await this.swiftlatexRender.onload(this)
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
      //Prec.default(EditorView.domEventHandlers({"scroll": onScroll, "click": onClick, "mousemove": onMove })),
      Prec.lowest([colorPairedBracketsPlugin.extension, rtlForcePlugin.extension,HtmlBackgroundPlugin.extension]),
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
  

  private async getSettingsSnippets(snippetVariables: SnippetVariables) {
		try {
			return await parseSnippets(this.settings.snippets, snippetVariables);
		} catch (e) {
			new Notice(`Failed to load snippets from settings: ${e}`);
			return [];
		}
	}


  private loadIcons() {
    for (const [iconId, svgContent] of Object.entries(ICONS)) {
      addIcon(iconId, svgContent);
    }
  }

  private async loadSettings() {
    let data = await this.loadData();

    // Migrate settings from v1.8.0 - v1.8.4
    const shouldMigrateSettings = data ? "basicSettings" in data : false;

    // @ts-ignore
    function migrateSettings(oldSettings) {
      return {
        ...oldSettings.basicSettings,
        ...oldSettings.rawSettings,
        snippets: oldSettings.snippets,
      };
    }

    if (shouldMigrateSettings) {
      data = migrateSettings(data);
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);


    if (this.settings.loadSnippetsFromFile || this.settings.loadSnippetVariablesFromFile) {
      const tempSnippetVariables = await this.getSettingsSnippetVariables();
      const tempSnippets = await this.getSettingsSnippets(tempSnippetVariables);

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
  
  private async getSettingsSnippetVariables() {
		try {
			return await parseSnippetVariables(this.settings.snippetVariables);
		} catch (e) {
			new Notice(`Failed to load snippet variables from settings: ${e}`);
			console.log(`Failed to load snippet variables from settings: ${e}`);
			return {};
		}
	}
  private async getSnippets(becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean) {
		// Get files in snippet/variable folders.
		// If either is set to be loaded from settings the set will just be empty.
		const files = getFileSets(this);

		const snippetVariables =
			this.settings.loadSnippetVariablesFromFile
				? await getVariablesFromFiles(this, files)
				: await this.getSettingsSnippetVariables();

		// This must be done in either case, because it also updates the set of snippet files
		const unknownFileVariables = await tryGetVariablesFromUnknownFiles(this, files);
		if (this.settings.loadSnippetVariablesFromFile) {
			// But we only use the values if the user wants them
			Object.assign(snippetVariables, unknownFileVariables);
		}

		const snippets =
			this.settings.loadSnippetsFromFile
				? await getSnippetsFromFiles(this, files, snippetVariables)
				: await this.getSettingsSnippets(snippetVariables);
		this.showSnippetsLoadedNotice(snippets.length, Object.keys(snippetVariables).length,  becauseFileLocationUpdated, becauseFileUpdated);

		return snippets;
	}
  
  private showSnippetsLoadedNotice(nSnippets: number, nSnippetVariables: number, becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean) {
		if (!(becauseFileLocationUpdated || becauseFileUpdated))
			return;

		const prefix = becauseFileLocationUpdated ? "Loaded " : "Successfully reloaded ";
		const body = [];

		if (this.settings.loadSnippetsFromFile)
			body.push(`${nSnippets} snippets`);
		if (this.settings.loadSnippetVariablesFromFile)
			body.push(`${nSnippetVariables} snippet variables`);

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
