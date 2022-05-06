
// let exampleMenu = new DiceContextMenu()
//     .section("SEND TO:", s => s
//         .row("Everyone", svg_everyone(),false)
//         .row("Self", svg_self(),true)
//     )
//     .section("ROLL WITH:", s => s
//         .row("Advantage", svg_advantage(), false)
//         .row("Flat (One Die)", svg_flat(), true)
//         .row("Disadvantage", svg_disadvantage(), false)
//     );

class DiceContextMenu {

    constructor() {
        this.sections = [];
    }

    section(sectionTitle, builderCallback) {
        let newSection = new DiceContextMenuSection(sectionTitle);
        this.sections.push(newSection);
        builderCallback(newSection);
        return this;
    }

    build() {
        let html = $(`
        	<div role="presentation" id="options-menu" class="MuiModal-root MuiPopover-root jss1 css-jp7szo">
                <div aria-hidden="true" class="MuiBackdrop-root MuiBackdrop-invisible css-esi9ax" style="opacity: 1; transition: opacity 225ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;"></div>
                <div tabIndex="0" data-test="sentinelStart"></div>
                <div class="MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation8 MuiPopover-paper css-1dmzujt" tabIndex="-1" style="opacity: 1; transform: none; transition: opacity 306ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, transform 306ms cubic-bezier(0.4, 0, 0.2, 1) 0ms; top: 281px; left: 871px; transform-origin: 0px 239.609375px;">
                    <div class="jss1 MuiBox-root css-0">
                        <ul class="MuiList-root MuiList-padding MuiList-subheader css-19o40po">
                            <li class="jss2"></li>
        
                        
                        </ul>
                    </div>
                </div>
                <div tabIndex="0" data-test="sentinelEnd"></div>
	        </div>
        `);
        let sectionList = html.find("ul");
        this.sections.forEach(s => {
            let li = $(`<li></li>`);
            li.append(s.build());
            sectionList.append(li);
            sectionList.append(`<hr class="MuiDivider-root MuiDivider-fullWidth css-39bbo6">`);
        });

        let rollButton = $(`<button class="MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-fullWidth MuiButtonBase-root  css-1kol59t" tabIndex="0" type="button">Roll </button>`);
        sectionList.after(rollButton);
        return html;
    }

}

class DiceContextMenuSection {
    constructor(title) {
        this.title = title;
        this.rows = [];
    }
    row(rowTitle, iconHtml, isChecked) {
        let row = new DiceContextMenuRow(iconHtml, rowTitle, isChecked);
        this.rows.push(row);
        return this;
    }
    build() {
        let sectionHtml = $(`
            <ul class="jss3">
                <li class="MuiListSubheader-root MuiListSubheader-gutters MuiListSubheader-sticky css-e3w6lg">${this.title}</li>
            </ul>
        `);
        this.rows.forEach(r => sectionHtml.append(r.build()))
        return sectionHtml;
    }
}

class DiceContextMenuRow {
    constructor(iconHtml, title, isChecked) {
        this.iconHtml = iconHtml;
        this.title = title;
        this.isChecked = isChecked;
    }
    build() {
        let rowHtml = $(`
            <div class="MuiButtonBase-root MuiListItem-root MuiListItem-gutters MuiListItem-padding MuiListItem-button jss6 css-qs2q9j" tabIndex="0" role="button">
                <div class="MuiListItemIcon-root jss7 css-1f8bwsm">
                    ${this.iconHtml}
                </div>
                <div class="MuiListItemText-root css-1tsvksn">
                    <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary css-yb0lig">${this.title}</span>
                </div>
            </div>
        `);
        if (this.isChecked) {
            rowHtml.append(checkmarkHtml());
        }
        rowHtml.on("click", function() {
            rowHtml.parent().find(".checkmarksvg").remove();
            rowHtml.append(checkmarkHtml());
        });
        return rowHtml;
    }
}

function checkmarkHtml() {
    return `<svg class="checkmarksvg MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-vubbuv" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.00025 16C5.74425 16 5.48825 15.902 5.29325 15.707L0.29325 10.707C-0.09775 10.316 -0.09775 9.68401 0.29325 9.29301C0.68425 8.90201 1.31625 8.90201 1.70725 9.29301L6.00025 13.586L16.2932 3.29301C16.6842 2.90201 17.3162 2.90201 17.7073 3.29301C18.0983 3.68401 18.0983 4.31601 17.7073 4.70701L6.70725 15.707C6.51225 15.902 6.25625 16 6.00025 16Z" fill="#1B9AF0"></path></svg>`;
}

function svg_everyone() {
    return `<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-vubbuv"focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 13.75c-2.34 0-7 1.17-7 3.5V19h14v-1.75c0-2.33-4.66-3.5-7-3.5zM4.34 17c.84-.58 2.87-1.25 4.66-1.25s3.82.67 4.66 1.25H4.34zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm0-5c.83 0 1.5.67 1.5 1.5S9.83 10 9 10s-1.5-.67-1.5-1.5S8.17 7 9 7zm7.04 6.81c1.16.84 1.96 1.96 1.96 3.44V19h4v-1.75c0-2.02-3.5-3.17-5.96-3.44zM15 12c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5c-.54 0-1.04.13-1.5.35.63.89 1 1.98 1 3.15s-.37 2.26-1 3.15c.46.22.96.35 1.5.35z" fill="#A7B6C2"></path></svg>`;
}
function svg_self() {
    return ``;
}
function svg_advantage() {
    return ``;
}
function svg_disadvantage() {
    return ``;
}
function svg_flat() {
    return ``;
}
