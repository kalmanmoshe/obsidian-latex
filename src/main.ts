//git fetch origin
//git reset --hard #Undo all changes
//git fetch --all #Don't use unless necessity. It will overwrite all local changes
//git branch #Check current branch
//git remote set-url origin https://github.com/kalmanmoshe/Doing-it-myself.git #Change remote url
//git pull --all#Pull all branches
//git push --all#Push all branches

import {Plugin,addIcon ,Notice,loadMathJax, htmlToMarkdown, FileSystemAdapter,} from "obsidian";


import {MosheMathPluginSettings, DEFAULT_SETTINGS, processMosheMathSettings} from "./settings/settings";
import { MosheMathSettingTab } from "./settings/settings_tab";


import { getEditorCommands } from "./obsidian/editor_commands";
import { SwiftlatexRender, waitFor } from "./latexRender/main";
import { processMathBlock } from "./mathParser/iNeedToFindABetorPlace";
import { readAndParseSVG } from "./latexRender/svg2latex/temp";
import { MathJaxAbstractSyntaxTree } from "./latexRender/parse/mathJaxAbstractSyntaxTree";
import { getFileSets, getPreambleFromFiles } from "./file_watch";

/**
 * Assignments:
 * - Create code that will auto-insert metadata into files. You can use this:
 *   const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
 *   if (file instanceof TFile) {
 *     const metadata = this.plugin.app.metadataCache.getFileCache(file);
 *     console.log(metadata);
 *   }
 * - Create a parser that makes LaTeX error messages more sensible.
 * - Create qna for better Searching finding and styling
 */

/**
 * - `\include{}` → Creates `.aux` files and includes the content, which **does** affect compile time.
- `\input{}` → Directly injects the content **without** creating separate `.aux` files, still affecting compile time.
- External files via `\externaldocument{}` (for `xr` or `xr-hyper`) → Adds lookup time for cross-references.
 */
/**
 * With Corpriambola whatever is loaded is loaded if explicit. I have to make sure that.only the files is specified are loaded To the engine.
 */
interface MosheMathTypingApi {
  context: any;
  fileSuggest: any;
  addToggleSetting: any;
}

export let staticMosheMathTypingApi: null|MosheMathTypingApi= null;
export let staticMoshe: null|Moshe= null;

export default class Moshe extends Plugin {
  settings: MosheMathPluginSettings;
  swiftlatexRender: SwiftlatexRender

  async onload() {
    console.log("Loading Moshe math plugin")
    //readAndParseSVG().then((res: any)=>console.log(res))
    await this.loadSettings();
    await this.loadMathJax();
		this.addSettingTab(new MosheMathSettingTab(this.app, this));
    this.addEditorCommands();
    this.app.workspace.onLayoutReady(() => {
      
      this.loadSwiftLatexRender().then(() => {
        this.addSyntaxHighlighting();
        this.setCodeblocks();
      })
      this.updateApiHooks();
    });
  }


  private updateApiHooks(){
    try{
      //@ts-ignore
      const plugins = this.app.plugins
      if(plugins.enabledPlugins.has("moshe-math-typing")){
        staticMosheMathTypingApi = plugins.plugins["moshe-math-typing"].getAPI();
      }
      else{
        const observerId = observeSet(plugins.enabledPlugins, (added, removed,) => {
          if (added.length && plugins.enabledPlugins.has("moshe-math-typing")) {
            staticMosheMathTypingApi = plugins.plugins["moshe-math-typing"].getAPI();
            console.log("updateApiHooks staticMosheMathTypingApi",staticMosheMathTypingApi)
            clearInterval(observerId);
          }
        });
      }
    }catch(e){
      console.error(e);
      new Notice("Could not find moshe-math-typing plugin. Please install and/or activate it");
    }
      staticMoshe=this;
  }
  

  private setCodeblocks(){
    this.registerMarkdownCodeBlockProcessor("math", processMathBlock.bind(this));
    this.registerMarkdownCodeBlockProcessor("tikz", this.swiftlatexRender.universalCodeBlockProcessor.bind(this.swiftlatexRender));
		this.registerMarkdownCodeBlockProcessor("latex", this.swiftlatexRender.universalCodeBlockProcessor.bind(this.swiftlatexRender));
  }
  private async loadSwiftLatexRender(){
    this.swiftlatexRender=new SwiftlatexRender()
    await this.swiftlatexRender.onload(this);
  }

  private addSyntaxHighlighting() {
    if (!window.CodeMirror) return; 

    // @ts-ignore
    const codeMirrorCodeBlocksSyntaxHighlighting = window.CodeMirror.modeInfo;
    if (!codeMirrorCodeBlocksSyntaxHighlighting.some((el: any) => el.name === "latexsvg")) {
        codeMirrorCodeBlocksSyntaxHighlighting.push({ name: "latexsvg", mime: "text/x-latex", mode: "stex" });
    }
    if (!codeMirrorCodeBlocksSyntaxHighlighting.some((el: any) => el.name === "Tikz")) {
        codeMirrorCodeBlocksSyntaxHighlighting.push({ name: "Tikz", mime: "text/x-latex", mode: "stex" });
    }
}


  private removeSyntaxHighlighting(){
    //@ts-ignore
    window.CodeMirror.modeInfo = window.CodeMirror.modeInfo.filter(el => el.name != "Tikz");
  }

