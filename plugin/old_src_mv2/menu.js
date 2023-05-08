var buttonParse = document.getElementById("button-parse");
var buttonSidebar = document.getElementById("button-sidebar");
var buttonReadability = document.getElementById("button-readability");
var checkboxHighlight = document.getElementById("checkbox-highlight");

// display the correct status
chrome.storage.sync.get({
    highlightEntities: false,
}, function (items) {
    checkboxHighlight.checked = items.highlightEntities;
});

buttonParse.addEventListener("click", function() {
    chrome.storage.sync.get({
        userInitialized: false,
        serverInitialized: false
    }, function (items) {
        if (!items.serverInitialized && !items.userInitialized)  {
            alert("To use this function, please provide a Server URL in Extensions > Storyfinder > Options and log into your account.");
        } else {
            chrome.runtime.sendMessage({type:"force-parse-site"});
            window.close();
        }
    });
});

buttonSidebar.addEventListener("click", function() {
    chrome.runtime.sendMessage({type:"toggle-sidebar"});
    window.close();
});

buttonReadability.addEventListener("click", function() {
    chrome.runtime.sendMessage({type:"do-readability"});
    window.close();
});

checkboxHighlight.addEventListener("change", function() {
    chrome.storage.sync.set({
        highlightEntities: checkboxHighlight.checked
    }, function() {
        chrome.runtime.sendMessage({type:"highlight-changed", checked: checkboxHighlight.checked});
    });
});