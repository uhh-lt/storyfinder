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

        //sidebar.emit({action: 'create', data: data});

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
            chrome.tabs.sendMessage(tabs[0].id,{type: "msg", data: {action: "create", data: data}});
        });
    }
});
chrome.contextMenus.create({
    id: "screenshot",
    title: "Test some functions",
    contexts: ["all"],
    onclick: function(info, tab) {
        chrome.storage.sync.get({
            server: ''
        }, function (items) {
            if (items.server === '') alert("Server is not defined!");

            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                chrome.webNavigation.getAllFrames({tabId: tabs[0].id}, function(details) {
                    details.forEach(function(detail) {
                        if (detail.url.replace(/\/$/g, '').substr(0, items.server.replace(/\/$/g, '').length) === items.server.replace(/\/$/g, '')) {

                            alert("JOOO!");
                            //chrome.tabs.sendMessage(tabs[0].id, {msg: "TEST"}, {frameId: detail.frameId});

                        }
                    });
                });
            });
        });

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
            chrome.webNavigation.getAllFrames({tabId: tabs[0].id}, function(details) {
                details.forEach(function(detail) {
                   alert(detail.url);
                });
            });
        });
        /*
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


        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            chrome.windows.getCurrent(function (win) {
                chrome.tabs.captureVisibleTab(win.id,{"format":"png"}, function(imgUrl) {
                    chrome.tabs.sendMessage(tabs[0].id, {type: 'take-screenshot', data: imgUrl});
                });
            });
        });
        */
    }
});