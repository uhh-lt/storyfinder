// Registriere toggle() als Funktion die ausgelöst wird, wenn auf das
// Storyfinder-Icon in der Browserbar geklickt wird.
chrome.runtime.onMessage.addListener(function(msg, sender){
    switch (msg.type) {
        case "toggle-sidebar":
            toggle();
            break;
        case "show-sidebar":
            iframe.style.width = "400px";
            break;
        case "hide-sidebar":
            iframe.style.width = "0px";
            break;
    }
});

// erstelle einen iFrame auf jeder Seite mit der Breite 0
var iframe = document.createElement('iframe');
iframe.style.background = "green";
iframe.style.height = "100%";
iframe.style.width = "0px";
iframe.style.position = "fixed";
iframe.style.top = "0px";
iframe.style.right = "0px";
iframe.style.zIndex = "9000000000000000000";
iframe.frameBorder = "none";
iframe.src = chrome.extension.getURL("sidebar/sidebar.html");

document.body.appendChild(iframe);

// zeige den iFrame indem die Breite auf 400px gesetzt wird
function toggle(){
    if(iframe.style.width === "0px"){
        iframe.style.width = "400px";
    }
    else{
        iframe.style.width = "0px";
    }
}
