function saveChanges() {
    // Get a value saved in a form.
    var s = document.getElementById('server').value;

    // Save it using the Chrome extension storage API.
    chrome.storage.sync.set({
        server: s,
    }, function() {
        // Update status to let user know options were saved.
    });
}

function restoreOptions() {
    // Use default value color = 'red' and word = 'the'.
    chrome.storage.sync.get({
        server: "http://localhost:3055"
    }, function(items) {
        document.getElementById('server').value = items.server;
    });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveChanges);