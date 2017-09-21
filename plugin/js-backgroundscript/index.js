// DEPENDENCIES
var async = require('async');

// GLOBALS
var popupWindowId = null;
var mainWindowId = null;

var popupPercentage = 0.4;
var windowPercentage = 0.6;

var windowRectangle = {
    height: 0,
    width: 0,
    top: 0,
    left: 0
};

// LISTENER
chrome.browserAction.onClicked.addListener(function() {
    // es wurde bereits einmal ein Popup erzeugt
    if(popupWindowId !== undefined && popupWindowId !== null) {
        chrome.windows.remove(popupWindowId);
        popupWindowId = null;

        chrome.windows.update(mainWindowId, {height: windowRectangle.height, width: windowRectangle.width, top: windowRectangle.top, left: windowRectangle.left});
        // es wurde das erste mal auf den Button geklickt
    } else {
        chrome.windows.getCurrent(function(window) {

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
        });
    }
});

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
        password: ''
    }, function(items) {
        if(items.username === '' || items.password === '') {
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
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
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
    }, function(items) {
        if(items.server === '')
            alert("Server is not defined!");

        async.series([
            function(next){
                data.Site.favicon = "https://www.google.com/s2/favicons?domain="+url.host;
                next();
                /*
                https://www.google.com/s2/favicons?domain=www.tagesschau.de
                getFavicon(data.Site.host, function(favicon){
                    data.Site.favicon = favicon;
                    next();
                });
                */
            },
            function(next){
                saveRemote(items.server.replace(/\/$/,'') + '/Sites', data, function(err, response){
                    console.log(err, response);
                    if(err){
                        next(err);
                        return;
                    }

                    bIsRelevant = response.is_relevant;
                    bIsNew = response.is_new;

                    if(!isUndefined(response.Site)){
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

                    next();
                });
            },
            function(next){
                if(!bIsRelevant || !bIsNew){
                    next();
                    return;
                }

                chrome.windows.getCurrent(function (win) {
                    chrome.tabs.captureVisibleTab(win.id,{"format":"png"}, function(imgUrl) {
                        saveRemote(
                            items.server.replace(/\/$/,'') + '/Sites/' + siteId + '/image',
                            {image: imgUrl},
                            function(err){
                                next(err);
                            }
                        );
                    });
                });
            },
            function(next){
                if(!bIsNew){
                    next();
                    return;
                }
                /*

                captureTab(article.bounds, function(image){
                    saveRemote(
                        items.server.replace(/\/$/,'') + '/Articles/' + articleId + '/image',
                        {image: image},
                        function(err){
                            next(err);
                        }
                    );
                });

                */
            }
        ], function(err){
            if(err){
                throw err;
            }
        });
    });
}

function onAttach() {
    chrome.storage.sync.get({
        server: ''
    }, function(items) {
        if(items.server === '')
            alert("Server is not defined!");

        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            if(tabs[0].url.replace(/\/$/g,'').substr(0, items.server.replace(/\/$/g,'').length) === items.server.replace(/\/$/g,'')) {
                chrome.tabs.sendMessage(tabs[0].id, {type: "hide-sidebar"});
            } else {
                chrome.tabs.sendMessage(tabs[0].id, {type: "getArticle", data: {}});
            }
        });
    });
}

function parseSite(url){
    console.log('Parsing site...', url);

    chrome.tabs.query({active: true, currentWindow: false}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: "getArticle", tab: tabs[0].id, data: {isRelevant: true}});
    });
}

function addToHighlighting(entities){
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
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

    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
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
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {type: 'take-screenshot', data: screenshotUrl});
        });
    });
}

function callbackHandler(data){
    currentCallback(data);
}

/**
 * Checks if `value` is `undefined`.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is `undefined`, else `false`.
 * @example
 *
 * _.isUndefined(void 0);
 * // => true
 *
 * _.isUndefined(null);
 * // => false
 */
function isUndefined(value) {
    return value === undefined;
}

/*
Creates a new Popup and saves the ID in popupWindowId
 */
function createPopup(left, top, width, height) {
    chrome.windows.create({url: chrome.runtime.getURL("popup.html"), left: left, top: top, width: width, height: height, focused: true, type: "popup"}, function(window) {
        popupWindowId = window.id;
    });
}

function storeCredentials(username, password){
    chrome.storage.sync.set({
        username: username,
        password: password
    });
}