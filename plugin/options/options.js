function saveChanges() {
    // Get a value saved in a form.
    var c = document.getElementById('color').value;
    var w = document.getElementById('word').value;

    // Save it using the Chrome extension storage API.
    chrome.storage.sync.set({
        color: c,
        word: w
    }, function() {
        // Update status to let user know options were saved.
        var status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(function() {
            status.textContent = '';
        }, 750);
    });
}

function restoreOptions() {
    // Use default value color = 'red' and word = 'the'.
    chrome.storage.sync.get({
        color: 'red',
        word: 'the'
    }, function(items) {
        document.getElementById('color').value = items.color;
        document.getElementById('word').value = items.word;
    });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveChanges);