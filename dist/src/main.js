//git reset --hard
import { Plugin, MarkdownRenderer, addIcon, Modal, Component, Notice, loadMathJax, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathParser/mathEngine";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, processLatexSuiteSettings } from "./settings/settings";
import { LatexSuiteSettingTab } from "./settings/settings_tab";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees } from "src/mathParser/mathUtilities";
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
        console.log("new lod");
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
        this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
        this.registerMarkdownCodeBlockProcessor("tikzjax", this.processTikzBlock.bind(this));
        this.registerCommands();
        //this.registerEditorSuggest(new NumeralsSuggestor(this));
    }
    processMathBlock(source, mainContainer) {
        mainContainer.classList.add("math-container");
        const userVariables = [];
        let skippedIndexes = 0;
        const expressions = source.split("\n").map(line => line.replace(/[\s]+/, '').trim()).filter(line => line && !line.startsWith("//"));
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
        this.calculateMath();
    }
    setupContainer() {
        ["math-input", "math-result"].forEach(className => {
            const div = document.createElement("div");
            div.classList.add(className);
            this.container.appendChild(div);
        });
        this.container.appendChild(this.iconsDiv);
    }
    calculateMath() {
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
                    break;
            }
            this.addInputAndResultDiv(inputDiv, resultDiv, typeof this.mathInput === "string" ? this.mathInput : this.mathInput[0], this.result /*roundBySettings(this.result)*/);
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
        resultDiv.appendChild(renderMath(result.solutionToString() || "", true));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLGtCQUFrQjtBQUNsQixPQUFPLEVBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFDLE9BQU8sRUFBTyxLQUFLLEVBQUUsU0FBUyxFQUFVLE1BQU0sRUFBa0IsV0FBVyxFQUFDLFVBQVUsRUFBNkcsTUFBTSxVQUFVLENBQUM7QUFFclAsT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3ZELE9BQU8sRUFBOEMsYUFBYSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ25GLE9BQU8sRUFBMkIsZ0JBQWdCLEVBQXdCLHlCQUF5QixFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFDaEksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBb0IscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQXVELE1BQU0sOEJBQThCLENBQUM7QUFDOUssT0FBTyxFQUFFLElBQUksRUFBZ0MsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRzlDLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLHFCQUFxQixFQUFFLCtCQUErQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUssT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTVDLE9BQU8sRUFB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TUFBTSxXQUFXLEdBQUM7UUFDaEIsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSxtQ0FBbUMsRUFBQyxjQUFjLEVBQUUsSUFBSSxFQUFDO1FBQ2hGLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsY0FBYyxFQUFDLGNBQWMsRUFBRSwyQkFBMkIsRUFBQztRQUNsRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLDZCQUE2QixFQUFDLGNBQWMsRUFBRSw0QkFBNEIsRUFBQztLQUNuRyxDQUFBO0lBQ0QsTUFBTSxPQUFPLEdBQUMsRUFBRSxDQUFBO0lBQ2hCLElBQUcsQ0FBQztRQUNGLFdBQVcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxJQUFJLEdBQUMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2xELElBQUksSUFBSSxDQUFDLFFBQVEsS0FBRyxVQUFVLENBQUMsY0FBYyxFQUFDLENBQUM7Z0JBQzdDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsRUFBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsRUFBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBQyxDQUFDLENBQUE7WUFDekgsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU0sQ0FBQyxFQUFDLENBQUM7UUFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ2hCLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy9naXQgcmVzZXQgLS1oYXJkXG5pbXBvcnQge1BsdWdpbiwgTWFya2Rvd25SZW5kZXJlcixhZGRJY29uLCBBcHAsIE1vZGFsLCBDb21wb25lbnQsIFNldHRpbmcsTm90aWNlLCBXb3Jrc3BhY2VXaW5kb3csbG9hZE1hdGhKYXgscmVuZGVyTWF0aCwgTWFya2Rvd25WaWV3LCBFZGl0b3JTdWdnZXN0LCBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8sIEVkaXRvclBvc2l0aW9uLCBFZGl0b3IsIFRGaWxlLCBFZGl0b3JTdWdnZXN0Q29udGV4dH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IE1hdGhJbmZvLCBNYXRoUHJhaXNlciB9IGZyb20gXCIuL21hdGhQYXJzZXIvbWF0aEVuZ2luZVwiO1xuaW1wb3J0IHsgSW5mb01vZGFsLCBEZWJ1Z01vZGFsIH0gZnJvbSBcIi4vZGVzcGx5TW9kYWxzXCI7XG5pbXBvcnQgeyBDdXN0b21JbnB1dE1vZGFsLCBIaXN0b3J5TW9kYWwsIElucHV0TW9kYWwsIFZlY0lucHV0TW9kZWwgfSBmcm9tIFwiLi90ZW1wXCI7XG5pbXBvcnQge0xhdGV4U3VpdGVQbHVnaW5TZXR0aW5ncywgREVGQVVMVF9TRVRUSU5HUywgTGF0ZXhTdWl0ZUNNU2V0dGluZ3MsIHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3N9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBMYXRleFN1aXRlU2V0dGluZ1RhYiB9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzX3RhYlwiO1xuaW1wb3J0IHsgY2FsY3VsYXRlQmlub20sIGRlZ3JlZXNUb1JhZGlhbnMsIGZpbmRBbmdsZUJ5Q29zaW5lUnVsZSwgZ2V0VXNhYmxlRGVncmVlcywgcG9sYXJUb0NhcnRlc2lhbiwgcmFkaWFuc1RvRGVncmVlcywgcm91bmRCeVNldHRpbmdzIH0gZnJvbSBcInNyYy9tYXRoUGFyc2VyL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdHRpbmcsIFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7IFN1Z2dlc3RvciB9IGZyb20gXCIuL3N1Z2dlc3Rvci5qc1wiO1xuaW1wb3J0IHsgVGlrelN2ZyB9IGZyb20gXCIuL3Rpa3pqYXgvbXlUaWt6LmpzXCI7XG5cbmltcG9ydCB7RXh0ZW5zaW9uLCBFZGl0b3JTdGF0ZSwgU2VsZWN0aW9uUmFuZ2UsUmFuZ2VTZXQsIFByZWMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEZvcm1hdFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L2ludGVycHJldC90b2tlbml6ZVRpa3pqYXguanNcIjtcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tIFwiLi9zZXRFZGl0b3JFeHRlbnNpb25zLmpzXCI7XG5cbmltcG9ydCB7IG9uRmlsZUNyZWF0ZSwgb25GaWxlQ2hhbmdlLCBvbkZpbGVEZWxldGUsIGdldFNuaXBwZXRzRnJvbUZpbGVzLCBnZXRGaWxlU2V0cywgZ2V0VmFyaWFibGVzRnJvbUZpbGVzLCB0cnlHZXRWYXJpYWJsZXNGcm9tVW5rbm93bkZpbGVzIH0gZnJvbSBcIi4vc2V0dGluZ3MvZmlsZV93YXRjaFwiO1xuaW1wb3J0IHsgSUNPTlMgfSBmcm9tIFwiLi9zZXR0aW5ncy91aS9pY29uc1wiO1xuXG5pbXBvcnQgeyBnZXRFZGl0b3JDb21tYW5kcyB9IGZyb20gXCIuL2ZlYXR1cmVzL2VkaXRvcl9jb21tYW5kc1wiO1xuaW1wb3J0IHsgU25pcHBldFZhcmlhYmxlcywgcGFyc2VTbmlwcGV0VmFyaWFibGVzLCBwYXJzZVNuaXBwZXRzIH0gZnJvbSBcIi4vc25pcHBldHMvcGFyc2VcIjtcbmltcG9ydCB7ICBQbHVnaW5NYW5pZmVzdCwgUGx1Z2luU2V0dGluZ1RhYiwgIH0gZnJvbSAnb2JzaWRpYW4nO1xuXG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9zaGUgZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTGF0ZXhTdWl0ZVBsdWdpblNldHRpbmdzO1xuXHRDTVNldHRpbmdzOiBMYXRleFN1aXRlQ01TZXR0aW5ncztcblx0ZWRpdG9yRXh0ZW5zaW9uczogRXh0ZW5zaW9uW10gPSBbXTtcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxuICBlZGl0b3JFeHRlbnNpb25zMjogRWRpdG9yRXh0ZW5zaW9ucz0gbmV3IEVkaXRvckV4dGVuc2lvbnMoKTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgY29uc29sZS5sb2coXCJuZXcgbG9kXCIpXG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuXHRcdHRoaXMubG9hZEljb25zKCk7XG5cdFx0dGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBMYXRleFN1aXRlU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXHRcdGxvYWRNYXRoSmF4KCk7XG5cblx0XHQvLyBSZWdpc3RlciBMYXRleCBTdWl0ZSBleHRlbnNpb25zIGFuZCBvcHRpb25hbCBlZGl0b3IgZXh0ZW5zaW9ucyBmb3IgZWRpdG9yIGVuaGFuY2VtZW50c1xuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24odGhpcy5lZGl0b3JFeHRlbnNpb25zKTtcblxuXHRcdC8vIFdhdGNoIGZvciBjaGFuZ2VzIHRvIHRoZSBzbmlwcGV0IHZhcmlhYmxlcyBhbmQgc25pcHBldHMgZmlsZXNcblx0XHR0aGlzLndhdGNoRmlsZXMoKTtcblxuXHRcdHRoaXMuYWRkRWRpdG9yQ29tbWFuZHMoKTtcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3I9bmV3IFRpa3pqYXgodGhpcy5hcHAsdGhpcylcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3IucmVhZHlMYXlvdXQoKTtcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IuYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCk7XG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlZ2lzdGVyVGlrekNvZGVCbG9jaygpO1xuICAgIFxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcIm1hdGgtZW5naW5lXCIsIHRoaXMucHJvY2Vzc01hdGhCbG9jay5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6amF4XCIsIHRoaXMucHJvY2Vzc1Rpa3pCbG9jay5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcbiAgICBcbiAgICAgIFxuICAgIC8vdGhpcy5yZWdpc3RlckVkaXRvclN1Z2dlc3QobmV3IE51bWVyYWxzU3VnZ2VzdG9yKHRoaXMpKTtcbiAgICBcbiAgfVxuXG4gIHByaXZhdGUgcHJvY2Vzc01hdGhCbG9jayhzb3VyY2U6IHN0cmluZywgbWFpbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICBcbiAgICBtYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWNvbnRhaW5lclwiKTtcbiAgICBcbiAgICBjb25zdCB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG4gICAgbGV0IHNraXBwZWRJbmRleGVzID0gMDtcbiAgICBcbiAgICBjb25zdCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKS5tYXAobGluZSA9PiBsaW5lLnJlcGxhY2UoL1tcXHNdKy8sJycpLnRyaW0oKSkuZmlsdGVyKGxpbmUgPT4gbGluZSAmJiAhbGluZS5zdGFydHNXaXRoKFwiLy9cIikpO1xuICAgIGlmIChleHByZXNzaW9ucy5sZW5ndGggPT09IDApIHtyZXR1cm47fVxuXG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaCgoZXhwcmVzc2lvbiwgaW5kZXgpID0+IHtcbiAgICAgIGxldCBsaW5lQ29udGFpbmVyOiBIVE1MRGl2RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICBsaW5lQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWxpbmUtY29udGFpbmVyXCIsIChpbmRleC1za2lwcGVkSW5kZXhlcykgJSAyID09PSAwID8gXCJtYXRoLXJvdy1ldmVuXCIgOiBcIm1hdGgtcm93LW9kZFwiKTtcbiAgICAgIC8vaWYgKGV4cHJlc3Npb24ubWF0Y2goL15cXC9cXC8vKSl7fVxuICAgICAgY29uc3QgcHJvY2Vzc01hdGggPSBuZXcgUHJvY2Vzc01hdGgoZXhwcmVzc2lvbix1c2VyVmFyaWFibGVzLCB0aGlzLmFwcCxsaW5lQ29udGFpbmVyKTtcbiAgICAgIHByb2Nlc3NNYXRoLmluaXRpYWxpemUoKTtcblxuICAgICAgaWYocHJvY2Vzc01hdGgubW9kZSE9PVwidmFyaWFibGVcIil7XG4gICAgICAgIGxpbmVDb250YWluZXIgPSBwcm9jZXNzTWF0aC5jb250YWluZXIgYXMgSFRNTERpdkVsZW1lbnQ7XG4gICAgICAgIG1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XG4gICAgICB9XG4gICAgICBlbHNle3NraXBwZWRJbmRleGVzKys7fVxuICAgIH0pO1xuICB9XG5cbiAgYWRkRWRpdG9yQ29tbWFuZHMoKSB7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGdldEVkaXRvckNvbW1hbmRzKHRoaXMpKSB7XG5cdFx0XHR0aGlzLmFkZENvbW1hbmQoY29tbWFuZCk7XG5cdFx0fVxuXHR9XG4gIG9udW5sb2FkKCkge1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0fVxuXG4gIGFzeW5jIGdldFNldHRpbmdzU25pcHBldHMoc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcykge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcGFyc2VTbmlwcGV0cyh0aGlzLnNldHRpbmdzLnNuaXBwZXRzLCBzbmlwcGV0VmFyaWFibGVzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRuZXcgTm90aWNlKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0cyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cbiAgcHJvY2Vzc1Rpa3pCbG9jayhzb3VyY2U6IHN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBzdmcgPSBuZXcgVGlrelN2Zyhzb3VyY2UpO1xuICBcbiAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XG4gICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxuICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcbiAgfSk7XG4gIFxuXG4gIGNvbnN0IGdyYXBoID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XG4gICAgc3R5bGU6IFwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCJcbiAgfSk7XG4gIGdyYXBoLmFwcGVuZENoaWxkKHN2Zy5nZXRTdmcoKSk7XG4gIHN2Zy5kZWJ1Z0luZm8rPWdyYXBoLm91dGVySFRNTFxuICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgc3ZnLmRlYnVnSW5mbykub3BlbigpO1xuICBcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xuICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JhcGgpO1xufVxuXG5sb2FkSWNvbnMoKSB7XG4gIGZvciAoY29uc3QgW2ljb25JZCwgc3ZnQ29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMoSUNPTlMpKSB7XG4gICAgYWRkSWNvbihpY29uSWQsIHN2Z0NvbnRlbnQpO1xuICB9XG59XG5hc3luYyBsb2FkU2V0dGluZ3MoKSB7XG4gIGxldCBkYXRhID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpO1xuXG4gIC8vIE1pZ3JhdGUgc2V0dGluZ3MgZnJvbSB2MS44LjAgLSB2MS44LjRcbiAgY29uc3Qgc2hvdWxkTWlncmF0ZVNldHRpbmdzID0gZGF0YSA/IFwiYmFzaWNTZXR0aW5nc1wiIGluIGRhdGEgOiBmYWxzZTtcblxuICAvLyBAdHMtaWdub3JlXG4gIGZ1bmN0aW9uIG1pZ3JhdGVTZXR0aW5ncyhvbGRTZXR0aW5ncykge1xuICAgIHJldHVybiB7XG4gICAgICAuLi5vbGRTZXR0aW5ncy5iYXNpY1NldHRpbmdzLFxuICAgICAgLi4ub2xkU2V0dGluZ3MucmF3U2V0dGluZ3MsXG4gICAgICBzbmlwcGV0czogb2xkU2V0dGluZ3Muc25pcHBldHMsXG4gICAgfTtcbiAgfVxuXG4gIGlmIChzaG91bGRNaWdyYXRlU2V0dGluZ3MpIHtcbiAgICBkYXRhID0gbWlncmF0ZVNldHRpbmdzKGRhdGEpO1xuICB9XG5cbiAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGRhdGEpO1xuXG5cbiAgaWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUgfHwgdGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKSB7XG4gICAgY29uc3QgdGVtcFNuaXBwZXRWYXJpYWJsZXMgPSBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpO1xuICAgIGNvbnN0IHRlbXBTbmlwcGV0cyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyh0ZW1wU25pcHBldFZhcmlhYmxlcyk7XG5cbiAgICB0aGlzLkNNU2V0dGluZ3MgPSBwcm9jZXNzTGF0ZXhTdWl0ZVNldHRpbmdzKHRlbXBTbmlwcGV0cywgdGhpcy5zZXR0aW5ncyk7XG5cbiAgICAvLyBVc2Ugb25MYXlvdXRSZWFkeSBzbyB0aGF0IHdlIGRvbid0IHRyeSB0byByZWFkIHRoZSBzbmlwcGV0cyBmaWxlIHRvbyBlYXJseVxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcbiAgICAgIHRoaXMucHJvY2Vzc1NldHRpbmdzKCk7XG4gICAgfSk7XG4gIH1cbiAgZWxzZSB7XG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzU2V0dGluZ3MoKTtcbiAgfVxufVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncyhkaWRGaWxlTG9jYXRpb25DaGFuZ2UgPSBmYWxzZSkge1xuXHRcdGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG5cdFx0dGhpcy5wcm9jZXNzU2V0dGluZ3MoZGlkRmlsZUxvY2F0aW9uQ2hhbmdlKTtcblx0fVxuXG4gIGFzeW5jIHByb2Nlc3NTZXR0aW5ncyhiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCA9IGZhbHNlLCBiZWNhdXNlRmlsZVVwZGF0ZWQgPSBmYWxzZSkge1xuXHRcdHRoaXMuQ01TZXR0aW5ncyA9IHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3MoYXdhaXQgdGhpcy5nZXRTbmlwcGV0cyhiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCwgYmVjYXVzZUZpbGVVcGRhdGVkKSwgdGhpcy5zZXR0aW5ncyk7XG4gICAgdGhpcy5lZGl0b3JFeHRlbnNpb25zMi5zZXRFZGl0b3JFeHRlbnNpb25zKHRoaXMpXG4gICAgLy90aGlzLnNldEVkaXRvckV4dGVuc2lvbnMoKTtcblx0XHR0aGlzLmFwcC53b3Jrc3BhY2UudXBkYXRlT3B0aW9ucygpO1xuXHR9XG4gIFxuICBhc3luYyBnZXRTZXR0aW5nc1NuaXBwZXRWYXJpYWJsZXMoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwYXJzZVNuaXBwZXRWYXJpYWJsZXModGhpcy5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRuZXcgTm90aWNlKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XG5cdFx0XHRjb25zb2xlLmxvZyhgRmFpbGVkIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0fVxuICBhc3luYyBnZXRTbmlwcGV0cyhiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZDogYm9vbGVhbiwgYmVjYXVzZUZpbGVVcGRhdGVkOiBib29sZWFuKSB7XG5cdFx0Ly8gR2V0IGZpbGVzIGluIHNuaXBwZXQvdmFyaWFibGUgZm9sZGVycy5cblx0XHQvLyBJZiBlaXRoZXIgaXMgc2V0IHRvIGJlIGxvYWRlZCBmcm9tIHNldHRpbmdzIHRoZSBzZXQgd2lsbCBqdXN0IGJlIGVtcHR5LlxuXHRcdGNvbnN0IGZpbGVzID0gZ2V0RmlsZVNldHModGhpcyk7XG5cblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzID1cblx0XHRcdHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZVxuXHRcdFx0XHQ/IGF3YWl0IGdldFZhcmlhYmxlc0Zyb21GaWxlcyh0aGlzLCBmaWxlcylcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpO1xuXG5cdFx0Ly8gVGhpcyBtdXN0IGJlIGRvbmUgaW4gZWl0aGVyIGNhc2UsIGJlY2F1c2UgaXQgYWxzbyB1cGRhdGVzIHRoZSBzZXQgb2Ygc25pcHBldCBmaWxlc1xuXHRcdGNvbnN0IHVua25vd25GaWxlVmFyaWFibGVzID0gYXdhaXQgdHJ5R2V0VmFyaWFibGVzRnJvbVVua25vd25GaWxlcyh0aGlzLCBmaWxlcyk7XG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSkge1xuXHRcdFx0Ly8gQnV0IHdlIG9ubHkgdXNlIHRoZSB2YWx1ZXMgaWYgdGhlIHVzZXIgd2FudHMgdGhlbVxuXHRcdFx0T2JqZWN0LmFzc2lnbihzbmlwcGV0VmFyaWFibGVzLCB1bmtub3duRmlsZVZhcmlhYmxlcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc25pcHBldHMgPVxuXHRcdFx0dGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZVxuXHRcdFx0XHQ/IGF3YWl0IGdldFNuaXBwZXRzRnJvbUZpbGVzKHRoaXMsIGZpbGVzLCBzbmlwcGV0VmFyaWFibGVzKVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzKTtcblx0XHR0aGlzLnNob3dTbmlwcGV0c0xvYWRlZE5vdGljZShzbmlwcGV0cy5sZW5ndGgsIE9iamVjdC5rZXlzKHNuaXBwZXRWYXJpYWJsZXMpLmxlbmd0aCwgIGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkLCBiZWNhdXNlRmlsZVVwZGF0ZWQpO1xuXG5cdFx0cmV0dXJuIHNuaXBwZXRzO1xuXHR9XG4gIHNob3dTbmlwcGV0c0xvYWRlZE5vdGljZShuU25pcHBldHM6IG51bWJlciwgblNuaXBwZXRWYXJpYWJsZXM6IG51bWJlciwgYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQ6IGJvb2xlYW4sIGJlY2F1c2VGaWxlVXBkYXRlZDogYm9vbGVhbikge1xuXHRcdGlmICghKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkIHx8IGJlY2F1c2VGaWxlVXBkYXRlZCkpXG5cdFx0XHRyZXR1cm47XG5cblx0XHRjb25zdCBwcmVmaXggPSBiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCA/IFwiTG9hZGVkIFwiIDogXCJTdWNjZXNzZnVsbHkgcmVsb2FkZWQgXCI7XG5cdFx0Y29uc3QgYm9keSA9IFtdO1xuXG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUpXG5cdFx0XHRib2R5LnB1c2goYCR7blNuaXBwZXRzfSBzbmlwcGV0c2ApO1xuXHRcdGlmICh0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpXG5cdFx0XHRib2R5LnB1c2goYCR7blNuaXBwZXRWYXJpYWJsZXN9IHNuaXBwZXQgdmFyaWFibGVzYCk7XG5cblx0XHRjb25zdCBzdWZmaXggPSBcIiBmcm9tIGZpbGVzLlwiO1xuXHRcdG5ldyBOb3RpY2UocHJlZml4ICsgYm9keS5qb2luKFwiIGFuZCBcIikgKyBzdWZmaXgsIDUwMDApO1xuXHR9XG4gIHByaXZhdGUgcmVnaXN0ZXJDb21tYW5kcygpIHtcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwib3Blbi1pbnB1dC1mb3JtXCIsXG4gICAgICBuYW1lOiBcIk9wZW4gSW5wdXQgRm9ybVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IG5ldyBWZWNJbnB1dE1vZGVsKHRoaXMuYXBwLHRoaXMpLm9wZW4oKSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ2aWV3LXNlc3Npb24taGlzdG9yeVwiLFxuICAgICAgbmFtZTogXCJWaWV3IFNlc3Npb24gSGlzdG9yeVwiLFxuICAgICAgLy9jYWxsYmFjazogKCkgPT4gbmV3IEhpc3RvcnlNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpLFxuICAgIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ0ZXN0LW1hdGhFbmdpbmVcIixcbiAgICAgIG5hbWU6IFwidGVzdCBtYXRoIGVuZ2luZVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+dGVzdE1hdGhFbmdpbmUoKSxcbiAgICB9KTtcbiAgfVxuICB3YXRjaEZpbGVzKCkge1xuXHRcdC8vIE9ubHkgYmVnaW4gd2F0Y2hpbmcgZmlsZXMgb25jZSB0aGUgbGF5b3V0IGlzIHJlYWR5XG5cdFx0Ly8gT3RoZXJ3aXNlLCB3ZSdsbCBiZSB1bm5lY2Vzc2FyaWx5IHJlYWN0aW5nIHRvIG1hbnkgb25GaWxlQ3JlYXRlIGV2ZW50cyBvZiBzbmlwcGV0IGZpbGVzXG5cdFx0Ly8gdGhhdCBvY2N1ciB3aGVuIE9ic2lkaWFuIGZpcnN0IGxvYWRzXG5cblx0XHR0aGlzLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XG5cblx0XHRcdGNvbnN0IGV2ZW50c0FuZENhbGxiYWNrcyA9IHtcblx0XHRcdFx0XCJtb2RpZnlcIjogb25GaWxlQ2hhbmdlLFxuXHRcdFx0XHRcImRlbGV0ZVwiOiBvbkZpbGVEZWxldGUsXG5cdFx0XHRcdFwiY3JlYXRlXCI6IG9uRmlsZUNyZWF0ZVxuXHRcdFx0fTtcblxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZXZlbnRzQW5kQ2FsbGJhY2tzKSkge1xuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbihrZXksIChmaWxlKSA9PiB2YWx1ZSh0aGlzLCBmaWxlKSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cbiAgXG59XG5cblxuXG5cbmNsYXNzIFByb2Nlc3NNYXRoIHtcbiAgbWF0aElucHV0OiBhbnk7XG4gIHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcbiAgbW9kZSA9IFwibWF0aFwiO1xuICByZXN1bHQ6IGFueTtcbiAgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgaWNvbnNEaXY6IEhUTUxFbGVtZW50O1xuICBhcHA6IEFwcDtcblxuICBjb25zdHJ1Y3RvcihtYXRoSW5wdXQ6IHN0cmluZyx1c2VyVmFyaWFibGVzOiBhbnksIGFwcDogQXBwLCBjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5tYXRoSW5wdXQgPSBtYXRoSW5wdXQ7XG4gICAgdGhpcy51c2VyVmFyaWFibGVzPXVzZXJWYXJpYWJsZXM7XG4gICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgdGhpcy5jb250YWluZXIgPSBjb250YWluZXI7XG4gICAgdGhpcy5pY29uc0RpdiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtaWNvbnNcIixcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGluaXRpYWxpemUoKSB7XG4gICAgdGhpcy5hc3NpZ25Nb2RlKCk7XG4gICAgdGhpcy5zZXR1cENvbnRhaW5lcigpO1xuICAgIHRoaXMuaGFuZGxlVmFyaWFibGVzKCk7XG4gICAgdGhpcy5jYWxjdWxhdGVNYXRoKCk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwQ29udGFpbmVyKCkge1xuICAgIFtcIm1hdGgtaW5wdXRcIiwgXCJtYXRoLXJlc3VsdFwiXS5mb3JFYWNoKGNsYXNzTmFtZSA9PiB7XG4gICAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgZGl2LmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcbiAgICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGRpdik7XG4gICAgfSk7XG4gICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pY29uc0Rpdik7XG4gIH1cblxuICBwcml2YXRlIGNhbGN1bGF0ZU1hdGgoKSB7XG4gICAgY29uc3QgaW5wdXREaXYgPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFwiLm1hdGgtaW5wdXRcIikgYXMgSFRNTEVsZW1lbnQ7XG4gICAgY29uc3QgcmVzdWx0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLXJlc3VsdFwiKSBhcyBIVE1MRWxlbWVudDtcbiAgICB0cnkge1xuICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcbiAgICAgICAgY2FzZSBcImJpbm9tXCI6XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXG4gICAgICAgICAgY29uc3QgYmlub21Nb2RlbCA9IG5ldyBCaW5vbUluZm9Nb2RlbCh0aGlzLmFwcCwgdGhpcy5tYXRoSW5wdXQpO1xuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKGJpbm9tTW9kZWwpO1xuICAgICAgICAgIHRoaXMucmVzdWx0ID0gYmlub21Nb2RlbC5nZXRFcXVhbCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiY29zXCI6XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXG4gICAgICAgICAgY29uc3QgWyAsIHNpZGVBLCBzaWRlQiwgc2lkZUMgXSA9IHRoaXMubWF0aElucHV0Lm1hcChOdW1iZXIpO1xuICAgICAgICAgIHRoaXMucmVzdWx0PWZpbmRBbmdsZUJ5Q29zaW5lUnVsZShzaWRlQSwgc2lkZUIsIHNpZGVDKVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidmVjXCI6XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9bmV3IFZlY1Byb2Nlc3Nvcih0aGlzLm1hdGhJbnB1dFsxXSx0aGlzLm1hdGhJbnB1dFsyXSx0aGlzLm1hdGhJbnB1dFszXSk7XG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IHRpa3pHcmFwaCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQuZ3JhcGgpKTtcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0LnZlY0luZm8uZGVidWdJbmZvKSk7XG4gICAgICAgICAgdGhpcy5yZXN1bHQ9dGhpcy5yZXN1bHQucmVzdWx0XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIHRoaXMucmVzdWx0ID0gbmV3IE1hdGhQcmFpc2VyKHRoaXMubWF0aElucHV0KTtcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgSW5mb01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5tYXRoSW5mbykpO1xuICAgICAgICAgIHRoaXMuYWRkRGVidWdNb2RlbChuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8uZGVidWdJbmZvKSk7XG4gICAgICAgICAgdGhpcy5tYXRoSW5wdXQ9dGhpcy5yZXN1bHQuaW5wdXQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgIHRoaXMuYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXYsIHJlc3VsdERpdiwgdHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIj90aGlzLm1hdGhJbnB1dDp0aGlzLm1hdGhJbnB1dFswXSwgdGhpcy5yZXN1bHQvKnJvdW5kQnlTZXR0aW5ncyh0aGlzLnJlc3VsdCkqLyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLmRpc3BsYXlFcnJvcihpbnB1dERpdiwgcmVzdWx0RGl2LCBlcnIpO1xuICAgICAgY29uc29sZS5lcnJvcihcIlRoZSBpbml0aWFsIHByYWlzaW5nIGZhaWxlZFwiLGVycik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGlucHV0OiBzdHJpbmcsIHJlc3VsdDogYW55KSB7XG4gICAgaW5wdXREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChpbnB1dCx0cnVlKSlcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcJHske2lucHV0fX0kYCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gICAgLy9jb25zdCByZXN1bHRPdXRwdXQgPSAvKHRydWV8ZmFsc2UpLy50ZXN0KHJlc3VsdCkgPyByZXN1bHQgOiBgXFwkeyR7cmVzdWx0fX0kYDtcbiAgICByZXN1bHREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChyZXN1bHQuc29sdXRpb25Ub1N0cmluZygpfHxcIlwiLHRydWUpKVxuICAgIC8vTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihyZXN1bHRPdXRwdXQsIHJlc3VsdERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcbiAgfVxuXG4gIHByaXZhdGUgZGlzcGxheUVycm9yKGlucHV0RGl2OiBIVE1MRWxlbWVudCwgcmVzdWx0RGl2OiBIVE1MRWxlbWVudCwgZXJyOiBFcnJvcikge1xuICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24odGhpcy5tYXRoSW5wdXQsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xuICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+JHtlcnIubWVzc2FnZX08L3NwYW4+YDtcbiAgICB0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1lcnJvci1saW5lXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3NpZ25Nb2RlKCkge1xuICAgIGNvbnN0IHJlZ2V4TGlzdCA9IEdldE1hdGhDb250ZXh0UmVnZXgoKTtcbiAgICBjb25zdCBtYXRjaE9iamVjdCA9IHJlZ2V4TGlzdC5maW5kKHJlZ2V4T2JqID0+IHJlZ2V4T2JqLnJlZ2V4LnRlc3QodGhpcy5tYXRoSW5wdXQpKTtcbiAgICBpZiAobWF0Y2hPYmplY3QpIHtcbiAgICAgIHRoaXMubW9kZSA9IG1hdGNoT2JqZWN0LnZhbHVlO1xuICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5tYXRjaChtYXRjaE9iamVjdC5yZWdleCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhZGRJbmZvTW9kYWwobW9kYWw6IGFueSkge1xuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWluZm8taWNvblwiLFxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxuICAgIH0pO1xuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBhZGREZWJ1Z01vZGVsKG1vZGFsOiBhbnkpIHtcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5CeXCIsXG4gICAgfSk7XG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlcygpIHtcbiAgICBpZiAodGhpcy5tb2RlPT09XCJ2YXJpYWJsZVwiKSB7XG4gICAgICB0aGlzLmhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5yZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCkge1xuICAgIGNvbnN0IFtfLHZhcmlhYmxlLCB2YWx1ZV0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoKHBhcnQ6IHN0cmluZykgPT4gcGFydC50cmltKCkpO1xuICAgIGlmICghdmFyaWFibGUgfHwgIXZhbHVlKSB7XG4gICAgICBjb25zb2xlLndhcm4oYEludmFsaWQgdmFyaWFibGUgZGVjbGFyYXRpb246ICR7dGhpcy5tYXRoSW5wdXR9YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGV4aXN0aW5nVmFySW5kZXggPSB0aGlzLnVzZXJWYXJpYWJsZXMuZmluZEluZGV4KHYgPT4gdi52YXJpYWJsZSA9PT0gdmFyaWFibGUpO1xuICAgIGlmIChleGlzdGluZ1ZhckluZGV4ICE9PSAtMSkge1xuICAgICAgdGhpcy51c2VyVmFyaWFibGVzW2V4aXN0aW5nVmFySW5kZXhdLnZhbHVlID0gdmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlcy5wdXNoKHsgdmFyaWFibGUsIHZhbHVlIH0pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpe1xuICAgIHRoaXMudXNlclZhcmlhYmxlcy5mb3JFYWNoKCh7IHZhcmlhYmxlLCB2YWx1ZSB9KSA9PiB7XG4gICAgICBpZiAodHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIil7XG4gICAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQucmVwbGFjZSh2YXJpYWJsZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cblxuZnVuY3Rpb24gR2V0TWF0aENvbnRleHRSZWdleCgpIHtcbiAgcmV0dXJuIFtcbiAgICB7IHJlZ2V4OiAvYmlub21cXCgoXFxkKyksKFxcZCspLChcXGQrKVxcKS8sIHZhbHVlOiBcImJpbm9tXCIgfSxcbiAgICB7IHJlZ2V4OiAvdmVjKFsrLV17MCwyfSlcXCgoW1xcZC4rLV0rWzosXVtcXGQuKy1dKylcXCkoW1xcZC4rLV0qKS8sIHZhbHVlOiBcInZlY1wiIH0sXG4gICAgeyByZWdleDogL2Nvc1xcKChbXFxkLl0rKSwoW1xcZC5dKyksKFtcXGQuXSspXFwpLywgdmFsdWU6IFwiY29zXCIgfSxcbiAgICB7IHJlZ2V4OiAvdmFyXFxzKihbXFx3XSspXFxzKj1cXHMqKFtcXGQuXSspLywgdmFsdWU6IFwidmFyaWFibGVcIiB9LFxuICBdO1xufVxuXG5cbmNsYXNzIFZlY1Byb2Nlc3NvciB7XG4gIHVzZXJJbnB1dDogYW55O1xuICBlbnZpcm9ubWVudDogeyBYOiBzdHJpbmc7IFk6IHN0cmluZyB9O1xuICB2ZWNJbmZvID0gbmV3IE1hdGhJbmZvKCk7XG4gIGF4aXM6IEF4aXM7XG4gIG1vZGlmaWVyOiBudW1iZXI7XG4gIHJlc3VsdDogc3RyaW5nO1xuICBncmFwaD86IGFueTtcblxuICBjb25zdHJ1Y3RvcihlbnZpcm9ubWVudDogc3RyaW5nLCBtYXRoSW5wdXQ6IHN0cmluZywgbW9kaWZpZXI6IHN0cmluZykge1xuICAgIHRoaXMudXNlcklucHV0PW1hdGhJbnB1dDtcbiAgICBjb25zdCBtYXRjaCA9IGVudmlyb25tZW50Lm1hdGNoKC8oWystXT8pKFsrLV0/KS8pO1xuICAgIHRoaXMuZW52aXJvbm1lbnQgPSB7IFg6IG1hdGNoPy5bMV0gPz8gXCIrXCIsIFk6IG1hdGNoPy5bMl0gPz8gXCIrXCIgfTtcblxuICAgIHRoaXMubW9kaWZpZXIgPSBtb2RpZmllci5sZW5ndGggPiAwID8gZ2V0VXNhYmxlRGVncmVlcyhOdW1iZXIobW9kaWZpZXIpKSA6IDA7XG5cbiAgICB0aGlzLmF4aXM9bmV3IEF4aXMoKS51bml2ZXJzYWwodGhpcy51c2VySW5wdXQpXG4gICAgaWYgKCF0aGlzLmF4aXMucG9sYXJBbmdsZSlcbiAgICAgIHRoaXMuYXhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKCk7XG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcImF4aXNcIix0aGlzLmF4aXMpO1xuICAgIHRoaXMuYWRkUmVzdWx0KCk7XG4gICAgdGhpcy5hZGRHcmFwaCgpO1xuICB9XG4gIGFkZFJlc3VsdCgpe1xuICAgIGlmICh0aGlzLnVzZXJJbnB1dC5pbmNsdWRlcyhcIjpcIikpXG4gICAgICB0aGlzLnJlc3VsdD1geCA9ICR7dGhpcy5heGlzLmNhcnRlc2lhblh9XFxcXHF1YWQseSA9ICR7dGhpcy5heGlzLmNhcnRlc2lhbll9YFxuICAgIGVsc2VcbiAgICAgIHRoaXMucmVzdWx0PWBhbmdsZSA9ICR7dGhpcy5heGlzLnBvbGFyQW5nbGV9XFxcXHF1YWQsbGVuZ3RoID0gJHt0aGlzLmF4aXMucG9sYXJMZW5ndGh9YFxuICB9XG4gIGFkZEdyYXBoKCkge1xuICAgIGNvbnN0IHRhcmdldFNpemUgPSAxMDtcbiAgICBjb25zdCBtYXhDb21wb25lbnQgPSBNYXRoLm1heChNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWCksIE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgc2NhbGluZyBmYWN0b3JcbiAgICBsZXQgc2NhbGUgPSAxO1xuICAgIGlmIChtYXhDb21wb25lbnQgPCB0YXJnZXRTaXplKSB7XG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XG4gICAgfSBlbHNlIGlmIChtYXhDb21wb25lbnQgPiB0YXJnZXRTaXplKSB7XG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XG4gICAgfVxuICAgIC8vIGkgbmVlZCB0byBtYWtlIGl0IFwidG8gWCBheGlzXCJcbiAgICAvL2NvbnN0IHZlY3RvckFuZ2xlID0gZ2V0VXNhYmxlRGVncmVlcyhyYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbjIoc2NhbGVkWSwgc2NhbGVkWCkpKTtcbiAgICBcbiAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygwLDApO1xuXG5cbiAgIC8vIGNvbnN0IGRyYXc9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLnBvbGFyTGVuZ3RoLnRvU3RyaW5nKCl9KSx0aGlzLmF4aXNdO1xuICAgIC8vY29uc3QgZHJhd1g9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblgudG9TdHJpbmcoKX0pLG5ldyBBeGlzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YLDApXTtcbiAgICAvL2NvbnN0IGRyYXdZPSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZLnRvU3RyaW5nKCl9KSxuZXcgQXhpcygwLHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKV07XG5cbiAgICB0aGlzLmdyYXBoPVtcbiAgICAgIC8vbmV3IEZvcm1hdHRpbmcoXCJnbG9ib2xcIix7Y29sb3I6IFwid2hpdGVcIixzY2FsZTogMSx9KSxcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXcsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInJlZFwiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdYLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3WSxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxuICAgIF1cbiAgICBcbiAgICBcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaFwiLEpTT04uc3RyaW5naWZ5KHRoaXMuZ3JhcGgudG9rZW5zLG51bGwsMSkpO1xuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoLnRvU3RyaW5nKClcXG5cIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRvU3RyaW5nKCkpKTtcbiAgICAvKiBHZW5lcmF0ZSBMYVRlWCBjb2RlIGZvciB2ZWN0b3IgY29tcG9uZW50cyBhbmQgbWFpbiB2ZWN0b3JcbiAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcblxuICAgICAgJSBBbmdsZSBBbm5vdGF0aW9uXG4gICAgICAlXFxhbmd7WH17YW5jfXt2ZWN9e317JHtyb3VuZEJ5U2V0dGluZ3ModmVjdG9yQW5nbGUpfSRee1xcY2lyY30kfVxuICAgIGAucmVwbGFjZSgvXlxccysvZ20sIFwiXCIpOyovXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIlNjYWxpbmcgZmFjdG9yXCIsIHNjYWxlKTtcbiAgfVxufVxuXG5cblxuY2xhc3MgdGlrekdyYXBoIGV4dGVuZHMgTW9kYWwge1xuICB0aWt6OiBGb3JtYXRUaWt6amF4O1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCx0aWt6Q29kZTogYW55KXtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMudGlrej1uZXcgRm9ybWF0VGlrempheCh0aWt6Q29kZSk7XG4gIH1cblxuICBvbk9wZW4oKSB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29uc3QgY29kZT10aGlzLnRpa3o7XG4gICAgY29uc3Qgc2NyaXB0ID0gY29udGVudEVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XG4gICAgc2NyaXB0LnNldFRleHQoY29kZS5nZXRDb2RlKCkpO1xuICAgIFxuICAgIGNvbnN0IGFjdGlvbkJ1dHRvbiA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ29weSBncmFwaFwiLCBjbHM6IFwiaW5mby1tb2RhbC1Db3B5LWJ1dHRvblwiIH0pO1xuXG4gICAgYWN0aW9uQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0aGlzLnRpa3ouZ2V0Q29kZSgpKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJHcmFwaCBjb3BpZWQgdG8gY2xpcGJvYXJkIVwiKTtcbiAgICB9KTtcbiAgfVxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gIH1cbn1cblxudHlwZSBEaXN0cmlidXRpb25UeXBlID0gJ25vcm1hbCcgfCAnYmlub21pYWwnIHwgJ3BvaXNzb24nO1xuXG5jbGFzcyBEaXN0cmlidXRpb24ge1xuICBwcml2YXRlIHR5cGU6IERpc3RyaWJ1dGlvblR5cGU7XG4gIHByaXZhdGUgeDogbnVtYmVyO1xuICBwcml2YXRlIG11OiBudW1iZXI7XG4gIHByaXZhdGUgc2lnbWE6IG51bWJlclxuICBwcml2YXRlIHZhcmlhbmNlOiBudW1iZXJcblxuICBcblxuICAvLyBGb3IgQmlub21pYWwgRGlzdHJpYnV0aW9uXG4gIHByaXZhdGUgdHJpYWxzOiBudW1iZXI7XG4gIHByaXZhdGUgcHJvYmFiaWxpdHk6IG51bWJlcjtcblxuICAvLyBGb3IgUG9pc3NvbiBEaXN0cmlidXRpb25cbiAgcHJpdmF0ZSBsYW1iZGE6IG51bWJlcjtcbiAgLypcbiAgY29uc3RydWN0b3IodHlwZTogRGlzdHJpYnV0aW9uVHlwZSwgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSB7XG4gICAgdGhpcy50eXBlID0gdHlwZTtcblxuICAgIC8vIEluaXRpYWxpemUgYmFzZWQgb24gZGlzdHJpYnV0aW9uIHR5cGVcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ25vcm1hbCc6XG4gICAgICAgIHRoaXMubWVhbiA9IHBhcmFtcy5tZWFuIHx8IDA7XG4gICAgICAgIHRoaXMuc3RkRGV2ID0gcGFyYW1zLnN0ZERldiB8fCAxO1xuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5zdGREZXYgKiogMjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdiaW5vbWlhbCc6XG4gICAgICAgIHRoaXMudHJpYWxzID0gcGFyYW1zLnRyaWFscyB8fCAxO1xuICAgICAgICB0aGlzLnByb2JhYmlsaXR5ID0gcGFyYW1zLnByb2JhYmlsaXR5IHx8IDAuNTtcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy50cmlhbHMgKiB0aGlzLnByb2JhYmlsaXR5O1xuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5tZWFuICogKDEgLSB0aGlzLnByb2JhYmlsaXR5KTtcbiAgICAgICAgdGhpcy5zdGREZXYgPSBNYXRoLnNxcnQodGhpcy52YXJpYW5jZSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncG9pc3Nvbic6XG4gICAgICAgIHRoaXMubGFtYmRhID0gcGFyYW1zLmxhbWJkYSB8fCAxO1xuICAgICAgICB0aGlzLm1lYW4gPSB0aGlzLmxhbWJkYTtcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubGFtYmRhO1xuICAgICAgICB0aGlzLnN0ZERldiA9IE1hdGguc3FydCh0aGlzLnZhcmlhbmNlKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIGRpc3RyaWJ1dGlvbiB0eXBlJyk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIG5vcm1hbFBERih4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh0aGlzLnR5cGUgIT09ICdub3JtYWwnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BERiBvbmx5IGFwcGxpZXMgdG8gdGhlIE5vcm1hbCBEaXN0cmlidXRpb24nKTtcbiAgICB9XG4gICAgY29uc3QgZXhwUGFydCA9IE1hdGguZXhwKC0oKHggLSB0aGlzLm1lYW4pICoqIDIpIC8gKDIgKiB0aGlzLnZhcmlhbmNlKSk7XG4gICAgcmV0dXJuICgxIC8gKHRoaXMuc3RkRGV2ICogTWF0aC5zcXJ0KDIgKiBNYXRoLlBJKSkpICogZXhwUGFydDtcbiAgfVxuXG4gIHB1YmxpYyBub3JtYWxDREYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAnbm9ybWFsJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XG4gICAgfVxuICAgIHJldHVybiAwLjUgKiAoMSArIHRoaXMuZXJmKCh4IC0gdGhpcy5tZWFuKSAvIChNYXRoLnNxcnQoMikgKiB0aGlzLnN0ZERldikpKTtcbiAgfVxuXG4gIHB1YmxpYyBiaW5vbWlhbFBNRih4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh0aGlzLnR5cGUgIT09ICdiaW5vbWlhbCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUE1GIG9ubHkgYXBwbGllcyB0byB0aGUgQmlub21pYWwgRGlzdHJpYnV0aW9uJyk7XG4gICAgfVxuICAgIGNvbnN0IGNvbWJpbmF0aW9uID0gdGhpcy5mYWN0b3JpYWwodGhpcy50cmlhbHMpIC9cbiAgICAgICh0aGlzLmZhY3RvcmlhbCh4KSAqIHRoaXMuZmFjdG9yaWFsKHRoaXMudHJpYWxzIC0geCkpO1xuICAgIHJldHVybiBjb21iaW5hdGlvbiAqIE1hdGgucG93KHRoaXMucHJvYmFiaWxpdHksIHgpICogTWF0aC5wb3coMSAtIHRoaXMucHJvYmFiaWxpdHksIHRoaXMudHJpYWxzIC0geCk7XG4gIH1cblxuICBwdWJsaWMgcG9pc3NvblBNRih4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh0aGlzLnR5cGUgIT09ICdwb2lzc29uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQTUYgb25seSBhcHBsaWVzIHRvIHRoZSBQb2lzc29uIERpc3RyaWJ1dGlvbicpO1xuICAgIH1cbiAgICByZXR1cm4gKE1hdGgucG93KHRoaXMubGFtYmRhLCB4KSAqIE1hdGguZXhwKC10aGlzLmxhbWJkYSkpIC8gdGhpcy5mYWN0b3JpYWwoeCk7XG4gIH1cblxuICBwcml2YXRlIGVyZih4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IHNpZ24gPSB4IDwgMCA/IC0xIDogMTtcbiAgICBjb25zdCBhID0gMC4zMjc1OTExO1xuICAgIGNvbnN0IHAgPSAwLjI1NDgyOTU5MjtcbiAgICBjb25zdCBxID0gLTAuMjg0NDk2NzM2O1xuICAgIGNvbnN0IHIgPSAxLjQyMTQxMzc0MTtcbiAgICBjb25zdCBzID0gLTEuNDUzMTUyMDI3O1xuICAgIGNvbnN0IHQgPSAxLjA2MTQwNTQyOTtcbiAgICBjb25zdCB1ID0gMSArIGEgKiBNYXRoLmFicyh4KTtcbiAgICBjb25zdCBwb2x5ID0gKCgoKChwICogdSArIHEpICogdSArIHIpICogdSArIHMpICogdSArIHQpICogdSk7XG4gICAgcmV0dXJuIHNpZ24gKiAoMSAtIHBvbHkgKiBNYXRoLmV4cCgteCAqIHgpKTtcbiAgfVxuXG4gIHByaXZhdGUgZmFjdG9yaWFsKG46IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKG4gPCAwKSByZXR1cm4gTmFOO1xuICAgIGxldCByZXN1bHQgPSAxO1xuICAgIGZvciAobGV0IGkgPSAyOyBpIDw9IG47IGkrKykgcmVzdWx0ICo9IGk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSovXG59XG5cblxuY2xhc3MgRGlzdHJpYnV0aW9uTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbjogbnVtYmVyO1xuICBwcml2YXRlIGs6IG51bWJlcjtcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XG4gIHByaXZhdGUgZXF1YWwgPSAwO1xuICBwcml2YXRlIGxlc3MgPSAwO1xuICBwcml2YXRlIGxlc3NFcXVhbCA9IDA7XG4gIHByaXZhdGUgYmlnID0gMDtcbiAgcHJpdmF0ZSBiaWdFcXVhbCA9IDA7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogc3RyaW5nKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICBjb25zdCBbXywgbiwgaywgcF0gPSBzb3VyY2UubWF0Y2goL1xcZCsvZykhLm1hcChOdW1iZXIpO1xuICAgIHRoaXMubiA9IG47XG4gICAgdGhpcy5rID0gaztcbiAgICB0aGlzLnAgPSBwO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIHRoaXMuY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpO1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzXCIgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPSAke3RoaXMua30pID0gJHt0aGlzLmVxdWFsfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPCAke3RoaXMua30pID0gJHt0aGlzLmxlc3N9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8PSAke3RoaXMua30pID0gJHt0aGlzLmxlc3NFcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID4gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWd9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+PSAke3RoaXMua30pID0gJHt0aGlzLmJpZ0VxdWFsfWAgfSk7XG4gIH1cblxuICBwdWJsaWMgZ2V0RXF1YWwoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gY2FsY3VsYXRlQmlub20odGhpcy5uLCB0aGlzLmssIHRoaXMucCk7XG4gIH1cblxuICBwcml2YXRlIGNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcbiAgICAgIGNvbnN0IHByb2JhYmlsaXR5ID0gY2FsY3VsYXRlQmlub20odGhpcy5uLCBpLCB0aGlzLnApO1xuICAgICAgaWYgKGkgPT09IHRoaXMuaykgdGhpcy5lcXVhbCA9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPCB0aGlzLmspIHRoaXMubGVzcyArPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDw9IHRoaXMuaykgdGhpcy5sZXNzRXF1YWwgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA+IHRoaXMuaykgdGhpcy5iaWcgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA+PSB0aGlzLmspIHRoaXMuYmlnRXF1YWwgKz0gcHJvYmFiaWxpdHk7XG4gICAgfVxuICB9XG59XG5cblxuXG5cblxuXG5cbmNsYXNzIEJpbm9tSW5mb01vZGVsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG46IG51bWJlcjtcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XG4gIHByaXZhdGUgcDogbnVtYmVyO1xuICBwcml2YXRlIGVxdWFsID0gMDtcbiAgcHJpdmF0ZSBsZXNzID0gMDtcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xuICBwcml2YXRlIGJpZyA9IDA7XG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuayA9IGs7XG4gICAgdGhpcy5wID0gcDtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xuICB9XG5cbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgIH1cbiAgfVxufVxuXG5cblxuXG5cblxuZnVuY3Rpb24gdGVzdE1hdGhFbmdpbmUoKXtcbiAgY29uc3QgZXhwcmVzc2lvbnM9W1xuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YDIgXFxmcmFjeyg1LTMpMzR9e1xcc3FydHsyXnsyfX19MC41YCxleHBlY3RlZE91dHB1dDogJzM0J30sXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgKHgrMSkoeCszKT0yYCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMC4yNjc5NSx4XzI9LTMuNzMyMDUnfSxcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2BcXGZyYWN7MTMyfXsxMjYwK3heezJ9fT0wLjA1YCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMzcuMTQ4MzUseF8yPTM3LjE0ODM1J30sXG4gIF1cbiAgY29uc3QgcmVzdWx0cz1bXVxuICB0cnl7XG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaChleHByZXNzaW9uID0+IHtcbiAgICAgIGNvbnN0IG1hdGg9bmV3IE1hdGhQcmFpc2VyKGV4cHJlc3Npb24uZXhwcmVzc2lvbik7XG4gICAgICBpZiAobWF0aC5zb2x1dGlvbiE9PWV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQpe1xuICAgICAgICByZXN1bHRzLnB1c2goe2V4cHJlc3Npb246IGV4cHJlc3Npb24uZXhwcmVzc2lvbixleHBlY3RlZE91dHB1dDogZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCxhY3R1YWxPdXRwdXQ6IG1hdGguc29sdXRpb259KVxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIGNhdGNoKGUpe1xuICAgIGNvbnNvbGUubG9nKGUpXG4gIH1cbn1cblxuXG5cblxuIl19