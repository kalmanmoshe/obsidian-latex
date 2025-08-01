//git fetch origin
//git reset --hard #Undo all changes
//git fetch --all #Don't use unless necessity. It will overwrite all local changes
//git branch #Check current branch
//git remote set-url origin https://github.com/kalmanmoshe/Doing-it-myself.git #Change remote url
//git pull --all#Pull all branches
//git push --all#Push all branches

import { Plugin, Notice, FileSystemAdapter, MarkdownView, App } from "obsidian";

import { MosheMathPluginSettings, DEFAULT_SETTINGS } from "./settings/settings";
import { MosheMathSettingTab } from "./settings/settings_tab";

import { getEditorCommands } from "./obsidian/editor_commands";
import { SwiftlatexRender } from "./latexRender/swiftlatexRender";
import { MathJaxAbstractSyntaxTree } from "./ast/mathJaxAbstractSyntaxTree";
import {
  getFileSets,
  getPreambleFromFiles,
  onFileChange,
  onFileCreate,
  onFileDelete,
} from "./obsidian/file_watch";
import { temp } from "./LaTeX_js/latex";
import { createTransactionLogger } from "./latexRender/cache/transactionLogger";
import { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import { CompileStatus } from "./latexRender/compiler/base/compilerBase/engine";

declare global {
  const app: App;
}
async function isInternetAvailable(): Promise<boolean> {
  try {
    const response = await fetch("https://www.google.com", { method: "HEAD", mode: "no-cors" });
    return true; // If it doesn't throw, assume internet is available
  } catch {
    return false;
  }
}

async function isWebsiteOnline(url: string): Promise<boolean> {
  const internet = await isInternetAvailable();
  if (!internet) {
    console.log("No internet connection.");
    return false;
  }
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    return false;
  }
}
async function checkWebStatis(url: string) {
  const online = await isWebsiteOnline(url)
  if (!online) console.error(`${url} is offline or unreachable.`);
  else {
    console.log(`${url} is online.`)
    new Notice(`Moshe Math Plugin: ${url} is online.`, 5000);
  };
}

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

export default class Moshe extends Plugin {
  settings: MosheMathPluginSettings;
  swiftlatexRender: SwiftlatexRender = new SwiftlatexRender();
  logger = createTransactionLogger();
  async onload() {
    const startTime = performance.now();
    console.log("Loading Moshe math plugin");
    checkWebStatis("https://texlive2.swiftlatex.com/");
    await this.loadSettings();

    this.addEditorCommands();
    this.addSyntaxHighlighting();
    app.workspace.onLayoutReady(
      async () => {
        const onStart = performance.now();
        await this.loadLayoutReadyDependencies()
        console.warn("Moshe Math Plugin layout ready in " + (performance.now() - onStart) + "ms");
      },
    );
    this.addSettingTab(new MosheMathSettingTab(this));
    temp();
    console.warn("Moshe Math Plugin loaded in " + (performance.now() - startTime) + "ms");
    //this.registerEditorSuggest()
  }
  async onunload() {
    this.removeSyntaxHighlighting();
    this.swiftlatexRender.onunload();
  }

  private async loadLayoutReadyDependencies() {
    this.loadMathJax();
    this.bindTransactionLogger();
    // we need to use await here because the codeBlock processor
    // needs to be loaded before the codeBlocks are processed
    await this.loadSwiftLatexRender();
    // processing of the code blocks have layout dependencies
    try {
      this.setCodeblocks();
    } catch (e) {
      console.error("Error setting code blocks:", e);
      new Notice(
        "Error setting code blocks. Please check the console for more details.",
      );
    }
    this.watchFiles();
  }
  private bindTransactionLogger() {
    const markdownView =
      app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) return;
    const editor = markdownView.editor;
    const cmView = (editor as any).cm as EditorView;

