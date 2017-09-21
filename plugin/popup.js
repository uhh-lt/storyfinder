var baseUrl = "";

chrome.runtime.onMessage.addListener(function(msg, sender){
    switch (msg.type) {
        case "msg":
            document.querySelector('iframe.active').contentWindow.postMessage(msg.data, '*');
            break;
    }
});

chrome.storage.sync.get({
    server: ""
}, function(items) {
    if(items.server === "")
        alert("Server undefined!");

    baseUrl = items.server;

    var iframe = document.createElement('iframe');
    iframe.setAttribute('src', baseUrl);
    iframe.classList.add("active");
    iframe.frameBorder = "none";

    document.body.appendChild(iframe);

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