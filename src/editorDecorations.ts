import { EditorView,  ViewUpdate ,Decoration, } from "@codemirror/view";
import { RangeSet } from "@codemirror/state";

export class RtlForc {
    decorations: RangeSet<Decoration>;
    
    constructor(view: EditorView) {
        this.decorations = this.computeDecorations(view);
    }
    
    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
        this.decorations = this.computeDecorations(update.view);
        }
    }
    
    computeDecorations(view: EditorView): RangeSet<Decoration> {
        const widgets = [];
        for (let { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
            const line = view.state.doc.lineAt(pos);
            const content = line.text.trim();
            if (
            content
                .replace(/[#:\s"=-\d\[\].\+\-]*/g, "")
                .replace(/<[a-z]+[\w\s\d]*>/g, "")
                .match(/^[א-ת]/)
            ) {
            widgets.push(
                Decoration.line({
                class: "custom-rtl-line",
                }).range(line.from)
            );
            }
            pos = line.to + 1;
        }
        }
        return Decoration.set(widgets);
    }
    }