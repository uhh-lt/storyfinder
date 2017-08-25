function onError(error) {
    console.log(`Error: ${error}`);
}

function onWord(item) {
    var word = "";
    if (item.word) {
        word = item.word;


        highlight(word);
    }
}

function highlight(word) {
    var htmlstring = document.body.innerHTML;

    var re = new RegExp(word,"g");
    htmlstring = htmlstring.replace(re,"<span class='storyfinder-highlight'>"+word+"</span>");

    var test = "tim ist the best";
    test = test.replace(re, "THE");
    console.log(test);

    document.body.innerHTML = htmlstring;
}

var getting = browser.storage.local.get("word");
getting.then(onWord, onError);