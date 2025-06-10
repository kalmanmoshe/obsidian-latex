import { Command, Editor, EditorPosition, HeadingCache, Notice } from "obsidian";
import { getCurrentCursorLocationSection } from "src/latexRender/cache/findSection";
import Moshe from "src/main";
const Hebcal = require('hebcal');
const { HDate } = require('hebcal');
function getCodeBlockNamer(plugin: Moshe) {
	return {
		id: "moshe-name-code-block",
		name: "name current code block",
		editorCallback: (editor: Editor) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return;
			const pos = editor.getCursor();
			const cache = plugin.app.metadataCache.getFileCache(file);
			const headings = (cache?.headings ?? [])
			.filter(h=> h.position.start.line <= pos.line)
			.sort((a,b) => a.position.start.line - b.position.start.line);

			const headingsByLevel = headings.reduce((acc, h) => {
				acc.set(h.level, h);
				return acc;
			}, new Map<number, typeof headings[number]>());

			if (headingsByLevel.size === 0) {
				new Notice("Cant determine code block name as no headings are present");
				return;
			}

			let name="";
			for (const rule of headingTransformRules) {
				const headingCache = headingsByLevel.get(rule.level);
				const heading = headingCache?.heading.trim();
				if (heading && rule.regex.test(heading)) {
					const transformed = typeof rule.replace === "function"
						? rule.replace(heading.match(rule.regex)?.[0] ?? "")
						: heading.replace(rule.regex, rule.replace);
					name += (name.length==0?"":"-")+transformed;
				}
			}
			if(name.length==0){
				new Notice("no meaningful name was extracted from headings");
			}
			name = name.replace(/\s+/g, "-");
			
			getCurrentCursorLocationSection(file,plugin,editor).then((section) => {
				if (!section) return;
				plugin.app.vault.read(file).then((text) => {
					let insert = "name: "+"grade11-"+name;

					const line=text.split("\n")[section.position.start.line];
					const deliminatorLength=line.match(/^(`|~){3,}\s*[^\s]*/)?.[0].length;
					if (deliminatorLength==undefined) throw new Error("Deliminator not found");
					const pos = section.position;

					let from: EditorPosition, to: EditorPosition|undefined=undefined;

					const existingName = line.match(/name:\s*[^\s]+/)?.[0]
					if(existingName!==undefined){
						const nameStart = line.indexOf(existingName);
						from = {line: pos.start.line, ch: nameStart};
						to = {line: pos.start.line, ch: nameStart+existingName.length};
					}else{
						insert = " "+insert;
						from = {line: pos.start.line, ch: line.length};
					}
					editor.replaceRange(insert, from, to);
				});
			})
		}
	};
}

export const getEditorCommands = (plugin: Moshe): (Command|undefined)[] => {
	return [
		getCodeBlockNamer(plugin),
	];
};


const headingTransformRules = [
	{ level: 1, regex: /Intro/i, replace: "📘 Introduction" },
	2, 3, 4,
	{ level: 5, regex: /^(.*)$/ig, replace: (match: string)=> {
			match = match.replace(/^שאלון\s*([0-9.]+)\s*/,"questionnaire$1")
			.replace(/קיץ\s*/,"summer")
			.replace(/חורף\s*/,"winter")
			.replace(/([א-ת"'`]{3,8})\s*/, (date: string) => {
				date=date.replace(/\s*/g,"")
				let hebrewYear = Hebcal.gematriya(date);
				hebrewYear= hebrewYear<=1000?hebrewYear+5000:hebrewYear;
				const hdate = new HDate(1, 'Tishrei', hebrewYear);
				const gregDate = hdate.greg();

				//it defults to the beginning of the hebrew year which is 1 behind the Gregorian year
				const year = Number(gregDate.getFullYear())+1;
				return year.toString();
			})
			.replace(/מיוחד\s*/,"special")
			.replace(/מועד\s*([א-ת]|[0-9.])+\s*/,(match: string) => {
				match=match.replace(/מועד/,"").replace(/\s+/g,"")
				if (Number.isNaN(Number(match))){
					return "term"+Hebcal.gematriya(match);
				}
				return "term"+match
			})
			match=match.replace(/\s+/g,"")
			return match.split(/(questionnaire[0-9.]+)/).filter(Boolean).join("-");
		} 
	},
	{ level: 6, regex: /שאלה\s*([0-9.]+)/ig, replace: "question$1" },
].map((level) => {
	if (typeof level === "number") {
		return { level, regex: /^$/, replace: "" };
	} else {
		return level;
	}
});
