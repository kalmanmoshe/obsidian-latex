import { Plugin, MarkdownView, MarkdownRenderer, PluginSettingTab, App, Setting, Modal, Notice, Component, Editor, EditorPosition } from "obsidian";
import { MathInfo } from "./mathEngine.js";
  
export class InfoModal extends Modal {
    mathInfo: string[];
    solutionInfo: string[];
  
    constructor(app: App, mathInfo: MathInfo) {
      super(app);
      this.mathInfo = mathInfo.mathInfo;
      this.solutionInfo = mathInfo.solutionInfo;
    }
  
    onOpen() {
      const { contentEl } = this;
      contentEl.addClass("info-modal-style");
      contentEl.createEl("h2", { text: "Result Details", cls: "info-modal-title" });
  
      // Add content and button for copying details
      this.populateContent(contentEl);
    }
    
    private populateContent(contentEl: HTMLElement): void {
      
      const columnContainer = contentEl.createEl("div", { cls: "info-modal-main-container" });
      
      this.mathInfo.forEach((line, index) => {
        const lineContainer = columnContainer.createEl("div", { cls: "info-modal-line-container" });
        
        const leftLine = lineContainer.createEl("div", { cls: "info-modal-left-line" });
        MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${line}\\end{aligned}}$`, leftLine, "", new Component());
  
        const rightLine = lineContainer.createEl("div", { cls: "info-modal-right-line" });
        MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${this.solutionInfo[index] || ""}\\end{aligned}}$`, rightLine, "", new Component());
      });
  
      const buttonContainer = contentEl.createEl("div", { cls: "info-modal-Copy-button-container" });
      const actionButton = buttonContainer.createEl("button", { text: "Copy Details", cls: "info-modal-Copy-button" });
      
      actionButton.addEventListener("click", () => {
        navigator.clipboard.writeText(this.mathInfo.join("\n"));
        new Notice("Details copied to clipboard!");
      });
    }
  
    onClose() {
      this.contentEl.empty();
    }
}


export class DebugModal extends Modal {
    debugInfo: string;
  
    constructor(app: App, debugInfo: string) {
      super(app);
      this.debugInfo = debugInfo;
    }
  
    onOpen() {
      const { contentEl } = this;
      contentEl.addClass("custom-modal-style");
      contentEl.createEl("h2", { text: "Debug Information", cls: "debug-Modal-title" });
  
      const debugContent = contentEl.createEl("div", { cls: "debug-info-container" });
      MarkdownRenderer.renderMarkdown(`\`\`\`js\n${this.debugInfo}\n\`\`\``, debugContent, "", new Component());
    }
  
    onClose() {
      this.contentEl.empty();
    }
  }