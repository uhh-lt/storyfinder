import Immutable from 'immutable';
import * as types from '../constants/ActionTypes';

const initialState = Immutable.Map({
	'user-id': 1,
	'server-url': 'http://127.0.0.1:3055'
});

export default function config(state = initialState, action) {  
	switch (action.type) {
		
	}
	return state;
}