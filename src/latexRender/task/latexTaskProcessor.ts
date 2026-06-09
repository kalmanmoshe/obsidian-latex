import LatexRender from 'src/main';
import { VirtualFileSystem } from '../VirtualFileSystem';
import { ProcessableLatexTask } from './latexTask';
import { LatexDependencyParser } from './LatexDependencyParser';
import { LatexDependency } from 'src/dependency/LatexDependency';




export async function processTaskSource(
	task: ProcessableLatexTask,
	vfs: VirtualFileSystem,
	plugin: LatexRender,
): Promise<string | void> {
	const startTime = performance.now();
	const dependencies: LatexDependency[] = [];

	try {
		const parser = new LatexDependencyParser(
			vfs,
			task.getPossibleNames(),
		);

		const result = await parser.parseFile(
			task.getContent(),
			task.sourcePath,
		);

		const ast = result.ast;
		console.log('og AST content: ', ast.getClonedContent());
		// we want the Perfect level dependencies only, and not dependencies referenced within those
		dependencies.push(...result.dependencies.map((node) => node.dependency));

		if (plugin.settings.compilerVfsEnabled) {
			const autoUseFiles = vfs.getAutoUseFiles();
			ast.addDependenciesToPreamble(autoUseFiles);
			dependencies.push(...autoUseFiles);
		}

		ast.verifyProperDocumentStructure();
		console.log('post prossing AST content: ', ast.getClonedContent());

		task.setAst(ast);
		task.processingTime = performance.now() - startTime;
		task.processed = true;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}