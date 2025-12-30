export const CssClasses = {
	general: {
		settingIcon: 'moshe-math-setting-icon',
	},

	loader: {
		loaderParentContainer: 'moshe-latex-render-loader-parent-container',
		renderLoader: 'moshe-latex-render-loader',
		renderCountdown: 'moshe-latex-render-countdown',
	},

	block: {
		languageLatexSvg: 'block-language-latexsvg',
		languageLatexSvgOverflowDownscale:
			'block-language-latexsvg.overflow-downscale',
		languageLatexSvgOverflowScroll:
			'block-language-latexsvg.overflow-scroll',
		languageLatexSvgOverflowHidden:
			'block-language-latexsvg.overflow-hidden',

		latexError: 'block-latex-error',
	},

	error: {
		container: 'moshe-swift-latex-error-container',
		content: 'moshe-swift-latex-error-content',
		title: 'moshe-swift-latex-error-title',
		cause: 'moshe-swift-latex-error-cause',
		line: 'moshe-swift-latex-error-line',
	},

	log: {
		tabButton: 'moshe-log-tab-button',
		tabContent: 'moshe-log-tab-content',

		severity: {
			error: 'moshe-log-error',
			warning: 'moshe-log-warning',
			typesetting: 'moshe-log-typesetting',
		},

		file: {
			base: 'moshe-log-file',
			item: 'moshe-log-file-item',
			label: 'moshe-log-file-label',
			wrapper: 'moshe-log-file-wrapper',
			details: 'moshe-log-file-details',
			summary: 'moshe-log-file-summary',
			line: 'moshe-log-file-line',
		},

		level: {
			error: 'level-error',
			warning: 'level-warning',
			typesetting: 'level-typesetting',
		},

		errorBox: {
			base: 'moshe-log-error-box',
			header: 'moshe-log-error-header',
			location: 'moshe-log-error-location',
			snippet: 'moshe-log-error-snippet',
			cause: 'moshe-log-error-cause',
		},
	},

	modal: {
		swiftLatexLog: 'moshe-swift-latex-log-modal',
	},
} as const;
