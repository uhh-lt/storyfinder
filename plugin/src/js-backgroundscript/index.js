// DEPENDENCIES
var async = require('async');

// URLS
var installURL = "https://uhh-lt.github.io/storyfinder/"; // this will be opend on install
var uninstallURL = "https://uhh-lt.github.io/storyfinder/"; // this will be opened on uninstall

// GLOBALS
var popupWindowId = null;
var mainWindowId = chrome.windows.WINDOW_ID_CURRENT;
var mainURL = "";
var current_parsing_job_urls = new Set();

var popupPercentage = 0.4;
var windowPercentage = 0.6;

var windowRectangle = {
    height: 0,
    width: 0,
    top: 0,
    left: 0
};

// LISTENER
chrome.runtime.onInstalled.addListener(function (){
    chrome.tabs.create({url:installURL},function(){
    });
});

chrome.runtime.setUninstallURL(uninstallURL, function() {
});

function toggleSidebar() {
    // es wurde bereits einmal ein Popup erzeugt
    if (popupWindowId !== undefined && popupWindowId !== null) {
        closePopup();
        chrome.contextMenus.update("add-storyfinder", {
            title: "Add to Storyfinder - Activate Sidebar to use this",
            enabled: false
        }, function () {
        });

        // es wurde das erste mal auf den Button geklickt
    } else {
        mainURL = "";

        chrome.windows.getCurrent(function (window) {

            // save mainwindow dimensions
            windowRectangle = {
                height: window.height,
                width: window.width,
                top: window.top,
                left: window.left
            };

            mainWindowId = window.id;

            var popupWidth = Math.round(windowRectangle.width * popupPercentage);
            var windowWidth = Math.round(windowRectangle.width * windowPercentage);

            chrome.windows.update(mainWindowId, {width: windowWidth});

            createPopup(windowRectangle.left + windowWidth, windowRectangle.top, popupWidth, windowRectangle.height);
            chrome.contextMenus.update("add-storyfinder", {title: "Add to Storyfinder", enabled: true}, function () {
            });
        });
    }
}

chrome.runtime.onMessage.addListener(function(msg, sender){
    switch (msg.type) {
        case "setArticle":
            setArticle(msg.data, msg.tab);
            break;
        case "onAttach":
            onAttach();
            break;
        case "emit-sidebar-event":
            chrome.windows.get(popupWindowId, {populate: true}, function(popup) {
                chrome.tabs.sendMessage(popup.tabs[0].id , { type: 'msg', data: { action: msg.data.event, data: msg.data.data } });
            });
            break;
        case "test":
            alert(msg.data);
            break;
        case "toggle-sidebar":
            toggleSidebar();
            break;
        case "force-parse-site":
            chrome.tabs.query({active: true, windowId:mainWindowId}, function (tabs) {
                if(current_parsing_job_urls.has(tabs[0].url))
                    alert("This Site is beeing parsed!");
                else
                    parseSite(tabs[0].url);
            });
            break;
        case "msg":
            switch (msg.data.action) {
                case 'userRegistered':
                    storeCredentials(msg.data.username, msg.data.password);
                    break;
                case 'parseSite':
                    parseSite(msg.data.url);
                    break;
                case 'newEntity':
                    console.log('Received new entity');
                    addToHighlighting(msg.data.data);
                    break;
                default:
                    console.log('Received unknown message from iframe', msg.data);
                    break;
            }
    }
});

chrome.windows.onRemoved.addListener(function(windowID) {
    // fires when the popup was closed
    if(windowID === popupWindowId) {

        // resize mainWindow to old dimensions
        chrome.windows.update(mainWindowId, {height: windowRectangle.height, width: windowRectangle.width, top: windowRectangle.top, left: windowRectangle.left});
        popupWindowId = null;
    }
});

