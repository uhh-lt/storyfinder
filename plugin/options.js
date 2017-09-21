function saveChanges() {
    // Get a value saved in a form.
    var s = document.getElementById('server').value;

    // Save it using the Chrome extension storage API.
    chrome.storage.sync.set({
        server: s,
    }, function() {
        // Update status to let user know options were saved.
    });

    window.close()
}

function restoreOptions() {
    // Get a value from the Chrome extension storage API.
    chrome.storage.sync.get({
        server: "http://localhost:3055"
    }, function(items) {
        // Set a value in a form.
        document.getElementById('server').value = items.server;
    });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveChanges);
