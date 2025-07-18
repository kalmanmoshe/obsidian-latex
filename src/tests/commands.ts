
import { Command, Modal, Notice, TFile } from "obsidian";
import { latexCodeBlockNamesRegex } from "src/latexRender/swiftlatexRender";
import { LatexTask, TaskSectionInformation } from "src/latexRender/utils/latexTask";
import Moshe from "src/main";
import { codeBlockNameRegex, extractCodeBlockMetadata, getLatexCodeBlockSectionsFromFile } from "src/latexRender/resolvers/latexSourceFromFile";
import { getFileSections } from "src/latexRender/resolvers/sectionCache";
import { CacheStatus } from "src/latexRender/cache/compilerCache";
import { CompileResult, CompileStatus } from "src/latexRender/compiler/base/compilerBase/engine";

export function getTestCommands(plugin: Moshe): Command[] {
    return [createTestLatexCommand(plugin)];
}

function createTestLatexCommand(plugin: Moshe): Command {
    return {
        id: "test-latex-code-blocks",
        name: "Test LaTeX Code Blocks (if the test is allrdy running, it will continue)",
        callback: () => CompileTest.startOrContinueTest(plugin)
    };
}
function createNewTestLatexCommand(plugin: Moshe): Command {
    return {
        id: "start-new-test-latex-code-blocks",
        name: "Start new est LaTeX Code Blocks",
        callback: () => CompileTest.cancelAndStartNewTest(plugin)
    };
}

interface CompileTracker {
    stableSuccess: CompileAnalysisResult[];
    stableFailure: CompileAnalysisResult[];
    fixedErrors: CompileAnalysisResult[];
    newlyBroken: CompileAnalysisResult[];
    unknownSuccess: CompileAnalysisResult[];
    unknownFailure: CompileAnalysisResult[];
}

interface CompileAnalysisResult {
    compileResult: CompileResult;
    task: LatexTask;
    section: TaskSectionInformation;
}

async function getAllMarkdownLatexSections(plugin: Moshe) {
    const files = plugin.app.vault.getFiles().filter(f => f.extension === "md");
    const sectionsOfFiles = await Promise.all(
        files.map(async file => ({
            file,
            codeBlockSections: await getLatexCodeBlockSectionsFromFile(plugin.app, file as TFile)
        }))
    );
    return sectionsOfFiles.filter(({ codeBlockSections }) => codeBlockSections.length > 0);
}



async function analyzeCompileResult(plugin: Moshe, file: TFile, section: TaskSectionInformation) {
    const task = LatexTask.fromSectionInfo(plugin, file.path, section);
    const previousStatus = task.getCacheStatusAsNum();
    const compileResult = await plugin.swiftlatexRender.detachedProcessAndRender(task);
    const isSuccess = compileResult.status === CompileStatus.Success;
    const index = previousStatus + (isSuccess ? 0 : 1);

    return {
        id: index,
        compileResult,
        task
    };
}


class CompileTest {
    static plugin: Moshe;
    static displayModal: TestResultModal;
    static tracker: CompileTracker;
    static sectionsByFile: { file: TFile; codeBlockSections: TaskSectionInformation[]; }[] = [];
    static activeToken: string | null = null;
    static testStartTime: number;

    static isActive() {
        return this.activeToken !== null;
    }

    static cancelCurrentTest() {
        this.activeToken = null;
        if (this.displayModal) {
            this.displayModal.close();
        }
        new Notice("Previous test was cancelled.");
    }
    static cancelAndStartNewTest(plugin: Moshe) {
        if (this.isActive()) {
            this.cancelCurrentTest(); // cancel running test safely
        }
        this.startTest(plugin);
    }
    static startOrContinueTest(plugin: Moshe) {
        if (this.isActive()) {
            this.displayModal.open();
            new Notice("Test is already running. Continuing with the current test.");
            return;
        }
        this.startTest(plugin);
    }
    private static async startTest(plugin: Moshe) {
        this.plugin = plugin;
        this.activeToken = crypto.randomUUID(); // unique token per run
        const token = this.activeToken;
        this.testStartTime = Date.now();

        this.displayModal = new TestResultModal(plugin);
        this.displayModal.open();
        this.displayModal.setTestStartTime(this.testStartTime);
        this.tracker = {
            stableSuccess: [],
            stableFailure: [],
            fixedErrors: [],
            newlyBroken: [],
            unknownSuccess: [],
            unknownFailure: []
        };

        const files = plugin.app.vault.getFiles().filter(f => f.extension === "md");
        this.sectionsByFile = await Promise.all(
            files.map(async file => ({
                file,
                codeBlockSections: await getLatexCodeBlockSectionsFromFile(plugin.app, file as TFile)
            }))
        );

        this.analyzeLatexCodeBlocks(token);
    }
    