chrome.windows.onFocusChanged.addListener(function(windowId) {
    chrome.windows.get(windowId, {populate: true, windowTypes: ['normal']}, function(window) {
        if(window !== null && window !== undefined) {
            mainWindowId = window.id;
            chrome.tabs.query({windowId: window.id, active:true}, function(tabs) {
                if(tabs[0].url !== mainURL) {
                    mainURL = tabs[0].url;
                    onAttach();
                }
            });
        }
    });
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.windows.get(activeInfo.windowId, {populate: true, windowTypes: ['normal']}, function(window) {
        if(window !== null && window !== undefined) {
            mainWindowId = window.id;
            chrome.tabs.get(activeInfo.tabId, function(tab) {
               if(tab.url !== mainURL) {
                   mainURL = tab.url;
                   onAttach();
               }
            });
        }
    });
});

// CONTEXTMENUS
chrome.contextMenus.create({
    id: "add-storyfinder",
    title: "Add to Storyfinder - Activate Sidebar to use this",
    contexts: ["selection"],
    onclick: function (info, tab) {
        var data = {
            caption: info.selectionText.substr(0, 64),
            url: tab.url,
            host: tab.url,
            title: tab.title
        };

        chrome.windows.get(popupWindowId, { populate: true }, function (popup) {
            chrome.tabs.sendMessage(popup.tabs[0].id, { type: "msg", data: { action: "create", data: data } });
        });
    },
    enabled: false
});

// FUNCTIONS
function saveRemote(url, data, callback) {
    // früher onComplete
    function reqListener () {
        var responseStatus = this.status;
        var responseStatusText = this.statusText;
        var responseText = this.responseText;

        if(responseStatus === 401){
            console.log("sidebar.showLogin()");
            callback(null, null);
        }else if(responseStatus !== 200){
            console.log('Error', responseStatusText, responseText);
            callback(new Error('Unable to save data'));
        }else{
            callback(null, JSON.parse(responseText));
        }
     }

    chrome.storage.sync.get({
        username: '',
        password: '',
        userInitialized: false
    }, function(items) {
        if(items.userInitialized && (items.username === '' || items.password === '')) {
            alert("Username or Password have not been set!");
        } else {
            var oReq = new XMLHttpRequest();
            oReq.addEventListener("load", reqListener);
            oReq.open("PUT", url);
            oReq.setRequestHeader("Content-type", "application/json");
            oReq.setRequestHeader("Authorization", "Basic " + window.btoa(items.username + ":" + items.password));
            oReq.send(JSON.stringify(data));
        }
    });
}

function setArticle(article, thetab) {
    if(thetab !== undefined && thetab !== null) {
        chrome.tabs.get(thetab, function (tab) {
            setArticleHelper(article, tab);
        });
    } else {
        chrome.tabs.query({active: true, windowId:mainWindowId}, function (tabs) {
            setArticleHelper(article, tabs[0]);
        });
    }
}

function setArticleHelper(article, tab) {

    var url = new URL(tab.url);

    var data = {
        Site: {
            url: tab.url,
            host: url.protocol + '//' + url.host,
            headTitle: tab.title
        },
        Article: article
    };

    var bIsNew = false,
        bIsRelevant = false,
        siteId = null,
        articleId = null;

    chrome.storage.sync.get({
        server: '',
        serverInitialized: false
    }, function (items) {
        if (items.serverInitialized && items.server === '')
            alert("Server is not defined!");

        if(items.server === "")
            return;

        current_parsing_job_urls.add(tab.url);
        chrome.browserAction.setIcon({path: "icon-red-48.png",tabId: tab.id});

        async.series([
            function(next){
                // favicon holen
                data.Site.favicon = "https://www.google.com/s2/favicons?domain="+url.host;
                next();
            },
            function(next){
                // seite prüfen: relevant oder nicht relevant
                // seite parsen
                saveRemote(items.server.replace(/\/$/,'') + '/Sites', data, function(err, response){
                    console.log(err, response);
                    if(err){
                        next(err);
                        current_parsing_job_urls.delete(tab.url);
                        chrome.browserAction.setIcon({path: "icon-48.png",tabId: tab.id});
                        return;
                    }

                    bIsRelevant = response.is_relevant;
                    bIsNew = response.is_new;

                    if(response.Site !== undefined){
                        siteId = response.Site.id;
                        articleId = response.Site.Article.id;

                        chrome.tabs.sendMessage(tab.id, {type: "setEntities", data: response});
                    }

                    if(bIsNew && !bIsRelevant){
                        chrome.windows.get(popupWindowId, {populate: true}, function(popup) {
                            chrome.tabs.sendMessage(popup.tabs[0].id , {type: 'msg', data: {action: 'not-relevant', data: data.Site}});
                        });
                    }

                    console.log(response);
                    current_parsing_job_urls.delete(tab.url);
                    chrome.browserAction.setIcon({path: "icon-48.png",tabId: tab.id});
                    next();
                });
            },
            function(next){
                if(!bIsRelevant || !bIsNew){
                    next();
                    return;
                }

                // ausschnitt screenshot machen
                chrome.tabs.captureVisibleTab(mainWindowId,{"format":"png"}, function(imgUrl) {
                    saveRemote(
                        items.server.replace(/\/$/,'') + '/Sites/' + siteId + '/image',
                        {image: imgUrl},
                        function(err){
                            next(err);
                        }
                    );
                });
            },
            function(next){
                if(!bIsNew){
                    next();
                    return;
                }

                // volltext screenshot machen
            }
        ], function(err){
            if(err){
                throw err;
            }
        });
    });
}

