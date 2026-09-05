import LatexCompilerPlugin from 'src/main';
import { Menu, MarkdownView } from 'obsidian';
import { LatexContextMenuPopulater } from './latexContextMenuPopulater';
import { LatexRenderChild } from '../task/latexRenderChild';
import { CompilePipeline } from 'src/settings/settings';

type Pending = {
	id: number;
	renderChild: LatexRenderChild
	filePath: string;
	pipeline: CompilePipeline;
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

				new LatexContextMenuPopulater(
					this.plugin, 
					menu, 
					best.renderChild, 
					best.filePath, 
					best.pipeline
				)
			}),
		);
	}

	add(renderChild: LatexRenderChild, filePath: string, compilePipeline: CompilePipeline): void {
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
					pipeline: compilePipeline,
					event,
					deadline,
					handled: false,
					timeoutId: 0,
				};

				pending.timeoutId = window.setTimeout(() => {
					if (pending.handled) return;
					pending.handled = true;
					this.pendings.delete(id);

					this.openMenu(
						event, 
						pending.renderChild, 
						pending.filePath,
						pending.pipeline
					);
				}, this.windowMs);

				this.pendings.set(id, pending);
			},
			{ capture: true },
		);
	}

	openMenu(
		event: MouseEvent,
		renderChild: LatexRenderChild,
		filePath: string,
		compilePipeline: CompilePipeline
	): void {
		try {
			const menu = new Menu();

			new LatexContextMenuPopulater(
				this.plugin, 
				menu, 
				renderChild, 
				filePath, 
				compilePipeline
			);

			menu.showAtMouseEvent(event);
		} catch (err) {
			console.error('[SvgContextMenuDecider] custom menu open failed', err);
		}
	}
}
