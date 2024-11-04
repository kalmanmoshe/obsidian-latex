import { PluginSettingTab, Setting, Notice } from "obsidian";
import * as localForage from "localforage";
export const DEFAULT_SETTINGS = {
    invertColorsInDarkMode: true
};
export class TikzjaxSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        // Configure localForage if it hasn't been configured by TikZJax already
        // The try-catch block fixes the plugin failing to load on mobile
        try {
            localForage.config({ name: "TikzJax", storeName: "svgImages" });
        }
        catch (error) {
            console.log(error);
        }
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl)
            .setName("Invert dark colors in dark mode")
            .setDesc("Invert dark colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.")
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.invertColorsInDarkMode)
            .onChange(async (value) => {
            this.plugin.settings.invertColorsInDarkMode = value;
            await this.plugin.saveSettings();
        }));
        new Setting(containerEl)
            .setName("Clear cached SVGs")
            .setDesc("SVGs rendered with TikZJax are stored in a database, so diagrams don't have to be re-rendered from scratch every time you open a page. Use this to clear the cache and force all diagrams to be re-rendered.")
            .addButton(button => button
            .setIcon("trash")
            .setTooltip("Clear cached SVGs")
            .onClick(async () => {
            localForage.clear((err) => {
                if (err) {
                    console.log(err);
                    new Notice(err, 3000);
                }
                else {
                    new Notice("TikZJax: Successfully cleared cached SVGs.", 3000);
                }
            });
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvdGlrempheC9zZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQU8sZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBQyxNQUFNLFVBQVUsQ0FBQztBQUVqRSxPQUFPLEtBQUssV0FBVyxNQUFNLGFBQWEsQ0FBQztBQU8zQyxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBMEI7SUFDdEQsc0JBQXNCLEVBQUUsSUFBSTtDQUM1QixDQUFBO0FBR0QsTUFBTSxPQUFPLGlCQUFrQixTQUFRLGdCQUFnQjtJQUd0RCxZQUFZLEdBQVEsRUFBRSxNQUFxQjtRQUMxQyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBR3JCLHdFQUF3RTtRQUN4RSxpRUFBaUU7UUFDakUsSUFBSTtZQUNILFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1NBQ2hFO1FBQUMsT0FBTyxLQUFLLEVBQUU7WUFDZixPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQ25CO0lBQ0YsQ0FBQztJQUVELE9BQU87UUFDTixNQUFNLEVBQUMsV0FBVyxFQUFDLEdBQUcsSUFBSSxDQUFDO1FBQzNCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVwQixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDdEIsT0FBTyxDQUFDLGlDQUFpQyxDQUFDO2FBQzFDLE9BQU8sQ0FBQyxpR0FBaUcsQ0FBQzthQUMxRyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQzthQUNyRCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixHQUFHLEtBQUssQ0FBQztZQUVwRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUdOLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsbUJBQW1CLENBQUM7YUFDNUIsT0FBTyxDQUFDLDhNQUE4TSxDQUFDO2FBQ3ZOLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU07YUFDekIsT0FBTyxDQUFDLE9BQU8sQ0FBQzthQUNoQixVQUFVLENBQUMsbUJBQW1CLENBQUM7YUFDL0IsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ25CLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtnQkFDekIsSUFBSSxHQUFHLEVBQUU7b0JBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDakIsSUFBSSxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO2lCQUN0QjtxQkFDSTtvQkFDSixJQUFJLE1BQU0sQ0FBQyw0Q0FBNEMsRUFBRSxJQUFJLENBQUMsQ0FBQztpQkFDL0Q7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIE5vdGljZX0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCBUaWt6amF4UGx1Z2luIGZyb20gXCIuL21haW5cIjtcclxuaW1wb3J0ICogYXMgbG9jYWxGb3JhZ2UgZnJvbSBcImxvY2FsZm9yYWdlXCI7XHJcblxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBUaWt6amF4UGx1Z2luU2V0dGluZ3Mge1xyXG5cdGludmVydENvbG9yc0luRGFya01vZGU6IGJvb2xlYW47XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBERUZBVUxUX1NFVFRJTkdTOiBUaWt6amF4UGx1Z2luU2V0dGluZ3MgPSB7XHJcblx0aW52ZXJ0Q29sb3JzSW5EYXJrTW9kZTogdHJ1ZVxyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRpa3pqYXhTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XHJcblx0cGx1Z2luOiBUaWt6amF4UGx1Z2luO1xyXG5cclxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBUaWt6amF4UGx1Z2luKSB7XHJcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XHJcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuXHJcblxyXG5cdFx0Ly8gQ29uZmlndXJlIGxvY2FsRm9yYWdlIGlmIGl0IGhhc24ndCBiZWVuIGNvbmZpZ3VyZWQgYnkgVGlrWkpheCBhbHJlYWR5XHJcblx0XHQvLyBUaGUgdHJ5LWNhdGNoIGJsb2NrIGZpeGVzIHRoZSBwbHVnaW4gZmFpbGluZyB0byBsb2FkIG9uIG1vYmlsZVxyXG5cdFx0dHJ5IHtcclxuXHRcdFx0bG9jYWxGb3JhZ2UuY29uZmlnKHsgbmFtZTogXCJUaWt6SmF4XCIsIHN0b3JlTmFtZTogXCJzdmdJbWFnZXNcIiB9KTtcclxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XHJcblx0XHRcdGNvbnNvbGUubG9nKGVycm9yKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGRpc3BsYXkoKTogdm9pZCB7XHJcblx0XHRjb25zdCB7Y29udGFpbmVyRWx9ID0gdGhpcztcclxuXHRcdGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiSW52ZXJ0IGRhcmsgY29sb3JzIGluIGRhcmsgbW9kZVwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkludmVydCBkYXJrIGNvbG9ycyBpbiBkaWFncmFtcyAoZS5nLiBheGVzLCBhcnJvd3MpIHdoZW4gaW4gZGFyayBtb2RlLCBzbyB0aGF0IHRoZXkgYXJlIHZpc2libGUuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkNsZWFyIGNhY2hlZCBTVkdzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiU1ZHcyByZW5kZXJlZCB3aXRoIFRpa1pKYXggYXJlIHN0b3JlZCBpbiBhIGRhdGFiYXNlLCBzbyBkaWFncmFtcyBkb24ndCBoYXZlIHRvIGJlIHJlLXJlbmRlcmVkIGZyb20gc2NyYXRjaCBldmVyeSB0aW1lIHlvdSBvcGVuIGEgcGFnZS4gVXNlIHRoaXMgdG8gY2xlYXIgdGhlIGNhY2hlIGFuZCBmb3JjZSBhbGwgZGlhZ3JhbXMgdG8gYmUgcmUtcmVuZGVyZWQuXCIpXHJcblx0XHRcdC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxyXG5cdFx0XHRcdC5zZXRJY29uKFwidHJhc2hcIilcclxuXHRcdFx0XHQuc2V0VG9vbHRpcChcIkNsZWFyIGNhY2hlZCBTVkdzXCIpXHJcblx0XHRcdFx0Lm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG5cdFx0XHRcdFx0bG9jYWxGb3JhZ2UuY2xlYXIoKGVycikgPT4ge1xyXG5cdFx0XHRcdFx0XHRpZiAoZXJyKSB7XHJcblx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coZXJyKTtcclxuXHRcdFx0XHRcdFx0XHRuZXcgTm90aWNlKGVyciwgMzAwMCk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdFx0bmV3IE5vdGljZShcIlRpa1pKYXg6IFN1Y2Nlc3NmdWxseSBjbGVhcmVkIGNhY2hlZCBTVkdzLlwiLCAzMDAwKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0fSkpO1xyXG5cdH1cclxufVxyXG4iXX0=