import { Plugin, MarkdownRenderer, addIcon, Modal, Component, Notice, loadMathJax, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, processLatexSuiteSettings } from "./settings/settings";
import { LatexSuiteSettingTab } from "./settings/settings_tab";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities.js";
import { Axis, Tikzjax } from "./tikzjax/tikzjax";
import { TikzSvg } from "./tikzjax/myTikz.js";
import { FormatTikzjax } from "./tikzjax/interpret/tokenizeTikzjax.js";
import { EditorExtensions } from "./setEditorExtensions.js";
import { onFileCreate, onFileChange, onFileDelete, getSnippetsFromFiles, getFileSets, getVariablesFromFiles, tryGetVariablesFromUnknownFiles } from "./settings/file_watch";
import { ICONS } from "./settings/ui/icons";
import { getEditorCommands } from "./features/editor_commands";
import { parseSnippetVariables, parseSnippets } from "./snippets/parse";
export default class Moshe extends Plugin {
    settings;
    CMSettings;
    editorExtensions = [];
    tikzProcessor;
    editorExtensions2 = new EditorExtensions();
    async onload() {
        await this.loadSettings();
        this.loadIcons();
        this.addSettingTab(new LatexSuiteSettingTab(this.app, this));
        loadMathJax();
        // Register Latex Suite extensions and optional editor extensions for editor enhancements
        this.registerEditorExtension(this.editorExtensions);
        // Watch for changes to the snippet variables and snippets files
        this.watchFiles();
        this.addEditorCommands();
        this.tikzProcessor = new Tikzjax(this.app, this);
        this.tikzProcessor.readyLayout();
        this.tikzProcessor.addSyntaxHighlighting();
        this.tikzProcessor.registerTikzCodeBlock();
        this.addSettingTab(new LatexSuiteSettingTab(this.app, this));
        this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
        this.registerMarkdownCodeBlockProcessor("tikzjax", this.processTikzBlock.bind(this));
        this.registerCommands();
        //this.registerEditorSuggest(new NumeralsSuggestor(this));
    }
    addEditorCommands() {
        for (const command of getEditorCommands(this)) {
            this.addCommand(command);
        }
    }
    onunload() {
        this.tikzProcessor.unloadTikZJaxAllWindows();
        this.tikzProcessor.removeSyntaxHighlighting();
    }
    async getSettingsSnippets(snippetVariables) {
        try {
            return await parseSnippets(this.settings.snippets, snippetVariables);
        }
        catch (e) {
            new Notice(`Failed to load snippets from settings: ${e}`);
            console.log(`Failed to load snippets from settings: ${e}`);
            return [];
        }
    }
    processTikzBlock(source, container) {
        const svg = new TikzSvg(source);
        const icon = Object.assign(container.createEl("div"), {
            className: "math-debug-icon",
            textContent: "🛈",
        });
        const graph = Object.assign(document.createElement("div"), {
            style: "display: flex; justify-content: center; align-items: center;"
        });
        graph.appendChild(svg.getSvg());
        svg.debugInfo += graph.outerHTML;
        //console.log(graph.outerHTML)
        icon.onclick = () => new DebugModal(this.app, svg.debugInfo).open();
        container.appendChild(icon);
        container.appendChild(graph);
    }
    loadIcons() {
        for (const [iconId, svgContent] of Object.entries(ICONS)) {
            addIcon(iconId, svgContent);
        }
    }
    async loadSettings() {
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
    async saveSettings(didFileLocationChange = false) {
        await this.saveData(this.settings);
        this.processSettings(didFileLocationChange);
    }
    async processSettings(becauseFileLocationUpdated = false, becauseFileUpdated = false) {
        this.CMSettings = processLatexSuiteSettings(await this.getSnippets(becauseFileLocationUpdated, becauseFileUpdated), this.settings);
        this.editorExtensions2.setEditorExtensions(this);
        //this.setEditorExtensions();
        this.app.workspace.updateOptions();
    }
    async getSettingsSnippetVariables() {
        try {
            return await parseSnippetVariables(this.settings.snippetVariables);
        }
        catch (e) {
            new Notice(`Failed to load snippet variables from settings: ${e}`);
            console.log(`Failed to load snippet variables from settings: ${e}`);
            return {};
        }
    }
    async getSnippets(becauseFileLocationUpdated, becauseFileUpdated) {
        // Get files in snippet/variable folders.
        // If either is set to be loaded from settings the set will just be empty.
        const files = getFileSets(this);
        const snippetVariables = this.settings.loadSnippetVariablesFromFile
            ? await getVariablesFromFiles(this, files)
            : await this.getSettingsSnippetVariables();
        // This must be done in either case, because it also updates the set of snippet files
        const unknownFileVariables = await tryGetVariablesFromUnknownFiles(this, files);
        if (this.settings.loadSnippetVariablesFromFile) {
            // But we only use the values if the user wants them
            Object.assign(snippetVariables, unknownFileVariables);
        }
        const snippets = this.settings.loadSnippetsFromFile
            ? await getSnippetsFromFiles(this, files, snippetVariables)
            : await this.getSettingsSnippets(snippetVariables);
        this.showSnippetsLoadedNotice(snippets.length, Object.keys(snippetVariables).length, becauseFileLocationUpdated, becauseFileUpdated);
        return snippets;
    }
    showSnippetsLoadedNotice(nSnippets, nSnippetVariables, becauseFileLocationUpdated, becauseFileUpdated) {
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
    registerCommands() {
        this.addCommand({
            id: "open-input-form",
            name: "Open Input Form",
            callback: () => new VecInputModel(this.app, this).open(),
        });
        this.addCommand({
            id: "view-session-history",
            name: "View Session History",
            //callback: () => new HistoryModal(this.app, this).open(),
        });
        this.addCommand({
            id: "test-mathEngine",
            name: "test math engine",
            callback: () => testMathEngine(),
        });
    }
    watchFiles() {
        // Only begin watching files once the layout is ready
        // Otherwise, we'll be unnecessarily reacting to many onFileCreate events of snippet files
        // that occur when Obsidian first loads
        this.app.workspace.onLayoutReady(() => {
            const eventsAndCallbacks = {
                "modify": onFileChange,
                "delete": onFileDelete,
                "create": onFileCreate
            };
            for (const [key, value] of Object.entries(eventsAndCallbacks)) {
                // @ts-expect-error
                this.registerEvent(this.app.vault.on(key, (file) => value(this, file)));
            }
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
            //if (expression.match(/^\/\//)){}
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
    mathInput;
    userVariables = [];
    mode = "math";
    result;
    container;
    iconsDiv;
    app;
    constructor(mathInput, userVariables, app, container) {
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
        inputDiv.appendChild(renderMath(input, true));
        //MarkdownRenderer.renderMarkdown(`\${${input}}$`, inputDiv, "", new Component());
        //const resultOutput = /(true|false)/.test(result) ? result : `\${${result}}$`;
        resultDiv.appendChild(renderMath(result.toString(), true));
        //MarkdownRenderer.renderMarkdown(resultOutput, resultDiv, "", new Component());
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
    userInput;
    environment;
    vecInfo = new MathInfo();
    axis;
    modifier;
    result;
    graph;
    constructor(environment, mathInput, modifier) {
        this.userInput = mathInput;
        const match = environment.match(/([+-]?)([+-]?)/);
        this.environment = { X: match?.[1] ?? "+", Y: match?.[2] ?? "+" };
        this.modifier = modifier.length > 0 ? getUsableDegrees(Number(modifier)) : 0;
        this.axis = new Axis().universal(this.userInput);
        if (!this.axis.polarAngle)
            this.axis.cartesianToPolar();
        this.vecInfo.addDebugInfo("axis", this.axis);
        this.addResult();
        this.addGraph();
    }
    addResult() {
        if (this.userInput.includes(":"))
            this.result = `x = ${this.axis.cartesianX}\\quad,y = ${this.axis.cartesianY}`;
        else
            this.result = `angle = ${this.axis.polarAngle}\\quad,length = ${this.axis.polarLength}`;
    }
    addGraph() {
        const targetSize = 10;
        const maxComponent = Math.max(Math.abs(this.axis.cartesianX), Math.abs(this.axis.cartesianY));
        // Determine scaling factor
        let scale = 1;
        if (maxComponent < targetSize) {
            scale = targetSize / maxComponent;
        }
        else if (maxComponent > targetSize) {
            scale = targetSize / maxComponent;
        }
        // i need to make it "to X axis"
        //const vectorAngle = getUsableDegrees(radiansToDegrees(Math.atan2(scaledY, scaledX)));
        const ancer = new Axis(0, 0);
        // const draw= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.polarLength.toString()}),this.axis];
        //const drawX= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.cartesianX.toString()}),new Axis(this.axis.cartesianX,0)];
        //const drawY= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.cartesianY.toString()}),new Axis(0,this.axis.cartesianY)];
        this.graph = [
        //new Formatting("globol",{color: "white",scale: 1,}),
        //new Draw({drawArr: draw,formattingObj: {lineWidth: 1,draw: "red",arror: "-{Stealth}"}}),
        //new Draw({drawArr: drawX,formattingObj: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"}}),
        //new Draw({drawArr: drawY,formattingObj: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"}}),
        ];
        this.vecInfo.addDebugInfo("this.graph", JSON.stringify(this.graph.tokens, null, 1));
        this.vecInfo.addDebugInfo("this.graph.toString()\n", JSON.stringify(this.graph.toString()));
        /* Generate LaTeX code for vector components and main vector
        const t = String.raw`
    
          % Angle Annotation
          %\ang{X}{anc}{vec}{}{${roundBySettings(vectorAngle)}$^{\circ}$}
        `.replace(/^\s+/gm, "");*/
        this.vecInfo.addDebugInfo("Scaling factor", scale);
    }
}
class tikzGraph extends Modal {
    tikz;
    constructor(app, tikzCode) {
        super(app);
        this.tikz = new FormatTikzjax(tikzCode);
    }
    onOpen() {
        const { contentEl } = this;
        const code = this.tikz;
        const script = contentEl.createEl("script");
        script.setAttribute("type", "text/tikz");
        script.setAttribute("data-show-console", "true");
        script.setText(code.getCode());
        const actionButton = contentEl.createEl("button", { text: "Copy graph", cls: "info-modal-Copy-button" });
        actionButton.addEventListener("click", () => {
            navigator.clipboard.writeText(this.tikz.getCode());
            new Notice("Graph copied to clipboard!");
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
class Distribution {
    type;
    x;
    mu;
    sigma;
    variance;
    // For Binomial Distribution
    trials;
    probability;
    // For Poisson Distribution
    lambda;
}
class DistributionModel extends Modal {
    n;
    k;
    p;
    equal = 0;
    less = 0;
    lessEqual = 0;
    big = 0;
    bigEqual = 0;
    constructor(app, source) {
        super(app);
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
class BinomInfoModel extends Modal {
    n;
    k;
    p;
    equal = 0;
    less = 0;
    lessEqual = 0;
    big = 0;
    bigEqual = 0;
    constructor(app, source) {
        super(app);
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
function testMathEngine() {
    const expressions = [
        { expression: String.raw `2 \frac{(5-3)34}{\sqrt{2^{2}}}0.5`, expectedOutput: '34' },
        { expression: String.raw `(x+1)(x+3)=2`, expectedOutput: 'x_1=-0.26795,x_2=-3.73205' },
        { expression: String.raw `\frac{132}{1260+x^{2}}=0.05`, expectedOutput: 'x_1=-37.14835,x_2=37.14835' },
    ];
    const results = [];
    try {
        expressions.forEach(expression => {
            const math = new MathPraiser(expression.expression);
            if (math.solution !== expression.expectedOutput) {
                results.push({ expression: expression.expression, expectedOutput: expression.expectedOutput, actualOutput: math.solution });
            }
        });
    }
    catch (e) {
        console.log(e);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQUMsT0FBTyxFQUFPLEtBQUssRUFBRSxTQUFTLEVBQVUsTUFBTSxFQUFrQixXQUFXLEVBQUMsVUFBVSxFQUE2RyxNQUFNLFVBQVUsQ0FBQztBQUVyUCxPQUFPLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDdkQsT0FBTyxFQUE4QyxhQUFhLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDbkYsT0FBTyxFQUEyQixnQkFBZ0IsRUFBd0IseUJBQXlCLEVBQUMsTUFBTSxxQkFBcUIsQ0FBQztBQUNoSSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsY0FBYyxFQUFvQixxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBc0MsZUFBZSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDcEssT0FBTyxFQUFFLElBQUksRUFBZ0MsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRzlDLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLHFCQUFxQixFQUFFLCtCQUErQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUssT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTVDLE9BQU8sRUFBRSxp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LElBQUksQ0FBQyxRQUFRLElBQUksV0FBVyxDQUFDO1FBQ2hELENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUFPRCxTQUFTLGNBQWM7SUFDckIsTUFBTSxXQUFXLEdBQUM7UUFDaEIsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSxtQ0FBbUMsRUFBQyxjQUFjLEVBQUUsSUFBSSxFQUFDO1FBQ2hGLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsY0FBYyxFQUFDLGNBQWMsRUFBRSwyQkFBMkIsRUFBQztRQUNsRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLDZCQUE2QixFQUFDLGNBQWMsRUFBRSw0QkFBNEIsRUFBQztLQUNuRyxDQUFBO0lBQ0QsTUFBTSxPQUFPLEdBQUMsRUFBRSxDQUFBO0lBQ2hCLElBQUcsQ0FBQztRQUNGLFdBQVcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxJQUFJLEdBQUMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2xELElBQUksSUFBSSxDQUFDLFFBQVEsS0FBRyxVQUFVLENBQUMsY0FBYyxFQUFDLENBQUM7Z0JBQzdDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsRUFBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsRUFBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBQyxDQUFDLENBQUE7WUFDekgsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU0sQ0FBQyxFQUFDLENBQUM7UUFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ2hCLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtQbHVnaW4sIE1hcmtkb3duUmVuZGVyZXIsYWRkSWNvbiwgQXBwLCBNb2RhbCwgQ29tcG9uZW50LCBTZXR0aW5nLE5vdGljZSwgV29ya3NwYWNlV2luZG93LGxvYWRNYXRoSmF4LHJlbmRlck1hdGgsIE1hcmtkb3duVmlldywgRWRpdG9yU3VnZ2VzdCwgRWRpdG9yU3VnZ2VzdFRyaWdnZXJJbmZvLCBFZGl0b3JQb3NpdGlvbiwgRWRpdG9yLCBURmlsZSwgRWRpdG9yU3VnZ2VzdENvbnRleHR9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5cclxuaW1wb3J0IHsgTWF0aEluZm8sIE1hdGhQcmFpc2VyIH0gZnJvbSBcIi4vbWF0aEVuZ2luZS5qc1wiO1xyXG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcclxuaW1wb3J0IHsgQ3VzdG9tSW5wdXRNb2RhbCwgSGlzdG9yeU1vZGFsLCBJbnB1dE1vZGFsLCBWZWNJbnB1dE1vZGVsIH0gZnJvbSBcIi4vdGVtcFwiO1xyXG5pbXBvcnQge0xhdGV4U3VpdGVQbHVnaW5TZXR0aW5ncywgREVGQVVMVF9TRVRUSU5HUywgTGF0ZXhTdWl0ZUNNU2V0dGluZ3MsIHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3N9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzXCI7XHJcbmltcG9ydCB7IExhdGV4U3VpdGVTZXR0aW5nVGFiIH0gZnJvbSBcIi4vc2V0dGluZ3Mvc2V0dGluZ3NfdGFiXCI7XHJcbmltcG9ydCB7IGNhbGN1bGF0ZUJpbm9tLCBkZWdyZWVzVG9SYWRpYW5zLCBmaW5kQW5nbGVCeUNvc2luZVJ1bGUsIGdldFVzYWJsZURlZ3JlZXMsIHBvbGFyVG9DYXJ0ZXNpYW4sIHJhZGlhbnNUb0RlZ3JlZXMsIHJvdW5kQnlTZXR0aW5ncyB9IGZyb20gXCIuL21hdGhVdGlsaXRpZXMuanNcIjtcclxuaW1wb3J0IHsgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0dGluZywgVGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyBTdWdnZXN0b3IgfSBmcm9tIFwiLi9zdWdnZXN0b3IuanNcIjtcclxuaW1wb3J0IHsgVGlrelN2ZyB9IGZyb20gXCIuL3Rpa3pqYXgvbXlUaWt6LmpzXCI7XHJcblxyXG5pbXBvcnQge0V4dGVuc2lvbiwgRWRpdG9yU3RhdGUsIFNlbGVjdGlvblJhbmdlLFJhbmdlU2V0LCBQcmVjIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XHJcbmltcG9ydCB7IEZvcm1hdFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L2ludGVycHJldC90b2tlbml6ZVRpa3pqYXguanNcIjtcclxuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucyB9IGZyb20gXCIuL3NldEVkaXRvckV4dGVuc2lvbnMuanNcIjtcclxuXHJcbmltcG9ydCB7IG9uRmlsZUNyZWF0ZSwgb25GaWxlQ2hhbmdlLCBvbkZpbGVEZWxldGUsIGdldFNuaXBwZXRzRnJvbUZpbGVzLCBnZXRGaWxlU2V0cywgZ2V0VmFyaWFibGVzRnJvbUZpbGVzLCB0cnlHZXRWYXJpYWJsZXNGcm9tVW5rbm93bkZpbGVzIH0gZnJvbSBcIi4vc2V0dGluZ3MvZmlsZV93YXRjaFwiO1xyXG5pbXBvcnQgeyBJQ09OUyB9IGZyb20gXCIuL3NldHRpbmdzL3VpL2ljb25zXCI7XHJcblxyXG5pbXBvcnQgeyBnZXRFZGl0b3JDb21tYW5kcyB9IGZyb20gXCIuL2ZlYXR1cmVzL2VkaXRvcl9jb21tYW5kc1wiO1xyXG5pbXBvcnQgeyBTbmlwcGV0VmFyaWFibGVzLCBwYXJzZVNuaXBwZXRWYXJpYWJsZXMsIHBhcnNlU25pcHBldHMgfSBmcm9tIFwiLi9zbmlwcGV0cy9wYXJzZVwiO1xyXG5cclxuXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNb3NoZSBleHRlbmRzIFBsdWdpbiB7XHJcbiAgc2V0dGluZ3M6IExhdGV4U3VpdGVQbHVnaW5TZXR0aW5ncztcclxuXHRDTVNldHRpbmdzOiBMYXRleFN1aXRlQ01TZXR0aW5ncztcclxuXHRlZGl0b3JFeHRlbnNpb25zOiBFeHRlbnNpb25bXSA9IFtdO1xyXG4gIHRpa3pQcm9jZXNzb3I6IFRpa3pqYXhcclxuICBlZGl0b3JFeHRlbnNpb25zMjogRWRpdG9yRXh0ZW5zaW9ucz0gbmV3IEVkaXRvckV4dGVuc2lvbnMoKTtcclxuXHJcbiAgYXN5bmMgb25sb2FkKCkge1xyXG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcclxuXHJcblx0XHR0aGlzLmxvYWRJY29ucygpO1xyXG5cdFx0dGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBMYXRleFN1aXRlU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG5cdFx0bG9hZE1hdGhKYXgoKTtcclxuXHJcblx0XHQvLyBSZWdpc3RlciBMYXRleCBTdWl0ZSBleHRlbnNpb25zIGFuZCBvcHRpb25hbCBlZGl0b3IgZXh0ZW5zaW9ucyBmb3IgZWRpdG9yIGVuaGFuY2VtZW50c1xyXG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbih0aGlzLmVkaXRvckV4dGVuc2lvbnMpO1xyXG5cclxuXHRcdC8vIFdhdGNoIGZvciBjaGFuZ2VzIHRvIHRoZSBzbmlwcGV0IHZhcmlhYmxlcyBhbmQgc25pcHBldHMgZmlsZXNcclxuXHRcdHRoaXMud2F0Y2hGaWxlcygpO1xyXG5cclxuXHRcdHRoaXMuYWRkRWRpdG9yQ29tbWFuZHMoKTtcclxuICAgIHRoaXMudGlrelByb2Nlc3Nvcj1uZXcgVGlrempheCh0aGlzLmFwcCx0aGlzKVxyXG4gICAgdGhpcy50aWt6UHJvY2Vzc29yLnJlYWR5TGF5b3V0KCk7XHJcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IuYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCk7XHJcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IucmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCk7XHJcbiAgICBcclxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTGF0ZXhTdWl0ZVNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcIm1hdGgtZW5naW5lXCIsIHRoaXMucHJvY2Vzc01hdGhCbG9jay5iaW5kKHRoaXMpKTtcclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pqYXhcIiwgdGhpcy5wcm9jZXNzVGlrekJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3RlckNvbW1hbmRzKCk7XHJcbiAgICBcclxuICAgIFxyXG4gICAgLy90aGlzLnJlZ2lzdGVyRWRpdG9yU3VnZ2VzdChuZXcgTnVtZXJhbHNTdWdnZXN0b3IodGhpcykpO1xyXG4gICAgXHJcbiAgfVxyXG5cclxuICBhZGRFZGl0b3JDb21tYW5kcygpIHtcclxuXHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBnZXRFZGl0b3JDb21tYW5kcyh0aGlzKSkge1xyXG5cdFx0XHR0aGlzLmFkZENvbW1hbmQoY29tbWFuZCk7XHJcblx0XHR9XHJcblx0fVxyXG4gIG9udW5sb2FkKCkge1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XHJcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IucmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCk7XHJcblx0fVxyXG5cclxuICBhc3luYyBnZXRTZXR0aW5nc1NuaXBwZXRzKHNuaXBwZXRWYXJpYWJsZXM6IFNuaXBwZXRWYXJpYWJsZXMpIHtcclxuXHRcdHRyeSB7XHJcblx0XHRcdHJldHVybiBhd2FpdCBwYXJzZVNuaXBwZXRzKHRoaXMuc2V0dGluZ3Muc25pcHBldHMsIHNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRuZXcgTm90aWNlKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0cyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XHJcblx0XHRcdGNvbnNvbGUubG9nKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0cyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XHJcblx0XHRcdHJldHVybiBbXTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG4gIHByb2Nlc3NUaWt6QmxvY2soc291cmNlOiBzdHJpbmcsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICBjb25zdCBzdmcgPSBuZXcgVGlrelN2Zyhzb3VyY2UpO1xyXG4gIFxyXG4gIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiKSwge1xyXG4gICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxyXG4gICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxyXG4gIH0pO1xyXG4gIFxyXG5cclxuICBjb25zdCBncmFwaCA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgc3R5bGU6IFwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCJcclxuICB9KTtcclxuICBncmFwaC5hcHBlbmRDaGlsZChzdmcuZ2V0U3ZnKCkpO1xyXG4gIHN2Zy5kZWJ1Z0luZm8rPWdyYXBoLm91dGVySFRNTFxyXG4gIC8vY29uc29sZS5sb2coZ3JhcGgub3V0ZXJIVE1MKVxyXG4gIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCBzdmcuZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgXHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xyXG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmFwaCk7XHJcbn1cclxuXHJcbmxvYWRJY29ucygpIHtcclxuICBmb3IgKGNvbnN0IFtpY29uSWQsIHN2Z0NvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKElDT05TKSkge1xyXG4gICAgYWRkSWNvbihpY29uSWQsIHN2Z0NvbnRlbnQpO1xyXG4gIH1cclxufVxyXG5hc3luYyBsb2FkU2V0dGluZ3MoKSB7XHJcbiAgbGV0IGRhdGEgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XHJcblxyXG4gIC8vIE1pZ3JhdGUgc2V0dGluZ3MgZnJvbSB2MS44LjAgLSB2MS44LjRcclxuICBjb25zdCBzaG91bGRNaWdyYXRlU2V0dGluZ3MgPSBkYXRhID8gXCJiYXNpY1NldHRpbmdzXCIgaW4gZGF0YSA6IGZhbHNlO1xyXG5cclxuICAvLyBAdHMtaWdub3JlXHJcbiAgZnVuY3Rpb24gbWlncmF0ZVNldHRpbmdzKG9sZFNldHRpbmdzKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAuLi5vbGRTZXR0aW5ncy5iYXNpY1NldHRpbmdzLFxyXG4gICAgICAuLi5vbGRTZXR0aW5ncy5yYXdTZXR0aW5ncyxcclxuICAgICAgc25pcHBldHM6IG9sZFNldHRpbmdzLnNuaXBwZXRzLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGlmIChzaG91bGRNaWdyYXRlU2V0dGluZ3MpIHtcclxuICAgIGRhdGEgPSBtaWdyYXRlU2V0dGluZ3MoZGF0YSk7XHJcbiAgfVxyXG5cclxuICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgZGF0YSk7XHJcblxyXG5cclxuICBpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSB8fCB0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpIHtcclxuICAgIGNvbnN0IHRlbXBTbmlwcGV0VmFyaWFibGVzID0gYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRWYXJpYWJsZXMoKTtcclxuICAgIGNvbnN0IHRlbXBTbmlwcGV0cyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyh0ZW1wU25pcHBldFZhcmlhYmxlcyk7XHJcblxyXG4gICAgdGhpcy5DTVNldHRpbmdzID0gcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5ncyh0ZW1wU25pcHBldHMsIHRoaXMuc2V0dGluZ3MpO1xyXG5cclxuICAgIC8vIFVzZSBvbkxheW91dFJlYWR5IHNvIHRoYXQgd2UgZG9uJ3QgdHJ5IHRvIHJlYWQgdGhlIHNuaXBwZXRzIGZpbGUgdG9vIGVhcmx5XHJcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XHJcbiAgICAgIHRoaXMucHJvY2Vzc1NldHRpbmdzKCk7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3NTZXR0aW5ncygpO1xyXG4gIH1cclxufVxyXG5cclxuICBhc3luYyBzYXZlU2V0dGluZ3MoZGlkRmlsZUxvY2F0aW9uQ2hhbmdlID0gZmFsc2UpIHtcclxuXHRcdGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcblx0XHR0aGlzLnByb2Nlc3NTZXR0aW5ncyhkaWRGaWxlTG9jYXRpb25DaGFuZ2UpO1xyXG5cdH1cclxuXHJcbiAgYXN5bmMgcHJvY2Vzc1NldHRpbmdzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID0gZmFsc2UsIGJlY2F1c2VGaWxlVXBkYXRlZCA9IGZhbHNlKSB7XHJcblx0XHR0aGlzLkNNU2V0dGluZ3MgPSBwcm9jZXNzTGF0ZXhTdWl0ZVNldHRpbmdzKGF3YWl0IHRoaXMuZ2V0U25pcHBldHMoYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQsIGJlY2F1c2VGaWxlVXBkYXRlZCksIHRoaXMuc2V0dGluZ3MpO1xyXG4gICAgdGhpcy5lZGl0b3JFeHRlbnNpb25zMi5zZXRFZGl0b3JFeHRlbnNpb25zKHRoaXMpXHJcbiAgICAvL3RoaXMuc2V0RWRpdG9yRXh0ZW5zaW9ucygpO1xyXG5cdFx0dGhpcy5hcHAud29ya3NwYWNlLnVwZGF0ZU9wdGlvbnMoKTtcclxuXHR9XHJcbiAgXHJcbiAgYXN5bmMgZ2V0U2V0dGluZ3NTbmlwcGV0VmFyaWFibGVzKCkge1xyXG5cdFx0dHJ5IHtcclxuXHRcdFx0cmV0dXJuIGF3YWl0IHBhcnNlU25pcHBldFZhcmlhYmxlcyh0aGlzLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRuZXcgTm90aWNlKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XHJcblx0XHRcdGNvbnNvbGUubG9nKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XHJcblx0XHRcdHJldHVybiB7fTtcclxuXHRcdH1cclxuXHR9XHJcbiAgYXN5bmMgZ2V0U25pcHBldHMoYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQ6IGJvb2xlYW4sIGJlY2F1c2VGaWxlVXBkYXRlZDogYm9vbGVhbikge1xyXG5cdFx0Ly8gR2V0IGZpbGVzIGluIHNuaXBwZXQvdmFyaWFibGUgZm9sZGVycy5cclxuXHRcdC8vIElmIGVpdGhlciBpcyBzZXQgdG8gYmUgbG9hZGVkIGZyb20gc2V0dGluZ3MgdGhlIHNldCB3aWxsIGp1c3QgYmUgZW1wdHkuXHJcblx0XHRjb25zdCBmaWxlcyA9IGdldEZpbGVTZXRzKHRoaXMpO1xyXG5cclxuXHRcdGNvbnN0IHNuaXBwZXRWYXJpYWJsZXMgPVxyXG5cdFx0XHR0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGVcclxuXHRcdFx0XHQ/IGF3YWl0IGdldFZhcmlhYmxlc0Zyb21GaWxlcyh0aGlzLCBmaWxlcylcclxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0VmFyaWFibGVzKCk7XHJcblxyXG5cdFx0Ly8gVGhpcyBtdXN0IGJlIGRvbmUgaW4gZWl0aGVyIGNhc2UsIGJlY2F1c2UgaXQgYWxzbyB1cGRhdGVzIHRoZSBzZXQgb2Ygc25pcHBldCBmaWxlc1xyXG5cdFx0Y29uc3QgdW5rbm93bkZpbGVWYXJpYWJsZXMgPSBhd2FpdCB0cnlHZXRWYXJpYWJsZXNGcm9tVW5rbm93bkZpbGVzKHRoaXMsIGZpbGVzKTtcclxuXHRcdGlmICh0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpIHtcclxuXHRcdFx0Ly8gQnV0IHdlIG9ubHkgdXNlIHRoZSB2YWx1ZXMgaWYgdGhlIHVzZXIgd2FudHMgdGhlbVxyXG5cdFx0XHRPYmplY3QuYXNzaWduKHNuaXBwZXRWYXJpYWJsZXMsIHVua25vd25GaWxlVmFyaWFibGVzKTtcclxuXHRcdH1cclxuXHJcblx0XHRjb25zdCBzbmlwcGV0cyA9XHJcblx0XHRcdHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGVcclxuXHRcdFx0XHQ/IGF3YWl0IGdldFNuaXBwZXRzRnJvbUZpbGVzKHRoaXMsIGZpbGVzLCBzbmlwcGV0VmFyaWFibGVzKVxyXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRzKHNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cdFx0dGhpcy5zaG93U25pcHBldHNMb2FkZWROb3RpY2Uoc25pcHBldHMubGVuZ3RoLCBPYmplY3Qua2V5cyhzbmlwcGV0VmFyaWFibGVzKS5sZW5ndGgsICBiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCwgYmVjYXVzZUZpbGVVcGRhdGVkKTtcclxuXHJcblx0XHRyZXR1cm4gc25pcHBldHM7XHJcblx0fVxyXG4gIHNob3dTbmlwcGV0c0xvYWRlZE5vdGljZShuU25pcHBldHM6IG51bWJlciwgblNuaXBwZXRWYXJpYWJsZXM6IG51bWJlciwgYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQ6IGJvb2xlYW4sIGJlY2F1c2VGaWxlVXBkYXRlZDogYm9vbGVhbikge1xyXG5cdFx0aWYgKCEoYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQgfHwgYmVjYXVzZUZpbGVVcGRhdGVkKSlcclxuXHRcdFx0cmV0dXJuO1xyXG5cclxuXHRcdGNvbnN0IHByZWZpeCA9IGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID8gXCJMb2FkZWQgXCIgOiBcIlN1Y2Nlc3NmdWxseSByZWxvYWRlZCBcIjtcclxuXHRcdGNvbnN0IGJvZHkgPSBbXTtcclxuXHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSlcclxuXHRcdFx0Ym9keS5wdXNoKGAke25TbmlwcGV0c30gc25pcHBldHNgKTtcclxuXHRcdGlmICh0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpXHJcblx0XHRcdGJvZHkucHVzaChgJHtuU25pcHBldFZhcmlhYmxlc30gc25pcHBldCB2YXJpYWJsZXNgKTtcclxuXHJcblx0XHRjb25zdCBzdWZmaXggPSBcIiBmcm9tIGZpbGVzLlwiO1xyXG5cdFx0bmV3IE5vdGljZShwcmVmaXggKyBib2R5LmpvaW4oXCIgYW5kIFwiKSArIHN1ZmZpeCwgNTAwMCk7XHJcblx0fVxyXG4gIHByaXZhdGUgcmVnaXN0ZXJDb21tYW5kcygpIHtcclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiBcIm9wZW4taW5wdXQtZm9ybVwiLFxyXG4gICAgICBuYW1lOiBcIk9wZW4gSW5wdXQgRm9ybVwiLFxyXG4gICAgICBjYWxsYmFjazogKCkgPT4gbmV3IFZlY0lucHV0TW9kZWwodGhpcy5hcHAsdGhpcykub3BlbigpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwidmlldy1zZXNzaW9uLWhpc3RvcnlcIixcclxuICAgICAgbmFtZTogXCJWaWV3IFNlc3Npb24gSGlzdG9yeVwiLFxyXG4gICAgICAvL2NhbGxiYWNrOiAoKSA9PiBuZXcgSGlzdG9yeU1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCksXHJcbiAgICB9KTtcclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiBcInRlc3QtbWF0aEVuZ2luZVwiLFxyXG4gICAgICBuYW1lOiBcInRlc3QgbWF0aCBlbmdpbmVcIixcclxuICAgICAgY2FsbGJhY2s6ICgpID0+dGVzdE1hdGhFbmdpbmUoKSxcclxuICAgIH0pO1xyXG4gIH1cclxuICB3YXRjaEZpbGVzKCkge1xyXG5cdFx0Ly8gT25seSBiZWdpbiB3YXRjaGluZyBmaWxlcyBvbmNlIHRoZSBsYXlvdXQgaXMgcmVhZHlcclxuXHRcdC8vIE90aGVyd2lzZSwgd2UnbGwgYmUgdW5uZWNlc3NhcmlseSByZWFjdGluZyB0byBtYW55IG9uRmlsZUNyZWF0ZSBldmVudHMgb2Ygc25pcHBldCBmaWxlc1xyXG5cdFx0Ly8gdGhhdCBvY2N1ciB3aGVuIE9ic2lkaWFuIGZpcnN0IGxvYWRzXHJcblxyXG5cdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xyXG5cclxuXHRcdFx0Y29uc3QgZXZlbnRzQW5kQ2FsbGJhY2tzID0ge1xyXG5cdFx0XHRcdFwibW9kaWZ5XCI6IG9uRmlsZUNoYW5nZSxcclxuXHRcdFx0XHRcImRlbGV0ZVwiOiBvbkZpbGVEZWxldGUsXHJcblx0XHRcdFx0XCJjcmVhdGVcIjogb25GaWxlQ3JlYXRlXHJcblx0XHRcdH07XHJcblxyXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhldmVudHNBbmRDYWxsYmFja3MpKSB7XHJcblx0XHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxyXG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihrZXksIChmaWxlKSA9PiB2YWx1ZSh0aGlzLCBmaWxlKSkpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG4gIHByaXZhdGUgcHJvY2Vzc01hdGhCbG9jayhzb3VyY2U6IHN0cmluZywgbWFpbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgIG1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtY29udGFpbmVyXCIpO1xyXG4gICAgXHJcbiAgICBjb25zdCB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgICBsZXQgc2tpcHBlZEluZGV4ZXMgPSAwO1xyXG5cclxuICAgIGNvbnN0IGV4cHJlc3Npb25zID0gc291cmNlLnNwbGl0KFwiXFxuXCIpLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKS5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuICAgIGlmIChleHByZXNzaW9ucy5sZW5ndGggPT09IDApIHtyZXR1cm47fVxyXG5cclxuICAgIFxyXG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaCgoZXhwcmVzc2lvbiwgaW5kZXgpID0+IHtcclxuICAgICAgbGV0IGxpbmVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgbGluZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1saW5lLWNvbnRhaW5lclwiLCAoaW5kZXgtc2tpcHBlZEluZGV4ZXMpICUgMiA9PT0gMCA/IFwibWF0aC1yb3ctZXZlblwiIDogXCJtYXRoLXJvdy1vZGRcIik7XHJcbiAgICAgIC8vaWYgKGV4cHJlc3Npb24ubWF0Y2goL15cXC9cXC8vKSl7fVxyXG4gICAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xyXG4gICAgICBwcm9jZXNzTWF0aC5pbml0aWFsaXplKCk7XHJcblxyXG4gICAgICBpZihwcm9jZXNzTWF0aC5tb2RlIT09XCJ2YXJpYWJsZVwiKXtcclxuICAgICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xyXG4gICAgICAgIG1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgUHJvY2Vzc01hdGgge1xyXG4gIG1hdGhJbnB1dDogYW55O1xyXG4gIHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcclxuICBtb2RlID0gXCJtYXRoXCI7XHJcbiAgcmVzdWx0OiBhbnk7XHJcbiAgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcclxuICBpY29uc0RpdjogSFRNTEVsZW1lbnQ7XHJcbiAgYXBwOiBBcHA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKG1hdGhJbnB1dDogc3RyaW5nLHVzZXJWYXJpYWJsZXM6IGFueSwgYXBwOiBBcHAsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcclxuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xyXG4gICAgdGhpcy51c2VyVmFyaWFibGVzPXVzZXJWYXJpYWJsZXM7XHJcbiAgICB0aGlzLmFwcCA9IGFwcDtcclxuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xyXG4gICAgdGhpcy5pY29uc0RpdiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pY29uc1wiLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBpbml0aWFsaXplKCkge1xyXG4gICAgdGhpcy5hc3NpZ25Nb2RlKCk7XHJcbiAgICB0aGlzLnNldHVwQ29udGFpbmVyKCk7XHJcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xyXG4gICAgdGhpcy5yZW5kZXJNYXRoKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNldHVwQ29udGFpbmVyKCkge1xyXG4gICAgW1wibWF0aC1pbnB1dFwiLCBcIm1hdGgtcmVzdWx0XCJdLmZvckVhY2goY2xhc3NOYW1lID0+IHtcclxuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgZGl2LmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcclxuICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcclxuICAgIH0pO1xyXG4gICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pY29uc0Rpdik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlbmRlck1hdGgoKSB7XHJcbiAgICBjb25zdCBpbnB1dERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1pbnB1dFwiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB0cnkge1xyXG4gICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBiaW5vbU1vZGVsID0gbmV3IEJpbm9tSW5mb01vZGVsKHRoaXMuYXBwLCB0aGlzLm1hdGhJbnB1dCk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gYmlub21Nb2RlbC5nZXRFcXVhbCgpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBbICwgc2lkZUEsIHNpZGVCLCBzaWRlQyBdID0gdGhpcy5tYXRoSW5wdXQubWFwKE51bWJlcik7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9bmV3IFZlY1Byb2Nlc3Nvcih0aGlzLm1hdGhJbnB1dFsxXSx0aGlzLm1hdGhJbnB1dFsyXSx0aGlzLm1hdGhJbnB1dFszXSk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgdGlrekdyYXBoKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5ncmFwaCkpO1xyXG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9dGhpcy5yZXN1bHQucmVzdWx0XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gbmV3IE1hdGhQcmFpc2VyKHRoaXMubWF0aElucHV0KTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5tYXRoSW5wdXQ9dGhpcy5yZXN1bHQuaW5wdXQ7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IHRoaXMucmVzdWx0LnNvbHV0aW9uO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICB0aGlzLmFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2LCByZXN1bHREaXYsIHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCI/dGhpcy5tYXRoSW5wdXQ6dGhpcy5tYXRoSW5wdXRbMF0sIHJvdW5kQnlTZXR0aW5ncyh0aGlzLnJlc3VsdCkpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIHRoaXMuZGlzcGxheUVycm9yKGlucHV0RGl2LCByZXN1bHREaXYsIGVycik7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaGUgaW5pdGlhbCBwcmFpc2luZyBmYWlsZWRcIixlcnIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGlucHV0OiBzdHJpbmcsIHJlc3VsdDogYW55KSB7XHJcbiAgICBpbnB1dERpdi5hcHBlbmRDaGlsZChyZW5kZXJNYXRoKGlucHV0LHRydWUpKVxyXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCR7JHtpbnB1dH19JGAsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gICAgLy9jb25zdCByZXN1bHRPdXRwdXQgPSAvKHRydWV8ZmFsc2UpLy50ZXN0KHJlc3VsdCkgPyByZXN1bHQgOiBgXFwkeyR7cmVzdWx0fX0kYDtcclxuICAgIHJlc3VsdERpdi5hcHBlbmRDaGlsZChyZW5kZXJNYXRoKHJlc3VsdC50b1N0cmluZygpLHRydWUpKVxyXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHJlc3VsdE91dHB1dCwgcmVzdWx0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBkaXNwbGF5RXJyb3IoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBlcnI6IEVycm9yKSB7XHJcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHRoaXMubWF0aElucHV0LCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+JHtlcnIubWVzc2FnZX08L3NwYW4+YDtcclxuICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWVycm9yLWxpbmVcIik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzc2lnbk1vZGUoKSB7XHJcbiAgICBjb25zdCByZWdleExpc3QgPSBHZXRNYXRoQ29udGV4dFJlZ2V4KCk7XHJcbiAgICBjb25zdCBtYXRjaE9iamVjdCA9IHJlZ2V4TGlzdC5maW5kKHJlZ2V4T2JqID0+IHJlZ2V4T2JqLnJlZ2V4LnRlc3QodGhpcy5tYXRoSW5wdXQpKTtcclxuICAgIGlmIChtYXRjaE9iamVjdCkge1xyXG4gICAgICB0aGlzLm1vZGUgPSBtYXRjaE9iamVjdC52YWx1ZTtcclxuICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5tYXRjaChtYXRjaE9iamVjdC5yZWdleCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZEluZm9Nb2RhbChtb2RhbDogYW55KSB7XHJcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWluZm8taWNvblwiLFxyXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgICB9KTtcclxuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcclxuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZERlYnVnTW9kZWwobW9kYWw6IGFueSkge1xyXG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICAgIHRleHRDb250ZW50OiBcIvCfkJ5cIixcclxuICAgIH0pO1xyXG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xyXG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVzKCkge1xyXG4gICAgaWYgKHRoaXMubW9kZT09PVwidmFyaWFibGVcIikge1xyXG4gICAgICB0aGlzLmhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMucmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCkge1xyXG4gICAgY29uc3QgW18sdmFyaWFibGUsIHZhbHVlXSA9IHRoaXMubWF0aElucHV0Lm1hcCgocGFydDogc3RyaW5nKSA9PiBwYXJ0LnRyaW0oKSk7XHJcbiAgICBpZiAoIXZhcmlhYmxlIHx8ICF2YWx1ZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYEludmFsaWQgdmFyaWFibGUgZGVjbGFyYXRpb246ICR7dGhpcy5tYXRoSW5wdXR9YCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGV4aXN0aW5nVmFySW5kZXggPSB0aGlzLnVzZXJWYXJpYWJsZXMuZmluZEluZGV4KHYgPT4gdi52YXJpYWJsZSA9PT0gdmFyaWFibGUpO1xyXG4gICAgaWYgKGV4aXN0aW5nVmFySW5kZXggIT09IC0xKSB7XHJcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlc1tleGlzdGluZ1ZhckluZGV4XS52YWx1ZSA9IHZhbHVlO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy51c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZSwgdmFsdWUgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKXtcclxuICAgIHRoaXMudXNlclZhcmlhYmxlcy5mb3JFYWNoKCh7IHZhcmlhYmxlLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0LnJlcGxhY2UodmFyaWFibGUsIHZhbHVlKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gR2V0TWF0aENvbnRleHRSZWdleCgpIHtcclxuICByZXR1cm4gW1xyXG4gICAgeyByZWdleDogL2Jpbm9tXFwoKFxcZCspLChcXGQrKSwoXFxkKylcXCkvLCB2YWx1ZTogXCJiaW5vbVwiIH0sXHJcbiAgICB7IHJlZ2V4OiAvdmVjKFsrLV17MCwyfSlcXCgoW1xcZC4rLV0rWzosXVtcXGQuKy1dKylcXCkoW1xcZC4rLV0qKS8sIHZhbHVlOiBcInZlY1wiIH0sXHJcbiAgICB7IHJlZ2V4OiAvY29zXFwoKFtcXGQuXSspLChbXFxkLl0rKSwoW1xcZC5dKylcXCkvLCB2YWx1ZTogXCJjb3NcIiB9LFxyXG4gICAgeyByZWdleDogL3ZhclxccyooW1xcd10rKVxccyo9XFxzKihbXFxkLl0rKS8sIHZhbHVlOiBcInZhcmlhYmxlXCIgfSxcclxuICBdO1xyXG59XHJcblxyXG5cclxuY2xhc3MgVmVjUHJvY2Vzc29yIHtcclxuICB1c2VySW5wdXQ6IGFueTtcclxuICBlbnZpcm9ubWVudDogeyBYOiBzdHJpbmc7IFk6IHN0cmluZyB9O1xyXG4gIHZlY0luZm8gPSBuZXcgTWF0aEluZm8oKTtcclxuICBheGlzOiBBeGlzO1xyXG4gIG1vZGlmaWVyOiBudW1iZXI7XHJcbiAgcmVzdWx0OiBzdHJpbmc7XHJcbiAgZ3JhcGg/OiBhbnk7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGVudmlyb25tZW50OiBzdHJpbmcsIG1hdGhJbnB1dDogc3RyaW5nLCBtb2RpZmllcjogc3RyaW5nKSB7XHJcbiAgICB0aGlzLnVzZXJJbnB1dD1tYXRoSW5wdXQ7XHJcbiAgICBjb25zdCBtYXRjaCA9IGVudmlyb25tZW50Lm1hdGNoKC8oWystXT8pKFsrLV0/KS8pO1xyXG4gICAgdGhpcy5lbnZpcm9ubWVudCA9IHsgWDogbWF0Y2g/LlsxXSA/PyBcIitcIiwgWTogbWF0Y2g/LlsyXSA/PyBcIitcIiB9O1xyXG5cclxuICAgIHRoaXMubW9kaWZpZXIgPSBtb2RpZmllci5sZW5ndGggPiAwID8gZ2V0VXNhYmxlRGVncmVlcyhOdW1iZXIobW9kaWZpZXIpKSA6IDA7XHJcblxyXG4gICAgdGhpcy5heGlzPW5ldyBBeGlzKCkudW5pdmVyc2FsKHRoaXMudXNlcklucHV0KVxyXG4gICAgaWYgKCF0aGlzLmF4aXMucG9sYXJBbmdsZSlcclxuICAgICAgdGhpcy5heGlzLmNhcnRlc2lhblRvUG9sYXIoKTtcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJheGlzXCIsdGhpcy5heGlzKTtcclxuICAgIHRoaXMuYWRkUmVzdWx0KCk7XHJcbiAgICB0aGlzLmFkZEdyYXBoKCk7XHJcbiAgfVxyXG4gIGFkZFJlc3VsdCgpe1xyXG4gICAgaWYgKHRoaXMudXNlcklucHV0LmluY2x1ZGVzKFwiOlwiKSlcclxuICAgICAgdGhpcy5yZXN1bHQ9YHggPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5YfVxcXFxxdWFkLHkgPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5ZfWBcclxuICAgIGVsc2VcclxuICAgICAgdGhpcy5yZXN1bHQ9YGFuZ2xlID0gJHt0aGlzLmF4aXMucG9sYXJBbmdsZX1cXFxccXVhZCxsZW5ndGggPSAke3RoaXMuYXhpcy5wb2xhckxlbmd0aH1gXHJcbiAgfVxyXG4gIGFkZEdyYXBoKCkge1xyXG4gICAgY29uc3QgdGFyZ2V0U2l6ZSA9IDEwO1xyXG4gICAgY29uc3QgbWF4Q29tcG9uZW50ID0gTWF0aC5tYXgoTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblgpLCBNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWSkpO1xyXG5cclxuICAgIC8vIERldGVybWluZSBzY2FsaW5nIGZhY3RvclxyXG4gICAgbGV0IHNjYWxlID0gMTtcclxuICAgIGlmIChtYXhDb21wb25lbnQgPCB0YXJnZXRTaXplKSB7XHJcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcclxuICAgIH0gZWxzZSBpZiAobWF4Q29tcG9uZW50ID4gdGFyZ2V0U2l6ZSkge1xyXG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XHJcbiAgICB9XHJcbiAgICAvLyBpIG5lZWQgdG8gbWFrZSBpdCBcInRvIFggYXhpc1wiXHJcbiAgICAvL2NvbnN0IHZlY3RvckFuZ2xlID0gZ2V0VXNhYmxlRGVncmVlcyhyYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbjIoc2NhbGVkWSwgc2NhbGVkWCkpKTtcclxuICAgIFxyXG4gICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoMCwwKTtcclxuXHJcblxyXG4gICAvLyBjb25zdCBkcmF3PSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5wb2xhckxlbmd0aC50b1N0cmluZygpfSksdGhpcy5heGlzXTtcclxuICAgIC8vY29uc3QgZHJhd1g9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblgudG9TdHJpbmcoKX0pLG5ldyBBeGlzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YLDApXTtcclxuICAgIC8vY29uc3QgZHJhd1k9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblkudG9TdHJpbmcoKX0pLG5ldyBBeGlzKDAsdGhpcy5heGlzLmNhcnRlc2lhblkpXTtcclxuXHJcbiAgICB0aGlzLmdyYXBoPVtcclxuICAgICAgLy9uZXcgRm9ybWF0dGluZyhcImdsb2JvbFwiLHtjb2xvcjogXCJ3aGl0ZVwiLHNjYWxlOiAxLH0pLFxyXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3LGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJyZWRcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXHJcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdYLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXHJcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdZLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXHJcbiAgICBdXHJcbiAgICBcclxuICAgIFxyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGhcIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRva2VucyxudWxsLDEpKTtcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoLnRvU3RyaW5nKClcXG5cIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRvU3RyaW5nKCkpKTtcclxuICAgIC8qIEdlbmVyYXRlIExhVGVYIGNvZGUgZm9yIHZlY3RvciBjb21wb25lbnRzIGFuZCBtYWluIHZlY3RvclxyXG4gICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXHJcblxyXG4gICAgICAlIEFuZ2xlIEFubm90YXRpb25cclxuICAgICAgJVxcYW5ne1h9e2FuY317dmVjfXt9eyR7cm91bmRCeVNldHRpbmdzKHZlY3RvckFuZ2xlKX0kXntcXGNpcmN9JH1cclxuICAgIGAucmVwbGFjZSgvXlxccysvZ20sIFwiXCIpOyovXHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiU2NhbGluZyBmYWN0b3JcIiwgc2NhbGUpO1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyB0aWt6R3JhcGggZXh0ZW5kcyBNb2RhbCB7XHJcbiAgdGlrejogRm9ybWF0VGlrempheDtcclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCx0aWt6Q29kZTogYW55KXtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICB0aGlzLnRpa3o9bmV3IEZvcm1hdFRpa3pqYXgodGlrekNvZGUpO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb25zdCBjb2RlPXRoaXMudGlrejtcclxuICAgIGNvbnN0IHNjcmlwdCA9IGNvbnRlbnRFbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcclxuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xyXG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcclxuICAgIHNjcmlwdC5zZXRUZXh0KGNvZGUuZ2V0Q29kZSgpKTtcclxuICAgIFxyXG4gICAgY29uc3QgYWN0aW9uQnV0dG9uID0gY29udGVudEVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJDb3B5IGdyYXBoXCIsIGNsczogXCJpbmZvLW1vZGFsLUNvcHktYnV0dG9uXCIgfSk7XHJcblxyXG4gICAgYWN0aW9uQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRoaXMudGlrei5nZXRDb2RlKCkpO1xyXG4gICAgICBuZXcgTm90aWNlKFwiR3JhcGggY29waWVkIHRvIGNsaXBib2FyZCFcIik7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgb25DbG9zZSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICBjb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuXHJcbnR5cGUgRGlzdHJpYnV0aW9uVHlwZSA9ICdub3JtYWwnIHwgJ2Jpbm9taWFsJyB8ICdwb2lzc29uJztcclxuXHJcbmNsYXNzIERpc3RyaWJ1dGlvbiB7XHJcbiAgcHJpdmF0ZSB0eXBlOiBEaXN0cmlidXRpb25UeXBlO1xyXG4gIHByaXZhdGUgeDogbnVtYmVyO1xyXG4gIHByaXZhdGUgbXU6IG51bWJlcjtcclxuICBwcml2YXRlIHNpZ21hOiBudW1iZXJcclxuICBwcml2YXRlIHZhcmlhbmNlOiBudW1iZXJcclxuXHJcbiAgXHJcblxyXG4gIC8vIEZvciBCaW5vbWlhbCBEaXN0cmlidXRpb25cclxuICBwcml2YXRlIHRyaWFsczogbnVtYmVyO1xyXG4gIHByaXZhdGUgcHJvYmFiaWxpdHk6IG51bWJlcjtcclxuXHJcbiAgLy8gRm9yIFBvaXNzb24gRGlzdHJpYnV0aW9uXHJcbiAgcHJpdmF0ZSBsYW1iZGE6IG51bWJlcjtcclxuICAvKlxyXG4gIGNvbnN0cnVjdG9yKHR5cGU6IERpc3RyaWJ1dGlvblR5cGUsIHBhcmFtczogUmVjb3JkPHN0cmluZywgbnVtYmVyPikge1xyXG4gICAgdGhpcy50eXBlID0gdHlwZTtcclxuXHJcbiAgICAvLyBJbml0aWFsaXplIGJhc2VkIG9uIGRpc3RyaWJ1dGlvbiB0eXBlXHJcbiAgICBzd2l0Y2ggKHR5cGUpIHtcclxuICAgICAgY2FzZSAnbm9ybWFsJzpcclxuICAgICAgICB0aGlzLm1lYW4gPSBwYXJhbXMubWVhbiB8fCAwO1xyXG4gICAgICAgIHRoaXMuc3RkRGV2ID0gcGFyYW1zLnN0ZERldiB8fCAxO1xyXG4gICAgICAgIHRoaXMudmFyaWFuY2UgPSB0aGlzLnN0ZERldiAqKiAyO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdiaW5vbWlhbCc6XHJcbiAgICAgICAgdGhpcy50cmlhbHMgPSBwYXJhbXMudHJpYWxzIHx8IDE7XHJcbiAgICAgICAgdGhpcy5wcm9iYWJpbGl0eSA9IHBhcmFtcy5wcm9iYWJpbGl0eSB8fCAwLjU7XHJcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy50cmlhbHMgKiB0aGlzLnByb2JhYmlsaXR5O1xyXG4gICAgICAgIHRoaXMudmFyaWFuY2UgPSB0aGlzLm1lYW4gKiAoMSAtIHRoaXMucHJvYmFiaWxpdHkpO1xyXG4gICAgICAgIHRoaXMuc3RkRGV2ID0gTWF0aC5zcXJ0KHRoaXMudmFyaWFuY2UpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdwb2lzc29uJzpcclxuICAgICAgICB0aGlzLmxhbWJkYSA9IHBhcmFtcy5sYW1iZGEgfHwgMTtcclxuICAgICAgICB0aGlzLm1lYW4gPSB0aGlzLmxhbWJkYTtcclxuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5sYW1iZGE7XHJcbiAgICAgICAgdGhpcy5zdGREZXYgPSBNYXRoLnNxcnQodGhpcy52YXJpYW5jZSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBkaXN0cmlidXRpb24gdHlwZScpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHVibGljIG5vcm1hbFBERih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ25vcm1hbCcpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XHJcbiAgICB9XHJcbiAgICBjb25zdCBleHBQYXJ0ID0gTWF0aC5leHAoLSgoeCAtIHRoaXMubWVhbikgKiogMikgLyAoMiAqIHRoaXMudmFyaWFuY2UpKTtcclxuICAgIHJldHVybiAoMSAvICh0aGlzLnN0ZERldiAqIE1hdGguc3FydCgyICogTWF0aC5QSSkpKSAqIGV4cFBhcnQ7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgbm9ybWFsQ0RGKHg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBpZiAodGhpcy50eXBlICE9PSAnbm9ybWFsJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NERiBvbmx5IGFwcGxpZXMgdG8gdGhlIE5vcm1hbCBEaXN0cmlidXRpb24nKTtcclxuICAgIH1cclxuICAgIHJldHVybiAwLjUgKiAoMSArIHRoaXMuZXJmKCh4IC0gdGhpcy5tZWFuKSAvIChNYXRoLnNxcnQoMikgKiB0aGlzLnN0ZERldikpKTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBiaW5vbWlhbFBNRih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ2Jpbm9taWFsJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BNRiBvbmx5IGFwcGxpZXMgdG8gdGhlIEJpbm9taWFsIERpc3RyaWJ1dGlvbicpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29tYmluYXRpb24gPSB0aGlzLmZhY3RvcmlhbCh0aGlzLnRyaWFscykgL1xyXG4gICAgICAodGhpcy5mYWN0b3JpYWwoeCkgKiB0aGlzLmZhY3RvcmlhbCh0aGlzLnRyaWFscyAtIHgpKTtcclxuICAgIHJldHVybiBjb21iaW5hdGlvbiAqIE1hdGgucG93KHRoaXMucHJvYmFiaWxpdHksIHgpICogTWF0aC5wb3coMSAtIHRoaXMucHJvYmFiaWxpdHksIHRoaXMudHJpYWxzIC0geCk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgcG9pc3NvblBNRih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ3BvaXNzb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignUE1GIG9ubHkgYXBwbGllcyB0byB0aGUgUG9pc3NvbiBEaXN0cmlidXRpb24nKTtcclxuICAgIH1cclxuICAgIHJldHVybiAoTWF0aC5wb3codGhpcy5sYW1iZGEsIHgpICogTWF0aC5leHAoLXRoaXMubGFtYmRhKSkgLyB0aGlzLmZhY3RvcmlhbCh4KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZXJmKHg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBjb25zdCBzaWduID0geCA8IDAgPyAtMSA6IDE7XHJcbiAgICBjb25zdCBhID0gMC4zMjc1OTExO1xyXG4gICAgY29uc3QgcCA9IDAuMjU0ODI5NTkyO1xyXG4gICAgY29uc3QgcSA9IC0wLjI4NDQ5NjczNjtcclxuICAgIGNvbnN0IHIgPSAxLjQyMTQxMzc0MTtcclxuICAgIGNvbnN0IHMgPSAtMS40NTMxNTIwMjc7XHJcbiAgICBjb25zdCB0ID0gMS4wNjE0MDU0Mjk7XHJcbiAgICBjb25zdCB1ID0gMSArIGEgKiBNYXRoLmFicyh4KTtcclxuICAgIGNvbnN0IHBvbHkgPSAoKCgoKHAgKiB1ICsgcSkgKiB1ICsgcikgKiB1ICsgcykgKiB1ICsgdCkgKiB1KTtcclxuICAgIHJldHVybiBzaWduICogKDEgLSBwb2x5ICogTWF0aC5leHAoLXggKiB4KSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGZhY3RvcmlhbChuOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKG4gPCAwKSByZXR1cm4gTmFOO1xyXG4gICAgbGV0IHJlc3VsdCA9IDE7XHJcbiAgICBmb3IgKGxldCBpID0gMjsgaSA8PSBuOyBpKyspIHJlc3VsdCAqPSBpO1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxuICB9Ki9cclxufVxyXG5cclxuXHJcbmNsYXNzIERpc3RyaWJ1dGlvbk1vZGVsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHByaXZhdGUgbjogbnVtYmVyO1xyXG4gIHByaXZhdGUgazogbnVtYmVyO1xyXG4gIHByaXZhdGUgcDogbnVtYmVyO1xyXG4gIHByaXZhdGUgZXF1YWwgPSAwO1xyXG4gIHByaXZhdGUgbGVzcyA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xyXG4gIHByaXZhdGUgYmlnID0gMDtcclxuICBwcml2YXRlIGJpZ0VxdWFsID0gMDtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcclxuICAgIHRoaXMubiA9IG47XHJcbiAgICB0aGlzLmsgPSBrO1xyXG4gICAgdGhpcy5wID0gcDtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIHRoaXMuY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpO1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPSAke3RoaXMua30pID0gJHt0aGlzLmVxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID4gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWd9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBnZXRFcXVhbCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcclxuICAgICAgY29uc3QgcHJvYmFiaWxpdHkgPSBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIGksIHRoaXMucCk7XHJcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPCB0aGlzLmspIHRoaXMubGVzcyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPD0gdGhpcy5rKSB0aGlzLmxlc3NFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+PSB0aGlzLmspIHRoaXMuYmlnRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5jbGFzcyBCaW5vbUluZm9Nb2RlbCBleHRlbmRzIE1vZGFsIHtcclxuICBwcml2YXRlIG46IG51bWJlcjtcclxuICBwcml2YXRlIGs6IG51bWJlcjtcclxuICBwcml2YXRlIHA6IG51bWJlcjtcclxuICBwcml2YXRlIGVxdWFsID0gMDtcclxuICBwcml2YXRlIGxlc3MgPSAwO1xyXG4gIHByaXZhdGUgbGVzc0VxdWFsID0gMDtcclxuICBwcml2YXRlIGJpZyA9IDA7XHJcbiAgcHJpdmF0ZSBiaWdFcXVhbCA9IDA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIGNvbnN0IFtfLCBuLCBrLCBwXSA9IHNvdXJjZS5tYXRjaCgvXFxkKy9nKSEubWFwKE51bWJlcik7XHJcbiAgICB0aGlzLm4gPSBuO1xyXG4gICAgdGhpcy5rID0gaztcclxuICAgIHRoaXMucCA9IHA7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkJpbm9taWFsIFByb2JhYmlsaXR5IFJlc3VsdHNcIiB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPCAke3RoaXMua30pID0gJHt0aGlzLmxlc3N9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+PSAke3RoaXMua30pID0gJHt0aGlzLmJpZ0VxdWFsfWAgfSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgZ2V0RXF1YWwoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIHRoaXMuaywgdGhpcy5wKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpIHtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IHByb2JhYmlsaXR5ID0gY2FsY3VsYXRlQmlub20odGhpcy5uLCBpLCB0aGlzLnApO1xyXG4gICAgICBpZiAoaSA9PT0gdGhpcy5rKSB0aGlzLmVxdWFsID0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDw9IHRoaXMuaykgdGhpcy5sZXNzRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID4gdGhpcy5rKSB0aGlzLmJpZyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiB0ZXN0TWF0aEVuZ2luZSgpe1xyXG4gIGNvbnN0IGV4cHJlc3Npb25zPVtcclxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YDIgXFxmcmFjeyg1LTMpMzR9e1xcc3FydHsyXnsyfX19MC41YCxleHBlY3RlZE91dHB1dDogJzM0J30sXHJcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2AoeCsxKSh4KzMpPTJgLGV4cGVjdGVkT3V0cHV0OiAneF8xPS0wLjI2Nzk1LHhfMj0tMy43MzIwNSd9LFxyXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgXFxmcmFjezEzMn17MTI2MCt4XnsyfX09MC4wNWAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTM3LjE0ODM1LHhfMj0zNy4xNDgzNSd9LFxyXG4gIF1cclxuICBjb25zdCByZXN1bHRzPVtdXHJcbiAgdHJ5e1xyXG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaChleHByZXNzaW9uID0+IHtcclxuICAgICAgY29uc3QgbWF0aD1uZXcgTWF0aFByYWlzZXIoZXhwcmVzc2lvbi5leHByZXNzaW9uKTtcclxuICAgICAgaWYgKG1hdGguc29sdXRpb24hPT1leHByZXNzaW9uLmV4cGVjdGVkT3V0cHV0KXtcclxuICAgICAgICByZXN1bHRzLnB1c2goe2V4cHJlc3Npb246IGV4cHJlc3Npb24uZXhwcmVzc2lvbixleHBlY3RlZE91dHB1dDogZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCxhY3R1YWxPdXRwdXQ6IG1hdGguc29sdXRpb259KVxyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcbiAgY2F0Y2goZSl7XHJcbiAgICBjb25zb2xlLmxvZyhlKVxyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuIl19