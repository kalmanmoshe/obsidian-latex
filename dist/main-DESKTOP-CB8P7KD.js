import { __awaiter } from "tslib";
import { Plugin, MarkdownRenderer, Modal, Notice, Component } from 'obsidian';
import { controller } from './mathEngine.js';
export default class MathPlugin extends Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.registerMarkdownCodeBlockProcessor('math-engine', (source, el, ctx) => {
                const rawSource = String.raw `${source}`;
                let expressions = rawSource.split('\n').filter(line => line.trim() !== '');
                if (expressions.length === 0) {
                    expressions = ['0'];
                }
                let lastResult = null; // Variable to store result of lines starting with '::'
                expressions.forEach((expression, index) => {
                    var _a, _b;
                    const container = el.createEl('div', { cls: 'math-line-container' });
                    // Add alternating row colors for distinction
                    if (index % 2 === 0) {
                        container.addClass('math-row-even');
                    }
                    else {
                        container.addClass('math-row-odd');
                    }
                    if (expression.trim().startsWith('::')) {
                        const actualExpression = expression.trim().slice(2).trim();
                        const result = controller(actualExpression); // Evaluate the expression
                        if (typeof result === 'object' && !Array.isArray(result)) {
                            lastResult = result.solution; // Store the solution for future lines
                        }
                        else {
                            lastResult = null; // Reset if result is not an object
                        }
                    }
                    const inputDiv = container.createEl('div', { cls: 'math-input' });
                    const resultDiv = container.createEl('div', { cls: 'math-result' });
                    const result = controller(expression);
                    // Render input expression as LaTeX
                    MarkdownRenderer.renderMarkdown(`$\{${expression.replace(/(?<!\\|[a-z])(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\\\$1")}\}$`, inputDiv, '', this);
                    if (Array.isArray(result) && result) {
                        resultDiv.innerHTML = `<span class="error-text">${result[0]}</span>`;
                    }
                    else if (typeof result === 'object' && !Array.isArray(result)) {
                        resultDiv.innerHTML = `
          <div class="math-result-text">${result.solution}</div>
          <div class="math-icons">
            <span class="math-info-icon">🛈</span>
            <span class="math-debug-icon">🐞</span>
          </div>`;
                        (_a = resultDiv.querySelector('.math-info-icon')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
                            new InfoModal(this.app, result.info, result.solutionInfo).open();
                        });
                        (_b = resultDiv.querySelector('.math-debug-icon')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
                            new DebugModal(this.app, result.debugInfo).open();
                        });
                    }
                    else {
                        resultDiv.innerHTML = `<span class="error-text">Unexpected result format. Please check your input.</span>`;
                    }
                    // If the line does not start with "::", compare its result with the last stored result
                    if (!expression.trim().startsWith('::') && lastResult !== null) {
                        if (typeof result === 'object' && !Array.isArray(result) && result.solution !== lastResult) {
                            container.addClass('math-error-line'); // Add a class to color the line red
                        }
                    }
                    container.appendChild(resultDiv);
                });
            });
        });
    }
    onunload() { }
}
// Custom Modal for extra information
class InfoModal extends Modal {
    constructor(app, result, SolutionInfo) {
        super(app);
        this.result = result;
        this.SolutionInfo = SolutionInfo;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('info-modal-style');
        contentEl.createEl('h2', { text: 'Result Details', cls: 'info-modal-title' });
        const columnContainer = contentEl.createEl('div', { cls: 'info-modal-main-container' });
        // Split the result and solution into lines
        const resultLines = this.result.split('\n');
        const solutionLines = this.SolutionInfo.split('\n');
        resultLines.pop();
        resultLines.forEach((line, index) => {
            const lineContainer = columnContainer.createEl('div', { cls: 'info-modal-line-container' });
            // Left column line (result)
            const leftLine = lineContainer.createEl('div', { cls: 'info-modal-left-line' });
            MarkdownRenderer.renderMarkdown(`\$\\begin{aligned}&${line}\\end{aligned}\$`, leftLine, '', new Component());
            // Right column line (solution)
            const rightLine = lineContainer.createEl('div', { cls: 'info-modal-right-line' });
            MarkdownRenderer.renderMarkdown(`\$\\begin{aligned}&${solutionLines[index] || ''}\\end{aligned}\$`, rightLine, '', new Component());
            //rightLine.innerHTML = `${solutionLines[index] || ''}`; // Ensure that if solutionLines is shorter, it adds an empty line
        });
        // Button container
        const buttonContainer = contentEl.createEl('div', { cls: 'info-modal-Copy-button-container' });
        const actionButton = buttonContainer.createEl('button', { text: 'Copy Details', cls: 'info-modal-Copy-button' });
        actionButton.addEventListener('click', () => {
            navigator.clipboard.writeText(this.result);
            new Notice('Details copied to clipboard!');
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
// Custom Modal for debugging information
class DebugModal extends Modal {
    constructor(app, debugInfo) {
        super(app);
        this.debugInfo = debugInfo;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('custom-modal-style');
        // Render title
        contentEl.createEl('h2', { text: 'Debug Information', cls: 'debug-Modal-title' });
        // Debug information display
        const debugContent = contentEl.createEl('div', { cls: 'debug-info-container' });
        MarkdownRenderer.renderMarkdown(`\`\`\`js\n${this.debugInfo}\n\`\`\``, debugContent, '', new Component());
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi1ERVNLVE9QLUNCOFA3S0QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9tYWluLURFU0tUT1AtQ0I4UDdLRC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsT0FBTyxFQUFFLE1BQU0sRUFBZ0IsZ0JBQWdCLEVBQW1DLEtBQUssRUFBRyxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQzlILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUc3QyxNQUFNLENBQUMsT0FBTyxPQUFPLFVBQVcsU0FBUSxNQUFNO0lBRXRDLE1BQU07O1lBRVYsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLGFBQWEsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUU7Z0JBQ3pFLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUEsR0FBRyxNQUFNLEVBQUUsQ0FBQztnQkFDeEMsSUFBSSxXQUFXLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQzNFLElBQUksV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7b0JBQzVCLFdBQVcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUNyQjtnQkFDRCxJQUFJLFVBQVUsR0FBa0IsSUFBSSxDQUFDLENBQUUsdURBQXVEO2dCQUU5RixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxFQUFFOztvQkFDMUMsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO29CQUVuRSw2Q0FBNkM7b0JBQzdDLElBQUksS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUU7d0JBQ25CLFNBQVMsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7cUJBQ3JDO3lCQUFNO3dCQUNMLFNBQVMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUM7cUJBQ3BDO29CQUVELElBQUksVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRTt3QkFDdEMsTUFBTSxnQkFBZ0IsR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUMzRCxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFFLDBCQUEwQjt3QkFFeEUsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFOzRCQUN4RCxVQUFVLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFFLHNDQUFzQzt5QkFDdEU7NkJBQU07NEJBQ0wsVUFBVSxHQUFHLElBQUksQ0FBQyxDQUFFLG1DQUFtQzt5QkFDeEQ7cUJBQ0Y7b0JBRUQsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztvQkFDbEUsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQztvQkFDcEUsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUV0QyxtQ0FBbUM7b0JBQ25DLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxNQUFNLFVBQVUsQ0FBQyxPQUFPLENBQUMsNERBQTRELEVBQUUsUUFBUSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUUzSixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksTUFBTSxFQUFFO3dCQUNuQyxTQUFTLENBQUMsU0FBUyxHQUFHLDRCQUE0QixNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztxQkFDdEU7eUJBQU0sSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO3dCQUMvRCxTQUFTLENBQUMsU0FBUyxHQUFHOzBDQUNVLE1BQU0sQ0FBQyxRQUFROzs7O2lCQUl4QyxDQUFDO3dCQUNSLE1BQUEsU0FBUyxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQywwQ0FBRSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFOzRCQUN6RSxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUNuRSxDQUFDLENBQUMsQ0FBQzt3QkFFSCxNQUFBLFNBQVMsQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUMsMENBQUUsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTs0QkFDMUUsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ3BELENBQUMsQ0FBQyxDQUFDO3FCQUNKO3lCQUFNO3dCQUNMLFNBQVMsQ0FBQyxTQUFTLEdBQUcsb0ZBQW9GLENBQUM7cUJBQzVHO29CQUVELHVGQUF1RjtvQkFDdkYsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksVUFBVSxLQUFLLElBQUksRUFBRTt3QkFDOUQsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEtBQUssVUFBVSxFQUFFOzRCQUMxRixTQUFTLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBRSxvQ0FBb0M7eUJBQzdFO3FCQUNGO29CQUVELFNBQVMsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ25DLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO0tBQUE7SUFFRCxRQUFRLEtBQUksQ0FBQztDQUNkO0FBSUQscUNBQXFDO0FBQ3JDLE1BQU0sU0FBVSxTQUFRLEtBQUs7SUFHekIsWUFBWSxHQUFRLEVBQUUsTUFBYyxFQUFFLFlBQW9CO1FBQ3RELEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDO0lBQ3JDLENBQUM7SUFDRCxNQUFNO1FBQ0osTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixTQUFTLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDdkMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUU5RSxNQUFNLGVBQWUsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLEdBQUcsRUFBRSwyQkFBMkIsRUFBRSxDQUFDLENBQUM7UUFFeEYsMkNBQTJDO1FBQzNDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtRQUNqQixXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ2hDLE1BQU0sYUFBYSxHQUFHLGVBQWUsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLDJCQUEyQixFQUFFLENBQUMsQ0FBQztZQUU1Riw0QkFBNEI7WUFDNUIsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO1lBQ2hGLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsSUFBSSxrQkFBa0IsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztZQUU3RywrQkFBK0I7WUFDL0IsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1lBQ2xGLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDcEksMEhBQTBIO1FBQzlILENBQUMsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLE1BQU0sZUFBZSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLGtDQUFrQyxFQUFFLENBQUMsQ0FBQztRQUMvRixNQUFNLFlBQVksR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsR0FBRyxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUVqSCxZQUFZLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUN4QyxTQUFTLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0MsSUFBSSxNQUFNLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUMvQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFHQyxPQUFPO1FBQ0gsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdEIsQ0FBQztDQUNKO0FBRUQseUNBQXlDO0FBQ3pDLE1BQU0sVUFBVyxTQUFRLEtBQUs7SUFFNUIsWUFBWSxHQUFRLEVBQUUsU0FBaUI7UUFDbkMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDL0IsQ0FBQztJQUNELE1BQU07UUFDRixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRTNCLFNBQVMsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUN6QyxlQUFlO1FBQ2YsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztRQUVsRiw0QkFBNEI7UUFDNUIsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO1FBQ2hGLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxhQUFhLElBQUksQ0FBQyxTQUFTLFVBQVUsRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztJQUU5RyxDQUFDO0lBQ0QsT0FBTztRQUNILE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3RCLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBsdWdpbiwgTWFya2Rvd25WaWV3LCBNYXJrZG93blJlbmRlcmVyICwgUGx1Z2luU2V0dGluZ1RhYiwgQXBwLCBTZXR0aW5nLCBNb2RhbCwgIE5vdGljZSwgQ29tcG9uZW50IH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgeyBjb250cm9sbGVyIH0gZnJvbSAnLi9tYXRoRW5naW5lLmpzJztcclxuXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRoUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcclxuXHJcbiAgYXN5bmMgb25sb2FkKCkge1xyXG5cclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcignbWF0aC1lbmdpbmUnLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XHJcbiAgICAgIGNvbnN0IHJhd1NvdXJjZSA9IFN0cmluZy5yYXdgJHtzb3VyY2V9YDtcclxuICAgICAgbGV0IGV4cHJlc3Npb25zID0gcmF3U291cmNlLnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpO1xyXG4gICAgICBpZiAoZXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgZXhwcmVzc2lvbnMgPSBbJzAnXTsgXHJcbiAgICAgIH1cclxuICAgICAgbGV0IGxhc3RSZXN1bHQ6IHN0cmluZyB8IG51bGwgPSBudWxsOyAgLy8gVmFyaWFibGUgdG8gc3RvcmUgcmVzdWx0IG9mIGxpbmVzIHN0YXJ0aW5nIHdpdGggJzo6J1xyXG4gICAgICBcclxuICAgICAgZXhwcmVzc2lvbnMuZm9yRWFjaCgoZXhwcmVzc2lvbiwgaW5kZXgpID0+IHtcclxuICAgICAgY29uc3QgY29udGFpbmVyID0gZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1saW5lLWNvbnRhaW5lcicgfSk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBhbHRlcm5hdGluZyByb3cgY29sb3JzIGZvciBkaXN0aW5jdGlvblxyXG4gICAgICAgIGlmIChpbmRleCAlIDIgPT09IDApIHtcclxuICAgICAgICAgIGNvbnRhaW5lci5hZGRDbGFzcygnbWF0aC1yb3ctZXZlbicpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb250YWluZXIuYWRkQ2xhc3MoJ21hdGgtcm93LW9kZCcpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGV4cHJlc3Npb24udHJpbSgpLnN0YXJ0c1dpdGgoJzo6JykpIHtcclxuICAgICAgICAgIGNvbnN0IGFjdHVhbEV4cHJlc3Npb24gPSBleHByZXNzaW9uLnRyaW0oKS5zbGljZSgyKS50cmltKCk7IFxyXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gY29udHJvbGxlcihhY3R1YWxFeHByZXNzaW9uKTsgIC8vIEV2YWx1YXRlIHRoZSBleHByZXNzaW9uXHJcblxyXG4gICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHJlc3VsdCkpIHtcclxuICAgICAgICAgICAgbGFzdFJlc3VsdCA9IHJlc3VsdC5zb2x1dGlvbjsgIC8vIFN0b3JlIHRoZSBzb2x1dGlvbiBmb3IgZnV0dXJlIGxpbmVzXHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBsYXN0UmVzdWx0ID0gbnVsbDsgIC8vIFJlc2V0IGlmIHJlc3VsdCBpcyBub3QgYW4gb2JqZWN0XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGlucHV0RGl2ID0gY29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtaW5wdXQnIH0pO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdERpdiA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdtYXRoLXJlc3VsdCcgfSk7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gY29udHJvbGxlcihleHByZXNzaW9uKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBSZW5kZXIgaW5wdXQgZXhwcmVzc2lvbiBhcyBMYVRlWFxyXG4gICAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYCRcXHske2V4cHJlc3Npb24ucmVwbGFjZSgvKD88IVxcXFx8W2Etel0pKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58c3FydCkvZywgXCJcXFxcXFxcXCQxXCIpfVxcfSRgLCBpbnB1dERpdiwgJycsIHRoaXMpO1xyXG5cclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQpICYmIHJlc3VsdCkge1xyXG4gICAgICAgICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj4ke3Jlc3VsdFswXX08L3NwYW4+YDtcclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHJlc3VsdCkpIHtcclxuICAgICAgICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwibWF0aC1yZXN1bHQtdGV4dFwiPiR7cmVzdWx0LnNvbHV0aW9ufTwvZGl2PlxyXG4gICAgICAgICAgPGRpdiBjbGFzcz1cIm1hdGgtaWNvbnNcIj5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJtYXRoLWluZm8taWNvblwiPvCfm4g8L3NwYW4+XHJcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibWF0aC1kZWJ1Zy1pY29uXCI+8J+Qnjwvc3Bhbj5cclxuICAgICAgICAgIDwvZGl2PmA7XHJcbiAgICAgICAgICByZXN1bHREaXYucXVlcnlTZWxlY3RvcignLm1hdGgtaW5mby1pY29uJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBuZXcgSW5mb01vZGFsKHRoaXMuYXBwLCByZXN1bHQuaW5mbywgcmVzdWx0LnNvbHV0aW9uSW5mbykub3BlbigpO1xyXG4gICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgcmVzdWx0RGl2LnF1ZXJ5U2VsZWN0b3IoJy5tYXRoLWRlYnVnLWljb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCByZXN1bHQuZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj5VbmV4cGVjdGVkIHJlc3VsdCBmb3JtYXQuIFBsZWFzZSBjaGVjayB5b3VyIGlucHV0Ljwvc3Bhbj5gO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIGxpbmUgZG9lcyBub3Qgc3RhcnQgd2l0aCBcIjo6XCIsIGNvbXBhcmUgaXRzIHJlc3VsdCB3aXRoIHRoZSBsYXN0IHN0b3JlZCByZXN1bHRcclxuICAgICAgICBpZiAoIWV4cHJlc3Npb24udHJpbSgpLnN0YXJ0c1dpdGgoJzo6JykgJiYgbGFzdFJlc3VsdCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHJlc3VsdCkgJiYgcmVzdWx0LnNvbHV0aW9uICE9PSBsYXN0UmVzdWx0KSB7XHJcbiAgICAgICAgICAgIGNvbnRhaW5lci5hZGRDbGFzcygnbWF0aC1lcnJvci1saW5lJyk7ICAvLyBBZGQgYSBjbGFzcyB0byBjb2xvciB0aGUgbGluZSByZWRcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChyZXN1bHREaXYpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgb251bmxvYWQoKSB7fVxyXG59XHJcblxyXG5cclxuXHJcbi8vIEN1c3RvbSBNb2RhbCBmb3IgZXh0cmEgaW5mb3JtYXRpb25cclxuY2xhc3MgSW5mb01vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gICAgcmVzdWx0OiBzdHJpbmc7XHJcbiAgICBTb2x1dGlvbkluZm86IHN0cmluZztcclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLCByZXN1bHQ6IHN0cmluZywgU29sdXRpb25JbmZvOiBzdHJpbmcpIHtcclxuICAgICAgICBzdXBlcihhcHApO1xyXG4gICAgICAgIHRoaXMucmVzdWx0ID0gcmVzdWx0O1xyXG4gICAgICAgIHRoaXMuU29sdXRpb25JbmZvID0gU29sdXRpb25JbmZvO1xyXG4gICAgfVxyXG4gICAgb25PcGVuKCkge1xyXG4gICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgICAgY29udGVudEVsLmFkZENsYXNzKCdpbmZvLW1vZGFsLXN0eWxlJyk7XHJcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdSZXN1bHQgRGV0YWlscycsIGNsczogJ2luZm8tbW9kYWwtdGl0bGUnIH0pO1xyXG4gIFxyXG4gICAgICBjb25zdCBjb2x1bW5Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnaW5mby1tb2RhbC1tYWluLWNvbnRhaW5lcicgfSk7XHJcbiAgXHJcbiAgICAgIC8vIFNwbGl0IHRoZSByZXN1bHQgYW5kIHNvbHV0aW9uIGludG8gbGluZXNcclxuICAgICAgY29uc3QgcmVzdWx0TGluZXMgPSB0aGlzLnJlc3VsdC5zcGxpdCgnXFxuJyk7XHJcbiAgICAgIGNvbnN0IHNvbHV0aW9uTGluZXMgPSB0aGlzLlNvbHV0aW9uSW5mby5zcGxpdCgnXFxuJyk7XHJcbiAgICAgIHJlc3VsdExpbmVzLnBvcCgpXHJcbiAgICAgIHJlc3VsdExpbmVzLmZvckVhY2goKGxpbmUsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBsaW5lQ29udGFpbmVyID0gY29sdW1uQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2luZm8tbW9kYWwtbGluZS1jb250YWluZXInIH0pO1xyXG4gIFxyXG4gICAgICAgICAgLy8gTGVmdCBjb2x1bW4gbGluZSAocmVzdWx0KVxyXG4gICAgICAgICAgY29uc3QgbGVmdExpbmUgPSBsaW5lQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2luZm8tbW9kYWwtbGVmdC1saW5lJyB9KTtcclxuICAgICAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcJFxcXFxiZWdpbnthbGlnbmVkfSYke2xpbmV9XFxcXGVuZHthbGlnbmVkfVxcJGAsIGxlZnRMaW5lLCAnJywgbmV3IENvbXBvbmVudCgpKTtcclxuICBcclxuICAgICAgICAgIC8vIFJpZ2h0IGNvbHVtbiBsaW5lIChzb2x1dGlvbilcclxuICAgICAgICAgIGNvbnN0IHJpZ2h0TGluZSA9IGxpbmVDb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnaW5mby1tb2RhbC1yaWdodC1saW5lJyB9KTtcclxuICAgICAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcJFxcXFxiZWdpbnthbGlnbmVkfSYke3NvbHV0aW9uTGluZXNbaW5kZXhdIHx8ICcnfVxcXFxlbmR7YWxpZ25lZH1cXCRgLCByaWdodExpbmUsICcnLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gICAgICAgICAgLy9yaWdodExpbmUuaW5uZXJIVE1MID0gYCR7c29sdXRpb25MaW5lc1tpbmRleF0gfHwgJyd9YDsgLy8gRW5zdXJlIHRoYXQgaWYgc29sdXRpb25MaW5lcyBpcyBzaG9ydGVyLCBpdCBhZGRzIGFuIGVtcHR5IGxpbmVcclxuICAgICAgfSk7XHJcbiAgXHJcbiAgICAgIC8vIEJ1dHRvbiBjb250YWluZXJcclxuICAgICAgY29uc3QgYnV0dG9uQ29udGFpbmVyID0gY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2luZm8tbW9kYWwtQ29weS1idXR0b24tY29udGFpbmVyJyB9KTtcclxuICAgICAgY29uc3QgYWN0aW9uQnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdDb3B5IERldGFpbHMnLCBjbHM6ICdpbmZvLW1vZGFsLUNvcHktYnV0dG9uJyB9KTtcclxuICAgICAgXHJcbiAgICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRoaXMucmVzdWx0KTtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoJ0RldGFpbHMgY29waWVkIHRvIGNsaXBib2FyZCEnKTtcclxuICAgICAgfSk7XHJcbiAgfVxyXG4gIFxyXG4gIFxyXG4gICAgb25DbG9zZSgpIHtcclxuICAgICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgICAgICBjb250ZW50RWwuZW1wdHkoKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gQ3VzdG9tIE1vZGFsIGZvciBkZWJ1Z2dpbmcgaW5mb3JtYXRpb25cclxuY2xhc3MgRGVidWdNb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBkZWJ1Z0luZm86IHN0cmluZztcclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgZGVidWdJbmZvOiBzdHJpbmcpIHtcclxuICAgICAgc3VwZXIoYXBwKTtcclxuICAgICAgdGhpcy5kZWJ1Z0luZm8gPSBkZWJ1Z0luZm87XHJcbiAgfVxyXG4gIG9uT3BlbigpIHtcclxuICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcblxyXG4gICAgICBjb250ZW50RWwuYWRkQ2xhc3MoJ2N1c3RvbS1tb2RhbC1zdHlsZScpO1xyXG4gICAgICAvLyBSZW5kZXIgdGl0bGVcclxuICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ0RlYnVnIEluZm9ybWF0aW9uJywgY2xzOiAnZGVidWctTW9kYWwtdGl0bGUnIH0pO1xyXG5cclxuICAgICAgLy8gRGVidWcgaW5mb3JtYXRpb24gZGlzcGxheVxyXG4gICAgICBjb25zdCBkZWJ1Z0NvbnRlbnQgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnZGVidWctaW5mby1jb250YWluZXInIH0pO1xyXG4gICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXGBcXGBcXGBqc1xcbiR7dGhpcy5kZWJ1Z0luZm99XFxuXFxgXFxgXFxgYCwgZGVidWdDb250ZW50LCAnJywgbmV3IENvbXBvbmVudCgpKTtcclxuXHJcbiAgfVxyXG4gIG9uQ2xvc2UoKSB7XHJcbiAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICBjb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuIl19