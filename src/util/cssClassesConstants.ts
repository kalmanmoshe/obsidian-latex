export const CssClasses = {
	general: {
		settingIcon: 'latex-compiler-math-setting-icon',
	},

	loader: {
		loaderParentContainer: 'latex-compiler-latex-render-loader-parent-container',
		renderLoader: 'latex-compiler-latex-render-loader',
		renderCountdown: 'latex-compiler-latex-render-countdown',
	},

	block: {
		languageLatexSvg: 'block-language-latexsvg',
		languageLatexSvgOverflowDownscale: 'block-language-latexsvg.overflow-downscale',
		languageLatexSvgOverflowScroll: 'block-language-latexsvg.overflow-scroll',
		languageLatexSvgOverflowHidden: 'block-language-latexsvg.overflow-hidden',

		latexError: 'block-latex-error',
	},

	error: {
		container: 'latex-compiler-error-container',
		content: 'latex-compiler-error-content',
		title: 'latex-compiler-error-title',
		cause: 'latex-compiler-error-cause',
		line: 'latex-compiler-error-line',
	},

	log: {
		tabButton: 'latex-compiler-log-tab-button',
		tabContent: 'latex-compiler-log-tab-content',

		severity: {
			error: 'latex-compiler-log-error',
			warning: 'latex-compiler-log-warning',
			typesetting: 'latex-compiler-log-typesetting',
		},

		file: {
			base: 'latex-compiler-log-file',
			item: 'latex-compiler-log-file-item',
			label: 'latex-compiler-log-file-label',
			wrapper: 'latex-compiler-log-file-wrapper',
			details: 'latex-compiler-log-file-details',
			summary: 'latex-compiler-log-file-summary',
			line: 'latex-compiler-log-file-line',
		},

		level: {
			error: 'level-error',
			warning: 'level-warning',
			typesetting: 'level-typesetting',
		},

		errorBox: {
			base: 'latex-compiler-log-error-box',
			header: 'latex-compiler-log-error-header',
			location: 'latex-compiler-log-error-location',
			snippet: 'latex-compiler-log-error-snippet',
			cause: 'latex-compiler-log-error-cause',
		},
	},
} as const;
