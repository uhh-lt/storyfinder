/* ON ATTACH MUSS AUFGERUFEN WERDEN BEIM LADEN DES CONTENTSCRIPTS */
/* SCREENSHOT BENÖTIGT CAPTURE METHODE! */

var async = require('async'),
    _ = require('lodash'),
    screenshot = require('screenshot.js');

let { getFavicon } = require("sdk/places/favicon");

chrome.runtime.onMessage.addListener(function(msg, sender){
    switch (msg.type) {
        case "emit-sidebar-event":
            sidebar.emit({action: msg.data.event, data: msg.data.data});
            break;
        case "setArticle":
            setArticle(worker, msg.data);
            break;
    }
});

function saveRemote(url, data, callback) {
    // früher onComplete
    function reqListener () {
        var responseStatus = this.status;
        var responseStatusText = this.statusText;
        var responseText = this.responseText;

        if(responseStatus === 401){
            sidebar.showLogin();
            callback(null, null);
        }else if(responseStatus !== 200){
            console.log('Error', responseStatusText, responseText);
            callback(new Error('Unable to save data'));
        }else{
            callback(null, JSON.parse(responseText));
        }
     }

    var oReq = new XMLHttpRequest();
    oReq.addEventListener("load", reqListener);
    oReq.open("PUT", url);
    oReq.setRequestHeader("Content-type", "application/json");
    oReq.send(JSON.stringify(data));
}

function setArticle(worker, article) {
    var data = {
        Site: {
            url: worker.tab.url,
            host: url(worker.tab.url).protocol + '//' + url(worker.tab.url).host,
            headTitle: worker.tab.title
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
                getFavicon(data.Site.host, function(favicon){
                    data.Site.favicon = favicon;
                    next();
                });
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

                    if(!_.isUndefined(response.Site)){
                        siteId = response.Site.id;
                        articleId = response.Site.Article.id;

                        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
                            chrome.tabs.sendMessage(tabs[0].id, {type: "setEntities", data: response});
                        });
                    }

                    if(bIsNew && !bIsRelevant){
                        sidebar.emit({action: 'not-relevant', data: data.Site});
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

                screenshot.capture(null, function(image){
                    saveRemote(
                        items.server.replace(/\/$/,'') + '/Sites/' + siteId + '/image',
                        {image: image},
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

                screenshot.capture(article.bounds, function(image){
                    saveRemote(
                        items.server.replace(/\/$/,'') + '/Articles/' + articleId + '/image',
                        {image: image},
                        function(err){
                            next(err);
                        }
                    );
                });
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
                sidebar.hide();
            } else {
                chrome.tabs.sendMessage(tabs[0].id, {type: "getArticle", data: {}});
            }
        });
    });
}

function parseSite(url){
    console.log('Parsing site...', url);

    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: "getArticle", data: {isRelevant: true}});
    });
}

function addToHighlighting(entities){
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {type: "addEntities", data: entities});
    });
}

    /*Attach the content script*/
    pageMod.PageMod({
        include: "*",
        contentScriptFile: data.url('contentscript.js'),
        contentStyleFile: data.url('contentstyle.css'),
        onAttach: onAttach,
        attachTo: ["top"]
    });
