var App = require('./app.js')
	;

import configureStore from './store/configureStore';

const store = configureStore();

var app = new App(store);