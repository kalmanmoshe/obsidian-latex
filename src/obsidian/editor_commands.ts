import { Editor } from "obsidian";
import Moshe, { staticMosheMathTypingApi } from "src/main";
import { MathPraiser } from "src/mathParser/mathEngine";

function getTranslateFromMathjaxToLatex(plugin: Moshe) {
	if (!staticMosheMathTypingApi) return;
	return {
		id: "moshe-translate-from-mathjax-to-latex",
		name: "Translate from MathJax to LaTeX",
		callback: async () => {
			console.log("Hello from callback");

			await plugin.saveSettings();
		},
		editorCallback: (editor: Editor) => {
			return mathjaxToLatex(String.raw`1+\sin (32)*7.06* \frac{x}{\cos (32)*7.06}-5\left(  \frac{x}{\cos (32)*7.06} \right)^{2}`)
			// @ts-ignore
			const view = editor.cm;
			if (!view) return;

			const ctx = staticMosheMathTypingApi!.context.fromView(view);
			const {from, to} = view.state.selection.main;

			if(ctx.mode.inMath(),from !== to){
				console.log('in math');
				const result = ctx.getBounds();
				if (!result) return false;

				const doc = view.state.doc.toString();
				mathjaxToLatex(doc.slice(from, to));
			}
			else {
				console.log('not in math',navigator.clipboard.readText());
				navigator.clipboard.readText().then((string) => {
					mathjaxToLatex(string);
				}).catch((error) => {
					console.error("Failed to read clipboard: ", error);
				});;
			}
			function mathjaxToLatex(math: string) {
				console.log('math: ',math);
				const a = new MathPraiser();
				a.setInput(math);

				console.log(a.getMathGroup());
			}
		}
	};
}


export const getEditorCommands = (plugin: Moshe) => {
	return [
		getTranslateFromMathjaxToLatex(plugin),
	];
};