    static async analyzeLatexCodeBlocks(token: string) {
        for (const { file, codeBlockSections } of this.sectionsByFile) {
            for (const section of codeBlockSections) {
                if (this.activeToken !== token) return; // canceled
                this.displayModal.setCurrent(file.path, section);

                const start = performance.now();
                const result = await this.analyzeSection(file, section);
                console.log("Compile result:", result);
                const duration = performance.now() - start;

                const index = result.compileResult.status === CompileStatus.Success ? 0 : 1;
                const trackerIndex = result.task.getCacheStatusAsNum() + index;

                const keys = Object.keys(this.tracker) as (keyof CompileTracker)[];
                this.tracker[keys[trackerIndex]].push(result);

                this.displayModal.addResult(trackerIndex, result, duration);
            }
        }

        if (this.activeToken === token) {
            this.displayModal.finish(this.tracker);
            this.activeToken = null;
        }
    }

    static async analyzeSection(file: TFile, section: TaskSectionInformation): Promise<CompileAnalysisResult> {
        const task = LatexTask.fromSectionInfo(this.plugin, file.path, section);
        const compileResult = await this.plugin.swiftlatexRender.detachedProcessAndRender(task);
        return { compileResult, task, section };
    }
}


class TestResultModal extends Modal {
    plugin: Moshe;
    currentFileEl: HTMLElement;
    currentSectionEl: HTMLElement;
    resultsContainer: HTMLElement;
    testStartTime = 0;

    constructor(plugin: Moshe) {
        super(plugin.app);
        this.plugin = plugin;
        this.set();
    }

    private set() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "Running LaTeX Compilation Tests..." });

        this.currentFileEl = contentEl.createEl("p", { text: "Current File: ..." });
        this.currentSectionEl = contentEl.createEl("p", { text: "Current Section: ..." });
        this.resultsContainer = contentEl.createDiv();

        contentEl.createEl("button", {
            text: "Save Report to Vault",
            cls: "mod-cta"
        }).onclick = () => this.saveReport();
    }
    setTestStartTime(startTime: number) {
        this.testStartTime = startTime;
        const dateStr = new Date(startTime).toLocaleString();
        this.contentEl.createEl("p", { text: `Test started: ${dateStr}` });
    }

    setCurrent(filePath: string, section: TaskSectionInformation,fileIndex: number, sectionIndex: number) {
        this.currentFileEl.setText(`File: ${filePath}`);
        this.currentSectionEl.setText(`Section line: ${section.lineStart}`);
    }

    addResult(labelIndex: number, result: CompileAnalysisResult, duration: number) {
        const label = Object.keys(CompileTest.tracker)[labelIndex];

        const container = this.resultsContainer;
        const sectionLine = result.section.lineStart;

        container.createEl("p", {
            text: `${label}: ${result.task.sourcePath} (Line ${sectionLine}) — ${duration.toFixed(1)}ms`
        });

        container.createEl("a", {
            text: "Go to code block ↗",
            href: `obsidian://open?path=${encodeURIComponent(result.task.sourcePath)}#^${sectionLine}`,
            cls: "external-link"
        });
    }

    finish(tracker: CompileTracker) {
        const totalTime = ((Date.now() - this.testStartTime) / 1000).toFixed(1);
        this.currentFileEl.setText("✔️ All files processed.");
        this.currentSectionEl.setText("");

        this.contentEl.createEl("p", {
            text: `✅ Test finished in ${totalTime} seconds`
        });

        this.contentEl.createEl("button", {
            text: "Save Report to Vault",
            cls: "mod-cta"
        }).onclick = () => this.saveReport();
    }

    async saveReport() {
        const tracker = CompileTest.tracker;
        let idx=0;
        if (this.plugin.app.vault.getAbstractFileByPath("compile-report.md") !== null) {
            idx++;
            while (this.plugin.app.vault.getAbstractFileByPath("compile-report" + idx + ".md") !== null) {
            }
        }
        
        const path = idx===0 ? "compile-report.md": "compile-report-"+idx+".md";

        const report = this.generateMarkdownReport(tracker);
        await this.plugin.app.vault.create(path, report);
        new Notice(`Report saved to ${path}`);
    }

    generateMarkdownReport(tracker: CompileTracker): string {
        const date = new Date(this.testStartTime).toLocaleString();
        const blocks = Object.entries(tracker).map(([label, results]) => {
            const items = results.map(r => {
                const line = r.section.lineStart;
                const link = `obsidian://open?path=${encodeURIComponent(r.task.filePath)}#^${line}`;
                return `- [${r.task.filePath}](<${link}>) (Line ${line})`;
            }).join("\n");
            return `### ${label} (${results.length})\n${items}`;
        });

        return `# Compile Report\n\n**Started:** ${date}\n\n${blocks.join("\n\n")}`;
    }
}