function onAttach() {
    if(!isPopupOpen())
        return;

    chrome.storage.sync.get({
        server: '',
        serverInitialized: false
    }, function (items) {
        if (items.serverInitialized && items.server === '')
            alert("Server is not defined!");

        if(items.server === "")
            return;

        chrome.tabs.query({active: true, windowId: mainWindowId}, function (tabs) {
            mainURL = tabs[0].url;
            if(tabs[0].url.replace(/\/$/g,'').substr(0, items.server.replace(/\/$/g,'').length) === items.server.replace(/\/$/g,'')) {
                closePopup();
            } else {
                console.log("TAB:"+tabs[0].url);
                chrome.tabs.sendMessage(tabs[0].id, {type: "getArticle", data: {}});
            }
        });
    });
}

function parseSite(url){
    console.log('Parsing site...', url);

    chrome.tabs.query({active: true, windowId: mainWindowId}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: "getArticle", tab: tabs[0].id, data: {isRelevant: true}});
    });
}

function addToHighlighting(entities){
    chrome.tabs.query({active: true, windowId: mainWindowId}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: "addEntities", data: entities});
    });
}

var currentCallback = null;
function captureTab2(p, callback) {
    currentCallback = callback;

    var rectangle = {
        startX: p.left,
        startY: p.top,
        width: p.width,
        height: p.height
    };

    chrome.runtime.onMessage.addListener(function(msg, sender){
        if(msg.type === "got-screenshot") {
            callbackHandler(msg.data);
        }
    });

    chrome.tabs.query({active: true, windowId: mainWindowId}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: 'take-screenshot', data: rectangle});
    });
}

function captureTab(p, callback) {
    currentCallback = callback;

    chrome.runtime.onMessage.addListener(function(msg, sender){
        if(msg.type === "got-screenshot") {
            callbackHandler(msg.data);
        }
    });

    chrome.tabs.captureVisibleTab(function(screenshotUrl) {
        chrome.tabs.query({active: true, windowId: mainWindowId}, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {type: 'take-screenshot', data: screenshotUrl});
        });
    });
}

function callbackHandler(data){
    currentCallback(data);
}

/*
Creates a new Popup and saves the ID in popupWindowId
 */
function createPopup(left, top, width, height) {
    chrome.windows.create({url: chrome.runtime.getURL("popup.html"), left: left, top: top, width: width, height: height, focused: true, type: "popup"}, function(window) {
        popupWindowId = window.id;
    });
}

function closePopup() {
    chrome.windows.remove(popupWindowId);
    popupWindowId = null;

    chrome.windows.update(mainWindowId, {
        height: windowRectangle.height,
        width: windowRectangle.width,
        top: windowRectangle.top,
        left: windowRectangle.left
    });
}

function storeCredentials(username, password){
    chrome.storage.sync.set({
        username: username,
        password: password,
        userInitialized: true
    });
}

function isPopupOpen() {
    return popupWindowId !== null;
}
