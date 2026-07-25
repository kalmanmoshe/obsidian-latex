declare module "@swiftlatex-workers" {
	export const pdftexWorkerFactory:
		() => Promise<Worker>;

	export const xetexWorkerFactory:
		() => Promise<Worker>;

	export const dviWorkerFactory:
		() => Promise<Worker>;
}

declare module "@pdf-to-svg-runtime" {
	export interface PdfToSvgModule {
		FS: {
			writeFile(
				path: string,
				data: Uint8Array,
			): void;

			readFile(
				path: string,
				options: {
					encoding: "utf8";
				},
			): string;

			unlink(path: string): void;
		};

		_convertPdfToSvg(): number;
	}

	export type PdfToSvgFactory =
		() => Promise<PdfToSvgModule>;

	const PdfToSvgWasm: PdfToSvgFactory;

	export default PdfToSvgWasm;
}