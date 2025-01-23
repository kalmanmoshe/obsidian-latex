import { EditorView,  ViewUpdate ,Decoration,DecorationSet, ViewPlugin } from "@codemirror/view";
import { Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { getHtmlBounds } from "./utils/context";
export const rtlForcePlugin = ViewPlugin.fromClass(class   {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.computeDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.computeDecorations(update.view);
        }
    }

    computeDecorations(view: EditorView): DecorationSet {
        const widgets: Range<Decoration>[] = [];

        for (const { from, to } of view.visibleRanges) {
            for (let pos = from; pos <= to;) {
                const line = view.state.doc.lineAt(pos);
                const content = line.text.trim();

                if (this.isRtl(content)) {
                    widgets.push(this.getRtlDecoration(line.from));
                }

                pos = line.to + 1;
            }
        }

        return Decoration.set(widgets);
    }

    private isRtl(content: string): boolean {
        // Remove unwanted characters and check for Hebrew letters at the start
        const cleanedContent = content
            .replace(/[#:\s"=-\d\[\].\+\-]*/g, "")
            .replace(/<[a-z]+[\w\s\d]*>/g, "");

        return /^[א-ת]/.test(cleanedContent);
    }

    private getRtlDecoration(pos: number): Range<Decoration> {
        return Decoration.line({
            attributes: {"dir": "rtl" },
        }).range(pos);
    }
}, { decorations: v => v.decorations, });


export const HtmlBackgroundPlugin = ViewPlugin.fromClass(class   {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.computeDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.computeDecorations(update.view);
        }
    }

    computeDecorations(view: EditorView): DecorationSet {
        const widgets: Range<Decoration>[] = [];

        for (const { from, to } of view.visibleRanges) {
                syntaxTree(view.state).iterate({ from, to, enter: (node) => {
                    const type = node.type;
                    const to = node.to;
                    if (!(type.name.contains("begin") && type.name.contains("html"))) {
                        return;
                    }
                    const bounds = getHtmlBounds(view.state, to);
                    if (!bounds) return;
                    widgets.push(this.gethtmlBackgroundDecoration(bounds.start,bounds.end));
                }
            })

                
        }

        return Decoration.set(widgets);
    }
    private gethtmlBackgroundDecoration(from: number,to: number): Range<Decoration> {
        return Decoration.mark({
            class: 'moshe-html-background',
        }).range(from, to);
    }

}, { decorations: v => v.decorations, });
