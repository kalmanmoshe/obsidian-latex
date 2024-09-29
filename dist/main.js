import { __awaiter } from "tslib";
import { Plugin, MarkdownRenderer, Modal, Notice, Component } from 'obsidian';
import { controller } from './mathEngine.js';
export default class MathPlugin extends Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.registerMarkdownCodeBlockProcessor('math-engine', (source, el, ctx) => {
                const rawSource = String.raw `${source}`;
                const expressions = rawSource.split('\n');
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
                    // Check if the line starts with "::"
                    if (expression.trim().startsWith('::')) {
                        const actualExpression = expression.trim().slice(2).trim(); // Remove the "::" for evaluation
                        const result = controller(actualExpression); // Evaluate the expression
                        if (typeof result === 'object' && !Array.isArray(result)) {
                            lastResult = result.Solution; // Store the solution for future lines
                        }
                        else {
                            lastResult = null; // Reset if result is not an object
                        }
                    }
                    const inputDiv = container.createEl('div', { cls: 'math-input' });
                    const resultDiv = container.createEl('div', { cls: 'math-result-separate' });
                    const result = controller(expression);
                    // Render input expression as LaTeX
                    MarkdownRenderer.renderMarkdown(`$\{${expression.replace(/(?<!\\)(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\$1")}\}$`, inputDiv, '', this);
                    if (Array.isArray(result) && result.length > 0) {
                        resultDiv.innerHTML = `<span class="error-text">Error: ${result[0]}</span>`;
                    }
                    else if (typeof result === 'object' && !Array.isArray(result)) {
                        resultDiv.innerHTML = `<span class="math-result-text">${result.Solution}</span> <span class="math-result-icon">🛈</span> <span class="math-debug-icon">🐞</span>`;
                        (_a = resultDiv.querySelector('.math-result-icon')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
                            new InfoModal(this.app, result.info, result.SolutionInfo).open();
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
                        if (typeof result === 'object' && !Array.isArray(result) && result.Solution !== lastResult) {
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
        contentEl.addClass('custom-modal-style');
        // Render title
        contentEl.createEl('h2', { text: 'Result Details', cls: 'modal-title' });
        // Create a flex container for two columns
        const columnContainer = contentEl.createEl('div', { cls: 'column-container' });
        // Left column (e.g., results)
        const leftColumn = columnContainer.createEl('div', { cls: 'left-column' });
        leftColumn.innerHTML = `${this.result.replace(/\n/g, '<br>')}`;
        // Right column (e.g., actions or additional info)
        const rightColumn = columnContainer.createEl('div', { cls: 'right-column' });
        rightColumn.innerHTML = `${this.SolutionInfo.replace(/\n/g, '<br>')}`;
        // Button container
        const buttonContainer = contentEl.createEl('div', { cls: 'button-container' });
        const actionButton = buttonContainer.createEl('button', { text: 'Copy Details', cls: 'modal-action-button' });
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
        contentEl.createEl('h2', { text: 'Debug Information', cls: 'modal-title' });
        // Debug information display
        const debugContent = contentEl.createEl('div', { cls: 'debug-info-container' });
        MarkdownRenderer.renderMarkdown(`\`\`\`js\n${this.debugInfo}\n\`\`\``, debugContent, '', new Component());
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQWdCLGdCQUFnQixFQUFtQyxLQUFLLEVBQUcsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUM5SCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFHN0MsTUFBTSxDQUFDLE9BQU8sT0FBTyxVQUFXLFNBQVEsTUFBTTtJQUV0QyxNQUFNOztZQUVWLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFO2dCQUN6RSxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFBLEdBQUcsTUFBTSxFQUFFLENBQUM7Z0JBQ3hDLE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzFDLElBQUksVUFBVSxHQUFrQixJQUFJLENBQUMsQ0FBRSx1REFBdUQ7Z0JBRTlGLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLEVBQUU7O29CQUN4QyxNQUFNLFNBQVMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLEdBQUcsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7b0JBRXJFLDZDQUE2QztvQkFDN0MsSUFBSSxLQUFLLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRTt3QkFDbkIsU0FBUyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztxQkFDckM7eUJBQU07d0JBQ0wsU0FBUyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQztxQkFDcEM7b0JBRUQscUNBQXFDO29CQUNyQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUU7d0JBQ3RDLE1BQU0sZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLGlDQUFpQzt3QkFDN0YsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBRSwwQkFBMEI7d0JBRXhFLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTs0QkFDeEQsVUFBVSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBRSxzQ0FBc0M7eUJBQ3RFOzZCQUFNOzRCQUNMLFVBQVUsR0FBRyxJQUFJLENBQUMsQ0FBRSxtQ0FBbUM7eUJBQ3hEO3FCQUNGO29CQUVELE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7b0JBQ2xFLE1BQU0sU0FBUyxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLHNCQUFzQixFQUFFLENBQUMsQ0FBQztvQkFDN0UsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUV0QyxtQ0FBbUM7b0JBQ25DLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxNQUFNLFVBQVUsQ0FBQyxPQUFPLENBQUMsc0RBQXNELEVBQUUsTUFBTSxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUVuSixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7d0JBQzlDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsbUNBQW1DLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO3FCQUM3RTt5QkFBTSxJQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7d0JBQy9ELFNBQVMsQ0FBQyxTQUFTLEdBQUcsa0NBQWtDLE1BQU0sQ0FBQyxRQUFRLDBGQUEwRixDQUFDO3dCQUVsSyxNQUFBLFNBQVMsQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUMsMENBQUUsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTs0QkFDM0UsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDbkUsQ0FBQyxDQUFDLENBQUM7d0JBRUgsTUFBQSxTQUFTLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLDBDQUFFLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7NEJBQzFFLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUNwRCxDQUFDLENBQUMsQ0FBQztxQkFDSjt5QkFBTTt3QkFDTCxTQUFTLENBQUMsU0FBUyxHQUFHLG9GQUFvRixDQUFDO3FCQUM1RztvQkFFRCx1RkFBdUY7b0JBQ3ZGLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsS0FBSyxJQUFJLEVBQUU7d0JBQzlELElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsUUFBUSxLQUFLLFVBQVUsRUFBRTs0QkFDMUYsU0FBUyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUUsb0NBQW9DO3lCQUM3RTtxQkFDRjtvQkFFRCxTQUFTLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNuQyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztLQUFBO0lBRUQsUUFBUSxLQUFJLENBQUM7Q0FDZDtBQUlELHFDQUFxQztBQUNyQyxNQUFNLFNBQVUsU0FBUSxLQUFLO0lBR3pCLFlBQVksR0FBUSxFQUFFLE1BQWMsRUFBRSxZQUFvQjtRQUN0RCxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztJQUNyQyxDQUFDO0lBQ0QsTUFBTTtRQUNGLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFM0IsU0FBUyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3pDLGVBQWU7UUFDZixTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUV6RSwwQ0FBMEM7UUFDMUMsTUFBTSxlQUFlLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBRS9FLDhCQUE4QjtRQUM5QixNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLFVBQVUsQ0FBQyxTQUFTLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUUvRCxrREFBa0Q7UUFDbEQsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxHQUFHLEVBQUUsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUM3RSxXQUFXLENBQUMsU0FBUyxHQUFHLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFFdEUsbUJBQW1CO1FBQ25CLE1BQU0sZUFBZSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUMvRSxNQUFNLFlBQVksR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsR0FBRyxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUM5RyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUN4QyxTQUFTLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0MsSUFBSSxNQUFNLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUMvQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxPQUFPO1FBQ0gsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdEIsQ0FBQztDQUNKO0FBRUQseUNBQXlDO0FBQ3pDLE1BQU0sVUFBVyxTQUFRLEtBQUs7SUFFNUIsWUFBWSxHQUFRLEVBQUUsU0FBaUI7UUFDbkMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDL0IsQ0FBQztJQUNELE1BQU07UUFDRixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBRTNCLFNBQVMsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUN6QyxlQUFlO1FBQ2YsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFFNUUsNEJBQTRCO1FBQzVCLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLHNCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNoRixnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsYUFBYSxJQUFJLENBQUMsU0FBUyxVQUFVLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFFOUcsQ0FBQztJQUNELE9BQU87UUFDSCxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN0QixDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQbHVnaW4sIE1hcmtkb3duVmlldywgTWFya2Rvd25SZW5kZXJlciAsIFBsdWdpblNldHRpbmdUYWIsIEFwcCwgU2V0dGluZywgTW9kYWwsICBOb3RpY2UsIENvbXBvbmVudCB9IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IHsgY29udHJvbGxlciB9IGZyb20gJy4vbWF0aEVuZ2luZS5qcyc7XHJcblxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWF0aFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHJcblxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcclxuXHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ21hdGgtZW5naW5lJywgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xyXG4gICAgICBjb25zdCByYXdTb3VyY2UgPSBTdHJpbmcucmF3YCR7c291cmNlfWA7XHJcbiAgICAgIGNvbnN0IGV4cHJlc3Npb25zID0gcmF3U291cmNlLnNwbGl0KCdcXG4nKTtcclxuICAgICAgbGV0IGxhc3RSZXN1bHQ6IHN0cmluZyB8IG51bGwgPSBudWxsOyAgLy8gVmFyaWFibGUgdG8gc3RvcmUgcmVzdWx0IG9mIGxpbmVzIHN0YXJ0aW5nIHdpdGggJzo6J1xyXG5cclxuICAgICAgZXhwcmVzc2lvbnMuZm9yRWFjaCgoZXhwcmVzc2lvbiwgaW5kZXgpID0+IHtcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBlbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdtYXRoLWxpbmUtY29udGFpbmVyJyB9KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGFsdGVybmF0aW5nIHJvdyBjb2xvcnMgZm9yIGRpc3RpbmN0aW9uXHJcbiAgICAgICAgaWYgKGluZGV4ICUgMiA9PT0gMCkge1xyXG4gICAgICAgICAgY29udGFpbmVyLmFkZENsYXNzKCdtYXRoLXJvdy1ldmVuJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbnRhaW5lci5hZGRDbGFzcygnbWF0aC1yb3ctb2RkJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgbGluZSBzdGFydHMgd2l0aCBcIjo6XCJcclxuICAgICAgICBpZiAoZXhwcmVzc2lvbi50cmltKCkuc3RhcnRzV2l0aCgnOjonKSkge1xyXG4gICAgICAgICAgY29uc3QgYWN0dWFsRXhwcmVzc2lvbiA9IGV4cHJlc3Npb24udHJpbSgpLnNsaWNlKDIpLnRyaW0oKTsgLy8gUmVtb3ZlIHRoZSBcIjo6XCIgZm9yIGV2YWx1YXRpb25cclxuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGNvbnRyb2xsZXIoYWN0dWFsRXhwcmVzc2lvbik7ICAvLyBFdmFsdWF0ZSB0aGUgZXhwcmVzc2lvblxyXG5cclxuICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XHJcbiAgICAgICAgICAgIGxhc3RSZXN1bHQgPSByZXN1bHQuU29sdXRpb247ICAvLyBTdG9yZSB0aGUgc29sdXRpb24gZm9yIGZ1dHVyZSBsaW5lc1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbGFzdFJlc3VsdCA9IG51bGw7ICAvLyBSZXNldCBpZiByZXN1bHQgaXMgbm90IGFuIG9iamVjdFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW5wdXREaXYgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1pbnB1dCcgfSk7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0RGl2ID0gY29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtcmVzdWx0LXNlcGFyYXRlJyB9KTtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBjb250cm9sbGVyKGV4cHJlc3Npb24pO1xyXG5cclxuICAgICAgICAvLyBSZW5kZXIgaW5wdXQgZXhwcmVzc2lvbiBhcyBMYVRlWFxyXG4gICAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYCRcXHske2V4cHJlc3Npb24ucmVwbGFjZSgvKD88IVxcXFwpKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58c3FydCkvZywgXCJcXFxcJDFcIil9XFx9JGAsIGlucHV0RGl2LCAnJywgdGhpcyk7XHJcblxyXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlc3VsdCkgJiYgcmVzdWx0Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+RXJyb3I6ICR7cmVzdWx0WzBdfTwvc3Bhbj5gO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkocmVzdWx0KSkge1xyXG4gICAgICAgICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cIm1hdGgtcmVzdWx0LXRleHRcIj4ke3Jlc3VsdC5Tb2x1dGlvbn08L3NwYW4+IDxzcGFuIGNsYXNzPVwibWF0aC1yZXN1bHQtaWNvblwiPvCfm4g8L3NwYW4+IDxzcGFuIGNsYXNzPVwibWF0aC1kZWJ1Zy1pY29uXCI+8J+Qnjwvc3Bhbj5gO1xyXG5cclxuICAgICAgICAgIHJlc3VsdERpdi5xdWVyeVNlbGVjdG9yKCcubWF0aC1yZXN1bHQtaWNvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgbmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgcmVzdWx0LmluZm8sIHJlc3VsdC5Tb2x1dGlvbkluZm8pLm9wZW4oKTtcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIHJlc3VsdERpdi5xdWVyeVNlbGVjdG9yKCcubWF0aC1kZWJ1Zy1pY29uJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgcmVzdWx0LmRlYnVnSW5mbykub3BlbigpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+VW5leHBlY3RlZCByZXN1bHQgZm9ybWF0LiBQbGVhc2UgY2hlY2sgeW91ciBpbnB1dC48L3NwYW4+YDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSBsaW5lIGRvZXMgbm90IHN0YXJ0IHdpdGggXCI6OlwiLCBjb21wYXJlIGl0cyByZXN1bHQgd2l0aCB0aGUgbGFzdCBzdG9yZWQgcmVzdWx0XHJcbiAgICAgICAgaWYgKCFleHByZXNzaW9uLnRyaW0oKS5zdGFydHNXaXRoKCc6OicpICYmIGxhc3RSZXN1bHQgIT09IG51bGwpIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyZXN1bHQpICYmIHJlc3VsdC5Tb2x1dGlvbiAhPT0gbGFzdFJlc3VsdCkge1xyXG4gICAgICAgICAgICBjb250YWluZXIuYWRkQ2xhc3MoJ21hdGgtZXJyb3ItbGluZScpOyAgLy8gQWRkIGEgY2xhc3MgdG8gY29sb3IgdGhlIGxpbmUgcmVkXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocmVzdWx0RGl2KTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIG9udW5sb2FkKCkge31cclxufVxyXG5cclxuXHJcblxyXG4vLyBDdXN0b20gTW9kYWwgZm9yIGV4dHJhIGluZm9ybWF0aW9uXHJcbmNsYXNzIEluZm9Nb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICAgIHJlc3VsdDogc3RyaW5nO1xyXG4gICAgU29sdXRpb25JbmZvOiBzdHJpbmc7XHJcbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcmVzdWx0OiBzdHJpbmcsIFNvbHV0aW9uSW5mbzogc3RyaW5nKSB7XHJcbiAgICAgICAgc3VwZXIoYXBwKTtcclxuICAgICAgICB0aGlzLnJlc3VsdCA9IHJlc3VsdDtcclxuICAgICAgICB0aGlzLlNvbHV0aW9uSW5mbyA9IFNvbHV0aW9uSW5mbztcclxuICAgIH1cclxuICAgIG9uT3BlbigpIHtcclxuICAgICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuXHJcbiAgICAgICAgY29udGVudEVsLmFkZENsYXNzKCdjdXN0b20tbW9kYWwtc3R5bGUnKTtcclxuICAgICAgICAvLyBSZW5kZXIgdGl0bGVcclxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnUmVzdWx0IERldGFpbHMnLCBjbHM6ICdtb2RhbC10aXRsZScgfSk7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBhIGZsZXggY29udGFpbmVyIGZvciB0d28gY29sdW1uc1xyXG4gICAgICAgIGNvbnN0IGNvbHVtbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdjb2x1bW4tY29udGFpbmVyJyB9KTtcclxuXHJcbiAgICAgICAgLy8gTGVmdCBjb2x1bW4gKGUuZy4sIHJlc3VsdHMpXHJcbiAgICAgICAgY29uc3QgbGVmdENvbHVtbiA9IGNvbHVtbkNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdsZWZ0LWNvbHVtbicgfSk7XHJcbiAgICAgICAgbGVmdENvbHVtbi5pbm5lckhUTUwgPSBgJHt0aGlzLnJlc3VsdC5yZXBsYWNlKC9cXG4vZywgJzxicj4nKX1gO1xyXG5cclxuICAgICAgICAvLyBSaWdodCBjb2x1bW4gKGUuZy4sIGFjdGlvbnMgb3IgYWRkaXRpb25hbCBpbmZvKVxyXG4gICAgICAgIGNvbnN0IHJpZ2h0Q29sdW1uID0gY29sdW1uQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3JpZ2h0LWNvbHVtbicgfSk7XHJcbiAgICAgICAgcmlnaHRDb2x1bW4uaW5uZXJIVE1MID0gYCR7dGhpcy5Tb2x1dGlvbkluZm8ucmVwbGFjZSgvXFxuL2csICc8YnI+Jyl9YDtcclxuXHJcbiAgICAgICAgLy8gQnV0dG9uIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdidXR0b24tY29udGFpbmVyJyB9KTtcclxuICAgICAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0NvcHkgRGV0YWlscycsIGNsczogJ21vZGFsLWFjdGlvbi1idXR0b24nIH0pO1xyXG4gICAgICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy5yZXN1bHQpO1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKCdEZXRhaWxzIGNvcGllZCB0byBjbGlwYm9hcmQhJyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBvbkNsb3NlKCkge1xyXG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBDdXN0b20gTW9kYWwgZm9yIGRlYnVnZ2luZyBpbmZvcm1hdGlvblxyXG5jbGFzcyBEZWJ1Z01vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIGRlYnVnSW5mbzogc3RyaW5nO1xyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBkZWJ1Z0luZm86IHN0cmluZykge1xyXG4gICAgICBzdXBlcihhcHApO1xyXG4gICAgICB0aGlzLmRlYnVnSW5mbyA9IGRlYnVnSW5mbztcclxuICB9XHJcbiAgb25PcGVuKCkge1xyXG4gICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuXHJcbiAgICAgIGNvbnRlbnRFbC5hZGRDbGFzcygnY3VzdG9tLW1vZGFsLXN0eWxlJyk7XHJcbiAgICAgIC8vIFJlbmRlciB0aXRsZVxyXG4gICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnRGVidWcgSW5mb3JtYXRpb24nLCBjbHM6ICdtb2RhbC10aXRsZScgfSk7XHJcblxyXG4gICAgICAvLyBEZWJ1ZyBpbmZvcm1hdGlvbiBkaXNwbGF5XHJcbiAgICAgIGNvbnN0IGRlYnVnQ29udGVudCA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdkZWJ1Zy1pbmZvLWNvbnRhaW5lcicgfSk7XHJcbiAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcYFxcYFxcYGpzXFxuJHt0aGlzLmRlYnVnSW5mb31cXG5cXGBcXGBcXGBgLCBkZWJ1Z0NvbnRlbnQsICcnLCBuZXcgQ29tcG9uZW50KCkpO1xyXG5cclxuICB9XHJcbiAgb25DbG9zZSgpIHtcclxuICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG4iXX0=