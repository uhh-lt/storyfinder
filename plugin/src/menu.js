var buttonParse = document.getElementById("button-parse");
var buttonSidebar = document.getElementById("button-sidebar");

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

/*
chrome.storage.sync.get({
    userInitialized: false,
    serverInitialized: false
}, function (items) {
    if (!items.serverInitialized && !items.userInitialized)  {
        buttonParse.setAttribute("disabled", "disabled");
    }
});
*/