/*
Create all the context menu items.
*/
chrome.contextMenus.create({
    id: "add-storyfinder",
    title: "Add to Storyfinder",
    contexts: ["selection"],
    onclick: function(info, tab) {
        var data = {
            caption: info.selectionText.substr(0, 64),
            url: tab.url,
            host: tab.url,
            title: tab.title
        };

        sidebar.emit({action: 'create', data: data});

        /*
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
            chrome.tabs.sendMessage(tabs[0].id,{type: "msg", data: {action: "create", data: data}});
        });
        */
    }
});
chrome.contextMenus.create({
    id: "screenshot",
    title: "Test some functions",
    contexts: ["all"],
    onclick: function(info, tab) {

        function reqListener () {
            var responseStatus = this.status;
            var responseStatusText = this.statusText;
            var responseText = this.responseText;

            alert("Response Status:"+responseStatus+"\n Response Status Text:" + responseStatusText + "\n Response Text:" + responseText);
        }

        var oReq = new XMLHttpRequest();
        oReq.addEventListener("load", reqListener);
        oReq.open("GET", "http://www.example.org/example.txt");
        oReq.send();


        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {type: "test", data: "Tim ist toll"});
        });

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
            chrome.tabs.sendMessage(tabs[0].id,{type: "toggle-sidebar"});
        });

        takeScreenshot();
    }
});

var id = 100;
function takeScreenshot() {
    chrome.tabs.captureVisibleTab(function(screenshotUrl) {
        var viewTabUrl = chrome.extension.getURL("screenshot.html?id=" + id++)
        var targetId = null;

        chrome.tabs.onUpdated.addListener(function listener(tabId, changedProps) {
            // We are waiting for the tab we opened to finish loading.
            // Check that the tab's id matches the tab we opened,
            // and that the tab is done loading.
            if (tabId != targetId || changedProps.status != "complete")
                return;

            // Passing the above test means this is the event we were waiting for.
            // There is nothing we need to do for future onUpdated events, so we
            // use removeListner to stop getting called when onUpdated events fire.
            chrome.tabs.onUpdated.removeListener(listener);

            // Look through all views to find the window which will display
            // the screenshot.  The url of the tab which will display the
            // screenshot includes a query parameter with a unique id, which
            // ensures that exactly one view will have the matching URL.
            var views = chrome.extension.getViews();
            for (var i = 0; i < views.length; i++) {
                var view = views[i];
                if (view.location.href == viewTabUrl) {
                    view.setScreenshotUrl(screenshotUrl);
                    view.setDownloadUrl(screenshotUrl, id - 1);
                    break;
                }
            }
        });

        chrome.tabs.create({url: viewTabUrl}, function(tab) {
            targetId = tab.id;
        });
    });
}