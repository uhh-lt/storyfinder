function saveOptions(e) {
    e.preventDefault();
    browser.storage.local.set({
        color: document.querySelector("#color").value,
        word: document.querySelector("#word").value
    });
}

function restoreOptions() {

    function setCurrentChoice(result) {
        document.querySelector("#color").value = result.color || "blue";
    }

    function setCurrentWord(result) {
        document.querySelector("#word").value = result.word || "";
    }

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    var getting = browser.storage.local.get("color");
    getting.then(setCurrentChoice, onError);
    var getting2 = browser.storage.local.get("word");
    getting2.then(setCurrentWord, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);