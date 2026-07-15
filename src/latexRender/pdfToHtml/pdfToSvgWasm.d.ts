export interface PdfToSvgWasmModule {
	FS: {
		writeFile(
			path: string,
			data: Uint8Array,
		): void;

		readFile(
			path: string,
			options: { encoding: "utf8" },
		): string;

		unlink(path: string): void;
	};

	_convertPdfToSvg(): number;
}

export interface PdfToSvgWasmOptions {
	print?: (text: string) => void;
	printErr?: (text: string) => void;
}

declare const createPdfToSvgWasm:
	(options?: PdfToSvgWasmOptions) =>
		Promise<PdfToSvgWasmModule>;

export default createPdfToSvgWasm;