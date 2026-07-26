import { decompressGzipText } from 'src/util/decompressPayload';
import { pdfToSvgWasmGzipBase64 } from '../../generated/pdfToSvgWasm.payload';

type PdfToSvgFactory = () => Promise<PdfToSvgModule>;

export interface PdfToSvgModule {
	FS: {
		writeFile(path: string, data: Uint8Array): void;

		readFile(
			path: string,
			options: {
				encoding: 'utf8';
			},
		): string;

		unlink(path: string): void;
	};

	_convertPdfToSvg(): number;
}

let pdfToSvgFactoryPromise: Promise<PdfToSvgFactory> | undefined;

async function decompressPdfToSvgFactory(): Promise<PdfToSvgFactory> {
	const source = await decompressGzipText(pdfToSvgWasmGzipBase64);

	return evaluateCommonJsModule(source);
}

function loadPdfToSvgFactoryPromise(): Promise<PdfToSvgFactory> {
	pdfToSvgFactoryPromise ??= decompressPdfToSvgFactory().catch((error) => {
		pdfToSvgFactoryPromise = undefined;
		throw error;
	});

	return pdfToSvgFactoryPromise;
}

function evaluateCommonJsModule(source: string): PdfToSvgFactory {
	const module: { exports: unknown } = {
		exports: {},
	};

	const requireUnavailable = (moduleName: string): never => {
		throw new Error(`Compressed pdfToSvgWasm tried to require "${moduleName}".`);
	};

	const execute = new Function(
		'module',
		'exports',
		'require',
		`${source}\nreturn module.exports;`,
	) as (
		module: { exports: unknown },
		exports: unknown,
		require: (moduleName: string) => never,
	) => unknown;

	const exportedValue = execute(module, module.exports, requireUnavailable);

	if (typeof exportedValue !== 'function') {
		throw new TypeError('pdfToSvgWasm did not export an Emscripten module factory.');
	}

	return exportedValue as PdfToSvgFactory;
}

const PdfToSvgWasm: PdfToSvgFactory = async () => {
	return (await loadPdfToSvgFactoryPromise())();
};

export default PdfToSvgWasm;
