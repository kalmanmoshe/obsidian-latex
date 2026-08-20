import { ErrorMessage } from "./errorDisplay";

export class UserFacingPluginError extends Error {
	constructor(
        public readonly userTitle: string,
		public readonly userMessage: string,
		developerMessage?: string,
	) {
		super(developerMessage ?? userMessage);
	}
}

export class LatexCompilationError extends Error {
	constructor(public readonly latexLog: string) {
		super('LaTeX compilation failed');
		this.name = 'LatexCompilationError';
	}
}

export function pluginErrorToErrorMessage(error: unknown): ErrorMessage {
    if (error instanceof UserFacingPluginError) {
        return {
            title: error.userTitle,
            explanation: error.userMessage,
        };
    } 

    return {
        title: 'Unexpected error',
        explanation: 'An unexpected error occurred while processing this LaTeX block. ' +
            'Check the developer console for more details. ' +
            'If the problem persists, please report it on GitHub.',
    }
}

export function toErrorString(e: unknown): string {
	if (typeof e === 'string') return e;
	if (e instanceof Error) return e.message ?? e.stack ?? String(e);
	try {
		return JSON.stringify(e, null, 2);
	} catch {
		return String(e);
	}
}