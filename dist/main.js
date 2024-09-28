import { __awaiter } from "tslib";
import { Plugin, MarkdownRenderer, Modal, Notice } from 'obsidian';
import { controller } from './mathEngine.js';
export default class MathPlugin extends Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.registerMarkdownCodeBlockProcessor('math-engine', (source, el, ctx) => {
                const rawSource = String.raw `${source}`;
                const expressions = rawSource.split('\n');
                expressions.forEach((expression, index) => {
                    var _a;
                    const container = el.createEl('div', { cls: 'math-line-container' });
                    // Add alternating row colors for distinction
                    if (index % 2 === 0) {
                        container.addClass('math-row-even');
                    }
                    else {
                        container.addClass('math-row-odd');
                    }
                    // Display the input (left side)
                    const inputDiv = container.createEl('div', { cls: 'math-input' });
                    const latexExpression = String.raw `${expression}`;
                    const resultDiv = container.createEl('div', { cls: 'math-result-separate' });
                    const result = controller(expression);
                    if (expression.length !== 0) {
                        MarkdownRenderer.renderMarkdown(`$\{${latexExpression.replace(/(?<!\\)(tan|sin|cos|binom|frac|asin|acos|atan|sqrt)/g, "\\$1")}\}$`, inputDiv, '', this);
                        if (Array.isArray(result) && result.length > 0) {
                            resultDiv.innerHTML = `<span class="error-text">Error: ${result[0]}</span>`;
                        }
                        else if (typeof result === 'object' && !Array.isArray(result)) {
                            resultDiv.innerHTML = `<span class="math-result-text">${result.Solution}</span> <span class="math-result-icon">🛈</span>`;
                            (_a = resultDiv.querySelector('.math-result-icon')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
                                new InfoModal(this.app, result.info, result.SolutionInfo).open();
                            });
                        }
                        else {
                            resultDiv.innerHTML = `<span class="error-text">Unexpected result format. Please check your input.</span>`;
                        }
                    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQWdCLGdCQUFnQixFQUFtQyxLQUFLLEVBQUcsTUFBTSxFQUFhLE1BQU0sVUFBVSxDQUFDO0FBQzlILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUc3QyxNQUFNLENBQUMsT0FBTyxPQUFPLFVBQVcsU0FBUSxNQUFNO0lBRXRDLE1BQU07O1lBRVYsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLGFBQWEsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUU7Z0JBQzdFLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUEsR0FBRyxNQUFNLEVBQUUsQ0FBQztnQkFDeEMsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFckMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsRUFBRTs7b0JBQ3pDLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLHFCQUFxQixFQUFFLENBQUMsQ0FBQztvQkFFckUsNkNBQTZDO29CQUM3QyxJQUFJLEtBQUssR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFO3dCQUNuQixTQUFTLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDO3FCQUNyQzt5QkFBTTt3QkFDTCxTQUFTLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDO3FCQUNwQztvQkFFRCxnQ0FBZ0M7b0JBQ3RDLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7b0JBQ2xFLE1BQU0sZUFBZSxHQUFHLE1BQU0sQ0FBQyxH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QUssRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDO1FBRXRFLG1CQUFtQjtRQUNuQixNQUFNLGVBQWUsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxFQUFFLEdBQUcsRUFBRSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7UUFDL0UsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLEdBQUcsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFDOUcsWUFBWSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7WUFDeEMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzNDLElBQUksTUFBTSxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBQ0QsT0FBTztRQUNILE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3RCLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBsdWdpbiwgTWFya2Rvd25WaWV3LCBNYXJrZG93blJlbmRlcmVyICwgUGx1Z2luU2V0dGluZ1RhYiwgQXBwLCBTZXR0aW5nLCBNb2RhbCwgIE5vdGljZSwgQ29tcG9uZW50IH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgeyBjb250cm9sbGVyIH0gZnJvbSAnLi9tYXRoRW5naW5lLmpzJztcclxuXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRoUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcclxuXHJcbiAgYXN5bmMgb25sb2FkKCkge1xyXG5cclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcignbWF0aC1lbmdpbmUnLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XHJcblx0XHRjb25zdCByYXdTb3VyY2UgPSBTdHJpbmcucmF3YCR7c291cmNlfWA7XHJcblx0XHRjb25zdCBleHByZXNzaW9ucyA9IHJhd1NvdXJjZS5zcGxpdCgnXFxuJyk7XHJcblxyXG4gICAgICBcdGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1saW5lLWNvbnRhaW5lcicgfSk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBhbHRlcm5hdGluZyByb3cgY29sb3JzIGZvciBkaXN0aW5jdGlvblxyXG4gICAgICAgIGlmIChpbmRleCAlIDIgPT09IDApIHtcclxuICAgICAgICAgIGNvbnRhaW5lci5hZGRDbGFzcygnbWF0aC1yb3ctZXZlbicpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBjb250YWluZXIuYWRkQ2xhc3MoJ21hdGgtcm93LW9kZCcpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRGlzcGxheSB0aGUgaW5wdXQgKGxlZnQgc2lkZSlcclxuXHRcdGNvbnN0IGlucHV0RGl2ID0gY29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtaW5wdXQnIH0pO1xyXG5cdFx0Y29uc3QgbGF0ZXhFeHByZXNzaW9uID0gU3RyaW5nLnJhd2Ake2V4cHJlc3Npb259YDtcclxuXHRcdGNvbnN0IHJlc3VsdERpdiA9IGNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdtYXRoLXJlc3VsdC1zZXBhcmF0ZScgfSk7XHJcblx0XHRjb25zdCByZXN1bHQgPSBjb250cm9sbGVyKGV4cHJlc3Npb24pO1xyXG5cdFx0aWYgKGV4cHJlc3Npb24ubGVuZ3RoICE9PSAwKSB7XHJcblxyXG5cdFx0XHRNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGAkXFx7JHtsYXRleEV4cHJlc3Npb24ucmVwbGFjZSgvKD88IVxcXFwpKHRhbnxzaW58Y29zfGJpbm9tfGZyYWN8YXNpbnxhY29zfGF0YW58c3FydCkvZywgXCJcXFxcJDFcIil9XFx9JGAsaW5wdXREaXYsJycsdGhpcyk7XHJcblx0XHRcdFxyXG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQpICYmIHJlc3VsdC5sZW5ndGggPiAwKSB7XHJcblx0XHRcdFx0cmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj5FcnJvcjogJHtyZXN1bHRbMF19PC9zcGFuPmA7XHJcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHJlc3VsdCkpIHtcclxuXHJcblx0XHRcdHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJtYXRoLXJlc3VsdC10ZXh0XCI+JHtyZXN1bHQuU29sdXRpb259PC9zcGFuPiA8c3BhbiBjbGFzcz1cIm1hdGgtcmVzdWx0LWljb25cIj7wn5uIPC9zcGFuPmA7XHJcblxyXG5cdFx0XHRyZXN1bHREaXYucXVlcnlTZWxlY3RvcignLm1hdGgtcmVzdWx0LWljb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcblx0XHRcdG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHJlc3VsdC5pbmZvLCByZXN1bHQuU29sdXRpb25JbmZvKS5vcGVuKCk7XHJcblx0XHRcdH0pO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0cmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj5VbmV4cGVjdGVkIHJlc3VsdCBmb3JtYXQuIFBsZWFzZSBjaGVjayB5b3VyIGlucHV0Ljwvc3Bhbj5gO1xyXG5cdFx0fVxyXG5cdFx0fVxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICB9XHJcbiAgb251bmxvYWQoKSB7fVxyXG59XHJcblxyXG4vLyBDdXN0b20gTW9kYWwgZm9yIGV4dHJhIGluZm9ybWF0aW9uXHJcbmNsYXNzIEluZm9Nb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICAgIHJlc3VsdDogc3RyaW5nO1xyXG4gICAgU29sdXRpb25JbmZvOiBzdHJpbmc7XHJcbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcmVzdWx0OiBzdHJpbmcsIFNvbHV0aW9uSW5mbzogc3RyaW5nKSB7XHJcbiAgICAgICAgc3VwZXIoYXBwKTtcclxuICAgICAgICB0aGlzLnJlc3VsdCA9IHJlc3VsdDtcclxuICAgICAgICB0aGlzLlNvbHV0aW9uSW5mbyA9IFNvbHV0aW9uSW5mbztcclxuICAgIH1cclxuICAgIG9uT3BlbigpIHtcclxuICAgICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuXHJcbiAgICAgICAgY29udGVudEVsLmFkZENsYXNzKCdjdXN0b20tbW9kYWwtc3R5bGUnKTtcclxuICAgICAgICAvLyBSZW5kZXIgdGl0bGVcclxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnUmVzdWx0IERldGFpbHMnLCBjbHM6ICdtb2RhbC10aXRsZScgfSk7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBhIGZsZXggY29udGFpbmVyIGZvciB0d28gY29sdW1uc1xyXG4gICAgICAgIGNvbnN0IGNvbHVtbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdjb2x1bW4tY29udGFpbmVyJyB9KTtcclxuXHJcbiAgICAgICAgLy8gTGVmdCBjb2x1bW4gKGUuZy4sIHJlc3VsdHMpXHJcbiAgICAgICAgY29uc3QgbGVmdENvbHVtbiA9IGNvbHVtbkNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdsZWZ0LWNvbHVtbicgfSk7XHJcbiAgICAgICAgbGVmdENvbHVtbi5pbm5lckhUTUwgPSBgJHt0aGlzLnJlc3VsdC5yZXBsYWNlKC9cXG4vZywgJzxicj4nKX1gO1xyXG5cclxuICAgICAgICAvLyBSaWdodCBjb2x1bW4gKGUuZy4sIGFjdGlvbnMgb3IgYWRkaXRpb25hbCBpbmZvKVxyXG4gICAgICAgIGNvbnN0IHJpZ2h0Q29sdW1uID0gY29sdW1uQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3JpZ2h0LWNvbHVtbicgfSk7XHJcbiAgICAgICAgcmlnaHRDb2x1bW4uaW5uZXJIVE1MID0gYCR7dGhpcy5Tb2x1dGlvbkluZm8ucmVwbGFjZSgvXFxuL2csICc8YnI+Jyl9YDtcclxuXHJcbiAgICAgICAgLy8gQnV0dG9uIGNvbnRhaW5lclxyXG4gICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdidXR0b24tY29udGFpbmVyJyB9KTtcclxuICAgICAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0NvcHkgRGV0YWlscycsIGNsczogJ21vZGFsLWFjdGlvbi1idXR0b24nIH0pO1xyXG4gICAgICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy5yZXN1bHQpO1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKCdEZXRhaWxzIGNvcGllZCB0byBjbGlwYm9hcmQhJyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBvbkNsb3NlKCkge1xyXG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gICAgfVxyXG59Il19