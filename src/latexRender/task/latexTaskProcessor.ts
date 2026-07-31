import LatexCompilerPlugin from 'src/main';
import { VirtualFileSystem } from '../../dependency/VirtualFileSystem';
import { ProcessableLatexTask } from './latexTask';

export async function processTaskSource(
	task: ProcessableLatexTask,
	vfs: VirtualFileSystem,
	plugin: LatexCompilerPlugin,
): Promise<string | void> {
	const startTime = performance.now();

	try {
		const result = await vfs.getParser().parseFile(task.getContent(), task.sourcePath);

		const ast = result.ast;

		// we want in the preamble the surface level dependencies only, and not dependencies referenced within those. LaTex will automatically include those referenced dependencies when compiling the surface level dependencies.
		const surfaceLevelDependencies = result.dependencies.map((node) => node.dependency);
		const dependencyPaths = surfaceLevelDependencies.map((dep) => dep.path);

		if (plugin.settings.compilerVfsEnabled) {
			const autoUseFiles = vfs
				.getAutoUseFiles()
				.filter((file) => surfaceLevelDependencies.every((dep) => dep.path !== file.path));
			dependencyPaths.push(...autoUseFiles.map((file) => file.path));
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

		task.setAst(ast);
		task.setDependencyPaths(dependencyPaths);
		task.processingTime = performance.now() - startTime;
		task.processed = true;
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}
