

import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Tree, TreeCursor } from "@lezer/common";
import { App, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { getFileSections } from "./sectionCache";
import { Line } from "@codemirror/state";
import { codeMirrorLineToTaskSectionInfo, getLatexTaskSectionInfosFromFile } from "./taskSectionInformation";
type LeafViewInfo = {
	leaf: WorkspaceLeaf;
	mode: MarkdownViewMode;
};
enum MarkdownViewMode {
	Source = 'source',
	Preview = 'preview',
	LivePreview = 'live-preview',
	Unknown = 'unknown'
};
function extractMarkdownViewMode(el: HTMLElement): MarkdownViewMode {
	if (el.classList.contains("markdown-preview-view")) {
		return MarkdownViewMode.Preview;
	} else if (el.classList.contains("markdown-source-view")) {
		return el.classList.contains("is-live-preview") ? MarkdownViewMode.LivePreview : MarkdownViewMode.Source;
	}
	return MarkdownViewMode.Unknown;
}

function findLeafContainingEl(el: HTMLElement): WorkspaceLeaf | null {
	const leaves = app.workspace.getLeavesOfType("markdown"); // all editor leaves

	for (const leaf of leaves) {
		const view = getEditorViewForLeaf(leaf); // Custom function — see below
		if (view?.dom?.contains(el)) {
			return leaf;
		}
	}

	return null;
}
function getEditorViewForLeaf(leaf: WorkspaceLeaf): EditorView | null {
	const cm = (leaf.view as any)?.editor?.cm;
	if (cm instanceof EditorView) {
		return cm;
	}
	return null;
}
function findLeafViewInfoForElement(el: HTMLElement): LeafViewInfo|null  {
	const leaf = findLeafContainingEl(el);
	if (!leaf) return null;
	const containerEl = leaf.view.containerEl;
	const previewEl = containerEl.querySelector('.markdown-preview-view') as HTMLElement | null;
	const sourceEl = containerEl.querySelector('.markdown-source-view') as HTMLElement | null;
	if (!previewEl && !sourceEl) return { leaf, mode: MarkdownViewMode.Unknown };
	if (previewEl) {
		return { leaf, mode: MarkdownViewMode.Preview };
	}
	const mode = sourceEl!.classList.contains("is-live-preview") ? MarkdownViewMode.LivePreview : MarkdownViewMode.Source;
	return { leaf, mode };
	
}

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
		let mode: MarkdownViewMode = viewState?.state?.mode as MarkdownViewMode || MarkdownViewMode.Unknown;
		// the viewState mode will only be source or preview, Therefore if we get source we need to look for LivePreview
		if (mode !== MarkdownViewMode.Preview) {
			container = sourceEl;
			mode = container?.classList.contains("is-live-preview") ? MarkdownViewMode.LivePreview : MarkdownViewMode.Source;
		}
		result.push({ leaf, mode });
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
		const info = findLeafViewInfoForElement(this.el);
		if (!info) {
			throw new Error("Leaf not found for file: " + this.file.path);
		}
		const { leaf, mode } = info;
		switch (mode) {
			case MarkdownViewMode.Source:
				console.log("Source mode", leaf);
				break;
			case MarkdownViewMode.Preview:
				console.log("Preview mode", leaf);
				break;
			case MarkdownViewMode.LivePreview:
				console.log("Live Preview mode", leaf);
				break;
			default:
				throw new Error("Unknown mode for file: " + this.file.path);
		}

		return
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
			//console.log("root", root,root.classList);
			if (root.classList?.contains(className)) return root; // Check if the current element has the class
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
		const cmView = findLeafViewInfoForElement(this.el);

		if (cmView) {
			const view = cmView as unknown as EditorView;
			try {
				const pos = view?.posAtDOM(this.el);
				const line = view?.state.doc.lineAt(pos);
				if (line) {
					const section = await codeMirrorLineToTaskSectionInfo(this.file, line);
					if (section) return section;
				}
			} catch (err) {
				console.error("Error in posAtDOM:", err);
			}
		}
		
		console.log("fromLivePreview", viewEl);
		const sections = await getFileSections(this.file, true);
		const sizer = viewEl.querySelector('.cm-sizer');
		//const view = 

		console.log("sizer", sizer);
	}
	async fromPreview(viewEl: HTMLElement) {

	}

}

export function getPoseFromEl(elFilePath: string, el: HTMLElement) {
	const foo = new Foo(app.vault.getAbstractFileByPath(elFilePath) as TFile, el);
	foo.foo();
}