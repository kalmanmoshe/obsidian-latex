import LatexRender from 'src/main';
import { VirtualFileSystem } from '../VirtualFileSystem';
import { ProcessableLatexTask } from './latexTask';
import { LatexDependency } from 'src/dependency/LatexDependency';

export async function processTaskSource(
	task: ProcessableLatexTask,
	vfs: VirtualFileSystem,
	plugin: LatexRender,
): Promise<string | void> {
	const startTime = performance.now();

	try {
		console.log('Processing task source for: ', task.getContent());
		const result = await vfs.getParser().parseFile(
			task.getContent(),
			task.sourcePath,
		);

		const ast = result.ast;
		console.log('og AST content: ', ast.getClonedContent());

		if (plugin.settings.compilerVfsEnabled) {
			// we want in the preamble the surface level dependencies only, and not dependencies referenced within those. LaTex will automatically include those referenced dependencies when compiling the surface level dependencies.
			const surfaceLevelDependencies = result.dependencies.map((node) => node.dependency);
			const autoUseFiles = vfs.getAutoUseFiles().filter(
				(file) => surfaceLevelDependencies.every((dep) => dep.path !== file.path)
			);
			ast.addDependenciesToPreamble(autoUseFiles);

			await vfs.addOrReplaceFiles(
				result.dependencies
					.filter((node) => !vfs.hasFile(node.dependency.path))
					.map((node) =>
						Object.assign(node.dependency, {
							dependencies: node.dependencies,
						}),
					),
			);
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