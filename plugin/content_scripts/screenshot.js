chrome.runtime.onMessage.addListener(function(msg, sender){
    if(msg.type === "take-screenshot") {
        makeScreenshot(msg.data);
    }
});

function makeScreenshot(imageurl) {
    var canvas = document.createElement("canvas");
    var context = canvas.getContext('2d');

    var canvas_image = new Image();
    canvas_image.src = imageurl;

    context.drawImage(canvas_image, 0, 0);

    //var jpegUrl = canvas.toDataURL("image/jpeg");
    var pngUrl = canvas.toDataURL("image/png"); // PNG is the default
    console.log("ScreenshotURL:"+imageurl);
    console.log("pngUrl:"+pngUrl);
    //chrome.runtime.sendMessage({type: 'got-screenshot', data: pngUrl});
}

function makeScreenshot2(rectangle) {
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

    console.log("Image:"+ image);
    //chrome.runtime.sendMessage({type: 'got-screenshot', data: image});
}