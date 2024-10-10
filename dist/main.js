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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQWdCLGdCQUFnQixFQUFtQyxLQUFLLEVBQUcsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUM5SCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFHN0MsTUFBTSxDQUFDLE9BQU8sT0FBTyxVQUFXLFNBQVEsTUFBTTtJQUV0QyxNQUFNOztZQUVWLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFO2dCQUN6RSxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFBLEdBQUcsTUFBTSxFQUFFLENBQUM7Z0JBQ3hDLElBQUksV0FBVyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUMzRSxJQUFJLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO29CQUM1QixXQUFXLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDckI7Z0JBQ0QsSUFBSSxVQUFVLEdBQWtCLElBQUksQ0FBQyxDQUFFLHVEQUF1RDtnQkFFOUYsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsRUFBRTs7b0JBQzFDLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztvQkFFbkUsNkNBQTZDO29CQUM3QyxJQUFJLEtBQUssR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFO3dCQUNuQixTQUFTLENBQUMsUUFBUSxDQUFD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LEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3RCLENBQUM7Q0FDSjtBQUVELHlDQUF5QztBQUN6QyxNQUFNLFVBQVcsU0FBUSxLQUFLO0lBRTVCLFlBQVksR0FBUSxFQUFFLFNBQWlCO1FBQ25DLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO0lBQy9CLENBQUM7SUFDRCxNQUFNO1FBQ0YsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUUzQixTQUFTLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDekMsZUFBZTtRQUNmLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUM7UUFFbEYsNEJBQTRCO1FBQzVCLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLHNCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNoRixnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsYUFBYSxJQUFJLENBQUMsU0FBUyxVQUFVLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFFOUcsQ0FBQztJQUNELE9BQU87UUFDSCxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN0QixDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQbHVnaW4sIE1hcmtkb3duVmlldywgTWFya2Rvd25SZW5kZXJlciAsIFBsdWdpblNldHRpbmdUYWIsIEFwcCwgU2V0dGluZywgTW9kYWwsICBOb3RpY2UsIENvbXBvbmVudCB9IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IHsgY29udHJvbGxlciB9IGZyb20gJy4vbWF0aEVuZ2luZS5qcyc7XHJcblxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWF0aFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHJcblxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcclxuXHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ21hdGgtZW5naW5lJywgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xyXG4gICAgICBjb25zdCByYXdTb3VyY2UgPSBTdHJpbmcucmF3YCR7c291cmNlfWA7XHJcbiAgICAgIGxldCBleHByZXNzaW9ucyA9IHJhd1NvdXJjZS5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKTtcclxuICAgICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGV4cHJlc3Npb25zID0gWycwJ107IFxyXG4gICAgICB9XHJcbiAgICAgIGxldCBsYXN0UmVzdWx0OiBzdHJpbmcgfCBudWxsID0gbnVsbDsgIC8vIFZhcmlhYmxlIHRvIHN0b3JlIHJlc3VsdCBvZiBsaW5lcyBzdGFydGluZyB3aXRoICc6OidcclxuICAgICAgXHJcbiAgICAgIGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XHJcbiAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtbGluZS1jb250YWluZXInIH0pO1xyXG5cclxuICAgICAgICAvLyBBZGQgYWx0ZXJuYXRpbmcgcm93IGNvbG9ycyBmb3IgZGlzdGluY3Rpb25cclxuICAgICAgICBpZiAoaW5kZXggJSAyID09PSAwKSB7XHJcbiAgICAgICAgICBjb250YWluZXIuYWRkQ2xhc3MoJ21hdGgtcm93LWV2ZW4nKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29udGFpbmVyLmFkZENsYXNzKCdtYXRoLXJvdy1vZGQnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChleHByZXNzaW9uLnRyaW0oKS5zdGFydHNXaXRoKCc6OicpKSB7XHJcbiAgICAgICAgICBjb25zdCBhY3R1YWxFeHByZXNzaW9uID0gZXhwcmVzc2lvbi50cmltKCkuc2xpY2UoMikudHJpbSgpOyBcclxuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGNvbnRyb2xsZXIoYWN0dWFsRXhwcmVzc2lvbik7ICAvLyBFdmFsdWF0ZSB0aGUgZXhwcmVzc2lvblxyXG5cclxuICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XHJcbiAgICAgICAgICAgIGxhc3RSZXN1bHQgPSByZXN1bHQuc29sdXRpb247ICAvLyBTdG9yZSB0aGUgc29sdXRpb24gZm9yIGZ1dHVyZSBsaW5lc1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbGFzdFJlc3VsdCA9IG51bGw7ICAvLyBSZXNldCBpZiByZXN1bHQgaXMgbm90IGFuIG9iamVjdFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBpbnB1dERpdiA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdtYXRoLWlucHV0JyB9KTtcclxuICAgICAgICBjb25zdCByZXN1bHREaXYgPSBjb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1yZXN1bHQnIH0pO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGNvbnRyb2xsZXIoZXhwcmVzc2lvbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUmVuZGVyIGlucHV0IGV4cHJlc3Npb24gYXMgTGFUZVhcclxuICAgICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGAkXFx7JHtleHByZXNzaW9uLnJlcGxhY2UoLyg/PCFcXFxcfFthLXpdKSh0YW58c2lufGNvc3xiaW5vbXxmcmFjfGFzaW58YWNvc3xhdGFufHNxcnQpL2csIFwiXFxcXFxcXFwkMVwiKX1cXH0kYCwgaW5wdXREaXYsICcnLCB0aGlzKTtcclxuXHJcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVzdWx0KSAmJiByZXN1bHQpIHtcclxuICAgICAgICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+JHtyZXN1bHRbMF19PC9zcGFuPmA7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XHJcbiAgICAgICAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYFxyXG4gICAgICAgICAgPGRpdiBjbGFzcz1cIm1hdGgtcmVzdWx0LXRleHRcIj4ke3Jlc3VsdC5zb2x1dGlvbn08L2Rpdj5cclxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJtYXRoLWljb25zXCI+XHJcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibWF0aC1pbmZvLWljb25cIj7wn5uIPC9zcGFuPlxyXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cIm1hdGgtZGVidWctaWNvblwiPvCfkJ48L3NwYW4+XHJcbiAgICAgICAgICA8L2Rpdj5gO1xyXG4gICAgICAgICAgcmVzdWx0RGl2LnF1ZXJ5U2VsZWN0b3IoJy5tYXRoLWluZm8taWNvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgbmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgcmVzdWx0LmluZm8sIHJlc3VsdC5zb2x1dGlvbkluZm8pLm9wZW4oKTtcclxuICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgIHJlc3VsdERpdi5xdWVyeVNlbGVjdG9yKCcubWF0aC1kZWJ1Zy1pY29uJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xyXG4gICAgICAgICAgICBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgcmVzdWx0LmRlYnVnSW5mbykub3BlbigpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+VW5leHBlY3RlZCByZXN1bHQgZm9ybWF0LiBQbGVhc2UgY2hlY2sgeW91ciBpbnB1dC48L3NwYW4+YDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSBsaW5lIGRvZXMgbm90IHN0YXJ0IHdpdGggXCI6OlwiLCBjb21wYXJlIGl0cyByZXN1bHQgd2l0aCB0aGUgbGFzdCBzdG9yZWQgcmVzdWx0XHJcbiAgICAgICAgaWYgKCFleHByZXNzaW9uLnRyaW0oKS5zdGFydHNXaXRoKCc6OicpICYmIGxhc3RSZXN1bHQgIT09IG51bGwpIHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyZXN1bHQpICYmIHJlc3VsdC5zb2x1dGlvbiAhPT0gbGFzdFJlc3VsdCkge1xyXG4gICAgICAgICAgICBjb250YWluZXIuYWRkQ2xhc3MoJ21hdGgtZXJyb3ItbGluZScpOyAgLy8gQWRkIGEgY2xhc3MgdG8gY29sb3IgdGhlIGxpbmUgcmVkXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocmVzdWx0RGl2KTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIG9udW5sb2FkKCkge31cclxufVxyXG5cclxuXHJcblxyXG4vLyBDdXN0b20gTW9kYWwgZm9yIGV4dHJhIGluZm9ybWF0aW9uXHJcbmNsYXNzIEluZm9Nb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICAgIHJlc3VsdDogc3RyaW5nO1xyXG4gICAgU29sdXRpb25JbmZvOiBzdHJpbmc7XHJcbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcmVzdWx0OiBzdHJpbmcsIFNvbHV0aW9uSW5mbzogc3RyaW5nKSB7XHJcbiAgICAgICAgc3VwZXIoYXBwKTtcclxuICAgICAgICB0aGlzLnJlc3VsdCA9IHJlc3VsdDtcclxuICAgICAgICB0aGlzLlNvbHV0aW9uSW5mbyA9IFNvbHV0aW9uSW5mbztcclxuICAgIH1cclxuICAgIG9uT3BlbigpIHtcclxuICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgIGNvbnRlbnRFbC5hZGRDbGFzcygnaW5mby1tb2RhbC1zdHlsZScpO1xyXG4gICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnUmVzdWx0IERldGFpbHMnLCBjbHM6ICdpbmZvLW1vZGFsLXRpdGxlJyB9KTtcclxuICBcclxuICAgICAgY29uc3QgY29sdW1uQ29udGFpbmVyID0gY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2luZm8tbW9kYWwtbWFpbi1jb250YWluZXInIH0pO1xyXG4gIFxyXG4gICAgICAvLyBTcGxpdCB0aGUgcmVzdWx0IGFuZCBzb2x1dGlvbiBpbnRvIGxpbmVzXHJcbiAgICAgIGNvbnN0IHJlc3VsdExpbmVzID0gdGhpcy5yZXN1bHQuc3BsaXQoJ1xcbicpO1xyXG4gICAgICBjb25zdCBzb2x1dGlvbkxpbmVzID0gdGhpcy5Tb2x1dGlvbkluZm8uc3BsaXQoJ1xcbicpO1xyXG4gICAgICByZXN1bHRMaW5lcy5wb3AoKVxyXG4gICAgICByZXN1bHRMaW5lcy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgbGluZUNvbnRhaW5lciA9IGNvbHVtbkNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLWxpbmUtY29udGFpbmVyJyB9KTtcclxuICBcclxuICAgICAgICAgIC8vIExlZnQgY29sdW1uIGxpbmUgKHJlc3VsdClcclxuICAgICAgICAgIGNvbnN0IGxlZnRMaW5lID0gbGluZUNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLWxlZnQtbGluZScgfSk7XHJcbiAgICAgICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCRcXFxcYmVnaW57YWxpZ25lZH0mJHtsaW5lfVxcXFxlbmR7YWxpZ25lZH1cXCRgLCBsZWZ0TGluZSwgJycsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgXHJcbiAgICAgICAgICAvLyBSaWdodCBjb2x1bW4gbGluZSAoc29sdXRpb24pXHJcbiAgICAgICAgICBjb25zdCByaWdodExpbmUgPSBsaW5lQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2luZm8tbW9kYWwtcmlnaHQtbGluZScgfSk7XHJcbiAgICAgICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCRcXFxcYmVnaW57YWxpZ25lZH0mJHtzb2x1dGlvbkxpbmVzW2luZGV4XSB8fCAnJ31cXFxcZW5ke2FsaWduZWR9XFwkYCwgcmlnaHRMaW5lLCAnJywgbmV3IENvbXBvbmVudCgpKTtcclxuICAgICAgICAgIC8vcmlnaHRMaW5lLmlubmVySFRNTCA9IGAke3NvbHV0aW9uTGluZXNbaW5kZXhdIHx8ICcnfWA7IC8vIEVuc3VyZSB0aGF0IGlmIHNvbHV0aW9uTGluZXMgaXMgc2hvcnRlciwgaXQgYWRkcyBhbiBlbXB0eSBsaW5lXHJcbiAgICAgIH0pO1xyXG4gIFxyXG4gICAgICAvLyBCdXR0b24gY29udGFpbmVyXHJcbiAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLUNvcHktYnV0dG9uLWNvbnRhaW5lcicgfSk7XHJcbiAgICAgIGNvbnN0IGFjdGlvbkJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ29weSBEZXRhaWxzJywgY2xzOiAnaW5mby1tb2RhbC1Db3B5LWJ1dHRvbicgfSk7XHJcbiAgICAgIFxyXG4gICAgICBhY3Rpb25CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0aGlzLnJlc3VsdCk7XHJcbiAgICAgICAgICBuZXcgTm90aWNlKCdEZXRhaWxzIGNvcGllZCB0byBjbGlwYm9hcmQhJyk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuICBcclxuICBcclxuICAgIG9uQ2xvc2UoKSB7XHJcbiAgICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEN1c3RvbSBNb2RhbCBmb3IgZGVidWdnaW5nIGluZm9ybWF0aW9uXHJcbmNsYXNzIERlYnVnTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgZGVidWdJbmZvOiBzdHJpbmc7XHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIGRlYnVnSW5mbzogc3RyaW5nKSB7XHJcbiAgICAgIHN1cGVyKGFwcCk7XHJcbiAgICAgIHRoaXMuZGVidWdJbmZvID0gZGVidWdJbmZvO1xyXG4gIH1cclxuICBvbk9wZW4oKSB7XHJcbiAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG5cclxuICAgICAgY29udGVudEVsLmFkZENsYXNzKCdjdXN0b20tbW9kYWwtc3R5bGUnKTtcclxuICAgICAgLy8gUmVuZGVyIHRpdGxlXHJcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdEZWJ1ZyBJbmZvcm1hdGlvbicsIGNsczogJ2RlYnVnLU1vZGFsLXRpdGxlJyB9KTtcclxuXHJcbiAgICAgIC8vIERlYnVnIGluZm9ybWF0aW9uIGRpc3BsYXlcclxuICAgICAgY29uc3QgZGVidWdDb250ZW50ID0gY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2RlYnVnLWluZm8tY29udGFpbmVyJyB9KTtcclxuICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFxgXFxgXFxganNcXG4ke3RoaXMuZGVidWdJbmZvfVxcblxcYFxcYFxcYGAsIGRlYnVnQ29udGVudCwgJycsIG5ldyBDb21wb25lbnQoKSk7XHJcblxyXG4gIH1cclxuICBvbkNsb3NlKCkge1xyXG4gICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcbiJdfQ==