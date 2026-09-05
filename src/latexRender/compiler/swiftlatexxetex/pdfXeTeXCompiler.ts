import LatexEngine, { CompileResult, CompileStatus, LatexCompilationSession } from '../base/compilerBase/engine';
import LatexCompiler from '../base/compilerBase/compiler';
import { xetexWorkerFactory, dviWorkerFactory } from '@swiftlatex-workers';
import { UserFacingPluginError } from 'src/latexRender/errors/pluginErrors';

export class PdfXeTeXCompiler extends LatexCompiler {
	private xetEng: LatexEngine;
	private dviEng: LatexEngine;

	constructor() {
		super();
		this.xetEng = new LatexEngine(xetexWorkerFactory, 'xetex');
		this.dviEng = new LatexEngine(dviWorkerFactory, 'dvipdfm');

		this.engines = [this.xetEng, this.dviEng];
	}

	override async writeMemFSFile(filename: string, source: string | Uint8Array) {
		return this.xetEng.writeMemFSFile(filename, source);
	}

	override flushCache() {
		return this.xetEng.flushCache();
	}

	override async compileLaTeX(session: LatexCompilationSession): Promise<CompileResult> {
		const xetResult = await this.xetEng.compileLaTeX(session);

		if (!xetResult.isStatus(CompileStatus.Success)) {
			return xetResult;
		}

		if (!xetResult.pdf) {
			return new CompileResult(
				undefined,
				CompileStatus.ProcessingError,
				xetResult.log + '\nXeTeX succeeded but produced no XDV output.',
			);
		}

		const writtenVirtualPaths = new Set<string>();
		const dviResolutionKeys = new Map<string, string>();

		for (const {
			virtualPath,
			content,
			requestedPath,
			format,
		} of session.getResolvedFiles()) {
			const key = `${requestedPath}|${format}`;
			const existingVirtualPath = dviResolutionKeys.get(key);

			if (existingVirtualPath) {
				if (existingVirtualPath !== virtualPath) {
					throw new UserFacingPluginError(
						'Conflicting file names',
						`Two different files referenced as "${requestedPath}" are used in this document, ` +
						`and the PDF converter cannot tell them apart.`,
						`DVI resolution collision for requestedPath="${requestedPath}", ` +
						`format=${format}: "${existingVirtualPath}" vs "${virtualPath}".`,
					);
				}

				continue;
			}

			dviResolutionKeys.set(key, virtualPath);

			if (!writtenVirtualPaths.has(virtualPath)) {
				await this.dviEng.writeMemFSFile(
					virtualPath,
					content,
				);

				writtenVirtualPaths.add(virtualPath);
			}

			await this.dviEng.registerResolvedFile({
				requestedPath,
				requestingPath: null,
				format,
				virtualPath,
			});
		}

		await this.dviEng.writeMemFSFile('main.xdv', xetResult.pdf);
		await this.dviEng.setEngineMainFile('main.xdv');
		const dviResult = await this.dviEng.compilePDF();
		dviResult.log =
			xetResult.log +
			'\n\n===== dvipdfmx =====\n\n' +
			dviResult.log;

		return dviResult;
	}
}
