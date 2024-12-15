import { expandSnippets } from "src/snippets/snippet_management";
//import { autoEnlargeBrackets } from "./auto_enlarge_brackets";
export const runSnippets = (view, ctx, key) => {
    let shouldAutoEnlargeBrackets = false;
    for (const range of ctx.ranges) {
        const result = runSnippetCursor(view, ctx, key, range);
        if (result.shouldAutoEnlargeBrackets)
            shouldAutoEnlargeBrackets = true;
    }
    const success = expandSnippets(view);
    if (shouldAutoEnlargeBrackets) {
        //autoEnlargeBrackets(view);
    }
    return success;
};
const runSnippetCursor = (view, ctx, key, range) => {
    const settings = { snippets: [] }; //getMosheConfig(view);
    const { from, to } = range;
    const sel = view.state.sliceDoc(from, to);
    const line = view.state.sliceDoc(0, to);
    const updatedLine = line + key;
    for (const snippet of settings.snippets) {
        let effectiveLine = line;
        /*
        if (!snippetShouldRunInMode(snippet.options, ctx.mode)) {
            continue;
        }

        if (snippet.options.automatic || snippet.type === "visual") {
            // If the key pressed wasn't a text character, continue
            if (!(key.length === 1)) continue;
            effectiveLine = updatedLine;
        }
        else if (!(key === settings.snippetsTrigger)) {
            // The snippet must be triggered by a key
            continue;
        }

        // Check that this snippet is not excluded in a certain environment
        let isExcluded = false;
        // in practice, a snippet should have very few excluded environments, if any,
        // so the cost of this check shouldn't be very high
        for (const environment of snippet.excludedEnvironments) {
            if (ctx.isWithinEnvironment(to, environment)) { isExcluded = true; }
        }
        // we could've used a labelled outer for loop to `continue` from within the inner for loop,
        // but labels are extremely rarely used, so we do this construction instead
        if (isExcluded) { continue; }
        
        const result = snippet.process(effectiveLine, range, sel);
        if (result === null) continue;
        const triggerPos = result.triggerPos;

        if (snippet.options.onWordBoundary) {
            // Check that the trigger is preceded and followed by a word delimiter
            //if (!isOnWordBoundary(view.state, triggerPos, to, settings.wordDelimiters)) continue;
        }

        let replacement = result.replacement;

        // When in inline math, remove any spaces at the end of the replacement
        /*
        if (ctx.mode.inlineMath && settings.removeSnippetWhitespace) {
            replacement = trimWhitespace(replacement, ctx);
        }

        // Expand the snippet
        const start = triggerPos;
        queueSnippet(view, start, to, replacement, key);
        */
        //const containsTrigger = settings.autoEnlargeBracketsTriggers.some((word: string) => replacement.contains("\\" + word));
        return { success: true, shouldAutoEnlargeBrackets: false /*containsTrigger*/ };
    }
    return { success: false, shouldAutoEnlargeBrackets: false };
};
const snippetShouldRunInMode = (options, mode) => {
    if (options.mode.inlineMath && mode.inlineMath ||
        options.mode.blockMath && mode.blockMath ||
        (options.mode.inlineMath || options.mode.blockMath) && mode.codeMath) {
        if (!mode.textEnv) {
            return true;
        }
    }
    if (mode.inMath() && mode.textEnv && options.mode.text) {
        return true;
    }
    if (options.mode.text && mode.text ||
        options.mode.code && mode.code) {
        return true;
    }
};
const isOnWordBoundary = (state, triggerPos, to, wordDelimiters) => {
    const prevChar = state.sliceDoc(triggerPos - 1, triggerPos);
    const nextChar = state.sliceDoc(to, to + 1);
    wordDelimiters = wordDelimiters.replace("\\n", "\n");
    return (wordDelimiters.contains(prevChar) && wordDelimiters.contains(nextChar));
};
const trimWhitespace = (replacement, ctx) => {
    let spaceIndex = 0;
    if (replacement.endsWith(" ")) {
        spaceIndex = -1;
    }
    else {
        const lastThreeChars = replacement.slice(-3);
        const lastChar = lastThreeChars.slice(-1);
        if (lastThreeChars.slice(0, 2) === " $" && !isNaN(parseInt(lastChar))) {
            spaceIndex = -3;
        }
    }
    if (spaceIndex != 0) {
        if (spaceIndex === -1) {
            replacement = replacement.trimEnd();
        }
        else if (spaceIndex === -3) {
            replacement = replacement.slice(0, -3) + replacement.slice(-2);
        }
    }
    return replacement;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuX3NuaXBwZXRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NuaXBwZXRzL3J1bl9zbmlwcGV0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFJQSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFJakUsZ0VBQWdFO0FBR2hFLE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBRyxDQUFDLElBQWdCLEVBQUUsR0FBWSxFQUFFLEdBQVcsRUFBVSxFQUFFO0lBRWxGLElBQUkseUJBQXlCLEdBQUcsS0FBSyxDQUFDO0lBRXRDLEtBQUssTUFBTSxLQUFLLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXZELElBQUksTUFBTSxDQUFDLHlCQUF5QjtZQUFFLHlCQUF5QixHQUFHLElBQUksQ0FBQztJQUN4RSxDQUFDO0lBRUQsTUFBTSxPQUFPLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBR3JDLElBQUkseUJBQXlCLEVBQUUsQ0FBQztRQUMvQiw0QkFBNEI7SUFDN0IsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUMsQ0FBQTtBQUdELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxJQUFnQixFQUFFLEdBQVksRUFBRSxHQUFXLEVBQUUsS0FBcUIsRUFBeUQsRUFBRTtJQUN0SixNQUFNLFFBQVEsR0FBRyxFQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUMsQ0FBQSxDQUFBLHVCQUF1QjtJQUN0RCxNQUFNLEVBQUMsSUFBSSxFQUFFLEVBQUUsRUFBQyxHQUFHLEtBQUssQ0FBQztJQUN6QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDMUMsTUFBTSxJQUFJLEdB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SSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDdkUsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxVQUFVLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDckIsSUFBSSxVQUFVLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN2QixXQUFXLEdBQUcsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JDLENBQUM7YUFDSSxJQUFJLFVBQVUsS0FBSyxDQUFDLENBQUMsRUFBQyxDQUFDO1lBQzNCLFdBQVcsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sV0FBVyxDQUFDO0FBQ3BCLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSwgU2VsZWN0aW9uUmFuZ2UgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgcXVldWVTbmlwcGV0IH0gZnJvbSBcInNyYy9jb2RlbWlycm9yL3NuaXBwZXRfcXVldWVfc3RhdGVfZmllbGRcIjtcclxuaW1wb3J0IHsgT3B0aW9ucyB9IGZyb20gXCJzcmMvZWRpdG9yIHV0aWxpdGllcy9vcHRpb25zXCI7XHJcbmltcG9ydCB7IGV4cGFuZFNuaXBwZXRzIH0gZnJvbSBcInNyYy9zbmlwcGV0cy9zbmlwcGV0X21hbmFnZW1lbnRcIjtcclxuaW1wb3J0IHsgQ29udGV4dCxNb2RlIH0gZnJvbSBcInNyYy9lZGl0b3IgdXRpbGl0aWVzL2NvbnRleHRcIjtcclxuaW1wb3J0IHsgU3RyaW5nU25pcHBldCB9IGZyb20gXCIuL3NuaXBwZXRzXCI7XHJcbmltcG9ydCB7ICB9IGZyb20gXCJzcmMvY29kZW1pcnJvci9jb25maWdcIjtcclxuLy9pbXBvcnQgeyBhdXRvRW5sYXJnZUJyYWNrZXRzIH0gZnJvbSBcIi4vYXV0b19lbmxhcmdlX2JyYWNrZXRzXCI7XHJcblxyXG5cclxuZXhwb3J0IGNvbnN0IHJ1blNuaXBwZXRzID0gKHZpZXc6IEVkaXRvclZpZXcsIGN0eDogQ29udGV4dCwga2V5OiBzdHJpbmcpOmJvb2xlYW4gPT4ge1xyXG5cclxuXHRsZXQgc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0cyA9IGZhbHNlO1xyXG5cclxuXHRmb3IgKGNvbnN0IHJhbmdlIG9mIGN0eC5yYW5nZXMpIHtcclxuXHRcdGNvbnN0IHJlc3VsdCA9IHJ1blNuaXBwZXRDdXJzb3IodmlldywgY3R4LCBrZXksIHJhbmdlKTtcclxuICAgICAgICBcclxuXHRcdGlmIChyZXN1bHQuc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0cykgc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0cyA9IHRydWU7XHJcblx0fVxyXG5cclxuXHRjb25zdCBzdWNjZXNzID0gZXhwYW5kU25pcHBldHModmlldyk7XHJcblxyXG5cclxuXHRpZiAoc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0cykge1xyXG5cdFx0Ly9hdXRvRW5sYXJnZUJyYWNrZXRzKHZpZXcpO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHN1Y2Nlc3M7XHJcbn1cclxuXHJcblxyXG5jb25zdCBydW5TbmlwcGV0Q3Vyc29yID0gKHZpZXc6IEVkaXRvclZpZXcsIGN0eDogQ29udGV4dCwga2V5OiBzdHJpbmcsIHJhbmdlOiBTZWxlY3Rpb25SYW5nZSk6e3N1Y2Nlc3M6IGJvb2xlYW47IHNob3VsZEF1dG9FbmxhcmdlQnJhY2tldHM6IGJvb2xlYW59ID0+IHtcclxuXHRjb25zdCBzZXR0aW5ncyA9IHtzbmlwcGV0czogW119Ly9nZXRNb3NoZUNvbmZpZyh2aWV3KTtcclxuXHRjb25zdCB7ZnJvbSwgdG99ID0gcmFuZ2U7XHJcblx0Y29uc3Qgc2VsID0gdmlldy5zdGF0ZS5zbGljZURvYyhmcm9tLCB0byk7XHJcblx0Y29uc3QgbGluZSA9IHZpZXcuc3RhdGUuc2xpY2VEb2MoMCwgdG8pO1xyXG5cdGNvbnN0IHVwZGF0ZWRMaW5lID0gbGluZSArIGtleTtcclxuXHRmb3IgKGNvbnN0IHNuaXBwZXQgb2Ygc2V0dGluZ3Muc25pcHBldHMpIHtcclxuXHRcdGxldCBlZmZlY3RpdmVMaW5lID0gbGluZTtcclxuICAgICAgICAvKlxyXG5cdFx0aWYgKCFzbmlwcGV0U2hvdWxkUnVuSW5Nb2RlKHNuaXBwZXQub3B0aW9ucywgY3R4Lm1vZGUpKSB7XHJcblx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChzbmlwcGV0Lm9wdGlvbnMuYXV0b21hdGljIHx8IHNuaXBwZXQudHlwZSA9PT0gXCJ2aXN1YWxcIikge1xyXG5cdFx0XHQvLyBJZiB0aGUga2V5IHByZXNzZWQgd2Fzbid0IGEgdGV4dCBjaGFyYWN0ZXIsIGNvbnRpbnVlXHJcblx0XHRcdGlmICghKGtleS5sZW5ndGggPT09IDEpKSBjb250aW51ZTtcclxuXHRcdFx0ZWZmZWN0aXZlTGluZSA9IHVwZGF0ZWRMaW5lO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSBpZiAoIShrZXkgPT09IHNldHRpbmdzLnNuaXBwZXRzVHJpZ2dlcikpIHtcclxuXHRcdFx0Ly8gVGhlIHNuaXBwZXQgbXVzdCBiZSB0cmlnZ2VyZWQgYnkgYSBrZXlcclxuXHRcdFx0Y29udGludWU7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gQ2hlY2sgdGhhdCB0aGlzIHNuaXBwZXQgaXMgbm90IGV4Y2x1ZGVkIGluIGEgY2VydGFpbiBlbnZpcm9ubWVudFxyXG5cdFx0bGV0IGlzRXhjbHVkZWQgPSBmYWxzZTtcclxuXHRcdC8vIGluIHByYWN0aWNlLCBhIHNuaXBwZXQgc2hvdWxkIGhhdmUgdmVyeSBmZXcgZXhjbHVkZWQgZW52aXJvbm1lbnRzLCBpZiBhbnksXHJcblx0XHQvLyBzbyB0aGUgY29zdCBvZiB0aGlzIGNoZWNrIHNob3VsZG4ndCBiZSB2ZXJ5IGhpZ2hcclxuXHRcdGZvciAoY29uc3QgZW52aXJvbm1lbnQgb2Ygc25pcHBldC5leGNsdWRlZEVudmlyb25tZW50cykge1xyXG5cdFx0XHRpZiAoY3R4LmlzV2l0aGluRW52aXJvbm1lbnQodG8sIGVudmlyb25tZW50KSkgeyBpc0V4Y2x1ZGVkID0gdHJ1ZTsgfVxyXG5cdFx0fVxyXG5cdFx0Ly8gd2UgY291bGQndmUgdXNlZCBhIGxhYmVsbGVkIG91dGVyIGZvciBsb29wIHRvIGBjb250aW51ZWAgZnJvbSB3aXRoaW4gdGhlIGlubmVyIGZvciBsb29wLFxyXG5cdFx0Ly8gYnV0IGxhYmVscyBhcmUgZXh0cmVtZWx5IHJhcmVseSB1c2VkLCBzbyB3ZSBkbyB0aGlzIGNvbnN0cnVjdGlvbiBpbnN0ZWFkXHJcblx0XHRpZiAoaXNFeGNsdWRlZCkgeyBjb250aW51ZTsgfVxyXG4gICAgICAgIFxyXG5cdFx0Y29uc3QgcmVzdWx0ID0gc25pcHBldC5wcm9jZXNzKGVmZmVjdGl2ZUxpbmUsIHJhbmdlLCBzZWwpO1xyXG5cdFx0aWYgKHJlc3VsdCA9PT0gbnVsbCkgY29udGludWU7XHJcblx0XHRjb25zdCB0cmlnZ2VyUG9zID0gcmVzdWx0LnRyaWdnZXJQb3M7XHJcblxyXG5cdFx0aWYgKHNuaXBwZXQub3B0aW9ucy5vbldvcmRCb3VuZGFyeSkge1xyXG5cdFx0XHQvLyBDaGVjayB0aGF0IHRoZSB0cmlnZ2VyIGlzIHByZWNlZGVkIGFuZCBmb2xsb3dlZCBieSBhIHdvcmQgZGVsaW1pdGVyXHJcblx0XHRcdC8vaWYgKCFpc09uV29yZEJvdW5kYXJ5KHZpZXcuc3RhdGUsIHRyaWdnZXJQb3MsIHRvLCBzZXR0aW5ncy53b3JkRGVsaW1pdGVycykpIGNvbnRpbnVlO1xyXG5cdFx0fVxyXG5cclxuXHRcdGxldCByZXBsYWNlbWVudCA9IHJlc3VsdC5yZXBsYWNlbWVudDtcclxuXHJcblx0XHQvLyBXaGVuIGluIGlubGluZSBtYXRoLCByZW1vdmUgYW55IHNwYWNlcyBhdCB0aGUgZW5kIG9mIHRoZSByZXBsYWNlbWVudFxyXG4gICAgICAgIC8qXHJcblx0XHRpZiAoY3R4Lm1vZGUuaW5saW5lTWF0aCAmJiBzZXR0aW5ncy5yZW1vdmVTbmlwcGV0V2hpdGVzcGFjZSkge1xyXG5cdFx0XHRyZXBsYWNlbWVudCA9IHRyaW1XaGl0ZXNwYWNlKHJlcGxhY2VtZW50LCBjdHgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIEV4cGFuZCB0aGUgc25pcHBldFxyXG5cdFx0Y29uc3Qgc3RhcnQgPSB0cmlnZ2VyUG9zO1xyXG5cdFx0cXVldWVTbmlwcGV0KHZpZXcsIHN0YXJ0LCB0bywgcmVwbGFjZW1lbnQsIGtleSk7XHJcbiAgICAgICAgKi9cclxuXHRcdC8vY29uc3QgY29udGFpbnNUcmlnZ2VyID0gc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzLnNvbWUoKHdvcmQ6IHN0cmluZykgPT4gcmVwbGFjZW1lbnQuY29udGFpbnMoXCJcXFxcXCIgKyB3b3JkKSk7XHJcblx0XHRyZXR1cm4ge3N1Y2Nlc3M6IHRydWUsIHNob3VsZEF1dG9FbmxhcmdlQnJhY2tldHM6IGZhbHNlLypjb250YWluc1RyaWdnZXIqL307XHJcblx0fVxyXG5cclxuXHJcblx0cmV0dXJuIHtzdWNjZXNzOiBmYWxzZSwgc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0czogZmFsc2V9O1xyXG59XHJcblxyXG5jb25zdCBzbmlwcGV0U2hvdWxkUnVuSW5Nb2RlID0gKG9wdGlvbnM6IE9wdGlvbnMsIG1vZGU6IE1vZGUpID0+IHtcclxuXHRpZiAoXHJcblx0XHRvcHRpb25zLm1vZGUuaW5saW5lTWF0aCAmJiBtb2RlLmlubGluZU1hdGggfHxcclxuXHRcdG9wdGlvbnMubW9kZS5ibG9ja01hdGggJiYgbW9kZS5ibG9ja01hdGggfHxcclxuXHRcdChvcHRpb25zLm1vZGUuaW5saW5lTWF0aCB8fCBvcHRpb25zLm1vZGUuYmxvY2tNYXRoKSAmJiBtb2RlLmNvZGVNYXRoXHJcblx0KSB7XHJcblx0XHRpZiAoIW1vZGUudGV4dEVudikge1xyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGlmIChtb2RlLmluTWF0aCgpICYmIG1vZGUudGV4dEVudiAmJiBvcHRpb25zLm1vZGUudGV4dCkge1xyXG5cdFx0cmV0dXJuIHRydWU7XHJcblx0fVxyXG5cclxuXHRpZiAob3B0aW9ucy5tb2RlLnRleHQgJiYgbW9kZS50ZXh0IHx8XHJcblx0XHRvcHRpb25zLm1vZGUuY29kZSAmJiBtb2RlLmNvZGVcclxuXHQpIHtcclxuXHRcdHJldHVybiB0cnVlO1xyXG5cdH1cclxufVxyXG5cclxuY29uc3QgaXNPbldvcmRCb3VuZGFyeSA9IChzdGF0ZTogRWRpdG9yU3RhdGUsIHRyaWdnZXJQb3M6IG51bWJlciwgdG86IG51bWJlciwgd29yZERlbGltaXRlcnM6IHN0cmluZykgPT4ge1xyXG5cdGNvbnN0IHByZXZDaGFyID0gc3RhdGUuc2xpY2VEb2ModHJpZ2dlclBvcy0xLCB0cmlnZ2VyUG9zKTtcclxuXHRjb25zdCBuZXh0Q2hhciA9IHN0YXRlLnNsaWNlRG9jKHRvLCB0bysxKTtcclxuXHJcblx0d29yZERlbGltaXRlcnMgPSB3b3JkRGVsaW1pdGVycy5yZXBsYWNlKFwiXFxcXG5cIiwgXCJcXG5cIik7XHJcblxyXG5cdHJldHVybiAod29yZERlbGltaXRlcnMuY29udGFpbnMocHJldkNoYXIpICYmIHdvcmREZWxpbWl0ZXJzLmNvbnRhaW5zKG5leHRDaGFyKSk7XHJcbn1cclxuXHJcbmNvbnN0IHRyaW1XaGl0ZXNwYWNlID0gKHJlcGxhY2VtZW50OiBzdHJpbmcsIGN0eDogQ29udGV4dCkgPT4ge1xyXG5cdGxldCBzcGFjZUluZGV4ID0gMDtcclxuXHJcblx0aWYgKHJlcGxhY2VtZW50LmVuZHNXaXRoKFwiIFwiKSkge1xyXG5cdFx0c3BhY2VJbmRleCA9IC0xO1xyXG5cdH1cclxuXHRlbHNlIHtcclxuXHRcdGNvbnN0IGxhc3RUaHJlZUNoYXJzID0gcmVwbGFjZW1lbnQuc2xpY2UoLTMpO1xyXG5cdFx0Y29uc3QgbGFzdENoYXIgPSBsYXN0VGhyZWVDaGFycy5zbGljZSgtMSk7XHJcblxyXG5cdFx0aWYgKGxhc3RUaHJlZUNoYXJzLnNsaWNlKDAsIDIpID09PSBcIiAkXCIgJiYgIWlzTmFOKHBhcnNlSW50KGxhc3RDaGFyKSkpIHtcclxuXHRcdFx0c3BhY2VJbmRleCA9IC0zO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0aWYgKHNwYWNlSW5kZXggIT0gMCkge1xyXG5cdFx0aWYgKHNwYWNlSW5kZXggPT09IC0xKSB7XHJcblx0XHRcdHJlcGxhY2VtZW50ID0gcmVwbGFjZW1lbnQudHJpbUVuZCgpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSBpZiAoc3BhY2VJbmRleCA9PT0gLTMpe1xyXG5cdFx0XHRyZXBsYWNlbWVudCA9IHJlcGxhY2VtZW50LnNsaWNlKDAsIC0zKSArIHJlcGxhY2VtZW50LnNsaWNlKC0yKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHJldHVybiByZXBsYWNlbWVudDtcclxufSJdfQ==