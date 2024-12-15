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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuX3NuaXBwZXRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NuaXBwZXRzL3J1bl9zbmlwcGV0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFJQSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFJakUsZ0VBQWdFO0FBR2hFLE1BQU0sQ0FBQyxNQUFNLFdBQVcsR0FBRyxDQUFDLElBQWdCLEVBQUUsR0FBWSxFQUFFLEdBQVcsRUFBVSxFQUFFO0lBRWxGLElBQUkseUJBQXlCLEdBQUcsS0FBSyxDQUFDO0lBRXRDLEtBQUssTUFBTSxLQUFLLElBQUksR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXZELElBQUksTUFBTSxDQUFDLHlCQUF5QjtZQUFFLHlCQUF5QixHQUFHLElBQUksQ0FBQztJQUN4RSxDQUFDO0lBRUQsTUFBTSxPQUFPLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBR3JDLElBQUkseUJBQXlCLEVBQUUsQ0FBQztRQUMvQiw0QkFBNEI7SUFDN0IsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUMsQ0FBQTtBQUdELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxJQUFnQixFQUFFLEdBQVksRUFBRSxHQUFXLEVBQUUsS0FBcUIsRUFBeUQsRUFBRTtJQUN0SixNQUFNLFFBQVEsR0FBRyxFQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUMsQ0FBQSxDQUFBLHVCQUF1QjtJQUN0RCxNQUFNLEVBQUMsSUFBSSxFQUFFLEVBQUUsRUFBQyxHQUFHLEtBQUssQ0FBQztJQUN6QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDMUMsTUFBTSxJQUFJLEdB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SSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDdkUsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxVQUFVLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDckIsSUFBSSxVQUFVLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN2QixXQUFXLEdBQUcsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JDLENBQUM7YUFDSSxJQUFJLFVBQVUsS0FBSyxDQUFDLENBQUMsRUFBQyxDQUFDO1lBQzNCLFdBQVcsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sV0FBVyxDQUFDO0FBQ3BCLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFNlbGVjdGlvblJhbmdlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBxdWV1ZVNuaXBwZXQgfSBmcm9tIFwic3JjL2NvZGVtaXJyb3Ivc25pcHBldF9xdWV1ZV9zdGF0ZV9maWVsZFwiO1xuaW1wb3J0IHsgT3B0aW9ucyB9IGZyb20gXCJzcmMvZWRpdG9yIHV0aWxpdGllcy9vcHRpb25zXCI7XG5pbXBvcnQgeyBleHBhbmRTbmlwcGV0cyB9IGZyb20gXCJzcmMvc25pcHBldHMvc25pcHBldF9tYW5hZ2VtZW50XCI7XG5pbXBvcnQgeyBDb250ZXh0LE1vZGUgfSBmcm9tIFwic3JjL2VkaXRvciB1dGlsaXRpZXMvY29udGV4dFwiO1xuaW1wb3J0IHsgU3RyaW5nU25pcHBldCB9IGZyb20gXCIuL3NuaXBwZXRzXCI7XG5pbXBvcnQgeyAgfSBmcm9tIFwic3JjL2NvZGVtaXJyb3IvY29uZmlnXCI7XG4vL2ltcG9ydCB7IGF1dG9FbmxhcmdlQnJhY2tldHMgfSBmcm9tIFwiLi9hdXRvX2VubGFyZ2VfYnJhY2tldHNcIjtcblxuXG5leHBvcnQgY29uc3QgcnVuU25pcHBldHMgPSAodmlldzogRWRpdG9yVmlldywgY3R4OiBDb250ZXh0LCBrZXk6IHN0cmluZyk6Ym9vbGVhbiA9PiB7XG5cblx0bGV0IHNob3VsZEF1dG9FbmxhcmdlQnJhY2tldHMgPSBmYWxzZTtcblxuXHRmb3IgKGNvbnN0IHJhbmdlIG9mIGN0eC5yYW5nZXMpIHtcblx0XHRjb25zdCByZXN1bHQgPSBydW5TbmlwcGV0Q3Vyc29yKHZpZXcsIGN0eCwga2V5LCByYW5nZSk7XG4gICAgICAgIFxuXHRcdGlmIChyZXN1bHQuc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0cykgc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0cyA9IHRydWU7XG5cdH1cblxuXHRjb25zdCBzdWNjZXNzID0gZXhwYW5kU25pcHBldHModmlldyk7XG5cblxuXHRpZiAoc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0cykge1xuXHRcdC8vYXV0b0VubGFyZ2VCcmFja2V0cyh2aWV3KTtcblx0fVxuXG5cdHJldHVybiBzdWNjZXNzO1xufVxuXG5cbmNvbnN0IHJ1blNuaXBwZXRDdXJzb3IgPSAodmlldzogRWRpdG9yVmlldywgY3R4OiBDb250ZXh0LCBrZXk6IHN0cmluZywgcmFuZ2U6IFNlbGVjdGlvblJhbmdlKTp7c3VjY2VzczogYm9vbGVhbjsgc2hvdWxkQXV0b0VubGFyZ2VCcmFja2V0czogYm9vbGVhbn0gPT4ge1xuXHRjb25zdCBzZXR0aW5ncyA9IHtzbmlwcGV0czogW119Ly9nZXRNb3NoZUNvbmZpZyh2aWV3KTtcblx0Y29uc3Qge2Zyb20sIHRvfSA9IHJhbmdlO1xuXHRjb25zdCBzZWwgPSB2aWV3LnN0YXRlLnNsaWNlRG9jKGZyb20sIHRvKTtcblx0Y29uc3QgbGluZSA9IHZpZXcuc3RhdGUuc2xpY2VEb2MoMCwgdG8pO1xuXHRjb25zdCB1cGRhdGVkTGluZSA9IGxpbmUgKyBrZXk7XG5cdGZvciAoY29uc3Qgc25pcHBldCBvZiBzZXR0aW5ncy5zbmlwcGV0cykge1xuXHRcdGxldCBlZmZlY3RpdmVMaW5lID0gbGluZTtcbiAgICAgICAgLypcblx0XHRpZiAoIXNuaXBwZXRTaG91bGRSdW5Jbk1vZGUoc25pcHBldC5vcHRpb25zLCBjdHgubW9kZSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChzbmlwcGV0Lm9wdGlvbnMuYXV0b21hdGljIHx8IHNuaXBwZXQudHlwZSA9PT0gXCJ2aXN1YWxcIikge1xuXHRcdFx0Ly8gSWYgdGhlIGtleSBwcmVzc2VkIHdhc24ndCBhIHRleHQgY2hhcmFjdGVyLCBjb250aW51ZVxuXHRcdFx0aWYgKCEoa2V5Lmxlbmd0aCA9PT0gMSkpIGNvbnRpbnVlO1xuXHRcdFx0ZWZmZWN0aXZlTGluZSA9IHVwZGF0ZWRMaW5lO1xuXHRcdH1cblx0XHRlbHNlIGlmICghKGtleSA9PT0gc2V0dGluZ3Muc25pcHBldHNUcmlnZ2VyKSkge1xuXHRcdFx0Ly8gVGhlIHNuaXBwZXQgbXVzdCBiZSB0cmlnZ2VyZWQgYnkgYSBrZXlcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgdGhpcyBzbmlwcGV0IGlzIG5vdCBleGNsdWRlZCBpbiBhIGNlcnRhaW4gZW52aXJvbm1lbnRcblx0XHRsZXQgaXNFeGNsdWRlZCA9IGZhbHNlO1xuXHRcdC8vIGluIHByYWN0aWNlLCBhIHNuaXBwZXQgc2hvdWxkIGhhdmUgdmVyeSBmZXcgZXhjbHVkZWQgZW52aXJvbm1lbnRzLCBpZiBhbnksXG5cdFx0Ly8gc28gdGhlIGNvc3Qgb2YgdGhpcyBjaGVjayBzaG91bGRuJ3QgYmUgdmVyeSBoaWdoXG5cdFx0Zm9yIChjb25zdCBlbnZpcm9ubWVudCBvZiBzbmlwcGV0LmV4Y2x1ZGVkRW52aXJvbm1lbnRzKSB7XG5cdFx0XHRpZiAoY3R4LmlzV2l0aGluRW52aXJvbm1lbnQodG8sIGVudmlyb25tZW50KSkgeyBpc0V4Y2x1ZGVkID0gdHJ1ZTsgfVxuXHRcdH1cblx0XHQvLyB3ZSBjb3VsZCd2ZSB1c2VkIGEgbGFiZWxsZWQgb3V0ZXIgZm9yIGxvb3AgdG8gYGNvbnRpbnVlYCBmcm9tIHdpdGhpbiB0aGUgaW5uZXIgZm9yIGxvb3AsXG5cdFx0Ly8gYnV0IGxhYmVscyBhcmUgZXh0cmVtZWx5IHJhcmVseSB1c2VkLCBzbyB3ZSBkbyB0aGlzIGNvbnN0cnVjdGlvbiBpbnN0ZWFkXG5cdFx0aWYgKGlzRXhjbHVkZWQpIHsgY29udGludWU7IH1cbiAgICAgICAgXG5cdFx0Y29uc3QgcmVzdWx0ID0gc25pcHBldC5wcm9jZXNzKGVmZmVjdGl2ZUxpbmUsIHJhbmdlLCBzZWwpO1xuXHRcdGlmIChyZXN1bHQgPT09IG51bGwpIGNvbnRpbnVlO1xuXHRcdGNvbnN0IHRyaWdnZXJQb3MgPSByZXN1bHQudHJpZ2dlclBvcztcblxuXHRcdGlmIChzbmlwcGV0Lm9wdGlvbnMub25Xb3JkQm91bmRhcnkpIHtcblx0XHRcdC8vIENoZWNrIHRoYXQgdGhlIHRyaWdnZXIgaXMgcHJlY2VkZWQgYW5kIGZvbGxvd2VkIGJ5IGEgd29yZCBkZWxpbWl0ZXJcblx0XHRcdC8vaWYgKCFpc09uV29yZEJvdW5kYXJ5KHZpZXcuc3RhdGUsIHRyaWdnZXJQb3MsIHRvLCBzZXR0aW5ncy53b3JkRGVsaW1pdGVycykpIGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGxldCByZXBsYWNlbWVudCA9IHJlc3VsdC5yZXBsYWNlbWVudDtcblxuXHRcdC8vIFdoZW4gaW4gaW5saW5lIG1hdGgsIHJlbW92ZSBhbnkgc3BhY2VzIGF0IHRoZSBlbmQgb2YgdGhlIHJlcGxhY2VtZW50XG4gICAgICAgIC8qXG5cdFx0aWYgKGN0eC5tb2RlLmlubGluZU1hdGggJiYgc2V0dGluZ3MucmVtb3ZlU25pcHBldFdoaXRlc3BhY2UpIHtcblx0XHRcdHJlcGxhY2VtZW50ID0gdHJpbVdoaXRlc3BhY2UocmVwbGFjZW1lbnQsIGN0eCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwYW5kIHRoZSBzbmlwcGV0XG5cdFx0Y29uc3Qgc3RhcnQgPSB0cmlnZ2VyUG9zO1xuXHRcdHF1ZXVlU25pcHBldCh2aWV3LCBzdGFydCwgdG8sIHJlcGxhY2VtZW50LCBrZXkpO1xuICAgICAgICAqL1xuXHRcdC8vY29uc3QgY29udGFpbnNUcmlnZ2VyID0gc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzLnNvbWUoKHdvcmQ6IHN0cmluZykgPT4gcmVwbGFjZW1lbnQuY29udGFpbnMoXCJcXFxcXCIgKyB3b3JkKSk7XG5cdFx0cmV0dXJuIHtzdWNjZXNzOiB0cnVlLCBzaG91bGRBdXRvRW5sYXJnZUJyYWNrZXRzOiBmYWxzZS8qY29udGFpbnNUcmlnZ2VyKi99O1xuXHR9XG5cblxuXHRyZXR1cm4ge3N1Y2Nlc3M6IGZhbHNlLCBzaG91bGRBdXRvRW5sYXJnZUJyYWNrZXRzOiBmYWxzZX07XG59XG5cbmNvbnN0IHNuaXBwZXRTaG91bGRSdW5Jbk1vZGUgPSAob3B0aW9uczogT3B0aW9ucywgbW9kZTogTW9kZSkgPT4ge1xuXHRpZiAoXG5cdFx0b3B0aW9ucy5tb2RlLmlubGluZU1hdGggJiYgbW9kZS5pbmxpbmVNYXRoIHx8XG5cdFx0b3B0aW9ucy5tb2RlLmJsb2NrTWF0aCAmJiBtb2RlLmJsb2NrTWF0aCB8fFxuXHRcdChvcHRpb25zLm1vZGUuaW5saW5lTWF0aCB8fCBvcHRpb25zLm1vZGUuYmxvY2tNYXRoKSAmJiBtb2RlLmNvZGVNYXRoXG5cdCkge1xuXHRcdGlmICghbW9kZS50ZXh0RW52KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRpZiAobW9kZS5pbk1hdGgoKSAmJiBtb2RlLnRleHRFbnYgJiYgb3B0aW9ucy5tb2RlLnRleHQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChvcHRpb25zLm1vZGUudGV4dCAmJiBtb2RlLnRleHQgfHxcblx0XHRvcHRpb25zLm1vZGUuY29kZSAmJiBtb2RlLmNvZGVcblx0KSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuY29uc3QgaXNPbldvcmRCb3VuZGFyeSA9IChzdGF0ZTogRWRpdG9yU3RhdGUsIHRyaWdnZXJQb3M6IG51bWJlciwgdG86IG51bWJlciwgd29yZERlbGltaXRlcnM6IHN0cmluZykgPT4ge1xuXHRjb25zdCBwcmV2Q2hhciA9IHN0YXRlLnNsaWNlRG9jKHRyaWdnZXJQb3MtMSwgdHJpZ2dlclBvcyk7XG5cdGNvbnN0IG5leHRDaGFyID0gc3RhdGUuc2xpY2VEb2ModG8sIHRvKzEpO1xuXG5cdHdvcmREZWxpbWl0ZXJzID0gd29yZERlbGltaXRlcnMucmVwbGFjZShcIlxcXFxuXCIsIFwiXFxuXCIpO1xuXG5cdHJldHVybiAod29yZERlbGltaXRlcnMuY29udGFpbnMocHJldkNoYXIpICYmIHdvcmREZWxpbWl0ZXJzLmNvbnRhaW5zKG5leHRDaGFyKSk7XG59XG5cbmNvbnN0IHRyaW1XaGl0ZXNwYWNlID0gKHJlcGxhY2VtZW50OiBzdHJpbmcsIGN0eDogQ29udGV4dCkgPT4ge1xuXHRsZXQgc3BhY2VJbmRleCA9IDA7XG5cblx0aWYgKHJlcGxhY2VtZW50LmVuZHNXaXRoKFwiIFwiKSkge1xuXHRcdHNwYWNlSW5kZXggPSAtMTtcblx0fVxuXHRlbHNlIHtcblx0XHRjb25zdCBsYXN0VGhyZWVDaGFycyA9IHJlcGxhY2VtZW50LnNsaWNlKC0zKTtcblx0XHRjb25zdCBsYXN0Q2hhciA9IGxhc3RUaHJlZUNoYXJzLnNsaWNlKC0xKTtcblxuXHRcdGlmIChsYXN0VGhyZWVDaGFycy5zbGljZSgwLCAyKSA9PT0gXCIgJFwiICYmICFpc05hTihwYXJzZUludChsYXN0Q2hhcikpKSB7XG5cdFx0XHRzcGFjZUluZGV4ID0gLTM7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHNwYWNlSW5kZXggIT0gMCkge1xuXHRcdGlmIChzcGFjZUluZGV4ID09PSAtMSkge1xuXHRcdFx0cmVwbGFjZW1lbnQgPSByZXBsYWNlbWVudC50cmltRW5kKCk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHNwYWNlSW5kZXggPT09IC0zKXtcblx0XHRcdHJlcGxhY2VtZW50ID0gcmVwbGFjZW1lbnQuc2xpY2UoMCwgLTMpICsgcmVwbGFjZW1lbnQuc2xpY2UoLTIpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXBsYWNlbWVudDtcbn0iXX0=