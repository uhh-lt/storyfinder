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
    if(!items.serverInitialized || (items.serverInitialized && items.server === "")) {
        var message = document.getElementById("message");
        message.innerHTML = "The Storyfinder Server has not been set! Please go to Extensions > Storyfinder > Options and set the Server URL.";
        return;
    }

    baseUrl = items.server;
    var iframe = document.createElement('iframe');
    iframe.setAttribute('src', baseUrl);
    iframe.classList.add("active");
    iframe.frameBorder = "none";


    document.body.appendChild(iframe);

    iframe.onload = function() {
        chrome.runtime.sendMessage({type: 'onAttach'});
    }

    window.addEventListener("message", function(event){
        var origin = event.origin || event.originalEvent.origin;
        if(baseUrl !== '' && baseUrl.substr(0, origin.length) !== origin){
            // alert('Wrong origin: ' + baseUrl.substr(0, origin.length) + ' !== ' + origin);
            return;
        }

        if(event.data[0] === 'msg'){
            chrome.runtime.sendMessage({type: 'msg', data: event.data[1]});
        }
    }, false);
});


