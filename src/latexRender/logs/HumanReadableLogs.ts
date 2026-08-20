import { ErrorMessage } from '../errors/errorDisplay';
import LatexLogParser, { ProcessedLog } from './latexLogParser';

export default function parseLatexLog(
	rawLog: string,
	ignoreDuplicates: boolean = true,
): ProcessedLog {
	return new LatexLogParser(rawLog, ignoreDuplicates).parse();
}

export function refactorLogToErrorMessage(err: ProcessedLog): ErrorMessage {
	if (err.errors.length === 0) {
		return {
			title: 'Unknown LaTeX error',
			explanation: err.raw,
		}
	} 
	const focusedError = err.errors[0]
	return {
		title: focusedError.message,
		cause: focusedError.cause || focusedError.content,
		line: focusedError.line || undefined,
	};
}