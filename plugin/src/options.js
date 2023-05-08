function saveChanges() {
    // Get a value saved in a form.
    var s = document.getElementById('server').value;

    chrome.storage.sync.get({
        server: ""
    }, function(items) {
        if(items.server !== s) {
            // Save it using the Chrome extension storage API.
            chrome.storage.sync.set({
                server: s,
                serverInitialized: true
            }, function() {
                chrome.runtime.sendMessage({type:"settings-changed"});
                window.close();
            });
        } else {
            window.close();
        }
    });
}

function restoreOptions() {
    // Get a value from the Chrome extension storage API.
    chrome.storage.sync.get({
        // server: "http://example.org"
        server: "http://ltdemos.informatik.uni-hamburg.de:8090"
    }, function(items) {
        // Set a value in a form.
        document.getElementById('server').value = items.server;
    });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveChanges);
