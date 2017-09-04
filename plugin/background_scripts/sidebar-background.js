// Beim Klick auf das Storyfinder-Icon in der Browser Bar wird eine Nachricht an das
// Contentscript gesendet. Dort wird dann die Sidebar ein- bzw. ausgeblendet.
chrome.browserAction.onClicked.addListener(function(){
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
        chrome.tabs.sendMessage(tabs[0].id,{type: "toggle-sidebar"});
    });
});