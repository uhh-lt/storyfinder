var baseUrl = '';
var iframe;

chrome.runtime.onMessage.addListener(function(msg, sender){
    switch (msg.type) {
        case "toggle-sidebar":
            toggle();
            break;
        case "show-sidebar":
            iframe.style.display = "block";
            //iframe.style.width = "400px";
            break;
        case "hide-sidebar":
            iframe.style.display = "none";
            //iframe.style.width = "0px";
            break;
        case "load":
            baseUrl = msg.data.url;
            activateTab(msg.data.id);
            break;
        case "msg":
            document.querySelector('iframe.active').contentWindow.postMessage(msg.data, '*');
            break;
        case "activateTab":
            activateTab(msg.data.id);
            break;
    }
});

// zeige den iFrame indem die Breite auf 400px gesetzt wird
function toggle(){
    if(iframe.style.display === "none"){
        iframe.style.display = "block";
        //iframe.style.width = "400px";
    }
    else{
        iframe.style.display = "none";
        //iframe.style.width = "0px";
    }
}

function initialize(){
    window.addEventListener("message", function(event){
        var origin = event.origin || event.originalEvent.origin;
        if(baseUrl.substr(0, origin.length) !== origin){
            alert('Wrong origin: ' + baseUrl.substr(0, origin.length) + ' !== ' + origin);
            return;
        }

        //if(typeof event.data !== 'object' || typeof event.data[0] === 'undefined' || typeof event.data[1] === 'undefined')return;

        if(event.data[0] === 'msg'){
            chrome.runtime.sendMessage({type: 'msg', data: event.data[1]});
        }
    }, false);

    chrome.runtime.sendMessage({type: 'ready', data: {}});
}

function activateTab(tabId){
    createNewSidebar();

    var current = document.querySelector('iframe.active');
    if(current !== null){
        current.classList.remove('active');
        current.contentWindow.postMessage({
            action: 'deactivate'
        }, '*');
    }

    var next = document.getElementById('tab-' + tabId);
    if(next !== null){
        next.classList.add('active');
        next.contentWindow.postMessage({
            action: 'activate'
        }, '*');
    }else console.log('Missing tab with id ' + tabId);
}

function createNewSidebar() {
    var tabId;
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        tabId = tabs[0].id;
    });

    if(document.getElementById('tab-' + tabId) === null){
        iframe = document.createElement('iframe');

        iframe.id = 'tab-' + tabId;
        iframe.setAttribute('src', baseUrl);
        iframe.frameBorder = "none";

        document.body.appendChild(iframe);
        console.log('Creating tab with id ' + tabId);
    }
}

initialize();