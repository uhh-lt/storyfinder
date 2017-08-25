function onError(error) {
    console.log(`Error: ${error}`);
}

function onGot(item) {
    var color = "blue";
    if (item.color) {
        color = item.color;
    }
    document.body.style.border = "5px solid " + color;
}

var getting = browser.storage.local.get("color");
getting.then(onGot, onError);
