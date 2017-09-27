var buttonParse = document.getElementById("button-parse");
var buttonSidebar = document.getElementById("button-sidebar");

buttonParse.addEventListener("click", function() {
    chrome.runtime.sendMessage({type:"force-parse-site"});
    window.close();
});

buttonSidebar.addEventListener("click", function() {
    chrome.runtime.sendMessage({type:"toggle-sidebar"});
    window.close();
});