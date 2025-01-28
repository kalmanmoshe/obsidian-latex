import { __awaiter } from "tslib";
import { Setting, Modal, Notice } from "obsidian";
export class VecInputModel extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plusX = true;
        this.plusY = true;
        this.obj = 0;
        this.ang = 0;
        this.plugin = plugin;
    }
    onOpen() {
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
    renderFields(inputContainer, scriptContainer) {
        // Clear previous fields if any
        inputContainer.findAll(".field").forEach(el => el.remove());
        // Toggle for X-Axis Reverse
        new Setting(inputContainer)
            .addToggle(toggle => toggle
            .setTooltip("Toggle X-Axis Reverse")
            .setValue(this.plusX)
            .onChange(value => {
            this.plusX = value;
            this.updateGraph(scriptContainer);
        })).settingEl.addClass("field");
        // Toggle for Y-Axis Reverse
        new Setting(inputContainer)
            .addToggle(toggle => toggle
            .setTooltip("Toggle Y-Axis Reverse")
            .setValue(this.plusY)
            .onChange(value => {
            this.plusY = value;
            this.updateGraph(scriptContainer);
        })).settingEl.addClass("field");
        // Text input for mass
        new Setting(inputContainer)
            .setName("Enter Mass")
            .setDesc("Enter the mass you want to evaluate")
            .addText(text => {
            text.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                const massValue = Number(value);
                if (!isNaN(massValue)) {
                    this.obj = massValue;
                    this.updateGraph(scriptContainer);
                }
            }));
        }).settingEl.addClass("field");
    }
    updateGraph(container) {
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
            }
            catch (e) {
                console.error("Graph rendering error:", e);
            }
        });
    }
}
export class InputModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.userChoice = 0;
        this.userSidesInput = "";
        this.userAnglesInput = "";
        this.evaledUserInputInfo = null;
        this.savedValues = {};
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
            }
            else {
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
            }
            else {
                submitButton.setAttribute("disabled", "true");
            }
        });
    }
    renderDynamicFields(container) {
        container.findAll(".dynamic-field").forEach(el => el.remove());
        //this.userSidesInput=createTextInputSetting(container,"Coordinates","Enter ${shape.coordinates}","","","dynamic-field")||""
        //this.userSidesInput=createTextInputSetting(container,"Coordinates","Enter ${shape.coordinates}","","","dynamic-field")||""
        new Setting(container)
            .addButton(button => button
            .setButtonText("add vec")
            .setTooltip("add a vecter")
            .onClick(() => {
            this.renderDynamicFields(container);
        }))
            .settingEl.addClass("dynamic-field");
        new Setting(container)
            .addButton(button => button
            .setButtonText("Clear")
            .setTooltip("Clear all previous fields")
            .onClick(() => {
            this.renderDynamicFields(container);
        }))
            .settingEl.addClass("dynamic-field");
    }
    handleSubmit() {
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
    constructor(app, plugin) {
        super(app);
        this.userChoice = 0;
        this.userSidesInput = "";
        this.userAnglesInput = "";
        this.evaledUserInputInfo = null;
        this.savedValues = {};
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
            }
            else {
                new Notice("Please enter valid input.");
            }
        });
        new Setting(settingsContainer)
            .setName("Choose shape")
            .setDesc("Select the shape to perform the operations on.")
            .addDropdown(dropdown => {
            this.shapesCharacteristics.forEach((shape, index) => {
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
            }
            else {
                submitButton.setAttribute("disabled", "true");
            }
        });
    }
    renderDynamicFields(container) {
    }
    testMinInputRequirements() {
        return { meetsMinRequirements: true, shape: "shapeName", coordinates: [], sides: {}, angles: [] };
    }
    handleSubmit() {
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
    constructor(app, plugin) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy90ZW1wLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFFQSxPQUFPLEVBQStDLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFxQyxNQUFNLFVBQVUsQ0FBQztBQU9sSSxNQUFNLE9BQU8sYUFBYyxTQUFRLEtBQUs7SUFPdEMsWUFBWSxHQUFRLEVBQUUsTUFBa0I7UUFDdEMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBTmIsVUFBSyxHQUFZLElBQUksQ0FBQztRQUN0QixVQUFLLEdBQVksSUFBSSxDQUFDO1FBQ3RCLFFBQUcsR0FBVyxDQUFDLENBQUM7UUFDaEIsUUFBRyxHQUFXLENBQUMsQ0FBQztRQUlkLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxNQUFNO1FBQ0osTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSwrQkFBK0IsRUFBRSxDQUFDLENBQUM7UUFFcEUsb0JBQW9CO1FBQ3BCLE1BQU0sY0FBYyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUN6RSxNQUFNLGVBQWUsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFaEUsa0NBQWtDO1FBQ2xDLElBQUksQ0FBQyxZQUFZLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ25ELFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDZCxJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3RDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFRCxZQUFZLENBQUMsY0FBMkIsRUFBRSxlQUE0QjtRQUNwRSwrQkFBK0I7UUFDL0IsY0FBYyxDQUFDLE9BQU8sQ0FBQyxRQUFR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QVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM5RCxVQUFVLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxlQUFlO1FBQ2YsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNwRSxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUN6QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixTQUFTLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxrQ0FBa0M7SUFDdkQsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiXHJcblxyXG5pbXBvcnQgeyBQbHVnaW4sIE1hcmtkb3duVmlldywgTWFya2Rvd25SZW5kZXJlciwgQXBwLCBTZXR0aW5nLCBNb2RhbCwgTm90aWNlLCBDb21wb25lbnQsIEVkaXRvciwgRWRpdG9yUG9zaXRpb24gfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBBeGlzLCBDb29yZGluYXRlLCBGb3JtYXR0aW5nIH0gZnJvbSBcIi4vdGlrempheC90aWt6amF4XCI7XHJcbmltcG9ydCB7IEZvcm1hdFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L2ludGVycHJldC90b2tlbml6ZVRpa3pqYXhcIjtcclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFZlY0lucHV0TW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcGx1Z2luOiBNYXRoUGx1Z2luO1xyXG4gIHBsdXNYOiBib29sZWFuID0gdHJ1ZTtcclxuICBwbHVzWTogYm9vbGVhbiA9IHRydWU7XHJcbiAgb2JqOiBudW1iZXIgPSAwO1xyXG4gIGFuZzogbnVtYmVyID0gMDtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiVmVjdG9yIElucHV0IGZyb20gRW50ZXIgTWFzczpcIiB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgY29udGFpbmVyc1xyXG4gICAgY29uc3QgaW5wdXRDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KFwidmVjLWlucHV0LWZpZWxkcy1jb250YWluZXJcIik7XHJcbiAgICBjb25zdCBzY3JpcHRDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KFwic2NyaXB0LWNvbnRhaW5lclwiKTtcclxuXHJcbiAgICAvLyBSZW5kZXIgZmllbGRzIGFuZCBpbml0aWFsIGdyYXBoXHJcbiAgICB0aGlzLnJlbmRlckZpZWxkcyhpbnB1dENvbnRhaW5lciwgc2NyaXB0Q29udGFpbmVyKTtcclxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICB0aGlzLnVwZGF0ZUdyYXBoKHNjcmlwdENvbnRhaW5lcik7XHJcbiAgfSwgNTApO1xyXG4gIH1cclxuXHJcbiAgcmVuZGVyRmllbGRzKGlucHV0Q29udGFpbmVyOiBIVE1MRWxlbWVudCwgc2NyaXB0Q29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xyXG4gICAgLy8gQ2xlYXIgcHJldmlvdXMgZmllbGRzIGlmIGFueVxyXG4gICAgaW5wdXRDb250YWluZXIuZmluZEFsbChcIi5maWVsZFwiKS5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZSgpKTtcclxuXHJcbiAgICAvLyBUb2dnbGUgZm9yIFgtQXhpcyBSZXZlcnNlXHJcbiAgICBuZXcgU2V0dGluZyhpbnB1dENvbnRhaW5lcilcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRUb29sdGlwKFwiVG9nZ2xlIFgtQXhpcyBSZXZlcnNlXCIpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVzWClcclxuICAgICAgICAgIC5vbkNoYW5nZSh2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1c1ggPSB2YWx1ZTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVHcmFwaChzY3JpcHRDb250YWluZXIpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKS5zZXR0aW5nRWwuYWRkQ2xhc3MoXCJmaWVsZFwiKTtcclxuXHJcbiAgICAvLyBUb2dnbGUgZm9yIFktQXhpcyBSZXZlcnNlXHJcbiAgICBuZXcgU2V0dGluZyhpbnB1dENvbnRhaW5lcilcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgICAgICB0b2dnbGVcclxuICAgICAgICAgIC5zZXRUb29sdGlwKFwiVG9nZ2xlIFktQXhpcyBSZXZlcnNlXCIpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVzWSlcclxuICAgICAgICAgIC5vbkNoYW5nZSh2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1c1kgPSB2YWx1ZTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVHcmFwaChzY3JpcHRDb250YWluZXIpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKS5zZXR0aW5nRWwuYWRkQ2xhc3MoXCJmaWVsZFwiKTtcclxuXHJcbiAgICAvLyBUZXh0IGlucHV0IGZvciBtYXNzXHJcbiAgICBuZXcgU2V0dGluZyhpbnB1dENvbnRhaW5lcilcclxuICAgICAgLnNldE5hbWUoXCJFbnRlciBNYXNzXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiRW50ZXIgdGhlIG1hc3MgeW91IHdhbnQgdG8gZXZhbHVhdGVcIilcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgdGV4dC5vbkNoYW5nZShhc3luYyAodmFsdWU6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgY29uc3QgbWFzc1ZhbHVlID0gTnVtYmVyKHZhbHVlKTtcclxuICAgICAgICAgIGlmICghaXNOYU4obWFzc1ZhbHVlKSkge1xyXG4gICAgICAgICAgICB0aGlzLm9iaiA9IG1hc3NWYWx1ZTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVHcmFwaChzY3JpcHRDb250YWluZXIpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KS5zZXR0aW5nRWwuYWRkQ2xhc3MoXCJmaWVsZFwiKTtcclxuICB9XHJcblxyXG4gIHVwZGF0ZUdyYXBoKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcclxuICAgIGNvbnRhaW5lci5lbXB0eSgpO1xyXG5cclxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIC8qXHJcbiAgICAgICAgICAgIGNvbnN0IG1hc3MgPSBuZXcgQ29vcmRpbmF0ZSh7XHJcbiAgICAgICAgICAgICAgICBtb2RlOiBcIm5vZGVcIixcclxuICAgICAgICAgICAgICAgIGxhYmVsOiBgJHt0aGlzLm9ian1uYCxcclxuICAgICAgICAgICAgICAgIGF4aXM6IG5ldyBBeGlzKHRoaXMucGx1c1ggPyAxIDogLTEsIHRoaXMucGx1c1kgPyAxIDogLTEpLFxyXG4gICAgICAgICAgICAgICAgLy9mb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIiwgeyB0aWt6c2V0OiBcIm1hc3NcIiB9KVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRpa3ogPSBuZXcgRm9ybWF0VGlrempheChbbWFzc10pO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gY29udGFpbmVyLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcclxuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcclxuICAgICAgICAgICAgc2NyaXB0LnNldFRleHQodGlrei5nZXRDb2RlKCkpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhzY3JpcHQpXHJcbiAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChzY3JpcHQpOyovXHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiR3JhcGggcmVuZGVyaW5nIGVycm9yOlwiLCBlKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxufVxyXG5cclxuXHJcblxyXG59XHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgSW5wdXRNb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgdXNlckNob2ljZSA9IDA7XHJcbiAgdXNlclNpZGVzSW5wdXQgPSBcIlwiO1xyXG4gIHVzZXJBbmdsZXNJbnB1dCA9IFwiXCI7XHJcbiAgcmVzdWx0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcclxuICBzaGFwZXNDaGFyYWN0ZXJpc3RpY3M6IGFueTtcclxuICBldmFsZWRVc2VySW5wdXRJbmZvOiBhbnkgPSBudWxsO1xyXG4gIHNhdmVkVmFsdWVzOiBhbnkgPSB7fTtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgXHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJFbnRlciBNYXRoIEV4cHJlc3Npb25cIiB9KTtcclxuXHJcbiAgICBjb25zdCBkeW5hbWljRmllbGRDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImR5bmFtaWMtZmllbGQtY29udGFpbmVyXCIgfSk7XHJcbiAgICBjb25zdCB0aWt6R3JhcGhDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcInRpa3otZ3JhcGgtY29udGFpbmVyXCIgfSk7XHJcbiAgICBjb25zdCBzdWJtaXRCdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlN1Ym1pdFwiLCBhdHRyOiB7IGRpc2FibGVkOiBcInRydWVcIiB9IH0pO1xyXG4gICAgY29uc3QgdGVtcG9yYXJ5RGVidWdBcmVhID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJ0ZW1wb3JhcnktZGVidWctYXJlYVwiIH0pO1xyXG5cclxuICAgIHN1Ym1pdEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBpZiAodGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvICYmIHRoaXMuZXZhbGVkVXNlcklucHV0SW5mby5tZWV0c01pblJlcXVpcmVtZW50cykge1xyXG4gICAgICAgIHRoaXMuaGFuZGxlU3VibWl0KCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbmV3IE5vdGljZShcIlBsZWFzZSBlbnRlciB2YWxpZCBpbnB1dC5cIik7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMudXNlckNob2ljZSA9IDA7XHJcbiAgICB0aGlzLnJlbmRlckR5bmFtaWNGaWVsZHMoZHluYW1pY0ZpZWxkQ29udGFpbmVyKTtcclxuICAgICAgICBcclxuICAgIGR5bmFtaWNGaWVsZENvbnRhaW5lci5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4ge1xyXG4gICAgICBpZiAodGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvLm1lZXRzTWluUmVxdWlyZW1lbnRzKSB7XHJcbiAgICAgICAgc3VibWl0QnV0dG9uLnJlbW92ZUF0dHJpYnV0ZShcImRpc2FibGVkXCIpO1xyXG4gICAgICAgIHRpa3pHcmFwaENvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRlbXBvcmFyeURlYnVnQXJlYS5lbXB0eSgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHN1Ym1pdEJ1dHRvbi5zZXRBdHRyaWJ1dGUoXCJkaXNhYmxlZFwiLCBcInRydWVcIik7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgXHJcbiAgfVxyXG4gIHJlbmRlckR5bmFtaWNGaWVsZHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xyXG4gICAgY29udGFpbmVyLmZpbmRBbGwoXCIuZHluYW1pYy1maWVsZFwiKS5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZSgpKTtcclxuICAgIC8vdGhpcy51c2VyU2lkZXNJbnB1dD1jcmVhdGVUZXh0SW5wdXRTZXR0aW5nKGNvbnRhaW5lcixcIkNvb3JkaW5hdGVzXCIsXCJFbnRlciAke3NoYXBlLmNvb3JkaW5hdGVzfVwiLFwiXCIsXCJcIixcImR5bmFtaWMtZmllbGRcIil8fFwiXCJcclxuICAgIC8vdGhpcy51c2VyU2lkZXNJbnB1dD1jcmVhdGVUZXh0SW5wdXRTZXR0aW5nKGNvbnRhaW5lcixcIkNvb3JkaW5hdGVzXCIsXCJFbnRlciAke3NoYXBlLmNvb3JkaW5hdGVzfVwiLFwiXCIsXCJcIixcImR5bmFtaWMtZmllbGRcIil8fFwiXCJcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lcilcclxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cclxuICAgICAgICBidXR0b25cclxuICAgICAgICAgIC5zZXRCdXR0b25UZXh0KFwiYWRkIHZlY1wiKVxyXG4gICAgICAgICAgLnNldFRvb2x0aXAoXCJhZGQgYSB2ZWN0ZXJcIilcclxuICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJEeW5hbWljRmllbGRzKGNvbnRhaW5lcik7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApXHJcbiAgICAgIC5zZXR0aW5nRWwuYWRkQ2xhc3MoXCJkeW5hbWljLWZpZWxkXCIpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lcilcclxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cclxuICAgICAgICBidXR0b25cclxuICAgICAgICAgIC5zZXRCdXR0b25UZXh0KFwiQ2xlYXJcIilcclxuICAgICAgICAgIC5zZXRUb29sdGlwKFwiQ2xlYXIgYWxsIHByZXZpb3VzIGZpZWxkc1wiKVxyXG4gICAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlckR5bmFtaWNGaWVsZHMoY29udGFpbmVyKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgIClcclxuICAgICAgLnNldHRpbmdFbC5hZGRDbGFzcyhcImR5bmFtaWMtZmllbGRcIik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZVN1Ym1pdCgpIHtcclxuICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvO1xyXG4gICAgICB0aGlzLnJlc3VsdENvbnRhaW5lci50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdCk7XHJcblxyXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeS5wdXNoKHtcclxuICAgICAgICBpbnB1dDogdGhpcy51c2VyQW5nbGVzSW5wdXQsXHJcbiAgICAgICAgcmVzdWx0OiByZXN1bHRcclxuICAgICAgfSk7XHJcbiAgICAgIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgXHJcbiAgfVxyXG4gIG9uQ2xvc2UoKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEN1c3RvbUlucHV0TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgICB1c2VyQ2hvaWNlID0gMDtcclxuICAgIHVzZXJTaWRlc0lucHV0ID0gXCJcIjtcclxuICAgIHVzZXJBbmdsZXNJbnB1dCA9IFwiXCI7XHJcbiAgICByZXN1bHRDb250YWluZXI6IEhUTUxFbGVtZW50O1xyXG4gICAgc2hhcGVzQ2hhcmFjdGVyaXN0aWNzOiBhbnk7XHJcbiAgICBldmFsZWRVc2VySW5wdXRJbmZvOiBhbnkgPSBudWxsO1xyXG4gICAgc2F2ZWRWYWx1ZXM6IGFueSA9IHt9O1xyXG4gIFxyXG4gICAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgICBzdXBlcihhcHApO1xyXG4gICAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuICAgIH1cclxuICBcclxuICAgIG9uT3BlbigpIHtcclxuICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJFbnRlciBNYXRoIEV4cHJlc3Npb25cIiB9KTtcclxuICBcclxuICAgICAgLy8gQXNzaWduIHNoYXBlc0NoYXJhY3RlcmlzdGljcyBnbG9iYWxseVxyXG4gIFxyXG4gICAgICBjb25zdCBzZXR0aW5nc0NvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwic2V0dGluZ3MtY29udGFpbmVyXCIgfSk7XHJcbiAgICAgIGNvbnN0IGR5bmFtaWNGaWVsZENvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwiZHluYW1pYy1maWVsZC1jb250YWluZXJcIiB9KTtcclxuICAgICAgY29uc3QgdGlrekdyYXBoQ29udGFpbmVyID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJkeW5hbWljLWZpZWxkLWNvbnRhaW5lclwiIH0pO1xyXG4gICAgICBjb25zdCBzdWJtaXRCdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlN1Ym1pdFwiLCBhdHRyOiB7IGRpc2FibGVkOiBcInRydWVcIiB9IH0pO1xyXG4gICAgICBjb25zdCB0ZW1wb3JhcnlEZWJ1Z0FyZWEgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcInRlbXBvcmFyeS1kZWJ1Zy1hcmVhXCIgfSk7XHJcbiAgICAgIHN1Ym1pdEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICAgIGlmICh0aGlzLmV2YWxlZFVzZXJJbnB1dEluZm8gJiYgdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvLm1lZXRzTWluUmVxdWlyZW1lbnRzKSB7XHJcbiAgICAgICAgICB0aGlzLmhhbmRsZVN1Ym1pdCgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKFwiUGxlYXNlIGVudGVyIHZhbGlkIGlucHV0LlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gIFxyXG4gICAgICBuZXcgU2V0dGluZyhzZXR0aW5nc0NvbnRhaW5lcilcclxuICAgICAgICAuc2V0TmFtZShcIkNob29zZSBzaGFwZVwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiU2VsZWN0IHRoZSBzaGFwZSB0byBwZXJmb3JtIHRoZSBvcGVyYXRpb25zIG9uLlwiKVxyXG4gICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XHJcbiAgICAgICAgICB0aGlzLnNoYXBlc0NoYXJhY3RlcmlzdGljcy5mb3JFYWNoKChzaGFwZTogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihpbmRleC50b1N0cmluZygpLCBzaGFwZS5uYW1lKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgdGhpcy51c2VyQ2hvaWNlID0gMDtcclxuICAgICAgICAgIHRoaXMucmVuZGVyRHluYW1pY0ZpZWxkcyhkeW5hbWljRmllbGRDb250YWluZXIpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBkcm9wZG93bi5vbkNoYW5nZSh2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudXNlckNob2ljZSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyRHluYW1pY0ZpZWxkcyhkeW5hbWljRmllbGRDb250YWluZXIpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICBjb250ZW50RWwuYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcclxuICAgICAgICB0aGlzLmV2YWxlZFVzZXJJbnB1dEluZm8gPSB0aGlzLnRlc3RNaW5JbnB1dFJlcXVpcmVtZW50cygpO1xyXG4gICAgICAgIGlmICh0aGlzLmV2YWxlZFVzZXJJbnB1dEluZm8ubWVldHNNaW5SZXF1aXJlbWVudHMpIHtcclxuICAgICAgICAgIHN1Ym1pdEJ1dHRvbi5yZW1vdmVBdHRyaWJ1dGUoXCJkaXNhYmxlZFwiKTtcclxuICAgICAgICAgIHRpa3pHcmFwaENvbnRhaW5lci5lbXB0eSgpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICB0ZW1wb3JhcnlEZWJ1Z0FyZWEuZW1wdHkoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgc3VibWl0QnV0dG9uLnNldEF0dHJpYnV0ZShcImRpc2FibGVkXCIsIFwidHJ1ZVwiKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICBcclxuICAgIH1cclxuICBcclxuICAgIHJlbmRlckR5bmFtaWNGaWVsZHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xyXG4gICAgICBcclxuICAgIH1cclxuICBcclxuICAgIHByaXZhdGUgdGVzdE1pbklucHV0UmVxdWlyZW1lbnRzKCkge1xyXG4gICAgICByZXR1cm4geyBtZWV0c01pblJlcXVpcmVtZW50czogdHJ1ZSxzaGFwZTogXCJzaGFwZU5hbWVcIiwgY29vcmRpbmF0ZXM6IFtdLCBzaWRlczoge30sIGFuZ2xlczogW10gfTtcclxuICAgIH1cclxuICBcclxuICAgIHByaXZhdGUgaGFuZGxlU3VibWl0KCkge1xyXG4gIFxyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuZXZhbGVkVXNlcklucHV0SW5mbztcclxuICAgICAgICB0aGlzLnJlc3VsdENvbnRhaW5lci50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdCk7XHJcbiAgXHJcbiAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2Vzc2lvbkhpc3RvcnkucHVzaCh7XHJcbiAgICAgICAgICBpbnB1dDogdGhpcy51c2VyQW5nbGVzSW5wdXQsXHJcbiAgICAgICAgICByZXN1bHQ6IHJlc3VsdFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICBcclxuICAgIH1cclxuICAgIG9uQ2xvc2UoKSB7XHJcbiAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICBjb250ZW50RWwuZW1wdHkoKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBIaXN0b3J5TW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgXHJcbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBNYXRoUGx1Z2luKSB7XHJcbiAgICAgIHN1cGVyKGFwcCk7XHJcbiAgICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgb25PcGVuKCkge1xyXG4gICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlNlc3Npb24gSGlzdG9yeVwiIH0pO1xyXG4gIFxyXG4gICAgICAvLyBJZiB0aGVyZSBpcyBubyBoaXN0b3J5LCBkaXNwbGF5IGEgbWVzc2FnZVxyXG4gICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3Muc2Vzc2lvbkhpc3RvcnkubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiTm8gc2Vzc2lvbiBoaXN0b3J5IGZvdW5kLlwiIH0pO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICAvLyBEaXNwbGF5IGVhY2ggc2Vzc2lvbiBpbiB0aGUgaGlzdG9yeVxyXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeS5mb3JFYWNoKChzZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHNlc3Npb25EaXYgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwiaGlzdG9yeS1zZXNzaW9uXCIgfSk7XHJcbiAgICAgICAgc2Vzc2lvbkRpdi5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogYFNlc3Npb24gJHtpbmRleCArIDF9YCB9KTtcclxuICAgICAgICBzZXNzaW9uRGl2LmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBJbnB1dDogJHtzZXNzaW9uLmlucHV0fWAgfSk7XHJcbiAgICAgICAgc2Vzc2lvbkRpdi5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUmVzdWx0OiAke3Nlc3Npb24ucmVzdWx0fWAgfSk7XHJcbiAgICAgIH0pO1xyXG4gIFxyXG4gICAgICAvLyBDbG9zZSBidXR0b25cclxuICAgICAgY29uc3QgY2xvc2VCdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNsb3NlXCIgfSk7XHJcbiAgICAgIGNsb3NlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICBcclxuICAgIG9uQ2xvc2UoKSB7XHJcbiAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICBjb250ZW50RWwuZW1wdHkoKTsgLy8gQ2xlYW4gdXAgbW9kYWwgY29udGVudCBvbiBjbG9zZVxyXG4gICAgfVxyXG4gIH1cclxuIl19