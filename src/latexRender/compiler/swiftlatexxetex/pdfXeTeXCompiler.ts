import XeTeXWorker from './swiftlatexxetex.worker.js';
import DvipdfmxWorker from './swiftlatexdvipdfm.worker.js';
import LatexEngine, { CompileResult, CompileStatus } from '../base/compilerBase/engine';
import LatexCompiler from '../base/compilerBase/compiler';
import { StringMap } from 'src/settings/settings.js';

export class PdfXeTeXCompiler extends LatexCompiler {
	private xetEng: LatexEngine;
	private dviEng: LatexEngine;

	constructor() {
		super();

		this.xetEng = new LatexEngine(XeTeXWorker);
		this.dviEng = new LatexEngine(DvipdfmxWorker);

		this.engines = [this.xetEng, this.dviEng];
	}

	override setCompiler(): Promise<void> {
		return Promise.resolve();
	}

	override async writeMemFSFile(filename: string, source: string | Uint8Array) {
		return this.xetEng.writeMemFSFile(filename, source);
	}

	override flushCache() {
		return this.xetEng.flushCache();
	}

	override writePackageCacheIndex(
		texlive404_cache: StringMap,
		texlive200_cache: StringMap,
		font404_cache: StringMap,
		font200_cache: StringMap,
	) {
		return this.xetEng.writeCacheData(
			texlive404_cache,
			texlive200_cache,
			font404_cache,
			font200_cache,
		);
	}

	override removeMemFSFile(filename: string) {
		return this.xetEng.removeMemFSFile(filename);
	}

	override setEngineMainFile(filename: string) {
		return this.xetEng.setEngineMainFile(filename);
	}

	override async fetchCacheData() {
		const [xetCache, dviCache] = await Promise.all([
			this.xetEng.fetchCacheData(),
			{
				texlive404: {},
				texlive200: {},
				font404: {},
				font200: {},
			}//this.dviEng.fetchCacheData(),
		]);

		return {
			texlive404: { ...xetCache.texlive404, ...dviCache.texlive404 },
			texlive200: { ...xetCache.texlive200, ...dviCache.texlive200 },
			font404: { ...xetCache.font404, ...dviCache.font404 },
			font200: { ...xetCache.font200, ...dviCache.font200 },
		}
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