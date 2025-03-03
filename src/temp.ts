

import { Plugin, MarkdownView, MarkdownRenderer, App, Setting, Modal, Notice, Component, Editor, EditorPosition } from "obsidian";
import MathPlugin from "./main";
import { Axis, Coordinate, Formatting } from "./tikzjax/tikzjax";
import { FormatTikzjax } from "./tikzjax/interpret/tokenizeTikzjax";



export class VecInputModel extends Modal {
  plugin: MathPlugin;
  plusX: boolean = true;
  plusY: boolean = true;
  obj: number = 0;
  ang: number = 0;

  constructor(app: App, plugin: MathPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Vector Input from Enter Mass:" });

    // Create containers
    const inputContainer = contentEl.createDiv("vec-input-fields-container");
    const scriptContainer = contentEl.createDiv("script-container");

    // Render fields and initial graph
    this.renderFields(inputContainer, scriptContainer);
    setTimeout(() => {
      this.updateGraph(scriptContainer);
  }, 50);
  }

  renderFields(inputContainer: HTMLElement, scriptContainer: HTMLElement) {
    // Clear previous fields if any
    inputContainer.findAll(".field").forEach(el => el.remove());

    // Toggle for X-Axis Reverse
    new Setting(inputContainer)
      .addToggle(toggle =>
        toggle
          .setTooltip("Toggle X-Axis Reverse")
          .setValue(this.plusX)
          .onChange(value => {
            this.plusX = value;
            this.updateGraph(scriptContainer);
          })
      ).settingEl.addClass("field");

    // Toggle for Y-Axis Reverse
    new Setting(inputContainer)
      .addToggle(toggle =>
        toggle
          .setTooltip("Toggle Y-Axis Reverse")
          .setValue(this.plusY)
          .onChange(value => {
            this.plusY = value;
            this.updateGraph(scriptContainer);
          })
      ).settingEl.addClass("field");

    // Text input for mass
    new Setting(inputContainer)
      .setName("Enter Mass")
      .setDesc("Enter the mass you want to evaluate")
      .addText(text => {
        text.onChange(async (value: string) => {
          const massValue = Number(value);
          if (!isNaN(massValue)) {
            this.obj = massValue;
            this.updateGraph(scriptContainer);
          }
        });
      }).settingEl.addClass("field");
  }

  updateGraph(container: HTMLElement) {
    container.empty();

    requestAnimationFrame(() => {
        try {
          /*
            const mass = new Coordinate({
                mode: "node",
                label: `${this.obj}n`,
                axis: new Axis(this.plusX ? 1 : -1, this.plusY ? 1 : -1),
                //formatting: new Formatting("node", { tikzset: "mass" })
            });

            const tikz = new FormatTikzjax([mass]);

            const script = container.createEl("script");
            script.setAttribute("type", "text/tikz");
            script.setAttribute("data-show-console", "true");
            script.setText(tikz.getCode());
            console.log(script)
            container.appendChild(script);*/
        } catch (e) {
            console.error("Graph rendering error:", e);
        }
    });
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
    //this.userSidesInput=createTextInputSetting(container,"Coordinates","Enter ${shape.coordinates}","","","dynamic-field")||""
    //this.userSidesInput=createTextInputSetting(container,"Coordinates","Enter ${shape.coordinates}","","","dynamic-field")||""
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
