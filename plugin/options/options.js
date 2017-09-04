function saveChanges() {
    // Get a value saved in a form.
    var u = document.getElementById('username').value;
    var p = document.getElementById('password').value;
    var uid = document.getElementById('userid').value;
    var s = document.getElementById('server').value;
    var sidebar = document.getElementById('showSidebar').value;

    // Save it using the Chrome extension storage API.
    chrome.storage.sync.set({
        username: u,
        password: p,
        userid: uid,
        server: s,
        showSidebar: sidebar
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
        username: "a@b.com",
        password: "12345678",
        userid: 0,
        server: "http://localhost:3055",
        showSidebar: true
    }, function(items) {
        document.getElementById('username').value = items.username;
        document.getElementById('password').value = items.password;
        document.getElementById('userid').value = items.userid;
        document.getElementById('server').value = items.server;
        document.getElementById('showSidebar').value = items.showSidebar;
    });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveChanges);