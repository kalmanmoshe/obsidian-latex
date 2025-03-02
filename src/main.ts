//git fetch origin
//git reset --hard #Undo all changes
//git fetch --all #Don't use unless necessity. It will overwrite all local changes
//git branch #Check current branch
//git remote set-url origin https://github.com/kalmanmoshe/Doing-it-myself.git #Change remote url
//git pull --all#Pull all branches
//git push --all#Push all branches

import {Plugin,addIcon ,Notice,loadMathJax,} from "obsidian";


import {MosheMathPluginSettings, DEFAULT_SETTINGS, processMosheMathSettings} from "./settings/settings";
import { MosheMathSettingTab } from "./settings/settings_tab";


import { getEditorCommands } from "./obsidian/editor_commands";
import { SwiftlatexRender } from "./latexRender/main";
import { processMathBlock } from "./mathParser/iNeedToFindABetorPlace";
import { readAndParseSVG } from "./latexRender/svg2latex/temp";
import { MathJaxAbstractSyntaxTree } from "./latexRender/parse/mathJaxAbstractSyntaxTree";

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
interface MosheMathTypingApi {
  context: any;
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
    await this.loadPreamble();
		this.addSettingTab(new MosheMathSettingTab(this.app, this));
    this.addEditorCommands();
    this.app.workspace.onLayoutReady(() => {
      //if(1===2*3)
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
      const observerId = observeSet(plugins.enabledPlugins, (added, removed,) => {
        if (added.length && plugins.enabledPlugins.has("moshe-math-typing")) {
          staticMosheMathTypingApi = plugins.plugins["moshe-math-typing"].getAPI();
          clearInterval(observerId);
        }
      });
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

  private addEditorCommands() {
    const editorCommands=getEditorCommands(this).filter((command)=>command!==undefined);
		for (const command of editorCommands) {
			this.addCommand(command);
		}
	}
  private async loadPreamble(): Promise<void> {
    let preamble: string = "";
    try {
      preamble = await this.app.vault.adapter.read(this.settings.preambleFileLocation);
    } catch (e) {
      console.warn(`Failed to read preamble file: ${e}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MJ: any = MathJax;
  
    const myCustomPreprocessor = (input: string): string => {
      const ast= new MathJaxAbstractSyntaxTree();
      ast.prase(input);
      ast.reverseRtl();
      return ast.toString();
    };
  
    // If MathJax.tex2chtml is already defined, override it to include the preprocessor.
    if (MJ.tex2chtml !== undefined) {
      // Save the original function if not already saved
      if (!MJ._originalTex2chtml) {
        MJ._originalTex2chtml = MJ.tex2chtml;
      }
      // Override tex2chtml so it runs the preprocessor first.
      MJ.tex2chtml = (input: string, display: boolean) => {
        const processedInput = myCustomPreprocessor(input);
        return MJ._originalTex2chtml.call(MJ, processedInput, display);
      };
  
      // Process the preamble through the new tex2chtml
      MJ.tex2chtml(preamble);
    } else {
      // If tex2chtml isn't defined yet, hook into startup.ready.
      MJ.startup.ready = () => {
        MJ.startup.defaultReady();
        const processedPreamble = myCustomPreprocessor(preamble);
        MJ.tex2chtml(processedPreamble);
      };
    }
  }
  
  private async loadSettings() {
    let data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(didFileLocationChange = false) {
		await this.saveData(this.settings);
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