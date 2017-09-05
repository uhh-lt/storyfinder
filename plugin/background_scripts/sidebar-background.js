// Beim Klick auf das Storyfinder-Icon in der Browser Bar wird eine Nachricht an das
// Contentscript gesendet. Dort wird dann die Sidebar ein- bzw. ausgeblendet.
chrome.browserAction.onClicked.addListener(function(){
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
        chrome.tabs.sendMessage(tabs[0].id,{type: "toggle-sidebar"});
    });
});

chrome.runtime.onMessage.addListener(function(msg, sender){
    switch (msg.type) {
        case "ready":
            initializeSidebar();
            break;
        case "msg":
            switch (msg.data.action) {
                case 'userRegistered':
                    storeCredentials(msg.data.username, msg.data.password);
                    break;
                case 'parseSite':
                    pageworker.parseSite(msg.data.url);
                    break;
                case 'newEntity':
                    console.log('Received new entity');
                    pageworker.addToHighlighting(msg.data.data);
                    break;
                default:
                    console.log('Received unknown message from iframe', data);
                    break;
            }
            break;
    }
});

// früher on 'activate'
chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.storage.sync.get({
        server: "",
        showSidebar: null
    }, function (items) {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            if(tabs[0].url.replace(/\/$/g,'') === items.server.replace(/\/$/g,''))
                chrome.tabs.sendMessage(tabs[0].id, {type: "hide-sidebar"});
            else if(items.showSidebar !== null && items.showSidebar)
                chrome.tabs.sendMessage(tabs[0].id, {type: "show-sidebar"});

            //showGraphForTab(tabs[0].id);
        });
    });
});

// früher on 'open'
chrome.tabs.onCreated.addListener(function(tab) {
    chrome.storage.sync.get({
        server: "",
        showSidebar: null
    }, function (items) {
        if(tab.url.replace(/\/$/g,'') === items.server.replace(/\/$/g,''))
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "hide-sidebar"});
            });
        else if(items.showSidebar !== null && items.showSidebar)
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "show-sidebar"});
            });
    });
});

function initialize() {
    chrome.storage.sync.get({
        showSidebar: null
    }, function (items) {
        if (items.showSidebar !== null && items.showSidebar) {
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "show-sidebar"});
            });
        }
    });
}

function initializeSidebar(worker){
    chrome.storage.sync.get({
        server: "",
        username: ''
    }, function (items) {
        if(items.username === '') {
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "load", data: {url: items.server.replace(/\/$/,'') + '/login', id: tabs[0].id}});
            });
        } else {
            chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "load", data: {url: items.server, id: tabs[0].id}});
            });
        }
    });
}

function storeCredentials(username, password){
    chrome.storage.sync.set({
        username: username,
        password: password
    });
}

function emit(data){
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: "msg", data: data});
    });
}

function showGraphForTab(id){
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: "activateTab", data: {id: id}});
    });
}

initialize();
