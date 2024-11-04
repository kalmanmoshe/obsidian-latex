import { Plugin, MarkdownView, MarkdownRenderer, App, Setting, Modal, Notice, Component, Editor, EditorPosition } from "obsidian";
import MathPlugin from "./main";
import { createTextInputSetting } from "./settings";



export class vecInpotModel extends Modal{
    plugin: MathPlugin;
    vectors=[];

    constructor(app: App,plugin: MathPlugin){
        super(app)
        this.plugin=plugin;
    }
    onOpen(): void {
        const inpotContainer=this.containerEl.createDiv("vec-inpot-fields-container");
        const graphContainer=this.containerEl.createDiv("vec-inpot-graph-conter");

        this.crateGrafh(graphContainer);
    }
    addFields(){
      //this.vectors.push()
    }


    crateGrafh(graphContainer: HTMLElement){
  }
}


export class InputModal extends Modal {
  plugin: MathPlugin;
  userChoice = 0;
  userSidesInput = "";
  userAnglesInput = "";
  resultContainer: HTMLElement;
  shapesCharacteristics: any;
  evaledUserInputInfo: any = null;
  savedValues: any = {};

  constructor(app: App, plugin: MathPlugin) {
    super(app);
    this.plugin = plugin;
    
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Enter Math Expression" });

    const dynamicFieldContainer = contentEl.createDiv({ cls: "dynamic-field-container" });
    const tikzGraphContainer = contentEl.createDiv({ cls: "tikz-graph-container" });
    const submitButton = contentEl.createEl("button", { text: "Submit", attr: { disabled: "true" } });
    const temporaryDebugArea = contentEl.createDiv({ cls: "temporary-debug-area" });

    submitButton.addEventListener("click", () => {
      if (this.evaledUserInputInfo && this.evaledUserInputInfo.meetsMinRequirements) {
        this.handleSubmit();
      } else {
        new Notice("Please enter valid input.");
      }
    });

    this.userChoice = 0;
    this.renderDynamicFields(dynamicFieldContainer);
        
    dynamicFieldContainer.addEventListener("input", () => {
      if (this.evaledUserInputInfo.meetsMinRequirements) {
        submitButton.removeAttribute("disabled");
        tikzGraphContainer.empty();
        
        temporaryDebugArea.empty();
      } else {
        submitButton.setAttribute("disabled", "true");
      }
    });
    
  }
  renderDynamicFields(container: HTMLElement) {
    container.findAll(".dynamic-field").forEach(el => el.remove());
    this.userSidesInput=createTextInputSetting(container,"Coordinates","Enter ${shape.coordinates}","","","dynamic-field")||""
    this.userSidesInput=createTextInputSetting(container,"Coordinates","Enter ${shape.coordinates}","","","dynamic-field")||""
    new Setting(container)
      .addButton(button =>
        button
          .setButtonText("add vec")
          .setTooltip("add a vecter")
          .onClick(() => {
            this.renderDynamicFields(container);
          })
      )
      .settingEl.addClass("dynamic-field");

    new Setting(container)
      .addButton(button =>
        button
          .setButtonText("Clear")
          .setTooltip("Clear all previous fields")
          .onClick(() => {
            this.renderDynamicFields(container);
          })
      )
      .settingEl.addClass("dynamic-field");
  }

  private handleSubmit() {
      const result = this.evaledUserInputInfo;
      this.resultContainer.textContent = JSON.stringify(result);

      this.plugin.settings.sessionHistory.push({
        input: this.userAnglesInput,
        result: result
      });
      this.plugin.saveSettings();
    
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

















































export class CustomInputModal extends Modal {
    plugin: MathPlugin;
    userChoice = 0;
    userSidesInput = "";
    userAnglesInput = "";
    resultContainer: HTMLElement;
    shapesCharacteristics: any;
    evaledUserInputInfo: any = null;
    savedValues: any = {};
  
    constructor(app: App, plugin: MathPlugin) {
      super(app);
      this.plugin = plugin;
    }
  
    onOpen() {
      const { contentEl } = this;
      contentEl.createEl("h2", { text: "Enter Math Expression" });
  
      // Assign shapesCharacteristics globally
  
      const settingsContainer = contentEl.createDiv({ cls: "settings-container" });
      const dynamicFieldContainer = contentEl.createDiv({ cls: "dynamic-field-container" });
      const tikzGraphContainer = contentEl.createDiv({ cls: "dynamic-field-container" });
      const submitButton = contentEl.createEl("button", { text: "Submit", attr: { disabled: "true" } });
      const temporaryDebugArea = contentEl.createDiv({ cls: "temporary-debug-area" });
      submitButton.addEventListener("click", () => {
        if (this.evaledUserInputInfo && this.evaledUserInputInfo.meetsMinRequirements) {
          this.handleSubmit();
        } else {
          new Notice("Please enter valid input.");
        }
      });
  
      new Setting(settingsContainer)
        .setName("Choose shape")
        .setDesc("Select the shape to perform the operations on.")
        .addDropdown(dropdown => {
          this.shapesCharacteristics.forEach((shape: any, index: number) => {
            dropdown.addOption(index.toString(), shape.name);
          });
          this.userChoice = 0;
          this.renderDynamicFields(dynamicFieldContainer);
          
          dropdown.onChange(value => {
            this.userChoice = Number(value);
            this.renderDynamicFields(dynamicFieldContainer);
          });
        });
      
      contentEl.addEventListener("input", () => {
        this.evaledUserInputInfo = this.testMinInputRequirements();
        if (this.evaledUserInputInfo.meetsMinRequirements) {
          submitButton.removeAttribute("disabled");
          tikzGraphContainer.empty();
          
          temporaryDebugArea.empty();
        } else {
          submitButton.setAttribute("disabled", "true");
        }
      });
      
    }
  
    renderDynamicFields(container: HTMLElement) {
      
    }
  
    private testMinInputRequirements() {
      return { meetsMinRequirements: true,shape: "shapeName", coordinates: [], sides: {}, angles: [] };
    }
  
    private handleSubmit() {
  
        const result = this.evaledUserInputInfo;
        this.resultContainer.textContent = JSON.stringify(result);
  
        this.plugin.settings.sessionHistory.push({
          input: this.userAnglesInput,
          result: result
        });
        this.plugin.saveSettings();
      
    }
    onClose() {
      const { contentEl } = this;
      contentEl.empty();
    }
}


export class HistoryModal extends Modal {
    plugin: MathPlugin;
  
    constructor(app: App, plugin: MathPlugin) {
      super(app);
      this.plugin = plugin;
    }
  
    onOpen() {
      const { contentEl } = this;
      contentEl.createEl("h2", { text: "Session History" });
  
      // If there is no history, display a message
      if (this.plugin.settings.sessionHistory.length === 0) {
        contentEl.createEl("p", { text: "No session history found." });
        return;
      }
  
      // Display each session in the history
      this.plugin.settings.sessionHistory.forEach((session, index) => {
        const sessionDiv = contentEl.createEl("div", { cls: "history-session" });
        sessionDiv.createEl("h3", { text: `Session ${index + 1}` });
        sessionDiv.createEl("p", { text: `Input: ${session.input}` });
        sessionDiv.createEl("p", { text: `Result: ${session.result}` });
      });
  
      // Close button
      const closeButton = contentEl.createEl("button", { text: "Close" });
      closeButton.addEventListener("click", () => {
        this.close();
      });
    }
  
    onClose() {
      const { contentEl } = this;
      contentEl.empty(); // Clean up modal content on close
    }
  }
