


export const getEditorCommands = (plugin: LatexSuitePlugin) => {
	return [
		getTranslateFromMathjaxToLatex(plugin),
		getBoxEquationCommand(),
		getSelectEquationCommand(),
		getEnableAllFeaturesCommand(plugin),
		getDisableAllFeaturesCommand(plugin)
	];
};