  private addEditorCommands() {
    const editorCommands=getEditorCommands(this).filter((command)=>command!==undefined);
		for (const command of editorCommands) {
			this.addCommand(command);
		}
	}
  private async loadMathJax(): Promise<void> {
    const MJ: any = MathJax;
    // Get the preamble content if enabled; otherwise use an empty string.
    const preamble: string = this.settings.preambleEnabled 
      ? await this.getPreamble() 
      : "";
    if (typeof MJ.tex2chtml !== "undefined") {
      if (!MJ._originalTex2chtml) {
        MJ._originalTex2chtml = MJ.tex2chtml;
      }
  
      MJ.tex2chtml = (input: string, options: { display: boolean }): any => {
        const processedInput = this.processMathJax(input);
        return MJ._originalTex2chtml.call(MJ, processedInput, options);
      };
      MJ.tex2chtml(preamble, { display: false });
    } else {
      MJ.startup.ready = () => {
        MJ.startup.defaultReady();
        const processedPreamble = this.processMathJax(preamble);
        MJ.tex2chtml(processedPreamble, { display: false });
      };
    }
  }
  
  private async getPreamble(): Promise<string> {
    this.settings.mathjaxPreambleFileLocation = "obsidian/data/Files/preamble.sty"
    const mathjaxPreambleFiles = getFileSets(this).mathjaxPreambleFiles;

    const preambles = await getPreambleFromFiles(this, mathjaxPreambleFiles);
    return preambles.map((preamble) => preamble.content).join("\n");
  }

  
  private processMathJax(input: string): string {
    const ast = new MathJaxAbstractSyntaxTree();
    ast.parse(input);
    ast.reverseRtl();
    return ast.toString();
  }
  
  private async loadSettings() {
    let data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    await this.saveData(this.settings);
    // this.settings.corePreambleFileLocation = "obsidian/data/Files/coorPreamble.sty";

    if (this.settings.preambleEnabled) {
        this.app.workspace.onLayoutReady(async () => {
            await this.processLatexPreambles();
        });
    }
``}

  async saveSettings(didFileLocationChange = false) {
    await this.loadData();
		await this.saveData(this.settings);
    if(didFileLocationChange)
      this.processLatexPreambles(didFileLocationChange);
	}

  async processLatexPreambles(becauseFileLocationUpdated = false, becauseFileUpdated = false) {

    const preambles = await this.getPreambleFiles(becauseFileLocationUpdated, becauseFileUpdated)
    // Wait for the swiftlatexRender to be ready before setting the preambles.
    await waitFor(() => typeof this.swiftlatexRender !== "undefined" && this.swiftlatexRender.pdfEngine.isReady());
    this.swiftlatexRender.setCoorPreambles(preambles.corePreambleFiles);
    //this.swiftlatexRender.setExplicitPreamble(preambles.explicitPreamble);
  }
  
  async getPreambleFiles(becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean){
    const files = getFileSets(this);
    const corePreambleFiles = await getPreambleFromFiles(this,files.corePreambleFiles);
    const explicitPreambleFiles = await getPreambleFromFiles(this,files.explicitPreambleFiles);
    this.showPreambleLoadedNotice(corePreambleFiles.length, explicitPreambleFiles.length,  becauseFileLocationUpdated, becauseFileUpdated);
    return {corePreambleFiles, explicitPreambleFiles};
  }

  showPreambleLoadedNotice(nCoorPreambleFiles: number,nExplicitPreambleFiles: number,becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean){
    if (!(becauseFileLocationUpdated || becauseFileUpdated))return;
    const prefix = becauseFileLocationUpdated ? "Loaded " : "Successfully reloaded ";
    const body = [];
    body.push(`${nCoorPreambleFiles} coor preamble fils`);
    body.push(`${nExplicitPreambleFiles} explicit preamble files`);
		const suffix = ".";
		new Notice(prefix + body.join(" and ") + suffix, 5000);
  }
  getVaultPath() {
      if (this.app.vault.adapter instanceof FileSystemAdapter) {
        return this.app.vault.adapter.getBasePath();
      } else {
        throw new Error("Moshe: Could not get vault path.");
      }
    }
}


/**
 * Observes a set for changes by polling at a specified interval.
 * @param observedSet The set to observe.
 * @param callback Called with arrays of added and removed items when a change is detected.
 * @param interval Polling interval in milliseconds (default is 100ms).
 * @returns The interval ID so you can clear it later if needed.
 */
function observeSet<T>(
  observedSet: Set<T>,
  callback: (added: T[], removed: T[]) => void,
  interval: number = 1000
): NodeJS.Timer {
  let previousSnapshot = new Set(observedSet);
  return setInterval(() => {
    const added: T[] = [];
    const removed: T[] = [];

    // Check for new items (added)
    observedSet.forEach(item => {
      if (!previousSnapshot.has(item)) {
        added.push(item);
      }
    });

    // Check for missing items (removed)
    previousSnapshot.forEach(item => {
      if (!observedSet.has(item)) {
        removed.push(item);
      }
    });

    if (added.length || removed.length) {
      // Report the changes
      callback(added, removed);
      // Update the snapshot
      previousSnapshot = new Set(observedSet);
    }
  }, interval);
}