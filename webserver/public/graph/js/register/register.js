var Delegate = require('dom-delegate')
	;
	
require('es6-promise').polyfill();
require('isomorphic-fetch');


function disableForm(){
	var formElements = document.querySelectorAll('form input, form button');
	
	for(var element of formElements)
		element.setAttribute('disabled', 'disabled');
}

function showLoading(){
	document.querySelector('.avatar').classList.add('loading');
}

function hideLoading(){
	document.querySelector('.avatar').classList.remove('loading');
}

function enableForm(){
	var formElements = document.querySelectorAll('form input, form button');
	
	for(var element of formElements)
		element.removeAttribute('disabled');
}

function setError(element, msg){
	var el = document.querySelector(element);
	el.classList.add('has-error');
	
	if(typeof msg != 'undefined' && msg != null && msg.length > 0){
		el.querySelector('.help-block').innerHTML = msg;
	}
}

function resetValidation(){
	var formGroups = document.querySelectorAll('#frm-register .form-group');

	for(var element of formGroups){
		element.classList.remove('has-error');
		element.querySelector('.help-block').innerHTML = '';
	}
}

function register(){
	resetValidation();
	disableForm();
	showLoading();
	
	var formElements = document.querySelectorAll('#frm-register input, #frm-register button');
	
	var data = {};
	
	for(var element of formElements)
		data[element.getAttribute('name')] = element.value;

	if(data['password'] != data['password-verify']){
		setError('.form-group-verify', 'Passwords don\'t match!');
		setError('.form-group-password');
		enableForm();
		hideLoading();
		return;
	}

	if(!data['username'].match(/^[-a-z0-9~!$%^&*_=+}{\'?]+(\.[-a-z0-9~!$%^&*_=+}{\'?]+)*@([a-z0-9_][-a-z0-9_]*(\.[-a-z0-9_]+)*\.(aero|arpa|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|pro|travel|mobi|[a-z][a-z])|([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}))(:[0-9]{1,5})?$/i)){
		setError('.form-group-username', 'Please enter a valid Email address!');
		enableForm();
		hideLoading();
		return;
	}

	if(data['password'].length < 8){
		setError('.form-group-password', 'Password is too short! Please select a password with at least 8 characters.');
		setError('.form-group-verify');
		enableForm();
		hideLoading();
		return;
	}
	
	fetch('/Users', {  
		method: 'PUT',  
		headers: {  
			"Content-Type": "application/json"  
		}, 
		body: JSON.stringify(data)
	})
	.then(function(response) {		
		if (response.status >= 400) {
			console.log(response.status);
			setError('.form-group-username', 'Error connection to the storyfinder server! Please try again later.');
			enableForm();
			hideLoading();
			return null;
		}
		
		return response.json();
	})
	.then(function(json) {
		if(!json)return;
		
		if(!json.success){
			setError('.form-group-username', json.message);
			enableForm();
			hideLoading();
			return null;
		}
		
		if(typeof parent != null)
			parent.postMessage(["msg", {
				action: 'userRegistered',
				username: data['username'],
				password: data['password']
			}], "*");
		
		document.location = '/';
	});
}

function login(){
	resetValidation();
	disableForm();
	showLoading();
	
	var formElements = document.querySelectorAll('form input');
	
	var data = {};
	var formData = [];
	
	for(var element of formElements){
		formData.push(element.getAttribute('name') + '=' + encodeURIComponent(element.value));
		data[element.getAttribute('name')] = element.value;
	}
		
	fetch('/login', {
		method: 'POST',
		credentials: 'same-origin',
		headers: {  
			"Content-type": "application/x-www-form-urlencoded; charset=UTF-8"  
	    }, 
		body: formData.join('&')
	})
	.then(function(response) {		
		if (response.status >= 400) {
			console.log(response.status);
			setError('.form-group-username', 'Login failed!');
			enableForm();
			hideLoading();
			return null;
		}
		
		return response.json();
	})
	.then(function(json) {
		if(!json)return;
		
		if(!json.success){
			setError('.form-group-username', json.message);
			enableForm();
			hideLoading();
			return null;
		}
		
		if(typeof parent != null)
			parent.postMessage(["msg", {
				action: 'userRegistered',
				username: data['username'],
				password: data['password']
			}], "*");
			
		document.location = '/';
	});
}

var frmRegister = document.querySelector('#frm-register');
if(frmRegister)
	frmRegister.addEventListener('submit', function(e){
		e.preventDefault();
		e.stopPropagation();
		
		register();
	});
	
var frmLogin = document.querySelector('#frm-login');
if(frmLogin)
	frmLogin.addEventListener('submit', function(e){
		e.preventDefault();
		e.stopPropagation();
		
		login();
	});