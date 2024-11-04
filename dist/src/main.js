import { Plugin, MarkdownRenderer, Modal, Component, Notice, } from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { CustomInputModal } from "./temp";
import { DEFAULT_SETTINGS, MathPluginSettingTab, } from "./settings";
import { calculateBinom, degreesToRadians, findAngleByCosineRule, radiansToDegrees, roundBySettings } from "./mathUtilities.js";
import { Tikzjax } from "./tikzjax/tikzjax";
export default class MathPlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new MathPluginSettingTab(this.app, this));
        this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
        this.registerCommands();
        this.tikzProcessor = new Tikzjax(this.app, this);
        this.tikzProcessor.readyLayout();
        this.tikzProcessor.addSyntaxHighlighting();
        this.tikzProcessor.registerTikzCodeBlock();
    }
    onunload() {
        this.tikzProcessor.unloadTikZJaxAllWindows();
        this.tikzProcessor.removeSyntaxHighlighting();
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    registerCommands() {
        this.addCommand({
            id: "open-input-form",
            name: "Open Input Form",
            callback: () => new CustomInputModal(this.app, this).open(),
        });
        this.addCommand({
            id: "view-session-history",
            name: "View Session History",
            //callback: () => new HistoryModal(this.app, this).open(),
        });
    }
    processMathBlock(source, mainContainer) {
        mainContainer.classList.add("math-container");
        const userVariables = [];
        let skippedIndexes = 0;
        const expressions = source.split("\n").map(line => line.trim()).filter(line => line);
        if (expressions.length === 0) {
            return;
        }
        expressions.forEach((expression, index) => {
            let lineContainer = document.createElement("div");
            lineContainer.classList.add("math-line-container", (index - skippedIndexes) % 2 === 0 ? "math-row-even" : "math-row-odd");
            const processMath = new ProcessMath(expression, userVariables, this.app, lineContainer);
            processMath.initialize();
            if (processMath.mode !== "variable") {
                lineContainer = processMath.container;
                mainContainer.appendChild(lineContainer);
            }
            else {
                skippedIndexes++;
            }
        });
    }
}
class ProcessMath {
    constructor(mathInput, userVariables, app, container) {
        this.userVariables = [];
        this.mode = "math";
        this.mathInput = mathInput;
        this.userVariables = userVariables;
        this.app = app;
        this.container = container;
        this.iconsDiv = Object.assign(document.createElement("div"), {
            className: "math-icons",
        });
    }
    async initialize() {
        this.assignMode();
        this.setupContainer();
        this.handleVariables();
        this.renderMath();
    }
    setupContainer() {
        ["math-input", "math-result"].forEach(className => {
            const div = document.createElement("div");
            div.classList.add(className);
            this.container.appendChild(div);
        });
        this.container.appendChild(this.iconsDiv);
    }
    renderMath() {
        const inputDiv = this.container.querySelector(".math-input");
        const resultDiv = this.container.querySelector(".math-result");
        try {
            switch (this.mode) {
                case "binom":
                    // eslint-disable-next-line no-case-declarations
                    const binomModel = new BinomInfoModel(this.app, this.mathInput);
                    this.addInfoModal(binomModel);
                    this.result = binomModel.getEqual();
                    break;
                case "cos":
                    // eslint-disable-next-line no-case-declarations
                    const [, sideA, sideB, sideC] = this.mathInput.map(Number);
                    this.result = findAngleByCosineRule(sideA, sideB, sideC);
                    break;
                case "vec":
                    // eslint-disable-next-line no-case-declarations
                    this.result = new VecProcessor(this.mathInput[1], this.mathInput[2], this.mathInput[3]);
                    this.addInfoModal(new tikzGraph(this.app, this.result.graph));
                    this.addDebugModel(new DebugModal(this.app, this.result.vecInfo.debugInfo));
                    this.result = this.result.result;
                    break;
                case "variable":
                    break;
                default:
                    // eslint-disable-next-line no-case-declarations
                    this.result = new MathPraiser(this.mathInput);
                    this.addInfoModal(new InfoModal(this.app, this.result.mathInfo));
                    this.addDebugModel(new DebugModal(this.app, this.result.mathInfo.debugInfo));
                    this.mathInput = this.result.input;
                    this.result = this.result.solution;
                    break;
            }
            this.addInputAndResultDiv(inputDiv, resultDiv, typeof this.mathInput === "string" ? this.mathInput : this.mathInput[0], roundBySettings(this.result));
        }
        catch (err) {
            this.displayError(inputDiv, resultDiv, err);
            console.error("The initial praising failed", err);
        }
    }
    addInputAndResultDiv(inputDiv, resultDiv, input, result) {
        MarkdownRenderer.renderMarkdown(`\${${input}}$`, inputDiv, "", new Component());
        const resultOutput = /(true|false)/.test(result) ? result : `\${${result}}$`;
        MarkdownRenderer.renderMarkdown(resultOutput, resultDiv, "", new Component());
    }
    displayError(inputDiv, resultDiv, err) {
        MarkdownRenderer.renderMarkdown(this.mathInput, inputDiv, "", new Component());
        resultDiv.innerHTML = `<span class="error-text">${err.message}</span>`;
        this.container.classList.add("math-error-line");
    }
    assignMode() {
        const regexList = GetMathContextRegex();
        const matchObject = regexList.find(regexObj => regexObj.regex.test(this.mathInput));
        if (matchObject) {
            this.mode = matchObject.value;
            this.mathInput = this.mathInput.match(matchObject.regex);
        }
    }
    addInfoModal(modal) {
        const icon = Object.assign(document.createElement("div"), {
            className: "math-info-icon",
            textContent: "🛈",
        });
        icon.onclick = () => modal.open();
        this.iconsDiv.appendChild(icon);
    }
    addDebugModel(modal) {
        const icon = Object.assign(document.createElement("div"), {
            className: "math-debug-icon",
            textContent: "🐞",
        });
        icon.onclick = () => modal.open();
        this.iconsDiv.appendChild(icon);
    }
    handleVariables() {
        if (this.mode === "variable") {
            this.handleVariableDeclaration();
        }
        else {
            this.replaceVariablesInExpression();
        }
    }
    handleVariableDeclaration() {
        const [_, variable, value] = this.mathInput.map((part) => part.trim());
        if (!variable || !value) {
            console.warn(`Invalid variable declaration: ${this.mathInput}`);
            return;
        }
        const existingVarIndex = this.userVariables.findIndex(v => v.variable === variable);
        if (existingVarIndex !== -1) {
            this.userVariables[existingVarIndex].value = value;
        }
        else {
            this.userVariables.push({ variable, value });
        }
    }
    replaceVariablesInExpression() {
        this.userVariables.forEach(({ variable, value }) => {
            if (typeof this.mathInput === "string") {
                this.mathInput = this.mathInput.replace(variable, value);
            }
        });
    }
}
function GetMathContextRegex() {
    return [
        { regex: /binom\((\d+),(\d+),(\d+)\)/, value: "binom" },
        { regex: /vec([+-]{0,2})\(([\d.+-]+[:,][\d.+-]+)\)([\d.+-]*)/, value: "vec" },
        { regex: /cos\(([\d.]+),([\d.]+),([\d.]+)\)/, value: "cos" },
        { regex: /var\s*([\w]+)\s*=\s*([\d.]+)/, value: "variable" },
    ];
}
class VecProcessor {
    constructor(environment, mathInput, modifier) {
        this.vecInfo = new MathInfo();
        const match = environment.match(/([+-]?)([+-]?)/);
        this.environment = { X: match?.[1] ?? "+", Y: match?.[2] ?? "+" };
        this.modifier = modifier.length > 0 ? getUsableDegrees(Number(modifier)) : 0;
        if (mathInput.includes(":")) {
            this.calculateComponents(mathInput);
        }
        else {
            this.addComponents(mathInput);
        }
        this.addGraph();
    }
    // Handle Cartesian input
    addComponents(mathInput) {
        [this.Xcomponent, this.Ycomponent] = mathInput.split(",").map(Number);
        const length = Math.sqrt(this.Xcomponent ** 2 + this.Ycomponent ** 2);
        this.vecInfo.addDebugInfo("Calculated length", length);
        const angle = getUsableDegrees(radiansToDegrees(Math.atan2(this.Ycomponent, this.Xcomponent)));
        this.vecInfo.addDebugInfo("Calculated angle", angle);
        this.result = `\\text{angle} = ${roundBySettings(angle)}\\degree, \\quad \\text{length} = ${roundBySettings(length)}`;
    }
    // Handle polar input
    calculateComponents(mathInput) {
        let [angle, length] = mathInput.split(":").map(Number);
        this.vecInfo.addDebugInfo("Initial angle", angle);
        this.vecInfo.addDebugInfo("Initial length", length);
        angle = getUsableDegrees(angle + this.modifier);
        this.vecInfo.addDebugInfo("Adjusted angle", angle);
        this.Xcomponent = Math.cos(degreesToRadians(angle)) * length;
        this.Ycomponent = Math.sin(degreesToRadians(angle)) * length;
        this.vecInfo.addDebugInfo("X component", this.Xcomponent);
        this.vecInfo.addDebugInfo("Y component", this.Ycomponent);
        this.result = `x = ${roundBySettings(this.Xcomponent)}, \\quad y = ${roundBySettings(this.Ycomponent)}`;
    }
    // Vector addition
    add(vector) {
        this.Xcomponent += vector.Xcomponent;
        this.Ycomponent += vector.Ycomponent;
        return this;
    }
    // Apply dynamic scaling and generate LaTeX TikZ code for vector visualization
    addGraph() {
        const targetSize = 10;
        const maxComponent = Math.max(Math.abs(this.Xcomponent), Math.abs(this.Ycomponent));
        // Determine scaling factor
        let scale = 1;
        if (maxComponent < targetSize) {
            scale = targetSize / maxComponent; // Upscale if too small
        }
        else if (maxComponent > targetSize) {
            scale = targetSize / maxComponent; // Downscale if too large
        }
        // Apply scaling factor to both components
        const scaledX = this.Xcomponent * scale;
        const scaledY = this.Ycomponent * scale;
        const vectorLength = Math.sqrt(scaledX ** 2 + scaledY ** 2);
        const vectorAngle = getUsableDegrees(radiansToDegrees(Math.atan2(scaledY, scaledX)));
        // Generate LaTeX code for vector components and main vector
        const tikzCode = String.raw `
      \coor{${roundBySettings(scaledX)}, ${roundBySettings(scaledY)}}{vec}{}{}
      \coor{${roundBySettings(scaledX)}, 0}{X}{}{}
      \coor{0, ${roundBySettings(scaledY)}}{Y}{}{}
      \coor{0, 0}{anc}{}{}

      % X Component
      \draw [line width=1pt, draw=yellow, -{Stealth}] 
        (anc) -- node {${roundBySettings(this.Xcomponent)}$_{x}$} 
        (X);

      % Y Component
      \draw [line width=1pt, draw=yellow, -{Stealth}] 
        (anc) -- node {${roundBySettings(this.Ycomponent)}$_{y}$} 
        (Y);

      % Full Vector
      \draw [line width=1pt, draw=red, -{Stealth}] 
        (anc) -- node {${roundBySettings(vectorLength)}} 
        (vec);

      % Angle Annotation
      %\ang{X}{anc}{vec}{}{${roundBySettings(vectorAngle)}$^{\circ}$}
    `.replace(/^\s+/gm, "");
        this.vecInfo.addDebugInfo("Scaling factor", scale);
        this.vecInfo.addDebugInfo("TikZ graph code", tikzCode);
        this.graph = tikzCode;
    }
}
class tikzGraph extends Modal {
    constructor(app, tikzCode) {
        super(app);
        this.tikzCode = tikzCode;
    }
    onOpen() {
        const beginEnvironment = "```tikz\n[white]\n";
        const endEnvironment = "\n```";
        MarkdownRenderer.renderMarkdown(beginEnvironment + this.tikzCode + endEnvironment, this.contentEl, "", new Component());
        const actionButton = this.contentEl.createEl("button", { text: "Copy graph", cls: "info-modal-Copy-button" });
        actionButton.addEventListener("click", () => {
            navigator.clipboard.writeText(this.tikzCode);
            new Notice("Graph copied to clipboard!");
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
function getUsableDegrees(degrees) {
    return ((degrees % 360) + 360) % 360;
}
class BinomInfoModel extends Modal {
    constructor(app, source) {
        super(app);
        this.equal = 0;
        this.less = 0;
        this.lessEqual = 0;
        this.big = 0;
        this.bigEqual = 0;
        const [_, n, k, p] = source.match(/\d+/g).map(Number);
        this.n = n;
        this.k = k;
        this.p = p;
    }
    onOpen() {
        this.calculateProbabilities();
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Binomial Probability Results" });
        contentEl.createEl("p", { text: `P(X = ${this.k}) = ${this.equal}` });
        contentEl.createEl("p", { text: `P(X < ${this.k}) = ${this.less}` });
        contentEl.createEl("p", { text: `P(X <= ${this.k}) = ${this.lessEqual}` });
        contentEl.createEl("p", { text: `P(X > ${this.k}) = ${this.big}` });
        contentEl.createEl("p", { text: `P(X >= ${this.k}) = ${this.bigEqual}` });
    }
    getEqual() {
        return calculateBinom(this.n, this.k, this.p);
    }
    calculateProbabilities() {
        for (let i = 0; i <= this.n; i++) {
            const probability = calculateBinom(this.n, i, this.p);
            if (i === this.k)
                this.equal = probability;
            if (i < this.k)
                this.less += probability;
            if (i <= this.k)
                this.lessEqual += probability;
            if (i > this.k)
                this.big += probability;
            if (i >= this.k)
                this.bigEqual += probability;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEdBQW1CLE1BQU0sVUFBVSxDQUFDO0FBQzNHLE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQTJDLE1BQU0sUUFBUSxDQUFDO0FBQ25GLE9BQU8sRUFBcUIsZ0JBQWdCLEVBQUUsb0JBQW9CLEdBQUUsTUFBTSxZQUFZLENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsRUFBRSxxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNoSSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFNUMsTUFBTSxDQUFDLE9BQU8sT0FBTyxVQUFXLFNBQVEsTUFBTTtJQUc1QyxLQUFLLENBQUMsTUFBTTtRQUNWLE1BQU0sSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDekYsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFDLElBQUksQ0FBQyxDQUFB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RUFBRSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDYixDQUFDO0lBRUQsTUFBTTtRQUNKLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQzlCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsOEJBQThCLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFTSxRQUFRO1FBQ2IsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRU8sc0JBQXNCO1FBQzVCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2hDLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEQsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUM7WUFDM0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLElBQUksSUFBSSxXQUFXLENBQUM7WUFDekMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLFNBQVMsSUFBSSxXQUFXLENBQUM7WUFDL0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLEdBQUcsSUFBSSxXQUFXLENBQUM7WUFDeEMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLFFBQVEsSUFBSSxXQUFXLENBQUM7U0FDL0M7SUFDSCxDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1BsdWdpbiwgTWFya2Rvd25SZW5kZXJlciwgQXBwLCBNb2RhbCwgQ29tcG9uZW50LCBTZXR0aW5nLE5vdGljZSwgV29ya3NwYWNlV2luZG93LH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IE1hdGhJbmZvLCBNYXRoUHJhaXNlciB9IGZyb20gXCIuL21hdGhFbmdpbmUuanNcIjtcclxuaW1wb3J0IHsgSW5mb01vZGFsLCBEZWJ1Z01vZGFsIH0gZnJvbSBcIi4vZGVzcGx5TW9kYWxzXCI7XHJcbmltcG9ydCB7IEN1c3RvbUlucHV0TW9kYWwsIEhpc3RvcnlNb2RhbCwgSW5wdXRNb2RhbCwgdmVjSW5wb3RNb2RlbCB9IGZyb20gXCIuL3RlbXBcIjtcclxuaW1wb3J0IHtNYXRoUGx1Z2luU2V0dGluZ3MsIERFRkFVTFRfU0VUVElOR1MsIE1hdGhQbHVnaW5TZXR0aW5nVGFiLH0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcclxuaW1wb3J0IHsgY2FsY3VsYXRlQmlub20sIGRlZ3JlZXNUb1JhZGlhbnMsIGZpbmRBbmdsZUJ5Q29zaW5lUnVsZSwgcmFkaWFuc1RvRGVncmVlcywgcm91bmRCeVNldHRpbmdzIH0gZnJvbSBcIi4vbWF0aFV0aWxpdGllcy5qc1wiO1xyXG5pbXBvcnQgeyBUaWt6amF4IH0gZnJvbSBcIi4vdGlrempheC90aWt6amF4XCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRoUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcclxuICBzZXR0aW5nczogTWF0aFBsdWdpblNldHRpbmdzO1xyXG4gIHRpa3pQcm9jZXNzb3I6IFRpa3pqYXhcclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBNYXRoUGx1Z2luU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibWF0aC1lbmdpbmVcIiwgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3RlckNvbW1hbmRzKCk7XHJcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3I9bmV3IFRpa3pqYXgodGhpcy5hcHAsdGhpcylcclxuICAgIFxyXG5cclxuICAgIHRoaXMudGlrelByb2Nlc3Nvci5yZWFkeUxheW91dCgpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLmFkZFN5bnRheEhpZ2hsaWdodGluZygpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlZ2lzdGVyVGlrekNvZGVCbG9jaygpO1xyXG4gIH1cclxuICBvbnVubG9hZCgpIHtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpO1xyXG5cdH1cclxuICBcclxuICBcclxuICBwcml2YXRlIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcclxuICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcclxuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlZ2lzdGVyQ29tbWFuZHMoKSB7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJvcGVuLWlucHV0LWZvcm1cIixcclxuICAgICAgbmFtZTogXCJPcGVuIElucHV0IEZvcm1cIixcclxuICAgICAgY2FsbGJhY2s6ICgpID0+IG5ldyBDdXN0b21JbnB1dE1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCksXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJ2aWV3LXNlc3Npb24taGlzdG9yeVwiLFxyXG4gICAgICBuYW1lOiBcIlZpZXcgU2Vzc2lvbiBIaXN0b3J5XCIsXHJcbiAgICAgIC8vY2FsbGJhY2s6ICgpID0+IG5ldyBIaXN0b3J5TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBwcm9jZXNzTWF0aEJsb2NrKHNvdXJjZTogc3RyaW5nLCBtYWluQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgbWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1jb250YWluZXJcIik7XHJcblxyXG4gICAgY29uc3QgdXNlclZhcmlhYmxlczogeyB2YXJpYWJsZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xyXG4gICAgbGV0IHNraXBwZWRJbmRleGVzID0gMDtcclxuXHJcbiAgICBjb25zdCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKS5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSkuZmlsdGVyKGxpbmUgPT4gbGluZSk7XHJcbiAgICBpZiAoZXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7cmV0dXJuO31cclxuXHJcbiAgICBcclxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XHJcbiAgICAgIGxldCBsaW5lQ29udGFpbmVyOiBIVE1MRGl2RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgIGxpbmVDb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtbGluZS1jb250YWluZXJcIiwgKGluZGV4LXNraXBwZWRJbmRleGVzKSAlIDIgPT09IDAgPyBcIm1hdGgtcm93LWV2ZW5cIiA6IFwibWF0aC1yb3ctb2RkXCIpO1xyXG4gICAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xyXG4gICAgICBwcm9jZXNzTWF0aC5pbml0aWFsaXplKCk7XHJcbiAgICAgIGlmKHByb2Nlc3NNYXRoLm1vZGUhPT1cInZhcmlhYmxlXCIpe1xyXG4gICAgICAgIGxpbmVDb250YWluZXIgPSBwcm9jZXNzTWF0aC5jb250YWluZXIgYXMgSFRNTERpdkVsZW1lbnQ7XHJcbiAgICAgICAgbWFpbkNvbnRhaW5lci5hcHBlbmRDaGlsZChsaW5lQ29udGFpbmVyKTtcclxuICAgICAgfVxyXG4gICAgICBlbHNle3NraXBwZWRJbmRleGVzKys7fVxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5jbGFzcyBQcm9jZXNzTWF0aCB7XHJcbiAgbWF0aElucHV0OiBhbnk7XHJcbiAgdXNlclZhcmlhYmxlczogeyB2YXJpYWJsZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xyXG4gIG1vZGUgPSBcIm1hdGhcIjtcclxuICByZXN1bHQ6IGFueTtcclxuICBjb250YWluZXI6IEhUTUxFbGVtZW50O1xyXG4gIGljb25zRGl2OiBIVE1MRWxlbWVudDtcclxuICBhcHA6IEFwcDtcclxuXHJcbiAgY29uc3RydWN0b3IobWF0aElucHV0OiBzdHJpbmcsdXNlclZhcmlhYmxlczogYW55LCBhcHA6IEFwcCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xyXG4gICAgdGhpcy5tYXRoSW5wdXQgPSBtYXRoSW5wdXQ7XHJcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXM9dXNlclZhcmlhYmxlcztcclxuICAgIHRoaXMuYXBwID0gYXBwO1xyXG4gICAgdGhpcy5jb250YWluZXIgPSBjb250YWluZXI7XHJcbiAgICB0aGlzLmljb25zRGl2ID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWljb25zXCIsXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGluaXRpYWxpemUoKSB7XHJcbiAgICB0aGlzLmFzc2lnbk1vZGUoKTtcclxuICAgIHRoaXMuc2V0dXBDb250YWluZXIoKTtcclxuICAgIHRoaXMuaGFuZGxlVmFyaWFibGVzKCk7XHJcbiAgICB0aGlzLnJlbmRlck1hdGgoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2V0dXBDb250YWluZXIoKSB7XHJcbiAgICBbXCJtYXRoLWlucHV0XCIsIFwibWF0aC1yZXN1bHRcIl0uZm9yRWFjaChjbGFzc05hbWUgPT4ge1xyXG4gICAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICBkaXYuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xyXG4gICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xyXG4gICAgfSk7XHJcbiAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmljb25zRGl2KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVuZGVyTWF0aCgpIHtcclxuICAgIGNvbnN0IGlucHV0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLWlucHV0XCIpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgY29uc3QgcmVzdWx0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLXJlc3VsdFwiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIHRyeSB7XHJcbiAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XHJcbiAgICAgICAgY2FzZSBcImJpbm9tXCI6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIGNvbnN0IGJpbm9tTW9kZWwgPSBuZXcgQmlub21JbmZvTW9kZWwodGhpcy5hcHAsIHRoaXMubWF0aElucHV0KTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKGJpbm9tTW9kZWwpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSBiaW5vbU1vZGVsLmdldEVxdWFsKCk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiY29zXCI6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIGNvbnN0IFsgLCBzaWRlQSwgc2lkZUIsIHNpZGVDIF0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoTnVtYmVyKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0PWZpbmRBbmdsZUJ5Q29zaW5lUnVsZShzaWRlQSwgc2lkZUIsIHNpZGVDKVxyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInZlY1wiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD1uZXcgVmVjUHJvY2Vzc29yKHRoaXMubWF0aElucHV0WzFdLHRoaXMubWF0aElucHV0WzJdLHRoaXMubWF0aElucHV0WzNdKTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyB0aWt6R3JhcGgodGhpcy5hcHAsIHRoaXMucmVzdWx0LmdyYXBoKSk7XHJcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0LnZlY0luZm8uZGVidWdJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD10aGlzLnJlc3VsdC5yZXN1bHRcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSBuZXcgTWF0aFByYWlzZXIodGhpcy5tYXRoSW5wdXQpO1xyXG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8pKTtcclxuICAgICAgICAgIHRoaXMuYWRkRGVidWdNb2RlbChuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8uZGVidWdJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLm1hdGhJbnB1dD10aGlzLnJlc3VsdC5pbnB1dDtcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gdGhpcy5yZXN1bHQuc29sdXRpb247XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgIHRoaXMuYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXYsIHJlc3VsdERpdiwgdHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIj90aGlzLm1hdGhJbnB1dDp0aGlzLm1hdGhJbnB1dFswXSwgcm91bmRCeVNldHRpbmdzKHRoaXMucmVzdWx0KSk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgXHJcbiAgICAgIHRoaXMuZGlzcGxheUVycm9yKGlucHV0RGl2LCByZXN1bHREaXYsIGVycik7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaGUgaW5pdGlhbCBwcmFpc2luZyBmYWlsZWRcIixlcnIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGlucHV0OiBzdHJpbmcsIHJlc3VsdDogYW55KSB7XHJcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCR7JHtpbnB1dH19JGAsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gICAgY29uc3QgcmVzdWx0T3V0cHV0ID0gLyh0cnVlfGZhbHNlKS8udGVzdChyZXN1bHQpID8gcmVzdWx0IDogYFxcJHske3Jlc3VsdH19JGA7XHJcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHJlc3VsdE91dHB1dCwgcmVzdWx0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBkaXNwbGF5RXJyb3IoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBlcnI6IEVycm9yKSB7XHJcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHRoaXMubWF0aElucHV0LCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+JHtlcnIubWVzc2FnZX08L3NwYW4+YDtcclxuICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWVycm9yLWxpbmVcIik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzc2lnbk1vZGUoKSB7XHJcbiAgICBjb25zdCByZWdleExpc3QgPSBHZXRNYXRoQ29udGV4dFJlZ2V4KCk7XHJcbiAgICBjb25zdCBtYXRjaE9iamVjdCA9IHJlZ2V4TGlzdC5maW5kKHJlZ2V4T2JqID0+IHJlZ2V4T2JqLnJlZ2V4LnRlc3QodGhpcy5tYXRoSW5wdXQpKTtcclxuICAgIGlmIChtYXRjaE9iamVjdCkge1xyXG4gICAgICB0aGlzLm1vZGUgPSBtYXRjaE9iamVjdC52YWx1ZTtcclxuICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5tYXRjaChtYXRjaE9iamVjdC5yZWdleCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZEluZm9Nb2RhbChtb2RhbDogYW55KSB7XHJcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWluZm8taWNvblwiLFxyXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgICB9KTtcclxuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcclxuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZERlYnVnTW9kZWwobW9kYWw6IGFueSkge1xyXG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICAgIHRleHRDb250ZW50OiBcIvCfkJ5cIixcclxuICAgIH0pO1xyXG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xyXG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVzKCkge1xyXG4gICAgaWYgKHRoaXMubW9kZT09PVwidmFyaWFibGVcIikge1xyXG4gICAgICB0aGlzLmhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMucmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCkge1xyXG4gICAgY29uc3QgW18sdmFyaWFibGUsIHZhbHVlXSA9IHRoaXMubWF0aElucHV0Lm1hcCgocGFydDogc3RyaW5nKSA9PiBwYXJ0LnRyaW0oKSk7XHJcbiAgICBpZiAoIXZhcmlhYmxlIHx8ICF2YWx1ZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYEludmFsaWQgdmFyaWFibGUgZGVjbGFyYXRpb246ICR7dGhpcy5tYXRoSW5wdXR9YCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGV4aXN0aW5nVmFySW5kZXggPSB0aGlzLnVzZXJWYXJpYWJsZXMuZmluZEluZGV4KHYgPT4gdi52YXJpYWJsZSA9PT0gdmFyaWFibGUpO1xyXG4gICAgaWYgKGV4aXN0aW5nVmFySW5kZXggIT09IC0xKSB7XHJcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlc1tleGlzdGluZ1ZhckluZGV4XS52YWx1ZSA9IHZhbHVlO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy51c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZSwgdmFsdWUgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKXtcclxuICAgIHRoaXMudXNlclZhcmlhYmxlcy5mb3JFYWNoKCh7IHZhcmlhYmxlLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0LnJlcGxhY2UodmFyaWFibGUsIHZhbHVlKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gR2V0TWF0aENvbnRleHRSZWdleCgpIHtcclxuICByZXR1cm4gW1xyXG4gICAgeyByZWdleDogL2Jpbm9tXFwoKFxcZCspLChcXGQrKSwoXFxkKylcXCkvLCB2YWx1ZTogXCJiaW5vbVwiIH0sXHJcbiAgICB7IHJlZ2V4OiAvdmVjKFsrLV17MCwyfSlcXCgoW1xcZC4rLV0rWzosXVtcXGQuKy1dKylcXCkoW1xcZC4rLV0qKS8sIHZhbHVlOiBcInZlY1wiIH0sXHJcbiAgICB7IHJlZ2V4OiAvY29zXFwoKFtcXGQuXSspLChbXFxkLl0rKSwoW1xcZC5dKylcXCkvLCB2YWx1ZTogXCJjb3NcIiB9LFxyXG4gICAgeyByZWdleDogL3ZhclxccyooW1xcd10rKVxccyo9XFxzKihbXFxkLl0rKS8sIHZhbHVlOiBcInZhcmlhYmxlXCIgfSxcclxuICBdO1xyXG59XHJcblxyXG5cclxuY2xhc3MgVmVjUHJvY2Vzc29yIHtcclxuICB1c2VySW5wdXQ6IGFueTtcclxuICBlbnZpcm9ubWVudDogeyBYOiBzdHJpbmc7IFk6IHN0cmluZyB9O1xyXG4gIHZlY0luZm8gPSBuZXcgTWF0aEluZm8oKTtcclxuICBYY29tcG9uZW50OiBudW1iZXI7XHJcbiAgWWNvbXBvbmVudDogbnVtYmVyO1xyXG4gIG1vZGlmaWVyOiBudW1iZXI7XHJcbiAgcmVzdWx0OiBzdHJpbmc7XHJcbiAgZ3JhcGg6IHN0cmluZztcclxuXHJcbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgbWF0aElucHV0OiBzdHJpbmcsIG1vZGlmaWVyOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IG1hdGNoID0gZW52aXJvbm1lbnQubWF0Y2goLyhbKy1dPykoWystXT8pLyk7XHJcbiAgICB0aGlzLmVudmlyb25tZW50ID0geyBYOiBtYXRjaD8uWzFdID8/IFwiK1wiLCBZOiBtYXRjaD8uWzJdID8/IFwiK1wiIH07XHJcblxyXG4gICAgdGhpcy5tb2RpZmllciA9IG1vZGlmaWVyLmxlbmd0aCA+IDAgPyBnZXRVc2FibGVEZWdyZWVzKE51bWJlcihtb2RpZmllcikpIDogMDtcclxuXHJcbiAgICBpZiAobWF0aElucHV0LmluY2x1ZGVzKFwiOlwiKSkge1xyXG4gICAgICB0aGlzLmNhbGN1bGF0ZUNvbXBvbmVudHMobWF0aElucHV0KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuYWRkQ29tcG9uZW50cyhtYXRoSW5wdXQpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5hZGRHcmFwaCgpO1xyXG4gIH1cclxuXHJcbiAgLy8gSGFuZGxlIENhcnRlc2lhbiBpbnB1dFxyXG4gIGFkZENvbXBvbmVudHMobWF0aElucHV0OiBzdHJpbmcpIHtcclxuICAgIFt0aGlzLlhjb21wb25lbnQsIHRoaXMuWWNvbXBvbmVudF0gPSBtYXRoSW5wdXQuc3BsaXQoXCIsXCIpLm1hcChOdW1iZXIpO1xyXG4gICAgY29uc3QgbGVuZ3RoID0gTWF0aC5zcXJ0KHRoaXMuWGNvbXBvbmVudCAqKiAyICsgdGhpcy5ZY29tcG9uZW50ICoqIDIpO1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIkNhbGN1bGF0ZWQgbGVuZ3RoXCIsIGxlbmd0aCk7XHJcblxyXG4gICAgY29uc3QgYW5nbGUgPSBnZXRVc2FibGVEZWdyZWVzKHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuMih0aGlzLlljb21wb25lbnQsIHRoaXMuWGNvbXBvbmVudCkpKTtcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJDYWxjdWxhdGVkIGFuZ2xlXCIsIGFuZ2xlKTtcclxuXHJcbiAgICB0aGlzLnJlc3VsdCA9IGBcXFxcdGV4dHthbmdsZX0gPSAke3JvdW5kQnlTZXR0aW5ncyhhbmdsZSl9XFxcXGRlZ3JlZSwgXFxcXHF1YWQgXFxcXHRleHR7bGVuZ3RofSA9ICR7cm91bmRCeVNldHRpbmdzKGxlbmd0aCl9YDtcclxuICB9XHJcblxyXG4gIC8vIEhhbmRsZSBwb2xhciBpbnB1dFxyXG4gIGNhbGN1bGF0ZUNvbXBvbmVudHMobWF0aElucHV0OiBzdHJpbmcpIHtcclxuICAgIGxldCBbYW5nbGUsIGxlbmd0aF0gPSBtYXRoSW5wdXQuc3BsaXQoXCI6XCIpLm1hcChOdW1iZXIpO1xyXG5cclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJJbml0aWFsIGFuZ2xlXCIsIGFuZ2xlKTtcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJJbml0aWFsIGxlbmd0aFwiLCBsZW5ndGgpO1xyXG5cclxuICAgIGFuZ2xlID0gZ2V0VXNhYmxlRGVncmVlcyhhbmdsZSArIHRoaXMubW9kaWZpZXIpO1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIkFkanVzdGVkIGFuZ2xlXCIsIGFuZ2xlKTtcclxuXHJcbiAgICB0aGlzLlhjb21wb25lbnQgPSBNYXRoLmNvcyhkZWdyZWVzVG9SYWRpYW5zKGFuZ2xlKSkgKiBsZW5ndGg7XHJcbiAgICB0aGlzLlljb21wb25lbnQgPSBNYXRoLnNpbihkZWdyZWVzVG9SYWRpYW5zKGFuZ2xlKSkgKiBsZW5ndGg7XHJcblxyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIlggY29tcG9uZW50XCIsIHRoaXMuWGNvbXBvbmVudCk7XHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiWSBjb21wb25lbnRcIiwgdGhpcy5ZY29tcG9uZW50KTtcclxuICAgIHRoaXMucmVzdWx0ID0gYHggPSAke3JvdW5kQnlTZXR0aW5ncyh0aGlzLlhjb21wb25lbnQpfSwgXFxcXHF1YWQgeSA9ICR7cm91bmRCeVNldHRpbmdzKHRoaXMuWWNvbXBvbmVudCl9YDtcclxuICB9XHJcblxyXG4gIC8vIFZlY3RvciBhZGRpdGlvblxyXG4gIGFkZCh2ZWN0b3I6IFZlY1Byb2Nlc3Nvcik6IFZlY1Byb2Nlc3NvciB7XHJcbiAgICB0aGlzLlhjb21wb25lbnQgKz0gdmVjdG9yLlhjb21wb25lbnQ7XHJcbiAgICB0aGlzLlljb21wb25lbnQgKz0gdmVjdG9yLlljb21wb25lbnQ7XHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcblxyXG4gIC8vIEFwcGx5IGR5bmFtaWMgc2NhbGluZyBhbmQgZ2VuZXJhdGUgTGFUZVggVGlrWiBjb2RlIGZvciB2ZWN0b3IgdmlzdWFsaXphdGlvblxyXG4gIGFkZEdyYXBoKCkge1xyXG4gICAgY29uc3QgdGFyZ2V0U2l6ZSA9IDEwO1xyXG4gICAgY29uc3QgbWF4Q29tcG9uZW50ID0gTWF0aC5tYXgoTWF0aC5hYnModGhpcy5YY29tcG9uZW50KSwgTWF0aC5hYnModGhpcy5ZY29tcG9uZW50KSk7XHJcblxyXG4gICAgLy8gRGV0ZXJtaW5lIHNjYWxpbmcgZmFjdG9yXHJcbiAgICBsZXQgc2NhbGUgPSAxO1xyXG4gICAgaWYgKG1heENvbXBvbmVudCA8IHRhcmdldFNpemUpIHtcclxuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50OyAvLyBVcHNjYWxlIGlmIHRvbyBzbWFsbFxyXG4gICAgfSBlbHNlIGlmIChtYXhDb21wb25lbnQgPiB0YXJnZXRTaXplKSB7XHJcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDsgLy8gRG93bnNjYWxlIGlmIHRvbyBsYXJnZVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEFwcGx5IHNjYWxpbmcgZmFjdG9yIHRvIGJvdGggY29tcG9uZW50c1xyXG4gICAgY29uc3Qgc2NhbGVkWCA9IHRoaXMuWGNvbXBvbmVudCAqIHNjYWxlO1xyXG4gICAgY29uc3Qgc2NhbGVkWSA9IHRoaXMuWWNvbXBvbmVudCAqIHNjYWxlO1xyXG4gICAgY29uc3QgdmVjdG9yTGVuZ3RoID0gTWF0aC5zcXJ0KHNjYWxlZFggKiogMiArIHNjYWxlZFkgKiogMik7XHJcbiAgICBjb25zdCB2ZWN0b3JBbmdsZSA9IGdldFVzYWJsZURlZ3JlZXMocmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4yKHNjYWxlZFksIHNjYWxlZFgpKSk7XHJcblxyXG4gICAgLy8gR2VuZXJhdGUgTGFUZVggY29kZSBmb3IgdmVjdG9yIGNvbXBvbmVudHMgYW5kIG1haW4gdmVjdG9yXHJcbiAgICBjb25zdCB0aWt6Q29kZSA9IFN0cmluZy5yYXdgXHJcbiAgICAgIFxcY29vcnske3JvdW5kQnlTZXR0aW5ncyhzY2FsZWRYKX0sICR7cm91bmRCeVNldHRpbmdzKHNjYWxlZFkpfX17dmVjfXt9e31cclxuICAgICAgXFxjb29yeyR7cm91bmRCeVNldHRpbmdzKHNjYWxlZFgpfSwgMH17WH17fXt9XHJcbiAgICAgIFxcY29vcnswLCAke3JvdW5kQnlTZXR0aW5ncyhzY2FsZWRZKX19e1l9e317fVxyXG4gICAgICBcXGNvb3J7MCwgMH17YW5jfXt9e31cclxuXHJcbiAgICAgICUgWCBDb21wb25lbnRcclxuICAgICAgXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCwgZHJhdz15ZWxsb3csIC17U3RlYWx0aH1dIFxyXG4gICAgICAgIChhbmMpIC0tIG5vZGUgeyR7cm91bmRCeVNldHRpbmdzKHRoaXMuWGNvbXBvbmVudCl9JF97eH0kfSBcclxuICAgICAgICAoWCk7XHJcblxyXG4gICAgICAlIFkgQ29tcG9uZW50XHJcbiAgICAgIFxcZHJhdyBbbGluZSB3aWR0aD0xcHQsIGRyYXc9eWVsbG93LCAte1N0ZWFsdGh9XSBcclxuICAgICAgICAoYW5jKSAtLSBub2RlIHske3JvdW5kQnlTZXR0aW5ncyh0aGlzLlljb21wb25lbnQpfSRfe3l9JH0gXHJcbiAgICAgICAgKFkpO1xyXG5cclxuICAgICAgJSBGdWxsIFZlY3RvclxyXG4gICAgICBcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LCBkcmF3PXJlZCwgLXtTdGVhbHRofV0gXHJcbiAgICAgICAgKGFuYykgLS0gbm9kZSB7JHtyb3VuZEJ5U2V0dGluZ3ModmVjdG9yTGVuZ3RoKX19IFxyXG4gICAgICAgICh2ZWMpO1xyXG5cclxuICAgICAgJSBBbmdsZSBBbm5vdGF0aW9uXHJcbiAgICAgICVcXGFuZ3tYfXthbmN9e3ZlY317fXske3JvdW5kQnlTZXR0aW5ncyh2ZWN0b3JBbmdsZSl9JF57XFxjaXJjfSR9XHJcbiAgICBgLnJlcGxhY2UoL15cXHMrL2dtLCBcIlwiKTtcclxuXHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiU2NhbGluZyBmYWN0b3JcIiwgc2NhbGUpO1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIlRpa1ogZ3JhcGggY29kZVwiLCB0aWt6Q29kZSk7XHJcbiAgICB0aGlzLmdyYXBoID0gdGlrekNvZGU7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIHRpa3pHcmFwaCBleHRlbmRzIE1vZGFsIHtcclxuICB0aWt6Q29kZTogc3RyaW5nXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsdGlrekNvZGU6IHN0cmluZyl7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy50aWt6Q29kZT10aWt6Q29kZTtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IGJlZ2luRW52aXJvbm1lbnQ9XCJgYGB0aWt6XFxuW3doaXRlXVxcblwiXHJcbiAgICBjb25zdCBlbmRFbnZpcm9ubWVudD1cIlxcbmBgYFwiO1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihiZWdpbkVudmlyb25tZW50K3RoaXMudGlrekNvZGUrZW5kRW52aXJvbm1lbnQsIHRoaXMuY29udGVudEVsLCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gICAgY29uc3QgYWN0aW9uQnV0dG9uID0gdGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcclxuXHJcbiAgICBhY3Rpb25CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6Q29kZSk7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJHcmFwaCBjb3BpZWQgdG8gY2xpcGJvYXJkIVwiKTtcclxuICAgIH0pO1xyXG4gIH1cclxuICBvbkNsb3NlKCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldFVzYWJsZURlZ3JlZXMoZGVncmVlczogbnVtYmVyKTogbnVtYmVyIHtcclxuICByZXR1cm4gKChkZWdyZWVzICUgMzYwKSArIDM2MCkgJSAzNjA7XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgQmlub21JbmZvTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzID0gMDtcclxuICBwcml2YXRlIGxlc3NFcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBiaWcgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICBjb25zdCBbXywgbiwgaywgcF0gPSBzb3VyY2UubWF0Y2goL1xcZCsvZykhLm1hcChOdW1iZXIpO1xyXG4gICAgdGhpcy5uID0gbjtcclxuICAgIHRoaXMuayA9IGs7XHJcbiAgICB0aGlzLnAgPSBwO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzXCIgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8PSAke3RoaXMua30pID0gJHt0aGlzLmxlc3NFcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gY2FsY3VsYXRlQmlub20odGhpcy5uLCB0aGlzLmssIHRoaXMucCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xyXG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykgdGhpcy5lcXVhbCA9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+IHRoaXMuaykgdGhpcy5iaWcgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19