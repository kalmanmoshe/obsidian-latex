import LatexCompilerPlugin from 'src/main';
import { Menu, MarkdownView } from 'obsidian';
import { LatexContextMenuPopulater } from './latexContextMenuPopulater';
import { LatexRenderChild } from '../task/latexRenderChild';

type Pending = {
	id: number;
	renderChild: LatexRenderChild
	filePath: string;
	event: MouseEvent;
	deadline: number;
	timeoutId: number;
	handled: boolean;
};

export class LatexContextMenuDecider {
	private nextId = 1;
	private pendings = new Map<number, Pending>();
	private windowMs = 60;

	constructor(private plugin: LatexCompilerPlugin) {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('editor-menu', (menu: Menu, _, view: MarkdownView) => {
				const now = Date.now();
				let best: Pending | null = null;

				for (const p of this.pendings.values()) {
					if (p.handled || p.deadline < now) continue;
					const container = view?.contentEl;
					if (container && container.contains(p.renderChild.containerEl)) {
						if (!best || p.id > best.id) best = p;
					}
				}

				if (!best) return;

				best.handled = true;
				window.clearTimeout(best.timeoutId);
				this.pendings.delete(best.id);

				this.decorateEditorMenu(menu, best.renderChild, best.filePath)
			}),
		);
	}

	add(renderChild: LatexRenderChild, filePath: string) {
		this.plugin.registerDomEvent(
			renderChild.containerEl,
			'contextmenu',
			(event: MouseEvent) => {
				const now = Date.now();

				for (const [id, pending] of this.pendings) {
					// Remove expired pendings or a previous pending for this render child
					if (
						(!pending.handled && pending.deadline >= now) &&
						pending.renderChild !== renderChild
					) {
						continue;
					}

					window.clearTimeout(pending.timeoutId);
					this.pendings.delete(id);
				}

				const id = this.nextId++;
				const deadline = now + this.windowMs;

				const pending: Pending = {
					id,
					renderChild,
					filePath,
					event,
					deadline,
					handled: false,
					timeoutId: 0,
				};

				pending.timeoutId = window.setTimeout(() => {
					if (pending.handled) return;
					pending.handled = true;
					this.pendings.delete(id);

					try {
						//TODO: remove reduntent
						const menu = new Menu();
						this.decorateEditorMenu(menu, pending.renderChild, pending.filePath);
						menu.showAtMouseEvent?.(event);
					} catch (err) {
						console.error('[SvgContextMenuDecider] custom menu open failed', err);
					}
				}, this.windowMs);

				this.pendings.set(id, pending);
			},
			{ capture: true },
		);
	}

	private decorateEditorMenu(menu: Menu, renderChild: LatexRenderChild, filePath: string) {
		new LatexContextMenuPopulater(this.plugin, menu, renderChild, filePath);
	}

	openMenu(
		event: MouseEvent,
		renderChild: LatexRenderChild,
		filePath: string,
	): void {
		const menu = new Menu();

		this.decorateEditorMenu(
			menu,
			renderChild,
			filePath,
		);

		menu.showAtMouseEvent(event);
	}
}
