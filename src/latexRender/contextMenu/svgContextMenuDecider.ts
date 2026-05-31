import LatexRender from 'src/main';
import { Menu, MarkdownView } from 'obsidian';
import { SvgContextMenuPopulater } from './svgContextMenuPopulater';

type Pending = {
	id: number;
	el: HTMLElement;
	filePath: string;
	event: MouseEvent;
	deadline: number;
	timeoutId: number;
	handled: boolean;
};

export class SvgContextMenuDecider {
	private nextId = 1;
	private pendings = new Map<number, Pending>();
	private windowMs = 60;

	constructor(private plugin: LatexRender) {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on(
				'editor-menu',
				(menu: Menu, editor, view: MarkdownView) => {
					const now = Date.now();
					let best: Pending | null = null;

					for (const p of this.pendings.values()) {
						if (p.handled || p.deadline < now) continue;
						const container = view?.contentEl;
						if (container && container.contains(p.el)) {
							if (!best || p.id > best.id) best = p;
						}
					}

					if (!best) return;

					best.handled = true;
					clearTimeout(best.timeoutId);
					this.pendings.delete(best.id);

					this.decorateEditorMenu(menu, best);
				},
			),
		);
	}

	add(el: HTMLElement, filePath: string) {
		this.plugin.registerDomEvent(
			el,
			'contextmenu',
			(event: MouseEvent) => {
				const now = Date.now();

				// sweep expired pendings
				for (const [id, p] of [...this.pendings]) {
					if (p.handled || p.deadline >= now) continue;
					clearTimeout(p.timeoutId);
					this.pendings.delete(id);
				}

				const id = this.nextId++;
				const deadline = now + this.windowMs;

				const pending: Pending = {
					id,
					el,
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
						const menu = new Menu();
						this.decorateEditorMenu(menu, pending);
						menu.showAtMouseEvent?.(event);
					} catch (err) {
						console.error(
							'[SvgContextMenuDecider] custom menu open failed',
							err,
						);
					}
				}, this.windowMs);

				this.pendings.set(id, pending);
			},
			{ capture: true },
		);
	}

	private decorateEditorMenu(menu: Menu, p: Pending) {
		new SvgContextMenuPopulater(this.plugin, menu, p.el, p.filePath);
	}
}
