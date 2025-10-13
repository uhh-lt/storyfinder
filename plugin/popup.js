var baseUrl = "";

chrome.runtime.onMessage.addListener(function(msg, sender){
    switch (msg.type) {
        case "msg":
            document.querySelector('iframe.active').contentWindow.postMessage(msg.data, '*');
            break;
        case "settings-changed":
            window.location.reload();
            break;
    }
});

chrome.storage.sync.get({
    server: "",
    serverInitialized: false
}, function(items) {
    if(!items.serverInitialized || !items.server) {
        var message = document.getElementById("message");
        message.innerHTML = "<strong>Server URL is not set.</strong><br/>Open Extensions → StoryFinder → Options and set the Server URL. <br/><br/><button id=\"open-options\">Open Options</button>";
        var btn = document.getElementById('open-options');
        if (btn) btn.addEventListener('click', function(){ try{ chrome.runtime.openOptionsPage(); }catch(_){} window.close(); });
        return;
    }

    baseUrl = items.server;
    var iframe = document.createElement('iframe');
    iframe.setAttribute('src', baseUrl);
    iframe.classList.add("active");
    iframe.style.border = "none";


    document.body.appendChild(iframe);

    iframe.onload = function() {
        chrome.runtime.sendMessage({type: 'onAttach'});
    }

    window.addEventListener("message", function(event){
        
        var origin = event.origin || event.originalEvent.origin;
        if(baseUrl !== '' && baseUrl.substring(0, origin.length) !== origin){
            // alert('Wrong origin: ' + baseUrl.substr(0, origin.length) + ' !== ' + origin);
            return;
        }
        
        if(event.data[0] === 'msg'){
            chrome.runtime.sendMessage({type: 'msg', data: event.data[1]});
        }
    }, false);
});


