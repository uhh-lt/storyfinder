/*
Called when the item has been created, or when creation failed due to an error.
We'll just log success/failure here.
*/
function onCreated() {
    if (browser.runtime.lastError) {
        console.log(`Error: ${browser.runtime.lastError}`);
    } else {
        console.log("Item created successfully");
    }
}

/*
Create all the context menu items.
*/
browser.contextMenus.create({
    id: "log-selection",
    title: "Log selection",
    contexts: ["selection"]
}, onCreated);
browser.contextMenus.create({
    id: "greenify",
    type: "radio",
    title: "Greenify!",
    contexts: ["all"],
    checked: true
}, onCreated);
browser.contextMenus.create({
    id: "bluify",
    type: "radio",
    title: "Bluify!",
    contexts: ["all"],
    checked: false
}, onCreated);
browser.contextMenus.create({
    id: "htmlcode",
    title: "Log the HTML Code",
    contexts: ["all"],
    checked: true
}, onCreated);

/*
Set a colored border on the document in the given tab.

Note that this only work on normal web pages, not special pages
like about:debugging.
*/
var blue = 'document.body.style.border = "5px solid blue"';
var green = 'document.body.style.border = "5px solid green"';

function borderify(tabId, color) {
    browser.tabs.executeScript(tabId, {
        code: color
    });
}

function extractHTML(tabId) {
    browser.tabs.executeScript(tabId, {
        file: "/extract-html.js"
    });
}

/*
The click event listener, where we perform the appropriate action given the
ID of the menu item that was clicked.
*/
browser.contextMenus.onClicked.addListener((info, tab) => {
    switch (info.menuItemId) {
        case "log-selection":
            console.log(info.selectionText);
            break;
        case "bluify":
            borderify(tab.id, blue);
            break;
        case "greenify":
            borderify(tab.id, green);
            break;
        case "htmlcode":
            extractHTML(tab.id);
            break;
    }
});