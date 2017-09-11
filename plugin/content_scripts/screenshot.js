chrome.runtime.onMessage.addListener(function(msg, sender){
    if(msg.type === "take-screenshot") {
        makeScreenshot(msg.data);
    }
});

function makeScreenshot(rectangle) {
    var startX = rectangle.startX || 0;
    var startY = rectangle.startY || 0;
    var width = rectangle.width || window.innerWidth;
    var height = rectangle.height || window.innerHeight;
    // Create canvas to draw window unto
    var canvas = window.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    canvas.width = width;
    canvas.height = height;
    // Create context for drawing, draw the old window unto the canvas
    var context = canvas.getContext("2d");
    context.drawWindow(window, startX, startY, width, height, "rgb(255,255,255)");
    // Save context as png
    var image = canvas.toDataURL('image/png');

    chrome.runtime.sendMessage({type: 'got-screenshot', data: image});
}