chrome.storage.sync.get({
    word: 'the'
}, function(items) {

    var htmlstring = document.body.innerHTML;

    var re = new RegExp(items.word,"g");
    htmlstring = htmlstring.replace(re,"<span class='storyfinder-highlight'>"+items.word+"</span>");

    document.body.innerHTML = htmlstring;
});