var baseUrl = '';
var iframe = null;

chrome.runtime.onMessage.addListener(function(msg, sender){
    switch (msg.type) {
        case "toggle-sidebar":
            toggleSidebar();
            break;
        case "show-sidebar":
            showSidebar();
            break;
        case "hide-sidebar":
            hideSidebar();
            break;
        case "load":
            baseUrl = msg.data.url;
            activateTab(msg.data.id);
            chrome.runtime.sendMessage({type: 'onAttach'});
            break;
        case "msg":
            document.querySelector('iframe.active').contentWindow.postMessage(msg.data, '*');
            break;
        case "activateTab":
            activateTab(msg.data.id);
            break;
    }
});

function initialize(){
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

    chrome.runtime.sendMessage({type: 'ready', data: {}});
}

/*
erstellt eine neue Sidebar und toggelt sie aktiv
 */
function activateTab(tabId){

    createNewSidebar(tabId);
    toggleSidebar();
}

/*
Erstellt eine neue Sidebar, falls in diesem Tab noch keine existiert
 */
function createNewSidebar(tabId) {
    if(document.getElementById('tab-' + tabId) === null){
        iframe = document.createElement('iframe');

        iframe.id = 'tab-' + tabId;
        iframe.setAttribute('src', baseUrl);
        iframe.frameBorder = "none";

        document.body.appendChild(iframe);
        console.log('Creating tab with id ' + tabId);
    }
}

/*
schaltet Sidebar ein, wenn eine Sidebar für diesen Tab existiert
 */
function showSidebar() {
    if(iframe !== null){
        if(!iframe.classList.contains('active')) {
            iframe.classList.add('active');
            iframe.contentWindow.postMessage({
                action: 'activate'
            }, '*');
        }
    }
}

/*
schaltet Sidebar aus, wenn eine Sidebar für diesen Tab existiert
 */
function hideSidebar() {
    if(iframe !== null){
        if(iframe.classList.contains('active')) {
            iframe.classList.remove('active');
            iframe.contentWindow.postMessage({
                action: 'deactivate'
            }, '*');
        }
    }
}

/*
schaltet Sidebar ein oder aus, wenn eine Sidebar für diesen Tab existiert
 */
function toggleSidebar() {
    if(iframe !== null){
        if(iframe.classList.contains('active')) {
            iframe.classList.remove('active');
            iframe.contentWindow.postMessage({
                action: 'deactivate'
            }, '*');
        } else {
            iframe.classList.add('active');
            iframe.contentWindow.postMessage({
                action: 'activate'
            }, '*');
        }
    }
}

initialize();