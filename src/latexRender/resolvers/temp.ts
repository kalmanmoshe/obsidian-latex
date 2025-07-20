

import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Tree, TreeCursor } from "@lezer/common";
import { App, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { getFileSections } from "./sectionCache";
import { Line } from "@codemirror/state";
import { codeMirrorLineToTaskSectionInfo, getLatexTaskSectionInfosFromFile } from "./taskSectionInformation";
type LeafViewInfo = {
	leaf: WorkspaceLeaf;
	container: HTMLElement | null;
	mode: MarkdownViewModeType;
};
enum MarkdownViewModeType {
	Source = 'source',
	Preview = 'preview',
	LivePreview = 'live-preview',
	Unknown = 'unknown'
};

function getLeafContainersForFile(path: string): LeafViewInfo[] {
	const leaves = app.workspace.getLeavesOfType('markdown');
	const result: LeafViewInfo[] = [];

	for (const leaf of leaves) {
		const file = leaf.view?.file;
		if (!file || file.path !== path) continue;

		const containerEl = leaf.view?.containerEl;
		const viewState = leaf.getViewState();
		if (!containerEl) continue;

		const previewEl = containerEl.querySelector('.markdown-preview-view') as HTMLElement | null;
		const sourceEl = containerEl.querySelector('.markdown-source-view') as HTMLElement | null;
		let container: HTMLElement | null = previewEl;
		let mode: MarkdownViewModeType = viewState?.state?.mode as MarkdownViewModeType || MarkdownViewModeType.Unknown;
		// the viewState mode will only be source or preview, Therefore if we get source we need to look for LivePreview
		if (mode !== MarkdownViewModeType.Preview) {
			container = sourceEl;
			mode = container?.classList.contains("is-live-preview") ? MarkdownViewModeType.LivePreview : MarkdownViewModeType.Source;
		}
		result.push({ leaf, container, mode });
	}
	return result;
}

function getEditorViewForFile(file: TFile): CodeMirror.Editor | null {
	const leaves = app.workspace.getLeavesOfType("markdown");

	for (const leaf of leaves) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file === file) {
			const editor = view.editor;
			// This is the CodeMirror wrapper
			const cmEditor = (editor as any).cm as CodeMirror.Editor;
			return cmEditor;
		}
	}
	return null;
}

class Foo {
	file: TFile;
	el: HTMLElement;
	constructor(file: TFile, el: HTMLElement) {
		this.file = file;
		this.el = el;
	}
	async foo() {
		let container = this.findAnywhere(this.el, "markdown-source-view");
		console.log("container", container, this.el);
		if (container?.classList?.contains("is-live-preview")) {
			const sectionInfo = await this.fromLivePreview(container);
			console.warn("this.fromLivePreview(container)", sectionInfo);
		} else {
			throw new Error("Live preview container not found for file: " + this.file.path);
		}
		/*console.log("leafs", leafs);
		if (!leafs) {
			throw new Error("Leaf not found for file: " + this.file.path);
		}
		const livePreviewLeafs = leafs.filter(l => l.mode === MarkdownViewModeType.LivePreview);
		if (livePreviewLeafs.length === 0) {
			throw new Error("Live preview leaf not found for file: " + this.file.path);
		}
		this.fromLivePreview(livePreviewLeafs[0].leaf);
		return
		/*const leaf = leafs.find(l => l.mode === MarkdownViewModeType.Preview || l.mode === MarkdownViewModeType.LivePreview);
		if (!leaf) {
			throw new Error("Preview leaf not found for file: " + this.file.path);
		}
		const staticContainer = leaf.container?.cloneNode(true) as HTMLElement;
		const container = leaf.container;
		const doesContainEl = container?.contains(this.el);
		console.log("leaf", leaf, "doesContainEl", doesContainEl, this.el, current);*/
	}
	findAnywhere(el: HTMLElement, className: string): HTMLElement | null {
		// Step 1: Traverse up to the highest known ancestor (root)
		let root: HTMLElement = el;
		while (root.parentElement) {
			root = root.parentElement;
		}

		// Step 2: Traverse the entire tree from root looking for className
		const stack: HTMLElement[] = [root];
		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) continue;
			if (current.classList?.contains(className)) return current;
			if (!current.children) continue;
			for (const child of Array.from(current.children)) {
				stack.push(child as HTMLElement);
			}
		}
		return null;
	}
	async fromLivePreview(viewEl: HTMLElement) {
		const cmView = getEditorViewForFile(this.file);
		if (cmView) {
			const view = cmView as unknown as EditorView;
			const pos = view?.posAtDOM(this.el);
			const line = view?.state.doc.lineAt(pos);
			console.log("line", line, pos, view?.state.doc.toString());
			if (line) {
				const section = codeMirrorLineToTaskSectionInfo(this.file, line);
				if (section) return section;
			}
		}
		
		console.log("fromLivePreview", viewEl);
		const sections = await getFileSections(this.file, true);
		const sizer = viewEl.querySelector('.cm-sizer');
		//const view = 

		console.log("sizer", sizer);
	}

}

export function getPoseFromEl(elFilePath: string, el: HTMLElement) {
	const view = app.workspace.activeEditor?.editor?.cm as EditorView | undefined;
	const state = view?.state;
	if (!state) return null;
	const foo = new Foo(app.vault.getAbstractFileByPath(elFilePath) as TFile, el);
	foo.foo();
}