//git fetch origin
//git reset --hard #Undo all changes
//git fetch --all #Don't use unless necessity. It will overwrite all local changes
//git branch #Check current branch
//git remote set-url origin https://github.com/kalmanmoshe/Doing-it-myself.git #Change remote url
//git pull --all#Pull all branches
//git push --all#Push all branches

import {Plugin,addIcon ,Notice,loadMathJax, htmlToMarkdown, FileSystemAdapter, ViewState, MarkdownView,} from "obsidian";


import {MosheMathPluginSettings, DEFAULT_SETTINGS, processMosheMathSettings} from "./settings/settings";
import { MosheMathSettingTab } from "./settings/settings_tab";


import { getEditorCommands } from "./obsidian/editor_commands";
import { SwiftlatexRender, waitFor } from "./latexRender/main";
import { processMathBlock } from "./mathParser/iNeedToFindABetorPlace";
import { readAndParseSVG } from "./latexRender/svg2latex/temp";
import { MathJaxAbstractSyntaxTree } from "./latexRender/parse/mathJaxAbstractSyntaxTree";
import { getFileSets, getPreambleFromFiles, onFileChange, onFileCreate, onFileDelete } from "./obsidian/file_watch";
import { temp } from "./LaTeX_js/latex";

/**
 * Assignments:
 * - Create code that will auto-insert metadata into files. You can use this:
 *   const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
 *   if (file instanceof TFile) {
 *     const metadata = this.plugin.app.metadataCache.getFileCache(file);
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
interface MosheMathTypingApi {
  context: any;
  fileSuggest: any;
  addToggleSetting: any;
  onSettingChange: any;
  addButtonSetting: any;
  addDropdownSetting:any;
  addTextSetting:any;
}

export let staticMosheMathTypingApi: null|MosheMathTypingApi= null;
export let staticMoshe: null|Moshe= null;

export default class Moshe extends Plugin {
  settings: MosheMathPluginSettings;
  swiftlatexRender: SwiftlatexRender=new SwiftlatexRender();

  async onload() {

    console.log("Loading Moshe math plugin")
    await this.loadSettings();
		
    this.addEditorCommands();
    this.updateApiHooks();
    this.addSyntaxHighlighting();
    this.app.workspace.onLayoutReady(async () => await this.loadLayoutReadyDependencies());
    this.addSettingTab(new MosheMathSettingTab(this.app, this));
    temp()
  }
  async onunload() {
    this.removeSyntaxHighlighting();
    this.swiftlatexRender.onunload();
  }

  private async loadLayoutReadyDependencies() {
    this.loadMathJax();
    // we need to use await here because the codeBlock processor
    // needs to be loaded before the codeBlocks are processed
    await this.loadSwiftLatexRender()
    // processing of the code blocks have layout dependencies
    this.setCodeblocks();
    this.watchFiles()
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
  async loadMathJax(): Promise<void> {
    const preamble = this.settings.mathjaxPreamblePreambleEnabled ?
      await this.getMathjaxPreamble() :
      "";
    
    //this isnt really needed all it dose is make it of type any so thar are no errors
    const MJ: any = MathJax;
    if (typeof MJ.tex2chtml !== "undefined") {
      if (!MJ._originalTex2chtml) {
        MJ._originalTex2chtml = MJ.tex2chtml;
      }
  
      MJ.tex2chtml = (input: string, options: { display: boolean }): any => {
        const processedInput = this.processMathJax(input);
        return MJ._originalTex2chtml.call(MJ, processedInput, options);
      };
      //by redoing the preamble, mathjax will add it to its catch and than be 
      MJ.tex2chtml(preamble, { display: false });
    } else {
      MJ.startup.ready = () => {
        MJ.startup.defaultReady();
        MJ.tex2chtml(preamble, { display: false });
      };
    }
    this.refreshAllWindows();
  }

  private refreshAllWindows() {
   this.app.workspace.iterateAllLeaves((leaf) => {
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
  
  private async getMathjaxPreamble(): Promise<string> {
    const mathjaxPreambleFiles = getFileSets(this).mathjaxPreambleFiles;
    const preambles = await getPreambleFromFiles(this, mathjaxPreambleFiles);
    return preambles.map((preamble) => preamble.content).join("\n");
  }

  private processMathJax(input: string): string {
    if(!/[א-ת]/.test(input))return input;
    const ast = new MathJaxAbstractSyntaxTree();
    ast.parse(input);
    ast.reverseRtl();
    return ast.toString();
  }
  
  private async loadSettings() {
    let data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    await this.saveData(this.settings);
    this.swiftlatexRender.virtualFileSystem.setEnabled(this.settings.pdfTexEnginevirtualFileSystemFilesEnabled);
    if (this.settings.pdfTexEnginevirtualFileSystemFilesEnabled) {
      this.app.workspace.onLayoutReady(async () => {
          await this.processLatexPreambles();
          this.updateCoorVirtualFiles();
      });
    }
  }

  async saveSettings(didFileLocationChange = false) {
    await this.loadData();
		await this.saveData(this.settings);
    if(didFileLocationChange){
      await this.swiftlatexRender.virtualFileSystem.setEnabled(this.settings.pdfTexEnginevirtualFileSystemFilesEnabled);
      if(this.settings.pdfTexEnginevirtualFileSystemFilesEnabled){
        await this.processLatexPreambles(didFileLocationChange);
        this.updateCoorVirtualFiles();
      }
    }
	}
  async processLatexPreambles(becauseFileLocationUpdated = false, becauseFileUpdated = false) {
    const preambles = await this.getlatexPreambleFiles(becauseFileLocationUpdated, becauseFileUpdated)
    this.swiftlatexRender.virtualFileSystem.setVirtualFileSystemFiles(preambles.latexVirtualFiles);
    this.updateCoorVirtualFiles();
  }
  updateCoorVirtualFiles(){
    const coorFileSet=new Set<string>
    this.settings.autoloadedVirtualFileSystemFiles.forEach(file => coorFileSet.add(file));
    this.swiftlatexRender.virtualFileSystem.setCoorVirtualFiles(coorFileSet);
  }
  
  async getlatexPreambleFiles(becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean){
    const files = getFileSets(this);
    const latexVirtualFiles = await getPreambleFromFiles(this,files.latexVirtualFiles);
    this.showPreambleLoadedNotice(latexVirtualFiles.length,  becauseFileLocationUpdated, becauseFileUpdated);
    return {latexVirtualFiles};
  }

  showPreambleLoadedNotice(nExplicitPreambleFiles: number,becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean){
    if (!(becauseFileLocationUpdated || becauseFileUpdated))return;
    const prefix = becauseFileLocationUpdated ? "Loaded " : "Successfully reloaded ";
    const body = [];
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