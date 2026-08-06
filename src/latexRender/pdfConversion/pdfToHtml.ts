import { PDFDocument } from 'pdf-lib';
import LatexCompilerPlugin from 'src/main';
import { LATEX_RENDER_ID_KEY } from './pdfToSVG';
import { setIcon } from 'obsidian';

export async function insertPdf(
	pdfData: Uint8Array,
	el: HTMLElement,
	stem: string,
	sourcePath: string,
	plugin: LatexCompilerPlugin,
) {
	const pdfHTML = await pdfToHtml(pdfData);

	el.empty();

	const wrapper = el.createDiv({
		cls: 'latex-pdf-wrapper',
		attr: {
			[LATEX_RENDER_ID_KEY]: stem,
		},
	});

	const toolbar = wrapper.createDiv({
		cls: 'latex-pdf-toolbar',
	});

	const menuButton = toolbar.createEl('button', {
		cls: 'latex-pdf-menu-button clickable-icon',
		attr: {
			type: 'button',
			'aria-label': 'Open LaTeX PDF actions',
			[LATEX_RENDER_ID_KEY]: stem,
		},
	});

	setIcon(menuButton, 'more-vertical');

	const pdfObject = wrapper.createEl('object', pdfHTML);
	pdfObject.addClass('latex-pdf-object');
	pdfObject.setAttribute(LATEX_RENDER_ID_KEY, stem);

	plugin.registerDomEvent(menuButton, 'click', (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();

		plugin.menuDecider.openMenu(
			event,
			menuButton,
			sourcePath,
		);
	});
}

async function pdfToHtml(pdfData: Uint8Array) {
	const { width, height } = await getPdfDimensions(pdfData);
	const ratio = width / height;

	const arrayBuffer = pdfData.buffer.slice(
		pdfData.byteOffset,
		pdfData.byteOffset + pdfData.byteLength,
	) as ArrayBuffer;

	const pdfblob = new Blob([arrayBuffer], { type: 'application/pdf' });
	const objectURL = URL.createObjectURL(pdfblob);
	return {
		attr: {
			data: `${objectURL}#view=FitH&toolbar=1`,
			type: 'application/pdf',
			class: 'block-language-latex',
			style: `width:100%; aspect-ratio:${ratio}`,
		},
	};
}

async function getPdfDimensions(pdf: Uint8Array): Promise<{ width: number; height: number }> {
	const pdfDoc = await PDFDocument.load(pdf);
	const firstPage = pdfDoc.getPages()[0];
	const { width, height } = firstPage.getSize();
	return { width, height };
}
