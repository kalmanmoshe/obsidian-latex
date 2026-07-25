import LatexEngine, { CompileResult, CompileStatus } from '../base/compilerBase/engine';
import LatexCompiler from '../base/compilerBase/compiler';
import { xetexWorkerFactory, dviWorkerFactory } from '@swiftlatex-workers';

export class PdfXeTeXCompiler extends LatexCompiler {
	private xetEng: LatexEngine;
	private dviEng: LatexEngine;

	constructor() {
		super();
		this.xetEng = new LatexEngine(xetexWorkerFactory, "xetex");
		this.dviEng = new LatexEngine(dviWorkerFactory, "dvipdfm");

		this.engines = [this.xetEng, this.dviEng];
	}

	override async writeMemFSFile(filename: string, source: string | Uint8Array) {
		return this.xetEng.writeMemFSFile(filename, source);
	}

	override flushCache() {
		return this.xetEng.flushCache();
	}

	override async compileLaTeX(): Promise<CompileResult> {
		const xetResult = await this.xetEng.compileLaTeX();

		if (xetResult.status !== 0) {
			return xetResult;
		}

		if (!xetResult.pdf) {
			return new CompileResult(
				undefined,
				CompileStatus.ProcessingError,
				xetResult.log + '\nXeTeX succeeded but produced no XDV output.',
			);
		}

		await this.dviEng.writeMemFSFile('main.xdv', xetResult.pdf);
		await this.dviEng.setEngineMainFile('main.xdv');
		const dviResult = await this.dviEng.compilePDF();
		dviResult.log = xetResult.log + "\n" + dviResult.log;

		return dviResult;
	}
}