    cmView.dispatch({
      effects: StateEffect.appendConfig.of([this.logger.extension]),
    });
  }
  private setCodeblocks() {
    this.registerMarkdownCodeBlockProcessor("tikz",
      this.swiftlatexRender.codeBlockProcessor.bind(this.swiftlatexRender),
    );
    this.registerMarkdownCodeBlockProcessor("latex",
      this.swiftlatexRender.codeBlockProcessor.bind(this.swiftlatexRender),
    );
  }
  private async loadSwiftLatexRender() {
    await this.swiftlatexRender.onload(this);
  }

  private addSyntaxHighlighting() {
    if (!window.CodeMirror) return;

    // @ts-ignore
    const codeMirrorCodeBlocksSyntaxHighlighting = window.CodeMirror.modeInfo;
    if (
      !codeMirrorCodeBlocksSyntaxHighlighting.some(
        (el: any) => el.name === "latexsvg",
      )
    ) {
      codeMirrorCodeBlocksSyntaxHighlighting.push({
        name: "latexsvg",
        mime: "text/x-latex",
        mode: "stex",
      });
    }
    if (
      !codeMirrorCodeBlocksSyntaxHighlighting.some(
        (el: any) => el.name === "Tikz",
      )
    ) {
      codeMirrorCodeBlocksSyntaxHighlighting.push({
        name: "Tikz",
        mime: "text/x-latex",
        mode: "stex",
      });
    }
  }

  private removeSyntaxHighlighting() {
    //@ts-ignore
    window.CodeMirror.modeInfo = window.CodeMirror.modeInfo.filter((el) => el.name != "Tikz",);
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
    const preamble = this.settings.mathjaxPreambleEnabled
      ? await this.getMathjaxPreamble()
      : "";
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

  private async getMathjaxPreamble(): Promise<string> {
    const mathjaxPreambleFiles = getFileSets(this).mathjaxPreambleFiles;
    const preambles = await getPreambleFromFiles(this, mathjaxPreambleFiles);
    return preambles.map((preamble) => preamble.content).join("\n");
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
    this.saveSettings(true);
  }

  async saveSettings(didFileLocationChange = false) {
    await this.saveData(this.settings);
    if (didFileLocationChange) {
      await this.swiftlatexRender.vfs.setEnabled(this.settings.compilerVfsEnabled);
      if (this.settings.compilerVfsEnabled) {
        app.workspace.onLayoutReady(async () => {
          await this.processLatexPreambles(didFileLocationChange);
        })
      }
    }
  }
  async processLatexPreambles(becauseFileLocationUpdated = false, becauseFileUpdated = false) {
    const coorPreambles = await this.getlatexPreambleFiles(becauseFileLocationUpdated, becauseFileUpdated);
    this.swiftlatexRender.vfs.setVirtualFileSystemFiles(coorPreambles);
    const fileNames = new Set(coorPreambles.map((file) => file.name))
    this.swiftlatexRender.vfs.setCoorVirtualFiles(fileNames);
  }

  private async getlatexPreambleFiles(becauseFileLocationUpdated: boolean, becauseFileUpdated: boolean) {
    const files = getFileSets(this);
    const coorFiles = await getPreambleFromFiles(this, files.latexVirtualFiles);
    this.showPreambleLoadedNotice(coorFiles.length, becauseFileLocationUpdated, becauseFileUpdated);
    return coorFiles;
  }

  private showPreambleLoadedNotice(
    nExplicitPreambleFiles: number,
    becauseFileLocationUpdated: boolean,
    becauseFileUpdated: boolean,
  ) {
    if (!(becauseFileLocationUpdated || becauseFileUpdated)) return;
    const prefix = becauseFileLocationUpdated
      ? "Loaded "
      : "Successfully reloaded ";
    const body = [];
    body.push(`${nExplicitPreambleFiles} explicit preamble files`);
    const suffix = ".";
    new Notice(prefix + body.join(" and ") + suffix, 5000);
  }
  getVaultPath() {
    if (app.vault.adapter instanceof FileSystemAdapter) {
      return app.vault.adapter.getBasePath();
    } else {
      throw new Error("Moshe: Could not get vault path.");
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
        this.registerEvent(// @ts-expect-error
          app.vault.on(eventName, (file: TAbstractFile) =>
            callback(this, file),
          ),
        );
      }
    });
  }
}
