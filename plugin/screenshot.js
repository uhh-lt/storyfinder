function setScreenshotUrl(url) {
    document.getElementById('target').src = url;
}

function setDownloadUrl(url, id) {
    document.getElementById('link').download = 'screenshot'+id;
    document.getElementById('link').href = url;
}

