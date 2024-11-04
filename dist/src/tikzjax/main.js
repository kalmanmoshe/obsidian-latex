import { Plugin, WorkspaceWindow } from "obsidian";
import { DEFAULT_SETTINGS, TikzjaxSettingTab } from "./settings";
import { optimize } from "./svgo.browser";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
export default class TikzjaxPlugin extends Plugin {
    constructor() {
        super(...arguments);
        this.postProcessSvg = (e) => {
            const svgEl = e.target;
            let svg = svgEl.outerHTML;
            if (this.settings.invertColorsInDarkMode) {
                svg = this.colorSVGinDarkMode(svg);
            }
            svg = this.optimizeSVG(svg);
            svgEl.outerHTML = svg;
        };
    }
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new TikzjaxSettingTab(this.app, this));
        // Support pop-out windows
    }
    onunload() {
        this.unloadTikZJaxAllWindows();
        this.removeSyntaxHighlighting();
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    loadTikZJax(doc) {
        const s = document.createElement("script");
        s.id = "tikzjax";
        s.type = "text/javascript";
        s.innerText = tikzjaxJs;
        doc.body.appendChild(s);
        doc.addEventListener("tikzjax-load-finished", this.postProcessSvg);
    }
    unloadTikZJax(doc) {
        const s = doc.getElementById("tikzjax");
        s?.remove();
        doc.removeEventListener("tikzjax-load-finished", this.postProcessSvg);
    }
    loadTikZJaxAllWindows() {
        for (const window of this.getAllWindows()) {
            this.loadTikZJax(window.document);
        }
    }
    unloadTikZJaxAllWindows() {
        for (const window of this.getAllWindows()) {
            this.unloadTikZJax(window.document);
        }
    }
    getAllWindows() {
        // Via https://discord.com/channels/686053708261228577/840286264964022302/991591350107635753
        const windows = [];
        // push the main window's root split to the list
        windows.push(this.app.workspace.rootSplit.win);
        // @ts-ignore floatingSplit is undocumented
        const floatingSplit = this.app.workspace.floatingSplit;
        floatingSplit.children.forEach((child) => {
            // if this is a window, push it to the list 
            if (child instanceof WorkspaceWindow) {
                windows.push(child.win);
            }
        });
        return windows;
    }
    registerTikzCodeBlock() {
        this.registerMarkdownCodeBlockProcessor("tikz", (source, el, ctx) => {
            const script = el.createEl("script");
            script.setAttribute("type", "text/tikz");
            script.setAttribute("data-show-console", "true");
            script.setText(this.tidyTikzSource(source));
        });
    }
    addSyntaxHighlighting() {
        // @ts-ignore
        window.CodeMirror.modeInfo.push({ name: "Tikz", mime: "text/x-latex", mode: "stex" });
    }
    removeSyntaxHighlighting() {
        // @ts-ignore
        window.CodeMirror.modeInfo = window.CodeMirror.modeInfo.filter(el => el.name != "Tikz");
    }
    tidyTikzSource(tikzSource) {
        // Remove non-breaking space characters, otherwise we get errors
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");
        let lines = tikzSource.split("\n");
        // Trim whitespace that is inserted when pasting in code, otherwise TikZJax complains
        lines = lines.map(line => line.trim());
        // Remove empty lines
        lines = lines.filter(line => line);
        return lines.join("\n");
    }
    colorSVGinDarkMode(svg) {
        // Replace the color "black" with currentColor (the current text color)
        // so that diagram axes, etc are visible in dark mode
        // And replace "white" with the background color
        svg = svg.replaceAll(/("#000"|"black")/g, "\"currentColor\"")
            .replaceAll(/("#fff"|"white")/g, "\"var(--background-primary)\"");
        return svg;
    }
    optimizeSVG(svg) {
        // Optimize the SVG using SVGO
        // Fixes misaligned text nodes on mobile
        return optimize(svg, { plugins: [
                {
                    name: "preset-default",
                    params: {
                        overrides: {
                            // Don't use the "cleanupIDs" plugin
                            // To avoid problems with duplicate IDs ("a", "b", ...)
                            // when inlining multiple svgs with IDs
                            cleanupIDs: false
                        }
                    }
                }
            ]
            // @ts-ignore
        })?.data;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L21haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDbkQsT0FBTyxFQUF5QixnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUN4RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFFMUMsYUFBYTtBQUNiLE9BQU8sU0FBUyxNQUFNLHFCQUFxQixDQUFDO0FBRzVDLE1BQU0sQ0FBQyxPQUFPLE9BQU8sYUFBYyxTQUFRLE1BQU07SUFBakQ7O1FBeUpDLG1CQUFjLEdBQUcsQ0FBQyxDQUFRLEVBQUUsRUFBRTtZQUU3QixNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsTUFBcUIsQ0FBQztZQUN0QyxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDO1lBRTFCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRTtnQkFDekMsR0FBRyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQzthQUNuQztZQUVELEdBQUcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRTVCLEtBQUssQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDO1FBQ3ZCLENBQUMsQ0FBQTtJQUNGLENBQUM7SUFuS0EsS0FBSyxDQUFDLE1BQU07UUFDWCxNQUFNLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRTFELDBCQUEwQjtJQUUzQixDQUFDO0lBRUQsUUFBUTtRQUNQLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQy9CLElB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LE9BQU8sR0FBRyxDQUFDO0lBQ1osQ0FBQztJQUdELFdBQVcsQ0FBQyxHQUFXO1FBQ3RCLDhCQUE4QjtRQUM5Qix3Q0FBd0M7UUFFeEMsT0FBTyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUMsT0FBTyxFQUM1QjtnQkFDQztvQkFDQyxJQUFJLEVBQUUsZ0JBQWdCO29CQUN0QixNQUFNLEVBQUU7d0JBQ1AsU0FBUyxFQUFFOzRCQUNWLG9DQUFvQzs0QkFDcEMsdURBQXVEOzRCQUN2RCx1Q0FBdUM7NEJBQ3ZDLFVBQVUsRUFBRSxLQUFLO3lCQUNqQjtxQkFDRDtpQkFDRDthQUNEO1lBQ0YsYUFBYTtTQUNaLENBQUMsRUFBRSxJQUFJLENBQUM7SUFDVixDQUFDO0NBZ0JEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGx1Z2luLCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IHsgVGlrempheFBsdWdpblNldHRpbmdzLCBERUZBVUxUX1NFVFRJTkdTLCBUaWt6amF4U2V0dGluZ1RhYiB9IGZyb20gXCIuL3NldHRpbmdzXCI7XHJcbmltcG9ydCB7IG9wdGltaXplIH0gZnJvbSBcIi4vc3Znby5icm93c2VyXCI7XHJcblxyXG4vLyBAdHMtaWdub3JlXHJcbmltcG9ydCB0aWt6amF4SnMgZnJvbSBcImlubGluZTouL3Rpa3pqYXguanNcIjtcclxuXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUaWt6amF4UGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcclxuXHRzZXR0aW5nczogVGlrempheFBsdWdpblNldHRpbmdzO1xyXG5cclxuXHRhc3luYyBvbmxvYWQoKSB7XHJcblx0XHRhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBUaWt6amF4U2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG5cclxuXHRcdC8vIFN1cHBvcnQgcG9wLW91dCB3aW5kb3dzXHJcblx0XHRcclxuXHR9XHJcblxyXG5cdG9udW5sb2FkKCkge1xyXG5cdFx0dGhpcy51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG5cdFx0dGhpcy5yZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKTtcclxuXHR9XHJcblxyXG5cdGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcclxuXHRcdHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xyXG5cdH1cclxuXHJcblx0YXN5bmMgc2F2ZVNldHRpbmdzKCkge1xyXG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcclxuXHR9XHJcblxyXG5cclxuXHRsb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XHJcblx0XHRjb25zdCBzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtcclxuXHRcdHMuaWQgPSBcInRpa3pqYXhcIjtcclxuXHRcdHMudHlwZSA9IFwidGV4dC9qYXZhc2NyaXB0XCI7XHJcblx0XHRzLmlubmVyVGV4dCA9IHRpa3pqYXhKcztcclxuXHRcdGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xyXG5cclxuXHJcblx0XHRkb2MuYWRkRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcclxuXHR9XHJcblxyXG5cdHVubG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG5cdFx0Y29uc3QgcyA9IGRvYy5nZXRFbGVtZW50QnlJZChcInRpa3pqYXhcIik7XHJcblx0XHRzPy5yZW1vdmUoKTtcclxuXHJcblx0XHRkb2MucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcclxuXHR9XHJcblxyXG5cdGxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcclxuXHRcdGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcblx0XHRcdHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG5cdFx0Zm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcclxuXHRcdFx0dGhpcy51bmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRnZXRBbGxXaW5kb3dzKCkge1xyXG5cdFx0Ly8gVmlhIGh0dHBzOi8vZGlzY29yZC5jb20vY2hhbm5lbHMvNjg2MDUzNzA4MjYxMjI4NTc3Lzg0MDI4NjI2NDk2NDAyMjMwMi85OTE1OTEzNTAxMDc2MzU3NTNcclxuXHJcblx0XHRjb25zdCB3aW5kb3dzID0gW107XHJcblx0XHRcclxuXHRcdC8vIHB1c2ggdGhlIG1haW4gd2luZG93J3Mgcm9vdCBzcGxpdCB0byB0aGUgbGlzdFxyXG5cdFx0d2luZG93cy5wdXNoKHRoaXMuYXBwLndvcmtzcGFjZS5yb290U3BsaXQud2luKTtcclxuXHRcdFxyXG5cdFx0Ly8gQHRzLWlnbm9yZSBmbG9hdGluZ1NwbGl0IGlzIHVuZG9jdW1lbnRlZFxyXG5cdFx0Y29uc3QgZmxvYXRpbmdTcGxpdCA9IHRoaXMuYXBwLndvcmtzcGFjZS5mbG9hdGluZ1NwbGl0O1xyXG5cdFx0ZmxvYXRpbmdTcGxpdC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiB7XHJcblx0XHRcdC8vIGlmIHRoaXMgaXMgYSB3aW5kb3csIHB1c2ggaXQgdG8gdGhlIGxpc3QgXHJcblx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIFdvcmtzcGFjZVdpbmRvdykge1xyXG5cdFx0XHRcdHdpbmRvd3MucHVzaChjaGlsZC53aW4pO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHJcblx0XHRyZXR1cm4gd2luZG93cztcclxuXHR9XHJcblxyXG5cclxuXHRyZWdpc3RlclRpa3pDb2RlQmxvY2soKSB7XHJcblx0XHR0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcclxuXHRcdFx0Y29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcblxyXG5cdFx0XHRzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcclxuXHRcdFx0c2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcclxuXHJcblx0XHRcdHNjcmlwdC5zZXRUZXh0KHRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKSk7XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cclxuXHRhZGRTeW50YXhIaWdobGlnaHRpbmcoKSB7XHJcblx0XHQvLyBAdHMtaWdub3JlXHJcblx0XHR3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5wdXNoKHtuYW1lOiBcIlRpa3pcIiwgbWltZTogXCJ0ZXh0L3gtbGF0ZXhcIiwgbW9kZTogXCJzdGV4XCJ9KTtcclxuXHR9XHJcblxyXG5cdHJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuXHRcdC8vIEB0cy1pZ25vcmVcclxuXHRcdHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvID0gd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8uZmlsdGVyKGVsID0+IGVsLm5hbWUgIT0gXCJUaWt6XCIpO1xyXG5cdH1cclxuXHJcblx0dGlkeVRpa3pTb3VyY2UodGlrelNvdXJjZTogc3RyaW5nKSB7XHJcblxyXG5cdFx0Ly8gUmVtb3ZlIG5vbi1icmVha2luZyBzcGFjZSBjaGFyYWN0ZXJzLCBvdGhlcndpc2Ugd2UgZ2V0IGVycm9yc1xyXG5cdFx0Y29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuXHRcdHRpa3pTb3VyY2UgPSB0aWt6U291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtcclxuXHJcblxyXG5cdFx0bGV0IGxpbmVzID0gdGlrelNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuXHJcblx0XHQvLyBUcmltIHdoaXRlc3BhY2UgdGhhdCBpcyBpbnNlcnRlZCB3aGVuIHBhc3RpbmcgaW4gY29kZSwgb3RoZXJ3aXNlIFRpa1pKYXggY29tcGxhaW5zXHJcblx0XHRsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuXHJcblx0XHQvLyBSZW1vdmUgZW1wdHkgbGluZXNcclxuXHRcdGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XHJcblxyXG5cclxuXHRcdHJldHVybiBsaW5lcy5qb2luKFwiXFxuXCIpO1xyXG5cdH1cclxuXHJcblxyXG5cdGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xyXG5cdFx0Ly8gUmVwbGFjZSB0aGUgY29sb3IgXCJibGFja1wiIHdpdGggY3VycmVudENvbG9yICh0aGUgY3VycmVudCB0ZXh0IGNvbG9yKVxyXG5cdFx0Ly8gc28gdGhhdCBkaWFncmFtIGF4ZXMsIGV0YyBhcmUgdmlzaWJsZSBpbiBkYXJrIG1vZGVcclxuXHRcdC8vIEFuZCByZXBsYWNlIFwid2hpdGVcIiB3aXRoIHRoZSBiYWNrZ3JvdW5kIGNvbG9yXHJcblxyXG5cdFx0c3ZnID0gc3ZnLnJlcGxhY2VBbGwoLyhcIiMwMDBcInxcImJsYWNrXCIpL2csIFwiXFxcImN1cnJlbnRDb2xvclxcXCJcIilcclxuXHRcdFx0XHQucmVwbGFjZUFsbCgvKFwiI2ZmZlwifFwid2hpdGVcIikvZywgXCJcXFwidmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KVxcXCJcIik7XHJcblxyXG5cdFx0cmV0dXJuIHN2ZztcclxuXHR9XHJcblxyXG5cclxuXHRvcHRpbWl6ZVNWRyhzdmc6IHN0cmluZykge1xyXG5cdFx0Ly8gT3B0aW1pemUgdGhlIFNWRyB1c2luZyBTVkdPXHJcblx0XHQvLyBGaXhlcyBtaXNhbGlnbmVkIHRleHQgbm9kZXMgb24gbW9iaWxlXHJcblxyXG5cdFx0cmV0dXJuIG9wdGltaXplKHN2Zywge3BsdWdpbnM6XHJcblx0XHRcdFtcclxuXHRcdFx0XHR7XHJcblx0XHRcdFx0XHRuYW1lOiBcInByZXNldC1kZWZhdWx0XCIsXHJcblx0XHRcdFx0XHRwYXJhbXM6IHtcclxuXHRcdFx0XHRcdFx0b3ZlcnJpZGVzOiB7XHJcblx0XHRcdFx0XHRcdFx0Ly8gRG9uJ3QgdXNlIHRoZSBcImNsZWFudXBJRHNcIiBwbHVnaW5cclxuXHRcdFx0XHRcdFx0XHQvLyBUbyBhdm9pZCBwcm9ibGVtcyB3aXRoIGR1cGxpY2F0ZSBJRHMgKFwiYVwiLCBcImJcIiwgLi4uKVxyXG5cdFx0XHRcdFx0XHRcdC8vIHdoZW4gaW5saW5pbmcgbXVsdGlwbGUgc3ZncyB3aXRoIElEc1xyXG5cdFx0XHRcdFx0XHRcdGNsZWFudXBJRHM6IGZhbHNlXHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdF1cclxuXHRcdC8vIEB0cy1pZ25vcmVcclxuXHRcdH0pPy5kYXRhO1xyXG5cdH1cclxuXHJcblxyXG5cdHBvc3RQcm9jZXNzU3ZnID0gKGU6IEV2ZW50KSA9PiB7XHJcblxyXG5cdFx0Y29uc3Qgc3ZnRWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuXHRcdGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XHJcblxyXG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSkge1xyXG5cdFx0XHRzdmcgPSB0aGlzLmNvbG9yU1ZHaW5EYXJrTW9kZShzdmcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcclxuXHJcblx0XHRzdmdFbC5vdXRlckhUTUwgPSBzdmc7XHJcblx0fVxyXG59XHJcblxyXG4iXX0=